import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Card, SectionShell } from "../components/ui/primitives";
import EventWorkspaceTemplate from "../components/EventWorkspaceTemplate";
import { getEventsList } from "../services/leagueService";
import { getEventWorkspacePath, slugify } from "./eventWorkspaces";
import { getStandardTemplateOptions } from "./standardEventTemplates";

// Enough to cover every event; the list is cached by leagueService.
const EVENT_LIST_LIMIT = 200;

/** The standard event page for one event, with its configured options. */
export function StandardEventWorkspace({ eventId, fallbackName }) {
  const { ruleDocuments = [] } = getStandardTemplateOptions(eventId);
  return (
    <EventWorkspaceTemplate
      key={eventId}
      eventId={eventId}
      fallbackName={fallbackName}
      ruleDocuments={ruleDocuments}
    />
  );
}

/**
 * `/events/:slug` for events without a workspace URL: finds the event whose
 * name slugifies to `slug` and renders the standard page. Static workspace
 * routes outrank this one, so it only ever sees other slugs. If two events
 * share a name the newest wins (the list is newest first).
 */
export default function StandardEventPage() {
  const { slug } = useParams();
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

  const event = useMemo(
    () => (events || []).find((row) => slugify(row.name) === slug) || null,
    [events, slug],
  );

  if (error || (events && !event)) {
    return (
      <SectionShell as="main" className="py-6">
        <Card className="space-y-3 p-5 text-center">
          <p className="text-sm text-ink-muted">
            {error || "We couldn't find that event."}
          </p>
          <Link to="/events" className="sc-button">
            Browse events
          </Link>
        </Card>
      </SectionShell>
    );
  }

  if (!event) {
    return (
      <p className="p-6 text-center text-sm text-ink-muted">Loading event...</p>
    );
  }

  // An event with its own workspace URL is always served there.
  const workspacePath = getEventWorkspacePath(event.id);
  if (workspacePath) {
    return <Navigate to={workspacePath} replace />;
  }

  return <StandardEventWorkspace eventId={event.id} fallbackName={event.name} />;
}
