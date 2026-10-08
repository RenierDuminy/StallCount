import "../theme.css";
import "./overlayOutput.css";
import {
  init,
  updateSettings,
  onScoreUpdate,
  onBannerTrigger,
  onMatchLogUpdate,
  onMetaMessage,
  onEventLogo,
  manageBannerState,
  getOverlayPayloadKey,
  isAutoFadeEnabled,
  getCurrentMatch,
  getOverlayInitialized,
  isStoppageActive,
  getActiveTimeoutTeam,
  isHalftimeActive,
  getTeamThemes,
  getEventTypeCache,
  resolveEventCode,
  APP_SETTINGS_STORAGE_KEY,
  VALID_OVERLAY_PAYLOAD_TYPES,
  STATUS_LABELS,
} from "./overlayEngine";
import { MATCH_LOG_EVENT_CODES } from "../services/matchLogService";

const DEFAULT_LOGO_SRC = `${import.meta.env.BASE_URL}assets/stallcount-logo.png`;

// ─── DOM element references ───────────────────────────────────────────────────

const elements = {
  eventName: document.getElementById("eventName"),
  matchClock: document.getElementById("matchClock"),
  overlayBar: document.getElementById("overlayBar"),
  logo: document.getElementById("eventLogo"),
  logoFallback: document.getElementById("eventLogoFallback"),
  teamABox: document.getElementById("teamABox"),
  teamBBox: document.getElementById("teamBBox"),
  teamAName: document.getElementById("teamAName"),
  teamBName: document.getElementById("teamBName"),
  scoreA: document.getElementById("scoreA"),
  scoreB: document.getElementById("scoreB"),
  meta: document.getElementById("meta"),
  banner: document.getElementById("overlayBanner"),
  bannerPlayerName: document.getElementById("bannerPlayerName"),
  bannerStatGls: document.getElementById("bannerStatGls"),
  bannerStatAst: document.getElementById("bannerStatAst"),
  bannerStatBlk: document.getElementById("bannerStatBlk"),
  bannerStatTrn: document.getElementById("bannerStatTrn"),
  matchStatsBanner: document.getElementById("matchStatsBanner"),
  matchStatsTitle: document.getElementById("matchStatsTitle"),
  matchStatsColumnA: document.getElementById("matchStatsColumnA"),
  matchStatsColumnB: document.getElementById("matchStatsColumnB"),
  matchStatsTeamA: document.getElementById("matchStatsTeamA"),
  matchStatsTeamB: document.getElementById("matchStatsTeamB"),
  matchStatsScoreline: document.getElementById("matchStatsScoreline"),
  matchStatsHoldsA: document.getElementById("matchStatsHoldsA"),
  matchStatsHoldsB: document.getElementById("matchStatsHoldsB"),
  matchStatsBreaksA: document.getElementById("matchStatsBreaksA"),
  matchStatsBreaksB: document.getElementById("matchStatsBreaksB"),
  matchStatsTurnoversA: document.getElementById("matchStatsTurnoversA"),
  matchStatsTurnoversB: document.getElementById("matchStatsTurnoversB"),
  matchStatsBlocksA: document.getElementById("matchStatsBlocksA"),
  matchStatsBlocksB: document.getElementById("matchStatsBlocksB"),
  matchStatusBanner: document.getElementById("matchStatusBanner"),
  matchStatusPhase: document.getElementById("matchStatusPhase"),
  matchStatusTeamA: document.getElementById("matchStatusTeamA"),
  matchStatusTeamB: document.getElementById("matchStatusTeamB"),
  matchStatusScore: document.getElementById("matchStatusScore"),
  matchStatusKickoff: document.getElementById("matchStatusKickoff"),
  matchStatusKickoffRow: document.getElementById("matchStatusKickoffRow"),
  matchStatusVenue: document.getElementById("matchStatusVenue"),
  matchStatusEvent: document.getElementById("matchStatusEvent"),
  matchStatusLogo: document.getElementById("matchStatusLogo"),
  matchStatusWeather: document.getElementById("matchStatusWeather"),
  matchStatusWeatherRow: document.getElementById("matchStatusWeatherRow"),
  teamRostersBanner: document.getElementById("teamRostersBanner"),
  teamRostersTitle: document.getElementById("teamRostersTitle"),
  teamRostersColumnA: document.getElementById("teamRostersColumnA"),
  teamRostersColumnB: document.getElementById("teamRostersColumnB"),
  teamRostersTeamA: document.getElementById("teamRostersTeamA"),
  teamRostersTeamB: document.getElementById("teamRostersTeamB"),
  teamRostersListA: document.getElementById("teamRostersListA"),
  teamRostersListB: document.getElementById("teamRostersListB"),
  timeoutA: document.getElementById("timeoutBannerA"),
  timeoutB: document.getElementById("timeoutBannerB"),
  timeoutTeamShortA: document.getElementById("timeoutTeamShortA"),
  timeoutTeamShortB: document.getElementById("timeoutTeamShortB"),
  breakChanceA: document.getElementById("breakChanceBannerA"),
  breakChanceB: document.getElementById("breakChanceBannerB"),
  fieldCallBanner: document.getElementById("fieldCallBanner"),
  fieldCallBannerLabel: document.getElementById("fieldCallBannerLabel"),
  matchEventBanner: document.getElementById("matchEventBanner"),
  matchEventBannerLabel: document.getElementById("matchEventBannerLabel"),
};

// ─── URL params ───────────────────────────────────────────────────────────────

const searchParams = new URLSearchParams(window.location.search);
const matchId = (searchParams.get("matchId") || "").trim();
const teamATheme = (searchParams.get("teamATheme") || "primary").trim().toLowerCase();
const teamBTheme = (searchParams.get("teamBTheme") || "primary").trim().toLowerCase();
const manualOverrides = _getManualOverrides(searchParams);
const isPreview =
  ["1", "true", "yes"].includes((searchParams.get("preview") || "").trim().toLowerCase());

if (isPreview) {
  document.body.classList.add("overlay-preview");
}

const overlayInitialized = _getOverlayInitialized();

function _readPersistedAppSettings() {
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function _getOverlayInitialized() {
  const queryValue = (searchParams.get("initialized") || "").trim().toLowerCase();
  if (["1", "true", "yes"].includes(queryValue)) return true;
  const persistedSettings = _readPersistedAppSettings();
  const persistedMatchId = (persistedSettings.matchId || "").toString().trim();
  if (matchId && persistedMatchId && persistedMatchId !== matchId) return false;
  return persistedSettings.isInitialized === true;
}


function _getManualOverrides(params) {
  const rawEnabled = (params.get("manual") || "").trim().toLowerCase();
  const enabled = rawEnabled === "1" || rawEnabled === "true" || rawEnabled === "yes";
  if (!enabled) return null;

  const scoreA = _parseNumberParam(params.get("manualScoreA"));
  const scoreB = _parseNumberParam(params.get("manualScoreB"));
  const clock = (params.get("manualClock") || "").trim();
  const statusLabel = _normalizeManualStatus(params.get("manualStatus"));

  return { enabled, scoreA, scoreB, clock, statusLabel };
}

function _parseNumberParam(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function _normalizeManualStatus(value) {
  if (!value) return "";
  const normalized = value.toString().trim().toLowerCase();
  if (!normalized) return "";
  if (["starting", "starting_soon", "soon", "pre"].includes(normalized)) return "STARTING SOON";
  if (["1", "1st", "first"].includes(normalized)) return "1ST";
  if (["half", "halftime"].includes(normalized)) return "HALF";
  if (["2", "2nd", "second"].includes(normalized)) return "2ND";
  if (["soft", "softcap", "soft_cap"].includes(normalized)) return "SOFT CAP";
  if (["final", "finished", "completed"].includes(normalized)) return "FINAL";
  return normalized.toUpperCase();
}

// ─── Rendering helpers ────────────────────────────────────────────────────────

function setMeta(text, isError = false) {
  if (!elements.meta) return;
  elements.meta.textContent = text;
  elements.meta.classList.toggle("meta-error", Boolean(isError));
}

function formatTeamName(team) {
  if (!team) return "TBD";
  return team.name || "TBD";
}

function formatTeamShortName(team) {
  if (!team) return "TBD";
  const shortName = (team.short_name || "").toString().trim();
  if (shortName) return shortName;
  return (team.name || "").toString().trim() || "TBD";
}

function formatClock(clock) {
  if (clock && typeof clock === "string" && clock.trim()) return clock.trim();
  return "--:--";
}

function formatStatusLabel({ period, half, status }) {
  const pickValue = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string") return value;
    return "";
  };
  const raw = pickValue(period) || pickValue(half) || pickValue(status);
  if (!raw) return "";
  const normalized = raw.toString().trim().toLowerCase();
  if (["1", "first", "1st"].includes(normalized)) return "1ST HALF";
  if (["2", "second", "2nd"].includes(normalized)) return "2ND HALF";
  if (["half", "halftime"].includes(normalized)) return "HALFTIME";
  if (["final", "finished", "completed"].includes(normalized)) return "FINAL";
  return raw.toString().toUpperCase();
}

function getInitials(text, max = 3) {
  if (!text) return "SC";
  const words = text.toString().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "SC";
  return words.map((word) => word[0]).join("").slice(0, max).toUpperCase();
}

function applyLogo(src) {
  if (!elements.logo) return;
  if (!src) {
    elements.logo.removeAttribute("src");
    elements.logo.parentElement?.classList.remove("has-image");
    return;
  }
  elements.logo.src = src;
  elements.logo.onload = () => elements.logo.parentElement?.classList.add("has-image");
  elements.logo.onerror = () => {
    elements.logo.removeAttribute("src");
    elements.logo.parentElement?.classList.remove("has-image");
  };
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function normalizeAttributes(attributes) {
  if (!attributes) return null;
  if (typeof attributes === "string") {
    try { return JSON.parse(attributes); } catch { return null; }
  }
  if (typeof attributes === "object") return attributes;
  return null;
}

function resolveTeamColors(attributes, theme) {
  const normalized = normalizeAttributes(attributes) || {};
  const isSecondary = theme === "secondary";
  const background = isSecondary ? normalized.secondaryColor : normalized.primaryColor;
  const text = isSecondary ? normalized.textOnSecondary : normalized.textOnPrimary;
  return {
    background: background || null,
    text: text || null,
    accent: normalized.accentColor || null,
  };
}

function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseCssColor(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;

  const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: Number.parseInt(hex[0] + hex[0], 16),
        g: Number.parseInt(hex[1] + hex[1], 16),
        b: Number.parseInt(hex[2] + hex[2], 16),
      };
    }
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }

  const rgbMatch = normalized.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*[0-9.]+\s*)?\)$/i,
  );
  if (rgbMatch) {
    return {
      r: clampColorChannel(Number(rgbMatch[1])),
      g: clampColorChannel(Number(rgbMatch[2])),
      b: clampColorChannel(Number(rgbMatch[3])),
    };
  }

  return null;
}

function toRgbString(color, alpha = 1) {
  if (!color) return null;
  if (alpha >= 1) return `rgb(${color.r}, ${color.g}, ${color.b})`;
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function mixColors(colorA, colorB, ratio = 0.5) {
  if (!colorA || !colorB) return colorA || colorB || null;
  const mix = Math.max(0, Math.min(1, ratio));
  return {
    r: clampColorChannel(colorA.r + (colorB.r - colorA.r) * mix),
    g: clampColorChannel(colorA.g + (colorB.g - colorA.g) * mix),
    b: clampColorChannel(colorA.b + (colorB.b - colorA.b) * mix),
  };
}

function getRelativeLuminance(color) {
  if (!color) return 0;
  const normalize = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = normalize(color.r);
  const g = normalize(color.g);
  const b = normalize(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function deriveBannerPalette(colors) {
  const fallbackBackground = colors?.background || "#1f2933";
  const fallbackText = colors?.text || "#ffffff";
  const fallbackAccent = colors?.accent || fallbackBackground;

  const backgroundRgb = parseCssColor(fallbackBackground);
  const accentRgb = parseCssColor(fallbackAccent) || backgroundRgb;
  const darkRgb = { r: 15, g: 23, b: 42 };
  const lightRgb = { r: 248, g: 250, b: 252 };
  const isLightTeam = backgroundRgb ? getRelativeLuminance(backgroundRgb) > 0.58 : false;
  const surfaceText = darkRgb;
  const surfaceBg = lightRgb;
  const mutedText = toRgbString(darkRgb, 0.62);
  const dividerColor = toRgbString(darkRgb, 0.12);
  const borderColor = isLightTeam
    ? mixColors(backgroundRgb || lightRgb, darkRgb, 0.18)
    : mixColors(accentRgb || backgroundRgb || darkRgb, darkRgb, 0.1);
  const accentColor = accentRgb || backgroundRgb || darkRgb;
  const shadowColor = darkRgb;

  return {
    teamBg: fallbackBackground,
    teamText: fallbackText,
    surfaceBg: toRgbString(surfaceBg),
    surfaceText: toRgbString(surfaceText),
    mutedText,
    dividerColor,
    borderColor: toRgbString(borderColor || accentColor),
    accentColor: toRgbString(accentColor),
    shadowColor: toRgbString(shadowColor, 0.12),
  };
}

function applyTeamColors(element, colors) {
  if (!element || !colors) return;
  if (colors.background) {
    element.style.setProperty("--team-bg", colors.background);
  } else {
    element.style.removeProperty("--team-bg");
  }
  if (colors.text) {
    element.style.setProperty("--team-text", colors.text);
  } else {
    element.style.removeProperty("--team-text");
  }
}

function resolveBannerTeamStyles(teamId, teamSlot) {
  const match = getCurrentMatch();
  const { teamATheme: tATheme, teamBTheme: tBTheme } = getTeamThemes();
  const slot =
    teamSlot === "A" || teamSlot === "B"
      ? teamSlot
      : teamId && match?.team_a?.id === teamId
        ? "A"
        : teamId && match?.team_b?.id === teamId
          ? "B"
          : null;

  if (slot === "A") return { slot, colors: resolveTeamColors(match?.team_a?.attributes, tATheme) };
  if (slot === "B") return { slot, colors: resolveTeamColors(match?.team_b?.attributes, tBTheme) };
  return { slot: null, colors: null };
}

function applyBannerTheme(payload) {
  if (!elements.banner) return;
  const { slot, colors } = resolveBannerTeamStyles(payload?.teamId, payload?.teamSlot);
  const palette = deriveBannerPalette(colors);
  elements.banner.classList.toggle("is-team-a", slot === "A");
  elements.banner.classList.toggle("is-team-b", slot === "B");
  elements.banner.style.setProperty("--banner-team-bg", palette.teamBg);
  elements.banner.style.setProperty("--banner-team-text", palette.teamText);
  elements.banner.style.setProperty("--banner-surface-bg", palette.surfaceBg);
  elements.banner.style.setProperty("--banner-surface-text", palette.surfaceText);
  elements.banner.style.setProperty("--banner-surface-muted", palette.mutedText);
  elements.banner.style.setProperty("--banner-divider-color", palette.dividerColor);
  elements.banner.style.setProperty("--banner-border-color", palette.borderColor);
  elements.banner.style.setProperty("--banner-team-accent", palette.accentColor);
  elements.banner.style.setProperty("--banner-shadow-color", palette.shadowColor);
}

// ─── Content appliers ─────────────────────────────────────────────────────────

function applyBannerStats(stats) {
  if (!stats) return;
  if (elements.bannerStatGls) elements.bannerStatGls.textContent = stats.goals ?? stats.gls ?? "0";
  if (elements.bannerStatAst) elements.bannerStatAst.textContent = stats.assists ?? stats.ast ?? "0";
  if (elements.bannerStatBlk) elements.bannerStatBlk.textContent = stats.blocks ?? stats.blk ?? "0";
  if (elements.bannerStatTrn) elements.bannerStatTrn.textContent = stats.turnovers ?? stats.trn ?? "0";
}

function setMatchStatsValue(element, value) {
  if (!element) return;
  element.textContent = value === null || value === undefined || value === "" ? "--" : String(value);
}

function updateMatchStatsHeader({ teamAName, teamBName, scoreA, scoreB, teamAColors, teamBColors }) {
  if (elements.matchStatsTeamA) elements.matchStatsTeamA.textContent = teamAName;
  if (elements.matchStatsTeamB) elements.matchStatsTeamB.textContent = teamBName;
  if (elements.matchStatsScoreline) {
    elements.matchStatsScoreline.textContent = `${Number.isFinite(scoreA) ? scoreA : 0} - ${Number.isFinite(scoreB) ? scoreB : 0}`;
  }
  applyTeamColors(elements.matchStatsColumnA, teamAColors);
  applyTeamColors(elements.matchStatsColumnB, teamBColors);
  if (elements.teamRostersTeamA) elements.teamRostersTeamA.textContent = teamAName;
  if (elements.teamRostersTeamB) elements.teamRostersTeamB.textContent = teamBName;
  applyTeamColors(elements.teamRostersColumnA, teamAColors);
  applyTeamColors(elements.teamRostersColumnB, teamBColors);
}

function applyMatchStatsPayload(payload) {
  const stats = payload?.stats || {};
  setMatchStatsValue(elements.matchStatsHoldsA, stats.holdsA);
  setMatchStatsValue(elements.matchStatsHoldsB, stats.holdsB);
  setMatchStatsValue(elements.matchStatsBreaksA, stats.breaksA);
  setMatchStatsValue(elements.matchStatsBreaksB, stats.breaksB);
  setMatchStatsValue(elements.matchStatsTurnoversA, stats.turnoversA);
  setMatchStatsValue(elements.matchStatsTurnoversB, stats.turnoversB);
  setMatchStatsValue(elements.matchStatsBlocksA, stats.blocksA);
  setMatchStatsValue(elements.matchStatsBlocksB, stats.blocksB);
  if (elements.matchStatsTitle && payload?.title) elements.matchStatsTitle.textContent = payload.title;
}

function renderRosterList(element, players) {
  if (!element) return;
  const nextChildren = (Array.isArray(players) && players.length ? players : [null]).map((player) => {
    const item = document.createElement("li");
    item.className = "roster-banner-item";
    if (!player) {
      item.textContent = "No players loaded.";
      item.classList.add("is-empty");
      return item;
    }

    const name = document.createElement("span");
    name.className = "roster-banner-name";
    name.textContent = (player.name || "Player").toString().trim();

    const identity = document.createElement("span");
    identity.className = "roster-banner-identity";

    if (player.isCaptain) {
      const captainTag = document.createElement("span");
      captainTag.className = "roster-banner-tag roster-banner-tag--captain";
      captainTag.textContent = "C";
      identity.append(captainTag);
    }

    if (player.isSpiritCaptain) {
      const spiritTag = document.createElement("span");
      spiritTag.className = "roster-banner-tag roster-banner-tag--spirit";
      spiritTag.textContent = "SC";
      identity.append(spiritTag);
    }

    const number = document.createElement("span");
    number.className = "roster-banner-number";
    number.textContent = (player.number != null && Number.isFinite(Number(player.number))) ? `#${player.number}` : "";

    identity.append(name, number);
    item.append(identity);
    return item;
  });
  element.replaceChildren(...nextChildren);
}

// Match start_time is UTC; all matches play in CAT (UTC+2).
function formatKickoffCat(value) {
  if (!value) return "--";
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return String(value);
  const shifted = new Date(ms + 2 * 60 * 60 * 1000);
  const date = shifted.toLocaleDateString(undefined, { day: "2-digit", month: "short", timeZone: "UTC" });
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${date}, ${hh}:${mm}`;
}

// Only surface a metric when it is significant enough to matter for the match.
const WEATHER_DISPLAY_THRESHOLDS = {
  rainChancePct: 30,      // hide rain chance below this
  humidityHighPct: 80,    // show humidity only when >= this ...
  humidityLowPct: 25,     // ... or <= this (notably dry)
  sunWindowMin: 90,       // show sunrise/sunset only within this many minutes of start
};

// Format an epoch-ms instant as HH:MM in CAT (UTC+2) — matches match start_time basis.
function formatSunCat(ms) {
  if (!Number.isFinite(ms)) return "--";
  const shifted = new Date(ms + 2 * 60 * 60 * 1000);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatWeatherLine(weather, startTime) {
  if (!weather) return "";
  const parts = [];
  // Lead with feels-like (apparent) temperature; fall back to actual temp.
  const displayTemp = Number.isFinite(weather.feelsLike) ? weather.feelsLike : weather.temp;
  if (displayTemp != null) parts.push(`${displayTemp}${weather.tempUnit || "°"} feels like`);
  if (weather.condition) parts.push(weather.condition);
  let line = parts.join(" ");

  const t = WEATHER_DISPLAY_THRESHOLDS;
  const extras = [];

  // Wind: always shown (key ultimate metric).
  if (weather.wind != null) extras.push(`${weather.wind} ${weather.windUnit || ""}`.trim() + " wind");

  // Humidity: only when notably high or notably dry.
  if (
    Number.isFinite(weather.humidity) &&
    (weather.humidity >= t.humidityHighPct || weather.humidity <= t.humidityLowPct)
  ) {
    extras.push(`${weather.humidity}% hum`);
  }

  // Rain chance: only when meaningful (no rain on a clear day).
  if (Number.isFinite(weather.rainChance) && weather.rainChance >= t.rainChancePct) {
    extras.push(`${weather.rainChance}% rain`);
  }

  // Sun time: only near dawn/dusk relative to match start. Never mid-day, only one shows.
  const startMs = startTime ? new Date(startTime).getTime() : NaN;
  if (Number.isFinite(startMs)) {
    const windowMs = t.sunWindowMin * 60 * 1000;
    if (Number.isFinite(weather.sunriseMs) && Math.abs(startMs - weather.sunriseMs) <= windowMs) {
      extras.push(`🌅 ${formatSunCat(weather.sunriseMs)}`);
    } else if (Number.isFinite(weather.sunsetMs) && Math.abs(startMs - weather.sunsetMs) <= windowMs) {
      extras.push(`🌇 ${formatSunCat(weather.sunsetMs)}`);
    }
  }

  if (extras.length) line += ` · ${extras.join(" · ")}`;
  return line;
}

const MATCHSTATUS_CHIP_CLASS = {
  Live: "matchstatus-chip--live",
  Halftime: "matchstatus-chip--ht",
  "Full time": "matchstatus-chip--after",
  Upcoming: "matchstatus-chip--pre",
};

function applyMatchStatusPayload(payload) {
  const phaseLabel = payload?.phaseLabel || "Match info";
  // Upcoming = not yet started; everything else (Live/Halftime/Full time) has a score.
  const started = phaseLabel !== "Upcoming";

  if (elements.matchStatusPhase) {
    elements.matchStatusPhase.textContent = phaseLabel;
    elements.matchStatusPhase.className = "matchstatus-chip";
    const chipClass = MATCHSTATUS_CHIP_CLASS[phaseLabel];
    if (chipClass) elements.matchStatusPhase.classList.add(chipClass);
  }
  if (elements.matchStatusTeamA) elements.matchStatusTeamA.textContent = payload?.teamAName || "Team A";
  if (elements.matchStatusTeamB) elements.matchStatusTeamB.textContent = payload?.teamBName || "Team B";
  if (elements.matchStatusScore) {
    if (started) {
      const a = Number.isFinite(payload?.scoreA) ? payload.scoreA : 0;
      const b = Number.isFinite(payload?.scoreB) ? payload.scoreB : 0;
      elements.matchStatusScore.textContent = `${a} - ${b}`;
      elements.matchStatusScore.classList.remove("matchstatus-score--pre");
    } else {
      // Pre-match: no meaningful score yet — show a muted "vs".
      elements.matchStatusScore.textContent = "vs";
      elements.matchStatusScore.classList.add("matchstatus-score--pre");
    }
  }
  if (elements.matchStatusKickoff) elements.matchStatusKickoff.textContent = formatKickoffCat(payload?.startTime);
  // Kickoff time only matters before the match starts.
  if (elements.matchStatusKickoffRow) elements.matchStatusKickoffRow.classList.toggle("is-hidden", started);
  if (elements.matchStatusVenue) elements.matchStatusVenue.textContent = payload?.venueName || "--";
  if (elements.matchStatusEvent) elements.matchStatusEvent.textContent = payload?.eventName || "--";
  const weatherLine = formatWeatherLine(payload?.weather, payload?.startTime);
  if (elements.matchStatusWeather) elements.matchStatusWeather.textContent = weatherLine || "No weather data";
  if (elements.matchStatusWeatherRow) elements.matchStatusWeatherRow.classList.toggle("is-hidden", !weatherLine);
}

function applyTeamRostersPayload(payload) {
  if (elements.teamRostersTitle && payload?.title) elements.teamRostersTitle.textContent = payload.title;
  if (elements.teamRostersTeamA && payload?.teamAName) elements.teamRostersTeamA.textContent = payload.teamAName;
  if (elements.teamRostersTeamB && payload?.teamBName) elements.teamRostersTeamB.textContent = payload.teamBName;
  renderRosterList(elements.teamRostersListA, payload?.rosters?.teamA);
  renderRosterList(elements.teamRostersListB, payload?.rosters?.teamB);
}

// ─── Main overlay update ──────────────────────────────────────────────────────

function updateOverlay(payload) {
  if (!payload?.match) return;
  const { match, scoreboard, scoreA, scoreB, clockText, clockInfo, statusLabel: derivedStatusLabel, eventName, logo, manualOverrides: mo } = payload;
  const { teamATheme: tATheme, teamBTheme: tBTheme } = getTeamThemes();
  const teamAName = formatTeamName(match.team_a);
  const teamBName = formatTeamName(match.team_b);
  const teamAColors = resolveTeamColors(match.team_a?.attributes, tATheme);
  const teamBColors = resolveTeamColors(match.team_b?.attributes, tBTheme);

  const status = scoreboard?.status || match.status;
  const normalizedStatus = (status || "").toString().trim().toLowerCase();
  const fallbackStatusLabel =
    formatStatusLabel({ period: scoreboard?.period, half: scoreboard?.half, status }) ||
    (normalizedStatus === "scheduled" ? (getOverlayInitialized() ? "SCHEDULED" : "STARTING SOON") : "") ||
    STATUS_LABELS[normalizedStatus] ||
    (status ? status.toString().toUpperCase() : "LIVE");

  const statusLabel = derivedStatusLabel || fallbackStatusLabel;
  const isClockRunning = Boolean(clockText) || (Boolean(clockInfo?.hasStarted) && !clockInfo?.isPaused);
  const hideClock = !isClockRunning;
  const matchClock =
    (mo?.enabled && mo.clock) ||
    clockText ||
    (hideClock ? "" : formatClock(scoreboard?.clock));

  _scoreboardLogo = logo || "";
  const resolvedLogo = resolveEventLogo();

  if (elements.eventName) elements.eventName.textContent = eventName || "Event";
  if (elements.logoFallback) elements.logoFallback.textContent = getInitials(eventName);
  const statusLabelEls = document.querySelectorAll('[data-role="status-label"]');
  if (statusLabelEls.length) {
    const resolvedLabel = statusLabel || "LIVE";
    statusLabelEls.forEach((el) => {
      el.textContent = resolvedLabel;
      el.classList.toggle("is-pull", resolvedLabel.startsWith("Pull:\n"));
      el.classList.toggle(
        "is-stacked",
        resolvedLabel === "1ST HALF" || resolvedLabel === "2ND HALF",
      );
    });
  }
  // Opt-in (data-clock-status on #matchClock): the clock slot also shows match status
  // (Scheduled / Starting soon / Finished) and turns red and counts up past the time cap.
  const clockShowsStatus = elements.matchClock?.hasAttribute("data-clock-status");
  let clockDisplay = matchClock;
  let clockHidden = hideClock;
  let clockOvertime = false;
  if (clockShowsStatus && !(mo?.enabled && mo.clock)) {
    const isFinished =
      derivedStatusLabel === "FINAL" || ["finished", "completed", "final"].includes(normalizedStatus);
    const overtime = clockInfo?.overtimeSeconds || 0;
    clockHidden = false;
    if (isFinished) {
      clockDisplay = "FINISHED";
    } else if (!clockInfo?.hasStarted) {
      // Initialised wins; otherwise show the match status (scheduled -> SCHEDULED)
      clockDisplay = getOverlayInitialized()
        ? "STARTING SOON"
        : STATUS_LABELS[normalizedStatus] || (status ? status.toString().toUpperCase() : "SCHEDULED");
    } else if (overtime > 0) {
      const mins = Math.floor(overtime / 60);
      clockDisplay = `${String(mins).padStart(2, "0")}:${String(overtime % 60).padStart(2, "0")}`;
      clockOvertime = true;
    }
  }
  if (elements.matchClock) elements.matchClock.textContent = clockDisplay;
  if (elements.matchClock?.parentElement) {
    elements.matchClock.parentElement.classList.toggle("is-hidden", clockHidden);
    elements.matchClock.parentElement.classList.toggle("is-overtime", clockOvertime);
  }
  if (elements.overlayBar) elements.overlayBar.classList.toggle("is-clock-hidden", hideClock);
  if (elements.teamAName) elements.teamAName.textContent = teamAName;
  if (elements.teamBName) elements.teamBName.textContent = teamBName;
  if (elements.timeoutTeamShortA) elements.timeoutTeamShortA.textContent = formatTeamShortName(match.team_a);
  if (elements.timeoutTeamShortB) elements.timeoutTeamShortB.textContent = formatTeamShortName(match.team_b);
  if (elements.scoreA) elements.scoreA.textContent = Number.isFinite(scoreA) ? scoreA : 0;
  if (elements.scoreB) elements.scoreB.textContent = Number.isFinite(scoreB) ? scoreB : 0;
  applyTeamColors(elements.teamABox, teamAColors);
  applyTeamColors(elements.teamBBox, teamBColors);
  updateMatchStatsHeader({ teamAName, teamBName, scoreA, scoreB, teamAColors, teamBColors });
  applyEventLogo(resolvedLogo);
}

// ─── Event logo ───────────────────────────────────────────────────────────────

const EVENT_LOGO_STORAGE_KEY = "stallcount:logo-event";
let _scoreboardLogo = "";
// Logo received over realtime from the control app; null until one arrives.
let _receivedEventLogo = null;

// An uploaded tournament logo overrides the scoreboard's logo.
function resolveEventLogo() {
  let customEventLogo = "";
  try { customEventLogo = localStorage.getItem(EVENT_LOGO_STORAGE_KEY) || ""; } catch { /* storage unavailable */ }
  if (_receivedEventLogo !== null) customEventLogo = _receivedEventLogo;
  return customEventLogo || _scoreboardLogo || DEFAULT_LOGO_SRC;
}

function applyEventLogo(src) {
  applyLogo(src);
  if (elements.matchStatusLogo) {
    if (src) {
      elements.matchStatusLogo.src = src;
      elements.matchStatusLogo.classList.remove("is-hidden");
    } else {
      elements.matchStatusLogo.removeAttribute("src");
      elements.matchStatusLogo.classList.add("is-hidden");
    }
  }
}

// ─── Banner active-key trackers ───────────────────────────────────────────────

let activePlayerStatsKey = null;
let playerStatsBannerHandle = null;
let activeMatchStatsKey = null;
let matchStatsBannerHandle = null;
let activeTeamRostersKey = null;
let teamRostersBannerHandle = null;
let activeMatchStatusKey = null;
let matchStatusBannerHandle = null;
let activeTimeoutKey = null;
let timeoutBannerHandle = null;
let activeBreakChanceKeyA = null;
let breakChanceBannerHandleA = null;
let activeBreakChanceKeyB = null;
let breakChanceBannerHandleB = null;
let activeFieldCallKey = null;
let fieldCallBannerHandle = null;
let activeMatchEventKey = null;
let matchEventBannerHandle = null;

// ─── Break chance system state ───────────────────────────────────────────────

let _bcEnabled = (() => {
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    const s = raw ? JSON.parse(raw) : {};
    return Boolean(s?.breakChanceEnabled);
  } catch { return false; }
})();
let _cachedMatchLogs = [];
let _bcActiveTeam = null; // "A" | "B" | null — currently displayed break chance

function _oppTeam(team) { return team === "A" ? "B" : team === "B" ? "A" : null; }

function _syncBreakChance(logs, match) {
  if (!match) return;
  const teamAId = match.team_a?.id;
  const teamBId = match.team_b?.id;
  if (!teamAId || !teamBId) return;

  const cache = getEventTypeCache();
  const toSlot = (id) => id === teamAId ? "A" : id === teamBId ? "B" : null;

  let possession = match.starting_team_id === teamAId ? "B"
    : match.starting_team_id === teamBId ? "A"
    : null;
  let lastScoringTeam = null;
  let bcTeam = null;

  const sorted = [...logs].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (const log of sorted) {
    const eventType = cache.get(log.event_type_id);
    const code = (resolveEventCode(eventType) || "").toLowerCase();
    const team = toSlot(log.team_id);

    if (code === MATCH_LOG_EVENT_CODES.SCORE || code === MATCH_LOG_EVENT_CODES.CALAHAN) {
      lastScoringTeam = team;
      bcTeam = null;
      possession = _oppTeam(team) ?? possession;
      continue;
    }

    if (code === MATCH_LOG_EVENT_CODES.HALFTIME_START || code === MATCH_LOG_EVENT_CODES.MATCH_END) {
      lastScoringTeam = null;
      bcTeam = null;
      possession = null;
      continue;
    }

    const isTurnover = code === MATCH_LOG_EVENT_CODES.TURNOVER;
    const isBlock = code === MATCH_LOG_EVENT_CODES.BLOCK;
    if (isTurnover || isBlock) {
      // Infer the gaining team relative to who currently holds the disc.
      // Block: reported team gained it. Turnover: if the reported team is the
      // one holding the disc, they lost it (opponent gains); otherwise the
      // reported team is the gainer. Mirrors the possession logic in App.jsx.
      let gaining = team;
      if (isTurnover && possession && team && team === possession) {
        gaining = _oppTeam(team);
      }
      if (!gaining && possession) {
        gaining = _oppTeam(possession);
      }
      if (gaining) possession = gaining;
      bcTeam = (lastScoringTeam && possession === lastScoringTeam) ? lastScoringTeam : null;
      continue;
    }
  }

  _applyBreakChanceState(bcTeam);
}

function _applyBreakChanceState(newTeam) {
  if (newTeam === _bcActiveTeam) return;
  _bcActiveTeam = newTeam;

  // Cancel any active banner(s)
  breakChanceBannerHandleA?.cancel();
  breakChanceBannerHandleB?.cancel();
  breakChanceBannerHandleA = null;
  breakChanceBannerHandleB = null;
  activeBreakChanceKeyA = null;
  activeBreakChanceKeyB = null;

  if (!newTeam) return;

  // Show only the banner for the team that has the break chance
  const target = newTeam === "A" ? elements.breakChanceA : elements.breakChanceB;
  if (!target) return;
  target.classList.remove("is-active", "is-persistent");
  void target.offsetWidth;
  target.classList.add("is-persistent");

  const key = `bc:auto:${newTeam}`;
  if (newTeam === "A") { activeBreakChanceKeyA = key; } else { activeBreakChanceKeyB = key; }

  const handle = { cancel() { target.classList.remove("is-active", "is-persistent"); } };
  if (newTeam === "A") { breakChanceBannerHandleA = handle; } else { breakChanceBannerHandleB = handle; }
}

// ─── Banner show functions ────────────────────────────────────────────────────

function showBanner(payload) {
  if (!elements.banner || !payload?.playerName) return;
  const payloadKey = getOverlayPayloadKey(payload);
  const autoFade = isAutoFadeEnabled(payload);

  if (!autoFade && activePlayerStatsKey === payloadKey && elements.banner.classList.contains("is-active")) {
    playerStatsBannerHandle?.cancel();
    activePlayerStatsKey = null;
    return;
  }

  playerStatsBannerHandle?.cancel();
  activePlayerStatsKey = payloadKey;

  playerStatsBannerHandle = manageBannerState(payload, {
    targets: [{
      element: elements.banner,
      onPrepare: () => {
        applyBannerTheme(payload);
        if (elements.bannerPlayerName) elements.bannerPlayerName.textContent = payload.playerName.toUpperCase();
        applyBannerStats(payload.stats);
      },
    }],
    timeout: autoFade ? 6200 : null,
  });

  if (!autoFade) elements.banner.classList.add("is-persistent");
}

function showMatchStatsBanner(payload) {
  if (!elements.matchStatsBanner) return;
  const payloadKey = getOverlayPayloadKey(payload);
  const autoFade = isAutoFadeEnabled(payload);

  if (!autoFade && activeMatchStatsKey === payloadKey && elements.matchStatsBanner.classList.contains("is-active")) {
    matchStatsBannerHandle?.cancel();
    activeMatchStatsKey = null;
    return;
  }

  matchStatsBannerHandle?.cancel();
  activeMatchStatsKey = payloadKey;

  matchStatsBannerHandle = manageBannerState(payload, {
    targets: [{
      element: elements.matchStatsBanner,
      onPrepare: () => applyMatchStatsPayload(payload),
    }],
    timeout: autoFade ? 8000 : null,
  });

  if (!autoFade) elements.matchStatsBanner.classList.add("is-persistent");
}

function showTeamRostersBanner(payload) {
  if (!elements.teamRostersBanner) return;
  const payloadKey = getOverlayPayloadKey(payload);
  const autoFade = isAutoFadeEnabled(payload);

  if (!autoFade && activeTeamRostersKey === payloadKey && elements.teamRostersBanner.classList.contains("is-active")) {
    teamRostersBannerHandle?.cancel();
    activeTeamRostersKey = null;
    return;
  }

  teamRostersBannerHandle?.cancel();
  activeTeamRostersKey = payloadKey;

  teamRostersBannerHandle = manageBannerState(payload, {
    targets: [{
      element: elements.teamRostersBanner,
      onPrepare: () => applyTeamRostersPayload(payload),
    }],
    timeout: autoFade ? 10000 : null,
  });

  if (!autoFade) elements.teamRostersBanner.classList.add("is-persistent");
}


function showMatchStatusBanner(payload) {
  if (!elements.matchStatusBanner) return;
  const payloadKey = getOverlayPayloadKey(payload);
  const autoFade = isAutoFadeEnabled(payload);

  if (!autoFade && activeMatchStatusKey === payloadKey && elements.matchStatusBanner.classList.contains("is-active")) {
    matchStatusBannerHandle?.cancel();
    activeMatchStatusKey = null;
    return;
  }

  matchStatusBannerHandle?.cancel();
  activeMatchStatusKey = payloadKey;

  matchStatusBannerHandle = manageBannerState(payload, {
    targets: [{
      element: elements.matchStatusBanner,
      onPrepare: () => applyMatchStatusPayload(payload),
    }],
    timeout: autoFade ? 10000 : null,
  });

  if (!autoFade) elements.matchStatusBanner.classList.add("is-persistent");
}

function showTimeoutBanner(team, payload = null) {
  const target = team === "A" ? elements.timeoutA : team === "B" ? elements.timeoutB : null;
  if (!target) return;
  const payloadKey = getOverlayPayloadKey(payload || { type: "timeout", team });
  const autoFade = isAutoFadeEnabled(payload);

  if (!autoFade && activeTimeoutKey === payloadKey && target.classList.contains("is-active")) {
    timeoutBannerHandle?.cancel();
    activeTimeoutKey = null;
    return;
  }

  timeoutBannerHandle?.cancel();
  activeTimeoutKey = payloadKey;

  timeoutBannerHandle = manageBannerState(payload || { type: "timeout", team }, {
    targets: [{ element: target }],
    timeout: autoFade ? 4200 : null,
  });

  if (!autoFade) target.classList.add("is-persistent");
}

function showBreakChanceBanner(team, payload = null) {
  const target = team === "A" ? elements.breakChanceA : team === "B" ? elements.breakChanceB : null;
  if (!target) return;
  const payloadKey = getOverlayPayloadKey(payload || { type: "breakChance", team });
  const autoFade = isAutoFadeEnabled(payload);

  let activeKey = team === "A" ? activeBreakChanceKeyA : activeBreakChanceKeyB;
  let handle = team === "A" ? breakChanceBannerHandleA : breakChanceBannerHandleB;
  const setHandle = (h) => { if (team === "A") { breakChanceBannerHandleA = h; activeBreakChanceKeyA = payloadKey; } else { breakChanceBannerHandleB = h; activeBreakChanceKeyB = payloadKey; } };
  const clearHandle = () => { if (team === "A") { breakChanceBannerHandleA = null; activeBreakChanceKeyA = null; } else { breakChanceBannerHandleB = null; activeBreakChanceKeyB = null; } };

  if (!autoFade && activeKey === payloadKey && target.classList.contains("is-active")) {
    handle?.cancel();
    clearHandle();
    return;
  }

  handle?.cancel();
  setHandle(manageBannerState(payload || { type: "breakChance", team }, {
    targets: [{ element: target }],
    timeout: autoFade ? 4200 : null,
  }));

  if (!autoFade) target.classList.add("is-persistent");
}

function getFieldCallLabel(payload) {
  const rawLabel = (payload?.callLabel || payload?.label || "").toString().trim();
  return rawLabel ? rawLabel.toUpperCase() : "FIELD CALL";
}

function showFieldCallBanner(payload) {
  if (!elements.fieldCallBanner || !elements.fieldCallBannerLabel) return;
  const payloadKey = getOverlayPayloadKey(payload);
  const autoFade = isAutoFadeEnabled(payload);

  if (!autoFade && activeFieldCallKey === payloadKey && elements.fieldCallBanner.classList.contains("is-active")) {
    fieldCallBannerHandle?.cancel();
    activeFieldCallKey = null;
    return;
  }

  fieldCallBannerHandle?.cancel();
  activeFieldCallKey = payloadKey;

  fieldCallBannerHandle = manageBannerState(payload, {
    targets: [{
      element: elements.fieldCallBanner,
      onPrepare: () => { elements.fieldCallBannerLabel.textContent = getFieldCallLabel(payload); },
    }],
    timeout: autoFade ? 4200 : null,
  });

  if (!autoFade) elements.fieldCallBanner.classList.add("is-persistent");
}

function getMatchEventLabel(payload) {
  const rawCode = (payload?.eventCode || "").toString().trim().toLowerCase();
  const rawDescription = (payload?.eventDescription || "").toString().trim();
  const combined = `${rawCode} ${rawDescription.toLowerCase()}`.trim();
  if (combined.includes("half")) return "HALFTIME";
  if (combined.includes("stoppage")) return "STOPPAGE";
  if (combined.includes("timeout")) return "TIMEOUT";
  if (rawDescription) return rawDescription.toUpperCase();
  if (rawCode) return rawCode.replace(/_/g, " ").toUpperCase();
  return "MATCH EVENT";
}

function isStoppagePayload(payload) {
  const rawCode = (payload?.eventCode || "").toString().trim().toLowerCase();
  const rawDescription = (payload?.eventDescription || "").toString().trim().toLowerCase();
  return rawCode === MATCH_LOG_EVENT_CODES.STOPPAGE_START || rawDescription.includes("stoppage");
}

function showMatchEventBanner(payload) {
  if (!elements.matchEventBanner || !elements.matchEventBannerLabel) return;
  const payloadKey = getOverlayPayloadKey(payload);
  const autoFade = isAutoFadeEnabled(payload);

  if (!autoFade && activeMatchEventKey === payloadKey && elements.matchEventBanner.classList.contains("is-active")) {
    matchEventBannerHandle?.cancel();
    elements.matchEventBanner.classList.remove("is-stoppage");
    activeMatchEventKey = null;
    return;
  }

  matchEventBannerHandle?.cancel();
  activeMatchEventKey = payloadKey;

  matchEventBannerHandle = manageBannerState(payload, {
    targets: [{
      element: elements.matchEventBanner,
      onPrepare: () => {
        elements.matchEventBannerLabel.textContent = getMatchEventLabel(payload);
        elements.matchEventBanner.classList.toggle("is-stoppage", isStoppagePayload(payload));
      },
    }],
    timeout: autoFade ? 4600 : null,
  });

  if (!autoFade) elements.matchEventBanner.classList.add("is-persistent");
}

function hideMatchEventBanner() {
  matchEventBannerHandle?.cancel();
  elements.matchEventBanner?.classList.remove("is-stoppage");
  activeMatchEventKey = null;
  matchEventBannerHandle = null;
}

function syncStoppageBanner() {
  if (isStoppageActive()) {
    showMatchEventBanner({
      type: "matchEvent",
      eventCode: MATCH_LOG_EVENT_CODES.STOPPAGE_START,
      eventDescription: "Stoppage",
      autoFade: false,
    });
    return;
  }
  if (activeMatchEventKey === `matchEvent:${MATCH_LOG_EVENT_CODES.STOPPAGE_START}:`) {
    hideMatchEventBanner();
  }
}

// Shows the timeout banner for the whole timeout_start → timeout_end window.
function syncTimeoutBanner() {
  const team = getActiveTimeoutTeam();
  if (team === "A" || team === "B") {
    showTimeoutBanner(team, { type: "timeout", team, autoFade: false });
    return;
  }
  // No active timeout — clear any persistent timeout banner.
  timeoutBannerHandle?.cancel();
  timeoutBannerHandle = null;
  activeTimeoutKey = null;
  elements.timeoutA?.classList.remove("is-active", "is-persistent");
  elements.timeoutB?.classList.remove("is-active", "is-persistent");
}

// Shows the halftime banner for the whole halftime_start → halftime_end window.
function syncHalftimeBanner() {
  if (isHalftimeActive()) {
    showMatchEventBanner({
      type: "matchEvent",
      eventCode: MATCH_LOG_EVENT_CODES.HALFTIME_START,
      eventDescription: "Halftime",
      autoFade: false,
    });
    return;
  }
  if (activeMatchEventKey === `matchEvent:${MATCH_LOG_EVENT_CODES.HALFTIME_START}:`) {
    hideMatchEventBanner();
  }
}

// ─── Banner payload router ────────────────────────────────────────────────────

function handleOverlayBannerPayload(payload) {
  if (payload?.type === "playerStats") { showBanner(payload); return; }
  if (payload?.type === "matchStats") { showMatchStatsBanner(payload); return; }
  if (payload?.type === "matchStatus") { showMatchStatusBanner(payload); return; }
  if (payload?.type === "teamRosters") { showTeamRostersBanner(payload); return; }
  if (payload?.type === "timeout") {
    const team = (payload.team || "").toString().trim().toUpperCase();
    if (team === "A" || team === "B") showTimeoutBanner(team, payload);
    return;
  }
  if (payload?.type === "breakChance") {
    const team = (payload.team || "").toString().trim().toUpperCase();
    if (team === "BOTH") {
      showBreakChanceBanner("A", payload);
      showBreakChanceBanner("B", payload);
    } else if (team === "A" || team === "B") {
      showBreakChanceBanner(team, payload);
    }
    return;
  }
  if (payload?.type === "fieldCall") { showFieldCallBanner(payload); return; }
  if (payload?.type === "matchEvent") { showMatchEventBanner(payload); }
}

// ─── Engine callback registrations ───────────────────────────────────────────

onMatchLogUpdate((logs) => { _cachedMatchLogs = logs; });

onScoreUpdate((payload) => {
  updateOverlay(payload);
  if (_bcEnabled) _syncBreakChance(_cachedMatchLogs, payload.match);
});

onBannerTrigger((type, data) => {
  if (type === "syncStoppage") { syncStoppageBanner(); return; }
  if (type === "syncTimeout") { syncTimeoutBanner(); return; }
  if (type === "syncHalftime") { syncHalftimeBanner(); return; }
  if (type === "timeout") { showTimeoutBanner(data?.team); return; }
  // All other banner types are routed by handleOverlayBannerPayload below
  if (VALID_OVERLAY_PAYLOAD_TYPES.has(type)) {
    handleOverlayBannerPayload(data);
  }
});

onMetaMessage(({ text, isError }) => setMeta(text, isError));

// Keep the received logo in this browser's storage too, so a separate browser
// (e.g. OBS) still has it after a reload when the control app isn't open.
onEventLogo((dataUrl) => {
  _receivedEventLogo = dataUrl;
  try {
    if (dataUrl) localStorage.setItem(EVENT_LOGO_STORAGE_KEY, dataUrl);
    else localStorage.removeItem(EVENT_LOGO_STORAGE_KEY);
  } catch { /* storage full or unavailable — the in-memory copy still applies */ }
  applyEventLogo(resolveEventLogo());
});

// ─── Storage listener ─────────────────────────────────────────────────────────

let _prevAutoFadeSettings = null;

function _dismissIfAutoFadeFlippedOn(currentValue, handle, resetKey) {
  if (currentValue === true && handle) {
    handle.cancel();
    resetKey();
  }
}

window.addEventListener("storage", (event) => {
  if (event.key === APP_SETTINGS_STORAGE_KEY) {
    const settings = _readPersistedAppSettings();
    updateSettings({
      overlayInitialized: settings.isInitialized === true,
    });

    // Dismiss persistent banners only when their autofade was just flipped from false → true
    const prev = _prevAutoFadeSettings;
    if (prev) {
      if (prev.playerStatsAutoFade === false)  _dismissIfAutoFadeFlippedOn(settings.playerStatsAutoFade, playerStatsBannerHandle, () => { playerStatsBannerHandle = null; activePlayerStatsKey = null; });
      if (prev.matchStatsAutoFade === false)   _dismissIfAutoFadeFlippedOn(settings.matchStatsAutoFade, matchStatsBannerHandle, () => { matchStatsBannerHandle = null; activeMatchStatsKey = null; });
      if (prev.teamRostersAutoFade === false)  _dismissIfAutoFadeFlippedOn(settings.teamRostersAutoFade, teamRostersBannerHandle, () => { teamRostersBannerHandle = null; activeTeamRostersKey = null; });
      if (prev.matchStatusAutoFade === false)  _dismissIfAutoFadeFlippedOn(settings.matchStatusAutoFade, matchStatusBannerHandle, () => { matchStatusBannerHandle = null; activeMatchStatusKey = null; });
      if (prev.timeoutAutoFade === false)      _dismissIfAutoFadeFlippedOn(settings.timeoutAutoFade, timeoutBannerHandle, () => { timeoutBannerHandle = null; activeTimeoutKey = null; });
      if (prev.fieldCallAutoFade === false)    _dismissIfAutoFadeFlippedOn(settings.fieldCallAutoFade, fieldCallBannerHandle, () => { fieldCallBannerHandle = null; activeFieldCallKey = null; });
      if (prev.matchEventAutoFade === false)   _dismissIfAutoFadeFlippedOn(settings.matchEventAutoFade, matchEventBannerHandle, () => { matchEventBannerHandle = null; activeMatchEventKey = null; });
    }
    _prevAutoFadeSettings = {
      playerStatsAutoFade: settings.playerStatsAutoFade,
      matchStatsAutoFade: settings.matchStatsAutoFade,
      teamRostersAutoFade: settings.teamRostersAutoFade,
      matchStatusAutoFade: settings.matchStatusAutoFade,
      timeoutAutoFade: settings.timeoutAutoFade,
      fieldCallAutoFade: settings.fieldCallAutoFade,
      matchEventAutoFade: settings.matchEventAutoFade,
    };

    const wasEnabled = _bcEnabled;
    _bcEnabled = Boolean(settings.breakChanceEnabled);
    if (!_bcEnabled && wasEnabled) {
      // Turned off — clear any active banner immediately
      _applyBreakChanceState(null);
    } else if (_bcEnabled && !wasEnabled) {
      // Turned on — re-evaluate against cached logs
      _syncBreakChance(_cachedMatchLogs, getCurrentMatch());
    }
    return;
  }

  if (event.key === EVENT_LOGO_STORAGE_KEY) {
    _receivedEventLogo = null; // same-browser upload: storage is now the source of truth
    applyEventLogo(resolveEventLogo());
    return;
  }

  if (event.key !== "overlayBanner") return;
  if (!event.newValue) return;
  try {
    const payload = JSON.parse(event.newValue);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    if (!VALID_OVERLAY_PAYLOAD_TYPES.has(payload.type)) return;
    handleOverlayBannerPayload(payload);
  } catch {
    // ignore malformed payloads
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

init(matchId, {
  teamATheme,
  teamBTheme,
  manualOverrides,
  isPreview,
  overlayInitialized,
});
