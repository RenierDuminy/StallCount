import { useEffect, useMemo, useRef, useState } from "react";
import { SectionShell } from "../components/ui/primitives";
import { supabase } from "../services/supabaseClient";
import { MATCH_LOG_EVENT_CODES } from "../services/matchLogService";
import { LEGACY_TIMEOUT_CODE, resolveEventCode } from "../overlay/overlayEngine";
import { ConfigView } from "../overlay/ConfigView";
import { ControlView } from "../overlay/ControlView";
import { readCachedWeatherForVenue, summarizeWeather, getVenueName } from "../overlay/WeatherCard";
import { findBreakLogIds } from "../utils/matchBreaks";
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
  venue_id,
  event:events!matches_event_id_fkey (id, name, type, start_date, end_date, location, rules, Status),
  venue:venues!matches_venue_id_fkey (id, name, location, latitude, longitude),
  team_a:teams!matches_team_a_fkey (id, name, attributes),
  team_b:teams!matches_team_b_fkey (id, name, attributes)
`;
const MATCH_LOG_FIELDS =
  "id, match_id, event_type_id, team_id, actor_id, secondary_actor_id, created_at, abba_line";
const MATCH_LOG_PAGE_SIZE = 1000;
const APP_SETTINGS_STORAGE_KEY = "stallcount:overlay-control-settings";

const eventTypeCache = new Map();
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

  const persisted = readPersistedAppSettings().overlayChoice;
  return persisted && persisted !== "custom" ? persisted : "overlays/wfdf-competitive.html";
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
  let pointStartingDefense = getOppositeTeam(pointStartingOffense);
  let currentPossession = pointStartingOffense;
  const resetPointState = (nextOffense) => {
    const normalized = normalizeTeamKey(nextOffense) || fallbackOffense;
    pointStartingOffense = normalized;
    pointStartingDefense = getOppositeTeam(normalized);
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
        if (teamKey === pointStartingOffense) {
          totals[teamKey].holds += 1;
        } else if (teamKey === pointStartingDefense) {
          totals[teamKey].breaks += 1;
        }
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
  };
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
  const [breakChanceEnabled, setBreakChanceEnabled] = useState(
    () => Boolean(readPersistedAppSettings().breakChanceEnabled),
  );
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
  const [matchDetails, setMatchDetails] = useState(null);
  const [eventDetails, setEventDetails] = useState(null);
  const [matchLogs, setMatchLogs] = useState([]);
  const [eventTypesVersion, setEventTypesVersion] = useState(0);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [logsError, setLogsError] = useState("");
  const [rosterError, setRosterError] = useState("");
  const [rosterPlayersById, setRosterPlayersById] = useState({});
  const [rosterByTeam, setRosterByTeam] = useState({});
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

  // Overlays in another browser (e.g. OBS) can't read this browser's storage,
  // so the tournament logo is also pushed to them over realtime.
  const broadcastEventLogo = (dataUrl) => {
    overlayBannerChannelRef.current
      ?.send({ type: "broadcast", event: "event-logo", payload: { dataUrl: dataUrl || "" } })
      .catch(() => {});
  };

  // Same for the break chance switch, which overlays otherwise only see through
  // localStorage.
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

  const setEventLogo = (dataUrl) => {
    if (!saveLogoDataUrl(LOGO_STORAGE_KEY_EVENT, dataUrl)) return;
    setEventLogoState(dataUrl);
    broadcastEventLogo(dataUrl);
  };

  const trimmedMatchId = matchId.trim();
  const hasMatchId = Boolean(trimmedMatchId);
  const resolvedOverlayFile = overlayChoice;

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
      withNumbers.sort((a, b) => a.number !== b.number ? a.number - b.number : a.name.localeCompare(b.name));
      withoutNumbers.sort((a, b) => a.name.localeCompare(b.name));
      return [...withNumbers, ...withoutNumbers];
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

  const publishOverlayPayload = async (payload) => {
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
      const { data, error } = await supabase
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

  const handleTriggerMatchStats = async () => {
    const stats = matchStats || {};
    const payload = {
      type: "matchStats",
      autoFade: matchStatsAutoFade,
      title: "Match stats",
      stats: {
        holdsA: stats.holdsA ?? "",
        holdsB: stats.holdsB ?? "",
        breaksA: stats.breaksA ?? "",
        breaksB: stats.breaksB ?? "",
        turnoversA: stats.turnoversA ?? "",
        turnoversB: stats.turnoversB ?? "",
        blocksA: stats.blocksA ?? "",
        blocksB: stats.blocksB ?? "",
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

  const handleTriggerTeamRosters = async () => {
    const payload = {
      type: "teamRosters",
      autoFade: teamRostersAutoFade,
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

  const handleTriggerMatchStatus = async () => {
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
        autoFade: matchStatusAutoFade,
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
      .on("broadcast", { event: "event-logo-request" }, () => {
        if (eventLogoRef.current) broadcastEventLogo(eventLogoRef.current);
        broadcastBreakChanceSetting(breakChanceEnabledRef.current);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (eventLogoRef.current) broadcastEventLogo(eventLogoRef.current);
        broadcastBreakChanceSetting(breakChanceEnabledRef.current);
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
        .select("id, status, start_time, team_a:teams!matches_team_a_fkey (name), team_b:teams!matches_team_b_fkey (name)")
        .eq("event_id", selectedEventId)
        .order("start_time", { ascending: true });

      if (!isActive) return;

      if (error) {
        setEventMatchesError(error.message || "Unable to load matches.");
        setEventMatches([]);
        setIsLoadingEventMatches(false);
        return;
      }

      const filtered = (data || []).filter(
        (match) => !FINISHED_MATCH_STATUSES.has((match.status || "").toString().trim().toLowerCase()),
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
      playerStatsAutoFade,
      matchStatsAutoFade,
      timeoutAutoFade,
      matchEventAutoFade,
      fieldCallAutoFade,
      teamRostersAutoFade,
      matchStatusAutoFade,
      bannerPlayerId,
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
    playerStatsAutoFade,
    matchStatsAutoFade,
    timeoutAutoFade,
    matchEventAutoFade,
    fieldCallAutoFade,
    teamRostersAutoFade,
    matchStatusAutoFade,
    bannerPlayerId,
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

    if (!trimmedMatchId) {
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
    const eventId = matchDetails?.event_id;
    const teamIds = [matchDetails?.team_a?.id, matchDetails?.team_b?.id].filter(Boolean);

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
      setRosterPlayersById(playersById);
      setRosterByTeam(rosterByTeam);
      setIsLoadingRoster(false);
    };

    loadRoster();

    return () => {
      isActive = false;
    };
  }, [matchDetails?.event_id, matchDetails?.team_a?.id, matchDetails?.team_b?.id]);

  useEffect(() => {
    if (!trimmedMatchId) return () => {};

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
            handleTriggerBanner={handleTriggerBanner}
            handleTriggerMatchStats={handleTriggerMatchStats}
            handleTriggerMatchStatus={handleTriggerMatchStatus}
            handleTriggerTeamRosters={handleTriggerTeamRosters}
            handleTriggerTimeout={handleTriggerTimeout}
            handleTriggerMatchEvent={handleTriggerMatchEvent}
            handleTriggerFieldCall={handleTriggerFieldCall}
            handleTriggerBreakChance={handleTriggerBreakChance}
          />
        ) : null}
      </SectionShell>
    </div>
  );
}
