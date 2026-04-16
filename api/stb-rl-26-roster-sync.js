import { createClient } from "@supabase/supabase-js";
import {
  EXPECTED_EVENT_ID,
  getStbRl26RosterSyncStatus,
  getRosterScriptScheduleSnapshot,
  runStbRl26RosterSync,
} from "./_lib/stbRl26RosterSync.js";

const supabaseUrl =
  globalThis.process?.env?.SUPABASE_URL || globalThis.process?.env?.VITE_SUPABASE_URL;
const serviceRoleKey = globalThis.process?.env?.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = globalThis.process?.env?.CRON_SECRET || "";
const ALLOWED_ROLE_SLUGS = new Set(["admin", "tournament_director"]);

function createAdminSupabaseClient() {
  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL.");
  }

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
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
    supabase
      .from("user_roles")
      .select("role:roles(name)")
      .eq("user_id", userId),
    supabase
      .from("event_user_roles")
      .select("event_id, role:roles(name)")
      .eq("user_id", userId),
  ]);

  if (globalResult.error) {
    throw new Error(globalResult.error.message || "Unable to load global user roles.");
  }
  if (eventResult.error) {
    throw new Error(eventResult.error.message || "Unable to load event user roles.");
  }

  const roleSlugs = new Set();
  (globalResult.data || []).forEach((row) => {
    const slug = normalizeRoleSlug(row?.role?.name);
    if (slug) roleSlugs.add(slug);
  });
  (eventResult.data || []).forEach((row) => {
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
    throw Object.assign(new Error("You do not have permission to run this automation."), {
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

function buildManualSlotKey() {
  return `manual-${new Date().toISOString()}`;
}

function formatErrorForResponse(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack || "",
    };
  }

  return {
    message: String(error),
    stack: "",
  };
}

export default async function handler(request, response) {
  const startedAt = new Date().toISOString();
  const logs = [];
  const log = (message) => {
    logs.push(`[${new Date().toISOString()}] ${message}`);
  };

  try {
    log(`Incoming ${request.method || "UNKNOWN"} request.`);
    log("Creating admin Supabase client.");
    const supabase = createAdminSupabaseClient();

    if (request.method === "GET") {
      if (isCronRequest(request)) {
        log("Recognized cron request. Starting roster sync.");
        const output = await runStbRl26RosterSync({
          supabase,
          context: {
            eventId: EXPECTED_EVENT_ID,
            trigger: "cron",
            scheduleSlot: getRosterScriptScheduleSnapshot(),
          },
        });
        return sendJson(response, output.ok ? 200 : 500, {
          ...output,
          logs: [...logs, ...(Array.isArray(output.logs) ? output.logs : [])],
        });
      }

      log("Authorizing GET status request.");
      await requireAuthorizedUser(supabase, request);
      log("Loading roster sync status.");
      const status = await getStbRl26RosterSyncStatus({ supabase });
      return sendJson(response, 200, {
        ok: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        logs,
        status,
      });
    }

    if (request.method === "POST") {
      log("Authorizing POST roster sync request.");
      await requireAuthorizedUser(supabase, request);
      log("Reading POST body.");
      const body = await readJsonBody(request);
      const forceFullSync = Boolean(body?.forceFullSync);
      log(`Starting ${forceFullSync ? "full" : "incremental"} roster sync.`);
      const manualSlotKey = buildManualSlotKey();
      const output = await runStbRl26RosterSync({
        supabase,
        context: {
          eventId: EXPECTED_EVENT_ID,
          trigger: forceFullSync ? "manual-full-sync" : "manual",
          forceFullSync,
          scheduleSlot: getRosterScriptScheduleSnapshot(),
          slotKey: manualSlotKey,
        },
      });
      return sendJson(response, output.ok ? 200 : 500, {
        ...output,
        logs: [...logs, ...(Array.isArray(output.logs) ? output.logs : [])],
      });
    }

    log(`Rejected unsupported method: ${request.method}.`);
    return sendJson(response, 405, {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      logs,
      error: {
        message: "Method not allowed.",
        stack: "",
      },
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    const formattedError = formatErrorForResponse(error);
    log(`Request failed with status ${statusCode}: ${formattedError.message}`);
    return sendJson(response, statusCode, {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      logs,
      error: {
        ...formattedError,
      },
    });
  }
}
