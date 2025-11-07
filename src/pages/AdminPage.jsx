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
];

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              StallCount Control
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">
              Admin tools
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Choose your workspace to access the specialised controls you need.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            View dashboard overview
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Backend workspaces
          </h2>
          <p className="text-sm text-slate-600">
            Each module routes to its dedicated screens. Use the cards below to
            jump straight into your tools.
          </p>
        </section>
        <div className="grid gap-6 md:grid-cols-3">
          {ADMIN_MODULES.map((module) => (
            <article
              key={module.label}
              className="flex h-full flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-brand/40 hover:shadow-lg"
            >
              <header className="space-y-2">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${module.accent}`}
                >
                  {module.label}
                </span>
                <p className="text-sm text-slate-600">{module.description}</p>
              </header>
              <Link
                to={module.to}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Open {module.label}
              </Link>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
