// Overlay add-ons: optional, automatic popups switched on from the control room's
// Add-ons section. Shared by the control page (settings UI) and the overlay runtime
// (rendering), so both read the same defaults and the same point timeline.
//
// Break chance is also listed in that section but keeps its own setting
// (`breakChanceEnabled`) and its own realtime event; it is not part of this object.
import { findBreakLogIds } from "../utils/matchBreaks";
import { DEFAULT_INTERPOINT_SECONDS } from "../pages/scorekeeper/scorekeeperConstants";

// Where the chips sit is set by each layout (<body data-addon-position>), and the
// inter-point length comes from the event rules; neither is configured here.
export const DEFAULT_OVERLAY_ADDONS = {
  // Shown once the point has run this long, until the point ends.
  pointDuration: {
    enabled: false,
    showAfterMinutes: 6,
  },
  scoreInfo: {
    enabled: false,
    displaySeconds: 7,
    // Scorer is always shown; by default only the assist is added to it.
    showTeam: false,
    showAssist: true,
    showPointType: false,
    showTurnovers: false,
    showPointTime: false,
    showScore: false,
  },
  genderLine: {
    enabled: false,
    displaySeconds: 5,
  },
};

function toMinutes(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(120, Math.max(0, Math.round(parsed * 10) / 10));
}

function toBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function toSeconds(value, fallback, { min = 0, max = 3600 } = {}) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function normalizeOverlayAddons(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_OVERLAY_ADDONS;
  const pd = source.pointDuration || {};
  const si = source.scoreInfo || {};
  const gl = source.genderLine || {};
  return {
    pointDuration: {
      enabled: toBool(pd.enabled, d.pointDuration.enabled),
      showAfterMinutes: toMinutes(pd.showAfterMinutes, d.pointDuration.showAfterMinutes),
    },
    scoreInfo: {
      enabled: toBool(si.enabled, d.scoreInfo.enabled),
      displaySeconds: toSeconds(si.displaySeconds, d.scoreInfo.displaySeconds, { min: 1, max: 120 }),
      showTeam: toBool(si.showTeam, d.scoreInfo.showTeam),
      showAssist: toBool(si.showAssist, d.scoreInfo.showAssist),
      showPointType: toBool(si.showPointType, d.scoreInfo.showPointType),
      showTurnovers: toBool(si.showTurnovers, d.scoreInfo.showTurnovers),
      showPointTime: toBool(si.showPointTime, d.scoreInfo.showPointTime),
      showScore: toBool(si.showScore, d.scoreInfo.showScore),
    },
    genderLine: {
      enabled: toBool(gl.enabled, d.genderLine.enabled),
      displaySeconds: toSeconds(gl.displaySeconds, d.genderLine.displaySeconds, { min: 1, max: 120 }),
    },
  };
}

function parseRules(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// Same lookup order as the scorekeeper's normalizeEventRules (both naming generations).
export function resolveInterPointSeconds(eventRules) {
  const rules = parseRules(eventRules);
  const candidates = [
    rules?.interPoint?.defencePullBySeconds,
    rules?.interPoint?.pullDeadlineSeconds,
    rules?.interPoint?.prePullTimeoutAddsSeconds,
    rules?.interPoint?.timeoutAddsSeconds,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (candidate !== null && candidate !== undefined && candidate !== "" && Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return DEFAULT_INTERPOINT_SECONDS;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "--:--";
  const total = Math.floor(ms / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// ─── Point timeline ──────────────────────────────────────────────────────────
//
// Input is chronological, entries shaped
//   { id, eventCode, team: "A" | "B" | null, ts (epoch ms), actorId, secondaryActorId }.
//
// A point starts when the inter-point time has run out: the score that ended the
// previous point plus `interPointSeconds`. match_start and halftime_end start a
// point immediately (the pull follows straight on). A timeout called before the
// pull pushes the start to its timeout_end. Stoppage time inside a point is not
// counted towards its duration.
//
// There is no "pull" row in match_logs, so the start is an estimate from the rules.
export function derivePointTimeline(chronologicalLogs, { startingPuller = null, interPointSeconds = DEFAULT_INTERPOINT_SECONDS } = {}) {
  const interPointMs = Math.max(0, Number(interPointSeconds) || 0) * 1000;
  const breakIds = findBreakLogIds(chronologicalLogs, startingPuller);
  const points = [];

  let startMs = null;
  let open = false;
  let turnovers = 0;
  let pausedMs = 0;
  let stoppageStartMs = null;
  let prePullTimeout = false;
  let scoreA = 0;
  let scoreB = 0;

  const resetPoint = (nextStartMs, nextOpen) => {
    startMs = nextStartMs;
    open = nextOpen;
    turnovers = 0;
    pausedMs = 0;
    stoppageStartMs = null;
    prePullTimeout = false;
  };

  for (const log of chronologicalLogs || []) {
    if (!log) continue;
    const code = `${log.eventCode || ""}`.toLowerCase();
    const ts = Number(log.ts);
    if (!Number.isFinite(ts)) continue;
    const team = log.team === "A" || log.team === "B" ? log.team : null;

    if (code === "match_start") {
      resetPoint(ts, true);
    } else if (code === "score" || code === "callahan") {
      if (team === "A") scoreA += 1;
      if (team === "B") scoreB += 1;
      const hasStart = Number.isFinite(startMs) && ts >= startMs;
      const openStoppage = stoppageStartMs !== null ? Math.max(0, ts - stoppageStartMs) : 0;
      points.push({
        id: log.id,
        index: points.length,
        team,
        isCallahan: code === "callahan",
        isBreak: breakIds.has(log.id),
        turnovers,
        startMs: hasStart ? startMs : null,
        endMs: ts,
        durationMs: hasStart ? Math.max(0, ts - startMs - pausedMs - openStoppage) : null,
        scoreA,
        scoreB,
        actorId: log.actorId || null,
        secondaryActorId: log.secondaryActorId || null,
      });
      resetPoint(ts + interPointMs, true);
    } else if (code === "turnover" || code === "block") {
      if (open) turnovers += 1;
    } else if (code === "timeout_start") {
      if (Number.isFinite(startMs) && ts < startMs) prePullTimeout = true;
    } else if (code === "timeout_end") {
      if (prePullTimeout) {
        startMs = Math.max(startMs, ts);
        prePullTimeout = false;
      }
    } else if (code === "stoppage_start") {
      if (open && stoppageStartMs === null && Number.isFinite(startMs) && ts >= startMs) stoppageStartMs = ts;
    } else if (code === "stoppage_end") {
      if (stoppageStartMs !== null) {
        pausedMs += Math.max(0, ts - stoppageStartMs);
        stoppageStartMs = null;
      }
    } else if (code === "halftime_start") {
      resetPoint(null, false);
    } else if (code === "halftime_end") {
      resetPoint(ts, true);
    } else if (code === "match_end") {
      resetPoint(null, false);
    }
  }

  return {
    points,
    current: {
      // Key that changes every time a new point (or inter-point) begins.
      key: `${points.length}:${startMs ?? "-"}`,
      index: points.length,
      open: open && Number.isFinite(startMs),
      startMs,
      pausedMs,
      stoppageStartMs,
      turnovers,
    },
  };
}

// Playing time of the current point at `nowMs`, or null before it has started.
export function getCurrentPointElapsedMs(current, nowMs = Date.now()) {
  if (!current?.open || !Number.isFinite(current.startMs) || nowMs < current.startMs) return null;
  const openStoppage = current.stoppageStartMs !== null ? Math.max(0, nowMs - current.stoppageStartMs) : 0;
  return Math.max(0, nowMs - current.startMs - current.pausedMs - openStoppage);
}

export function describePointType(point) {
  if (!point) return "";
  if (point.isCallahan) return "CALLAHAN";
  if (point.isBreak) return "BREAK";
  return point.turnovers === 0 ? "CLEAN" : "HOLD";
}

// ─── ABBA gender line ────────────────────────────────────────────────────────
//
// Mirrors getAbbaLineCode in modularScoreKeeperData.js: one starting-gender point,
// then repeating 2-point blocks X1, Y1, Y2, X1, X2, Y1, Y2, ...

function normalizeAbbaPattern(value) {
  const candidate = `${value ?? ""}`.trim().toLowerCase();
  if (candidate === "male" || candidate === "m") return "M";
  if (candidate === "female" || candidate === "f") return "F";
  if (candidate === "none") return "none";
  return null;
}

const flipGender = (code) => (code === "M" ? "F" : "M");

export function getAbbaLineForIndex(startCode, index) {
  if ((startCode !== "M" && startCode !== "F") || !Number.isInteger(index) || index < 0) return null;
  if (index === 0) return `${startCode}1`;
  const normalized = index - 1;
  const pairIndex = Math.floor(normalized / 2);
  const prefix = pairIndex % 2 === 1 ? startCode : flipGender(startCode);
  return `${prefix}${normalized % 2 === 0 ? "1" : "2"}`;
}

// Starting gender from matches.abba_pattern, or, for matches set up without one,
// worked back from a score row's stored abba_line. null = no ABBA for this match.
export function resolveAbbaStartCode(abbaPattern, scoreLines = []) {
  const fromPattern = normalizeAbbaPattern(abbaPattern);
  if (fromPattern === "M" || fromPattern === "F") return fromPattern;
  if (fromPattern === "none") return null;
  for (let index = scoreLines.length - 1; index >= 0; index -= 1) {
    const match = /^([MF])([12])$/.exec(`${scoreLines[index] ?? ""}`.trim().toUpperCase());
    if (!match) continue;
    if (index === 0) return match[1];
    const pairIndex = Math.floor((index - 1) / 2);
    return pairIndex % 2 === 1 ? match[1] : flipGender(match[1]);
  }
  return null;
}
