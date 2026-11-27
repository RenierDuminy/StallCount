/**
 * The five WFDF Spirit of the Game categories, in scoresheet order. This is the
 * ONLY definition: every form that takes a spirit score and every page that
 * shows one reads its keys, order and wording from here.
 *
 * `key` is the spirit_scores column. Two column names do not match the WFDF
 * category they hold, and must never be relabelled from the column name:
 *   - `self_control` holds category 3, FAIR-MINDEDNESS;
 *   - `positive_attitude` holds category 4, POSITIVE ATTITUDE & SELF-CONTROL.
 * (The tournament director's editor once labelled `self_control` as
 * "Self-control", so its edits landed in the Fair-mindedness score.)
 *
 * `label` is the full WFDF name, `short` the column heading on narrow tables,
 * `description` the scoresheet's guidance, shown where a score is entered.
 */
export const SPIRIT_DIMENSIONS = [
  {
    key: "rules_knowledge",
    label: "Rules knowledge & use",
    short: "Rules",
    description:
      "They did not purposefully misinterpret the rules, kept to time limits, and when they did not know a rule they were willing to learn.",
  },
  {
    key: "fouls_contact",
    label: "Fouls & body contact",
    short: "Fouls",
    description: "They avoided fouling, body contact and dangerous plays.",
  },
  {
    key: "self_control",
    label: "Fair-mindedness",
    short: "Fair",
    description:
      "They apologised when appropriate, told teammates when a call was wrong or unnecessary, and only made significant calls.",
  },
  {
    key: "positive_attitude",
    label: "Positive attitude & self-control",
    short: "Attitude",
    description:
      "They were polite, played with appropriate intensity whatever the score, and left a positive impression during and after the game.",
  },
  {
    key: "communication",
    label: "Communication",
    short: "Comms",
    description: "They communicated respectfully, listened, and kept to discussion time limits.",
  },
];

// WFDF scale: 0-4 per category, 0-20 total. The DB CHECK allows 0-5, so values
// are clamped here rather than trusted, and no form accepts more than 4.
export const SPIRIT_MAX_SCORE = 4;
export const SPIRIT_MAX_TOTAL = SPIRIT_MAX_SCORE * SPIRIT_DIMENSIONS.length;

/** WFDF Spirit of the Game scoresheet wording for each value. */
export const SPIRIT_SCALE = [
  { value: 0, label: "Poor" },
  { value: 1, label: "Not so good" },
  { value: 2, label: "Good" },
  { value: 3, label: "Very good" },
  { value: 4, label: "Excellent" },
].filter(({ value }) => value <= SPIRIT_MAX_SCORE);

const clampScore = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(SPIRIT_MAX_SCORE, Math.max(0, num));
};

/**
 * Total of one spirit row on the WFDF scale: each category clamped to 0-4, a
 * missing category left out. Null when no category is set.
 */
export function spiritRowTotal(row) {
  if (!row) return null;
  let total = 0;
  let scored = 0;
  SPIRIT_DIMENSIONS.forEach(({ key }) => {
    const raw = row[key];
    if (raw === null || raw === undefined || raw === "") return;
    const score = clampScore(raw);
    if (score === null) return;
    total += score;
    scored += 1;
  });
  return scored ? total : null;
}

/**
 * Aggregates finalised spirit rows into one entry per rated team.
 *
 * Duplicate submissions for the same (match, rated team) collapse to the latest
 * `submitted_at`, so a resubmission replaces rather than double-counts.
 * Returns `Map<teamId, { teamId, games, averages: {key: number|null}, total }>`
 * where `total` is the sum of the category averages (0-20).
 */
export function dedupeSpiritRows(rows) {
  const latest = new Map();
  (rows || []).forEach((row) => {
    if (!row?.match_id || !row?.rated_team_id) return;
    const key = `${row.match_id}:${row.rated_team_id}`;
    const existing = latest.get(key);
    if (!existing || String(row.submitted_at || "") >= String(existing.submitted_at || "")) {
      latest.set(key, row);
    }
  });
  return [...latest.values()];
}

/**
 * One spirit row made safe to display: every category clamped to 0-SPIRIT_MAX_SCORE
 * (null stays null, never 0), and `total` recomputed from those categories, or
 * null when none is set. The stored `total` adds the unclamped values and reads
 * a missing category as 0, so it is never shown directly.
 */
export function normaliseSpiritRow(row) {
  if (!row) return row;
  const next = { ...row };
  let total = 0;
  let scored = 0;
  SPIRIT_DIMENSIONS.forEach(({ key }) => {
    const raw = row[key];
    const score = raw === null || raw === undefined || raw === "" ? null : clampScore(raw);
    next[key] = score;
    if (score !== null) {
      total += score;
      scored += 1;
    }
  });
  next.total = scored ? total : null;
  return next;
}

/**
 * The spirit rows every page should count: final rows only (a row without an
 * `is_final` field is taken as final), one per (match, rated team), the latest
 * submission winning, normalised. Captains, scorekeepers and tournament
 * directors can each submit for the same match, so a pair often has several
 * rows; averaging them blended old and new scores on the match and team pages.
 */
export function latestFinalSpiritRows(rows) {
  const finals = (rows || []).filter((row) => row && row.is_final !== false);
  return dedupeSpiritRows(finals).map(normaliseSpiritRow);
}

export function buildSpiritRanking(rows) {
  const latest = dedupeSpiritRows(rows);

  const byTeam = new Map();
  latest.forEach((row) => {
    const entry = byTeam.get(row.rated_team_id) || {
      teamId: row.rated_team_id,
      games: 0,
      sums: {},
      counts: {},
    };
    entry.games += 1;
    SPIRIT_DIMENSIONS.forEach(({ key }) => {
      const score = clampScore(row[key]);
      if (score === null) return;
      entry.sums[key] = (entry.sums[key] || 0) + score;
      entry.counts[key] = (entry.counts[key] || 0) + 1;
    });
    byTeam.set(row.rated_team_id, entry);
  });

  const result = new Map();
  byTeam.forEach((entry, teamId) => {
    const averages = {};
    let total = 0;
    SPIRIT_DIMENSIONS.forEach(({ key }) => {
      const count = entry.counts[key] || 0;
      averages[key] = count ? entry.sums[key] / count : null;
      total += averages[key] ?? 0;
    });
    result.set(teamId, { teamId, games: entry.games, averages, total });
  });
  return result;
}

export const formatSpiritScore = (value, digits = 2) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "–";

/**
 * Event-wide spirit profile: per category, the mean of the team averages (each
 * team weighs the same), plus the mean total. Returns null when no team has
 * scores.
 */
export function summariseSpiritRanking(ranking) {
  const teams = [...ranking.values()];
  if (!teams.length) return null;

  const average = {};
  SPIRIT_DIMENSIONS.forEach(({ key }) => {
    const values = teams.map((team) => team.averages[key]).filter((value) => value !== null);
    if (!values.length) return;
    average[key] = values.reduce((sum, value) => sum + value, 0) / values.length;
  });

  const totals = teams.map((team) => team.total);
  return {
    teams: teams.length,
    average,
    averageTotal: totals.reduce((sum, value) => sum + value, 0) / totals.length,
  };
}
