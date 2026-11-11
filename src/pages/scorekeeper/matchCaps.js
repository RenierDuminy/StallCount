import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import { buildGameTimeline, toTimedEntries } from "./gameClock";

/**
 * Match target and caps, derived from the match log alone.
 *
 * The model (ruled 2026-11-11, docs/TODO.md §6):
 * - A point runs from one score to the next (WFDF: "Start of a point: 00:00 –
 *   goal is scored"). Nothing happens during a point, so every cap acts at the
 *   next score, from the score after that point.
 * - Time cap: `timeCapSeconds` of game time. At the first score at or after it,
 *   if nobody has reached the target, the target becomes highest + 1 (target
 *   mode "addOneToHighest"; "none" keeps it). Then overtime: reaching the
 *   target wins.
 * - Hard cap: `hardCapAfterSeconds` of game time after the time cap (null = no
 *   hard cap). At the first score at or after it, if nobody has won: unequal
 *   scores end the match, equal scores go to a universe point.
 *
 * Game time excludes stoppages (stoppages stop all play). Because everything
 * is replayed from the log, deleting a wrong-team point corrects the target,
 * and a reload on any device lands on the same state.
 */

export const CAP_PHASES = Object.freeze({
  /** Before the time cap. */
  NORMAL: "normal",
  /** The time cap has passed; the point in progress decides the new target. */
  TIME_CAP_PENDING: "timeCapPending",
  /** After the time cap point: play to the (new) target. */
  OVERTIME: "overtime",
  /** The hard cap has passed; the point in progress ends the match. */
  HARD_CAP_PENDING: "hardCapPending",
  /** Tied at the hard cap: the next score wins. */
  UNIVERSE_POINT: "universePoint",
  /** A team has won (by the target, or on the hard cap). */
  DECIDED: "decided",
});

export function deriveMatchCaps(logs, rules, nowMs = Date.now()) {
  const pointTarget = positiveOrNull(rules?.pointTarget);
  const timeCapSeconds = positiveOrNull(rules?.timeCapSeconds);
  const hardCapAfterSeconds = positiveOrNull(rules?.hardCapAfterSeconds);
  const addOneAtTimeCap = rules?.timeCapTargetMode === "addOneToHighest";
  const hardCapAtSeconds =
    timeCapSeconds !== null && hardCapAfterSeconds !== null
      ? timeCapSeconds + hardCapAfterSeconds
      : null;

  const timeline = buildGameTimeline(logs);
  const score = { A: 0, B: 0 };
  let target = pointTarget;
  let timeCapPoint = null;
  let hardCapPoint = null;
  let winner = null;
  let decidedBy = null;
  let universePoint = false;

  toTimedEntries(logs).forEach(({ code, at, entry }) => {
    if (code !== MATCH_LOG_EVENT_CODES.SCORE && code !== MATCH_LOG_EVENT_CODES.CALAHAN) return;
    const team = entry?.team;
    if (team !== "A" && team !== "B") return;
    score[team] += 1;
    if (winner) return;

    if (target !== null && score[team] >= target) {
      winner = team;
      decidedBy = universePoint ? "universePoint" : "target";
      return;
    }
    if (!timeline.started) return;
    const elapsed = timeline.elapsedSecondsAt(at);

    if (timeCapPoint === null && timeCapSeconds !== null && elapsed >= timeCapSeconds) {
      timeCapPoint = { a: score.A, b: score.B };
      if (addOneAtTimeCap) {
        target = Math.max(score.A, score.B) + 1;
      }
    }
    if (hardCapPoint === null && hardCapAtSeconds !== null && elapsed >= hardCapAtSeconds) {
      hardCapPoint = { a: score.A, b: score.B };
      if (score.A !== score.B) {
        winner = score.A > score.B ? "A" : "B";
        decidedBy = "hardCap";
      } else {
        universePoint = true;
        target = score.A + 1;
      }
    }
  });

  const nowElapsed = timeline.started ? timeline.elapsedSecondsAt(nowMs) : 0;
  let phase = CAP_PHASES.NORMAL;
  if (winner) {
    phase = CAP_PHASES.DECIDED;
  } else if (universePoint) {
    phase = CAP_PHASES.UNIVERSE_POINT;
  } else if (hardCapAtSeconds !== null && nowElapsed >= hardCapAtSeconds) {
    phase = CAP_PHASES.HARD_CAP_PENDING;
  } else if (timeCapPoint) {
    phase = CAP_PHASES.OVERTIME;
  } else if (timeCapSeconds !== null && timeline.started && nowElapsed >= timeCapSeconds) {
    phase = CAP_PHASES.TIME_CAP_PENDING;
  }

  return {
    phase,
    target,
    score: { a: score.A, b: score.B },
    winner,
    decidedBy,
    timeCapPoint,
    hardCapPoint,
    timeCapSeconds,
    hardCapAtSeconds,
  };
}

function positiveOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
