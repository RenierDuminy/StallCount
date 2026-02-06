import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import { formatClock } from "./scorekeeperUtils";
import { useScoreKeeperData } from "./useScoreKeeperData";
import { useScoreKeeperActions } from "./useScoreKeeperActions";
import { ScorekeeperPopups } from "./ScorekeeperPopup";
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
} from "./eventCards";
import {
  CALAHAN_ASSIST_VALUE,
  DEFAULT_DISCUSSION_SECONDS,
  SCORE_NA_PLAYER_VALUE,
} from "./scorekeeperConstants";

const BLOCK_EVENT_TYPE_ID = 19;
export default function ScoreKeeperView() {
  const data = useScoreKeeperData();
  const actions = useScoreKeeperActions(data);

  const {
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
    activeMatch,
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
    timerSeconds,
    timerRunning,
    secondaryRunning,
    secondaryLabel,
    timerLabel,
    consoleError,
    rosters,
    rostersLoading,
    rostersError,
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
    loadMatches,
    handleResumeSession,
    handleDiscardResume
  } = data;

  const safeTeamAName = displayTeamA || "Team A";
  const safeTeamBName = displayTeamB || "Team B";
  const primaryOvertime = timerSeconds < 0;
  const primaryClockDisplay = primaryOvertime
    ? formatClock(Math.abs(timerSeconds))
    : formattedPrimaryClock;
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
    return (
      <span className="flex items-center gap-2">
        <span className="font-extrabold">{jersey}</span>
        <span>{name}</span>
      </span>
    );
  };
  const isMixedDivision = (rules.division || "").toLowerCase() === "mixed";
  const spiritScoresUrl = activeMatch?.id
    ? `/spirit-scores?matchId=${activeMatch.id}`
    : selectedMatch?.id
      ? `/spirit-scores?matchId=${selectedMatch.id}`
      : "/spirit-scores";
  const isStartMatchReady =
    Boolean(setupForm.startingTeamId) &&
    (!isMixedDivision || ["male", "female"].includes(setupForm.abbaPattern));
  const renderMatchEventCard = (log, options) => {
    const { chronologicalIndex, editIndex } = options;
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
  };
  const renderPlayerGridLabel = (player) => {
    const jerseyValue = player?.jersey_number;
    const jerseyText = `${jerseyValue ?? ""}`.trim();
    const name = player?.name || "Player";
    return (
      <span className="flex flex-col items-center text-center leading-tight">
        {jerseyText && <span className="text-sm font-extrabold">{jerseyText}</span>}
        <span className={`${jerseyText ? "mt-0.5" : ""} w-full text-[0.7rem] font-semibold whitespace-normal break-words`}>
          {name}
        </span>
      </span>
    );
  };

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
    logMatchStartEvent
  } = actions;

  const POSSESSION_DRAG_THRESHOLD = 24;
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
  const [endMatchModalOpen, setEndMatchModalOpen] = useState(false);
  const [endMatchBusy, setEndMatchBusy] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
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

  const scorerAssistClash =
    scoreForm.assistId &&
    scoreForm.assistId !== CALAHAN_ASSIST_VALUE &&
    scoreForm.assistId !== SCORE_NA_PLAYER_VALUE &&
    scoreForm.scorerId &&
    scoreForm.scorerId !== SCORE_NA_PLAYER_VALUE &&
    scoreForm.assistId === scoreForm.scorerId;
  const isScoreFormValid = Boolean(scoreForm.scorerId && scoreForm.assistId && !scorerAssistClash);

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
    setPossessionActorId(log?.scorerId || "");
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

  const confirmEndMatch = async () => {
    setEndMatchBusy(true);
    try {
      await handleEndMatchNavigation();
    } finally {
      setEndMatchBusy(false);
      setEndMatchModalOpen(false);
    }
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

  return (
    <ScorekeeperShell>
      <ScorekeeperCard as="header" className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col leading-tight">
            <h1 className="text-xl font-semibold text-white">Score keeper</h1>
          </div>
          <Link to="/admin" className="sc-button is-light text-xs">
            Back to admin hub
          </Link>
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
                  <p
                    className={`text-[clamp(3rem,12vw,5.5rem)] font-semibold leading-none ${
                      primaryOvertime ? "text-[#b91c1c]" : "text-slate-900"
                    }`}
                  >
                    {primaryClockDisplay}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {timerLabel || "Game time"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-[#dff7e5] p-3 text-center text-slate-800">
                  <p className="text-[clamp(2.6rem,11vw,4.5rem)] font-semibold leading-none text-slate-900">
                    {formattedSecondaryClock}
                  </p>
                  <div className="flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                    <span>{secondaryLabel || "Inter point"}</span>
                  </div>
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
                  DISCUSSION-START/STOP
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 text-center text-sm font-semibold text-slate-800">
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
                      {displayTeamAShort}
                    </button>
                    <button
                      type="button"
                      className={`flex-1 rounded-2xl px-3 py-3 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${
                        possessionTeam === "B" ? "bg-[#0f5132] text-white" : "bg-[#b1b1b1] text-slate-700"
                      }`}
                      aria-pressed={possessionTeam === "B"}
                      tabIndex={-1}
                    >
                      {displayTeamBShort}
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

            {consoleError && (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {consoleError}
              </p>
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
                      disabled={!isStartMatchReady}
                      className={`w-full rounded-full px-3 py-2 text-sm font-semibold transition ${
                        isStartMatchReady
                          ? "bg-[#0f5132] text-white hover:bg-[#0a3b24]"
                          : "bg-slate-300 text-slate-600"
                      } disabled:cursor-not-allowed`}
                    >
                      Start match
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openScoreModal("A")}
                        className="w-full rounded-full bg-[#0f5132] px-3 py-6 text-center text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
                        >
                          Add score - {displayTeamAShort}
                        </button>
                        <div className="px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#0f5132]/80">
                          <div className="flex justify-center">
                            {nextAbbaDescriptor ? (
                              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0f5132] text-base font-extrabold text-white">
                                {nextAbbaDescriptor}
                              </span>
                            ) : (
                              <span>ABBA disabled</span>
                            )}
                          </div>
                          <p className="text-lg font-semibold text-[#0f5132]">
                            {score.a} - {score.b}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openScoreModal("B")}
                        className="w-full rounded-full bg-[#0f5132] px-3 py-6 text-center text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
                        >
                          Add score - {displayTeamBShort}
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
                          return renderMatchEventCard(log, { chronologicalIndex, editIndex });
                        });
                    })()
                  )}
                <button
                  type="button"
                  onClick={() => setEndMatchModalOpen(true)}
                  disabled={!canEndMatch}
                  className="block w-full rounded-full bg-[#0f5132] px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#0a3b24] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  End match / Enter spirit scores
                </button>
                {pendingEntries.length > 0 && (
                  <div className="rounded-2xl border border-[#0f5132]/30 bg-white/90 p-2 text-sm text-[#0f5132]">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-base font-semibold text-[#0f5132]">
                        Pending sync ({pendingEntries.length})
                      </h4>
                      <span className="rounded-full border border-[#0f5132]/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0f5132]">
                        {online ? "Online" : "Offline"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#0f5132]/80">
                      Queued updates will send automatically when you're online.
                    </p>
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
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2 rounded-3xl border border-[#0f5132]/30 bg-white p-1.5">
                <h3 className="text-center text-lg font-semibold text-[#0f5132]">
                  {safeTeamAName} Players
                </h3>
                <div className="space-y-1.5 rounded-2xl border border-[#0f5132]/20 bg-[#ecfdf3] p-2 text-sm text-[#0f5132]">
                  {rostersLoading ? (
                    <p className="text-center text-xs">Loading roster...</p>
                  ) : sortedRosters.teamA.length === 0 ? (
                    <p className="text-center text-xs text-slate-500">No players assigned.</p>
                  ) : (
                    sortedRosters.teamA.map((player) => (
                      <p key={player.id} className="border-b border-white/40 pb-1 last:border-b-0">
                        {formatPlayerSelectLabel(player)}
                      </p>
                    ))
                  )}
                </div>
              </div>
              <div className="space-y-2 rounded-3xl border border-[#0f5132]/30 bg-white p-1.5">
                <h3 className="text-center text-lg font-semibold text-[#0f5132]">
                  {safeTeamBName} Players
                </h3>
                <div className="space-y-1.5 rounded-2xl border border-[#0f5132]/20 bg-[#ecfdf3] p-2 text-sm text-[#0f5132]">
                  {rostersLoading ? (
                    <p className="text-center text-xs">Loading roster...</p>
                  ) : sortedRosters.teamB.length === 0 ? (
                    <p className="text-center text-xs text-slate-500">No players assigned.</p>
                  ) : (
                    sortedRosters.teamB.map((player) => (
                      <p key={player.id} className="border-b border-white/40 pb-1 last:border-b-0">
                        {formatPlayerSelectLabel(player)}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>

          </section>
        ) : (
          <section
            className="space-y-[var(--setup-button-size)] rounded-3xl border border-slate-200 bg-white p-2 text-center"
            style={{ "--setup-button-size": "4.5rem" }}
          >
            <button
              type="button"
              onClick={() => setSetupModalOpen(true)}
              disabled={initialising}
              className="inline-flex h-[var(--setup-button-size)] w-full items-center justify-center rounded-full bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {initialising ? "Initialising..." : "Match setup"}
            </button>
            <Link
              to={spiritScoresUrl}
              className="inline-flex h-[var(--setup-button-size)] w-full items-center justify-center rounded-full border border-[#0f5132]/40 px-4 text-sm font-semibold text-[#0f5132] transition hover:bg-white"
            >
              Enter spirit scores
            </Link>
            {consoleError && (
              <p className="text-sm text-rose-600">{consoleError}</p>
            )}
      </section>
      )}
    </main>

      <ScorekeeperPopups
        resume={{
          candidate: resumeCandidate,
          handled: resumeHandled,
          busy: resumeBusy,
          error: resumeError,
          onResume: handleResumeSession,
          onDiscard: handleDiscardResume,
        }}
        setup={{
          open: setupModalOpen,
          onClose: () => setSetupModalOpen(false),
          onSubmit: handleInitialiseMatch,
          events,
          eventsLoading,
          eventsError,
          selectedEventId,
          onSelectEvent: setSelectedEventId,
          onSelectMatch: setSelectedMatchId,
          matches,
          matchesLoading,
          matchesError,
          selectedMatchId,
          onRefreshMatches: loadMatches,
          rules,
          setRules,
          setupForm,
          setSetupForm,
          teamAId,
          teamBId,
          displayTeamA,
          displayTeamB,
          isMixedDivision,
          initialising,
          selectedMatch,
          isStartMatchReady,
        }}
        possession={{
          open: possessionModalOpen,
          onClose: resetPossessionModalState,
          pendingTeam: pendingPossessionTeam,
          displayTeamA,
          displayTeamB,
          result: possessionResult,
          onResultChange: setPossessionResult,
          activeActorOptions,
          actorId: possessionActorId,
          onActorSelect: handlePossessionActorSelect,
          renderPlayerGridLabel,
          editIndex: possessionEditIndex,
          onOpenDelete: openPossessionDeleteModal,
        }}
        possessionDelete={{
          open: possessionDeleteModalOpen,
          onClose: closePossessionDeleteModal,
          onDelete: handlePossessionDelete,
        }}
        endMatch={{
          open: endMatchModalOpen,
          busy: endMatchBusy,
          onClose: () => setEndMatchModalOpen(false),
          onConfirm: confirmEndMatch,
        }}
        time={{
          open: timeModalOpen,
          onClose: () => setTimeModalOpen(false),
          stoppageActive,
          onHalfTime: handleHalfTimeTrigger,
          onTimeout: handleTimeoutTrigger,
          remainingTimeouts,
          displayTeamA,
          displayTeamB,
          displayTeamAShort,
          displayTeamBShort,
          halfRemainingLabel,
          onGameStoppage: handleGameStoppage,
          timerRunning,
          onToggleTimer: handleToggleTimer,
        }}
        score={{
          state: scoreModalState,
          onClose: closeScoreModal,
          onSubmit: handleScoreModalSubmit,
          onDelete: handleDeleteLog,
          isFormValid: isScoreFormValid,
          scorerAssistClash,
          form: scoreForm,
          setForm: setScoreForm,
          rosterOptions: rosterOptionsForModal,
          renderPlayerGridLabel,
          displayTeamA,
          displayTeamB,
        }}
        simpleEvent={{
          state: simpleEventEditState,
          setState: setSimpleEventEditState,
          onClose: closeSimpleEventModal,
          onSubmit: handleSimpleEventSubmit,
          onDelete: handleSimpleEventDelete,
          displayTeamA,
          displayTeamB,
        }}
      />
    </ScorekeeperShell>
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
  const isScoreLog = log.eventCode === MATCH_LOG_EVENT_CODES.SCORE;
  const isMatchStartLog = log.eventCode === MATCH_LOG_EVENT_CODES.MATCH_START;
  const isTimeoutLog =
    log.eventCode === MATCH_LOG_EVENT_CODES.TIMEOUT ||
    log.eventCode === MATCH_LOG_EVENT_CODES.TIMEOUT_START;
  const normalizedEventCode = `${log.eventCode || ""}`.toLowerCase();
  const normalizedEventDescription = `${log.eventDescription || ""}`.toLowerCase();
  const isBlockLog =
    (Number.isFinite(log.eventTypeId) && log.eventTypeId === BLOCK_EVENT_TYPE_ID) ||
    normalizedEventCode.includes("block") ||
    normalizedEventDescription.includes("block");
  const isPossessionLog =
    log.eventCode === MATCH_LOG_EVENT_CODES.TURNOVER ||
    normalizedEventCode.includes("turnover") ||
    normalizedEventDescription.includes("turnover") ||
    isBlockLog;
  const isHalftimeLog = log.eventCode === MATCH_LOG_EVENT_CODES.HALFTIME_START;
  const isStoppageStart = log.eventCode === MATCH_LOG_EVENT_CODES.STOPPAGE_START;
  const isCalahanLog = log.eventCode === MATCH_LOG_EVENT_CODES.CALAHAN;
  const shortTeamLabel =
    log.team === "B" ? displayTeamBShort : log.team === "A" ? displayTeamAShort : null;
  const fullTeamLabel =
    log.team === "B" ? displayTeamB : log.team === "A" ? displayTeamA : null;
  const abbaLineLabel = log.abbaLine && log.abbaLine !== "none" ? log.abbaLine : null;
  const abbaDescriptor = isScoreLog || isCalahanLog ? abbaLineLabel : null;
  const eventTime = new Date(log.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const creditedPlayerLabel = isPossessionLog
    ? log.scorerName || (log.scorerId ? "Unknown player" : "Unassigned")
    : null;
  const alignClass = (() => {
    if (isPossessionLog) {
      return log.team === "A" ? "text-right" : log.team === "B" ? "text-left" : "text-center";
    }
    return log.team === "A" ? "text-left" : log.team === "B" ? "text-right" : "text-center";
  })();
  let bannerBgClass = "bg-white";
  let bannerBorderClass = "border-slate-300";
  let bannerTextClass = "text-black";

  if (isMatchStartLog || isTimeoutLog) {
    bannerBgClass = "bg-[#d4f5e1]";
    bannerBorderClass = "border-[#16a34a]/60";
    bannerTextClass = "text-black";
  } else if (isHalftimeLog) {
    bannerBgClass = "bg-[#e0e7ff]";
    bannerBorderClass = "border-[#4338ca]/50";
    bannerTextClass = "text-black";
  } else if (isCalahanLog) {
    bannerBgClass = "bg-[#fff1e0]";
    bannerBorderClass = "border-[#f59e0b]/60";
    bannerTextClass = "text-black";
  } else if (isScoreLog && log.team === "A") {
    bannerBgClass = "bg-[#d1fae5]";
    bannerBorderClass = "border-[#10b981]/70";
    bannerTextClass = "text-black";
  } else if (isScoreLog && log.team === "B") {
    bannerBgClass = "bg-[#bbf7d0]";
    bannerBorderClass = "border-[#059669]/70";
    bannerTextClass = "text-black";
  } else if (isStoppageStart) {
    bannerBgClass = "bg-[#fecdd3]";
    bannerBorderClass = "border-[#ef4444]/60";
    bannerTextClass = "text-black";
  }

  const isScoringDisplay = isScoreLog || isCalahanLog;

  const eventStyles = (() => {
    if (isCalahanLog) {
      return { bg: "bg-[#f0fff4]", border: "border-[#c6f6d5]", label: "text-black" };
    }
    if (isScoreLog) {
      return { bg: "bg-[#e5ffe8]", border: "border-[#16a34a]/70", label: "text-black" };
    }
    if (isTimeoutLog || isStoppageStart) {
      return { bg: "bg-[#fef3c7]", border: "border-[#f59e0b]/60", label: "text-black" };
    }
    if (isHalftimeLog) {
      return { bg: "bg-[#e0e7ff]", border: "border-[#4338ca]/50", label: "text-black" };
    }
    if (isPossessionLog) {
      return { bg: "bg-[#cffafe]", border: "border-[#06b6d4]/60", label: "text-black" };
    }
    return { bg: "bg-white", border: "border-slate-300", label: "text-black" };
  })();

  const description = isMatchStartLog
    ? `Pulling team: ${fullTeamLabel || "Unassigned"}`
    : isTimeoutLog
      ? `${shortTeamLabel || "Team"} timeout`
      : isHalftimeLog
        ? "Halftime reached"
        : isStoppageStart
          ? "Match stoppage"
          : null;
  const showDetachedEdit = isPossessionLog;

  return (
    <article
      className={`rounded-2xl border px-4 py-3 text-sm transition ${eventStyles.bg} ${eventStyles.border} ${alignClass} ${
        showDetachedEdit ? "relative pr-12" : ""
      }`}
    >
      <div className={`w-full ${alignClass}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-black">
          {isMatchStartLog ? "Match start" : log.eventDescription || "Match event"}
          {!isScoringDisplay && !isMatchStartLog && shortTeamLabel ? ` - ${shortTeamLabel}` : ""}
        </p>
        {abbaDescriptor && (
          <p className="text-[30px] font-extrabold uppercase tracking-wide text-black">{abbaDescriptor}</p>
        )}
        {description && <p className="text-xs text-black">{description}</p>}
        <p className="text-xs text-black">{eventTime}</p>
      </div>

      {isScoringDisplay ? (
        <div className="mt-3 grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
          {log.team === "A" ? (
            <div className="text-left text-xs text-black">
              <p className="font-semibold text-black">{displayTeamA}</p>
              <p className="font-semibold text-black">
                {log.assistName ? `${log.assistName} -> ` : ""}
                {log.scorerName || "Unassigned"}
              </p>
            </div>
          ) : (
            <div />
          )}

          <p className="text-center text-lg font-semibold text-black">
            {log.totalA} - {log.totalB}
          </p>

          {log.team === "B" ? (
            <div className="text-right text-xs text-black">
              <p className="font-semibold text-black">{displayTeamB}</p>
              <p className="font-semibold text-black">
                {log.assistName ? `${log.assistName} -> ` : ""}
                {log.scorerName || "Unassigned"}
              </p>
            </div>
          ) : (
            <div />
          )}

          {log.team && (
            <div className="md:col-span-3 flex justify-end">
              <button
                type="button"
                onClick={() => openScoreModal(log.team, "edit", editIndex)}
                className="rounded-full border border-border px-2.5 py-1 text-[#0f5132] transition hover:border-[#0f5132] hover:bg-[#e6fffa]"
                aria-label="Edit event"
                title="Edit event"
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
          )}
        </div>
      ) : (
        <div
          className={`mt-3 text-xs text-black ${
            isPossessionLog
              ? "flex flex-col items-start gap-1"
              : `flex items-center ${description ? "justify-between" : "justify-end"}`
          }`}
        >
          {(description || isPossessionLog) && (
            <p>
              {isPossessionLog
                ? `${shortTeamLabel || "Team"} now has the disc`
                : isTimeoutLog
                  ? `${shortTeamLabel || "Team"} called a timeout`
                  : isStoppageStart
                    ? "Clock paused while stoppage is logged"
                    : isHalftimeLog
                      ? "Second-half prep underway"
                      : ""}
            </p>
          )}
          {isPossessionLog && (
            <p className="text-[11px] font-semibold text-black/70">
              Credited: {creditedPlayerLabel}
            </p>
          )}
          {!showDetachedEdit && (
            <button
              type="button"
              onClick={() => openSimpleEventModal(log, editIndex)}
              className="rounded-full border border-border px-2.5 py-1 text-[#0f5132] transition hover:border-[#0f5132] hover:bg-[#e6fffa]"
              aria-label="Edit event"
              title="Edit event"
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
          )}
        </div>
      )}
      {showDetachedEdit && (
        <button
          type="button"
          onClick={() => openPossessionEditModal(log, editIndex)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-border px-2.5 py-1 text-[#0f5132] transition hover:border-[#0f5132] hover:bg-[#e6fffa]"
          aria-label="Edit event"
          title="Edit event"
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
      )}
    </article>
  );
}
