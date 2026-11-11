// Orchestration for Tournament Director match corrections.
//
// Every mutation here follows the same three-beat sequence, which exists because
// match_logs carries no score snapshot:
//
//   1. mutate the log row
//   2. re-fetch, re-derive the totals from the log
//   3. publish those totals to matches.score_a/score_b
//
// Step 3 is not optional. The scorekeeper's own comment states the rule: "The
// deleted row is gone from the log, so the recount below returns the score
// without it and publishing that total is what makes the deletion stick."
// Skipping it leaves the published score drifting from the log it is meant to
// summarise.

import { supabase } from "./supabaseClient";
import {
  getMatchLogs,
  createMatchLogEntry,
  updateMatchLogEntry,
  deleteMatchLogEntry,
} from "./matchLogService";
import { updateMatch } from "./matchService";
import { deriveMatchLogs } from "./matchLogDerivation";
import { invalidateCachedQueries } from "../utils/queryCache";
import { invalidateTournamentOverview } from "./tournamentDirectorService";

/**
 * Drop every cached read that a log edit can invalidate.
 *
 * matchLogService performs no invalidation of its own — nothing needed it while
 * the scorekeeper was the only writer, because the console holds its own state.
 * Player statistics are aggregated from match_logs *and cached*, so without this
 * a corrected scorer keeps showing the old attribution on the player profile,
 * the team page and the event stats table.
 */
export function invalidateAfterCorrection({ eventId, teamAId, teamBId }) {
  if (teamAId) invalidateCachedQueries(`teams:player-stats:${teamAId}`);
  if (teamBId) invalidateCachedQueries(`teams:player-stats:${teamBId}`);
  if (eventId) {
    invalidateCachedQueries(`player-match-stats:event:${eventId}`);
    invalidateTournamentOverview(eventId);
  }
  invalidateCachedQueries("teams:matches");
}

/**
 * Record a correction in the shared audit_log table.
 *
 * match_logs has no updated_at/updated_by, so without this an edit is invisible
 * after the fact. Never let an audit failure fail the correction itself — the
 * data fix already landed, and RLS may legitimately block the insert. Returns
 * an error message instead of throwing so the caller can surface a soft notice.
 */
export async function logMatchCorrection({ action, recordId, matchId, before, after, reason }) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const actorId = sessionData?.session?.user?.id ?? null;

    const { error } = await supabase.from("audit_log").insert({
      table_name: "match_logs",
      record_id: recordId ?? null,
      // The CHECK constraint allows only INSERT / UPDATE / DELETE.
      action,
      actor_id: actorId,
      change_data: {
        source: "match_corrections",
        matchId: matchId ?? null,
        reason: reason || null,
        before: before ?? null,
        after: after ?? null,
      },
    });

    if (error) {
      return error.message || "Audit entry could not be written.";
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Audit entry could not be written.";
  }
}

/**
 * Re-read the log, derive the score, and publish it to the match.
 *
 * Uses updateMatch (not realtimeService.updateScore, which the scorekeeper uses):
 * updateScore is a bare update() that invalidates no cached reads, so the corrected
 * score would keep showing stale everywhere it is cached.
 */
export async function recomputeAndPublishScore({ matchId, teamAId, teamBId, eventCodeById }) {
  if (!matchId) {
    throw new Error("Match ID is required to recompute the score.");
  }
  // Deriving before both team ids resolve maps every row to no team and would
  // publish 0-0 over a real score. The scorekeeper refuses in the same situation.
  if (!teamAId || !teamBId) {
    throw new Error("Both teams must be assigned before the score can be recomputed.");
  }

  const rows = await getMatchLogs(matchId);
  const derived = deriveMatchLogs(rows, { teamAId, teamBId, eventCodeById });
  await updateMatch(matchId, { scoreA: derived.totals.a, scoreB: derived.totals.b });

  return { rows, derived };
}

/** Shared tail: republish the score, then clear the caches a log edit affects. */
async function finaliseCorrection(context) {
  const result = await recomputeAndPublishScore(context);
  invalidateAfterCorrection(context);
  return result;
}

export async function applyLogUpdate(context, logId, updates, { before, reason } = {}) {
  const row = await updateMatchLogEntry(logId, updates);
  const auditError = await logMatchCorrection({
    action: "UPDATE",
    recordId: logId,
    matchId: context.matchId,
    before,
    after: updates,
    reason,
  });
  const result = await finaliseCorrection(context);
  return { ...result, row, auditError };
}

export async function applyLogDelete(context, logId, { before, reason } = {}) {
  await deleteMatchLogEntry(logId);
  const auditError = await logMatchCorrection({
    action: "DELETE",
    recordId: logId,
    matchId: context.matchId,
    before,
    after: null,
    reason,
  });
  const result = await finaliseCorrection(context);
  return { ...result, auditError };
}

export async function applyLogInsert(context, input, { reason } = {}) {
  const row = await createMatchLogEntry(input);
  const auditError = await logMatchCorrection({
    action: "INSERT",
    recordId: row?.id ?? null,
    matchId: context.matchId,
    before: null,
    after: input,
    reason,
  });
  const result = await finaliseCorrection(context);
  return { ...result, row, auditError };
}

// Inserted in batches so one request never carries a whole tournament day.
const IMPORT_BATCH_SIZE = 100;

/**
 * Write an imported match log (from a scrimmage-console export) in one go.
 *
 * `mode` is "replace" (delete the match's existing log first) or "append"
 * (add the given rows beside it; the caller has already dropped duplicates).
 * Rows are plain match_logs insert objects from buildImportRows. Unlike
 * applyLogInsert, the score is republished and caches cleared once at the end,
 * not per row.
 *
 * RLS refuses writes silently (success, zero rows), so both the delete and the
 * inserts are counted back, and a shortfall throws with what did land.
 */
export async function importMatchLogs(context, { rows = [], mode = "append", matchUpdates = null, reason = "", summary = null } = {}) {
  const { matchId } = context;
  if (!matchId) throw new Error("Match ID is required to import a match log.");
  if (!rows.length) throw new Error("There are no entries to import.");

  let deletedCount = 0;
  if (mode === "replace") {
    const existing = await getMatchLogs(matchId);
    const expected = Array.isArray(existing) ? existing.length : 0;
    if (expected > 0) {
      const { data, error } = await supabase
        .from("match_logs")
        .delete()
        .eq("match_id", matchId)
        .select("id");
      if (error) throw new Error(error.message || "Failed to remove the existing match log.");
      deletedCount = Array.isArray(data) ? data.length : 0;
      if (deletedCount < expected) {
        throw new Error(
          `Only ${deletedCount} of ${expected} existing entries could be removed, so nothing was imported. You may not have permission to delete match log entries.`,
        );
      }
    }
  }

  let inserted = 0;
  for (let start = 0; start < rows.length; start += IMPORT_BATCH_SIZE) {
    const batch = rows.slice(start, start + IMPORT_BATCH_SIZE).map((row) => ({ ...row, match_id: matchId }));
    const { data, error } = await supabase.from("match_logs").insert(batch).select("id");
    const landed = Array.isArray(data) ? data.length : 0;
    inserted += landed;
    if (error || landed < batch.length) {
      const why = error?.message || "You may not have permission to add match log entries.";
      throw new Error(
        `${inserted} of ${rows.length} entries were imported before the import stopped: ${why} ` +
          "Reload the log to see what landed; the corrections tools can finish or undo it.",
      );
    }
  }

  if (matchUpdates && Object.keys(matchUpdates).length) {
    await updateMatch(matchId, matchUpdates);
  }

  const auditError = await logMatchCorrection({
    action: "INSERT",
    recordId: null,
    matchId,
    before: mode === "replace" ? { deletedLogCount: deletedCount } : null,
    after: { imported: inserted, mode, matchUpdates, ...(summary || {}) },
    reason: reason ? `Scrimmage import: ${reason}` : "Scrimmage import",
  });

  const result = await finaliseCorrection(context);
  return { ...result, inserted, deletedCount, auditError };
}

/**
 * Put a match back to "still to be played": every match_logs row deleted, score
 * 0–0, status scheduled, and the setup fields the console fills in (scorekeeper,
 * pulling team, gender line rule) plus captain confirmations cleared. Teams,
 * venue, pool and start time are kept. Spirit scores are not touched.
 *
 * Used for test matches and matches started by mistake. The deleted rows are
 * counted back, because an RLS-refused DELETE succeeds with zero rows.
 */
export async function resetMatchToScheduled(context, { before, reason } = {}) {
  const { matchId } = context;
  if (!matchId) {
    throw new Error("Match ID is required to reset a match.");
  }

  const existing = await getMatchLogs(matchId);
  const expected = Array.isArray(existing) ? existing.length : 0;

  if (expected > 0) {
    const { data, error } = await supabase
      .from("match_logs")
      .delete()
      .eq("match_id", matchId)
      .select("id");
    if (error) {
      throw new Error(error.message || "Failed to delete the match log.");
    }
    const deleted = Array.isArray(data) ? data.length : 0;
    if (deleted < expected) {
      throw new Error(
        `Only ${deleted} of ${expected} log entries could be deleted. You may not have permission to delete match log entries.`
      );
    }
  }

  const row = await updateMatch(matchId, {
    status: "scheduled",
    scoreA: 0,
    scoreB: 0,
    scorekeeperId: null,
    startingTeamId: null,
    abbaPattern: null,
    captainsConfirmed: false,
    confirmedAt: null,
    teamAConfirmedAt: null,
    teamAConfirmedBy: null,
    teamBConfirmedAt: null,
    teamBConfirmedBy: null,
  });

  const auditError = await logMatchCorrection({
    action: "DELETE",
    recordId: null,
    matchId,
    before: { match: before ?? null, deletedLogCount: expected },
    after: { reset: "scheduled" },
    reason: reason ? `Full match reset: ${reason}` : "Full match reset",
  });

  invalidateAfterCorrection(context);
  return { row, deletedLogCount: expected, auditError };
}

// Timestamps are millisecond resolution, so a midpoint needs at least 2ms of gap
// to land strictly between its neighbours.
const MIN_GAP_MS = 2;
const DEFAULT_STEP_MS = 1000;

/**
 * Choose a created_at that places a new entry immediately after `anchor`.
 *
 * Position in the timeline is a pure function of created_at — there is no
 * point-number column — so inserting a missed point means computing a timestamp
 * that sorts into the right slot. Must never return a value equal to an existing
 * row's timestamp: that recreates the collision the checker reports and blocks
 * timestamp-based edits.
 *
 * @param {string|null} anchorCreatedAt  entry to insert after; null = start of match
 * @param {string|null} nextCreatedAt    the following entry, if any
 * @param {string[]}    [usedCreatedAt]  every existing timestamp, to guarantee uniqueness
 */
export function computeInsertTimestamp(anchorCreatedAt, nextCreatedAt, usedCreatedAt = []) {
  const anchor = anchorCreatedAt ? Date.parse(anchorCreatedAt) : null;
  const next = nextCreatedAt ? Date.parse(nextCreatedAt) : null;

  const taken = new Set(
    (Array.isArray(usedCreatedAt) ? usedCreatedAt : [])
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value)),
  );

  let candidate;
  if (!Number.isFinite(anchor)) {
    // Inserting before the first entry.
    candidate = Number.isFinite(next) ? next - DEFAULT_STEP_MS : Date.now();
  } else if (!Number.isFinite(next) || next - anchor < MIN_GAP_MS) {
    // Appending after the last entry, or the gap is too small to split.
    candidate = anchor + DEFAULT_STEP_MS;
  } else {
    candidate = anchor + Math.floor((next - anchor) / 2);
  }

  // The computed slot can still be occupied (appending past a row that already
  // sits a second later). Step forward a millisecond at a time until free, but
  // stay strictly below `next` so the entry keeps its intended position.
  const ceiling = Number.isFinite(next) ? next : Number.POSITIVE_INFINITY;
  while (taken.has(candidate) && candidate + 1 < ceiling) {
    candidate += 1;
  }
  // Nothing free below the ceiling: fall back to just after the anchor.
  if (taken.has(candidate) && Number.isFinite(anchor)) {
    candidate = anchor + 1;
    while (taken.has(candidate)) {
      candidate += 1;
    }
  }

  return new Date(candidate).toISOString();
}
