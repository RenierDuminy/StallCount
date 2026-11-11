import { MATCH_LOG_EVENT_CODES } from "./matchLogService";

/**
 * StallCount match export: the hand-off from the scrimmage console (the backup
 * when a match cannot be scored through the normal console) to the Match
 * corrections page, where a tournament director reviews it and writes it to
 * the database.
 *
 * `match_logs` rows mirror the database columns (`created_at`, `team_id`,
 * `actor_id`, `secondary_actor_id`, `abba_line`) with two differences, because
 * the scrimmage console works offline and knows only names:
 *  - `event_code` instead of `event_type_id`: ids differ per database, codes
 *    are stable, and the import resolves them from `match_events`.
 *  - `team` ("A" / "B" / null) and `actor` / `secondary_actor` ({ name,
 *    jersey_number }) say *who*; the `*_id` columns stay null until the TD maps
 *    the sides and players on import.
 *
 * Row conventions match the live scorekeeper exactly, so an imported match is
 * indistinguishable from one scored live:
 *  - match_start: team = the pulling team
 *  - score / callahan: team = scoring team, actor = scorer, secondary = assist
 *    (callahan: no assist), abba_line = the point's gender line or "none"
 *  - turnover: team = the team that lost the disc, actor = the thrower
 *  - block: team = the team that got the block, actor = the defender
 *  - timeout_start / timeout_end: team = the team that called it
 *  - halftime / stoppage / match_end: no team
 */
export const MATCH_EXPORT_FORMAT = "stallcount.match-export";
export const MATCH_EXPORT_VERSION = 1;

const KNOWN_CODES = new Set(Object.values(MATCH_LOG_EVENT_CODES));
const SIDES = new Set(["A", "B"]);

const text = (value) => (typeof value === "string" ? value.trim() : "");

function normalisePerson(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = text(raw.name);
  const jersey = Number(raw.jersey_number);
  if (!name && !Number.isFinite(jersey)) return null;
  return {
    name: name || null,
    jersey_number: Number.isFinite(jersey) ? jersey : null,
  };
}

function normaliseTeam(raw, fallback) {
  return {
    name: text(raw?.name) || fallback,
    short_name: text(raw?.short_name) || null,
  };
}

/**
 * Parse and validate an export. Accepts the JSON text (pasted or read from the
 * file) or an already-parsed object. Returns `{ data, errors, warnings }`;
 * `data` is null when the export cannot be used at all.
 */
export function parseMatchExport(input) {
  const errors = [];
  const warnings = [];
  let raw = input;

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return { data: null, errors: ["Paste the exported data first."], warnings };
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return {
        data: null,
        errors: ["This is not valid JSON. Paste the whole file exactly as exported."],
        warnings,
      };
    }
  }

  if (!raw || typeof raw !== "object" || raw.format !== MATCH_EXPORT_FORMAT) {
    return {
      data: null,
      errors: ["This is not a StallCount match export (the \"format\" field is missing or wrong)."],
      warnings,
    };
  }
  if (Number(raw.version) > MATCH_EXPORT_VERSION) {
    return {
      data: null,
      errors: [`This export is version ${raw.version}; this page reads up to version ${MATCH_EXPORT_VERSION}. Reload the app to update it.`],
      warnings,
    };
  }

  const rawLogs = Array.isArray(raw.match_logs) ? raw.match_logs : null;
  if (!rawLogs) {
    return { data: null, errors: ["The export has no match_logs list."], warnings };
  }

  const logs = [];
  rawLogs.forEach((row, index) => {
    const position = `Row ${index + 1}`;
    const code = text(row?.event_code).toLowerCase();
    if (!KNOWN_CODES.has(code)) {
      errors.push(`${position}: unknown event "${row?.event_code ?? ""}".`);
      return;
    }
    const createdMs = Date.parse(row?.created_at);
    if (!Number.isFinite(createdMs)) {
      errors.push(`${position}: missing or invalid created_at.`);
      return;
    }
    const team = SIDES.has(row?.team) ? row.team : null;
    logs.push({
      index,
      event_code: code,
      team,
      actor: normalisePerson(row?.actor),
      secondary_actor: code === MATCH_LOG_EVENT_CODES.CALAHAN ? null : normalisePerson(row?.secondary_actor),
      created_at: new Date(createdMs).toISOString(),
      abba_line: text(row?.abba_line) || null,
    });
  });

  logs.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.index - b.index);

  const seen = new Set();
  logs.forEach((row) => {
    if (seen.has(row.created_at)) {
      warnings.push(
        `Two entries share the time ${row.created_at}; they will be spaced 1 ms apart so their order is kept.`,
      );
    }
    seen.add(row.created_at);
  });

  if (!logs.some((row) => row.event_code === MATCH_LOG_EVENT_CODES.MATCH_START)) {
    warnings.push("The export has no match start entry.");
  }
  if (!logs.some((row) => row.event_code === MATCH_LOG_EVENT_CODES.MATCH_END)) {
    warnings.push("The export has no match end entry, so the match may not have been finished.");
  }

  const match = raw.match && typeof raw.match === "object" ? raw.match : {};
  const startingTeam = SIDES.has(match.starting_team) ? match.starting_team : null;
  const startMs = Date.parse(match.start_time);
  const rosters = raw.rosters && typeof raw.rosters === "object" ? raw.rosters : {};
  const roster = (list) => (Array.isArray(list) ? list.map(normalisePerson).filter(Boolean) : []);

  return {
    data: {
      exportedAt: text(raw.exported_at) || null,
      source: text(raw.source) || null,
      notes: text(raw.notes) || null,
      match: {
        teamA: normaliseTeam(match.team_a, "Team A"),
        teamB: normaliseTeam(match.team_b, "Team B"),
        startingTeam,
        abbaPattern: text(match.abba_pattern) || null,
        startTime: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
        scoreA: Number.isInteger(match.score_a) ? match.score_a : null,
        scoreB: Number.isInteger(match.score_b) ? match.score_b : null,
      },
      rosters: { A: roster(rosters.A), B: roster(rosters.B) },
      logs,
    },
    errors,
    warnings,
  };
}

/** Normalised form used to compare player names across the two systems. */
export function normalisePlayerName(name) {
  return text(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Stable key for a person named in an export, per side. */
export function personKey(side, person) {
  if (!person) return null;
  return `${side}|${normalisePlayerName(person.name)}|${person.jersey_number ?? ""}`;
}
