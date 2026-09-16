/**
 * Format definitions for the modular scorekeeper console.
 *
 * The console is one implementation parameterised by the format the operator
 * picks in match setup. A format is split into two groups on purpose:
 *
 *   capabilities — what the operator can *do*. The product-level difference
 *                  between formats (Full tracks possession, Lite does not).
 *                  This is the axis that grows: a future beach or hat-league
 *                  format is defined by which features it switches off, so
 *                  adding one is a new entry here rather than a new branch in
 *                  the console.
 *
 *   flags        — how a *shared* behaviour is parameterised. Not "which
 *                  feature", but "what number / which variant" of a behaviour
 *                  both formats have.
 *
 * Keeping them apart is what stops this file decaying into the pile of
 * unrelated booleans that the legacy 7v7/5v5 console split produced.
 *
 * Pure data: no React and no service imports, so the hooks, the view and the
 * popups can all read it without an import cycle.
 */

import { MATCH_STATUS } from "../../constants/statusCodes";

export const SCOREKEEPER_FORMAT_KEYS = Object.freeze({
  FULL: "full",
  LITE: "lite",
});

/**
 * Keys these formats used to be addressed by. The console was originally reached
 * as `?mode=7v7` / `?mode=5v5`, and those URLs are bookmarked and pasted around,
 * so they still resolve. The player-count naming is otherwise gone: the formats
 * differ by how much the operator tracks, not by how many players are on the
 * field, and a 7-a-side game scored with the Lite feature set is a normal thing
 * to want.
 */
const LEGACY_FORMAT_KEY_ALIASES = Object.freeze({
  "7v7": SCOREKEEPER_FORMAT_KEYS.FULL,
  "5v5": SCOREKEEPER_FORMAT_KEYS.LITE,
});

/**
 * Hard ceiling on overtime, for every format.
 *
 * The primary clock counts negative past 00:00 so overtime is visible, but an
 * uncapped count runs forever when a console is left open on a finished field.
 * One hour is far beyond any real overtime and short enough to stop a runaway.
 */
export const OVERTIME_CAP_SECONDS = 60 * 60;

/**
 * Every capability the console can gate, with the value a format gets when it
 * does not mention the key. Listing them here means a new format cannot
 * silently inherit `undefined` (which reads as "off") for a capability added
 * later — `resolveScorekeeperFormat` fills the gap from this table.
 */
const CAPABILITY_DEFAULTS = Object.freeze({
  /** Possession pad: which team holds the disc, and the auto-flip on score. */
  possession: true,
  /** Operator-logged turnover. Implies `possession` — see assertFormatShape. */
  turnover: true,
  /** Block event (`match_events.block`). Implies `possession`. */
  block: true,
  /**
   * Whether ending a match hands the operator on to WFDF spirit scoring.
   * Off for casual play, where there is no spirit score to submit and the
   * handoff would strand the operator on a form they cannot complete.
   */
  spiritScores: true,
});

const FLAG_DEFAULTS = Object.freeze({
  /**
   * How far past 00:00 the primary clock may run.
   * `maxSeconds` caps the negative count; the clock stops there rather than
   * running away unattended. `stopOnCapWinner` halts overtime once a team has
   * reached the target, so a decided match stops ticking.
   */
  overtime: Object.freeze({ maxSeconds: OVERTIME_CAP_SECONDS, stopOnCapWinner: true }),
  /**
   * Cap target modes the setup modal offers. Every mode listed here must be
   * implemented by the cap paths in the data hook — see assertFormatShape.
   *
   * "addTwoToHighest" is deliberately absent: it is not a WFDF rule. Events
   * still holding it read as "addOneToHighest" (normalizeSoftCapMode).
   */
  capTargetModes: Object.freeze(["none", "addOneToHighest"]),
  /** Setting match duration also sets the hard cap minute. */
  coupleMatchDurationToHardCap: false,
  /** Setting the pull deadline also sets the inter-point window. */
  coupleInterPointPullDeadline: false,
  /**
   * Whether match setup exposes the advanced rule fields: the cap end-modes and
   * targets, discussion duration, and per-half timeouts.
   *
   * This is about how much detail the operator is asked to configure, not about
   * which rules apply — every format runs the same cap logic, and a hidden field
   * keeps whatever the event supplied. Casual hides them so setup is a short form.
   */
  advancedRuleFieldsEditable: true,
  /** Halftime/stoppage log entries: editable, or delete-only. */
  allowEditSimpleEvents: true,
});

export const SCOREKEEPER_FORMATS = Object.freeze({
  [SCOREKEEPER_FORMAT_KEYS.FULL]: Object.freeze({
    key: SCOREKEEPER_FORMAT_KEYS.FULL,
    /**
     * What the operator sees. The internal key is "full"; the audience-facing
     * name is "Competitive". Keeping them separate means the console can be
     * rebranded without touching the key that session storage and URLs use.
     */
    name: "Competitive",
    label: "Competitive",
    tagline: "Full tracking",
    description: "Possession, turnovers and blocks are tracked point by point, alongside scores and timers.",
    consoleTitle: "Score keeper",
    setupModalTitle: "Match setup",
    liveActivityKey: "scorekeeper",
    logPrefix: "[ScoreKeeper Full]",
    /**
     * Session-storage namespace. Deliberately still the legacy string: renaming
     * it would orphan any match a scorekeeper has mid-game on their device at
     * the moment this ships. It is an internal key, never shown.
     */
    sessionRuleset: "7v7",
    /**
     * Status this format writes when the operator ends the match.
     *
     * `finished` is deliberately not the end of the road for Competitive: the
     * console hands the operator to the spirit-score form, which writes
     * `completed` on submit. So `finished` means "played out, spirit scores
     * still outstanding" and `completed` means "fully done" — a real
     * distinction a TD can act on, not two spellings of one state. Casual has
     * no spirit step, so it writes `completed` directly.
     *
     * statusCodes.js treats both as concluded, so either is safe downstream.
     */
    endMatchStatus: MATCH_STATUS.FINISHED,
    capabilities: Object.freeze({
      possession: true,
      turnover: true,
      block: true,
      spiritScores: true,
    }),
    flags: Object.freeze({
      overtime: Object.freeze({ maxSeconds: OVERTIME_CAP_SECONDS, stopOnCapWinner: true }),
      capTargetModes: Object.freeze(["none", "addOneToHighest"]),
      coupleMatchDurationToHardCap: false,
      coupleInterPointPullDeadline: false,
      advancedRuleFieldsEditable: true,
      allowEditSimpleEvents: true,
    }),
  }),

  [SCOREKEEPER_FORMAT_KEYS.LITE]: Object.freeze({
    key: SCOREKEEPER_FORMAT_KEYS.LITE,
    name: "Casual",
    label: "Casual",
    tagline: "Scores and timers",
    description: "Scores, timeouts and halftime only. No possession or turnover tracking, and no spirit scores.",
    consoleTitle: "Score keeper",
    setupModalTitle: "Match setup",
    liveActivityKey: "scorekeeper-5v5",
    logPrefix: "[ScoreKeeper Lite]",
    sessionRuleset: "5v5",
    // No spirit-score step, so ending the match is the final state.
    endMatchStatus: MATCH_STATUS.COMPLETED,
    // Lite is Full minus possession tracking and minus spirit scoring.
    // Callahan is not listed: it is a way to score a point, so it is never
    // optional and is not a capability any format can switch off.
    capabilities: Object.freeze({
      possession: false,
      turnover: false,
      block: false,
      spiritScores: false,
    }),
    // Casual runs the *same rules* as Competitive — the cap logic is identical,
    // and the couplings are off in both. It previously coupled match duration to
    // the hard cap, but the couplings only fired on manual edits, so a Casual
    // match ran against a hidden hard cap inherited from the event defaults that
    // had nothing to do with its duration.
    //
    // What differs is how much setup the operator is asked to fill in:
    // `advancedRuleFieldsEditable: false` keeps the form short. The hidden fields
    // still apply — they just take whatever the event supplied.
    flags: Object.freeze({
      overtime: Object.freeze({ maxSeconds: OVERTIME_CAP_SECONDS, stopOnCapWinner: true }),
      capTargetModes: Object.freeze(["none", "addOneToHighest"]),
      coupleMatchDurationToHardCap: false,
      coupleInterPointPullDeadline: false,
      advancedRuleFieldsEditable: false,
      allowEditSimpleEvents: true,
    }),
  }),
});

export const DEFAULT_SCOREKEEPER_FORMAT = SCOREKEEPER_FORMAT_KEYS.FULL;

/** Chooser order. */
export const SCOREKEEPER_FORMAT_LIST = Object.freeze([
  SCOREKEEPER_FORMATS[SCOREKEEPER_FORMAT_KEYS.FULL],
  SCOREKEEPER_FORMATS[SCOREKEEPER_FORMAT_KEYS.LITE],
]);

/** Normalise a key, resolving a legacy alias. Returns null if unrecognised. */
function canonicalFormatKey(input) {
  const key = String(input || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(SCOREKEEPER_FORMATS, key)) return key;
  return LEGACY_FORMAT_KEY_ALIASES[key] || null;
}

export function isScorekeeperFormatKey(input) {
  return canonicalFormatKey(input) !== null;
}

/**
 * Resolve a format key (typically `?mode=` from the URL) to its descriptor.
 *
 * Always returns a usable descriptor — an unknown or missing key falls back to
 * Full, so a malformed key degrades to "everything available" rather than
 * silently hiding controls the operator needs. Legacy `7v7`/`5v5` keys resolve
 * to Full/Lite.
 *
 * Missing capability/flag keys are filled from the defaults above so a format
 * added later cannot read `undefined` for a capability introduced after it.
 */
export function resolveScorekeeperFormat(input) {
  const key = canonicalFormatKey(input);
  const format =
    SCOREKEEPER_FORMATS[key] || SCOREKEEPER_FORMATS[DEFAULT_SCOREKEEPER_FORMAT];
  return {
    ...format,
    capabilities: { ...CAPABILITY_DEFAULTS, ...format.capabilities },
    flags: {
      ...FLAG_DEFAULTS,
      ...format.flags,
      overtime: { ...FLAG_DEFAULTS.overtime, ...(format.flags?.overtime || {}) },
    },
  };
}

/**
 * Capabilities that only make sense alongside another one. Turnover and block
 * are both possession events: offering either while the possession pad is
 * hidden would log a possession change the operator can neither see nor correct.
 */
const CAPABILITY_REQUIRES = Object.freeze({
  turnover: "possession",
  block: "possession",
});

/**
 * Cap target modes the data hook's cap paths actually implement.
 *
 * Offering a mode the logic does not handle is worse than not offering it: the
 * soft cap honoured "addTwoToHighest" while the time-cap and halftime-cap paths
 * tested `=== "addOneToHighest"`, so a match configured that way got a soft-cap
 * target and then *no* cap target at all, and could not be ended on a cap. The
 * check below is what makes that class of gap fail loudly at module load.
 */
const IMPLEMENTED_CAP_TARGET_MODES = Object.freeze(["none", "addOneToHighest"]);

/**
 * Dev-only shape check. Catches a format whose capabilities contradict each
 * other (turnover on, possession off) or which offers a cap mode the logic does
 * not implement, at module load rather than as a confusing half-disabled
 * console on the field.
 */
export function assertFormatShape(format) {
  const problems = [];
  Object.entries(CAPABILITY_REQUIRES).forEach(([capability, requirement]) => {
    if (format.capabilities?.[capability] && !format.capabilities?.[requirement]) {
      problems.push(`"${capability}" requires "${requirement}"`);
    }
  });
  const capTargetModes = format.flags?.capTargetModes;
  if (!capTargetModes?.includes("none")) {
    problems.push('capTargetModes must include "none"');
  }
  (capTargetModes || []).forEach((mode) => {
    if (!IMPLEMENTED_CAP_TARGET_MODES.includes(mode)) {
      problems.push(`capTargetModes offers "${mode}", which the cap logic does not implement`);
    }
  });
  return problems;
}

if (import.meta.env?.DEV) {
  SCOREKEEPER_FORMAT_LIST.forEach((entry) => {
    const problems = assertFormatShape(resolveScorekeeperFormat(entry.key));
    if (problems.length) {
      console.error(`[scorekeeperFormats] ${entry.key}: ${problems.join("; ")}`);
    }
  });
}
