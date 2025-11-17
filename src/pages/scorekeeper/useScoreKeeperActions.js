import { useNavigate } from "react-router-dom";
import { initialiseMatch } from "../../services/matchService";
import { updateScore } from "../../services/realtimeService";
import {
  MATCH_LOG_EVENT_CODES,
  deleteMatchLogEntry,
  updateMatchLogEntry,
} from "../../services/matchLogService";
import {
  DEFAULT_DURATION,
  DEFAULT_SECONDARY_LABEL,
  DEFAULT_TIMER_LABEL,
  HALFTIME_SCORE_THRESHOLD,
} from "./scorekeeperConstants";

export function useScoreKeeperActions(controller) {
  const navigate = useNavigate();

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
    }, 800);
  }

  async function handleInitialiseMatch(event) {
    event.preventDefault();
    if (!controller.selectedMatch) return;
    if (!controller.userId) {
      controller.setConsoleError("You must be signed in to initialise a match.");
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
      await controller.loadMatches();

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
    cancelSecondaryHoldReset();
    if (!controller.consoleReady) return;
    const overrideLabel = normalizeSecondaryLabel(label);
    const resolvedLabel = overrideLabel || controller.secondaryLabel || DEFAULT_SECONDARY_LABEL;
    if (!controller.secondaryRunning && controller.secondarySeconds === 0) {
      controller.startSecondaryTimer(controller.rules.timeoutSeconds || 75, resolvedLabel);
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
      controller.secondarySeconds > 0 ? controller.secondarySeconds : controller.rules.timeoutSeconds || 75;
    controller.commitSecondaryTimerState(base, true);
  }

  function handleSecondaryReset() {
    const fallback = Number.isFinite(controller.secondaryTotalSeconds)
      ? controller.secondaryTotalSeconds
      : controller.rules.timeoutSeconds || 75;
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
    const entry = {
      matchId: controller.activeMatch.id,
      eventTypeId,
      eventCode: MATCH_LOG_EVENT_CODES.MATCH_START,
      teamId: pullTeamId || null,
      createdAt: timestamp,
    };
    controller.recordPendingEntry(entry);
    controller.appendLocalLog({
      team: teamKey,
      timestamp,
      scorerId: null,
      assistId: null,
      totals: controller.score,
      eventDescription: controller.describeEvent(eventTypeId),
      eventCode: MATCH_LOG_EVENT_CODES.MATCH_START,
    });
  }

  async function logMatchEndEvent() {
    if (!controller.activeMatch?.id) return;
    await controller.logSimpleEvent(MATCH_LOG_EVENT_CODES.MATCH_END);
  }

  async function handleAddScore(team, scorerId = null, assistId = null) {
    if (!controller.consoleReady || !controller.activeMatch?.id) return;
    const eventTypeId = await controller.resolveEventTypeIdLocal(MATCH_LOG_EVENT_CODES.SCORE);
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
    const entry = {
      matchId: controller.activeMatch.id,
      eventTypeId,
      eventCode: MATCH_LOG_EVENT_CODES.SCORE,
      teamId: targetTeamId,
      team,
      scorerId,
      assistId,
      createdAt: timestamp,
    };

    controller.recordPendingEntry(entry);
    controller.appendLocalLog({
      team,
      timestamp,
      scorerId,
      assistId,
      totals: nextTotals,
      eventDescription: controller.describeEvent(eventTypeId),
      eventCode: MATCH_LOG_EVENT_CODES.SCORE,
    });
    const receivingTeam = team === "A" ? "B" : "A";
    if (receivingTeam) {
      void controller.updatePossession(receivingTeam, { logTurnover: false });
    }
    if (
      !controller.halftimeTriggered &&
      Math.max(nextTotals.a, nextTotals.b) >= HALFTIME_SCORE_THRESHOLD
    ) {
      await controller.triggerHalftime();
    }
    controller.startSecondaryTimer(75, "Inter point");
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
    if (controller.matchSettingsLocked) return;
    controller.setRules((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (field === "matchDuration") {
      controller.commitPrimaryTimerState((value || DEFAULT_DURATION) * 60, false);
    }
    if (field === "timeoutSeconds") {
      const nextTimeout = value || 75;
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
        assistId: log?.assistId || "",
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

    if (controller.scoreModalState.mode === "edit" && controller.scoreModalState.logIndex !== null) {
      await handleUpdateLog(controller.scoreModalState.logIndex, {
        scorerId: controller.scoreForm.scorerId || null,
        assistId: controller.scoreForm.assistId || null,
      });
    } else {
      await handleAddScore(
        controller.scoreModalState.team,
        controller.scoreForm.scorerId || null,
        controller.scoreForm.assistId || null
      );
    }

    closeScoreModal();
  }

  async function handleUpdateLog(index, updates) {
    if (index === null || index === undefined) return;
    const targetLog = controller.logs[index];
    if (!targetLog?.id) return;

    try {
      await updateMatchLogEntry(targetLog.id, {
        scorerId: Object.prototype.hasOwnProperty.call(updates, "scorerId")
          ? updates.scorerId
          : targetLog.scorerId ?? null,
        assistId: Object.prototype.hasOwnProperty.call(updates, "assistId")
          ? updates.assistId
          : targetLog.assistId ?? null,
      });
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
      controller.rules.timeoutSeconds || 75,
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
    await logMatchEndEvent();
    navigate("/spirit-scores");
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
