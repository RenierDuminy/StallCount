const workspaceModules = import.meta.glob("./events workspace/*.jsx", { eager: true });

const slugify = (value) => {
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
    return {
      eventId,
      slug: derivedSlug,
      path: `/events/${derivedSlug}`,
      Component,
      meta: {
        eventName: eventName || derivedSlug.replace(/-/g, " "),
        sourcePath: path.replace(/^\.\//, "src/pages/"),
      },
    };
  })
  .filter(Boolean);

const eventWorkspacePathByEventId = eventWorkspaces.reduce((acc, workspace) => {
  acc[workspace.eventId] = workspace.path;
  return acc;
}, {});

export const getEventWorkspacePath = (eventId) => eventWorkspacePathByEventId[eventId] || null;

export { eventWorkspaces, eventWorkspacePathByEventId };
