// Player de-duplication: fold several duplicate `public.player` rows into one
// surviving row, repointing every foreign key that referenced a duplicate.
//
// The schema (docs/SQL_structure.txt) references public.player from five places:
//
//   team_roster.player_id                              -> plain FK
//   match_logs.actor_id / .secondary_actor_id          -> plain FK, two columns
//   live_events.player_id / .secondary_player_id       -> plain FK, two columns
//   player_statistics.player_id                        -> PRIMARY KEY + UNIQUE
//   player_match_stats.(match_id, player_id)           -> composite PRIMARY KEY
//
// The last two are NOT repointed. They are derived tables, rebuilt from
// match_logs by trg_match_logs_player_stats (docs/Triggers.txt), so moving the
// log rows moves the stats. See the note above PLAYER_REFERENCE_TABLES.
//
// team_roster has no declared unique constraint in the schema dump, but a roster
// carrying the same human twice for one event+team is a data smell that the merge
// would create out of nothing, so duplicate-after-repoint rows are collapsed too.
//
// Every write reads back its affected rows with `.select()`. PostgREST answers a
// zero-row UPDATE/DELETE with 200 and an empty body — including when RLS filtered
// every candidate away — so without that check a merge that changed nothing
// reports complete success. Counts are verified against what the preview found.

import { supabase } from "./supabaseClient";
import { invalidateCachedQueries, invalidateCachedQuery } from "../utils/queryCache";

// `player_match_stats` and `player_statistics` are NOT merged by this module.
//
// docs/Triggers.txt:
//   CREATE TRIGGER trg_match_logs_player_stats
//   AFTER INSERT OR DELETE OR UPDATE ON public.match_logs
//   FOR EACH ROW EXECUTE FUNCTION handle_match_log_player_stats()
//
// Both stat tables are *derived* — that trigger rebuilds them from match_logs on
// every log row change. Repointing match_logs.actor_id therefore already moves
// the stats onto the keeper as a side effect. An earlier version of this file
// also hand-summed those tables, which fought the trigger: the manual totals
// were computed from rows the trigger had already recalculated, so the numbers
// came out doubled or stale depending on ordering. The trigger owns them; the
// merge only has to move the source rows and then clean up any stat row still
// keyed to a dead player.
//
// Every reference the merge rewrites directly. `kind` selects the strategy:
//   "repoint"  — plain UPDATE, no uniqueness to worry about
//   "roster"   — repoint, then collapse rows that became duplicates
export const PLAYER_REFERENCE_TABLES = [
  // match_logs first, and deliberately so. The stats trigger fires off these
  // rows, and several RLS policies on the stat tables authorise via a
  // team_roster row for the player — so the log has to move while the losers'
  // roster rows are still in place to satisfy those policies.
  {
    table: "match_logs",
    columns: ["actor_id", "secondary_actor_id"],
    kind: "repoint",
    label: "Match log entries",
  },
  {
    table: "live_events",
    columns: ["player_id", "secondary_player_id"],
    kind: "repoint",
    label: "Live event entries",
  },
  {
    table: "team_roster",
    columns: ["player_id"],
    kind: "roster",
    label: "Roster entries",
    // What makes two roster rows "the same" once they point at one player.
    identity: ["event_id", "team_id"],
  },
];

// Derived stat tables, rebuilt by trg_match_logs_player_stats. The merge never
// writes their counters — it only sweeps away rows still keyed to a player that
// is about to be deleted, which the trigger has no reason to clear on its own.
const DERIVED_STAT_TABLES = [
  { table: "player_match_stats", label: "Per-match statistics" },
  { table: "player_statistics", label: "Career statistics" },
];

/**
 * Wrap a PostgREST error without losing what identifies it.
 *
 * `code`, `details` and `hint` are the whole diagnosis for an operator: 42501 is
 * RLS refusing the write, 23503 is a foreign key still pointing at the row. An
 * earlier version flattened all of that to `error.message`, which for an RLS
 * refusal is the almost useless "new row violates row-level security policy".
 * Carry the fields through so describeError() and the console log can show them.
 */
function mergeError(error, context) {
  const wrapped = new Error(
    [context, error?.message, error?.details, error?.hint].filter(Boolean).join(" — "),
  );
  if (error?.code) wrapped.code = error.code;
  if (error?.details) wrapped.details = error.details;
  if (error?.hint) wrapped.hint = error.hint;
  wrapped.cause = error;
  wrapped.context = context;
  return wrapped;
}

function errorMessage(error, fallback) {
  if (!error) return fallback;
  return error.message || error.details || fallback;
}

// Every step the merge takes, in order, with what it touched. Kept on the module
// so a failed merge can be inspected from the browser console:
//   window.__playerMergeTrace
// This is the troubleshooting hook — without it a mid-merge failure gives you a
// single error string and no way to see which of ~10 writes actually landed.
let mergeTrace = [];

function trace(entry) {
  const line = { at: new Date().toISOString(), ...entry };
  mergeTrace.push(line);
  console.info("[player-merge]", line);
  if (typeof window !== "undefined") {
    window.__playerMergeTrace = mergeTrace;
  }
  return line;
}

export function getMergeTrace() {
  return mergeTrace;
}

/**
 * Search the player directory by name.
 *
 * Deliberately unfiltered by event: duplicates are most often created by two
 * different scorekeepers at two different events, so scoping the search to one
 * event would hide exactly the pairs this page exists to find.
 */
export async function searchPlayersByName(term, limit = 50) {
  const query = String(term || "").trim();
  if (!query) return [];

  const { data, error } = await supabase
    .from("player")
    .select("id, name, gender_code, jersey_number, birthday, description, created_at, updated_at")
    .ilike("name", `%${query}%`)
    .order("name", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(errorMessage(error, "Failed to search players."));
  }
  return data ?? [];
}

/**
 * Build the comparison profile for one player: identity fields plus the
 * reference counts and stat totals the operator needs to decide which row is
 * the canonical one.
 *
 * Counts use head+exact so no row payloads cross the wire for the big tables;
 * only player_match_stats is fetched in full, because its counters have to be
 * summed rather than counted.
 */
export async function getPlayerComparisonProfile(playerId) {
  const [playerResult, rosterResult, logsActorResult, logsAssistResult, statsResult, careerResult] =
    await Promise.all([
      supabase
        .from("player")
        .select("id, name, gender_code, jersey_number, birthday, description, created_at, updated_at")
        .eq("id", playerId)
        .maybeSingle(),
      supabase
        .from("team_roster")
        .select("event_id, team_id", { count: "exact" })
        .eq("player_id", playerId),
      supabase
        .from("match_logs")
        .select("id", { count: "exact", head: true })
        .eq("actor_id", playerId),
      supabase
        .from("match_logs")
        .select("id", { count: "exact", head: true })
        .eq("secondary_actor_id", playerId),
      supabase
        .from("player_match_stats")
        .select("match_id, goals, assists, blocks, turnovers")
        .eq("player_id", playerId),
      supabase
        .from("player_statistics")
        .select("matches, goals, assists, blocks, turnovers")
        .eq("player_id", playerId)
        .maybeSingle(),
    ]);

  if (playerResult.error) {
    throw new Error(errorMessage(playerResult.error, "Failed to load player."));
  }
  if (!playerResult.data) {
    throw new Error(`Player ${playerId} no longer exists.`);
  }

  const rosterRows = rosterResult.data ?? [];
  const statRows = statsResult.data ?? [];

  const totals = statRows.reduce(
    (acc, row) => ({
      goals: acc.goals + (row.goals ?? 0),
      assists: acc.assists + (row.assists ?? 0),
      blocks: acc.blocks + (row.blocks ?? 0),
      turnovers: acc.turnovers + (row.turnovers ?? 0),
    }),
    { goals: 0, assists: 0, blocks: 0, turnovers: 0 },
  );

  // A player can appear on several rosters within one event (rare, but a
  // symptom of the very duplication this page repairs), so count distinct.
  const eventIds = new Set(rosterRows.map((row) => row.event_id).filter(Boolean));

  return {
    player: playerResult.data,
    rosterCount: rosterResult.count ?? rosterRows.length,
    eventCount: eventIds.size,
    matchLogActorCount: logsActorResult.count ?? 0,
    matchLogAssistCount: logsAssistResult.count ?? 0,
    matchesWithStats: statRows.length,
    // player_match_stats is the same source the event stats table aggregates,
    // so these numbers match what the rest of the app shows.
    goals: totals.goals,
    assists: totals.assists,
    blocks: totals.blocks,
    turnovers: totals.turnovers,
    career: careerResult.data ?? null,
  };
}

async function countReferences(table, column, playerIds) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .in(column, playerIds);

  if (error) {
    // A table the operator's role cannot read is reported rather than assumed
    // empty — merging against an unknown count is exactly the silent data loss
    // this preview exists to prevent.
    return { count: null, error: errorMessage(error, `Could not count ${table}.${column}`) };
  }
  return { count: count ?? 0, error: null };
}

/**
 * Dry run. Counts every row the merge would rewrite, per table and column,
 * without writing anything.
 */
export async function buildMergePlan({ keeperId, duplicateIds }) {
  const losers = (duplicateIds || []).filter((id) => id && id !== keeperId);
  if (!keeperId) throw new Error("Choose the player to keep.");
  if (!losers.length) throw new Error("Choose at least one duplicate to merge in.");

  const entries = [];
  for (const ref of PLAYER_REFERENCE_TABLES) {
    for (const column of ref.columns) {
      // Sequential on purpose: a merge preview is not latency-critical, and
      // firing every count query at once competes with the page's own reads.
      const { count, error } = await countReferences(ref.table, column, losers);
      entries.push({
        table: ref.table,
        column,
        label: ref.label,
        kind: ref.kind,
        count,
        error,
      });
    }
  }
  for (const stat of DERIVED_STAT_TABLES) {
    const { count, error } = await countReferences(stat.table, "player_id", losers);
    entries.push({
      table: stat.table,
      column: "player_id",
      label: stat.label,
      kind: "derived",
      count,
      error,
    });
  }

  const blocked = entries.filter((entry) => entry.error);
  const total = entries.reduce((sum, entry) => sum + (entry.count ?? 0), 0);

  return {
    keeperId,
    duplicateIds: losers,
    entries,
    totalRows: total,
    blocked,
  };
}

/**
 * Preflight: can this account actually perform the writes the merge needs?
 *
 * The merge is ~10 writes across 6 tables with no transaction. Discovering on
 * write 7 that RLS blocks a table leaves a half-merged database, so every
 * permission is probed first using writes that change nothing observable: each
 * UPDATE sets a column to the value it already holds, filtered to rows the merge
 * would touch anyway. A no-op UPDATE is still an UPDATE as far as RLS is
 * concerned — USING and WITH CHECK run identically — so this is a faithful test.
 *
 * DELETE has no harmless form, so it is not probed; it is the one permission the
 * merge still has to discover the hard way.
 */
export async function preflightMergePermissions({ keeperId, duplicateIds }) {
  const losers = (duplicateIds || []).filter((id) => id && id !== keeperId);
  if (!keeperId || !losers.length) {
    throw new Error("Pick a player to keep and at least one duplicate first.");
  }

  const checks = [];
  const record = (table, operation, error) =>
    checks.push({
      table,
      operation,
      ok: !error,
      code: error?.code ?? null,
      message: error ? [error.message, error.details, error.hint].filter(Boolean).join(" — ") : null,
    });

  // Rewrite a loser's id to itself: same rows, same values, real RLS check.
  for (const [table, column] of [
    ["match_logs", "actor_id"],
    ["live_events", "player_id"],
    ["team_roster", "player_id"],
  ]) {
    const { error } = await supabase
      .from(table)
      .update({ [column]: losers[0] })
      .eq(column, losers[0])
      .select(column);
    record(table, `update ${column}`, error);
  }

  // A silently empty read is as fatal as a blocked write: the merge sizes its
  // writes from these counts, so a filtered-away read would make it a no-op.
  for (const [table, column] of [
    ["match_logs", "actor_id"],
    ["live_events", "player_id"],
    ["team_roster", "player_id"],
    ["player_match_stats", "player_id"],
    ["player_statistics", "player_id"],
    ["player", "id"],
  ]) {
    const { error } = await supabase
      .from(table)
      .select(column, { count: "exact", head: true })
      .in(column, losers);
    record(table, "read", error);
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const failures = checks.filter((check) => !check.ok);
  trace({ step: "preflight", userId: sessionData?.session?.user?.id ?? null, checks });

  return {
    userId: sessionData?.session?.user?.id ?? null,
    checks,
    failures,
    ok: failures.length === 0,
  };
}

/**
 * Plain repoint for tables with no uniqueness on the player column.
 *
 * `.select("id")` is not cosmetic. PostgREST returns 200 with an empty body for
 * an UPDATE that matched nothing — including when RLS silently filtered every
 * candidate row away. Without reading back the affected rows a merge that
 * changed nothing reports success, which is the whole "merge didn't work but
 * said it did" failure mode. Compare against the count we expected to move.
 */
async function repointColumn(table, column, keeperId, loserIds, expected) {
  const { data, error } = await supabase
    .from(table)
    .update({ [column]: keeperId })
    .in(column, loserIds)
    .select("id");

  if (error) {
    throw mergeError(error, `Failed to repoint ${table}.${column}`);
  }

  const affected = data?.length ?? 0;
  if (typeof expected === "number" && affected !== expected) {
    throw new Error(
      `${table}.${column}: expected to repoint ${expected} row(s) but the database reported ${affected}. ` +
        `This usually means row-level security is blocking the write. Nothing has been deleted — re-run once access is granted.`,
    );
  }
  return affected;
}

/**
 * Repoint roster rows, then collapse any that became duplicates of each other.
 *
 * The keeper's own rows are read first so a loser row for an event+team the
 * keeper already sits on is deleted rather than repointed into a clash. The
 * captain flags are OR-ed up: if either variant was recorded as captain, the
 * surviving row keeps that.
 */
async function mergeRosterRows(ref, keeperId, loserIds) {
  const selectCols = ["id", "player_id", ...ref.identity, "is_captain", "is_spirit_captain"].join(", ");

  const { data: allRows, error } = await supabase
    .from(ref.table)
    .select(selectCols)
    .in("player_id", [keeperId, ...loserIds]);

  if (error) {
    throw mergeError(error, `Failed to read ${ref.table}`);
  }

  const rows = allRows ?? [];
  const keyOf = (row) => ref.identity.map((col) => String(row[col] ?? "")).join("|");

  const keeperByKey = new Map();
  rows
    .filter((row) => row.player_id === keeperId)
    .forEach((row) => {
      if (!keeperByKey.has(keyOf(row))) keeperByKey.set(keyOf(row), row);
    });

  const toDelete = [];
  const toRepoint = [];
  const captainUpgrades = [];

  for (const row of rows) {
    if (row.player_id === keeperId) continue;
    const key = keyOf(row);
    const existing = keeperByKey.get(key);

    if (existing) {
      // Keeper already covers this event+team. Fold the flags in, drop the row.
      const nextCaptain = Boolean(existing.is_captain || row.is_captain);
      const nextSpirit = Boolean(existing.is_spirit_captain || row.is_spirit_captain);
      if (nextCaptain !== Boolean(existing.is_captain) || nextSpirit !== Boolean(existing.is_spirit_captain)) {
        captainUpgrades.push({ id: existing.id, is_captain: nextCaptain, is_spirit_captain: nextSpirit });
        existing.is_captain = nextCaptain;
        existing.is_spirit_captain = nextSpirit;
      }
      toDelete.push(row.id);
    } else {
      toRepoint.push(row.id);
      // Claim the slot so a second loser with the same event+team collapses
      // into this row instead of creating a fresh clash.
      keeperByKey.set(key, { ...row, player_id: keeperId });
    }
  }

  for (const upgrade of captainUpgrades) {
    const { error: flagError } = await supabase
      .from(ref.table)
      .update({ is_captain: upgrade.is_captain, is_spirit_captain: upgrade.is_spirit_captain })
      .eq("id", upgrade.id);
    if (flagError) {
      throw mergeError(flagError, `Failed to update captain flags on ${ref.table}`);
    }
  }

  if (toRepoint.length) {
    const { data: repointed, error: repointError } = await supabase
      .from(ref.table)
      .update({ player_id: keeperId })
      .in("id", toRepoint)
      .select("id");
    if (repointError) {
      throw mergeError(repointError, `Failed to repoint ${ref.table}`);
    }
    if ((repointed?.length ?? 0) !== toRepoint.length) {
      throw new Error(
        `${ref.table}: expected to repoint ${toRepoint.length} row(s) but the database reported ` +
          `${repointed?.length ?? 0}. Row-level security is most likely blocking the write.`,
      );
    }
  }

  // Collapse only after the repoint succeeded, so a blocked update never costs
  // us the rows it was supposed to replace.
  if (toDelete.length) {
    const { data: deleted, error: deleteError } = await supabase
      .from(ref.table)
      .delete()
      .in("id", toDelete)
      .select("id");
    if (deleteError) {
      throw mergeError(deleteError, `Failed to collapse duplicate ${ref.table} rows`);
    }
    if ((deleted?.length ?? 0) !== toDelete.length) {
      throw new Error(
        `${ref.table}: expected to remove ${toDelete.length} duplicate row(s) but the database ` +
          `reported ${deleted?.length ?? 0}. Row-level security is most likely blocking the delete.`,
      );
    }
  }

  return { repointed: toRepoint.length, collapsed: toDelete.length };
}

/**
 * Clear derived stat rows that are still keyed to a player about to be deleted.
 *
 * These tables are rebuilt by trg_match_logs_player_stats, so by the time this
 * runs the keeper's numbers are already correct — repointing match_logs made the
 * trigger recompute them. What the trigger does not do is remove a stat row for
 * a player whose log rows have all moved away; that row lingers, and the FK to
 * public.player would then block the final delete. So this only deletes, never
 * sums: the numbers are the trigger's business.
 */
async function sweepDerivedStats(table, loserIds) {
  const { data, error } = await supabase
    .from(table)
    .delete()
    .in('player_id', loserIds)
    .select('player_id');

  if (error) {
    throw mergeError(error, `Failed to clear ${table} rows for the merged players`);
  }
  return { deleted: data?.length ?? 0 };
}

/**
 * Write the merge to audit_log. Never fails the merge itself — the data change
 * has already landed and RLS may legitimately block the insert.
 */
async function logMerge({ keeperId, keeperSnapshot, loserSnapshots, steps, reason }) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const actorId = sessionData?.session?.user?.id ?? null;

    const { error } = await supabase.from("audit_log").insert({
      table_name: "player",
      record_id: keeperId,
      // The CHECK constraint allows only INSERT / UPDATE / DELETE.
      action: "DELETE",
      actor_id: actorId,
      change_data: {
        source: "player_merge",
        reason: reason || null,
        keptPlayerId: keeperId,
        keptPlayer: keeperSnapshot ?? null,
        // The full pre-merge state of every deleted player, so the merge is
        // reconstructible from the audit row alone.
        mergedPlayers: loserSnapshots ?? [],
        steps,
      },
    });

    if (error) return error.message || "Audit entry could not be written.";
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Audit entry could not be written.";
  }
}

/**
 * Execute the merge.
 *
 * Order matters. Every reference is repointed before the duplicate player rows
 * are deleted, so a failure part-way through leaves the duplicates still present
 * and still valid FK targets rather than a set of orphaned references. There is
 * no transaction available through PostgREST, so this ordering is the safety
 * net: the merge is re-runnable after a partial failure.
 */
export async function mergePlayers({ keeperId, duplicateIds, reason, snapshots }) {
  const losers = (duplicateIds || []).filter((id) => id && id !== keeperId);
  if (!keeperId) throw new Error("Choose the player to keep.");
  if (!losers.length) throw new Error("Choose at least one duplicate to merge in.");

  // Fresh trace per attempt, so window.__playerMergeTrace always describes the
  // run the operator just watched fail.
  mergeTrace = [];
  trace({ step: "start", keeperId, losers });

  const steps = [];

  for (const ref of PLAYER_REFERENCE_TABLES) {
    if (ref.kind === "repoint") {
      for (const column of ref.columns) {
        // Count first so the write can be checked against a known target rather
        // than trusting an empty PostgREST response to mean "nothing to do".
        const { count, error: countError } = await countReferences(ref.table, column, losers);
        if (countError) throw new Error(countError);
        if (!count) {
          steps.push({ table: ref.table, column, action: "repoint", repointed: 0 });
          continue;
        }
        const affected = await repointColumn(ref.table, column, keeperId, losers, count);
        steps.push({ table: ref.table, column, action: "repoint", repointed: affected });
        trace({ step: "repoint", table: ref.table, column, expected: count, affected });
      }
    } else if (ref.kind === "roster") {
      const result = await mergeRosterRows(ref, keeperId, losers);
      steps.push({ table: ref.table, action: "roster-merge", ...result });
      trace({ step: "roster-merge", table: ref.table, ...result });
    }
  }

  // Now that every match_logs row has moved, the stats trigger has rebuilt the
  // keeper's totals. Anything still filed under a loser is a leftover the
  // trigger will not clear, and it holds an FK that would block the delete.
  for (const stat of DERIVED_STAT_TABLES) {
    const result = await sweepDerivedStats(stat.table, losers);
    steps.push({ table: stat.table, action: "stats-sweep", ...result });
    trace({ step: "stats-sweep", table: stat.table, ...result });
  }

  // Re-read every reference before touching public.player. Deleting a player
  // that something still points at fails on the FK anyway, but a leftover here
  // means a step silently did nothing — and the operator needs that named, not
  // a raw constraint violation.
  const leftovers = [];
  for (const ref of PLAYER_REFERENCE_TABLES) {
    for (const column of ref.columns) {
      const { count, error: countError } = await countReferences(ref.table, column, losers);
      if (countError) throw new Error(countError);
      if (count) leftovers.push(`${ref.table}.${column} (${count})`);
    }
  }
  for (const stat of DERIVED_STAT_TABLES) {
    const { count, error: countError } = await countReferences(stat.table, "player_id", losers);
    if (countError) throw new Error(countError);
    if (count) leftovers.push(`${stat.table}.player_id (${count})`);
  }
  trace({ step: "verify", leftovers });
  if (leftovers.length) {
    throw new Error(
      `Merge incomplete — these references still point at the duplicate player(s): ${leftovers.join(
        ", ",
      )}. No player rows were deleted. This is almost always row-level security blocking the write.`,
    );
  }

  // Only now is it safe: nothing references the duplicates any more.
  const { data: deletedPlayers, error: deleteError } = await supabase
    .from("player")
    .delete()
    .in("id", losers)
    .select("id");
  if (deleteError) {
    throw mergeError(
      deleteError,
      "References were repointed but the duplicate player rows could not be deleted. Re-run the merge to finish",
    );
  }
  if ((deletedPlayers?.length ?? 0) !== losers.length) {
    throw new Error(
      `References were repointed, but only ${deletedPlayers?.length ?? 0} of ${losers.length} ` +
        `duplicate player row(s) were deleted. Row-level security is most likely blocking DELETE on public.player.`,
    );
  }
  steps.push({ table: "player", action: "delete", count: deletedPlayers?.length ?? 0 });

  const auditError = await logMerge({
    keeperId,
    keeperSnapshot: snapshots?.keeper ?? null,
    loserSnapshots: snapshots?.losers ?? [],
    steps,
    reason,
  });

  invalidatePlayerCaches();

  return { steps, auditError };
}

/**
 * Player identity and stats are cached in several places; a merge changes all
 * of them. Prefix-clearing is deliberate — the merge can touch any event and any
 * team, so narrowing the keys would leave stale attribution somewhere.
 */
export function invalidatePlayerCaches() {
  invalidateCachedQuery("players:directory");
  invalidateCachedQueries("players:ids");
  invalidateCachedQueries("player-match-stats:event:");
  invalidateCachedQueries("teams:player-stats:");
  invalidateCachedQueries("teams:matches");
}
