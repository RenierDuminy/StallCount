/**
 * Shared team-standings logic for event workspaces.
 *
 * Every workspace used to carry its own copy of this: pool/team extraction, the
 * form-guide outcome vocabulary, and the win/loss/points tally. They drifted —
 * STB_RL_2026 grew league points, forfeit attribution and a rank column while
 * the CPT/GP/SA workspaces kept a simpler W-L table. This module is the single
 * source of truth for the maths; `StandardStandingsTable` renders the result.
 *
 * The scoring model is configurable because it genuinely differs per event:
 * pass a `scoring` object to opt into league points, or omit it for a plain
 * win/loss table. Everything else (form dots, sorting, seeding) is common.
 */

// ---------------------------------------------------------------------------
// Match status vocabulary
// ---------------------------------------------------------------------------

const LIVE_STATUSES = new Set(["live", "halftime"]);
const FINISHED_STATUSES = new Set(["finished", "completed"]);
// Includes the explicit forfeit codes alongside plain cancellations. The
// `_teama` / `_teamb` suffix names the GUILTY (forfeiting) team, which is what
// lets the form guide colour the two sides differently.
const CANCELED_STATUSES = new Set([
  "canceled",
  "cancelled",
  "forfeit",
  "forfeit_teama",
  "forfeit_teamb",
]);

const normaliseStatus = (status) => (status || "").toString().trim().toLowerCase();

export const isLiveMatch = (status) => LIVE_STATUSES.has(normaliseStatus(status));
export const isFinishedMatch = (status) => FINISHED_STATUSES.has(normaliseStatus(status));
export const isCanceledMatch = (status) => CANCELED_STATUSES.has(normaliseStatus(status));

// ---------------------------------------------------------------------------
// Scoring configuration
// ---------------------------------------------------------------------------

/**
 * WFDF-style league scoring used by the Stellenbosch Residence League: 3 for a
 * win, 2 for losing by <= 4, 1 for any other loss. A forfeit is recorded with a
 * `forfeit_teamA`/`forfeit_teamB` status (or, for older rows, a canceled match
 * with a 5-0 line); the innocent team takes 2 points and the guilty team 0.
 */
export const LEAGUE_POINTS_SCORING = Object.freeze({
  winPoints: 3,
  lossPoints: 1,
  closeLossPoints: 2,
  closeLossMaxMargin: 4,
  forfeitScore: 5,
  forfeitWinPoints: 2,
  forfeitLossPoints: 0,
});

/** Default forfeit line (5-0) for events that award no league points. */
const DEFAULT_FORFEIT_SCORE = 5;

const getForfeitScore = (scoring) => scoring?.forfeitScore ?? DEFAULT_FORFEIT_SCORE;

const FORFEIT_STATUSES = new Set(["forfeit", "forfeit_teama", "forfeit_teamb"]);

/** True when the status itself declares the match a forfeit. */
export const isForfeitStatus = (status) => FORFEIT_STATUSES.has(normaliseStatus(status));

/**
 * A forfeit is either declared by the status (`forfeit`, `forfeit_teamA`,
 * `forfeit_teamB`) or inferred from a canceled match carrying a
 * `forfeitScore`-0 line in either direction.
 *
 * The score heuristic is kept for rows written before the explicit statuses
 * existed, and for events that record a forfeit as a plain cancellation. It is
 * only a fallback: a `forfeit_teamA`/`forfeit_teamB` match counts as a forfeit
 * whatever score line it carries.
 */
export const isForfeitMatch = (match, scoring) => {
  if (isForfeitStatus(match?.status)) return true;
  if (!isCanceledMatch(match?.status)) return false;
  const scoreA = match?.score_a;
  const scoreB = match?.score_b;
  if (typeof scoreA !== "number" || typeof scoreB !== "number") return false;
  const forfeitScore = getForfeitScore(scoring);
  return (
    (scoreA === forfeitScore && scoreB === 0) ||
    (scoreB === forfeitScore && scoreA === 0)
  );
};

const getLossPoints = (scoring, scoreFor, scoreAgainst) => {
  if (!scoring) return 0;
  const margin = scoreAgainst - scoreFor;
  return margin <= scoring.closeLossMaxMargin
    ? scoring.closeLossPoints
    : scoring.lossPoints;
};

// ---------------------------------------------------------------------------
// Form guide
// ---------------------------------------------------------------------------

/**
 * Traffic-light severity: a straight loss is amber, a canceled match (no result
 * either way) is red. A forfeit splits in two so the guilty team reads
 * differently from the team that showed up — the latter gets light blue,
 * because it neither won nor lost.
 */
export const FORM_DOT_COLORS = Object.freeze({
  win: "#16a34a", // green
  loss: "#fbbf24", // light amber — kept lighter than red for contrast at dot size
  canceled: "#dc2626", // red — no result was played
  forfeit_guilty: "#dc2626", // red — the team named in forfeit_teamA/forfeit_teamB
  forfeit_innocent: "#7dd3fc", // light blue — opponent forfeited
  scheduled: "#9ca3af", // gray (not yet played)
  draw: "#9ca3af", // gray (finished, level score)
});

export const FORM_OUTCOME_LABELS = Object.freeze({
  win: "Win",
  loss: "Loss",
  canceled: "Canceled",
  forfeit_guilty: "Forfeited",
  forfeit_innocent: "Opponent forfeited",
  scheduled: "Scheduled",
  draw: "Draw",
});

export const FORM_LEGEND_ITEMS = Object.freeze([
  "win",
  "loss",
  "forfeit_innocent",
  "forfeit_guilty",
  "scheduled",
]);

/**
 * `forfeit_teama` / `forfeit_teamb` name the guilty team explicitly. A plain
 * `forfeit` (or a 5-0 cancellation caught by the score heuristic) does not say
 * which side is to blame, so both teams fall back to the "canceled" dot and
 * neither has the forfeit counted against them.
 */
const getForfeitGuiltyTeamId = (match) => {
  const status = normaliseStatus(match?.status);
  if (status === "forfeit_teama") return match?.team_a?.id ?? null;
  if (status === "forfeit_teamb") return match?.team_b?.id ?? null;
  return null;
};

/**
 * The score line a forfeit should be counted and displayed with.
 *
 * An attributed forfeit stands on its status alone, so when the recorded score
 * is missing or level the configured forfeit line is substituted to give the
 * result a direction — a TD who sets `forfeit_teamB` without touching the
 * score still awards the win. An unattributed forfeit has no direction to
 * infer, and any other match keeps its real score.
 */
export const resolveMatchScores = (match, scoring) => {
  const scoreA = match?.score_a;
  const scoreB = match?.score_b;
  if (!isForfeitMatch(match, scoring)) return { scoreA, scoreB };
  const guiltyTeamId = getForfeitGuiltyTeamId(match);
  if (!guiltyTeamId) return { scoreA, scoreB };
  if (scoreA > scoreB || scoreB > scoreA) return { scoreA, scoreB };
  const forfeitScore = getForfeitScore(scoring);
  const guiltyIsA = guiltyTeamId === match?.team_a?.id;
  return {
    scoreA: guiltyIsA ? 0 : forfeitScore,
    scoreB: guiltyIsA ? forfeitScore : 0,
  };
};

export const getTeamMatchOutcome = (match, teamId, teamScore, oppScore, scoring) => {
  if (isCanceledMatch(match?.status)) {
    if (isForfeitMatch(match, scoring)) {
      const guiltyTeamId = getForfeitGuiltyTeamId(match);
      if (guiltyTeamId) {
        return teamId === guiltyTeamId ? "forfeit_guilty" : "forfeit_innocent";
      }
    }
    return "canceled";
  }
  if (
    isFinishedMatch(match?.status) &&
    typeof teamScore === "number" &&
    typeof oppScore === "number"
  ) {
    if (teamScore > oppScore) return "win";
    if (teamScore < oppScore) return "loss";
    return "draw";
  }
  return "scheduled";
};

const buildTeamFormEntry = (match, teamId, opponent, teamScore, oppScore, scoring) => {
  const outcome = getTeamMatchOutcome(match, teamId, teamScore, oppScore, scoring);
  const opponentName = opponent?.short_name || opponent?.name || "TBD";
  const hasScore =
    outcome !== "scheduled" &&
    typeof teamScore === "number" &&
    typeof oppScore === "number";
  const scorePart = hasScore ? ` ${teamScore}-${oppScore}` : "";
  return {
    outcome,
    title: `${FORM_OUTCOME_LABELS[outcome]}${scorePart} vs ${opponentName}`,
  };
};

// ---------------------------------------------------------------------------
// Pools & teams
// ---------------------------------------------------------------------------

const bySeedThenName = (a, b) => {
  if (a.seed !== null && b.seed !== null) {
    return a.seed - b.seed || a.name.localeCompare(b.name);
  }
  if (a.seed !== null) return -1;
  if (b.seed !== null) return 1;
  return a.name.localeCompare(b.name);
};

/** Flatten an event hierarchy into pools, giving each a stable id and name. */
export const getEventPools = (eventData) =>
  (eventData?.divisions || []).flatMap((division, divisionIndex) =>
    (division?.pools || []).map((pool, poolIndex) => ({
      ...pool,
      id: pool.id || `${division.id || divisionIndex}-${poolIndex}`,
      name: pool.name || "Pool",
    })),
  );

export const buildPoolTeams = (pool) => {
  const rows = [];
  const seen = new Set();
  (pool?.teams || []).forEach((entry) => {
    if (!entry?.team?.id || seen.has(entry.team.id)) return;
    seen.add(entry.team.id);
    rows.push({
      id: entry.team.id,
      name: entry.team.name || "Team",
      shortName: entry.team.short_name || null,
      seed:
        typeof entry.seed === "number" && !Number.isNaN(entry.seed)
          ? entry.seed
          : null,
    });
  });
  return rows.sort(bySeedThenName);
};

/** Merge several pools' teams into one de-duplicated, seed-ordered list. */
export const buildPoolGroupTeams = (pools) => {
  const rowsByTeam = new Map();
  (pools || []).forEach((pool) => {
    buildPoolTeams(pool).forEach((team) => {
      const existing = rowsByTeam.get(team.id);
      if (!existing) {
        rowsByTeam.set(team.id, team);
        return;
      }
      if (existing.seed === null || (team.seed !== null && team.seed < existing.seed)) {
        rowsByTeam.set(team.id, team);
      }
    });
  });
  return Array.from(rowsByTeam.values()).sort(bySeedThenName);
};

const buildPoolGroupIds = (pools) =>
  new Set((pools || []).map((pool) => pool?.id).filter(Boolean));

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export const formatScoreDiff = (value) => {
  if (!Number.isFinite(value) || value === 0) return "0";
  return value > 0 ? `+${value}` : `${value}`;
};

// ---------------------------------------------------------------------------
// WFDF ranking
// ---------------------------------------------------------------------------

/**
 * WFDF tie-break criteria, applied in order to a group of teams level on wins.
 *
 * Each returns a Map of teamId -> numeric score, higher ranking better. A
 * criterion only separates teams it can actually measure; `null` means "no
 * data" and is treated as unrankable, so those teams stay level and fall
 * through to the next criterion.
 *
 * `tied` is the current subgroup under consideration. Criteria scoped "between
 * the tied teams" look only at games inside it; "common opponents" looks at
 * opponents every team in the subgroup has played.
 */

const sumBy = (list, fn) => list.reduce((total, item) => total + fn(item), 0);

/** Results of `standing` against opponents in `opponentIds`. */
const resultsAgainst = (standing, opponentIds) =>
  (standing.results || []).filter((result) => opponentIds.has(result.opponentId));

/** Opponents every team in the group has played at least once. */
const getCommonOpponents = (group) => {
  const groupIds = new Set(group.map((team) => team.id));
  const opponentSets = group.map(
    (team) =>
      new Set(
        (team.results || [])
          .map((result) => result.opponentId)
          .filter((id) => id && !groupIds.has(id)),
      ),
  );
  if (!opponentSets.length) return new Set();
  return new Set(
    [...opponentSets[0]].filter((id) => opponentSets.every((set) => set.has(id))),
  );
};

const winsAgainst = (group, opponentIds) =>
  new Map(
    group.map((team) => {
      const results = resultsAgainst(team, opponentIds);
      if (!results.length) return [team.id, null];
      return [team.id, sumBy(results, (r) => (r.scoreFor > r.scoreAgainst ? 1 : 0))];
    }),
  );

const goalDiffAgainst = (group, opponentIds) =>
  new Map(
    group.map((team) => {
      const results = resultsAgainst(team, opponentIds);
      if (!results.length) return [team.id, null];
      return [team.id, sumBy(results, (r) => r.scoreFor - r.scoreAgainst)];
    }),
  );

const goalsPerGameAgainst = (group, opponentIds) =>
  new Map(
    group.map((team) => {
      const results = resultsAgainst(team, opponentIds);
      if (!results.length) return [team.id, null];
      return [team.id, sumBy(results, (r) => r.scoreFor) / results.length];
    }),
  );

const WFDF_CRITERIA = [
  {
    key: "h2h_wins",
    label: "Games won between the tied teams",
    score: (group) => winsAgainst(group, new Set(group.map((t) => t.id))),
  },
  {
    key: "forfeits",
    label: "Fewest games forfeited",
    // Negated so that, like every other criterion, higher is better.
    score: (group) => new Map(group.map((t) => [t.id, -(t.forfeited || 0)])),
  },
  {
    key: "h2h_goal_diff",
    label: "Goal difference between the tied teams",
    score: (group) => goalDiffAgainst(group, new Set(group.map((t) => t.id))),
  },
  {
    key: "common_goal_diff",
    label: "Goal difference against common opponents",
    score: (group) => goalDiffAgainst(group, getCommonOpponents(group)),
  },
  {
    key: "h2h_goals_per_game",
    label: "Goals per game between the tied teams",
    score: (group) => goalsPerGameAgainst(group, new Set(group.map((t) => t.id))),
  },
  {
    key: "common_goals_per_game",
    label: "Goals per game against common opponents",
    score: (group) => goalsPerGameAgainst(group, getCommonOpponents(group)),
  },
];

/**
 * Order a group of teams that are level on the primary criterion.
 *
 * Walks the WFDF criteria in order. The first one that splits the group at all
 * partitions it into score buckets; each bucket with more than one team is then
 * re-ranked *from the top of the criteria list* (WFDF: "if a criterion splits
 * the group only partly, the teams still level start again from the top").
 *
 * `depth` guards against a pathological cycle where a subgroup never shrinks.
 */
const rankTiedGroup = (group, depth = 0) => {
  if (group.length <= 1) return group;
  if (depth > WFDF_CRITERIA.length) {
    return [...group].sort((a, b) => a.name.localeCompare(b.name));
  }

  for (const criterion of WFDF_CRITERIA) {
    const scores = criterion.score(group);
    // Teams with no measurable data cannot be separated by this criterion.
    const ranked = group.filter((team) => scores.get(team.id) !== null);
    if (ranked.length < 2) continue;

    const distinct = new Set(ranked.map((team) => scores.get(team.id)));
    if (distinct.size < 2) continue; // criterion did not split anything

    // Partition into buckets by score, best first. Teams the criterion could
    // not measure sort last, still level with each other.
    const buckets = new Map();
    group.forEach((team) => {
      const score = scores.get(team.id);
      const key = score === null ? "__unranked__" : score;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(team);
    });

    const orderedKeys = [...buckets.keys()]
      .filter((key) => key !== "__unranked__")
      .sort((a, b) => b - a);
    if (buckets.has("__unranked__")) orderedKeys.push("__unranked__");

    return orderedKeys.flatMap((key) => {
      const bucket = buckets.get(key);
      // A bucket that still contains the whole group would recurse forever;
      // the distinct-size check above means that cannot happen here.
      return bucket.length > 1 ? rankTiedGroup(bucket, depth + 1) : bucket;
    });
  }

  // Nothing separated them — stable, predictable fallback.
  return [...group].sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Rank standings rows by a primary key, then break remaining ties with the
 * WFDF criteria.
 *
 * @param {function} primary Maps a row to a number, higher ranking better.
 */
export const rankByWfdf = (rows, primary = (row) => row.wins) => {
  const groups = new Map();
  rows.forEach((row) => {
    const key = primary(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.keys()]
    .sort((a, b) => b - a)
    .flatMap((key) => rankTiedGroup(groups.get(key)));
};

const isDateKeyInRange = (dateKey, startDateKey, endDateKey) => {
  if (!dateKey) return false;
  if (startDateKey && dateKey < startDateKey) return false;
  if (endDateKey && dateKey > endDateKey) return false;
  return true;
};

/**
 * Build one standings table from a set of pools and the event's matches.
 *
 * Match selection has two modes:
 *  - default: matches whose `pool_id` is in the group (pool play).
 *  - `matchMode: "team_date_range"`: both teams belong to the group and the
 *    match falls inside the date range. Needed when pools are merged into one
 *    division table, because crossover fixtures pair teams from different pools
 *    and so cannot be attributed by `pool_id` alone.
 *
 * @param {object} options
 * @param {object|null} options.scoring        Points model; omit for a plain W-L table.
 * @param {function}    options.getMatchDateKey Maps a match to a comparable date key
 *                                              (timezone handling is the caller's).
 */
export const buildPoolGroupStandings = (pools, matches, options = {}) => {
  const { scoring = null, getMatchDateKey } = options;
  const teams = buildPoolGroupTeams(pools);
  const poolIds = buildPoolGroupIds(pools);
  const teamIds = new Set(teams.map((team) => team.id));
  const standingsByTeam = new Map(
    teams.map((team) => [
      team.id,
      {
        ...team,
        wins: 0,
        losses: 0,
        played: 0,
        points: 0,
        scoreDiff: 0,
        forfeited: 0,
        form: [],
        // Per-opponent results, needed by the WFDF tie-breakers (head-to-head
        // and common opponents). One entry per counted game.
        results: [],
      },
    ]),
  );

  const poolMatches = (matches || []).filter((match) => {
    if (options.matchMode === "team_date_range") {
      const dateKey = getMatchDateKey ? getMatchDateKey(match) : null;
      if (
        !isDateKeyInRange(dateKey, options.matchStartDateKey, options.matchEndDateKey)
      ) {
        return false;
      }
      return teamIds.has(match?.team_a?.id) && teamIds.has(match?.team_b?.id);
    }
    return match?.pool_id && poolIds.has(match.pool_id);
  });

  poolMatches.forEach((match) => {
    const forfeit = isForfeitMatch(match, scoring);
    const teamAId = match.team_a?.id;
    const teamBId = match.team_b?.id;
    const teamAStanding = teamAId ? standingsByTeam.get(teamAId) : null;
    const teamBStanding = teamBId ? standingsByTeam.get(teamBId) : null;

    // Record a form dot for every match (played, canceled, or still scheduled).
    // The resolved scores are used so a forfeit's tooltip shows the same line
    // the table counted.
    const formScores = resolveMatchScores(match, scoring);
    if (teamAStanding) {
      teamAStanding.form.push(
        buildTeamFormEntry(
          match,
          teamAId,
          match.team_b,
          formScores.scoreA,
          formScores.scoreB,
          scoring,
        ),
      );
    }
    if (teamBStanding) {
      teamBStanding.form.push(
        buildTeamFormEntry(
          match,
          teamBId,
          match.team_a,
          formScores.scoreB,
          formScores.scoreA,
          scoring,
        ),
      );
    }

    if (!isFinishedMatch(match?.status) && !forfeit) return;

    // Which side forfeited, when the status names them. Used by the WFDF
    // "fewest games forfeited" criterion; an unattributed forfeit (a plain
    // `forfeit`, or a 5-0 cancellation) counts against neither team.
    const guiltyTeamId = forfeit ? getForfeitGuiltyTeamId(match) : null;

    const { scoreA, scoreB } = resolveMatchScores(match, scoring);
    if (typeof scoreA !== "number" || typeof scoreB !== "number") return;

    const applyResult = (standing, opponentId, scoreFor, scoreAgainst) => {
      if (!standing) return;
      standing.played += 1;
      standing.scoreDiff += scoreFor - scoreAgainst;
      if (guiltyTeamId && standing.id === guiltyTeamId) {
        standing.forfeited += 1;
      }
      standing.results.push({ opponentId, scoreFor, scoreAgainst, forfeit });
      if (scoreFor > scoreAgainst) {
        standing.wins += 1;
        if (scoring) {
          standing.points += forfeit ? scoring.forfeitWinPoints : scoring.winPoints;
        }
      } else if (scoreFor < scoreAgainst) {
        standing.losses += 1;
        if (scoring) {
          standing.points += forfeit
            ? scoring.forfeitLossPoints
            : getLossPoints(scoring, scoreFor, scoreAgainst);
        }
      }
    };

    applyResult(teamAStanding, teamBId, scoreA, scoreB);
    applyResult(teamBStanding, teamAId, scoreB, scoreA);
  });

  const rows = Array.from(standingsByTeam.values());

  // Default ranking is WFDF: primary key first, then the WFDF tie-break
  // criteria applied recursively (see rankByWfdf). Events that award league
  // points lead on points; everything else leads on games won.
  //
  // `sortBy: "legacy"` keeps the old flat comparator for any caller that needs
  // the previous behaviour.
  const sortBy = options.sortBy || "wfdf";
  if (sortBy === "legacy") {
    return rows.sort(
      (a, b) =>
        (scoring ? b.points - a.points : 0) ||
        b.wins - a.wins ||
        a.losses - b.losses ||
        b.scoreDiff - a.scoreDiff ||
        a.name.localeCompare(b.name),
    );
  }

  const primary = scoring ? (row) => row.points : (row) => row.wins;
  return rankByWfdf(rows, primary);
};
