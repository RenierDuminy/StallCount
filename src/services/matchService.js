import { supabase } from "./supabaseClient";

const MATCH_FIELDS = `
  id,
  start_time,
  status,
  score_a,
  score_b,
  starting_team_id,
  abba_pattern,
  venue_id,
  venue:venues!matches_venue_id_fkey (id, name),
  event:events!matches_event_id_fkey (name),
  team_a:teams!matches_team_a_fkey (id, name, short_name),
  team_b:teams!matches_team_b_fkey (id, name, short_name)
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

export async function initialiseMatch(matchId, payload) {
  const updatePayload = {
    start_time: payload.start_time,
    starting_team_id: payload.starting_team_id,
    abba_pattern: payload.abba_pattern,
    status: "live",
  };

  if (payload.scorekeeper) {
    updatePayload.scorekeeper = payload.scorekeeper;
  }

  const { data, error } = await supabase
    .from("matches")
    .update(updatePayload)
    .eq("id", matchId)
    .select(MATCH_FIELDS)
    .single();

  if (error) {
    throw new Error(error.message || "Failed to initialise match");
  }

  return data;
}
