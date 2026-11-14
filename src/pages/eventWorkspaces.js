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
      // Not listed as custom in standardEventTemplates.js: not routed at all.
      usesStandardTemplate: isStandardTemplateEvent(eventId),
      meta: {
        eventName: eventName || derivedSlug.replace(/-/g, " "),
        sourcePath: path.replace(/^\.\//, "src/pages/"),
      },
    };
  })
  .filter(Boolean);

// Only custom workspaces (listed in standardEventTemplates.js) own an event's
// URL, `/events/<their slug>`. Every other event is served by the standard
// page at `/events/<slug of its name>`.
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

/**
 * Every event page lives under one prefix: `/events/<slug>` (since
 * 2026-11-13; the standard page used to be `/event/<slug>`, which now 301s
 * here from vercel.json). The list is `/events`.
 */
export const EVENTS_BASE_PATH = "/events";

/** Sub-pages of an event: `/events/<slug>/<section>`. */
export const EVENT_SECTIONS = Object.freeze({
  SPIRIT: "spirit",
  RULES: "rules",
  ROSTERS: "rosters",
});

/**
 * An event's address segment. Stored in `events.slug` (since 2026-11-13,
 * migration 20261113120000_event_slugs.sql): set once from the name when the
 * event is created and kept when it is renamed, so links never break. Falls
 * back to the slug of the name for a row read without `slug` (an older cached
 * list), which is what the stored value was filled with.
 */
export const getEventSlug = (event) => {
  const stored = typeof event?.slug === "string" ? event.slug.trim() : "";
  return stored || slugify(event?.name) || null;
};

export const getStandardEventPath = (event) => {
  const slug = getEventSlug(event);
  return slug ? `${EVENTS_BASE_PATH}/${encodeURIComponent(slug)}` : null;
};

/** The custom workspace that owns `slug`, if any (only CUSTOM_WORKSPACE_EVENTS). */
export const getCustomWorkspaceBySlug = (slug) =>
  eventWorkspaces.find(
    (workspace) => !workspace.usesStandardTemplate && workspace.slug === slug,
  ) || null;

/**
 * Where an event's page lives: its custom workspace URL when it has one,
 * otherwise the standard page at `/events/<its stored slug>`. Build every
 * event link with this (or getEventSectionPath), never by hand, and pass the
 * whole event row (`id`, `slug`, `name`).
 */
export const getEventPagePath = (event) => {
  if (!event?.id) return null;
  return getEventWorkspacePath(event.id) || getStandardEventPath(event);
};

/** An event sub-page, e.g. `/events/<slug>/spirit`. `section` is an EVENT_SECTIONS value. */
export const getEventSectionPath = (event, section) => {
  const base = getEventPagePath(event);
  return base && section ? `${base}/${section}` : base;
};

// Slug with every separator removed, so "sa-mx-nationals2026" and
// "sa-mx-nationals-2026" name the same event.
const compactSlug = (value) => (slugify(value) || "").replace(/-/g, "");

/**
 * The event a URL slug names, in order: its stored slug (the real address);
 * the slug of its current name (a renamed event typed by its new name, or a
 * row read without `slug`); either ignoring hyphens (a mistyped link). The
 * list is newest first, so a shared name resolves to the newest event. Every
 * match but the first is redirected to the canonical address by the page.
 */
export function findEventBySlug(events, slug) {
  if (!events?.length || !slug) return null;
  const stored = events.find((row) => row.slug && row.slug === slug);
  if (stored) return stored;
  const byNameExact = events.find((row) => slugify(row.name) === slug);
  if (byNameExact) return byNameExact;
  const loose = compactSlug(slug);
  if (!loose) return null;
  const byLoose = events.find(
    (row) => (row.slug && compactSlug(row.slug) === loose) || compactSlug(row.name) === loose,
  );
  if (byLoose) return byLoose;
  // A custom workspace's own slug names its event (its URL need not resemble
  // the event's name). Other workspaces' slugs are not aliases: those
  // old redirects were retired on 2026-11-13.
  const workspace = eventWorkspaces.find(
    (row) => !row.usesStandardTemplate && compactSlug(row.slug) === loose,
  );
  return workspace ? events.find((row) => row.id === workspace.eventId) || null : null;
}

export { eventWorkspaces, eventWorkspacePathByEventId };
