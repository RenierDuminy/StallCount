import { Link } from "react-router-dom";

const features = [
  {
    title: "Live Scoring",
    description:
      "Track in-game fouls, score changes, and player actions with real-time updates that sync immediately across devices.",
  },
  {
    title: "Insightful Analytics",
    description:
      "Turn raw game data into clean charts and summaries to help coaches and referees surface trends faster.",
  },
  {
    title: "Offline Friendly",
    description:
      "Keep matches running even without a connection. Data queues locally and syncs automatically once you are back online.",
  },
];

const highlights = [
  { label: "Active Teams", value: "28" },
  { label: "Matches Logged", value: "1.2k" },
  { label: "Decisions Reviewed", value: "640" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 ring-1 ring-brand/20">
              <span className="text-xl font-semibold text-brand-dark">SC</span>
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">StallCount</p>
              <p className="text-sm text-slate-500">
                Smarter officiating, streamlined.
              </p>
            </div>
          </div>
          <nav className="hidden items-center gap-10 text-sm font-medium text-slate-500 md:flex">
            <a href="#features" className="transition-colors hover:text-slate-900">
              Product
            </a>
            <a href="#highlights" className="transition-colors hover:text-slate-900">
              Highlights
            </a>
            <a href="#cta" className="transition-colors hover:text-slate-900">
              Get Started
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand/60 hover:text-brand-dark"
            >
              Log in
            </Link>
            <Link
              to="/dashboard"
              className="hidden rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-brand-dark md:inline-flex"
            >
              Go to dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-20 px-6 py-16 md:py-20">
        <section className="grid gap-12 md:grid-cols-[1.1fr,0.9fr] md:items-center">
          <div className="space-y-6">
            <span className="inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-dark">
              Control every call
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
              A modern command center for ultimate officiating crews.
            </h1>
            <p className="text-lg leading-relaxed text-slate-600">
              StallCount keeps your crew in sync with live statistics, offline
              resilience, and analytics designed for post-match reviews. Bring a
              polished, collaborative workflow to every tournament table.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white shadow-card transition hover:bg-brand-dark"
              >
                View dashboard
              </Link>
              <Link
                to="/test-matches"
                className="inline-flex items-center justify-center rounded-full border border-transparent bg-white px-6 py-3 text-sm font-semibold text-brand-dark ring-1 ring-brand/30 transition hover:bg-brand/5"
              >
                Explore test matches
              </Link>
            </div>
          </div>
          <div className="relative" id="highlights">
            <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-brand/20 via-brand/5 to-transparent blur-2xl" />
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-brand/10">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <p className="text-sm font-medium text-slate-500">
                  Tournament overview
                </p>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                  Live sync
                </span>
              </div>
              <div className="space-y-5 px-6 py-7">
                <div className="grid gap-4 sm:grid-cols-3">
                  {highlights.map((item) => (
                    <article
                      key={item.label}
                      className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
                    >
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {item.value}
                      </p>
                    </article>
                  ))}
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white p-5">
                  <p className="text-sm font-medium text-slate-500">
                    Latest match insights
                  </p>
                  <div className="mt-3 grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
                    <p>
                      <span className="font-semibold text-slate-900">
                        68%
                      </span>{" "}
                      of stall calls resolved on field.
                    </p>
                    <p>
                      <span className="font-semibold text-slate-900">
                        +12%
                      </span>{" "}
                      improvement in review turnaround.
                    </p>
                    <p>
                      <span className="font-semibold text-slate-900">
                        4.8/5
                      </span>{" "}
                      crew feedback across tournaments.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="space-y-8">
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-semibold text-slate-900">
              Built for coaches, captains, and stat crews
            </h2>
            <p className="max-w-3xl text-base text-slate-600">
              StallCount blends robust officiating tools with a polished user
              experience designed for fast-paced tournament logistics.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-brand/10"
              >
                <div className="h-12 w-12 rounded-2xl bg-brand/10 ring-1 ring-brand/20" />
                <h3 className="text-lg font-semibold text-slate-900">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="cta"
          className="overflow-hidden rounded-3xl border border-slate-200 bg-white px-8 py-12 shadow-lg shadow-brand/10"
        >
          <div className="grid gap-10 md:grid-cols-[2fr,1fr] md:items-center">
            <div className="space-y-4">
              <h2 className="text-3xl font-semibold text-slate-900">
                Ready to streamline your next tournament?
              </h2>
              <p className="text-base leading-relaxed text-slate-600">
                Launch StallCount to coordinate crews, capture accurate data, and
                bring a professional touch to every match you oversee.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white shadow-card transition hover:bg-brand-dark"
                >
                  Sign in to continue
                </Link>
                <Link
                  to="/realtime-test"
                  className="inline-flex items-center justify-center rounded-full border border-transparent bg-brand/10 px-6 py-3 text-sm font-semibold text-brand-dark ring-1 ring-brand/20 transition hover:bg-brand/15"
                >
                  Run real-time test
                </Link>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-slate-50 p-6">
              <div className="absolute -top-10 right-0 h-28 w-28 rounded-full bg-brand/10 blur-2xl" />
              <dl className="space-y-4 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <dt>Deployment ready</dt>
                  <dd className="font-semibold text-slate-900">Vercel + Supabase</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Offline capable</dt>
                  <dd className="font-semibold text-slate-900">PWA enabled</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Team onboarding</dt>
                  <dd className="font-semibold text-slate-900">Under 5 minutes</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <p>&copy; {new Date().getFullYear()} StallCount. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <a href="#features" className="transition hover:text-slate-900">
              Features
            </a>
            <Link to="/login" className="transition hover:text-slate-900">
              Log in
            </Link>
            <Link to="/dashboard" className="transition hover:text-slate-900">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
