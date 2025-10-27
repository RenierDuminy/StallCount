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

const standings = [
  { rank: 1, team: "Skyline Surge", record: "7-1", diff: "+24" },
  { rank: 2, team: "Harbor Lights", record: "6-2", diff: "+18" },
  { rank: 3, team: "Metro Flyers", record: "5-3", diff: "+12" },
];

const playerRankings = [
  { rank: 1, name: "Mia Harper", team: "Skyline Surge", points: 68 },
  { rank: 2, name: "Eli Watkins", team: "Harbor Lights", points: 63 },
  { rank: 3, name: "Zoe Chen", team: "Metro Flyers", points: 59 },
];

const spiritRankings = [
  { rank: 1, team: "Harbor Lights", score: "4.9" },
  { rank: 2, team: "Northside Arcs", score: "4.7" },
  { rank: 3, team: "Coastal Horizon", score: "4.6" },
];

const fixtureGroups = [
  {
    title: "Upcoming",
    matches: [
      { teams: "Skyline Surge vs Harbor Lights", date: "Nov 24, 6:00 PM", venue: "Field 2" },
      { teams: "Metro Flyers vs Northside Arcs", date: "Nov 25, 4:30 PM", venue: "Field 1" },
    ],
  },
  {
    title: "Current",
    matches: [
      { teams: "Coastal Horizon vs Harbor Lights", date: "Live Now", venue: "Field 3" },
      { teams: "Capital Comets vs Skyline Surge", date: "Live Now", venue: "Field 4" },
    ],
  },
  {
    title: "Past",
    matches: [
      { teams: "Northside Arcs vs Metro Flyers", date: "Final, 15-12", venue: "Nov 18" },
      { teams: "Harbor Lights vs Capital Comets", date: "Final, 13-11", venue: "Nov 17" },
    ],
  },
];

const leagueDivisions = [
  { name: "Open Division", teams: 12, highlight: "Fast-paced play with elite squads." },
  { name: "Mixed Division", teams: 10, highlight: "Balanced rosters with co-ed lineups." },
  { name: "Masters Division", teams: 6, highlight: "Veteran strategy with experience." },
];

const leagueTeams = [
  { name: "Skyline Surge", division: "Open", record: "7-1" },
  { name: "Harbor Lights", division: "Mixed", record: "6-2" },
  { name: "Metro Flyers", division: "Open", record: "5-3" },
  { name: "Northside Arcs", division: "Mixed", record: "5-3" },
  { name: "Coastal Horizon", division: "Masters", record: "4-2" },
  { name: "Capital Comets", division: "Open", record: "4-4" },
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
            <a href="#statistics" className="transition-colors hover:text-slate-900">
              Statistics
            </a>
            <a href="#fixtures" className="transition-colors hover:text-slate-900">
              Fixtures
            </a>
            <a href="#league" className="transition-colors hover:text-slate-900">
              League
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

        <section id="statistics" className="space-y-8">
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-semibold text-slate-900">
              League statistics at a glance
            </h2>
            <p className="max-w-3xl text-base text-slate-600">
              Stay ahead with live standings, player performance, and spirit
              scores updated straight from the field crew.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <article className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Team standings
                </h3>
                <p className="text-sm text-slate-500">
                  Live table refreshed after each round.
                </p>
              </div>
              <ol className="space-y-3 text-sm text-slate-600">
                {standings.map((team) => (
                  <li
                    key={team.rank}
                    className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand-dark">
                        {team.rank}
                      </span>
                      <div>
                        <p className="font-medium text-slate-900">{team.team}</p>
                        <p className="text-xs text-slate-500">Record {team.record}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-emerald-600">
                      {team.diff}
                    </span>
                  </li>
                ))}
              </ol>
            </article>
            <article className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Player rankings
                </h3>
                <p className="text-sm text-slate-500">
                  Top performers by total involvement score.
                </p>
              </div>
              <ol className="space-y-3 text-sm text-slate-600">
                {playerRankings.map((player) => (
                  <li
                    key={player.rank}
                    className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand-dark">
                        {player.rank}
                      </span>
                      <div>
                        <p className="font-medium text-slate-900">{player.name}</p>
                        <p className="text-xs text-slate-500">{player.team}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      {player.points} pts
                    </span>
                  </li>
                ))}
              </ol>
            </article>
            <article className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Spirit rankings
                </h3>
                <p className="text-sm text-slate-500">
                  Aggregated spirit-of-the-game scores per match.
                </p>
              </div>
              <ol className="space-y-3 text-sm text-slate-600">
                {spiritRankings.map((entry) => (
                  <li
                    key={entry.rank}
                    className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand-dark">
                        {entry.rank}
                      </span>
                      <p className="font-medium text-slate-900">{entry.team}</p>
                    </div>
                    <span className="text-xs font-semibold text-emerald-600">
                      {entry.score}
                    </span>
                  </li>
                ))}
              </ol>
            </article>
          </div>
        </section>

        <section id="fixtures" className="space-y-8">
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-semibold text-slate-900">
              Fixtures and match flow
            </h2>
            <p className="max-w-3xl text-base text-slate-600">
              Plan around upcoming clashes, monitor games in progress, and review
              final scores with one glance.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {fixtureGroups.map((group) => (
              <article
                key={group.title}
                className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {group.title}
                  </h3>
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
                    {group.matches.length} games
                  </span>
                </div>
                <ul className="space-y-3 text-sm text-slate-600">
                  {group.matches.map((match) => (
                    <li
                      key={`${group.title}-${match.teams}-${match.date}`}
                      className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                    >
                      <p className="font-medium text-slate-900">{match.teams}</p>
                      <p className="text-xs text-slate-500">{match.date}</p>
                      <p className="text-xs text-slate-500">Venue: {match.venue}</p>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section id="league" className="space-y-8">
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-semibold text-slate-900">
              League information
            </h2>
            <p className="max-w-3xl text-base text-slate-600">
              Understand the structure behind StallCount tournaments and the
              teams competing this season.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-[0.9fr,1.1fr]">
            <article className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Divisions</h3>
                <p className="text-sm text-slate-500">
                  Tailored formats to match experience and roster makeup.
                </p>
              </div>
              <ul className="space-y-3 text-sm text-slate-600">
                {leagueDivisions.map((division) => (
                  <li
                    key={division.name}
                    className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-900">{division.name}</p>
                      <span className="text-xs font-semibold text-slate-500">
                        {division.teams} teams
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {division.highlight}
                    </p>
                  </li>
                ))}
              </ul>
            </article>
            <article className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Teams</h3>
                  <p className="text-sm text-slate-500">
                    Active rosters aligned with their division and record.
                  </p>
                </div>
                <Link
                  to="/dashboard"
                  className="text-xs font-semibold text-brand-dark underline underline-offset-4"
                >
                  View all
                </Link>
              </div>
              <ul className="space-y-3 text-sm text-slate-600">
                {leagueTeams.map((team) => (
                  <li
                    key={team.name}
                    className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{team.name}</p>
                      <p className="text-xs text-slate-500">{team.division} Division</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      {team.record}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
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
