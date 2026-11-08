import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Card, SectionShell } from "../components/ui/primitives";
import EventWorkspaceTemplate from "../components/EventWorkspaceTemplate";
import { getEventsList, getEventsListKey } from "../services/leagueService";
import { useCachedQuery } from "../hooks/useCachedQuery";
import { EVENT_LIST_LIMIT } from "../services/eventPageService";
import {
  STANDARD_EVENT_BASE_PATH,
  getEventWorkspacePath,
  getStandardEventPath,
  slugify,
} from "./eventWorkspaces";
import { getStandardTemplateOptions } from "./standardEventTemplates";

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

// Slug with every separator removed, so "sa-mx-nationals2026" and
// "sa-mx-nationals-2026" name the same event.
const compactSlug = (value) => (slugify(value) || "").replace(/-/g, "");

/**
 * The event a URL slug names: an exact match on the slugified name first, then
 * a match ignoring hyphens. The list is newest first, so a shared name resolves
 * to the newest event.
 */
function findEventBySlug(events, slug) {
  if (!events?.length || !slug) return null;
  const exact = events.find((row) => slugify(row.name) === slug);
  if (exact) return exact;
  const loose = compactSlug(slug);
  if (!loose) return null;
  return events.find((row) => compactSlug(row.name) === loose) || null;
}

function EventNotFound({ message }) {
  return (
    <SectionShell as="main" className="py-6">
      <Card className="space-y-3 p-5 text-center">
        <p className="text-sm text-ink-muted">{message || "We couldn't find that event."}</p>
        <Link to="/events" className="sc-button">
          Browse events
        </Link>
      </Card>
    </SectionShell>
  );
}

function EventLoading() {
  return <p className="p-6 text-center text-sm text-ink-muted">Loading event...</p>;
}

/**
 * `/event/:slug`: the standard event page. Finds the event whose name
 * slugifies to `slug`; if two events share a name the newest wins (the list is
 * newest first). An event with a custom workspace is sent there instead, so
 * every event has exactly one page.
 */
export default function StandardEventPage() {
  const { slug } = useParams();
  const { events, error } = useEventsList();

  const event = useMemo(() => findEventBySlug(events, slug), [events, slug]);

  if (error) return <EventNotFound message={error} />;
  // No event by that name: a shared link that went stale (renamed or removed
  // event) lands on the events list rather than a dead end.
  if (events && !event) return <Navigate to="/events" replace />;
  if (!event) return <EventLoading />;

  // Matched loosely (e.g. a hyphen missing from a typed or printed link):
  // settle on the canonical address so it is what gets shared on.
  const canonicalSlug = slugify(event.name);
  if (canonicalSlug && canonicalSlug !== slug) {
    return <Navigate to={`${STANDARD_EVENT_BASE_PATH}/${canonicalSlug}`} replace />;
  }

  const workspacePath = getEventWorkspacePath(event.id);
  if (workspacePath) return <Navigate to={workspacePath} replace />;

  const { ruleDocuments = [] } = getStandardTemplateOptions(event.id);
  return (
    <EventWorkspaceTemplate
      key={event.id}
      eventId={event.id}
      fallbackName={event.name}
      ruleDocuments={ruleDocuments}
    />
  );
}

/**
 * The old workspace URL of an event that now uses the standard page (any
 * workspace not listed as custom in standardEventTemplates.js): redirects to `/event/<name>` so existing links
 * and bookmarks keep working.
 */
export function StandardEventRedirect({ eventId }) {
  const { events, error } = useEventsList();
  if (error) return <EventNotFound message={error} />;
  if (!events) return <EventLoading />;
  const event = events.find((row) => row.id === eventId);
  const path = event ? getStandardEventPath(event.name) : null;
  if (!path) return <EventNotFound />;
  return <Navigate to={path} replace />;
}

/** `/events/:slug` with no workspace behind it: forward to `/event/:slug`. */
export function LegacyEventSlugRedirect() {
  const { slug } = useParams();
  return <Navigate to={`${STANDARD_EVENT_BASE_PATH}/${slug}`} replace />;
}
