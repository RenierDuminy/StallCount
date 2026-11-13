// Resolving an event from its URL, for the event page (`/events/:slug`), its
// sub-pages (`/events/:slug/<section>`) and the redirects from moved URLs.
// Each hook returns `{ event, element }`: render `element` when it is set
// (loading, error, or a redirect); otherwise render the page with `event`.
import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../services/supabaseClient";
import { getEventsList, getEventsListKey } from "../services/leagueService";
import { useCachedQuery } from "../hooks/useCachedQuery";
import { EVENT_LIST_LIMIT } from "../services/eventPageService";
import {
  EVENTS_BASE_PATH,
  findEventBySlug,
  getEventPagePath,
  getEventSectionPath,
} from "./eventWorkspaces";
import { EventLoading, EventNotFound } from "./EventRouteStates";

const EVENT_LIST_TTL_MS = 60 * 1000;

/** The event list, for resolving a URL slug or id to an event. */
function useEventsList() {
  const query = useCachedQuery(
    getEventsListKey(EVENT_LIST_LIMIT),
    ({ forceRefresh }) => getEventsList(EVENT_LIST_LIMIT, { forceRefresh }),
    { ttlMs: EVENT_LIST_TTL_MS },
  );
  const events = query.data ?? null;
  const error = query.error && !query.data ? query.error.message || "Unable to load events." : null;
  return { events, error };
}

/**
 * Fallback when the cached list has no match: a fresh lookup over every event
 * (ids and names only). The cached list can be up to a day old (a link to a
 * newly created event) and holds only the newest EVENT_LIST_LIMIT events (a
 * link to an old one), so "not in the list" is not proof the event is gone.
 * `mode` is "slug" or "id". Returns undefined while looking, then the event
 * or null.
 */
function useFreshEventLookup(value, mode, needed) {
  const [result, setResult] = useState({ value: null, event: undefined });
  useEffect(() => {
    if (!needed || !value) return undefined;
    let cancelled = false;
    supabase
      .from("events")
      .select("id, name, slug")
      .order("start_date", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        const rows = error ? [] : data ?? [];
        const event =
          mode === "id"
            ? rows.find((row) => row.id === value) || null
            : findEventBySlug(rows, value);
        setResult({ value, event });
      });
    return () => {
      cancelled = true;
    };
  }, [value, mode, needed]);
  return result.value === value ? result.event : undefined;
}

/** The event a slug names. `status`: "loading" | "found" | "missing" | "error". */
function useEventFromSlug(slug) {
  const { events, error } = useEventsList();
  const listed = useMemo(() => findEventBySlug(events, slug), [events, slug]);
  const fresh = useFreshEventLookup(slug, "slug", Boolean(events) && !listed);
  const event = listed || fresh || null;
  if (error && !event) return { event: null, status: "error", error };
  if (event) return { event, status: "found", error: null };
  if (events && fresh === null) return { event: null, status: "missing", error: null };
  return { event: null, status: "loading", error: null };
}

/**
 * `/events/:slug` (or a sub-page when `section` is given). A loosely matched
 * slug, or an event that has a custom workspace, settles on the canonical
 * URL; a stale slug (renamed or removed event) goes to the events list.
 */
function useEventRoute(slug, section = null) {
  const { search } = useLocation();
  const { event, status, error } = useEventFromSlug(slug);
  if (status === "error") return { event: null, element: <EventNotFound message={error} /> };
  if (status === "missing") {
    return { event: null, element: <Navigate to={EVENTS_BASE_PATH} replace /> };
  }
  if (!event) return { event: null, element: <EventLoading /> };
  const canonical = section ? getEventSectionPath(event, section) : getEventPagePath(event);
  const current = `${EVENTS_BASE_PATH}/${slug}${section ? `/${section}` : ""}`;
  if (canonical && canonical !== current) {
    return { event, element: <Navigate to={`${canonical}${search}`} replace /> };
  }
  return { event, element: null };
}

/** The standard event page's event (`/events/:slug`). */
export function useEventPageRoute(slug) {
  return useEventRoute(slug);
}

/** An event sub-page's event (`/events/:slug/<section>`). */
export function useEventSectionRoute(section) {
  const { slug } = useParams();
  return useEventRoute(slug, section);
}

/**
 * Redirect for the URLs moved on 2026-11-13 (retire after 2027-05-13):
 * `/event-spirit?eventId=`, `/event-rules?eventId=`, `/event-rosters?eventId=`
 * -> `/events/<slug>/<section>`, keeping any other query parameter (e.g.
 * `divisionId`). Without an `eventId`: the events list. Returns the element.
 */
export function useLegacyEventSectionRedirect(section) {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("eventId") || "";
  const { events, error } = useEventsList();
  const listed = useMemo(
    () => (events && eventId ? events.find((row) => row.id === eventId) || null : null),
    [events, eventId],
  );
  const fresh = useFreshEventLookup(eventId, "id", Boolean(events) && !listed);
  if (!eventId) return <Navigate to={EVENTS_BASE_PATH} replace />;
  const event = listed || fresh;
  if (event === null) return <Navigate to={EVENTS_BASE_PATH} replace />;
  if (!event) return error ? <EventNotFound message={error} /> : <EventLoading />;
  const rest = new URLSearchParams(searchParams);
  rest.delete("eventId");
  const query = rest.toString();
  return (
    <Navigate to={`${getEventSectionPath(event, section)}${query ? `?${query}` : ""}`} replace />
  );
}
