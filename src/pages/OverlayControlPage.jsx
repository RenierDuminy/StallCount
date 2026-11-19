import { useEffect, useMemo, useRef, useState } from "react";
import { SectionShell } from "../components/ui/primitives";
import { supabase } from "../services/supabaseClient";
import { MATCH_LOG_EVENT_CODES } from "../services/matchLogService";
import { LEGACY_TIMEOUT_CODE, resolveEventCode } from "../overlay/overlayEngine";
import { ConfigView } from "../overlay/ConfigView";
import { OVERLAY_OPTIONS } from "../overlay/overlayOptions";
import { ControlView } from "../overlay/ControlView";
import { readCachedWeatherForVenue, summarizeWeather, getVenueName } from "../overlay/WeatherCard";
import { computePossessionTime, findBreakLogIds } from "../utils/matchBreaks";
import { resolveInterPointSeconds } from "../overlay/overlayAddons";
import { isForfeitMatch } from "../utils/standings";
import { normalizeOverlayAddons } from "../overlay/overlayAddons";
import {
  isTestMatchId,
  createDefaultTestMatch,
  createTestMatchFromMatch,
  createTestMatchId,
  readStoredTestMatch,
  writeStoredTestMatch,
  buildTestMatchRecords,
  computeTestPlayerStats,
  TEST_EVENT_TYPES,
  TEST_MATCH_BROADCAST_EVENT,
} from "../overlay/overlayTestMatch";
import { TestMatchSimulator } from "../overlay/OverlayTestMatchPanel";
import "../overlay/overlayControl.css";

const BASE_PATH = import.meta.env.BASE_URL || "/";
const NORMALIZED_BASE = BASE_PATH.endsWith("/") ? BASE_PATH : `${BASE_PATH}/`;
const MATCH_DETAIL_FIELDS = `
  id,
  event_id,
  status,
  score_a,
  score_b,
  start_time,
  starting_team_id,
  abba_pattern,
  venue_id,
  event:events!matches_event_id_fkey (id, name, type, start_date, end_date, location, rules, Status),
  venue:venues!matches_venue_id_fkey (id, name, location, latitude, longitude),
  team_a:teams!matches_team_a_fkey (id, name, short_name, attributes),
  team_b:teams!matches_team_b_fkey (id, name, short_name, attributes)
`;
const MATCH_LOG_FIELDS =
  "id, match_id, event_type_id, team_id, actor_id, secondary_actor_id, created_at, abba_line";
const MATCH_LOG_PAGE_SIZE = 1000;
const APP_SETTINGS_STORAGE_KEY = "stallcount:overlay-control-settings";

// Test match rows point at synthetic event types; their ids can't collide with the table's.
const eventTypeCache = new Map(TEST_EVENT_TYPES.map((eventType) => [eventType.id, eventType]));
let eventTypeCacheLoaded = false;
const eventCache = new Map();
const rosterCache = new Map();

const FINISHED_MATCH_STATUSES = new Set(["finished", "completed", "complete", "final", "ended", "done"]);
const ACTIVE_EVENT_STATUSES = new Set(["live", "scheduled", "upcoming", "active"]);

function readPersistedAppSettings() {
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getInitialMatchId() {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("matchId")) {
    return (searchParams.get("matchId") || "").trim();
  }
  return (readPersistedAppSettings().matchId || "").toString().trim();
}

function getInitialOverlayChoice() {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("overlay")) {
    return (searchParams.get("overlay") || "").trim() || "overlays/wfdf-competitive.html";
  }

  // A remembered layout that no longer exists (e.g. a removed test variant)
  // would point the preview and OBS link at a missing page: use the default.
  const persisted = readPersistedAppSettings().overlayChoice;
  const known = OVERLAY_OPTIONS.some((option) => option.value === persisted);
  return persisted && known ? persisted : "overlays/wfdf-competitive.html";
}


function getInitialTeamTheme(teamKey) {
  const searchParams = new URLSearchParams(window.location.search);
  const persistedValue = (readPersistedAppSettings()[teamKey] || "primary").toString().trim().toLowerCase();
  const value = (searchParams.get(teamKey) || persistedValue || "primary").trim().toLowerCase();
  return value === "secondary" ? "secondary" : "primary";
}

function getInitialManualEnabled() {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("manual")) {
    const value = (searchParams.get("manual") || "").trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes";
  }
  return Boolean(readPersistedAppSettings().manualOverrideEnabled);
}

function getInitialManualStatus() {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("manualStatus")) {
    return (searchParams.get("manualStatus") || "starting_soon").trim().toLowerCase();
  }
  return (readPersistedAppSettings().manualStatus || "starting_soon").toString().trim().toLowerCase();
}

function getInitialManualClock() {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("manualClock")) {
    return (searchParams.get("manualClock") || "").trim();
  }
  return (readPersistedAppSettings().manualClock || "").toString().trim();
}

function getInitialManualScore(key) {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has(key)) {
    return (searchParams.get(key) || "").trim();
  }
  return (readPersistedAppSettings()[key] || "").toString().trim();
}


function getInitialIsInitialized() {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("matchId")) {
    return Boolean((searchParams.get("matchId") || "").trim());
  }

  const persistedValue = readPersistedAppSettings().isInitialized;
  if (typeof persistedValue === "boolean") {
    return persistedValue;
  }

  return Boolean(getInitialMatchId());
}

function getInitialBannerPlayerId() {
  return (readPersistedAppSettings().bannerPlayerId || "").toString().trim();
}

const LOGO_STORAGE_KEY_A = "stallcount:logo-team-a";
const LOGO_STORAGE_KEY_B = "stallcount:logo-team-b";
const LOGO_STORAGE_KEY_EVENT = "stallcount:logo-event";

function readLogoDataUrl(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

// Returns false when the logo could not be stored (usually the storage quota),
// in which case overlays would never see it.
function saveLogoDataUrl(key, dataUrl) {
  try {
    if (dataUrl) {
      window.localStorage.setItem(key, dataUrl);
    } else {
      window.localStorage.removeItem(key);
    }
    return true;
  } catch (error) {
    console.warn(`Failed to save logo "${key}"`, error);
    window.alert("This logo couldn't be saved for the overlay (browser storage is full). Remove another logo and try again.");
    return false;
  }
}

function getInitialPopupAutoFade(key) {
  const persistedValue = readPersistedAppSettings()[key];
  return typeof persistedValue === "boolean" ? persistedValue : true;
}

function getInitialView() {
  const hash = window.location.hash.replace("#", "").replace("/", "").trim().toLowerCase();
  if (hash === "control") return "control";
  if (hash === "config") return "config";
  const persistedView = (readPersistedAppSettings().activeView || "").toString().trim().toLowerCase();
  if (persistedView === "control") return "control";
  if (persistedView === "config") return "config";
  return "config";
}

function parseTeamAttributes(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getTeamPalette(attributes, theme) {
  const parsed = parseTeamAttributes(attributes);
  const primary = {
    bg: parsed.primaryColor || "#0b1f19",
    text: parsed.textOnPrimary || "#e8f4ed",
    label: "Primary",
  };
  const secondary = {
    bg: parsed.secondaryColor || "#f8fafc",
    text: parsed.textOnSecondary || "#0f172a",
    label: "Secondary",
  };
  return theme === "secondary" ? secondary : primary;
}

function normalizeOverlayPath(value) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed.slice(1);
  return trimmed;
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function buildOverlayUrl({
  overlayFile,
  matchId,
  teamATheme,
  teamBTheme,
  manualOverrides,
  isInitialized,
}) {
  if (!overlayFile) return "";
  const trimmed = overlayFile.trim();
  if (!trimmed) return "";

  const url = isAbsoluteUrl(trimmed)
    ? new URL(trimmed)
    : new URL(`${NORMALIZED_BASE}${normalizeOverlayPath(trimmed)}`, window.location.origin);

  if (matchId) {
    url.searchParams.set("matchId", matchId.trim());
  }
  if (teamATheme) {
    url.searchParams.set("teamATheme", teamATheme);
  }
  if (teamBTheme) {
    url.searchParams.set("teamBTheme", teamBTheme);
  }
  if (manualOverrides?.enabled) {
    url.searchParams.set("manual", "1");
    if (manualOverrides.status) {
      url.searchParams.set("manualStatus", manualOverrides.status);
    }
    if (manualOverrides.clock) {
      url.searchParams.set("manualClock", manualOverrides.clock);
    }
    if (manualOverrides.scoreA !== "") {
      url.searchParams.set("manualScoreA", manualOverrides.scoreA);
    }
    if (manualOverrides.scoreB !== "") {
      url.searchParams.set("manualScoreB", manualOverrides.scoreB);
    }
  }
  if (isInitialized) {
    url.searchParams.set("initialized", "1");
  } else {
    url.searchParams.delete("initialized");
  }

  return url.toString();
}


// Replays the log to derive the score and holds/breaks/turnovers/blocks.
// Kept outside the component: the point-state closure reassigns locals, which
// the React Compiler cannot preserve inside a useMemo.
function computeMatchStats(matchDetails, sortedMatchLogs, resolvedEventCodeCache) {
  if (!matchDetails) return null;
  const teamAId = matchDetails?.team_a?.id || null;
  const teamBId = matchDetails?.team_b?.id || null;
  const toTeamKey = (teamId) => {
    if (!teamId) return null;
    if (teamId === teamAId) return "teamA";
    if (teamId === teamBId) return "teamB";
    return null;
  };
  const getOppositeTeam = (teamKey) => {
    if (teamKey === "teamA") return "teamB";
    if (teamKey === "teamB") return "teamA";
    return null;
  };
  const normalizeTeamKey = (teamKey) => (teamKey === "teamA" || teamKey === "teamB" ? teamKey : null);
  const inferInitialOffense = () => {
    if (matchDetails?.starting_team_id === teamAId) return "teamB";
    if (matchDetails?.starting_team_id === teamBId) return "teamA";
    return "teamA";
  };
  const fallbackOffense = normalizeTeamKey(inferInitialOffense()) || "teamA";
  let pointStartingOffense = fallbackOffense;
  let currentPossession = pointStartingOffense;
  const resetPointState = (nextOffense) => {
    const normalized = normalizeTeamKey(nextOffense) || fallbackOffense;
    pointStartingOffense = normalized;
    currentPossession = pointStartingOffense;
  };
  resetPointState(fallbackOffense);

  const createTotals = () => ({
    holds: 0,
    breaks: 0,
    turnovers: 0,
    blocks: 0,
  });
  const totals = {
    teamA: createTotals(),
    teamB: createTotals(),
  };

  let scoreA = 0;
  let scoreB = 0;
  let hasScoreEvents = false;

  // Holds and breaks follow the shared rules in matchBreaks.js (the same as
  // the Break chance banner and the match log cards): a break is a score by
  // the team that pulled that point, a hold is one by the receiving team. The
  // pull flips at halftime, and the opening puller comes from the match start
  // entry, falling back to starting_team_id. The walk below kept its own
  // offence tracking, which missed the halftime flip.
  const codeOf = (log) =>
    (resolvedEventCodeCache.get(log.event_type_id) ?? resolveEventCode(eventTypeCache.get(log.event_type_id)) ?? "")
      .toString()
      .toLowerCase();
  const toSlot = (teamId) => (teamId && teamId === teamAId ? "A" : teamId && teamId === teamBId ? "B" : null);
  const breakIds = findBreakLogIds(
    sortedMatchLogs.map((log) => ({ id: log.id, eventCode: codeOf(log), team: toSlot(log.team_id) })),
    toSlot(matchDetails?.starting_team_id),
  );

  for (const log of sortedMatchLogs) {
    const eventType = eventTypeCache.get(log.event_type_id);
    const eventCode = resolvedEventCodeCache.get(log.event_type_id) ?? resolveEventCode(eventType);
    const eventCodeLower = (eventCode || "").toLowerCase();
    const eventLabel = (eventType?.description || eventType?.code || "").toString();
    const normalizedLabel = eventLabel.trim().toLowerCase();
    const teamKey = toTeamKey(log.team_id);

    if (
      eventCodeLower === MATCH_LOG_EVENT_CODES.SCORE ||
      eventCodeLower === MATCH_LOG_EVENT_CODES.CALAHAN
    ) {
      hasScoreEvents = true;
      if (teamKey === "teamA") scoreA += 1;
      if (teamKey === "teamB") scoreB += 1;

      if (teamKey) {
        if (breakIds.has(log.id)) totals[teamKey].breaks += 1;
        else totals[teamKey].holds += 1;
      }

      const nextOffense = teamKey ? getOppositeTeam(teamKey) : getOppositeTeam(pointStartingOffense);
      resetPointState(nextOffense);
      continue;
    }

    const isTurnoverEvent = eventCodeLower === MATCH_LOG_EVENT_CODES.TURNOVER;
    const isBlockEvent = eventCodeLower === MATCH_LOG_EVENT_CODES.BLOCK || normalizedLabel.includes("block");

    if (isTurnoverEvent || isBlockEvent) {
      const reportedTeamKey = teamKey;
      const previouslyHoldingTeam = currentPossession;
      let gainingTeamKey = reportedTeamKey;
      if (previouslyHoldingTeam && reportedTeamKey && reportedTeamKey === previouslyHoldingTeam && !isBlockEvent) {
        gainingTeamKey = getOppositeTeam(reportedTeamKey);
      }
      if (!gainingTeamKey && previouslyHoldingTeam) {
        gainingTeamKey = getOppositeTeam(previouslyHoldingTeam);
      }

      const losingTeamKey =
        previouslyHoldingTeam || (gainingTeamKey ? getOppositeTeam(gainingTeamKey) : null);
      if (losingTeamKey && totals[losingTeamKey]) {
        totals[losingTeamKey].turnovers += 1;
      }

      if (gainingTeamKey) {
        currentPossession = gainingTeamKey;
        if (isBlockEvent && totals[gainingTeamKey]) {
          totals[gainingTeamKey].blocks += 1;
        }
      }
    }
  }

  if (!hasScoreEvents) {
    const fallbackScoreA = Number(matchDetails?.score_a);
    const fallbackScoreB = Number(matchDetails?.score_b);
    if (Number.isFinite(fallbackScoreA)) scoreA = fallbackScoreA;
    if (Number.isFinite(fallbackScoreB)) scoreB = fallbackScoreB;
  }

  return {
    scoreA,
    scoreB,
    holdsA: totals.teamA.holds,
    holdsB: totals.teamB.holds,
    breaksA: totals.teamA.breaks,
    breaksB: totals.teamB.breaks,
    turnoversA: totals.teamA.turnovers,
    turnoversB: totals.teamB.turnovers,
    blocksA: totals.teamA.blocks,
    blocksB: totals.teamB.blocks,
    ...computePossessionShare(matchDetails, sortedMatchLogs, codeOf, toSlot),
  };
}

// Possession as whole percentages of active playing time (see
// computePossessionTime in matchBreaks.js). Empty only before any play.
function computePossessionShare(matchDetails, sortedMatchLogs, codeOf, toSlot) {
  const { A, B, hasData } = computePossessionTime(
    sortedMatchLogs.map((log) => ({
      eventCode: codeOf(log),
      team: toSlot(log.team_id),
      ts: new Date(log.created_at).getTime(),
    })),
    {
      startingPuller: toSlot(matchDetails?.starting_team_id),
      interPointSeconds: resolveInterPointSeconds(matchDetails?.event?.rules),
    },
  );
  const total = A + B;
  if (!hasData || total <= 0) return { possessionA: "", possessionB: "", hasPossessionData: false };
  const possessionA = Math.round((A / total) * 100);
  return { possessionA: `${possessionA}%`, possessionB: `${100 - possessionA}%`, hasPossessionData: true };
}

export default function OverlayControlPage() {
  const overlayBannerChannelRef = useRef(null);
  const [overlayChoice, setOverlayChoice] = useState(getInitialOverlayChoice());

  const [matchId, setMatchId] = useState(getInitialMatchId());
  const [isInitialized, setIsInitialized] = useState(getInitialIsInitialized());
  const [teamATheme, setTeamATheme] = useState(getInitialTeamTheme("teamATheme"));
  const [teamBTheme, setTeamBTheme] = useState(getInitialTeamTheme("teamBTheme"));
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState(getInitialView());
  const [manualOverrideEnabled] = useState(getInitialManualEnabled());
  const [manualStatus] = useState(getInitialManualStatus());
  const [manualClock] = useState(getInitialManualClock());
  const [manualScoreA] = useState(getInitialManualScore("manualScoreA"));
  const [manualScoreB] = useState(getInitialManualScore("manualScoreB"));
  // Hides the whole scoreboard on every overlay (Overlay configuration > Banners).
  const [scoreboardHidden, setScoreboardHidden] = useState(
    () => Boolean(readPersistedAppSettings().scoreboardHidden),
  );
  const [breakChanceEnabled, setBreakChanceEnabled] = useState(
    () => Boolean(readPersistedAppSettings().breakChanceEnabled),
  );
  const [overlayAddons, setOverlayAddons] = useState(
    () => normalizeOverlayAddons(readPersistedAppSettings().overlayAddons),
  );
  // Autopilot (Overlay configuration): cards that show themselves.
  const [autopilot, setAutopilot] = useState(() => {
    const saved = readPersistedAppSettings().autopilot || {};
    return {
      preStartCards: Boolean(saved.preStartCards),
      statsAtHalftime: Boolean(saved.statsAtHalftime),
      statsAtFullTime: Boolean(saved.statsAtFullTime),
    };
  });
  // Overlays currently reporting in (see the heartbeat in overlayRuntime.js).
  const [overlayStatuses, setOverlayStatuses] = useState({});
  const [playerStatsAutoFade, setPlayerStatsAutoFade] = useState(getInitialPopupAutoFade("playerStatsAutoFade"));
  const [matchStatsAutoFade, setMatchStatsAutoFade] = useState(getInitialPopupAutoFade("matchStatsAutoFade"));
  const [timeoutAutoFade, setTimeoutAutoFade] = useState(getInitialPopupAutoFade("timeoutAutoFade"));
  const [matchEventAutoFade, setMatchEventAutoFade] = useState(getInitialPopupAutoFade("matchEventAutoFade"));
  const [fieldCallAutoFade, setFieldCallAutoFade] = useState(getInitialPopupAutoFade("fieldCallAutoFade"));
  const [teamRostersAutoFade, setTeamRostersAutoFade] = useState(getInitialPopupAutoFade("teamRostersAutoFade"));
  const [matchStatusAutoFade, setMatchStatusAutoFade] = useState(getInitialPopupAutoFade("matchStatusAutoFade"));
  const [bannerPlayerId, setBannerPlayerId] = useState(getInitialBannerPlayerId());
  const [bannerStatus, setBannerStatus] = useState("");
  const [matchEventButtons, setMatchEventButtons] = useState([]);
  const [matchEventError, setMatchEventError] = useState("");
  const [liveMatchDetails, setMatchDetails] = useState(null);
  const [liveEventDetails, setEventDetails] = useState(null);
  const [liveMatchLogs, setMatchLogs] = useState([]);
  const [eventTypesVersion, setEventTypesVersion] = useState(0);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [logsError, setLogsError] = useState("");
  const [rosterError, setRosterError] = useState("");
  const [liveRosterPlayersById, setRosterPlayersById] = useState({});
  const [liveRosterByTeam, setRosterByTeam] = useState({});
  // Which event + teams the roster above belongs to, set once it has settled
  // (loaded, cached or failed). Lets "Load a match by ID" wait for the roster.
  const [rosterSettledKey, setRosterSettledKey] = useState("");
  const [testMatch, setTestMatch] = useState(() => {
    const stored = readStoredTestMatch();
    const initialMatchId = getInitialMatchId();
    if (isTestMatchId(initialMatchId) && stored?.id !== initialMatchId) {
      return createDefaultTestMatch(initialMatchId);
    }
    return stored;
  });
  const [realMatchIdBeforeTest, setRealMatchIdBeforeTest] = useState(
    () => (readPersistedAppSettings().realMatchIdBeforeTest || "").toString().trim(),
  );
  const [teamALogo, setTeamALogoState] = useState(() => readLogoDataUrl(LOGO_STORAGE_KEY_A));
  const [teamBLogo, setTeamBLogoState] = useState(() => readLogoDataUrl(LOGO_STORAGE_KEY_B));
  const [eventLogo, setEventLogoState] = useState(() => readLogoDataUrl(LOGO_STORAGE_KEY_EVENT));

  const [selectedEventId, setSelectedEventId] = useState(
    () => (readPersistedAppSettings().selectedEventId || "").toString().trim(),
  );
  const [activeEvents, setActiveEvents] = useState([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [eventMatches, setEventMatches] = useState([]);
  const [isLoadingEventMatches, setIsLoadingEventMatches] = useState(false);
  const [eventMatchesError, setEventMatchesError] = useState("");

  const setTeamALogo = (dataUrl) => {
    if (saveLogoDataUrl(LOGO_STORAGE_KEY_A, dataUrl)) setTeamALogoState(dataUrl);
  };
  const setTeamBLogo = (dataUrl) => {
    if (saveLogoDataUrl(LOGO_STORAGE_KEY_B, dataUrl)) setTeamBLogoState(dataUrl);
  };
  // Latest event logo for the realtime channel handlers below.
  const eventLogoRef = useRef(eventLogo);
  useEffect(() => {
    eventLogoRef.current = eventLogo;
  }, [eventLogo]);

  // Team logos too: OBS is a separate browser, so it never sees this
  // browser's storage. Each logo goes in its own message, shrunk to 256 px
  // (realtime messages are size-capped; 256 px still covers the largest team
  // logo slot at 4K). The shrunk copy is cached per source image.
  const teamLogoBroadcastCache = useRef(new Map());
  const shrinkLogoForBroadcast = (dataUrl) => {
    if (!dataUrl) return Promise.resolve("");
    const cached = teamLogoBroadcastCache.current.get(dataUrl);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        try {
          const scale = Math.min(1, 256 / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          let small = canvas.toDataURL("image/webp", 0.85);
          if (!small.startsWith("data:image/webp")) small = canvas.toDataURL("image/png");
          teamLogoBroadcastCache.current.set(dataUrl, small);
          resolve(small);
        } catch {
          resolve(dataUrl);
        }
      };
      image.onerror = () => resolve("");
      image.src = dataUrl;
    });
  };
  const teamLogosRef = useRef({ A: "", B: "" });
  const broadcastTeamLogos = () => {
    ["A", "B"].forEach((slot) => {
      shrinkLogoForBroadcast(teamLogosRef.current[slot]).then((dataUrl) => {
        overlayBannerChannelRef.current
          ?.send({ type: "broadcast", event: "team-logo", payload: { slot, dataUrl: dataUrl || "" } })
          .catch(() => {});
      });
    });
  };

  // Overlays in another browser (e.g. OBS) can't read this browser's storage,
  // so the tournament logo is also pushed to them over realtime.
  const broadcastEventLogo = (dataUrl) => {
    overlayBannerChannelRef.current
      ?.send({ type: "broadcast", event: "event-logo", payload: { dataUrl: dataUrl || "" } })
      .catch(() => {});
  };

  // Same for the break chance switch, which overlays otherwise only see through
  // localStorage.
  const scoreboardHiddenRef = useRef(scoreboardHidden);
  const broadcastScoreboardVisibility = (hidden) => {
    overlayBannerChannelRef.current
      ?.send({ type: "broadcast", event: "scoreboard-visibility", payload: { hidden: Boolean(hidden) } })
      .catch(() => {});
  };
  useEffect(() => {
    scoreboardHiddenRef.current = scoreboardHidden;
    broadcastScoreboardVisibility(scoreboardHidden);
  }, [scoreboardHidden]);
  const breakChanceEnabledRef = useRef(breakChanceEnabled);
  const broadcastBreakChanceSetting = (enabled) => {
    overlayBannerChannelRef.current
      ?.send({ type: "broadcast", event: "break-chance-setting", payload: { enabled: Boolean(enabled) } })
      .catch(() => {});
  };
  useEffect(() => {
    breakChanceEnabledRef.current = breakChanceEnabled;
    broadcastBreakChanceSetting(breakChanceEnabled);
  }, [breakChanceEnabled]);

  // And the other add-ons (point duration, score info, gender line).
  const overlayAddonsRef = useRef(overlayAddons);
  const broadcastAddonSettings = (addons) => {
    overlayBannerChannelRef.current
      ?.send({ type: "broadcast", event: "addon-settings", payload: { addons } })
      .catch(() => {});
  };
  useEffect(() => {
    overlayAddonsRef.current = overlayAddons;
    broadcastAddonSettings(overlayAddons);
  }, [overlayAddons]);

  useEffect(() => {
    teamLogosRef.current = { A: teamALogo || "", B: teamBLogo || "" };
    broadcastTeamLogos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamALogo, teamBLogo]);

  const setEventLogo = (dataUrl) => {
    if (!saveLogoDataUrl(LOGO_STORAGE_KEY_EVENT, dataUrl)) return;
    setEventLogoState(dataUrl);
    broadcastEventLogo(dataUrl);
  };

  const trimmedMatchId = matchId.trim();
  const hasMatchId = Boolean(trimmedMatchId);
  const resolvedOverlayFile = overlayChoice;

  // A test match replaces every database read below with the editor's state.
  const isTestMode = isTestMatchId(trimmedMatchId);
  const testRecords = useMemo(
    () => (isTestMode && testMatch?.id === trimmedMatchId ? buildTestMatchRecords(testMatch) : null),
    [isTestMode, testMatch, trimmedMatchId],
  );
  const matchDetails = testRecords ? testRecords.match : liveMatchDetails;
  const eventDetails = testRecords ? testRecords.event : liveEventDetails;
  const matchLogs = testRecords ? testRecords.logs : liveMatchLogs;
  const rosterPlayersById = testRecords ? testRecords.playersById : liveRosterPlayersById;
  const rosterByTeam = testRecords ? testRecords.rosterByTeam : liveRosterByTeam;

  // A pasted or bookmarked test id this browser has no state for starts from defaults.
  useEffect(() => {
    if (isTestMode && testMatch?.id !== trimmedMatchId) {
      setTestMatch(createDefaultTestMatch(trimmedMatchId));
    }
  }, [isTestMode, testMatch?.id, trimmedMatchId]);

  // Overlays read the test match from storage (same browser) and realtime (OBS).
  // Editing changes it per keystroke, so realtime only gets the settled value.
  const testMatchRef = useRef(testMatch);
  const broadcastTestMatch = (state) => {
    if (!state || !isTestMatchId(state.id)) return;
    overlayBannerChannelRef.current
      ?.send({ type: "broadcast", event: TEST_MATCH_BROADCAST_EVENT, payload: { state } })
      .catch(() => {});
  };
  useEffect(() => {
    testMatchRef.current = testMatch;
    if (!testMatch) return undefined;
    writeStoredTestMatch(testMatch);
    const timer = window.setTimeout(() => broadcastTestMatch(testMatch), 250);
    return () => window.clearTimeout(timer);
  }, [testMatch]);

  // Turning the test match on copies the selected real match (teams, colours,
  // rosters, event, rules, log). The test id is kept so a copied OBS URL still
  // works, and the real match comes back when the test match is turned off.
  const handleSelectTestMatch = () => {
    const testId = testMatch?.id || createTestMatchId();
    let next = testMatch || createDefaultTestMatch(testId);
    if (liveMatchDetails && !isTestMode) {
      next = createTestMatchFromMatch(testId, {
        match: liveMatchDetails,
        rosterByTeam: liveRosterByTeam,
        logs: liveMatchLogs,
        resolveCode: (eventTypeId) =>
          resolvedEventCodeCache.get(eventTypeId) ?? resolveEventCode(eventTypeCache.get(eventTypeId)),
      });
    }
    if (!isTestMode) setRealMatchIdBeforeTest(trimmedMatchId);
    setTestMatch(next);
    setMatchId(next.id);
  };
  const handleSelectRealMatch = () => {
    setMatchId(realMatchIdBeforeTest);
  };

  // Test mode: load any match by id (a past one too) into the test match.
  // The real match is selected for a moment so the usual loaders fetch its
  // details, roster and log; once they finish, it is copied in as on the
  // Test match switch, and the page returns to test mode.
  const [pendingTestCopyId, setPendingTestCopyId] = useState("");
  const [testCopyError, setTestCopyError] = useState("");
  const [testCopyResult, setTestCopyResult] = useState("");
  // Set once a load for the pending id has started, so the stale details of
  // the previous match are never read as "not found".
  const testCopyLoadStartedRef = useRef(false);
  const handleCopyMatchIntoTest = (rawId) => {
    const id = (rawId || "").toString().trim();
    if (!id || isTestMatchId(id)) return;
    setTestCopyError("");
    setTestCopyResult("");
    testCopyLoadStartedRef.current = false;
    setPendingTestCopyId(id);
    setMatchId(id);
  };
  // Copying mid-load would give the test match an empty roster or log.
  const testToggleBusy =
    !isTestMode && hasMatchId && (isLoadingDetails || isLoadingRoster || isLoadingLogs);

  const overlayUrl = useMemo(
    () =>
      trimmedMatchId
        ? buildOverlayUrl({
            overlayFile: resolvedOverlayFile,
            matchId: trimmedMatchId,
            teamATheme,
            teamBTheme,
            manualOverrides: {
              enabled: manualOverrideEnabled,
              status: manualStatus,
              clock: manualClock,
              scoreA: manualScoreA,
              scoreB: manualScoreB,
            },
            isInitialized,
          })
        : "",
    [
      resolvedOverlayFile,
      trimmedMatchId,
      teamATheme,
      teamBTheme,
      manualOverrideEnabled,
      manualStatus,
      manualClock,
      manualScoreA,
      manualScoreB,
      isInitialized,
    ],
  );

  const overlayPreviewUrl = useMemo(() => {
    if (!overlayUrl) return "";
    try {
      const previewUrl = new URL(overlayUrl);
      previewUrl.searchParams.set("preview", "1");
      return previewUrl.toString();
    } catch {
      return overlayUrl;
    }
  }, [overlayUrl]);

  const teamAPalette = useMemo(
    () => getTeamPalette(matchDetails?.team_a?.attributes, teamATheme),
    [matchDetails?.team_a?.attributes, teamATheme],
  );
  const teamBPalette = useMemo(
    () => getTeamPalette(matchDetails?.team_b?.attributes, teamBTheme),
    [matchDetails?.team_b?.attributes, teamBTheme],
  );

  const teamARoster = rosterByTeam[matchDetails?.team_a?.id] || [];
  const teamBRoster = rosterByTeam[matchDetails?.team_b?.id] || [];

  const bannerPlayerOptions = useMemo(() => {
    const sortRoster = (roster) => {
      const withNumbers = [];
      const withoutNumbers = [];
      roster.filter((p) => p?.name).forEach((player) => {
        const parsedNumber = Number(player.number);
        if (Number.isFinite(parsedNumber)) {
          withNumbers.push({ id: player.id, name: player.name, number: parsedNumber, teamId: player.teamId });
        } else {
          withoutNumbers.push({ id: player.id, name: player.name, number: null, teamId: player.teamId });
        }
      });
      // Alphabetical, as on the team rosters card (number shown after the name).
      return [...withNumbers, ...withoutNumbers].sort((a, b) => a.name.localeCompare(b.name));
    };
    return {
      teamA: sortRoster(teamARoster),
      teamB: sortRoster(teamBRoster),
    };
  }, [teamARoster, teamBRoster]);

  const selectedBannerPlayer = useMemo(
    () => [...bannerPlayerOptions.teamA, ...bannerPlayerOptions.teamB].find((p) => p.id === bannerPlayerId) || null,
    [bannerPlayerOptions, bannerPlayerId],
  );

  const canPreview = Boolean(overlayUrl && hasMatchId);
  const canInitialize = Boolean(trimmedMatchId);
  const configLocked = isInitialized;
  const showControl = isInitialized && hasMatchId;
  const isControlView = activeView === "control";
  const isConfigView = activeView === "config";

  // Declared ahead of the trigger handlers that read matchStats.
  const sortedMatchLogs = useMemo(
    () =>
      [...matchLogs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [matchLogs],
  );

  const resolvedEventCodeCache = useMemo(() => {
    const cache = new Map();
    eventTypeCache.forEach((eventType, id) => {
      cache.set(id, resolveEventCode(eventType));
    });
    return cache;
  }, [eventTypesVersion]);

  // Load-by-ID must never leave the button stuck on "Loading…": it gives up
  // if another match is picked meanwhile, and after 20 seconds regardless.
  useEffect(() => {
    if (!pendingTestCopyId) return undefined;
    const timer = window.setTimeout(() => {
      setPendingTestCopyId("");
      setTestCopyError("Loading that match took too long. Check the ID and try again.");
      if (testMatchRef.current?.id) setMatchId(testMatchRef.current.id);
    }, 20000);
    return () => window.clearTimeout(timer);
  }, [pendingTestCopyId]);

  useEffect(() => {
    if (!pendingTestCopyId) return;
    if (trimmedMatchId !== pendingTestCopyId) {
      // Another match was picked while this one loaded: abandon the copy.
      setPendingTestCopyId("");
      return;
    }
    if (isLoadingDetails || isLoadingRoster || isLoadingLogs) {
      testCopyLoadStartedRef.current = true;
      return;
    }
    if (liveMatchDetails?.id === pendingTestCopyId) {
      // Details are in; the roster loads only after them, so wait for the
      // roster of exactly this event and these teams to settle.
      const teamKey = [liveMatchDetails.team_a?.id, liveMatchDetails.team_b?.id].filter(Boolean).sort().join(",");
      const expectedKey = `${liveMatchDetails.event_id}:${teamKey || "all"}`;
      if (liveMatchDetails.event_id && rosterSettledKey !== expectedKey) return;
    }
    if (!liveMatchDetails || liveMatchDetails.id !== pendingTestCopyId) {
      if (testCopyLoadStartedRef.current) {
        setTestCopyError(detailsError || "No match found with that ID.");
        setPendingTestCopyId("");
        if (testMatch?.id) setMatchId(testMatch.id);
      }
      return;
    }
    const testId = testMatch?.id || createTestMatchId();
    // Say what was copied, so an empty roster is visible rather than silent.
    const countFor = (team) => (liveRosterByTeam[team?.id] || []).length;
    const nameFor = (team, fallback) => team?.name || fallback;
    const countA = countFor(liveMatchDetails.team_a);
    const countB = countFor(liveMatchDetails.team_b);
    const emptyTeams = [
      countA ? null : nameFor(liveMatchDetails.team_a, "Team A"),
      countB ? null : nameFor(liveMatchDetails.team_b, "Team B"),
    ].filter(Boolean);
    setTestCopyResult(
      `Loaded ${nameFor(liveMatchDetails.team_a, "Team A")} (${countA} players) vs ` +
        `${nameFor(liveMatchDetails.team_b, "Team B")} (${countB} players), ${liveMatchLogs.length} log entries.`,
    );
    if (emptyTeams.length || rosterError) {
      setTestCopyError(
        rosterError
          ? `The roster could not be loaded: ${rosterError}`
          : `No players on the event roster for ${emptyTeams.join(" and ")}, so there is nobody to pick for player statistics or team rosters.`,
      );
    }
    setTestMatch(
      createTestMatchFromMatch(testId, {
        match: liveMatchDetails,
        rosterByTeam: liveRosterByTeam,
        logs: liveMatchLogs,
        resolveCode: (eventTypeId) =>
          resolvedEventCodeCache.get(eventTypeId) ?? resolveEventCode(eventTypeCache.get(eventTypeId)),
      }),
    );
    setPendingTestCopyId("");
    setMatchId(testId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTestCopyId, trimmedMatchId, isLoadingDetails, isLoadingRoster, isLoadingLogs, liveMatchDetails, detailsError, rosterSettledKey]);

  const matchStats = useMemo(
    () => computeMatchStats(matchDetails, sortedMatchLogs, resolvedEventCodeCache),
    [matchDetails, sortedMatchLogs, resolvedEventCodeCache],
  );

  const handleCopy = async () => {
    if (!overlayUrl) return;
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const handleInitialize = () => {
    if (!canInitialize) return;
    setIsInitialized(true);
  };

  const handleUnlock = () => {
    setIsInitialized(false);
  };

  const publishOverlayPayload = async (basePayload) => {
    // One id per send, so an overlay that receives it both ways (storage and
    // realtime) acts on it once.
    const payload = {
      ...basePayload,
      deliveryId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    };
    try {
      window.localStorage.setItem("overlayBanner", JSON.stringify(payload));
    } catch {
      // Ignore local storage failures and still try realtime delivery.
    }

    try {
      await overlayBannerChannelRef.current?.send({
        type: "broadcast",
        event: "overlay-banner",
        payload,
      });
    } catch {
      // Keep the control surface responsive even if realtime delivery fails.
    }
  };

  const handleTriggerBanner = async () => {
    if (!trimmedMatchId || !selectedBannerPlayer?.id) return;

    try {
      const { data, error } = isTestMode && testMatch
        ? {
            data: { team_id: selectedBannerPlayer.teamId, ...computeTestPlayerStats(testMatch, selectedBannerPlayer.id) },
            error: null,
          }
        : await supabase
            .from("player_match_stats")
            .select("team_id, goals, assists, blocks, turnovers")
            .eq("match_id", trimmedMatchId)
            .eq("player_id", selectedBannerPlayer.id)
            .maybeSingle();

      if (error) {
        throw error;
      }

      const resolvedTeamId = data?.team_id || selectedBannerPlayer.teamId || null;
      const teamSlot =
        resolvedTeamId && resolvedTeamId === matchDetails?.team_a?.id
          ? "A"
          : resolvedTeamId && resolvedTeamId === matchDetails?.team_b?.id
            ? "B"
            : null;

      const payload = {
        type: "playerStats",
        autoFade: playerStatsAutoFade,
        playerId: selectedBannerPlayer.id,
        playerName: selectedBannerPlayer.name,
        teamId: resolvedTeamId,
        teamSlot,
        stats: {
          goals: data?.goals ?? 0,
          assists: data?.assists ?? 0,
          blocks: data?.blocks ?? 0,
          turnovers: data?.turnovers ?? 0,
        },
        ts: Date.now(),
      };

      await publishOverlayPayload(payload);
      setBannerStatus(`Banner queued for ${selectedBannerPlayer.name}.`);
      window.setTimeout(() => setBannerStatus(""), 3000);
    } catch {
      setBannerStatus("Unable to load player match stats.");
      window.setTimeout(() => setBannerStatus(""), 3000);
    }
  };

  // `options.autoFade` lets autopilot force a card to leave on its own.
  const handleTriggerMatchStats = async (options = {}) => {
    const stats = matchStats || {};
    const payload = {
      type: "matchStats",
      autoFade: options.autoFade ?? matchStatsAutoFade,
      title: "Match statistics",
      stats: {
        holdsA: stats.holdsA ?? "",
        holdsB: stats.holdsB ?? "",
        breaksA: stats.breaksA ?? "",
        breaksB: stats.breaksB ?? "",
        turnoversA: stats.turnoversA ?? "",
        turnoversB: stats.turnoversB ?? "",
        blocksA: stats.blocksA ?? "",
        blocksB: stats.blocksB ?? "",
        possessionA: stats.possessionA ?? "",
        possessionB: stats.possessionB ?? "",
        hasPossessionData: Boolean(stats.hasPossessionData),
      },
      ts: Date.now(),
    };
    try {
      await publishOverlayPayload(payload);
      setBannerStatus("Match stats banner queued.");
      window.setTimeout(() => setBannerStatus(""), 3000);
    } catch {
      setBannerStatus("Unable to trigger match stats banner.");
      window.setTimeout(() => setBannerStatus(""), 3000);
    }
  };

  const handleTriggerTeamRosters = async (options = {}) => {
    const payload = {
      type: "teamRosters",
      autoFade: options.autoFade ?? teamRostersAutoFade,
      title: "Team rosters",
      teamAName: matchDetails?.team_a?.name || "Team A",
      teamBName: matchDetails?.team_b?.name || "Team B",
      rosters: {
        teamA: teamARoster.map((player) => ({
          id: player.id,
          name: player.name,
          number: player.number,
          isCaptain: Boolean(player.isCaptain),
          isSpiritCaptain: Boolean(player.isSpiritCaptain),
        })),
        teamB: teamBRoster.map((player) => ({
          id: player.id,
          name: player.name,
          number: player.number,
          isCaptain: Boolean(player.isCaptain),
          isSpiritCaptain: Boolean(player.isSpiritCaptain),
        })),
      },
      ts: Date.now(),
    };
    try {
      await publishOverlayPayload(payload);
      setBannerStatus("Team rosters overlay queued.");
      window.setTimeout(() => setBannerStatus(""), 3000);
    } catch {
      setBannerStatus("Unable to trigger team rosters overlay.");
      window.setTimeout(() => setBannerStatus(""), 3000);
    }
  };

  // Drop overlays that stopped reporting (30 s without a heartbeat).
  const [statusClock, setStatusClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setStatusClock(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setOverlayStatuses({});
  }, [trimmedMatchId]);
  const overlayStatusList = useMemo(
    () =>
      Object.values(overlayStatuses)
        .filter((status) => statusClock - status.receivedAt < 30000)
        .sort((a, b) => (a.clientId < b.clientId ? -1 : 1)),
    [overlayStatuses, statusClock],
  );

  // ── Autopilot ──
  // Watches the match log for new rows (rows present when a match is opened
  // are history) and the Lock & go live switch. Cards it shows always fade on
  // their own. Runs only while this control room is open.
  const autopilotSeenRef = useRef(null);
  const autopilotLoadStartedRef = useRef(false);
  const autopilotHandlersRef = useRef({});
  useEffect(() => {
    autopilotSeenRef.current = null;
    autopilotLoadStartedRef.current = false;
  }, [trimmedMatchId]);
  useEffect(() => {
    const rows = sortedMatchLogs || [];
    if (isLoadingLogs) autopilotLoadStartedRef.current = true;
    if (autopilotSeenRef.current === null) {
      // History is everything there once the log has loaded for this match
      // (a test match has no load step). Until then nothing can fire.
      const ready = isTestMode || (autopilotLoadStartedRef.current && !isLoadingLogs);
      if (ready) autopilotSeenRef.current = new Set(rows.map((row) => row.id));
      return;
    }
    const fresh = rows.filter((row) => row?.id && !autopilotSeenRef.current.has(row.id));
    fresh.forEach((row) => autopilotSeenRef.current.add(row.id));
    if (!fresh.length) return;
    const codes = new Set(
      fresh.map((row) =>
        (row.event_type_id != null
          ? resolvedEventCodeCache.get(row.event_type_id) ?? resolveEventCode(eventTypeCache.get(row.event_type_id))
          : "") || "",
      ),
    );
    const handlers = autopilotHandlersRef.current;
    if (autopilot.statsAtHalftime && codes.has("halftime_start")) handlers.matchStats?.({ autoFade: true });
    if (autopilot.statsAtFullTime && codes.has("match_end")) handlers.matchStats?.({ autoFade: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedMatchLogs, isLoadingLogs, isTestMode]);
  // 5 minutes before the scheduled start time: match info, then team rosters
  // as soon as the match info card has left (it fades after 10 s). Once per
  // match; a page opened later than that moment (by more than a minute) does
  // not show them late.
  const preStartFiredRef = useRef("");
  const scheduledStart = matchDetails?.start_time || "";
  useEffect(() => {
    if (!autopilot.preStartCards || !trimmedMatchId || !scheduledStart) return undefined;
    const fireAt = new Date(scheduledStart).getTime() - 5 * 60 * 1000;
    if (!Number.isFinite(fireAt)) return undefined;
    const key = `${trimmedMatchId}:${scheduledStart}`;
    if (preStartFiredRef.current === key) return undefined;
    const delay = fireAt - Date.now();
    if (delay < -60 * 1000) return undefined;
    // setTimeout cannot wait longer than ~24.8 days; nobody keeps the page open that long.
    if (delay > 2147483647) return undefined;
    let rostersTimer = null;
    const startTimer = window.setTimeout(() => {
      preStartFiredRef.current = key;
      autopilotHandlersRef.current.matchInfo?.({ autoFade: true });
      rostersTimer = window.setTimeout(() => autopilotHandlersRef.current.rosters?.({ autoFade: true }), 10500);
    }, Math.max(0, delay));
    return () => {
      window.clearTimeout(startTimer);
      if (rostersTimer) window.clearTimeout(rostersTimer);
    };
  }, [autopilot.preStartCards, trimmedMatchId, scheduledStart]);

  const handleTriggerMatchStatus = async (options = {}) => {
    try {
      const status = (matchDetails?.status || "").toString().trim().toLowerCase();
      const phaseLabel =
        ["finished", "completed", "complete", "final", "ended", "done"].includes(status)
          ? "Full time"
          : ["halftime", "half_time", "half-time", "ht", "break"].includes(status)
            ? "Halftime"
            : ["live", "in_progress", "playing", "running"].includes(status)
              ? "Live"
              : "Upcoming";

      const venue = matchDetails?.venue;
      const cachedWeather = readCachedWeatherForVenue(venue);
      const weather = cachedWeather ? summarizeWeather(cachedWeather.weather) : null;

      const payload = {
        type: "matchStatus",
        autoFade: options.autoFade ?? matchStatusAutoFade,
        phaseLabel,
        teamAName: matchDetails?.team_a?.name || "Team A",
        teamBName: matchDetails?.team_b?.name || "Team B",
        scoreA: matchStats?.scoreA ?? matchDetails?.score_a ?? 0,
        scoreB: matchStats?.scoreB ?? matchDetails?.score_b ?? 0,
        startTime: matchDetails?.start_time || null,
        venueName: getVenueName(venue) || matchDetails?.event?.location || eventDetails?.location || "",
        eventName: eventDetails?.name || matchDetails?.event?.name || "",
        weather,
        ts: Date.now(),
      };
      await publishOverlayPayload(payload);
      setBannerStatus("Match info overlay queued.");
      window.setTimeout(() => setBannerStatus(""), 3000);
    } catch (error) {
      console.error("[App] handleTriggerMatchStatus failed", error);
      setBannerStatus(`Match info error: ${error?.message || error}`);
      window.setTimeout(() => setBannerStatus(""), 5000);
    }
  };

  // Autopilot calls the latest handlers (declared above, so the ref exists).
  autopilotHandlersRef.current = {
    matchInfo: (options) => handleTriggerMatchStatus(options),
    matchStats: (options) => handleTriggerMatchStats(options),
    rosters: (options) => handleTriggerTeamRosters(options),
  };


  const handleTriggerTimeout = async (team) => {
    if (!team) return;
    const payload = {
      type: "timeout",
      autoFade: timeoutAutoFade,
      team,
      ts: Date.now(),
    };
    try {
      await publishOverlayPayload(payload);
      setBannerStatus(`Timeout banner queued for Team ${team}.`);
      window.setTimeout(() => setBannerStatus(""), 3000);
    } catch {
      setBannerStatus("Unable to trigger timeout banner.");
      window.setTimeout(() => setBannerStatus(""), 3000);
    }
  };

  const handleTriggerMatchEvent = async (eventType, team) => {
    if (!eventType?.id) return;
    const payload = {
      type: "matchEvent",
      autoFade: matchEventAutoFade,
      eventTypeId: eventType.id,
      eventCode: eventType.code,
      eventDescription: eventType.description,
      team: team || null,
      ts: Date.now(),
    };
    try {
      await publishOverlayPayload(payload);
      setBannerStatus(`Match event queued (${eventType.description || eventType.code || eventType.id}) for Team ${team}.`);
      window.setTimeout(() => setBannerStatus(""), 3000);
    } catch {
      setBannerStatus("Unable to trigger match event.");
      window.setTimeout(() => setBannerStatus(""), 3000);
    }
  };

  const handleTriggerFieldCall = async (callLabel) => {
    if (!callLabel) return;
    const payload = {
      type: "fieldCall",
      autoFade: fieldCallAutoFade,
      callLabel,
      ts: Date.now(),
    };
    try {
      await publishOverlayPayload(payload);
      setBannerStatus(`Field call banner queued (${callLabel}).`);
      window.setTimeout(() => setBannerStatus(""), 3000);
    } catch {
      setBannerStatus("Unable to trigger field call banner.");
      window.setTimeout(() => setBannerStatus(""), 3000);
    }
  };

  const handleTriggerAddonPreview = async (addon) => {
    try {
      await publishOverlayPayload({ type: "addonPreview", addon, ts: Date.now() });
      setBannerStatus("Add-on test queued.");
      window.setTimeout(() => setBannerStatus(""), 3000);
    } catch {
      setBannerStatus("Unable to test add-on.");
      window.setTimeout(() => setBannerStatus(""), 3000);
    }
  };

  const handleTriggerBreakChance = async () => {
    const payload = {
      type: "breakChance",
      team: "both",
      ts: Date.now(),
    };
    try {
      await publishOverlayPayload(payload);
      setBannerStatus("Break chance banner queued.");
      window.setTimeout(() => setBannerStatus(""), 3000);
    } catch {
      setBannerStatus("Unable to trigger break chance banner.");
      window.setTimeout(() => setBannerStatus(""), 3000);
    }
  };

  useEffect(() => {
    if (overlayBannerChannelRef.current) {
      supabase.removeChannel(overlayBannerChannelRef.current);
      overlayBannerChannelRef.current = null;
    }

    if (!trimmedMatchId) return undefined;

    const channel = supabase.channel(`overlay-banner:${trimmedMatchId}`);
    overlayBannerChannelRef.current = channel;
    channel
      .on("broadcast", { event: "overlay-status" }, ({ payload }) => {
        if (!payload?.clientId) return;
        setOverlayStatuses((prev) => ({ ...prev, [payload.clientId]: { ...payload, receivedAt: Date.now() } }));
      })
      .on("broadcast", { event: "event-logo-request" }, () => {
        if (eventLogoRef.current) broadcastEventLogo(eventLogoRef.current);
        broadcastTeamLogos();
        broadcastBreakChanceSetting(breakChanceEnabledRef.current);
        broadcastScoreboardVisibility(scoreboardHiddenRef.current);
        broadcastAddonSettings(overlayAddonsRef.current);
        if (testMatchRef.current?.id === trimmedMatchId) broadcastTestMatch(testMatchRef.current);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (eventLogoRef.current) broadcastEventLogo(eventLogoRef.current);
        broadcastTeamLogos();
        broadcastBreakChanceSetting(breakChanceEnabledRef.current);
        broadcastScoreboardVisibility(scoreboardHiddenRef.current);
        broadcastAddonSettings(overlayAddonsRef.current);
        if (testMatchRef.current?.id === trimmedMatchId) broadcastTestMatch(testMatchRef.current);
      });

    return () => {
      if (overlayBannerChannelRef.current === channel) {
        overlayBannerChannelRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [overlayBannerChannelRef, trimmedMatchId]);

  useEffect(() => {
    if (!trimmedMatchId && isInitialized) {
      setIsInitialized(false);
    }
  }, [trimmedMatchId, isInitialized]);

  useEffect(() => {
    if (bannerPlayerId && !selectedBannerPlayer) {
      setBannerPlayerId("");
    }
  }, [bannerPlayerId, selectedBannerPlayer]);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveView(getInitialView());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadActiveEvents = async () => {
      setIsLoadingEvents(true);
      setEventsError("");
      const { data, error } = await supabase
        .from("events")
        .select("id, name, Status, start_date, end_date")
        .order("start_date", { ascending: false });

      if (!isActive) return;

      if (error) {
        setEventsError(error.message || "Unable to load events.");
        setActiveEvents([]);
        setIsLoadingEvents(false);
        return;
      }

      const filtered = (data || []).filter((event) =>
        ACTIVE_EVENT_STATUSES.has((event.Status || "").toString().trim().toLowerCase()),
      );
      setActiveEvents(filtered);
      setIsLoadingEvents(false);
    };

    loadActiveEvents();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!selectedEventId) {
      setEventMatches([]);
      setEventMatchesError("");
      setIsLoadingEventMatches(false);
      return () => {
        isActive = false;
      };
    }

    const loadEventMatches = async () => {
      setIsLoadingEventMatches(true);
      setEventMatchesError("");

      const { data, error } = await supabase
        .from("matches")
        .select(
          "id, status, score_a, score_b, start_time, team_a:teams!matches_team_a_fkey (name), team_b:teams!matches_team_b_fkey (name)",
        )
        .eq("event_id", selectedEventId)
        .order("start_time", { ascending: true });

      if (!isActive) return;

      if (error) {
        setEventMatchesError(error.message || "Unable to load matches.");
        setEventMatches([]);
        setIsLoadingEventMatches(false);
        return;
      }

      // Forfeits never get played, so there is nothing to broadcast: neither the
      // forfeit statuses nor older cancellations recorded with a forfeit line.
      const filtered = (data || []).filter(
        (match) =>
          !FINISHED_MATCH_STATUSES.has((match.status || "").toString().trim().toLowerCase()) &&
          !isForfeitMatch(match),
      );
      setEventMatches(filtered);
      setIsLoadingEventMatches(false);
    };

    loadEventMatches();

    return () => {
      isActive = false;
    };
  }, [selectedEventId]);

  useEffect(() => {
    const nextSettings = {
      overlayChoice,
      matchId: trimmedMatchId,
      selectedEventId,
      isInitialized,
      teamATheme,
      teamBTheme,
      activeView,
      manualOverrideEnabled,
      manualStatus,
      manualClock,
      manualScoreA,
      manualScoreB,
      breakChanceEnabled,
      scoreboardHidden,
      autopilot,
      overlayAddons,
      playerStatsAutoFade,
      matchStatsAutoFade,
      timeoutAutoFade,
      matchEventAutoFade,
      fieldCallAutoFade,
      teamRostersAutoFade,
      matchStatusAutoFade,
      bannerPlayerId,
      realMatchIdBeforeTest,
    };

    try {
      window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
    } catch {
      // Ignore storage write failures.
    }
  }, [
    overlayChoice,
    trimmedMatchId,
    selectedEventId,
    isInitialized,
    teamATheme,
    teamBTheme,
    activeView,
    manualOverrideEnabled,
    manualStatus,
    manualClock,
    manualScoreA,
    manualScoreB,
    breakChanceEnabled,
    scoreboardHidden,
    autopilot,
    overlayAddons,
    playerStatsAutoFade,
    matchStatsAutoFade,
    timeoutAutoFade,
    matchEventAutoFade,
    fieldCallAutoFade,
    teamRostersAutoFade,
    matchStatusAutoFade,
    bannerPlayerId,
    realMatchIdBeforeTest,
  ]);

  useEffect(() => {
    let isActive = true;

    const loadEventTypesOnce = async () => {
      if (eventTypeCacheLoaded) return;
      const { data, error } = await supabase.from("match_events").select("id, code, description");
      if (error || !Array.isArray(data)) {
        eventTypeCacheLoaded = true;
        return;
      }
      data.forEach((eventType) => {
        eventTypeCache.set(eventType.id, eventType);
      });
      eventTypeCacheLoaded = true;
      if (isActive) {
        setEventTypesVersion((value) => value + 1);
      }
    };

    const loadMatchEventButtons = async () => {
      setMatchEventError("");
      const { data, error } = await supabase.from("match_events").select("id, code, description").order("id");
      if (!isActive) return;
      if (error || !Array.isArray(data)) {
        setMatchEventButtons([]);
        setMatchEventError(error?.message || "Unable to load match events.");
        return;
      }
      setMatchEventButtons(data);
    };

    const loadMatchDetails = async () => {
      if (!trimmedMatchId) return;

      setIsLoadingDetails(true);
      setDetailsError("");

      const { data, error } = await supabase
        .from("matches")
        .select(MATCH_DETAIL_FIELDS)
        .eq("id", trimmedMatchId)
        .maybeSingle();

      if (!isActive) return;

      if (error || !data) {
        setDetailsError(error?.message || "Unable to load match details.");
        setMatchDetails(null);
        setEventDetails(null);
        setIsLoadingDetails(false);
        return;
      }

      setMatchDetails(data);
      if (data.event?.id) {
        eventCache.set(data.event.id, data.event);
      }
      setEventDetails(data.event || (data.event_id ? eventCache.get(data.event_id) : null));
      setIsLoadingDetails(false);
    };

    const loadMatchLogs = async () => {
      if (!trimmedMatchId) return;
      setIsLoadingLogs(true);
      setLogsError("");

      let from = 0;
      const logs = [];

      while (true) {
        const { data, error } = await supabase
          .from("match_logs")
          .select(MATCH_LOG_FIELDS)
          .eq("match_id", trimmedMatchId)
          .order("created_at", { ascending: true })
          .range(from, from + MATCH_LOG_PAGE_SIZE - 1);

        if (!isActive) return;

        if (error) {
          setLogsError(error.message || "Unable to load match logs.");
          break;
        }

        if (!data || data.length === 0) {
          break;
        }

        logs.push(...data);

        if (data.length < MATCH_LOG_PAGE_SIZE) break;
        from += MATCH_LOG_PAGE_SIZE;
      }

      if (!isActive) return;
      setMatchLogs(logs);
      setIsLoadingLogs(false);
    };

    if (!trimmedMatchId || isTestMatchId(trimmedMatchId)) {
      setMatchDetails(null);
      setEventDetails(null);
      setMatchLogs([]);
      setRosterPlayersById({});
      setRosterByTeam({});
      setIsLoadingDetails(false);
      setIsLoadingLogs(false);
      setIsLoadingRoster(false);
      setDetailsError("");
      setLogsError("");
      setRosterError("");
      // A test match has no rows to load, but the Events banner buttons still
      // come from the match_events table.
      if (trimmedMatchId) {
        loadEventTypesOnce();
        loadMatchEventButtons();
      }
      return () => {
        isActive = false;
      };
    }

    loadEventTypesOnce();
    loadMatchEventButtons();
    loadMatchDetails();
    loadMatchLogs();

    return () => {
      isActive = false;
    };
  }, [trimmedMatchId]);

  useEffect(() => {
    let isActive = true;
    const eventId = liveMatchDetails?.event_id;
    const teamIds = [liveMatchDetails?.team_a?.id, liveMatchDetails?.team_b?.id].filter(Boolean);

    if (!eventId) {
      setRosterPlayersById({});
      setRosterByTeam({});
      setIsLoadingRoster(false);
      setRosterError("");
      return () => {
        isActive = false;
      };
    }

    const sortedTeamIds = [...teamIds].sort();
    const cacheKey = `${eventId}:${sortedTeamIds.join(",") || "all"}`;
    const cached = rosterCache.get(cacheKey);
    if (cached) {
      setRosterPlayersById(cached.playersById || {});
      setRosterByTeam(cached.rosterByTeam || {});
      setRosterError("");
      setIsLoadingRoster(false);
      setRosterSettledKey(cacheKey);
      return () => {
        isActive = false;
      };
    }

    const loadRoster = async () => {
      setIsLoadingRoster(true);
      setRosterError("");

      let query = supabase
        .from("team_roster")
        .select("team_id, is_captain, is_spirit_captain, player:player_id (id, name, jersey_number)")
        .eq("event_id", eventId);

      if (sortedTeamIds.length) {
        query = query.in("team_id", sortedTeamIds);
      }

      const { data, error } = await query;

      if (!isActive) return;

      if (error) {
        setRosterError(error.message || "Unable to load team roster.");
        setIsLoadingRoster(false);
        setRosterSettledKey(cacheKey);
        return;
      }

      const playersById = {};
      const rosterByTeam = {};
      (data || []).forEach((row) => {
        if (!row.player?.id) return;
        const playerName = row.player.name || row.player.id;
        playersById[row.player.id] = playerName;

        if (!row.team_id) return;
        if (!rosterByTeam[row.team_id]) {
          rosterByTeam[row.team_id] = [];
        }
        rosterByTeam[row.team_id].push({
          id: row.player.id,
          teamId: row.team_id,
          name: playerName,
          number: row.player.jersey_number,
          isCaptain: Boolean(row.is_captain),
          isSpiritCaptain: Boolean(row.is_spirit_captain),
        });
      });

      Object.values(rosterByTeam).forEach((players) =>
        players.sort((a, b) => {
          const captainRankA = a.isCaptain ? 0 : a.isSpiritCaptain ? 1 : 2;
          const captainRankB = b.isCaptain ? 0 : b.isSpiritCaptain ? 1 : 2;
          if (captainRankA !== captainRankB) return captainRankA - captainRankB;

          const numA = Number.isFinite(Number(a.number)) ? Number(a.number) : null;
          const numB = Number.isFinite(Number(b.number)) ? Number(b.number) : null;
          if (numA !== null && numB !== null) return String(a.name).localeCompare(b.name);
          if (numA !== null && numB === null) return -1;
          if (numA === null && numB !== null) return 1;
          return String(a.name).localeCompare(b.name);
        }),
      );
      rosterCache.set(cacheKey, { playersById, rosterByTeam });
      setRosterSettledKey(cacheKey);
      setRosterPlayersById(playersById);
      setRosterByTeam(rosterByTeam);
      setIsLoadingRoster(false);
    };

    loadRoster();

    return () => {
      isActive = false;
    };
  }, [liveMatchDetails?.event_id, liveMatchDetails?.team_a?.id, liveMatchDetails?.team_b?.id]);

  useEffect(() => {
    if (!trimmedMatchId || isTestMatchId(trimmedMatchId)) return () => {};

    let retryTimer = null;
    let activeChannel = null;

    const subscribe = () => {
      const channel = supabase
        .channel(`overlay-control:match_logs:${trimmedMatchId}:${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "match_logs",
            filter: `match_id=eq.${trimmedMatchId}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") {
              const removedId = payload.old?.id;
              if (!removedId) return;
              setMatchLogs((current) => current.filter((log) => log.id !== removedId));
              return;
            }

            const incoming = payload.new;
            if (!incoming) return;
            setMatchLogs((current) => {
              const existingIndex = current.findIndex((log) => log.id === incoming.id);
              if (existingIndex >= 0) {
                const next = [...current];
                next[existingIndex] = incoming;
                return next;
              }
              return [...current, incoming].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              );
            });
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            supabase.removeChannel(channel);
            activeChannel = null;
            retryTimer = window.setTimeout(subscribe, 3000);
          }
        });

      activeChannel = channel;
    };

    subscribe();

    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
      if (activeChannel) supabase.removeChannel(activeChannel);
    };
  }, [trimmedMatchId]);

  const resolvePlayerName = (playerId) => {
    if (!playerId) return "";
    return rosterPlayersById[playerId] || "Unknown player";
  };

  const eventCardLogs = useMemo(() => {
    if (!sortedMatchLogs.length) return [];
    const teamAId = matchDetails?.team_a?.id;
    const teamBId = matchDetails?.team_b?.id;
    let totalA = 0;
    let totalB = 0;

    const chronologicalLogs = sortedMatchLogs
      .map((log, index) => {
        const eventType = eventTypeCache.get(log.event_type_id);
        const eventCode = resolvedEventCodeCache.get(log.event_type_id) ?? resolveEventCode(eventType);
        const eventDescription = eventType?.description || eventType?.code || "Match event";
        const team = log.team_id === teamAId ? "A" : log.team_id === teamBId ? "B" : null;
        const isScoreEvent =
          eventCode === MATCH_LOG_EVENT_CODES.SCORE ||
          eventCode === MATCH_LOG_EVENT_CODES.CALAHAN ||
          eventCode.includes("score") ||
          /cal+ahan/.test(eventCode);

        if (isScoreEvent) {
          if (team === "A") totalA += 1;
          if (team === "B") totalB += 1;
        }

        return {
          id: log.id,
          eventTypeId: log.event_type_id,
          // The shared event cards only know timeout_start; show legacy "timeout" rows as one.
          eventCode:
            eventCode === LEGACY_TIMEOUT_CODE
              ? MATCH_LOG_EVENT_CODES.TIMEOUT_START
              : isScoreEvent && eventCode !== MATCH_LOG_EVENT_CODES.CALAHAN
                ? MATCH_LOG_EVENT_CODES.SCORE
                : eventCode,
          eventDescription,
          timestamp: log.created_at,
          team,
          teamId: log.team_id,
          abbaLine: log.abba_line,
          scorerId: log.actor_id,
          scorerName: resolvePlayerName(log.actor_id) || (log.actor_id ? "Unknown player" : ""),
          assistName: resolvePlayerName(log.secondary_actor_id),
          totalA,
          totalB,
          scoreOrderIndex: index,
        };
      });

    const startingPuller =
      matchDetails?.starting_team_id && matchDetails.starting_team_id === teamAId
        ? "A"
        : matchDetails?.starting_team_id && matchDetails.starting_team_id === teamBId
          ? "B"
          : null;
    const breakIds = findBreakLogIds(chronologicalLogs, startingPuller);
    return chronologicalLogs
      .map((entry) => ({ ...entry, isBreak: breakIds.has(entry.id) }))
      .reverse();
  }, [
    sortedMatchLogs,
    matchDetails?.team_a?.id,
    matchDetails?.team_b?.id,
    matchDetails?.starting_team_id,
    rosterPlayersById,
    resolvedEventCodeCache,
  ]);

  return (
    <div className={`overlay-page ${isControlView ? "overlay-page--control" : ""}`}>
      <SectionShell className="overlay-shell">
        {isConfigView ? (
          <ConfigView
            overlayChoice={overlayChoice}
            setOverlayChoice={setOverlayChoice}
            matchId={matchId}
            setMatchId={setMatchId}
            selectedEventId={selectedEventId}
            setSelectedEventId={setSelectedEventId}
            activeEvents={activeEvents}
            isLoadingEvents={isLoadingEvents}
            eventsError={eventsError}
            eventMatches={eventMatches}
            isLoadingEventMatches={isLoadingEventMatches}
            eventMatchesError={eventMatchesError}
            teamATheme={teamATheme}
            setTeamATheme={setTeamATheme}
            teamBTheme={teamBTheme}
            setTeamBTheme={setTeamBTheme}
            teamAPalette={teamAPalette}
            teamBPalette={teamBPalette}
            matchDetails={matchDetails}
            eventDetails={eventDetails}
            isLoadingDetails={isLoadingDetails}
            detailsError={detailsError}
            trimmedMatchId={trimmedMatchId}
            hasMatchId={hasMatchId}
            configLocked={configLocked}
            canInitialize={canInitialize}
            canPreview={canPreview}
            showControl={showControl}
            overlayPreviewUrl={overlayPreviewUrl}
            handleInitialize={handleInitialize}
            handleUnlock={handleUnlock}
            teamALogo={teamALogo}
            setTeamALogo={setTeamALogo}
            teamBLogo={teamBLogo}
            setTeamBLogo={setTeamBLogo}
            eventLogo={eventLogo}
            setEventLogo={setEventLogo}
            isTestMode={isTestMode}
            testMatch={testRecords ? testMatch : null}
            setTestMatch={setTestMatch}
            onSelectTestMatch={handleSelectTestMatch}
            onSelectRealMatch={handleSelectRealMatch}
            onCopyMatchIntoTest={handleCopyMatchIntoTest}
            testCopyPending={Boolean(pendingTestCopyId)}
            testCopyError={testCopyError}
            testCopyResult={testCopyResult}
            testToggleBusy={testToggleBusy}
          />
        ) : null}

        {isControlView ? (
          <ControlView
            overlayUrl={overlayUrl}
            overlayPreviewUrl={overlayPreviewUrl}
            canPreview={canPreview}
            copied={copied}
            handleCopy={handleCopy}
            showControl={showControl}
            matchDetails={matchDetails}
            eventDetails={eventDetails}
            eventCardLogs={eventCardLogs}
            isLoadingDetails={isLoadingDetails}
            isLoadingLogs={isLoadingLogs}
            isLoadingRoster={isLoadingRoster}
            detailsError={detailsError}
            logsError={logsError}
            rosterError={rosterError}
            rosterByTeam={rosterByTeam}
            bannerPlayerId={bannerPlayerId}
            setBannerPlayerId={setBannerPlayerId}
            bannerStatus={bannerStatus}
            bannerPlayerOptions={bannerPlayerOptions}
            selectedBannerPlayer={selectedBannerPlayer}
            matchStats={matchStats}
            matchEventButtons={matchEventButtons}
            matchEventError={matchEventError}
            playerStatsAutoFade={playerStatsAutoFade}
            setPlayerStatsAutoFade={setPlayerStatsAutoFade}
            matchStatsAutoFade={matchStatsAutoFade}
            setMatchStatsAutoFade={setMatchStatsAutoFade}
            timeoutAutoFade={timeoutAutoFade}
            setTimeoutAutoFade={setTimeoutAutoFade}
            matchEventAutoFade={matchEventAutoFade}
            setMatchEventAutoFade={setMatchEventAutoFade}
            fieldCallAutoFade={fieldCallAutoFade}
            setFieldCallAutoFade={setFieldCallAutoFade}
            teamRostersAutoFade={teamRostersAutoFade}
            setTeamRostersAutoFade={setTeamRostersAutoFade}
            matchStatusAutoFade={matchStatusAutoFade}
            setMatchStatusAutoFade={setMatchStatusAutoFade}
            breakChanceEnabled={breakChanceEnabled}
            setBreakChanceEnabled={setBreakChanceEnabled}
            scoreboardHidden={scoreboardHidden}
            setScoreboardHidden={setScoreboardHidden}
            overlayAddons={overlayAddons}
            setOverlayAddons={setOverlayAddons}
            autopilot={autopilot}
            setAutopilot={setAutopilot}
            overlayStatuses={overlayStatusList}
            handleTriggerAddonPreview={handleTriggerAddonPreview}
            handleTriggerBanner={handleTriggerBanner}
            handleTriggerMatchStats={handleTriggerMatchStats}
            handleTriggerMatchStatus={handleTriggerMatchStatus}
            handleTriggerTeamRosters={handleTriggerTeamRosters}
            handleTriggerTimeout={handleTriggerTimeout}
            handleTriggerMatchEvent={handleTriggerMatchEvent}
            handleTriggerFieldCall={handleTriggerFieldCall}
            handleTriggerBreakChance={handleTriggerBreakChance}
            testMatchSimulator={
              testRecords ? <TestMatchSimulator testMatch={testMatch} setTestMatch={setTestMatch} compact /> : null
            }
          />
        ) : null}
      </SectionShell>
    </div>
  );
}
