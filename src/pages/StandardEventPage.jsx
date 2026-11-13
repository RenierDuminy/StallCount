import { Navigate, useParams } from "react-router-dom";
import EventWorkspaceTemplate from "../components/EventWorkspaceTemplate";
import { EVENTS_BASE_PATH, getCustomWorkspaceBySlug } from "./eventWorkspaces";
import { useEventPageRoute, useLegacyEventSectionRedirect } from "./eventRouteHooks";
import { getStandardTemplateOptions } from "./standardEventTemplates";

/**
 * `/events/:slug`: every event's page. A custom workspace (CUSTOM_WORKSPACE_EVENTS
 * in standardEventTemplates.js) owns its own slug and renders its own file;
 * every other event gets the standard page, found by the slug of its name (the
 * newest wins if two events share a name).
 */
export default function EventPage() {
  const { slug } = useParams();
  const workspace = getCustomWorkspaceBySlug(slug);
  if (workspace) return <workspace.Component />;
  return <StandardEventPage slug={slug} />;
}

function StandardEventPage({ slug }) {
  const { event, element } = useEventPageRoute(slug);
  if (element) return element;

  const { ruleDocuments = [] } = getStandardTemplateOptions(event.id);
  return (
    <EventWorkspaceTemplate
      key={event.id}
      eventId={event.id}
      fallbackName={event.name}
      eventSlug={event.slug || null}
      ruleDocuments={ruleDocuments}
    />
  );
}

/*
 * Redirects for URLs moved on 2026-11-13. Retire after 2027-05-13.
 * The server already 301s `/event/:slug` (vercel.json); these also cover an
 * installed PWA, whose service worker answers navigations without the server.
 */

/** `/event/:slug` -> `/events/:slug`. */
export function LegacyStandardEventRedirect() {
  const { slug } = useParams();
  return <Navigate to={`${EVENTS_BASE_PATH}/${slug}`} replace />;
}

/** `/event-spirit|rules|rosters?eventId=` -> `/events/<slug>/<section>`. */
export function LegacyEventSectionRedirect({ section }) {
  return useLegacyEventSectionRedirect(section);
}
