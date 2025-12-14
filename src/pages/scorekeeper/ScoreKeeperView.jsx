import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import { formatClock, formatMatchLabel } from "./scorekeeperUtils";
import { useScoreKeeperData } from "./useScoreKeeperData";
import { useScoreKeeperActions } from "./useScoreKeeperActions";
import { ScorekeeperShell, ScorekeeperCard, ScorekeeperButton } from "../../components/ui/scorekeeperPrimitives";
import {
  CALAHAN_ASSIST_VALUE,
  DEFAULT_DISCUSSION_SECONDS,
  SCORE_NA_PLAYER_VALUE,
} from "./scorekeeperConstants";

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
  });
  const possessionPadRef = useRef(null);
  const possessionPointerIdRef = useRef(null);
  const possessionDragStateRef = useRef({ startX: null, moved: false });
  const [possessionEventReady, setPossessionEventReady] = useState(false);
  const [possessionResult, setPossessionResult] = useState("throwaway"); // "throwaway" | "block"
  const [possessionActorId, setPossessionActorId] = useState("");
  const [possessionModalOpen, setPossessionModalOpen] = useState(false);
  const [pendingPossessionTeam, setPendingPossessionTeam] = useState(null);
  const [possessionPreviewTeam, setPossessionPreviewTeam] = useState(null);
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
    if (teamKey === "A") {
      return (sortedRosters.teamA || []).filter((player) => player?.id).map((player) => ({
        id: player.id,
        name: player.name || "Unnamed player",
      }));
    }
    if (teamKey === "B") {
      return (sortedRosters.teamB || []).filter((player) => player?.id).map((player) => ({
        id: player.id,
        name: player.name || "Unnamed player",
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
    setPossessionModalOpen(false);
    setPendingPossessionTeam(null);
    setPossessionPreviewTeam(null);
    setPossessionEventReady(false);
  };

  const confirmPossessionChange = () => {
    const nextTeam = pendingPossessionTeam;
    if (!nextTeam) {
      resetPossessionModalState();
      return;
    }
    const blockTeam = nextTeam === "A" ? "B" : "A";
    const rosterSourceTeam = possessionResult === "block" ? nextTeam : blockTeam;
    const options = getRosterOptionsForTeam(rosterSourceTeam);
    const actorId = options.find((player) => player.id === possessionActorId)?.id || possessionActorId || null;
    setPossessionActorId(actorId || "");
    resetPossessionModalState();
    const isBlock = possessionResult === "block";
    const eventTypeIdOverride = isBlock ? 19 : null;
    const eventTeamKey = isBlock ? nextTeam : null;
    void updatePossession(nextTeam, {
      actorId: actorId || null,
      eventTypeIdOverride,
      eventTeamKey,
    });
  };

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
    });
  };

  const closeSimpleEventModal = () => {
    setSimpleEventEditState({
      open: false,
      logIndex: null,
      teamKey: "",
      eventLabel: "",
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

  const handleStartDiscussionTimer = () => {
    cancelSecondaryHoldReset();
    if (secondaryResetTriggeredRef?.current) {
      secondaryResetTriggeredRef.current = false;
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
            <h1 className="text-xl font-semibold text-white">Score keeper console</h1>
          </div>
          <ScorekeeperButton as={Link} to="/admin" variant="compactGhost" className="text-xs">
            Back to admin hub
          </ScorekeeperButton>
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
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleToggleTimer}
                  onMouseDown={startPrimaryHoldReset}
                  onMouseUp={cancelPrimaryHoldReset}
                  onMouseLeave={cancelPrimaryHoldReset}
                  onTouchStart={startPrimaryHoldReset}
                  onTouchEnd={cancelPrimaryHoldReset}
                  className="rounded-md bg-[#1e3a8a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#162e6a]"
                >
                  Start/Stop
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
                  Discussion
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-sm font-semibold text-slate-800">
                <div className="rounded border border-slate-400 bg-white px-2 py-1">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={rules.matchDuration ?? ""}
                    onChange={(event) =>
                      handleRuleChange("matchDuration", Math.max(0, Number(event.target.value) || 0))
                    }
                    aria-label="Match duration (minutes)"
                    inputMode="numeric"
                    className="w-full border-none bg-transparent text-center text-sm font-semibold text-slate-800 focus:outline-none focus:ring-0"
                  />
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
              <p className="text-center text-[10px] uppercase tracking-wide text-slate-500">
                Hold 3s to reset
              </p>
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
                            />
                          );
                        });
                    })()
                  )}
                <button
                  type="button"
                  onClick={handleEndMatchNavigation}
                  disabled={!canEndMatch}
                  className="block w-full rounded-full bg-[#0f5132] px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#0a3b24] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  End match / Enter spirit scores
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
                onClick={handleDiscardResume}
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
            <div className="space-y-2">
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
                    className="mt-2 w-full rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-2 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/40 disabled:cursor-not-allowed disabled:opacity-60"
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
                    onClick={() => void loadMatches()}
                    className="text-[11px] font-semibold text-[#0f5132] transition hover:text-[#083b24]"
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
                    className="mt-2 w-full rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-2 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/40 disabled:cursor-not-allowed disabled:opacity-60"
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
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
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
              disabled={initialising || !selectedMatch}
              className="w-full rounded-full bg-[#0f5132] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0a3b24] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {initialising ? "Initialising..." : "Initialise"}
            </button>
          </form>
        </ActionModal>
      )}

      {possessionModalOpen && (
        <ActionModal title="Possession outcome" onClose={resetPossessionModalState}>
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
                className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${
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
                <span>Turnover</span>
              </label>
              <label
                className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${
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
              <select
                value={possessionActorId}
                onChange={(event) => setPossessionActorId(event.target.value || "")}
                className="w-full rounded-xl border border-[#0f5132]/30 bg-white px-3 py-2 text-sm font-semibold text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30"
              >
                <option value="">N/A</option>
                {!activeActorOptions.length && <option value="__no_players" disabled>No players available</option>}
                {activeActorOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={confirmPossessionChange}
                className="w-full rounded-full bg-[#0f5132] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
                disabled={!pendingPossessionTeam}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={resetPossessionModalState}
                className="w-full rounded-full border border-[#0f5132]/40 px-4 py-2 text-sm font-semibold text-[#0f5132] transition hover:bg-white"
              >
                Cancel
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
              Timeout {displayTeamAShort || "A"}
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
              Timeout {displayTeamBShort || "B"}
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
            <button
              type="button"
              onClick={() => {
                if (!timerRunning) {
                  handleToggleTimer();
                }
              }}
              className="w-full rounded-full bg-[#0f5132] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
            >
              Resume match time
            </button>
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
              <select
                value={scoreForm.scorerId}
                onChange={(event) =>
                  setScoreForm((prev) => ({ ...prev, scorerId: event.target.value }))
                }
                required
                className="mt-2 w-full rounded-full border border-[#0f5132]/40 bg-[#d4f4e2] px-4 py-2 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none"
              >
                <option value="">Select Scorer</option>
                <option value={SCORE_NA_PLAYER_VALUE}>N/A</option>
                {rosterOptionsForModal.map((player) => (
                  <option key={player.id} value={player.id}>
                    {formatPlayerSelectLabel(player)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-base font-semibold text-[#0f5132]">
              Assist:
              <select
                value={scoreForm.assistId}
                onChange={(event) =>
                  setScoreForm((prev) => ({ ...prev, assistId: event.target.value }))
                }
                required
                className="mt-2 w-full rounded-full border border-[#0f5132]/40 bg-[#d4f4e2] px-4 py-2 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none"
              >
                <option value="">Select Assist</option>
                <option value={SCORE_NA_PLAYER_VALUE}>N/A</option>
                {rosterOptionsForModal.map((player) => (
                  <option key={player.id} value={player.id}>
                    {formatPlayerSelectLabel(player)}
                  </option>
                ))}
                <option value={CALAHAN_ASSIST_VALUE}>CALLAHAN!!</option>
              </select>
            </label>
            <label className="block text-base font-semibold text-[#0f5132]">
              Scorer:
              <select
                value={scoreForm.scorerId}
                onChange={(event) =>
                  setScoreForm((prev) => ({ ...prev, scorerId: event.target.value }))
                }
                required
                className="mt-2 w-full rounded-full border border-[#0f5132]/40 bg-[#d4f4e2] px-4 py-2 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none"
              >
                <option value="">Select Scorer</option>
                <option value={SCORE_NA_PLAYER_VALUE}>N/A</option>
                {rosterOptionsForModal.map((player) => (
                  <option key={player.id} value={player.id}>
                    {formatPlayerSelectLabel(player)}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1.5">
              {!isScoreFormValid && (
                <p className="text-xs font-semibold text-rose-600">
                  {scorerAssistClash
                    ? "Scorer and assist must be different players."
                    : "Choose both a scorer and an assist to log this score."}
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
          <form className="space-y-3" onSubmit={handleSimpleEventSubmit}>
            <p className="text-sm font-semibold text-[#0f5132]">
              {simpleEventEditState.eventLabel}
            </p>
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
            <div className="space-y-1.5">
              <button
                type="submit"
                className="w-full rounded-full bg-[#0f5132] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
              >
                Save changes
              </button>
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
    </ScorekeeperShell>
  );
}

function ActionModal({ title, onClose, children, disableClose = false }) {
  const handleClose = () => {
    if (!disableClose) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] px-4 py-3">
      <div className="w-full max-w-sm rounded-[32px] bg-white p-3">
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
        {children}
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
}) {
  const isScoreLog = log.eventCode === MATCH_LOG_EVENT_CODES.SCORE;
  const isMatchStartLog = log.eventCode === MATCH_LOG_EVENT_CODES.MATCH_START;
  const isTimeoutLog =
    log.eventCode === MATCH_LOG_EVENT_CODES.TIMEOUT ||
    log.eventCode === MATCH_LOG_EVENT_CODES.TIMEOUT_START;
  const isPossessionLog = log.eventCode === MATCH_LOG_EVENT_CODES.TURNOVER;
  const isHalftimeLog = log.eventCode === MATCH_LOG_EVENT_CODES.HALFTIME_START;
  const isStoppageStart = log.eventCode === MATCH_LOG_EVENT_CODES.STOPPAGE_START;
  const isCalahanLog = log.eventCode === MATCH_LOG_EVENT_CODES.CALAHAN;
  const shortTeamLabel =
    log.team === "B" ? displayTeamBShort : log.team === "A" ? displayTeamAShort : null;
  const fullTeamLabel =
    log.team === "B" ? displayTeamB : log.team === "A" ? displayTeamA : null;
  const abbaDescriptor =
    isScoreLog || isCalahanLog ? getAbbaDescriptor(log.scoreOrderIndex ?? chronologicalIndex) : null;
  const eventTime = new Date(log.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const abbaLineLabel = log.abbaLine && log.abbaLine !== "none" ? log.abbaLine : null;

  return (
    <article
      className={`rounded-2xl border px-4 py-3 text-sm transition ${eventStyles.bg} ${eventStyles.border} ${alignClass}`}
    >
      <div className={`w-full ${alignClass}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-black">
          {isMatchStartLog ? "Match start" : log.eventDescription || "Match event"}
          {!isScoringDisplay && !isMatchStartLog && shortTeamLabel ? ` - ${shortTeamLabel}` : ""}
        </p>
        {abbaDescriptor && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black">{abbaDescriptor}</p>
        )}
        {description && <p className="text-xs text-black">{description}</p>}
        {abbaLineLabel && (
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-black">
            Line {abbaLineLabel}
          </p>
        )}
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
                className="rounded-full border border-border px-4 py-1 text-xs font-semibold text-accent transition hover:border-accent hover:bg-[#e6fffa]"
              >
                Edit event
              </button>
            </div>
          )}
        </div>
      ) : description ? (
        <div className="mt-3 flex items-center justify-between text-xs text-black">
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
          {log.team && (isTimeoutLog || isPossessionLog) && (
            <button
              type="button"
              onClick={() => openSimpleEventModal(log, editIndex)}
              className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-accent transition hover:border-accent hover:bg-[#e6fffa]"
            >
              Edit
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}
