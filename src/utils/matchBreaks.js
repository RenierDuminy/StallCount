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
