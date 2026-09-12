import { supabase } from "./supabaseClient";
import { fromSupabaseError } from "../utils/errorMessages";

// ============================================================================
// Season report extraction
// ============================================================================
// Browser-side port of scripts/seasonReportExtract.sql. That file remains the
// reference copy (and the manual fallback for running in the Supabase SQL
// editor); this module produces the same 21 CSVs from the app.
//
// WHY THIS IS A PORT AND NOT THE SQL ITSELF: the Supabase JS client cannot
// execute raw SQL. There is no generic exec_sql RPC in this project and
// deliberately so — a SECURITY DEFINER function that runs arbitrary SQL text
// from the browser is a serious security surface. So each section below is
// re-expressed as a PostgREST query with embedded FK joins.
//
// KEEP THE TWO IN SYNC. If you change a section here, change the matching
// numbered section in scripts/seasonReportExtract.sql, and vice versa.
//
// Traversal is the same as the SQL: events -> matches -> match_logs
// establishes the row set, then the FKs those rows reference (venues,
// divisions, pools, teams, players, event types) are filtered back out of
// their own tables.
// ============================================================================

// PostgREST caps rows per request. Anything that can exceed this is paged;
// match_logs on a full season is the case that actually needs it.
const PAGE_SIZE = 1000;

// PostgREST builds `in.(...)` as a URL query string, so a season's worth of
// match ids in one filter can exceed the server's URL length limit. Chunk the
// id list and merge the results.
const IN_CHUNK_SIZE = 200;

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Pages a query to completion. `build` receives a range and returns a fresh
// query — it must be a builder, not a promise, because each page is a new
// request.
async function fetchAll(build, label) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw fromSupabaseError(error, `Failed to load ${label}`);
    const page = data ?? [];
    rows.push(...page);
    // A short page means there is no next one. Guard against a server that
    // caps below PAGE_SIZE by also stopping when nothing came back.
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

// Same as fetchAll but for a query filtered by a large id list.
async function fetchAllIn(build, column, ids, label) {
  if (!ids.length) return [];
  const rows = [];
  for (const part of chunk(ids, IN_CHUNK_SIZE)) {
    rows.push(...(await fetchAll(() => build().in(column, part), label)));
  }
  return rows;
}

// --- small helpers -------------------------------------------------------

const byName = (a, b) =>
  String(a?.name ?? "").localeCompare(String(b?.name ?? ""), undefined, {
    sensitivity: "base",
  });

// Sorts on a nullable timestamp, pushing nulls last — mirrors the SQL's
// `order by start_time nulls last`.
function byTimeThen(getTime, ...tiebreakers) {
  return (a, b) => {
    const ta = getTime(a);
    const tb = getTime(b);
    const va = ta ? new Date(ta).getTime() : Number.POSITIVE_INFINITY;
    const vb = tb ? new Date(tb).getTime() : Number.POSITIVE_INFINITY;
    if (va !== vb) return va - vb;
    for (const tie of tiebreakers) {
      const r = tie(a, b);
      if (r) return r;
    }
    return 0;
  };
}

const name = (obj) => obj?.name ?? null;
const uniq = (list) => [...new Set(list.filter(Boolean))];

// ============================================================================
// FILE MANIFEST
// ============================================================================
// Order, keys and filenames match the numbered sections of the .sql file.
// `summary` is shown next to each download button in the UI.
// ============================================================================

export const SEASON_REPORT_FILES = [
  {
    key: "event",
    section: "1",
    label: "Event",
    file: "seasonReport_event.csv",
    summary:
      "The event record itself — name, type, dates, location, status and the rules JSON that governs caps and timeouts.",
  },
  {
    key: "divisions",
    section: "2",
    label: "Divisions",
    file: "seasonReport_divisions.csv",
    summary: "Every division in the event, with its level.",
  },
  {
    key: "pools",
    section: "3",
    label: "Pools",
    file: "seasonReport_pools.csv",
    summary: "Pools within each division, with the parent division name resolved.",
  },
  {
    key: "division_teams",
    section: "4",
    label: "Division teams",
    file: "seasonReport_division_teams.csv",
    summary: "Which teams are placed in which division — the official seeding view.",
  },
  {
    key: "pool_teams",
    section: "5",
    label: "Pool teams",
    file: "seasonReport_pool_teams.csv",
    summary: "Which teams are placed in which pool, including seed number.",
  },
  {
    key: "teams",
    section: "6",
    label: "Teams",
    file: "seasonReport_teams.csv",
    summary:
      "Every team in the event, flagged in_division (seeded into a division) and played_match (actually appears in a match). A team can be one without the other.",
  },
  {
    key: "venues",
    section: "7",
    label: "Venues",
    file: "seasonReport_venues.csv",
    summary:
      "Venues for the event, flagged is_declared (listed on the event) and is_used (referenced by a match), with the declared role and notes.",
  },
  {
    key: "matches",
    section: "8",
    label: "Matches",
    file: "seasonReport_matches.csv",
    summary:
      "All matches in every status (scheduled, live, finished) with division, pool, venue and both team names resolved. Excludes the scorekeeper user id and the media columns. Note score_a/score_b is the published cache, not the authoritative record.",
  },
  {
    key: "match_logs",
    section: "9",
    label: "Match logs",
    file: "seasonReport_match_logs.csv",
    summary:
      "The point-by-point record and the source of truth for scores. One row per event with the event code, team and player names resolved. Rows are in created_at order — point numbers and running score are derived by replaying them, so do not re-sort this file.",
  },
  {
    key: "match_events",
    section: "10",
    label: "Match event types",
    file: "seasonReport_match_events.csv",
    summary:
      "The static catalog of event type codes (score, turnover, timeout_start…) that match_logs.event_type_id points into. Not event-scoped.",
  },
  {
    key: "spirit_scores",
    section: "12",
    label: "Spirit scores",
    file: "seasonReport_spirit_scores.csv",
    summary:
      "WFDF spirit scores across the five categories plus total and comments. rated_team_id is the team being rated; the other team in the match is the rater. Excludes the submitter's user id.",
  },
  {
    key: "team_roster",
    section: "13",
    label: "Team rosters",
    file: "seasonReport_team_roster.csv",
    summary:
      "Players on each team for this event, with captain and spirit-captain flags and jersey numbers.",
  },
  {
    key: "player",
    section: "14",
    label: "Players",
    file: "seasonReport_player.csv",
    summary:
      "Distinct players rostered in this event, with gender label. Excludes date of birth (PII), the free-text description field, and the internal search index.",
  },
  {
    key: "player_match_stats",
    section: "15",
    label: "Player match stats",
    file: "seasonReport_player_match_stats.csv",
    summary:
      "Per-match goals, assists, blocks and turnovers per player. Sum this for event-scoped player totals.",
  },
  {
    key: "player_statistics",
    section: "16",
    label: "Player career stats",
    file: "seasonReport_player_statistics.csv",
    summary:
      "CAREER-WIDE totals for the players in this event — filtered to these players but NOT limited to this event's matches. Career context only; use player match stats for event totals.",
  },
  {
    key: "brackets",
    section: "17",
    label: "Brackets",
    file: "seasonReport_brackets.csv",
    summary: "Playoff bracket definitions for the event, if any.",
  },
  {
    key: "bracket_nodes",
    section: "18",
    label: "Bracket nodes",
    file: "seasonReport_bracket_nodes.csv",
    summary:
      "Each slot in the bracket — round, position, the linked match and its score, and where winners and losers advance to.",
  },
  {
    key: "lookup_match_status",
    section: "19a",
    label: "Lookup: match status",
    file: "seasonReport_lookup_match_status.csv",
    summary: "Valid match status codes.",
  },
  {
    key: "lookup_genders",
    section: "19b",
    label: "Lookup: genders",
    file: "seasonReport_lookup_genders.csv",
    summary: "Gender codes and labels, decoding player.gender_code.",
  },
  {
    key: "lookup_abba_line",
    section: "19c",
    label: "Lookup: ABBA line",
    file: "seasonReport_lookup_abba_line.csv",
    summary: "Valid ABBA line values, decoding match_logs.abba_line.",
  },
];

// ============================================================================
// SECTION BUILDERS
// ============================================================================
// Each returns an array of flat row objects, already ordered. Column order in
// the CSV follows the key order of the first row, so these are written in the
// same order as the SELECT lists in the .sql file.
// ============================================================================

// --- 1. Event ------------------------------------------------------------
async function loadEvent(eventId) {
  const { data, error } = await supabase
    .from("events")
    .select('id, name, type, start_date, end_date, location, "Status", rules')
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw fromSupabaseError(error, "Failed to load event");
  if (!data) return [];
  const { Status, ...rest } = data;
  // Reordered so status_code sits where it does in the SQL's select list.
  return [
    {
      id: rest.id,
      name: rest.name,
      type: rest.type,
      start_date: rest.start_date,
      end_date: rest.end_date,
      location: rest.location,
      status_code: Status ?? null,
      rules: rest.rules,
    },
  ];
}

// --- 2. Divisions --------------------------------------------------------
async function loadDivisions(eventId) {
  const rows = await fetchAll(
    () =>
      supabase
        .from("divisions")
        .select("id, event_id, name, level")
        .eq("event_id", eventId),
    "divisions",
  );
  return rows.sort(byName);
}

// --- 3. Pools ------------------------------------------------------------
async function loadPools(divisions) {
  const ids = divisions.map((d) => d.id);
  const rows = await fetchAllIn(
    () => supabase.from("pools").select("id, name, division_id"),
    "division_id",
    ids,
    "pools",
  );
  const divisionName = new Map(divisions.map((d) => [d.id, d.name]));
  return rows
    .map((p) => ({
      id: p.id,
      name: p.name,
      division_id: p.division_id,
      division_name: divisionName.get(p.division_id) ?? null,
    }))
    .sort(
      (a, b) =>
        String(a.division_name ?? "").localeCompare(String(b.division_name ?? "")) ||
        byName(a, b),
    );
}

// --- 4. Division teams ---------------------------------------------------
async function loadDivisionTeams(divisions) {
  const ids = divisions.map((d) => d.id);
  const rows = await fetchAllIn(
    () =>
      supabase
        .from("division_teams")
        .select("division_id, team_id, teams!division_teams_team_id_fkey(name, short_name)"),
    "division_id",
    ids,
    "division teams",
  );
  const divisionName = new Map(divisions.map((d) => [d.id, d.name]));
  return rows
    .map((r) => ({
      division_id: r.division_id,
      division_name: divisionName.get(r.division_id) ?? null,
      team_id: r.team_id,
      team_name: name(r.teams),
      team_short_name: r.teams?.short_name ?? null,
    }))
    .sort(
      (a, b) =>
        String(a.division_name ?? "").localeCompare(String(b.division_name ?? "")) ||
        String(a.team_name ?? "").localeCompare(String(b.team_name ?? "")),
    );
}

// --- 5. Pool teams -------------------------------------------------------
async function loadPoolTeams(pools) {
  const ids = pools.map((p) => p.id);
  const rows = await fetchAllIn(
    () =>
      supabase
        .from("pool_teams")
        .select("pool_id, team_id, seed, teams!pool_teams_team_id_fkey(name, short_name)"),
    "pool_id",
    ids,
    "pool teams",
  );
  const pool = new Map(pools.map((p) => [p.id, p]));
  return rows
    .map((r) => {
      const p = pool.get(r.pool_id);
      return {
        pool_id: r.pool_id,
        pool_name: p?.name ?? null,
        division_id: p?.division_id ?? null,
        division_name: p?.division_name ?? null,
        team_id: r.team_id,
        team_name: name(r.teams),
        team_short_name: r.teams?.short_name ?? null,
        seed: r.seed,
      };
    })
    .sort(
      (a, b) =>
        String(a.division_name ?? "").localeCompare(String(b.division_name ?? "")) ||
        String(a.pool_name ?? "").localeCompare(String(b.pool_name ?? "")) ||
        // seed nulls last
        (a.seed ?? Number.POSITIVE_INFINITY) - (b.seed ?? Number.POSITIVE_INFINITY) ||
        String(a.team_name ?? "").localeCompare(String(b.team_name ?? "")),
    );
}

// --- 6. Teams (unified) --------------------------------------------------
// Mirrors the SQL's in_division / played_match flags. A team seeded into a
// division that never got a match still appears, and is distinguishable.
async function loadTeams(divisionTeams, matches) {
  const seeded = new Set(divisionTeams.map((r) => r.team_id).filter(Boolean));
  const played = new Set(
    matches.flatMap((m) => [m.team_a, m.team_b]).filter(Boolean),
  );
  const ids = uniq([...seeded, ...played]);
  const rows = await fetchAllIn(
    () => supabase.from("teams").select("id, name, short_name, attributes"),
    "id",
    ids,
    "teams",
  );
  const found = new Map(rows.map((t) => [t.id, t]));
  return ids
    .map((id) => {
      const t = found.get(id);
      return {
        id,
        name: t?.name ?? null,
        short_name: t?.short_name ?? null,
        attributes: t?.attributes ?? null,
        in_division: seeded.has(id),
        played_match: played.has(id),
      };
    })
    .sort(byName);
}

// --- 7. Venues (unified) -------------------------------------------------
async function loadVenues(eventId, matches) {
  const { data: declaredRows, error } = await supabase
    .from("event_venues")
    .select("venue_id, role, notes")
    .eq("event_id", eventId);
  if (error) throw fromSupabaseError(error, "Failed to load event venues");

  const declared = new Map((declaredRows ?? []).map((r) => [r.venue_id, r]));
  const used = new Set(matches.map((m) => m.venue_id).filter(Boolean));
  const ids = uniq([...declared.keys(), ...used]);

  const rows = await fetchAllIn(
    () =>
      supabase
        .from("venues")
        .select("id, name, location, city, latitude, longitude, notes"),
    "id",
    ids,
    "venues",
  );
  const found = new Map(rows.map((v) => [v.id, v]));
  return ids
    .map((id) => {
      const v = found.get(id);
      const dec = declared.get(id);
      return {
        id,
        name: v?.name ?? null,
        location: v?.location ?? null,
        city: v?.city ?? null,
        latitude: v?.latitude ?? null,
        longitude: v?.longitude ?? null,
        venue_notes: v?.notes ?? null,
        is_declared: declared.has(id),
        is_used: used.has(id),
        event_venue_role: dec?.role ?? null,
        event_venue_notes: dec?.notes ?? null,
      };
    })
    .sort(byName);
}

// --- 8. Matches ----------------------------------------------------------
// Excludes `scorekeeper` (internal operator user id).
async function loadMatches(eventId) {
  const rows = await fetchAll(
    () =>
      supabase
        .from("matches")
        .select(
          `id, event_id, division_id, pool_id, venue_id, team_a, team_b,
           starting_team_id, abba_pattern, status, start_time, score_a, score_b,
           captains_confirmed, confirmed_at,
           division:divisions!matches_division_id_fkey(name),
           pool:pools!matches_pool_id_fkey(name),
           venue:venues!matches_venue_id_fkey(name, city),
           ta:teams!matches_team_a_fkey(name, short_name),
           tb:teams!matches_team_b_fkey(name, short_name),
           ts:teams!matches_starting_team_id_fkey(name)`,
        )
        .eq("event_id", eventId),
    "matches",
  );

  return rows
    .map((m) => ({
      id: m.id,
      event_id: m.event_id,
      division_id: m.division_id,
      division_name: name(m.division),
      pool_id: m.pool_id,
      pool_name: name(m.pool),
      venue_id: m.venue_id,
      venue_name: name(m.venue),
      venue_city: m.venue?.city ?? null,
      team_a: m.team_a,
      team_a_name: name(m.ta),
      team_a_short_name: m.ta?.short_name ?? null,
      team_b: m.team_b,
      team_b_name: name(m.tb),
      team_b_short_name: m.tb?.short_name ?? null,
      starting_team_id: m.starting_team_id,
      starting_team_name: name(m.ts),
      abba_pattern: m.abba_pattern,
      status: m.status,
      start_time: m.start_time,
      score_a: m.score_a,
      score_b: m.score_b,
      captains_confirmed: m.captains_confirmed,
      confirmed_at: m.confirmed_at,
    }))
    // created_at is no longer selected, so id is the tiebreaker for matches
    // sharing a start_time — arbitrary but stable across runs.
    .sort(
      byTimeThen(
        (r) => r.start_time,
        (a, b) => String(a.id).localeCompare(String(b.id)),
      ),
    );
}

// --- 9. Match logs -------------------------------------------------------
// ORDERING IS LOAD-BEARING: match_logs has no point-number or score-snapshot
// column. Point numbers and the running score are derived by replaying rows in
// created_at order (see matchLogDerivation.js). No running score is computed
// here — keeping the derivation in one place is what stops this export and the
// scorekeeper console from disagreeing.
async function loadMatchLogs(matches) {
  const matchIds = matches.map((m) => m.id);
  const rows = await fetchAllIn(
    () =>
      supabase
        .from("match_logs")
        .select(
          `id, match_id, event_type_id, team_id, actor_id, secondary_actor_id,
           abba_line, created_at,
           event:match_events!match_logs_event_type_id_fkey(code),
           team:teams!match_logs_team_id_fkey(name),
           actor:player!match_logs_actor_id_fkey(name, jersey_number),
           secondary_actor:player!match_logs_secondary_actor_id_fkey(name, jersey_number)`,
        ),
    "match_id",
    matchIds,
    "match logs",
  );

  const match = new Map(matches.map((m) => [m.id, m]));
  return rows
    .map((r) => {
      const m = match.get(r.match_id);
      return {
        id: r.id,
        match_id: r.match_id,
        match_start_time: m?.start_time ?? null,
        team_a_name: m?.team_a_name ?? null,
        team_b_name: m?.team_b_name ?? null,
        event_type_id: r.event_type_id,
        event_code: r.event?.code ?? null,
        team_id: r.team_id,
        team_name: name(r.team),
        actor_id: r.actor_id,
        actor_name: name(r.actor),
        actor_jersey_number: r.actor?.jersey_number ?? null,
        secondary_actor_id: r.secondary_actor_id,
        secondary_actor_name: name(r.secondary_actor),
        secondary_actor_jersey_number: r.secondary_actor?.jersey_number ?? null,
        abba_line: r.abba_line,
        created_at: r.created_at,
      };
    })
    .sort(
      byTimeThen(
        (r) => r.match_start_time,
        (a, b) => String(a.match_id).localeCompare(String(b.match_id)),
        (a, b) => new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0),
      ),
    );
}

// --- 10. Match event types (static catalog) ------------------------------
async function loadMatchEventTypes() {
  const { data, error } = await supabase
    .from("match_events")
    .select("id, code")
    .order("id", { ascending: true });
  if (error) throw fromSupabaseError(error, "Failed to load match event types");
  return data ?? [];
}

// --- 12. Spirit scores ---------------------------------------------------
// Excludes `submitted_by` (user id).
async function loadSpiritScores(matches) {
  const matchIds = matches.map((m) => m.id);
  const rows = await fetchAllIn(
    () =>
      supabase
        .from("spirit_scores")
        .select(
          `id, match_id, rated_team_id, rules_knowledge, fouls_contact,
           positive_attitude, communication, self_control, total, comments,
           is_final, submitted_at,
           rated:teams!spirit_scores_rated_team_id_fkey(name)`,
        ),
    "match_id",
    matchIds,
    "spirit scores",
  );

  const match = new Map(matches.map((m) => [m.id, m]));
  return rows
    .map((r) => {
      const m = match.get(r.match_id);
      return {
        id: r.id,
        match_id: r.match_id,
        match_start_time: m?.start_time ?? null,
        team_a_name: m?.team_a_name ?? null,
        team_b_name: m?.team_b_name ?? null,
        rated_team_id: r.rated_team_id,
        rated_team_name: name(r.rated),
        rules_knowledge: r.rules_knowledge,
        fouls_contact: r.fouls_contact,
        positive_attitude: r.positive_attitude,
        communication: r.communication,
        self_control: r.self_control,
        total: r.total,
        comments: r.comments,
        is_final: r.is_final,
        submitted_at: r.submitted_at,
      };
    })
    .sort(
      byTimeThen(
        (r) => r.match_start_time,
        (a, b) => String(a.match_id).localeCompare(String(b.match_id)),
        (a, b) => String(a.rated_team_name ?? "").localeCompare(String(b.rated_team_name ?? "")),
      ),
    );
}

// --- 13. Team roster -----------------------------------------------------
async function loadTeamRoster(eventId) {
  const rows = await fetchAll(
    () =>
      supabase
        .from("team_roster")
        .select(
          `id, event_id, team_id, player_id, is_captain, is_spirit_captain,
           team:teams!team_roster_team_id_fkey(name, short_name),
           player:player!team_roster_player_id_fkey(name, jersey_number, gender_code)`,
        )
        .eq("event_id", eventId),
    "team roster",
  );

  return rows
    .map((r) => ({
      id: r.id,
      event_id: r.event_id,
      team_id: r.team_id,
      team_name: name(r.team),
      team_short_name: r.team?.short_name ?? null,
      player_id: r.player_id,
      player_name: name(r.player),
      jersey_number: r.player?.jersey_number ?? null,
      player_gender_code: r.player?.gender_code ?? null,
      is_captain: r.is_captain,
      is_spirit_captain: r.is_spirit_captain,
    }))
    .sort(
      (a, b) =>
        String(a.team_name ?? "").localeCompare(String(b.team_name ?? "")) ||
        (a.jersey_number ?? Number.POSITIVE_INFINITY) -
          (b.jersey_number ?? Number.POSITIVE_INFINITY) ||
        String(a.player_name ?? "").localeCompare(String(b.player_name ?? "")),
    );
}

// --- 14. Players ---------------------------------------------------------
// Excludes birthday (PII), the generated `search` tsvector, and `description`
// (free text with no documented purpose — may hold internal/scouting notes
// rather than a public bio).
async function loadPlayers(roster, genders) {
  const ids = uniq(roster.map((r) => r.player_id));
  const rows = await fetchAllIn(
    () => supabase.from("player").select("id, name, jersey_number, gender_code"),
    "id",
    ids,
    "players",
  );
  const label = new Map((genders ?? []).map((g) => [g.code, g.label]));
  return rows
    .map((p) => ({
      id: p.id,
      name: p.name,
      jersey_number: p.jersey_number,
      gender_code: p.gender_code,
      gender_label: p.gender_code ? label.get(p.gender_code) ?? null : null,
    }))
    .sort(byName);
}

// --- 15. Player match stats ----------------------------------------------
async function loadPlayerMatchStats(matches) {
  const matchIds = matches.map((m) => m.id);
  const rows = await fetchAllIn(
    () =>
      supabase
        .from("player_match_stats")
        .select(
          `match_id, player_id, team_id, goals, assists, blocks, turnovers,
           player:player!player_match_stats_player_id_fkey(name, jersey_number),
           team:teams!player_match_stats_team_id_fkey(name)`,
        ),
    "match_id",
    matchIds,
    "player match stats",
  );

  const match = new Map(matches.map((m) => [m.id, m]));
  return rows
    .map((r) => {
      const m = match.get(r.match_id);
      return {
        match_id: r.match_id,
        match_start_time: m?.start_time ?? null,
        team_a_name: m?.team_a_name ?? null,
        team_b_name: m?.team_b_name ?? null,
        player_id: r.player_id,
        player_name: name(r.player),
        jersey_number: r.player?.jersey_number ?? null,
        team_id: r.team_id,
        team_name: name(r.team),
        goals: r.goals,
        assists: r.assists,
        blocks: r.blocks,
        turnovers: r.turnovers,
      };
    })
    .sort(
      byTimeThen(
        (r) => r.match_start_time,
        (a, b) => String(a.team_name ?? "").localeCompare(String(b.team_name ?? "")),
        (a, b) => String(a.player_name ?? "").localeCompare(String(b.player_name ?? "")),
      ),
    );
}

// --- 16. Player career stats ---------------------------------------------
// NOT event-scoped: filtered to this event's players, but the totals span
// every event they have played. Columns are prefixed career_ to make that
// hard to misread downstream.
async function loadPlayerStatistics(players) {
  const ids = players.map((p) => p.id);
  const rows = await fetchAllIn(
    () =>
      supabase
        .from("player_statistics")
        .select(
          "player_id, matches, goals, assists, blocks, turnovers, player:player!players_statistics_player_id_fkey(name)",
        ),
    "player_id",
    ids,
    "player statistics",
  );
  return rows
    .map((r) => ({
      player_id: r.player_id,
      player_name: name(r.player),
      career_matches: r.matches,
      career_goals: r.goals,
      career_assists: r.assists,
      career_blocks: r.blocks,
      career_turnovers: r.turnovers,
    }))
    .sort((a, b) => String(a.player_name ?? "").localeCompare(String(b.player_name ?? "")));
}

// --- 17. Brackets --------------------------------------------------------
async function loadBrackets(eventId) {
  const rows = await fetchAll(
    () =>
      supabase
        .from("brackets")
        .select("id, event_id, name, type, is_locked")
        .eq("event_id", eventId),
    "brackets",
  );
  return rows.sort(byName);
}

// --- 18. Bracket nodes ---------------------------------------------------
async function loadBracketNodes(brackets, matches) {
  const ids = brackets.map((b) => b.id);
  const rows = await fetchAllIn(
    () =>
      supabase
        .from("bracket_nodes")
        .select(
          `id, bracket_id, name, round, position, match_id, source_a, source_b,
           advance_to_winner, advance_to_winner_side, advance_to_loser, advance_to_loser_side`,
        ),
    "bracket_id",
    ids,
    "bracket nodes",
  );

  const bracket = new Map(brackets.map((b) => [b.id, b]));
  const match = new Map(matches.map((m) => [m.id, m]));
  return rows
    .map((n) => {
      const b = bracket.get(n.bracket_id);
      const m = n.match_id ? match.get(n.match_id) : null;
      return {
        id: n.id,
        bracket_id: n.bracket_id,
        bracket_name: b?.name ?? null,
        bracket_type: b?.type ?? null,
        node_name: n.name,
        round: n.round,
        position: n.position,
        match_id: n.match_id,
        match_start_time: m?.start_time ?? null,
        match_status: m?.status ?? null,
        team_a_name: m?.team_a_name ?? null,
        team_b_name: m?.team_b_name ?? null,
        score_a: m?.score_a ?? null,
        score_b: m?.score_b ?? null,
        source_a: n.source_a,
        source_b: n.source_b,
        advance_to_winner: n.advance_to_winner,
        advance_to_winner_side: n.advance_to_winner_side,
        advance_to_loser: n.advance_to_loser,
        advance_to_loser_side: n.advance_to_loser_side,
      };
    })
    .sort(
      (a, b) =>
        String(a.bracket_name ?? "").localeCompare(String(b.bracket_name ?? "")) ||
        (a.round ?? 0) - (b.round ?? 0) ||
        (a.position ?? 0) - (b.position ?? 0),
    );
}

// --- 19. Lookup tables ---------------------------------------------------
async function loadLookup(table, columns, orderColumn) {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .order(orderColumn, { ascending: true });
  if (error) throw fromSupabaseError(error, `Failed to load ${table}`);
  return data ?? [];
}

// ============================================================================
// ORCHESTRATION
// ============================================================================

/**
 * Runs every section for one event and returns { [fileKey]: rows[] }.
 *
 * Sections are fetched in dependency order because the bottom-to-top half of
 * the extraction needs the ids collected by the top-down half: matches supply
 * the team/venue/match id sets, the roster supplies the player id set.
 *
 * @param {string} eventId
 * @param {(done: number, total: number, label: string) => void} [onProgress]
 */
export async function buildSeasonReport(eventId, onProgress) {
  if (!eventId) throw new Error("Select an event first.");

  const total = SEASON_REPORT_FILES.length;
  let done = 0;
  const step = (label) => {
    done += 1;
    onProgress?.(done, total, label);
  };

  const result = {};

  // --- top-down: event -> divisions -> pools -> matches -------------------
  result.event = await loadEvent(eventId);
  step("Event");

  const divisions = await loadDivisions(eventId);
  result.divisions = divisions;
  step("Divisions");

  const pools = await loadPools(divisions);
  result.pools = pools;
  step("Pools");

  const divisionTeams = await loadDivisionTeams(divisions);
  result.division_teams = divisionTeams;
  step("Division teams");

  result.pool_teams = await loadPoolTeams(pools);
  step("Pool teams");

  const matches = await loadMatches(eventId);
  step("Matches");

  // --- bottom-up: resolve the FKs the rows above reference ---------------
  result.teams = await loadTeams(divisionTeams, matches);
  step("Teams");

  result.venues = await loadVenues(eventId, matches);
  step("Venues");

  result.matches = matches;

  result.match_logs = await loadMatchLogs(matches);
  step("Match logs");

  result.match_events = await loadMatchEventTypes();
  step("Match event types");

  result.spirit_scores = await loadSpiritScores(matches);
  step("Spirit scores");

  const roster = await loadTeamRoster(eventId);
  result.team_roster = roster;
  step("Team rosters");

  const genders = await loadLookup("genders", "code, label", "code");
  const players = await loadPlayers(roster, genders);
  result.player = players;
  step("Players");

  result.player_match_stats = await loadPlayerMatchStats(matches);
  step("Player match stats");

  result.player_statistics = await loadPlayerStatistics(players);
  step("Player career stats");

  const brackets = await loadBrackets(eventId);
  result.brackets = brackets;
  step("Brackets");

  result.bracket_nodes = await loadBracketNodes(brackets, matches);
  step("Bracket nodes");

  result.lookup_match_status = await loadLookup("match_status", "code", "code");
  step("Lookup: match status");

  result.lookup_genders = genders;
  step("Lookup: genders");

  result.lookup_abba_line = await loadLookup("abba_line", "line", "line");
  step("Lookup: ABBA line");

  return result;
}

// ============================================================================
// CSV
// ============================================================================

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  // Objects (jsonb columns: rules, attributes, media_link, source_a/b, data)
  // are serialised rather than stringified to "[object Object]".
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Serialises rows to CSV. Column order follows the union of keys in row order,
 * so the first row establishes the layout and any later row with an extra key
 * appends it rather than losing it.
 */
export function rowsToCsv(rows, fallbackHeaders = []) {
  const list = Array.isArray(rows) ? rows : [];
  const headers = [];
  const seen = new Set();
  for (const row of list) {
    for (const key of Object.keys(row ?? {})) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  if (!headers.length) {
    // An empty section still gets a header line where we know the shape, so
    // the downloaded file is valid rather than zero bytes.
    if (!fallbackHeaders.length) return "";
    headers.push(...fallbackHeaders);
  }
  const lines = [headers.join(",")];
  for (const row of list) {
    lines.push(headers.map((h) => escapeCsv(row?.[h])).join(","));
  }
  return lines.join("\n");
}

/** Triggers a browser download of one CSV file. */
export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Prefixes the configured filename with a filesystem-safe event name, so files
 * from different events don't overwrite each other in the downloads folder.
 */
export function seasonReportFilename(file, eventName) {
  const safe = String(eventName ?? "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return safe ? `${safe}_${file}` : file;
}
