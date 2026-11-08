/**
 * Swiss draw engine — pure, no I/O.
 *
 * Replays a Swiss bracket round by round and works out, for every round, who
 * plays whom, who has the bye, and which games are not needed; plus the
 * standings after every finished game. playoffResolve.js turns that into match
 * writes; the status endpoint turns it into the standings table.
 *
 * Replaying the whole draw (rather than pairing one round in isolation) is what
 * the variants need: a bye must go to a team that has not had one, advance-or-
 * out must know who is still in, and lagged pairing must avoid an opponent that
 * is paired but not yet played.
 *
 * Rules, all deterministic so a re-run never reshuffles anything:
 *  - Results come from what was actually played (the match rows), never from
 *    what the engine would pair today.
 *  - A round with no game started is paired fresh, so a corrected earlier score
 *    still flows into it. Once any game of a round has started, every game in
 *    that round that already has teams keeps them; only empty games are filled,
 *    from the teams not yet placed.
 *  - A game whose sources are not Swiss (a hand-picked match) keeps its teams,
 *    and those teams are left out of the pairing.
 *  - A bye counts as a win with no points; it goes to the lowest-ranked team
 *    that has not had one (the lowest-ranked overall if everyone has).
 *  - Ranking: wins, then fewer losses, then (if chosen) strength of schedule,
 *    then point difference (each game's margin capped if a cap is set), then
 *    points scored, then the round 1 seed. The seed makes the order total.
 *  - Pairing is top-down (Monrad): the highest unplaced team meets the next
 *    highest it has not met, backtracking if that strands the rest. If no
 *    rematch-free pairing exists the round pairs with as few rematches as the
 *    greedy fallback finds, and says so.
 *
 * Settings live on brackets.settings.swiss (see normalizeSwissSettings). A
 * bracket with no settings behaves exactly like the first Swiss version: fixed
 * rounds, point difference, no cap, no lag.
 */

export const SWISS_TIEBREAKS = ["point_difference", "strength_of_schedule"];

// Keep in step with DEFAULT_SWISS_SETTINGS in src/data/bracketTemplates.js
// (serverless code cannot import from the Vite bundle).
export const DEFAULT_SWISS_SETTINGS = Object.freeze({
  mode: "fixed",
  winsToAdvance: 3,
  lossesToExit: 3,
  tiebreak: "point_difference",
  marginCap: null,
  pairingLag: 0,
});

const PAIRING_STEP_LIMIT = 20000;

function normalizeText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeSwissSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const mode = source.mode === "advance" ? "advance" : "fixed";
  const cap = Number(source.marginCap);
  return {
    mode,
    winsToAdvance: clampInt(source.winsToAdvance, 1, 20, DEFAULT_SWISS_SETTINGS.winsToAdvance),
    lossesToExit: clampInt(source.lossesToExit, 1, 20, DEFAULT_SWISS_SETTINGS.lossesToExit),
    tiebreak: SWISS_TIEBREAKS.includes(source.tiebreak) ? source.tiebreak : DEFAULT_SWISS_SETTINGS.tiebreak,
    marginCap: Number.isInteger(cap) && cap > 0 ? cap : null,
    // Lagged pairing assumes every team plays every round, which
    // advance-or-out breaks (who is still in depends on the round in play).
    pairingLag: mode === "fixed" && Number(source.pairingLag) === 1 ? 1 : 0,
  };
}

function nodeName(node) {
  const name = typeof node?.name === "string" ? node.name.trim() : "";
  return name || `Round ${node?.round ?? "--"} / Position ${node?.position ?? "--"}`;
}

function sourceType(source) {
  return normalizeText(source?.type);
}

/** A bye slot: never has a match; the engine names its team. */
export function isSwissByeNode(node) {
  return sourceType(node?.source_a) === "bye" || sourceType(node?.source_b) === "bye";
}

export function isSwissGameNode(node) {
  return sourceType(node?.source_a) === "swiss" || sourceType(node?.source_b) === "swiss";
}

function swissGameIndex(node) {
  const game = Number(node?.source_a?.game ?? node?.source_b?.game);
  return Number.isInteger(game) && game >= 1 ? game : Number.MAX_SAFE_INTEGER;
}

function teamIds(match) {
  return { a: match?.team_a?.id || null, b: match?.team_b?.id || null };
}

function hasBothTeams(match) {
  const { a, b } = teamIds(match);
  return Boolean(a && b);
}

function pairKey(left, right) {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function byRoundThenPosition(left, right) {
  return (
    Number(left.round) - Number(right.round) ||
    Number(left.position) - Number(right.position) ||
    String(left.id).localeCompare(String(right.id))
  );
}

function compareRowsFor(settings) {
  return (left, right) =>
    right.wins - left.wins ||
    left.losses - right.losses ||
    (settings.tiebreak === "strength_of_schedule" ? right.sos - left.sos : 0) ||
    right.diff - left.diff ||
    right.pointsFor - left.pointsFor ||
    left.seed - right.seed ||
    left.name.localeCompare(right.name) ||
    String(left.id).localeCompare(String(right.id));
}

/**
 * Is this game's result usable? Returns "" when it is, else why not.
 * Used for readiness: a round can only be paired from final results.
 */
function gameBlocker(game, helpers) {
  const { node } = game;
  if (!node.match_id || !node.match) return `${nodeName(node)} has no linked match`;
  const { match } = node;
  if (!hasBothTeams(match)) return `${nodeName(node)} has no teams yet`;
  if (!helpers.isFinished(match.status)) return "unfinished";
  if (typeof match.score_a !== "number" || typeof match.score_b !== "number") {
    return `${nodeName(node)} has no score`;
  }
  if (match.score_a === match.score_b) return `${nodeName(node)} is tied`;
  return "";
}

/** First reason any assigned game in these rounds is not final, or "". */
function firstPendingReason(rounds, helpers) {
  for (const round of rounds) {
    const assigned = round.games.filter((game) => !game.notNeeded);
    const reasons = assigned.map((game) => gameBlocker(game, helpers)).filter(Boolean);
    if (!reasons.length) continue;
    const named = reasons.find((reason) => reason !== "unfinished");
    if (named) return named;
    return `round ${round.round} has ${reasons.length} of ${assigned.length} games unfinished`;
  }
  return "";
}

/**
 * Standings from every final result in `rounds`. Games not yet final are
 * skipped, so this also serves a partial table while a round is in play.
 */
function buildRows(teams, rounds, settings, helpers) {
  const rows = new Map();
  teams.forEach((team) => {
    rows.set(team.id, {
      id: team.id,
      name: team.name,
      seed: team.seed,
      wins: 0,
      losses: 0,
      played: 0,
      byes: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      diff: 0,
      sos: 0,
      opponents: [],
    });
  });

  rounds.forEach((round) => {
    if (round.byeTeamId && rows.has(round.byeTeamId)) {
      const row = rows.get(round.byeTeamId);
      row.wins += 1;
      row.byes += 1;
    }
    round.games.forEach((game) => {
      if (game.notNeeded || gameBlocker(game, helpers)) return;
      const { match } = game.node;
      const rowA = rows.get(match.team_a.id);
      const rowB = rows.get(match.team_b.id);
      if (!rowA || !rowB) return;
      const aWon = match.score_a > match.score_b;
      const margin = Math.abs(match.score_a - match.score_b);
      const counted = settings.marginCap ? Math.min(margin, settings.marginCap) : margin;

      rowA.played += 1;
      rowB.played += 1;
      rowA.wins += aWon ? 1 : 0;
      rowA.losses += aWon ? 0 : 1;
      rowB.wins += aWon ? 0 : 1;
      rowB.losses += aWon ? 1 : 0;
      rowA.pointsFor += match.score_a;
      rowA.pointsAgainst += match.score_b;
      rowB.pointsFor += match.score_b;
      rowB.pointsAgainst += match.score_a;
      rowA.diff += aWon ? counted : -counted;
      rowB.diff += aWon ? -counted : counted;
      rowA.opponents.push(rowB.id);
      rowB.opponents.push(rowA.id);
    });
  });

  // Strength of schedule: total wins of the teams played (byes add nothing).
  rows.forEach((row) => {
    row.sos = row.opponents.reduce((sum, id) => sum + (rows.get(id)?.wins || 0), 0);
  });

  const ranked = Array.from(rows.values()).sort(compareRowsFor(settings));
  return ranked.map((row, index) => ({
    ...row,
    rank: index + 1,
    status:
      settings.mode !== "advance"
        ? ""
        : row.wins >= settings.winsToAdvance
          ? "advanced"
          : row.losses >= settings.lossesToExit
            ? "out"
            : "active",
  }));
}

/**
 * Pair ranked rows top-down, avoiding pairs in `met`. Each pair is
 * [higher ranked, lower ranked]. An odd row out is returned in `leftover`.
 */
function pairRows(rows, met) {
  const used = new Array(rows.length).fill(false);
  const pairs = [];
  let steps = 0;
  const target = Math.floor(rows.length / 2);

  const search = () => {
    if (pairs.length === target) return true;
    const first = used.indexOf(false);
    if (first === -1) return true;
    used[first] = true;
    for (let candidate = first + 1; candidate < rows.length; candidate += 1) {
      if (used[candidate] || met.has(pairKey(rows[first].id, rows[candidate].id))) continue;
      steps += 1;
      if (steps > PAIRING_STEP_LIMIT) break;
      used[candidate] = true;
      pairs.push([rows[first], rows[candidate]]);
      if (search()) return true;
      pairs.pop();
      used[candidate] = false;
    }
    used[first] = false;
    return false;
  };

  if (search()) {
    const placed = new Set(pairs.flat().map((row) => row.id));
    return { pairs, rematches: false, leftover: rows.filter((row) => !placed.has(row.id)) };
  }

  // No rematch-free pairing. Pair top-down taking the next team not yet met
  // where there is one, so rematches stay few.
  const remaining = rows.slice();
  const fallback = [];
  while (remaining.length > 1) {
    const top = remaining.shift();
    const freshIndex = remaining.findIndex((row) => !met.has(pairKey(top.id, row.id)));
    const [opponent] = remaining.splice(freshIndex === -1 ? 0 : freshIndex, 1);
    fallback.push([top, opponent]);
  }
  return { pairs: fallback, rematches: true, leftover: remaining };
}

/**
 * Work out the whole draw.
 *
 * helpers:
 *   resolveTeamSource(source) -> { resolved, teamId, teamName, reason }
 *       resolves a seeded source (the round 1 bye's team).
 *   isFinished(status), isStarted(status) -> boolean
 *
 * Returns {
 *   settings, rounds: [{ round, games: [{ node, teamAId, teamBId, frozen,
 *   notNeeded }], byeNode, byeTeamId, warnings }], rows, teamsById,
 *   complete, reason, blockedRound
 * }
 */
export function computeSwissState(bracket, helpers) {
  const settings = normalizeSwissSettings(bracket?.settings?.swiss);
  const nodes = (bracket?.nodes || []).slice().sort(byRoundThenPosition);
  const roundNumbers = [...new Set(nodes.map((node) => Number(node.round)).filter(Number.isFinite))].sort(
    (left, right) => left - right,
  );

  const teams = new Map();
  let appearance = 0;
  const registerTeam = (team, source) => {
    if (!team?.id) return;
    appearance += 1;
    const stamped = Number(source?.templateSeed);
    const seed = Number.isInteger(stamped) && stamped > 0 ? stamped : 1000 + appearance;
    const existing = teams.get(team.id);
    if (!existing) {
      teams.set(team.id, { id: team.id, name: team.name || team.short_name || "Team", seed });
    } else if (seed < existing.seed) {
      existing.seed = seed;
    }
  };

  const state = {
    settings,
    rounds: [],
    rows: [],
    teamsById: teams,
    complete: false,
    reason: "",
    blockedRound: null,
  };

  const finish = (reason = "", blockedRound = null) => {
    state.reason = reason;
    state.blockedRound = blockedRound;
    state.rows = buildRows(teams, state.rounds, settings, helpers);
    return state;
  };

  if (!roundNumbers.length) {
    return finish("Swiss draw has no games");
  }

  for (let index = 0; index < roundNumbers.length; index += 1) {
    const round = roundNumbers[index];
    const roundNodes = nodes.filter((node) => Number(node.round) === round);
    const byeNodes = roundNodes.filter(isSwissByeNode);
    const gameNodes = roundNodes.filter((node) => !isSwissByeNode(node));
    if (byeNodes.length > 1) {
      return finish(`round ${round} has more than one bye slot`, round);
    }
    const byeNode = byeNodes[0] || null;
    const roundState = { round, games: [], byeNode, byeTeamId: null, warnings: [] };

    // --- Round 1: seeded. The regular resolver fills it from its sources; the
    // engine only reads who ended up where.
    if (index === 0) {
      for (const node of gameNodes) {
        if (!node.match_id || !node.match) {
          return finish(`${nodeName(node)} has no linked match`, round);
        }
        if (!hasBothTeams(node.match)) {
          return finish(`round ${round} is not filled in yet (${nodeName(node)})`, round);
        }
        registerTeam(node.match.team_a, node.source_a);
        registerTeam(node.match.team_b, node.source_b);
        const { a, b } = teamIds(node.match);
        roundState.games.push({ node, teamAId: a, teamBId: b, frozen: true, notNeeded: false });
      }
      if (byeNode) {
        const resolved = helpers.resolveTeamSource(byeNode.source_a);
        if (!resolved?.resolved) {
          return finish(`${nodeName(byeNode)}: ${resolved?.reason || "bye team not known yet"}`, round);
        }
        registerTeam({ id: resolved.teamId, name: resolved.teamName }, byeNode.source_a);
        roundState.byeTeamId = resolved.teamId;
      }
      const placed = [
        ...roundState.games.flatMap((game) => [game.teamAId, game.teamBId]),
        ...(roundState.byeTeamId ? [roundState.byeTeamId] : []),
      ];
      if (new Set(placed).size !== placed.length) {
        return finish(`a team is placed twice in round ${round}`, round);
      }
      state.rounds.push(roundState);
      continue;
    }

    // --- Later rounds: paired from results.
    const basisIndex = index - 1 - settings.pairingLag;
    const basisRounds = state.rounds.slice(0, Math.max(0, basisIndex + 1));
    const pending = firstPendingReason(basisRounds, helpers);
    if (pending) {
      return finish(pending, round);
    }

    const ranked = buildRows(teams, basisRounds, settings, helpers);
    const active =
      settings.mode === "advance" ? ranked.filter((row) => row.status === "active") : ranked;

    // Everyone already paired in an earlier round (played or not) counts as
    // met, which is what keeps lagged pairing from scheduling a rematch.
    const met = new Set();
    const byesHad = new Set();
    state.rounds.forEach((earlier) => {
      earlier.games.forEach((game) => {
        if (!game.notNeeded && game.teamAId && game.teamBId) met.add(pairKey(game.teamAId, game.teamBId));
      });
      if (earlier.byeTeamId) byesHad.add(earlier.byeTeamId);
    });

    const roundStarted = gameNodes.some(
      (node) => node.match && hasBothTeams(node.match) && helpers.isStarted(node.match.status),
    );
    const frozenNodes = gameNodes.filter(
      (node) => node.match && hasBothTeams(node.match) && (roundStarted || !isSwissGameNode(node)),
    );

    const taken = new Set();
    for (const node of frozenNodes) {
      const { a, b } = teamIds(node.match);
      if (taken.has(a) || taken.has(b) || a === b) {
        return finish(`a team is in two games of round ${round}; correct it by hand`, round);
      }
      taken.add(a);
      taken.add(b);
      registerTeam(node.match.team_a, null);
      registerTeam(node.match.team_b, null);
      roundState.games.push({ node, teamAId: a, teamBId: b, frozen: true, notNeeded: false });
    }

    let byeTeamId = null;
    if (roundStarted && byeNode?.bye_team_id && teams.has(byeNode.bye_team_id) && !taken.has(byeNode.bye_team_id)) {
      byeTeamId = byeNode.bye_team_id;
    }
    let pool = active.filter((row) => !taken.has(row.id) && row.id !== byeTeamId);

    if (pool.length % 2 === 1 && !byeTeamId) {
      if (!byeNode) {
        return finish(`round ${round} has an odd number of teams but no bye slot`, round);
      }
      let pick = null;
      for (let i = pool.length - 1; i >= 0; i -= 1) {
        if (!byesHad.has(pool[i].id)) {
          pick = pool[i];
          break;
        }
      }
      pick = pick || pool[pool.length - 1];
      byeTeamId = pick.id;
      pool = pool.filter((row) => row.id !== pick.id);
    }
    roundState.byeTeamId = byeTeamId;

    const { pairs, rematches, leftover } = pairRows(pool, met);
    if (rematches) {
      roundState.warnings.push(
        `round ${round}: no pairing without a rematch exists, so the fewest rematches were used`,
      );
    }

    const openNodes = gameNodes
      .filter((node) => !frozenNodes.includes(node) && isSwissGameNode(node))
      .sort((left, right) => swissGameIndex(left) - swissGameIndex(right) || byRoundThenPosition(left, right));

    if (pairs.length > openNodes.length && !roundStarted) {
      return finish(
        `round ${round} needs ${pairs.length + frozenNodes.length} games but has ${openNodes.length + frozenNodes.length}; add games to this round`,
        round,
      );
    }

    openNodes.forEach((node, position) => {
      const pair = pairs[position];
      if (pair) {
        roundState.games.push({
          node,
          teamAId: pair[0].id,
          teamBId: pair[1].id,
          frozen: false,
          notNeeded: false,
        });
      } else {
        roundState.games.push({ node, teamAId: null, teamBId: null, frozen: false, notNeeded: true });
      }
    });

    const unplaced = [...leftover, ...pairs.slice(openNodes.length).flat()];
    if (unplaced.length) {
      roundState.warnings.push(
        `round ${round}: ${unplaced.map((row) => row.name).join(", ")} could not be given a game; assign by hand`,
      );
    }

    state.rounds.push(roundState);
  }

  const pending = firstPendingReason(state.rounds, helpers);
  finish(pending);
  if (!pending && settings.mode === "advance" && state.rows.some((row) => row.status === "active")) {
    state.reason = "teams are still in after the last round; add a round";
  }
  state.complete = !state.reason;
  return state;
}

/** The engine's entry for one game node, or null if its round is not paired. */
export function findSwissGame(state, node) {
  const round = state?.rounds?.find((entry) => entry.round === Number(node?.round));
  if (!round) return null;
  return round.games.find((game) => game.node.id === node.id) || null;
}

export function findSwissRound(state, roundNumber) {
  return state?.rounds?.find((entry) => entry.round === Number(roundNumber)) || null;
}
