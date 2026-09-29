/**
 * Division and final standings for the generic event workspace.
 *
 * Division standings (`buildPoolStandings`) are one table per pool covering
 * everything except the playoffs: the pool's own games, then " - ", then the
 * team's games that belong to no pool (crossovers). Games linked to a bracket
 * node are playoff games and never count here.
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

const FINAL_EVENT_STATUSES = new Set(["completed", "finished"]);

export const isCompletedEventStatus = (status) =>
  FINAL_EVENT_STATUSES.has((status || "").toString().trim().toLowerCase());

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
export const getFinalStandingsModes = ({ eventData, matches, playoffMatchIds, isEventCompleted }) =>
  new Map(
    (eventData?.divisions || []).map((division) => {
      const playoffGames = (matches || []).filter(
        (match) => match.division_id === division.id && playoffMatchIds.has(match.id),
      );
      let mode = null;
      if (playoffGames.length) {
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

/**
 * teamId -> { place, tied }, from the bracket layout (see the header). Places
 * are counted per division — a division is the one its games are played in —
 * and brackets sharing a division are taken in the order given.
 */
const buildPlacementByTeam = (brackets, matchById) => {
  const terminalByDivision = new Map();
  (brackets || []).forEach((bracket, bracketIndex) => {
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

  const placementByTeam = new Map();
  terminalByDivision.forEach((games) => {
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
        const newTeamIds = teamIds.filter((id) => id && !placementByTeam.has(id));
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
  return placementByTeam;
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
 * Division standings for one pool: the pool's games, then (after " - ") each
 * team's no-pool games. Playoff games are excluded. W-L, +/- and the ranking
 * cover both stages.
 */
export const buildPoolStandings = (pool, matches, playoffMatchIds = new Set()) => {
  const nonPlayoff = (matches || []).filter((match) => !playoffMatchIds.has(match.id));
  const teamIds = new Set(buildPoolGroupTeams([pool]).map((team) => team.id));
  const poolGames = nonPlayoff.filter((match) => match.pool_id && match.pool_id === pool?.id);
  const noPoolGames = nonPlayoff.filter(
    (match) =>
      !match.pool_id && (teamIds.has(match.team_a?.id) || teamIds.has(match.team_b?.id)),
  );

  // buildPoolGroupStandings selects games by pool_id, so the no-pool games are
  // tagged with this pool to be counted. Only this pool's teams get a row, so
  // an opponent from elsewhere is simply not tallied.
  return buildPoolGroupStandings(
    [pool],
    [...poolGames, ...noPoolGames.map((match) => ({ ...match, pool_id: pool?.id }))],
  ).map((row) => ({
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
  const placementByTeam = buildPlacementByTeam(brackets, matchById);
  const stageByMatch = buildPlayoffStageByMatch(brackets);
  const playoffMatchIds = getPlayoffMatchIds(brackets);

  return (eventData?.divisions || [])
    .map((division, divisionIndex) => {
      const mode = modeByDivision?.get(division.id) || null;
      if (!mode) return null;
      const playoffsOnly = mode === "playoffs";
      const divisionMatches = allMatches.filter(
        (match) =>
          match.division_id === division.id &&
          (!playoffsOnly || playoffMatchIds.has(match.id)),
      );
      if (playoffsOnly && !divisionMatches.length) return null;

      // Teams from the games in scope. The full scope also lists every pool
      // team, including any that never played.
      const pools = playoffsOnly ? [] : division.pools || [];
      const teamPool = { teams: [] };
      const listedIds = new Set(buildPoolGroupTeams(pools).map((team) => team.id));
      divisionMatches.forEach((match) => {
        [match.team_a, match.team_b].forEach((team) => {
          if (team?.id && !listedIds.has(team.id)) {
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
          const { place, tied } = placementByTeam.get(row.id);
          return { ...row, place, tied, rank: tied ? `${place}=` : place };
        })
        .sort((a, b) => a.place - b.place);
      const lastPlace = placed.reduce(
        (max, row) => Math.max(max, row.tied ? row.place + 1 : row.place),
        0,
      );
      const unplaced = rankByWfdf(rows.filter((row) => !placementByTeam.has(row.id))).map(
        (row, index) => ({ ...row, rank: Math.max(lastPlace, placed.length) + index + 1 }),
      );

      return {
        id: division.id || `division-${divisionIndex}`,
        name: division.name || "Division",
        mode,
        rows: [...placed, ...unplaced],
      };
    })
    .filter(Boolean);
};
