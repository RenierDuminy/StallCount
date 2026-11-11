import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";

/**
 * Console state that is a pure function of the match log.
 *
 * The goal (docs/TODO.md §5a): deleting or editing an entry puts the console
 * back exactly where it was before that entry was added, so the operator can
 * log the correct one and play continues on the right path. That only holds if
 * the state is *replayed* from the log rather than patched when something is
 * added, so everything here takes the whole log and returns the answer. The
 * console re-runs these on every log change: a delete, an edit, a refresh from
 * another device or a TD correction, and the offline queue flushing.
 *
 * Score is counted in `deriveLogsFromRows`, the caps in `matchCaps.js`, and
 * the game clock in `gameClock.js`. Timers are not handled here.
 *
 * Entries are the console's log entries: `{ eventCode, team: "A"|"B"|null,
 * timestamp }`. The input may be in any order (server rows followed by
 * entries still in the offline queue); it is ordered by time, with ties kept
 * in input order.
 */

const CODES = MATCH_LOG_EVENT_CODES;

function entryTime(entry) {
  const parsed = new Date(entry?.timestamp || entry?.createdAt || entry?.created_at || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function orderLogsByTime(logs) {
  return (Array.isArray(logs) ? logs : [])
    .map((entry, index) => ({ entry, index, at: entryTime(entry) }))
    .filter((item) => item.entry)
    .sort((a, b) => a.at - b.at || a.index - b.index)
    .map((item) => item.entry);
}

const isTeamKey = (key) => key === "A" || key === "B";
const opposite = (key) => (key === "A" ? "B" : key === "B" ? "A" : null);

export function isScoringCode(code) {
  return code === CODES.SCORE || code === CODES.CALAHAN;
}

/**
 * The team that pulled to open the match. The `match_start` row records it
 * (`logMatchStartEvent` stamps the pulling team), so the log wins over the
 * match record: changing `starting_team_id` after kick-off must not flip a
 * replay of a match that has already been played that way.
 */
export function pullingTeamFromLogs(logs, fallbackPullingTeamKey = null) {
  const start = (Array.isArray(logs) ? logs : []).find(
    (entry) => entry?.eventCode === CODES.MATCH_START,
  );
  if (isTeamKey(start?.team)) return start.team;
  return isTeamKey(fallbackPullingTeamKey) ? fallbackPullingTeamKey : null;
}

/**
 * Who holds the disc after the last entry.
 *
 * - Pulling gives the disc away: the team that did not pull opens on offence.
 * - A score or Callahan: the team that conceded receives the next pull.
 * - A turnover is stamped with the thrower's team, so the other side gets it.
 * - A block is stamped with the defender's team, who now have it.
 * - `halftime_start` is a hard reset, not a continuation: the pull flips, so
 *   the team that pulled to open the match receives to open the second half.
 *
 * Returns null before anything has been logged.
 */
export function derivePossession(logs, { pullingTeamKey = null } = {}) {
  const ordered = orderLogsByTime(logs);
  if (ordered.length === 0) return null;
  const puller = pullingTeamFromLogs(ordered, pullingTeamKey);
  const firstHalfReceiver = opposite(puller);
  const secondHalfReceiver = puller;
  // Logs from before the console wrote `match_start` still start the replay
  // from the first-half receiver.
  let holder = firstHalfReceiver;

  ordered.forEach((entry) => {
    const team = isTeamKey(entry.team) ? entry.team : null;
    switch (entry.eventCode) {
      case CODES.MATCH_START:
        holder = firstHalfReceiver;
        break;
      case CODES.SCORE:
      case CODES.CALAHAN:
        if (team) holder = opposite(team);
        break;
      case CODES.TURNOVER:
        if (team) holder = opposite(team);
        break;
      case CODES.BLOCK:
        if (team) holder = team;
        break;
      case CODES.HALFTIME_START:
        holder = secondHalfReceiver;
        break;
      default:
        break;
    }
  });

  return holder;
}

/**
 * Timeouts taken, counted from `timeout_start` rows (a timeout always belongs
 * to a team). `beforeSecondHalf` is the count when the first `halftime_end`
 * was logged: a per-half allowance subtracts it, so deleting the halftime_end
 * (or a first-half timeout) moves it with the log.
 */
export function countTimeouts(logs) {
  const used = { A: 0, B: 0 };
  let beforeSecondHalf = null;
  orderLogsByTime(logs).forEach((entry) => {
    if (entry.eventCode === CODES.TIMEOUT_START && isTeamKey(entry.team)) {
      used[entry.team] += 1;
    } else if (entry.eventCode === CODES.HALFTIME_END && beforeSecondHalf === null) {
      beforeSecondHalf = { ...used };
    }
  });
  return {
    used,
    beforeSecondHalf: beforeSecondHalf ?? { A: 0, B: 0 },
    secondHalfStarted: beforeSecondHalf !== null,
  };
}

function sameEntry(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.id && b.id && a.id === b.id) return true;
  return Boolean(a.optimisticId && b.optimisticId && a.optimisticId === b.optimisticId);
}

/**
 * Local (not yet confirmed) `halftime_end` entries that are duplicates. A break
 * has exactly one end, so for each break (a `halftime_start` up to the next
 * one): when the server already has an end for it, every local end is
 * redundant, whatever its timestamp (the reload fallback backdates its end to
 * the scheduled break end, so a local end can sort before the server's);
 * otherwise only the first local end counts. Typically the dropped entry is
 * one the database turned down because the break was already closed there.
 * Server rows are never included, and an end with no halftime before it is
 * left alone (it may be waiting for its start to sync).
 */
export function findRedundantLocalHalftimeEnds(logs) {
  const redundant = new Set();
  const breaks = [];
  orderLogsByTime(logs).forEach((entry) => {
    if (entry.eventCode === CODES.HALFTIME_START) {
      breaks.push({ serverEnds: 0, localEnds: [] });
    } else if (entry.eventCode === CODES.HALFTIME_END && breaks.length > 0) {
      const current = breaks[breaks.length - 1];
      if (entry.isOptimistic) current.localEnds.push(entry);
      else current.serverEnds += 1;
    }
  });
  breaks.forEach(({ serverEnds, localEnds }) => {
    localEnds.forEach((entry, index) => {
      if (serverEnds > 0 || index > 0) redundant.add(entry);
    });
  });
  return redundant;
}

/** True when `entry` is the last entry in the log by time. */
export function isLatestEntry(logs, entry) {
  const ordered = orderLogsByTime(logs);
  return ordered.length > 0 && sameEntry(ordered[ordered.length - 1], entry);
}

/**
 * The halftime a scoring entry set off, if deleting that entry should take the
 * halftime with it. Returns the `halftime_start` entry, or null.
 *
 * Only when all of these hold:
 * - the halftime was started automatically (point cap or time cap). The caller
 *   passes the trigger type it recorded; "manual" and "unknown" (for example a
 *   halftime started on another device) return null, because a manual
 *   halftime is never undone this way;
 * - the `halftime_start` is the very next entry after the score. The
 *   automatic trigger writes it in the same handler, so nothing can come
 *   between them;
 * - the break is still running (no `halftime_end` yet). Once the break has
 *   been taken, the half really was played, and re-running halftime on the
 *   corrected point would give the teams a second break.
 */
export function findHalftimeSetOffByScore(logs, scoreEntry, { triggerType = "unknown" } = {}) {
  if (!scoreEntry || !isScoringCode(scoreEntry.eventCode)) return null;
  if (triggerType !== "pointCap" && triggerType !== "timeCap") return null;
  const ordered = orderLogsByTime(logs);
  const index = ordered.findIndex((entry) => sameEntry(entry, scoreEntry));
  if (index < 0) return null;
  const next = ordered[index + 1];
  if (!next || next.eventCode !== CODES.HALFTIME_START) return null;
  const later = ordered.slice(index + 2);
  if (later.some((entry) => entry.eventCode === CODES.HALFTIME_END)) return null;
  if (later.some((entry) => entry.eventCode === CODES.HALFTIME_START)) return null;
  return next;
}

/**
 * The gender line a Rule B point was played on ("M" or "F"), read off its
 * scoring entry. Deleting the point gives the choice back, so the corrected
 * point is logged on the same line without the operator choosing it again.
 */
export function ruleBLineOfEntry(entry) {
  if (!entry || !isScoringCode(entry.eventCode)) return null;
  const first = String(entry.abbaLine || "").trim().charAt(0).toUpperCase();
  return first === "M" || first === "F" ? first : null;
}
