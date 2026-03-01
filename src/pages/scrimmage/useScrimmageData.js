import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  clearScrimmageSession,
  loadScrimmageSession,
  saveScrimmageSession,
} from "../../services/scrimmageSessionStore";
import { deriveShortName, formatClock, sortRoster, toDateTimeLocal } from "./scrimmageUtils";
import {
  ABBA_LINE_SEQUENCE,
  DEFAULT_TIMER_LABEL,
  DEFAULT_SECONDARY_LABEL,
  MAX_SCRIMMAGE_TIMER_SECONDS,
  SESSION_SAVE_DEBOUNCE_MS,
  TIMER_TICK_INTERVAL_MS,
} from "./scrimmageConstants";
import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import {
  cloneScrimmageRules,
  getRuleAbbaPattern,
  getRuleMatchDurationMinutes,
  getRuleTimeoutSeconds,
  getRuleTimeoutsPerHalf,
  getRuleTimeoutsTotal,
  normalizeScrimmageRules,
} from "./scrimmageRules";

const SCRIMMAGE_MATCH_ID = "scrimmage-local";
const TEAM_A = { id: "scrimmage-light", name: "Light" };
const TEAM_B = { id: "scrimmage-dark", name: "Dark" };
const DEFAULT_RULES = cloneScrimmageRules();

const DEFAULT_SETUP_FORM = { startTime: "", startingTeamId: "" };
const DEFAULT_TIMEOUT_USAGE = { A: 0, B: 0 };

function buildDummyRosters() {
  const demoPlayers = [
    { id: "demo-1", name: "Demo Player 1", jersey_number: 1 },
    { id: "demo-2", name: "Demo Player 2", jersey_number: 2 },
  ];
  return {
    teamA: demoPlayers,
    teamB: demoPlayers,
  };
}

function deriveElapsedTimerSnapshot(snapshot, fallbackSeconds, fallbackLabel) {
  const safeFallback = Number.isFinite(fallbackSeconds) ? fallbackSeconds : 0;
  const baseSeconds = Number.isFinite(snapshot?.seconds) ? snapshot.seconds : safeFallback;
  let seconds = Math.max(0, Math.round(baseSeconds));

  if (snapshot?.running && typeof snapshot.savedAt === "number") {
    const elapsed = Math.floor((Date.now() - snapshot.savedAt) / 1000);
    if (elapsed > 0) {
      seconds += elapsed;
    }
  }

  return {
    seconds,
    running: Boolean(snapshot?.running),
    label: snapshot?.label || fallbackLabel,
    totalSeconds: Number.isFinite(snapshot?.totalSeconds) ? snapshot.totalSeconds : safeFallback,
  };
}

function deriveCountdownTimerSnapshot(snapshot, fallbackSeconds, fallbackLabel) {
  const safeFallback = Number.isFinite(fallbackSeconds) ? fallbackSeconds : 0;
  const baseSeconds = Number.isFinite(snapshot?.seconds) ? snapshot.seconds : safeFallback;
  let seconds = Math.max(0, Math.round(baseSeconds));

  if (snapshot?.running && typeof snapshot.savedAt === "number") {
    const elapsed = Math.floor((Date.now() - snapshot.savedAt) / 1000);
    if (elapsed > 0) {
      seconds = Math.max(0, seconds - elapsed);
    }
  }

  return {
    seconds,
    running: Boolean(snapshot?.running) && seconds > 0,
    label: snapshot?.label || fallbackLabel,
    totalSeconds: Number.isFinite(snapshot?.totalSeconds) ? snapshot.totalSeconds : safeFallback,
  };
}

function createLocalId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePrimaryTimerState(seconds, running) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const clampedSeconds = Math.min(safeSeconds, MAX_SCRIMMAGE_TIMER_SECONDS);
  return {
    seconds: clampedSeconds,
    running: Boolean(running) && clampedSeconds < MAX_SCRIMMAGE_TIMER_SECONDS,
  };
}

export function useScrimmageData() {
  const { session } = useAuth();
  const sessionKey = session?.user?.id || "guest";

  const [events] = useState([]);
  const [eventsLoading] = useState(false);
  const [eventsError] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);

  const [matches] = useState([]);
  const [matchesLoading] = useState(false);
  const [matchesError] = useState(null);
  const [selectedMatchId, setSelectedMatchId] = useState(SCRIMMAGE_MATCH_ID);

  const [initialising, setInitialising] = useState(false);
  const [setupForm, setSetupForm] = useState(() => ({
    ...DEFAULT_SETUP_FORM,
    startTime: toDateTimeLocal(),
    startingTeamId: TEAM_A.id,
  }));
  const [rules, setRules] = useState(() => cloneScrimmageRules());

  const [score, setScore] = useState({ a: 0, b: 0 });
  const [logs, setLogs] = useState([]);
  const [logsLoading] = useState(false);
  const [matchEventsError] = useState(null);
  const [pendingEntries] = useState([]);

  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [secondarySeconds, setSecondarySeconds] = useState(getRuleTimeoutSeconds(DEFAULT_RULES));
  const [secondaryRunning, setSecondaryRunning] = useState(false);
  const [secondaryLabel, setSecondaryLabel] = useState(DEFAULT_SECONDARY_LABEL);
  const [secondaryTotalSeconds, setSecondaryTotalSeconds] = useState(
    getRuleTimeoutSeconds(DEFAULT_RULES)
  );
  const [secondaryFlashActive, setSecondaryFlashActive] = useState(false);
  const [secondaryFlashPulse, setSecondaryFlashPulse] = useState(false);
  const [timerLabel, setTimerLabel] = useState(DEFAULT_TIMER_LABEL);
  const [consoleError, setConsoleError] = useState(null);

  const [rosters, setRosters] = useState(() => buildDummyRosters());
  const [rostersLoading] = useState(false);
  const [rostersError] = useState(null);
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
  const [possessionTeam, setPossessionTeam] = useState(null);
  const [resumeCandidate, setResumeCandidate] = useState(null);
  const [resumeHandled, setResumeHandled] = useState(true);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeError, setResumeError] = useState(null);
  const [stoppageActive, setStoppageActive] = useState(false);
  const [matchStarted, setMatchStarted] = useState(false);
  const [consoleReady, setConsoleReady] = useState(true);

  const primaryResetRef = useRef(null);
  const secondaryResetRef = useRef(null);
  const secondaryResetTriggeredRef = useRef(false);
  const primaryTimerAnchorRef = useRef({ baseSeconds: 0, anchorTimestamp: null });
  const secondaryTimerAnchorRef = useRef({
    baseSeconds: getRuleTimeoutSeconds(DEFAULT_RULES),
    anchorTimestamp: null,
  });

  const abbaPattern = useMemo(() => getRuleAbbaPattern(rules), [rules]);

  const selectedMatch = useMemo(
    () => ({
      id: SCRIMMAGE_MATCH_ID,
      team_a: {
        id: TEAM_A.id,
        name: TEAM_A.name,
        short_name: deriveShortName(TEAM_A.name),
      },
      team_b: {
        id: TEAM_B.id,
        name: TEAM_B.name,
        short_name: deriveShortName(TEAM_B.name),
      },
      start_time: setupForm.startTime ? new Date(setupForm.startTime).toISOString() : null,
      status: matchStarted ? "live" : "pending",
      abba_pattern: abbaPattern,
    }),
    [setupForm.startTime, matchStarted, abbaPattern]
  );

  const getPrimaryRemainingSeconds = useCallback(() => {
    const anchor = primaryTimerAnchorRef.current;
    const base = Number.isFinite(anchor?.baseSeconds) ? anchor.baseSeconds : timerSeconds;
    if (!timerRunning || !anchor?.anchorTimestamp) {
      return Math.min(MAX_SCRIMMAGE_TIMER_SECONDS, Math.max(0, Math.round(base)));
    }
    const elapsed = Math.floor((Date.now() - anchor.anchorTimestamp) / 1000);
    return Math.min(MAX_SCRIMMAGE_TIMER_SECONDS, Math.max(0, Math.round(base + elapsed)));
  }, [timerRunning, timerSeconds]);

  const getSecondaryRemainingSeconds = useCallback(() => {
    const anchor = secondaryTimerAnchorRef.current;
    const base = Number.isFinite(anchor?.baseSeconds) ? anchor.baseSeconds : secondarySeconds;
    if (!secondaryRunning || !anchor?.anchorTimestamp) {
      return Math.max(0, Math.round(base));
    }
    const elapsed = Math.floor((Date.now() - anchor.anchorTimestamp) / 1000);
    return Math.max(0, Math.round(base - elapsed));
  }, [secondaryRunning, secondarySeconds]);

  const commitPrimaryTimerState = useCallback((seconds, running) => {
    const nextState = normalizePrimaryTimerState(seconds, running);
    setTimerSeconds(nextState.seconds);
    setTimerRunning(nextState.running);
    if (nextState.running) {
      primaryTimerAnchorRef.current = {
        baseSeconds: nextState.seconds,
        anchorTimestamp: Date.now(),
      };
    } else {
      primaryTimerAnchorRef.current = {
        baseSeconds: nextState.seconds,
        anchorTimestamp: null,
      };
    }
  }, []);

  const commitSecondaryTimerState = useCallback((seconds, running) => {
    const baseSeconds = Number.isFinite(seconds) ? seconds : 0;
    setSecondarySeconds(baseSeconds);
    setSecondaryRunning(Boolean(running));
    if (running) {
      secondaryTimerAnchorRef.current = {
        baseSeconds,
        anchorTimestamp: Date.now(),
      };
    } else {
      secondaryTimerAnchorRef.current = {
        baseSeconds,
        anchorTimestamp: null,
      };
    }
  }, []);

  const appendLocalLog = useCallback((entry) => {
    setLogs((prev) => [...prev, entry]);
  }, []);

  const resolveRosterName = useCallback(
    (playerId) => {
      if (!playerId) return null;
      const roster = [...(rosters.teamA || []), ...(rosters.teamB || [])];
      const match = roster.find((player) => player.id === playerId);
      return match?.name || null;
    },
    [rosters.teamA, rosters.teamB]
  );

  const updatePossession = useCallback(
    (teamKey, options = {}) => {
      if (!teamKey) return;
      setPossessionTeam(teamKey);
      if (options.logTurnover === false) return;

      const actorName = resolveRosterName(options.actorId);
      const logEntry = {
        id: createLocalId("turnover"),
        eventCode: MATCH_LOG_EVENT_CODES.TURNOVER,
        eventDescription: "Turnover",
        team: options.eventTeamKey || teamKey,
        timestamp: new Date().toISOString(),
        totalA: score.a,
        totalB: score.b,
        scorerId: options.actorId || null,
        scorerName: actorName || null,
        actorId: options.actorId || null,
        actorName,
      };
      appendLocalLog(logEntry);
    },
    [appendLocalLog, resolveRosterName, score.a, score.b]
  );

  const getAbbaDescriptor = useCallback(
    (orderIndex) => {
      if (!Number.isFinite(orderIndex) || orderIndex < 0) return null;
      if (!["male", "female"].includes(abbaPattern)) return null;
      const startGender = abbaPattern === "male" ? "Male" : "Female";
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
    [abbaPattern]
  );

  const getAbbaLineCode = useCallback(
    (orderIndex) => {
      if (!Number.isFinite(orderIndex) || orderIndex < 0) return "none";
      if (!["male", "female"].includes(abbaPattern)) return "none";
      const startCode = abbaPattern === "male" ? "M" : "F";
      const alternateCode = startCode === "M" ? "F" : "M";
      const step = orderIndex % ABBA_LINE_SEQUENCE.length;
      const suffix = ABBA_LINE_SEQUENCE[step] ?? "1";
      const halfSequence = Math.max(1, Math.floor(ABBA_LINE_SEQUENCE.length / 2));
      const useStartCode = step < halfSequence;
      const prefix = useStartCode ? startCode : alternateCode;
      return `${prefix}${suffix}`;
    },
    [abbaPattern]
  );

  useEffect(() => {
    if (!timerRunning && !secondaryRunning) return undefined;
    const tick = () => {
      if (timerRunning) {
        const nextPrimary = getPrimaryRemainingSeconds();
        if (nextPrimary >= MAX_SCRIMMAGE_TIMER_SECONDS) {
          commitPrimaryTimerState(MAX_SCRIMMAGE_TIMER_SECONDS, false);
        } else {
          setTimerSeconds(nextPrimary);
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
  ]);

  useEffect(() => {
    if (!sessionKey) return;
    const stored = loadScrimmageSession(sessionKey);
    if (stored?.data?.matchId === SCRIMMAGE_MATCH_ID) {
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
  }, [sessionKey]);

  const handleResumeSession = useCallback(() => {
    if (!resumeCandidate) {
      setResumeHandled(true);
      return;
    }

    setResumeBusy(true);
    setResumeError(null);

    try {
      const snapshotRules = normalizeScrimmageRules(resumeCandidate.rules || DEFAULT_RULES);
      setRules(snapshotRules);
      setSetupForm((prev) => ({
        ...prev,
        ...resumeCandidate.setupForm,
      }));
      setScore(resumeCandidate.score || { a: 0, b: 0 });
      setLogs(Array.isArray(resumeCandidate.logs) ? resumeCandidate.logs : []);
      setTimeoutUsage({ ...DEFAULT_TIMEOUT_USAGE, ...(resumeCandidate.timeoutUsage || {}) });
      setPossessionTeam(resumeCandidate.possessionTeam || null);
      setMatchStarted(Boolean(resumeCandidate.matchStarted));
      setStoppageActive(Boolean(resumeCandidate.stoppageActive));

      const primaryTimer = deriveElapsedTimerSnapshot(
        resumeCandidate.timer,
        0,
        DEFAULT_TIMER_LABEL
      );
      const resumedPrimaryTimer = normalizePrimaryTimerState(
        primaryTimer.seconds,
        primaryTimer.running
      );
      setTimerSeconds(resumedPrimaryTimer.seconds);
      setTimerRunning(resumedPrimaryTimer.running);
      setTimerLabel(primaryTimer.label);
      primaryTimerAnchorRef.current = resumedPrimaryTimer.running
        ? { baseSeconds: resumedPrimaryTimer.seconds, anchorTimestamp: Date.now() }
        : { baseSeconds: resumedPrimaryTimer.seconds, anchorTimestamp: null };

      const secondaryFallback = getRuleTimeoutSeconds(snapshotRules);
      const secondaryTimer = deriveCountdownTimerSnapshot(
        resumeCandidate.secondaryTimer,
        secondaryFallback,
        DEFAULT_SECONDARY_LABEL
      );
      setSecondarySeconds(secondaryTimer.seconds);
      setSecondaryRunning(secondaryTimer.running);
      setSecondaryLabel(secondaryTimer.label);
      setSecondaryTotalSeconds(secondaryTimer.totalSeconds);
      secondaryTimerAnchorRef.current = secondaryTimer.running
        ? { baseSeconds: secondaryTimer.seconds, anchorTimestamp: Date.now() }
        : { baseSeconds: secondaryTimer.seconds, anchorTimestamp: null };

      setConsoleReady(true);
      setResumeHandled(true);
    } catch (error) {
      setResumeError(error instanceof Error ? error.message : "Unable to resume session.");
    } finally {
      setResumeBusy(false);
    }
  }, [resumeCandidate]);

  const clearLocalMatchState = useCallback(() => {
    setScore({ a: 0, b: 0 });
    setLogs([]);
    setMatchStarted(false);
    setStoppageActive(false);
    setTimerRunning(false);
    setTimerSeconds(0);
    setTimerLabel(DEFAULT_TIMER_LABEL);
    setSecondaryRunning(false);
    setSecondarySeconds(getRuleTimeoutSeconds(DEFAULT_RULES));
    setSecondaryTotalSeconds(getRuleTimeoutSeconds(DEFAULT_RULES));
    setSecondaryLabel(DEFAULT_SECONDARY_LABEL);
    setTimeoutUsage({ ...DEFAULT_TIMEOUT_USAGE });
    setPossessionTeam(null);
    setConsoleError(null);
    setScoreModalState({ open: false, team: null, mode: "add", logIndex: null });
    setScoreForm({ scorerId: "", assistId: "" });
    setRules(cloneScrimmageRules());
    setSetupForm({
      ...DEFAULT_SETUP_FORM,
      startTime: toDateTimeLocal(),
      startingTeamId: TEAM_A.id,
    });
    primaryTimerAnchorRef.current = { baseSeconds: 0, anchorTimestamp: null };
    secondaryTimerAnchorRef.current = {
      baseSeconds: getRuleTimeoutSeconds(DEFAULT_RULES),
      anchorTimestamp: null,
    };
    clearScrimmageSession(sessionKey);
  }, [sessionKey]);

  const handleDiscardResume = useCallback(() => {
    setResumeCandidate(null);
    setResumeHandled(true);
    setResumeError(null);
    setResumeBusy(false);
    clearLocalMatchState();
  }, [clearLocalMatchState]);

  const buildSessionSnapshot = useCallback(() => {
    if (!sessionKey) return null;
    const now = Date.now();
    return {
      matchId: SCRIMMAGE_MATCH_ID,
      selectedMatchId: SCRIMMAGE_MATCH_ID,
      matchStarted,
      setupForm: { ...setupForm },
      rules: JSON.parse(JSON.stringify(rules)),
      score: { ...score },
      logs,
      timer: {
        seconds: getPrimaryRemainingSeconds(),
        running: timerRunning,
        label: timerLabel,
        savedAt: now,
        totalSeconds: null,
      },
      secondaryTimer: {
        seconds: getSecondaryRemainingSeconds(),
        running: secondaryRunning,
        label: secondaryLabel,
        savedAt: now,
        totalSeconds: secondaryTotalSeconds,
      },
      timeoutUsage: { ...timeoutUsage },
      possessionTeam,
      stoppageActive,
    };
  }, [
    sessionKey,
    matchStarted,
    setupForm,
    rules,
    score,
    logs,
    getPrimaryRemainingSeconds,
    timerRunning,
    timerLabel,
    getSecondaryRemainingSeconds,
    secondaryRunning,
    secondaryLabel,
    secondaryTotalSeconds,
    timeoutUsage,
    possessionTeam,
    stoppageActive,
  ]);

  useEffect(() => {
    if (!sessionKey || !resumeHandled) return undefined;
    const snapshot = buildSessionSnapshot();
    if (!snapshot) return undefined;
    const handle = setTimeout(() => {
      saveScrimmageSession(sessionKey, snapshot);
    }, SESSION_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [sessionKey, resumeHandled, buildSessionSnapshot]);

  const displayTeamA = TEAM_A.name;
  const displayTeamB = TEAM_B.name;
  const displayTeamAShort = deriveShortName(displayTeamA);
  const displayTeamBShort = deriveShortName(displayTeamB);
  const kickoffLabel = "Scrimmage session";
  const teamAId = TEAM_A.id;
  const teamBId = TEAM_B.id;
  const venueName = "Local";
  const statusLabel = matchStarted ? (stoppageActive ? "STOPPED" : "LIVE") : "READY";

  const startingTeamId = setupForm.startingTeamId || TEAM_A.id;
  const matchStartingTeamKey = startingTeamId === TEAM_B.id ? "B" : "A";
  const matchDuration = getRuleMatchDurationMinutes(rules);
  const remainingTimeouts = {
    A: Math.max(getRuleTimeoutsTotal(rules) - timeoutUsage.A, 0),
    B: Math.max(getRuleTimeoutsTotal(rules) - timeoutUsage.B, 0),
  };
  const canEndMatch = matchStarted;
  const possessionValue = possessionTeam === "A" ? 0 : possessionTeam === "B" ? 100 : 50;
  const possessionLeader =
    possessionTeam === "A"
      ? displayTeamA
      : possessionTeam === "B"
        ? displayTeamB
        : "Contested";
  const halfRemainingLabel = (teamKey) =>
    getRuleTimeoutsPerHalf(rules) > 0
      ? Math.max(getRuleTimeoutsPerHalf(rules) - timeoutUsage[teamKey], 0)
      : "N/A";

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

  const primaryTimerBg = "bg-[#dff7e5]";
  const secondaryTimerBg = secondaryFlashActive
    ? secondaryFlashPulse
      ? "bg-[#fecdd3]"
      : "bg-[#ffe4e6]"
    : "bg-[#dff7e5]";

  const loadMatches = useCallback(() => Promise.resolve([]), []);

  return {
    events,
    eventsLoading,
    eventsError,
    selectedEventId,
    setSelectedEventId,
    matches,
    matchesLoading,
    matchesError,
    selectedMatchId,
    setSelectedMatchId,
    selectedMatch,
    initialising,
    setInitialising,
    setupForm,
    setSetupForm,
    rules,
    setRules,
    score,
    setScore,
    logs,
    setLogs,
    logsLoading,
    matchEventsError,
    pendingEntries,
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
    rostersError,
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
    resumeCandidate,
    resumeHandled,
    resumeBusy,
    resumeError,
    stoppageActive,
    setStoppageActive,
    matchStarted,
    setMatchStarted,
    consoleReady,
    setConsoleReady,
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
    getAbbaLineCode,
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
    getPrimaryRemainingSeconds,
    getSecondaryRemainingSeconds,
    commitPrimaryTimerState,
    commitSecondaryTimerState,
    buildSessionSnapshot,
    appendLocalLog,
    updatePossession,
    loadMatches,
    handleResumeSession,
    handleDiscardResume,
    clearLocalMatchState,
    primaryResetRef,
    secondaryResetRef,
    secondaryResetTriggeredRef,
    primaryTimerAnchorRef,
    secondaryTimerAnchorRef,
  };
}
