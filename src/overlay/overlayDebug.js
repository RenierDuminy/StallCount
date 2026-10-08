// Debug overlay — full WFDF view + live engine state panel.
// The WFDF view is imported as a side-effect (registers all its callbacks and
// calls engine.init), then this module layers the debug panel on top.

import "./overlayRuntime.js";
import {
  onScoreUpdate,
  onBannerTrigger,
  onMetaMessage,
  getCurrentMatch,
  getCurrentScoreboard,
  getMatchLogs,
  getClockInfo,
  isStoppageActive,
  getOverlayInitialized,
  getOverlayPayloadKey,
} from "./overlayEngine";

// ─── Debug helpers ────────────────────────────────────────────────────────────

function dbgSet(id, value) {
  const el = document.getElementById(id);
  if (!el) return;

  if (value === null || value === undefined) {
    el.textContent = "null";
    el.className = "dbg-val is-null";
    return;
  }
  if (typeof value === "boolean") {
    el.textContent = String(value);
    el.className = `dbg-val ${value ? "is-true" : "is-false"}`;
    return;
  }
  if (typeof value === "number") {
    el.textContent = String(value);
    el.className = "dbg-val is-num";
    return;
  }
  el.textContent = String(value);
  el.className = "dbg-val";
}

const bannerLog = document.getElementById("debugBannerLog");
const MAX_BANNER_LOG = 20;

function logBannerEvent(type, data) {
  if (!bannerLog) return;
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const detail = data
    ? Object.entries(data)
        .filter(([k]) => !["type"].includes(k))
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ")
    : "";

  const entry = document.createElement("div");
  entry.className = "dbg-banner-entry";
  entry.innerHTML = `<span class="dbg-banner-ts">${ts}</span><span class="dbg-banner-type">${type}</span><span class="dbg-banner-detail">${detail}</span>`;
  bannerLog.prepend(entry);

  while (bannerLog.children.length > MAX_BANNER_LOG) {
    bannerLog.removeChild(bannerLog.lastChild);
  }
}

// ─── States / Triggers tracking ──────────────────────────────────────────────

let _lastTriggerType = null;
let _lastTriggerData = null;
let _lastTriggerKey = null;

const BANNER_STATE_ELEMENTS = {
  playerStats:  "overlayBanner",
  matchStats:   "matchStatsBanner",
  matchStatus:  "matchStatusBanner",
  teamRosters:  "teamRostersBanner",
  timeoutA:     "timeoutBannerA",
  timeoutB:     "timeoutBannerB",
  fieldCall:    "fieldCallBanner",
  matchEvent:   "matchEventBanner",
};

function isBannerActive(elementId) {
  const el = document.getElementById(elementId);
  return el ? el.classList.contains("is-active") : false;
}

// ─── Panel refresh ────────────────────────────────────────────────────────────

function refreshDebugPanel(scorePayload) {
  const match = getCurrentMatch();
  const scoreboard = getCurrentScoreboard();
  const logs = getMatchLogs();
  const clock = scorePayload?.clockInfo || getClockInfo();

  // Connection
  const searchParams = new URLSearchParams(window.location.search);
  dbgSet("dbg-matchId", searchParams.get("matchId") || "—");

  // Match
  dbgSet("dbg-status", match?.status ?? null);
  dbgSet("dbg-score", match ? `${match.score_a ?? "?"} / ${match.score_b ?? "?"}` : null);
  dbgSet("dbg-teamA", match?.team_a ? `${match.team_a.name} (${match.team_a.id})` : null);
  dbgSet("dbg-teamB", match?.team_b ? `${match.team_b.name} (${match.team_b.id})` : null);
  const startingId = match?.starting_team_id;
  const startingName = startingId === match?.team_a?.id
    ? match.team_a?.name
    : startingId === match?.team_b?.id
      ? match.team_b?.name
      : startingId ?? null;
  dbgSet("dbg-startingTeam", startingName);
  dbgSet("dbg-event", match?.event ? `${match.event.name} (${match.event.id})` : null);

  // Clock
  dbgSet("dbg-clockText", clock.clockText || null);
  dbgSet("dbg-secondsRemaining", clock.secondsRemaining ?? null);
  dbgSet("dbg-hasStarted", clock.hasStarted);
  dbgSet("dbg-isPaused", clock.isPaused);

  // Derived state
  dbgSet("dbg-statusLabel", scorePayload?.statusLabel ?? null);
  dbgSet("dbg-stoppageActive", isStoppageActive());
  dbgSet("dbg-overlayInit", getOverlayInitialized());

  // Scoreboard snapshot
  dbgSet("dbg-sbScoreA", scoreboard?.scoreA ?? null);
  dbgSet("dbg-sbScoreB", scoreboard?.scoreB ?? null);
  dbgSet("dbg-sbStatus", scoreboard?.status ?? null);
  dbgSet("dbg-sbPeriod", scoreboard ? `${scoreboard.period ?? "—"} / ${scoreboard.half ?? "—"}` : null);
  dbgSet("dbg-sbClock", scoreboard?.clock ?? null);

  // Match logs
  dbgSet("dbg-logCount", logs.length);
  const lastLog = logs.length ? logs[logs.length - 1] : null;
  dbgSet("dbg-lastLog", lastLog
    ? `${lastLog.eventType?.code || lastLog.event_type_id} @ ${lastLog.created_at?.slice(11, 19) ?? "?"}`
    : null);

  // States / Triggers
  const playerStatsActive = isBannerActive(BANNER_STATE_ELEMENTS.playerStats);
  const matchStatsActive = isBannerActive(BANNER_STATE_ELEMENTS.matchStats);
  const teamRostersActive = isBannerActive(BANNER_STATE_ELEMENTS.teamRosters);
  const timeoutActive = isBannerActive(BANNER_STATE_ELEMENTS.timeoutA) || isBannerActive(BANNER_STATE_ELEMENTS.timeoutB);
  const fieldCallActive = isBannerActive(BANNER_STATE_ELEMENTS.fieldCall);
  const matchEventActive = isBannerActive(BANNER_STATE_ELEMENTS.matchEvent);

  dbgSet("dbg-st-playerStats", playerStatsActive);
  dbgSet("dbg-st-playerStatsKey", playerStatsActive ? (_lastTriggerKey?.startsWith("playerStats") ? _lastTriggerKey : null) : null);
  dbgSet("dbg-st-matchStats", matchStatsActive);
  dbgSet("dbg-st-matchStatsKey", matchStatsActive ? (_lastTriggerKey?.startsWith("matchStats") ? _lastTriggerKey : null) : null);
  dbgSet("dbg-st-teamRosters", teamRostersActive);
  dbgSet("dbg-st-teamRostersKey", teamRostersActive ? (_lastTriggerKey?.startsWith("teamRosters") ? _lastTriggerKey : null) : null);
  dbgSet("dbg-st-timeout", timeoutActive);
  dbgSet("dbg-st-timeoutKey", timeoutActive ? (_lastTriggerKey?.startsWith("timeout") ? _lastTriggerKey : null) : null);
  dbgSet("dbg-st-fieldCall", fieldCallActive);
  dbgSet("dbg-st-fieldCallKey", fieldCallActive ? (_lastTriggerKey?.startsWith("fieldCall") ? _lastTriggerKey : null) : null);
  dbgSet("dbg-st-matchEvent", matchEventActive);
  dbgSet("dbg-st-matchEventKey", matchEventActive ? (_lastTriggerKey?.startsWith("matchEvent") ? _lastTriggerKey : null) : null);
  dbgSet("dbg-st-lastTrigger", _lastTriggerType ?? null);
  dbgSet("dbg-st-lastTriggerData", _lastTriggerData
    ? Object.entries(_lastTriggerData).filter(([k]) => k !== "type").map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ") || null
    : null);
}

// ─── Callback hooks ───────────────────────────────────────────────────────────

onScoreUpdate((payload) => refreshDebugPanel(payload));

onBannerTrigger((type, data) => {
  _lastTriggerType = type;
  _lastTriggerData = data || null;
  _lastTriggerKey = data ? getOverlayPayloadKey(data) : type;
  logBannerEvent(type, data);
  refreshDebugPanel(null);
});

onMetaMessage(({ text }) => dbgSet("dbg-meta", text || "OK"));

// Initial render once DOM is ready
refreshDebugPanel(null);
