import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import { formatClock, formatMatchLabel } from "./scorekeeperUtils";
import { useScoreKeeperData } from "./useScoreKeeperData";
import { useScoreKeeperActions } from "./useScoreKeeperActions";
import { CALAHAN_ASSIST_VALUE } from "./scorekeeperConstants";

export default function ScoreKeeperView() {
  const data = useScoreKeeperData();
  const actions = useScoreKeeperActions(data);

  const {
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
    toDateTimeLocal
  } = data;

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
    void updatePossession(nextTeam);
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

  const isScoreFormValid = Boolean(scoreForm.scorerId && scoreForm.assistId);

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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="flex flex-col leading-tight">
            <h1 className="text-xl font-semibold text-slate-900">Score keeper console</h1>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand hover:text-brand-dark"
          >
            Back to admin hub
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-2 py-3">
        {consoleReady ? (
          <section className="space-y-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-1.5 shadow-card/40">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
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
                  className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand hover:text-brand-dark"
                >
                  Adjust setup
                </button>
              </div>
            </div>

            <div className="space-y-2 rounded-3xl border-2 border-[#6d1030] bg-white p-1 shadow-inner">
              <div className="divide-y divide-[#6d1030]/50 rounded-2xl border border-[#6d1030]/50">
                <div className="grid gap-1.5 p-1.5 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="rounded-2xl p-1 text-center text-[#6d1030]">
                    <div
                      className={`flex w-full flex-col items-center rounded-2xl border border-slate-200 px-2 py-3 text-[#6d1030] transition-colors ${primaryTimerBg}`}
                    >
                      <p className="text-[70px] font-semibold leading-none sm:text-[90px]">
                        {formattedPrimaryClock}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-[#6d1030]/70">
                        {timerLabel}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <label className="inline-flex items-center gap-2 text-sm font-semibold">
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
                        <button
                          type="button"
                          onClick={handleToggleTimer}
                          onMouseDown={startPrimaryHoldReset}
                          onMouseUp={cancelPrimaryHoldReset}
                          onMouseLeave={cancelPrimaryHoldReset}
                          onTouchStart={startPrimaryHoldReset}
                          onTouchEnd={cancelPrimaryHoldReset}
                          className="w-24 rounded-full bg-[#6d1030] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#510b24]"
                        >
                          {timerRunning ? "Pause" : "Play"}
                        </button>
                      </div>
                      <p className="text-[10px] uppercase tracking-wide text-[#6d1030]/70">
                        Hold to reset
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-1.5 p-1.5 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="rounded-2xl p-1 text-center text-[#6d1030]">
                    <div
                      className={`flex w-full flex-col items-center rounded-2xl border border-slate-200 px-2 py-3 text-[#6d1030] transition-colors ${secondaryTimerBg}`}
                    >
                      <p className="text-[60px] font-semibold leading-none sm:text-[80px]">
                        {formattedSecondaryClock}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-[#6d1030]/70">
                        {secondaryLabel}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <label className="inline-flex items-center gap-2 text-sm font-semibold">
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
                        <button
                          type="button"
                          onClick={() => handleSecondaryToggle()}
                          onMouseDown={startSecondaryHoldReset}
                          onMouseUp={cancelSecondaryHoldReset}
                          onMouseLeave={cancelSecondaryHoldReset}
                          onTouchStart={startSecondaryHoldReset}
                          onTouchEnd={cancelSecondaryHoldReset}
                          className="w-24 rounded-full bg-[#6d1030] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#510b24]"
                        >
                          {secondaryRunning ? "Pause" : "Play"}
                        </button>
                      </div>
                      <p className="text-[10px] uppercase tracking-wide text-[#6d1030]/70">
                        Hold to reset
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setTimeModalOpen(true)}
                  disabled={!matchStarted}
                  className={`w-full rounded-full px-3 py-2 text-sm font-semibold text-white shadow-card transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    matchStarted ? "bg-[#6d1030] hover:bg-[#510b24]" : "bg-[#b6abc7] hover:bg-[#9a90ab]"
                  }`}
                >
                  Additional time options
                </button>
              </div>
            </div>

              {matchStarted && (
                <div className="rounded-3xl border border-[#6d1030]/30 bg-white p-1.5 shadow-card/20">
                <div className="flex flex-col gap-1 text-[#6d1030] sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-xl font-semibold">Possession</h3>
                  <p className="text-sm font-semibold">
                    {possessionLeader === "Contested" ? "Contested" : `${possessionLeader} control`}
                  </p>
                </div>
                <div className="mt-3 space-y-2">
                  <div
                    ref={possessionPadRef}
                    role="group"
                    aria-label="Select possession team"
                    className="relative flex w-full items-stretch gap-1 rounded-2xl bg-[#fdf1f4] p-1 text-sm font-semibold text-[#6d1030]"
                    style={{ touchAction: "pan-y" }}
                    onPointerDown={handlePossessionPadPointerDown}
                    onPointerMove={handlePossessionPadPointerMove}
                    onPointerUp={handlePossessionPadPointerUp}
                    onPointerLeave={handlePossessionPadPointerLeave}
                    onPointerCancel={handlePossessionPadPointerCancel}
                  >
                    <button
                      type="button"
                      className={`flex-1 rounded-2xl px-3 py-3 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c35c6f] ${
                        possessionTeam === "A" ? "bg-white text-[#6d1030] shadow" : "text-[#6d1030]/70"
                      }`}
                      aria-pressed={possessionTeam === "A"}
                      tabIndex={-1}
                    >
                      {displayTeamAShort}
                    </button>
                    <button
                      type="button"
                      className={`flex-1 rounded-2xl px-3 py-3 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c35c6f] ${
                        possessionTeam === "B" ? "bg-white text-[#6d1030] shadow" : "text-[#6d1030]/70"
                      }`}
                      aria-pressed={possessionTeam === "B"}
                      tabIndex={-1}
                    >
                      {displayTeamBShort}
                    </button>
                  </div>
                  <p className="text-center text-[11px] uppercase tracking-wide text-[#6d1030]/70">
                    Drag across to update possession
                  </p>
                </div>
              </div>
            )}

              <div className="space-y-2 rounded-3xl border border-[#6d1030]/40 bg-white p-1.5 shadow-card/30">
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
                      className="w-full rounded-full bg-[#6d1030] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#510b24]"
                    >
                      Start match
                    </button>
                  ) : (
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openScoreModal("A")}
                        className="w-full rounded-full bg-[#6d1030] px-3 py-2 text-center text-sm font-semibold text-white shadow-card transition hover:bg-[#510b24]"
                      >
                        Add score - {displayTeamAShort}
                      </button>
                      <div className="px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#6d1030]/80">
                        {nextAbbaDescriptor ? `Next: ${nextAbbaDescriptor}` : "ABBA disabled"}
                      </div>
                      <button
                        type="button"
                        onClick={() => openScoreModal("B")}
                        className="w-full rounded-full bg-[#6d1030] px-3 py-2 text-center text-sm font-semibold text-white shadow-card transition hover:bg-[#510b24]"
                      >
                        Add score - {displayTeamBShort}
                      </button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {logsLoading ? (
                    <div className="rounded-2xl border border-dashed border-[#6d1030]/30 px-3 py-2 text-center text-xs text-slate-500">
                      Syncing logs...
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#6d1030]/30 px-3 py-2 text-center text-xs text-slate-500">
                      No match events captured yet. Use the buttons above to log an event.
                    </div>
                  ) : (
                    orderedLogs.map((log) => {
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
                    })
                  )}
                <button
                  type="button"
                  onClick={handleEndMatchNavigation}
                  disabled={!canEndMatch}
                  className="block w-full rounded-full bg-[#6d1030] px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#510b24] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  End match / Enter spirit scores
                </button>
                {pendingEntries.length > 0 && (
                  <div className="rounded-2xl border border-[#6d1030]/30 bg-white/90 p-2 text-sm text-[#6d1030]">
                    <h4 className="text-base font-semibold text-[#6d1030]">
                      Pending database payloads
                    </h4>
                    <pre className="mt-3 max-h-64 overflow-y-auto rounded-xl bg-[#fdf1f4] p-3 text-xs text-[#6d1030]">
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
              <div className="space-y-2 rounded-3xl border border-[#6d1030]/30 bg-white p-1.5 shadow-card/20">
                <h3 className="text-center text-lg font-semibold text-[#6d1030]">Team A Players</h3>
                <div className="space-y-1.5 rounded-2xl border border-[#6d1030]/20 bg-[#fdf1f4] p-2 text-sm text-[#6d1030]">
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
              <div className="space-y-2 rounded-3xl border border-[#6d1030]/30 bg-white p-1.5 shadow-card/20">
                <h3 className="text-center text-lg font-semibold text-[#6d1030]">Team B Players</h3>
                <div className="space-y-1.5 rounded-2xl border border-[#6d1030]/20 bg-[#fdf1f4] p-2 text-sm text-[#6d1030]">
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
          <section className="space-y-2 rounded-3xl border border-slate-200 bg-white p-2 text-center shadow-card/40">
            <button
              type="button"
              onClick={() => setSetupModalOpen(true)}
              disabled={initialising}
              className="inline-flex w-full items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
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
        <ActionModal title="Resume last session?" onClose={handleDiscardResume}>
          <div className="space-y-3 text-sm text-[#6d1030]">
            <p>
              A scorekeeper session for this match was saved{" "}
              {resumeCandidate.updatedAt
                ? new Date(resumeCandidate.updatedAt).toLocaleString()
                : "recently"}
              . You can continue where you left off or start a new console session.
            </p>
            <div className="rounded-2xl border border-[#6d1030]/20 bg-[#fdf1f4] p-3 text-xs">
              <p className="font-semibold uppercase tracking-wide text-[#6d1030]/70">
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
                className="inline-flex items-center justify-center rounded-full bg-[#6d1030] px-4 py-2 text-white transition hover:bg-[#510b24] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resumeBusy ? "Loading..." : "Resume session"}
              </button>
              <button
                type="button"
                onClick={handleDiscardResume}
                disabled={resumeBusy}
                className="inline-flex items-center justify-center rounded-full border border-[#6d1030]/40 px-4 py-2 font-semibold text-[#6d1030] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
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
            {matchSettingsLocked && (
              <p className="rounded-2xl bg-[#fce8ee] px-3 py-2 text-xs font-semibold text-[#6d1030]">
                Match already started. Settings unlock once the match is reset.
              </p>
            )}
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
                    onClick={() => void loadMatches()}
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
    <ActionModal
      title="Time additions"
      onClose={() => {
        if (!stoppageActive) {
          setTimeModalOpen(false);
        }
      }}
      disableClose={stoppageActive}
    >
      <div className="space-y-2 text-center text-sm text-[#6d1030]">
        <button
          type="button"
          onClick={() => {
            handleHalfTimeTrigger();
          }}
          className="w-full rounded-full bg-[#6d1030] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#510b24]"
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
                className="mt-1.5 w-full rounded-full bg-[#6d1030] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#510b24] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Timeout A
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
                className="mt-1.5 w-full rounded-full bg-[#6d1030] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#510b24] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Timeout B
              </button>
              <p className="mt-1 text-xs">
                Remaining (total): {remainingTimeouts.B}
                <br />
                Remaining (half): {halfRemainingLabel("B")}
              </p>
            </div>

        <button
          type="button"
          onClick={handleGameStoppage}
          className="w-full rounded-full bg-[#ff9dad] px-3 py-2 text-sm font-semibold text-[#6d1030] transition hover:bg-[#ff8094]"
        >
          Game stoppage
        </button>

        {stoppageActive && (
          <div className="space-y-2 rounded-2xl border border-[#ff9dad]/60 bg-[#fff5f7] p-3 text-left">
            <p className="text-base font-semibold text-[#6d1030]">Stoppage active</p>
            <p className="text-xs text-[#6d1030]/80">
              Resume match time to unlock this menu and log the stoppage end.
            </p>
            <button
              type="button"
              onClick={() => {
                if (!timerRunning) {
                  handleToggleTimer();
                }
              }}
              className="w-full rounded-full bg-[#6d1030] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#510b24]"
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
                required
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
                required
                className="mt-2 w-full rounded-full border border-[#6d1030]/40 bg-[#f6e7eb] px-4 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none"
              >
                <option value="">Select Assist</option>
                {rosterOptionsForModal.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
                <option value={CALAHAN_ASSIST_VALUE}>CALAHAN!!</option>
              </select>
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
                  isScoreFormValid ? "bg-[#6d1030] hover:bg-[#510b24]" : "bg-slate-400 opacity-70"
                }`}
              >
                {scoreModalState.mode === "edit" ? "Update score" : "Add score"}
              </button>
              {scoreModalState.mode === "edit" && (
                <button
                  type="button"
                  onClick={() => handleDeleteLog(scoreModalState.logIndex)}
                  className="w-full rounded-full bg-[#c1352c] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#9f271f]"
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
            <p className="text-sm font-semibold text-[#6d1030]">
              {simpleEventEditState.eventLabel}
            </p>
            <label className="block text-base font-semibold text-[#6d1030]">
              Team
              <select
                value={simpleEventEditState.teamKey}
                onChange={(event) =>
                  setSimpleEventEditState((prev) => ({ ...prev, teamKey: event.target.value }))
                }
                className="mt-2 w-full rounded-full border border-[#6d1030]/40 bg-[#f6e7eb] px-4 py-2 text-sm text-[#6d1030] focus:border-[#6d1030] focus:outline-none"
              >
                <option value="">Unassigned</option>
                <option value="A">{displayTeamA}</option>
                <option value="B">{displayTeamB}</option>
              </select>
            </label>
            <div className="space-y-1.5">
              <button
                type="submit"
                className="w-full rounded-full bg-[#6d1030] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#510b24]"
              >
                Save changes
              </button>
              {simpleEventEditState.logIndex !== null && (
                <button
                  type="button"
                  onClick={handleSimpleEventDelete}
                  className="w-full rounded-full bg-[#c1352c] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#9f271f]"
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

function ActionModal({ title, onClose, children, disableClose = false }) {
  const handleClose = () => {
    if (!disableClose) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-3">
      <div className="w-full max-w-sm rounded-[32px] bg-white p-3 shadow-2xl">
        <div className="mb-2 flex items-start justify-between">
          <h3 className="text-2xl font-semibold text-[#6d1030]">{title}</h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close modal"
            disabled={disableClose}
            className="text-2xl font-semibold text-[#6d1030] transition hover:text-[#4d0b22] disabled:cursor-not-allowed disabled:opacity-40"
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
  const isTeamALayout = log.team === "B";
  const shouldMirror = Boolean(
    log.team &&
      (isScoreLog || isCalahanLog || isTimeoutLog || isPossessionLog || isHalftimeLog || isStoppageStart)
  );
  let bannerBgClass = "bg-[#fdf1f4]";
  let bannerBorderClass = "border-[#6d1030]/20";
  let bannerTextClass = "text-[#6d1030]";

  if (isMatchStartLog || isTimeoutLog) {
    bannerBgClass = "bg-[#e6f9ed]";
    bannerBorderClass = "border-[#34d399]/40";
    bannerTextClass = "text-[#14532d]";
  } else if (isHalftimeLog) {
    bannerBgClass = "bg-[#c7edd7]";
    bannerBorderClass = "border-[#2f7c50]/30";
    bannerTextClass = "text-[#1c4731]";
  } else if (isCalahanLog) {
    bannerBgClass = "bg-[#fff7cc]";
    bannerBorderClass = "border-[#f2c94c]/50";
    bannerTextClass = "text-[#7a5200]";
  } else if (isScoreLog && log.team === "A") {
    bannerBgClass = "bg-[#fff1e0]";
    bannerBorderClass = "border-[#f6a45a]/40";
    bannerTextClass = "text-[#7c3915]";
  } else if (isScoreLog && log.team === "B") {
    bannerBgClass = "bg-[#e3f1ff]";
    bannerBorderClass = "border-[#58a6ff]/40";
    bannerTextClass = "text-[#0f416c]";
  } else if (isStoppageStart) {
    bannerBgClass = "bg-[#ffe4e6]";
    bannerBorderClass = "border-[#fb7185]";
    bannerTextClass = "text-[#7f1024]";
  }

  const isScoringDisplay = isScoreLog || isCalahanLog;
  const infoBlock = (
    <div className={isTeamALayout ? "text-right" : ""}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
        {isMatchStartLog ? "Match start" : log.eventDescription || "Match event"}
        {!isScoringDisplay && !isMatchStartLog && shortTeamLabel ? ` - ${shortTeamLabel}` : ""}
      </p>
      {isMatchStartLog && (
        <p className="text-sm opacity-80">Pulling team: {fullTeamLabel || "Unassigned"}</p>
      )}
      {!isMatchStartLog && abbaDescriptor && (
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
          {abbaDescriptor}
        </p>
      )}
      {isScoringDisplay && shortTeamLabel && (
        <p className="text-base font-semibold">{shortTeamLabel}</p>
      )}
      <p className="text-xs opacity-70">{eventTime}</p>
    </div>
  );

  const renderCenterIndicator = () => {
    if (!shouldMirror) return null;
    return (
      <div className="col-start-2 mx-auto flex flex-col items-center justify-self-center text-base font-semibold">
        {isCalahanLog && (
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
            {log.team === "B" ? "B layout" : "A layout"}
          </p>
        )}
        {isScoreLog || isCalahanLog
          ? `${log.totalA} - ${log.totalB}`
          : isTimeoutLog
            ? "Timeout"
            : isPossessionLog
              ? "Possession"
              : isHalftimeLog
                ? "Halftime"
                : isStoppageStart
                  ? "Stoppage"
                  : ""}
      </div>
    );
  };

  return (
    <div
      className={`rounded-2xl border px-3 py-2 text-sm ${bannerBgClass} ${bannerBorderClass} ${bannerTextClass}`}
    >
      {shouldMirror ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {isTeamALayout ? (
            <>
              <div aria-hidden="true" />
              {renderCenterIndicator()}
              <div className="col-start-3">{infoBlock}</div>
            </>
          ) : (
            <>
              {infoBlock}
              {renderCenterIndicator()}
              <div aria-hidden="true" />
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">{infoBlock}</div>
      )}

      {isScoringDisplay ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <div>
            <p className="font-semibold">{log.team === "A" ? displayTeamA : displayTeamB}</p>
            {isCalahanLog ? (
              <p className="text-[#6d1030]/70 font-semibold uppercase">CALAHAN!!</p>
            ) : (
              <p className="text-[#6d1030]/70">
                Scorer: {log.scorerName || "Unassigned"}
                {log.assistName ? ` - Assist: ${log.assistName}` : ""}
              </p>
            )}
          </div>
          {log.team && (
            <button
              type="button"
              onClick={() => openScoreModal(log.team, "edit", editIndex)}
              className="ml-auto rounded-full border border-[#6d1030]/40 px-4 py-1 text-xs font-semibold text-[#6d1030] transition hover:bg-white"
            >
              Edit event
            </button>
          )}
        </div>
      ) : (
        (isTimeoutLog || isPossessionLog) &&
        log.team && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => openSimpleEventModal(log, editIndex)}
              className="rounded-full border border-[#6d1030]/40 px-4 py-1 text-xs font-semibold text-[#6d1030] transition hover:bg-white"
            >
              Edit event
            </button>
          </div>
        )
      )}
    </div>
  );
}







