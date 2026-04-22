import { supabase } from "./supabaseClient";
import { getCachedQuery, invalidateCachedQueries } from "../utils/queryCache";

const RECENT_MATCHES_CACHE_TTL_MS = 30 * 1000;
const OPEN_MATCHES_CACHE_TTL_MS = 30 * 1000;
const EVENT_MATCHES_CACHE_TTL_MS = 60 * 1000;

const MATCH_FIELDS = `
  id,
  event_id,
  division_id,
  pool_id,
  start_time,
  confirmed_at,
  captains_confirmed,
  status,
  score_a,
  score_b,
  scorekeeper,
  starting_team_id,
  abba_pattern,
  venue_id,
  venue:venues!matches_venue_id_fkey (id, name, city, location),
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
  return getCachedQuery(
    `matches:recent:${limit}`,
    async () => {
      const { data, error } = await supabase
        .from("matches")
        .select(MATCH_FIELDS)
        .order("start_time", { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message || "Failed to load matches");
      }

      return data ?? [];
    },
    { ttlMs: RECENT_MATCHES_CACHE_TTL_MS },
  );
}

export async function getOpenMatches(limit = 12) {
  return getCachedQuery(
    `matches:open:${limit}`,
    async () => {
      const { data, error } = await supabase
        .from("matches")
        .select(MATCH_FIELDS)
        .in("status", ["scheduled", "ready", "pending", "Initialized", "live"])
        .order("start_time", { ascending: true })
        .limit(limit);

      if (error) {
        throw new Error(error.message || "Failed to load open matches");
      }

      return data ?? [];
    },
    { ttlMs: OPEN_MATCHES_CACHE_TTL_MS },
  );
}

export async function getMatchesByEvent(eventId, limit = 24, options = {}) {
  const { includeFinished = true, forceRefresh = false } = options;

  return getCachedQuery(
    `matches:event:${eventId}:limit=${limit}:includeFinished=${includeFinished}`,
    async () => {
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
    },
    forceRefresh ? { ttlMs: 0, staleWhileRevalidate: false } : { ttlMs: EVENT_MATCHES_CACHE_TTL_MS },
  );
}

export async function getRecentMatchesWithMedia(limit = 5) {
  return getCachedQuery(
    `matches:recent-with-media:${limit}`,
    async () => {
      const { data, error } = await supabase
        .from("matches")
        .select(MATCH_FIELDS)
        .or("has_media.eq.true,media_url.not.is.null,media_link.not.is.null")
        .order("start_time", { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message || "Failed to load recent matches with media");
      }

      return data ?? [];
    },
    { ttlMs: RECENT_MATCHES_CACHE_TTL_MS },
  );
}

export async function getRecentFinalMatches(limit = 16) {
  return getCachedQuery(
    `matches:recent-finals:${limit}`,
    async () => {
      const { data, error } = await supabase
        .from("matches")
        .select(MATCH_FIELDS)
        .in("status", ["finished", "completed"])
        .order("start_time", { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message || "Failed to load recent final matches");
      }

      return data ?? [];
    },
    { ttlMs: RECENT_MATCHES_CACHE_TTL_MS },
  );
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

export async function createMatch(payload = {}) {
  if (!payload.eventId) {
    throw new Error("Event ID is required to create a match.");
  }

  const insertPayload = {
    event_id: payload.eventId,
    division_id: payload.divisionId || null,
    pool_id: payload.poolId || null,
    venue_id: payload.venueId || null,
    team_a: payload.teamAId || null,
    team_b: payload.teamBId || null,
    starting_team_id: payload.startingTeamId || null,
    abba_pattern:
      typeof payload.abbaPattern === "string" && payload.abbaPattern.trim()
        ? payload.abbaPattern.trim()
        : null,
    status:
      typeof payload.status === "string" && payload.status.trim()
        ? payload.status.trim()
        : "scheduled",
    start_time: payload.startTime || null,
    score_a: Number.isInteger(payload.scoreA) ? payload.scoreA : 0,
    score_b: Number.isInteger(payload.scoreB) ? payload.scoreB : 0,
    captains_confirmed: Boolean(payload.captainsConfirmed),
    confirmed_at: payload.confirmedAt || null,
    scorekeeper: payload.scorekeeperId || null,
  };

  if (payload.mediaLink) {
    insertPayload.media_link = payload.mediaLink;
  }

  const { data, error } = await supabase
    .from("matches")
    .insert(insertPayload)
    .select(MATCH_FIELDS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to create match");
  }

  if (data?.event_id) {
    invalidateCachedQueries(`matches:event:${data.event_id}`);
  }
  invalidateCachedQueries("matches:open");
  invalidateCachedQueries("matches:recent");
  invalidateCachedQueries("matches:recent-finals");

  return data || null;
}

export async function updateMatch(matchId, payload = {}) {
  if (!matchId) {
    throw new Error("Match ID is required to update a match.");
  }

  const updatePayload = {};

  if ("divisionId" in payload) updatePayload.division_id = payload.divisionId || null;
  if ("poolId" in payload) updatePayload.pool_id = payload.poolId || null;
  if ("venueId" in payload) updatePayload.venue_id = payload.venueId || null;
  if ("startTime" in payload) updatePayload.start_time = payload.startTime || null;
  if ("teamAId" in payload) updatePayload.team_a = payload.teamAId || null;
  if ("teamBId" in payload) updatePayload.team_b = payload.teamBId || null;
  if ("scoreA" in payload) updatePayload.score_a = payload.scoreA;
  if ("scoreB" in payload) updatePayload.score_b = payload.scoreB;
  if ("captainsConfirmed" in payload) updatePayload.captains_confirmed = Boolean(payload.captainsConfirmed);
  if ("confirmedAt" in payload) updatePayload.confirmed_at = payload.confirmedAt || null;
  if ("status" in payload) {
    updatePayload.status =
      typeof payload.status === "string" && payload.status.trim()
        ? payload.status.trim()
        : "scheduled";
  }

  const { data, error } = await supabase
    .from("matches")
    .update(updatePayload)
    .eq("id", matchId)
    .select(MATCH_FIELDS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to update match");
  }

  if (data?.event_id) {
    invalidateCachedQueries(`matches:event:${data.event_id}`);
  }
  invalidateCachedQueries("matches:open");
  invalidateCachedQueries("matches:recent");

  return data || null;
}

export async function deleteMatch(matchId) {
  if (!matchId) {
    throw new Error("Match ID is required to delete a match.");
  }

  const { data: existing, error: loadError } = await supabase
    .from("matches")
    .select("id, event_id")
    .eq("id", matchId)
    .maybeSingle();

  if (loadError) {
    throw new Error(loadError.message || "Failed to load match before deletion");
  }

  const { error } = await supabase.from("matches").delete().eq("id", matchId);

  if (error) {
    throw new Error(error.message || "Failed to delete match");
  }

  if (existing?.event_id) {
    invalidateCachedQueries(`matches:event:${existing.event_id}`);
  }
  invalidateCachedQueries("matches:open");
  invalidateCachedQueries("matches:recent");
  invalidateCachedQueries("matches:recent-finals");

  return existing || null;
}

const MATCH_STATUS_CODES = new Set([
  "canceled",
  "completed",
  "finished",
  "halftime",
  "Initialized",
  "initialized",
  "live",
  "scheduled",
]);

export async function initialiseMatch(matchId, payload) {
  const desiredStatus = MATCH_STATUS_CODES.has(payload.status)
    ? payload.status
    : "Initialized";

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

  if (data?.event_id) {
    invalidateCachedQueries(`matches:event:${data.event_id}`);
  }
  invalidateCachedQueries("matches:open");
  invalidateCachedQueries("matches:recent");

  return data || null;
}

export async function updateMatchParticipants(matchId, payload = {}) {
  if (!matchId) {
    throw new Error("Match ID is required to update participants.");
  }

  const updatePayload = {
    team_a: payload.teamAId || null,
    team_b: payload.teamBId || null,
  };

  const { data, error } = await supabase
    .from("matches")
    .update(updatePayload)
    .eq("id", matchId)
    .select(MATCH_FIELDS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to update match participants");
  }

  if (data?.event_id) {
    invalidateCachedQueries(`matches:event:${data.event_id}`);
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

  if (data?.event_id) {
    invalidateCachedQueries(`matches:event:${data.event_id}`);
  }
  invalidateCachedQueries("matches:recent");
  invalidateCachedQueries("matches:recent-with-media");

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
