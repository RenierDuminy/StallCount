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
  SESSION_SAVE_DEBOUNCE_MS,
  TIMER_TICK_INTERVAL_MS,
  ABBA_LINE_SEQUENCE,
} from "./scorekeeperConstants";

const DEFAULT_ABBA_LINES = ["none", "M1", "M2", "F1", "F2"];

function clonePendingEntries(entries = []) {
  return entries.map((entry) => ({ ...entry }));
}

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

function normalizeSeconds(value, fallback = 0) {
  const numeric = Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.round(numeric));
}

function computeRemainingSeconds(anchor, isRunning, fallback = 0) {
  const base = normalizeSeconds(anchor?.baseSeconds, fallback);
  if (!isRunning || !anchor?.anchorTimestamp) {
    return base;
  }
  const elapsedSeconds = Math.floor((Date.now() - anchor.anchorTimestamp) / 1000);
  return Math.max(0, base - elapsedSeconds);
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

  const [activeMatch, setActiveMatch] = useState(null);
  const [initialising, setInitialising] = useState(false);
  const [abbaLines, setAbbaLines] = useState(DEFAULT_ABBA_LINES);

  const [setupForm, setSetupForm] = useState(() => ({ ...DEFAULT_SETUP_FORM }));

  const [rules, setRules] = useState({
    matchDuration: 100,
    halftimeMinutes: 55,
    halftimeBreakMinutes: 7,
    timeoutSeconds: 75,
    timeoutsTotal: 2,
    timeoutsPerHalf: 0,
    abbaPattern: "none",
  });

  const [score, setScore] = useState({ a: 0, b: 0 });
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [matchEventOptions, setMatchEventOptions] = useState([]);
  const [matchEventsError, setMatchEventsError] = useState(null);
  const [pendingEntries, setPendingEntries] = useState([]);
  const [timerSeconds, setTimerSeconds] = useState(DEFAULT_DURATION * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [secondarySeconds, setSecondarySeconds] = useState(75);
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
const [secondaryTotalSeconds, setSecondaryTotalSeconds] = useState(rules.timeoutSeconds);
const [secondaryFlashActive, setSecondaryFlashActive] = useState(false);
const [secondaryFlashPulse, setSecondaryFlashPulse] = useState(false);
const [possessionTeam, setPossessionTeam] = useState(null);
const [halftimeTriggered, setHalftimeTriggered] = useState(false);
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

  const fetchRostersForTeams = useCallback(async (teamAId, teamBId) => {
    const [teamAPlayers, teamBPlayers] = await Promise.all([
      teamAId ? getPlayersByTeam(teamAId) : [],
      teamBId ? getPlayersByTeam(teamBId) : [],
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
      if (!selectedEventId && data.length > 0) {
        setSelectedEventId(data[0].id);
      }
    } catch (err) {
      setEventsError(err.message || "Unable to load events.");
    } finally {
      setEventsLoading(false);
    }
  }, [selectedEventId]);

  const loadMatches = useCallback(
    async (eventIdOverride, options = {}) => {
      const targetEventId = eventIdOverride ?? selectedEventId;
      if (!targetEventId) return;

      const { preferredMatchId = null, preserveSelection = true } = options;

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
        setSelectedMatchId(matchExists ? requestedId : data[0].id);
      } catch (err) {
        setMatchesError(err.message || "Unable to load matches.");
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
const resumeHydrationRef = useRef(false);
const primaryTimerAnchorRef = useRef({
  baseSeconds: DEFAULT_DURATION * 60,
  anchorTimestamp: null,
});
const secondaryTimerAnchorRef = useRef({
  baseSeconds: (rules.timeoutSeconds || 75) ?? 75,
  anchorTimestamp: null,
});
const activeSecondaryEventRef = useRef(null);
const previousSecondaryRunningRef = useRef(false);
const previousPrimaryRunningRef = useRef(false);
const stoppageActiveRef = useRef(false);
  const [matchStarted, setMatchStarted] = useState(false);
  const consoleReady = Boolean(activeMatch);
  const matchSettingsLocked = matchStarted;

const selectedMatch = useMemo(
  () => matches.find((m) => m.id === selectedMatchId) || null,
  [matches, selectedMatchId]
);

const getPrimaryRemainingSeconds = useCallback(
  () => computeRemainingSeconds(primaryTimerAnchorRef.current, timerRunning),
  [timerRunning]
);

const getSecondaryRemainingSeconds = useCallback(
  () => computeRemainingSeconds(secondaryTimerAnchorRef.current, secondaryRunning),
  [secondaryRunning]
);

const commitPrimaryTimerState = useCallback(
  (seconds, running) => {
    const normalized = normalizeSeconds(seconds);
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
    const matchSource = activeMatch || selectedMatch;
    const teamA = matchSource?.team_a?.id || null;
    const teamB = matchSource?.team_b?.id || null;
    const targetMatchId = matchSource?.id || null;

    if (!teamA && !teamB) {
      setRosters({ teamA: [], teamB: [] });
      refreshMatchLogsRef.current?.(null);
      return;
    }

    let ignore = false;
    setRostersLoading(true);
    setRostersError(null);

    fetchRostersForTeams(teamA, teamB)
      .then((data) => {
        if (!ignore) {
          setRosters(data);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setRostersError(err.message || "Failed to load rosters.");
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
  }, [activeMatch, selectedMatch, fetchRostersForTeams]);

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
  const flashThreshold = normalizedSecondaryLabel === "discussion" ? 15 : 30;
  if (secondarySeconds <= flashThreshold) {
    setSecondaryFlashActive(true);
  } else {
    setSecondaryFlashActive(false);
    setSecondaryFlashPulse(false);
  }
}, [secondaryRunning, secondarySeconds, secondaryLabel]);

useEffect(() => {
  if (!secondaryFlashActive) return undefined;
  const interval = setInterval(() => {
    setSecondaryFlashPulse((prev) => !prev);
  }, 250);
  return () => clearInterval(interval);
}, [secondaryFlashActive]);

useEffect(() => {
  if (resumeHydrationRef.current) return;
  if (!secondaryRunning) {
    setSecondaryTotalSeconds(rules.timeoutSeconds);
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
    if (!timerRunning) return undefined;
    const tick = () => {
      const remaining = getPrimaryRemainingSeconds();
      if (remaining <= 0) {
        commitPrimaryTimerState(0, false);
        return;
      }
      setTimerSeconds(remaining);
    };
    tick();
    const interval = setInterval(tick, TIMER_TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [timerRunning, getPrimaryRemainingSeconds, commitPrimaryTimerState]);

useEffect(() => {
  if (!secondaryRunning) return undefined;
  const tick = () => {
    const remaining = getSecondaryRemainingSeconds();
    if (remaining <= 0) {
      commitSecondaryTimerState(0, false);
      return;
    }
    setSecondarySeconds(remaining);
  };
  tick();
  const interval = setInterval(tick, TIMER_TICK_INTERVAL_MS);
  return () => clearInterval(interval);
}, [secondaryRunning, getSecondaryRemainingSeconds, commitSecondaryTimerState]);

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
    setRules((prev) => ({
      ...prev,
      abbaPattern: matchSource.abba_pattern || prev.abbaPattern || "none",
    }));
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
        commitSecondaryTimerState(rules.timeoutSeconds || 75, false);
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
  const venueName = activeMatch?.venue?.name || selectedMatch?.venue?.name || null;
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
      const candidate = (line || "none").trim() || "none";
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
    const suffix = ABBA_LINE_SEQUENCE[step] ?? "2";
    const useStartCode = step === 0 || step === ABBA_LINE_SEQUENCE.length - 1;
    const prefix = useStartCode ? startCode : alternateCode;
    return normalizeAbbaLine(`${prefix}${suffix}`);
  },
  [rules.abbaPattern, normalizeAbbaLine]
);
  const startingTeamId = activeMatch?.starting_team_id || setupForm.startingTeamId;
  const matchStartingTeamKey = startingTeamId === teamBId ? "B" : "A";
  const matchDuration = rules.matchDuration;
  const remainingTimeouts = {
    A: Math.max(rules.timeoutsTotal - timeoutUsage.A, 0),
    B: Math.max(rules.timeoutsTotal - timeoutUsage.B, 0),
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
      pendingEntries: clonePendingEntries(pendingEntries),
      possessionTeam,
      halftimeTriggered,
      stoppageActive,
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
    pendingEntries,
    possessionTeam,
    halftimeTriggered,
    stoppageActive,
    secondaryTotalSeconds,
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
const recordPendingEntry = useCallback(
  (entry) => {
    const normalizedEntry = {
      ...entry,
      abbaLine:
        typeof entry?.abbaLine === "string" ? normalizeAbbaLine(entry.abbaLine) : entry?.abbaLine ?? null,
      eventTypeId: entry?.eventTypeId ?? null,
    };
    const dbPayload = {
      matchId: normalizedEntry.matchId,
      teamId: normalizedEntry.teamId ?? null,
      scorerId: normalizedEntry.scorerId ?? null,
      assistId: normalizedEntry.assistId ?? null,
      abbaLine: normalizedEntry.abbaLine ?? null,
      createdAt: normalizedEntry.createdAt ?? null,
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
      scorer_id: dbPayload.scorerId,
      assist_id: dbPayload.assistId,
      abba_line: dbPayload.abbaLine,
      created_at: dbPayload.createdAt,
    };
    if (!supabasePayload.event_type_id && dbPayload.eventTypeCode) {
      supabasePayload.event_type_code = dbPayload.eventTypeCode;
    }

    console.log("[ScoreKeeper] Pending DB payload:", supabasePayload);
    setPendingEntries((prev) => [...prev, supabasePayload]);
    if (!dbPayload.matchId || (!dbPayload.eventTypeCode && !dbPayload.eventTypeId)) {
      return;
    }
    void (async () => {
      try {
        await createMatchLogEntry(dbPayload);
      } catch (err) {
        console.error("[ScoreKeeper] Failed to persist match log entry:", err);
        setConsoleError((prev) =>
          prev || (err instanceof Error ? err.message : "Failed to submit match log entry.")
        );
      }
    })();
  },
  [setPendingEntries, setConsoleError, normalizeAbbaLine]
);
const normalizedSecondaryLabel = (secondaryLabel || "").toLowerCase();
const isDiscussionTimer = normalizedSecondaryLabel === "discussion";

const primaryTimerBg =
  timerSeconds === 0 ? "bg-[#fee2e2]" : timerRunning ? "bg-[#dcfce7]" : "bg-[#e2e8f0]";
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
    if (secondaryFlashActive) {
      return secondaryFlashPulse ? "bg-[#fcd34d]" : "bg-[#fef3c7]";
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
    ({ team, timestamp, scorerId, assistId, totals, eventDescription, eventCode }) => {
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
            id: `local-${prev.length + 1}`,
            team,
            timestamp,
            scorerName:
              rosterNameLookup.get(scorerId || "") ||
              (scorerId ? "Unknown player" : "Unassigned"),
            scorerId: scorerId || null,
            assistName:
              normalizedCode === MATCH_LOG_EVENT_CODES.CALAHAN
                ? "CALAHAN!!"
                : rosterNameLookup.get(assistId || "") ||
                  (assistId ? "Unknown player" : null),
            assistId: assistId || null,
            totalA: totals.a,
            totalB: totals.b,
            eventDescription,
            eventCode: normalizedCode,
            scoreOrderIndex: nextScoreOrder,
            abbaLine,
          },
        ];
      });
      return derivedInfo;
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
        const appended = appendLocalLog({
          team: teamKey,
          timestamp,
          scorerId: null,
          assistId: null,
          totals: currentMatchScoreRef.current || score,
          eventDescription: describeEvent(eventTypeId),
          eventCode,
        });
        const entry = {
          matchId: activeMatch.id,
          eventTypeId,
          eventCode,
          teamId: teamKey === "A" ? teamAId : teamKey === "B" ? teamBId : null,
          createdAt: timestamp,
          abbaLine: appended.scoreOrderIndex !== null ? appended.abbaLine : null,
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

  const triggerHalftime = useCallback(async () => {
    if (halftimeTriggered || !matchStarted) return;
    setHalftimeTriggered(true);
    const breakSeconds = Math.max(1, (rules.halftimeBreakMinutes || 0) * 60);
    await startTrackedSecondaryTimer(breakSeconds || 60, "Halftime break", {
      eventStartCode: MATCH_LOG_EVENT_CODES.HALFTIME_START,
      eventEndCode: MATCH_LOG_EVENT_CODES.HALFTIME_END,
    });
  }, [
    halftimeTriggered,
    matchStarted,
    rules.halftimeBreakMinutes,
    startTrackedSecondaryTimer,
  ]);

  useEffect(() => {
    if (!matchStarted || halftimeTriggered) return;
    const halftimeMinutes = rules.halftimeMinutes || 0;
    if (halftimeMinutes <= 0) return;
    const elapsedSeconds = matchDuration * 60 - timerSeconds;
    if (elapsedSeconds >= halftimeMinutes * 60) {
      void triggerHalftime();
    }
  }, [
    matchStarted,
    halftimeTriggered,
    rules.halftimeMinutes,
    matchDuration,
    timerSeconds,
    triggerHalftime,
  ]);

  const updatePossession = useCallback(
    async (teamKey, { logTurnover = true } = {}) => {
      if (!teamKey || teamKey === possessionTeam) return;
      if (logTurnover && !matchStarted) return;
      setPossessionTeam(teamKey);

      if (!logTurnover || !consoleReady || !activeMatch?.id) return;

      try {
        const eventTypeId = await resolveEventTypeIdLocal(MATCH_LOG_EVENT_CODES.TURNOVER);
        if (!eventTypeId) {
          setConsoleError(
            "Missing `turnover` event type in match_events. Please add it in Supabase before logging."
          );
          return;
        }
        const targetTeamId = teamKey === "A" ? teamAId : teamBId;
        if (!targetTeamId) {
          setConsoleError("Missing team mapping for turnover entry.");
          return;
        }
        const timestamp = new Date().toISOString();
        const totalsSnapshot = score;
        const appended = appendLocalLog({
          team: teamKey,
          timestamp,
          scorerId: null,
          assistId: null,
          totals: totalsSnapshot,
          eventDescription: describeEvent(eventTypeId),
          eventCode: MATCH_LOG_EVENT_CODES.TURNOVER,
        });
        const entry = {
          matchId: activeMatch.id,
          eventTypeId,
          eventCode: MATCH_LOG_EVENT_CODES.TURNOVER,
          teamId: targetTeamId,
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
          row.scorer?.name ||
          (row.scorer_id ? rosterNameLookup.get(row.scorer_id) : null) ||
          "Unassigned";
        const assistName =
          row.assist?.name ||
          (row.assist_id ? rosterNameLookup.get(row.assist_id) : null) ||
          null;

        return {
          id: row.id,
          team: teamKey,
          timestamp: row.created_at,
          scorerName,
          scorerId: row.scorer_id ?? null,
          assistName,
          assistId: row.assist_id ?? null,
          totalA: runningA,
          totalB: runningB,
          eventCode: row.event?.code || null,
          eventDescription: row.event?.description || row.event?.code || "Event",
          eventCategory: row.event?.category || null,
          scoreOrderIndex,
          abbaLine: normalizeAbbaLine(row.abba_line || getAbbaLineCode(scoreOrderIndex)),
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
        setLogs(derived.logs);
        setScore(derived.totals);
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
    setRules((prev) => ({
      ...prev,
      ...(snapshot.rules || {}),
    }));
    setScore(snapshot.score ?? { a: 0, b: 0 });
    setTimeoutUsage(snapshot.timeoutUsage ?? { ...DEFAULT_TIMEOUT_USAGE });
    setPendingEntries(clonePendingEntries(snapshot.pendingEntries || []));
    setPossessionTeam(snapshot.possessionTeam ?? null);
    setHalftimeTriggered(Boolean(snapshot.halftimeTriggered));
    setStoppageActive(Boolean(snapshot.stoppageActive));
    setMatchStarted(resumeWasStarted);

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
      75;
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
          const rosterData = await fetchRostersForTeams(teamA, teamB);
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
    matchSettingsLocked,
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
    resumeHydrationRef,
    primaryTimerAnchorRef,
    secondaryTimerAnchorRef,
    toDateTimeLocal,
  };
}
