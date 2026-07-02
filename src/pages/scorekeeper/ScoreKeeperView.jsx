import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import { saveScorekeeperSession } from "../../services/scorekeeperSessionStore";
import { setLiveActivity } from "../../services/liveActivity";
import { formatClock } from "./scorekeeperUtils";
import { useScoreKeeperData } from "./useScoreKeeperData";
import { useScoreKeeperActions } from "./useScoreKeeperActions";
import { useScoreKeeperData as useScoreKeeper5v5Data } from "./5v5useScoreKeeperData";
import { useScoreKeeperActions as useScoreKeeper5v5Actions } from "./5v5useScoreKeeperActions";
import { ResumeSessionSection, ScorekeeperPopups } from "./ScorekeeperPopup";
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
const SECONDARY_TIMER_GUIDES = {
  interPoint: {
    title: "Inter-point timer",
    steps: [
      { from: 45, text: 'Set offence on the line' },
      { from: 60, text: 'Signal offence ready' },
    ],
  },
  betweenPointsTimeout: {
    title: "Time-out (between points)",
    steps: [
      { from: 0, until: 75, text: 'Timeout' },
      { from: 75, text: "Extend inter-point window" },
      { from: 76, text: 'Inter-point' },
    ],
  },
  liveTimeout: {
    title: "Timeout (during a point)",
    steps: [
      { from: 0, until: 75, text: 'Timeout' },
      { from: 75, until: 90, text: 'Confirm offence ready' },
      { from: 90, text: 'Check disc in' },
    ],
  },
  discussion: {
    title: "Discussion",
    steps: [
      { from: 15, text: 'Involve captains' },
      { from: 45, text: 'Declare contested' },
    ],
  },
};

export default function ScoreKeeperView() {
  const navigate = useNavigate();
  const data = useScoreKeeperData();
  const actions = useScoreKeeperActions(data);
  const fiveVFiveData = useScoreKeeper5v5Data();
  const autoResumeSevenVSevenRef = useRef(null);
  const autoResumeFiveVFiveRef = useRef(null);
  const {
    consoleReady: fiveVFiveConsoleReady,
    resumeCandidate: fiveVFiveResumeCandidate,
    resumeHandled: fiveVFiveResumeHandled,
    resumeBusy: fiveVFiveResumeBusy,
    resumeError: fiveVFiveResumeError,
    activeMatch: fiveVFiveActiveMatch,
    handleResumeSession: handleFiveVFiveResumeSession,
    handleDiscardResume: handleFiveVFiveDiscardResume,
  } = fiveVFiveData;
  const fiveVFiveController = {
    ...fiveVFiveData,
    onInitialiseComplete: (match) => {
      const eventId =
        match?.event_id ||
        match?.event?.id ||
        fiveVFiveData.selectedEventId ||
        "";
      const matchId = match?.id || fiveVFiveData.selectedMatchId || "";
      if (fiveVFiveData.userId && matchId) {
        const now = Date.now();
        saveScorekeeperSession(fiveVFiveData.userId, {
          ruleset: "5v5",
          matchId,
          selectedMatchId: matchId,
          eventId,
          matchStarted: false,
          setupForm: { ...fiveVFiveData.setupForm },
          rules: { ...fiveVFiveData.rules },
          score: {
            a: match?.score_a ?? 0,
            b: match?.score_b ?? 0,
          },
          pendingEntries: [],
          timer: {
            seconds: (fiveVFiveData.rules.matchDuration || 0) * 60,
            running: false,
            label: "Game time",
            savedAt: now,
            totalSeconds: (fiveVFiveData.rules.matchDuration || 0) * 60,
          },
          secondaryTimer: {
            seconds: fiveVFiveData.rules.timeoutSeconds || 0,
            running: false,
            label: "Timeout",
            savedAt: now,
            totalSeconds: fiveVFiveData.rules.timeoutSeconds || 0,
          },
          timeoutUsage: { A: 0, B: 0 },
        });
      }
      const params = new URLSearchParams();
      params.set("mode", "5v5");
      if (eventId) params.set("eventId", eventId);
      if (matchId) params.set("matchId", matchId);
      navigate(`/score-keeper-5v5?${params.toString()}`);
    },
  };
  const fiveVFiveActions = useScoreKeeper5v5Actions(fiveVFiveController);

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
    secondarySeconds,
    secondaryRunning,
    secondaryLabel,
    secondaryTotalSeconds,
    secondaryTimerAnchorRef,
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
    halftimeBreakActive,
    halftimeTriggerType,
    halftimeTimeCapArmed,
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
    scoreTarget,
    softCapApplied,
    hardCapReached,
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
    handleDiscardResume,
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
  const halftimeStartLogged = logs.some(
    (entry) => entry.eventCode === MATCH_LOG_EVENT_CODES.HALFTIME_START
  );
  const halftimeEndLogged = logs.some(
    (entry) => entry.eventCode === MATCH_LOG_EVENT_CODES.HALFTIME_END
  );
  const halftimeButtonDisabled = halftimeStartLogged || halftimeEndLogged;
  const halftimeTypeLabel =
    halftimeTriggerType === "manual"
      ? "Manual"
      : halftimeTriggerType === "pointCap"
      ? "Point cap"
      : halftimeTriggerType === "timeCap"
        ? "Time cap"
        : "Unknown";
  const attentionBannerMessage = (() => {
    if (!matchStarted) return null;
    const softCapMode = rules.gameSoftCapMode || "none";
    if (halftimeTimeCapArmed && !halftimeStartLogged && !halftimeEndLogged) {
      return "Halftime time cap has been reached and will start HT after the point.";
    }
    if (hardCapReached) {
      return "Time cap reached, new match target set.";
    }
    if (
      softCapApplied &&
      softCapMode !== "none" &&
      Number.isFinite(scoreTarget)
    ) {
      return `Soft cap reached, new match target of ${scoreTarget}.`;
    }
    return null;
  })();
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
  const isAbbaEnabled = isMixedDivision && rules.mixedRatioRule !== "B";
  const spiritMatch = activeMatch || selectedMatch || null;
  const spiritEventId = spiritMatch?.event_id || spiritMatch?.event?.id || selectedEventId || "";
  const spiritScoresUrl = (() => {
    if (!spiritMatch?.id && !spiritEventId) {
      return "/spirit-scores";
    }
    const params = new URLSearchParams();
    if (spiritEventId) {
      params.set("eventId", spiritEventId);
    }
    if (spiritMatch?.id) {
      params.set("matchId", spiritMatch.id);
    }
    return `/spirit-scores?${params.toString()}`;
  })();
  const isStartMatchReady =
    Boolean(setupForm.startingTeamId) &&
    (!isAbbaEnabled || ["male", "female"].includes(setupForm.abbaPattern));
  const resumeCandidateCount = [resumeCandidate, fiveVFiveResumeCandidate].filter(Boolean).length;

  const handleFiveVFiveResumeAndOpenConsole = useCallback(async () => {
    const candidate = fiveVFiveResumeCandidate;
    const resumed = await handleFiveVFiveResumeSession();
    if (resumed === false) return;

    const eventId = candidate?.eventId || fiveVFiveData.selectedEventId || "";
    const matchId =
      candidate?.matchId ||
      candidate?.selectedMatchId ||
      fiveVFiveData.selectedMatchId ||
      "";
    const params = new URLSearchParams();
    params.set("mode", "5v5");
    if (eventId) params.set("eventId", eventId);
    if (matchId) params.set("matchId", matchId);
    navigate(`/score-keeper-5v5?${params.toString()}`);
  }, [
    fiveVFiveResumeCandidate,
    handleFiveVFiveResumeSession,
    fiveVFiveData.selectedEventId,
    fiveVFiveData.selectedMatchId,
    navigate,
  ]);

  // Defer automatic PWA reloads while a match is actively being scored.
  const scoringLive = matchStarted || fiveVFiveData.matchStarted;
  useEffect(() => {
    setLiveActivity("scorekeeper", scoringLive);
    return () => setLiveActivity("scorekeeper", false);
  }, [scoringLive]);

  useEffect(() => {
    if (
      consoleReady &&
      resumeCandidate &&
      !resumeHandled &&
      !resumeBusy &&
      (resumeCandidate.matchId === activeMatch?.id ||
        resumeCandidate.selectedMatchId === activeMatch?.id)
    ) {
      void handleResumeSession();
    }
  }, [
    consoleReady,
    resumeCandidate,
    resumeHandled,
    resumeBusy,
    activeMatch?.id,
    handleResumeSession,
  ]);

  useEffect(() => {
    const matchId = resumeCandidate?.matchId || resumeCandidate?.selectedMatchId || null;
    if (
      !matchId ||
      resumeCandidateCount !== 1 ||
      resumeHandled ||
      resumeBusy ||
      consoleReady ||
      autoResumeSevenVSevenRef.current === matchId
    ) {
      return;
    }

    autoResumeSevenVSevenRef.current = matchId;
    void handleResumeSession();
  }, [
    resumeCandidate,
    resumeCandidateCount,
    resumeHandled,
    resumeBusy,
    consoleReady,
    handleResumeSession,
  ]);

  useEffect(() => {
    if (
      fiveVFiveConsoleReady &&
      fiveVFiveResumeCandidate &&
      !fiveVFiveResumeHandled &&
      !fiveVFiveResumeBusy &&
      (fiveVFiveResumeCandidate.matchId === fiveVFiveActiveMatch?.id ||
        fiveVFiveResumeCandidate.selectedMatchId === fiveVFiveActiveMatch?.id)
    ) {
      void handleFiveVFiveResumeSession();
    }
  }, [
    fiveVFiveConsoleReady,
    fiveVFiveResumeCandidate,
    fiveVFiveResumeHandled,
    fiveVFiveResumeBusy,
    fiveVFiveActiveMatch?.id,
    handleFiveVFiveResumeSession,
  ]);

  useEffect(() => {
    const matchId =
      fiveVFiveResumeCandidate?.matchId ||
      fiveVFiveResumeCandidate?.selectedMatchId ||
      null;
    if (
      !matchId ||
      resumeCandidateCount !== 1 ||
      fiveVFiveResumeHandled ||
      fiveVFiveResumeBusy ||
      fiveVFiveConsoleReady ||
      autoResumeFiveVFiveRef.current === matchId
    ) {
      return;
    }

    autoResumeFiveVFiveRef.current = matchId;
    void handleFiveVFiveResumeAndOpenConsole();
  }, [
    fiveVFiveResumeCandidate,
    resumeCandidateCount,
    fiveVFiveResumeHandled,
    fiveVFiveResumeBusy,
    fiveVFiveConsoleReady,
    handleFiveVFiveResumeAndOpenConsole,
  ]);

  const dedupedLogs = useMemo(() => {
    const seen = new Set();
    return orderedLogs.filter((log) => {
      const key = log.optimisticId || log.id;
      if (key && seen.has(key)) return false;
      if (key) seen.add(key);
      return true;
    });
  }, [orderedLogs]);

  const logIndexById = useMemo(() => {
    const map = new Map();
    orderedLogs.forEach((entry, i) => {
      if (entry.id) map.set(entry.id, i);
    });
    return map;
  }, [orderedLogs]);

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
    handleForceEndHalftime,
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

  const rosterOptionsA = useMemo(() => {
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
    return sortPlayers(sortedRosters.teamA || [])
      .filter((player) => player?.id)
      .map((player) => ({
        id: player.id,
        name: player.name || "Unnamed player",
        jersey_number: player.jersey_number ?? null,
      }));
  }, [sortedRosters.teamA]);

  const rosterOptionsB = useMemo(() => {
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
    return sortPlayers(sortedRosters.teamB || [])
      .filter((player) => player?.id)
      .map((player) => ({
        id: player.id,
        name: player.name || "Unnamed player",
        jersey_number: player.jersey_number ?? null,
      }));
  }, [sortedRosters.teamB]);

  const getRosterOptionsForTeam = useCallback(
    (teamKey) => {
      if (teamKey === "A") return rosterOptionsA;
      if (teamKey === "B") return rosterOptionsB;
      return [];
    },
    [rosterOptionsA, rosterOptionsB]
  );

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
    const eventTeamKey = nextTeam;
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

  const openSimpleEventModal = useCallback((log, index) => {
    setSimpleEventEditState({
      open: true,
      logIndex: index,
      teamKey: log.team || "",
      eventLabel: log.eventDescription || "Match event",
      eventCode: log.eventCode || "",
    });
  }, []);

  const isBlockPossessionLog = (log) => {
    if (!log) return false;
    if (Number.isFinite(log.eventTypeId) && log.eventTypeId === BLOCK_EVENT_TYPE_ID) return true;
    const code = `${log.eventCode || ""}`.toLowerCase();
    if (code.includes("block")) return true;
    const desc = `${log.eventDescription || ""}`.toLowerCase();
    return desc.includes("block");
  };

  const openPossessionEditModal = useCallback((log, index) => {
    const isBlockLog = isBlockPossessionLog(log);
    const loggedTeam = log?.team || null;
    const nextTeam = isBlockLog ? loggedTeam : loggedTeam;
    setPendingPossessionTeam(nextTeam);
    setPossessionPreviewTeam(nextTeam);
    setPossessionResult(isBlockLog ? "block" : "throwaway");
    setPossessionActorId(log?.scorerId || "");
    setPossessionModalOpen(true);
    setPossessionEditIndex(index);
  }, []);

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
      <main className="py-2">
        {consoleReady ? (
          <section className="space-y-2">
            <div className="rounded-3xl border border-emerald-900/15 bg-white/90 p-1.5 w-full">
              <div className="flex items-center justify-between gap-2">
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
                <button
                  type="button"
                  onClick={() => setSetupModalOpen(true)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100"
                  aria-label="Open setup"
                  title="Setup"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
                    <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.03.03a2.16 2.16 0 0 1-3.05 3.05l-.03-.03a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.09 1.65V21a2.16 2.16 0 0 1-4.32 0v-.05a1.8 1.8 0 0 0-1.09-1.65 1.8 1.8 0 0 0-1.98.36l-.03.03a2.16 2.16 0 1 1-3.05-3.05l.03-.03A1.8 1.8 0 0 0 3.6 15a1.8 1.8 0 0 0-1.65-1.09H1.9a2.16 2.16 0 0 1 0-4.32h.05A1.8 1.8 0 0 0 3.6 8.5a1.8 1.8 0 0 0-.36-1.98l-.03-.03a2.16 2.16 0 1 1 3.05-3.05l.03.03a1.8 1.8 0 0 0 1.98.36h.01a1.8 1.8 0 0 0 1.08-1.65V2.16a2.16 2.16 0 0 1 4.32 0v.05a1.8 1.8 0 0 0 1.09 1.65 1.8 1.8 0 0 0 1.98-.36l.03-.03a2.16 2.16 0 1 1 3.05 3.05l-.03.03a1.8 1.8 0 0 0-.36 1.98v.01a1.8 1.8 0 0 0 1.65 1.08h.05a2.16 2.16 0 0 1 0 4.32h-.05A1.8 1.8 0 0 0 19.4 15Z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid gap-2 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <div className="space-y-2">

            <div className="space-y-2 rounded-2xl border border-slate-300 bg-white p-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0 rounded-xl border border-slate-200 bg-[#dff7e5] p-3 text-center text-slate-800 [container-type:inline-size]">
                  <p
                    className={`overflow-hidden whitespace-nowrap text-[min(5.5rem,32cqw)] font-semibold leading-none tabular-nums ${
                      primaryOvertime ? "text-[#b91c1c]" : "text-slate-900"
                    }`}
                  >
                    {primaryClockDisplay}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {timerLabel || "Game time"}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-[#dff7e5] p-3 text-center text-slate-800 [container-type:inline-size]">
                  <p className="overflow-hidden whitespace-nowrap text-[min(4.5rem,30cqw)] font-semibold leading-none text-slate-900 tabular-nums">
                    {formattedSecondaryClock}
                  </p>
                  <div className="mt-1 flex items-center justify-center text-slate-700">
                    <SecondaryTimerDescription
                      label={secondaryLabel}
                      running={secondaryRunning}
                      remainingSeconds={secondarySeconds}
                      totalSeconds={secondaryTotalSeconds}
                    />
                  </div>
                  <SecondaryTimerProgressBar
                    anchorRef={secondaryTimerAnchorRef}
                    totalSeconds={secondaryTotalSeconds}
                    running={secondaryRunning}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTimeModalOpen(true)}
                  disabled={!matchStarted}
                  className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                    matchStarted ? "bg-[#1e3a8a] text-white hover:bg-[#162e6a]" : "bg-slate-200 text-slate-600"
                  }`}
                  aria-label="Additional time options"
                  title="Additional time options"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M10 2h4" />
                    <path d="M12 14v-4" />
                    <path d="M15.5 4.5 17 3" />
                    <circle cx="12" cy="14" r="8" />
                  </svg>
                </button>
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
                  {secondaryRunning && secondaryLabel === "Discussion" ? "Stop discussion" : "Discussion"}
                </button>
              </div>
            </div>

            {attentionBannerMessage && (
              <p className="rounded-2xl border border-red-500 bg-red-200 px-3 py-2 text-sm font-bold text-red-900 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]">
                {attentionBannerMessage}
              </p>
            )}

            {matchStarted && (
              <div className="rounded-3xl border border-slate-200 bg-white p-2 w-full">
                <div className="mt-3 space-y-2">
                  <div
                    ref={possessionPadRef}
                    role="group"
                    aria-label="Select possession team"
                    className="relative flex w-full items-stretch rounded-2xl bg-[#b1b1b1] p-1 text-sm font-semibold"
                    style={{ touchAction: "pan-y" }}
                    onPointerDown={handlePossessionPadPointerDown}
                    onPointerMove={handlePossessionPadPointerMove}
                    onPointerUp={handlePossessionPadPointerUp}
                    onPointerLeave={handlePossessionPadPointerLeave}
                    onPointerCancel={handlePossessionPadPointerCancel}
                  >
                    {currentPossessionTeam && (
                      <div
                        className="pointer-events-none absolute inset-1 w-[calc(50%-2px)] rounded-xl bg-[#0f5132] transition-transform duration-300 ease-in-out"
                        style={{
                          transform: currentPossessionTeam === "B" ? "translateX(calc(100% + 4px))" : "translateX(0)",
                        }}
                        aria-hidden="true"
                      />
                    )}
                    <button
                      type="button"
                      className={`relative z-10 flex-1 rounded-2xl px-3 py-3 text-center transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${
                        currentPossessionTeam === "A" ? "text-white" : "text-slate-700"
                      }`}
                      aria-pressed={possessionTeam === "A"}
                      tabIndex={-1}
                    >
                      {displayTeamAShort}
                    </button>
                    <button
                      type="button"
                      className={`relative z-10 flex-1 rounded-2xl px-3 py-3 text-center transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${
                        currentPossessionTeam === "B" ? "text-white" : "text-slate-700"
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
              <div className="space-y-2">
                {!matchStarted ? (
                  <>
                    {!isStartMatchReady && (
                      <p
                        role="alert"
                        className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
                      >
                        Match needs to be initialised in Setup pannel
                      </p>
                    )}
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
                  </>
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
                        {nextAbbaDescriptor ? (
                          <div className="flex justify-center">
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0f5132] text-base font-extrabold text-white">
                              {nextAbbaDescriptor}
                            </span>
                          </div>
                        ) : null}
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
            </div>
          </div>

          <div className="space-y-2">
            <div className="space-y-2 rounded-3xl border border-[#0f5132]/40 bg-white p-1.5">
              {matchEventsError && (
                <p className="text-xs text-rose-600">{matchEventsError}</p>
              )}
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
                  dedupedLogs.map((log, i) => {
                    const chronologicalIndex = log.id !== undefined ? (logIndexById.get(log.id) ?? -1) : -1;
                    const editIndex = chronologicalIndex >= 0 ? chronologicalIndex : i;
                    return renderMatchEventCard(log, { chronologicalIndex, editIndex });
                  })
                )}
                <button
                  type="button"
                  onClick={() => setEndMatchModalOpen(true)}
                  disabled={!canEndMatch}
                  className="sc-button-danger block w-full rounded-full px-4 py-3 text-center text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  End match / Enter spirit scores
                </button>
                {pendingEntries.length > 0 && (
                  <PendingSyncPanel pendingEntries={pendingEntries} online={online} />
                )}
              </div>
            </div>
          </div>
        </div>

            <details className="group rounded-3xl border border-[#0f5132]/30 bg-white p-2 text-[#0f5132]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2 py-1 text-sm font-semibold marker:hidden">
                <span>Team rosters</span>
                <span className="text-lg leading-none transition group-open:rotate-180" aria-hidden="true">
                  v
                </span>
              </summary>
              <div className="mt-2 space-y-2">
                {rostersError && (
                  <p className="rounded-3xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {rostersError}
                  </p>
                )}
                <div className="grid gap-4 border-t border-[#0f5132]/20 pt-3 text-center md:grid-cols-2 md:gap-6">
                  <div className="mx-auto w-full max-w-sm space-y-2">
                    <h3 className="text-base font-semibold text-[#0f5132]">
                      {safeTeamAName} Players
                    </h3>
                    <div className="space-y-1.5 text-sm text-[#0f5132]">
                      {rostersLoading ? (
                        <p className="text-xs">Loading roster...</p>
                      ) : sortedRosters.teamA.length === 0 ? (
                        <p className="text-xs text-slate-500">No players assigned.</p>
                      ) : (
                        sortedRosters.teamA.map((player) => (
                          <p key={player.id} className="border-b border-[#0f5132]/10 pb-1 last:border-b-0">
                            {formatPlayerSelectLabel(player)}
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="mx-auto w-full max-w-sm space-y-2">
                    <h3 className="text-base font-semibold text-[#0f5132]">
                      {safeTeamBName} Players
                    </h3>
                    <div className="space-y-1.5 text-sm text-[#0f5132]">
                      {rostersLoading ? (
                        <p className="text-xs">Loading roster...</p>
                      ) : sortedRosters.teamB.length === 0 ? (
                        <p className="text-xs text-slate-500">No players assigned.</p>
                      ) : (
                        sortedRosters.teamB.map((player) => (
                          <p key={player.id} className="border-b border-[#0f5132]/10 pb-1 last:border-b-0">
                            {formatPlayerSelectLabel(player)}
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </details>

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
              {initialising ? "Initialising..." : "7v7 match setup"}
            </button>
            <Link
              to={spiritScoresUrl}
              className="inline-flex h-[var(--setup-button-size)] w-full items-center justify-center rounded-full border border-[#0f5132]/40 px-4 text-sm font-semibold text-[#0f5132] transition hover:bg-white"
            >
              Enter spirit scores
            </Link>
            <button
              type="button"
              onClick={() => fiveVFiveData.setSetupModalOpen(true)}
              disabled={fiveVFiveData.initialising}
              className="inline-flex h-[var(--setup-button-size)] w-full items-center justify-center rounded-full bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {fiveVFiveData.initialising ? "Initialising..." : "5v5 match setup"}
            </button>
            {consoleError && (
              <p className="text-sm text-rose-600">{consoleError}</p>
            )}
            <ResumeSessionSection
              candidate={resumeCandidate}
              handled={resumeHandled}
              busy={resumeBusy}
              error={resumeError}
              onResume={handleResumeSession}
              onDiscard={handleDiscardResume}
            />
            <ResumeSessionSection
              candidate={fiveVFiveResumeCandidate}
              handled={fiveVFiveResumeHandled}
              busy={fiveVFiveResumeBusy}
              error={fiveVFiveResumeError}
              onResume={handleFiveVFiveResumeAndOpenConsole}
              onDiscard={handleFiveVFiveDiscardResume}
            />
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
          title: "7v7 match setup",
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
          isAbbaEnabled,
          initialising,
          selectedMatch,
          isStartMatchReady,
          error: consoleError,
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
          halftimeBreakActive,
          halftimeDisabled: halftimeButtonDisabled,
          halftimeTypeLabel,
          onHalfTime: handleHalfTimeTrigger,
          onForceEndHalftime: handleForceEndHalftime,
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
      <ScorekeeperPopups
        setup={{
          open: fiveVFiveData.setupModalOpen,
          title: "5v5 match setup",
          onClose: () => fiveVFiveData.setSetupModalOpen(false),
          onSubmit: fiveVFiveActions.handleInitialiseMatch,
          events: fiveVFiveData.events,
          eventsLoading: fiveVFiveData.eventsLoading,
          eventsError: fiveVFiveData.eventsError,
          selectedEventId: fiveVFiveData.selectedEventId,
          onSelectEvent: fiveVFiveData.setSelectedEventId,
          onSelectMatch: fiveVFiveData.setSelectedMatchId,
          matches: fiveVFiveData.matches,
          matchesLoading: fiveVFiveData.matchesLoading,
          matchesError: fiveVFiveData.matchesError,
          selectedMatchId: fiveVFiveData.selectedMatchId,
          onRefreshMatches: fiveVFiveData.loadMatches,
          rules: fiveVFiveData.rules,
          setRules: fiveVFiveData.setRules,
          setupForm: fiveVFiveData.setupForm,
          setSetupForm: fiveVFiveData.setSetupForm,
          teamAId: fiveVFiveData.teamAId,
          teamBId: fiveVFiveData.teamBId,
          displayTeamA: fiveVFiveData.displayTeamA,
          displayTeamB: fiveVFiveData.displayTeamB,
          isAbbaEnabled:
            (fiveVFiveData.rules.division || "").toLowerCase() === "mixed" &&
            fiveVFiveData.rules.mixedRatioRule !== "B",
          initialising: fiveVFiveData.initialising,
          selectedMatch: fiveVFiveData.selectedMatch,
          isStartMatchReady:
            Boolean(fiveVFiveData.setupForm.startingTeamId) &&
            (
              (fiveVFiveData.rules.division || "").toLowerCase() !== "mixed" ||
              fiveVFiveData.rules.mixedRatioRule === "B" ||
              ["male", "female"].includes(fiveVFiveData.setupForm.abbaPattern)
            ),
          error: fiveVFiveData.consoleError,
        }}
      />
    </ScorekeeperShell>
  );
}

function getSecondaryTimerGuide(label) {
  const normalized = `${label || ""}`.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("discussion")) return SECONDARY_TIMER_GUIDES.discussion;
  if (normalized === "inter point") return SECONDARY_TIMER_GUIDES.interPoint;
  if (
    normalized.includes("inter point timeout") ||
    normalized.includes("pre-pull timeout")
  ) {
    return SECONDARY_TIMER_GUIDES.betweenPointsTimeout;
  }
  if (normalized.includes("timeout")) return SECONDARY_TIMER_GUIDES.liveTimeout;
  return null;
}

function getCurrentSecondaryTimerStep(guide, elapsedSeconds) {
  if (!guide || !Number.isFinite(elapsedSeconds)) return null;
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));
  return guide.steps.reduce((activeStep, step) => {
    if (elapsed < step.from) return activeStep;
    if (step.until !== undefined && elapsed >= step.until) return activeStep;
    return step;
  }, null);
}

function PendingSyncPanel({ pendingEntries, online }) {
  const [expanded, setExpanded] = useState(false);
  const count = pendingEntries.length;
  const eventCodeCounts = pendingEntries.reduce((acc, entry) => {
    const code = entry?.payload?.eventCode || entry?.eventCode || "event";
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(eventCodeCounts)
    .map(([code, n]) => `${n} ${code.toLowerCase().replace(/_/g, " ")}`)
    .join(", ");

  return (
    <div className="rounded-2xl border border-[#0f5132]/30 bg-white/90 p-2 text-sm text-[#0f5132]">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-base font-semibold text-[#0f5132]">
          Pending sync ({count})
        </h4>
        <span className="rounded-full border border-[#0f5132]/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0f5132]">
          {online ? "Online" : "Offline"}
        </span>
      </div>
      <p className="mt-1 text-xs text-[#0f5132]/80">
        {summary || `${count} event${count !== 1 ? "s" : ""}`} queued — will send automatically when online.
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 text-[11px] font-semibold text-[#0f5132] underline underline-offset-2 transition hover:text-[#083b24]"
      >
        {expanded ? "Hide details" : "Show details"}
      </button>
      {expanded && (
        <pre className="mt-2 max-h-48 overflow-y-auto rounded-xl bg-[#ecfdf3] p-3 text-xs text-[#0f5132]">
          {JSON.stringify(pendingEntries, null, 2)}
        </pre>
      )}
    </div>
  );
}

function SecondaryTimerProgressBar({ anchorRef, totalSeconds, running }) {
  const [pct, setPct] = useState(1);
  const [remainingEst, setRemainingEst] = useState(totalSeconds);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!running || !totalSeconds || totalSeconds <= 0) return;
    const tick = () => {
      const anchor = anchorRef?.current;
      if (anchor?.anchorTimestamp) {
        const elapsedMs = Date.now() - anchor.anchorTimestamp;
        const elapsedSec = elapsedMs / 1000;
        const remaining = Math.max(0, (anchor.baseSeconds ?? totalSeconds) - elapsedSec);
        setPct(Math.max(0, Math.min(1, remaining / totalSeconds)));
        setRemainingEst(remaining);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, totalSeconds, anchorRef]);

  if (!running || !totalSeconds || totalSeconds <= 0) return null;

  const isUrgent = remainingEst <= 15;
  const isWarning = !isUrgent && remainingEst <= 30;
  const barColor = isUrgent ? "bg-[#ef4444]" : isWarning ? "bg-[#f59e0b]" : "bg-[#16a34a]";

  return (
    <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-300 ring-2 ring-slate-500">
      <div
        className={`h-full rounded-full ${barColor}`}
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  );
}

function SecondaryTimerDescription({ label, running, remainingSeconds, totalSeconds }) {
  const guide = running ? getSecondaryTimerGuide(label) : null;
  const elapsedSeconds =
    Number.isFinite(totalSeconds) && Number.isFinite(remainingSeconds)
      ? totalSeconds - remainingSeconds
      : null;
  const activeStep = guide ? getCurrentSecondaryTimerStep(guide, elapsedSeconds) : null;
  if (!guide) {
    return (
      <span className="text-xs font-semibold uppercase tracking-wide">
        {label || "Inter point"}
      </span>
    );
  }

  return (
    <div className="w-full text-center text-[10px] font-semibold leading-tight">
      <p className="text-center text-slate-900">{guide.title}</p>
      {activeStep && <p>{activeStep.text}</p>}
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
