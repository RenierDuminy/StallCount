import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getEventsList } from "../services/leagueService";
import { getMatchesByEvent, initialiseMatch } from "../services/matchService";
import { getPlayersByTeam } from "../services/playerService";
import { updateScore } from "../services/realtimeService";
import {
  MATCH_LOG_EVENT_CODES,
  createMatchLogEntry,
  deleteMatchLogEntry,
  getMatchLogs,
  updateMatchLogEntry,
  getMatchEventDefinitions,
} from "../services/matchLogService";


const DEFAULT_DURATION = 90;

export default function ScoreKeeperPage() {
  const navigate = useNavigate();
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

  const [setupForm, setSetupForm] = useState({
    startTime: "",
    startingTeamId: "",
  });

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
const [secondaryLabel, setSecondaryLabel] = useState("Time out");
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
const [timeoutUsage, setTimeoutUsage] = useState({ A: 0, B: 0 });
const [timerLabel, setTimerLabel] = useState("Game time");
const [secondaryTotalSeconds, setSecondaryTotalSeconds] = useState(rules.timeoutSeconds);
const [secondaryFlashActive, setSecondaryFlashActive] = useState(false);
const [secondaryFlashPulse, setSecondaryFlashPulse] = useState(false);
const [possessionTeam, setPossessionTeam] = useState(null);

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
const initialScoreRef = useRef({ a: 0, b: 0 });
const currentMatchScoreRef = useRef({ a: 0, b: 0 });
const matchIdRef = useRef(null);
const refreshMatchLogsRef = useRef(null);
const primaryResetRef = useRef(null);
const secondaryResetRef = useRef(null);
  const [matchStarted, setMatchStarted] = useState(false);
  const consoleReady = Boolean(activeMatch);
  const matchSettingsLocked = matchStarted;

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) || null,
    [matches, selectedMatchId]
  );

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    loadMatchEventDefinitions();
  }, [loadMatchEventDefinitions]);

  useEffect(() => {
    if (!selectedEventId) {
      setMatches([]);
      setSelectedMatchId(null);
      return;
    }
    loadMatches(selectedEventId);
  }, [selectedEventId]);

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
  }, [activeMatch?.id, selectedMatch?.id, fetchRostersForTeams]);

useEffect(() => {
  setTimeoutUsage({ A: 0, B: 0 });
}, [rules.timeoutsTotal, rules.timeoutsPerHalf]);

useEffect(() => {
  if (!consoleReady) {
    setMatchStarted(false);
    return;
  }
  setMatchStarted(false);
}, [consoleReady, activeMatch?.id]);

useEffect(() => {
  if (!secondaryRunning) {
    setSecondaryFlashActive(false);
    setSecondaryFlashPulse(false);
    return;
  }
  if (secondaryTotalSeconds >= 60 && secondaryTotalSeconds - secondarySeconds >= 60) {
    setSecondaryFlashActive(true);
  } else {
    setSecondaryFlashActive(false);
    setSecondaryFlashPulse(false);
  }
}, [secondaryRunning, secondarySeconds, secondaryTotalSeconds]);

useEffect(() => {
  if (!secondaryFlashActive) return undefined;
  const interval = setInterval(() => {
    setSecondaryFlashPulse((prev) => !prev);
  }, 250);
  return () => clearInterval(interval);
}, [secondaryFlashActive]);

useEffect(() => {
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
    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  useEffect(() => {
    if (!secondaryRunning) return undefined;
    const interval = setInterval(() => {
      setSecondarySeconds((prev) => {
        if (prev <= 1) {
          setSecondaryRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [secondaryRunning]);

  useEffect(() => {
    if (selectedMatch) {
      setSetupForm({
        startTime: toDateTimeLocal(selectedMatch.start_time),
        startingTeamId:
          selectedMatch.starting_team_id ||
          selectedMatch.team_a?.id ||
          selectedMatch.team_b?.id ||
          "",
      });
      if (!matchSettingsLocked) {
        setRules((prev) => ({
          ...prev,
          abbaPattern: selectedMatch.abba_pattern || prev.abbaPattern || "none",
        }));
      }
    } else {
      setSetupForm({
        startTime: toDateTimeLocal(),
        startingTeamId: "",
      });
    }
  }, [selectedMatch, matchSettingsLocked]);

  useEffect(() => {
    if (!matchStarted) {
      setPossessionTeam(null);
    }
  }, [selectedMatchId, activeMatch?.id, matchStarted]);

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

    if (matchIdRef.current !== activeId) {
      matchIdRef.current = activeId;
      initialScoreRef.current = nextScore;
      setLogs([]);
      setTimeoutUsage({ A: 0, B: 0 });
      setTimerSeconds(rules.matchDuration * 60);
      setTimerRunning(false);
      setSecondarySeconds(rules.timeoutSeconds);
      setSecondaryRunning(false);
    }

    setScore(nextScore);
  }, [activeMatch, rules.matchDuration, rules.timeoutSeconds]);

  const currentMatchName =
    activeMatch?.event?.name ||
    selectedMatch?.event?.name ||
    "Select a match to begin";
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
  const abbaLabel =
    rules.abbaPattern === "male"
      ? "ABBA: Male"
    : rules.abbaPattern === "female"
        ? "ABBA: Female"
        : "ABBA: None";
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
const recordPendingEntry = useCallback((entry) => {
  console.log("[ScoreKeeper] Pending DB payload:", entry);
  setPendingEntries((prev) => [...prev, entry]);
}, []);

const primaryTimerBg =
  timerRunning ? "bg-[#e6f9ed]" : timerSeconds === 0 ? "bg-[#fee2e2]" : "bg-white";
const secondaryTimerBg = secondaryRunning
  ? secondaryFlashActive
    ? secondaryFlashPulse
      ? "bg-[#fff7d6]"
      : "bg-[#ffefb3]"
    : "bg-[#e6f9ed]"
  : secondarySeconds === 0
    ? "bg-[#fee2e2]"
    : "bg-white";

const startSecondaryTimer = useCallback(
  (duration, label) => {
    if (!duration) return;
    setSecondarySeconds(duration);
    setSecondaryTotalSeconds(duration);
    setSecondaryLabel(label || "Time out");
    setSecondaryRunning(true);
    setSecondaryFlashActive(false);
    setSecondaryFlashPulse(false);
  },
  []
);

function startPrimaryHoldReset() {
  cancelPrimaryHoldReset();
  primaryResetRef.current = setTimeout(() => {
    setTimerRunning(false);
    setTimerSeconds(matchDuration * 60);
    setTimerLabel("Game time");
  }, 800);
}

function cancelPrimaryHoldReset() {
  if (primaryResetRef.current) {
    clearTimeout(primaryResetRef.current);
    primaryResetRef.current = null;
  }
}

function startSecondaryHoldReset() {
  cancelSecondaryHoldReset();
  secondaryResetRef.current = setTimeout(() => {
    handleSecondaryReset();
  }, 800);
}

function cancelSecondaryHoldReset() {
  if (secondaryResetRef.current) {
    clearTimeout(secondaryResetRef.current);
    secondaryResetRef.current = null;
  }
}

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
    ({ team, timestamp, scorerId, assistId, totals, eventDescription }) => {
      setLogs((prev) => [
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
            rosterNameLookup.get(assistId || "") ||
            (assistId ? "Unknown player" : null),
          assistId: assistId || null,
          totalA: totals.a,
          totalB: totals.b,
          eventDescription,
        },
      ]);
    },
    [rosterNameLookup]
  );

  const handleEndMatchNavigation = useCallback(() => {
    if (!canEndMatch) return;
    const confirmed =
      typeof window !== "undefined"
        ? window.confirm("End match and continue to spirit scoring?")
        : true;
    if (!confirmed) return;
    const target = activeMatch?.id ? `/spirit-scores?matchId=${activeMatch.id}` : "/spirit-scores";
    navigate(target);
  }, [canEndMatch, activeMatch?.id, navigate]);

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
        const entry = {
          matchId: activeMatch.id,
          eventTypeId,
          eventCode: MATCH_LOG_EVENT_CODES.TURNOVER,
          teamId: targetTeamId,
          createdAt: timestamp,
        };
        recordPendingEntry(entry);
        const totalsSnapshot = score;
        appendLocalLog({
          team: teamKey,
          timestamp,
          scorerId: null,
          assistId: null,
          totals: totalsSnapshot,
          eventDescription: describeEvent(eventTypeId),
        });
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
          row.team_id && row.team_id === teamBId ? "B" : "A";
        if (teamKey === "A") {
          rawA += 1;
        } else {
          rawB += 1;
        }
      });

      const baseScore = {
        a: Math.max(matchScore.a - rawA, 0),
        b: Math.max(matchScore.b - rawB, 0),
      };

      let runningA = baseScore.a;
      let runningB = baseScore.b;

      const mappedLogs = rows.map((row) => {
        const teamKey =
          row.team_id && row.team_id === teamBId
            ? "B"
            : row.team_id && row.team_id === teamAId
              ? "A"
              : "A";
        if (teamKey === "A") {
          runningA += 1;
        } else {
          runningB += 1;
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
        };
      });

      return {
        baseScore,
        totals: { a: runningA, b: runningB },
        logs: mappedLogs,
      };
    },
    [rosterNameLookup, teamAId, teamBId]
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

  async function loadEvents() {
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
  }

  async function loadMatches(eventId = selectedEventId) {
    if (!eventId) return;
    setMatchesLoading(true);
    setMatchesError(null);
    try {
      const data = await getMatchesByEvent(eventId, 24);
      setMatches(data);
      if (data.length > 0) {
        setSelectedMatchId(data[0].id);
      } else {
        setSelectedMatchId(null);
      }
    } catch (err) {
      setMatchesError(err.message || "Unable to load matches.");
    } finally {
      setMatchesLoading(false);
    }
  }

  async function handleInitialiseMatch(event) {
    event.preventDefault();
    if (!selectedMatch) return;
    if (!userId) {
      setConsoleError("You must be signed in to initialise a match.");
      return;
    }
    setInitialising(true);
    setConsoleError(null);
    try {
      const payload = {
        start_time: setupForm.startTime
          ? new Date(setupForm.startTime).toISOString()
          : new Date().toISOString(),
        starting_team_id:
          setupForm.startingTeamId ||
          selectedMatch.team_a?.id ||
          selectedMatch.team_b?.id,
        abba_pattern: rules.abbaPattern,
        scorekeeper: userId,
      };
      const updated = await initialiseMatch(selectedMatch.id, payload);
      setActiveMatch(updated);
      setSelectedMatchId(updated.id);
      setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      await loadMatches();

      const rosterPromise = (async () => {
        const teamA = updated.team_a?.id || null;
        const teamB = updated.team_b?.id || null;
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
          setRostersError(
            err instanceof Error ? err.message : "Failed to load rosters."
          );
        } finally {
          setRostersLoading(false);
        }
      })();

      await Promise.all([
        rosterPromise,
        loadMatchEventDefinitions(),
        refreshMatchLogs(updated.id, {
          a: updated.score_a ?? 0,
          b: updated.score_b ?? 0,
        }),
      ]);
      setSetupModalOpen(false);
    } catch (err) {
      setConsoleError(err.message || "Failed to initialise match.");
    } finally {
      setInitialising(false);
    }
  }

function handleToggleTimer() {
  cancelPrimaryHoldReset();
  if (!consoleReady) return;
  if (timerSeconds === 0) {
    setTimerSeconds(matchDuration * 60);
  }
  setTimerRunning((prev) => !prev);
  }

function handleSecondaryToggle(label) {
  cancelSecondaryHoldReset();
  if (!consoleReady) return;
  const resolvedLabel = label || secondaryLabel || "Time out";
  if (!secondaryRunning && secondarySeconds === 0) {
    startSecondaryTimer(rules.timeoutSeconds || 75, resolvedLabel);
    return;
  }
  if (label) {
    setSecondaryLabel(label);
  }
  setSecondaryRunning((prev) => !prev);
}

function handleSecondaryReset() {
  setSecondaryRunning(false);
  setSecondarySeconds(secondaryTotalSeconds);
  setSecondaryFlashActive(false);
  setSecondaryFlashPulse(false);
}

  function handleStartMatch() {
    if (!consoleReady) return;
    if (!timerRunning) {
      handleToggleTimer();
    }
    setMatchStarted(true);
    setTimerLabel("Game time");
    logMatchStartEvent();
    const receivingTeam = matchStartingTeamKey === "A" ? "B" : "A";
    if (receivingTeam) {
      void updatePossession(receivingTeam, { logTurnover: false });
    }
  }

  async function logMatchStartEvent() {
    if (!activeMatch?.id) return;
    const eventTypeId = await resolveEventTypeIdLocal(
      MATCH_LOG_EVENT_CODES.MATCH_START
    );
    if (!eventTypeId) {
      setConsoleError(
        "Missing `match_start` event type in match_events. Please add it in Supabase."
      );
      return;
    }
    const pullTeamId = startingTeamId || teamAId || teamBId;
    const teamKey = pullTeamId === teamBId ? "B" : "A";
    const timestamp = new Date().toISOString();
    const entry = {
      matchId: activeMatch.id,
      eventTypeId,
      eventCode: MATCH_LOG_EVENT_CODES.MATCH_START,
      teamId: pullTeamId || null,
      createdAt: timestamp,
    };
      recordPendingEntry(entry);
    appendLocalLog({
      team: teamKey,
      timestamp,
      scorerId: null,
      assistId: null,
      totals: score,
      eventDescription: describeEvent(eventTypeId),
    });
  }

  function handleResetConsole() {
    if (!consoleReady) return;
    const resetScore = {
      a: activeMatch?.score_a ?? 0,
      b: activeMatch?.score_b ?? 0,
    };
    initialScoreRef.current = resetScore;
    setScore(resetScore);
    setLogs([]);
    setTimerSeconds(matchDuration * 60);
    setTimerRunning(false);
    setTimerLabel("Game time");
    handleSecondaryReset();
    setTimeoutUsage({ A: 0, B: 0 });
  }

  async function handleAddScore(team, scorerId = null, assistId = null) {
    if (!consoleReady || !activeMatch?.id) return;
    const eventTypeId = await resolveEventTypeIdLocal(MATCH_LOG_EVENT_CODES.SCORE);
    if (!eventTypeId) {
      setConsoleError(
        "Missing `score` event type in match_events. Please add it in Supabase before logging."
      );
      return;
    }
    const targetTeamId = team === "A" ? teamAId : teamBId;
    if (!targetTeamId) {
      setConsoleError("Missing team mapping for this match.");
      return;
    }

    const nextTotals = {
      a: score.a + (team === "A" ? 1 : 0),
      b: score.b + (team === "B" ? 1 : 0),
    };
    setScore(nextTotals);

    const timestamp = new Date().toISOString();
    const entry = {
      matchId: activeMatch.id,
      eventTypeId,
      eventCode: MATCH_LOG_EVENT_CODES.SCORE,
      teamId: targetTeamId,
      team,
      scorerId,
      assistId,
      createdAt: timestamp,
    };

    recordPendingEntry(entry);
    appendLocalLog({
      team,
      timestamp,
      scorerId,
      assistId,
      totals: nextTotals,
      eventDescription: describeEvent(eventTypeId),
    });
    const receivingTeam = team === "A" ? "B" : "A";
    if (receivingTeam) {
      void updatePossession(receivingTeam, { logTurnover: false });
    }
    startSecondaryTimer(75, "Inter point");
  }

  async function syncActiveMatchScore(nextScore) {
    const matchId = activeMatch?.id;
    setActiveMatch((prev) =>
      prev
        ? {
            ...prev,
            score_a: nextScore.a,
            score_b: nextScore.b,
          }
        : prev
    );
    if (!matchId) return;
    try {
      await updateScore(matchId, nextScore.a, nextScore.b);
    } catch (err) {
      console.error("Failed to sync score:", err.message);
    }
  }

  function handleRuleChange(field, value) {
    if (matchSettingsLocked) return;
    setRules((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (field === "matchDuration") {
      setTimerSeconds((value || DEFAULT_DURATION) * 60);
    }
    if (field === "timeoutSeconds") {
      setSecondarySeconds(value || 75);
    }
  }

  function openScoreModal(team, mode = "add", logIndex = null) {
    setScoreModalState({
      open: true,
      team,
      mode,
      logIndex,
    });
    if (mode === "edit" && logIndex !== null) {
      const log = logs[logIndex];
      setScoreForm({
        scorerId: log?.scorerId || "",
        assistId: log?.assistId || "",
      });
    } else {
      setScoreForm({ scorerId: "", assistId: "" });
    }
  }

  function closeScoreModal() {
    setScoreModalState({ open: false, team: null, mode: "add", logIndex: null });
    setScoreForm({ scorerId: "", assistId: "" });
  }

  async function handleScoreModalSubmit(event) {
    event.preventDefault();
    if (!scoreModalState.team) return;

    await handleAddScore(
      scoreModalState.team,
      scoreForm.scorerId || null,
      scoreForm.assistId || null
    );

    closeScoreModal();
  }

  async function handleUpdateLog(index, updates) {
    if (index === null || index === undefined) return;
    const targetLog = logs[index];
    if (!targetLog) return;

    try {
      await updateMatchLogEntry(targetLog.id, {
        teamId: targetLog.team === "A" ? teamAId : teamBId,
        scorerId: updates.scorerId ?? targetLog.scorerId ?? null,
        assistId: updates.assistId ?? targetLog.assistId ?? null,
      });
      await refreshMatchLogs(matchLogMatchId, currentMatchScoreRef.current);
    } catch (err) {
      setConsoleError(
        err instanceof Error ? err.message : "Failed to update log entry."
      );
    }
  }

  async function handleDeleteLog(index) {
    if (index === null || index === undefined) return;
    const targetLog = logs[index];
    if (!targetLog) return;

    try {
      await deleteMatchLogEntry(targetLog.id);
      const totals = await refreshMatchLogs(matchLogMatchId, currentMatchScoreRef.current);
      if (totals) {
        await syncActiveMatchScore(totals);
      }
      closeScoreModal();
    } catch (err) {
      setConsoleError(
        err instanceof Error ? err.message : "Failed to delete log entry."
      );
    }
  }

  function handleTimeoutTrigger(team) {
    if (!consoleReady) return;
    const remaining = Math.max(rules.timeoutsTotal - timeoutUsage[team], 0);
    if (remaining === 0) return;
    setTimeoutUsage((prev) => ({ ...prev, [team]: prev[team] + 1 }));
    startSecondaryTimer(
      rules.timeoutSeconds || 75,
      `${team === "A" ? displayTeamA : displayTeamB} timeout`
    );
    setTimeModalOpen(false);
  }

  function handleHalfTimeTrigger() {
    const breakSeconds = Math.max(1, (rules.halftimeBreakMinutes || 0) * 60);
    startSecondaryTimer(breakSeconds || 60, "Halftime break");
    setTimeModalOpen(false);
  }

  function handleGameStoppage() {
    startSecondaryTimer(rules.timeoutSeconds || 75, "Game stoppage");
    setTimeModalOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-3 py-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
              Backend workspace
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">
              Score keeper console
            </h1>
            <p className="text-sm text-slate-500 md:max-w-2xl">
              Select a match, initialise the setup, and capture every score in one StallCount-native
              interface.
            </p>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-brand-dark"
          >
            Back to admin hub
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-3 py-5">
        {consoleReady ? (
          <section className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-card/40">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Match in progress
                  </p>
                  <h2 className="text-2xl font-semibold text-slate-900">
                    {displayTeamA} vs {displayTeamB}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {kickoffLabel} - {venueName || "Venue TBD"} - {statusLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSetupModalOpen(true)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand hover:text-brand-dark"
                >
                  Adjust setup
                </button>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border-2 border-[#6d1030] bg-white p-2 shadow-inner">
              <div className="divide-y divide-[#6d1030]/50 rounded-2xl border border-[#6d1030]/50">
                <div className="grid gap-2 p-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="rounded-2xl p-2 text-center text-[#6d1030]">
                    <div
                      className={`mx-auto inline-flex flex-col items-center rounded-2xl border border-slate-200 px-4 py-2 transition-colors ${primaryTimerBg}`}
                    >
                      <p className="text-[70px] font-semibold leading-none sm:text-[90px]">
                        {formattedPrimaryClock}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-[#6d1030]/70">
                        {timerLabel}
                      </p>
                    </div>
                    <label className="mt-4 inline-flex items-center gap-2 text-sm font-semibold">
                      Set Time (min):
                      <input
                        type="number"
                        min="1"
                        value={rules.matchDuration}
                        onChange={(event) =>
                          handleRuleChange("matchDuration", Number(event.target.value) || 0)
                        }
                        disabled={matchSettingsLocked}
                        className="w-20 rounded border border-[#6d1030] px-2 py-1 text-center text-[#6d1030] disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </label>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleTimer}
                      onMouseDown={startPrimaryHoldReset}
                      onMouseUp={cancelPrimaryHoldReset}
                      onMouseLeave={cancelPrimaryHoldReset}
                      onTouchStart={startPrimaryHoldReset}
                      onTouchEnd={cancelPrimaryHoldReset}
                      className="w-28 rounded-full bg-[#6d1030] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#510b24]"
                    >
                      {timerRunning ? "Pause" : "Play"}
                    </button>
                    <p className="text-[10px] uppercase tracking-wide text-[#6d1030]/70">
                      Hold to reset
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 p-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="rounded-2xl p-2 text-center text-[#6d1030]">
                    <div
                      className={`mx-auto inline-flex flex-col items-center rounded-2xl border border-slate-200 px-4 py-2 transition-colors ${secondaryTimerBg}`}
                    >
                      <p className="text-[60px] font-semibold leading-none sm:text-[80px]">
                        {formattedSecondaryClock}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-[#6d1030]/70">
                        {secondaryLabel}
                      </p>
                    </div>
                    <label className="mt-4 inline-flex items-center gap-2 text-sm font-semibold">
                      Set Time (sec):
                      <input
                        type="number"
                        min="0"
                        value={rules.timeoutSeconds}
                        onChange={(event) =>
                          handleRuleChange("timeoutSeconds", Number(event.target.value) || 0)
                        }
                        disabled={matchSettingsLocked}
                        className="w-24 rounded border border-[#6d1030] px-2 py-1 text-center text-[#6d1030] disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </label>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSecondaryToggle}
                      onMouseDown={startSecondaryHoldReset}
                      onMouseUp={cancelSecondaryHoldReset}
                      onMouseLeave={cancelSecondaryHoldReset}
                      onTouchStart={startSecondaryHoldReset}
                      onTouchEnd={cancelSecondaryHoldReset}
                      className="w-28 rounded-full bg-[#6d1030] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#510b24]"
                    >
                      {secondaryRunning ? "Pause" : "Play"}
                    </button>
                    <p className="text-[10px] uppercase tracking-wide text-[#6d1030]/70">
                      Hold to reset
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setTimeModalOpen(true)}
                  className="w-full rounded-full bg-[#b6abc7] px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-[#9a90ab] sm:w-auto"
                >
                  Additional time options
                </button>
              </div>
            </div>

            {matchStarted && (
              <div className="rounded-3xl border border-[#6d1030]/30 bg-white p-3 shadow-card/20">
                <div className="flex flex-col gap-1 text-[#6d1030] sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-xl font-semibold">Possession</h3>
                  <p className="text-sm font-semibold">
                    {possessionLeader === "Contested" ? "Contested" : `${possessionLeader} control`}
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#6d1030]">
                    {displayTeamAShort}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="100"
                    value={possessionValue}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      const nextTeam = nextValue >= 50 ? "B" : "A";
                      void updatePossession(nextTeam);
                    }}
                    className="h-2 flex-1 cursor-pointer accent-[#6d1030]"
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#6d1030]">
                    {displayTeamBShort}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-4 rounded-3xl border border-[#6d1030]/40 bg-white p-3 shadow-card/30">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-xl font-semibold text-[#6d1030]">Match events</h3>
                <p className="text-sm font-semibold text-[#6d1030]">
                  {displayTeamAShort}: {score.a} - {displayTeamBShort}: {score.b}
                </p>
              </div>
              {matchEventsError && (
                <p className="text-xs text-rose-600">{matchEventsError}</p>
              )}
              <div className="space-y-3">
                {!matchStarted ? (
                  <button
                    type="button"
                    onClick={handleStartMatch}
                    className="w-full rounded-full bg-[#6d1030] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#510b24]"
                  >
                    Start match
                  </button>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => openScoreModal("A")}
                      className="rounded-full border border-[#6d1030]/30 bg-[#fdf1f4] px-4 py-2 text-sm font-semibold text-[#6d1030] transition hover:bg-[#f8e0e9]"
                    >
                      Add score - {displayTeamAShort}
                    </button>
                    <button
                      type="button"
                      onClick={() => openScoreModal("B")}
                      className="rounded-full border border-[#6d1030]/30 bg-[#fdf1f4] px-4 py-2 text-sm font-semibold text-[#6d1030] transition hover:bg-[#f8e0e9]"
                    >
                      Add score - {displayTeamBShort}
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {logsLoading ? (
                  <div className="rounded-2xl border border-dashed border-[#6d1030]/30 px-4 py-3 text-center text-xs text-slate-500">
                    Syncing logs...
                  </div>
                ) : logs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#6d1030]/30 px-4 py-3 text-center text-sm text-slate-500">
                    No match events captured yet. Use the buttons above to log an event.
                  </div>
                ) : (
                  orderedLogs.map((log, index) => {
                    const displayNumber = orderedLogs.length - index;
                    return (
                      <div
                        key={log.id}
                        className="rounded-2xl border border-[#6d1030]/20 bg-[#fdf1f4] px-4 py-3 text-sm text-[#6d1030]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#6d1030]/80">
                              {log.eventDescription} - {abbaLabel}
                            </p>
                            <p className="text-base font-semibold">
                              #{displayNumber} - {log.team === "A" ? displayTeamAShort : displayTeamBShort}
                            </p>
                            <p className="text-xs text-[#6d1030]/70">
                              {new Date(log.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                          <div className="text-right text-base font-semibold">
                            {log.totalA} - {log.totalB}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <div>
                            <p className="font-semibold">
                              {log.team === "A" ? displayTeamA : displayTeamB}
                            </p>
                            <p className="text-[#6d1030]/70">
                              Scorer: {log.scorerName || "Unassigned"}
                              {log.assistName ? ` - Assist: ${log.assistName}` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openScoreModal(log.team, "edit", index)}
                            className="ml-auto rounded-full border border-[#6d1030]/40 px-4 py-1 text-xs font-semibold text-[#6d1030] transition hover:bg-white"
                          >
                            Edit event
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
                <button
                  type="button"
                  onClick={handleEndMatchNavigation}
                  disabled={!canEndMatch}
                  className="block w-full rounded-full bg-[#6d1030] px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#510b24] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  End match / Enter spirit scores
                </button>
                {pendingEntries.length > 0 && (
                  <div className="rounded-2xl border border-[#6d1030]/30 bg-white/90 p-2 text-sm text-[#6d1030]">
                    <h4 className="text-base font-semibold text-[#6d1030]">
                      Pending database payloads
                    </h4>
                    <p className="mt-1 text-xs text-[#6d1030]/70">
                      These entries show exactly what would be sent to `public.match_logs` once RLS
                      permits inserts.
                    </p>
                    <pre className="mt-3 max-h-64 overflow-y-auto rounded-xl bg-[#fdf1f4] p-3 text-xs text-[#6d1030]">
                      {JSON.stringify(pendingEntries, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-3 rounded-3xl border border-[#6d1030]/30 bg-white p-2 shadow-card/20">
                <h3 className="text-center text-xl font-semibold text-[#6d1030]">Team A Players</h3>
                <div className="space-y-2 rounded-2xl border border-[#6d1030]/20 bg-[#fdf1f4] p-3 text-sm text-[#6d1030]">
                  {rostersLoading ? (
                    <p className="text-center text-xs">Loading roster...</p>
                  ) : sortedRosters.teamA.length === 0 ? (
                    <p className="text-center text-xs text-slate-500">No players assigned.</p>
                  ) : (
                    sortedRosters.teamA.map((player) => (
                      <p key={player.id} className="border-b border-white/40 pb-1 last:border-b-0">
                        <span className="font-semibold">{player.jersey_number ?? "-"}</span>{" "}
                        {player.name}
                      </p>
                    ))
                  )}
                </div>
              </div>
              <div className="space-y-3 rounded-3xl border border-[#6d1030]/30 bg-white p-2 shadow-card/20">
                <h3 className="text-center text-xl font-semibold text-[#6d1030]">Team B Players</h3>
                <div className="space-y-2 rounded-2xl border border-[#6d1030]/20 bg-[#fdf1f4] p-3 text-sm text-[#6d1030]">
                  {rostersLoading ? (
                    <p className="text-center text-xs">Loading roster...</p>
                  ) : sortedRosters.teamB.length === 0 ? (
                    <p className="text-center text-xs text-slate-500">No players assigned.</p>
                  ) : (
                    sortedRosters.teamB.map((player) => (
                      <p key={player.id} className="border-b border-white/40 pb-1 last:border-b-0">
                        <span className="font-semibold">{player.jersey_number ?? "-"}</span>{" "}
                        {player.name}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>

            {consoleError && (
              <p className="text-center text-sm text-rose-600">{consoleError}</p>
            )}
          </section>
        ) : (
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-3 text-center shadow-card/40">
            <p className="text-sm text-slate-600">
              Launch the match setup modal to choose an event, pick the relevant match, and confirm
              the timing parameters before going live.
            </p>
            <button
              type="button"
              onClick={() => setSetupModalOpen(true)}
              disabled={initialising}
              className="inline-flex w-full items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white shadow-card transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {initialising ? "Initialising..." : "Match setup"}
            </button>
            {consoleError && (
              <p className="text-sm text-rose-600">{consoleError}</p>
            )}
          </section>
        )}
      </main>

      {setupModalOpen && (
        <ActionModal title="Match setup" onClose={() => setSetupModalOpen(false)}>
          <form className="space-y-5" onSubmit={handleInitialiseMatch}>
            {matchSettingsLocked && (
              <p className="rounded-2xl bg-[#fce8ee] px-3 py-2 text-xs font-semibold text-[#6d1030]">
                Match already started. Settings unlock once the match is reset.
              </p>
            )}
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Event
                </p>
                {eventsLoading ? (
                  <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    Loading events...
                  </div>
                ) : eventsError ? (
                  <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {eventsError}
                  </div>
                ) : (
                  <select
                    value={selectedEventId || ""}
                    onChange={(event) => {
                      const value = event.target.value || null;
                      setSelectedEventId(value);
                      setSelectedMatchId(null);
                    }}
                    disabled={matchSettingsLocked}
                    className="mt-2 w-full rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Select an event...</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>Match</span>
                  <button
                    type="button"
                    onClick={() => loadMatches()}
                    className="text-[11px] font-semibold text-[#6d1030] transition hover:text-[#4d0b22]"
                    disabled={!selectedEventId}
                  >
                    Refresh
                  </button>
                </div>
                {matchesLoading ? (
                  <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    Loading matches...
                  </div>
                ) : matchesError ? (
                  <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {matchesError}
                  </div>
                ) : (
                  <select
                    value={selectedMatchId || ""}
                    onChange={(event) => setSelectedMatchId(event.target.value || null)}
                    disabled={!selectedEventId || matches.length === 0 || matchSettingsLocked}
                    className="mt-2 w-full rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">
                      {selectedEventId
                        ? matches.length > 0
                          ? "Select a match..."
                          : "No matches for this event"
                        : "Select an event first"}
                    </option>
                    {matches.map((match) => (
                      <option key={match.id} value={match.id}>
                        {formatMatchLabel(match)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6d1030]">
                <span className="shrink-0">Match duration</span>
                <input
                  type="number"
                  min="1"
                  value={rules.matchDuration}
                  onChange={(event) =>
                    setRules((prev) => ({
                      ...prev,
                      matchDuration: Number(event.target.value) || 0,
                    }))
                  }
                  disabled={matchSettingsLocked}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-1.5 text-right text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6d1030]">
                <span className="shrink-0">Halftime (min)</span>
                <input
                  type="number"
                  min="0"
                  value={rules.halftimeMinutes}
                  onChange={(event) =>
                    setRules((prev) => ({
                      ...prev,
                      halftimeMinutes: Number(event.target.value) || 0,
                    }))
                  }
                  disabled={matchSettingsLocked}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-1.5 text-right text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6d1030]">
                <span className="shrink-0">Halftime duration (min)</span>
                <input
                  type="number"
                  min="0"
                  value={rules.halftimeBreakMinutes}
                  onChange={(event) =>
                    setRules((prev) => ({
                      ...prev,
                      halftimeBreakMinutes: Number(event.target.value) || 0,
                    }))
                  }
                  disabled={matchSettingsLocked}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-1.5 text-right text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6d1030]">
                <span className="shrink-0">Timeout duration (sec)</span>
                <input
                  type="number"
                  min="0"
                  value={rules.timeoutSeconds}
                  onChange={(event) =>
                    setRules((prev) => ({
                      ...prev,
                      timeoutSeconds: Number(event.target.value) || 0,
                    }))
                  }
                  disabled={matchSettingsLocked}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-1.5 text-right text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6d1030]">
                <span className="shrink-0">Timeouts total</span>
                <input
                  type="number"
                  min="0"
                  value={rules.timeoutsTotal}
                  onChange={(event) =>
                    setRules((prev) => ({
                      ...prev,
                      timeoutsTotal: Number(event.target.value) || 0,
                    }))
                  }
                  disabled={matchSettingsLocked}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-1.5 text-right text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6d1030]">
                <span className="shrink-0">Timeouts per half</span>
                <input
                  type="number"
                  min="0"
                  value={rules.timeoutsPerHalf}
                  onChange={(event) =>
                    setRules((prev) => ({
                      ...prev,
                      timeoutsPerHalf: Number(event.target.value) || 0,
                    }))
                  }
                  disabled={matchSettingsLocked}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-1.5 text-right text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6d1030]">
                <span className="shrink-0">Pulling team</span>
                <select
                  value={setupForm.startingTeamId || ""}
                  onChange={(event) =>
                    setSetupForm((prev) => ({
                      ...prev,
                      startingTeamId: event.target.value || "",
                    }))
                  }
                  disabled={matchSettingsLocked}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-1.5 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Select team...</option>
                  {teamAId && <option value={teamAId}>{displayTeamA}</option>}
                  {teamBId && <option value={teamBId}>{displayTeamB}</option>}
                </select>
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6d1030]">
                <span className="shrink-0">ABBA</span>
                <select
                  value={rules.abbaPattern}
                  onChange={(event) =>
                    setRules((prev) => ({
                      ...prev,
                      abbaPattern: event.target.value,
                    }))
                  }
                  disabled={matchSettingsLocked}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-1.5 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="none">None</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={initialising || !selectedMatch || matchSettingsLocked}
              className="w-full rounded-full bg-[#6d1030] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#510b24] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {initialising ? "Initialising..." : "Initialise"}
            </button>
          </form>
        </ActionModal>
      )}

  {timeModalOpen && (
    <ActionModal title="Time additions" onClose={() => setTimeModalOpen(false)}>
      <div className="space-y-4 text-center text-sm text-[#6d1030]">
        <button
          type="button"
              onClick={() => {
                handleHalfTimeTrigger();
              }}
              className="w-full rounded-full bg-[#6d1030] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#510b24]"
            >
              Half Time
            </button>

            <div>
              <p className="text-base font-semibold">{displayTeamA}</p>
              <button
                type="button"
                onClick={() => {
                  handleTimeoutTrigger("A");
                }}
                disabled={remainingTimeouts.A === 0}
                className="mt-2 w-full rounded-full bg-[#6d1030] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#510b24] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Timeout A
              </button>
              <p className="mt-2 text-xs">
                Remaining (total): {remainingTimeouts.A}
                <br />
                Remaining (half): {halfRemainingLabel("A")}
              </p>
            </div>

            <div>
              <p className="text-base font-semibold">{displayTeamB}</p>
              <button
                type="button"
                onClick={() => {
                  handleTimeoutTrigger("B");
                }}
                disabled={remainingTimeouts.B === 0}
                className="mt-2 w-full rounded-full bg-[#6d1030] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#510b24] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Timeout B
              </button>
              <p className="mt-2 text-xs">
                Remaining (total): {remainingTimeouts.B}
                <br />
                Remaining (half): {halfRemainingLabel("B")}
              </p>
            </div>

            <button
              type="button"
              onClick={handleGameStoppage}
              className="w-full rounded-full bg-[#ff9dad] px-4 py-3 text-sm font-semibold text-[#6d1030] transition hover:bg-[#ff8094]"
            >
              Game stoppage
        </button>
      </div>
    </ActionModal>
  )}


      {scoreModalState.open && (
        <ActionModal
          title={scoreModalState.mode === "edit" ? "Edit score" : "Add score"}
          onClose={closeScoreModal}
        >
          <form className="space-y-4" onSubmit={handleScoreModalSubmit}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6d1030]/70">
              Team: {scoreModalState.team === "B" ? displayTeamB : displayTeamA}
            </p>
            <label className="block text-base font-semibold text-[#6d1030]">
              Scorer:
              <select
                value={scoreForm.scorerId}
                onChange={(event) =>
                  setScoreForm((prev) => ({ ...prev, scorerId: event.target.value }))
                }
                className="mt-2 w-full rounded-full border border-[#6d1030]/40 bg-[#f6e7eb] px-4 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none"
              >
                <option value="">Select Scorer</option>
                {rosterOptionsForModal.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-base font-semibold text-[#6d1030]">
              Assist:
              <select
                value={scoreForm.assistId}
                onChange={(event) =>
                  setScoreForm((prev) => ({ ...prev, assistId: event.target.value }))
                }
                className="mt-2 w-full rounded-full border border-[#6d1030]/40 bg-[#f6e7eb] px-4 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none"
              >
                <option value="">Select Assist</option>
                {rosterOptionsForModal.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-2">
              <button
                type="submit"
                className="w-full rounded-full bg-[#6d1030] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#510b24]"
              >
                {scoreModalState.mode === "edit" ? "Update score" : "Add score"}
              </button>
              {scoreModalState.mode === "edit" && (
                <button
                  type="button"
                  onClick={() => handleDeleteLog(scoreModalState.logIndex)}
                  className="w-full rounded-full bg-[#c1352c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#9f271f]"
                >
                  Delete
                </button>
              )}
            </div>
          </form>
        </ActionModal>
      )}
    </div>
  );
}

function deriveShortName(name = "") {
  if (!name) return "???";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
  const base = initials || name.slice(0, 3);
  return base.slice(0, 3).toUpperCase();
}

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatMatchTime(timestamp) {
  if (!timestamp) return "Start time pending";
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} @ ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function toDateTimeLocal(value) {
  const date = value ? new Date(value) : new Date();
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function formatMatchLabel(match) {
  const teamA = match.team_a?.short_name || match.team_a?.name || "Team A";
  const teamB = match.team_b?.short_name || match.team_b?.name || "Team B";
  const kickoff = match.start_time
    ? new Date(match.start_time).toLocaleString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Time TBD";
  return `${kickoff} - ${teamA} vs ${teamB}`;
}

function formatMatchup(match) {
  const teamA = match.team_a?.name || match.team_a?.short_name || "Team A";
  const teamB = match.team_b?.name || match.team_b?.short_name || "Team B";
  return `${teamA} vs ${teamB}`;
}

function sortRoster(list = []) {
  return [...list].sort((a, b) => {
    const jerseyA = typeof a?.jersey_number === "number" ? a.jersey_number : Number.MAX_SAFE_INTEGER;
    const jerseyB = typeof b?.jersey_number === "number" ? b.jersey_number : Number.MAX_SAFE_INTEGER;
    if (jerseyA !== jerseyB) {
      return jerseyA - jerseyB;
    }
    return (a?.name || "").localeCompare(b?.name || "");
  });
}

function ActionModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-3">
      <div className="w-full max-w-sm rounded-[32px] bg-white p-3 shadow-2xl">
        <div className="mb-2 flex items-start justify-between">
          <h3 className="text-2xl font-semibold text-[#6d1030]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-2xl font-semibold text-[#6d1030] transition hover:text-[#4d0b22]"
          >
            X
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}







