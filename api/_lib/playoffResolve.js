/**
 * Playoff bracket resolution — the shared core.
 *
 * This is the single implementation of "work out which teams belong in each
 * playoff match and write them onto the match rows". It runs server-side, both
 * for the scheduled sweeper and for the admin page's manual button (which now
 * POSTs to /api/playoff-resolve rather than resolving in the browser).
 *
 * It lives in api/_lib rather than src/services because Vercel serverless
 * functions must not import from the Vite client bundle — the same constraint
 * documented in stbRl26RosterSync.js. `standings.js` beside it is a verbatim
 * copy of src/utils/standings.js for the same reason.
 *
 * Differences from the original client-side resolver in
 * src/services/playoffStructureService.js, all deliberate:
 *
 *  - Resolves to a FIXED POINT rather than in one pass, so a QF -> SF -> Final
 *    chain fills in one run instead of needing the button pressed per round.
 *  - Seeds from the full WFDF tie-break ladder (standings.js) instead of the
 *    old wins -> losses -> +/- -> alphabetical comparator.
 *  - Counts matches with no pool_id toward a group when both teams belong to
 *    it, so crossover fixtures are no longer invisible to seeding.
 *  - Honours brackets.is_locked, which was previously read only for display.
 *  - Honours playoff_resolve_schedules, which hold named groups of nodes back
 *    until their release time.
 *  - Records why a node could not resolve on the node itself, so the admin page
 *    can show it instead of the operator guessing.
 */

import { buildPoolGroupStandings, rankByWfdf } from "./standings.js";
import { computeSwissState, findSwissGame, findSwissRound, isSwissByeNode } from "./swissDraw.js";

// Canceled matches still carry a recorded score line (e.g. a forfeit recorded
// under the old convention), so they resolve a winner/loser for advancement
// just like a played match does.
//
// This is the UNION of the two sets that had drifted apart: the service copy
// omitted "final" while the page copy included it, so the same match could be
// finished enough to seed a pool but not finished enough to advance a winner.
// src/services/playoffStructureService.js re-exports this list.
export const FINISHED_MATCH_STATUSES = new Set([
  "finished",
  "completed",
  "final",
  "canceled",
  "cancelled",
  "forfeit",
  "forfeit_teama",
  "forfeit_teamb",
]);

// Mirrors CLOSED_STATUSES in src/constants/statusCodes.js and the copy in
// stbRl26RosterSync.js. Events in these states are never swept.
export const CLOSED_EVENT_STATUSES = new Set([
  "completed",
  "finished",
  "canceled",
  "forfeit",
]);

export const PLAYOFF_RESOLVE_JOB_KEY = "playoff_resolve_sweeper";

function normalizeText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isFinishedStatus(status) {
  return FINISHED_MATCH_STATUSES.has(normalizeText(status));
}

function formatNodeFallbackLabel(node) {
  return `Round ${node?.round ?? "--"} / Position ${node?.position ?? "--"}`;
}

function getNodeDisplayName(node) {
  const explicitName = typeof node?.name === "string" ? node.name.trim() : "";
  return explicitName || formatNodeFallbackLabel(node);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const MATCH_SELECT = `
  id, event_id, division_id, pool_id, venue_id, status, start_time,
  score_a, score_b,
  team_a:teams!matches_team_a_fkey (id, name, short_name),
  team_b:teams!matches_team_b_fkey (id, name, short_name)
`;

const EVENT_HIERARCHY_SELECT = `
  id,
  name,
  status:Status,
  auto_resolve_playoffs,
  divisions:divisions (
    id,
    name,
    pools:pools (
      id,
      name,
      teams:pool_teams (
        seed,
        team:teams (id, name, short_name)
      )
    )
  )
`;

export async function loadEventHierarchy(supabase, eventId) {
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_HIERARCHY_SELECT)
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load event hierarchy.");
  }

  return data || null;
}

export async function loadEventMatches(supabase, eventId) {
  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .eq("event_id", eventId);

  if (error) {
    throw new Error(error.message || "Failed to load matches.");
  }

  return Array.isArray(data) ? data : [];
}

/**
 * Brackets + nodes for an event, with each node's linked match hydrated.
 * Port of getBracketsByEvent from the client service.
 */
// brackets.settings arrives with the Swiss variants migration. Until it has
// run, selecting it fails the whole query, so fall back to the old column list
// (every Swiss draw then reads as the default settings).
const BRACKET_COLUMNS = "id, event_id, name, type, is_locked, created_at";

function isMissingColumnError(error, column) {
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return error?.code === "42703" || (text.includes(column) && text.includes("column"));
}

async function selectBracketRows(supabase, eventId) {
  const query = (columns) =>
    supabase
      .from("brackets")
      .select(columns)
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

  const withSettings = await query(`${BRACKET_COLUMNS}, settings`);
  if (withSettings.error && isMissingColumnError(withSettings.error, "settings")) {
    return query(BRACKET_COLUMNS);
  }
  return withSettings;
}

export async function loadBrackets(supabase, eventId, matches = null) {
  const { data: bracketRows, error: bracketError } = await selectBracketRows(supabase, eventId);

  if (bracketError) {
    throw new Error(bracketError.message || "Failed to load brackets.");
  }

  const brackets = Array.isArray(bracketRows) ? bracketRows : [];
  if (!brackets.length) {
    return [];
  }

  const { data: nodeRows, error: nodeError } = await supabase
    .from("bracket_nodes")
    .select("*")
    .in(
      "bracket_id",
      brackets.map((bracket) => bracket.id).filter(Boolean),
    );

  if (nodeError) {
    throw new Error(nodeError.message || "Failed to load bracket nodes.");
  }

  const nodes = Array.isArray(nodeRows) ? nodeRows : [];
  const matchLookup = new Map((matches || []).map((match) => [match.id, match]));

  return brackets.map((bracket) => ({
    ...bracket,
    nodes: nodes
      .filter((node) => node.bracket_id === bracket.id)
      .sort(
        (left, right) =>
          (left.round ?? Number.MAX_SAFE_INTEGER) - (right.round ?? Number.MAX_SAFE_INTEGER) ||
          (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER),
      )
      .map((node) => ({
        ...node,
        match: node.match_id ? matchLookup.get(node.match_id) || null : null,
      })),
  }));
}

// ---------------------------------------------------------------------------
// Standings index
// ---------------------------------------------------------------------------

/**
 * How many of a group's matches are still outstanding, and which.
 * Used to turn a bare "source matches not complete" into something actionable.
 */
function summariseOutstanding(matches) {
  const outstanding = (matches || []).filter((match) => !isFinishedStatus(match?.status));
  return {
    total: Array.isArray(matches) ? matches.length : 0,
    outstanding: outstanding.length,
  };
}

/**
 * Rank a group with the shared WFDF ladder, returning rows in seed order.
 *
 * `buildPoolGroupStandings` selects matches by pool_id, which misses crossover
 * fixtures recorded with pool_id = null. We therefore pass the already-selected
 * match list through a synthetic single pool carrying every team in the group,
 * and use the "team_date_range" mode with an open range so selection is purely
 * "both teams are in this group" — which is exactly what we want for a set of
 * matches we have already filtered ourselves.
 */
function rankGroup(pools, matches) {
  const rows = buildPoolGroupStandings(pools, matches, {
    matchMode: "team_date_range",
    getMatchDateKey: () => "0000-00-00",
    matchStartDateKey: null,
    matchEndDateKey: null,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    shortName: row.shortName || "",
    wins: row.wins,
    losses: row.losses,
    played: row.played,
    scoreDiff: row.scoreDiff,
  }));
}

/**
 * Build the pool/division lookup the source resolver reads ranks out of.
 *
 * Two changes from the client version this replaces:
 *  - matches with pool_id = null are no longer dropped; they are attributed to
 *    any group in which BOTH teams are members (crossovers, playoff-adjacent
 *    fixtures recorded without a pool).
 *  - ranking uses the WFDF ladder, not wins -> losses -> +/- -> name.
 */
export function buildStandingsIndex(eventData, matches, brackets) {
  const bracketMatchIds = new Set(
    (brackets || [])
      .flatMap((bracket) => bracket?.nodes || [])
      .map((node) => node?.match_id)
      .filter(Boolean),
  );

  // Playoff matches must never feed pool standings, or the bracket would seed
  // off its own results.
  const poolPlayMatches = (matches || []).filter((match) => !bracketMatchIds.has(match.id));

  const byPoolId = new Map();
  const unpooled = [];
  poolPlayMatches.forEach((match) => {
    if (match?.pool_id) {
      const bucket = byPoolId.get(match.pool_id) || [];
      bucket.push(match);
      byPoolId.set(match.pool_id, bucket);
      return;
    }
    unpooled.push(match);
  });

  const teamIdsOf = (pools) => {
    const ids = new Set();
    (pools || []).forEach((pool) => {
      (pool?.teams || []).forEach((entry) => {
        if (entry?.team?.id) ids.add(entry.team.id);
      });
    });
    return ids;
  };

  // A null-pool match counts for a group when both its teams are in it.
  const crossoversFor = (pools) => {
    const ids = teamIdsOf(pools);
    if (!ids.size) return [];
    return unpooled.filter(
      (match) => ids.has(match?.team_a?.id) && ids.has(match?.team_b?.id),
    );
  };

  const standingsIndex = {
    poolsById: {},
    poolsByName: {},
    poolsByScopedName: {},
    divisionsById: {},
    divisionsByName: {},
  };

  (eventData?.divisions || []).forEach((division) => {
    const divisionKey = normalizeText(division.name);
    const divisionPools = division?.pools || [];

    const divisionMatches = [
      ...divisionPools.flatMap((pool) => byPoolId.get(pool.id) || []),
      ...crossoversFor(divisionPools),
    ];
    const divisionSummary = summariseOutstanding(divisionMatches);
    const divisionEntry = {
      id: division.id || "",
      name: division.name || "Division",
      kind: "division",
      rows: rankGroup(divisionPools, divisionMatches),
      ready: divisionSummary.total > 0 && divisionSummary.outstanding === 0,
      matchCount: divisionSummary.total,
      outstandingCount: divisionSummary.outstanding,
    };

    standingsIndex.divisionsById[division.id] = divisionEntry;
    if (divisionKey && !standingsIndex.divisionsByName[divisionKey]) {
      standingsIndex.divisionsByName[divisionKey] = divisionEntry;
    }

    divisionPools.forEach((pool) => {
      const scopedPool = { ...pool, divisionId: division.id, divisionName: division.name };
      const poolMatches = [
        ...(byPoolId.get(pool.id) || []),
        ...crossoversFor([scopedPool]),
      ];
      const poolSummary = summariseOutstanding(poolMatches);
      const poolEntry = {
        id: pool.id || "",
        name: pool.name || "Pool",
        kind: "pool",
        divisionId: division.id || "",
        divisionName: division.name || "",
        rows: rankGroup([scopedPool], poolMatches),
        ready: poolSummary.total > 0 && poolSummary.outstanding === 0,
        matchCount: poolSummary.total,
        outstandingCount: poolSummary.outstanding,
      };

      standingsIndex.poolsById[pool.id] = poolEntry;

      const poolKey = normalizeText(pool.name);
      if (poolKey && !standingsIndex.poolsByName[poolKey]) {
        standingsIndex.poolsByName[poolKey] = poolEntry;
      }
      const scopedKey = divisionKey && poolKey ? `${divisionKey}::${poolKey}` : "";
      if (scopedKey && !standingsIndex.poolsByScopedName[scopedKey]) {
        standingsIndex.poolsByScopedName[scopedKey] = poolEntry;
      }
    });
  });

  return standingsIndex;
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

function resolvePoolRankSource(source, standingsIndex = {}) {
  const rankValue = Number(source?.rank ?? source?.seed);
  if (!Number.isInteger(rankValue) || rankValue < 1) {
    return { resolved: false, reason: "invalid rank" };
  }

  const poolId = source?.poolId || source?.pool_id || null;
  const divisionId = source?.divisionId || source?.division_id || null;
  const poolKey = normalizeText(source?.poolName || source?.poolLabel || "");
  const divisionKey = normalizeText(source?.divisionName || source?.divisionLabel || "");
  const scopedPoolKey = poolKey && divisionKey ? `${divisionKey}::${poolKey}` : "";

  const entry =
    [
      poolId ? standingsIndex?.poolsById?.[poolId] : null,
      scopedPoolKey ? standingsIndex?.poolsByScopedName?.[scopedPoolKey] : null,
      poolKey ? standingsIndex?.poolsByName?.[poolKey] : null,
      divisionId ? standingsIndex?.divisionsById?.[divisionId] : null,
      divisionKey ? standingsIndex?.divisionsByName?.[divisionKey] : null,
    ].filter(Boolean)[0] || null;

  if (!entry) {
    return { resolved: false, reason: "standings source not found" };
  }

  if (!entry.ready) {
    // Name the blocker. The old message was a bare "source matches not
    // complete", which gave the operator nothing to act on.
    const label = entry.name || (entry.kind === "division" ? "division" : "pool");
    if (!entry.matchCount) {
      return { resolved: false, reason: `${label} has no matches yet` };
    }
    return {
      resolved: false,
      reason: `${label} has ${entry.outstandingCount} of ${entry.matchCount} matches unfinished`,
    };
  }

  const team = (entry.rows || [])[rankValue - 1] || null;
  if (!team?.id) {
    return { resolved: false, reason: `rank ${rankValue} not available` };
  }

  return {
    resolved: true,
    teamId: team.id,
    teamName: team.name || team.shortName || `Rank ${rankValue}`,
  };
}

function resolveStaticTeamSource(source) {
  const teamId = source?.teamId || source?.team_id || null;
  if (!teamId) {
    return { resolved: false, reason: "static team source missing team id" };
  }
  return {
    resolved: true,
    teamId,
    teamName: source?.teamName || source?.teamLabel || "Team",
  };
}

function resolveMatchOutcomeSource(source, nodeLookup = new Map(), outcome = "winner") {
  const nodeId = source?.nodeId || source?.node_id || null;
  const matchId = source?.matchId || source?.match_id || null;
  let targetNode = null;

  if (nodeId) {
    targetNode = nodeLookup.get(nodeId) || null;
  } else if (matchId) {
    targetNode = Array.from(nodeLookup.values()).find((node) => node?.match_id === matchId) || null;
  }

  if (!targetNode) {
    return { resolved: false, reason: "source node not found" };
  }

  const match = targetNode.match || null;
  if (!match) {
    return { resolved: false, reason: `${getNodeDisplayName(targetNode)} has no linked match` };
  }

  if (!isFinishedStatus(match.status)) {
    return { resolved: false, reason: `${getNodeDisplayName(targetNode)} not finished` };
  }

  if (typeof match.score_a !== "number" || typeof match.score_b !== "number") {
    return { resolved: false, reason: "source match score missing" };
  }

  if (match.score_a === match.score_b) {
    return { resolved: false, reason: `${getNodeDisplayName(targetNode)} is tied` };
  }

  const winner = match.score_a > match.score_b ? match.team_a : match.team_b;
  const loser = match.score_a > match.score_b ? match.team_b : match.team_a;
  const team = outcome === "winner" ? winner : loser;

  if (!team?.id) {
    return { resolved: false, reason: "source match participants missing" };
  }

  return {
    resolved: true,
    teamId: team.id,
    teamName: team.name || team.short_name || "Team",
  };
}

// ---------------------------------------------------------------------------
// Swiss draw
// ---------------------------------------------------------------------------
//
// The pairing rules live in swissDraw.js (pure). This section adapts them to
// the resolver: one engine run per Swiss bracket per pass, shared by both sides
// of every game, the bye slot, and any bracket seeded from its standings.

// A Swiss game's pairing is final once the game has started. Without this, a
// score correction in an earlier round would re-pair the round and move teams
// off a match that is already being played.
const STARTED_MATCH_STATUSES = new Set([
  "initialized",
  "live",
  "halftime",
  ...FINISHED_MATCH_STATUSES,
]);

function isStartedStatus(status) {
  return STARTED_MATCH_STATUSES.has(normalizeText(status));
}

function isSwissSource(source) {
  return normalizeText(source?.type) === "swiss";
}

const CIRCULAR_SWISS_STATE = Object.freeze({
  rounds: [],
  rows: [],
  teamsById: new Map(),
  complete: false,
  reason: "Swiss draws seed from each other in a circle",
});

export function getSwissState(bracket, context = {}) {
  const cache = context.swissCache;
  if (cache?.has(bracket.id)) return cache.get(bracket.id);

  // A round 1 bye can be seeded from another Swiss draw's standings; guard
  // against two draws waiting on each other forever.
  const chain = context.swissChain || new Set();
  if (chain.has(bracket.id)) return CIRCULAR_SWISS_STATE;
  const innerContext = {
    ...context,
    node: null,
    fromBracketId: bracket.id,
    swissChain: new Set([...chain, bracket.id]),
  };

  const state = computeSwissState(bracket, {
    resolveTeamSource: (source) => resolveBracketSource(source, innerContext),
    isFinished: isFinishedStatus,
    isStarted: isStartedStatus,
  });
  cache?.set(bracket.id, state);
  return state;
}

/**
 * { type: "swiss", game, side } — the team the engine pairs into this game.
 * Game numbers order the round's pairings (1 = top); A is the higher ranked.
 */
function resolveSwissSource(source, context = {}) {
  const node = context.node || null;
  if (!node?.bracket) {
    return { resolved: false, reason: "Swiss source is not on a bracket game" };
  }
  const side = String(source?.side || "").trim().toUpperCase();
  if (side !== "A" && side !== "B") {
    return { resolved: false, reason: "Swiss source has no side" };
  }

  const state = getSwissState(node.bracket, context);
  const game = findSwissGame(state, node);
  if (!game) {
    return { resolved: false, reason: state.reason || `round ${node.round} is not paired yet` };
  }
  if (game.notNeeded) {
    return { resolved: false, notNeeded: true, reason: "not needed this round" };
  }

  const teamId = side === "A" ? game.teamAId : game.teamBId;
  if (!teamId) {
    return { resolved: false, reason: "Swiss pairing is missing a team" };
  }
  const round = findSwissRound(state, node.round);
  return {
    resolved: true,
    teamId,
    teamName: state.teamsById.get(teamId)?.name || "Team",
    warning: (round?.warnings || []).join(" | "),
  };
}

/**
 * { type: "swiss_rank", bracketId, rank } — the team finishing `rank` in a
 * Swiss draw. Fills only once that draw is complete, so a playoff never seeds
 * from a table that can still move.
 */
function resolveSwissRankSource(source, context = {}) {
  const bracketId = source?.bracketId || source?.bracket_id || null;
  const rank = Number(source?.rank);
  if (!bracketId) {
    return { resolved: false, reason: "Swiss standings source has no Swiss draw" };
  }
  if (!Number.isInteger(rank) || rank < 1) {
    return { resolved: false, reason: "invalid rank" };
  }
  if (context.node?.bracket?.id === bracketId || context.fromBracketId === bracketId) {
    return { resolved: false, reason: "a Swiss draw cannot seed from its own standings" };
  }

  const bracket = context.bracketsById?.get(bracketId) || null;
  if (!bracket) {
    return { resolved: false, reason: "Swiss draw not found" };
  }
  const label = bracket.name || "Swiss draw";
  if (normalizeText(bracket.type) !== "swiss") {
    return { resolved: false, reason: `${label} is not a Swiss draw` };
  }

  const state = getSwissState(bracket, context);
  if (!state.complete) {
    return { resolved: false, reason: `${label}: ${state.reason || "not finished"}` };
  }
  const row = state.rows[rank - 1];
  if (!row) {
    return { resolved: false, reason: `${label} has only ${state.rows.length} teams` };
  }
  return { resolved: true, teamId: row.id, teamName: row.name };
}

export function resolveBracketSource(source, context = {}) {
  if (!source || typeof source !== "object") {
    return { resolved: false, reason: "source missing" };
  }

  const type = String(source.type || "").trim().toLowerCase();
  if (type === "pool_rank") return resolvePoolRankSource(source, context.standingsIndex);
  if (type === "swiss") return resolveSwissSource(source, context);
  if (type === "swiss_rank") return resolveSwissRankSource(source, context);
  // Bye slots are filled by the Swiss engine, never resolved as a team source.
  if (type === "bye" || type === "swiss_bye") return { resolved: false, reason: "bye slot" };
  if (type === "static_team") return resolveStaticTeamSource(source);
  if (type === "winner" || type === "match_winner") {
    return resolveMatchOutcomeSource(source, context.nodeLookup, "winner");
  }
  if (type === "loser" || type === "match_loser") {
    return resolveMatchOutcomeSource(source, context.nodeLookup, "loser");
  }

  // An untyped source carrying a rank is the shape the event setup wizard used
  // to emit (see seedEventBracketsIfEmpty). Those rows are backfilled by
  // migration, but treat a straggler as a pool_rank rather than a hard failure.
  if (!type && (source.rank != null || source.seed != null)) {
    return resolvePoolRankSource(source, context.standingsIndex);
  }

  return { resolved: false, reason: `unsupported source type: ${type || "unknown"}` };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Load an event's release schedules.
 *
 * A schedule holds a named GROUP of nodes back until its time. Groups are
 * arbitrary: they need not be a whole round, and an event can have as many as
 * it wants (2-5 is typical, nothing assumes a count).
 */
export async function loadSchedules(supabase, eventId) {
  const { data, error } = await supabase
    .from("playoff_resolve_schedules")
    .select("id, event_id, bracket_id, label, resolve_at, node_ids, enabled")
    .eq("event_id", eventId)
    .order("resolve_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load playoff schedules.");
  }

  return Array.isArray(data) ? data : [];
}

/**
 * Index schedules by the node they govern.
 *
 * A node listed by several schedules takes the EARLIEST release time: once any
 * group it belongs to has opened, holding it back would be arbitrary.
 * A node no schedule mentions is unscheduled and resolves as soon as its
 * sources allow — deadlines only ever hold things back, they never gate
 * something nobody scheduled.
 */
export function buildScheduleIndex(schedules = []) {
  const byNodeId = new Map();

  schedules.forEach((schedule) => {
    if (schedule?.enabled === false) return;
    const at = schedule?.resolve_at ? new Date(schedule.resolve_at) : null;
    if (!at || Number.isNaN(at.getTime())) return;

    (schedule.node_ids || []).forEach((nodeId) => {
      if (!nodeId) return;
      const existing = byNodeId.get(nodeId);
      if (!existing || at.getTime() < existing.at.getTime()) {
        byNodeId.set(nodeId, { at, label: schedule.label || "", scheduleId: schedule.id });
      }
    });
  });

  return byNodeId;
}

/** Is this node due to be filled in yet? */
function getScheduleState(nodeId, scheduleIndex, now, ignoreSchedule) {
  if (ignoreSchedule) return { due: true };
  const entry = scheduleIndex.get(nodeId);
  if (!entry) return { due: true };
  if (entry.at.getTime() <= now.getTime()) return { due: true };
  return { due: false, at: entry.at, label: entry.label };
}

async function writeMatchParticipants(supabase, matchId, teamAId, teamBId) {
  const { data, error } = await supabase
    .from("matches")
    .update({ team_a: teamAId, team_b: teamBId })
    .eq("id", matchId)
    .select(MATCH_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to update match participants.");
  }

  return data || null;
}

/**
 * Persist why a node could not resolve (or clear it once it did).
 *
 * Best-effort: a bookkeeping failure must never fail the resolution that
 * already succeeded, the same way the advancement-pointer sync in the admin
 * page swallows its own errors.
 */
async function recordNodeOutcome(supabase, nodeId, errorMessage, attemptedAt) {
  try {
    await supabase
      .from("bracket_nodes")
      .update({
        last_resolve_error: errorMessage,
        last_resolve_attempt_at: attemptedAt,
      })
      .eq("id", nodeId);
  } catch {
    // Ignore — see above.
  }
}

/**
 * Persist a Swiss node's note ("Bye: X", "Not needed this round") and, for a
 * bye slot, the team it went to. The stored bye is what keeps a started round's
 * bye fixed if an earlier score is corrected later. Best-effort like
 * recordNodeOutcome; before the migration adding these columns runs, the write
 * fails quietly and the engine recomputes the bye each time.
 */
async function writeNodeNote(supabase, nodeId, patch) {
  try {
    await supabase.from("bracket_nodes").update(patch).eq("id", nodeId);
  } catch {
    // Ignore — see above.
  }
}

/**
 * Resolve every eligible node for one event, repeating until nothing more
 * changes.
 *
 * The fixed-point loop is what makes a QF -> SF -> Final chain fill in a single
 * run: pass 1 assigns the QFs, pass 2 sees those matches (re-read from the DB)
 * and can assign the SFs, and so on. Capped at nodeCount + 1 iterations so a
 * cyclic or self-referential bracket terminates rather than spinning.
 *
 * Note this only chains across rounds whose upstream matches are ALREADY
 * played. Assigning teams to a QF does not let its SF resolve in the same run,
 * because the QF has not been played yet — that is correct, not a limitation.
 */
export async function resolveEventPlayoffs(
  supabase,
  eventId,
  { ignoreSchedule = false, ignoreLock = false, now = new Date() } = {},
) {
  const eventData = await loadEventHierarchy(supabase, eventId);
  if (!eventData) {
    throw new Error(`Event ${eventId} not found.`);
  }

  let matches = await loadEventMatches(supabase, eventId);
  let brackets = await loadBrackets(supabase, eventId, matches);
  const scheduleIndex = buildScheduleIndex(await loadSchedules(supabase, eventId));

  const updates = [];
  const skipped = [];
  const touchedNodeIds = new Set();
  const noteWrites = new Map();

  const totalNodes = brackets.reduce((count, bracket) => count + (bracket.nodes?.length || 0), 0);
  if (!totalNodes) {
    return { eventId, eventName: eventData.name, updatedCount: 0, updates, skipped, passes: 0 };
  }

  const maxPasses = totalNodes + 1;
  let passes = 0;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    passes += 1;
    const standingsIndex = buildStandingsIndex(eventData, matches, brackets);
    const flatNodes = brackets.flatMap((bracket) =>
      (bracket.nodes || []).map((node) => ({ ...node, bracket })),
    );
    const nodeLookup = new Map(flatNodes.map((node) => [node.id, node]));
    const bracketsById = new Map(brackets.map((bracket) => [bracket.id, bracket]));
    // Each Swiss draw is worked out once per pass, so both sides of every game,
    // its bye slot and any bracket seeded from it read the same answer.
    const swissCache = new Map();

    // Only the final pass's skip reasons and notes are kept, so reset each time.
    skipped.length = 0;
    noteWrites.clear();
    let assignedThisPass = 0;

    for (const node of flatNodes) {
      const nodeName = getNodeDisplayName(node);
      const bracketName = node.bracket?.name || "Bracket";
      const record = (reason, extra = {}) => {
        skipped.push({ nodeId: node.id, nodeName, bracketName, reason, ...extra });
      };
      // Queue a note (and bye team) only when it differs from what is stored.
      const setNote = (note, byeTeamId) => {
        const patch = {};
        if ((node.resolve_note ?? null) !== note) patch.resolve_note = note;
        if (byeTeamId !== undefined && (node.bye_team_id ?? null) !== byeTeamId) {
          patch.bye_team_id = byeTeamId;
        }
        if (Object.keys(patch).length) noteWrites.set(node.id, patch);
      };
      const sourceContext = { standingsIndex, nodeLookup, bracketsById, node, swissCache };

      if (node.bracket?.is_locked && !ignoreLock) {
        record("bracket is locked");
        continue;
      }

      // --- Swiss bye slot: no match; the engine names the team.
      if (isSwissByeNode(node)) {
        const schedule = getScheduleState(node.id, scheduleIndex, now, ignoreSchedule);
        if (!schedule.due) {
          record(`scheduled for ${schedule.at.toISOString()}`, {
            pending: true,
            resolveAt: schedule.at.toISOString(),
            scheduleLabel: schedule.label || "",
          });
          continue;
        }
        const state = getSwissState(node.bracket, sourceContext);
        const round = findSwissRound(state, node.round);
        if (!round) {
          record(state.reason || "round not paired yet", { blocked: true });
          continue;
        }
        touchedNodeIds.add(node.id);
        if (!round.byeTeamId) {
          setNote("Not needed this round", null);
          record("no bye this round", { settled: true });
          continue;
        }
        const byeName = state.teamsById.get(round.byeTeamId)?.name || "Team";
        setNote(`Bye: ${byeName}`, round.byeTeamId);
        record(`bye: ${byeName}`, { settled: true });
        continue;
      }

      const usesSwiss = isSwissSource(node.source_a) || isSwissSource(node.source_b);
      const matchStarted = isStartedStatus(node.match?.status);
      const matchHasTeams = Boolean(node.match?.team_a?.id || node.match?.team_b?.id);

      // --- Swiss game the draw does not need this round (advance-or-out
      // shrinks the field). Clear stale teams from an unstarted match.
      if (usesSwiss) {
        const swissGame = findSwissGame(getSwissState(node.bracket, sourceContext), node);
        if (swissGame?.notNeeded) {
          touchedNodeIds.add(node.id);
          setNote("Not needed this round");
          if (node.match_id && matchHasTeams && !matchStarted) {
            await writeMatchParticipants(supabase, node.match_id, null, null);
            assignedThisPass += 1;
            updates.push({ nodeId: node.id, nodeName, bracketName, matchId: node.match_id, cleared: true });
          }
          record("not needed this round", { settled: true });
          continue;
        }
      }

      if (!node.match_id) {
        record("no match linked", { actionable: true });
        continue;
      }

      const schedule = getScheduleState(node.id, scheduleIndex, now, ignoreSchedule);
      if (!schedule.due) {
        const groupLabel = schedule.label ? `${schedule.label} ` : "";
        record(`${groupLabel}scheduled for ${schedule.at.toISOString()}`.trim(), {
          pending: true,
          resolveAt: schedule.at.toISOString(),
          scheduleLabel: schedule.label || "",
        });
        continue;
      }

      if (usesSwiss && matchStarted && matchHasTeams) {
        setNote(null);
        record("game already started; pairing kept", { settled: true });
        touchedNodeIds.add(node.id);
        continue;
      }

      const sourceA = resolveBracketSource(node.source_a, sourceContext);
      const sourceB = resolveBracketSource(node.source_b, sourceContext);

      if (!sourceA.resolved || !sourceB.resolved) {
        const reasons = [sourceA.reason, sourceB.reason].filter(Boolean);
        record(
          [...new Set(reasons)].join(" | ") || "unable to resolve bracket sources",
          { blocked: true },
        );
        continue;
      }

      if (sourceA.teamId === sourceB.teamId) {
        record("resolved teams are identical", { blocked: true });
        continue;
      }

      if (usesSwiss) setNote(null);

      if (node.match?.team_a?.id === sourceA.teamId && node.match?.team_b?.id === sourceB.teamId) {
        record("match already assigned", { settled: true });
        touchedNodeIds.add(node.id);
        continue;
      }

      const updatedMatch = await writeMatchParticipants(
        supabase,
        node.match_id,
        sourceA.teamId,
        sourceB.teamId,
      );

      assignedThisPass += 1;
      touchedNodeIds.add(node.id);
      updates.push({
        nodeId: node.id,
        nodeName,
        bracketName,
        matchId: node.match_id,
        teamAId: sourceA.teamId,
        teamAName: sourceA.teamName,
        teamBId: sourceB.teamId,
        teamBName: sourceB.teamName,
        warning: sourceA.warning || sourceB.warning || "",
      });

      // Keep the in-memory match list in step so the next pass sees this write
      // without another round-trip.
      if (updatedMatch) {
        matches = matches.map((match) => (match.id === updatedMatch.id ? updatedMatch : match));
      }
    }

    if (!assignedThisPass) break;

    // Re-hydrate nodes against the updated match list for the next pass.
    brackets = await loadBrackets(supabase, eventId, matches);
  }

  // Bookkeeping: stamp the blockers, clear anything that came good.
  const attemptedAt = now.toISOString();
  const blocked = skipped.filter((entry) => entry.blocked || entry.actionable);
  const blockedIds = new Set(blocked.map((entry) => entry.nodeId));
  await Promise.all([
    ...blocked.map((entry) => recordNodeOutcome(supabase, entry.nodeId, entry.reason, attemptedAt)),
    ...Array.from(touchedNodeIds)
      .filter((nodeId) => !blockedIds.has(nodeId))
      .map((nodeId) => recordNodeOutcome(supabase, nodeId, null, attemptedAt)),
    ...Array.from(noteWrites.entries()).map(([nodeId, patch]) => writeNodeNote(supabase, nodeId, patch)),
  ]);

  return {
    eventId,
    eventName: eventData.name,
    updatedCount: updates.length,
    updates,
    skipped,
    passes,
  };
}

/**
 * Standings and progress for every Swiss draw in an event, for the admin
 * page's standings table. Read-only; uses exactly the engine the resolver uses.
 */
export function summarizeSwissDraws(eventData, matches, brackets) {
  const swissBrackets = (brackets || []).filter((bracket) => normalizeText(bracket.type) === "swiss");
  if (!swissBrackets.length) return [];

  const flatNodes = brackets.flatMap((bracket) =>
    (bracket.nodes || []).map((node) => ({ ...node, bracket })),
  );
  const context = {
    standingsIndex: buildStandingsIndex(eventData, matches, brackets),
    nodeLookup: new Map(flatNodes.map((node) => [node.id, node])),
    bracketsById: new Map(brackets.map((bracket) => [bracket.id, bracket])),
    swissCache: new Map(),
  };

  return swissBrackets.map((bracket) => {
    const state = getSwissState(bracket, context);
    const totalRounds = new Set((bracket.nodes || []).map((node) => Number(node.round))).size;
    return {
      bracketId: bracket.id,
      name: bracket.name || "Swiss draw",
      settings: state.settings || null,
      complete: Boolean(state.complete),
      reason: state.reason || "",
      roundsPaired: (state.rounds || []).length,
      totalRounds,
      warnings: (state.rounds || []).flatMap((round) => round.warnings || []),
      rows: (state.rows || []).map((row) => ({
        id: row.id,
        name: row.name,
        rank: row.rank,
        wins: row.wins,
        losses: row.losses,
        byes: row.byes,
        played: row.played,
        diff: row.diff,
        pointsFor: row.pointsFor,
        pointsAgainst: row.pointsAgainst,
        sos: row.sos,
        status: row.status,
      })),
    };
  });
}

/**
 * Events the scheduled sweeper should consider: opted in, and not closed.
 */
export async function listAutoResolveEvents(supabase) {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, status:Status, auto_resolve_playoffs")
    .eq("auto_resolve_playoffs", true);

  if (error) {
    throw new Error(error.message || "Failed to load auto-resolve events.");
  }

  return (Array.isArray(data) ? data : []).filter(
    (event) => !CLOSED_EVENT_STATUSES.has(normalizeText(event?.status)),
  );
}

export { getNodeDisplayName, rankByWfdf };
