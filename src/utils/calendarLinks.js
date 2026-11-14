// Links to the match calendar feeds (api/calendar.js). Always the official
// address, so a feed subscribed from a preview deployment or localhost still
// points at production.
import { getSiteOrigin } from "./pageMeta";

/** The https:// feed for an event, or for one team within that event. */
// A plain path ending in .ics (rewritten to /api/calendar in vercel.json), not
// the query-string form: Google Calendar refused that one ("Unable to add
// calendar. Check URL"), and a dotted path is also skipped by the service
// worker's navigation fallback.
export function calendarFeedUrl({ eventId, teamId = null }) {
  const path = teamId
    ? `${encodeURIComponent(eventId)}/${encodeURIComponent(teamId)}`
    : encodeURIComponent(eventId);
  return `${getSiteOrigin()}/calendar/${path}.ics`;
}

/** The same feed as webcal://, which Apple Calendar and Outlook subscribe to. */
export function calendarWebcalUrl(feedUrl) {
  return feedUrl.replace(/^https?:\/\//i, "webcal://");
}

/** Google Calendar's "add by URL" page for the feed. */
export function googleCalendarSubscribeUrl(feedUrl) {
  // Google wants the webcal:// address unencoded here; the feed path has no
  // characters that need escaping.
  return `https://calendar.google.com/calendar/r?cid=${calendarWebcalUrl(feedUrl)}`;
}
