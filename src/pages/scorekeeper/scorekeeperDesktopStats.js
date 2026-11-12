// Derived data for the scorekeeper's PC layout (ScorekeeperDesktopPanels.jsx).
// Pure functions over the console's chronological logs, plus the
// breakpoint hook. Kept apart from the components for React fast refresh.
import { useEffect, useState } from "react";
import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";

// Matches the console's PC breakpoint. Below it the phone layout is used.
export const SCOREKEEPER_DESKTOP_QUERY = "(min-width: 1280px)";

export function useIsDesktopScorekeeper() {
  const getMatch = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(SCOREKEEPER_DESKTOP_QUERY).matches
      : false;
  const [isDesktop, setIsDesktop] = useState(getMatch);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(SCOREKEEPER_DESKTOP_QUERY);
    const onChange = () => setIsDesktop(query.matches);
    onChange();
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return isDesktop;
}

const isScoreCode = (code) =>
  code === MATCH_LOG_EVENT_CODES.SCORE || code === MATCH_LOG_EVENT_CODES.CALAHAN;

// Goals, assists, turnovers (the thrower on a turnover row) and blocks (the
// defender on a block row; a Callahan is also a block for its scorer).
export function computeMatchPlayerStats(logs) {
  const stats = new Map();
  const bump = (playerId, field) => {
    if (!playerId) return;
    const row = stats.get(playerId) || { goals: 0, assists: 0, turnovers: 0, blocks: 0 };
    row[field] += 1;
    stats.set(playerId, row);
  };
  (logs || []).forEach((log) => {
    if (!log) return;
    const code = log.eventCode;
    if (isScoreCode(code)) {
      bump(log.scorerId, "goals");
      if (code === MATCH_LOG_EVENT_CODES.CALAHAN) {
        bump(log.scorerId, "blocks");
      } else {
        bump(log.assistId, "assists");
      }
    } else if (code === MATCH_LOG_EVENT_CODES.TURNOVER) {
      bump(log.scorerId, "turnovers");
    } else if (code === MATCH_LOG_EVENT_CODES.BLOCK) {
      bump(log.scorerId, "blocks");
    }
  });
  return stats;
}

// One row per scoring entry. A point runs from the previous score (or the
// kick-off / end of halftime) to this score; the duration is wall-clock, so
// stoppages and timeouts inside the point are included.
export function buildPointSummary(logs) {
  const points = [];
  let pointStartMs = null;
  (logs || []).forEach((log) => {
    if (!log) return;
    const ms = Date.parse(log.timestamp);
    const code = log.eventCode;
    if (code === MATCH_LOG_EVENT_CODES.MATCH_START || code === MATCH_LOG_EVENT_CODES.HALFTIME_END) {
      if (Number.isFinite(ms)) pointStartMs = ms;
      return;
    }
    if (code === MATCH_LOG_EVENT_CODES.HALFTIME_START) {
      points.push({ kind: "halftime", key: `ht-${log.id ?? log.optimisticId}` });
      return;
    }
    if (!isScoreCode(code)) return;
    const durationSeconds =
      Number.isFinite(ms) && Number.isFinite(pointStartMs) && ms >= pointStartMs
        ? Math.round((ms - pointStartMs) / 1000)
        : null;
    points.push({
      kind: "point",
      key: log.id ?? log.optimisticId,
      number: points.filter((entry) => entry.kind === "point").length + 1,
      team: log.team,
      scorerName: log.scorerName,
      assistName: code === MATCH_LOG_EVENT_CODES.CALAHAN ? "Callahan" : log.assistName,
      totalA: log.totalA,
      totalB: log.totalB,
      line: log.abbaLine && log.abbaLine !== "none" ? log.abbaLine : null,
      durationSeconds,
      pending: Boolean(log.isOptimistic),
    });
    if (Number.isFinite(ms)) pointStartMs = ms;
  });
  return points;
}

