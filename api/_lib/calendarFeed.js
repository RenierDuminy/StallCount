// Match calendars: the iCalendar (.ics) feed behind /api/calendar, for a whole
// event or one team within one event. Calendar apps subscribe to the URL and
// re-read it, so a moved kick-off, a playoff team filling in or a final score
// reaches people's calendars without anyone doing anything.
//
// Serverless code cannot import from the Vite bundle, so the two small rules
// shared with the app are copies:
// - isConcludedEvent mirrors isPastEvent (src/utils/eventStandings.js)
// - the time cap keys mirror the reads in src/services/matchCorrectionChecks.js
// Change one, change both.
//
// Only match, team, venue and event data goes in: no player names (POPIA, the
// same reasoning as api/sitemap.js). No reminders (VALARM) by design.

export const SITE_ORIGIN = "https://stallcount.vercel.app";

const PAGE_SIZE = 1000;
const DEFAULT_SLOT_MINUTES = 90;
const SLOT_STEP_MINUTES = 15;

const FINISHED_STATUSES = new Set(["completed", "finished"]);
const FORFEIT_STATUSES = new Set(["forfeit", "forfeit_teama", "forfeit_teamb"]);
const CONCLUDED_EVENT_STATUSES = new Set(["completed", "finished"]);

const normaliseStatus = (status) => (status || "").toString().trim().toLowerCase();

/**
 * An event that is over (completed/finished, or its end date has passed): the
 * feed is retired (long cache, no UI link). Copy of isPastEvent in
 * src/utils/eventStandings.js; the date is compared in UTC here.
 */
export const isConcludedEvent = ({ status = null, endDate = null } = {}) => {
  if (CONCLUDED_EVENT_STATUSES.has(normaliseStatus(status))) return true;
  const end = typeof endDate === "string" ? endDate.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(end) && end < new Date().toISOString().slice(0, 10);
};

const positiveNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * How long a match occupies in the calendar, from the event rules: the time
 * cap (older events keep it in `game.hardCapMinutes`), plus the hard-cap
 * allowance and the halftime break when set, rounded to the nearest 15
 * minutes. 90 minutes when the rules give no time cap.
 */
export function matchSlotMinutes(rules) {
  const game = rules?.game ?? {};
  const timeCap = positiveNumber(game.timeCapMinutes) ?? positiveNumber(game.hardCapMinutes);
  if (!timeCap) return DEFAULT_SLOT_MINUTES;
  const allowance = positiveNumber(game.hardCap?.minutesAfterTimeCap) ?? 0;
  const halftimeBreak = positiveNumber(rules?.half?.halftimeBreakMinutes) ?? 0;
  const total = timeCap + allowance + halftimeBreak;
  return Math.max(SLOT_STEP_MINUTES, Math.round(total / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES);
}

// ---------------------------------------------------------------------------
// Reads (anon key: exactly what a signed-out visitor can read)
// ---------------------------------------------------------------------------

const MATCH_SELECT = `
  id,
  start_time,
  status,
  score_a,
  score_b,
  team_a_row:teams!matches_team_a_fkey(id, name),
  team_b_row:teams!matches_team_b_fkey(id, name),
  venue:venues(name, location, city, latitude, longitude),
  division:divisions(name),
  pool:pools(name)
`;

// Supabase cuts results at 1000 rows without saying so; page until a short
// page, on a unique order (src/services/fetchAllRows.js has the same rule).
async function selectAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message || "Read failed");
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// Playoff game names ("Semifinal 1") by match id, for games still without
// teams. Supplementary: a failure only loses the names.
async function readNodeNames(client, eventId) {
  const names = new Map();
  try {
    const { data: brackets, error } = await client.from("brackets").select("id").eq("event_id", eventId);
    if (error || !brackets?.length) return names;
    const nodes = await selectAll(() =>
      client
        .from("bracket_nodes")
        .select("id, match_id, name")
        .in(
          "bracket_id",
          brackets.map((bracket) => bracket.id),
        )
        .not("match_id", "is", null)
        .order("id"),
    );
    for (const node of nodes) {
      const name = typeof node?.name === "string" ? node.name.trim() : "";
      if (node?.match_id && name) names.set(node.match_id, name);
    }
  } catch {
    // Names are a nicety; the feed is still correct without them.
  }
  return names;
}

/**
 * Everything one feed needs. Returns null when the event (or, for a team feed,
 * the team) does not exist. Throws when an essential read fails.
 */
export async function readCalendarData(client, { eventId, teamId = null }) {
  const { data: event, error: eventError } = await client
    .from("events")
    .select("id, name, slug, end_date, status:Status, rules")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw new Error(eventError.message || "Event read failed");
  if (!event) return null;

  let team = null;
  if (teamId) {
    const { data, error } = await client.from("teams").select("id, name").eq("id", teamId).maybeSingle();
    if (error) throw new Error(error.message || "Team read failed");
    if (!data) return null;
    team = data;
  }

  const [matches, nodeNames] = await Promise.all([
    selectAll(() => {
      let query = client.from("matches").select(MATCH_SELECT).eq("event_id", eventId);
      if (teamId) query = query.or(`team_a.eq.${teamId},team_b.eq.${teamId}`);
      return query.order("start_time", { ascending: true, nullsFirst: false }).order("id");
    }),
    readNodeNames(client, eventId),
  ]);

  return { event, team, matches, nodeNames };
}

// ---------------------------------------------------------------------------
// iCalendar text (RFC 5545)
// ---------------------------------------------------------------------------

const escapeText = (value) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");

const encoder = new TextEncoder();

// Lines are at most 75 octets; longer ones continue on lines starting with a
// space. Split on whole characters so a multi-byte letter is never cut.
function foldLine(line) {
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let current = "";
  let currentBytes = 0;
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
      limit = 74; // the leading space takes one octet
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const formatUtc = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const teamName = (row) => (typeof row?.name === "string" && row.name.trim()) || "TBD";

function matchSummary(match, nodeName) {
  const status = normaliseStatus(match.status);
  const hasTeams = Boolean(match.team_a_row || match.team_b_row);
  if (!hasTeams) return nodeName ? `${nodeName}: TBD vs TBD` : "TBD vs TBD";

  const a = teamName(match.team_a_row);
  const b = teamName(match.team_b_row);
  const prefix = nodeName ? `${nodeName}: ` : "";
  if (FINISHED_STATUSES.has(status)) {
    return `${prefix}${a} ${match.score_a ?? 0} – ${match.score_b ?? 0} ${b}`;
  }
  if (FORFEIT_STATUSES.has(status)) return `${prefix}${a} vs ${b} (forfeit)`;
  if (status === "canceled") return `${prefix}${a} vs ${b} (cancelled)`;
  if (status === "postponed") return `${prefix}${a} vs ${b} (postponed)`;
  return `${prefix}${a} vs ${b}`;
}

function matchStatusLabel(status) {
  if (FINISHED_STATUSES.has(status)) return "Final";
  if (FORFEIT_STATUSES.has(status)) return "Forfeit";
  if (status === "canceled") return "Cancelled";
  if (status === "postponed") return "Postponed";
  if (status === "live" || status === "halftime") return "In progress";
  return "Scheduled";
}

function calendarStatus(status) {
  if (status === "canceled") return "CANCELLED";
  if (status === "postponed") return "TENTATIVE";
  return "CONFIRMED";
}

function matchEventLines(match, { event, nodeNames, slotMinutes, origin, stamp }) {
  const start = new Date(match.start_time);
  if (Number.isNaN(start.getTime())) return [];
  const end = new Date(start.getTime() + slotMinutes * 60_000);
  const status = normaliseStatus(match.status);
  const url = `${origin}/matches/${encodeURIComponent(match.id)}`;

  const venue = match.venue ?? null;
  const location = [venue?.name, venue?.location, venue?.city]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .filter((part, index, list) => list.indexOf(part) === index)
    .join(", ");

  const grouping = [match.division?.name, match.pool?.name].filter(Boolean).join(" · ");
  const description = [event.name, grouping, matchStatusLabel(status), url].filter(Boolean).join("\n");

  const lines = [
    "BEGIN:VEVENT",
    `UID:match-${match.id}@stallcount.vercel.app`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(matchSummary(match, nodeNames.get(match.id)))}`,
    `STATUS:${calendarStatus(status)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:${url}`,
    "TRANSP:OPAQUE",
  ];
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  const lat = Number(venue?.latitude);
  const lon = Number(venue?.longitude);
  if (venue?.latitude != null && venue?.longitude != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    lines.push(`GEO:${lat};${lon}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

/** The whole feed as iCalendar text (CRLF line endings, folded lines). */
export function buildIcs({ event, team = null, matches = [], nodeNames = new Map(), origin = SITE_ORIGIN, now = new Date() }) {
  const concluded = isConcludedEvent({ status: event?.status, endDate: event?.end_date });
  const refresh = concluded ? "P7D" : "PT15M";
  // The name calendar apps list the feed under: where it comes from, then the
  // team or the event. The team feed's event is in its description.
  const calendarName = `StallCount – ${team ? team.name : event.name}`;
  const slotMinutes = matchSlotMinutes(event?.rules);
  const stamp = formatUtc(now);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StallCount//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    `NAME:${escapeText(calendarName)}`,
    `X-WR-CALDESC:${escapeText(team ? `${team.name}'s matches at ${event.name} on StallCount` : `Matches at ${event.name} on StallCount`)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${refresh}`,
    `X-PUBLISHED-TTL:${refresh}`,
  ];
  for (const match of matches) {
    if (!match?.id || !match.start_time) continue;
    lines.push(...matchEventLines(match, { event, nodeNames, slotMinutes, origin, stamp }));
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
