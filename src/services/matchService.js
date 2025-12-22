import { supabase } from "./supabaseClient";

const MATCH_FIELDS = `
  id,
  event_id,
  division_id,
  pool_id,
  start_time,
  confirmed_at,
  status,
  score_a,
  score_b,
  scorekeeper,
  starting_team_id,
  abba_pattern,
  venue_id,
  venue:venues!matches_venue_id_fkey (id, name),
  event:events!matches_event_id_fkey (id, name, rules),
  team_a:teams!matches_team_a_fkey (id, name, short_name),
  team_b:teams!matches_team_b_fkey (id, name, short_name),
  media_link,
  media_provider,
  media_url,
  media_status,
  has_media
`;

export async function getRecentMatches(limit = 4) {
  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_FIELDS)
    .order("start_time", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Failed to load matches");
  }

  return data ?? [];
}

export async function getOpenMatches(limit = 12) {
  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_FIELDS)
    .in("status", ["scheduled", "ready", "pending", "live"])
    .order("start_time", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Failed to load open matches");
  }

  return data ?? [];
}

export async function getMatchesByEvent(eventId, limit = 24, options = {}) {
  const { includeFinished = true } = options;

  let query = supabase
    .from("matches")
    .select(MATCH_FIELDS)
    .eq("event_id", eventId)
    .order("start_time", { ascending: true })
    .limit(limit);

  if (!includeFinished) {
    query = query.neq("status", "finished").neq("status", "completed");
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || "Failed to load matches for event");
  }

  return data ?? [];
}

export async function getMatchById(matchId) {
  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_FIELDS)
    .eq("id", matchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load match");
  }

  return data || null;
}

const MATCH_STATUS_CODES = new Set([
  "canceled",
  "completed",
  "finished",
  "halftime",
  "live",
  "scheduled",
]);

export async function initialiseMatch(matchId, payload) {
  const desiredStatus = MATCH_STATUS_CODES.has(payload.status)
    ? payload.status
    : "live";

  const updatePayload = {
    start_time: payload.start_time,
    starting_team_id: payload.starting_team_id,
    abba_pattern: payload.abba_pattern,
    status: desiredStatus,
  };

  if (payload.scorekeeper) {
    updatePayload.scorekeeper = payload.scorekeeper;
  }

  const { data, error } = await supabase
    .from("matches")
    .update(updatePayload)
    .eq("id", matchId)
    .select(MATCH_FIELDS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to initialise match");
  }

  if (data) {
    return data;
  }

  const fallback = await getMatchById(matchId);
  if (fallback) {
    return fallback;
  }

  throw new Error("Match not found after initialisation");
}

export async function updateMatchStatus(matchId, nextStatus = "finished") {
  const status = MATCH_STATUS_CODES.has(nextStatus) ? nextStatus : "finished";
  const { data, error } = await supabase
    .from("matches")
    .update({ status })
    .eq("id", matchId)
    .select(MATCH_FIELDS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to update match status");
  }

  return data || null;
}

export async function updateMatchMediaLink(matchId, mediaPayload) {
  if (!matchId) {
    throw new Error("Match ID is required to update media link.");
  }

  const { data, error } = await supabase
    .from("matches")
    .update({ media_link: mediaPayload ?? null })
    .eq("id", matchId)
    .select(MATCH_FIELDS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to update match media link");
  }

  return data || null;
}

export async function getMatchesByIds(ids = []) {
  const uniqueIds = Array.from(
    new Set(
      (ids || [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((id) => id.length > 0),
    ),
  );

  if (!uniqueIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_FIELDS)
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message || "Failed to load matches by id");
  }

  const rows = data ?? [];
  const lookup = new Map(rows.map((row) => [row.id, row]));
  return uniqueIds.map((id) => lookup.get(id)).filter(Boolean);
}
