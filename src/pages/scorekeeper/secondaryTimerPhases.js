/**
 * Phase model for the secondary timer.
 *
 * The secondary timer is not one countdown: each kind of stoppage runs through
 * a sequence of *phases* that tell the operator what should be happening on the
 * field right now ("set offence on the line", "declare contested"). The colour
 * bands follow the same sequence, so the panel turns amber exactly when the
 * timer enters its warning phase rather than at an unrelated hardcoded second.
 *
 * Phases are derived from the event rules, so editing a rule in match setup
 * moves the guidance text and the colour change together. The previous version
 * matched on the *display label* — `secondaryLabel === "discussion"`, and
 * `.includes("pre-pull timeout")` — so renaming a label silently changed
 * behaviour, and the 45s/30s/15s bands were unrelated to the rules the operator
 * had actually configured.
 *
 * Pure data: no React and no service imports.
 */

/**
 * What the timer is counting. Carried explicitly on the timer state (see
 * `startTrackedSecondaryTimer`), never inferred from the label text.
 */
export const SECONDARY_TIMER_KINDS = Object.freeze({
  INTER_POINT: "interPoint",
  /** A timeout called inside the inter-point window, before the pull. */
  PRE_PULL_TIMEOUT: "prePullTimeout",
  /** A timeout called during live play. */
  LIVE_TIMEOUT: "liveTimeout",
  DISCUSSION: "discussion",
  HALFTIME: "halftime",
  STOPPAGE: "stoppage",
});

/** Severity a phase carries, which is what the colour bands render. */
export const PHASE_TONES = Object.freeze({
  NORMAL: "normal",
  WARNING: "warning",
  URGENT: "urgent",
});

/**
 * Remaining-time thresholds.
 *
 * These are about the countdown itself rather than any rule, so they are the
 * one pair of fixed numbers in this module — they apply identically to every
 * kind and every format, and they are what makes a timer with no phases of its
 * own still warn before it expires.
 */
export const WARNING_REMAINING_SECONDS = 30;
export const URGENT_REMAINING_SECONDS = 15;

const TONE_RANK = Object.freeze({
  [PHASE_TONES.NORMAL]: 0,
  [PHASE_TONES.WARNING]: 1,
  [PHASE_TONES.URGENT]: 2,
});

/**
 * Elapsed-second boundaries, per kind, built from the normalised rules.
 *
 * Each entry is `{ from, text, tone }` and applies from `from` seconds elapsed
 * until the next entry starts. `from: 0` is the opening phase. Entries whose
 * rule is 0 or absent are dropped, so a format that does not configure a stage
 * simply does not show it rather than showing a zero-length phase.
 */
function buildPhases(kind, rules = {}) {
  const num = (value) => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

  switch (kind) {
    case SECONDARY_TIMER_KINDS.INTER_POINT: {
      const onLine = num(rules.interPointOffenceOnGoalLineSeconds);
      const ready = num(rules.interPointOffenceReadyBySeconds);
      const pull = num(rules.interPointPullDeadlineSeconds);
      return [
        { from: 0, text: "Teams leaving the field", tone: PHASE_TONES.NORMAL },
        onLine && { from: onLine, text: "Set offence on the line", tone: PHASE_TONES.NORMAL },
        ready && { from: ready, text: "Signal offence ready", tone: PHASE_TONES.WARNING },
        pull && { from: pull, text: "Pull now", tone: PHASE_TONES.URGENT },
      ];
    }

    case SECONDARY_TIMER_KINDS.PRE_PULL_TIMEOUT: {
      // The timeout runs first, then the inter-point window it interrupted
      // resumes — so the pull deadline sits that much later.
      const timeout = num(rules.timeoutSeconds);
      const ready = num(rules.interPointOffenceReadyBySeconds);
      return [
        { from: 0, text: "Timeout", tone: PHASE_TONES.NORMAL },
        timeout && {
          from: timeout,
          text: "Resume inter-point window",
          tone: PHASE_TONES.WARNING,
        },
        timeout && ready && { from: timeout + ready, text: "Pull now", tone: PHASE_TONES.URGENT },
      ];
    }

    case SECONDARY_TIMER_KINDS.LIVE_TIMEOUT: {
      const offenceSet = num(rules.inPointOffenceSetSeconds) || num(rules.timeoutSeconds);
      const within = num(rules.inPointDefenceCheckWithinSecondsAfterOffenceSet);
      const check = num(rules.inPointDefenceCheckMaxSeconds);
      const checkFrom = offenceSet && within ? offenceSet + within : check;
      return [
        { from: 0, text: "Timeout", tone: PHASE_TONES.NORMAL },
        offenceSet && {
          from: offenceSet,
          text: "Confirm offence ready",
          tone: PHASE_TONES.WARNING,
        },
        checkFrom && { from: checkFrom, text: "Check disc in", tone: PHASE_TONES.URGENT },
      ];
    }

    case SECONDARY_TIMER_KINDS.DISCUSSION: {
      const captains = num(rules.discussionCaptainInterventionSeconds);
      const contest = num(rules.discussionAutoContestSeconds);
      return [
        { from: 0, text: "Players discuss", tone: PHASE_TONES.NORMAL },
        captains && { from: captains, text: "Involve captains", tone: PHASE_TONES.WARNING },
        contest && { from: contest, text: "Declare contested", tone: PHASE_TONES.URGENT },
      ];
    }

    case SECONDARY_TIMER_KINDS.HALFTIME: {
      const total = num(rules.halftimeBreakMinutes) * 60;
      // The last minute is the cue to get both lines back out.
      const warn = total > 60 ? total - 60 : 0;
      return [
        { from: 0, text: "Half time break", tone: PHASE_TONES.NORMAL },
        warn && { from: warn, text: "Call teams back on", tone: PHASE_TONES.WARNING },
        total && { from: total, text: "Restart play", tone: PHASE_TONES.URGENT },
      ];
    }

    default:
      return [];
  }
}

/** Title shown above the phase text. */
const KIND_TITLES = Object.freeze({
  [SECONDARY_TIMER_KINDS.INTER_POINT]: "Inter-point timer",
  [SECONDARY_TIMER_KINDS.PRE_PULL_TIMEOUT]: "Time-out (between points)",
  [SECONDARY_TIMER_KINDS.LIVE_TIMEOUT]: "Timeout (during a point)",
  [SECONDARY_TIMER_KINDS.DISCUSSION]: "Discussion",
  [SECONDARY_TIMER_KINDS.HALFTIME]: "Half time",
  [SECONDARY_TIMER_KINDS.STOPPAGE]: "Game stoppage",
});

export function getSecondaryTimerTitle(kind) {
  return KIND_TITLES[kind] || null;
}

/**
 * The phase list for a kind, cleaned of dropped entries and ordered.
 *
 * Two rules can share a value, which would otherwise produce a zero-length
 * phase. Collisions collapse to the later entry, so the more urgent guidance is
 * the one the operator actually sees.
 */
export function getSecondaryTimerPhases(kind, rules) {
  const phases = buildPhases(kind, rules).filter(Boolean);
  const byFrom = new Map();
  phases.forEach((phase) => byFrom.set(phase.from, phase));
  return [...byFrom.values()].sort((a, b) => a.from - b.from);
}

/** The phase in force at `elapsedSeconds`, or null when the kind has none. */
export function getActiveSecondaryTimerPhase(kind, rules, elapsedSeconds) {
  const phases = getSecondaryTimerPhases(kind, rules);
  if (!phases.length || !Number.isFinite(elapsedSeconds)) return null;
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));
  let active = null;
  phases.forEach((phase) => {
    if (elapsed >= phase.from) active = phase;
  });
  return active;
}

/**
 * Tone for the timer right now, which is what the panel background renders.
 *
 * Two independent signals are folded together, worst wins:
 *   - the phase the timer has reached (rule-driven, above)
 *   - how little time is left (a countdown about to expire is urgent whatever
 *     phase it is in, and this is what covers kinds with no phases at all)
 */
export function getSecondaryTimerTone(kind, rules, { elapsedSeconds, remainingSeconds }) {
  const phase = getActiveSecondaryTimerPhase(kind, rules, elapsedSeconds);
  const byPhase = phase?.tone || PHASE_TONES.NORMAL;
  const remaining = Number.isFinite(remainingSeconds) ? remainingSeconds : null;
  const byRemaining =
    remaining === null
      ? PHASE_TONES.NORMAL
      : remaining <= URGENT_REMAINING_SECONDS
        ? PHASE_TONES.URGENT
        : remaining <= WARNING_REMAINING_SECONDS
          ? PHASE_TONES.WARNING
          : PHASE_TONES.NORMAL;
  return TONE_RANK[byRemaining] > TONE_RANK[byPhase] ? byRemaining : byPhase;
}

/** Flash cadence per tone. `null` means "do not flash". */
export function getFlashRateMs(tone) {
  if (tone === PHASE_TONES.URGENT) return 175;
  if (tone === PHASE_TONES.WARNING) return 450;
  return null;
}
