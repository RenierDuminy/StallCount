// Test match: a made-up fixture for building and checking overlays without a real
// match in the database. Every aspect of it (teams, colours, rosters, score,
// status, rules, venue, and the match log itself) is edited in the control room's
// Setup page.
//
// Nothing is written to Supabase. The control room keeps the state in
// localStorage (same-browser overlays and the preview iframe) and broadcasts it on
// the overlay-banner:<matchId> realtime channel (OBS on another machine). The
// engine then turns it into the same row shapes it reads from the database, so the
// overlays run their normal code paths on it.
import { MATCH_LOG_EVENT_CODES, DEFAULT_MATCH_EVENT_DEFINITIONS } from "../services/matchLogService";
import { getAbbaLineForIndex, resolveAbbaStartCode, resolveInterPointSeconds } from "./overlayAddons";

export const TEST_MATCH_ID_PREFIX = "test-";
export const TEST_MATCH_STORAGE_KEY = "stallcount:overlay-test-match";
export const TEST_MATCH_BROADCAST_EVENT = "test-match-state";

const TEST_EVENT_ID = "test-event";
const TEST_VENUE_ID = "test-venue";
export const TEST_TEAM_IDS = { A: "test-team-a", B: "test-team-b" };

export const TEST_MATCH_STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "initialized", label: "Initialized" },
  { value: "live", label: "Live" },
  { value: "halftime", label: "Halftime" },
  { value: "finished", label: "Finished" },
];

export function isTestMatchId(value) {
  return `${value ?? ""}`.trim().startsWith(TEST_MATCH_ID_PREFIX);
}

// Random per browser, so two operators testing at once don't share a channel.
export function createTestMatchId() {
  return `${TEST_MATCH_ID_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
}

function createLogId() {
  return `test-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Event types ──────────────────────────────────────────────────────────────
//
// Test logs point at synthetic match_events rows, so they resolve to the right
// code whatever ids the real table uses.

export const TEST_EVENT_TYPES = DEFAULT_MATCH_EVENT_DEFINITIONS.map((definition) => ({
  id: `test:${definition.code}`,
  code: definition.code,
  description: definition.description,
}));

export function getTestEventTypeId(code) {
  return `test:${code}`;
}

// ─── Default state ────────────────────────────────────────────────────────────

const DEFAULT_ROSTER_A = [
  "7 Alex Moreno (C)",
  "11 Jamie Chen (SC)",
  "3 Sam Okafor",
  "14 Riley Brandt",
  "21 Morgan Patel",
  "8 Taylor Nkosi",
  "5 Casey Lindqvist",
].join("\n");

const DEFAULT_ROSTER_B = [
  "10 Jordan Reyes (C)",
  "4 Avery Mokoena (SC)",
  "22 Quinn Barker",
  "9 Drew Hoffman",
  "17 Skyler Adeyemi",
  "2 Rowan Fischer",
  "13 Parker Ngubane",
].join("\n");

export function createDefaultTestMatch(id = createTestMatchId()) {
  return {
    id,
    eventName: "Test Invitational",
    eventLocation: "Test City",
    // Filled when copied from a real match; the editor doesn't expose them.
    eventType: "",
    eventStartDate: null,
    eventEndDate: null,
    eventStatus: "",
    eventRules: null,
    sourceMatchId: null,
    venueName: "Field 1",
    venueLatitude: "",
    venueLongitude: "",
    status: "scheduled",
    startTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    pullingTeam: "A",
    abbaPattern: "none",
    scoreA: 0,
    scoreB: 0,
    timeCapMinutes: 90,
    interPointSeconds: 75,
    teams: {
      A: {
        name: "Riverside Falcons",
        shortName: "FAL",
        primaryColor: "#1d4ed8",
        textOnPrimary: "#ffffff",
        secondaryColor: "#f8fafc",
        textOnSecondary: "#1e3a8a",
        rosterText: DEFAULT_ROSTER_A,
      },
      B: {
        name: "Harbour Otters",
        shortName: "OTT",
        primaryColor: "#b91c1c",
        textOnPrimary: "#ffffff",
        secondaryColor: "#fef2f2",
        textOnSecondary: "#7f1d1d",
        rosterText: DEFAULT_ROSTER_B,
      },
    },
    logs: [],
  };
}

// ─── From a real match ────────────────────────────────────────────────────────
//
// Turning the test match on with a real match selected copies that match, so the
// test starts from real teams, colours, rosters, event and rules. Its match log
// comes too (rows whose code a test match has no type for are left out), with
// players re-pointed at the copied roster.

// Same fallbacks the runtime and the control page use when a team has none.
const FALLBACK_TEAM_COLOURS = {
  primaryColor: "#0b1f19",
  textOnPrimary: "#e8f4ed",
  secondaryColor: "#f8fafc",
  textOnSecondary: "#0f172a",
};

const TEST_EVENT_CODES = new Set(TEST_EVENT_TYPES.map((eventType) => eventType.code));

function parseObject(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// The engine finds the clock length the same way: the first timeCapMinutes anywhere.
function findTimeCapMinutes(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Object.prototype.hasOwnProperty.call(value, "timeCapMinutes")) {
    const parsed = Number(value.timeCapMinutes);
    if (value.timeCapMinutes !== null && value.timeCapMinutes !== "" && Number.isFinite(parsed)) return parsed;
  }
  for (const nested of Object.values(value)) {
    const found = findTimeCapMinutes(nested, seen);
    if (found !== null) return found;
  }
  return null;
}

function toAbbaOption(value) {
  const candidate = `${value ?? ""}`.trim().toLowerCase();
  if (candidate === "male" || candidate === "m") return "male";
  if (candidate === "female" || candidate === "f") return "female";
  return "none";
}

function toRosterText(players = []) {
  return players
    .map((player) => {
      const number = Number.isFinite(Number(player.number)) && `${player.number ?? ""}`.trim() !== "" ? `${Number(player.number)} ` : "";
      const tags = `${player.isCaptain ? " (C)" : ""}${player.isSpiritCaptain ? " (SC)" : ""}`;
      return `${number}${player.name || "Unknown player"}${tags}`;
    })
    .join("\n");
}

/**
 * @param id        the test match id to keep (so a copied OBS URL keeps working)
 * @param match     the control page's match details row (with event, venue, teams)
 * @param rosterByTeam  { [teamId]: [{ id, name, number, isCaptain, isSpiritCaptain }] }
 * @param logs      match_logs rows
 * @param resolveCode   event_type_id -> event code
 */
export function createTestMatchFromMatch(id, { match, rosterByTeam = {}, logs = [], resolveCode }) {
  const defaults = createDefaultTestMatch(id);
  if (!match) return defaults;
  const event = match.event || {};
  const rules = parseObject(event.rules);
  const slotByTeamId = { [match.team_a?.id]: "A", [match.team_b?.id]: "B" };

  // Player ids follow roster line order (see parseTestRoster).
  const playerIdMap = new Map();
  const buildTeam = (slot, team) => {
    const attributes = parseObject(team?.attributes) || {};
    const players = rosterByTeam[team?.id] || [];
    players.forEach((player, index) => playerIdMap.set(player.id, `test-player-${slot.toLowerCase()}-${index + 1}`));
    return {
      name: team?.name || defaults.teams[slot].name,
      shortName: team?.short_name || "",
      primaryColor: attributes.primaryColor || FALLBACK_TEAM_COLOURS.primaryColor,
      textOnPrimary: attributes.textOnPrimary || FALLBACK_TEAM_COLOURS.textOnPrimary,
      secondaryColor: attributes.secondaryColor || FALLBACK_TEAM_COLOURS.secondaryColor,
      textOnSecondary: attributes.textOnSecondary || FALLBACK_TEAM_COLOURS.textOnSecondary,
      rosterText: toRosterText(players),
    };
  };
  const teams = { A: buildTeam("A", match.team_a), B: buildTeam("B", match.team_b) };

  const testLogs = logs
    .map((log) => {
      const code = resolveCode?.(log.event_type_id) || "";
      if (!TEST_EVENT_CODES.has(code) || !log.created_at) return null;
      return {
        id: `test-log-${log.id}`,
        code,
        team: slotByTeamId[log.team_id] || null,
        actorId: playerIdMap.get(log.actor_id) || null,
        secondaryActorId: playerIdMap.get(log.secondary_actor_id) || null,
        createdAt: log.created_at,
        abbaLine: log.abba_line || null,
      };
    })
    .filter(Boolean);

  const venue = match.venue || null;
  const timeCapMinutes = findTimeCapMinutes(rules);
  return {
    ...defaults,
    eventName: event.name || defaults.eventName,
    eventLocation: event.location || "",
    eventType: event.type || "",
    eventStartDate: event.start_date || null,
    eventEndDate: event.end_date || null,
    eventStatus: event.Status || "",
    eventRules: rules,
    venueName: [venue?.name, venue?.location].filter(Boolean).join(", "),
    venueLatitude: venue?.latitude ?? "",
    venueLongitude: venue?.longitude ?? "",
    status: match.status || defaults.status,
    startTime: match.start_time || null,
    pullingTeam: slotByTeamId[match.starting_team_id] || "",
    abbaPattern: toAbbaOption(match.abba_pattern),
    scoreA: match.score_a ?? 0,
    scoreB: match.score_b ?? 0,
    timeCapMinutes: timeCapMinutes ?? "",
    interPointSeconds: resolveInterPointSeconds(rules),
    teams,
    logs: testLogs,
    sourceMatchId: match.id || null,
  };
}

// Fills gaps from the defaults so a state saved by an older build still loads.
export function normalizeTestMatch(raw) {
  if (!raw || typeof raw !== "object" || !isTestMatchId(raw.id)) return null;
  const defaults = createDefaultTestMatch(raw.id);
  const teams = raw.teams && typeof raw.teams === "object" ? raw.teams : {};
  return {
    ...defaults,
    ...raw,
    teams: {
      A: { ...defaults.teams.A, ...(teams.A || {}) },
      B: { ...defaults.teams.B, ...(teams.B || {}) },
    },
    logs: Array.isArray(raw.logs) ? raw.logs.filter((log) => log?.id && log?.code && log?.createdAt) : [],
  };
}

export function readStoredTestMatch() {
  try {
    const raw = window.localStorage.getItem(TEST_MATCH_STORAGE_KEY);
    return raw ? normalizeTestMatch(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeStoredTestMatch(state) {
  try {
    if (state) window.localStorage.setItem(TEST_MATCH_STORAGE_KEY, JSON.stringify(state));
    else window.localStorage.removeItem(TEST_MATCH_STORAGE_KEY);
  } catch {
    // Storage full or unavailable; realtime delivery still reaches the overlays.
  }
}

// ─── Rosters ──────────────────────────────────────────────────────────────────
//
// One player per line: "7 Alex Moreno", with "(C)" or "(SC)" for captains. Player
// ids follow the line position, so editing a name keeps that player's log rows.

export function parseTestRoster(text, slot) {
  return `${text ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      let rest = line;
      const isSpiritCaptain = /\(\s*sc\s*\)/i.test(rest);
      rest = rest.replace(/\(\s*sc\s*\)/gi, "");
      const isCaptain = /\(\s*c\s*\)/i.test(rest);
      rest = rest.replace(/\(\s*c\s*\)/gi, "").trim();
      const numberMatch = /^#?(\d{1,3})\s+(.+)$/.exec(rest);
      return {
        id: `test-player-${slot.toLowerCase()}-${index + 1}`,
        teamId: TEST_TEAM_IDS[slot],
        name: (numberMatch ? numberMatch[2] : rest).trim() || `Player ${index + 1}`,
        number: numberMatch ? Number(numberMatch[1]) : null,
        isCaptain,
        isSpiritCaptain,
      };
    });
}

// ─── Records ──────────────────────────────────────────────────────────────────
//
// Shapes the state like the rows the control page and the engine select from
// matches / events / match_logs / team_roster.

function toNumberOrNull(value) {
  if (value === null || value === undefined || `${value}`.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildTeamRow(state, slot) {
  const team = state.teams[slot];
  return {
    id: TEST_TEAM_IDS[slot],
    name: team.name || `Team ${slot}`,
    short_name: team.shortName || "",
    attributes: {
      primaryColor: team.primaryColor,
      textOnPrimary: team.textOnPrimary,
      secondaryColor: team.secondaryColor,
      textOnSecondary: team.textOnSecondary,
    },
  };
}

// Deep copy without any timeCapMinutes, so the editor's value is the only one the
// engine can find (it takes the first anywhere in the rules).
function withoutTimeCap(value) {
  if (Array.isArray(value)) return value.map(withoutTimeCap);
  if (!value || typeof value !== "object") return value;
  const copy = {};
  Object.entries(value).forEach(([key, nested]) => {
    if (key !== "timeCapMinutes") copy[key] = withoutTimeCap(nested);
  });
  return copy;
}

export function buildTestMatchRecords(state) {
  const teamA = buildTeamRow(state, "A");
  const teamB = buildTeamRow(state, "B");
  const timeCapMinutes = toNumberOrNull(state.timeCapMinutes);
  const interPointSeconds = toNumberOrNull(state.interPointSeconds);
  // Copied event rules are kept whole (the control room's Rules card shows them);
  // the two values the editor exposes override them.
  const baseRules = withoutTimeCap(parseObject(state.eventRules) || {});
  const rules = {
    ...baseRules,
    game: { ...(baseRules.game || {}), ...(timeCapMinutes === null ? {} : { timeCapMinutes }) },
    interPoint: {
      ...(baseRules.interPoint || {}),
      ...(interPointSeconds === null ? {} : { defencePullBySeconds: interPointSeconds }),
    },
  };
  const startDate = state.startTime ? state.startTime.slice(0, 10) : null;
  const event = {
    id: TEST_EVENT_ID,
    name: state.eventName || "Test event",
    type: state.eventType || "test",
    start_date: state.eventStartDate || startDate,
    end_date: state.eventEndDate || startDate,
    location: state.eventLocation || "",
    rules,
    Status: state.eventStatus || "live",
  };
  const venue = state.venueName
    ? {
        id: TEST_VENUE_ID,
        name: state.venueName,
        location: "",
        latitude: toNumberOrNull(state.venueLatitude),
        longitude: toNumberOrNull(state.venueLongitude),
      }
    : null;

  const match = {
    id: state.id,
    event_id: TEST_EVENT_ID,
    status: state.status,
    score_a: toNumberOrNull(state.scoreA) ?? 0,
    score_b: toNumberOrNull(state.scoreB) ?? 0,
    start_time: state.startTime || null,
    starting_team_id: TEST_TEAM_IDS[state.pullingTeam] || null,
    abba_pattern: state.abbaPattern || "none",
    venue_id: venue ? TEST_VENUE_ID : null,
    venue,
    event,
    team_a: teamA,
    team_b: teamB,
  };

  const logs = state.logs.map((log) => ({
    id: log.id,
    match_id: state.id,
    event_type_id: getTestEventTypeId(log.code),
    team_id: TEST_TEAM_IDS[log.team] || null,
    actor_id: log.actorId || null,
    secondary_actor_id: log.secondaryActorId || null,
    created_at: log.createdAt,
    abba_line: log.abbaLine || null,
  }));

  const rosterByTeam = {
    [teamA.id]: parseTestRoster(state.teams.A.rosterText, "A"),
    [teamB.id]: parseTestRoster(state.teams.B.rosterText, "B"),
  };
  const playersById = {};
  Object.values(rosterByTeam).flat().forEach((player) => {
    playersById[player.id] = player.name;
  });

  return { match, event, logs, rosterByTeam, playersById };
}

// Same columns as player_match_stats, counted from the test log.
export function computeTestPlayerStats(state, playerId) {
  const stats = { goals: 0, assists: 0, blocks: 0, turnovers: 0 };
  state.logs.forEach((log) => {
    if (log.code === MATCH_LOG_EVENT_CODES.SCORE || log.code === MATCH_LOG_EVENT_CODES.CALAHAN) {
      if (log.actorId === playerId) stats.goals += 1;
      if (log.secondaryActorId === playerId) stats.assists += 1;
    }
    if (log.code === MATCH_LOG_EVENT_CODES.BLOCK && log.actorId === playerId) stats.blocks += 1;
    if (log.code === MATCH_LOG_EVENT_CODES.TURNOVER && log.actorId === playerId) stats.turnovers += 1;
  });
  return stats;
}

// ─── Log simulation ───────────────────────────────────────────────────────────

const SCORING_CODES = new Set([MATCH_LOG_EVENT_CODES.SCORE, MATCH_LOG_EVENT_CODES.CALAHAN]);

// The status the scorekeeper console would have written alongside this row.
const STATUS_BY_CODE = {
  [MATCH_LOG_EVENT_CODES.MATCH_START]: "live",
  [MATCH_LOG_EVENT_CODES.HALFTIME_START]: "halftime",
  [MATCH_LOG_EVENT_CODES.HALFTIME_END]: "live",
  [MATCH_LOG_EVENT_CODES.MATCH_END]: "finished",
};

function sortLogs(logs) {
  return [...logs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

// Appends a row stamped "now". A score also bumps the published score and gets
// its ABBA line, as the console does.
export function appendTestLog(state, { code, team = null, actorId = null, secondaryActorId = null }) {
  const isScoring = SCORING_CODES.has(code);
  let abbaLine = null;
  if (isScoring) {
    const scoreLines = state.logs.filter((log) => SCORING_CODES.has(log.code)).map((log) => log.abbaLine);
    const startCode = resolveAbbaStartCode(state.abbaPattern, scoreLines);
    abbaLine = startCode ? getAbbaLineForIndex(startCode, scoreLines.length) : null;
  }
  const lastMs = state.logs.reduce((max, log) => Math.max(max, new Date(log.createdAt).getTime() || 0), 0);
  const createdAt = new Date(Math.max(Date.now(), lastMs + 1)).toISOString();
  const log = {
    id: createLogId(),
    code,
    team: team === "A" || team === "B" ? team : null,
    actorId: actorId || null,
    secondaryActorId: code === MATCH_LOG_EVENT_CODES.SCORE ? secondaryActorId || null : null,
    createdAt,
    abbaLine,
  };
  return {
    ...state,
    logs: [...state.logs, log],
    status: STATUS_BY_CODE[code] || state.status,
    scoreA: isScoring && log.team === "A" ? (toNumberOrNull(state.scoreA) ?? 0) + 1 : state.scoreA,
    scoreB: isScoring && log.team === "B" ? (toNumberOrNull(state.scoreB) ?? 0) + 1 : state.scoreB,
  };
}

// Removing a score takes its point back off the published score.
export function removeTestLog(state, logId) {
  const log = state.logs.find((entry) => entry.id === logId);
  if (!log) return state;
  const isScoring = SCORING_CODES.has(log.code);
  return {
    ...state,
    logs: state.logs.filter((entry) => entry.id !== logId),
    scoreA: isScoring && log.team === "A" ? Math.max(0, (toNumberOrNull(state.scoreA) ?? 0) - 1) : state.scoreA,
    scoreB: isScoring && log.team === "B" ? Math.max(0, (toNumberOrNull(state.scoreB) ?? 0) - 1) : state.scoreB,
  };
}

export function removeLastTestLog(state) {
  const sorted = sortLogs(state.logs);
  const last = sorted[sorted.length - 1];
  return last ? removeTestLog(state, last.id) : state;
}

// Moves every row back in time, which to the overlays looks like that many
// minutes passing: the match clock runs down, the current point gets longer.
export function advanceTestMatchTime(state, minutes) {
  const shiftMs = minutes * 60 * 1000;
  return {
    ...state,
    logs: state.logs.map((log) => ({
      ...log,
      createdAt: new Date(new Date(log.createdAt).getTime() - shiftMs).toISOString(),
    })),
  };
}

export function resetTestMatchLog(state) {
  return { ...state, logs: [], scoreA: 0, scoreB: 0, status: "scheduled" };
}

// Which side's timeout is running, for the "End timeout" button.
export function getActiveTestTimeoutTeam(state) {
  let team = null;
  sortLogs(state.logs).forEach((log) => {
    if (log.code === MATCH_LOG_EVENT_CODES.TIMEOUT_START) team = log.team;
    if (log.code === MATCH_LOG_EVENT_CODES.TIMEOUT_END) team = null;
  });
  return team;
}

export function getTestMatchFlags(state) {
  let started = false;
  let halftime = false;
  let stoppage = false;
  let ended = false;
  sortLogs(state.logs).forEach((log) => {
    if (log.code === MATCH_LOG_EVENT_CODES.MATCH_START) started = true;
    if (log.code === MATCH_LOG_EVENT_CODES.HALFTIME_START) halftime = true;
    if (log.code === MATCH_LOG_EVENT_CODES.HALFTIME_END) halftime = false;
    if (log.code === MATCH_LOG_EVENT_CODES.STOPPAGE_START) stoppage = true;
    if (log.code === MATCH_LOG_EVENT_CODES.STOPPAGE_END) stoppage = false;
    if (log.code === MATCH_LOG_EVENT_CODES.MATCH_END) ended = true;
  });
  return { started, halftime, stoppage, ended, timeoutTeam: getActiveTestTimeoutTeam(state) };
}
