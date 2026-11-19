/**
 * Division and final standings for the generic event workspace.
 *
 * Division standings (`buildPoolStandings`) are one table per pool, ranked by
 * WFDF on the pool's own games. The form line also shows each team's games
 * that belong to no pool (crossovers) after a " - ", for context only. Games
 * linked to a bracket node are playoff games and never appear here.
 *
 * Final standings (`buildFinalStandings`) are decided per division
 * (`getFinalStandingsModes`) and come in two scopes:
 *  - "playoffs" (division with playoffs, once one has a result): only teams
 *    that played a playoff game, with only playoff games counted, one form
 *    stage per bracket round.
 *  - "all" (division without playoffs, once the event is completed): every
 *    team in the division and every game, pool stages first.
 *
 * Nothing in the database stores a team's final placing, so it is read off the
 * playoff bracket's layout: left to right is the progression of the playoffs
 * (node `round`), top to bottom is ranking (node `position`). A game that feeds
 * nothing onward (no advance_to_winner / advance_to_loser) is a placement game.
 * Placement games are taken from the rightmost round leftwards, top to bottom
 * within a round, and each hands out the next free places in its division —
 * winner first, then loser. A team keeps the first place it is given, so a
 * terminal game in an earlier round only places teams that no later game did.
 * A placement game that was never decided (still scheduled, or drawn) leaves
 * both its teams level on the next place, shown as "3=" — the order between
 * them is not invented. Teams without a place rank below every placed team, by
 * games won then the WFDF tie-breakers.
 *
 * Swiss draws are treated as a pool stage played in rounds, not as playoffs:
 *  - During the draw, the pool that holds the draw's teams shows the live Swiss
 *    table (buildSwissPoolStandings) instead of an ordinary pool table, which
 *    would be empty because every Swiss game is a bracket game.
 *  - The division's final table is held back until every round has a result
 *    (getUnfinishedSwissDivisionIds), then places teams in the final Swiss
 *    order. Its games are never read as placement games.
 *  - The order is wins, fewest losses, then the draw's tie-breaks, taken from
 *    the same engine the server pairs rounds and seeds promotion games with
 *    (api/_lib/swissDraw.js, imported, not copied), so the public tables
 *    cannot disagree with the draw.
 *
 * Places are kept per division. A team listed in another division's pools is a
 * guest when it plays a game counted here (a promotion game between divisions):
 * it is neither placed nor listed in this division's final table, and the game
 * does not move this division's places.
 *
 * Form lines are split into stages with a separator entry between them, which
 * `StandardStandingsTable` renders as " - ".
 */
import {
  FORM_OUTCOME_LABELS,
  buildPoolGroupStandings,
  buildPoolGroupTeams,
  getTeamMatchOutcome,
  isFinishedMatch,
  isForfeitMatch,
  rankByWfdf,
  resolveMatchScores,
} from "./standings";
// The server's Swiss engine, imported rather than copied so the public table
// can never rank a draw differently from the pairings. It is pure (no imports).
import { computeSwissState } from "../../api/_lib/swissDraw.js";

const FINAL_EVENT_STATUSES = new Set(["completed", "finished"]);

export const isCompletedEventStatus = (status) =>
  FINAL_EVENT_STATUSES.has((status || "").toString().trim().toLowerCase());

const todayDateKey = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * An event that is over: completed/finished, or its end date has passed
 * (an event ending today is not past). The date check covers the gap before
 * advance_event_statuses() moves the status. Past events offer no calendar
 * and no WFDF rules link. api/_lib/calendarFeed.js isConcludedEvent is a copy
 * (change both).
 */
export const isPastEvent = ({ status = null, endDate = null } = {}) => {
  if (isCompletedEventStatus(status)) return true;
  const end = typeof endDate === "string" ? endDate.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(end) && end < todayDateKey();
};

/** Stage separator entry for a form line. */
export const FORM_SEPARATOR = Object.freeze({ separator: true });

/** Ids of every match linked to a bracket node — the event's playoff games. */
export const getPlayoffMatchIds = (brackets) =>
  new Set(
    (brackets || []).flatMap((bracket) =>
      (bracket?.nodes || []).map((node) => node?.match_id).filter(Boolean),
    ),
  );

const hasResult = (match) => isFinishedMatch(match.status) || isForfeitMatch(match);

/**
 * divisionId -> final standings mode, decided per division because divisions
 * of one event can differ (only the women's division may have a bracket, or
 * one division's playoffs may be played while another's are not):
 *  - "playoffs": the division has playoff games and at least one has a result.
 *    Its final table covers playoff games only; its pool tables stay.
 *  - "all": the division has no playoff games and the event is completed. Its
 *    final table covers every game and replaces its pool tables.
 *  - null: nothing final yet.
 */
export const getFinalStandingsModes = ({
  eventData,
  matches,
  playoffMatchIds,
  isEventCompleted,
  // Divisions run as a Swiss draw that is still being played
  // (getUnfinishedSwissDivisionIds): no final table until the last round is in.
  unfinishedSwissDivisionIds = new Set(),
}) =>
  new Map(
    (eventData?.divisions || []).map((division) => {
      const playoffGames = (matches || []).filter(
        (match) => match.division_id === division.id && playoffMatchIds.has(match.id),
      );
      let mode = null;
      if (unfinishedSwissDivisionIds.has(division.id)) {
        mode = null;
      } else if (playoffGames.length) {
        mode = playoffGames.some(hasResult) ? "playoffs" : null;
      } else if (isEventCompleted) {
        mode = "all";
      }
      return [division.id, mode];
    }),
  );

const getWinnerAndLoser = (match) => {
  if (!match) return null;
  if (!isFinishedMatch(match.status) && !isForfeitMatch(match)) return null;
  const { scoreA, scoreB } = resolveMatchScores(match);
  if (typeof scoreA !== "number" || typeof scoreB !== "number" || scoreA === scoreB) {
    return null;
  }
  const teamA = match.team_a?.id;
  const teamB = match.team_b?.id;
  if (!teamA || !teamB) return null;
  return scoreA > scoreB
    ? { winnerId: teamA, loserId: teamB }
    : { winnerId: teamB, loserId: teamA };
};

const isSwissBracket = (bracket) => String(bracket?.type || "").trim().toLowerCase() === "swiss";

// Same status rules the resolver passes the engine.
const SWISS_STARTED_STATUSES = new Set(["initialized", "live", "halftime"]);
const swissHelpers = {
  isFinished: (status) => isFinishedMatch(status),
  isStarted: (status) =>
    isFinishedMatch(status) || SWISS_STARTED_STATUSES.has(String(status || "").trim().toLowerCase()),
  // Only a chosen team can seed a round 1 bye on this page; a bye seeded from
  // pool standings or another draw is left to the server, and the table then
  // falls back to the bracket layout for that draw.
  resolveTeamSource: (source) =>
    source?.type === "static_team" && source.teamId
      ? { resolved: true, teamId: source.teamId, teamName: source.teamName || "" }
      : { resolved: false, reason: "bye team not known on this page" },
};

/**
 * Every Swiss draw in the event, worked out by the server's engine:
 * [{ bracket, divisionId, state, finished }]. `finished` is true only when
 * every round has been paired AND every game in it has a final result; the
 * engine's own `complete` flag only says every round could be paired, which is
 * already true while the last round is still being played.
 */
const getSwissDraws = (brackets, matchById) =>
  (brackets || []).filter(isSwissBracket).flatMap((bracket) => {
    const nodes = (bracket.nodes || []).map((node) => ({
      ...node,
      match: matchById.get(node?.match_id) || node?.match || null,
    }));
    const divisionId = nodes.find((node) => node.match?.division_id)?.match.division_id || null;
    let state;
    try {
      state = computeSwissState({ ...bracket, nodes }, swissHelpers);
    } catch {
      return [];
    }
    const totalRounds = new Set(nodes.map((node) => Number(node.round))).size;
    const finished =
      Boolean(state?.complete) &&
      (state.rounds || []).length === totalRounds &&
      state.rounds.every((round) =>
        round.games
          .filter((game) => !game.notNeeded)
          .every((game) => game.node?.match && isFinishedMatch(game.node.match.status)),
      );
    return [{ bracket, divisionId, state, finished, totalRounds }];
  });

/**
 * One team's form line in a Swiss draw, one entry per round in round order:
 * its game, or its bye. A bye is drawn as the light blue "bye / opponent forfeit" dot, the
 * same as an opponent's forfeit, because the draw scores both as a win
 * without a game; without the dot a team on 1-5 would show five losses and
 * nothing else, and its one win would look like a mistake.
 */
const buildSwissForm = (state, teamId) =>
  (state?.rounds || []).flatMap((round) => {
    if (round.byeTeamId === teamId) {
      return [{ outcome: "forfeit_innocent", title: `Bye in round ${round.round}` }];
    }
    const game = round.games.find(
      (entry) => !entry.notNeeded && entry.node?.match && involvesTeam(entry.node.match, teamId),
    );
    return game ? [buildFormEntry(game.node.match, teamId)] : [];
  });

/**
 * teamId -> place for each Swiss draw's division, from the Swiss table. Only a
 * finished draw places anyone: until then the live order is the Swiss pool's
 * table (buildSwissPoolStandings), not a final result.
 */
const addSwissPlacements = (placementByDivision, brackets, matchById) => {
  getSwissDraws(brackets, matchById).forEach(({ divisionId, state, finished }) => {
    if (!divisionId || !finished) return;
    if (!placementByDivision.has(divisionId)) placementByDivision.set(divisionId, new Map());
    const places = placementByDivision.get(divisionId);
    // `record` carries the Swiss W-L (a bye counts as a win) so the final table
    // shows the same record as the Swiss pool table, and the order it is
    // ranked by. Counting games only would show 0-5 for a team the pool table
    // shows as 1-5 after a bye.
    (state.rows || []).forEach((row) => {
      if (!places.has(row.id)) {
        places.set(row.id, {
          place: places.size + 1,
          tied: false,
          record: {
            wins: row.wins,
            losses: row.losses,
            scoreDiff: row.diff,
            form: buildSwissForm(state, row.id),
          },
        });
      }
    });
  });
};

/**
 * Division ids whose playoff games are all Swiss games and whose draw is not
 * finished. getFinalStandingsModes holds their final table back: a Swiss draw
 * is a pool stage played in rounds, so its order is not final until the last
 * round is in.
 */
export const getUnfinishedSwissDivisionIds = (brackets, matches) => {
  const matchById = new Map((matches || []).map((match) => [match.id, match]));
  const ids = new Set();
  getSwissDraws(brackets, matchById).forEach(({ divisionId, finished }) => {
    if (divisionId && !finished) ids.add(divisionId);
  });
  return ids;
};

/**
 * poolId -> Swiss standings, for a pool that holds a Swiss draw's teams (every
 * team in the pool is in the draw). The rows replace the pool's ordinary table,
 * which would be empty: Swiss games are bracket games, and pool tables never
 * count bracket games.
 *
 * Rows come straight from the engine, in the order it pairs rounds and seeds
 * the promotion games by: wins, then fewest losses, then the draw's tie-breaks
 * (points difference by default). A bye counts as a win with no points, as the
 * engine scores it, so W-L here includes byes. The form line shows each played
 * or scheduled Swiss game in round order; a bye has no dot.
 *
 * Returns Map(poolId -> { rows, roundsPlayed, totalRounds, finished }).
 */
export const buildSwissPoolStandings = ({ eventData, matches, brackets }) => {
  const matchById = new Map((matches || []).map((match) => [match.id, match]));
  const byPool = new Map();
  getSwissDraws(brackets, matchById).forEach(({ divisionId, state, finished, totalRounds }) => {
    const drawTeamIds = new Set(state.teamsById ? state.teamsById.keys() : []);
    if (!drawTeamIds.size) return;
    const division = (eventData?.divisions || []).find((entry) => entry.id === divisionId);
    const roundsPlayed = (state.rounds || []).filter((round) =>
      round.games
        .filter((game) => !game.notNeeded)
        .every((game) => game.node?.match && isFinishedMatch(game.node.match.status)),
    ).length;

    (division?.pools || []).forEach((pool) => {
      const poolTeams = buildPoolGroupTeams([pool]);
      if (!poolTeams.length || !poolTeams.every((team) => drawTeamIds.has(team.id))) return;
      const rows = (state.rows || [])
        .filter((row) => poolTeams.some((team) => team.id === row.id))
        .map((row) => ({
          id: row.id,
          name: row.name,
          wins: row.wins,
          losses: row.losses,
          scoreDiff: row.diff,
          rank: row.rank,
          form: buildSwissForm(state, row.id),
        }));
      byPool.set(pool.id, { rows, roundsPlayed, totalRounds, finished });
    });
  });
  return byPool;
};

/**
 * divisionId -> (teamId -> { place, tied }), from the bracket layout (see the
 * header). Places are counted per division — a division is the one its games
 * are played in — and brackets sharing a division are taken in the order given.
 * Swiss draws are placed from their own table instead.
 */
/**
 * teamId -> divisionId for teams listed in a division's pools. A team in one
 * division that plays a game counted in another (a promotion game) is a guest
 * there: it is neither placed nor listed in that division's final table.
 */
const buildHomeDivisionByTeam = (eventData) => {
  const homeDivision = new Map();
  (eventData?.divisions || []).forEach((division) => {
    buildPoolGroupTeams(division.pools || []).forEach((team) => {
      if (team?.id && !homeDivision.has(team.id)) homeDivision.set(team.id, division.id);
    });
  });
  return homeDivision;
};

const isGuestTeam = (homeDivision, teamId, divisionKey) => {
  const home = homeDivision.get(teamId);
  return Boolean(home) && home !== divisionKey;
};

const buildPlacementByDivision = (brackets, matchById, homeDivision = new Map()) => {
  const terminalByDivision = new Map();
  (brackets || []).forEach((bracket, bracketIndex) => {
    if (isSwissBracket(bracket)) return;
    (bracket?.nodes || []).forEach((node) => {
      if (node?.advance_to_winner || node?.advance_to_loser) return;
      const match = matchById.get(node?.match_id) || node?.match;
      if (!match) return;
      const divisionKey = match.division_id || "none";
      if (!terminalByDivision.has(divisionKey)) terminalByDivision.set(divisionKey, []);
      terminalByDivision.get(divisionKey).push({
        match,
        bracketIndex,
        round: Number(node.round) || 0,
        position: Number(node.position) || 0,
      });
    });
  });

  const placementByDivision = new Map();
  terminalByDivision.forEach((games, divisionKey) => {
    const placementByTeam = new Map();
    placementByDivision.set(divisionKey, placementByTeam);
    let nextPlace = 1;
    games
      .sort(
        (a, b) =>
          a.bracketIndex - b.bracketIndex || b.round - a.round || a.position - b.position,
      )
      .forEach(({ match }) => {
        const result = getWinnerAndLoser(match);
        const teamIds = result
          ? [result.winnerId, result.loserId]
          : [match.team_a?.id, match.team_b?.id];
        const newTeamIds = teamIds.filter(
          (id) => id && !placementByTeam.has(id) && !isGuestTeam(homeDivision, id, divisionKey),
        );
        if (!newTeamIds.length) return;
        if (result) {
          newTeamIds.forEach((teamId) => {
            placementByTeam.set(teamId, { place: nextPlace, tied: false });
            nextPlace += 1;
          });
          return;
        }
        const tied = newTeamIds.length > 1;
        newTeamIds.forEach((teamId) => placementByTeam.set(teamId, { place: nextPlace, tied }));
        nextPlace += newTeamIds.length;
      });
  });
  addSwissPlacements(placementByDivision, brackets, matchById);
  return placementByDivision;
};

/** matchId -> { stageKey, order } for games that belong to a bracket round. */
const buildPlayoffStageByMatch = (brackets) => {
  const stageByMatch = new Map();
  (brackets || []).forEach((bracket, bracketIndex) => {
    (bracket?.nodes || []).forEach((node) => {
      if (!node?.match_id) return;
      const round = Number(node.round) || 0;
      stageByMatch.set(node.match_id, {
        stageKey: `playoff:${bracket.id || bracketIndex}:${round}`,
        order: round,
      });
    });
  });
  return stageByMatch;
};

const getMatchTime = (match) => {
  const time = match?.start_time ? new Date(match.start_time).getTime() : NaN;
  return Number.isNaN(time) ? Infinity : time;
};

const byMatchTime = (a, b) => getMatchTime(a) - getMatchTime(b);

const involvesTeam = (match, teamId) =>
  match.team_a?.id === teamId || match.team_b?.id === teamId;

const buildFormEntry = (match, teamId) => {
  const isTeamA = match.team_a?.id === teamId;
  const { scoreA, scoreB } = resolveMatchScores(match);
  const teamScore = isTeamA ? scoreA : scoreB;
  const oppScore = isTeamA ? scoreB : scoreA;
  const opponent = isTeamA ? match.team_b : match.team_a;
  const outcome = getTeamMatchOutcome(match, teamId, teamScore, oppScore);
  const hasScore =
    outcome !== "scheduled" && typeof teamScore === "number" && typeof oppScore === "number";
  return {
    outcome,
    title: `${FORM_OUTCOME_LABELS[outcome]}${hasScore ? ` ${teamScore}-${oppScore}` : ""} vs ${
      opponent?.short_name || opponent?.name || "TBD"
    }`,
  };
};

/** Join the non-empty stages of form entries with separators. */
const joinStages = (stages) =>
  stages
    .filter((entries) => entries.length)
    .flatMap((entries, index) => (index === 0 ? entries : [FORM_SEPARATOR, ...entries]));

/**
 * Division standings for one pool. The ranking, W-L and +/- cover the pool's
 * own games only — WFDF B3.1 ranks a pool "after round robin pool play", and
 * the playoff seeding uses the same pool-only table. The form line shows the
 * pool's games, then (after " - ") each team's no-pool games for context.
 * Playoff games are excluded throughout.
 */
export const buildPoolStandings = (pool, matches, playoffMatchIds = new Set()) => {
  const nonPlayoff = (matches || []).filter((match) => !playoffMatchIds.has(match.id));
  const teamIds = new Set(buildPoolGroupTeams([pool]).map((team) => team.id));
  const poolGames = nonPlayoff.filter((match) => match.pool_id && match.pool_id === pool?.id);
  const noPoolGames = nonPlayoff.filter(
    (match) =>
      !match.pool_id && (teamIds.has(match.team_a?.id) || teamIds.has(match.team_b?.id)),
  );

  return buildPoolGroupStandings([pool], poolGames).map((row) => ({
    ...row,
    form: joinStages(
      [poolGames, noPoolGames].map((games) =>
        games
          .filter((match) => involvesTeam(match, row.id))
          .sort(byMatchTime)
          .map((match) => buildFormEntry(match, row.id)),
      ),
    ),
  }));
};

/**
 * One team's form line: pool stages first (in the order they were played),
 * then playoff rounds, with a separator between consecutive stages.
 */
const buildStagedForm = (teamId, matches, stageByMatch) => {
  const stages = new Map();
  matches
    .filter((match) => involvesTeam(match, teamId))
    .sort(byMatchTime)
    .forEach((match) => {
      const playoff = stageByMatch.get(match.id);
      const key = playoff ? playoff.stageKey : `pool:${match.pool_id || "none"}`;
      if (!stages.has(key)) {
        stages.set(key, {
          isPlayoff: Boolean(playoff),
          order: playoff ? playoff.order : getMatchTime(match),
          entries: [],
        });
      }
      stages.get(key).entries.push(buildFormEntry(match, teamId));
    });

  return joinStages(
    [...stages.values()]
      .sort((a, b) => Number(a.isPlayoff) - Number(b.isPlayoff) || a.order - b.order)
      .map((stage) => stage.entries),
  );
};

/**
 * Final standings per division: [{ id, name, mode, rows }], rows ranked by
 * final place and carrying `rank` and a staged `form`. `modeByDivision` comes
 * from getFinalStandingsModes; divisions with no mode are left out.
 */
export const buildFinalStandings = ({ eventData, matches, brackets, modeByDivision }) => {
  const allMatches = matches || [];
  const matchById = new Map(allMatches.map((match) => [match.id, match]));
  const homeDivision = buildHomeDivisionByTeam(eventData);
  const placementByDivision = buildPlacementByDivision(brackets, matchById, homeDivision);
  const stageByMatch = buildPlayoffStageByMatch(brackets);
  const playoffMatchIds = getPlayoffMatchIds(brackets);

  return (eventData?.divisions || [])
    .map((division, divisionIndex) => {
      const mode = modeByDivision?.get(division.id) || null;
      if (!mode) return null;
      const placementByTeam = placementByDivision.get(division.id) || new Map();
      const playoffsOnly = mode === "playoffs";
      const divisionMatches = allMatches.filter(
        (match) =>
          match.division_id === division.id &&
          (!playoffsOnly || playoffMatchIds.has(match.id)),
      );
      if (playoffsOnly && !divisionMatches.length) return null;

      // Teams from the games in scope. The full scope also lists every pool
      // team, including any that never played. Guests from another division
      // are left out; their games still count for this division's teams.
      const pools = playoffsOnly ? [] : division.pools || [];
      const teamPool = { teams: [] };
      const listedIds = new Set(buildPoolGroupTeams(pools).map((team) => team.id));
      divisionMatches.forEach((match) => {
        [match.team_a, match.team_b].forEach((team) => {
          if (team?.id && !listedIds.has(team.id) && !isGuestTeam(homeDivision, team.id, division.id)) {
            listedIds.add(team.id);
            teamPool.teams.push({ team, seed: null });
          }
        });
      });

      // Every game in scope counts, whatever its pool, so use the team-based
      // match mode with an open date range.
      const rows = buildPoolGroupStandings([...pools, teamPool], divisionMatches, {
        matchMode: "team_date_range",
        getMatchDateKey: () => "all",
      }).map((row) => ({
        ...row,
        form: buildStagedForm(row.id, divisionMatches, stageByMatch),
      }));
      if (!rows.length) return null;

      // `rows` is already in WFDF order, and sort is stable, so teams level on
      // a place keep that order between them.
      const placed = rows
        .filter((row) => placementByTeam.has(row.id))
        .map((row) => {
          const { place, tied, record } = placementByTeam.get(row.id);
          return { ...row, ...(record || {}), place, tied, rank: tied ? `${place}=` : place };
        })
        .sort((a, b) => a.place - b.place);
      const lastPlace = placed.reduce(
        (max, row) => Math.max(max, row.tied ? row.place + 1 : row.place),
        0,
      );
      const unplaced = rankByWfdf(rows.filter((row) => !placementByTeam.has(row.id))).map(
        (row, index) => ({ ...row, rank: Math.max(lastPlace, placed.length) + index + 1 }),
      );

      // A division whose bracket covers only some teams (e.g. a round robin
      // with just a final) still lists everyone: teams that played no playoff
      // game follow the placed ones, ranked by their whole record in the
      // division (WFDF order), with every game on their form line.
      let rest = [];
      if (playoffsOnly) {
        const shownIds = new Set(rows.map((row) => row.id));
        const everyGame = allMatches.filter((match) => match.division_id === division.id);
        const fullPool = { teams: [] };
        const fullIds = new Set(buildPoolGroupTeams(division.pools || []).map((team) => team.id));
        everyGame.forEach((match) => {
          [match.team_a, match.team_b].forEach((team) => {
            if (team?.id && !fullIds.has(team.id) && !isGuestTeam(homeDivision, team.id, division.id)) {
              fullIds.add(team.id);
              fullPool.teams.push({ team, seed: null });
            }
          });
        });
        const firstRank = Math.max(lastPlace, placed.length) + unplaced.length;
        rest = buildPoolGroupStandings([...(division.pools || []), fullPool], everyGame, {
          matchMode: "team_date_range",
          getMatchDateKey: () => "all",
        })
          .filter((row) => !shownIds.has(row.id))
          .map((row, index) => ({
            ...row,
            rank: firstRank + index + 1,
            form: buildStagedForm(row.id, everyGame, stageByMatch),
          }));
      }

      return {
        id: division.id || `division-${divisionIndex}`,
        name: division.name || "Division",
        mode,
        rows: [...placed, ...unplaced, ...rest],
      };
    })
    .filter(Boolean);
};
