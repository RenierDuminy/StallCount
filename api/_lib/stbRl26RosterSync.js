import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_EVENT_ID = "e6a34716-f9d6-4d70-bc1a-b610a04e3eaf";
const JOB_KEY = "STB_RL_26_update_rosters";

// Mirrors CLOSED_STATUSES in src/constants/statusCodes.js. Duplicated rather
// than imported because api/_lib runs as a serverless function and must not
// pull from the Vite client bundle. Keep the two in step.
//
// `events.Status` is a FK to match_status(code); these are the codes that mean
// the event is over and no longer needs syncing.
const CLOSED_EVENT_STATUSES = new Set(["completed", "finished", "canceled", "forfeit"]);
const DEFAULT_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSFcNFojsDqBt5T2oca1kMuHvskIqBKnSP6lx5qdX2780Rlbxsl-_6NDaguRieY1x63OQIjU7M6z-Hy/pub?gid=1391076276&single=true&output=csv";
const DEFAULT_DOB_MODE = "dmy";
const SAST_UTC_OFFSET_HOURS = 2;
const SCHEDULE_HOUR_SAST = 17;
const EVENT_HIERARCHY_SELECT = `
  id,
  name,
  type,
  start_date,
  end_date,
  location,
  created_at,
  rules,
  divisions:divisions (
    id,
    name,
    level,
    pools:pools (
      id,
      name,
      teams:pool_teams (
        seed,
        team:teams (
          id,
          name,
          short_name
        )
      )
    )
  )
`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(
  __dirname,
  "../../src/customScripts/STB_RL_26_update_rosters.js",
);

function formatLogValue(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function getSastDateParts(value = new Date()) {
  const shifted = new Date(value.getTime() + SAST_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

function createDateForSastTime({ year, monthIndex, day, hour, minute = 0 }) {
  return new Date(Date.UTC(year, monthIndex, day, hour - SAST_UTC_OFFSET_HOURS, minute, 0, 0));
}

function getRosterScriptScheduleSnapshot(value = new Date()) {
  const parts = getSastDateParts(value);
  const isTodaysSlotActive = parts.hour >= SCHEDULE_HOUR_SAST;
  const currentSlotAt = createDateForSastTime({
    year: parts.year,
    monthIndex: parts.monthIndex,
    day: isTodaysSlotActive ? parts.day : parts.day - 1,
    hour: SCHEDULE_HOUR_SAST,
  });
  const nextSlotAt = createDateForSastTime({
    year: parts.year,
    monthIndex: parts.monthIndex,
    day: isTodaysSlotActive ? parts.day + 1 : parts.day,
    hour: SCHEDULE_HOUR_SAST,
  });
  const currentSlotParts = getSastDateParts(currentSlotAt);

  return {
    currentSlotKey: `${currentSlotParts.year}-${padNumber(currentSlotParts.monthIndex + 1)}-${padNumber(currentSlotParts.day)}T${padNumber(SCHEDULE_HOUR_SAST)}:00`,
    currentSlotAt,
    nextSlotAt,
  };
}

function sanitizeMessage(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 2000);
}

async function fetchAutomationState(supabase) {
  const { data, error } = await supabase
    .from("automation_job_state")
    .select(
      "job_key, last_started_at, last_finished_at, last_attempted_slot_key, last_attempted_at, last_ok, last_message, last_successful_slot_key, last_successful_run_at, last_processed_signup_timestamp, lock_token, lock_acquired_at, updated_at",
    )
    .eq("job_key", JOB_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Unable to load automation state.");
  }

  return data || null;
}

async function acquireJobLock(supabase, { slotKey, lockToken }) {
  const { data, error } = await supabase
    .rpc("acquire_automation_job_lock", {
      p_job_key: JOB_KEY,
      p_lock_token: lockToken,
      p_slot_key: slotKey || null,
      p_lock_timeout_seconds: 900,
    })
    .single();

  if (error) {
    throw new Error(error.message || "Unable to acquire automation lock.");
  }

  return data || { acquired: false, already_processed: false, locked: false };
}

async function releaseJobLock(supabase, { lockToken, slotKey, ok, message, result }) {
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
    payload.last_successful_run_at = result?.lastSuccessfulRunAt || finishedAt;
    payload.last_processed_signup_timestamp = result?.lastProcessedSignupTimestamp || null;
  }

  const { error } = await supabase
    .from("automation_job_state")
    .update(payload)
    .eq("job_key", JOB_KEY)
    .eq("lock_token", lockToken);

  if (error) {
    throw new Error(error.message || "Unable to release automation lock.");
  }
}

async function getEventHierarchy(eventId, supabase) {
  if (!eventId) {
    return null;
  }

  const { data, error } = await supabase
    .from("events")
    .select(EVENT_HIERARCHY_SELECT)
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load event hierarchy");
  }

  return data || null;
}

async function loadRosterScriptSource() {
  return readFile(SCRIPT_PATH, "utf8");
}

async function executeRosterScript({ supabase, context, log }) {
  const source = await loadRosterScriptSource();
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runner = new AsyncFunction(
    "context",
    "supabase",
    "helpers",
    "log",
    "console",
    `
      "use strict";
      const module = { exports: {} };
      const exports = module.exports;
      ${source}

      const exportedRunner =
        typeof module.exports === "function"
          ? module.exports
          : typeof module.exports?.default === "function"
            ? module.exports.default
            : typeof exports?.default === "function"
              ? exports.default
              : null;

      if (!exportedRunner) {
        throw new Error(
          "Custom scripts must assign an async function to module.exports.",
        );
      }

      return await exportedRunner({
        context,
        supabase,
        helpers,
        log,
        console,
      });
    `,
  );

  const consoleProxy = {
    log,
    info: log,
    warn: (...args) => log("[warn]", ...args),
    error: (...args) => log("[error]", ...args),
  };

  return runner(
    context,
    supabase,
    {
      getEventHierarchy: async (eventId) => getEventHierarchy(eventId, supabase),
    },
    log,
    consoleProxy,
  );
}

/**
 * Reads an event's lifecycle state so callers can skip work on a closed event.
 *
 * Fails OPEN on any error: if the status cannot be read (missing column, RLS,
 * network), the sync proceeds as before. A transient read failure must not
 * silently stop a live event's roster updates — the cost of an unnecessary run
 * is far lower than the cost of a league going unsynced without anyone noticing.
 */
async function fetchEventLifecycle(supabase, eventId) {
  try {
    const { data, error } = await supabase
      .from("events")
      .select("id, name, Status")
      .eq("id", eventId)
      .maybeSingle();

    if (error || !data) {
      return { isClosed: false, status: null, name: null };
    }

    const status = String(data.Status || "").trim().toLowerCase();
    return {
      // An unset status is not a closed status — treat it as still running.
      isClosed: status ? CLOSED_EVENT_STATUSES.has(status) : false,
      status: data.Status || null,
      name: data.name || null,
    };
  } catch {
    return { isClosed: false, status: null, name: null };
  }
}

export async function getStbRl26RosterSyncStatus({ supabase }) {
  return fetchAutomationState(supabase);
}

export async function runStbRl26RosterSync({
  supabase,
  context = {},
}) {
  const activeEventId = context.eventId || EXPECTED_EVENT_ID;
  if (activeEventId !== EXPECTED_EVENT_ID) {
    throw new Error(
      `STB_RL_26_update_rosters only supports ${EXPECTED_EVENT_ID}. Received ${activeEventId}.`,
    );
  }

  const logs = [];
  const log = (...args) => {
    logs.push(args.map(formatLogValue).join(" "));
  };

  // Stop before doing any work if the league is over. This job is on a daily
  // cron, so without this it keeps pulling the CSV and writing rosters for a
  // finished event indefinitely — pure waste, and it can overwrite rosters
  // that were hand-corrected after the event closed.
  //
  // `force` lets an admin override deliberately (a late correction on a
  // closed event); the cron never sets it.
  if (!context.force) {
    const eventState = await fetchEventLifecycle(supabase, activeEventId);

    if (eventState.isClosed) {
      log(
        `Event ${activeEventId} has status "${eventState.status}" — skipping roster sync.`,
      );
      return {
        ok: true,
        skipped: true,
        slug: JOB_KEY,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        logs,
        result: {
          status: "skipped",
          reason: "event-closed",
          message:
            `Roster sync skipped: "${eventState.name || activeEventId}" is ${eventState.status}. ` +
            "Run with force to sync anyway.",
          eventStatus: eventState.status,
        },
      };
    }
  }

  const scheduleSlot = context.scheduleSlot || getRosterScriptScheduleSnapshot();
  const slotKey = context.slotKey || scheduleSlot.currentSlotKey;
  const lockToken = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const lockResult = await acquireJobLock(supabase, { slotKey, lockToken });

  if (!lockResult?.acquired) {
    const state = await fetchAutomationState(supabase);
    if (lockResult?.already_processed) {
      return {
        ok: true,
        skipped: true,
        slug: JOB_KEY,
        startedAt,
        finishedAt: new Date().toISOString(),
        logs,
        result: {
          status: "skipped",
          reason: "already-processed",
          message: `Roster sync already completed for slot ${slotKey}.`,
          state,
        },
      };
    }

    return {
      ok: true,
      skipped: true,
      slug: JOB_KEY,
      startedAt,
      finishedAt: new Date().toISOString(),
      logs,
      result: {
        status: "skipped",
        reason: "locked",
        message: `Roster sync skipped because another run is already in progress.`,
        state,
      },
    };
  }

  let result = null;

  try {
    const previousState = await fetchAutomationState(supabase);
    result = await executeRosterScript({
      supabase,
      context: {
        eventId: activeEventId,
        trigger: context.trigger || "manual",
        forceFullSync: Boolean(context.forceFullSync),
        slotKey,
        slotLabel: context.slotLabel || null,
        csvUrl:
          context.csvUrl ||
          globalThis.process?.env?.STB_RL_26_SIGNUP_CSV_URL ||
          DEFAULT_CSV_URL,
        dobMode:
          context.dobMode ||
          globalThis.process?.env?.STB_RL_26_SIGNUP_DOB_MODE ||
          DEFAULT_DOB_MODE,
        scriptState: {
          lastSuccessfulRunAt: previousState?.last_successful_run_at || "",
          lastProcessedSignupTimestamp: previousState?.last_processed_signup_timestamp || "",
        },
        onStateChange: async () => {},
      },
      log,
    });

    await releaseJobLock(supabase, {
      lockToken,
      slotKey,
      ok: true,
      message: result?.message || "Roster sync completed.",
      result,
    });

    return {
      ok: true,
      slug: JOB_KEY,
      startedAt,
      finishedAt: new Date().toISOString(),
      logs,
      result,
    };
  } catch (error) {
    const err =
      error instanceof Error
        ? { message: error.message, stack: error.stack || "" }
        : { message: String(error), stack: "" };

    await releaseJobLock(supabase, {
      lockToken,
      slotKey,
      ok: false,
      message: err.message,
      result,
    });

    return {
      ok: false,
      slug: JOB_KEY,
      startedAt,
      finishedAt: new Date().toISOString(),
      logs,
      error: err,
    };
  }
}

export {
  EXPECTED_EVENT_ID,
  JOB_KEY,
  DEFAULT_CSV_URL,
  DEFAULT_DOB_MODE,
  getRosterScriptScheduleSnapshot,
};
