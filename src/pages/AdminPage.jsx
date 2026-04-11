import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Card, Panel, SectionHeader, SectionShell } from "../components/ui/primitives";
import { normaliseRoleList } from "../utils/accessControl";

const ADMIN_MODULE_PRIORITY = [
  "Score keeper",
  "Score keeper 5v5",
  "Spirit scores",
  "Captain",
  "Event access control",
  "Media",
  "Event setup",
  "Tournament director",
  "Playoff structure",
];
const ADMIN_MODULE_DIVIDER_AFTER = new Set(["Spirit scores", "Playoff structure"]);

const ADMIN_MODULES = [
  {
    label: "Score keeper",
    description:
      "Run the live scoreboard, reconcile offline submissions, and monitor match flow.",
    to: "/score-keeper",
    accent: "bg-brand/10 text-ink",
  },
  {
    label: "Score keeper 5v5",
    description:
      "Use the 5v5 scorekeeping workspace for matches that run on the 5v5 ruleset.",
    to: "/score-keeper-5v5",
    accent: "bg-violet-100 text-violet-700",
  },
  {
    label: "Scrimmage",
    description:
      "Scrimmage console with the same live scoring workflow for test matches.",
    to: "/admin/scrimmage",
    accent: "bg-emerald-100 text-emerald-700",
  },
  {
    label: "Scoreboard debug",
    description:
      "Temporary sandbox to enter device data, preview the board, and inspect payloads.",
    to: "/admin/scoreboard-debug",
    accent: "bg-indigo-100 text-indigo-700",
  },
  {
    label: "Captain",
    description:
      "Manage rosters, submit spirit scores, and coordinate pre-game logistics.",
    to: "/captain",
    accent: "bg-sky-100 text-sky-700",
  },
  {
    label: "Sys admin",
    description:
      "Configure leagues, manage access, and oversee StallCount's operational data.",
    to: "/sys-admin",
    accent: "bg-amber-100 text-amber-700",
  },
  {
    label: "Access control",
    description:
      "Scan every account, view their IDs, and change access tiers without leaving the admin hub.",
    to: "/admin/access",
    accent: "bg-fuchsia-100 text-fuchsia-700",
  },
  {
    label: "Event access control",
    description:
      "Review event-linked access and role assignments tied to specific competitions.",
    to: "/admin/event-access",
    accent: "bg-teal-100 text-teal-700",
  },
  {
    label: "Signup management",
    description:
      "Compare event roster players with an imported external signup CSV using name and date of birth.",
    to: "/admin/signup-management",
    accent: "bg-cyan-100 text-cyan-700",
  },
  {
    label: "Tournament director",
    description:
      "Desktop command center to view, create, and alter tournament data across every table.",
    to: "/tournament-director",
    accent: "bg-slate-200 text-slate-800",
  },
  {
    label: "Playoff structure",
    description:
      "Inspect bracket definitions, linked playoff matches, and future source-based resolution work.",
    to: "/admin/playoff-structure",
    accent: "bg-orange-100 text-orange-700",
    allowedRoles: ["admin", "administrator", "sys_admin", "tournament_director"],
  },
  {
    label: "Media",
    description:
      "Attach or edit stream links for existing matches without leaving the admin suite.",
    to: "/admin/media",
    accent: "bg-rose-100 text-rose-700",
  },
  {
    label: "Event setup",
    description:
      "Step-by-step flow to create events, their divisions, pools, and seeded matches before publishing.",
    to: "/admin/event-setup",
    accent: "bg-lime-100 text-lime-700",
  },
  {
    label: "Custom scripts",
    description:
      "View, edit, and run bundled admin JS scripts with local browser overrides.",
    to: "/admin/custom-scripts",
    accent: "bg-stone-200 text-stone-800",
    allowedRoles: ["admin"],
  },
  {
    label: "Spirit scores",
    description: "Capture and review spirit scores for completed matches.",
    to: "/spirit-scores",
    accent: "bg-emerald-100 text-emerald-700",
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
            eyebrow="Admin"
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
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${module.accent}`}
                  >
                    {module.label}
                  </span>
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
