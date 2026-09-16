import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Card, Panel, SectionHeader, SectionShell } from "../components/ui/primitives";
import { normaliseRoleList } from "../utils/accessControl";

const ADMIN_MODULE_PRIORITY = [
  "Score keeper",
  "Spirit scores",
  "Captain",
  "Event access control",
  "Media",
  "Event setup",
  "Tournament director",
  "Match corrections",
  "Playoff structure",
];
const ADMIN_MODULE_DIVIDER_AFTER = new Set(["Spirit scores", "Playoff structure"]);

// Mirrors the hex values defined for each --sc-* token in src/theme.css.
const COLOR_VAR_HEX = {
  "--sc-accent": "#c6ff62",
  "--sc-warning": "#fbbf24",
  "--sc-media": "#38bdf8",
  "--sc-admin": "#c084fc",
  "--sc-live": "#fb7185",
};

const ADMIN_MODULES = [
  {
    label: "Score keeper",
    description:
      "Open the live scoring console. Pick Competitive or Casual tracking in match setup.",
    to: "/score-keeper",
    accent: "border border-live-border bg-live-bg text-live-ink",
    colorVar: "--sc-live",
  },
  {
    label: "Scrimmage",
    description:
      "Scrimmage console with the same live scoring workflow for test matches.",
    to: "/admin/scrimmage",
    accent: "border border-live-border bg-live-bg text-live-ink",
    colorVar: "--sc-live",
  },
  {
    label: "Captain",
    description:
      "Manage rosters, submit spirit scores, and coordinate pre-game logistics.",
    to: "/captain",
    accent: "border border-warning-border bg-warning-bg text-warning-ink",
    colorVar: "--sc-warning",
  },
  {
    label: "Sys admin",
    description:
      "Browse and edit any Supabase table directly, with cascade-aware deletes and build diagnostics.",
    to: "/sys-admin",
    accent: "border border-admin-border bg-admin-bg text-admin-ink",
    colorVar: "--sc-admin",
  },
  {
    label: "Access control",
    description:
      "Scan every account, view their IDs, and change access tiers without leaving the admin hub.",
    to: "/admin/access",
    accent: "border border-admin-border bg-admin-bg text-admin-ink",
    colorVar: "--sc-admin",
  },
  {
    label: "Event access control",
    description:
      "Review event-linked access and role assignments tied to specific competitions.",
    to: "/admin/event-access",
    accent: "border border-admin-border bg-admin-bg text-admin-ink",
    colorVar: "--sc-admin",
  },
  {
    label: "Signup management",
    description:
      "Export the current event roster as a CSV, grouped by team, for use outside StallCount.",
    to: "/admin/signup-management",
    accent: "border border-admin-border bg-admin-bg text-admin-ink",
    colorVar: "--sc-admin",
  },
  {
    label: "Tournament director",
    description:
      "Desktop command center to view, create, and alter tournament data across every table.",
    to: "/tournament-director",
    accent: "border border-admin-border bg-admin-bg text-admin-ink",
    colorVar: "--sc-admin",
  },
  {
    label: "Match corrections",
    description:
      "Audit a match's point-by-point log, find discrepancies, and fix scores, scorers, and assists.",
    to: "/match-corrections",
    accent: "border border-admin-border bg-admin-bg text-admin-ink",
    colorVar: "--sc-admin",
    // Mirrors MATCH_CORRECTIONS_ACCESS_ROLES on the route. `administrator` and
    // `sys_admin` are included the way the Playoff structure card does it, since
    // this list matches role names rather than resolving admin_override.
    allowedRoles: [
      "admin",
      "administrator",
      "sys_admin",
      "tournament_director",
      "field_assistant",
    ],
  },
  {
    label: "Playoff structure",
    description:
      "Inspect bracket definitions and resolve bracket nodes into scheduled matches from pool or bracket sources.",
    to: "/admin/playoff-structure",
    accent: "border border-warning-border bg-warning-bg text-warning-ink",
    colorVar: "--sc-warning",
    allowedRoles: ["admin", "administrator", "sys_admin", "tournament_director"],
  },
  {
    label: "Media",
    description:
      "Attach stream links to matches and manage team branding colors for streaming overlays.",
    to: "/admin/media",
    accent: "border border-media-border bg-media-bg text-media-ink",
    colorVar: "--sc-media",
  },
  {
    label: "Event setup",
    description:
      "Step-by-step flow to create events, their divisions, pools, and seeded matches before publishing.",
    to: "/admin/event-setup",
    accent: "border border-warning-border bg-warning-bg text-warning-ink",
    colorVar: "--sc-warning",
  },
  {
    label: "Custom scripts",
    description:
      "View, edit, and run bundled admin JS scripts with local browser overrides.",
    to: "/admin/custom-scripts",
    accent: "border border-admin-border bg-admin-bg text-admin-ink",
    colorVar: "--sc-admin",
    allowedRoles: ["admin"],
  },
  {
    label: "Spirit scores",
    description: "Capture and review spirit scores for completed matches.",
    to: "/spirit-scores",
    accent: "border border-border bg-surface-muted text-ink",
    colorVar: "--sc-accent",
  },
];

export default function AdminPage() {
  const { roles } = useAuth();
  const visibleModules = useMemo(() => {
    const priorityLookup = new Map(
      ADMIN_MODULE_PRIORITY.map((label, index) => [label.toLowerCase(), index]),
    );

    return ADMIN_MODULES.filter((module) => {
      if (!Array.isArray(module.allowedRoles) || module.allowedRoles.length === 0) {
        return true;
      }

      if (!Array.isArray(roles)) {
        return false;
      }

      return roles.some((assignment) => {
        const roleNames = normaliseRoleList(
          assignment?.roleName || assignment?.role?.name || assignment?.name || "",
        );
        return roleNames.some((roleName) => module.allowedRoles.includes(roleName));
      });
    }).sort((left, right) => {
      const leftPriority = priorityLookup.get(left.label.toLowerCase());
      const rightPriority = priorityLookup.get(right.label.toLowerCase());

      if (leftPriority !== undefined && rightPriority !== undefined) {
        return leftPriority - rightPriority;
      }

      if (leftPriority !== undefined) {
        return -1;
      }

      if (rightPriority !== undefined) {
        return 1;
      }

      return left.label.localeCompare(right.label);
    });
  }, [roles]);

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-6">
        <Card className="space-y-4 p-6 sm:p-8">
          <SectionHeader
            title="Admin tools"
            description="Choose your workspace to access the specialised controls you need."
          />
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-6 py-6">
        <div className="grid gap-6 md:grid-cols-3">
          {visibleModules.map((module) => (
            <div key={module.label} className="contents">
              <Panel
                variant="tinted"
                className="flex h-full flex-col justify-between p-6 transition hover:-translate-y-0.5"
              >
                <header className="space-y-2">
                  <div className="inline-block">
                    <h3 className="text-lg font-semibold text-white">{module.label}</h3>
                    <hr
                      aria-hidden="true"
                      className="h-0.5 w-full rounded-full border-0"
                      style={{ backgroundColor: COLOR_VAR_HEX[module.colorVar] }}
                    />
                  </div>
                  <p className="text-sm text-ink-muted">{module.description}</p>
                </header>
                <Link to={module.to} className="mt-6 sc-button">
                  Open {module.label}
                </Link>
              </Panel>
              {ADMIN_MODULE_DIVIDER_AFTER.has(module.label) ? (
                <div
                  aria-hidden="true"
                  className="md:col-span-3 h-px w-full bg-slate-200"
                />
              ) : null}
            </div>
          ))}
        </div>
      </SectionShell>
    </div>
  );
}
