// Links to the match calendar feeds (api/calendar.js). Always the official
// address, so a feed subscribed from a preview deployment or localhost still
// points at production.
import { getSiteOrigin } from "./pageMeta";

/** The https:// feed for an event, or for one team within that event. */
export function calendarFeedUrl({ eventId, teamId = null }) {
  const params = new URLSearchParams({ event: eventId });
  if (teamId) params.set("team", teamId);
  return `${getSiteOrigin()}/api/calendar?${params.toString()}`;
}

/** The same feed as webcal://, which Apple Calendar and Outlook subscribe to. */
export function calendarWebcalUrl(feedUrl) {
  return feedUrl.replace(/^https?:\/\//i, "webcal://");
}

/** Google Calendar's "add by URL" page for the feed. */
export function googleCalendarSubscribeUrl(feedUrl) {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendarWebcalUrl(feedUrl))}`;
}
