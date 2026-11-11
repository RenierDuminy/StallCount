import { isStandardTemplateEvent } from "./standardEventTemplates";

const workspaceModules = import.meta.glob("./events workspace/*.jsx", { eager: true });

export const slugify = (value) => {
  if (typeof value !== "string") return null;
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
};

const eventWorkspaces = Object.entries(workspaceModules)
  .map(([path, mod]) => {
    if (!mod || typeof mod !== "object") return null;
    const Component = mod.default;
    const eventId = mod.EVENT_ID;
    if (!Component || typeof eventId !== "string" || !eventId) return null;
    const eventName = typeof mod.EVENT_NAME === "string" ? mod.EVENT_NAME : null;
    const explicitSlug =
      typeof mod.EVENT_SLUG === "string" && mod.EVENT_SLUG.trim().length
        ? mod.EVENT_SLUG.trim()
        : null;
    const derivedSlug = explicitSlug || slugify(eventName);
    if (!derivedSlug) return null;
    const priority =
      typeof mod.EVENT_WORKSPACE_PRIORITY === "number"
        ? mod.EVENT_WORKSPACE_PRIORITY
        : 0;
    return {
      eventId,
      slug: derivedSlug,
      path: `/events/${derivedSlug}`,
      Component,
      priority,
      // Not listed as custom in standardEventTemplates.js: this URL redirects
      // to the standard event page and `Component` is kept only as a backup.
      usesStandardTemplate: isStandardTemplateEvent(eventId),
      meta: {
        eventName: eventName || derivedSlug.replace(/-/g, " "),
        sourcePath: path.replace(/^\.\//, "src/pages/"),
      },
    };
  })
  .filter(Boolean);

// Only custom workspaces (listed in standardEventTemplates.js) own an event's
// URL. Every other event is served by the standard page at /event/<name>; an
// old workspace URL just redirects there.
const eventWorkspacePriorityByEventId = {};
const eventWorkspacePathByEventId = eventWorkspaces.reduce((acc, workspace) => {
  if (workspace.usesStandardTemplate) return acc;
  const currentPriority = eventWorkspacePriorityByEventId[workspace.eventId];
  if (currentPriority === undefined || workspace.priority > currentPriority) {
    acc[workspace.eventId] = workspace.path;
    eventWorkspacePriorityByEventId[workspace.eventId] = workspace.priority;
  }
  return acc;
}, {});

/** An event's custom workspace URL, or null when it uses the standard page. */
export const getEventWorkspacePath = (eventId) => eventWorkspacePathByEventId[eventId] || null;

/** Base path of the standard event page: `/event/<slug of the event name>`. */
export const STANDARD_EVENT_BASE_PATH = "/event";

export const getStandardEventPath = (eventName) => {
  const slug = slugify(eventName);
  return slug ? `${STANDARD_EVENT_BASE_PATH}/${slug}` : null;
};

/**
 * Where an event's page lives: its custom workspace URL when it has one,
 * otherwise the standard page at `/event/<slug of its name>`.
 */
export const getEventPagePath = (event) => {
  if (!event?.id) return null;
  return getEventWorkspacePath(event.id) || getStandardEventPath(event.name);
};

// Slug with every separator removed, so "sa-mx-nationals2026" and
// "sa-mx-nationals-2026" name the same event.
const compactSlug = (value) => (slugify(value) || "").replace(/-/g, "");

/**
 * The event a URL slug names: an exact match on the slugified name first, then
 * a match ignoring hyphens. The list is newest first, so a shared name resolves
 * to the newest event.
 */
export function findEventBySlug(events, slug) {
  if (!events?.length || !slug) return null;
  const exact = events.find((row) => slugify(row.name) === slug);
  if (exact) return exact;
  const loose = compactSlug(slug);
  if (!loose) return null;
  const byName = events.find((row) => compactSlug(row.name) === loose);
  if (byName) return byName;
  // A workspace file's own slug is an alias for its event. Shared links use
  // it ("/events/sa-mx-nationals2026" for "Mixed Nationals 2026"), and the
  // event's name need not resemble it.
  const workspace = eventWorkspaces.find((row) => compactSlug(row.slug) === loose);
  return workspace ? events.find((row) => row.id === workspace.eventId) || null : null;
}

export { eventWorkspaces, eventWorkspacePathByEventId };
