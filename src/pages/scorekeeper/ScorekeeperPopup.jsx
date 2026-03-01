import { Fragment } from "react";
import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import { CALAHAN_ASSIST_VALUE, SCORE_NA_PLAYER_VALUE } from "./scorekeeperConstants";
import { formatClock, formatMatchLabel } from "./scorekeeperUtils";

const SIMPLE_EVENT_DELETE_ONLY_CODES = new Set([
  MATCH_LOG_EVENT_CODES.HALFTIME_START,
  MATCH_LOG_EVENT_CODES.HALFTIME_END,
  MATCH_LOG_EVENT_CODES.STOPPAGE_START,
  MATCH_LOG_EVENT_CODES.STOPPAGE_END,
]);

export function ScorekeeperPopups({
  resume = {},
  setup = {},
  possession = {},
  possessionDelete = {},
  endMatch = {},
  time = {},
  score = {},
  simpleEvent = {},
}) {
  const { candidate, handled, busy, error, onResume, onDiscard } = resume;
  const {
    open: setupOpen,
    onClose: onSetupClose,
    onSubmit: onSetupSubmit,
    events = [],
    eventsLoading,
    eventsError,
    selectedEventId,
    onSelectEvent,
    onSelectMatch,
    matches = [],
    matchesLoading,
    matchesError,
    selectedMatchId,
    onRefreshMatches,
    rules = {},
    setRules,
    setupForm = {},
    setSetupForm,
    teamAId,
    teamBId,
    displayTeamA: setupDisplayTeamA,
    displayTeamB: setupDisplayTeamB,
    isAbbaEnabled,
    initialising,
    selectedMatch,
    isStartMatchReady,
  } = setup;
  const {
    open: possessionOpen,
    onClose: onPossessionClose,
    pendingTeam: pendingPossessionTeam,
    displayTeamA: possessionDisplayTeamA,
    displayTeamB: possessionDisplayTeamB,
    result: possessionResult,
    onResultChange: onPossessionResultChange,
    activeActorOptions = [],
    actorId: possessionActorId,
    onActorSelect: onPossessionActorSelect,
    renderPlayerGridLabel: renderPossessionPlayerLabel,
    editIndex: possessionEditIndex,
    onOpenDelete: onPossessionDeleteOpen,
  } = possession;
  const {
    open: possessionDeleteOpen,
    onClose: onPossessionDeleteClose,
    onDelete: onPossessionDelete,
  } = possessionDelete;
  const {
    open: endMatchOpen,
    busy: endMatchBusy,
    onClose: onEndMatchClose,
    onConfirm: onEndMatchConfirm,
  } = endMatch;
  const {
    open: timeOpen,
    onClose: onTimeClose,
    stoppageActive,
    halftimeDisabled,
    halftimeTypeLabel,
    onHalfTime,
    onTimeout,
    remainingTimeouts = { A: 0, B: 0 },
    displayTeamA: timeDisplayTeamA,
    displayTeamB: timeDisplayTeamB,
    displayTeamAShort,
    displayTeamBShort,
    halfRemainingLabel,
    onGameStoppage,
    timerRunning,
    onToggleTimer,
  } = time;
  const {
    state: scoreModalState,
    onClose: onScoreClose,
    onSubmit: onScoreSubmit,
    onDelete: onScoreDelete,
    isFormValid: isScoreFormValid,
    scorerAssistClash,
    form: scoreForm = {},
    setForm: setScoreForm,
    rosterOptions = [],
    renderPlayerGridLabel: renderScorePlayerLabel,
    displayTeamA: scoreDisplayTeamA,
    displayTeamB: scoreDisplayTeamB,
  } = score;
  const {
    state: simpleEventState,
    setState: setSimpleEventState,
    onClose: onSimpleEventClose,
    onSubmit: onSimpleEventSubmit,
    onDelete: onSimpleEventDelete,
    displayTeamA: simpleEventDisplayTeamA,
    displayTeamB: simpleEventDisplayTeamB,
  } = simpleEvent;

  const normalizedSimpleEventCode = `${simpleEventState?.eventCode || ""}`.toLowerCase();
  const isSimpleEventDeleteOnly = SIMPLE_EVENT_DELETE_ONLY_CODES.has(normalizedSimpleEventCode);

  return (
    <Fragment>
      {candidate && !handled && (
        <ActionModal title="Resume previous session?" onClose={onDiscard}>
          <div className="space-y-3 text-sm text-[#0f5132]">
            <p>
              A previous session for this match was saved{" "}
              {candidate.updatedAt
                ? new Date(candidate.updatedAt).toLocaleString()
                : "recently"}.
            </p>
            {error && (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </p>
            )}
            <div className="space-y-4">
              <button
                type="button"
                onClick={onResume}
                disabled={busy}
                className="inline-flex w-full items-center justify-center rounded-full bg-[#0f5132] px-4 py-2 text-white transition hover:bg-[#0a3b24] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Loading..." : "Resume session"}
              </button>
              <div className="rounded-2xl border border-[#0f5132]/20 bg-[#ecfdf3] p-3 text-xs">
                <p className="font-semibold uppercase tracking-wide text-[#0f5132]/70">
                  Snapshot
                </p>
                <p>
                  Score: {candidate?.score?.a ?? 0} - {candidate?.score?.b ?? 0}
                </p>
                <p>
                  Game clock: {formatClock(candidate?.timer?.seconds ?? 0)}
                  {candidate?.timer?.running ? " (running)" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={onDiscard}
                disabled={busy}
                className="inline-flex w-full items-center justify-center rounded-full border border-[#0f5132]/40 px-4 py-2 font-semibold text-[#0f5132] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Start new
              </button>
            </div>
          </div>
        </ActionModal>
      )}

      {setupOpen && (
        <ActionModal title="Match setup" onClose={onSetupClose}>
          <form className="space-y-4" onSubmit={onSetupSubmit}>
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
                      if (onSelectEvent) {
                        onSelectEvent(value);
                      }
                      if (onSelectMatch) {
                        onSelectMatch(null);
                      }
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
                    onClick={() => {
                      if (onRefreshMatches) {
                        void onRefreshMatches();
                      }
                    }}
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
                    onChange={(event) => {
                      if (onSelectMatch) {
                        onSelectMatch(event.target.value || null);
                      }
                    }}
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
                <span className="shrink-0">Time cap (min)</span>
                <input
                  type="number"
                  min="1"
                  value={rules.matchDuration}
                  onChange={(event) => {
                    if (!setRules) return;
                    setRules((prev) => ({
                      ...prev,
                      matchDuration: Number(event.target.value) || 0,
                    }));
                  }}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Time cap end mode</span>
                <select
                  value={rules.gameHardCapEndMode || "afterPoint"}
                  onChange={(event) => {
                    if (!setRules) return;
                    setRules((prev) => ({
                      ...prev,
                      gameHardCapEndMode: event.target.value,
                    }));
                  }}
                  className="flex-1 min-w-[150px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="afterPoint">After point</option>
                  <option value="immediate">Immediate</option>
                </select>
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Time cap target</span>
                <select
                  value={rules.gameTimeCapTargetMode || "none"}
                  onChange={(event) => {
                    if (!setRules) return;
                    setRules((prev) => ({
                      ...prev,
                      gameTimeCapTargetMode: event.target.value,
                    }));
                  }}
                  className="flex-1 min-w-[150px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="none">None</option>
                  <option value="addOneToHighest">Highest + 1</option>
                </select>
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Halftime cap (min)</span>
                <input
                  type="number"
                  min="0"
                  value={rules.halftimeMinutes}
                  onChange={(event) => {
                    if (!setRules) return;
                    setRules((prev) => ({
                      ...prev,
                      halftimeMinutes: Number(event.target.value) || 0,
                    }));
                  }}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Halftime cap end mode</span>
                <select
                  value={rules.halftimeCapEndMode || "afterPoint"}
                  onChange={(event) => {
                    if (!setRules) return;
                    setRules((prev) => ({
                      ...prev,
                      halftimeCapEndMode: event.target.value,
                    }));
                  }}
                  className="flex-1 min-w-[150px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="afterPoint">After point</option>
                  <option value="immediate">Immediate</option>
                </select>
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Halftime cap target</span>
                <select
                  value={rules.halftimeCapTargetMode || "none"}
                  onChange={(event) => {
                    if (!setRules) return;
                    setRules((prev) => ({
                      ...prev,
                      halftimeCapTargetMode: event.target.value,
                    }));
                  }}
                  className="flex-1 min-w-[150px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="none">None</option>
                  <option value="addOneToHighest">Highest + 1</option>
                </select>
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Halftime break (min)</span>
                <input
                  type="number"
                  min="0"
                  value={rules.halftimeBreakMinutes}
                  onChange={(event) => {
                    if (!setRules) return;
                    setRules((prev) => ({
                      ...prev,
                      halftimeBreakMinutes: Number(event.target.value) || 0,
                    }));
                  }}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Timeout duration (sec)</span>
                <input
                  type="number"
                  min="0"
                  value={rules.timeoutSeconds}
                  onChange={(event) => {
                    if (!setRules) return;
                    setRules((prev) => ({
                      ...prev,
                      timeoutSeconds: Number(event.target.value) || 0,
                    }));
                  }}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Timeouts total</span>
                <input
                  type="number"
                  min="0"
                  value={rules.timeoutsTotal}
                  onChange={(event) => {
                    if (!setRules) return;
                    setRules((prev) => ({
                      ...prev,
                      timeoutsTotal: Number(event.target.value) || 0,
                    }));
                  }}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Timeouts per half</span>
                <input
                  type="number"
                  min="0"
                  value={rules.timeoutsPerHalf}
                  onChange={(event) => {
                    if (!setRules) return;
                    setRules((prev) => ({
                      ...prev,
                      timeoutsPerHalf: Number(event.target.value) || 0,
                    }));
                  }}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-right text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                <span className="shrink-0">Pulling team</span>
                <select
                  value={setupForm.startingTeamId || ""}
                  onChange={(event) => {
                    if (!setSetupForm) return;
                    setSetupForm((prev) => ({
                      ...prev,
                      startingTeamId: event.target.value || "",
                    }));
                  }}
                  className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Select team...</option>
                  {teamAId && <option value={teamAId}>{setupDisplayTeamA}</option>}
                  {teamBId && <option value={teamBId}>{setupDisplayTeamB}</option>}
                </select>
              </label>
              {isAbbaEnabled && (
                <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
                  <span className="shrink-0">ABBA</span>
                  <select
                    value={setupForm.abbaPattern}
                    onChange={(event) => {
                      if (!setSetupForm) return;
                      setSetupForm((prev) => ({
                        ...prev,
                        abbaPattern: event.target.value,
                      }));
                    }}
                    className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Select line...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </label>
              )}
            </div>
            <button
              type="submit"
              disabled={initialising || !selectedMatch || !isStartMatchReady}
              className="w-full rounded-full bg-[#0f5132] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0a3b24] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {initialising ? "Initialising..." : "Initialise"}
            </button>
          </form>
        </ActionModal>
      )}

      {possessionOpen && (
        <ActionModal title="Possession change" onClose={onPossessionClose} alignTop scrollable>
          <div className="space-y-3 text-[#0f5132]">
            <p className="text-sm font-semibold">
              {pendingPossessionTeam === "A"
                ? `${possessionDisplayTeamA} in possession`
                : pendingPossessionTeam === "B"
                  ? `${possessionDisplayTeamB} in possession`
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
                    if (onPossessionResultChange) {
                      onPossessionResultChange("throwaway");
                    }
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
                    if (onPossessionResultChange) {
                      onPossessionResultChange("block");
                    }
                    const blockTeam =
                      pendingPossessionTeam === "A"
                        ? "B"
                        : pendingPossessionTeam === "B"
                          ? "A"
                          : null;
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
                  onClick={() => {
                    if (onPossessionActorSelect) {
                      onPossessionActorSelect("");
                    }
                  }}
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
                    onClick={() => {
                      if (onPossessionActorSelect) {
                        onPossessionActorSelect(player.id);
                      }
                    }}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                      possessionActorId === player.id
                        ? "border-[#0f5132] bg-[#0f5132] text-white"
                        : "border-[#0f5132]/30 bg-white text-[#0f5132] hover:border-[#0f5132]/60"
                    }`}
                  >
                    {renderPossessionPlayerLabel ? renderPossessionPlayerLabel(player) : player.name}
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
                onClick={onPossessionDeleteOpen}
                className="w-full rounded-full bg-[#b91c1c] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#991b1b]"
              >
                Delete possession event
              </button>
            )}
          </div>
        </ActionModal>
      )}

      {possessionDeleteOpen && (
        <ActionModal title="Delete possession event?" onClose={onPossessionDeleteClose}>
          <div className="space-y-3 text-sm text-[#0f5132]">
            <p>This will remove the turnover/block event from the match log.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={onPossessionDeleteClose}
                className="inline-flex items-center justify-center rounded-full border border-[#0f5132]/40 px-4 py-2 font-semibold text-[#0f5132] transition hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onPossessionDelete}
                className="inline-flex items-center justify-center rounded-full bg-[#b91c1c] px-4 py-2 font-semibold text-white transition hover:bg-[#991b1b]"
              >
                Delete
              </button>
            </div>
          </div>
        </ActionModal>
      )}

      {endMatchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] px-4 py-3">
          <div className="w-full max-w-sm rounded-[32px] border-4 border-[#b91c1c] bg-[#fee2e2] p-4">
            <div className="mb-3 flex items-start justify-between">
              <h3 className="text-2xl font-semibold text-[#7f1d1d]">End match?</h3>
              <button
                type="button"
                onClick={onEndMatchClose}
                disabled={endMatchBusy}
                aria-label="Close modal"
                className="text-2xl font-semibold text-[#7f1d1d] transition hover:text-[#5f1313] disabled:cursor-not-allowed disabled:opacity-40"
              >
                X
              </button>
            </div>
            <p className="text-sm text-[#7f1d1d]">
              End this match and clear local data? You can still enter spirit scores next.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={onEndMatchClose}
                disabled={endMatchBusy}
                className="inline-flex items-center justify-center rounded-full border border-[#7f1d1d]/40 bg-white/70 px-4 py-2 font-semibold text-[#7f1d1d] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onEndMatchConfirm}
                disabled={endMatchBusy}
                className="inline-flex items-center justify-center rounded-full bg-[#b91c1c] px-4 py-2 font-semibold text-white transition hover:bg-[#991b1b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {endMatchBusy ? "Ending..." : "End match"}
              </button>
            </div>
          </div>
        </div>
      )}

      {timeOpen && (
        <ActionModal
          title="Time additions"
          onClose={() => {
            if (!stoppageActive && onTimeClose) {
              onTimeClose();
            }
          }}
          disableClose={stoppageActive}
        >
          <div className="space-y-2 text-center text-sm text-[#0f5132]">
            <button
              type="button"
              onClick={() => {
                if (onHalfTime) {
                  onHalfTime();
                }
              }}
              disabled={stoppageActive || halftimeDisabled}
              className={`w-full rounded-full px-3 py-2 text-sm font-semibold transition ${
                stoppageActive || halftimeDisabled
                  ? "bg-slate-300 text-slate-600"
                  : "bg-[#0f5132] text-white hover:bg-[#0a3b24]"
              }`}
            >
              Half Time
            </button>
            <p className="text-xs text-[#0f5132]/80">
              Trigger: {halftimeTypeLabel || "Unknown"}
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-base font-semibold">{timeDisplayTeamA}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (onTimeout) {
                      onTimeout("A");
                    }
                  }}
                  disabled={stoppageActive || remainingTimeouts.A === 0}
                  className="mt-1.5 w-full rounded-full bg-[#162e6a] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#1e4fd7] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Timeout {displayTeamAShort || "A"}
                </button>
                <p className="mt-1 text-xs">
                  Remaining (total): {remainingTimeouts.A}
                  {remainingTimeouts.A > 0 && (
                    <>
                      <br />
                      Remaining (half): {halfRemainingLabel ? halfRemainingLabel("A") : 0}
                    </>
                  )}
                </p>
                {remainingTimeouts.A === 0 && (
                  <p className="mt-1 text-[11px] font-semibold text-[#991b1b]">
                    If called, +2 on the stall count
                  </p>
                )}
              </div>

              <div>
                <p className="text-base font-semibold">{timeDisplayTeamB}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (onTimeout) {
                      onTimeout("B");
                    }
                  }}
                  disabled={stoppageActive || remainingTimeouts.B === 0}
                  className="mt-1.5 w-full rounded-full bg-[#162e6a] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#1e4fd7] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Timeout {displayTeamBShort || "B"}
                </button>
                <p className="mt-1 text-xs">
                  Remaining (total): {remainingTimeouts.B}
                  {remainingTimeouts.B > 0 && (
                    <>
                      <br />
                      Remaining (half): {halfRemainingLabel ? halfRemainingLabel("B") : 0}
                    </>
                  )}
                </p>
                {remainingTimeouts.B === 0 && (
                  <p className="mt-1 text-[11px] font-semibold text-[#991b1b]">
                    If called, +2 on the stall count
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (stoppageActive) {
                  if (!timerRunning && onToggleTimer) {
                    onToggleTimer();
                  }
                  return;
                }
                if (onGameStoppage) {
                  onGameStoppage();
                }
              }}
              className="w-full rounded-full bg-[#b91c1c] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#991b1b]"
            >
              {stoppageActive ? "End stoppage" : "Game stoppage"}
            </button>

            {stoppageActive && (
              <div className="space-y-2 rounded-2xl border border-[#ef4444]/70 bg-[#fee2e2] p-3 text-left">
                <p className="text-base font-semibold text-[#991b1b]">Stoppage active</p>
                <p className="text-xs text-[#991b1b]/80">
                  Use the stoppage button above to end the stoppage and resume play.
                </p>
              </div>
            )}
          </div>
        </ActionModal>
      )}

      {scoreModalState?.open && (
        <ActionModal
          title={scoreModalState.mode === "edit" ? "Edit score" : "Add score"}
          onClose={onScoreClose}
        >
          <form className="space-y-2" onSubmit={onScoreSubmit}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#0f5132]/70">
              Team: {scoreModalState.team === "B" ? scoreDisplayTeamB : scoreDisplayTeamA}
            </p>
            <label className="block text-base font-semibold text-[#0f5132]">
              Scorer:
              <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-[#0f5132]/30 bg-white/70 p-2">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!setScoreForm) return;
                      setScoreForm((prev) => ({ ...prev, scorerId: SCORE_NA_PLAYER_VALUE }));
                    }}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                      scoreForm.scorerId === SCORE_NA_PLAYER_VALUE
                        ? "border-[#0f5132] bg-[#0f5132] text-white"
                        : "border-[#0f5132]/30 bg-white text-[#0f5132] hover:border-[#0f5132]/60"
                    }`}
                    aria-pressed={scoreForm.scorerId === SCORE_NA_PLAYER_VALUE}
                  >
                    N/A
                  </button>
                  {rosterOptions.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => {
                        if (!setScoreForm) return;
                        setScoreForm((prev) => ({ ...prev, scorerId: player.id }));
                      }}
                      className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                        scoreForm.scorerId === player.id
                          ? "border-[#0f5132] bg-[#0f5132] text-white"
                          : "border-[#0f5132]/30 bg-white text-[#0f5132] hover:border-[#0f5132]/60"
                      }`}
                      aria-pressed={scoreForm.scorerId === player.id}
                    >
                      {renderScorePlayerLabel ? renderScorePlayerLabel(player) : player.name}
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
                    onClick={() => {
                      if (!setScoreForm) return;
                      setScoreForm((prev) => ({ ...prev, assistId: SCORE_NA_PLAYER_VALUE }));
                    }}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                      scoreForm.assistId === SCORE_NA_PLAYER_VALUE
                        ? "border-[#0f5132] bg-[#0f5132] text-white"
                        : "border-[#0f5132]/30 bg-white text-[#0f5132] hover:border-[#0f5132]/60"
                    }`}
                    aria-pressed={scoreForm.assistId === SCORE_NA_PLAYER_VALUE}
                  >
                    N/A
                  </button>
                  {rosterOptions.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => {
                        if (!setScoreForm) return;
                        setScoreForm((prev) => ({ ...prev, assistId: player.id }));
                      }}
                      className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                        scoreForm.assistId === player.id
                          ? "border-[#0f5132] bg-[#0f5132] text-white"
                          : "border-[#0f5132]/30 bg-white text-[#0f5132] hover:border-[#0f5132]/60"
                      }`}
                      aria-pressed={scoreForm.assistId === player.id}
                    >
                      {renderScorePlayerLabel ? renderScorePlayerLabel(player) : player.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      if (!setScoreForm) return;
                      setScoreForm((prev) => ({ ...prev, assistId: CALAHAN_ASSIST_VALUE }));
                    }}
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
                  {scorerAssistClash
                    ? "Scorer and assist must be different players."
                    : "Choose both a scorer and an assist to log this score."}
                </p>
              )}
              {scoreModalState.mode === "edit" ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (onScoreDelete) {
                        onScoreDelete(scoreModalState.logIndex);
                      }
                    }}
                    className="w-full rounded-full bg-[#b91c1c] px-3 py-3 text-sm font-semibold text-white transition hover:bg-[#991b1b]"
                  >
                    Delete
                  </button>
                  <button
                    type="submit"
                    disabled={!isScoreFormValid}
                    className={`w-full rounded-full px-3 py-3 text-sm font-semibold text-white transition ${
                      isScoreFormValid ? "bg-[#0f5132] hover:bg-[#0a3b24]" : "bg-slate-400 opacity-70"
                    }`}
                  >
                    Update score
                  </button>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={!isScoreFormValid}
                  className={`w-full rounded-full px-3 py-1.5 text-sm font-semibold text-white transition ${
                    isScoreFormValid ? "bg-[#0f5132] hover:bg-[#0a3b24]" : "bg-slate-400 opacity-70"
                  }`}
                >
                  Add score
                </button>
              )}
            </div>
          </form>
        </ActionModal>
      )}

      {simpleEventState?.open && (
        <ActionModal title="Edit event" onClose={onSimpleEventClose}>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              if (isSimpleEventDeleteOnly) {
                event.preventDefault();
                return;
              }
              if (onSimpleEventSubmit) {
                onSimpleEventSubmit(event);
              }
            }}
          >
            <p className="text-sm font-semibold text-[#0f5132]">
              {simpleEventState.eventLabel}
            </p>
            {!isSimpleEventDeleteOnly && (
              <label className="block text-base font-semibold text-[#0f5132]">
                Team
                <select
                  value={simpleEventState.teamKey}
                  onChange={(event) => {
                    if (!setSimpleEventState) return;
                    setSimpleEventState((prev) => ({ ...prev, teamKey: event.target.value }));
                  }}
                  className="mt-2 w-full rounded-full border border-[#0f5132]/40 bg-[#d4f4e2] px-4 py-2 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none"
                >
                  <option value="">Unassigned</option>
                  <option value="A">{simpleEventDisplayTeamA}</option>
                  <option value="B">{simpleEventDisplayTeamB}</option>
                </select>
              </label>
            )}
            <div className="space-y-1.5">
              {!isSimpleEventDeleteOnly && (
                <button
                  type="submit"
                  className="w-full rounded-full bg-[#0f5132] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
                >
                  Save changes
                </button>
              )}
              {simpleEventState.logIndex !== null && (
                <button
                  type="button"
                  onClick={onSimpleEventDelete}
                  className="w-full rounded-full bg-[#b91c1c] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#991b1b]"
                >
                  Delete
                </button>
              )}
            </div>
          </form>
        </ActionModal>
      )}
    </Fragment>
  );
}

function ActionModal({
  title,
  onClose,
  children,
  disableClose = false,
  alignTop = false,
  scrollable = false,
}) {
  const handleClose = () => {
    if (!disableClose && onClose) {
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
        className={`w-full max-w-sm rounded-[32px] bg-white p-3 ${
          scrollable ? "max-h-[85vh] overflow-y-auto" : ""
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
        {children}
      </div>
    </div>
  );
}
