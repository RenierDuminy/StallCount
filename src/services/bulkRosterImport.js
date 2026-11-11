// Accent-, case- and punctuation-insensitive, the same rule as
// normalisePlayerName in matchExportFormat.js (not imported: that module pulls
// in the match log service).
function normalisePlayerName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Strict pasted-list import for Event access: creates players and puts them on
 * team rosters for one event. Pure; the panel does the loading and writing.
 *
 * The list is a header row plus one row per player, separated by tabs (pasted
 * from a spreadsheet) or commas. Quotes are not supported, so a name with a
 * comma must be pasted tab-separated.
 *
 *   team    name          gender  birthday    jersey  role
 *   Sharks  Jane Mokoena  W       1999-04-12  7       captain
 *
 * Any error blocks the whole import; nothing is written until every row passes.
 */

export const BULK_ROSTER_COLUMNS = [
  { key: "team", required: true, help: "Team name or short name, exactly as in this event" },
  { key: "name", required: true, help: "First and last name" },
  { key: "gender", required: true, help: "M or W" },
  { key: "birthday", required: true, help: "YYYY-MM-DD; player must be 18 or older" },
  { key: "jersey", required: false, help: "Whole number 0–99, or blank" },
  { key: "role", required: false, help: "captain, spirit, or blank" },
];

export const BULK_ROSTER_MAX_ROWS = 500;
const MIN_AGE_YEARS = 18;
const COLUMN_KEYS = new Set(BULK_ROSTER_COLUMNS.map((column) => column.key));

const key = (value) => String(value ?? "").trim().toLowerCase();

function parseBirthday(value, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: "Birthday must be YYYY-MM-DD." };
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { error: `${value} is not a real date.` };
  }
  const adult = new Date(Date.UTC(y + MIN_AGE_YEARS, m - 1, d));
  if (adult > today) return { error: `Player must be ${MIN_AGE_YEARS} or older.` };
  if (y < today.getUTCFullYear() - 100) return { error: `${value} is more than 100 years ago.` };
  return { value };
}

/**
 * Step 1: parse and validate the text on its own (no database).
 * Returns { rows, errors } where errors are { line, message }; line 0 = the list.
 */
export function parseBulkRosterText(text, { teams = [], today = new Date() } = {}) {
  const errors = [];
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((raw, index) => ({ raw, line: index + 1 }))
    .filter((entry) => entry.raw.trim() !== "");

  if (lines.length === 0) return { rows: [], errors: [{ line: 0, message: "Paste a list first." }] };

  const header = lines[0];
  const delimiter = header.raw.includes("\t") ? "\t" : ",";
  const headerCells = header.raw.split(delimiter).map(key);
  const seen = new Set();
  headerCells.forEach((cell) => {
    if (!COLUMN_KEYS.has(cell)) errors.push({ line: header.line, message: `Unknown column "${cell || "(blank)"}".` });
    else if (seen.has(cell)) errors.push({ line: header.line, message: `Column "${cell}" appears twice.` });
    seen.add(cell);
  });
  BULK_ROSTER_COLUMNS.filter((column) => column.required && !seen.has(column.key)).forEach((column) =>
    errors.push({ line: header.line, message: `Missing required column "${column.key}".` }),
  );
  if (errors.length) return { rows: [], errors };

  const body = lines.slice(1);
  if (body.length === 0) return { rows: [], errors: [{ line: 0, message: "The list has a header but no players." }] };
  if (body.length > BULK_ROSTER_MAX_ROWS) {
    return { rows: [], errors: [{ line: 0, message: `At most ${BULK_ROSTER_MAX_ROWS} players per import.` }] };
  }

  const teamByKey = new Map();
  const ambiguousTeamKeys = new Set();
  teams.forEach((team) => {
    [team.name, team.short_name].filter(Boolean).forEach((label) => {
      const k = key(label);
      const existing = teamByKey.get(k);
      if (existing && existing.id !== team.id) ambiguousTeamKeys.add(k);
      else teamByKey.set(k, team);
    });
  });

  const rows = [];
  const lineByIdentity = new Map();
  body.forEach(({ raw, line }) => {
    const cells = raw.split(delimiter).map((cell) => cell.trim());
    if (cells.length !== headerCells.length) {
      errors.push({
        line,
        message: `Has ${cells.length} column${cells.length === 1 ? "" : "s"}; the header has ${headerCells.length}.${
          delimiter === "," ? " A name with a comma needs a tab-separated list." : ""
        }`,
      });
      return;
    }
    const value = Object.fromEntries(headerCells.map((cell, i) => [cell, cells[i]]));
    const rowErrors = [];

    const teamKey = key(value.team);
    const team = teamByKey.get(teamKey);
    if (!value.team) rowErrors.push("Team is blank.");
    else if (ambiguousTeamKeys.has(teamKey)) rowErrors.push(`"${value.team}" matches more than one team; use the full name.`);
    else if (!team) rowErrors.push(`No team "${value.team}" in this event.`);

    const name = value.name.replace(/\s+/g, " ");
    if (!name) rowErrors.push("Name is blank.");
    else if (name.split(" ").length < 2) rowErrors.push("Name needs a first and last name.");
    else if (!/\p{L}/u.test(name) || /[0-9@]/.test(name)) rowErrors.push(`"${name}" does not look like a name.`);

    const gender = String(value.gender || "").toUpperCase();
    if (gender !== "M" && gender !== "W") rowErrors.push("Gender must be M or W.");

    const birthday = parseBirthday(value.birthday || "", today);
    if (birthday.error) rowErrors.push(birthday.error);

    let jersey = null;
    if (value.jersey) {
      if (!/^\d{1,2}$/.test(value.jersey)) rowErrors.push("Jersey must be a whole number 0–99.");
      else jersey = Number(value.jersey);
    }

    const role = key(value.role);
    if (role && role !== "captain" && role !== "spirit") rowErrors.push("Role must be captain, spirit, or blank.");

    if (!rowErrors.length) {
      const identity = `${normalisePlayerName(name)}|${birthday.value}`;
      const firstLine = lineByIdentity.get(identity);
      if (firstLine) rowErrors.push(`Same player as line ${firstLine}.`);
      else lineByIdentity.set(identity, line);
    }

    rowErrors.forEach((message) => errors.push({ line, message }));
    if (!rowErrors.length) {
      rows.push({ line, team, name, gender, birthday: birthday.value, jersey, role: role || null });
    }
  });

  return { rows, errors };
}

/**
 * Step 2: match parsed rows to the directory and the event's rosters.
 * `directory` = getPlayerDirectory(); `idsByBirthday` = Map(date -> Set of
 * player ids born that day); `eventRosters` = getEventRosters(eventId).
 *
 * Each planned row is { ...row, action, playerId?, notes[] } with action
 * "create" | "add" (existing player, new roster entry) | "skip" (already on
 * that roster). Problems come back as errors and block the import.
 */
export function planBulkRoster(rows, { directory = [], idsByBirthday = new Map(), eventRosters = [] }) {
  const errors = [];
  const plan = [];

  const byName = new Map();
  directory.forEach((player) => {
    const k = normalisePlayerName(player.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(player);
  });
  const teamsByPlayer = new Map();
  eventRosters.forEach((entry) => {
    const playerId = entry.player?.id;
    if (!playerId || !entry.team_id) return;
    if (!teamsByPlayer.has(playerId)) teamsByPlayer.set(playerId, []);
    teamsByPlayer.get(playerId).push(entry.team);
  });

  const usedPlayerIds = new Map();
  rows.forEach((row) => {
    const candidates = byName.get(normalisePlayerName(row.name)) || [];
    const bornThatDay = idsByBirthday.get(row.birthday) || new Set();
    const matches = candidates.filter((player) => bornThatDay.has(player.id));
    const notes = [];

    if (matches.length > 1) {
      errors.push({ line: row.line, message: `${matches.length} players named ${row.name} share this birthday. Merge them first.` });
      return;
    }
    if (matches.length === 0) {
      if (candidates.length > 0) {
        const withoutDob = candidates.some((player) => !player.has_birthday);
        errors.push({
          line: row.line,
          message: withoutDob
            ? `A player named ${row.name} exists with no birthday on file. Add them on Event rosters, or set their birthday first.`
            : `A player named ${row.name} exists with a different birthday. Check the date, or add them on Event rosters.`,
        });
        return;
      }
      plan.push({ ...row, action: "create", notes });
      return;
    }

    const player = matches[0];
    const earlierLine = usedPlayerIds.get(player.id);
    if (earlierLine) {
      errors.push({ line: row.line, message: `Same player as line ${earlierLine}.` });
      return;
    }
    usedPlayerIds.set(player.id, row.line);

    const onTeams = teamsByPlayer.get(player.id) || [];
    const elsewhere = onTeams.find((team) => team && team.id !== row.team.id);
    if (elsewhere) {
      errors.push({ line: row.line, message: `${row.name} is already on ${elsewhere.name} in this event.` });
      return;
    }
    if (player.gender_code && player.gender_code !== row.gender) {
      errors.push({ line: row.line, message: `${row.name} is recorded as ${player.gender_code}, not ${row.gender}.` });
      return;
    }
    if (row.jersey !== null && player.jersey_number !== null && player.jersey_number !== row.jersey) {
      notes.push(`Jersey on record is ${player.jersey_number}; it is not changed.`);
    }
    const onThisTeam = onTeams.some((team) => team?.id === row.team.id);
    plan.push({ ...row, playerId: player.id, action: onThisTeam ? "skip" : "add", notes });
  });

  return { plan, errors };
}
