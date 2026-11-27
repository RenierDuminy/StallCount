// The scrimmage console's data source: the scorekeeper console's backend
// contract (src/pages/scorekeeper/scorekeeperBackend.js), kept on this device
// only. There is one scrimmage at a time, held in localStorage as the same
// rows the database would hold (a match row with its teams, roster players,
// and `match_logs` rows with their `event` / `actor` embeds), so the real
// console, the match report and the match data export all read it unchanged.
import {
  DEFAULT_MATCH_EVENT_DEFINITIONS,
  MATCH_LOG_EVENT_CODES,
} from "../../services/matchLogService";

const STORE_KEY = "stallcount:scrimmage:v2";
const CHANGE_EVENT = "stallcount:scrimmage-change";

export const SCRIMMAGE_EVENT_ID = "scrimmage-event";
export const SCRIMMAGE_TEAM_A_ID = "scrimmage-team-a";
export const SCRIMMAGE_TEAM_B_ID = "scrimmage-team-b";

const EVENT_DEFINITIONS = DEFAULT_MATCH_EVENT_DEFINITIONS.map((entry, index) => ({
  id: -(index + 1),
  code: entry.code,
  description: entry.description,
}));
const EVENT_BY_ID = new Map(EVENT_DEFINITIONS.map((entry) => [entry.id, entry]));
const EVENT_BY_CODE = new Map(EVENT_DEFINITIONS.map((entry) => [entry.code, entry]));

const SCRIMMAGE_EVENT = {
  id: SCRIMMAGE_EVENT_ID,
  name: "Scrimmage",
  status: "live",
  // No rules: the console's defaults, which the setup page then edits.
  rules: null,
};

function randomId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function createMatch(teams = {}) {
  return {
    id: randomId("scrimmage-match"),
    event_id: SCRIMMAGE_EVENT_ID,
    division_id: null,
    pool_id: null,
    venue_id: null,
    venue: null,
    status: "scheduled",
    start_time: null,
    starting_team_id: null,
    abba_pattern: "none",
    score_a: 0,
    score_b: 0,
    scorekeeper: null,
    event: SCRIMMAGE_EVENT,
    team_a: {
      id: SCRIMMAGE_TEAM_A_ID,
      name: teams.teamAName || "Light",
      short_name: teams.teamAShort || null,
    },
    team_b: {
      id: SCRIMMAGE_TEAM_B_ID,
      name: teams.teamBName || "Dark",
      short_name: teams.teamBShort || null,
    },
  };
}

function emptyStore() {
  return { match: createMatch(), players: { [SCRIMMAGE_TEAM_A_ID]: [], [SCRIMMAGE_TEAM_B_ID]: [] }, logs: [] };
}

let memoryStore = null;

function readStore() {
  if (memoryStore) return memoryStore;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.match?.id && Array.isArray(parsed.logs)) {
      memoryStore = {
        match: { ...parsed.match, event: SCRIMMAGE_EVENT },
        players: parsed.players || {},
        logs: parsed.logs,
      };
      return memoryStore;
    }
  } catch {
    // Unreadable or blocked storage: start fresh in memory.
  }
  memoryStore = emptyStore();
  return memoryStore;
}

function writeStore(next) {
  memoryStore = next;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the scrimmage carries on in memory.
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // No window (never in the browser).
  }
}

function update(mutator) {
  const current = readStore();
  const next = mutator({
    match: { ...current.match },
    players: { ...current.players },
    logs: [...current.logs],
  });
  writeStore(next);
  return next;
}

const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

function playerLookup(store) {
  const map = new Map();
  Object.values(store.players || {}).forEach((list) => {
    (list || []).forEach((player) => map.set(player.id, player));
  });
  return map;
}

/** A stored row with the embeds `getMatchLogs` returns. */
function withEmbeds(row, players) {
  const actor = row.actor_id ? players.get(row.actor_id) : null;
  const secondary = row.secondary_actor_id ? players.get(row.secondary_actor_id) : null;
  return {
    ...row,
    event: EVENT_BY_ID.get(row.event_type_id) || null,
    actor: actor ? { id: actor.id, name: actor.name } : null,
    secondary_actor: secondary ? { id: secondary.id, name: secondary.name } : null,
  };
}

function sortedRows(store) {
  return [...store.logs].sort((a, b) => {
    const diff = Date.parse(a.created_at) - Date.parse(b.created_at);
    return diff !== 0 ? diff : String(a.id).localeCompare(String(b.id));
  });
}

function resolveEventTypeId(input) {
  if (typeof input.eventTypeId === "number" && EVENT_BY_ID.has(input.eventTypeId)) {
    return input.eventTypeId;
  }
  const byCode = input.eventTypeCode ? EVENT_BY_CODE.get(input.eventTypeCode) : null;
  if (!byCode) throw new Error(`Unknown match event: ${input.eventTypeCode || input.eventTypeId}`);
  return byCode.id;
}

// The player ids the console sends are this store's own, or a placeholder
// ("no player", "Callahan"), which is stored as no player.
function knownPlayerId(store, id) {
  return id && playerLookup(store).has(id) ? id : null;
}

function applyUpdates(row, updates, store) {
  const next = { ...row };
  if ("teamId" in updates) next.team_id = updates.teamId ?? null;
  if ("actorId" in updates) next.actor_id = knownPlayerId(store, updates.actorId);
  if ("secondaryActorId" in updates) next.secondary_actor_id = knownPlayerId(store, updates.secondaryActorId);
  if (updates.eventTypeCode || typeof updates.eventTypeId === "number") {
    next.event_type_id = resolveEventTypeId(updates);
  }
  if ("abbaLine" in updates) next.abba_line = updates.abbaLine ?? null;
  if (updates.createdAt) next.created_at = new Date(updates.createdAt).toISOString();
  return next;
}

function updateRowWhere(predicate, updates) {
  let updated = null;
  update((store) => {
    const index = store.logs.findIndex(predicate);
    if (index < 0) throw new Error("Match log entry not found.");
    updated = applyUpdates(store.logs[index], updates, store);
    store.logs[index] = updated;
    return store;
  });
  return withEmbeds(updated, playerLookup(readStore()));
}

// ---- Scrimmage-only helpers (the setup page, the report, the export) ----

export function getScrimmageSnapshot() {
  const store = readStore();
  const players = playerLookup(store);
  return {
    match: clone(store.match),
    players: clone(store.players),
    logs: sortedRows(store).map((row) => withEmbeds(row, players)),
  };
}

/** Subscribe to every change of the stored scrimmage. Returns an unsubscribe. */
export function subscribeScrimmage(callback) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

/** Team names and rosters, from the setup page. Players keep their ids by line order. */
export function saveScrimmageTeams({ teamAName, teamBName, rosterA, rosterB }) {
  update((store) => {
    store.match.team_a = { ...store.match.team_a, name: teamAName?.trim() || "Light" };
    store.match.team_b = { ...store.match.team_b, name: teamBName?.trim() || "Dark" };
    const assign = (teamId, side, list) =>
      (list || []).map((player, index) => ({
        id: `scrimmage-${side}-${index + 1}`,
        name: player.name,
        jersey_number: player.jersey_number ?? null,
      }));
    store.players = {
      [SCRIMMAGE_TEAM_A_ID]: assign(SCRIMMAGE_TEAM_A_ID, "a", rosterA),
      [SCRIMMAGE_TEAM_B_ID]: assign(SCRIMMAGE_TEAM_B_ID, "b", rosterB),
    };
    return store;
  });
}

/** Clears the log and starts a new scrimmage, keeping the teams and rosters. */
export function startNewScrimmage() {
  update((store) => {
    const fresh = createMatch({
      teamAName: store.match.team_a?.name,
      teamBName: store.match.team_b?.name,
    });
    return { match: fresh, players: store.players, logs: [] };
  });
}

export function isScrimmageFinished(match) {
  const status = (match?.status || "").toLowerCase();
  return status === "finished" || status === "completed";
}

// ---- The scorekeeper backend contract ----

export const SCRIMMAGE_BACKEND = {
  local: true,
  sessionRuleset: "scrimmage",
  guestUserId: "guest",

  async loadAbbaLines() {
    return [];
  },

  async listEvents() {
    return [SCRIMMAGE_EVENT];
  },

  async getMatchesByEvent() {
    const { match } = readStore();
    return isScrimmageFinished(match) ? [] : [clone(match)];
  },

  async getMatchById(matchId) {
    const { match } = readStore();
    return match.id === matchId ? clone(match) : null;
  },

  async getPlayersByTeam(teamId) {
    const { players } = readStore();
    return clone(players[teamId] || []).map((player) => ({ ...player, event_id: SCRIMMAGE_EVENT_ID }));
  },

  async hydrateVenueLookup() {
    return {};
  },

  async initialiseMatch(matchId, payload) {
    const next = update((store) => {
      if (store.match.id !== matchId) throw new Error("This scrimmage is no longer on this device.");
      store.match = {
        ...store.match,
        start_time: payload.start_time ?? store.match.start_time,
        starting_team_id: payload.starting_team_id ?? store.match.starting_team_id,
        abba_pattern: payload.abba_pattern ?? store.match.abba_pattern,
        status: payload.status || "initialized",
      };
      return store;
    });
    return clone(next.match);
  },

  async updateMatchStatus(matchId, status) {
    const next = update((store) => {
      if (store.match.id === matchId) store.match = { ...store.match, status };
      return store;
    });
    return clone(next.match);
  },

  async updateScore(matchId, scoreA, scoreB) {
    update((store) => {
      if (store.match.id === matchId) store.match = { ...store.match, score_a: scoreA, score_b: scoreB };
      return store;
    });
  },

  async getMatchEventDefinitions() {
    return EVENT_DEFINITIONS.map((entry) => ({ ...entry }));
  },

  async getMatchLogs(matchId) {
    const store = readStore();
    if (store.match.id !== matchId) return [];
    const players = playerLookup(store);
    return sortedRows(store).map((row) => withEmbeds(row, players));
  },

  async findMatchLogByOptimisticId(matchId, optimisticId) {
    const store = readStore();
    if (store.match.id !== matchId || !optimisticId) return null;
    const row = store.logs.find((entry) => entry.optimistic_id === optimisticId);
    return row ? withEmbeds(row, playerLookup(store)) : null;
  },

  async createMatchLogEntry(input) {
    const store = readStore();
    if (store.match.id !== input.matchId) throw new Error("This scrimmage is no longer on this device.");
    if (input.optimisticId) {
      const existing = store.logs.find((entry) => entry.optimistic_id === input.optimisticId);
      if (existing) return withEmbeds(existing, playerLookup(store));
    }
    // A break has one end (the same guard the database write applies).
    if (input.onlyIfHalftimeOpen) {
      let open = 0;
      let starts = 0;
      let closingEnd = null;
      sortedRows(store).forEach((row) => {
        const code = EVENT_BY_ID.get(row.event_type_id)?.code;
        if (code === MATCH_LOG_EVENT_CODES.HALFTIME_START) {
          starts += 1;
          open += 1;
        } else if (code === MATCH_LOG_EVENT_CODES.HALFTIME_END && open > 0) {
          open -= 1;
          closingEnd = row;
        }
      });
      if (starts > 0 && open === 0 && closingEnd) {
        return { ...withEmbeds(closingEnd, playerLookup(store)), skipped_duplicate: true };
      }
    }
    const row = {
      id: randomId("scrimmage-log"),
      match_id: input.matchId,
      event_type_id: resolveEventTypeId(input),
      team_id: input.teamId ?? null,
      actor_id: knownPlayerId(store, input.actorId),
      secondary_actor_id: knownPlayerId(store, input.secondaryActorId),
      abba_line: input.abbaLine ?? null,
      optimistic_id: input.optimisticId ?? null,
      created_at: new Date(input.createdAt || Date.now()).toISOString(),
    };
    const next = update((draft) => {
      draft.logs.push(row);
      return draft;
    });
    return withEmbeds(row, playerLookup(next));
  },

  async updateMatchLogEntry(logId, updates) {
    return updateRowWhere((row) => row.id === logId, updates);
  },

  async updateMatchLogEntryByOptimisticId(matchId, optimisticId, updates) {
    return updateRowWhere(
      (row) => row.match_id === matchId && row.optimistic_id === optimisticId,
      updates,
    );
  },

  async updateMatchLogEntryByTimestamp(matchId, createdAt, updates) {
    const iso = new Date(createdAt).toISOString();
    const matches = readStore().logs.filter((row) => row.match_id === matchId && row.created_at === iso);
    if (matches.length !== 1) {
      throw new Error(
        matches.length ? "Multiple match log entries share this timestamp." : "Match log entry not found.",
      );
    }
    return updateRowWhere((row) => row.id === matches[0].id, updates);
  },

  async deleteMatchLogEntry(logId) {
    update((store) => {
      const before = store.logs.length;
      store.logs = store.logs.filter((row) => row.id !== logId);
      if (store.logs.length === before) throw new Error("Match log entry not found.");
      return store;
    });
  },

  // Writes never fail for want of a connection, so nothing is ever queued.
  // These keep the console's queue code working without touching the real
  // offline queue, which holds database writes.
  async enqueueMatchLogEntry() {},
  async listOfflineQueue() {
    return [];
  },
  async markOfflineQueueFailure() {},
  async processOfflineQueue() {
    return { processed: 0, failed: 0 };
  },
  async removeOfflineQueueItem() {},
  async upsertScoreUpdate() {},
};
