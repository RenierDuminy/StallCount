/**
 * The canonical status vocabulary, mirroring `public.match_status(code)`.
 *
 * Both `matches.status` and `events.Status` are foreign keys to that table, so
 * the two share one vocabulary — an event and a match are described by the same
 * codes. Anything not listed here cannot exist in the database, and a filter
 * written against an invented value silently matches nothing.
 *
 * NOTE: `initialized` was previously stored capitalised (`Initialized`) in the
 * match_status lookup table; that row has been renamed to lowercase. Existing
 * match rows written before the rename may still read back as `Initialized`
 * until corrected, but any new write must use the lowercase code or it will
 * fail the FK. Use the constants rather than retyping literals.
 *
 * `forfeit_teamA` / `forfeit_teamB` record *which* team forfeited (for future
 * team-statistics use) but are deliberately treated as plain `forfeit` for
 * every predicate/display purpose below — see `isForfeitStatus`.
 */
export const MATCH_STATUS = Object.freeze({
  CANCELED: "canceled",
  COMPLETED: "completed",
  FINISHED: "finished",
  FORFEIT: "forfeit",
  FORFEIT_TEAM_A: "forfeit_teamA",
  FORFEIT_TEAM_B: "forfeit_teamB",
  HALFTIME: "halftime",
  INITIALIZED: "initialized",
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
 * A match that will not be played further. `canceled` and every forfeit
 * variant are terminal without a normal result; `completed` and `finished`
 * are both in use as "played to a conclusion" (two generations of the same
 * idea).
 */
export const CLOSED_STATUSES = Object.freeze([
  MATCH_STATUS.COMPLETED,
  MATCH_STATUS.FINISHED,
  MATCH_STATUS.CANCELED,
  MATCH_STATUS.FORFEIT,
  MATCH_STATUS.FORFEIT_TEAM_A,
  MATCH_STATUS.FORFEIT_TEAM_B,
]);

/**
 * Every code that means "this match was forfeited", regardless of which team.
 * `forfeit_teamA`/`forfeit_teamB` carry which side forfeited for later
 * team-statistics work; nothing downstream needs that distinction yet.
 */
export const FORFEIT_STATUSES = Object.freeze([
  MATCH_STATUS.FORFEIT,
  MATCH_STATUS.FORFEIT_TEAM_A,
  MATCH_STATUS.FORFEIT_TEAM_B,
]);

/** Finished with a real result — the set that belongs on "Latest results". */
export const CONCLUDED_STATUSES = Object.freeze([
  MATCH_STATUS.COMPLETED,
  MATCH_STATUS.FINISHED,
]);

// Lowercased so the predicates below can compare case-insensitively — kept
// even now that all codes are canonically lowercase, since callers pass
// through raw values from anywhere (including any pre-rename `Initialized`
// rows still sitting in the DB from before the lookup table was corrected).
const toLowerSet = (codes) => new Set(codes.map((code) => code.toLowerCase()));

const IN_PROGRESS_SET = toLowerSet(IN_PROGRESS_STATUSES);
const PENDING_SET = toLowerSet(PENDING_STATUSES);
const CLOSED_SET = toLowerSet(CLOSED_STATUSES);
const CONCLUDED_SET = toLowerSet(CONCLUDED_STATUSES);
const FORFEIT_SET = toLowerSet(FORFEIT_STATUSES);

/**
 * Normalise a raw value for comparison.
 *
 * Everything is lowercased, which folds a stray legacy `Initialized` into
 * `initialized` — fine for the predicates below, which compare against
 * lowercased sets. Never send a normalised value back to the database; use
 * MATCH_STATUS for that.
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

/** Any forfeit variant (`forfeit`, `forfeit_teamA`, `forfeit_teamB`). */
export function isForfeitStatus(status) {
  return FORFEIT_SET.has(normalise(status));
}

/**
 * The status to use for display purposes (cards, badges, colour lookups).
 *
 * Forfeits are folded into `canceled` here — a forfeit is shown as a canceled
 * match card for now, team-level forfeit statistics are future work. This
 * never touches the stored value; only pass the *result* to UI, never write
 * it back to the database.
 */
export function getDisplayStatus(status) {
  return isForfeitStatus(status) ? MATCH_STATUS.CANCELED : status;
}

/**
 * Has this match been set up in a scorekeeper console (pulling team chosen,
 * rules captured) — i.e. is it past `scheduled`/`postponed`?
 *
 * The console's "can I press Start match" gate asks this of the *match*, not of
 * the setup form. The form is rebuilt from the saved row every time the active
 * match changes, and that round-trip is lossy (`abba_pattern` is stored as
 * "none" whenever ABBA is off, which reads back as an empty form field), so a
 * form-shaped check reports a correctly-initialised match as un-initialised.
 */
export function isInitialisedStatus(status) {
  const normalised = normalise(status);
  return (
    normalised === MATCH_STATUS.INITIALIZED || IN_PROGRESS_SET.has(normalised)
  );
}

/**
 * The status an initialising console should write.
 *
 * A match already under way keeps its in-progress status — a scorekeeper
 * reconfiguring mid-game must not rewind it to `initialized`. Everything else
 * the console will open (`scheduled`, `postponed`, `initialized`, or a legacy
 * capitalised `Initialized`) is promoted. Never echo the caller's raw value
 * back: a pre-rename `Initialized` written verbatim fails the FK on
 * `match_status(code)`.
 */
export function getInitialisedStatusFor(currentStatus) {
  return isInProgressStatus(currentStatus)
    ? normalise(currentStatus)
    : MATCH_STATUS.INITIALIZED;
}
