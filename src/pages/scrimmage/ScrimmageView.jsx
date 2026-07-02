import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import { formatClock } from "./scrimmageUtils";
import { useScrimmageData } from "./useScrimmageData";
import { useScrimmageActions } from "./useScrimmageActions";
import { deriveScrimmageReport } from "./scrimmageReport";
import { downloadScrimmageReportPdf } from "./scrimmagePdfReport";
import { downloadScrimmageReportCsv } from "./scrimmageCsvReport";
import { ScorekeeperShell } from "../../components/ui/scorekeeperPrimitives";
import { setLiveActivity } from "../../services/liveActivity";
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
  SCORE_NA_PLAYER_VALUE,
} from "./scrimmageConstants";
import {
  getRuleAbbaPattern,
  getRuleDiscussionSeconds,
  getRuleHalftimeBreakMinutes,
  getRuleHalftimeCapMinutes,
  getRuleMatchDurationMinutes,
  getRuleTimeoutSeconds,
  getRuleTimeoutsPerHalf,
  getRuleTimeoutsTotal,
  setRuleAbbaPattern,
  setRuleHalftimeBreakMinutes,
  setRuleHalftimeCapMinutes,
  setRuleMatchDurationMinutes,
  setRuleTimeoutSeconds,
  setRuleTimeoutsPerHalf,
  setRuleTimeoutsTotal,
} from "./scrimmageRules";

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
    secondaryTimerAnchorRef,
    secondaryTotalSeconds,
    softCapApplied,
    hardCapReached,
    scoreTarget,
    secondaryResetTriggeredRef,
    commitSecondaryTimerState,
    finalizeSecondaryTimerEvent,
    setSecondaryTotalSeconds,
    setSecondaryLabel,
    setSecondaryFlashActive,
    setSecondaryFlashPulse,
    updatePossession,
    handleDiscardResume
  } = data;

  // Defer automatic PWA reloads while a scrimmage is actively being scored.
  useEffect(() => {
    setLiveActivity("scrimmage", matchStarted);
    return () => setLiveActivity("scrimmage", false);
  }, [matchStarted]);

  const safeTeamAName = displayTeamA || "Team A";
  const safeTeamBName = displayTeamB || "Team B";
  const attentionBannerMessage = (() => {
    if (!matchStarted) return null;
    const softCapMode = rules.game?.softCapMode || "none";
    if (hardCapReached) return "Time cap reached, new match target set.";
    if (softCapApplied && softCapMode !== "none" && Number.isFinite(scoreTarget)) {
      return `Soft cap reached, new match target of ${scoreTarget}.`;
    }
    return null;
  })();
  const discussionSeconds = getRuleDiscussionSeconds(rules);
  const timeoutSeconds = getRuleTimeoutSeconds(rules);
  const matchDurationMinutes = getRuleMatchDurationMinutes(rules);
  const halftimeCapMinutes = getRuleHalftimeCapMinutes(rules);
  const halftimeBreakMinutes = getRuleHalftimeBreakMinutes(rules);
  const timeoutsTotal = getRuleTimeoutsTotal(rules);
  const timeoutsPerHalf = getRuleTimeoutsPerHalf(rules);
  const abbaPattern = getRuleAbbaPattern(rules);
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
  const [rosterUpload, setRosterUpload] = useState({
    A: { text: "", error: "", notice: "" },
    B: { text: "", error: "", notice: "" },
  });
  const rosterUploadFileRefs = useRef({ A: null, B: null });

  // Parse pasted/uploaded roster text.
  // Line 1 = team name (informational only — scrimmage teams are fixed Light/Dark).
  // Each subsequent non-empty line = one player, with an optional leading jersey
  // number (max 3 digits) followed by the player name.
  const parseRosterUpload = (rawText) => {
    const lines = `${rawText ?? ""}`.replace(/\r\n?/g, "\n").split("\n");
    let teamName = null;
    const players = [];
    let started = false;
    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!started) {
        // Skip leading blank lines, then treat the first content line as the team name.
        if (!line) return;
        teamName = line;
        started = true;
        return;
      }
      if (!line) return;
      const match = line.match(/^(\d{1,3})\s+(.+)$/);
      if (match) {
        players.push({ jersey: Number(match[1]), name: match[2].trim() });
      } else {
        players.push({ jersey: undefined, name: line });
      }
    });
    return { teamName, players };
  };

  const applyRosterUpload = (teamKey) => {
    const text = rosterUpload[teamKey]?.text || "";
    const { teamName, players } = parseRosterUpload(text);
    if (players.length === 0) {
      setRosterUpload((prev) => ({
        ...prev,
        [teamKey]: {
          ...prev[teamKey],
          error: "Add a team name on line 1 and at least one player on the lines below.",
          notice: "",
        },
      }));
      return;
    }

    const teamProp = teamKey === "B" ? "teamB" : "teamA";
    setRosters((prev) => {
      const existing = prev?.[teamProp] || [];
      const appended = players.map((player) => ({
        id: createRosterPlayerId(),
        name: player.name,
        jersey_number: player.jersey,
      }));
      return {
        ...prev,
        [teamProp]: [...existing, ...appended],
      };
    });

    setRosterUpload((prev) => ({
      ...prev,
      [teamKey]: {
        text: "",
        error: "",
        notice: `Added ${players.length} player${players.length === 1 ? "" : "s"}${
          teamName ? ` from "${teamName}"` : ""
        }.`,
      },
    }));
  };

  const handleRosterUploadFile = (teamKey, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRosterUpload((prev) => ({
        ...prev,
        [teamKey]: { text: `${reader.result ?? ""}`, error: "", notice: "" },
      }));
    };
    reader.onerror = () => {
      setRosterUpload((prev) => ({
        ...prev,
        [teamKey]: { ...prev[teamKey], error: "Could not read that file." },
      }));
    };
    reader.readAsText(file);
  };

  const createRosterPlayerId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `player-${crypto.randomUUID()}`;
    }
    return `player-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  };

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
    setRosterUpload({
      A: { text: "", error: "", notice: "" },
      B: { text: "", error: "", notice: "" },
    });
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
          A: 0,
          both: 1,
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
    logMatchStartEvent
  } = actions;

  const POSSESSION_DRAG_THRESHOLD = 24;
  const [endScrimmageModalOpen, setEndScrimmageModalOpen] = useState(false);
  const [endScrimmageConfirmed, setEndScrimmageConfirmed] = useState(false);
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
    finalizeSecondaryTimerEvent();
    const duration = discussionSeconds;
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
  const handleDownloadPdf = () => {
    downloadScrimmageReportPdf({
      report: scrimmageReport,
      teamAName: safeTeamAName,
      teamBName: safeTeamBName,
      score,
      startTime: setupForm.startTime,
    });
  };

  const handleDownloadCsv = () => {
    downloadScrimmageReportCsv({
      logs,
      teamAName: safeTeamAName,
      teamBName: safeTeamBName,
    });
  };

  const handleOpenMatchReport = () => {
    setEndScrimmageConfirmed(false);
    setEndScrimmageModalOpen(false);
    setMatchReportOpen(true);
  };

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

  return (
    <ScorekeeperShell>
      <main className="py-2">
        {consoleReady ? (
          <section className="space-y-2">

            {/* Match header */}
            <div className="rounded-3xl border border-emerald-900/15 bg-white/90 p-1.5 w-full">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-slate-900">
                    <span>{safeTeamAName}</span>
                    <span className="text-base text-slate-400">vs</span>
                    <span>{safeTeamBName}</span>
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to="/"
                    className="inline-flex h-9 items-center justify-center rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                  >
                    Home
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSetupModalOpen(true)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100"
                    aria-label="Open setup"
                    title="Setup"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
                      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.03.03a2.16 2.16 0 0 1-3.05 3.05l-.03-.03a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.09 1.65V21a2.16 2.16 0 0 1-4.32 0v-.05a1.8 1.8 0 0 0-1.09-1.65 1.8 1.8 0 0 0-1.98.36l-.03.03a2.16 2.16 0 1 1-3.05-3.05l.03-.03A1.8 1.8 0 0 0 3.6 15a1.8 1.8 0 0 0-1.65-1.09H1.9a2.16 2.16 0 0 1 0-4.32h.05A1.8 1.8 0 0 0 3.6 8.5a1.8 1.8 0 0 0-.36-1.98l-.03-.03a2.16 2.16 0 1 1 3.05-3.05l.03.03a1.8 1.8 0 0 0 1.98.36h.01a1.8 1.8 0 0 0 1.08-1.65V2.16a2.16 2.16 0 0 1 4.32 0v.05a1.8 1.8 0 0 0 1.09 1.65 1.8 1.8 0 0 0 1.98-.36l.03-.03a2.16 2.16 0 1 1 3.05 3.05l-.03.03a1.8 1.8 0 0 0-.36 1.98v.01a1.8 1.8 0 0 0 1.65 1.08h.05a2.16 2.16 0 0 1 0 4.32h-.05A1.8 1.8 0 0 0 19.4 15Z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Two-column layout on xl */}
            <div className="grid gap-2 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">

              {/* Left column: timers + possession + scoring */}
              <div className="space-y-2">

                {/* Timer block */}
                <div className="space-y-2 rounded-2xl border border-slate-300 bg-white p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleToggleTimer}
                      disabled={!consoleReady}
                      onMouseDown={startPrimaryHoldReset}
                      onMouseUp={cancelPrimaryHoldReset}
                      onMouseLeave={cancelPrimaryHoldReset}
                      onTouchStart={startPrimaryHoldReset}
                      onTouchEnd={cancelPrimaryHoldReset}
                      onTouchCancel={cancelPrimaryHoldReset}
                      className={`min-w-0 rounded-xl border border-slate-200 p-3 text-center text-slate-800 transition [container-type:inline-size] ${primaryTimerBg}`}
                    >
                      <p className="overflow-hidden whitespace-nowrap text-[min(5.5rem,32cqw)] font-semibold leading-none tabular-nums text-slate-900">
                        {formattedPrimaryClock}
                      </p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {timerLabel || "Game time"}
                      </p>
                    </button>
                    <div className={`min-w-0 rounded-xl border border-slate-200 p-3 text-center text-slate-800 transition [container-type:inline-size] ${secondaryTimerBg}`}>
                      <p className="overflow-hidden whitespace-nowrap text-[min(4.5rem,30cqw)] font-semibold leading-none tabular-nums text-slate-900">
                        {formattedSecondaryClock}
                      </p>
                      <div className="mt-1 flex items-center justify-center text-slate-700">
                        <SecondaryTimerDescription
                          label={secondaryLabel}
                          running={secondaryRunning}
                          remainingSeconds={data.secondarySeconds}
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
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                        <path d="M10 2h4" /><path d="M12 14v-4" /><path d="M15.5 4.5 17 3" /><circle cx="12" cy="14" r="8" />
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
                      {secondaryRunning && (secondaryLabel || "").toLowerCase() === "discussion" ? "Stop discussion" : "Discussion"}
                    </button>
                  </div>
                </div>

                {/* Cap banner */}
                {attentionBannerMessage && (
                  <p className="rounded-2xl border border-red-500 bg-red-200 px-3 py-2 text-sm font-bold text-red-900 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]">
                    {attentionBannerMessage}
                  </p>
                )}

                {/* Possession pad */}
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
                            style={{ transform: currentPossessionTeam === "B" ? "translateX(calc(100% + 4px))" : "translateX(0)" }}
                            aria-hidden="true"
                          />
                        )}
                        <button type="button" className={`relative z-10 flex-1 rounded-2xl px-3 py-3 text-center transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${currentPossessionTeam === "A" ? "text-white" : "text-slate-700"}`} aria-pressed={possessionTeam === "A"} tabIndex={-1}>{displayTeamAShort}</button>
                        <button type="button" className={`relative z-10 flex-1 rounded-2xl px-3 py-3 text-center transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${currentPossessionTeam === "B" ? "text-white" : "text-slate-700"}`} aria-pressed={possessionTeam === "B"} tabIndex={-1}>{displayTeamBShort}</button>
                      </div>
                      <p className="flex items-center gap-1 text-sm font-semibold text-slate-600">
                        <span className="text-base font-semibold text-slate-900">Possession</span>
                        <span>:</span>
                        <span className="text-base text-slate-900">
                          {possessionLeader === "Contested" ? "Contested" : `${possessionLeader} control`}
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {/* Console error */}
                {consoleError && (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {consoleError}
                  </p>
                )}

                {/* Score controls */}
                <div className="space-y-2 rounded-3xl border border-[#0f5132]/40 bg-white p-1.5">
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
                          <button type="button" onClick={() => openScoreModal("A")} className="w-full rounded-full bg-[#0f5132] px-3 py-6 text-center text-sm font-semibold text-white transition hover:bg-[#0a3b24]">
                            Add score — {displayTeamAShort}
                          </button>
                          <div className="px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#0f5132]/80">
                            {nextAbbaDescriptor ? (
                              <div className="flex justify-center">
                                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0f5132] text-base font-extrabold text-white">
                                  {nextAbbaDescriptor}
                                </span>
                              </div>
                            ) : null}
                            <p className="text-lg font-semibold text-[#0f5132]">{score.a} – {score.b}</p>
                          </div>
                          <button type="button" onClick={() => openScoreModal("B")} className="w-full rounded-full bg-[#0f5132] px-3 py-6 text-center text-sm font-semibold text-white transition hover:bg-[#0a3b24]">
                            Add score — {displayTeamBShort}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>{/* end left column */}

              {/* Right column: event log + roster */}
              <div className="space-y-2">

                {/* Event log */}
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
                        No match events yet. Use the buttons above to log an event.
                      </div>
                    ) : (
                      dedupedLogs.map((log, i) => {
                        const chronologicalIndex = log.id !== undefined ? (logIndexById.get(log.id) ?? -1) : -1;
                        const editIndex = chronologicalIndex >= 0 ? chronologicalIndex : i;
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
                      })
                    )}
                    <button
                      type="button"
                      onClick={() => { setEndScrimmageConfirmed(false); setEndScrimmageModalOpen(true); }}
                      disabled={!canEndMatch}
                      className="block w-full rounded-full bg-rose-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      End scrimmage
                    </button>
                  </div>
                </div>

                {/* Roster */}
                <details className="group overflow-hidden rounded-2xl border border-[#0f5132]/20 bg-white">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 marker:hidden">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 text-[#0f5132]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      <span className="text-sm font-semibold text-[#0f5132]">Player roster</span>
                      <span className="rounded-full bg-[#ecfdf3] px-1.5 py-0.5 text-[10px] font-semibold text-[#0f5132]">
                        {(sortedRosters.teamA?.length ?? 0) + (sortedRosters.teamB?.length ?? 0)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); openRosterEditor(); }}
                      aria-label="Edit roster"
                      title="Edit roster"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#0f5132]/30 text-[#0f5132] transition hover:bg-[#ecfdf3]"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 text-[#0f5132]/50 transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>

                  <div className="border-t border-[#0f5132]/10 px-3 pb-3 pt-2">
                    {rostersError && (
                      <p className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{rostersError}</p>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        { label: safeTeamAName, players: sortedRosters.teamA ?? [], accent: "#0f5132", bg: "#ecfdf3", border: "#0f5132" },
                        { label: safeTeamBName, players: sortedRosters.teamB ?? [], accent: "#1e3a8a", bg: "#eff6ff", border: "#1e3a8a" },
                      ].map(({ label, players, accent, bg, border }) => (
                        <div key={label} className="overflow-hidden rounded-xl border" style={{ borderColor: `${border}30` }}>
                          <div className="flex items-center justify-between px-2.5 py-1.5" style={{ background: bg }}>
                            <span className="text-xs font-semibold" style={{ color: accent }}>{label}</span>
                            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `${accent}18`, color: accent }}>
                              {players.length}
                            </span>
                          </div>
                          <div className="p-2">
                            {rostersLoading ? (
                              <p className="px-0.5 py-1 text-xs text-slate-400">Loading…</p>
                            ) : players.length === 0 ? (
                              <p className="px-0.5 py-1 text-xs text-slate-400">No players assigned.</p>
                            ) : (
                              <div className="grid grid-cols-3 gap-2">
                                {players.map((player) => (
                                  <div
                                    key={player.id}
                                    className="rounded-xl border px-2 py-2 text-xs font-semibold"
                                    style={{ borderColor: `${accent}30`, color: accent }}
                                  >
                                    {renderPlayerGridLabel(player)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>

              </div>{/* end right column */}

            </div>{/* end grid */}

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
            {consoleError && (
              <p className="text-sm text-rose-600">{consoleError}</p>
            )}
          </section>
        )}
      </main>


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
                <span className="shrink-0">Match duration (min)</span>
                <input
                  type="number"
                  min="0"
                  value={matchDurationMinutes || ""}
                  placeholder="None (count up)"
                  onChange={(event) =>
                    setRules((prev) =>
                      setRuleMatchDurationMinutes(prev, Number(event.target.value) || 0)
                    )
                  }
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Halftime (min)</span>
                <input
                  type="number"
                  min="0"
                  value={halftimeCapMinutes}
                  onChange={(event) =>
                    setRules((prev) =>
                      setRuleHalftimeCapMinutes(prev, Number(event.target.value) || 0)
                    )
                  }
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Halftime duration (min)</span>
                <input
                  type="number"
                  min="0"
                  value={halftimeBreakMinutes}
                  onChange={(event) =>
                    setRules((prev) =>
                      setRuleHalftimeBreakMinutes(prev, Number(event.target.value) || 0)
                    )
                  }
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Timeout duration (sec)</span>
                <input
                  type="number"
                  min="0"
                  value={timeoutSeconds}
                  onChange={(event) =>
                    setRules((prev) =>
                      setRuleTimeoutSeconds(prev, Number(event.target.value) || 0)
                    )
                  }
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Timeouts total</span>
                <input
                  type="number"
                  min="0"
                  value={timeoutsTotal}
                  onChange={(event) =>
                    setRules((prev) =>
                      setRuleTimeoutsTotal(prev, Number(event.target.value) || 0)
                    )
                  }
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Timeouts per half</span>
                <input
                  type="number"
                  min="0"
                  value={timeoutsPerHalf}
                  onChange={(event) =>
                    setRules((prev) =>
                      setRuleTimeoutsPerHalf(prev, Number(event.target.value) || 0)
                    )
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
                  value={abbaPattern}
                  onChange={(event) =>
                    setRules((prev) => setRuleAbbaPattern(prev, event.target.value))
                  }
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="none">None</option>
                  <option value="male">Male matching</option>
                  <option value="female">Female matching</option>
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
        <ActionModal
          title="Player roster"
          onClose={closeRosterEditor}
          alignTop
          fitViewport
        >
          <div className="flex min-h-0 flex-1 flex-col">

            {/* Scrollable content */}
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">

            {/* Add / edit form */}
            <div className="rounded-xl border border-[#0f5132]/20 bg-[#f0fdf4] p-2">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#0f5132]/60">
                {playerEditorForm.id ? "Edit player" : "Add player"}
              </p>
              <form className="space-y-2" onSubmit={handleRosterPlayerSubmit}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={playerEditorForm.name}
                    onChange={(event) =>
                      setPlayerEditorForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    required
                    placeholder="Player name"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#0f5132]/20"
                  />
                  <input
                    type="number"
                    min="0"
                    value={playerEditorForm.jersey}
                    onChange={(event) =>
                      setPlayerEditorForm((prev) => ({ ...prev, jersey: event.target.value }))
                    }
                    placeholder="#"
                    aria-label="Jersey number"
                    className="w-16 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#0f5132]/20"
                  />
                </div>

                <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-white p-1">
                  {[
                    { value: "A", label: safeTeamAName, activeClass: "bg-[#0f5132] text-white" },
                    { value: "both", label: "Both", activeClass: "bg-slate-700 text-white" },
                    { value: "B", label: safeTeamBName, activeClass: "bg-[#1e3a8a] text-white" },
                  ].map((option) => {
                    const active = playerEditorForm.assignment === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setPlayerEditorForm((prev) => ({ ...prev, assignment: option.value }))
                        }
                        className={`truncate rounded-md px-2 py-1 text-xs font-semibold transition ${
                          active ? option.activeClass : "text-slate-600 hover:bg-slate-100"
                        }`}
                        aria-pressed={active}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-full bg-[#0f5132] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
                  >
                    {playerEditorForm.id ? "Save changes" : "Add player"}
                  </button>
                  {playerEditorForm.id ? (
                    <>
                      <button
                        type="button"
                        onClick={resetPlayerEditorForm}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        New
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteCurrentPlayer}
                        className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                </div>
              </form>
            </div>

            {/* Bulk upload — one section per team */}
            <div className="rounded-xl border border-[#0f5132]/20 bg-white p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0f5132]/60">
                Upload players
              </p>
              <p className="mb-2 text-[11px] leading-tight text-slate-500">
                Line 1 = team name, then one player per line (optional 3-digit number first,
                e.g. <span className="font-mono">7 Sam Jones</span>).
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { key: "A", label: safeTeamAName, accent: "#0f5132" },
                  { key: "B", label: safeTeamBName, accent: "#1e3a8a" },
                ].map(({ key, label, accent }) => {
                  const state = rosterUpload[key] || { text: "", error: "", notice: "" };
                  return (
                    <div
                      key={key}
                      className="flex flex-col rounded-lg border p-2"
                      style={{ borderColor: `${accent}30` }}
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-semibold" style={{ color: accent }}>
                          {label}
                        </span>
                        <label
                          className="cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-semibold transition hover:opacity-80"
                          style={{ borderColor: `${accent}40`, color: accent }}
                        >
                          File
                          <input
                            ref={(node) => {
                              rosterUploadFileRefs.current[key] = node;
                            }}
                            type="file"
                            accept=".txt,.csv,text/plain"
                            className="hidden"
                            onChange={(event) => {
                              handleRosterUploadFile(key, event.target.files?.[0]);
                              event.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                      <textarea
                        rows={3}
                        value={state.text}
                        onChange={(event) =>
                          setRosterUpload((prev) => ({
                            ...prev,
                            [key]: { text: event.target.value, error: "", notice: "" },
                          }))
                        }
                        placeholder={`${label}\n7 Sam Jones\nJordan Patel`}
                        className="w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 placeholder:text-slate-300 focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#0f5132]/20"
                      />
                      {state.error && (
                        <p className="mt-1 text-[11px] font-medium text-rose-600">{state.error}</p>
                      )}
                      {state.notice && (
                        <p className="mt-1 text-[11px] font-medium text-[#0f5132]">{state.notice}</p>
                      )}
                      <button
                        type="button"
                        onClick={() => applyRosterUpload(key)}
                        disabled={!state.text.trim()}
                        className="mt-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ background: accent }}
                      >
                        Add to {label}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Current players list */}
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-2.5 py-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current players</p>
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {allRosterPlayers.length}
                </span>
              </div>
              {allRosterPlayers.length === 0 ? (
                <p className="px-3 py-3 text-center text-xs text-slate-400">No players yet — add one above.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {allRosterPlayers.map((player) => {
                    const isEditing = playerEditorForm.id === player.id;
                    return (
                      <div
                        key={`edit-${player.id}`}
                        className={`flex items-center gap-2 px-2.5 py-1.5 transition ${isEditing ? "bg-[#ecfdf3]" : "hover:bg-slate-50"}`}
                      >
                        <PlayerSideIcon side={player.side} />
                        {player.jersey_number != null && (
                          <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-slate-400">
                            {player.jersey_number}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                          {player.name || "—"}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEditRosterPlayer(player)}
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${
                            isEditing
                              ? "bg-[#0f5132] text-white"
                              : "border border-[#0f5132]/30 text-[#0f5132] hover:bg-[#ecfdf3]"
                          }`}
                        >
                          {isEditing ? "Editing" : "Edit"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            </div>{/* end scrollable content */}

            <button
              type="button"
              onClick={closeRosterEditor}
              className="mt-2 w-full shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Done
            </button>
          </div>
        </ActionModal>
      )}

      {endScrimmageModalOpen && (
        <ActionModal title="End scrimmage" onClose={() => setEndScrimmageModalOpen(false)}>
          <div className="space-y-3 text-sm text-[#0f5132]">
            <p>How would you like to wrap up this scrimmage?</p>
            <p className="text-xs text-[#4b6f5b]">
              Open the match report at any time to review live stats. Only confirm the end if you
              want to stop the scrimmage.
            </p>
            <button
              type="button"
              onClick={() => setEndScrimmageConfirmed(true)}
              className={`w-full rounded-full px-4 py-2 text-sm font-semibold text-white transition ${
                endScrimmageConfirmed
                  ? "bg-rose-400 cursor-default"
                  : "bg-rose-600 hover:bg-rose-700"
              }`}
              disabled={endScrimmageConfirmed}
            >
              {endScrimmageConfirmed ? "End scrimmage confirmed" : "Confirm end scrimmage"}
            </button>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={handleOpenMatchReport}
                className="w-full rounded-full bg-[#0f5132] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
              >
                Match report
              </button>
              <button
                type="button"
                onClick={() => {
                  handleEndMatchNavigation();
                  setEndScrimmageConfirmed(false);
                  setEndScrimmageModalOpen(false);
                }}
                disabled={!endScrimmageConfirmed}
                className="w-full rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                End scrimmage now
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setEndScrimmageConfirmed(false);
                setEndScrimmageModalOpen(false);
              }}
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
          maxWidthClass="max-w-6xl"
        >
          <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1 text-slate-800">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="rounded-full border border-[#0f5132] bg-white px-4 py-2 text-sm font-semibold text-[#0f5132] transition hover:bg-[#ecfdf3]"
              >
                Download data (CSV)
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="rounded-full bg-[#0f5132] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
              >
                Download PDF
              </button>
            </div>

            {/* Scoreline header */}
            <div className="flex items-center justify-center gap-4 rounded-2xl border border-[#0f5132]/20 bg-[#ecfdf3] px-4 py-3 text-center">
              <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-[#0f5132] sm:text-base">
                {displayTeamA}
              </span>
              <span className="shrink-0 text-2xl font-bold tabular-nums text-[#0f5132] sm:text-3xl">
                {score.a} <span className="text-[#0f5132]/40">–</span> {score.b}
              </span>
              <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-[#0f5132] sm:text-base">
                {displayTeamB}
              </span>
            </div>

            {/* Insights */}
            <div className="grid gap-3 lg:grid-cols-2">
              <ReportTable title="Match insights" rows={scrimmageReport?.insights?.match} />
              <ReportTable title="Tempo insights" rows={scrimmageReport?.insights?.tempo} />
            </div>

            {/* Team overviews */}
            <div className="grid gap-3 lg:grid-cols-2">
              <ReportTeamCard
                title={`${displayTeamA} overview`}
                accent="#0f5132"
                stats={scrimmageReport?.summaries?.teamA}
              />
              <ReportTeamCard
                title={`${displayTeamB} overview`}
                accent="#1e3a8a"
                stats={scrimmageReport?.summaries?.teamB}
              />
            </div>
          </div>
        </ActionModal>
      )}
    </ScorekeeperShell>
  );
}

const SECONDARY_TIMER_GUIDES = {
  interPoint: {
    title: "Inter-point timer",
    steps: [
      { from: 45, text: "Set offence on the line" },
      { from: 60, text: "Signal offence ready" },
    ],
  },
  betweenPointsTimeout: {
    title: "Time-out (between points)",
    steps: [
      { from: 0, until: 75, text: "Timeout" },
      { from: 75, text: "Extend inter-point window" },
      { from: 76, text: "Inter-point" },
    ],
  },
  liveTimeout: {
    title: "Timeout (during a point)",
    steps: [
      { from: 0, until: 75, text: "Timeout" },
      { from: 75, until: 90, text: "Confirm offence ready" },
      { from: 90, text: "Check disc in" },
    ],
  },
  discussion: {
    title: "Discussion",
    steps: [
      { from: 15, text: "Involve captains" },
      { from: 45, text: "Declare contested" },
    ],
  },
};

function getSecondaryTimerGuide(label) {
  const normalized = `${label || ""}`.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("discussion")) return SECONDARY_TIMER_GUIDES.discussion;
  if (normalized === "inter point") return SECONDARY_TIMER_GUIDES.interPoint;
  if (normalized.includes("inter point timeout") || normalized.includes("pre-pull timeout")) {
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

function SecondaryTimerProgressBar({ anchorRef, totalSeconds, running }) {
  const [pct, setPct] = useState(1);
  const [remainingEst, setRemainingEst] = useState(totalSeconds);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!running || !totalSeconds || totalSeconds <= 0) return undefined;
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
      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct * 100}%` }} />
    </div>
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
  fitViewport = false,
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
          scrollable || fitViewport ? "max-h-[92vh] overflow-hidden" : ""
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
        <div
          className={
            fitViewport
              ? "flex max-h-[calc(92vh-3.5rem)] flex-col overflow-hidden"
              : scrollable
                ? "max-h-[80vh] overflow-y-auto pr-1"
                : ""
          }
        >
          {children}
        </div>
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
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0f5132] text-[8px] font-bold leading-none text-white"
        title="Team A"
        aria-label="Team A"
      >
        A
      </span>
    );
  }

  if (side === "B") {
    return (
      <span
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#1e3a8a] text-[8px] font-bold leading-none text-white"
        title="Team B"
        aria-label="Team B"
      >
        B
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5"
      title="Both teams"
      aria-label="Both teams"
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0f5132] text-[8px] font-bold leading-none text-white">A</span>
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#1e3a8a] text-[8px] font-bold leading-none text-white">B</span>
    </span>
  );
}

function ReportTable({ title, rows }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#0f5132]/20 bg-white">
      <div className="border-b border-[#0f5132]/15 bg-[#ecfdf3] px-4 py-2.5">
        <h3 className="text-sm font-semibold text-[#0f5132]">{title}</h3>
      </div>
      {rows?.length ? (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-500">{row.label}</td>
                <td className="px-4 py-2 text-right font-semibold text-slate-800">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-4 py-3 text-sm text-slate-400">No data available.</p>
      )}
    </div>
  );
}

function ReportStatList({ title, valueLabel, rows, accent }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{valueLabel}</span>
      </div>
      {rows?.length ? (
        <div className="divide-y divide-slate-100">
          {rows.slice(0, 8).map((row) => (
            <div key={row.player} className="flex items-center justify-between px-3 py-1.5">
              <span className="min-w-0 truncate text-sm text-slate-800">{row.player}</span>
              <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: accent }}>
                {row.count}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-3 py-2 text-xs text-slate-400">None recorded.</p>
      )}
    </div>
  );
}

function ReportTeamCard({ title, stats, accent }) {
  const goals = stats?.goals || [];
  const assists = stats?.assists || [];
  const connections = stats?.connections || [];

  return (
    <div className="space-y-2 rounded-2xl border border-[#0f5132]/20 bg-white p-3">
      <h3 className="text-base font-semibold" style={{ color: accent }}>
        {title}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <ReportStatList title="Goals" valueLabel="G" rows={goals} accent={accent} />
        <ReportStatList title="Assists" valueLabel="A" rows={assists} accent={accent} />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Top connections
          </span>
        </div>
        {connections.length ? (
          <div className="divide-y divide-slate-100">
            {connections.slice(0, 6).map((row) => (
              <div
                key={`${row.assist}-${row.scorer}`}
                className="flex items-center gap-2 px-3 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-slate-800">{row.assist}</span>
                <span className="shrink-0 text-slate-400">→</span>
                <span className="min-w-0 flex-1 truncate text-slate-800">{row.scorer}</span>
                <span className="shrink-0 font-bold tabular-nums" style={{ color: accent }}>
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-3 py-2 text-xs text-slate-400">No assisted goals recorded.</p>
        )}
      </div>
    </div>
  );
}
