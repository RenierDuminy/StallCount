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

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL.");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

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

async function fetchUserRoles(userId) {
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

async function requireAuthorizedUser(request) {
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

  const roleSlugs = await fetchUserRoles(user.id);
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

export default async function handler(request, response) {
  try {
    if (request.method === "GET") {
      if (isCronRequest(request)) {
        const output = await runStbRl26RosterSync({
          supabase,
          context: {
            eventId: EXPECTED_EVENT_ID,
            trigger: "cron",
            scheduleSlot: getRosterScriptScheduleSnapshot(),
          },
        });
        return sendJson(response, output.ok ? 200 : 500, output);
      }

      await requireAuthorizedUser(request);
      const status = await getStbRl26RosterSyncStatus({ supabase });
      return sendJson(response, 200, {
        ok: true,
        status,
      });
    }

    if (request.method === "POST") {
      await requireAuthorizedUser(request);
      const body = await readJsonBody(request);
      const forceFullSync = Boolean(body?.forceFullSync);
      const output = await runStbRl26RosterSync({
        supabase,
        context: {
          eventId: EXPECTED_EVENT_ID,
          trigger: forceFullSync ? "manual-full-sync" : "manual",
          forceFullSync,
          scheduleSlot: getRosterScriptScheduleSnapshot(),
        },
      });
      return sendJson(response, output.ok ? 200 : 500, output);
    }

    return sendJson(response, 405, {
      ok: false,
      error: {
        message: "Method not allowed.",
      },
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    return sendJson(response, statusCode, {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
