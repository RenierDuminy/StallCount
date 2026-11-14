import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// The wording of every notification (shared with scripts/sendLiveEventNotifications.js).
import {
  SILENT_EVENT_CODES,
  buildNotificationText,
  buildPlayerNotificationText,
} from "../_shared/notificationText.js";

// Delivers queued `live_events` rows as Web Push notifications.
//
// Invoked by the database (a pg_net trigger on `live_events` insert and a
// pg_cron sweeper every minute; see supabase/migrations/*notification_dispatch*).
// Safe to call concurrently: each run claims an event (a conditional update on
// `attempts`) before sending, so two overlapping runs never both send it.
// Devices already reached are remembered in `delivered_endpoints` (hashes), so
// a retry, or a run that continues after the time budget, sends only to the
// devices still missing. Failures are recorded on the row (`attempts`,
// `last_error`) and retry with backoff instead of vanishing.

type PushSubscriptionRow = {
  profile_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
};

type LiveEventRow = {
  id: string;
  match_id: string;
  event_type: string;
  data?: Record<string, unknown> | null;
  team_id?: string | null;
  player_id?: string | null;
  secondary_player_id?: string | null;
  created_at: string;
  attempts?: number | null;
  last_attempt_at?: string | null;
  delivered_endpoints?: string[] | null;
};

const REQUIRED_ENV = ["SUPABASE_URL", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"] as const;

function resolveDefaultSupabaseSecretKey(rawSecretKeys?: string | null) {
  if (!rawSecretKeys) return undefined;
  try {
    const parsed = JSON.parse(rawSecretKeys) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return undefined;
    const defaultKey = parsed.default;
    if (typeof defaultKey === "string" && defaultKey) return defaultKey;
    const firstKey = Object.values(parsed).find((value) => typeof value === "string" && value);
    return typeof firstKey === "string" ? firstKey : undefined;
  } catch {
    return undefined;
  }
}

const config = {
  supabaseUrl: Deno.env.get("SUPABASE_URL"),
  serviceRoleKey:
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    resolveDefaultSupabaseSecretKey(Deno.env.get("SUPABASE_SECRET_KEYS")),
  vapidPublicKey: Deno.env.get("VAPID_PUBLIC_KEY"),
  vapidPrivateKey: Deno.env.get("VAPID_PRIVATE_KEY"),
  vapidSubject: Deno.env.get("VAPID_SUBJECT") ?? "mailto:ops@stallcount.app",
  // Shared secret so only the database (cron / trigger) can trigger a dispatch.
  // Anyone holding the public anon key can otherwise hit this endpoint.
  dispatchSecret: Deno.env.get("NOTIFICATION_DISPATCH_SECRET") ?? "",
  batchSize: Number(Deno.env.get("NOTIFICATION_BATCH_SIZE") ?? 50),
  maxAttempts: Number(Deno.env.get("NOTIFICATION_MAX_ATTEMPTS") ?? 5),
  // A score alert an hour late is noise; drop events older than this.
  staleAfterMinutes: Number(Deno.env.get("NOTIFICATION_STALE_AFTER_MINUTES") ?? 60),
  // Push services discard undelivered messages after this many seconds.
  pushTtlSeconds: Number(Deno.env.get("NOTIFICATION_PUSH_TTL_SECONDS") ?? 600),
  // Push sends in flight at once. A push service answers in ~100-300 ms, so
  // one at a time took minutes for a few thousand devices.
  sendConcurrency: Math.max(1, Number(Deno.env.get("NOTIFICATION_SEND_CONCURRENCY") ?? 20)),
  // A run stops starting new sends after this long, well inside the Edge
  // Function wall-clock limit (150 s on the free plan). What is left is saved
  // and finished by the next run (the cron job runs every minute).
  timeBudgetMs: Number(Deno.env.get("NOTIFICATION_TIME_BUDGET_MS") ?? 100_000),
};

for (const key of REQUIRED_ENV) {
  if (!Deno.env.get(key)) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}
if (!config.serviceRoleKey) {
  throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEYS");
}

const supabase = createClient(config.supabaseUrl!, config.serviceRoleKey!);
webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey!, config.vapidPrivateKey!);

// PostgREST returns at most 1000 rows per request (Supabase's max_rows) and
// says nothing when it cuts a result short, and a long `in.(...)` list makes
// the request URL too long (~200 uuids). Every id-list lookup below is
// therefore split into chunks and read page by page.
const ID_CHUNK_SIZE = 100;
const PAGE_SIZE = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// `build` must return a fresh query with a stable `.order()`, or pages can
// overlap or skip rows.
// deno-lint-ignore no-explicit-any
async function selectAllPages<T>(build: () => any): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

// `delivered_endpoints` arrives with migration
// 20261114120000_live_events_delivery_progress.sql (applied by hand). Until it
// exists the dispatcher works as before: no per-device memory, so a partly
// delivered event is not retried (that would resend to everyone) and a run
// never pauses mid-event.
let deliveryProgressAvailable = true;

function isMissingDeliveryColumn(error: unknown) {
  const err = error as { code?: string; message?: string } | null;
  if (!err) return false;
  return (
    err.code === "42703" ||
    err.code === "PGRST204" ||
    /delivered_endpoints/.test(err.message ?? "")
  );
}

// The endpoint URL is a capability (whoever has it can push to that device),
// so the row stores a short hash of it rather than the URL itself.
async function endpointKey(endpoint: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

// VERBATIM COPY of src/constants/notificationTopics.js. Deno cannot import from
// the Vite bundle, so this and scripts/sendLiveEventNotifications.js each carry
// their own copy. Change one, change all three.
//
// A topic is what the user subscribes to; the values are the
// `live_events.event_type` codes it delivers. These vocabularies are not the
// same: the UI once offered `match_final`, which the database never emits (it
// emits `match_end`), so every match-end alert was silently dropped.
const TOPIC_EVENT_CODES: Record<string, string[]> = {
  match_start: ["match_start"],
  match_end: ["match_end"],
  score: ["score", "callahan"],
  turnover: ["turnover"],
  block: ["block"],
  halftime: ["halftime_start", "halftime_end"],
  timeout: ["timeout_start", "timeout_end"],
  stoppage: ["stoppage_start", "stoppage_end"],
};

// Topics written by older builds. Read when matching, never written. Stored
// rows are deliberately not migrated, so removing an entry breaks every
// subscription still holding that string.
const LEGACY_TOPIC_ALIASES: Record<string, string> = {
  match_final: "match_end",
  goal: "score",
  halftime_start: "halftime",
  timeout_start: "timeout",
  stoppage_start: "stoppage",
};

function canonicalTopic(topic: string) {
  if (!topic) return "";
  if (TOPIC_EVENT_CODES[topic]) return topic;
  return LEGACY_TOPIC_ALIASES[topic] ?? topic;
}

function topicMatchesEventCode(topic: string, eventCode: string) {
  if (!eventCode) return false;
  const canonical = canonicalTopic(topic);
  if (!canonical) return false;
  const codes = TOPIC_EVENT_CODES[canonical];
  if (Array.isArray(codes)) return codes.includes(eventCode);
  return canonical === eventCode;
}

type TargetMap = Map<string, Set<string>>;

type MatchScope = {
  event_id: string | null;
  division_id: string | null;
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
  team_a_name?: string | null;
  team_b_name?: string | null;
};

// A live_events row names only the acting team (the scorer's, the thrower's,
// the team calling the timeout) and carries no event or division id. Without
// the match, a team follow misses the opponent's points and every match-wide
// event, and event/division follows match nothing. Fetched per dispatch, not
// cached across invocations: playoff resolution rewrites team_a/team_b.
async function fetchMatchScopes(matchIds: string[]): Promise<Map<string, MatchScope>> {
  const scopes = new Map<string, MatchScope>();
  const ids = Array.from(new Set(matchIds.filter(Boolean)));
  if (!ids.length) return scopes;
  const { data, error } = await supabase
    .from("matches")
    .select("id, event_id, division_id, team_a, team_b, score_a, score_b")
    .in("id", ids);
  if (error) throw error;
  const rows = (data ?? []) as Array<MatchScope & { id: string }>;
  // Team names for the wording ("Match start | X vs Y", "Final: X 13 – 9 Y").
  const teamIds = Array.from(new Set(rows.flatMap((row) => [row.team_a, row.team_b]).filter(Boolean)));
  const names = new Map<string, string>();
  if (teamIds.length) {
    const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds);
    for (const team of (teams ?? []) as Array<{ id: string; name: string }>) names.set(team.id, team.name);
  }
  for (const row of rows) {
    scopes.set(row.id, {
      ...row,
      team_a_name: row.team_a ? names.get(row.team_a) ?? null : null,
      team_b_name: row.team_b ? names.get(row.team_b) ?? null : null,
    });
  }
  return scopes;
}

function buildTargetMap(event: LiveEventRow, scope?: MatchScope): TargetMap {
  const map: TargetMap = new Map();
  const add = (type: string, id?: unknown) => {
    if (!id) return;
    const value = String(id);
    const key = type.toLowerCase();
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(value);
  };

  add("match", event.match_id);
  add("team", event.team_id);
  add("player", event.player_id);
  add("player", event.secondary_player_id);
  const data = (event.data ?? {}) as Record<string, unknown>;
  add("team", data.team_id ?? data.teamId ?? data.team);
  add("player", data.player_id ?? data.playerId ?? data.player);
  add("player", data.secondary_player_id ?? data.secondaryPlayerId ?? data.secondaryPlayer);
  add("event", data.event_id ?? data.eventId);
  add("division", data.division_id ?? data.divisionId);
  if (scope) {
    add("event", scope.event_id);
    add("division", scope.division_id);
    add("team", scope.team_a);
    add("team", scope.team_b);
  }

  if (Array.isArray(data.targets)) {
    for (const target of data.targets) {
      if (target && typeof target === "object") {
        const obj = target as { type?: string; id?: string };
        add(obj.type ?? "", obj.id);
      }
    }
  }

  return map;
}

function normalizeTopic(topic?: unknown) {
  return typeof topic === "string" ? topic.trim().toLowerCase() : "";
}

type MatchedSubscription = {
  profile_id: string;
  topics: string[] | null;
  target_type: string;
  target_id: string;
};

async function fetchMatchingSubscriptions(targets: TargetMap, eventType: string) {
  const matches: MatchedSubscription[] = [];

  for (const [type, ids] of targets.entries()) {
    if (!ids.size) continue;
    for (const idChunk of chunk(Array.from(ids), ID_CHUNK_SIZE)) {
      const rows = await selectAllPages<MatchedSubscription>(() =>
        supabase
          .from("subscriptions")
          .select("profile_id, topics, target_type, target_id")
          .eq("target_type", type)
          .in("target_id", idChunk)
          .order("id", { ascending: true })
      );
      matches.push(...rows);
    }
  }

  const normalizedEvent = (eventType ?? "").toLowerCase();
  return matches.filter((sub) => {
    // An empty topic list means "everything".
    if (!Array.isArray(sub.topics) || sub.topics.length === 0) return true;
    return sub.topics
      .map(normalizeTopic)
      .some((topic) => topic && topicMatchesEventCode(topic, normalizedEvent));
  });
}

async function fetchPushEndpoints(profileIds: string[]): Promise<PushSubscriptionRow[]> {
  if (!profileIds.length) return [];
  const rows: PushSubscriptionRow[] = [];
  for (const idChunk of chunk(profileIds, ID_CHUNK_SIZE)) {
    rows.push(
      ...(await selectAllPages<PushSubscriptionRow>(() =>
        supabase
          .from("push_subscriptions")
          .select("profile_id, endpoint, p256dh_key, auth_key")
          .in("profile_id", idChunk)
          .order("id", { ascending: true })
      )),
    );
  }
  return rows;
}

// The title and body come from _shared/notificationText.js, not from the
// `title` / `body` the database writes into `data` (a generic "Score - X"
// template, kept only as a last resort). `text` is the wording chosen for this
// recipient (general, or player-specific for a player follow).
function buildPayload(event: LiveEventRow, text: { title: string; body: string }) {
  const data = (event.data ?? {}) as Record<string, unknown>;
  // Always the match page: `/matches/<id>`.
  const url = event.match_id
    ? `/matches/${encodeURIComponent(event.match_id)}`
    : (typeof data.url === "string" && data.url) || "/notifications";

  return JSON.stringify({
    title: text.title || (typeof data.title === "string" ? data.title : "StallCount"),
    body: text.body,
    icon: (typeof data.icon === "string" && data.icon) || "/icon-192.png",
    badge: (typeof data.badge === "string" && data.badge) || "/icon-192.png",
    tag: (typeof data.tag === "string" && data.tag) || `live-event-${event.id}`,
    url,
    data: {
      ...data,
      url,
      eventId: event.id,
      matchId: event.match_id,
      eventType: event.event_type,
    },
  });
}

async function pruneEndpoint(endpoint: string) {
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) console.warn("Failed to prune push subscription", endpoint, error.message);
}

type DeliveryOutcome = "delivered" | "pruned" | "config_error" | "transient";

async function deliver(endpoint: PushSubscriptionRow, payload: string): Promise<{ outcome: DeliveryOutcome; detail?: string }> {
  try {
    await webpush.sendNotification(
      {
        endpoint: endpoint.endpoint,
        keys: { p256dh: endpoint.p256dh_key, auth: endpoint.auth_key },
      },
      payload,
      { TTL: config.pushTtlSeconds, urgency: "high" },
    );
    return { outcome: "delivered" };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    const body = (err as { body?: string }).body ?? (err as Error).message ?? "";
    const detail = `${status ?? "network"} ${String(body).slice(0, 200)}`.trim();
    if (status === 404 || status === 410) {
      // The browser dropped this subscription; it will never work again.
      await pruneEndpoint(endpoint.endpoint);
      return { outcome: "pruned", detail };
    }
    if (status === 401 || status === 403) {
      // VAPID rejected: the keys this function holds do not match the key the
      // browser subscribed with. Retrying cannot help until the keys agree.
      console.error("Push service rejected VAPID credentials", endpoint.endpoint, detail);
      return { outcome: "config_error", detail };
    }
    console.error("Push delivery failed", endpoint.endpoint, detail);
    return { outcome: "transient", detail };
  }
}

async function updateEvent(id: string, patch: Record<string, unknown>): Promise<void> {
  const body = { ...patch };
  if (!deliveryProgressAvailable) delete body.delivered_endpoints;
  const { error } = await supabase.from("live_events").update(body).eq("id", id);
  if (error && "delivered_endpoints" in body && isMissingDeliveryColumn(error)) {
    deliveryProgressAvailable = false;
    return updateEvent(id, patch);
  }
  if (error) throw error;
}

// Takes the event for this run. The update only matches while `attempts` is
// still the value this run read, so of two overlapping runs (the insert
// trigger and the cron job often fire together) exactly one wins; the other
// sees zero rows and leaves the event alone. The claim also moves
// `last_attempt_at`, so later runs wait for the backoff unless this run
// finishes or hands the event back.
async function claimEvent(event: LiveEventRow, attempts: number, now: string) {
  const { data, error } = await supabase
    .from("live_events")
    .update({ attempts, last_attempt_at: now })
    .eq("id", event.id)
    .eq("sent", false)
    .eq("attempts", event.attempts ?? 0)
    .select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

type Outcome = { outcome: DeliveryOutcome; detail?: string };

// Sends to every target, `sendConcurrency` at a time, until done or until
// `deadline`. `finished` is false when the deadline stopped it early.
async function deliverAll(
  targets: Array<{ endpoint: PushSubscriptionRow; key: string; payload: string }>,
  deadline: number,
) {
  const results: Array<{ key: string; result: Outcome }> = [];
  let next = 0;
  const worker = async () => {
    while (next < targets.length && Date.now() < deadline) {
      const target = targets[next];
      next += 1;
      const result = await deliver(target.endpoint, target.payload);
      results.push({ key: target.key, result });
    }
  };
  const workers = Array.from({ length: Math.min(config.sendConcurrency, targets.length) }, worker);
  await Promise.all(workers);
  return { results, finished: results.length === targets.length };
}

function isStale(event: LiveEventRow) {
  const created = Date.parse(event.created_at);
  if (!Number.isFinite(created)) return false;
  return Date.now() - created > config.staleAfterMinutes * 60 * 1000;
}

function backoffElapsed(event: LiveEventRow) {
  const attempts = event.attempts ?? 0;
  if (!attempts || !event.last_attempt_at) return true;
  const last = Date.parse(event.last_attempt_at);
  if (!Number.isFinite(last)) return true;
  const waitMs = Math.min(2 ** attempts, 30) * 60 * 1000;
  return Date.now() - last >= waitMs;
}

async function processEvent(event: LiveEventRow, scope: MatchScope | undefined, deadline: number) {
  const attempts = (event.attempts ?? 0) + 1;
  const now = new Date().toISOString();

  if (!(await claimEvent(event, attempts, now))) {
    return { eventId: event.id, status: "claimed_elsewhere", delivered: 0, endpoints: 0 };
  }

  if (isStale(event)) {
    await updateEvent(event.id, {
      sent: true,
      attempts,
      last_attempt_at: now,
      last_error: `expired: older than ${config.staleAfterMinutes} minutes`,
    });
    return { eventId: event.id, status: "expired", delivered: 0, endpoints: 0 };
  }

  // No alert for the end of a timeout, halftime or stoppage: the start is the
  // news. The row still exists (the home page's live ticker reads it).
  if (SILENT_EVENT_CODES.has(event.event_type)) {
    await updateEvent(event.id, {
      sent: true,
      attempts,
      last_attempt_at: now,
      delivered_count: 0,
      last_error: null,
    });
    return { eventId: event.id, status: "silent", delivered: 0, endpoints: 0 };
  }

  const targets = buildTargetMap(event, scope);
  const matchingSubs = await fetchMatchingSubscriptions(targets, event.event_type);
  const profileIds = Array.from(new Set(matchingSubs.map((sub) => sub.profile_id)));
  const endpoints = await fetchPushEndpoints(profileIds);
  if (!endpoints.length) {
    await updateEvent(event.id, {
      sent: true,
      attempts,
      last_attempt_at: now,
      delivered_count: 0,
      last_error: matchingSubs.length ? "no push endpoints for subscribers" : "no subscribers",
    });
    return { eventId: event.id, status: "no_recipients", delivered: 0, endpoints: 0 };
  }

  // Wording: general for everyone, except a profile that follows a player
  // named on this row, which gets the player's own wording ("Emma Belcher
  // scores"). Built once per distinct wording.
  const data = (event.data ?? {}) as Record<string, unknown>;
  const matchInfo = {
    teamAName: scope?.team_a_name ?? null,
    teamBName: scope?.team_b_name ?? null,
    scoreA: scope?.score_a ?? null,
    scoreB: scope?.score_b ?? null,
  };
  const generalPayload = buildPayload(event, buildNotificationText(event.event_type, data, matchInfo));
  const payloadByProfile = new Map<string, string>();
  for (const sub of matchingSubs) {
    if (sub.target_type !== "player" || payloadByProfile.has(sub.profile_id)) continue;
    const playerText = buildPlayerNotificationText(event.event_type, data, sub.target_id);
    if (playerText) payloadByProfile.set(sub.profile_id, buildPayload(event, playerText));
  }

  const alreadyDelivered = new Set(deliveryProgressAvailable ? event.delivered_endpoints ?? [] : []);
  const keyed = await Promise.all(
    endpoints.map(async (endpoint) => ({
      endpoint,
      key: await endpointKey(endpoint.endpoint),
      payload: payloadByProfile.get(endpoint.profile_id) ?? generalPayload,
    })),
  );
  const pending = keyed.filter((target) => !alreadyDelivered.has(target.key));
  // Without per-device memory, pausing would resend to everyone on the next
  // run, so the run carries on to the end of the event instead.
  const sendDeadline = deliveryProgressAvailable ? deadline : Number.POSITIVE_INFINITY;
  const { results, finished } = await deliverAll(pending, sendDeadline);

  const counts = { delivered: 0, pruned: 0, config_error: 0, transient: 0 };
  let lastDetail = "";
  const deliveredKeys = new Set(alreadyDelivered);
  for (const { key, result } of results) {
    counts[result.outcome] += 1;
    if (result.outcome === "delivered") deliveredKeys.add(key);
    if (result.detail && result.outcome !== "delivered") lastDetail = result.detail;
  }
  const deliveredTotal = deliveredKeys.size;

  if (!finished) {
    // Out of time. Save the progress and hand the event back (attempts and
    // last_attempt_at as they were), so the next run continues at once with
    // the devices still missing.
    await updateEvent(event.id, {
      attempts: event.attempts ?? 0,
      last_attempt_at: event.last_attempt_at ?? null,
      delivered_endpoints: Array.from(deliveredKeys),
      delivered_count: deliveredTotal,
      last_error: `paused: time budget reached, delivered ${deliveredTotal}/${endpoints.length}`,
    });
    return { eventId: event.id, status: "paused", delivered: counts.delivered, endpoints: endpoints.length };
  }

  const unresolved = counts.config_error + counts.transient;
  // With per-device memory a retry reaches only the devices that failed, so a
  // partial delivery is retried. Without it a retry would resend to everyone,
  // so (as before) one success counts as done.
  const done =
    unresolved === 0 ||
    attempts >= config.maxAttempts ||
    (!deliveryProgressAvailable && counts.delivered > 0);
  const summary = `delivered ${deliveredTotal}/${endpoints.length}` +
    (counts.pruned ? `, pruned ${counts.pruned}` : "") +
    (counts.config_error ? `, vapid rejected ${counts.config_error}` : "") +
    (counts.transient ? `, failed ${counts.transient}` : "") +
    (lastDetail ? ` (${lastDetail})` : "");

  await updateEvent(event.id, {
    sent: done,
    attempts,
    last_attempt_at: now,
    delivered_endpoints: Array.from(deliveredKeys),
    delivered_count: deliveredTotal,
    last_error: unresolved ? summary : null,
  });

  const status = counts.delivered > 0 ? "delivered" : done ? "gave_up" : "retry";
  return { eventId: event.id, status, delivered: counts.delivered, endpoints: endpoints.length, summary };
}

const PENDING_EVENT_COLUMNS =
  "id, match_id, event_type, data, team_id, player_id, secondary_player_id, created_at, attempts, last_attempt_at";

async function fetchPendingEvents(limit: number): Promise<LiveEventRow[]> {
  const columns = deliveryProgressAvailable
    ? `${PENDING_EVENT_COLUMNS}, delivered_endpoints`
    : PENDING_EVENT_COLUMNS;
  const { data, error } = await supabase
    .from("live_events")
    .select(columns)
    .eq("sent", false)
    .lt("attempts", config.maxAttempts)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error && deliveryProgressAvailable && isMissingDeliveryColumn(error)) {
    deliveryProgressAvailable = false;
    return fetchPendingEvents(limit);
  }
  if (error) throw error;
  return ((data ?? []) as LiveEventRow[]).filter(backoffElapsed);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isAuthorised(req: Request) {
  if (!config.dispatchSecret) {
    // No secret configured: fall back to the gateway's JWT check only.
    return true;
  }
  const provided = req.headers.get("x-dispatch-secret") ?? "";
  if (provided.length !== config.dispatchSecret.length) return false;
  // Constant-time compare.
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ config.dispatchSecret.charCodeAt(i);
  }
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!isAuthorised(req)) return json({ error: "Forbidden" }, 403);
  const deadline = Date.now() + config.timeBudgetMs;
  try {
    const events = await fetchPendingEvents(config.batchSize);
    // A failed lookup must not block match and player follows, which need no scope.
    const scopes = await fetchMatchScopes(events.map((event) => event.match_id)).catch((err) => {
      console.error("Failed to load match scopes", err);
      return new Map<string, MatchScope>();
    });
    const reports = [];
    for (const event of events) {
      // Out of time: leave the rest for the next run rather than be cut off
      // by the platform mid-send.
      if (Date.now() >= deadline) break;
      try {
        reports.push(await processEvent(event, scopes.get(event.match_id), deadline));
      } catch (err) {
        console.error("Failed to process live event", event.id, err);
        reports.push({ eventId: event.id, status: "error", error: (err as Error).message });
        try {
          await updateEvent(event.id, {
            attempts: (event.attempts ?? 0) + 1,
            last_attempt_at: new Date().toISOString(),
            last_error: `dispatcher error: ${(err as Error).message}`.slice(0, 500),
          });
        } catch (updateErr) {
          console.error("Failed to record dispatcher error", event.id, updateErr);
        }
      }
    }
    const delivered = reports.reduce((sum, r) => sum + (("delivered" in r && r.delivered) || 0), 0);
    return json({ processed: reports.length, delivered, reports });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});
