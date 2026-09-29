/**
 * Which events use the standard event page (`EventWorkspaceTemplate`).
 *
 * Rule of thumb:
 *  - An event with NO custom workspace file uses the standard page, at
 *    `/events/<slug of its name>`. That covers every new event automatically.
 *  - An event WITH a custom workspace file in `events workspace/` keeps that
 *    custom page — the exception kept for older events...
 *  - ...unless it is listed below. Listed events render the standard page at
 *    their existing workspace URL, and their custom file is kept only as a
 *    backup (still bundled, no longer routed). Remove an entry to fall back to
 *    the custom page.
 *
 * The one thing the standard page cannot read from the database is an event's
 * rule PDFs, so each entry can carry `ruleDocuments: [{ name, href }]`. The
 * Rules card is hidden when there are none.
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

const STANDARD_TEMPLATE_EVENTS = {
  // Stellenbosch Residence League 2026 (backup: STB_RL_2026.jsx)
  "e6a34716-f9d6-4d70-bc1a-b610a04e3eaf": { ruleDocuments: STELLENBOSCH_5V5_RULES },
  // Stellenbosch Internal Draft League 5 (backup: STB_IDL5.jsx)
  "2fb09ada-9a69-47ae-bfc5-96a3bca759e9": {},
  // Stellenbosch Internal Draft League VI (backup: STB_IDL6.jsx)
  "abd01401-fba2-42f2-9bf9-7dfdce3e44d6": { ruleDocuments: STELLENBOSCH_5V5_RULES },
  // Gauteng Mixed League 2026 (backup: GP_MX_league_2026.jsx)
  "aac5921d-ff3a-44ac-9962-dc5d8017ea1f": {},
  // Cape Town Mixed League 2026 (backup: CPT_MX_league_2026.jsx)
  "1952f80d-f534-46d8-93ef-136e045429fc": {},
};

/** True when a custom workspace for this event is overridden by the standard page. */
export const isStandardTemplateEvent = (eventId) =>
  Object.prototype.hasOwnProperty.call(STANDARD_TEMPLATE_EVENTS, eventId);

/** Standard-page options for an event; `{}` for events with none configured. */
export const getStandardTemplateOptions = (eventId) => STANDARD_TEMPLATE_EVENTS[eventId] || {};
