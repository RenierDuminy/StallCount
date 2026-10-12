import { supabase } from "../services/supabaseClient";
import { MATCH_LOG_EVENT_CODES } from "../services/matchLogService";

// Older match_events rows used a bare "timeout" code before the start/end
// split; the shared constants no longer carry it, but historical logs do.
export const LEGACY_TIMEOUT_CODE = "timeout";

// ─── Constants ───────────────────────────────────────────────────────────────

const MATCH_FIELDS = `
  id,
  event_id,
  status,
  score_a,
  score_b,
  start_time,
  starting_team_id,
  event:events!matches_event_id_fkey (id, name, rules),
  team_a:teams!matches_team_a_fkey (id, name, short_name, attributes),
  team_b:teams!matches_team_b_fkey (id, name, short_name, attributes)
`;

const EVENT_FIELDS = "id, name, rules";

const MATCH_LOG_FIELDS = `
  id,
  match_id,
  event_type_id,
  team_id,
  actor_id,
  secondary_actor_id,
  created_at,
  abba_line
`;

export const MATCH_LOG_PAGE_SIZE = 1000;

export const BASE_POSSESSION_EVENT_CODES = new Set([
  MATCH_LOG_EVENT_CODES.MATCH_START,
  MATCH_LOG_EVENT_CODES.SCORE,
  MATCH_LOG_EVENT_CODES.CALAHAN,
  MATCH_LOG_EVENT_CODES.HALFTIME_START,
  MATCH_LOG_EVENT_CODES.HALFTIME_END,
]);

export const STATUS_LABELS = {
  live: "LIVE",
  halftime: "HALFTIME",
  finished: "FINAL",
  completed: "FINAL",
  scheduled: "SCHEDULED",
  ready: "READY",
  pending: "PENDING",
  canceled: "CANCELED",
};

export const VALID_OVERLAY_PAYLOAD_TYPES = new Set([
  "playerStats",
  "matchStats",
  "matchStatus",
  "teamRosters",
  "timeout",
  "fieldCall",
  "matchEvent",
  "breakChance",
]);

export const APP_SETTINGS_STORAGE_KEY = "stallcount:overlay-control-settings";

// ─── Private state ────────────────────────────────────────────────────────────

let _matchId = "";
let _teamATheme = "primary";
let _teamBTheme = "primary";
let _manualOverrides = null;
let _isPreview = false;
let _overlayInitialized = false;

let _currentMatch = null;
let _currentScoreboard = null;
let _currentEvent = null;
let _currentEventRules = null;
let _matchLogs = [];
const _matchLogById = new Map();
let _stoppageActive = false;
let _timeoutActiveTeamId = null; // team_id of the team whose timeout is currently active, or null
let _halftimeActive = false;

const _eventCache = new Map();
const _matchEventTypes = new Map();
const _resolvedEventCodeCache = new Map();
let _matchEventTypesLoaded = false;

let _clockInterval = null;

// ─── Callback system ─────────────────────────────────────────────────────────

const _callbacks = {
  scoreUpdate: [],
  bannerTrigger: [],
  matchUpdate: [],
  matchLogUpdate: [],
  clockTick: [],
  metaMessage: [],
  eventLogo: [],
  breakChanceSetting: [],
};

function _fire(event, ...args) {
  for (const fn of _callbacks[event]) {
    try { fn(...args); } catch (e) { console.error(e); }
  }
}

export function onScoreUpdate(fn) { _callbacks.scoreUpdate.push(fn); }
export function onBannerTrigger(fn) { _callbacks.bannerTrigger.push(fn); }
export function onMatchUpdate(fn) { _callbacks.matchUpdate.push(fn); }
export function onMatchLogUpdate(fn) { _callbacks.matchLogUpdate.push(fn); }
export function onClockTick(fn) { _callbacks.clockTick.push(fn); }
export function onMetaMessage(fn) { _callbacks.metaMessage.push(fn); }
// Tournament logo sent by the control app over realtime ("" = removed).
// Lets overlays in another browser (e.g. OBS) get the logo uploaded in the control app.
export function onEventLogo(fn) { _callbacks.eventLogo.push(fn); }
// Break chance on/off switch from the control app, sent over realtime for the same reason.
export function onBreakChanceSetting(fn) { _callbacks.breakChanceSetting.push(fn); }

// ─── Public getters ───────────────────────────────────────────────────────────

export function getCurrentMatch() { return _currentMatch; }
export function getCurrentScoreboard() { return _currentScoreboard; }
export function getMatchLogs() { return _matchLogs; }
export function getClockInfo() { return _getDerivedClockInfo(); }
export function isStoppageActive() { return _stoppageActive; }
export function getActiveTimeoutTeam() {
  if (!_timeoutActiveTeamId || !_currentMatch) return null;
  if (_timeoutActiveTeamId === _currentMatch.team_a?.id) return "A";
  if (_timeoutActiveTeamId === _currentMatch.team_b?.id) return "B";
  return null;
}
export function isHalftimeActive() { return _halftimeActive; }
export function getEventTypeCache() { return _matchEventTypes; }
export function getTeamThemes() { return { teamATheme: _teamATheme, teamBTheme: _teamBTheme }; }
export function getManualOverrides() { return _manualOverrides; }
export function getOverlayInitialized() { return _overlayInitialized; }

// ─── Exported utilities ───────────────────────────────────────────────────────

export function isAutoFadeEnabled(payload) {
  return payload?.autoFade !== false;
}

export function getOverlayPayloadKey(payload) {
  if (!payload?.type) return "";
  if (payload.type === "playerStats") return `playerStats:${payload.playerId || payload.playerName || ""}`;
  if (payload.type === "matchStats") return "matchStats";
  if (payload.type === "teamRosters") return "teamRosters";
  if (payload.type === "timeout") return `timeout:${(payload.team || "").toString().trim().toUpperCase()}`;
  if (payload.type === "fieldCall") return `fieldCall:${(payload.callLabel || "").toString().trim().toUpperCase()}`;
  if (payload.type === "matchEvent") {
    return `matchEvent:${payload.eventTypeId || payload.eventCode || payload.eventDescription || ""}:${payload.team || ""}`;
  }
  return payload.type;
}

export function resolveEventCode(eventType) {
  if (eventType?.id !== undefined && _resolvedEventCodeCache.has(eventType.id)) {
    return _resolvedEventCodeCache.get(eventType.id);
  }
  const rawCode = (eventType?.code || "").toString().trim().toLowerCase();
  if (rawCode) {
    const normalizedCode = rawCode.replace(/\s+/g, "_");
    if (normalizedCode.includes("half") && normalizedCode.includes("time") && normalizedCode.includes("end")) {
      return MATCH_LOG_EVENT_CODES.HALFTIME_END;
    }
    if (normalizedCode.includes("half") && normalizedCode.includes("time") && normalizedCode.includes("start")) {
      return MATCH_LOG_EVENT_CODES.HALFTIME_START;
    }
    if (normalizedCode.includes("match") && normalizedCode.includes("start")) {
      return MATCH_LOG_EVENT_CODES.MATCH_START;
    }
    if (normalizedCode.includes("match") && normalizedCode.includes("end")) {
      return MATCH_LOG_EVENT_CODES.MATCH_END;
    }
    return normalizedCode;
  }

  const description = (eventType?.description || "").toString().trim().toLowerCase();
  if (!description) return "";

  if (/cal+ahan/.test(description)) return MATCH_LOG_EVENT_CODES.CALAHAN;
  if (description.includes("score")) return MATCH_LOG_EVENT_CODES.SCORE;
  if (description.includes("timeout")) return LEGACY_TIMEOUT_CODE;
  if (description.includes("halftime end") || description.includes("end halftime")) {
    return MATCH_LOG_EVENT_CODES.HALFTIME_END;
  }
  if (description.includes("halftime start") || description.includes("halftime")) {
    return MATCH_LOG_EVENT_CODES.HALFTIME_START;
  }
  if (description.includes("turnover")) return MATCH_LOG_EVENT_CODES.TURNOVER;
  if (description.includes("block")) return MATCH_LOG_EVENT_CODES.BLOCK;
  if (description.includes("stoppage")) return MATCH_LOG_EVENT_CODES.STOPPAGE_START;
  if (description.includes("match start")) return MATCH_LOG_EVENT_CODES.MATCH_START;
  if (description.includes("match end")) return MATCH_LOG_EVENT_CODES.MATCH_END;

  return description.replace(/\s+/g, "_");
}

/**
 * Handles the shared banner show/hide/reflow/timeout pattern.
 * Each target is { element, onPrepare? }. Returns a { cancel() } handle.
 */
export function manageBannerState(payload, {
  targets,
  timeout,
  activeClass = "is-active",
  persistentClass = "is-persistent",
  onTimeout,
}) {
  const validTargets = (targets || []).filter((t) => t?.element);
  if (!validTargets.length) return { cancel: () => {} };

  for (const t of validTargets) {
    t.onPrepare?.();
    t.element.classList.remove(activeClass);
    t.element.classList.remove(persistentClass);
  }

  // Force reflow on first target to restart CSS transitions
  void validTargets[0].element.offsetWidth;

  for (const t of validTargets) {
    t.element.classList.add(activeClass);
  }

  let timerId = null;
  if (timeout != null) {
    timerId = window.setTimeout(() => {
      for (const t of validTargets) {
        t.element?.classList.remove(activeClass);
        t.element?.classList.remove(persistentClass);
      }
      onTimeout?.();
    }, timeout);
  }

  return {
    cancel() {
      if (timerId != null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
      for (const t of validTargets) {
        t.element?.classList.remove(activeClass);
        t.element?.classList.remove(persistentClass);
      }
    },
  };
}

// ─── Private computation helpers ─────────────────────────────────────────────

function _getMatchLogTimeline() {
  if (!_matchLogs.length) return [];
  return _matchLogs
    .filter((log) => log?.created_at)
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function _resolveOpposingTeamId(teamId, match) {
  if (!teamId || !match) return null;
  const teamAId = match?.team_a?.id;
  const teamBId = match?.team_b?.id;
  if (teamId === teamAId) return teamBId || null;
  if (teamId === teamBId) return teamAId || null;
  return null;
}


function _recomputeIncrementalState() {
  let stoppage = false;
  let timeoutTeamId = null;
  let halftime = false;
  _getMatchLogTimeline().forEach((log) => {
    const eventType = log?.eventType || _matchEventTypes.get(log?.event_type_id);
    const eventCode = resolveEventCode(eventType);
    if (eventCode === MATCH_LOG_EVENT_CODES.STOPPAGE_START) stoppage = true;
    if (eventCode === MATCH_LOG_EVENT_CODES.STOPPAGE_END) stoppage = false;
    if (eventCode === MATCH_LOG_EVENT_CODES.TIMEOUT_START) timeoutTeamId = log?.team_id ?? null;
    if (eventCode === MATCH_LOG_EVENT_CODES.TIMEOUT_END) timeoutTeamId = null;
    if (eventCode === MATCH_LOG_EVENT_CODES.HALFTIME_START) halftime = true;
    if (eventCode === MATCH_LOG_EVENT_CODES.HALFTIME_END) halftime = false;
  });
  _stoppageActive = stoppage;
  _timeoutActiveTeamId = timeoutTeamId;
  _halftimeActive = halftime;
}

function _normalizeRules(value) {
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

function _findTimeCapMinutes(value, seen = new Set()) {
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Object.prototype.hasOwnProperty.call(value, "timeCapMinutes")) {
    const raw = value.timeCapMinutes;
    const parsed = typeof raw === "string" ? Number(raw) : raw;
    if (Number.isFinite(parsed)) return parsed;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = _findTimeCapMinutes(item, seen);
      if (Number.isFinite(nested)) return nested;
    }
    return null;
  }

  for (const key of Object.keys(value)) {
    const nested = _findTimeCapMinutes(value[key], seen);
    if (Number.isFinite(nested)) return nested;
  }

  return null;
}

function _getTimeCapSeconds() {
  const normalizedRules = _normalizeRules(_currentEventRules) || _normalizeRules(_currentMatch?.event?.rules);
  const minutes = _findTimeCapMinutes(normalizedRules);
  if (!Number.isFinite(minutes)) return null;
  return Math.max(0, minutes * 60);
}

export function formatSeconds(seconds) {
  if (!Number.isFinite(seconds)) return "--:--";
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function _getDerivedClockInfo() {
  const timeCapSeconds = _getTimeCapSeconds();
  if (!Number.isFinite(timeCapSeconds)) {
    return { clockText: "", secondsRemaining: null, hasStarted: false, isPaused: false };
  }

  const timeline = _getMatchLogTimeline();
  let matchStartMs = null;
  let pausedMs = 0;
  let pauseStartMs = null;
  let hasMatchEnd = false;

  timeline.forEach((log) => {
    const eventType = log?.eventType || _matchEventTypes.get(log?.event_type_id);
    const eventCode = resolveEventCode(eventType);
    if (!eventCode) return;

    const timestamp = new Date(log.created_at).getTime();
    if (Number.isNaN(timestamp)) return;

    if (!matchStartMs && eventCode === MATCH_LOG_EVENT_CODES.MATCH_START) {
      matchStartMs = timestamp;
    }

    if (!matchStartMs) return;

    if (eventCode === MATCH_LOG_EVENT_CODES.STOPPAGE_START && !pauseStartMs) {
      pauseStartMs = timestamp;
    }
    if (eventCode === MATCH_LOG_EVENT_CODES.STOPPAGE_END && pauseStartMs) {
      pausedMs += Math.max(0, timestamp - pauseStartMs);
      pauseStartMs = null;
    }
    if (eventCode === MATCH_LOG_EVENT_CODES.MATCH_END) {
      hasMatchEnd = true;
    }
  });

  if (!matchStartMs) {
    return {
      clockText: _overlayInitialized ? formatSeconds(timeCapSeconds) : "",
      secondsRemaining: _overlayInitialized ? timeCapSeconds : null,
      hasStarted: false,
      isPaused: false,
    };
  }

  const now = Date.now();
  let effectivePausedMs = pausedMs;
  let isPaused = false;
  if (pauseStartMs) {
    effectivePausedMs += Math.max(0, now - pauseStartMs);
    isPaused = true;
  }

  const elapsedMs = Math.max(0, now - matchStartMs - effectivePausedMs);
  let secondsRemaining = Math.max(0, Math.ceil(timeCapSeconds - elapsedMs / 1000));
  if (hasMatchEnd) secondsRemaining = 0;
  // Seconds past the time cap (0 until the cap is passed, and frozen once the match has ended)
  const overtimeSeconds = hasMatchEnd ? 0 : Math.max(0, Math.floor(elapsedMs / 1000 - timeCapSeconds));

  return {
    clockText: formatSeconds(secondsRemaining),
    secondsRemaining,
    overtimeSeconds,
    hasStarted: true,
    isPaused,
  };
}

function _getMatchPhaseFromLogs() {
  let hasMatchStart = false;
  let hasHalftimeStart = false;
  let hasHalftimeEnd = false;
  let hasMatchEnd = false;

  _matchLogs.forEach((log) => {
    const eventType = log?.eventType || _matchEventTypes.get(log?.event_type_id);
    const eventCode = resolveEventCode(eventType);
    if (!eventCode) return;

    if (eventCode === MATCH_LOG_EVENT_CODES.MATCH_START) hasMatchStart = true;
    if (eventCode === MATCH_LOG_EVENT_CODES.HALFTIME_START) hasHalftimeStart = true;
    if (eventCode === MATCH_LOG_EVENT_CODES.HALFTIME_END) hasHalftimeEnd = true;
    if (eventCode === MATCH_LOG_EVENT_CODES.MATCH_END) hasMatchEnd = true;
  });

  if (hasMatchEnd) return "final";
  if (hasHalftimeStart && !hasHalftimeEnd) return "halftime";
  if (hasHalftimeEnd) return "second";
  if (hasMatchStart) return "first";
  return "starting";
}

function _deriveStatusLabel({ match, clockSeconds, status } = {}) {
  const phase = _getMatchPhaseFromLogs();
  if (phase === "final") return "FINAL";
  if (Number.isFinite(clockSeconds) && clockSeconds <= 0) return "SOFT CAP";
  if (phase === "halftime") return "HALFTIME";
  if (phase === "second") return "2ND HALF";
  if (phase === "first") return "1ST HALF";
  const normalizedStatus = (status || "").toString().trim().toLowerCase();
  if (!_overlayInitialized && (!normalizedStatus || normalizedStatus === "scheduled")) {
    return "STARTING SOON";
  }
  if (_overlayInitialized && phase === "starting") {
    const pullingTeam =
      match?.starting_team_id && match?.starting_team_id === match?.team_a?.id
        ? match.team_a
        : match?.starting_team_id && match?.starting_team_id === match?.team_b?.id
          ? match.team_b
          : null;
    if (pullingTeam) {
      const shortName = (pullingTeam.short_name || "").toString().trim() || (pullingTeam.name || "").toString().trim() || "TBD";
      return `Pull:\n${shortName}`;
    }
  }
  return "";
}

// ─── Score payload builder ────────────────────────────────────────────────────

function _buildScorePayload() {
  if (!_currentMatch) return null;
  const clockInfo = _getDerivedClockInfo();
  const manualScoreA = _manualOverrides?.enabled ? _manualOverrides.scoreA : null;
  const manualScoreB = _manualOverrides?.enabled ? _manualOverrides.scoreB : null;
  const scoreA = Number.isFinite(manualScoreA)
    ? manualScoreA
    : Number.isFinite(_currentScoreboard?.scoreA)
      ? _currentScoreboard.scoreA
      : _currentMatch.score_a;
  const scoreB = Number.isFinite(manualScoreB)
    ? manualScoreB
    : Number.isFinite(_currentScoreboard?.scoreB)
      ? _currentScoreboard.scoreB
      : _currentMatch.score_b;
  const status = _currentScoreboard?.status || _currentMatch?.status;
  const derivedStatusLabel = _deriveStatusLabel({
    match: _currentMatch,
    clockSeconds: clockInfo.secondsRemaining,
    status,
  });
  const manualClockValue = _manualOverrides?.enabled ? _manualOverrides.clock : "";
  const clockText = manualClockValue || clockInfo.clockText || "";

  return {
    scoreA,
    scoreB,
    clockText,
    clockInfo,
    statusLabel: (_manualOverrides?.enabled && _manualOverrides.statusLabel) || derivedStatusLabel || null,
    manualStatusLabel: _manualOverrides?.enabled ? _manualOverrides.statusLabel : null,
    teamA: _currentMatch.team_a,
    teamB: _currentMatch.team_b,
    eventName: _currentEvent?.name || _currentMatch.event?.name || "",
    logo: _currentScoreboard?.eventLogo || _currentScoreboard?.logo || "",
    match: _currentMatch,
    scoreboard: _currentScoreboard,
    status,
    manualOverrides: _manualOverrides,
  };
}

// ─── Clock interval ───────────────────────────────────────────────────────────

function _refreshClockInterval(clockInfo) {
  const hasManualClock = _manualOverrides?.enabled && _manualOverrides.clock;
  const shouldRun = Boolean(clockInfo?.hasStarted) && !hasManualClock;

  if (shouldRun && !_clockInterval) {
    _clockInterval = window.setInterval(() => {
      const info = _getDerivedClockInfo();
      _fire("clockTick", info);
      _fire("scoreUpdate", _buildScorePayload());
    }, 1000);
  }

  if (!shouldRun && _clockInterval) {
    window.clearInterval(_clockInterval);
    _clockInterval = null;
  }
}

// ─── Data loading ─────────────────────────────────────────────────────────────

function _cacheEventData(eventData) {
  if (!eventData) return null;
  if (eventData.id) _eventCache.set(eventData.id, eventData);
  _currentEvent = eventData;
  if (eventData.rules) _currentEventRules = eventData.rules;
  return eventData;
}

async function _ensureEventData(match) {
  const eventFromMatch = match?.event;
  if (eventFromMatch?.id) return _cacheEventData(eventFromMatch);

  const eventId = match?.event_id;
  if (!eventId) return null;

  if (_eventCache.has(eventId)) return _cacheEventData(_eventCache.get(eventId));

  const { data, error } = await supabase.from("events").select(EVENT_FIELDS).eq("id", eventId).maybeSingle();
  if (error || !data) return null;
  return _cacheEventData(data);
}

async function _loadMatchEventTypesOnce() {
  if (_matchEventTypesLoaded) return _matchEventTypes;
  _matchEventTypesLoaded = true;

  const { data, error } = await supabase.from("match_events").select("id, code, description");
  if (error || !Array.isArray(data)) return _matchEventTypes;

  data.forEach((eventType) => {
    _matchEventTypes.set(eventType.id, eventType);
    _resolvedEventCodeCache.set(eventType.id, resolveEventCode(eventType));
  });
  return _matchEventTypes;
}

function _hydrateMatchLog(log) {
  if (!log) return null;
  const eventType = _matchEventTypes.get(log.event_type_id);
  if (!eventType) return log;
  return { ...log, eventType };
}

function _storeMatchLog(log) {
  if (!log?.id) return;
  const hydrated = _hydrateMatchLog(log);
  const existingIndex = _matchLogs.findIndex((entry) => entry.id === log.id);
  if (existingIndex >= 0) {
    _matchLogs[existingIndex] = hydrated;
  } else {
    _matchLogs = [..._matchLogs, hydrated];
  }
  _matchLogById.set(log.id, hydrated);
}

function _removeMatchLog(logId) {
  if (!logId) return;
  _matchLogById.delete(logId);
  _matchLogs = _matchLogs.filter((entry) => entry.id !== logId);
}

function _hydrateStoredMatchLogs() {
  if (!_matchLogs.length) return;
  _matchLogs = _matchLogs.map((log) => _hydrateMatchLog(log));
  _matchLogs.forEach((log) => {
    if (log?.id) _matchLogById.set(log.id, log);
  });
  _recomputeIncrementalState();
}

async function _loadMatchLogsSnapshot() {
  if (!_matchId) return [];

  await _loadMatchEventTypesOnce();

  let from = 0;
  let keepLoading = true;

  while (keepLoading) {
    const { data, error } = await supabase
      .from("match_logs")
      .select(MATCH_LOG_FIELDS)
      .eq("match_id", _matchId)
      .order("created_at", { ascending: true })
      .range(from, from + MATCH_LOG_PAGE_SIZE - 1);

    if (error || !data || data.length === 0) {
      break;
    }

    data.forEach((log) => _storeMatchLog(log));

    if (data.length < MATCH_LOG_PAGE_SIZE) {
      keepLoading = false;
    } else {
      from += MATCH_LOG_PAGE_SIZE;
    }
  }

  _hydrateStoredMatchLogs();
  return _matchLogs;
}

async function _loadScoreboardSnapshot() {
  if (!_matchId) return null;
  const { data, error } = await supabase
    .from("scoreboard_match_snapshots")
    .select("payload, updated_at")
    .eq("match_id", _matchId)
    .maybeSingle();

  if (error) return null;

  const payload = data?.payload && typeof data.payload === "object" ? data.payload : null;
  _currentScoreboard = payload;
  if (_currentMatch) {
    const sp = _buildScorePayload();
    _fire("scoreUpdate", sp);
    _refreshClockInterval(sp?.clockInfo);
  }
  if (data?.updated_at) _fire("metaMessage", { text: "", isError: false });
  return payload;
}

async function _loadMatch() {
  if (!_matchId) {
    _fire("metaMessage", { text: "Add ?matchId=<id> to the URL.", isError: true });
    return null;
  }

  _fire("metaMessage", { text: "Loading match...", isError: false });

  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_FIELDS)
    .eq("id", _matchId)
    .maybeSingle();

  if (error) {
    _fire("metaMessage", { text: error.message || "Unable to load match.", isError: true });
    return null;
  }

  if (!data) {
    _fire("metaMessage", { text: "Match not found or not public.", isError: true });
    return null;
  }

  _currentMatch = data;
  _fire("scoreUpdate", _buildScorePayload());
  _fire("matchUpdate", _currentMatch);
  _fire("metaMessage", { text: "", isError: false });

  const eventData = await _ensureEventData(data);
  if (eventData) {
    _fire("scoreUpdate", _buildScorePayload());
  }

  return data;
}

// ─── Supabase subscriptions ───────────────────────────────────────────────────

function _setupSubscriptions() {
  const overlayBannerChannel = supabase
    .channel(`overlay-banner:${_matchId}`)
    .on("broadcast", { event: "overlay-banner" }, ({ payload }) => {
      _fire("bannerTrigger", payload?.type, payload);
    })
    .on("broadcast", { event: "event-logo" }, ({ payload }) => {
      _fire("eventLogo", typeof payload?.dataUrl === "string" ? payload.dataUrl : "");
    })
    .on("broadcast", { event: "break-chance-setting" }, ({ payload }) => {
      _fire("breakChanceSetting", Boolean(payload?.enabled));
    })
    .subscribe((status) => {
      // Ask an open control app for the current tournament logo (it also
      // answers with the break chance switch).
      if (status === "SUBSCRIBED") {
        overlayBannerChannel.send({ type: "broadcast", event: "event-logo-request", payload: {} });
      }
    });

  _loadMatchEventTypesOnce().then(() => {
    _hydrateStoredMatchLogs();
    if (_currentMatch) {
      _fire("scoreUpdate", _buildScorePayload());
    }
  });

  const matchChannel = supabase
    .channel(`overlay:match:${_matchId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "matches", filter: `id=eq.${_matchId}` },
      (payload) => {
        if (payload.eventType === "DELETE") {
          _fire("metaMessage", { text: "Match removed.", isError: true });
          return;
        }

        const incoming = payload.new;
        if (!incoming) return;

        _currentMatch = {
          ...(_currentMatch || {}),
          event_id: incoming.event_id ?? _currentMatch?.event_id,
          start_time: incoming.start_time ?? _currentMatch?.start_time,
          starting_team_id: incoming.starting_team_id ?? _currentMatch?.starting_team_id,
          event: incoming.event ?? _currentMatch?.event,
          score_a: incoming.score_a ?? _currentMatch?.score_a,
          score_b: incoming.score_b ?? _currentMatch?.score_b,
          status: incoming.status ?? _currentMatch?.status,
          team_a: _currentMatch?.team_a,
          team_b: _currentMatch?.team_b,
        };

        _fire("matchUpdate", _currentMatch);
        _fire("scoreUpdate", _buildScorePayload());
        _fire("metaMessage", { text: "", isError: false });

        _ensureEventData(_currentMatch).then((eventData) => {
          if (eventData) _fire("scoreUpdate", _buildScorePayload());
        });
      },
    )
    .subscribe();

  const scoreboardChannel = supabase
    .channel(`overlay:scoreboard:${_matchId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "scoreboard_match_snapshots", filter: `match_id=eq.${_matchId}` },
      (payload) => {
        if (payload.eventType === "DELETE") {
          _currentScoreboard = null;
          if (_currentMatch) _fire("scoreUpdate", _buildScorePayload());
          return;
        }

        const incoming = payload.new?.payload;
        if (!incoming || typeof incoming !== "object") return;

        _currentScoreboard = incoming;
        if (_currentMatch) _fire("scoreUpdate", _buildScorePayload());
        if (payload.new?.updated_at) _fire("metaMessage", { text: "", isError: false });
      },
    )
    .subscribe();

  const matchLogsChannel = supabase
    .channel(`overlay:match_logs:${_matchId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "match_logs", filter: `match_id=eq.${_matchId}` },
      (payload) => {
        if (payload.eventType === "DELETE") {
          _removeMatchLog(payload.old?.id);
          _recomputeIncrementalState();
          _fire("bannerTrigger", "syncStoppage", null);
          _fire("bannerTrigger", "syncTimeout", null);
          _fire("bannerTrigger", "syncHalftime", null);
          if (_currentMatch) _fire("scoreUpdate", _buildScorePayload());
          return;
        }

        const incoming = payload.new;
        if (!incoming) return;

        _storeMatchLog(incoming);
        const eventType = _matchEventTypes.get(incoming.event_type_id);
        const eventCode = resolveEventCode(eventType);

        // Legacy single-shot timeout code keeps its momentary banner behaviour.
        if (eventCode === LEGACY_TIMEOUT_CODE) {
          if (incoming.team_id && _currentMatch) {
            const teamId = incoming.team_id;
            if (teamId === _currentMatch.team_a?.id) _fire("bannerTrigger", "timeout", { team: "A" });
            if (teamId === _currentMatch.team_b?.id) _fire("bannerTrigger", "timeout", { team: "B" });
          }
        }

        if (
          eventCode === MATCH_LOG_EVENT_CODES.STOPPAGE_START ||
          eventCode === MATCH_LOG_EVENT_CODES.STOPPAGE_END
        ) {
          _recomputeIncrementalState();
          _fire("bannerTrigger", "syncStoppage", null);
        }

        if (
          eventCode === MATCH_LOG_EVENT_CODES.TIMEOUT_START ||
          eventCode === MATCH_LOG_EVENT_CODES.TIMEOUT_END
        ) {
          _recomputeIncrementalState();
          _fire("bannerTrigger", "syncTimeout", null);
        }

        if (
          eventCode === MATCH_LOG_EVENT_CODES.HALFTIME_START ||
          eventCode === MATCH_LOG_EVENT_CODES.HALFTIME_END
        ) {
          _recomputeIncrementalState();
          _fire("bannerTrigger", "syncHalftime", null);
        }

        _fire("matchLogUpdate", _matchLogs);
        if (_currentMatch) {
          const sp = _buildScorePayload();
          _fire("scoreUpdate", sp);
          _refreshClockInterval(sp?.clockInfo);
        }
      },
    )
    .subscribe();

  window.addEventListener("beforeunload", () => {
    supabase.removeChannel(overlayBannerChannel);
    supabase.removeChannel(matchChannel);
    supabase.removeChannel(scoreboardChannel);
    supabase.removeChannel(matchLogsChannel);
  });
}

// ─── Public lifecycle ─────────────────────────────────────────────────────────

export async function init(matchId, options = {}) {
  _matchId = (matchId || "").trim();
  _teamATheme = options.teamATheme || "primary";
  _teamBTheme = options.teamBTheme || "primary";
  _manualOverrides = options.manualOverrides || null;
  _isPreview = Boolean(options.isPreview);
  _overlayInitialized = Boolean(options.overlayInitialized);

  if (!_matchId) {
    _fire("metaMessage", { text: "Add ?matchId=<id> to the URL.", isError: true });
    return;
  }

  const match = await _loadMatch();
  _currentMatch = match;

  _loadScoreboardSnapshot();

  _loadMatchLogsSnapshot().then(() => {
    _recomputeIncrementalState();
    _fire("bannerTrigger", "syncStoppage", null);
    _fire("bannerTrigger", "syncTimeout", null);
    _fire("bannerTrigger", "syncHalftime", null);
    if (_currentMatch) {
      const sp = _buildScorePayload();
      _fire("scoreUpdate", sp);
      _refreshClockInterval(sp?.clockInfo);
    }
  });

  _setupSubscriptions();
}

export function updateSettings({ overlayInitialized } = {}) {
  if (typeof overlayInitialized === "boolean") _overlayInitialized = overlayInitialized;
  _recomputeIncrementalState();
  if (_currentMatch) _fire("scoreUpdate", _buildScorePayload());
}
