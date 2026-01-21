import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getEventsList } from "../../services/leagueService";
import { getMatchesByEvent, getMatchById } from "../../services/matchService";
import { getPlayersByTeam } from "../../services/playerService";
import {
  MATCH_LOG_EVENT_CODES,
  getMatchLogs,
  getMatchEventDefinitions,
  createMatchLogEntry,
} from "../../services/matchLogService";
import { supabase } from "../../services/supabaseClient";
import { hydrateVenueLookup } from "../../services/venueService";
import {
  loadScorekeeperSession,
  saveScorekeeperSession,
  clearScorekeeperSession,
} from "../../services/scorekeeperSessionStore";
import {
  deriveShortName,
  formatClock,
  formatMatchTime,
  sortRoster,
  toDateTimeLocal,
} from "./scorekeeperUtils";
import {
  DEFAULT_DURATION,
  HALFTIME_SCORE_THRESHOLD,
  DEFAULT_SETUP_FORM,
  DEFAULT_TIMEOUT_USAGE,
  DEFAULT_TIMER_LABEL,
  DEFAULT_SECONDARY_LABEL,
  DEFAULT_TIMEOUT_SECONDS,
  DEFAULT_INTERPOINT_SECONDS,
  DEFAULT_DISCUSSION_SECONDS,
  SESSION_SAVE_DEBOUNCE_MS,
  TIMER_TICK_INTERVAL_MS,
  ABBA_LINE_SEQUENCE,
} from "./scorekeeperConstants";

const DEFAULT_ABBA_LINES = ["none", "M1", "M2", "F1", "F2"];
const DB_WRITES_DISABLED = false;
const DEFAULT_ABBA_PATTERN_WHEN_ENABLED = "male";
const MAX_OVERTIME_SECONDS = 30 * 60;

const OPTIMISTIC_PREFIX = "local-";

const DEFAULT_EVENT_RULES = {
  division: "mixed",
  format: "wfdfChampionship",
  game: {
    pointTarget: 15,
    softCapMinutes: null,
    softCapMode: "addOneToHighest",
    hardCapMinutes: 100,
    hardCapEndMode: "afterPoint",
  },
  half: {
    pointTarget: 8,
    timeCapMinutes: 55,
    breakMinutes: 7,
  },
  clock: {
    isRunningClockEnabled: true,
  },
  interPoint: {
    offenceOnLineSeconds: 45,
    offenceReadySeconds: 60,
    pullDeadlineSeconds: 75,
    timeoutAddsSeconds: 75,
    areTimeoutsStacked: true,
  },
  timeouts: {
    perTeamPerGame: 2,
    durationSeconds: 75,
  },
  inPointTimeout: {
    offenceSetSeconds: 75,
    defenceCheckMaxSeconds: 90,
  },
  discussions: {
    captainInterventionSeconds: 15,
    autoContestSeconds: 45,
    restartPlayMaxSeconds: 60,
  },
  discInPlay: {
    pivotCentralZoneMaxSeconds: 10,
    pivotEndZoneMaxSeconds: 20,
    newDiscRetrievalMaxSeconds: 20,
  },
  mixedRatio: {
    isEnabled: true,
    ratioRule: "A",
    initialRatioChoosingTeam: "home",
  },
};

function coerceRuleNumber(value, fallback) {
  const numeric = Number(value);
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.round(safeFallback));
  }
  return Math.max(0, Math.round(numeric));
}

function coerceOptionalNumber(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.round(numeric));
}

function normalizeAbbaPattern(input) {
  if (typeof input !== "string") return null;
  const candidate = input.trim().toLowerCase();
  if (candidate === "male" || candidate === "m") return "male";
  if (candidate === "female" || candidate === "f") return "female";
  if (candidate === "none") return "none";
  return null;
}

function normalizeSoftCapMode(input) {
  if (typeof input !== "string") return "none";
  const candidate = input.trim().toLowerCase();
  if (candidate === "addonetohighest" || candidate === "add_one_to_highest") {
    return "addOneToHighest";
  }
  if (candidate === "addtwotohighest" || candidate === "add_two_to_highest") {
    return "addTwoToHighest";
  }
  return "none";
}

function normalizeHardCapEndMode(input) {
  if (typeof input !== "string") return "afterPoint";
  const candidate = input.trim().toLowerCase();
  if (candidate === "immediate") return "immediate";
  return "afterPoint";
}

function normalizeEventRules(rawRules) {
  const baseRaw = DEFAULT_EVENT_RULES;
  if (!rawRules) {
    return {
      matchDuration: coerceRuleNumber(baseRaw.game.hardCapMinutes, DEFAULT_DURATION),
      halftimeMinutes: coerceRuleNumber(baseRaw.half.timeCapMinutes, 0),
      halftimeBreakMinutes: coerceRuleNumber(baseRaw.half.breakMinutes, 0),
      halftimeScoreThreshold: coerceRuleNumber(baseRaw.half.pointTarget, HALFTIME_SCORE_THRESHOLD),
      timeoutSeconds: coerceRuleNumber(baseRaw.timeouts.durationSeconds, DEFAULT_TIMEOUT_SECONDS),
      timeoutsTotal: coerceRuleNumber(baseRaw.timeouts.perTeamPerGame, 0),
      timeoutsPerHalf: 0,
      interPointSeconds: coerceRuleNumber(
        baseRaw.interPoint.pullDeadlineSeconds ?? baseRaw.interPoint.timeoutAddsSeconds,
        DEFAULT_INTERPOINT_SECONDS
      ),
      discussionSeconds: coerceRuleNumber(
        baseRaw.discussions.restartPlayMaxSeconds,
        DEFAULT_DISCUSSION_SECONDS
      ),
      abbaPattern: baseRaw.mixedRatio?.isEnabled ? DEFAULT_ABBA_PATTERN_WHEN_ENABLED : "none",
      runningClockEnabled: Boolean(baseRaw.clock?.isRunningClockEnabled),
      gamePointTarget: coerceOptionalNumber(baseRaw.game.pointTarget),
      gameSoftCapMinutes: coerceOptionalNumber(baseRaw.game.softCapMinutes),
      gameSoftCapMode: normalizeSoftCapMode(baseRaw.game.softCapMode),
      gameHardCapMinutes: coerceOptionalNumber(baseRaw.game.hardCapMinutes),
      gameHardCapEndMode: normalizeHardCapEndMode(baseRaw.game.hardCapEndMode),
      interPointPullDeadlineSeconds: coerceRuleNumber(
        baseRaw.interPoint.pullDeadlineSeconds,
        DEFAULT_INTERPOINT_SECONDS
      ),
      interPointTimeoutAddsSeconds: coerceRuleNumber(
        baseRaw.interPoint.timeoutAddsSeconds,
        DEFAULT_TIMEOUT_SECONDS
      ),
      interPointAreTimeoutsStacked: Boolean(baseRaw.interPoint.areTimeoutsStacked),
      inPointOffenceSetSeconds: coerceRuleNumber(baseRaw.inPointTimeout.offenceSetSeconds, 0),
      inPointDefenceCheckMaxSeconds: coerceRuleNumber(
        baseRaw.inPointTimeout.defenceCheckMaxSeconds,
        0
      ),
      discussionAutoContestSeconds: coerceRuleNumber(
        baseRaw.discussions.autoContestSeconds,
        baseRaw.discussions.restartPlayMaxSeconds
      ),
      discInPlayPivotCentralSeconds: coerceRuleNumber(
        baseRaw.discInPlay.pivotCentralZoneMaxSeconds,
        0
      ),
      discInPlayPivotEndzoneSeconds: coerceRuleNumber(
        baseRaw.discInPlay.pivotEndZoneMaxSeconds,
        0
      ),
      discInPlayNewDiscSeconds: coerceRuleNumber(baseRaw.discInPlay.newDiscRetrievalMaxSeconds, 0),
      mixedRatioEnabled: Boolean(baseRaw.mixedRatio?.isEnabled),
      mixedRatioRule: baseRaw.mixedRatio?.ratioRule || null,
      mixedRatioChooser: baseRaw.mixedRatio?.initialRatioChoosingTeam || null,
      raw: baseRaw,
    };
  }

  let parsed = rawRules;
  if (typeof rawRules === "string") {
    try {
      parsed = JSON.parse(rawRules);
    } catch {
      parsed = rawRules;
    }
  }
  if (!parsed || typeof parsed !== "object") {
    return normalizeEventRules(null);
  }

  const mergedRaw = {
    ...baseRaw,
    ...(parsed || {}),
    game: { ...baseRaw.game, ...(parsed.game || {}) },
    half: { ...baseRaw.half, ...(parsed.half || {}) },
    clock: { ...baseRaw.clock, ...(parsed.clock || {}) },
    interPoint: { ...baseRaw.interPoint, ...(parsed.interPoint || {}) },
    timeouts: { ...baseRaw.timeouts, ...(parsed.timeouts || {}) },
    inPointTimeout: { ...baseRaw.inPointTimeout, ...(parsed.inPointTimeout || {}) },
    discussions: { ...baseRaw.discussions, ...(parsed.discussions || {}) },
    discInPlay: { ...baseRaw.discInPlay, ...(parsed.discInPlay || {}) },
    mixedRatio: { ...baseRaw.mixedRatio, ...(parsed.mixedRatio || {}) },
  };

  const abbaPattern = normalizeAbbaPattern(parsed.abbaPattern);
  const mixedRatioEnabled = Boolean(mergedRaw.mixedRatio?.isEnabled);
  let derivedAbbaPattern =
    abbaPattern ||
    (Object.prototype.hasOwnProperty.call(parsed, "abbaEnabled")
      ? parsed.abbaEnabled
        ? DEFAULT_ABBA_PATTERN_WHEN_ENABLED
        : "none"
      : mixedRatioEnabled
        ? DEFAULT_ABBA_PATTERN_WHEN_ENABLED
        : "none");
  if (!mixedRatioEnabled) {
    derivedAbbaPattern = "none";
  }

  const gamePointTarget = coerceOptionalNumber(mergedRaw.game?.pointTarget);
  const gameSoftCapMinutes = coerceOptionalNumber(mergedRaw.game?.softCapMinutes);
  const gameSoftCapMode = normalizeSoftCapMode(mergedRaw.game?.softCapMode);
  const gameHardCapMinutes =
    coerceOptionalNumber(mergedRaw.game?.hardCapMinutes) ??
    coerceRuleNumber(baseRaw.game.hardCapMinutes, DEFAULT_DURATION);

  return {
    matchDuration: coerceRuleNumber(
      mergedRaw.game?.hardCapMinutes,
      coerceRuleNumber(baseRaw.game.hardCapMinutes, DEFAULT_DURATION)
    ),
    halftimeMinutes: coerceRuleNumber(
      mergedRaw.half?.timeCapMinutes,
      coerceRuleNumber(baseRaw.half.timeCapMinutes, 0)
    ),
    halftimeBreakMinutes: coerceRuleNumber(
      mergedRaw.half?.breakMinutes,
      coerceRuleNumber(baseRaw.half.breakMinutes, 0)
    ),
    halftimeScoreThreshold: coerceRuleNumber(
      mergedRaw.half?.pointTarget,
      coerceRuleNumber(baseRaw.half.pointTarget, HALFTIME_SCORE_THRESHOLD)
    ),
    timeoutSeconds: coerceRuleNumber(
      mergedRaw.timeouts?.durationSeconds,
      coerceRuleNumber(baseRaw.timeouts.durationSeconds, DEFAULT_TIMEOUT_SECONDS)
    ),
    timeoutsTotal: coerceRuleNumber(
      mergedRaw.timeouts?.perTeamPerGame,
      coerceRuleNumber(baseRaw.timeouts.perTeamPerGame, 0)
    ),
    timeoutsPerHalf: coerceRuleNumber(mergedRaw.timeouts?.perHalf, 0),
    interPointSeconds: coerceRuleNumber(
      mergedRaw.interPoint?.pullDeadlineSeconds ?? mergedRaw.interPoint?.timeoutAddsSeconds,
      coerceRuleNumber(
        baseRaw.interPoint.pullDeadlineSeconds ?? baseRaw.interPoint.timeoutAddsSeconds,
        DEFAULT_INTERPOINT_SECONDS
      )
    ),
    discussionSeconds: coerceRuleNumber(
      mergedRaw.discussions?.restartPlayMaxSeconds,
      coerceRuleNumber(baseRaw.discussions.restartPlayMaxSeconds, DEFAULT_DISCUSSION_SECONDS)
    ),
    abbaPattern: derivedAbbaPattern,
    runningClockEnabled: Boolean(mergedRaw.clock?.isRunningClockEnabled),
    gamePointTarget,
    gameSoftCapMinutes,
    gameSoftCapMode,
    gameHardCapMinutes: gameHardCapMinutes ?? DEFAULT_DURATION,
    gameHardCapEndMode: normalizeHardCapEndMode(mergedRaw.game?.hardCapEndMode),
    interPointPullDeadlineSeconds: coerceRuleNumber(
      mergedRaw.interPoint?.pullDeadlineSeconds,
      coerceRuleNumber(baseRaw.interPoint.pullDeadlineSeconds, DEFAULT_INTERPOINT_SECONDS)
    ),
    interPointTimeoutAddsSeconds: coerceRuleNumber(
      mergedRaw.interPoint?.timeoutAddsSeconds,
      coerceRuleNumber(baseRaw.interPoint.timeoutAddsSeconds, DEFAULT_TIMEOUT_SECONDS)
    ),
    interPointAreTimeoutsStacked: Boolean(mergedRaw.interPoint?.areTimeoutsStacked),
    inPointOffenceSetSeconds: coerceRuleNumber(
      mergedRaw.inPointTimeout?.offenceSetSeconds,
      coerceRuleNumber(baseRaw.inPointTimeout.offenceSetSeconds, 0)
    ),
    inPointDefenceCheckMaxSeconds: coerceRuleNumber(
      mergedRaw.inPointTimeout?.defenceCheckMaxSeconds,
      coerceRuleNumber(baseRaw.inPointTimeout.defenceCheckMaxSeconds, 0)
    ),
    discussionAutoContestSeconds: coerceRuleNumber(
      mergedRaw.discussions?.autoContestSeconds,
      coerceRuleNumber(
        baseRaw.discussions.autoContestSeconds ?? baseRaw.discussions.restartPlayMaxSeconds,
        baseRaw.discussions.restartPlayMaxSeconds
      )
    ),
    discInPlayPivotCentralSeconds: coerceRuleNumber(
      mergedRaw.discInPlay?.pivotCentralZoneMaxSeconds,
      coerceRuleNumber(baseRaw.discInPlay.pivotCentralZoneMaxSeconds, 0)
    ),
    discInPlayPivotEndzoneSeconds: coerceRuleNumber(
      mergedRaw.discInPlay?.pivotEndZoneMaxSeconds,
      coerceRuleNumber(baseRaw.discInPlay.pivotEndZoneMaxSeconds, 0)
    ),
    discInPlayNewDiscSeconds: coerceRuleNumber(
      mergedRaw.discInPlay?.newDiscRetrievalMaxSeconds,
      coerceRuleNumber(baseRaw.discInPlay.newDiscRetrievalMaxSeconds, 0)
    ),
    mixedRatioEnabled,
    mixedRatioRule: mergedRaw.mixedRatio?.ratioRule || null,
    mixedRatioChooser: mergedRaw.mixedRatio?.initialRatioChoosingTeam || null,
    raw: mergedRaw,
  };
}

const DEFAULT_RULES = normalizeEventRules(DEFAULT_EVENT_RULES);

function deriveTimerStateFromSnapshot(
  snapshot,
  fallbackSeconds,
  fallbackLabel = DEFAULT_TIMER_LABEL
) {
  const safeFallback = Number.isFinite(fallbackSeconds) ? fallbackSeconds : 0;
  const baseSeconds = Number.isFinite(snapshot?.seconds)
    ? snapshot.seconds
    : safeFallback;
  let remaining = Math.max(0, Math.round(baseSeconds));

  if (snapshot?.running && typeof snapshot.savedAt === "number") {
    const elapsed = Math.floor((Date.now() - snapshot.savedAt) / 1000);
    if (Number.isFinite(elapsed) && elapsed > 0) {
      remaining = Math.max(0, remaining - elapsed);
    }
  }

  const totalSeconds = Number.isFinite(snapshot?.totalSeconds)
    ? snapshot.totalSeconds
    : safeFallback;

  return {
    seconds: remaining,
    running: Boolean(snapshot?.running) && remaining > 0,
    label: snapshot?.label || fallbackLabel,
    totalSeconds,
  };
}

function normalizeSeconds(value, fallback = 0, options = {}) {
  const { min = 0, max = null } = options;
  const numeric = Number.isFinite(value) ? value : fallback;
  let next = Math.round(numeric);
  if (typeof max === "number") {
    next = Math.min(max, next);
  }
  if (typeof min === "number") {
    next = Math.max(min, next);
  }
  return next;
}

function computeRemainingSeconds(anchor, isRunning, fallback = 0, options = {}) {
  const { minSeconds = 0 } = options;
  const base = normalizeSeconds(anchor?.baseSeconds, fallback, { min: minSeconds });
  if (!isRunning || !anchor?.anchorTimestamp) {
    return base;
  }
  const elapsedSeconds = Math.floor((Date.now() - anchor.anchorTimestamp) / 1000);
  const raw = base - elapsedSeconds;
  if (typeof minSeconds === "number") {
    return Math.max(minSeconds, raw);
  }
  return raw;
}

export function useScoreKeeperData() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);

  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState(null);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [venueLookup, setVenueLookup] = useState({});

  const [activeMatch, setActiveMatch] = useState(null);
  const [initialising, setInitialising] = useState(false);
  const [abbaLines, setAbbaLines] = useState(DEFAULT_ABBA_LINES);

  const [setupForm, setSetupForm] = useState(() => ({ ...DEFAULT_SETUP_FORM }));

  const [rules, setRules] = useState(() => ({ ...DEFAULT_RULES }));
  const [rulesManuallyEdited, setRulesManuallyEdited] = useState(false);

  const [score, setScore] = useState({ a: 0, b: 0 });
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [matchEventOptions, setMatchEventOptions] = useState([]);
  const [matchEventsError, setMatchEventsError] = useState(null);
  const [pendingEntries, setPendingEntries] = useState([]);
  const [timerSeconds, setTimerSeconds] = useState(DEFAULT_DURATION * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [secondarySeconds, setSecondarySeconds] = useState(DEFAULT_RULES.timeoutSeconds);
  const [secondaryRunning, setSecondaryRunning] = useState(false);
  const [secondaryLabel, setSecondaryLabel] = useState(DEFAULT_SECONDARY_LABEL);
  const [consoleError, setConsoleError] = useState(null);
  const [rosters, setRosters] = useState({ teamA: [], teamB: [] });
  const [rostersLoading, setRostersLoading] = useState(false);
  const [rostersError, setRostersError] = useState(null);
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
const [scoreModalState, setScoreModalState] = useState({
  open: false,
  team: null,
  mode: "add",
  logIndex: null,
});
  const [scoreForm, setScoreForm] = useState({ scorerId: "", assistId: "" });
  const [timeoutUsage, setTimeoutUsage] = useState({ ...DEFAULT_TIMEOUT_USAGE });
  const [timerLabel, setTimerLabel] = useState(DEFAULT_TIMER_LABEL);
const [secondaryTotalSeconds, setSecondaryTotalSeconds] = useState(
  DEFAULT_RULES.timeoutSeconds
);
  const [scoreTarget, setScoreTarget] = useState(DEFAULT_RULES.gamePointTarget || null);
  const [softCapApplied, setSoftCapApplied] = useState(false);
  const [hardCapReached, setHardCapReached] = useState(false);
const [secondaryFlashActive, setSecondaryFlashActive] = useState(false);
const [secondaryFlashPulse, setSecondaryFlashPulse] = useState(false);
const [secondaryFlashRateMs, setSecondaryFlashRateMs] = useState(400);
const [possessionTeam, setPossessionTeam] = useState(null);
const [halftimeTriggered, setHalftimeTriggered] = useState(false);
const [halftimeBreakActive, setHalftimeBreakActive] = useState(false);
const [halftimeTimeCapArmed, setHalftimeTimeCapArmed] = useState(false);
  const [resumeCandidate, setResumeCandidate] = useState(null);
  const [resumeHandled, setResumeHandled] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeError, setResumeError] = useState(null);
  const [stoppageActive, setStoppageActive] = useState(false);

  useEffect(() => {
    let ignore = false;
    const loadAbbaLines = async () => {
      const { data, error } = await supabase.from("abba_line").select("line");
      if (error) {
        console.error("[ScoreKeeper] Failed to load ABBA lines:", error.message);
        return;
      }
      const fetched = (data || [])
        .map((row) => row.line)
        .filter((value) => typeof value === "string" && value.trim().length > 0);
      const nextLines = Array.from(new Set([...DEFAULT_ABBA_LINES, ...fetched]));
      if (!ignore) {
        setAbbaLines(nextLines);
      }
    };
    void loadAbbaLines();
    return () => {
      ignore = true;
    };
  }, []);

  const fetchRostersForTeams = useCallback(async (teamAId, teamBId, eventId) => {
    const [teamAPlayers, teamBPlayers] = await Promise.all([
      teamAId ? getPlayersByTeam(teamAId, eventId) : [],
      teamBId ? getPlayersByTeam(teamBId, eventId) : [],
    ]);
    return {
      teamA: teamAPlayers,
      teamB: teamBPlayers,
    };
  }, []);

  const loadMatchEventDefinitions = useCallback(async () => {
    try {
      const data = await getMatchEventDefinitions();
      setMatchEventOptions(data ?? []);
      setMatchEventsError(null);
      return data ?? [];
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load match event definitions.";
      setMatchEventsError(message);
      return [];
    }
  }, []);

  const resolveEventTypeIdLocal = useCallback(
    async (code) => {
      const existing = matchEventOptions.find((option) => option.code === code);
      if (existing) return existing.id;
      const fresh = await loadMatchEventDefinitions();
      const match = fresh.find((option) => option.code === code);
      return match ? match.id : null;
    },
    [matchEventOptions, loadMatchEventDefinitions]
  );

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError(null);
    try {
      const data = await getEventsList(12);
      setEvents(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load events.";
      setEventsError(message);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const loadMatches = useCallback(
    async (eventIdOverride, options = {}) => {
      const targetEventId = eventIdOverride ?? selectedEventId;
      if (!targetEventId) return;

      const {
        preferredMatchId = null,
        preserveSelection = true,
        allowDefaultSelect = false,
      } = options;

      setMatchesLoading(true);
      setMatchesError(null);
      try {
        const data = await getMatchesByEvent(targetEventId, 24, {
          includeFinished: false,
        });
        setMatches(data);

        if (data.length === 0) {
          setSelectedMatchId(null);
          return;
        }

        const requestedId =
          preferredMatchId ||
          (preserveSelection ? selectedMatchId : null) ||
          null;
        const matchExists = requestedId && data.some((match) => match.id === requestedId);
        if (matchExists) {
          setSelectedMatchId(requestedId);
          return;
        }
        setSelectedMatchId(allowDefaultSelect ? data[0].id : null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load matches.";
        setMatchesError(message);
        setSelectedMatchId(null);
      } finally {
        setMatchesLoading(false);
      }
    },
    [selectedEventId, selectedMatchId]
  );

const initialScoreRef = useRef({ a: 0, b: 0 });
const currentMatchScoreRef = useRef({ a: 0, b: 0 });
const matchIdRef = useRef(null);
const refreshMatchLogsRef = useRef(null);
const primaryResetRef = useRef(null);
const secondaryResetRef = useRef(null);
const secondaryResetTriggeredRef = useRef(false);
const resumeHydrationRef = useRef(false);
const primaryTimerAnchorRef = useRef({
  baseSeconds: DEFAULT_DURATION * 60,
  anchorTimestamp: null,
});
const secondaryTimerAnchorRef = useRef({
  baseSeconds: DEFAULT_RULES.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS,
  anchorTimestamp: null,
});
const activeSecondaryEventRef = useRef(null);
const previousSecondaryRunningRef = useRef(false);
const previousPrimaryRunningRef = useRef(false);
const stoppageActiveRef = useRef(false);
const appliedEventRulesRef = useRef(null);
  const [matchStarted, setMatchStarted] = useState(false);
  const consoleReady = Boolean(activeMatch);

const selectedMatch = useMemo(
  () => matches.find((m) => m.id === selectedMatchId) || null,
  [matches, selectedMatchId]
);

useEffect(() => {
  const candidateIds = [activeMatch?.venue_id, selectedMatch?.venue_id].filter(
    (id) => id && venueLookup[id] === undefined,
  );
  if (candidateIds.length === 0) return;

  let ignore = false;
  hydrateVenueLookup(candidateIds)
    .then((lookup) => {
      if (!ignore) {
        setVenueLookup((prev) => ({ ...prev, ...lookup }));
      }
    })
    .catch((err) => {
      console.error("[ScoreKeeper] Failed to load venues", err);
    });

  return () => {
    ignore = true;
  };
}, [activeMatch?.venue_id, selectedMatch?.venue_id, venueLookup]);

const getPrimaryRemainingSeconds = useCallback(
  () =>
    computeRemainingSeconds(primaryTimerAnchorRef.current, timerRunning, 0, {
      minSeconds: -MAX_OVERTIME_SECONDS,
    }),
  [timerRunning]
);

const getSecondaryRemainingSeconds = useCallback(
  () => computeRemainingSeconds(secondaryTimerAnchorRef.current, secondaryRunning),
  [secondaryRunning]
);

const commitPrimaryTimerState = useCallback(
  (seconds, running) => {
    const normalized = normalizeSeconds(seconds, 0, { min: -MAX_OVERTIME_SECONDS });
    primaryTimerAnchorRef.current = {
      baseSeconds: normalized,
      anchorTimestamp: running ? Date.now() : null,
    };
    setTimerSeconds(normalized);
    setTimerRunning(running);
    return normalized;
  },
  []
);

const commitSecondaryTimerState = useCallback(
  (seconds, running) => {
    const normalized = normalizeSeconds(seconds);
    secondaryTimerAnchorRef.current = {
      baseSeconds: normalized,
      anchorTimestamp: running ? Date.now() : null,
    };
    setSecondarySeconds(normalized);
    setSecondaryRunning(running);
    return normalized;
  },
  []
);

const markRulesManuallyEdited = useCallback(() => {
  setRulesManuallyEdited(true);
}, []);

const clearLocalMatchState = useCallback(() => {
  setActiveMatch(null);
  setSelectedMatchId(null);
  setMatches([]);
    setRosters({ teamA: [], teamB: [] });
    setLogs([]);
    setPendingEntries([]);
    setSetupForm({ ...DEFAULT_SETUP_FORM });
    setRules({ ...DEFAULT_RULES });
    setRulesManuallyEdited(false);
    setScore({ a: 0, b: 0 });
    setTimeoutUsage({ ...DEFAULT_TIMEOUT_USAGE });
    setPossessionTeam(null);
    setHalftimeTriggered(false);
    setHalftimeBreakActive(false);
    setHalftimeTimeCapArmed(false);
    setStoppageActive(false);
    setMatchStarted(false);
    setScoreTarget(DEFAULT_RULES.gamePointTarget || null);
    setSoftCapApplied(false);
    setHardCapReached(false);
    commitPrimaryTimerState((DEFAULT_RULES.matchDuration || DEFAULT_DURATION) * 60, false);
    commitSecondaryTimerState(DEFAULT_RULES.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS, false);
    setTimerLabel(DEFAULT_TIMER_LABEL);
    setSecondaryLabel(DEFAULT_SECONDARY_LABEL);
    setSecondaryTotalSeconds(DEFAULT_RULES.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS);
    primaryResetRef.current = null;
    secondaryResetRef.current = null;
    secondaryResetTriggeredRef.current = false;
    matchIdRef.current = null;
    if (userId) {
      clearScorekeeperSession(userId);
    }
  }, [
    userId,
    commitPrimaryTimerState,
    commitSecondaryTimerState,
  ]);

  const applyEventRules = useCallback(
    (nextRules, options = {}) => {
      const { force = false } = options;
      if (!nextRules) return;
      if (!force && rulesManuallyEdited) {
        return;
      }
      setRules(nextRules);
      setRulesManuallyEdited(false);
      const primarySeconds = (nextRules.matchDuration || DEFAULT_DURATION) * 60;
      commitPrimaryTimerState(primarySeconds, false);
      const timeoutSeconds = nextRules.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS;
      commitSecondaryTimerState(timeoutSeconds, false);
      setSecondaryTotalSeconds(timeoutSeconds);
      setScoreTarget(nextRules.gamePointTarget || null);
      setSoftCapApplied(false);
      setHardCapReached(false);
    },
    [commitPrimaryTimerState, commitSecondaryTimerState, rulesManuallyEdited]
  );

useEffect(() => {
  void loadEvents();
}, [loadEvents]);

useEffect(() => {
  loadMatchEventDefinitions();
}, [loadMatchEventDefinitions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!userId) {
      setResumeCandidate(null);
      setResumeHandled(true);
      setResumeError(null);
      setResumeBusy(false);
      return;
    }
    const stored = loadScorekeeperSession(userId);
    if (stored?.data?.matchId) {
      setResumeCandidate(stored.data);
      setResumeHandled(false);
      setResumeError(null);
      setResumeBusy(false);
    } else {
      setResumeCandidate(null);
      setResumeHandled(true);
      setResumeError(null);
      setResumeBusy(false);
    }
  }, [userId]);

useEffect(() => {
  if (!selectedEventId) {
    setMatches([]);
    setSelectedMatchId(null);
    return;
  }
  void loadMatches(selectedEventId);
}, [selectedEventId, loadMatches]);

  useEffect(() => {
    if (!selectedEventId) {
      appliedEventRulesRef.current = null;
      return;
    }
    if (resumeHydrationRef.current || matchStarted) return;
    const eventWithRules = events.find((evt) => evt.id === selectedEventId);
    if (!eventWithRules) return;
    if (appliedEventRulesRef.current === selectedEventId) return;
    const normalizedRules = normalizeEventRules(eventWithRules.rules);
    applyEventRules(normalizedRules, { force: true });
    appliedEventRulesRef.current = selectedEventId;
  }, [selectedEventId, events, applyEventRules, matchStarted]);

  useEffect(() => {
    if (!selectedEventId) {
      appliedEventRulesRef.current = null;
      return;
    }
    if (resumeHydrationRef.current || matchStarted) return;
    const eventWithRules = events.find((evt) => evt.id === selectedEventId);
    if (!eventWithRules) return;
    const appliedKey = `event-${selectedEventId}`;
    if (appliedEventRulesRef.current === appliedKey) return;
    const normalizedRules = normalizeEventRules(eventWithRules.rules);
    applyEventRules(normalizedRules, { force: true });
    appliedEventRulesRef.current = appliedKey;
  }, [selectedEventId, events, applyEventRules, matchStarted]);

  useEffect(() => {
    if (resumeHydrationRef.current || matchStarted) return;
    const matchSource = activeMatch || selectedMatch;
    const rulesSource = matchSource?.rules || matchSource?.event?.rules || null;
    if (!matchSource?.id || !rulesSource) return;
    const appliedKey = `match-${matchSource.id}`;
    if (appliedEventRulesRef.current === appliedKey) return;
    applyEventRules(normalizeEventRules(rulesSource), { force: true });
    appliedEventRulesRef.current = appliedKey;
  }, [activeMatch, selectedMatch, applyEventRules, matchStarted]);

  useEffect(() => {
    const matchSource = activeMatch || selectedMatch;
    const teamA = matchSource?.team_a?.id || null;
    const teamB = matchSource?.team_b?.id || null;
    const targetMatchId = matchSource?.id || null;
    const matchEventId =
      matchSource?.event_id || matchSource?.event?.id || selectedEventId || null;

    if (!teamA && !teamB) {
      setRosters({ teamA: [], teamB: [] });
      refreshMatchLogsRef.current?.(null);
      return;
    }

    let ignore = false;
    setRostersLoading(true);
    setRostersError(null);

    fetchRostersForTeams(teamA, teamB, matchEventId)
      .then((data) => {
        if (!ignore) {
          setRosters(data);
        }
      })
      .catch((err) => {
        if (!ignore) {
          const message = err instanceof Error ? err.message : "Failed to load rosters.";
          setRostersError(message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setRostersLoading(false);
        }
      });

    refreshMatchLogsRef.current?.(targetMatchId, currentMatchScoreRef.current);

    return () => {
      ignore = true;
    };
  }, [activeMatch, selectedMatch, selectedEventId, fetchRostersForTeams]);

useEffect(() => {
  if (resumeHydrationRef.current) {
    resumeHydrationRef.current = false;
    return;
  }
  setTimeoutUsage({ ...DEFAULT_TIMEOUT_USAGE });
}, [rules.timeoutsTotal, rules.timeoutsPerHalf]);

useEffect(() => {
  if (!consoleReady && !resumeHydrationRef.current) {
    setMatchStarted(false);
    setStoppageActive(false);
  }
}, [consoleReady]);

useEffect(() => {
  if (!activeMatch?.id || resumeHydrationRef.current) return;
  setMatchStarted(false);
  setStoppageActive(false);
}, [activeMatch?.id]);

useEffect(() => {
  stoppageActiveRef.current = stoppageActive;
}, [stoppageActive]);

useEffect(() => {
  if (!secondaryRunning) {
    setSecondaryFlashActive(false);
    setSecondaryFlashPulse(false);
    return;
  }
  const normalizedSecondaryLabel = (secondaryLabel || "").toLowerCase();
  const shouldFlash = secondarySeconds <= 30;
  if (shouldFlash) {
    const fastThreshold = normalizedSecondaryLabel === "discussion" ? 15 : 15;
    const nextRate = secondarySeconds <= fastThreshold ? 175 : 450;
    setSecondaryFlashRateMs(nextRate);
    setSecondaryFlashActive(true);
    setSecondaryFlashPulse(false);
  } else {
    setSecondaryFlashActive(false);
    setSecondaryFlashPulse(false);
    setSecondaryFlashRateMs(450);
  }
}, [secondaryRunning, secondarySeconds, secondaryLabel]);

useEffect(() => {
  if (!secondaryFlashActive) return undefined;
  const interval = setInterval(() => {
    setSecondaryFlashPulse((prev) => !prev);
  }, secondaryFlashRateMs);
  return () => clearInterval(interval);
}, [secondaryFlashActive, secondaryFlashRateMs]);

useEffect(() => {
  if (resumeHydrationRef.current) return;
  if (!secondaryRunning) {
    setSecondaryTotalSeconds(rules.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS);
    setSecondaryTotalSeconds(rules.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS);
  }
}, [rules.timeoutSeconds, secondaryRunning]);

useEffect(() => {
  return () => {
    if (primaryResetRef.current) {
      clearTimeout(primaryResetRef.current);
    }
    if (secondaryResetRef.current) {
      clearTimeout(secondaryResetRef.current);
    }
  };
}, []);

  useEffect(() => {
    if (!timerRunning && !secondaryRunning) return undefined;
    const hasScoreCapWinner = Boolean(
      scoreTarget && (score.a >= scoreTarget || score.b >= scoreTarget)
    );
    const allowOvertime = matchStarted && !hasScoreCapWinner;
    const tick = () => {
      if (timerRunning) {
        const remainingPrimary = getPrimaryRemainingSeconds();
        if (!allowOvertime && remainingPrimary <= 0) {
          setTimerSeconds(0);
          commitPrimaryTimerState(0, false);
        } else if (allowOvertime && remainingPrimary <= -MAX_OVERTIME_SECONDS) {
          setTimerSeconds(-MAX_OVERTIME_SECONDS);
          commitPrimaryTimerState(-MAX_OVERTIME_SECONDS, false);
        } else {
          setTimerSeconds(remainingPrimary);
        }
      }
      if (secondaryRunning) {
        const remainingSecondary = getSecondaryRemainingSeconds();
        if (remainingSecondary <= 0) {
          commitSecondaryTimerState(0, false);
        } else {
          setSecondarySeconds(remainingSecondary);
        }
      }
    };
    tick();
    const interval = setInterval(tick, TIMER_TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [
    timerRunning,
    secondaryRunning,
    getPrimaryRemainingSeconds,
    getSecondaryRemainingSeconds,
    commitPrimaryTimerState,
    commitSecondaryTimerState,
    matchStarted,
    scoreTarget,
    score.a,
    score.b,
  ]);

useEffect(() => {
  if (!matchStarted) {
    setSoftCapApplied(false);
    setHardCapReached(false);
    setScoreTarget(rules.gamePointTarget || null);
      return;
    }
  }, [matchStarted, rules.gamePointTarget]);

  useEffect(() => {
    if (!matchStarted || softCapApplied) return;
    const softCapMinutes = Number.isFinite(rules.gameSoftCapMinutes)
      ? rules.gameSoftCapMinutes
      : null;
    const hardCapMinutes = rules.matchDuration || DEFAULT_DURATION;
    if (!softCapMinutes || softCapMinutes <= 0) return;
    const totalSeconds = hardCapMinutes * 60;
    const thresholdSeconds = Math.max(0, totalSeconds - softCapMinutes * 60);
    if (timerSeconds > thresholdSeconds) return;

    const mode = rules.gameSoftCapMode || "none";
    if (mode === "none") {
      setSoftCapApplied(true);
      return;
    }

    const highest = Math.max(score.a, score.b);
    const increment = mode === "addTwoToHighest" ? 2 : 1;
    const nextTarget = Math.max(
      highest + increment,
      rules.gamePointTarget || highest + increment
    );
    setScoreTarget(nextTarget);
    setSoftCapApplied(true);
  }, [
    matchStarted,
    softCapApplied,
    rules.gameSoftCapMinutes,
    rules.matchDuration,
    rules.gameSoftCapMode,
    rules.gamePointTarget,
    timerSeconds,
    score.a,
    score.b,
  ]);

useEffect(() => {
  if (!matchStarted || hardCapReached) return;
  if (timerSeconds > 0) return;
  setHardCapReached(true);
  if (rules.gameHardCapEndMode === "immediate") {
    setTimerLabel("Hard cap reached");
  }
}, [matchStarted, hardCapReached, timerSeconds, rules.gameHardCapEndMode]);

useEffect(() => {
  if (!matchStarted) {
    if (timerLabel !== DEFAULT_TIMER_LABEL) {
      setTimerLabel(DEFAULT_TIMER_LABEL);
    }
    return;
  }
  if (hardCapReached) return;
  const hasScoreCapWinner = Boolean(
    scoreTarget && (score.a >= scoreTarget || score.b >= scoreTarget)
  );
  const overtimeActive = timerSeconds < 0 && !hasScoreCapWinner;
  if (overtimeActive) {
    if (timerLabel !== "Over time (highest + 1)") {
      setTimerLabel("Over time (highest + 1)");
    }
    return;
  }
  if (timerLabel !== DEFAULT_TIMER_LABEL) {
    setTimerLabel(DEFAULT_TIMER_LABEL);
  }
}, [matchStarted, hardCapReached, timerSeconds, scoreTarget, score.a, score.b, timerLabel]);

useEffect(() => {
  const matchSource = activeMatch || selectedMatch || null;
  if (matchSource) {
    setSetupForm({
      startTime: toDateTimeLocal(matchSource.start_time),
      startingTeamId:
        matchSource.starting_team_id ||
        matchSource.team_a?.id ||
        matchSource.team_b?.id ||
        "",
    });
    const rulesSource = matchSource.rules || matchSource.event?.rules || null;
    const normalizedRules = normalizeEventRules(rulesSource);
    const allowAbba = normalizedRules.mixedRatioEnabled;
    const normalizedMatchAbba = normalizeAbbaPattern(matchSource.abba_pattern);
    setRules((prev) => {
      const nextAbba = allowAbba
        ? normalizedMatchAbba || prev.abbaPattern || "none"
        : "none";
      if (nextAbba === prev.abbaPattern) {
        return prev;
      }
      return {
        ...prev,
        abbaPattern: nextAbba,
      };
    });
  } else {
    setSetupForm({
      startTime: toDateTimeLocal(),
      startingTeamId: "",
    });
  }
}, [activeMatch, selectedMatch]);

useEffect(() => {
  if (!matchStarted) {
    setPossessionTeam(null);
  }
}, [selectedMatchId, activeMatch?.id, matchStarted]);

useEffect(() => {
  if (!consoleReady && !resumeHydrationRef.current) {
    setHalftimeTriggered(false);
  }
}, [consoleReady]);

useEffect(() => {
  if (resumeHydrationRef.current) return;
  setHalftimeTriggered(false);
}, [activeMatch?.id]);

  useEffect(() => {
    if (!activeMatch) {
      matchIdRef.current = null;
      initialScoreRef.current = { a: 0, b: 0 };
      setScore({ a: 0, b: 0 });
      setLogs([]);
      return;
    }

    const activeId = activeMatch.id;
    const nextScore = {
      a: activeMatch.score_a ?? 0,
      b: activeMatch.score_b ?? 0,
    };
    const hydrating = resumeHydrationRef.current;

    if (matchIdRef.current !== activeId) {
      matchIdRef.current = activeId;
      initialScoreRef.current = nextScore;
      setLogs([]);
      if (!hydrating) {
        setTimeoutUsage({ A: 0, B: 0 });
        commitPrimaryTimerState((rules.matchDuration || DEFAULT_DURATION) * 60, false);
        commitSecondaryTimerState(rules.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS, false);
        commitSecondaryTimerState(rules.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS, false);
      }
    }

    if (!hydrating) {
      setScore(nextScore);
    }
  }, [activeMatch, rules.matchDuration, rules.timeoutSeconds, commitPrimaryTimerState, commitSecondaryTimerState]);

  const displayTeamA =
    activeMatch?.team_a?.name || selectedMatch?.team_a?.name || "Team A";
  const displayTeamB = 
    activeMatch?.team_b?.name || selectedMatch?.team_b?.name || "Team B";
  const displayTeamAShort =
    activeMatch?.team_a?.short_name ||
    selectedMatch?.team_a?.short_name ||
    deriveShortName(displayTeamA);
  const displayTeamBShort =
    activeMatch?.team_b?.short_name ||
    selectedMatch?.team_b?.short_name ||
    deriveShortName(displayTeamB);
  const kickoffLabel = formatMatchTime(activeMatch?.start_time || selectedMatch?.start_time);
  const teamAId = activeMatch?.team_a?.id || selectedMatch?.team_a?.id || null;
  const teamBId = activeMatch?.team_b?.id || selectedMatch?.team_b?.id || null;
  const venueName =
    activeMatch?.venue?.name ||
    selectedMatch?.venue?.name ||
    (activeMatch?.venue_id && venueLookup[activeMatch.venue_id]) ||
    (selectedMatch?.venue_id && venueLookup[selectedMatch.venue_id]) ||
    null;
  const statusLabel = (activeMatch?.status || selectedMatch?.status || "pending").toUpperCase();
  const getAbbaDescriptor = useCallback(
    (orderIndex) => {
      if (!["male", "female"].includes(rules.abbaPattern) || orderIndex < 0) {
        return null;
      }
      const startGender = rules.abbaPattern === "male" ? "Male" : "Female";
      const alternateGender = startGender === "Male" ? "Female" : "Male";

      if (orderIndex === 0) {
        return `${startGender} 1st`;
      }

      const normalizedIndex = orderIndex - 1;
      const pairIndex = Math.floor(normalizedIndex / 2);
      const useStartGender = pairIndex % 2 === 1;
      const genderLabel = useStartGender ? startGender : alternateGender;
      const occurrenceLabel = normalizedIndex % 2 === 0 ? "1st" : "2nd";
      return `${genderLabel} ${occurrenceLabel}`;
    },
    [rules.abbaPattern]
  );
  const normalizeAbbaLine = useCallback(
    (line) => {
      const raw = typeof line === "string" ? line : "";
      const candidate = raw.trim() || "none";
      return abbaLines.includes(candidate) ? candidate : "none";
    },
    [abbaLines]
  );

  const getAbbaLineCode = useCallback(
    (orderIndex) => {
      if (!["male", "female"].includes(rules.abbaPattern)) {
        return "none";
      }
      if (typeof orderIndex !== "number" || orderIndex < 0) {
        return "none";
      }
      const startCode = rules.abbaPattern === "male" ? "M" : "F";
      const alternateCode = startCode === "M" ? "F" : "M";
      const step = orderIndex % ABBA_LINE_SEQUENCE.length;
      const suffix = ABBA_LINE_SEQUENCE[step] ?? "1";
      const halfSequence = Math.max(1, Math.floor(ABBA_LINE_SEQUENCE.length / 2));
      const useStartCode = step < halfSequence;
      const prefix = useStartCode ? startCode : alternateCode;
      return normalizeAbbaLine(`${prefix}${suffix}`);
    },
    [rules.abbaPattern, normalizeAbbaLine]
  );
  const startingTeamId = activeMatch?.starting_team_id || setupForm.startingTeamId;
  const matchStartingTeamKey = startingTeamId === teamBId ? "B" : "A";
  const matchDuration = rules.matchDuration || DEFAULT_DURATION;
  const remainingTimeouts = {
    A: Math.max(rules.timeoutsTotal - timeoutUsage.A, 0),
    B: Math.max(rules.timeoutsTotal - timeoutUsage.B, 0),
  };
  const reachedPointTarget = scoreTarget && (score.a >= scoreTarget || score.b >= scoreTarget);
  const canEndMatch = matchStarted;
  const possessionValue = possessionTeam === "A" ? 0 : possessionTeam === "B" ? 100 : 50;
  const possessionLeader =
    possessionTeam === "A"
      ? displayTeamA
      : possessionTeam === "B"
        ? displayTeamB
        : "Contested";
  const halfRemainingLabel = (teamKey) =>
    rules.timeoutsPerHalf > 0 ? Math.max(rules.timeoutsPerHalf - timeoutUsage[teamKey], 0) : "N/A";
  const sortedRosters = useMemo(
    () => ({
      teamA: sortRoster(rosters.teamA),
      teamB: sortRoster(rosters.teamB),
    }),
    [rosters.teamA, rosters.teamB]
  );

  const rosterOptionsForModal = useMemo(() => {
    if (scoreModalState.team === "B") {
      return sortedRosters.teamB;
    }
    if (scoreModalState.team === "A") {
      return sortedRosters.teamA;
    }
    return [];
  }, [scoreModalState.team, sortedRosters]);

  const formattedPrimaryClock = formatClock(timerSeconds);
  const formattedSecondaryClock = formatClock(secondarySeconds);
  const orderedLogs = useMemo(() => {
    const toEpoch = (entry = {}) => {
      const source = entry.timestamp || entry.createdAt || entry.created_at || null;
      const parsed = source ? new Date(source).getTime() : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return [...logs].sort((a, b) => toEpoch(b) - toEpoch(a));
  }, [logs]);

  const scoreEventCount = useMemo(() => {
    return logs.reduce(
      (count, entry) =>
        entry.eventCode === MATCH_LOG_EVENT_CODES.SCORE ||
        entry.eventCode === MATCH_LOG_EVENT_CODES.CALAHAN
          ? count + 1
          : count,
      0
    );
  }, [logs]);

  const nextAbbaDescriptor = useMemo(
    () => getAbbaDescriptor(scoreEventCount),
    [getAbbaDescriptor, scoreEventCount]
  );

  const buildSessionSnapshot = useCallback(() => {
    const matchId = activeMatch?.id || selectedMatchId;
    if (!userId || !matchId) return null;

    const now = Date.now();
    const primarySeconds = getPrimaryRemainingSeconds();
    const secondarySecondsSnapshot = getSecondaryRemainingSeconds();
    const snapshot = {
      matchId,
      selectedMatchId,
      eventId: selectedEventId,
      matchStarted,
      setupForm: { ...setupForm },
      rules: { ...rules },
      score: { ...score },
      timer: {
        seconds: primarySeconds,
        running: timerRunning,
        label: timerLabel,
        savedAt: now,
        totalSeconds: (rules.matchDuration || DEFAULT_DURATION) * 60,
      },
      secondaryTimer: {
        seconds: secondarySecondsSnapshot,
        running: secondaryRunning,
        label: secondaryLabel,
        savedAt: now,
        totalSeconds: secondaryTotalSeconds,
      },
      timeoutUsage: { ...timeoutUsage },
      possessionTeam,
      halftimeTriggered,
      stoppageActive,
      scoreTarget,
      softCapApplied,
      hardCapReached,
    };

    return snapshot;
  }, [
    activeMatch?.id,
    selectedMatchId,
    selectedEventId,
    matchStarted,
    setupForm,
    rules,
    score,
    timerRunning,
    timerLabel,
    secondaryRunning,
    secondaryLabel,
    timeoutUsage,
    possessionTeam,
    halftimeTriggered,
    stoppageActive,
    secondaryTotalSeconds,
    scoreTarget,
    softCapApplied,
    hardCapReached,
    userId,
    getPrimaryRemainingSeconds,
    getSecondaryRemainingSeconds,
  ]);

  useEffect(() => {
    if (!resumeHandled || !userId) return undefined;
    const snapshot = buildSessionSnapshot();
    if (!snapshot) return undefined;
    const handle = setTimeout(() => {
      saveScorekeeperSession(userId, snapshot);
    }, SESSION_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [buildSessionSnapshot, resumeHandled, userId]);

  useEffect(() => {
    if (!resumeHandled || !userId) return undefined;
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const persistNow = () => {
      const snapshot = buildSessionSnapshot();
      if (snapshot) {
        saveScorekeeperSession(userId, snapshot);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        persistNow();
      }
    };

    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", persistNow);
    window.addEventListener("beforeunload", persistNow);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", persistNow);
      window.removeEventListener("beforeunload", persistNow);
    };
  }, [buildSessionSnapshot, resumeHandled, userId]);
const cleanupOptimisticLog = useCallback(
  (optimisticId) => {
    if (!optimisticId) return;
    setLogs((prev) =>
      prev.filter(
        (entry) => !(entry.isOptimistic && entry.optimisticId && entry.optimisticId === optimisticId)
      )
    );
  },
  [setLogs]
);

const recordPendingEntry = useCallback(
  (entry) => {
    const matchId = entry?.matchId;
    const eventTypeId = Number.isFinite(entry?.eventTypeId) ? entry.eventTypeId : null;
    const eventTypeCode = entry?.eventCode || entry?.eventTypeCode || null;
    const optimisticId = entry?.optimisticId || null;
    if (!matchId) {
      setConsoleError((prev) => prev || "Cannot log event: missing match reference.");
      return;
    }
    if (!eventTypeId && !eventTypeCode) {
      setConsoleError((prev) => prev || "Cannot log event: missing event type.");
      return;
    }

    const createdAt = entry?.createdAt || new Date().toISOString();
    const normalizedEntry = {
      ...entry,
      matchId,
      eventTypeId,
      eventCode: eventTypeCode,
      createdAt,
      abbaLine:
        typeof entry?.abbaLine === "string" ? normalizeAbbaLine(entry.abbaLine) : entry?.abbaLine ?? null,
      optimisticId,
    };

    const dbPayload = {
      matchId: normalizedEntry.matchId,
      teamId: normalizedEntry.teamId ?? null,
      actorId: normalizedEntry.scorerId ?? null,
      secondaryActorId: normalizedEntry.assistId ?? null,
      abbaLine: normalizedEntry.abbaLine ?? null,
      createdAt: normalizedEntry.createdAt ?? null,
      optimisticId: optimisticId || null,
    };
    if (normalizedEntry.eventTypeId) {
      dbPayload.eventTypeId = normalizedEntry.eventTypeId;
    } else if (normalizedEntry.eventCode) {
      dbPayload.eventTypeCode = normalizedEntry.eventCode;
    }

    const supabasePayload = {
      match_id: dbPayload.matchId,
      event_type_id: dbPayload.eventTypeId ?? null,
      team_id: dbPayload.teamId,
      actor_id: dbPayload.actorId,
      secondary_actor_id: dbPayload.secondaryActorId,
      abba_line: dbPayload.abbaLine,
      created_at: dbPayload.createdAt,
      optimisticId: optimisticId || null,
    };
    if (!supabasePayload.event_type_id && dbPayload.eventTypeCode) {
      supabasePayload.event_type_code = dbPayload.eventTypeCode;
    }

    setPendingEntries((prev) => [...prev, supabasePayload]);

    if (DB_WRITES_DISABLED) {
      console.warn("[ScoreKeeper] DB writes are temporarily disabled. Skipping save.", supabasePayload);
      setConsoleError((prev) => prev || "Scorekeeper is in offline mode; changes aren't being saved.");
      return;
    }

    void (async () => {
      try {
        const created = await createMatchLogEntry(dbPayload);
        // Replace any optimistic placeholder with the confirmed DB row once the server echoes the optimistic_id.
        cleanupOptimisticLog(created?.optimistic_id || optimisticId);
        setPendingEntries((prev) => prev.filter((item) => item !== supabasePayload));
        void refreshMatchLogs(matchId, currentMatchScoreRef.current);
      } catch (err) {
        console.error("[ScoreKeeper] Failed to persist match log entry:", err);
        setConsoleError((prev) =>
          prev || (err instanceof Error ? err.message : "Failed to submit match log entry.")
        );
      }
    })();
  },
  [setPendingEntries, setConsoleError, normalizeAbbaLine, cleanupOptimisticLog]
);
const normalizedSecondaryLabel =
  typeof secondaryLabel === "string" ? secondaryLabel.toLowerCase() : "";
const isDiscussionTimer = normalizedSecondaryLabel === "discussion";

const primaryTimerBg =
  timerSeconds <= 0 ? "bg-[#fee2e2]" : timerRunning ? "bg-[#dcfce7]" : "bg-[#e2e8f0]";
const secondaryTimerBg = (() => {
  if (secondaryRunning) {
    if (isDiscussionTimer) {
      if (secondarySeconds <= 15) {
        return secondaryFlashActive
          ? secondaryFlashPulse
            ? "bg-[#fcd34d]"
            : "bg-[#fef08a]"
          : "bg-[#fef08a]";
      }
      if (secondarySeconds <= 45) {
        return "bg-[#fef08a]";
      }
      return "bg-[#dcfce7]";
    }
    if (secondarySeconds <= 15) {
      return secondaryFlashActive
        ? secondaryFlashPulse
          ? "bg-[#fb923c]"
          : "bg-[#fed7aa]"
        : "bg-[#fed7aa]";
    }
    if (secondarySeconds <= 30) {
      return secondaryFlashActive
        ? secondaryFlashPulse
          ? "bg-[#fcd34d]"
          : "bg-[#fef3c7]"
        : "bg-[#fef3c7]";
    }
    return "bg-[#dcfce7]";
  }

  if (secondarySeconds === 0) {
    return "bg-[#f8cad6]";
  }
  if (isDiscussionTimer) {
    if (secondarySeconds > 45) {
      return "bg-[#c9ead6]";
    }
    if (secondarySeconds > 15) {
      return "bg-[#ffe2a1]";
    }
  }
  return "bg-[#f8f1ff]";
})();

  const startSecondaryTimer = useCallback(
    (duration, label) => {
      const normalized = normalizeSeconds(duration);
      if (!normalized) return;

      let nextTotal = normalized;
      let nextSeconds = normalized;

      if (secondaryRunning) {
        const currentRemaining = Math.max(0, getSecondaryRemainingSeconds());
        const baseTotal =
          Number.isFinite(secondaryTotalSeconds) && secondaryTotalSeconds > 0
            ? secondaryTotalSeconds
            : currentRemaining;
        const elapsed = Math.max(0, baseTotal - currentRemaining);
        nextTotal = baseTotal + normalized;
        nextSeconds = Math.max(0, nextTotal - elapsed);
      }

      commitSecondaryTimerState(nextSeconds, true);
      setSecondaryTotalSeconds(nextTotal);
      setSecondaryLabel(label || DEFAULT_SECONDARY_LABEL);
    setSecondaryFlashActive(false);
    setSecondaryFlashPulse(false);
  },
  [commitSecondaryTimerState, secondaryRunning, getSecondaryRemainingSeconds, secondaryTotalSeconds]
);

const rosterNameLookup = useMemo(() => {
    const map = new Map();
    sortedRosters.teamA.forEach((player) => {
      if (player.id) {
        map.set(player.id, player.name || "Unnamed player");
      }
    });
    sortedRosters.teamB.forEach((player) => {
      if (player.id) {
        map.set(player.id, player.name || "Unnamed player");
      }
    });
    return map;
  }, [sortedRosters]);

  const describeEvent = useCallback(
    (eventTypeId) => {
      if (!eventTypeId) return "Match event";
      const match = matchEventOptions.find((option) => option.id === eventTypeId);
      if (!match) return "Match event";
      return match.description || match.code || "Match event";
    },
    [matchEventOptions]
  );

  const appendLocalLog = useCallback(
    ({ team, timestamp, scorerId, assistId, totals, eventDescription, eventCode, optimisticId }) => {
      let derivedInfo = { scoreOrderIndex: null, abbaLine: getAbbaLineCode(null) };
      setLogs((prev) => {
        const normalizedCode = eventCode || null;
        const isScoringEvent =
          normalizedCode === MATCH_LOG_EVENT_CODES.SCORE ||
          normalizedCode === MATCH_LOG_EVENT_CODES.CALAHAN;
        const nextScoreOrder = isScoringEvent
          ? prev.reduce(
              (count, entry) =>
                entry.eventCode === MATCH_LOG_EVENT_CODES.SCORE ||
                entry.eventCode === MATCH_LOG_EVENT_CODES.CALAHAN
                  ? count + 1
                  : count,
              0
            )
          : null;
        const abbaLine = normalizeAbbaLine(getAbbaLineCode(nextScoreOrder));
        derivedInfo = { scoreOrderIndex: nextScoreOrder, abbaLine };

        return [
          ...prev,
          {
            id: optimisticId || `${OPTIMISTIC_PREFIX}${prev.length + 1}`,
            team,
            timestamp,
            scorerName:
              rosterNameLookup.get(scorerId || "") ||
              (scorerId ? "Unknown player" : "Unassigned"),
            scorerId: scorerId || null,
            assistName:
          normalizedCode === MATCH_LOG_EVENT_CODES.CALAHAN
                ? "CALLAHAN!!"
                : rosterNameLookup.get(assistId || "") ||
                  (assistId ? "Unknown player" : null),
            assistId: assistId || null,
            totalA: totals.a,
            totalB: totals.b,
            eventDescription,
            eventCode: normalizedCode,
            scoreOrderIndex: nextScoreOrder,
            abbaLine,
            isOptimistic: Boolean(optimisticId),
            optimisticId: optimisticId || null,
          },
        ];
      });
      return { ...derivedInfo, optimisticId: optimisticId || null };
    },
    [rosterNameLookup, getAbbaLineCode, normalizeAbbaLine]
  );

  const logSimpleEvent = useCallback(
    async (eventCode, { teamKey = null } = {}) => {
      if (!consoleReady || !activeMatch?.id) return;
      try {
        const eventTypeId = await resolveEventTypeIdLocal(eventCode);
        if (!eventTypeId) {
          setConsoleError(
            `Missing \`${eventCode}\` event type in match_events. Please add it in Supabase before logging.`
          );
          return;
        }
        const timestamp = new Date().toISOString();
        const optimisticId = `${OPTIMISTIC_PREFIX}${Date.now()}`;
        const appended = appendLocalLog({
          team: teamKey,
          timestamp,
          scorerId: null,
          assistId: null,
          totals: currentMatchScoreRef.current || score,
          eventDescription: describeEvent(eventTypeId),
          eventCode,
          optimisticId,
        });
        const entry = {
          matchId: activeMatch.id,
          eventTypeId,
          eventCode,
          teamId: teamKey === "A" ? teamAId : teamKey === "B" ? teamBId : null,
          createdAt: timestamp,
          abbaLine: appended.scoreOrderIndex !== null ? appended.abbaLine : null,
          optimisticId,
        };
        recordPendingEntry(entry);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to record match event.";
        setConsoleError(message);
      }
    },
    [
      consoleReady,
      activeMatch?.id,
      resolveEventTypeIdLocal,
      teamAId,
      teamBId,
      recordPendingEntry,
      appendLocalLog,
      describeEvent,
      score,
    ]
  );

  const finalizeSecondaryTimerEvent = useCallback(async () => {
    const meta = activeSecondaryEventRef.current;
    if (!meta) {
      return;
    }
    activeSecondaryEventRef.current = null;
    if (meta.endCode) {
      await logSimpleEvent(meta.endCode, { teamKey: meta.teamKey ?? null });
    }
  }, [logSimpleEvent]);

  const halftimeTriggerLockRef = useRef(false);

  const startTrackedSecondaryTimer = useCallback(
    async (duration, label, meta = null) => {
      await finalizeSecondaryTimerEvent();
      if (meta?.eventStartCode) {
        await logSimpleEvent(meta.eventStartCode, { teamKey: meta.teamKey ?? null });
      }
      if (meta?.eventEndCode) {
        activeSecondaryEventRef.current = {
          endCode: meta.eventEndCode,
          teamKey: meta.teamKey ?? null,
        };
      } else {
        activeSecondaryEventRef.current = null;
      }
      startSecondaryTimer(duration, label);
    },
    [finalizeSecondaryTimerEvent, logSimpleEvent, startSecondaryTimer]
  );

  useEffect(() => {
    if (previousSecondaryRunningRef.current && !secondaryRunning) {
      void finalizeSecondaryTimerEvent();
    }
    previousSecondaryRunningRef.current = secondaryRunning;
  }, [secondaryRunning, finalizeSecondaryTimerEvent]);

  useEffect(() => {
    if (!previousPrimaryRunningRef.current && timerRunning && stoppageActiveRef.current) {
      stoppageActiveRef.current = false;
      setStoppageActive(false);
      void logSimpleEvent(MATCH_LOG_EVENT_CODES.STOPPAGE_END);
    }
    previousPrimaryRunningRef.current = timerRunning;
  }, [timerRunning, logSimpleEvent]);

  const halftimeLogged = logs.some(
    (entry) =>
      entry.eventCode === MATCH_LOG_EVENT_CODES.HALFTIME_START ||
      entry.eventCode === MATCH_LOG_EVENT_CODES.HALFTIME_END
  );

  const triggerHalftime = useCallback(async () => {
    if (halftimeTriggerLockRef.current || halftimeTriggered || !matchStarted || halftimeLogged) {
      setHalftimeTimeCapArmed(false);
      return false;
    }
    halftimeTriggerLockRef.current = true;
    setHalftimeTriggered(true);
    setHalftimeBreakActive(true);
    setHalftimeTimeCapArmed(false);
    const breakSeconds = Math.max(1, (rules.halftimeBreakMinutes || 0) * 60);
    try {
      await startTrackedSecondaryTimer(breakSeconds || 60, "Half time", {
        eventStartCode: MATCH_LOG_EVENT_CODES.HALFTIME_START,
        eventEndCode: MATCH_LOG_EVENT_CODES.HALFTIME_END,
      });
      return true;
    } finally {
      halftimeTriggerLockRef.current = false;
    }
  }, [
    halftimeTriggered,
    halftimeLogged,
    matchStarted,
    rules.halftimeBreakMinutes,
    startTrackedSecondaryTimer,
  ]);

  useEffect(() => {
    if (!halftimeTriggered) {
      halftimeTriggerLockRef.current = false;
    }
  }, [halftimeTriggered]);

  useEffect(() => {
    if (!matchStarted || halftimeTriggered || halftimeLogged) {
      if (halftimeTimeCapArmed) {
        setHalftimeTimeCapArmed(false);
      }
      return;
    }
    const halftimeMinutes = rules.halftimeMinutes || 0;
    if (halftimeMinutes <= 0) {
      if (halftimeTimeCapArmed) {
        setHalftimeTimeCapArmed(false);
      }
      return;
    }
    const elapsedSeconds = matchDuration * 60 - timerSeconds;
    if (elapsedSeconds >= halftimeMinutes * 60 && !halftimeTimeCapArmed) {
      setHalftimeTimeCapArmed(true);
    }
  }, [
    matchStarted,
    halftimeTriggered,
    halftimeLogged,
    rules.halftimeMinutes,
    matchDuration,
    timerSeconds,
    halftimeTimeCapArmed,
  ]);

  const updatePossession = useCallback(
    async (
      teamKey,
      { logTurnover = true, actorId = null, eventTypeIdOverride = null, eventTeamKey = null } = {}
    ) => {
      const previousTeam = possessionTeam;
      if (!teamKey || teamKey === previousTeam) return;
      if (logTurnover && !matchStarted) return;
      setPossessionTeam(teamKey);

      if (!logTurnover || !consoleReady || !activeMatch?.id) return;

      try {
        const resolvedEventTypeId =
          eventTypeIdOverride ?? (await resolveEventTypeIdLocal(MATCH_LOG_EVENT_CODES.TURNOVER));
        if (!resolvedEventTypeId) {
          setConsoleError(
            "Missing `turnover` event type in match_events. Please add it in Supabase before logging."
          );
          return;
        }

        const derivedEventTeamKey =
          eventTeamKey ||
          (eventTypeIdOverride ? teamKey : previousTeam) ||
          teamKey ||
          null;

        const targetTeamId =
          derivedEventTeamKey === "A" ? teamAId : derivedEventTeamKey === "B" ? teamBId : null;

        if (!targetTeamId) {
          setConsoleError("Missing team mapping for turnover entry.");
          return;
        }

        const timestamp = new Date().toISOString();
        const totalsSnapshot = score;
        const appended = appendLocalLog({
          team: derivedEventTeamKey,
          timestamp,
          scorerId: actorId || null,
          assistId: null,
          totals: totalsSnapshot,
          eventDescription: describeEvent(resolvedEventTypeId),
          eventCode: MATCH_LOG_EVENT_CODES.TURNOVER,
        });
        const entry = {
          matchId: activeMatch.id,
          eventTypeId: resolvedEventTypeId,
          eventCode: MATCH_LOG_EVENT_CODES.TURNOVER,
          teamId: targetTeamId,
          scorerId: actorId || null,
          createdAt: timestamp,
          abbaLine: appended.scoreOrderIndex !== null ? appended.abbaLine : null,
        };
        recordPendingEntry(entry);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to log turnover.";
        setConsoleError(message);
      }
    },
    [
      possessionTeam,
      matchStarted,
      consoleReady,
      activeMatch?.id,
      teamAId,
      teamBId,
      recordPendingEntry,
      appendLocalLog,
      describeEvent,
      resolveEventTypeIdLocal,
      setConsoleError,
      score,
    ]
  );

  useEffect(() => {
    if (!halftimeBreakActive) return;
    const normalizedSecondaryLabel = (secondaryLabel || "").toLowerCase();
    if (secondaryRunning || normalizedSecondaryLabel !== "half time") {
      return;
    }
    setHalftimeBreakActive(false);
    const nextTeam = matchStartingTeamKey === "A" ? "A" : matchStartingTeamKey === "B" ? "B" : null;
    if (!nextTeam) return;
    void updatePossession(nextTeam, { logTurnover: false });
  }, [
    halftimeBreakActive,
    secondaryRunning,
    secondaryLabel,
    matchStartingTeamKey,
    updatePossession,
  ]);
  const matchLogMatchId = activeMatch?.id || selectedMatch?.id || null;
  const currentMatchScore = useMemo(
    () => ({
      a: activeMatch?.score_a ?? selectedMatch?.score_a ?? 0,
      b: activeMatch?.score_b ?? selectedMatch?.score_b ?? 0,
    }),
    [activeMatch?.score_a, activeMatch?.score_b, selectedMatch?.score_a, selectedMatch?.score_b]
  );

  useEffect(() => {
    currentMatchScoreRef.current = currentMatchScore;
  }, [currentMatchScore]);

  const deriveLogsFromRows = useCallback(
    (rows, matchScore) => {
      let rawA = 0;
      let rawB = 0;
      rows.forEach((row) => {
        const teamKey =
          row.team_id && row.team_id === teamBId
            ? "B"
            : row.team_id && row.team_id === teamAId
              ? "A"
              : null;
        const isScoreEvent =
          row.event?.code === MATCH_LOG_EVENT_CODES.SCORE ||
          row.event?.code === MATCH_LOG_EVENT_CODES.CALAHAN;
        if (isScoreEvent) {
          if (teamKey === "A") {
            rawA += 1;
          } else if (teamKey === "B") {
            rawB += 1;
          }
        }
      });

      const baseScore = {
        a: Math.max(matchScore.a - rawA, 0),
        b: Math.max(matchScore.b - rawB, 0),
      };

      let runningA = baseScore.a;
      let runningB = baseScore.b;
      let scoreOrderIndexCounter = 0;

      const mappedLogs = rows.map((row) => {
        const teamKey =
          row.team_id && row.team_id === teamBId
            ? "B"
            : row.team_id && row.team_id === teamAId
              ? "A"
              : null;
        const isScoreEvent =
          row.event?.code === MATCH_LOG_EVENT_CODES.SCORE ||
          row.event?.code === MATCH_LOG_EVENT_CODES.CALAHAN;
        let scoreOrderIndex = null;
        if (isScoreEvent) {
          scoreOrderIndex = scoreOrderIndexCounter;
          scoreOrderIndexCounter += 1;
          if (teamKey === "A") {
            runningA += 1;
          } else if (teamKey === "B") {
            runningB += 1;
          }
        }

        const scorerName =
          row.actor?.name ||
          (row.actor_id ? rosterNameLookup.get(row.actor_id) : null) ||
          "Unassigned";
        const assistName =
          row.secondary_actor?.name ||
          (row.secondary_actor_id ? rosterNameLookup.get(row.secondary_actor_id) : null) ||
          null;

        return {
          id: row.id,
          team: teamKey,
          timestamp: row.created_at,
          scorerName,
          scorerId: row.actor_id ?? null,
          assistName,
          assistId: row.secondary_actor_id ?? null,
          totalA: runningA,
          totalB: runningB,
          eventCode: row.event?.code || null,
          eventDescription: row.event?.description || row.event?.code || "Event",
          eventCategory: null,
          scoreOrderIndex,
          abbaLine: normalizeAbbaLine(row.abba_line || getAbbaLineCode(scoreOrderIndex)),
          isOptimistic: false,
          optimisticId: row.optimistic_id ?? null,
        };
      });

      return {
        baseScore,
        totals: { a: runningA, b: runningB },
        logs: mappedLogs,
      };
    },
    [rosterNameLookup, teamAId, teamBId, getAbbaLineCode]
  );

  const refreshMatchLogs = useCallback(
    async (targetMatchId = matchLogMatchId, matchScore = { a: 0, b: 0 }) => {
      if (!targetMatchId) {
        setLogs([]);
        return null;
      }
      setLogsLoading(true);
      try {
        const rows = await getMatchLogs(targetMatchId);
        const derived = deriveLogsFromRows(rows, matchScore);
        initialScoreRef.current = derived.baseScore;
        setLogs((prev) => {
          const serverOptimisticIds = new Set(
            derived.logs
              .map((log) => log.optimisticId)
              .filter((id) => typeof id === "string" && id.length > 0)
          );
          const optimistic = prev.filter(
            (entry) =>
              entry.isOptimistic &&
              (!entry.optimisticId || !serverOptimisticIds.has(entry.optimisticId))
          );
          const merged = [...derived.logs];
          optimistic.forEach((entry) => {
            const exists = merged.some(
              (log) =>
                (entry.optimisticId &&
                  log.optimisticId &&
                  log.optimisticId === entry.optimisticId) ||
                log.id === entry.id ||
                (log.eventCode === entry.eventCode &&
                  log.team === entry.team &&
                  log.timestamp === entry.timestamp)
            );
            if (!exists) {
              merged.push(entry);
            }
          });
          return merged;
        });
        setScore(derived.totals);

        if (!resumeHydrationRef.current) {
          const matchStartLog = derived.logs.find(
            (entry) => entry.eventCode === MATCH_LOG_EVENT_CODES.MATCH_START && entry.timestamp
          );
          if (matchStartLog) {
            const durationSeconds = (rules.matchDuration || DEFAULT_DURATION) * 60;
            const elapsedSeconds = Math.max(
              0,
              Math.floor((Date.now() - new Date(matchStartLog.timestamp).getTime()) / 1000)
            );
            const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);
            commitPrimaryTimerState(remainingSeconds, remainingSeconds > 0);
            setTimerLabel("Game time");
            setMatchStarted(true);
          }
        }

        return derived.totals;
      } catch (err) {
        setConsoleError(
          err instanceof Error ? err.message : "Failed to load match logs."
        );
        return null;
      } finally {
        setLogsLoading(false);
      }
    },
    [deriveLogsFromRows, matchLogMatchId]
  );

  useEffect(() => {
    refreshMatchLogsRef.current = refreshMatchLogs;
  }, [refreshMatchLogs]);

  // user-interaction handlers moved to useScoreKeeperActions

  const handleResumeSession = useCallback(async () => {
    if (!resumeCandidate) return;
    setResumeError(null);
    setResumeBusy(true);
    resumeHydrationRef.current = true;

    const snapshot = resumeCandidate;
    if (snapshot.eventId) {
      setSelectedEventId(snapshot.eventId);
    }
    if (snapshot.selectedMatchId || snapshot.matchId) {
      setSelectedMatchId(snapshot.selectedMatchId || snapshot.matchId);
    }

    setSetupForm({
      ...DEFAULT_SETUP_FORM,
      ...(snapshot.setupForm || {}),
    });
    const resumeWasStarted = Boolean(snapshot.matchStarted);
    const snapshotRules = snapshot.rules || {};
    const normalizedSnapshotAbba = normalizeAbbaPattern(snapshotRules.abbaPattern);
    setRules((prev) => ({
      ...prev,
      ...snapshotRules,
      abbaPattern: normalizedSnapshotAbba ?? prev.abbaPattern ?? "none",
    }));
    setRulesManuallyEdited(Boolean(snapshot.rules));
    setScore(snapshot.score ?? { a: 0, b: 0 });
    setTimeoutUsage(snapshot.timeoutUsage ?? { ...DEFAULT_TIMEOUT_USAGE });
    setPossessionTeam(snapshot.possessionTeam ?? null);
    setHalftimeTriggered(Boolean(snapshot.halftimeTriggered));
    setStoppageActive(Boolean(snapshot.stoppageActive));
    setMatchStarted(resumeWasStarted);
    setScoreTarget(
      snapshot.scoreTarget ??
        snapshot.rules?.gamePointTarget ??
        rules.gamePointTarget ??
        null
    );
    setSoftCapApplied(Boolean(snapshot.softCapApplied));
    setHardCapReached(Boolean(snapshot.hardCapReached));

    const restoredPrimary = deriveTimerStateFromSnapshot(
      snapshot.timer,
      ((snapshot.rules?.matchDuration ?? rules.matchDuration ?? DEFAULT_DURATION) || DEFAULT_DURATION) * 60,
      snapshot.timer?.label || DEFAULT_TIMER_LABEL
    );
    commitPrimaryTimerState(restoredPrimary.seconds, restoredPrimary.running);
    setTimerLabel(restoredPrimary.label || DEFAULT_TIMER_LABEL);

    const secondaryFallback =
      snapshot.secondaryTimer?.totalSeconds ??
      rules.timeoutSeconds ??
      secondaryTotalSeconds ??
      DEFAULT_TIMEOUT_SECONDS;
    const restoredSecondary = deriveTimerStateFromSnapshot(
      snapshot.secondaryTimer,
      secondaryFallback,
      snapshot.secondaryTimer?.label || DEFAULT_SECONDARY_LABEL
    );
    commitSecondaryTimerState(restoredSecondary.seconds, restoredSecondary.running);
    setSecondaryLabel(restoredSecondary.label || DEFAULT_SECONDARY_LABEL);
    setSecondaryTotalSeconds(restoredSecondary.totalSeconds || secondaryFallback);

    try {
      const resumeMatchId = snapshot.matchId || snapshot.selectedMatchId;
      if (!resumeMatchId) {
        throw new Error("Saved session is missing the match reference.");
      }

      let targetMatch =
        (activeMatch?.id === resumeMatchId ? activeMatch : null) ||
        matches.find((match) => match.id === resumeMatchId) ||
        null;

      if (!targetMatch) {
        targetMatch = await getMatchById(resumeMatchId);
      }

      if (!targetMatch) {
        throw new Error("Unable to locate the match saved in this session.");
      }

      setActiveMatch(targetMatch);
      setSelectedMatchId(targetMatch.id);
      setMatches((prev) => {
        const exists = prev.some((match) => match.id === targetMatch.id);
        if (exists) {
          return prev.map((match) => (match.id === targetMatch.id ? targetMatch : match));
        }
        return [targetMatch, ...prev];
      });

      const rosterPromise = (async () => {
        const teamA = targetMatch.team_a?.id || null;
        const teamB = targetMatch.team_b?.id || null;
        if (!teamA && !teamB) {
          setRosters({ teamA: [], teamB: [] });
          return;
        }
        setRostersLoading(true);
        setRostersError(null);
        try {
          const rosterEventId =
            targetMatch.event_id || targetMatch.event?.id || snapshot.eventId || null;
          const rosterData = await fetchRostersForTeams(teamA, teamB, rosterEventId);
          setRosters(rosterData);
        } catch (err) {
          setRostersError(err instanceof Error ? err.message : "Failed to load rosters.");
        } finally {
          setRostersLoading(false);
        }
      })();

      await Promise.all([
        rosterPromise,
        loadMatchEventDefinitions(),
        refreshMatchLogs(targetMatch.id, {
          a: targetMatch.score_a ?? 0,
          b: targetMatch.score_b ?? 0,
        }),
      ]);

      appliedEventRulesRef.current = snapshot.eventId || selectedEventId || null;
      if (snapshot.matchId) {
        appliedEventRulesRef.current = `match-${snapshot.matchId}`;
      } else if (snapshot.eventId) {
        appliedEventRulesRef.current = `event-${snapshot.eventId}`;
      } else if (selectedEventId) {
        appliedEventRulesRef.current = `event-${selectedEventId}`;
      }
      setResumeCandidate(null);
      setResumeHandled(true);
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : "Failed to resume session.");
    } finally {
      setResumeBusy(false);
      setTimeout(() => {
        resumeHydrationRef.current = false;
      }, 0);
    }
  }, [
    resumeCandidate,
    rules.matchDuration,
    rules.timeoutSeconds,
    secondaryTotalSeconds,
    commitPrimaryTimerState,
    commitSecondaryTimerState,
    matches,
    activeMatch,
    fetchRostersForTeams,
    loadMatchEventDefinitions,
    refreshMatchLogs,
  ]);

  const handleDiscardResume = useCallback(() => {
    if (userId) {
      clearScorekeeperSession(userId);
    }
    setResumeCandidate(null);
    setResumeHandled(true);
    setResumeError(null);
    setResumeBusy(false);
  }, [userId]);

  return {
    userId,
    events,
    setEvents,
    eventsLoading,
    eventsError,
    selectedEventId,
    setSelectedEventId,
    matches,
    setMatches,
    matchesLoading,
    matchesError,
    selectedMatchId,
    setSelectedMatchId,
    selectedMatch,
    activeMatch,
    setActiveMatch,
    initialising,
    setInitialising,
    setupForm,
    setSetupForm,
    rules,
    setRules,
    markRulesManuallyEdited,
    score,
    setScore,
    logs,
    setLogs,
    logsLoading,
    matchEventOptions,
    setMatchEventOptions,
    matchEventsError,
    setMatchEventsError,
    pendingEntries,
    setPendingEntries,
    timerSeconds,
    setTimerSeconds,
    timerRunning,
    setTimerRunning,
    secondarySeconds,
    setSecondarySeconds,
    secondaryRunning,
    setSecondaryRunning,
    secondaryLabel,
    setSecondaryLabel,
    secondaryTotalSeconds,
    setSecondaryTotalSeconds,
    secondaryFlashActive,
    setSecondaryFlashActive,
    secondaryFlashPulse,
    setSecondaryFlashPulse,
    timerLabel,
    setTimerLabel,
    consoleError,
    setConsoleError,
    rosters,
    setRosters,
    rostersLoading,
    setRostersLoading,
    rostersError,
    setRostersError,
    timeModalOpen,
    setTimeModalOpen,
    setupModalOpen,
    setSetupModalOpen,
    scoreModalState,
    setScoreModalState,
    scoreForm,
    setScoreForm,
    timeoutUsage,
    setTimeoutUsage,
    possessionTeam,
    setPossessionTeam,
    halftimeTriggered,
    setHalftimeTriggered,
    halftimeTimeCapArmed,
    setHalftimeTimeCapArmed,
    resumeCandidate,
    setResumeCandidate,
    resumeHandled,
    setResumeHandled,
    resumeBusy,
    setResumeBusy,
    resumeError,
    setResumeError,
    stoppageActive,
    setStoppageActive,
    matchStarted,
    setMatchStarted,
    consoleReady,
    displayTeamA,
    displayTeamB,
    displayTeamAShort,
    displayTeamBShort,
    kickoffLabel,
    teamAId,
    teamBId,
    venueName,
    statusLabel,
    getAbbaDescriptor,
    startingTeamId,
    matchStartingTeamKey,
    matchDuration,
    remainingTimeouts,
    canEndMatch,
    possessionValue,
    possessionLeader,
    halfRemainingLabel,
    sortedRosters,
    rosterOptionsForModal,
    formattedPrimaryClock,
    formattedSecondaryClock,
    orderedLogs,
    nextAbbaDescriptor,
    primaryTimerBg,
    secondaryTimerBg,
    fetchRostersForTeams,
    loadMatchEventDefinitions,
    resolveEventTypeIdLocal,
    getPrimaryRemainingSeconds,
    getSecondaryRemainingSeconds,
    commitPrimaryTimerState,
    commitSecondaryTimerState,
    buildSessionSnapshot,
    recordPendingEntry,
    startSecondaryTimer,
    startTrackedSecondaryTimer,
    describeEvent,
    appendLocalLog,
    logSimpleEvent,
    triggerHalftime,
    updatePossession,
    matchLogMatchId,
    currentMatchScore,
    deriveLogsFromRows,
    refreshMatchLogs,
    loadEvents,
    loadMatches,
    handleResumeSession,
    handleDiscardResume,
    initialScoreRef,
    currentMatchScoreRef,
    matchIdRef,
    refreshMatchLogsRef,
    primaryResetRef,
    secondaryResetRef,
    secondaryResetTriggeredRef,
    resumeHydrationRef,
    primaryTimerAnchorRef,
    secondaryTimerAnchorRef,
    toDateTimeLocal,
    scoreTarget,
    softCapApplied,
    hardCapReached,
    reachedPointTarget,
    clearLocalMatchState,
  };
}
