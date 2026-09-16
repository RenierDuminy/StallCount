import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import { isInitialisedStatus } from "../../constants/statusCodes";
import { setLiveActivity } from "../../services/liveActivity";
import { formatClock } from "./scorekeeperUtils";
import { useScoreKeeperData } from "./modularScoreKeeperData";
import { useScoreKeeperActions } from "./modularScoreKeeperActions";
import { ScorekeeperPopups } from "./ModularScorekeeperPopup";
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
  PHASE_TONES,
  SECONDARY_TIMER_KINDS,
  getActiveSecondaryTimerPhase,
  getSecondaryTimerTitle,
} from "./secondaryTimerPhases";
import {
  CALAHAN_ASSIST_VALUE,
  DEFAULT_DISCUSSION_SECONDS,
  SCORE_NA_PLAYER_VALUE,
  MODULAR_SCOREKEEPER_MENU_PATH,
} from "./scorekeeperConstants";

export default function ModularScoreKeeperView({ format: formatKey }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // `?setup=1` (how the landing page links in) opens match setup immediately, so
  // arriving at the console does not first require a click on a screen whose only
  // real action is "open setup".
  const autoOpenSetup = searchParams.get("setup") === "1";
  // One controller. The format comes from the route (`?mode=`), so the console
  // never mounts a second hook pair for the format it is not running — which is
  // what let the legacy consoles clobber each other's session and fetch
  // everything twice.
  const data = useScoreKeeperData(formatKey);
  const actions = useScoreKeeperActions(data);
  const { format, capabilities } = data;
  const autoResumeRef = useRef(null);

  // `mode` selects the format for this whole page and must survive every
  // search-param change here — replacing the params wholesale (as the legacy
  // single-format console safely did) drops `mode`, and the page falls back to
  // the menu mid-session. Always carry it forward explicitly.
  const goToConsole = useCallback(() => {
    setSearchParams({ mode: formatKey });
  }, [setSearchParams, formatKey]);

  const [settingsSavedAt, setSettingsSavedAt] = useState(null);


  // Resuming is async (match -> rosters -> logs) and `consoleReady` stays false the
  // whole time, which would otherwise flash the chooser on the way to the console.
  // On failure `resumeBusy` clears and the chooser returns with the error shown.
  const consoleOpening = data.resumeBusy;

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
    score,
    logs,
    logsLoading,
    matchEventsError,
    pendingEntries,
    timerSeconds,
    timerRunning,
    secondaryRunning,
    secondaryLabel,
    secondaryKind,
    secondaryElapsedSeconds,
    secondaryTone,
    secondaryTotalSeconds,
    secondaryTimerAnchorRef,
    primaryTimerBg,
    secondaryTimerBg,
    timerLabel,
    consoleError,
    rostersLoading,
    rostersError,
    timeModalOpen,
    setTimeModalOpen,
    setupModalOpen,
    setSetupModalOpen,
    scoreModalState,
    scoreForm,
    setScoreForm,
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
    secondaryResetTriggeredRef,
    commitSecondaryTimerState,
    setSecondaryTotalSeconds,
    setSecondaryLabel,
    setSecondaryKind,
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
  // Surfaces how the current score sits against the (possibly cap-adjusted) target, which
  // otherwise only ever appeared in the timer label.
  const scoreTargetBannerMessage = (() => {
    if (!matchStarted) return null;
    if (!Number.isFinite(scoreTarget) || scoreTarget <= 0) return null;

    const reachedA = score.a >= scoreTarget;
    const reachedB = score.b >= scoreTarget;
    if (reachedA || reachedB) {
      const winner = reachedA && score.a >= score.b ? safeTeamAName : safeTeamBName;
      return `${winner} reached match target`;
    }

    const matchPointA = score.a === scoreTarget - 1;
    const matchPointB = score.b === scoreTarget - 1;
    if (matchPointA && matchPointB) {
      return `Target ${scoreTarget}: UNIVERSE POINT!!!`;
    }
    if (matchPointA || matchPointB) {
      return `Target ${scoreTarget}: ${matchPointA ? safeTeamAName : safeTeamBName} match point`;
    }
    return null;
  })();
  const attentionBannerMessage = (() => {
    if (!matchStarted) return null;
    const softCapMode = rules.gameSoftCapMode || "none";
    if (halftimeTimeCapArmed && !halftimeStartLogged && !halftimeEndLogged) {
      return "Halftime time cap has been reached and will start HT after the point.";
    }
    if (hardCapReached) {
      return "Hard cap reached!";
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
  // Readiness is a property of the *match*, not of the setup form. The form is
  // rebuilt from the saved row whenever the active match changes, and that
  // round-trip is lossy — `abba_pattern` is stored as "none" whenever ABBA is
  // off (rule B, or mixedRatio disabled), which reads back as an empty field
  // and made a correctly-initialised match report "needs to be initialised".
  const isMatchInitialised = isInitialisedStatus(activeMatch?.status);
  // The setup form still gates the *setup modal's* own submit button, where the
  // fields being filled in is exactly the right question to ask.
  const isSetupFormComplete =
    Boolean(setupForm.startingTeamId) &&
    (!isAbbaEnabled || ["male", "female"].includes(setupForm.abbaPattern));
  const isStartMatchReady = isMatchInitialised;
  const resumeCandidateCount = resumeCandidate ? 1 : 0;


  // Defer automatic PWA reloads while a match is actively being scored.
  const scoringLive = matchStarted;
  const liveActivityKey = format.liveActivityKey;
  useEffect(() => {
    setLiveActivity(liveActivityKey, scoringLive);
    return () => setLiveActivity(liveActivityKey, false);
  }, [liveActivityKey, scoringLive]);

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
      autoResumeRef.current === matchId
    ) {
      return;
    }

    autoResumeRef.current = matchId;
    void handleResumeSession();
  }, [
    resumeCandidate,
    resumeCandidateCount,
    resumeHandled,
    resumeBusy,
    consoleReady,
    handleResumeSession,
  ]);

  // Open match setup on arrival when the landing page asked for it, then strip
  // `setup=1` so a later back/refresh does not reopen a modal the operator has
  // already dismissed. Fires once: `autoSetupRef` guards against the param
  // surviving a render, and the resume checks stop it stealing focus from a
  // restored session (the landing page only sends the flag when there is
  // nothing to resume, but the two must not race if that ever changes).
  const autoSetupRef = useRef(false);
  useEffect(() => {
    if (!autoOpenSetup || autoSetupRef.current) return;
    autoSetupRef.current = true;
    if (!consoleReady && !resumeCandidate && !resumeBusy) {
      setSetupModalOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("setup");
    setSearchParams(next, { replace: true });
  }, [
    autoOpenSetup,
    consoleReady,
    resumeCandidate,
    resumeBusy,
    searchParams,
    setSearchParams,
    setSetupModalOpen,
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

  // Positions in the chronological `logs` array (the list renders newest-first),
  // used only for the ABBA descriptor fallback.
  const chronologicalIndexById = useMemo(() => {
    const map = new Map();
    logs.forEach((entry, i) => {
      if (!entry) return;
      if (entry.id !== undefined && entry.id !== null) map.set(entry.id, i);
    });
    return map;
  }, [logs]);

  const renderMatchEventCard = (log, options) => {
    const { chronologicalIndex, logRef } = options;
    const normalizedEventCode = `${log.eventCode || ""}`.toLowerCase();
    const normalizedEventDescription = `${log.eventDescription || ""}`.toLowerCase();
    const isBlockLog =
      normalizedEventCode === MATCH_LOG_EVENT_CODES.BLOCK ||
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
        logRef={logRef}
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
    cancelSecondaryHoldReset,
    startSecondaryHoldReset,
    handleInitialiseMatch,
    handleToggleTimer,
    handleStartMatch,
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
  } = actions;

  const POSSESSION_DRAG_THRESHOLD = 24;
  const [simpleEventEditState, setSimpleEventEditState] = useState({
    open: false,
    logRef: null,
    teamKey: "",
    eventLabel: "",
    eventCode: "",
  });
  const possessionPadRef = useRef(null);
  const possessionPointerIdRef = useRef(null);
  const possessionDragStateRef = useRef({ startX: null, moved: false });
  const possessionConfirmTimeoutRef = useRef(null);
  const [, setPossessionEventReady] = useState(false);
  const [possessionResult, setPossessionResult] = useState("throwaway"); // "throwaway" | "block"
  const [possessionActorId, setPossessionActorId] = useState("");
  const [possessionModalOpen, setPossessionModalOpen] = useState(false);
  const [pendingPossessionTeam, setPendingPossessionTeam] = useState(null);
  const [possessionPreviewTeam, setPossessionPreviewTeam] = useState(null);
  const [possessionEditRef, setPossessionEditRef] = useState(null);
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
    setPossessionEditRef(null);
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
    // Stamp the log with the acting player's own team: the defender who got the D
    // on a block, the thrower who turfed it on a throwaway.
    const eventTeamKey = isBlock ? nextTeam : blockTeam;
    const editingRef = possessionEditRef;
    resetPossessionModalState();
    if (editingRef !== null) {
      // Editing only ever changes the player. The team an event belongs to is not
      // editable — re-deriving it here from the modal's current result flipped an
      // unchanged throwaway to the other side on every save. To move an event to
      // the other team the operator deletes it and logs the correct one.
      void handleUpdateLog(editingRef, { scorerId: actorId || null });
      return;
    }

    void updatePossession(nextTeam, {
      actorId: actorId || null,
      // Resolved by code like every other event type, so the console does not
      // carry a raw `match_events` primary key.
      eventCodeOverride: isBlock ? MATCH_LOG_EVENT_CODES.BLOCK : null,
      eventTeamKey,
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

  const openSimpleEventModal = useCallback((log, ref) => {
    setSimpleEventEditState({
      open: true,
      logRef: ref,
      teamKey: log.team || "",
      eventLabel: log.eventDescription || "Match event",
      eventCode: log.eventCode || "",
    });
  }, []);

  const isBlockPossessionLog = (log) => {
    if (!log) return false;
    const code = `${log.eventCode || ""}`.toLowerCase();
    if (code === MATCH_LOG_EVENT_CODES.BLOCK || code.includes("block")) return true;
    const desc = `${log.eventDescription || ""}`.toLowerCase();
    return desc.includes("block");
  };

  const openPossessionEditModal = useCallback((log, ref) => {
    const isBlockLog = isBlockPossessionLog(log);
    // The event is shown against the team it was logged against, for both block
    // and throwaway. Editing changes the player only, never the team.
    const loggedTeam = log?.team || null;
    setPendingPossessionTeam(loggedTeam);
    setPossessionPreviewTeam(loggedTeam);
    setPossessionResult(isBlockLog ? "block" : "throwaway");
    setPossessionActorId(log?.scorerId || "");
    setPossessionModalOpen(true);
    setPossessionEditRef(ref);
  }, []);

  const closeSimpleEventModal = () => {
    setSimpleEventEditState({
      open: false,
      logRef: null,
      teamKey: "",
      eventLabel: "",
      eventCode: "",
    });
  };

  const handleSimpleEventSubmit = async (event) => {
    event.preventDefault();
    if (simpleEventEditState.logRef === null) return;
    await handleUpdateLog(simpleEventEditState.logRef, {
      teamKey: simpleEventEditState.teamKey || null,
    });
    closeSimpleEventModal();
  };

  const handleSimpleEventDelete = async () => {
    if (simpleEventEditState.logRef === null) return;
    await handleDeleteLog(simpleEventEditState.logRef);
    closeSimpleEventModal();
  };

  const openPossessionDeleteModal = () => {
    if (possessionEditRef === null) return;
    setPossessionDeleteModalOpen(true);
  };

  const closePossessionDeleteModal = () => {
    setPossessionDeleteModalOpen(false);
  };

  const handlePossessionDelete = async () => {
    if (possessionEditRef === null) return;
    await handleDeleteLog(possessionEditRef);
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

  const discussionRunning =
    secondaryRunning && secondaryKind === SECONDARY_TIMER_KINDS.DISCUSSION;

  const handleStartDiscussionTimer = () => {
    cancelSecondaryHoldReset();
    if (secondaryResetTriggeredRef?.current) {
      secondaryResetTriggeredRef.current = false;
      return;
    }
    // Toggling off a running discussion is decided by the timer's kind, not by
    // comparing its label text.
    if (discussionRunning) {
      commitSecondaryTimerState(0, false);
      setSecondaryTotalSeconds(0);
      setSecondaryLabel("Discussion");
      setSecondaryKind(SECONDARY_TIMER_KINDS.DISCUSSION);
      setSecondaryFlashActive(false);
      setSecondaryFlashPulse(false);
      return;
    }
    const duration = rules.discussionSeconds || DEFAULT_DISCUSSION_SECONDS;
    commitSecondaryTimerState(duration, true);
    setSecondaryTotalSeconds(duration);
    setSecondaryLabel("Discussion");
    setSecondaryKind(SECONDARY_TIMER_KINDS.DISCUSSION);
    setSecondaryFlashActive(false);
    setSecondaryFlashPulse(false);
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

            <div className="space-y-2 rounded-2xl border border-slate-300 bg-white p-1.5">
              <div className="grid grid-cols-2 gap-2">
                <div
                  className={`min-w-0 rounded-xl border border-slate-200 p-1.5 text-center text-slate-800 transition-colors [container-type:inline-size] ${primaryTimerBg}`}
                >
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
                <div
                  className={`min-w-0 rounded-xl border border-slate-200 p-1.5 text-center text-slate-800 transition-colors [container-type:inline-size] ${secondaryTimerBg}`}
                >
                  <p className="overflow-hidden whitespace-nowrap text-[min(4.5rem,30cqw)] font-semibold leading-none text-slate-900 tabular-nums">
                    {formattedSecondaryClock}
                  </p>
                  <div className="mt-1 flex items-center justify-center text-slate-700">
                    <SecondaryTimerDescription
                      kind={secondaryKind}
                      label={secondaryLabel}
                      rules={rules}
                      running={secondaryRunning}
                      elapsedSeconds={secondaryElapsedSeconds}
                    />
                  </div>
                  <SecondaryTimerProgressBar
                    anchorRef={secondaryTimerAnchorRef}
                    totalSeconds={secondaryTotalSeconds}
                    running={secondaryRunning}
                    tone={secondaryTone}
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
                  {discussionRunning ? "Stop discussion" : "Discussion"}
                </button>
              </div>
            </div>

            {attentionBannerMessage && (
              <p className="rounded-2xl border border-red-500 bg-red-200 px-3 py-2 text-sm font-bold text-red-900 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]">
                {attentionBannerMessage}
              </p>
            )}

            {scoreTargetBannerMessage && (
              <p className="rounded-2xl border border-[#0f5132] bg-[#d1fae5] px-3 py-2 text-sm font-bold text-[#0f5132] shadow-[0_0_0_1px_rgba(15,81,50,0.15)]">
                {scoreTargetBannerMessage}
              </p>
            )}

            {/* Possession pad, turnover and block. Formats that do not track
                possession hide the whole group — the state behind it stays
                mounted (halftime still flips possession internally, without
                logging a turnover), so only the operator surface disappears. */}
            {matchStarted && capabilities.possession && (
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
                        Match needs to be initialised in the Setup panel
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
                  dedupedLogs.map((log) => {
                    const chronologicalIndex = chronologicalIndexById.get(log.id) ?? -1;
                    const logRef = log.id ?? log.optimisticId ?? null;
                    return renderMatchEventCard(log, { chronologicalIndex, logRef });
                  })
                )}
                <button
                  type="button"
                  onClick={() => setEndMatchModalOpen(true)}
                  disabled={!canEndMatch}
                  className="sc-button-danger block w-full rounded-full px-4 py-3 text-center text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {capabilities.spiritScores
                    ? "End match and proceed to spirit scores"
                    : "End match"}
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
        ) : consoleOpening ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm font-semibold text-[#0f5132]">Opening console...</p>
            <p className="mt-1 text-xs text-slate-500">Loading the match, rosters and log.</p>
          </section>
        ) : (
          /* The menu is the landing page now. Reaching the console without a
             match means setup is open over this, or the operator dismissed it —
             so this is a backdrop with one way back, not a second menu. */
          <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm font-semibold text-[#0f5132]">
              {initialising ? "Initialising..." : "No match set up yet"}
            </p>
            {consoleError ? (
              <p className="text-sm text-rose-600">{consoleError}</p>
            ) : (
              <p className="text-xs text-slate-500">
                {format.name} — {format.tagline.toLowerCase()}.
              </p>
            )}
            <button
              type="button"
              onClick={() => setSetupModalOpen(true)}
              disabled={initialising}
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              Match setup
            </button>
            <Link
              to={MODULAR_SCOREKEEPER_MENU_PATH}
              className="inline-flex h-12 w-full items-center justify-center rounded-full border border-[#0f5132]/40 px-4 text-sm font-semibold text-[#0f5132] transition hover:bg-[#ecfdf3]"
            >
              Back to score keeper menu
            </Link>
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
          title: format.setupModalTitle,
          format: format.key,
          onClose: () => setSetupModalOpen(false),
          // The menu is the landing page now, so "back" is a navigation, not a
          // search-param flip onto a second in-page menu.
          onBack: () => {
            setSetupModalOpen(false);
            navigate(MODULAR_SCOREKEEPER_MENU_PATH);
          },
          onSubmit: async (event) => {
            // Persist the rules for this match first so initialise runs against saved settings.
            if (actions.handleSaveSettings()) {
              setSettingsSavedAt(Date.now());
            }
            await handleInitialiseMatch(event);
            // Setup succeeded -> normalise the URL so the console shows.
            goToConsole();
          },
          onResetSettings: () => {
            actions.handleResetSettings();
            setSettingsSavedAt(null);
          },
          settingsSavedAt,
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
          // Flags the edit so event defaults can't quietly reclaim it
          // mid-session, and applies the format's rule couplings — the modal
          // edits fields directly rather than going through handleRuleChange.
          setRules: actions.setRulesWithCouplings,
          setupForm,
          setSetupForm,
          teamAId,
          teamBId,
          displayTeamA,
          displayTeamB,
          isAbbaEnabled,
          initialising,
          selectedMatch,
          // The setup modal gates its own submit on the form being filled in,
          // not on the match already being initialised.
          isStartMatchReady: isSetupFormComplete,
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
          // A format without block tracking gets the incompletion-only form
          // rather than an option that logs an event it does not support.
          allowBlock: capabilities.block,
          activeActorOptions,
          actorId: possessionActorId,
          onActorSelect: handlePossessionActorSelect,
          renderPlayerGridLabel,
          editRef: possessionEditRef,
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
          spiritScores: capabilities.spiritScores,
        }}
        time={{
          open: timeModalOpen,
          onClose: () => setTimeModalOpen(false),
          stoppageActive,
          halftimeBreakActive,
          halftimeDisabled: halftimeButtonDisabled,
          halftimeTypeLabel,
          // A manually-started break never closes on its own, so the operator has
          // to be told they must come back and force-end it.
          halftimeManualClosureRequired: halftimeTriggerType === "manual",
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
    </ScorekeeperShell>
  );
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

function SecondaryTimerProgressBar({ anchorRef, totalSeconds, running, tone }) {
  const [pct, setPct] = useState(1);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!running || !totalSeconds || totalSeconds <= 0) return undefined;
    const tick = () => {
      const anchor = anchorRef?.current;
      if (anchor?.anchorTimestamp) {
        const elapsedSec = (Date.now() - anchor.anchorTimestamp) / 1000;
        const remaining = Math.max(0, (anchor.baseSeconds ?? totalSeconds) - elapsedSec);
        setPct(Math.max(0, Math.min(1, remaining / totalSeconds)));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, totalSeconds, anchorRef]);

  if (!running || !totalSeconds || totalSeconds <= 0) return null;

  // Same tone the panel background reads, so the bar and the panel escalate
  // together instead of each applying its own second thresholds.
  const barColor =
    tone === PHASE_TONES.URGENT
      ? "bg-[#ef4444]"
      : tone === PHASE_TONES.WARNING
        ? "bg-[#f59e0b]"
        : "bg-[#16a34a]";

  return (
    <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-300 ring-2 ring-slate-500">
      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

function SecondaryTimerDescription({ kind, label, rules, running, elapsedSeconds }) {
  const title = running ? getSecondaryTimerTitle(kind) : null;
  const activePhase = running ? getActiveSecondaryTimerPhase(kind, rules, elapsedSeconds) : null;

  // A kind with no configured phases (or an idle timer) falls back to the plain
  // label, which is all there is to say about it.
  if (!title) {
    return (
      <span className="text-xs font-semibold uppercase tracking-wide">
        {label || "Inter point"}
      </span>
    );
  }

  return (
    <div className="w-full text-center text-[10px] font-semibold leading-tight">
      <p className="text-center text-slate-900">{title}</p>
      {activePhase && <p>{activePhase.text}</p>}
    </div>
  );
}
