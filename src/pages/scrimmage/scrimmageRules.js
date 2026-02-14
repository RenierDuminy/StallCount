import {
  DEFAULT_DISCUSSION_SECONDS,
  DEFAULT_INTERPOINT_SECONDS,
  DEFAULT_TIMEOUT_SECONDS,
} from "./scrimmageConstants";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const coerceNonNegativeInteger = (value, fallback = 0) => {
  const numeric = toNumber(value);
  if (numeric === null) return Math.max(0, Math.round(fallback));
  return Math.max(0, Math.round(numeric));
};

const normalizeAbbaPattern = (value) => {
  if (typeof value !== "string") return "none";
  const normalized = value.trim().toLowerCase();
  if (normalized === "male" || normalized === "m") return "male";
  if (normalized === "female" || normalized === "f") return "female";
  return "none";
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const deepMerge = (base, overrides) => {
  if (!isPlainObject(base)) return isPlainObject(overrides) ? { ...overrides } : base;
  if (!isPlainObject(overrides)) return { ...base };
  const next = { ...base };
  Object.entries(overrides).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      next[key] = deepMerge(base[key], value);
      return;
    }
    next[key] = value;
  });
  return next;
};

const parseRawRules = (rawRules) => {
  if (!rawRules) return null;
  if (typeof rawRules === "string") {
    try {
      return JSON.parse(rawRules);
    } catch {
      return null;
    }
  }
  return isPlainObject(rawRules) ? rawRules : null;
};

export const DEFAULT_SCRIMMAGE_RULES = {
  format: "localSimple",
  division: "mixed",
  clock: {
    isRunningGameClockEnabled: true,
  },
  game: {
    pointTarget: null,
    softCapMinutes: null,
    softCapMode: "none",
    timeCapMinutes: 0,
    timeCapEndMode: "afterPoint",
    timeCapTargetMode: null,
  },
  half: {
    halftimePointTarget: 0,
    halftimeCapMinutes: 30,
    halftimeCapEndMode: "afterPoint",
    halftimeCapTargetMode: null,
    halftimeBreakMinutes: 7,
  },
  timeouts: {
    perTeamPerGame: 2,
    perHalf: 0,
    durationSeconds: DEFAULT_TIMEOUT_SECONDS,
  },
  interPoint: {
    offenceOnGoalLineBySeconds: 45,
    offenceReadyBySeconds: 60,
    defencePullBySeconds: DEFAULT_INTERPOINT_SECONDS,
    pullAllowedLaterIfOffenceReadyLate: true,
    defencePullWithinSecondsAfterOffenceReady: 15,
    prePullTimeoutAddsSeconds: DEFAULT_TIMEOUT_SECONDS,
    areTimeoutsStackedBeforePull: true,
    mixedRatioAnnouncementDeadlineSeconds: 15,
  },
  discInPlay: {
    pivotCentralZoneMaxSeconds: 10,
    pivotEndZoneMaxSeconds: 20,
    postPullDiscToRestRetrievalMaxSeconds: 20,
    oobTurnoverDiscToRestRetrievalMaxSeconds: 20,
  },
  discussions: {
    captainInterventionSeconds: 15,
    autoContestSeconds: 45,
    restartPlayMaxSeconds: DEFAULT_DISCUSSION_SECONDS,
  },
  inPointTimeout: {
    offenceSetSeconds: 75,
    defenceCheckMaxSeconds: 90,
    defenceCheckWithinSecondsAfterOffenceSet: 15,
  },
  mixedRatio: {
    isEnabled: false,
    ratioRule: "A",
    ratioRuleA: {
      chooser: "home",
      pattern: "AA-BB repeating in 2-point blocks",
      halftimeAffectsPattern: false,
    },
    prescribedPullRule: {
      isEnabled: true,
      fourFemaleMeansFemalePull: true,
      fourMaleMeansMalePull: true,
    },
    abbaPattern: "none",
  },
};

export const cloneScrimmageRules = () =>
  JSON.parse(JSON.stringify(DEFAULT_SCRIMMAGE_RULES));

function buildNestedRules(rawRules) {
  const parsed = parseRawRules(rawRules);
  const base = cloneScrimmageRules();
  if (!parsed) return base;

  const merged = deepMerge(base, {
    format: parsed.format,
    division: parsed.division,
    clock: parsed.clock,
    game: parsed.game,
    half: parsed.half,
    timeouts: parsed.timeouts,
    interPoint: parsed.interPoint,
    discInPlay: parsed.discInPlay,
    discussions: parsed.discussions,
    inPointTimeout: parsed.inPointTimeout,
    mixedRatio: parsed.mixedRatio,
  });

  if (hasOwn(parsed, "matchDuration")) {
    merged.game.timeCapMinutes = parsed.matchDuration;
  }
  if (hasOwn(parsed, "gamePointTarget")) {
    merged.game.pointTarget = parsed.gamePointTarget;
  }
  if (hasOwn(parsed, "gameSoftCapMinutes")) {
    merged.game.softCapMinutes = parsed.gameSoftCapMinutes;
  }
  if (hasOwn(parsed, "gameSoftCapMode")) {
    merged.game.softCapMode = parsed.gameSoftCapMode;
  }
  if (hasOwn(parsed, "gameHardCapMinutes")) {
    merged.game.timeCapMinutes = parsed.gameHardCapMinutes;
  }
  if (hasOwn(parsed, "gameHardCapEndMode")) {
    merged.game.timeCapEndMode = parsed.gameHardCapEndMode;
  }
  if (hasOwn(parsed, "gameTimeCapTargetMode")) {
    merged.game.timeCapTargetMode = parsed.gameTimeCapTargetMode;
  }
  if (hasOwn(parsed, "halftimeMinutes")) {
    merged.half.halftimeCapMinutes = parsed.halftimeMinutes;
  }
  if (hasOwn(parsed, "halftimeBreakMinutes")) {
    merged.half.halftimeBreakMinutes = parsed.halftimeBreakMinutes;
  }
  if (hasOwn(parsed, "halftimeScoreThreshold")) {
    merged.half.halftimePointTarget = parsed.halftimeScoreThreshold;
  }
  if (hasOwn(parsed, "timeoutSeconds")) {
    merged.timeouts.durationSeconds = parsed.timeoutSeconds;
  }
  if (hasOwn(parsed, "timeoutsTotal")) {
    merged.timeouts.perTeamPerGame = parsed.timeoutsTotal;
  }
  if (hasOwn(parsed, "timeoutsPerHalf")) {
    merged.timeouts.perHalf = parsed.timeoutsPerHalf;
  }
  if (hasOwn(parsed, "interPointPullDeadlineSeconds")) {
    merged.interPoint.defencePullBySeconds = parsed.interPointPullDeadlineSeconds;
  }
  if (hasOwn(parsed, "interPointTimeoutAddsSeconds")) {
    merged.interPoint.prePullTimeoutAddsSeconds = parsed.interPointTimeoutAddsSeconds;
  }
  if (hasOwn(parsed, "interPointAreTimeoutsStacked")) {
    merged.interPoint.areTimeoutsStackedBeforePull = parsed.interPointAreTimeoutsStacked;
  }
  if (hasOwn(parsed, "discussionSeconds")) {
    merged.discussions.restartPlayMaxSeconds = parsed.discussionSeconds;
  }
  if (hasOwn(parsed, "discussionAutoContestSeconds")) {
    merged.discussions.autoContestSeconds = parsed.discussionAutoContestSeconds;
  }
  if (hasOwn(parsed, "inPointOffenceSetSeconds")) {
    merged.inPointTimeout.offenceSetSeconds = parsed.inPointOffenceSetSeconds;
  }
  if (hasOwn(parsed, "inPointDefenceCheckMaxSeconds")) {
    merged.inPointTimeout.defenceCheckMaxSeconds = parsed.inPointDefenceCheckMaxSeconds;
  }
  if (hasOwn(parsed, "inPointDefenceCheckWithinSecondsAfterOffenceSet")) {
    merged.inPointTimeout.defenceCheckWithinSecondsAfterOffenceSet =
      parsed.inPointDefenceCheckWithinSecondsAfterOffenceSet;
  }
  if (hasOwn(parsed, "discInPlayPivotCentralSeconds")) {
    merged.discInPlay.pivotCentralZoneMaxSeconds = parsed.discInPlayPivotCentralSeconds;
  }
  if (hasOwn(parsed, "discInPlayPivotEndzoneSeconds")) {
    merged.discInPlay.pivotEndZoneMaxSeconds = parsed.discInPlayPivotEndzoneSeconds;
  }
  if (hasOwn(parsed, "discInPlayNewDiscSeconds")) {
    merged.discInPlay.postPullDiscToRestRetrievalMaxSeconds = parsed.discInPlayNewDiscSeconds;
    merged.discInPlay.oobTurnoverDiscToRestRetrievalMaxSeconds = parsed.discInPlayNewDiscSeconds;
  }
  if (hasOwn(parsed, "mixedRatioEnabled")) {
    merged.mixedRatio.isEnabled = Boolean(parsed.mixedRatioEnabled);
  }
  if (hasOwn(parsed, "mixedRatioRule")) {
    merged.mixedRatio.ratioRule = parsed.mixedRatioRule;
  }
  if (hasOwn(parsed, "mixedRatioChooser")) {
    merged.mixedRatio.ratioRuleA.chooser = parsed.mixedRatioChooser;
  }
  if (hasOwn(parsed, "abbaPattern")) {
    merged.mixedRatio.abbaPattern = parsed.abbaPattern;
  }

  return merged;
}

export function normalizeScrimmageRules(rawRules) {
  const merged = buildNestedRules(rawRules);
  const normalized = deepMerge(cloneScrimmageRules(), merged);

  normalized.game.timeCapMinutes = coerceNonNegativeInteger(
    normalized.game.timeCapMinutes,
    DEFAULT_SCRIMMAGE_RULES.game.timeCapMinutes
  );
  normalized.half.halftimeCapMinutes = coerceNonNegativeInteger(
    normalized.half.halftimeCapMinutes,
    DEFAULT_SCRIMMAGE_RULES.half.halftimeCapMinutes
  );
  normalized.half.halftimeBreakMinutes = coerceNonNegativeInteger(
    normalized.half.halftimeBreakMinutes,
    DEFAULT_SCRIMMAGE_RULES.half.halftimeBreakMinutes
  );
  normalized.timeouts.durationSeconds = coerceNonNegativeInteger(
    normalized.timeouts.durationSeconds,
    DEFAULT_TIMEOUT_SECONDS
  );
  normalized.timeouts.perTeamPerGame = coerceNonNegativeInteger(
    normalized.timeouts.perTeamPerGame,
    DEFAULT_SCRIMMAGE_RULES.timeouts.perTeamPerGame
  );
  normalized.timeouts.perHalf = coerceNonNegativeInteger(
    normalized.timeouts.perHalf,
    DEFAULT_SCRIMMAGE_RULES.timeouts.perHalf
  );
  normalized.discussions.restartPlayMaxSeconds = coerceNonNegativeInteger(
    normalized.discussions.restartPlayMaxSeconds,
    DEFAULT_DISCUSSION_SECONDS
  );

  const normalizedAbbaPattern = normalizeAbbaPattern(normalized.mixedRatio.abbaPattern);
  normalized.mixedRatio.abbaPattern = normalizedAbbaPattern;
  if (normalizedAbbaPattern !== "none") {
    normalized.mixedRatio.isEnabled = true;
  }

  return normalized;
}

const setRuleSectionValue = (rules, section, key, value) =>
  normalizeScrimmageRules({
    ...(isPlainObject(rules) ? rules : {}),
    [section]: {
      ...(isPlainObject(rules?.[section]) ? rules[section] : {}),
      [key]: value,
    },
  });

export const getRuleMatchDurationMinutes = (rules) =>
  coerceNonNegativeInteger(
    rules?.game?.timeCapMinutes ?? rules?.game?.hardCapMinutes ?? rules?.matchDuration,
    DEFAULT_SCRIMMAGE_RULES.game.timeCapMinutes
  );

export const getRuleHalftimeCapMinutes = (rules) =>
  coerceNonNegativeInteger(
    rules?.half?.halftimeCapMinutes ?? rules?.half?.timeCapMinutes ?? rules?.halftimeMinutes,
    DEFAULT_SCRIMMAGE_RULES.half.halftimeCapMinutes
  );

export const getRuleHalftimeBreakMinutes = (rules) =>
  coerceNonNegativeInteger(
    rules?.half?.halftimeBreakMinutes ?? rules?.half?.breakMinutes ?? rules?.halftimeBreakMinutes,
    DEFAULT_SCRIMMAGE_RULES.half.halftimeBreakMinutes
  );

export const getRuleTimeoutSeconds = (rules) =>
  coerceNonNegativeInteger(
    rules?.timeouts?.durationSeconds ?? rules?.timeoutSeconds,
    DEFAULT_TIMEOUT_SECONDS
  );

export const getRuleTimeoutsTotal = (rules) =>
  coerceNonNegativeInteger(
    rules?.timeouts?.perTeamPerGame ?? rules?.timeoutsTotal,
    DEFAULT_SCRIMMAGE_RULES.timeouts.perTeamPerGame
  );

export const getRuleTimeoutsPerHalf = (rules) =>
  coerceNonNegativeInteger(
    rules?.timeouts?.perHalf ?? rules?.timeoutsPerHalf,
    DEFAULT_SCRIMMAGE_RULES.timeouts.perHalf
  );

export const getRuleDiscussionSeconds = (rules) =>
  coerceNonNegativeInteger(
    rules?.discussions?.restartPlayMaxSeconds ?? rules?.discussionSeconds,
    DEFAULT_DISCUSSION_SECONDS
  );

export const getRuleAbbaPattern = (rules) =>
  normalizeAbbaPattern(rules?.mixedRatio?.abbaPattern ?? rules?.abbaPattern);

export const setRuleMatchDurationMinutes = (rules, value) =>
  setRuleSectionValue(rules, "game", "timeCapMinutes", coerceNonNegativeInteger(value, 0));

export const setRuleHalftimeCapMinutes = (rules, value) =>
  setRuleSectionValue(rules, "half", "halftimeCapMinutes", coerceNonNegativeInteger(value, 0));

export const setRuleHalftimeBreakMinutes = (rules, value) =>
  setRuleSectionValue(
    rules,
    "half",
    "halftimeBreakMinutes",
    coerceNonNegativeInteger(value, DEFAULT_SCRIMMAGE_RULES.half.halftimeBreakMinutes)
  );

export const setRuleTimeoutSeconds = (rules, value) =>
  setRuleSectionValue(
    rules,
    "timeouts",
    "durationSeconds",
    coerceNonNegativeInteger(value, DEFAULT_TIMEOUT_SECONDS)
  );

export const setRuleTimeoutsTotal = (rules, value) =>
  setRuleSectionValue(rules, "timeouts", "perTeamPerGame", coerceNonNegativeInteger(value, 0));

export const setRuleTimeoutsPerHalf = (rules, value) =>
  setRuleSectionValue(rules, "timeouts", "perHalf", coerceNonNegativeInteger(value, 0));

export const setRuleAbbaPattern = (rules, value) => {
  const pattern = normalizeAbbaPattern(value);
  const next = normalizeScrimmageRules({
    ...(isPlainObject(rules) ? rules : {}),
    mixedRatio: {
      ...(isPlainObject(rules?.mixedRatio) ? rules.mixedRatio : {}),
      abbaPattern: pattern,
      isEnabled: pattern !== "none",
    },
  });
  return next;
};
