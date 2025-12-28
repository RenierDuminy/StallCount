import { Link } from "react-router-dom";
import { Card, Panel, SectionHeader, SectionShell } from "../components/ui/primitives";

const ADMIN_MODULES = [
  {
    label: "Score keeper",
    description:
      "Run the live scoreboard, reconcile offline submissions, and monitor match flow.",
    to: "/score-keeper",
    accent: "bg-brand/10 text-ink",
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
    label: "Tournament director",
    description:
      "Desktop command center to view, create, and alter tournament data across every table.",
    to: "/tournament-director",
    accent: "bg-slate-200 text-slate-800",
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
    label: "Spirit scores",
    description: "Capture and review spirit scores for completed matches.",
    to: "/spirit-scores",
    accent: "bg-emerald-100 text-emerald-700",
  },
];

export default function AdminPage() {
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
          {ADMIN_MODULES.map((module) => (
            <Panel
              key={module.label}
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
          ))}
        </div>
      </SectionShell>
    </div>
  );
}
