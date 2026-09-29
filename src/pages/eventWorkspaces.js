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
      // Listed in standardEventTemplates.js: this URL renders the standard
      // event page and `Component` is kept only as a backup.
      usesStandardTemplate: isStandardTemplateEvent(eventId),
      meta: {
        eventName: eventName || derivedSlug.replace(/-/g, " "),
        sourcePath: path.replace(/^\.\//, "src/pages/"),
      },
    };
  })
  .filter(Boolean);

const eventWorkspacePriorityByEventId = {};
const eventWorkspacePathByEventId = eventWorkspaces.reduce((acc, workspace) => {
  const currentPriority = eventWorkspacePriorityByEventId[workspace.eventId];
  if (currentPriority === undefined || workspace.priority > currentPriority) {
    acc[workspace.eventId] = workspace.path;
    eventWorkspacePriorityByEventId[workspace.eventId] = workspace.priority;
  }
  return acc;
}, {});

export const getEventWorkspacePath = (eventId) => eventWorkspacePathByEventId[eventId] || null;

/**
 * Where an event's page lives: its workspace URL when it has one (custom, or a
 * listed event now on the standard page), otherwise the standard page at
 * `/events/<slug of its name>`, which StandardEventPage resolves by name.
 */
export const getEventPagePath = (event) => {
  if (!event?.id) return null;
  const workspacePath = getEventWorkspacePath(event.id);
  if (workspacePath) return workspacePath;
  const slug = slugify(event.name);
  return slug ? `/events/${slug}` : null;
};

export { eventWorkspaces, eventWorkspacePathByEventId };
