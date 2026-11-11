import { normalisePlayerName, personKey } from "./matchExportFormat";

/**
 * Pure helpers for importing a StallCount match export (matchExportFormat.js)
 * on the Match corrections page. No network: the page loads rosters and event
 * types, these turn the export into `match_logs` insert rows.
 */

// Two entries closer than this, with the same event and team, are taken to be
// the same entry when "add only missing entries" is chosen.
export const DUPLICATE_WINDOW_MS = 10 * 1000;

/** Every distinct person the export's rows name, per side, in first-seen order. */
export function collectReferencedPeople(logs = []) {
  const people = new Map();
  const add = (side, person, role) => {
    const key = personKey(side, person);
    if (!key) return;
    const existing = people.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    people.set(key, { key, side, name: person.name, jersey_number: person.jersey_number, role, count: 1 });
  };
  logs.forEach((row) => {
    if (!row.team) return;
    // A block's defender and a turnover's thrower both belong to `team`, as do
    // the scorer and assist.
    add(row.team, row.actor, "actor");
    add(row.team, row.secondary_actor, "assist");
  });
  return Array.from(people.values());
}

/**
 * Suggest a roster player for each exported person: an exact (accent- and
 * case-insensitive) name match first, then a unique jersey-number match.
 * Returns { [personKey]: playerId | "" }.
 */
export function suggestPlayerMatches(people = [], rostersBySide = {}) {
  const result = {};
  people.forEach((person) => {
    const roster = rostersBySide[person.side] || [];
    const name = normalisePlayerName(person.name);
    let match = name ? roster.find((player) => normalisePlayerName(player.name) === name) : null;
    if (!match && Number.isFinite(person.jersey_number)) {
      const byJersey = roster.filter((player) => Number(player.jersey_number) === person.jersey_number);
      if (byJersey.length === 1) match = byJersey[0];
    }
    result[person.key] = match?.id || "";
  });
  return result;
}

/**
 * Build `match_logs` insert rows. `sideMap` maps the export's sides to real
 * team ids ({ A: teamId, B: teamId }); `playerMap` maps person keys to player
 * ids. Rows whose event code has no id in this database are returned in
 * `unresolved` rather than guessed.
 */
export function buildImportRows(logs = [], { matchId, sideMap, playerMap, eventIdByCode }) {
  const rows = [];
  const unresolved = [];
  let lastMs = -Infinity;

  logs.forEach((log) => {
    const eventTypeId = eventIdByCode.get(log.event_code);
    if (!eventTypeId) {
      unresolved.push(log);
      return;
    }
    // Position in the log is a pure function of created_at, so equal times
    // would let the order drift; nudge a tie forward by a millisecond.
    let ms = Date.parse(log.created_at);
    if (ms <= lastMs) ms = lastMs + 1;
    lastMs = ms;

    const playerId = (person) => (person && log.team ? playerMap[personKey(log.team, person)] || null : null);
    rows.push({
      sourceIndex: log.index,
      event_code: log.event_code,
      insert: {
        match_id: matchId,
        event_type_id: eventTypeId,
        team_id: log.team ? sideMap[log.team] || null : null,
        actor_id: playerId(log.actor),
        secondary_actor_id: playerId(log.secondary_actor),
        abba_line: log.abba_line,
        created_at: new Date(ms).toISOString(),
      },
    });
  });

  return { rows, unresolved };
}

/**
 * Flag imported rows that already exist on the match: same event, same team,
 * within DUPLICATE_WINDOW_MS. Each existing row can absorb only one import row.
 * Returns a Set of indexes into `rows`.
 */
export function findExistingDuplicates(rows = [], existingLogs = []) {
  const unused = existingLogs.map((log) => ({
    eventTypeId: log.event_type_id,
    teamId: log.team_id ?? null,
    ms: Date.parse(log.created_at),
    taken: false,
  }));
  const duplicates = new Set();
  rows.forEach((row, index) => {
    const ms = Date.parse(row.insert.created_at);
    const hit = unused.find(
      (existing) =>
        !existing.taken &&
        existing.eventTypeId === row.insert.event_type_id &&
        existing.teamId === row.insert.team_id &&
        Math.abs(existing.ms - ms) <= DUPLICATE_WINDOW_MS,
    );
    if (hit) {
      hit.taken = true;
      duplicates.add(index);
    }
  });
  return duplicates;
}

/**
 * Shape insert rows like rows read back from the database, so the shared
 * derivation and checks can preview the result before anything is written.
 */
export function asPreviewRows(insertRows = [], eventCodeById = new Map()) {
  return insertRows.map((insert, index) => ({
    id: `preview-${index}`,
    ...insert,
    event: { id: insert.event_type_id, code: eventCodeById.get(insert.event_type_id) ?? null, description: null },
  }));
}
