import { createClient } from "@supabase/supabase-js";
import { buildIcs, isConcludedEvent, readCalendarData } from "./_lib/calendarFeed.js";

// GET /api/calendar?event=<uuid>[&team=<uuid>]
//
// A subscribable iCalendar feed of an event's matches, or of one team's
// matches within that event (never a team across events). Built in
// api/_lib/calendarFeed.js; linked from the event and team pages by
// src/components/CalendarSubscribeButton.jsx.
//
// Cached at Vercel's edge for 15 minutes, so however many people subscribe,
// the database is read about once per feed per window. Once the event is
// concluded the feed is retired: still served (subscribers keep their entries
// with final scores; a 410 can make calendar apps delete them), but cached for
// a week and no longer offered in the app.

const supabaseUrl =
  globalThis.process?.env?.SUPABASE_URL || globalThis.process?.env?.VITE_SUPABASE_URL;
const anonKey =
  globalThis.process?.env?.SUPABASE_ANON_KEY || globalThis.process?.env?.VITE_SUPABASE_ANON_KEY;

const OPEN_MAX_AGE_SECONDS = 15 * 60;
const CONCLUDED_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let client = null;
function getClient() {
  if (!client) {
    client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

const fileSafe = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "calendar";

function notFound(res, message) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(404).send(message);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).send("Method not allowed");
    return;
  }

  const eventId = String(req.query?.event ?? "").trim();
  const teamParam = String(req.query?.team ?? "").trim();
  if (!UUID_PATTERN.test(eventId) || (teamParam && !UUID_PATTERN.test(teamParam))) {
    notFound(res, "Unknown calendar");
    return;
  }

  if (!supabaseUrl || !anonKey) {
    res.setHeader("Cache-Control", "no-store");
    res.status(500).send("Supabase environment variables are missing");
    return;
  }

  try {
    const data = await readCalendarData(getClient(), { eventId, teamId: teamParam || null });
    if (!data) {
      notFound(res, "Unknown calendar");
      return;
    }

    const concluded = isConcludedEvent({ status: data.event.status, endDate: data.event.end_date });
    const maxAge = concluded ? CONCLUDED_MAX_AGE_SECONDS : OPEN_MAX_AGE_SECONDS;
    const fileName = [data.event.slug || data.event.name, data.team?.name].filter(Boolean).map(fileSafe).join("-");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}.ics"`);
    res.setHeader(
      "Cache-Control",
      `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}`,
    );
    res.status(200).send(buildIcs(data));
  } catch (error) {
    // Calendar apps keep the copy they already have on an error.
    console.error("[calendar] feed failed", error);
    res.setHeader("Cache-Control", "no-store");
    res.status(502).send("Calendar temporarily unavailable");
  }
}
