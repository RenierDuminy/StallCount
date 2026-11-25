// Shared by the staff tools' event and match pickers (Match corrections,
// Media control), so their lists follow one rule and read the same way.
import { isPastEvent } from "./eventStandings";

/** Days an event stays in a staff picker after it ends. */
export const RECENT_EVENT_WINDOW_DAYS = 30;

const dateKey = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";

const localDateKey = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * True for an event that is over and ended more than RECENT_EVENT_WINDOW_DAYS
 * ago (or is over with no dates at all, so cannot be placed in the window).
 * Live and upcoming events are never "long past".
 */
export function isLongPastEvent(event) {
  if (!event) return true;
  if (!isPastEvent({ status: event.status, endDate: event.end_date })) return false;
  const end = dateKey(event.end_date) || dateKey(event.start_date);
  if (!end) return true;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_EVENT_WINDOW_DAYS);
  return end < localDateKey(cutoff);
}

/** A match as an option in a staff match picker: "status · A 3 – 2 B". */
export function describeMatchOption(match) {
  const teamA = match?.team_a?.short_name || match?.team_a?.name || "TBC";
  const teamB = match?.team_b?.short_name || match?.team_b?.name || "TBC";
  const status = match?.status || "unknown";
  return `${status} · ${teamA} ${match?.score_a ?? 0} – ${match?.score_b ?? 0} ${teamB}`;
}
