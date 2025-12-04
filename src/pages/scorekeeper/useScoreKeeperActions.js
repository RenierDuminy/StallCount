import { useNavigate } from "react-router-dom";
import { initialiseMatch, updateMatchStatus } from "../../services/matchService";
import { updateScore } from "../../services/realtimeService";
import { MATCH_LOG_EVENT_CODES, deleteMatchLogEntry, updateMatchLogEntry } from "../../services/matchLogService";
import {
  DEFAULT_DURATION,
  DEFAULT_SECONDARY_LABEL,
  DEFAULT_TIMER_LABEL,
  DEFAULT_TIMEOUT_SECONDS,
  DEFAULT_INTERPOINT_SECONDS,
  HALFTIME_SCORE_THRESHOLD,
  CALAHAN_ASSIST_VALUE,
} from "./scorekeeperConstants";

export function useScoreKeeperActions(controller) {
  const navigate = useNavigate();
  const DB_WRITES_DISABLED = false;

  function cancelPrimaryHoldReset() {
    if (controller.primaryResetRef.current) {
      clearTimeout(controller.primaryResetRef.current);
      controller.primaryResetRef.current = null;
    }
  }

  function startPrimaryHoldReset() {
    cancelPrimaryHoldReset();
    controller.primaryResetRef.current = setTimeout(() => {
      controller.commitPrimaryTimerState(controller.matchDuration * 60, false);
      controller.setTimerLabel(DEFAULT_TIMER_LABEL);
    }, 800);
  }

  function cancelSecondaryHoldReset() {
    if (controller.secondaryResetRef.current) {
      clearTimeout(controller.secondaryResetRef.current);
      controller.secondaryResetRef.current = null;
    }
  }

  function startSecondaryHoldReset() {
    cancelSecondaryHoldReset();
    controller.secondaryResetRef.current = setTimeout(() => {
      handleSecondaryReset();
      controller.secondaryResetTriggeredRef.current = true;
    }, 800);
  }

  async function handleInitialiseMatch(event) {
    event.preventDefault();
    if (!controller.selectedMatch) return;
    if (!controller.userId) {
      controller.setConsoleError("You must be signed in to initialise a match.");
      return;
    }
    const normalizedStatus = (controller.selectedMatch.status || "").toLowerCase();
    if (normalizedStatus === "finished" || normalizedStatus === "completed") {
      controller.setConsoleError("This match is finished and cannot be initialised.");
      return;
    }

    controller.setInitialising(true);
    controller.setConsoleError(null);
    try {
      const payload = {
        start_time: controller.setupForm.startTime
          ? new Date(controller.setupForm.startTime).toISOString()
          : new Date().toISOString(),
        starting_team_id:
          controller.setupForm.startingTeamId ||
          controller.selectedMatch.team_a?.id ||
          controller.selectedMatch.team_b?.id,
        abba_pattern: controller.rules.abbaPattern,
        scorekeeper: controller.userId,
      };

      const updated = await initialiseMatch(controller.selectedMatch.id, payload);

      controller.setActiveMatch(updated);
      controller.setSelectedMatchId(updated.id);
      controller.setMatches((prev) => prev.map((match) => (match.id === updated.id ? updated : match)));

      const rosterPromise = (async () => {
        const teamA = updated.team_a?.id || null;
        const teamB = updated.team_b?.id || null;
        if (!teamA && !teamB) {
          controller.setRosters({ teamA: [], teamB: [] });
          return;
        }
        controller.setRostersLoading(true);
        controller.setRostersError(null);
        try {
          const rosterData = await controller.fetchRostersForTeams(teamA, teamB);
          controller.setRosters(rosterData);
        } catch (err) {
          controller.setRostersError(
            err instanceof Error ? err.message : "Failed to load rosters."
          );
        } finally {
          controller.setRostersLoading(false);
        }
      })();

      await Promise.all([
        rosterPromise,
        controller.loadMatchEventDefinitions(),
        controller.refreshMatchLogs(updated.id, {
          a: updated.score_a ?? 0,
          b: updated.score_b ?? 0,
        }),
      ]);

      await controller.loadMatches(undefined, { preferredMatchId: updated.id });

      controller.setSetupModalOpen(false);
    } catch (err) {
      controller.setConsoleError(err.message || "Failed to initialise match.");
    } finally {
      controller.setInitialising(false);
    }
  }

  function handleToggleTimer() {
    cancelPrimaryHoldReset();
    if (!controller.consoleReady) return;
    if (!controller.timerRunning) {
      const base = controller.timerSeconds > 0 ? controller.timerSeconds : controller.matchDuration * 60;
      controller.commitPrimaryTimerState(base, true);
      return;
    }
    const remaining = controller.getPrimaryRemainingSeconds();
    controller.commitPrimaryTimerState(remaining, false);
  }

  function normalizeSecondaryLabel(input) {
    if (typeof input !== "string") return null;
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function handleSecondaryToggle(label) {
    if (controller.secondaryResetTriggeredRef.current) {
      controller.secondaryResetTriggeredRef.current = false;
      cancelSecondaryHoldReset();
      return;
    }
    cancelSecondaryHoldReset();
    if (!controller.consoleReady) return;
    const overrideLabel = normalizeSecondaryLabel(label);
    const resolvedLabel = overrideLabel || controller.secondaryLabel || DEFAULT_SECONDARY_LABEL;
    if (!controller.secondaryRunning && controller.secondarySeconds === 0) {
      controller.startSecondaryTimer(
        controller.rules.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS,
        resolvedLabel
      );
      return;
    }
    if (overrideLabel) {
      controller.setSecondaryLabel(overrideLabel);
    }
    if (controller.secondaryRunning) {
      const remaining = controller.getSecondaryRemainingSeconds();
      controller.commitSecondaryTimerState(remaining, false);
      return;
    }
    const base =
      controller.secondarySeconds > 0
        ? controller.secondarySeconds
        : controller.rules.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS;
    controller.commitSecondaryTimerState(base, true);
  }

  function handleSecondaryReset() {
    const fallback = Number.isFinite(controller.secondaryTotalSeconds)
      ? controller.secondaryTotalSeconds
      : controller.rules.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS;
    controller.commitSecondaryTimerState(fallback, false);
    controller.setSecondaryTotalSeconds(fallback);
    controller.setSecondaryFlashActive(false);
    controller.setSecondaryFlashPulse(false);
  }

  function handleStartMatch() {
    if (!controller.consoleReady) return;
    if (!controller.timerRunning) {
      handleToggleTimer();
    }
    controller.setMatchStarted(true);
    controller.setTimerLabel("Game time");
    logMatchStartEvent();
    const receivingTeam = controller.matchStartingTeamKey === "A" ? "B" : "A";
    if (receivingTeam) {
      void controller.updatePossession(receivingTeam, { logTurnover: false });
    }
  }

  async function logMatchStartEvent() {
    if (!controller.activeMatch?.id) return;
    const eventTypeId = await controller.resolveEventTypeIdLocal(MATCH_LOG_EVENT_CODES.MATCH_START);
    if (!eventTypeId) {
      controller.setConsoleError(
        "Missing `match_start` event type in match_events. Please add it in Supabase."
      );
      return;
    }
    const pullTeamId = controller.startingTeamId || controller.teamAId || controller.teamBId;
    const teamKey = pullTeamId === controller.teamBId ? "B" : "A";
    const timestamp = new Date().toISOString();
    const appended = controller.appendLocalLog({
      team: teamKey,
      timestamp,
      scorerId: null,
      assistId: null,
      totals: controller.score,
      eventDescription: controller.describeEvent(eventTypeId),
      eventCode: MATCH_LOG_EVENT_CODES.MATCH_START,
    });
    const entry = {
      matchId: controller.activeMatch.id,
      eventTypeId,
      eventCode: MATCH_LOG_EVENT_CODES.MATCH_START,
      teamId: pullTeamId || null,
      createdAt: timestamp,
      abbaLine: null,
    };
    controller.recordPendingEntry(entry);
  }

  async function logMatchEndEvent() {
    if (!controller.activeMatch?.id) return;
    await controller.logSimpleEvent(MATCH_LOG_EVENT_CODES.MATCH_END);
  }

  async function handleAddScore(team, scorerId = null, assistId = null, options = {}) {
    if (!controller.consoleReady || !controller.activeMatch?.id) return;
    const { isCalahan = false } = options;
    const eventCode = isCalahan ? MATCH_LOG_EVENT_CODES.CALAHAN : MATCH_LOG_EVENT_CODES.SCORE;
    const eventTypeId = await controller.resolveEventTypeIdLocal(eventCode);
    if (!eventTypeId) {
      controller.setConsoleError(
        "Missing `score` event type in match_events. Please add it in Supabase before logging."
      );
      return;
    }
    const targetTeamId = team === "A" ? controller.teamAId : controller.teamBId;
    if (!targetTeamId) {
      controller.setConsoleError("Missing team mapping for this match.");
      return;
    }

    const nextTotals = {
      a: controller.score.a + (team === "A" ? 1 : 0),
      b: controller.score.b + (team === "B" ? 1 : 0),
    };
    controller.setScore(nextTotals);

    const timestamp = new Date().toISOString();
    const optimisticId = `${Math.random().toString(16).slice(2)}`;
    const appended = controller.appendLocalLog({
      team,
      timestamp,
      scorerId,
      assistId,
      totals: nextTotals,
      eventDescription: controller.describeEvent(eventTypeId),
      eventCode,
      optimisticId,
    });
    const entry = {
      matchId: controller.activeMatch.id,
      eventTypeId,
      eventCode,
      teamId: targetTeamId,
      team,
      scorerId,
      assistId,
      createdAt: timestamp,
      abbaLine: appended.abbaLine,
      optimisticId,
    };

    controller.recordPendingEntry(entry);
    await syncActiveMatchScore(nextTotals);
    const receivingTeam = team === "A" ? "B" : "A";
    if (receivingTeam) {
      void controller.updatePossession(receivingTeam, { logTurnover: false });
    }
    if (
      !controller.halftimeTriggered &&
      Math.max(nextTotals.a, nextTotals.b) >=
        (controller.rules.halftimeScoreThreshold || HALFTIME_SCORE_THRESHOLD)
    ) {
      await controller.triggerHalftime();
    }
    controller.startSecondaryTimer(
      controller.rules.interPointSeconds ||
        controller.rules.interPointTimeoutAddsSeconds ||
        controller.rules.timeoutSeconds ||
        DEFAULT_INTERPOINT_SECONDS,
      "Inter point"
    );
  }

  async function syncActiveMatchScore(nextScore) {
    const matchId = controller.activeMatch?.id;
    controller.setActiveMatch((prev) =>
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
    controller.setRules((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (field === "matchDuration") {
      controller.commitPrimaryTimerState((value || DEFAULT_DURATION) * 60, false);
    }
    if (field === "timeoutSeconds") {
      const nextTimeout = value || DEFAULT_TIMEOUT_SECONDS;
      controller.commitSecondaryTimerState(nextTimeout, false);
      controller.setSecondaryTotalSeconds(nextTimeout);
    }
  }

  function openScoreModal(team, mode = "add", logIndex = null) {
    controller.setScoreModalState({
      open: true,
      team,
      mode,
      logIndex,
    });
    if (mode === "edit" && logIndex !== null) {
      const log = controller.logs[logIndex];
      controller.setScoreForm({
        scorerId: log?.scorerId || "",
        assistId:
          log?.eventCode === MATCH_LOG_EVENT_CODES.CALAHAN
            ? CALAHAN_ASSIST_VALUE
            : log?.assistId || "",
      });
    } else {
      controller.setScoreForm({ scorerId: "", assistId: "" });
    }
  }

  function closeScoreModal() {
    controller.setScoreModalState({ open: false, team: null, mode: "add", logIndex: null });
    controller.setScoreForm({ scorerId: "", assistId: "" });
  }

  async function handleScoreModalSubmit(event) {
    event.preventDefault();
    if (!controller.scoreModalState.team) return;
    if (!controller.scoreForm.scorerId || !controller.scoreForm.assistId) {
      return;
    }
    if (
      controller.scoreForm.assistId !== CALAHAN_ASSIST_VALUE &&
      controller.scoreForm.assistId === controller.scoreForm.scorerId
    ) {
      controller.setConsoleError("Scorer and assist must be different players.");
      return;
    }
    const isCalahan = controller.scoreForm.assistId === CALAHAN_ASSIST_VALUE;
    const normalizedAssistId = isCalahan ? null : controller.scoreForm.assistId;

    if (controller.scoreModalState.mode === "edit" && controller.scoreModalState.logIndex !== null) {
      await handleUpdateLog(controller.scoreModalState.logIndex, {
        scorerId: controller.scoreForm.scorerId || null,
        assistId: normalizedAssistId || null,
        eventCode: isCalahan ? MATCH_LOG_EVENT_CODES.CALAHAN : MATCH_LOG_EVENT_CODES.SCORE,
      });
    } else {
      await handleAddScore(
        controller.scoreModalState.team,
        controller.scoreForm.scorerId || null,
        normalizedAssistId || null,
        { isCalahan }
      );
    }

    closeScoreModal();
  }

  async function handleUpdateLog(index, updates) {
    if (index === null || index === undefined) return;
    const targetLog = controller.logs[index];
    if (!targetLog?.id) return;

    try {
      const payload = {};
      if (Object.prototype.hasOwnProperty.call(updates, "teamKey")) {
        const teamId =
          updates.teamKey === "B"
            ? controller.teamBId
            : updates.teamKey === "A"
              ? controller.teamAId
              : null;
        payload.teamId = teamId ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(updates, "scorerId")) {
        payload.actorId =
          Object.prototype.hasOwnProperty.call(updates, "scorerId") && updates.scorerId !== undefined
            ? updates.scorerId
            : targetLog.scorerId ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(updates, "assistId")) {
        payload.secondaryActorId =
          Object.prototype.hasOwnProperty.call(updates, "assistId") && updates.assistId !== undefined
            ? updates.assistId
            : targetLog.assistId ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(updates, "eventCode") && updates.eventCode) {
        payload.eventTypeCode = updates.eventCode;
      }
      await updateMatchLogEntry(targetLog.id, payload);
      const totals = await controller.refreshMatchLogs(
        controller.matchLogMatchId,
        controller.currentMatchScoreRef.current
      );
      if (totals) {
        await syncActiveMatchScore(totals);
      }
    } catch (err) {
      controller.setConsoleError(
        err instanceof Error ? err.message : "Failed to update log entry."
      );
    }
  }

  async function handleDeleteLog(index) {
    if (index === null || index === undefined) return;
    const targetLog = controller.logs[index];
    if (!targetLog) return;

    try {
      await deleteMatchLogEntry(targetLog.id);
      const totals = await controller.refreshMatchLogs(
        controller.matchLogMatchId,
        controller.currentMatchScoreRef.current
      );
      if (totals) {
        await syncActiveMatchScore(totals);
      }
      closeScoreModal();
    } catch (err) {
      controller.setConsoleError(
        err instanceof Error ? err.message : "Failed to delete log entry."
      );
    }
  }

  async function handleTimeoutTrigger(team) {
    if (!controller.consoleReady) return;
    const remaining = Math.max(controller.rules.timeoutsTotal - controller.timeoutUsage[team], 0);
    if (remaining === 0) return;
    controller.setTimeoutUsage((prev) => ({ ...prev, [team]: prev[team] + 1 }));
    await controller.startTrackedSecondaryTimer(
      controller.rules.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS,
      `${team === "A" ? controller.displayTeamA : controller.displayTeamB} timeout`,
      {
        teamKey: team,
        eventStartCode: MATCH_LOG_EVENT_CODES.TIMEOUT_START,
        eventEndCode: MATCH_LOG_EVENT_CODES.TIMEOUT_END,
      }
    );
    if (!controller.stoppageActive) {
      controller.setTimeModalOpen(false);
    }
  }

  async function handleHalfTimeTrigger() {
    await controller.triggerHalftime();
    if (!controller.stoppageActive) {
      controller.setTimeModalOpen(false);
    }
  }

  async function handleGameStoppage() {
    controller.commitPrimaryTimerState(controller.getPrimaryRemainingSeconds(), false);
    controller.commitSecondaryTimerState(controller.getSecondaryRemainingSeconds(), false);
    controller.setSecondaryFlashActive(false);
    controller.setSecondaryFlashPulse(false);
    controller.setSecondaryLabel("Game stoppage");
    controller.setStoppageActive(true);
    await controller.logSimpleEvent(MATCH_LOG_EVENT_CODES.STOPPAGE_START);
  }

  async function handleEndMatchNavigation() {
    if (!controller.canEndMatch || !controller.activeMatch?.id) return;
    const confirmed = window.confirm(
      "End this match and clear local data? You can still enter spirit scores next."
    );
    if (!confirmed) return;
    try {
      await logMatchEndEvent();
      const updated = await updateMatchStatus(controller.activeMatch.id, "finished");
      if (updated) {
        controller.setActiveMatch(updated);
        controller.setMatches((prev) =>
          prev.map((match) => (match.id === updated.id ? updated : match))
        );
      }
      const spiritUrl = `/spirit-scores${controller.activeMatch?.id ? `?matchId=${controller.activeMatch.id}` : ""}`;
      navigate(spiritUrl);
      controller.clearLocalMatchState();
      if (controller.selectedEventId) {
        controller.loadMatches(controller.selectedEventId, {
          preserveSelection: false,
          allowDefaultSelect: false,
        });
      }
    } catch (err) {
      controller.setConsoleError(
        err instanceof Error ? err.message : "Failed to close the match."
      );
    }
  }

  return {
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
  };
}
