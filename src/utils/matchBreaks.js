// Break and break-chance rules, shared by the match log cards (scorekeeper console
// and overlay control room) and the overlay's live "Break chance" banner.
//
// Input is chronological, entries shaped { id, eventCode, team: "A" | "B" | null }.
//
// - Pulling gives the disc away: the puller starts the point on defence.
// - After a score the scorer pulls next.
// - At halftime the pull flips: the team that pulled first now receives, so the
//   other team pulls. This is a reset, not a continuation of the last point.
// - Turnover rows carry the thrower's team (they lose the disc); block rows carry
//   the defender's team (they gain it). Mirrors the console's possession replay
//   in modularScoreKeeperData.js.
//
// A break is a score by the team that pulled that point. A break chance is that
// pulling team holding the disc mid-point.
//
// The opening puller comes from the match_start row's team, falling back to
// `startingPuller` (matches.starting_team_id as "A"/"B"). Without either, points
// before the first score cannot be judged.
const other = (team) => (team === "A" ? "B" : team === "B" ? "A" : null);

function walk(chronologicalLogs, startingPuller, onScore) {
  let firstPuller = startingPuller === "A" || startingPuller === "B" ? startingPuller : null;
  let puller = firstPuller;
  let holder = other(puller);
  let inPlay = Boolean(puller);

  for (const log of chronologicalLogs || []) {
    if (!log) continue;
    const code = `${log.eventCode || ""}`.toLowerCase();
    const team = log.team === "A" || log.team === "B" ? log.team : null;

    if (code === "match_start") {
      if (team) firstPuller = team;
      puller = firstPuller;
      holder = other(puller);
      inPlay = Boolean(puller);
    } else if (code === "score" || code === "callahan") {
      if (!team) continue;
      onScore?.(log, Boolean(puller) && team === puller);
      puller = team;
      holder = other(team);
      inPlay = true;
    } else if (code === "turnover") {
      if (team) holder = other(team);
    } else if (code === "block") {
      if (team) holder = team;
    } else if (code === "halftime_start") {
      puller = other(firstPuller);
      holder = firstPuller;
      // No point is live during the break.
      inPlay = false;
    } else if (code === "halftime_end") {
      inPlay = Boolean(puller);
    } else if (code === "match_end") {
      inPlay = false;
    }
  }
  return { puller, holder, inPlay };
}

export function findBreakLogIds(chronologicalLogs, startingPuller = null) {
  const breakIds = new Set();
  walk(chronologicalLogs, startingPuller, (log, isBreak) => {
    if (isBreak && log.id != null) breakIds.add(log.id);
  });
  return breakIds;
}

// "A" | "B" when that team pulled this point and now has the disc, else null.
export function getBreakChanceTeam(chronologicalLogs, startingPuller = null) {
  const { puller, holder, inPlay } = walk(chronologicalLogs, startingPuller);
  return inPlay && puller && holder === puller ? puller : null;
}

// Possession: how long each team held the disc in ACTIVE play, in ms.
// Entries are chronological { eventCode, team: "A" | "B" | null, ts } (ms).
// Counted only while a point is being played: from the pull to the score.
// Not counted: the inter-point gap (a point is taken to start `interPointSeconds`
// after the previous score, as there is no pull row; a timeout called before
// the pull pushes that to the timeout's end), timeouts, stoppages and halftime.
// Crediting, per point:
// - a point with no turnover or block logged (a clean point, or a match where
//   turnovers are not logged) is credited in full to the team that scored it;
// - a point with turnovers or blocks follows the disc: the receiving team
//   starts with it, a turnover row gives it to the other team, a block row to
//   the blocking team.
// A point not yet scored (still being played, or cut by halftime / match end)
// follows the disc. A point still being played counts up to `nowMs`.
// `hasData` is true once any active playing time has been counted.
export function computePossessionTime(chronologicalLogs, { startingPuller = null, interPointSeconds = 75, nowMs = Date.now() } = {}) {
  const interPointMs = Math.max(0, Number(interPointSeconds) || 0) * 1000;
  const totals = { A: 0, B: 0 };
  // The current point's time, by holder, until the point is settled.
  let pointTotals = { A: 0, B: 0 };
  let pointHadTurnover = false;
  const settlePoint = (scorer) => {
    if (scorer && !pointHadTurnover) {
      totals[scorer] += pointTotals.A + pointTotals.B;
    } else {
      totals.A += pointTotals.A;
      totals.B += pointTotals.B;
    }
    pointTotals = { A: 0, B: 0 };
    pointHadTurnover = false;
  };
  let firstPuller = startingPuller === "A" || startingPuller === "B" ? startingPuller : null;
  let holder = null;
  let live = false;
  let paused = false;
  let ended = false;
  let pointFrom = null; // when the current point's play starts
  let prePullTimeout = false;
  let segmentFrom = null; // counting the holder from here

  const close = (ts) => {
    if (segmentFrom !== null && holder && ts > segmentFrom) pointTotals[holder] += ts - segmentFrom;
    segmentFrom = null;
  };
  const open = (ts) => {
    if (live && !paused && holder && pointFrom !== null) segmentFrom = Math.max(ts, pointFrom);
  };

  for (const log of chronologicalLogs || []) {
    if (!log) continue;
    const code = `${log.eventCode || ""}`.toLowerCase();
    const team = log.team === "A" || log.team === "B" ? log.team : null;
    const ts = Number(log.ts);
    if (!Number.isFinite(ts)) continue;

    close(ts);
    if (code === "match_start") {
      if (team) firstPuller = team;
      holder = other(firstPuller);
      live = true;
      ended = false;
      paused = false;
      pointFrom = ts;
    } else if (code === "score" || code === "callahan") {
      settlePoint(team);
      if (team) holder = other(team);
      pointFrom = ts + interPointMs;
      prePullTimeout = false;
    } else if (code === "turnover") {
      pointHadTurnover = true;
      if (team) holder = other(team);
    } else if (code === "block") {
      pointHadTurnover = true;
      if (team) holder = team;
    } else if (code === "timeout_start" || code === "stoppage_start") {
      if (code === "timeout_start" && pointFrom !== null && ts < pointFrom) prePullTimeout = true;
      paused = true;
    } else if (code === "timeout_end" || code === "stoppage_end") {
      paused = false;
      if (code === "timeout_end" && prePullTimeout) {
        pointFrom = Math.max(pointFrom ?? ts, ts);
        prePullTimeout = false;
      }
    } else if (code === "halftime_start") {
      settlePoint(null);
      live = false;
    } else if (code === "halftime_end") {
      live = true;
      paused = false;
      holder = firstPuller; // the pull flips: the first puller now receives
      pointFrom = ts;
    } else if (code === "match_end") {
      settlePoint(null);
      live = false;
      ended = true;
    }
    open(ts);
  }
  if (!ended) close(nowMs);
  settlePoint(null);
  return { A: totals.A, B: totals.B, hasData: totals.A + totals.B > 0 };
}
