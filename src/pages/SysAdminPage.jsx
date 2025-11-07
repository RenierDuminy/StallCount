import { Link } from "react-router-dom";

export default function SysAdminPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Backend workspace
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">
              Systems admin tools
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Configure leagues, manage access policies, and audit StallCount data.
            </p>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            Back to admin hub
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Administration space</h2>
          <p className="mt-2 text-sm text-slate-600">
            Build out configuration dashboards, access control panels, or audit logs
            in this workspace as your product evolves.
          </p>
        </section>
      </main>
    </div>
  );
}
