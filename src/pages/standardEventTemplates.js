/**
 * Which events use the standard event page (`EventWorkspaceTemplate`).
 *
 * Every event uses the standard page by default, at `/event/<slug of its
 * name>`. A new event gets a working page the moment it exists in the
 * database: nothing to add here, no file to write.
 *
 * The only exceptions are the events listed in CUSTOM_WORKSPACE_EVENTS: those
 * render their own file from `events workspace/` at `/events/<slug>`. A
 * workspace file for an event NOT listed there is ignored (kept as a backup,
 * still bundled, not routed) and its old `/events/<slug>` URL redirects to the
 * standard page.
 */

/** Events that keep their custom workspace page instead of the standard one. */
const CUSTOM_WORKSPACE_EVENTS = new Set([
  // Stellenbosch Residence League 2025: hand-entered results, no live data
  // (Stellenbosh residence league 2025.jsx)
  "b0598bc7-fdd2-498c-ab8c-e5f4904ed03d",
]);

/**
 * The one thing the standard page cannot read from the database is an event's
 * rule PDFs, so they are listed here per event id. The Rules card is hidden
 * for events with none.
 */
const STELLENBOSCH_5V5_RULES = [
  {
    name: "Rules-of-Ultimate - STB 5v5 edition (summary).pdf",
    href: "/rules/stellenbosch-rl-2026-rules-summary.pdf",
  },
  {
    name: "Rules-of-Ultimate - STB 5v5 edition.pdf",
    href: "/rules/stellenbosch-rl-2026-rules.pdf",
  },
];

const STANDARD_TEMPLATE_OPTIONS = {
  // Stellenbosch Residence League 2026
  "e6a34716-f9d6-4d70-bc1a-b610a04e3eaf": { ruleDocuments: STELLENBOSCH_5V5_RULES },
  // Stellenbosch Internal Draft League VI
  "abd01401-fba2-42f2-9bf9-7dfdce3e44d6": { ruleDocuments: STELLENBOSCH_5V5_RULES },
};

/** True unless the event is listed as keeping its custom workspace page. */
export const isStandardTemplateEvent = (eventId) => !CUSTOM_WORKSPACE_EVENTS.has(eventId);

/** Standard-page options for an event; `{}` for events with none configured. */
export const getStandardTemplateOptions = (eventId) => STANDARD_TEMPLATE_OPTIONS[eventId] || {};
