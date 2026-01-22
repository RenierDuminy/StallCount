import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import {
  CALAHAN_ASSIST_VALUE,
  DEFAULT_SECONDARY_LABEL,
  DEFAULT_TIMEOUT_SECONDS,
  DEFAULT_TIMER_LABEL,
  SCORE_NA_PLAYER_VALUE,
} from "./scrimmageConstants";

function createLocalId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePlayerId(value) {
  if (!value || value === SCORE_NA_PLAYER_VALUE) return null;
  return value;
}

function formatCsvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function useScrimmageActions(controller) {
  function cancelPrimaryHoldReset() {
    if (controller.primaryResetRef.current) {
      clearTimeout(controller.primaryResetRef.current);
      controller.primaryResetRef.current = null;
    }
  }

  function startPrimaryHoldReset() {
    cancelPrimaryHoldReset();
    controller.primaryResetRef.current = setTimeout(() => {
      controller.commitPrimaryTimerState(0, false);
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
    }, 3000);
  }

  function handleInitialiseMatch(event) {
    event.preventDefault();
    controller.setInitialising(true);
    controller.setConsoleError(null);
    try {
      if (!controller.setupForm.startingTeamId) {
        controller.setSetupForm((prev) => ({
          ...prev,
          startingTeamId: controller.teamAId || prev.startingTeamId || "",
        }));
      }
      controller.setConsoleReady(true);
      controller.setSetupModalOpen(false);
    } catch (error) {
      controller.setConsoleError(
        error instanceof Error ? error.message : "Unable to apply scrimmage setup."
      );
    } finally {
      controller.setInitialising(false);
    }
  }

  function handleToggleTimer() {
    cancelPrimaryHoldReset();
    if (!controller.consoleReady) return;
    if (!controller.timerRunning) {
      const base = Number.isFinite(controller.timerSeconds) ? controller.timerSeconds : 0;
      controller.commitPrimaryTimerState(base, true);
      return;
    }
    const elapsed = controller.getPrimaryRemainingSeconds();
    controller.commitPrimaryTimerState(elapsed, false);
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
      const duration = controller.rules.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS;
      controller.commitSecondaryTimerState(duration, true);
      controller.setSecondaryLabel(resolvedLabel);
      controller.setSecondaryTotalSeconds(duration);
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
    controller.setSecondaryTotalSeconds(base);
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

  function findPlayerName(playerId) {
    if (!playerId) return null;
    const roster = [...(controller.sortedRosters?.teamA || []), ...(controller.sortedRosters?.teamB || [])];
    const match = roster.find((player) => player.id === playerId);
    return match?.name || null;
  }

  function rebuildLogsWithTotals(entries) {
    let totalA = 0;
    let totalB = 0;
    let scoreIndex = 0;

    const updated = entries.map((entry) => {
      if (
        entry.eventCode === MATCH_LOG_EVENT_CODES.SCORE ||
        entry.eventCode === MATCH_LOG_EVENT_CODES.CALAHAN
      ) {
        if (entry.team === "A") {
          totalA += 1;
        } else if (entry.team === "B") {
          totalB += 1;
        }
        const next = {
          ...entry,
          totalA,
          totalB,
          scoreOrderIndex: scoreIndex,
          abbaLine: controller.getAbbaLineCode(scoreIndex),
        };
        scoreIndex += 1;
        return next;
      }
      return { ...entry, totalA, totalB };
    });

    return { logs: updated, score: { a: totalA, b: totalB } };
  }

  function openScoreModal(teamKey, mode = "add", logIndex = null) {
    if (!teamKey) return;
    controller.setScoreModalState({ open: true, team: teamKey, mode, logIndex });
    if (mode === "edit" && Number.isFinite(logIndex)) {
      const existing = controller.logs?.[logIndex] || null;
      if (existing) {
        controller.setScoreForm({
          scorerId: existing.scorerId || "",
          assistId: existing.assistId || "",
        });
        return;
      }
    }
    controller.setScoreForm({ scorerId: "", assistId: "" });
  }

  function closeScoreModal() {
    controller.setScoreModalState({ open: false, team: null, mode: "add", logIndex: null });
    controller.setScoreForm({ scorerId: "", assistId: "" });
  }

  function handleScoreModalSubmit(event) {
    event.preventDefault();
    const { team, mode, logIndex } = controller.scoreModalState;
    if (!team) return;

    const scorerId = normalizePlayerId(controller.scoreForm.scorerId);
    const assistIdRaw = controller.scoreForm.assistId;
    const assistId = assistIdRaw === CALAHAN_ASSIST_VALUE ? null : normalizePlayerId(assistIdRaw);
    const isCallahan = assistIdRaw === CALAHAN_ASSIST_VALUE;

    const entry = {
      id: createLocalId("score"),
      eventCode: isCallahan ? MATCH_LOG_EVENT_CODES.CALAHAN : MATCH_LOG_EVENT_CODES.SCORE,
      eventDescription: isCallahan ? "Callahan" : "Score",
      team,
      timestamp: new Date().toISOString(),
      scorerId: scorerId || null,
      assistId: assistIdRaw === CALAHAN_ASSIST_VALUE ? CALAHAN_ASSIST_VALUE : assistId,
      scorerName: findPlayerName(scorerId),
      assistName: assistIdRaw === CALAHAN_ASSIST_VALUE ? "Callahan" : findPlayerName(assistId),
    };

    const nextLogs = [...(controller.logs || [])];
    if (mode === "edit" && Number.isFinite(logIndex) && nextLogs[logIndex]) {
      const existing = nextLogs[logIndex];
      nextLogs[logIndex] = {
        ...entry,
        id: existing.id,
        timestamp: existing.timestamp,
      };
    } else {
      nextLogs.push(entry);
    }

    const { logs: updatedLogs, score: nextScore } = rebuildLogsWithTotals(nextLogs);
    controller.setLogs(updatedLogs);
    controller.setScore(nextScore);
    closeScoreModal();
  }

  function handleAddScore(teamKey) {
    openScoreModal(teamKey, "add", null);
  }

  function syncActiveMatchScore() {
    const { logs: updatedLogs, score: nextScore } = rebuildLogsWithTotals(
      controller.logs || []
    );
    controller.setLogs(updatedLogs);
    controller.setScore(nextScore);
  }

  function handleRuleChange(field, value) {
    controller.setRules((prev) => {
      if (field === "matchDuration") {
        return { ...prev, matchDuration: 0 };
      }
      return { ...prev, [field]: value };
    });

    if (field === "timeoutSeconds" && !controller.secondaryRunning) {
      const nextValue = Number.isFinite(value) ? value : DEFAULT_TIMEOUT_SECONDS;
      controller.setSecondaryTotalSeconds(nextValue);
      controller.commitSecondaryTimerState(nextValue, false);
    }
  }

  function handleUpdateLog(logIndex, payload) {
    if (!Number.isFinite(logIndex)) return;
    const nextLogs = [...(controller.logs || [])];
    const existing = nextLogs[logIndex];
    if (!existing) return;
    nextLogs[logIndex] = {
      ...existing,
      team: payload?.teamKey ?? existing.team,
    };
    const { logs: updatedLogs, score: nextScore } = rebuildLogsWithTotals(nextLogs);
    controller.setLogs(updatedLogs);
    controller.setScore(nextScore);
  }

  function handleDeleteLog(logIndex) {
    if (!Number.isFinite(logIndex)) return;
    const nextLogs = [...(controller.logs || [])];
    nextLogs.splice(logIndex, 1);
    const { logs: updatedLogs, score: nextScore } = rebuildLogsWithTotals(nextLogs);
    controller.setLogs(updatedLogs);
    controller.setScore(nextScore);
  }

  function handleTimeoutTrigger(teamKey) {
    if (!teamKey) return;
    controller.setTimeoutUsage((prev) => ({
      ...prev,
      [teamKey]: (prev?.[teamKey] || 0) + 1,
    }));

    const logEntry = {
      id: createLocalId("timeout"),
      eventCode: MATCH_LOG_EVENT_CODES.TIMEOUT_START,
      eventDescription: "Timeout",
      team: teamKey,
      timestamp: new Date().toISOString(),
      totalA: controller.score.a,
      totalB: controller.score.b,
    };
    controller.appendLocalLog(logEntry);

    const timeoutSeconds = controller.rules.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS;
    controller.commitSecondaryTimerState(timeoutSeconds, true);
    controller.setSecondaryTotalSeconds(timeoutSeconds);
    controller.setSecondaryLabel("Timeout");
  }

  function handleHalfTimeTrigger() {
    const logEntry = {
      id: createLocalId("halftime"),
      eventCode: MATCH_LOG_EVENT_CODES.HALFTIME_START,
      eventDescription: "Halftime",
      timestamp: new Date().toISOString(),
      totalA: controller.score.a,
      totalB: controller.score.b,
    };
    controller.appendLocalLog(logEntry);

    const elapsed = controller.getPrimaryRemainingSeconds();
    controller.commitPrimaryTimerState(elapsed, false);

    const breakSeconds = Math.max(0, Number(controller.rules.halftimeBreakMinutes || 0) * 60);
    if (breakSeconds > 0) {
      controller.commitSecondaryTimerState(breakSeconds, true);
      controller.setSecondaryTotalSeconds(breakSeconds);
      controller.setSecondaryLabel("Halftime");
    }
  }

  function handleGameStoppage() {
    const logEntry = {
      id: createLocalId("stoppage"),
      eventCode: controller.stoppageActive
        ? MATCH_LOG_EVENT_CODES.STOPPAGE_END
        : MATCH_LOG_EVENT_CODES.STOPPAGE_START,
      eventDescription: controller.stoppageActive ? "Stoppage ended" : "Stoppage",
      timestamp: new Date().toISOString(),
      totalA: controller.score.a,
      totalB: controller.score.b,
    };
    controller.appendLocalLog(logEntry);

    if (!controller.stoppageActive) {
      const elapsed = controller.getPrimaryRemainingSeconds();
      controller.commitPrimaryTimerState(elapsed, false);
    }
    controller.setStoppageActive((prev) => !prev);
  }

  function handleEndMatchNavigation() {
    const logEntry = {
      id: createLocalId("match-end"),
      eventCode: MATCH_LOG_EVENT_CODES.MATCH_END,
      eventDescription: "Match end",
      timestamp: new Date().toISOString(),
      totalA: controller.score.a,
      totalB: controller.score.b,
    };
    controller.appendLocalLog(logEntry);

    const elapsed = controller.getPrimaryRemainingSeconds();
    controller.commitPrimaryTimerState(elapsed, false);
    controller.setMatchStarted(false);
    controller.setTimerLabel(DEFAULT_TIMER_LABEL);
  }

  function logMatchStartEvent() {
    const exists = (controller.logs || []).some(
      (entry) => entry.eventCode === MATCH_LOG_EVENT_CODES.MATCH_START
    );
    if (exists) return;
    const logEntry = {
      id: createLocalId("match-start"),
      eventCode: MATCH_LOG_EVENT_CODES.MATCH_START,
      eventDescription: "Match start",
      team: controller.matchStartingTeamKey,
      timestamp: new Date().toISOString(),
      totalA: controller.score.a,
      totalB: controller.score.b,
    };
    controller.appendLocalLog(logEntry);
  }

  function handleExportCsv() {
    const headers = [
      "timestamp",
      "event",
      "team",
      "scorer",
      "assist",
      "total_a",
      "total_b",
      "abba_line",
    ];
    const rows = (controller.logs || []).map((log) => {
      const teamLabel =
        log.team === "A"
          ? controller.displayTeamA
          : log.team === "B"
            ? controller.displayTeamB
            : "";
      return [
        formatCsvValue(log.timestamp || ""),
        formatCsvValue(log.eventDescription || log.eventCode || ""),
        formatCsvValue(teamLabel),
        formatCsvValue(log.scorerName || ""),
        formatCsvValue(log.assistName || ""),
        formatCsvValue(log.totalA ?? ""),
        formatCsvValue(log.totalB ?? ""),
        formatCsvValue(log.abbaLine || ""),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `scrimmage-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    controller.clearLocalMatchState();
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
    handleExportCsv,
  };
}
