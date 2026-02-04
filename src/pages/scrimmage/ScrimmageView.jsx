import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import { formatClock } from "./scrimmageUtils";
import { useScrimmageData } from "./useScrimmageData";
import { useScrimmageActions } from "./useScrimmageActions";
import { deriveScrimmageReport } from "./scrimmageReport";
import { ScorekeeperShell, ScorekeeperCard, ScorekeeperButton } from "../../components/ui/scorekeeperPrimitives";
import {
  BlockEventCard,
  CalahanEventCard,
  HalftimeEndEventCard,
  HalftimeStartEventCard,
  MatchEndEventCard,
  MatchStartEventCard,
  ScoreEventCard,
  StoppageEndEventCard,
  StoppageStartEventCard,
  TimeoutEndEventCard,
  TimeoutStartEventCard,
  TurnoverEventCard,
  UnknownEventCard,
} from "../scorekeeper/eventCards";
import {
  CALAHAN_ASSIST_VALUE,
  DEFAULT_DISCUSSION_SECONDS,
  SCORE_NA_PLAYER_VALUE,
} from "./scrimmageConstants";

const BLOCK_EVENT_TYPE_ID = 19;
const SIMPLE_EVENT_DELETE_ONLY_CODES = new Set([
  MATCH_LOG_EVENT_CODES.HALFTIME_START,
  MATCH_LOG_EVENT_CODES.HALFTIME_END,
  MATCH_LOG_EVENT_CODES.STOPPAGE_START,
  MATCH_LOG_EVENT_CODES.STOPPAGE_END,
]);

export default function ScrimmageView() {
  const data = useScrimmageData();
  const actions = useScrimmageActions(data);

  const {
    initialising,
    setupForm,
    setSetupForm,
    rules,
    setRules,
    score,
    logs,
    logsLoading,
    matchEventsError,
    pendingEntries,
    timerRunning,
    secondaryRunning,
    secondaryLabel,
    timerLabel,
    consoleError,
    rosters,
    rostersLoading,
    rostersError,
    setRosters,
    timeModalOpen,
    setTimeModalOpen,
    setupModalOpen,
    setSetupModalOpen,
    scoreModalState,
    scoreForm,
    setScoreForm,
    timeoutUsage,
    possessionTeam,
    resumeCandidate,
    resumeHandled,
    resumeBusy,
    resumeError,
    stoppageActive,
    matchStarted,
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
    matchStartingTeamKey,
    remainingTimeouts,
    canEndMatch,
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
    secondaryResetTriggeredRef,
    commitSecondaryTimerState,
    setSecondaryTotalSeconds,
    setSecondaryLabel,
    setSecondaryFlashActive,
    setSecondaryFlashPulse,
    updatePossession,
    handleResumeSession,
    handleDiscardResume
  } = data;

  const safeTeamAName = displayTeamA || "Team A";
  const safeTeamBName = displayTeamB || "Team B";
  const formatTeamLabel = (teamKey) => {
    if (teamKey === "A") return safeTeamAName;
    if (teamKey === "B") return safeTeamBName;
    return null;
  };
  const possessionDisplay =
    formatTeamLabel(possessionTeam) || possessionLeader || "Unassigned";

  const formatPlayerSelectLabel = (player) => {
    if (!player) return "Unassigned";
    const jersey = player.jersey_number ?? "-";
    const name = player.name || "Player";
    return `${jersey} ${name}`;
  };
  const renderPlayerGridLabel = (player) => {
    const jerseyValue = player?.jersey_number;
    const jerseyText = `${jerseyValue ?? ""}`.trim();
    const name = player?.name || "Player";
    return (
      <span className="flex flex-col items-center text-center leading-tight">
        {jerseyText && <span className="text-sm font-extrabold">{jerseyText}</span>}
        <span
          className={`${jerseyText ? "mt-0.5" : ""} w-full text-[0.7rem] font-semibold whitespace-normal break-words`}
        >
          {name}
        </span>
      </span>
    );
  };

  const [rosterEditorOpen, setRosterEditorOpen] = useState(false);
  const [playerEditorForm, setPlayerEditorForm] = useState({
    id: null,
    name: "",
    jersey: "",
    assignment: "A",
  });

  const normalizeRosterAssignment = (assignment) => {
    if (assignment === "both") return "both";
    if (assignment === "B") return "B";
    return "A";
  };

  const resetPlayerEditorForm = () => {
    setPlayerEditorForm({
      id: null,
      name: "",
      jersey: "",
      assignment: "A",
    });
  };

  const openRosterEditor = () => {
    resetPlayerEditorForm();
    setRosterEditorOpen(true);
  };

  const closeRosterEditor = () => {
    setRosterEditorOpen(false);
    resetPlayerEditorForm();
  };

  const upsertRosterPlayer = ({ id, name, jersey, assignment }) => {
    const normalizedAssignment = normalizeRosterAssignment(assignment);
    const shouldAssignLight = normalizedAssignment === "A" || normalizedAssignment === "both";
    const shouldAssignDark = normalizedAssignment === "B" || normalizedAssignment === "both";

    setRosters((prev) => {
      const nextPlayer = {
        id,
        name,
        jersey_number: jersey,
      };

      const upsertTeam = (players, includeTeam) => {
        const safePlayers = players || [];
        if (!includeTeam) {
          return safePlayers.filter((player) => player?.id !== id);
        }
        const exists = safePlayers.some((player) => player?.id === id);
        if (!exists) {
          return [...safePlayers, nextPlayer];
        }
        return safePlayers.map((player) => (player?.id === id ? nextPlayer : player));
      };

      return {
        ...prev,
        teamA: upsertTeam(prev?.teamA, shouldAssignLight),
        teamB: upsertTeam(prev?.teamB, shouldAssignDark),
      };
    });
  };

  const handleRosterPlayerSubmit = (event) => {
    event.preventDefault();
    const name = (playerEditorForm.name || "").trim();
    if (!name) return;

    const jerseyInput = `${playerEditorForm.jersey ?? ""}`.trim();
    const parsedJersey = Number(jerseyInput);
    const jersey =
      jerseyInput.length > 0 && Number.isFinite(parsedJersey) && parsedJersey >= 0
        ? parsedJersey
        : undefined;
    const id =
      playerEditorForm.id ||
      `player-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

    upsertRosterPlayer({
      id,
      name,
      jersey,
      assignment: playerEditorForm.assignment,
    });
    resetPlayerEditorForm();
  };

  const startEditRosterPlayer = (player) => {
    if (!player?.id) return;
    setPlayerEditorForm({
      id: player.id,
      name: player.name || "",
      jersey:
        player.jersey_number === null || player.jersey_number === undefined
          ? ""
          : `${player.jersey_number}`,
      assignment: normalizeRosterAssignment(player.side),
    });
    setRosterEditorOpen(true);
  };

  const deleteRosterPlayer = (playerId) => {
    if (!playerId) return;
    setRosters((prev) => ({
      ...prev,
      teamA: (prev?.teamA || []).filter((player) => player?.id !== playerId),
      teamB: (prev?.teamB || []).filter((player) => player?.id !== playerId),
    }));
    setPlayerEditorForm((prev) =>
      prev.id === playerId ? { id: null, name: "", jersey: "", assignment: "A" } : prev
    );
  };

  const handleDeleteCurrentPlayer = () => {
    if (!playerEditorForm.id) return;
    deleteRosterPlayer(playerEditorForm.id);
  };

  const allRosterPlayers = useMemo(() => {
    const playerMap = new Map();

    const mergeTeamPlayers = (players, teamKey) => {
      (players || []).forEach((player) => {
        if (!player?.id) return;
        const existing = playerMap.get(player.id);
        if (existing) {
          existing.teams.add(teamKey);
          if (!existing.name && player.name) {
            existing.name = player.name;
          }
          if ((existing.jersey_number === null || existing.jersey_number === undefined) && player.jersey_number !== undefined) {
            existing.jersey_number = player.jersey_number;
          }
          return;
        }
        playerMap.set(player.id, {
          id: player.id,
          name: player.name || "Player",
          jersey_number: player.jersey_number,
          teams: new Set([teamKey]),
        });
      });
    };

    mergeTeamPlayers(sortedRosters.teamA, "A");
    mergeTeamPlayers(sortedRosters.teamB, "B");

    return [...playerMap.values()]
      .map((player) => {
        const inLight = player.teams.has("A");
        const inDark = player.teams.has("B");
        return {
          id: player.id,
          name: player.name,
          jersey_number: player.jersey_number,
          side: inLight && inDark ? "both" : inLight ? "A" : "B",
        };
      })
      .sort((left, right) => {
        const sideOrder = {
          both: 0,
          A: 1,
          B: 2,
        };
        const leftOrder = sideOrder[left.side] ?? 99;
        const rightOrder = sideOrder[right.side] ?? 99;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        const nameCompare = `${left.name || ""}`.localeCompare(`${right.name || ""}`, undefined, {
          sensitivity: "base",
        });
        if (nameCompare !== 0) {
          return nameCompare;
        }
        return `${left.id || ""}`.localeCompare(`${right.id || ""}`, undefined, {
          sensitivity: "base",
        });
      });
  }, [sortedRosters.teamA, sortedRosters.teamB]);

  const {
    cancelPrimaryHoldReset,
    startPrimaryHoldReset,
    cancelSecondaryHoldReset,
    startSecondaryHoldReset,
    handleInitialiseMatch,
    handleToggleTimer,
    handleSecondaryToggle,
    handleSecondaryReset,
    handleStartMatch,
    handleAddScore,
    syncActiveMatchScore,
    handleRuleChange,
    openScoreModal,
    closeScoreModal,
    handleScoreModalSubmit,
    handleUpdateLog,
    handleDeleteLog,
    handleTimeoutTrigger,
    handleHalfTimeTrigger,
    handleGameStoppage,
    handleEndMatchNavigation,
    logMatchStartEvent,
    handleExportCsv
  } = actions;

  const POSSESSION_DRAG_THRESHOLD = 24;
  const [endScrimmageModalOpen, setEndScrimmageModalOpen] = useState(false);
  const [matchReportOpen, setMatchReportOpen] = useState(false);
  const [simpleEventEditState, setSimpleEventEditState] = useState({
    open: false,
    logIndex: null,
    teamKey: "",
    eventLabel: "",
    eventCode: "",
  });
  const possessionPadRef = useRef(null);
  const possessionPointerIdRef = useRef(null);
  const possessionDragStateRef = useRef({ startX: null, moved: false });
  const possessionConfirmTimeoutRef = useRef(null);
  const [possessionEventReady, setPossessionEventReady] = useState(false);
  const [possessionResult, setPossessionResult] = useState("throwaway"); // "throwaway" | "block"
  const [possessionActorId, setPossessionActorId] = useState("");
  const [possessionModalOpen, setPossessionModalOpen] = useState(false);
  const [pendingPossessionTeam, setPendingPossessionTeam] = useState(null);
  const [possessionPreviewTeam, setPossessionPreviewTeam] = useState(null);
  const [possessionEditIndex, setPossessionEditIndex] = useState(null);
  const [possessionDeleteModalOpen, setPossessionDeleteModalOpen] = useState(false);
  const updatePossessionFromCoordinate = (clientX) => {
    const track = possessionPadRef.current;
    if (!track || !Number.isFinite(clientX)) {
      return;
    }
    const { left, width } = track.getBoundingClientRect();
    if (!width) return;
    const ratio = (clientX - left) / width;
    const clamped = Math.min(Math.max(ratio, 0), 1);
    const nextTeam = clamped >= 0.5 ? "B" : "A";
    if (nextTeam === possessionTeam && !possessionPreviewTeam) return;

    const blockTeam = nextTeam === "A" ? "B" : "A";
    const rosterSourceTeam = possessionResult === "block" ? nextTeam : blockTeam;
    const options = getRosterOptionsForTeam(rosterSourceTeam);
    setPendingPossessionTeam(nextTeam);
    setPossessionPreviewTeam(nextTeam);
    setPossessionActorId("");
    setPossessionEventReady(true);
    setPossessionModalOpen(true);
  };

  const releasePossessionPointer = (pointerId) => {
    if (possessionPointerIdRef.current !== pointerId) {
      return;
    }
    possessionPointerIdRef.current = null;
    possessionPadRef.current?.releasePointerCapture?.(pointerId);
    possessionDragStateRef.current = { startX: null, moved: false };
  };

  const handlePossessionPadPointerDown = (event) => {
    possessionPointerIdRef.current = event.pointerId;
    possessionDragStateRef.current = { startX: event.clientX, moved: false };
    possessionPadRef.current?.setPointerCapture?.(event.pointerId);
  };

  const getRosterOptionsForTeam = (teamKey) => {
    const sortPlayers = (players) =>
      [...players].sort((a, b) => {
        const parsedA = Number(a?.jersey_number);
        const parsedB = Number(b?.jersey_number);
        const numA = Number.isFinite(parsedA) ? parsedA : null;
        const numB = Number.isFinite(parsedB) ? parsedB : null;
        if (numA !== null && numB !== null) {
          return numA - numB || (a.name || "").localeCompare(b.name || "");
        }
        if (numA !== null) return -1;
        if (numB !== null) return 1;
        return (a.name || "").localeCompare(b.name || "");
      });

    if (teamKey === "A") {
      return sortPlayers(sortedRosters.teamA || [])
        .filter((player) => player?.id)
        .map((player) => ({
          id: player.id,
          name: player.name || "Unnamed player",
          jersey_number: player.jersey_number ?? null,
        }));
    }
    if (teamKey === "B") {
      return sortPlayers(sortedRosters.teamB || [])
        .filter((player) => player?.id)
        .map((player) => ({
          id: player.id,
          name: player.name || "Unnamed player",
          jersey_number: player.jersey_number ?? null,
        }));
    }
    return [];
  };

  const handlePossessionPadPointerMove = (event) => {
    if (possessionPointerIdRef.current !== event.pointerId) return;
    const state = possessionDragStateRef.current;
    if (!state) return;
    if (!state.moved) {
      const delta = Math.abs(event.clientX - (state.startX ?? event.clientX));
      if (delta < POSSESSION_DRAG_THRESHOLD) {
        return;
      }
      state.moved = true;
    }
    updatePossessionFromCoordinate(event.clientX);
  };

  const handlePossessionPadPointerUp = (event) => {
    if (possessionDragStateRef.current?.moved) {
      updatePossessionFromCoordinate(event.clientX);
    }
    releasePossessionPointer(event.pointerId);
  };

  const handlePossessionPadPointerLeave = (event) => {
    releasePossessionPointer(event.pointerId);
  };

  const handlePossessionPadPointerCancel = (event) => {
    releasePossessionPointer(event.pointerId);
  };

  const currentPossessionTeam = possessionPreviewTeam || possessionTeam;
  const activeActorTeam =
    possessionResult === "block"
      ? currentPossessionTeam
      : currentPossessionTeam === "A"
        ? "B"
        : currentPossessionTeam === "B"
          ? "A"
          : null;

  const activeActorOptions = useMemo(() => getRosterOptionsForTeam(activeActorTeam), [activeActorTeam, sortedRosters]);

  useEffect(() => {
    if (!activeActorOptions.length) {
      if (possessionActorId) {
        setPossessionActorId("");
      }
      return;
    }
    if (possessionActorId && !activeActorOptions.some((player) => player.id === possessionActorId)) {
      setPossessionActorId("");
    }
  }, [activeActorOptions, possessionActorId]);

  const resetPossessionModalState = () => {
    if (possessionConfirmTimeoutRef.current) {
      clearTimeout(possessionConfirmTimeoutRef.current);
      possessionConfirmTimeoutRef.current = null;
    }
    setPossessionModalOpen(false);
    setPendingPossessionTeam(null);
    setPossessionPreviewTeam(null);
    setPossessionEventReady(false);
    setPossessionResult("throwaway");
    setPossessionEditIndex(null);
  };

  const confirmPossessionChange = (actorOverride) => {
    const nextTeam = pendingPossessionTeam;
    if (!nextTeam) {
      resetPossessionModalState();
      return;
    }
    const blockTeam = nextTeam === "A" ? "B" : "A";
    const rosterSourceTeam = possessionResult === "block" ? nextTeam : blockTeam;
    const options = getRosterOptionsForTeam(rosterSourceTeam);
    const resolvedActor = actorOverride ?? possessionActorId;
    const actorId = options.find((player) => player.id === resolvedActor)?.id || resolvedActor || null;
    setPossessionActorId(actorId || "");
    const isBlock = possessionResult === "block";
    const eventTeamKey = isBlock ? nextTeam : blockTeam;
    const editingIndex = possessionEditIndex;
    resetPossessionModalState();
    if (editingIndex !== null) {
      if (isBlock) {
        void handleUpdateLog(editingIndex, {
          teamKey: eventTeamKey,
          scorerId: actorId || null,
          eventTypeId: BLOCK_EVENT_TYPE_ID,
        });
      } else {
        void handleUpdateLog(editingIndex, {
          teamKey: eventTeamKey,
          scorerId: actorId || null,
          eventCode: MATCH_LOG_EVENT_CODES.TURNOVER,
          eventTypeId: null,
        });
      }
      return;
    }

    void updatePossession(nextTeam, {
      actorId: actorId || null,
      eventTypeIdOverride: isBlock ? BLOCK_EVENT_TYPE_ID : null,
      eventTeamKey: isBlock ? nextTeam : null,
    });
  };

  const handlePossessionActorSelect = (nextActorId) => {
    setPossessionActorId(nextActorId);
    if (possessionConfirmTimeoutRef.current) {
      clearTimeout(possessionConfirmTimeoutRef.current);
    }
    possessionConfirmTimeoutRef.current = setTimeout(() => {
      confirmPossessionChange(nextActorId || null);
      possessionConfirmTimeoutRef.current = null;
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (possessionConfirmTimeoutRef.current) {
        clearTimeout(possessionConfirmTimeoutRef.current);
        possessionConfirmTimeoutRef.current = null;
      }
    };
  }, []);

  const isScoreFormValid = Boolean(scoreForm.scorerId && scoreForm.assistId);

  const openSimpleEventModal = (log, index) => {
    setSimpleEventEditState({
      open: true,
      logIndex: index,
      teamKey: log.team || "",
      eventLabel: log.eventDescription || "Match event",
      eventCode: log.eventCode || "",
    });
  };

  const isBlockPossessionLog = (log) => {
    if (!log) return false;
    if (Number.isFinite(log.eventTypeId) && log.eventTypeId === BLOCK_EVENT_TYPE_ID) return true;
    const code = `${log.eventCode || ""}`.toLowerCase();
    if (code.includes("block")) return true;
    const desc = `${log.eventDescription || ""}`.toLowerCase();
    return desc.includes("block");
  };

  const openPossessionEditModal = (log, index) => {
    const isBlockLog = isBlockPossessionLog(log);
    const loggedTeam = log?.team || null;
    const nextTeam = isBlockLog
      ? loggedTeam
      : loggedTeam === "A"
        ? "B"
        : loggedTeam === "B"
          ? "A"
          : null;
    setPendingPossessionTeam(nextTeam);
    setPossessionPreviewTeam(nextTeam);
    setPossessionResult(isBlockLog ? "block" : "throwaway");
    setPossessionActorId(log?.scorerId || log?.actorId || "");
    setPossessionModalOpen(true);
    setPossessionEditIndex(index);
  };

  const closeSimpleEventModal = () => {
    setSimpleEventEditState({
      open: false,
      logIndex: null,
      teamKey: "",
      eventLabel: "",
      eventCode: "",
    });
  };

  const handleSimpleEventSubmit = async (event) => {
    event.preventDefault();
    if (simpleEventEditState.logIndex === null) return;
    await handleUpdateLog(simpleEventEditState.logIndex, {
      teamKey: simpleEventEditState.teamKey || null,
    });
    closeSimpleEventModal();
  };

  const handleSimpleEventDelete = async () => {
    if (simpleEventEditState.logIndex === null) return;
    await handleDeleteLog(simpleEventEditState.logIndex);
    closeSimpleEventModal();
  };

  const openPossessionDeleteModal = () => {
    if (possessionEditIndex === null) return;
    setPossessionDeleteModalOpen(true);
  };

  const closePossessionDeleteModal = () => {
    setPossessionDeleteModalOpen(false);
  };

  const handlePossessionDelete = async () => {
    if (possessionEditIndex === null) return;
    await handleDeleteLog(possessionEditIndex);
    setPossessionDeleteModalOpen(false);
    resetPossessionModalState();
  };

  const handleStartNewMatch = () => {
    handleDiscardResume();
    setSetupModalOpen(true);
  };

  const handleStartDiscussionTimer = () => {
    cancelSecondaryHoldReset();
    if (secondaryResetTriggeredRef?.current) {
      secondaryResetTriggeredRef.current = false;
      return;
    }
    const normalizedSecondaryLabel = (secondaryLabel || "").toLowerCase();
    if (secondaryRunning && normalizedSecondaryLabel === "discussion") {
      commitSecondaryTimerState(0, false);
      setSecondaryTotalSeconds(0);
      setSecondaryLabel("Discussion");
      setSecondaryFlashActive(false);
      setSecondaryFlashPulse(false);
      return;
    }
    const duration = rules.discussionSeconds || DEFAULT_DISCUSSION_SECONDS;
    commitSecondaryTimerState(duration, true);
    setSecondaryTotalSeconds(duration);
    setSecondaryLabel("Discussion");
    setSecondaryFlashActive(false);
    setSecondaryFlashPulse(false);
  };

  const handleScorePopupSelection = (teamKey) => {
    openScoreModal(teamKey);
  };

  const scrimmageReport = useMemo(
    () =>
      deriveScrimmageReport({
        logs,
        teamAName: displayTeamA,
        teamBName: displayTeamB,
        startingTeamKey: matchStartingTeamKey,
        startTime: setupForm.startTime,
      }),
    [logs, displayTeamA, displayTeamB, matchStartingTeamKey, setupForm.startTime]
  );

  return (
    <ScorekeeperShell>
      <ScorekeeperCard as="header" className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col leading-tight">
            <h1 className="text-xl font-semibold text-white">Scrimmage console</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ScorekeeperButton
              type="button"
              onClick={handleExportCsv}
              variant="compactGhost"
              className="text-xs"
            >
              Export CSV
            </ScorekeeperButton>
            <ScorekeeperButton as={Link} to="/" variant="compactGhost" className="text-xs">
              Back to home
            </ScorekeeperButton>
          </div>
        </div>
      </ScorekeeperCard>

      <main className="py-2">
        {consoleReady ? (
          <section className="space-y-2">
            <div className="rounded-3xl border border-emerald-900/15 bg-white/90 p-1.5 w-full">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-slate-900">
                    <span>{safeTeamAName}</span>
                    <span className="text-base text-slate-400">vs</span>
                    <span>{safeTeamBName}</span>
                  </h2>
                  <p className="text-sm text-slate-600">
                    {kickoffLabel} - {venueName || "Venue TBD"} - {statusLabel}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <button
                    type="button"
                    onClick={() => setSetupModalOpen(true)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-emerald-400 hover:text-emerald-800"
                  >
                    Adjust setup
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-slate-300 bg-white p-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-200 bg-[#dff7e5] p-3 text-center text-slate-800">
                  <p className="text-[clamp(3rem,12vw,5.5rem)] font-semibold leading-none text-slate-900">
                    {formattedPrimaryClock}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {timerLabel || "Game time"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-[#dff7e5] p-3 text-center text-slate-800">
                  <p className="text-[clamp(2.6rem,11vw,4.5rem)] font-semibold leading-none text-slate-900">
                    {formattedSecondaryClock}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {secondaryLabel || "Inter point"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={handleStartDiscussionTimer}
                  onMouseDown={startSecondaryHoldReset}
                  onMouseUp={cancelSecondaryHoldReset}
                  onMouseLeave={cancelSecondaryHoldReset}
                  onTouchStart={startSecondaryHoldReset}
                  onTouchEnd={cancelSecondaryHoldReset}
                  onTouchCancel={cancelSecondaryHoldReset}
                  className="rounded-md bg-[#dc2626] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#b91c1c]"
                >
                  DISCUSSION-START/STOP (1min)
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-sm font-semibold text-slate-800">
                <div className="flex items-center justify-center rounded border border-slate-400 bg-white px-2 py-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Timeout length:
                  </span>
                </div>
                <div className="rounded border border-slate-400 bg-white px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={rules.timeoutSeconds ?? ""}
                    onChange={(event) =>
                      handleRuleChange("timeoutSeconds", Math.max(0, Number(event.target.value) || 0))
                    }
                    aria-label="Timeout duration (seconds)"
                    inputMode="numeric"
                    className="w-full border-none bg-transparent text-center text-sm font-semibold text-slate-800 focus:outline-none focus:ring-0"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTimeModalOpen(true)}
                disabled={!matchStarted}
                className={`w-full rounded-full px-4 py-2 text-sm font-semibold transition ${
                  matchStarted ? "bg-[#1e3a8a] text-white hover:bg-[#162e6a]" : "bg-slate-200 text-slate-600"
                }`}
              >
                Additional time options
              </button>
            </div>

            {matchStarted && (
              <div className="rounded-3xl border border-slate-200 bg-white p-2 w-full">
                <div className="mt-3 space-y-2">
                  <div
                    ref={possessionPadRef}
                    role="group"
                    aria-label="Select possession team"
                    className="relative flex w-full items-stretch gap-1 rounded-2xl bg-[#b1b1b1] p-1 text-sm font-semibold text-slate-900"
                    style={{ touchAction: "pan-y" }}
                    onPointerDown={handlePossessionPadPointerDown}
                    onPointerMove={handlePossessionPadPointerMove}
                    onPointerUp={handlePossessionPadPointerUp}
                    onPointerLeave={handlePossessionPadPointerLeave}
                    onPointerCancel={handlePossessionPadPointerCancel}
                  >
                    <button
                      type="button"
                      className={`flex-1 rounded-2xl px-3 py-3 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${
                        possessionTeam === "A" ? "bg-[#0f5132] text-white" : "bg-[#b1b1b1] text-slate-700"
                      }`}
                      aria-pressed={possessionTeam === "A"}
                      tabIndex={-1}
                    >
                      {displayTeamA}
                    </button>
                    <button
                      type="button"
                      className={`flex-1 rounded-2xl px-3 py-3 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${
                        possessionTeam === "B" ? "bg-[#0f5132] text-white" : "bg-[#b1b1b1] text-slate-700"
                      }`}
                      aria-pressed={possessionTeam === "B"}
                      tabIndex={-1}
                    >
                      {displayTeamB}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 text-slate-800 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-1 text-sm font-semibold text-slate-600">
                      <span className="text-base font-semibold text-slate-900">Possession</span>
                      <span>:</span>
                      <span className="text-base text-slate-900">
                        {possessionLeader === "Contested" ? "Contested" : `${possessionLeader} control`}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2 rounded-3xl border border-[#0f5132]/40 bg-white p-1.5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                </div>
                {matchEventsError && (
                  <p className="text-xs text-rose-600">{matchEventsError}</p>
                )}
                <div className="space-y-2">
                  {!matchStarted ? (
                    <button
                      type="button"
                      onClick={handleStartMatch}
                      className="w-full rounded-full bg-[#0f5132] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
                    >
                      Start match ({matchStartingTeamKey === "B" ? displayTeamB : displayTeamA} pulls)
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openScoreModal("A")}
                        className="w-full rounded-full bg-[#0f5132] px-3 py-6 text-center text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
                        >
                          Add score - {displayTeamA}
                        </button>
                        <div className="px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#0f5132]/80">
                          <p>{nextAbbaDescriptor ? `ABBA: ${nextAbbaDescriptor}` : "ABBA disabled"}</p>
                          <p className="text-lg font-semibold text-[#0f5132]">
                            {score.a} - {score.b}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openScoreModal("B")}
                        className="w-full rounded-full bg-[#0f5132] px-3 py-6 text-center text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
                        >
                          Add score - {displayTeamB}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {logsLoading ? (
                    <div className="rounded-2xl border border-dashed border-[#0f5132]/30 px-3 py-2 text-center text-xs text-slate-500">
                      Syncing logs...
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#0f5132]/30 px-3 py-2 text-center text-xs text-slate-500">
                      No match events captured yet. Use the buttons above to log an event.
                    </div>
                  ) : (
                    (() => {
                      const seen = new Set();
                      return orderedLogs
                        .filter((log) => {
                          const key = log.optimisticId || log.id;
                          if (key && seen.has(key)) {
                            return false;
                          }
                          if (key) {
                            seen.add(key);
                          }
                          return true;
                        })
                        .map((log) => {
                          const chronologicalIndex = logs.findIndex((entry) => entry.id === log.id);
                          const editIndex =
                            chronologicalIndex >= 0 ? chronologicalIndex : logs.indexOf(log);
                          return (
                            <MatchLogCard
                              key={log.id}
                              log={log}
                              chronologicalIndex={chronologicalIndex}
                              editIndex={editIndex}
                              displayTeamA={displayTeamA}
                              displayTeamB={displayTeamB}
                              displayTeamAShort={displayTeamAShort}
                              displayTeamBShort={displayTeamBShort}
                              getAbbaDescriptor={getAbbaDescriptor}
                              openScoreModal={openScoreModal}
                              openSimpleEventModal={openSimpleEventModal}
                              openPossessionEditModal={openPossessionEditModal}
                            />
                          );
                        });
                    })()
                  )}
                <button
                  type="button"
                  onClick={() => setEndScrimmageModalOpen(true)}
                  disabled={!canEndMatch}
                  className="block w-full rounded-full bg-[#0f5132] px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#0a3b24] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  End scrimmage
                </button>
                {pendingEntries.length > 0 && (
                  <div className="rounded-2xl border border-[#0f5132]/30 bg-white/90 p-2 text-sm text-[#0f5132]">
                    <h4 className="text-base font-semibold text-[#0f5132]">
                      Pending database payloads
                    </h4>
                    <pre className="mt-3 max-h-64 overflow-y-auto rounded-xl bg-[#ecfdf3] p-3 text-xs text-[#0f5132]">
                      {JSON.stringify(pendingEntries, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {rostersError && (
              <p className="rounded-3xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {rostersError}
              </p>
            )}
            <div className="space-y-2 rounded-3xl border border-[#0f5132]/30 bg-white p-1.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-center text-lg font-semibold text-[#0f5132]">
                  Player roster
                </h3>
                <button
                  type="button"
                  onClick={openRosterEditor}
                  aria-label="Edit roster"
                  title="Edit roster"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#0f5132]/40 text-[#0f5132] transition hover:bg-[#ecfdf3]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              </div>
              <div className="space-y-1.5 rounded-2xl border border-[#0f5132]/20 bg-[#ecfdf3] p-2 text-sm text-[#0f5132]">
                {rostersLoading ? (
                  <p className="text-center text-xs">Loading roster...</p>
                ) : allRosterPlayers.length === 0 ? (
                  <p className="text-center text-xs text-slate-500">No players assigned.</p>
                ) : (
                  allRosterPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-2 border-b border-white/40 pb-1 last:border-b-0"
                    >
                      <PlayerSideIcon side={player.side} />
                      <p>{formatPlayerSelectLabel(player)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {consoleError && (
              <p className="text-center text-sm text-rose-600">{consoleError}</p>
            )}
          </section>
        ) : (
          <section className="space-y-2 rounded-3xl border border-slate-200 bg-white p-2 text-center">
            <button
              type="button"
              onClick={() => setSetupModalOpen(true)}
              disabled={initialising}
              className="inline-flex w-full items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {initialising ? "Initialising..." : "Match setup"}
            </button>
            {consoleError && (
              <p className="text-sm text-rose-600">{consoleError}</p>
            )}
      </section>
      )}
    </main>

      {resumeCandidate && !resumeHandled && (
        <ActionModal title="Resume previous session?" onClose={handleDiscardResume}>
          <div className="space-y-3 text-sm text-[#0f5132]">
            <p>
              A previous session for this match was saved{" "}
              {resumeCandidate.updatedAt
                ? new Date(resumeCandidate.updatedAt).toLocaleString()
                : "recently"}.
            </p>
            <div className="rounded-2xl border border-[#0f5132]/20 bg-[#ecfdf3] p-3 text-xs">
              <p className="font-semibold uppercase tracking-wide text-[#0f5132]/70">
                Snapshot
              </p>
              <p>
                Score: {resumeCandidate?.score?.a ?? 0} - {resumeCandidate?.score?.b ?? 0}
              </p>
              <p>
                Game clock: {formatClock(resumeCandidate?.timer?.seconds ?? 0)}
                {resumeCandidate?.timer?.running ? " (running)" : ""}
              </p>
            </div>
            {resumeError && (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {resumeError}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleResumeSession}
                disabled={resumeBusy}
                className="inline-flex items-center justify-center rounded-full bg-[#0f5132] px-4 py-2 text-white transition hover:bg-[#0a3b24] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resumeBusy ? "Loading..." : "Resume session"}
              </button>
              <button
                type="button"
                onClick={handleStartNewMatch}
                disabled={resumeBusy}
                className="inline-flex items-center justify-center rounded-full border border-[#0f5132]/40 px-4 py-2 font-semibold text-[#0f5132] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Start new
              </button>
            </div>
          </div>
        </ActionModal>
      )}

      {setupModalOpen && (
        <ActionModal title="Match setup" onClose={() => setSetupModalOpen(false)}>
          <form className="space-y-4" onSubmit={handleInitialiseMatch}>
            <div className="rounded-2xl border border-[#0f5132]/20 bg-[#ecfdf3] px-3 py-2 text-sm text-[#0f5132]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#0f5132]/70">
                Local scrimmage
              </p>
              <p className="mt-1 text-xs text-[#0f5132]/80">
                Scrimmage runs without events or matches. Teams are fixed to Light vs Dark and data stays on this device.
              </p>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Match duration</span>
                <input
                  type="number"
                  min="1"
                  value={rules.matchDuration || ""}
                  placeholder="No limit"
                  disabled
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
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
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
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
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
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
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
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
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
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
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Pulling team</span>
                <select
                  value={setupForm.startingTeamId || ""}
                  onChange={(event) =>
                    setSetupForm((prev) => ({
                      ...prev,
                      startingTeamId: event.target.value || "",
                    }))
                  }
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Select team...</option>
                  {teamAId && <option value={teamAId}>{displayTeamA}</option>}
                  {teamBId && <option value={teamBId}>{displayTeamB}</option>}
                </select>
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">ABBA</span>
                <select
                  value={rules.abbaPattern}
                  onChange={(event) =>
                    setRules((prev) => ({
                      ...prev,
                      abbaPattern: event.target.value,
                    }))
                  }
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="none">None</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={initialising}
              className="w-full rounded-full bg-[#0f5132] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0a3b24] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {initialising ? "Initialising..." : "Initialise"}
            </button>
          </form>
        </ActionModal>
      )}

      {possessionModalOpen && (
        <ActionModal title="Possession change" onClose={resetPossessionModalState} alignTop scrollable>
          <div className="space-y-3 text-[#0f5132]">
            <p className="text-sm font-semibold">
              {pendingPossessionTeam === "A"
                ? `${displayTeamA} in possession`
                : pendingPossessionTeam === "B"
                  ? `${displayTeamB} in possession`
                  : "Select possession"}
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm font-semibold">
              <label
                className={`flex items-center gap-2 rounded-2xl border px-3 py-3 min-h-[52px] ${
                  possessionResult === "throwaway"
                    ? "border-[#0f5132] bg-[#0f5132] text-white"
                    : "border-[#0f5132]/30 bg-white text-[#0f5132]"
                }`}
              >
                <input
                  type="radio"
                  name="possession-outcome-modal"
                  value="throwaway"
                  checked={possessionResult === "throwaway"}
                  onChange={() => {
                    setPossessionResult("throwaway");
                  }}
                />
                <span>Incompletion</span>
              </label>
              <label
                className={`flex items-center gap-2 rounded-2xl border px-3 py-3 min-h-[52px] ${
                  possessionResult === "block"
                    ? "border-[#0f5132] bg-[#0f5132] text-white"
                    : "border-[#0f5132]/30 bg-white text-[#0f5132]"
                }`}
              >
                <input
                  type="radio"
                  name="possession-outcome-modal"
                  value="block"
                  checked={possessionResult === "block"}
                  onChange={() => {
                    setPossessionResult("block");
                    const blockTeam =
                      pendingPossessionTeam === "A" ? "B" : pendingPossessionTeam === "B" ? "A" : null;
                  }}
                />
                <span>Block</span>
              </label>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#0f5132]/70">
                Player ({possessionResult === "block" ? "current team" : "opposition"})
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handlePossessionActorSelect("")}
                  className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                    possessionActorId === ""
                      ? "border-[#0f5132] bg-[#0f5132] text-white"
                      : "border-[#0f5132]/30 bg-white text-[#0f5132] hover:border-[#0f5132]/60"
                  }`}
                >
                  N/A
                </button>
                {!activeActorOptions.length && (
                  <div className="rounded-xl border border-dashed border-[#0f5132]/30 px-2 py-2 text-center text-xs font-semibold text-[#0f5132]/60">
                    No players
                  </div>
                )}
                {activeActorOptions.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => handlePossessionActorSelect(player.id)}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                      possessionActorId === player.id
                        ? "border-[#0f5132] bg-[#0f5132] text-white"
                        : "border-[#0f5132]/30 bg-white text-[#0f5132] hover:border-[#0f5132]/60"
                    }`}
                  >
                    {renderPlayerGridLabel(player)}
                  </button>
                ))}
              </div>
            </div>
            {!pendingPossessionTeam && (
              <div className="rounded-xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-2 text-xs font-semibold text-[#0f5132]">
                Select a team to continue.
              </div>
            )}
            {possessionEditIndex !== null && (
              <button
                type="button"
                onClick={openPossessionDeleteModal}
                className="w-full rounded-full bg-[#b91c1c] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#991b1b]"
              >
                Delete possession event
              </button>
            )}
          </div>
        </ActionModal>
      )}

      {possessionDeleteModalOpen && (
        <ActionModal title="Delete possession event?" onClose={closePossessionDeleteModal}>
          <div className="space-y-3 text-sm text-[#0f5132]">
            <p>This will remove the turnover/block event from the match log.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={closePossessionDeleteModal}
                className="inline-flex items-center justify-center rounded-full border border-[#0f5132]/40 px-4 py-2 font-semibold text-[#0f5132] transition hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePossessionDelete}
                className="inline-flex items-center justify-center rounded-full bg-[#b91c1c] px-4 py-2 font-semibold text-white transition hover:bg-[#991b1b]"
              >
                Delete
              </button>
            </div>
          </div>
        </ActionModal>
      )}

  {timeModalOpen && (
    <ActionModal
      title="Time additions"
      onClose={() => {
        if (!stoppageActive) {
          setTimeModalOpen(false);
        }
      }}
      disableClose={stoppageActive}
    >
      <div className="space-y-2 text-center text-sm text-[#0f5132]">
        <button
          type="button"
          onClick={() => {
            handleHalfTimeTrigger();
          }}
          className="w-full rounded-full bg-[#0f5132] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
        >
          Half Time
        </button>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="text-base font-semibold">{displayTeamA}</p>
            <button
              type="button"
              onClick={() => {
                handleTimeoutTrigger("A");
              }}
              disabled={remainingTimeouts.A === 0}
              className="mt-1.5 w-full rounded-full bg-[#162e6a] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#1e4fd7] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Timeout {displayTeamA || "Team A"}
            </button>
            <p className="mt-1 text-xs">
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
              className="mt-1.5 w-full rounded-full bg-[#162e6a] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#1e4fd7] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Timeout {displayTeamB || "Team B"}
            </button>
            <p className="mt-1 text-xs">
              Remaining (total): {remainingTimeouts.B}
              <br />
              Remaining (half): {halfRemainingLabel("B")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGameStoppage}
          className="w-full rounded-full bg-[#b91c1c] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#991b1b]"
        >
          Game stoppage
        </button>

        {stoppageActive && (
          <div className="space-y-2 rounded-2xl border border-[#a7f3d0]/60 bg-[#f0fff4] p-3 text-left">
            <p className="text-base font-semibold text-[#0f5132]">Stoppage active</p>
            <p className="text-xs text-[#0f5132]/80">
              Resume match time to unlock this menu and log the stoppage end.
            </p>
          </div>
        )}
      </div>
    </ActionModal>
  )}

      {scoreModalState.open && (
        <ActionModal
          title={scoreModalState.mode === "edit" ? "Edit score" : "Add score"}
          onClose={closeScoreModal}
        >
          <form className="space-y-2" onSubmit={handleScoreModalSubmit}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#0f5132]/70">
              Team: {scoreModalState.team === "B" ? displayTeamB : displayTeamA}
            </p>
            <label className="block text-base font-semibold text-[#0f5132]">
              Scorer:
              <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-[#0f5132]/30 bg-white/70 p-2">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setScoreForm((prev) => ({ ...prev, scorerId: SCORE_NA_PLAYER_VALUE }))}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                      scoreForm.scorerId === SCORE_NA_PLAYER_VALUE
                        ? "border-[#0f5132] bg-[#0f5132] text-white"
                        : "border-[#0f5132]/30 bg-white text-[#0f5132] hover:border-[#0f5132]/60"
                    }`}
                    aria-pressed={scoreForm.scorerId === SCORE_NA_PLAYER_VALUE}
                  >
                    N/A
                  </button>
                  {rosterOptionsForModal.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => setScoreForm((prev) => ({ ...prev, scorerId: player.id }))}
                      className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                        scoreForm.scorerId === player.id
                          ? "border-[#0f5132] bg-[#0f5132] text-white"
                          : "border-[#0f5132]/30 bg-white text-[#0f5132] hover:border-[#0f5132]/60"
                      }`}
                      aria-pressed={scoreForm.scorerId === player.id}
                    >
                      {renderPlayerGridLabel(player)}
                    </button>
                  ))}
                </div>
              </div>
            </label>
            <label className="block text-base font-semibold text-[#0f5132]">
              Assist:
              <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-[#0f5132]/30 bg-white/70 p-2">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setScoreForm((prev) => ({ ...prev, assistId: SCORE_NA_PLAYER_VALUE }))}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                      scoreForm.assistId === SCORE_NA_PLAYER_VALUE
                        ? "border-[#0f5132] bg-[#0f5132] text-white"
                        : "border-[#0f5132]/30 bg-white text-[#0f5132] hover:border-[#0f5132]/60"
                    }`}
                    aria-pressed={scoreForm.assistId === SCORE_NA_PLAYER_VALUE}
                  >
                    N/A
                  </button>
                {rosterOptionsForModal.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => setScoreForm((prev) => ({ ...prev, assistId: player.id }))}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                      scoreForm.assistId === player.id
                        ? "border-[#0f5132] bg-[#0f5132] text-white"
                        : "border-[#0f5132]/30 bg-white text-[#0f5132] hover:border-[#0f5132]/60"
                    }`}
                    aria-pressed={scoreForm.assistId === player.id}
                  >
                    {renderPlayerGridLabel(player)}
                  </button>
                ))}
                  <button
                    type="button"
                    onClick={() => setScoreForm((prev) => ({ ...prev, assistId: CALAHAN_ASSIST_VALUE }))}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                      scoreForm.assistId === CALAHAN_ASSIST_VALUE
                        ? "border-[#0f5132] bg-[#0f5132] text-white"
                        : "border-[#0f5132]/30 bg-white text-[#0f5132] hover:border-[#0f5132]/60"
                    }`}
                    aria-pressed={scoreForm.assistId === CALAHAN_ASSIST_VALUE}
                  >
                    CALLAHAN!!
                  </button>
                </div>
              </div>
            </label>
            <div className="space-y-1.5">
              {!isScoreFormValid && (
                <p className="text-xs font-semibold text-rose-600">
                  Choose both a scorer and an assist to log this score.
                </p>
              )}
              <button
                type="submit"
                disabled={!isScoreFormValid}
                className={`w-full rounded-full px-3 py-1.5 text-sm font-semibold text-white transition ${
                  isScoreFormValid ? "bg-[#0f5132] hover:bg-[#0a3b24]" : "bg-slate-400 opacity-70"
                }`}
              >
                {scoreModalState.mode === "edit" ? "Update score" : "Add score"}
              </button>
              {scoreModalState.mode === "edit" && (
                <button
                  type="button"
                  onClick={() => handleDeleteLog(scoreModalState.logIndex)}
                  className="w-full rounded-full bg-[#22a06b] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#1f7a5a]"
                >
                  Delete
                </button>
              )}
            </div>
          </form>
        </ActionModal>
      )}

      {simpleEventEditState.open && (
        <ActionModal title="Edit event" onClose={closeSimpleEventModal}>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              const normalizedCode = (simpleEventEditState.eventCode || "").toLowerCase();
              if (SIMPLE_EVENT_DELETE_ONLY_CODES.has(normalizedCode)) {
                event.preventDefault();
                return;
              }
              handleSimpleEventSubmit(event);
            }}
          >
            <p className="text-sm font-semibold text-[#0f5132]">
              {simpleEventEditState.eventLabel}
            </p>
            {!SIMPLE_EVENT_DELETE_ONLY_CODES.has(
              (simpleEventEditState.eventCode || "").toLowerCase()
            ) && (
              <label className="block text-base font-semibold text-[#0f5132]">
                Team
                <select
                  value={simpleEventEditState.teamKey}
                  onChange={(event) =>
                    setSimpleEventEditState((prev) => ({ ...prev, teamKey: event.target.value }))
                  }
                  className="mt-2 w-full rounded-full border border-[#0f5132]/40 bg-[#d4f4e2] px-4 py-2 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none"
                >
                  <option value="">Unassigned</option>
                  <option value="A">{displayTeamA}</option>
                  <option value="B">{displayTeamB}</option>
                </select>
              </label>
            )}
            <div className="space-y-1.5">
              {!SIMPLE_EVENT_DELETE_ONLY_CODES.has(
                (simpleEventEditState.eventCode || "").toLowerCase()
              ) && (
                <button
                  type="submit"
                  className="w-full rounded-full bg-[#0f5132] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
                >
                  Save changes
                </button>
              )}
              {simpleEventEditState.logIndex !== null && (
                <button
                  type="button"
                  onClick={handleSimpleEventDelete}
                  className="w-full rounded-full bg-[#22a06b] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#1f7a5a]"
                >
                  Delete
                </button>
              )}
            </div>
          </form>
        </ActionModal>
      )}

      {rosterEditorOpen && (
        <ActionModal title="Edit player roster" onClose={closeRosterEditor}>
          <div className="space-y-3 text-sm text-[#0f5132]">
            <form className="space-y-3" onSubmit={handleRosterPlayerSubmit}>
              <label className="block text-sm font-semibold text-[#0f5132]">
                Name
                <input
                  type="text"
                  value={playerEditorForm.name}
                  onChange={(event) =>
                    setPlayerEditorForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  required
                  className="mt-2 w-full rounded-xl border border-[#0f5132]/30 bg-white px-3 py-2 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30"
                />
              </label>
              <label className="block text-sm font-semibold text-[#0f5132]">
                Jersey number (optional)
                <input
                  type="number"
                  min="0"
                  value={playerEditorForm.jersey}
                  onChange={(event) =>
                    setPlayerEditorForm((prev) => ({ ...prev, jersey: event.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-[#0f5132]/30 bg-white px-3 py-2 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30"
                />
              </label>
              <label className="block text-sm font-semibold text-[#0f5132]">
                Team icon
                <select
                  value={playerEditorForm.assignment}
                  onChange={(event) =>
                    setPlayerEditorForm((prev) => ({ ...prev, assignment: event.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-[#0f5132]/30 bg-white px-3 py-2 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30"
                >
                  <option value="A">{safeTeamAName} (L)</option>
                  <option value="B">{safeTeamBName} (D)</option>
                  <option value="both">Light + Dark (L+D)</option>
                </select>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="submit"
                  className="w-full rounded-full bg-[#0f5132] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
                >
                  {playerEditorForm.id ? "Update player" : "Add player"}
                </button>
                {playerEditorForm.id ? (
                  <button
                    type="button"
                    onClick={handleDeleteCurrentPlayer}
                    className="w-full rounded-full bg-[#22a06b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f7a5a]"
                  >
                    Delete player
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={closeRosterEditor}
                    className="w-full rounded-full border border-[#0f5132]/40 px-4 py-2 text-sm font-semibold text-[#0f5132] transition hover:bg-white"
                  >
                    Done
                  </button>
                )}
              </div>
              {playerEditorForm.id && (
                <button
                  type="button"
                  onClick={resetPlayerEditorForm}
                  className="w-full rounded-full border border-[#0f5132]/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#0f5132] transition hover:bg-white"
                >
                  Add another player
                </button>
              )}
            </form>

            <div className="rounded-2xl border border-[#0f5132]/20 bg-[#ecfdf3] p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#0f5132]/70">
                Current players
              </p>
              {allRosterPlayers.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No players yet.</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {allRosterPlayers.map((player) => (
                    <div
                      key={`edit-${player.id}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/60 bg-white px-2 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <PlayerSideIcon side={player.side} />
                        <p>{formatPlayerSelectLabel(player)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEditRosterPlayer(player)}
                          className="rounded-full border border-[#0f5132]/30 px-2 py-0.5 text-[11px] font-semibold text-[#0f5132] transition hover:bg-[#dcfce7]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRosterPlayer(player.id)}
                          className="rounded-full border border-rose-300 px-2 py-0.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ActionModal>
      )}

      {endScrimmageModalOpen && (
        <ActionModal title="End scrimmage" onClose={() => setEndScrimmageModalOpen(false)}>
          <div className="space-y-3 text-sm text-[#0f5132]">
            <p>How would you like to wrap up this scrimmage?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  handleEndMatchNavigation();
                  setEndScrimmageModalOpen(false);
                  setMatchReportOpen(true);
                }}
                className="w-full rounded-full bg-[#0f5132] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
              >
                Match report
              </button>
              <button
                type="button"
                onClick={() => {
                  handleExportCsv();
                  setEndScrimmageModalOpen(false);
                }}
                className="w-full rounded-full border border-[#0f5132]/40 px-4 py-2 text-sm font-semibold text-[#0f5132] transition hover:bg-white"
              >
                Download CSV
              </button>
            </div>
            <button
              type="button"
              onClick={() => setEndScrimmageModalOpen(false)}
              className="w-full rounded-full border border-[#0f5132]/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#0f5132] transition hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </ActionModal>
      )}

      {matchReportOpen && (
        <ActionModal
          title="Scrimmage report"
          onClose={() => setMatchReportOpen(false)}
          maxWidthClass="max-w-4xl"
        >
          <div className="max-h-[75vh] space-y-4 overflow-y-auto text-[#0f5132]">
            <section className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <InsightTable title="Match insight" rows={scrimmageReport?.insights?.match} />
                <InsightTable title="Tempo insight" rows={scrimmageReport?.insights?.tempo} />
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="sc-chip">Team production</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <TeamOverviewCard
                  title={`${displayTeamA} overview`}
                  stats={scrimmageReport?.summaries?.teamA}
                />
                <TeamOverviewCard
                  title={`${displayTeamB} overview`}
                  stats={scrimmageReport?.summaries?.teamB}
                />
              </div>
            </section>
          </div>
        </ActionModal>
      )}
    </ScorekeeperShell>
  );
}

function ActionModal({
  title,
  onClose,
  children,
  disableClose = false,
  maxWidthClass = "max-w-sm",
  alignTop = false,
  scrollable = false,
}) {
  const handleClose = () => {
    if (!disableClose) {
      onClose();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/50 backdrop-blur-[2px] px-4 py-3 ${
        alignTop ? "items-start" : "items-center"
      }`}
    >
      <div
        className={`w-full ${maxWidthClass} rounded-[32px] bg-white p-3 ${
          scrollable ? "max-h-[92vh] overflow-hidden" : ""
        }`}
      >
        <div className="mb-2 flex items-start justify-between">
          <h3 className="text-2xl font-semibold text-[#0f5132]">{title}</h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close modal"
            disabled={disableClose}
            className="text-2xl font-semibold text-[#0f5132] transition hover:text-[#083b24] disabled:cursor-not-allowed disabled:opacity-40"
          >
            X
          </button>
        </div>
        <div className={scrollable ? "max-h-[80vh] overflow-y-auto pr-1" : ""}>{children}</div>
      </div>
    </div>
  );
}

function MatchLogCard({
  log,
  chronologicalIndex,
  editIndex,
  displayTeamA,
  displayTeamB,
  displayTeamAShort,
  displayTeamBShort,
  getAbbaDescriptor,
  openScoreModal,
  openSimpleEventModal,
  openPossessionEditModal,
}) {
  const normalizedEventCode = `${log.eventCode || ""}`.toLowerCase();
  const normalizedEventDescription = `${log.eventDescription || ""}`.toLowerCase();
  const isBlockLog =
    (Number.isFinite(log.eventTypeId) && log.eventTypeId === BLOCK_EVENT_TYPE_ID) ||
    normalizedEventCode.includes("block") ||
    normalizedEventDescription.includes("block");

  let CardComponent = UnknownEventCard;
  if (isBlockLog) {
    CardComponent = BlockEventCard;
  } else if (normalizedEventCode === MATCH_LOG_EVENT_CODES.SCORE) {
    CardComponent = ScoreEventCard;
  } else if (normalizedEventCode === MATCH_LOG_EVENT_CODES.CALAHAN) {
    CardComponent = CalahanEventCard;
  } else if (normalizedEventCode === MATCH_LOG_EVENT_CODES.TURNOVER) {
    CardComponent = TurnoverEventCard;
  } else if (normalizedEventCode === MATCH_LOG_EVENT_CODES.TIMEOUT_START) {
    CardComponent = TimeoutStartEventCard;
  } else if (normalizedEventCode === MATCH_LOG_EVENT_CODES.TIMEOUT_END) {
    CardComponent = TimeoutEndEventCard;
  } else if (normalizedEventCode === MATCH_LOG_EVENT_CODES.HALFTIME_START) {
    CardComponent = HalftimeStartEventCard;
  } else if (normalizedEventCode === MATCH_LOG_EVENT_CODES.HALFTIME_END) {
    CardComponent = HalftimeEndEventCard;
  } else if (normalizedEventCode === MATCH_LOG_EVENT_CODES.STOPPAGE_START) {
    CardComponent = StoppageStartEventCard;
  } else if (normalizedEventCode === MATCH_LOG_EVENT_CODES.STOPPAGE_END) {
    CardComponent = StoppageEndEventCard;
  } else if (normalizedEventCode === MATCH_LOG_EVENT_CODES.MATCH_START) {
    CardComponent = MatchStartEventCard;
  } else if (normalizedEventCode === MATCH_LOG_EVENT_CODES.MATCH_END) {
    CardComponent = MatchEndEventCard;
  }

  return (
    <CardComponent
      log={log}
      chronologicalIndex={chronologicalIndex}
      editIndex={editIndex}
      displayTeamA={displayTeamA}
      displayTeamB={displayTeamB}
      displayTeamAShort={displayTeamAShort}
      displayTeamBShort={displayTeamBShort}
      getAbbaDescriptor={getAbbaDescriptor}
      openScoreModal={openScoreModal}
      openSimpleEventModal={openSimpleEventModal}
      openPossessionEditModal={openPossessionEditModal}
    />
  );
}

function PlayerSideIcon({ side }) {
  if (side === "A") {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 bg-white text-[9px] font-bold leading-none text-slate-800"
        title="Light"
        aria-label="Light"
      >
        L
      </span>
    );
  }

  if (side === "B") {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-[9px] font-bold leading-none text-slate-100"
        title="Dark"
        aria-label="Dark"
      >
        D
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1"
      title="Light and Dark"
      aria-label="Light and Dark"
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-500 bg-white text-[8px] font-bold leading-none text-slate-800">
        L
      </span>
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-[8px] font-bold leading-none text-slate-100">
        D
      </span>
    </span>
  );
}

function InsightTable({ title, rows }) {
  if (!rows?.length) {
    return (
      <div className="rounded-2xl border border-[#0f5132]/20 bg-[#ecfdf3] p-4 text-sm text-[#0f5132]/70">
        No {title.toLowerCase()} available.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-[#0f5132]/20 bg-white">
      <div className="border-b border-[#0f5132]/20 px-4 py-3">
        <h3 className="text-sm font-semibold text-[#0f5132]">{title}</h3>
      </div>
      <table className="w-full text-sm text-[#0f5132]">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-[#0f5132]/10 text-sm">
              <td className="px-4 py-2 font-medium text-[#0f5132]/70">{row.label}</td>
              <td className="px-4 py-2 text-right font-semibold text-[#0f5132]">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamOverviewCard({ title, stats }) {
  const goals = stats?.goals || [];
  const assists = stats?.assists || [];
  const turnovers = stats?.turnovers || [];
  const connections = stats?.connections || [];
  const production = stats?.production;
  const summaryStats = [
    { key: "holds", label: "Holds", value: production?.holds },
    { key: "clean", label: "Clean holds", value: production?.cleanHolds },
    { key: "turnovers", label: "Total turnovers", value: production?.totalTurnovers },
    { key: "breaks", label: "Breaks", value: production?.breaks },
    { key: "breakChances", label: "Break chances", value: production?.breakChances },
  ];
  const formatStatValue = (value) => (Number.isFinite(value) ? value : value === 0 ? 0 : "--");

  const renderList = (label, rows, valueLabel) => (
    <div className="rounded-2xl border border-[#0f5132]/15 bg-[#ecfdf3] p-3">
      {rows.length ? (
        <table className="w-full text-left text-sm text-[#0f5132]">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-[#0f5132]/60">
              <th className="py-0.5 pr-2">{valueLabel}</th>
              <th className="py-0.5 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row) => (
              <tr key={`${label}-${row.player}`} className="border-t border-[#0f5132]/10 text-sm">
                <td className="py-1 pr-2">{row.player}</td>
                <td className="py-1 text-right font-semibold">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-0.5 text-xs text-[#0f5132]/60 sm:mt-1.5">
          No {label.toLowerCase()} recorded.
        </p>
      )}
    </div>
  );

  return (
    <div className="rounded-2xl border border-[#0f5132]/20 bg-white p-3 sm:p-5">
      <h3 className="mb-1.5 text-lg font-semibold text-[#0f5132] sm:mb-2.5">{title}</h3>
      {production && (
        <div className="mb-2 grid grid-cols-2 gap-2 text-center sm:mb-3 sm:grid-cols-5 sm:gap-3">
          {summaryStats.map((item) => (
            <div
              key={item.key}
              className="rounded-xl border border-[#0f5132]/15 bg-[#f8fffb] px-2 py-3"
            >
              <p className="text-lg font-semibold text-[#0f5132] sm:text-xl">
                {formatStatValue(item.value)}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0f5132]/60 sm:text-[11px]">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 sm:gap-3">
        {renderList("Goals", goals, "Goal")}
        {renderList("Assists", assists, "Assist")}
        {renderList("Turnovers", turnovers, "Turnover")}
      </div>
      <div className="mt-1.5 rounded-2xl border border-[#0f5132]/15 bg-[#ecfdf3] p-3 sm:mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0f5132]/60">
          Top connections
        </p>
        {connections.length ? (
          <table className="mt-1 w-full text-left text-sm text-[#0f5132] sm:mt-1.5">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[#0f5132]/60">
                <th className="py-0.5 pr-2">Assist</th>
                <th className="py-0.5" />
                <th className="py-0.5 pr-2">Scorer</th>
                <th className="py-0.5 text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {connections.slice(0, 6).map((row) => (
                <tr key={`${row.assist}-${row.scorer}`} className="border-t border-[#0f5132]/10 text-sm">
                  <td className="py-1 pr-2">{row.assist}</td>
                  <td className="py-1 text-center text-sm font-bold text-[#0f5132]/60">ƒ+'</td>
                  <td className="py-1 pr-2">{row.scorer}</td>
                  <td className="py-1 text-right font-semibold">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-1 text-xs text-[#0f5132]/60 sm:mt-1.5">
            No assisted goals recorded.
          </p>
        )}
      </div>
    </div>
  );
}
