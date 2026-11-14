// The home page's four public summaries, built server-side for
// api/home-summary.js so they can be cached at Vercel's edge and shared by
// every visitor.
//
// KEEP IN STEP with the client reads these mirror (serverless code cannot
// import from the Vite bundle):
//   * MATCH_FIELDS, OPEN_EVENT_FILTER, getOpenMatches, getRecentMatches,
//     getRecentMatchesWithMedia, getRecentFinalMatches: src/services/matchService.js
//   * getRecentLiveEvents: src/services/liveEventService.ts
//   * getEventsList: src/services/leagueService.ts
//   * getTableCount: src/services/statsService.ts
//   * the status lists: src/constants/statusCodes.js
//   * the summary shapes and default limits: src/services/homeSummaryService.js
// The client falls back to its own reads when this endpoint fails, so a
// mismatch shows up as the two paths disagreeing, not as a broken page.

const IN_PROGRESS_STATUSES = ["live", "halftime"];
const PENDING_STATUSES = ["scheduled", "initialized", "postponed"];
const OPEN_MATCH_STATUSES = [...IN_PROGRESS_STATUSES, ...PENDING_STATUSES];
const CLOSED_STATUSES = ["completed", "finished", "canceled", "forfeit", "forfeit_teamA", "forfeit_teamB"];
const CONCLUDED_STATUSES = ["completed", "finished"];

// See matchService.js: the `Status.is.null` arm keeps events with no status.
const OPEN_EVENT_FILTER = `Status.is.null,Status.not.in.(${CLOSED_STATUSES.join(",")})`;

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
  venue:venues!matches_venue_id_fkey (id, name, city, location, latitude, longitude),
  event:events!matches_event_id_fkey (id, name, rules, status:Status),
  team_a:teams!matches_team_a_fkey (id, name, short_name),
  team_b:teams!matches_team_b_fkey (id, name, short_name),
  media_link,
  media_provider,
  media_url,
  media_status,
  has_media
`;

const MATCH_FIELDS_WITH_REQUIRED_EVENT = MATCH_FIELDS.replace(
  "event:events!matches_event_id_fkey (",
  "event:events!matches_event_id_fkey!inner (",
);

// Edge cache lifetime per section, in seconds. The same as the client cache
// TTLs in homeSummaryService.js.
export const HOME_SUMMARY_SECTIONS = {
  hero: { maxAgeSeconds: 15, limits: { openMatches: 12, liveEvents: 24 } },
  "below-fold": { maxAgeSeconds: 60, limits: { events: 16 } },
  streaming: { maxAgeSeconds: 30, limits: { recentMatches: 12, broadcastMatches: 5 } },
  finals: { maxAgeSeconds: 60, limits: { finalMatches: 16 } },
};

// Limits come from the query string. They are clamped so nobody can ask for a
// huge read, and every distinct value is its own edge cache entry.
const MAX_LIMIT = 50;

export function readLimits(section, query) {
  const defaults = HOME_SUMMARY_SECTIONS[section].limits;
  const limits = {};
  for (const [name, fallback] of Object.entries(defaults)) {
    const value = Number.parseInt(String(query?.[name] ?? ""), 10);
    limits[name] = Number.isInteger(value) && value > 0 ? Math.min(value, MAX_LIMIT) : fallback;
  }
  return limits;
}

function unwrap(label) {
  return ({ data, error }) => {
    if (error) throw new Error(`${label}: ${error.message || "read failed"}`);
    return data ?? [];
  };
}

async function settle(promise) {
  try {
    return { status: "fulfilled", value: await promise };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

function failuresOf(results, labels) {
  return results
    .map((result, index) =>
      result.status === "fulfilled"
        ? null
        : { key: labels[index], message: result.reason?.message || `Failed to load ${labels[index]}.` },
    )
    .filter(Boolean);
}

function valueOr(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}

// An essential read failing fails the whole section (the client then reads
// directly), rather than caching an empty list at the edge.
function requireFulfilled(result) {
  if (result.status === "rejected") throw result.reason;
}

async function countRows(supabase, table) {
  // On "id", not "*": player.birthday is not granted to API roles.
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`${table} count: ${error.message || "read failed"}`);
  return count ?? 0;
}

export async function buildHomeSummary(supabase, section, limits) {
  const loadedAt = new Date().toISOString();

  if (section === "hero") {
    const results = await Promise.all([
      settle(
        supabase
          .from("matches")
          .select(MATCH_FIELDS_WITH_REQUIRED_EVENT)
          .in("status", OPEN_MATCH_STATUSES)
          .or(OPEN_EVENT_FILTER, { referencedTable: "event" })
          .order("start_time", { ascending: true })
          .limit(limits.openMatches)
          .then(unwrap("upcoming matches")),
      ),
      settle(
        supabase
          .from("live_events")
          .select("id, match_id, event_type, data, team_id, player_id, secondary_player_id, created_at")
          .order("created_at", { ascending: false })
          .limit(limits.liveEvents)
          .then(unwrap("live events")),
      ),
    ]);
    requireFulfilled(results[0]);
    return {
      openMatches: valueOr(results[0], []),
      liveEvents: valueOr(results[1], []),
      failures: failuresOf(results, ["upcoming matches", "live events"]),
      loadedAt,
    };
  }

  if (section === "below-fold") {
    const results = await Promise.all([
      settle(
        supabase
          .from("events")
          .select("id, name, slug, type, start_date, end_date, location, created_at, status:Status, rules")
          .order("start_date", { ascending: false })
          .limit(limits.events)
          .then(unwrap("events")),
      ),
      settle(countRows(supabase, "player")),
      settle(countRows(supabase, "teams")),
      settle(countRows(supabase, "events")),
    ]);
    requireFulfilled(results[0]);
    return {
      events: valueOr(results[0], []),
      stats: {
        players: valueOr(results[1], 0),
        teams: valueOr(results[2], 0),
        events: valueOr(results[3], 0),
      },
      failures: failuresOf(results, ["events", "players count", "teams count", "events count"]),
      loadedAt,
    };
  }

  if (section === "streaming") {
    const results = await Promise.all([
      settle(
        supabase
          .from("matches")
          .select(MATCH_FIELDS)
          .order("start_time", { ascending: false })
          .limit(limits.recentMatches)
          .then(unwrap("recent matches")),
      ),
      settle(
        supabase
          .from("matches")
          .select(MATCH_FIELDS)
          .or("has_media.eq.true,media_url.not.is.null,media_link.not.is.null")
          .order("start_time", { ascending: false })
          .limit(limits.broadcastMatches)
          .then(unwrap("matches with media")),
      ),
    ]);
    if (results.every((result) => result.status === "rejected")) requireFulfilled(results[0]);
    return {
      latestMatches: valueOr(results[0], []),
      recentBroadcastMatches: valueOr(results[1], []),
      failures: failuresOf(results, ["recent matches", "matches with media"]),
      loadedAt,
    };
  }

  if (section === "finals") {
    const results = await Promise.all([
      settle(
        supabase
          .from("matches")
          .select(MATCH_FIELDS)
          .in("status", CONCLUDED_STATUSES)
          .order("start_time", { ascending: false })
          .limit(limits.finalMatches)
          .then(unwrap("recent final matches")),
      ),
    ]);
    requireFulfilled(results[0]);
    return {
      recentFinalMatches: valueOr(results[0], []),
      failures: failuresOf(results, ["recent final matches"]),
      loadedAt,
    };
  }

  throw new Error(`Unknown home summary section: ${section}`);
}
