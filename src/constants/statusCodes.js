/**
 * The canonical status vocabulary, mirroring `public.match_status(code)`.
 *
 * Both `matches.status` and `events.Status` are foreign keys to that table, so
 * the two share one vocabulary — an event and a match are described by the same
 * nine codes. Anything not listed here cannot exist in the database, and a
 * filter written against an invented value silently matches nothing.
 *
 * Verified against production: every value in use is one of these, and no other
 * value appears in either column.
 *
 * NOTE: `Initialized` is the only code with a capital letter. Comparisons are
 * case-sensitive in SQL, so use the constants rather than retyping literals.
 */
export const MATCH_STATUS = Object.freeze({
  CANCELED: "canceled",
  COMPLETED: "completed",
  FINISHED: "finished",
  FORFEIT: "forfeit",
  HALFTIME: "halftime",
  INITIALIZED: "Initialized",
  LIVE: "live",
  POSTPONED: "postponed",
  SCHEDULED: "scheduled",
});

/** Every valid code, exactly as stored. */
export const ALL_STATUS_CODES = Object.freeze(Object.values(MATCH_STATUS));

/**
 * A match currently being played. `halftime` counts: the match is in progress,
 * it is simply between halves.
 */
export const IN_PROGRESS_STATUSES = Object.freeze([
  MATCH_STATUS.LIVE,
  MATCH_STATUS.HALFTIME,
]);

/**
 * A match that has not started but is still expected to.
 *
 * `postponed` is deliberately included: it has no new date yet but has not been
 * abandoned, so it still belongs on upcoming listings.
 */
export const PENDING_STATUSES = Object.freeze([
  MATCH_STATUS.SCHEDULED,
  MATCH_STATUS.INITIALIZED,
  MATCH_STATUS.POSTPONED,
]);

/**
 * "Open" = worth showing on live/upcoming surfaces: in progress or still to
 * come. This is what getOpenMatches selects on.
 */
export const OPEN_MATCH_STATUSES = Object.freeze([
  ...IN_PROGRESS_STATUSES,
  ...PENDING_STATUSES,
]);

/**
 * A match that will not be played further. `canceled` and `forfeit` are
 * terminal without a normal result; `completed` and `finished` are both in use
 * as "played to a conclusion" (two generations of the same idea).
 */
export const CLOSED_STATUSES = Object.freeze([
  MATCH_STATUS.COMPLETED,
  MATCH_STATUS.FINISHED,
  MATCH_STATUS.CANCELED,
  MATCH_STATUS.FORFEIT,
]);

/** Finished with a real result — the set that belongs on "Latest results". */
export const CONCLUDED_STATUSES = Object.freeze([
  MATCH_STATUS.COMPLETED,
  MATCH_STATUS.FINISHED,
]);

// Lowercased so the predicates below can compare case-insensitively — needed
// because `Initialized` is stored capitalised and callers pass through raw
// values from anywhere.
const toLowerSet = (codes) => new Set(codes.map((code) => code.toLowerCase()));

const IN_PROGRESS_SET = toLowerSet(IN_PROGRESS_STATUSES);
const PENDING_SET = toLowerSet(PENDING_STATUSES);
const CLOSED_SET = toLowerSet(CLOSED_STATUSES);
const CONCLUDED_SET = toLowerSet(CONCLUDED_STATUSES);

/**
 * Normalise a raw value for comparison.
 *
 * Everything is lowercased, which folds `Initialized` into `initialized` — fine
 * for the predicates below, which compare against lowercased sets. Never send a
 * normalised value back to the database; use MATCH_STATUS for that.
 */
function normalise(status) {
  return (status || "").toString().trim().toLowerCase();
}

export function isInProgressStatus(status) {
  return IN_PROGRESS_SET.has(normalise(status));
}

/** Not started, but still expected to be played. */
export function isPendingStatus(status) {
  return PENDING_SET.has(normalise(status));
}

/** Terminal: played out, canceled, or forfeited. */
export function isClosedStatus(status) {
  return CLOSED_SET.has(normalise(status));
}

/** Played to a conclusion, so it has a meaningful score. */
export function isConcludedStatus(status) {
  return CONCLUDED_SET.has(normalise(status));
}
