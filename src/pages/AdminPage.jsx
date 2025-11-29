import { Link } from "react-router-dom";

const ADMIN_MODULES = [
  {
    label: "Score keeper",
    description:
      "Run the live scoreboard, reconcile offline submissions, and monitor match flow.",
    to: "/score-keeper",
    accent: "bg-brand/10 text-brand-dark",
  },
  {
    label: "Score keeper v2",
    description: "New build space for the next-generation score keeper console.",
    to: "/score-keeper-v2",
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
    label: "Tournament director",
    description:
      "Desktop command center to view, create, and alter tournament data across every table.",
    to: "/tournament-director",
    accent: "bg-slate-200 text-slate-800",
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
    <div className="pb-16 text-[var(--sc-ink)]">
      <header className="sc-shell py-6">
        <div className="sc-card-base space-y-3 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sc-chip">Admin</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
              StallCount control
            </span>
          </div>
          <h1 className="text-3xl font-semibold text-[var(--sc-ink)]">Admin tools</h1>
          <p className="text-sm text-[var(--sc-ink-muted)]">
            Choose your workspace to access the specialised controls you need.
          </p>
          <Link to="/dashboard" className="sc-button is-ghost">
            View dashboard overview
          </Link>
        </div>
      </header>

      <main className="sc-shell space-y-6 py-6">
        <section className="sc-card-base p-5 sm:p-6 space-y-2">
          <h2 className="text-lg font-semibold text-[var(--sc-ink)]">Backend workspaces</h2>
          <p className="text-sm text-[var(--sc-ink-muted)]">
            Each module routes to its dedicated screens. Use the cards below to jump straight into your tools.
          </p>
        </section>
        <div className="grid gap-6 md:grid-cols-3">
          {ADMIN_MODULES.map((module) => (
            <article
              key={module.label}
              className="sc-card-base flex h-full flex-col justify-between p-6 transition hover:-translate-y-0.5"
            >
              <header className="space-y-2">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${module.accent}`}
                >
                  {module.label}
                </span>
                <p className="text-sm text-[var(--sc-ink-muted)]">{module.description}</p>
              </header>
              <Link to={module.to} className="mt-6 sc-button">
                Open {module.label}
              </Link>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
