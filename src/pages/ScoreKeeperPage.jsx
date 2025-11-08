import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
} from "../services/matchLogService";

const DEFAULT_DURATION = 90;

export default function ScoreKeeperPage() {
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
  const [timerSeconds, setTimerSeconds] = useState(DEFAULT_DURATION * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [secondarySeconds, setSecondarySeconds] = useState(75);
  const [secondaryRunning, setSecondaryRunning] = useState(false);
  const [secondaryLabel, setSecondaryLabel] = useState("Secondary timer");
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
  const initialScoreRef = useRef({ a: 0, b: 0 });
  const currentMatchScoreRef = useRef({ a: 0, b: 0 });
  const matchIdRef = useRef(null);
  const refreshMatchLogsRef = useRef(null);
  const [matchStarted, setMatchStarted] = useState(false);
  const consoleReady = Boolean(activeMatch);

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) || null,
    [matches, selectedMatchId]
  );

  useEffect(() => {
    loadEvents();
  }, []);

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

    let cancelled = false;

    async function fetchRosters() {
      setRostersLoading(true);
      setRostersError(null);
      try {
        const [teamAPlayers, teamBPlayers] = await Promise.all([
          teamA ? getPlayersByTeam(teamA) : [],
          teamB ? getPlayersByTeam(teamB) : [],
        ]);
        if (!cancelled) {
          setRosters({
            teamA: teamAPlayers,
            teamB: teamBPlayers,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setRostersError(err.message || "Failed to load rosters.");
        }
      } finally {
        if (!cancelled) {
          setRostersLoading(false);
        }
      }
    }

    fetchRosters();
    refreshMatchLogsRef.current?.(targetMatchId, currentMatchScoreRef.current);

    return () => {
      cancelled = true;
    };
  }, [activeMatch?.id, selectedMatch?.id]);

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
      setRules((prev) => ({
        ...prev,
        abbaPattern: selectedMatch.abba_pattern || prev.abbaPattern || "none",
      }));
    } else {
      setSetupForm({
        startTime: toDateTimeLocal(),
        startingTeamId: "",
      });
    }
  }, [selectedMatch]);

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
  const matchDuration = rules.matchDuration;
  const remainingTimeouts = {
    A: Math.max(rules.timeoutsTotal - timeoutUsage.A, 0),
    B: Math.max(rules.timeoutsTotal - timeoutUsage.B, 0),
  };
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
      await refreshMatchLogs(updated.id, {
        a: updated.score_a ?? 0,
        b: updated.score_b ?? 0,
      });
      setSetupModalOpen(false);
    } catch (err) {
      setConsoleError(err.message || "Failed to initialise match.");
    } finally {
      setInitialising(false);
    }
  }

  function handleToggleTimer() {
    if (!consoleReady) return;
    if (timerSeconds === 0) {
      setTimerSeconds(matchDuration * 60);
    }
    setTimerRunning((prev) => !prev);
  }

  function handleResetTimer() {
    setTimerRunning(false);
    setTimerSeconds(matchDuration * 60);
  }

  function handleSecondaryToggle(label) {
    if (!consoleReady) return;
    if (secondarySeconds === 0) {
      setSecondarySeconds(rules.timeoutSeconds);
    }
    if (label) {
      setSecondaryLabel(label);
    }
    setSecondaryRunning((prev) => !prev);
  }

  function handleSecondaryReset() {
    setSecondaryRunning(false);
    setSecondarySeconds(rules.timeoutSeconds);
  }

  function handleStartMatch() {
    if (!consoleReady) return;
    if (!timerRunning) {
      handleToggleTimer();
    }
    setMatchStarted(true);
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
    handleSecondaryReset();
    setTimeoutUsage({ A: 0, B: 0 });
  }

  async function handleAddScore(team, scorerId = null, assistId = null) {
    if (!consoleReady || !activeMatch?.id) return;
    const targetTeamId = team === "A" ? teamAId : teamBId;
    if (!targetTeamId) {
      setConsoleError("Missing team mapping for this match.");
      return;
    }

    try {
      await createMatchLogEntry({
        matchId: activeMatch.id,
        eventTypeCode: MATCH_LOG_EVENT_CODES.SCORE,
        teamId: targetTeamId,
        scorerId,
        assistId,
      });

      const totals = await refreshMatchLogs(activeMatch.id, currentMatchScoreRef.current);
      if (totals) {
        await syncActiveMatchScore(totals);
      }
    } catch (err) {
      setConsoleError(
        err instanceof Error ? err.message : "Failed to record score."
      );
    }
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
    const roster =
      scoreModalState.team === "A" ? rosters.teamA : rosters.teamB;
    const scorerOption = roster.find((player) => player.id === scoreForm.scorerId);
    const assistOption = roster.find((player) => player.id === scoreForm.assistId);
    const scorerName = scorerOption?.name || "";
    const assistName = assistOption?.name || "";

    if (scoreModalState.mode === "add") {
      await handleAddScore(
        scoreModalState.team,
        scoreForm.scorerId || null,
        scoreForm.assistId || null
      );
    } else if (scoreModalState.mode === "edit" && scoreModalState.logIndex !== null) {
      await handleUpdateLog(scoreModalState.logIndex, {
        scorerName: scorerName || null,
        scorerId: scoreForm.scorerId || null,
        assistName: assistName || null,
        assistId: scoreForm.assistId || null,
      });
    }

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
    handleSecondaryToggle(`${team === "A" ? displayTeamA : displayTeamB} timeout`);
  }

  function handleHalfTimeTrigger() {
    handleSecondaryToggle("Halftime break");
    setTimeModalOpen(false);
  }

  function handleGameStoppage() {
    handleSecondaryToggle("Game stoppage");
    setTimeModalOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
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

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        {consoleReady ? (
          <section className="space-y-8">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card/40">
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

            <div className="space-y-4 rounded-3xl border-2 border-[#6d1030] bg-white p-4 shadow-inner">
              <div className="divide-y divide-[#6d1030]/50 rounded-2xl border border-[#6d1030]/50">
                <div className="grid gap-4 p-6 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="text-center text-[#6d1030]">
                    <p className="text-[70px] font-semibold leading-none sm:text-[90px]">
                      {formattedPrimaryClock}
                    </p>
                    <label className="mt-4 inline-flex items-center gap-2 text-sm font-semibold">
                      Set Time (min):
                      <input
                        type="number"
                        min="1"
                        value={rules.matchDuration}
                        onChange={(event) =>
                          handleRuleChange("matchDuration", Number(event.target.value) || 0)
                        }
                        className="w-20 rounded border border-[#6d1030] px-2 py-1 text-center text-[#6d1030]"
                      />
                    </label>
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <button
                      type="button"
                      onClick={handleToggleTimer}
                      className="w-28 rounded-full bg-[#6d1030] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#510b24]"
                    >
                      {timerRunning ? "Pause" : "Play"}
                    </button>
                    <button
                      type="button"
                      onClick={handleResetTimer}
                      className="w-28 rounded-full border border-[#6d1030]/40 px-4 py-2 text-xs font-semibold text-[#6d1030]"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <div className="grid gap-4 p-6 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="text-center text-[#6d1030]">
                    <p className="text-[60px] font-semibold leading-none sm:text-[80px]">
                      {formattedSecondaryClock}
                    </p>
                    <label className="mt-4 inline-flex items-center gap-2 text-sm font-semibold">
                      Set Time (sec):
                      <input
                        type="number"
                        min="0"
                        value={rules.timeoutSeconds}
                        onChange={(event) =>
                          handleRuleChange("timeoutSeconds", Number(event.target.value) || 0)
                        }
                        className="w-24 rounded border border-[#6d1030] px-2 py-1 text-center text-[#6d1030]"
                      />
                    </label>
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-xs font-semibold text-[#6d1030]">Reset (hold 5s)</span>
                    <button
                      type="button"
                      onClick={handleSecondaryToggle}
                      className="w-28 rounded-full bg-[#6d1030] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#510b24]"
                    >
                      {secondaryRunning ? "Pause" : "Play"}
                    </button>
                    <button
                      type="button"
                      onClick={handleSecondaryReset}
                      className="w-28 rounded-full border border-[#6d1030]/40 px-4 py-2 text-xs font-semibold text-[#6d1030]"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setTimeModalOpen(true)}
                  className="w-full rounded-full bg-[#b6abc7] px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-[#9a90ab] sm:w-auto"
                >
                  Additional time options
                </button>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-[#6d1030]/40 bg-white p-6 shadow-card/30">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-xl font-semibold text-[#6d1030]">Score table</h3>
                <p className="text-sm font-semibold text-[#6d1030]">
                  {displayTeamAShort}: {score.a} - {displayTeamBShort}: {score.b}
                </p>
              </div>
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
              <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse text-sm text-[#6d1030]">
                  <thead className="bg-[#fce8ef] text-xs uppercase">
                    <tr>
                      <th className="border border-[#6d1030]/30 px-2 py-2">ABBA</th>
                      <th className="border border-[#6d1030]/30 px-2 py-2">Score A</th>
                      <th className="border border-[#6d1030]/30 px-2 py-2">Assist A</th>
                      <th className="border border-[#6d1030]/30 px-2 py-2">Total</th>
                      <th className="border border-[#6d1030]/30 px-2 py-2">Score B</th>
                      <th className="border border-[#6d1030]/30 px-2 py-2">Assist B</th>
                      <th className="border border-[#6d1030]/30 px-2 py-2">Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsLoading ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="border border-[#6d1030]/30 px-4 py-3 text-center text-xs text-slate-500"
                        >
                          Syncing logs...
                        </td>
                      </tr>
                    ) : logs.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="border border-[#6d1030]/30 px-4 py-3 text-center text-sm text-slate-500"
                        >
                          No scores recorded yet.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log, index) => (
                        <tr key={log.id} className="odd:bg-[#fdf1f4]">
                          <td className="border border-[#6d1030]/30 px-2 py-2 text-center text-xs font-semibold">
                            {abbaLabel}
                          </td>
                          <td className="border border-[#6d1030]/30 px-2 py-2">
                            {log.team === "A" ? log.scorerName : "-"}
                          </td>
                          <td className="border border-[#6d1030]/30 px-2 py-2">
                            {log.team === "A" ? log.assistName ?? "-" : "-"}
                          </td>
                          <td className="border border-[#6d1030]/30 px-2 py-2 text-center font-semibold">
                            {log.totalA} - {log.totalB}
                          </td>
                          <td className="border border-[#6d1030]/30 px-2 py-2">
                            {log.team === "B" ? log.scorerName : "-"}
                          </td>
                          <td className="border border-[#6d1030]/30 px-2 py-2">
                            {log.team === "B" ? log.assistName ?? "-" : "-"}
                          </td>
                          <td className="border border-[#6d1030]/30 px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => openScoreModal(log.team, "edit", index)}
                              className="rounded-full border border-[#6d1030]/40 px-3 py-1 text-xs font-semibold text-[#6d1030] transition hover:bg-[#fdf1f4]"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3 rounded-3xl border border-[#6d1030]/30 bg-white p-4 shadow-card/20">
                <h3 className="text-center text-xl font-semibold text-[#6d1030]">Team A Players</h3>
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-[#6d1030]/20 bg-[#fdf1f4] p-3 text-sm text-[#6d1030]">
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
              <div className="space-y-3 rounded-3xl border border-[#6d1030]/30 bg-white p-4 shadow-card/20">
                <h3 className="text-center text-xl font-semibold text-[#6d1030]">Team B Players</h3>
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-[#6d1030]/20 bg-[#fdf1f4] p-3 text-sm text-[#6d1030]">
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
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-card/40">
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
                    className="mt-2 w-full rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/40"
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
                    disabled={!selectedEventId || matches.length === 0}
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

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-[#6d1030]">
                Match duration
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
                  className="mt-1 w-full rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30"
                />
              </label>
              <label className="text-sm font-semibold text-[#6d1030]">
                Halftime (min)
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
                  className="mt-1 w-full rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30"
                />
              </label>
              <label className="text-sm font-semibold text-[#6d1030]">
                Halftime duration (min)
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
                  className="mt-1 w-full rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30"
                />
              </label>
              <label className="text-sm font-semibold text-[#6d1030]">
                Timeout duration (sec)
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
                  className="mt-1 w-full rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30"
                />
              </label>
              <label className="text-sm font-semibold text-[#6d1030]">
                Timeouts total
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
                  className="mt-1 w-full rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30"
                />
              </label>
              <label className="text-sm font-semibold text-[#6d1030]">
                Timeouts per half
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
                  className="mt-1 w-full rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30"
                />
              </label>
              <label className="text-sm font-semibold text-[#6d1030]">
                ABBA
                <select
                  value={rules.abbaPattern}
                  onChange={(event) =>
                    setRules((prev) => ({
                      ...prev,
                      abbaPattern: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-2xl border border-[#6d1030]/30 bg-[#fdf1f4] px-3 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none focus:ring-2 focus:ring-[#c35c6f]/30"
                >
                  <option value="none">None</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={initialising || !selectedMatch}
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
            {scoreModalState.mode === "add" && (
              <label className="block text-base font-semibold text-[#6d1030]">
                Team
                <select
                  value={scoreModalState.team || "A"}
                  onChange={(event) =>
                    setScoreModalState((prev) => ({
                      ...prev,
                      team: event.target.value || "A",
                    }))
                  }
                  className="mt-2 w-full rounded-full border border-[#6d1030]/40 bg-[#f6e7eb] px-4 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none"
                >
                  <option value="A">{displayTeamAShort}</option>
                  <option value="B">{displayTeamBShort}</option>
                </select>
              </label>
            )}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="w-full max-w-sm rounded-[32px] bg-white p-6 shadow-2xl">
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







