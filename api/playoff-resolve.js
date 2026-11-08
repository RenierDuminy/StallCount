import { createClient } from "@supabase/supabase-js";
import {
  PLAYOFF_PENDING_JOB_KEY,
  PLAYOFF_RESOLVE_JOB_KEY,
  buildScheduleIndex,
  clearResolveRequest,
  listAutoResolveEvents,
  loadBrackets,
  loadEventHierarchy,
  loadEventMatches,
  loadSchedules,
  resolveEventPlayoffs,
  summarizeSwissDraws,
} from "./_lib/playoffResolve.js";

// Mirrors api/stb-rl-26-roster-sync.js. That route is the working precedent for
// a cron-driven automation here: same client construction, same bearer-secret
// cron path, same role gate for operator-triggered runs.
const supabaseUrl =
  globalThis.process?.env?.SUPABASE_URL || globalThis.process?.env?.VITE_SUPABASE_URL;
const serviceRoleKey = globalThis.process?.env?.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = globalThis.process?.env?.CRON_SECRET || "";
const ALLOWED_ROLE_SLUGS = new Set(["admin", "tournament_director"]);
const LOCK_TIMEOUT_SECONDS = 900;
// A pending run handles a handful of events; a crashed one should not hold the
// minute-by-minute path up for the sweep's full 15 minutes.
const PENDING_LOCK_TIMEOUT_SECONDS = 300;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createAdminSupabaseClient() {
  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL.");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizeRoleSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getBearerToken(request) {
  const authHeader = request.headers.authorization || request.headers.Authorization || "";
  if (!String(authHeader).startsWith("Bearer ")) {
    return "";
  }
  return String(authHeader).slice("Bearer ".length).trim();
}

function isCronRequest(request) {
  return Boolean(CRON_SECRET) && getBearerToken(request) === CRON_SECRET;
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  let rawBody = "";
  for await (const chunk of request) {
    rawBody += chunk;
  }

  if (!rawBody.trim()) {
    return {};
  }

  return JSON.parse(rawBody);
}

async function fetchUserRoles(supabase, userId) {
  const [globalResult, eventResult] = await Promise.all([
    supabase.from("user_roles").select("role:roles(name)").eq("user_id", userId),
    supabase.from("event_user_roles").select("event_id, role:roles(name)").eq("user_id", userId),
  ]);

  if (globalResult.error) {
    throw new Error(globalResult.error.message || "Unable to load global user roles.");
  }
  if (eventResult.error) {
    throw new Error(eventResult.error.message || "Unable to load event user roles.");
  }

  const roleSlugs = new Set();
  [...(globalResult.data || []), ...(eventResult.data || [])].forEach((row) => {
    const slug = normalizeRoleSlug(row?.role?.name);
    if (slug) roleSlugs.add(slug);
  });

  return roleSlugs;
}

async function requireAuthorizedUser(supabase, request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    throw Object.assign(new Error("Missing bearer token."), { statusCode: 401 });
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    throw Object.assign(new Error(error?.message || "Invalid bearer token."), { statusCode: 401 });
  }

  const roleSlugs = await fetchUserRoles(supabase, user.id);
  const isAllowed = Array.from(roleSlugs).some((slug) => ALLOWED_ROLE_SLUGS.has(slug));
  if (!isAllowed) {
    throw Object.assign(new Error("You do not have permission to resolve playoffs."), {
      statusCode: 403,
    });
  }

  return user;
}

function sendJson(response, statusCode, payload) {
  response.status(statusCode);
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.send(JSON.stringify(payload));
}

function sanitizeMessage(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 2000);
}

async function acquireJobLock(
  supabase,
  { jobKey = PLAYOFF_RESOLVE_JOB_KEY, slotKey, lockToken, timeoutSeconds = LOCK_TIMEOUT_SECONDS },
) {
  const { data, error } = await supabase
    .rpc("acquire_automation_job_lock", {
      p_job_key: jobKey,
      p_lock_token: lockToken,
      p_slot_key: slotKey || null,
      p_lock_timeout_seconds: timeoutSeconds,
    })
    .single();

  if (error) {
    throw new Error(error.message || "Unable to acquire playoff resolve lock.");
  }

  return data || { acquired: false, already_processed: false, locked: false };
}

async function releaseJobLock(
  supabase,
  { jobKey = PLAYOFF_RESOLVE_JOB_KEY, lockToken, slotKey, ok, message, successfulRunAt = null },
) {
  const finishedAt = new Date().toISOString();
  const payload = {
    lock_token: null,
    lock_acquired_at: null,
    last_finished_at: finishedAt,
    last_attempted_slot_key: slotKey || null,
    last_attempted_at: finishedAt,
    last_ok: Boolean(ok),
    last_message: sanitizeMessage(message),
    updated_at: finishedAt,
  };

  if (ok) {
    payload.last_successful_slot_key = slotKey || null;
    payload.last_successful_run_at = successfulRunAt || finishedAt;
  }

  const { error } = await supabase
    .from("automation_job_state")
    .update(payload)
    .eq("job_key", jobKey)
    .eq("lock_token", lockToken);

  if (error) {
    throw new Error(error.message || "Unable to release playoff resolve lock.");
  }
}

/**
 * The scheduled sweep. Resolves every opted-in, open event.
 *
 * A failure on one event is recorded and the sweep continues — one broken
 * bracket must not stop every other tournament from advancing.
 */
async function runSweep(supabase, log) {
  const sweepStartedAt = new Date();
  const slotKey = `cron-${sweepStartedAt.toISOString().slice(0, 16)}`;
  const lockToken = globalThis.crypto.randomUUID();

  const lock = await acquireJobLock(supabase, { slotKey, lockToken });
  if (!lock.acquired) {
    log(`Lock not acquired (locked=${lock.locked}, alreadyProcessed=${lock.already_processed}).`);
    return { ok: true, skipped: true, reason: "lock not acquired", results: [] };
  }

  const results = [];
  let ok = true;

  try {
    const events = await listAutoResolveEvents(supabase);
    log(`Sweeping ${events.length} auto-resolve event(s).`);

    for (const event of events) {
      try {
        const result = await resolveEventPlayoffs(supabase, event.id);
        await clearResolveRequest(supabase, event.id, sweepStartedAt);
        log(
          `${event.name}: ${result.updatedCount} assigned across ${result.passes} pass(es), ${result.skipped.length} skipped.`,
        );
        results.push({ ...result, ok: true });
      } catch (error) {
        ok = false;
        const message = error instanceof Error ? error.message : String(error);
        log(`${event.name}: FAILED - ${message}`);
        results.push({ eventId: event.id, eventName: event.name, ok: false, error: message });
      }
    }

    const totalAssigned = results.reduce((sum, entry) => sum + (entry.updatedCount || 0), 0);
    const summary = `${results.length} event(s), ${totalAssigned} match(es) assigned.`;
    await releaseJobLock(supabase, { lockToken, slotKey, ok, message: summary });
    return { ok, results, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await releaseJobLock(supabase, { lockToken, slotKey, ok: false, message });
    throw error;
  }
}

/**
 * "Resolve what is pending": called by public.check_pending_playoffs() (pg_cron,
 * every minute) only when an event has a settled "needs update" note or a
 * release time has passed. The database decides WHEN and WHICH events; this
 * resolves exactly those.
 *
 * - Notes are cleared per event, only after that event resolved, and only if
 *   stamped before this run started, so a game finishing mid-run stays pending.
 * - On full success the job's last_successful_run_at is set to `dueUntil`, the
 *   time the database looked for due release times up to. That watermark is
 *   what stops a release time being picked up twice or missed.
 * - Its own lock key: it never blocks, or waits for, the 6-hourly sweep.
 */
async function runPending(supabase, log, body) {
  const startedAt = new Date();
  const requestedIds = Array.from(
    new Set((Array.isArray(body?.eventIds) ? body.eventIds : []).filter((id) => UUID_PATTERN.test(String(id)))),
  );
  const dueUntil = body?.dueUntil ? new Date(body.dueUntil) : null;
  const watermark = dueUntil && !Number.isNaN(dueUntil.getTime()) ? dueUntil.toISOString() : null;

  if (!requestedIds.length) {
    log("Pending run with no events; nothing to do.");
    return { ok: true, skipped: true, reason: "no events", results: [] };
  }

  const slotKey = `pending-${startedAt.toISOString().slice(0, 16)}`;
  const lockToken = globalThis.crypto.randomUUID();
  const lock = await acquireJobLock(supabase, {
    jobKey: PLAYOFF_PENDING_JOB_KEY,
    slotKey,
    lockToken,
    timeoutSeconds: PENDING_LOCK_TIMEOUT_SECONDS,
  });
  if (!lock.acquired) {
    log(`Pending lock not acquired (locked=${lock.locked}, alreadyProcessed=${lock.already_processed}).`);
    return { ok: true, skipped: true, reason: "lock not acquired", results: [] };
  }

  const results = [];
  let ok = true;
  try {
    const eligible = new Map((await listAutoResolveEvents(supabase)).map((event) => [event.id, event]));
    log(`Pending run for ${requestedIds.length} event(s).`);

    for (const eventId of requestedIds) {
      const event = eligible.get(eventId);
      if (!event) {
        // Opted out or closed since the note was written: nothing to resolve.
        await clearResolveRequest(supabase, eventId, startedAt);
        results.push({ eventId, ok: true, skipped: true, reason: "not auto-resolving" });
        continue;
      }
      try {
        const result = await resolveEventPlayoffs(supabase, eventId);
        await clearResolveRequest(supabase, eventId, startedAt);
        log(`${event.name}: ${result.updatedCount} assigned across ${result.passes} pass(es).`);
        results.push({ ...result, ok: true });
      } catch (error) {
        ok = false;
        const message = error instanceof Error ? error.message : String(error);
        log(`${event.name}: FAILED - ${message}`);
        results.push({ eventId, eventName: event.name, ok: false, error: message });
      }
    }

    const totalAssigned = results.reduce((sum, entry) => sum + (entry.updatedCount || 0), 0);
    const summary = `pending: ${results.length} event(s), ${totalAssigned} match(es) assigned.`;
    await releaseJobLock(supabase, {
      jobKey: PLAYOFF_PENDING_JOB_KEY,
      lockToken,
      slotKey,
      ok,
      message: summary,
      successfulRunAt: watermark,
    });
    return { ok, results, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await releaseJobLock(supabase, { jobKey: PLAYOFF_PENDING_JOB_KEY, lockToken, slotKey, ok: false, message });
    throw error;
  }
}

/**
 * Status for the admin panel: last sweep outcome plus this event's pending and
 * blocked nodes. Read from automation_job_state because net.http_post is
 * fire-and-forget, so the DB's cron history cannot tell us what a sweep did.
 */
async function getStatus(supabase, eventId) {
  // The most recent automatic run, whichever path made it: the 6-hourly
  // sweep or the "after results" pending run.
  const { data: jobRows } = await supabase
    .from("automation_job_state")
    .select(
      "job_key, last_started_at, last_finished_at, last_attempted_at, last_ok, last_message, last_successful_run_at",
    )
    .in("job_key", [PLAYOFF_RESOLVE_JOB_KEY, PLAYOFF_PENDING_JOB_KEY]);
  const jobState =
    (jobRows || [])
      .filter((row) => row?.last_attempted_at)
      .sort((left, right) => String(right.last_attempted_at).localeCompare(String(left.last_attempted_at)))
      .map((row) => ({ ...row, kind: row.job_key === PLAYOFF_PENDING_JOB_KEY ? "pending" : "sweep" }))[0] ||
    null;

  if (!eventId) {
    return { job: jobState || null, event: null };
  }

  const { data: eventRow } = await supabase
    .from("events")
    .select("id, name, auto_resolve_playoffs")
    .eq("id", eventId)
    .maybeSingle();

  const matches = await loadEventMatches(supabase, eventId);
  const brackets = await loadBrackets(supabase, eventId, matches);
  const schedules = await loadSchedules(supabase, eventId);
  const scheduleIndex = buildScheduleIndex(schedules);

  const nodes = brackets.flatMap((bracket) =>
    (bracket.nodes || []).map((node) => {
      const scheduled = scheduleIndex.get(node.id) || null;
      return {
        nodeId: node.id,
        bracketName: bracket.name,
        isLocked: Boolean(bracket.is_locked),
        resolveAt: scheduled ? scheduled.at.toISOString() : null,
        scheduleLabel: scheduled?.label || "",
        lastError: node.last_resolve_error || null,
        lastAttemptAt: node.last_resolve_attempt_at || null,
        hasMatch: Boolean(node.match_id),
      };
    }),
  );

  // Swiss standings are extra information; a failure here must not take the
  // rest of the status panel down with it.
  let swiss = [];
  let swissError = "";
  try {
    if (brackets.some((bracket) => String(bracket.type || "").toLowerCase() === "swiss")) {
      const eventData = await loadEventHierarchy(supabase, eventId);
      swiss = summarizeSwissDraws(eventData, matches, brackets);
    }
  } catch (error) {
    swissError = error instanceof Error ? error.message : String(error);
  }

  const nextDue = schedules
    .filter((schedule) => schedule.enabled !== false)
    .map((schedule) => schedule.resolve_at)
    .filter((at) => at && new Date(at).getTime() > Date.now())
    .sort()[0] || null;

  return {
    job: jobState || null,
    event: {
      id: eventId,
      name: eventRow?.name || "",
      autoResolve: Boolean(eventRow?.auto_resolve_playoffs),
      nodes,
      swiss,
      swissError,
      scheduleCount: schedules.length,
      nextDueAt: nextDue,
      blockedCount: nodes.filter((node) => node.lastError).length,
      pendingCount: nodes.filter(
        (node) => node.resolveAt && new Date(node.resolveAt).getTime() > Date.now(),
      ).length,
    },
  };
}

export default async function handler(request, response) {
  const startedAt = new Date().toISOString();
  const logs = [];
  const log = (message) => {
    logs.push(`[${new Date().toISOString()}] ${message}`);
  };

  try {
    const supabase = createAdminSupabaseClient();

    // Scheduled sweep. Driven by pg_cron via public.invoke_playoff_resolver(),
    // not by a Vercel cron: the Hobby plan only permits daily schedules.
    if (request.method === "POST" && isCronRequest(request)) {
      const body = await readJsonBody(request).catch(() => ({}));
      // { mode: "pending", eventIds, dueUntil } comes from the every-minute
      // check_pending_playoffs(); anything else is the 6-hourly backup sweep.
      if (body?.mode === "pending") {
        log("Recognized pending request.");
        const output = await runPending(supabase, log, body);
        return sendJson(response, output.ok ? 200 : 500, { ...output, startedAt, logs });
      }
      log("Recognized scheduled request. Starting playoff sweep.");
      const output = await runSweep(supabase, log);
      return sendJson(response, output.ok ? 200 : 500, { ...output, startedAt, logs });
    }

    if (request.method === "GET") {
      await requireAuthorizedUser(supabase, request);
      const eventId = request.query?.eventId || "";
      const status = await getStatus(supabase, eventId);
      return sendJson(response, 200, { ok: true, startedAt, logs, status });
    }

    if (request.method === "POST") {
      await requireAuthorizedUser(supabase, request);
      const body = await readJsonBody(request);
      const eventId = String(body?.eventId || "").trim();
      if (!eventId) {
        return sendJson(response, 400, {
          ok: false,
          startedAt,
          logs,
          error: { message: "eventId is required.", stack: "" },
        });
      }

      // A manual run is an explicit operator decision, so it ignores the
      // per-round schedule. It still respects is_locked — locking a bracket
      // should mean locked, whoever asks.
      log(`Manual resolve requested for event ${eventId}.`);
      const manualStartedAt = new Date();
      const result = await resolveEventPlayoffs(supabase, eventId, { ignoreSchedule: true });
      await clearResolveRequest(supabase, eventId, manualStartedAt);
      log(`Assigned ${result.updatedCount} match(es) across ${result.passes} pass(es).`);
      return sendJson(response, 200, { ok: true, startedAt, logs, result });
    }

    return sendJson(response, 405, {
      ok: false,
      startedAt,
      logs,
      error: { message: "Method not allowed.", stack: "" },
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    const message = error instanceof Error ? error.message : String(error);
    log(`Request failed with status ${statusCode}: ${message}`);
    return sendJson(response, statusCode, {
      ok: false,
      startedAt,
      logs,
      error: { message, stack: error instanceof Error ? error.stack || "" : "" },
    });
  }
}
