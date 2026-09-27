import { MATCH_STATUS, isConcludedStatus, isInProgressStatus } from "../../constants/statusCodes";

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const DAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const NUMBER_FORMATTER = new Intl.NumberFormat();
const DAY_MS = 24 * 60 * 60 * 1000;

export const UNDATED_GROUP_KEY = "undated";

export function isMatchLive(status) {
  return isInProgressStatus(status);
}

export function isMatchFinal(status) {
  return isConcludedStatus(status);
}

export function isMatchPostponed(status) {
  return (status || "").toString().trim().toLowerCase() === MATCH_STATUS.POSTPONED;
}

/** Milliseconds for a timestamp, or null when it is missing or unparseable. */
export function toTime(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function compareByStartTime(a, b) {
  const aTime = toTime(a?.start_time) ?? Number.MAX_SAFE_INTEGER;
  const bTime = toTime(b?.start_time) ?? Number.MAX_SAFE_INTEGER;
  return aTime - bTime;
}

function startOfDay(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** "Today" / "Tomorrow" / "Yesterday", otherwise "Sat 4 Oct". */
export function formatDayLabel(value, now = Date.now()) {
  const ms = toTime(value);
  if (ms === null) return "Date to be confirmed";
  const dayOffset = Math.round((startOfDay(ms) - startOfDay(now)) / DAY_MS);
  if (dayOffset === 0) return "Today";
  if (dayOffset === 1) return "Tomorrow";
  if (dayOffset === -1) return "Yesterday";
  return DAY_FORMATTER.format(ms);
}

export function formatClockTime(value) {
  const ms = toTime(value);
  return ms === null ? "TBC" : TIME_FORMATTER.format(ms);
}

/** "Today · 14:00" — the day and kick-off together, for a single match. */
export function formatKickoff(value) {
  const ms = toTime(value);
  if (ms === null) return "Start time to be confirmed";
  return `${formatDayLabel(ms)} · ${TIME_FORMATTER.format(ms)}`;
}

/**
 * Buckets matches into consecutive days, preserving the input order within
 * each day. Matches without a usable start time land in one trailing group.
 */
export function groupMatchesByDay(matches = []) {
  const groups = [];
  const byKey = new Map();
  let undated = null;

  matches.forEach((match) => {
    const ms = toTime(match?.start_time);
    if (ms === null) {
      if (!undated) undated = { key: UNDATED_GROUP_KEY, label: "Date to be confirmed", matches: [] };
      undated.matches.push(match);
      return;
    }
    const key = String(startOfDay(ms));
    if (!byKey.has(key)) {
      const group = { key, label: formatDayLabel(ms), matches: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).matches.push(match);
  });

  return undated ? [...groups, undated] : groups;
}

export function formatDateRange(start, end) {
  if (!start && !end) return "Dates to be confirmed";
  const startMs = toTime(start);
  const endMs = toTime(end);
  const startLabel = startMs === null ? "TBC" : DATE_FORMATTER.format(startMs);
  const endLabel = endMs === null ? null : DATE_FORMATTER.format(endMs);
  return endLabel && endLabel !== startLabel ? `${startLabel} – ${endLabel}` : startLabel;
}

export function formatCount(value) {
  return NUMBER_FORMATTER.format(value || 0);
}

export function teamName(team, fallback) {
  return team?.name || fallback;
}

export function formatMatchup(match) {
  return `${teamName(match?.team_a, "Team A")} vs ${teamName(match?.team_b, "Team B")}`;
}

export function formatScore(value) {
  return typeof value === "number" ? value : "–";
}

/** "13 - 9" — the hyphenated form the shared MatchCard parses into a score line. */
export function formatLiveScore(match) {
  const left = typeof match?.score_a === "number" ? match.score_a : "-";
  const right = typeof match?.score_b === "number" ? match.score_b : "-";
  return `${left} - ${right}`;
}

/** Raw status code, capitalised ("finished" → "Finished"), as the shared card expects. */
export function formatMatchStatus(status) {
  const normalized = (status || "").toString().trim().toLowerCase();
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function buildMatchLink(matchId, options = {}) {
  const path = matchId ? `/matches?matchId=${matchId}` : "/matches";
  if (options.absolute && typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  return path;
}

/** "League", "Tournament" — `events.type` is free text, so it is tidied, not mapped. */
export function formatEventType(type) {
  const label = (type || "").toString().trim().replace(/[_-]+/g, " ");
  if (!label) return "";
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

function describeCap(data) {
  const raw = (data.cap || data.cap_status || data.clock_label || "").toString().trim().toLowerCase();
  if (raw.includes("hard")) return "Hard cap";
  if (raw.includes("soft")) return "Soft cap";
  return null;
}

/**
 * A plain-language line for a match in progress: "Halftime", "Soft cap", or
 * "In play", with the scorekeeper's clock appended when the live event carries
 * one. Deliberately does not surface O/D point or raw event codes — those read
 * as jargon to anyone who isn't on the field.
 */
export function describeLiveStatus(match, liveEvent) {
  const status = (match?.status || "").toString().trim().toLowerCase();
  if (status === MATCH_STATUS.HALFTIME) return "Halftime";

  const data = liveEvent?.data || {};
  const cap = describeCap(data);
  const clock = data.clock || data.timer || data.display_clock || data.game_clock || null;
  const label = cap || "In play";
  return clock ? `${label} · ${clock}` : label;
}

export function formatRecord(record) {
  if (!record) return null;
  // Wins–losses; the "Record" label in front says what the numbers are.
  return `${record.wins}–${record.losses}`;
}

export function formatFixture(fixture) {
  if (!fixture) return null;
  const when = fixture.startTime ? formatKickoff(fixture.startTime) : "time to be confirmed";
  const venue = fixture.venueName ? ` · ${fixture.venueName}` : "";
  return `vs ${fixture.opponentName || "TBC"} · ${when}${venue}`;
}

export function formatResult(result) {
  if (!result) return null;
  const outcome =
    result.scoreFor > result.scoreAgainst ? "Won" : result.scoreFor < result.scoreAgainst ? "Lost" : "Drew";
  return `${outcome} ${result.scoreFor}–${result.scoreAgainst} vs ${result.opponentName || "opponent"}`;
}
