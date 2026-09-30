import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Card, SectionShell } from "../components/ui/primitives";
import EventWorkspaceTemplate from "../components/EventWorkspaceTemplate";
import { getEventsList } from "../services/leagueService";
import {
  STANDARD_EVENT_BASE_PATH,
  getEventWorkspacePath,
  getStandardEventPath,
  slugify,
} from "./eventWorkspaces";
import { getStandardTemplateOptions } from "./standardEventTemplates";

// Enough to cover every event; the list is cached by leagueService.
const EVENT_LIST_LIMIT = 200;

/** The event list, for resolving a URL slug or id to an event. */
function useEventsList() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;
    getEventsList(EVENT_LIST_LIMIT)
      .then((rows) => {
        if (!ignore) setEvents(rows || []);
      })
      .catch((err) => {
        if (!ignore) setError(err?.message || "Unable to load events.");
      });
    return () => {
      ignore = true;
    };
  }, []);

  return { events, error };
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

  const event = useMemo(
    () => (events || []).find((row) => slugify(row.name) === slug) || null,
    [events, slug],
  );

  if (error || (events && !event)) return <EventNotFound message={error} />;
  if (!event) return <EventLoading />;

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
 * The old workspace URL of an event that now uses the standard page (listed in
 * standardEventTemplates.js): redirects to `/event/<name>` so existing links
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
