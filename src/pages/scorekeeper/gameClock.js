import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";

/**
 * The game clock, derived from the match log alone.
 *
 * The console has no pause button: the clock starts at `match_start` and only
 * stops for a logged stoppage, and freezes at `match_end`. So the log is a
 * complete record of the clock, and this is its single source of truth: the
 * console re-derives from it on every log refresh, and a reload on any device
 * lands on the same value.
 */

/**
 * Game time as a function of wall time. Stoppages pair in order (an end with
 * no open start is ignored; a start never closed runs until the stop point),
 * and nothing before `match_start` or after `match_end` counts.
 */
export function buildGameTimeline(logs) {
  const timed = toTimedEntries(logs);
  const start = timed.find((entry) => entry.code === MATCH_LOG_EVENT_CODES.MATCH_START);
  if (!start) {
    return { started: false, ended: false, stoppageOpen: false, elapsedSecondsAt: () => 0 };
  }
  const end = timed.find(
    (entry) => entry.code === MATCH_LOG_EVENT_CODES.MATCH_END && entry.at >= start.at
  );

  const stoppages = [];
  let openSince = null;
  timed.forEach((entry) => {
    if (entry.at < start.at || (end && entry.at > end.at)) return;
    if (entry.code === MATCH_LOG_EVENT_CODES.STOPPAGE_START) {
      if (openSince === null) openSince = entry.at;
    } else if (entry.code === MATCH_LOG_EVENT_CODES.STOPPAGE_END && openSince !== null) {
      stoppages.push([openSince, entry.at]);
      openSince = null;
    }
  });
  if (openSince !== null) {
    stoppages.push([openSince, null]);
  }

  const elapsedSecondsAt = (atMs) => {
    const stopAt = Math.max(start.at, end ? Math.min(atMs, end.at) : atMs);
    let stoppedMs = 0;
    stoppages.forEach(([from, to]) => {
      if (from >= stopAt) return;
      stoppedMs += Math.min(to ?? stopAt, stopAt) - from;
    });
    return Math.floor(Math.max(0, stopAt - start.at - stoppedMs) / 1000);
  };

  return {
    started: true,
    ended: Boolean(end),
    // A match that ended mid-stoppage is over, not stopped.
    stoppageOpen: openSince !== null && !end,
    elapsedSecondsAt,
  };
}

/**
 * Returns the seconds left on a count-down from `durationSeconds` (negative
 * once in overtime; the console's tick applies the overtime bounds), whether
 * the clock should be running, and whether a stoppage is still open.
 * `started: false` means there is no `match_start` and the clock is untouched.
 */
export function deriveGameClockFromLogs(logs, durationSeconds, nowMs = Date.now()) {
  const timeline = buildGameTimeline(logs);
  if (!timeline.started) {
    return { started: false, ended: false, running: false, stoppageOpen: false, remainingSeconds: durationSeconds };
  }
  return {
    started: true,
    ended: timeline.ended,
    running: !timeline.ended && !timeline.stoppageOpen,
    stoppageOpen: timeline.stoppageOpen,
    remainingSeconds: durationSeconds - timeline.elapsedSecondsAt(nowMs),
  };
}

/** Log entries with a code and a parseable time, oldest first. */
export function toTimedEntries(logs) {
  return (Array.isArray(logs) ? logs : [])
    .map((entry) => ({ code: entry?.eventCode, at: toMs(entry?.timestamp), entry }))
    .filter((item) => item.code && item.at !== null)
    .sort((a, b) => a.at - b.at);
}

function toMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}
