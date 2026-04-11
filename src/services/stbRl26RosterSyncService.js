import { supabase } from "./supabaseClient";

const API_PATH = "/api/stb-rl-26-roster-sync";

async function buildAuthHeaders() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message || "Unable to read current session.");
  }

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("A signed-in admin session is required.");
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Unexpected response from ${API_PATH}.`);
  }
}

export async function getStbRl26RosterSyncStatus() {
  const headers = await buildAuthHeaders();
  const response = await fetch(API_PATH, {
    method: "GET",
    headers,
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error?.message || "Unable to load roster sync status.");
  }

  return payload?.status || null;
}

export async function invokeStbRl26RosterSync({ forceFullSync = false } = {}) {
  const headers = await buildAuthHeaders();
  headers["Content-Type"] = "application/json";

  const response = await fetch(API_PATH, {
    method: "POST",
    headers,
    body: JSON.stringify({
      forceFullSync: Boolean(forceFullSync),
    }),
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok && payload?.ok !== true) {
    return {
      ok: false,
      slug: "STB_RL_26_update_rosters",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      logs: [],
      error: {
        message: payload?.error?.message || "Roster sync failed.",
        stack: "",
      },
    };
  }

  return payload;
}
