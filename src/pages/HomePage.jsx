import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllTeams } from "../services/teamService";
import { getDivisions, getRecentEvents } from "../services/leagueService";
import { getTableCount } from "../services/statsService";

export default function HomePage() {
  const [featuredTeams, setFeaturedTeams] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({ teams: 0, players: 0, events: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        setLoading(true);
        const [
          teamsData,
          divisionsData,
          eventsData,
          playerCount,
          teamCount,
          eventCount,
        ] = await Promise.all([
          getAllTeams(6),
          getDivisions(4),
          getRecentEvents(4),
          getTableCount("players"),
          getTableCount("teams"),
          getTableCount("events"),
        ]);

        if (!ignore) {
          setFeaturedTeams(teamsData);
          setDivisions(divisionsData);
          setEvents(eventsData);
          setStats({
            players: playerCount,
            teams: teamCount,
            events: eventCount,
          });
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Unable to load league data.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, []);

  const safeDivisions = useMemo(() => divisions ?? [], [divisions]);
  const safeEvents = useMemo(() => events ?? [], [events]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 ring-1 ring-brand/20">
              <span className="text-xl font-semibold text-brand-dark">SC</span>
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">StallCount</p>
              <p className="text-sm text-slate-500">Supabase-backed officiating.</p>
            </div>
          </div>
          <nav className="hidden items-center gap-10 text-sm font-medium text-slate-500 md:flex">
            <a href="#stats" className="transition-colors hover:text-slate-900">
              Overview
            </a>
            <a href="#teams" className="transition-colors hover:text-slate-900">
              Teams
            </a>
            <a href="#divisions" className="transition-colors hover:text-slate-900">
              Divisions
            </a>
            <a href="#events" className="transition-colors hover:text-slate-900">
              Events
            </a>
            <Link to="/teams" className="transition-colors hover:text-slate-900">
              League DB
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand/60 hover:text-brand-dark"
            >
              Admin log in
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

      <main className="mx-auto flex max-w-7xl flex-col gap-16 px-6 py-16 md:py-20">
        <section className="grid gap-12 md:grid-cols-[1.1fr,0.9fr] md:items-center">
          <div className="space-y-6">
            <span className="inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-dark">
              Live league data
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
              All crews on the same page, powered directly by Supabase.
            </h1>
            <p className="text-lg leading-relaxed text-slate-600">
              This site reflects the actual SQL records for teams, divisions, and events.
              No demo filler—just the tournament data your staff maintains.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/teams"
                className="inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white shadow-card transition hover:bg-brand-dark"
              >
                Open teams database
              </Link>
              <Link
                to="/players"
                className="inline-flex items-center justify-center rounded-full border border-transparent bg-white px-6 py-3 text-sm font-semibold text-brand-dark ring-1 ring-brand/30 transition hover:bg-brand/5"
              >
                View player roster
              </Link>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" id="stats">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Current totals
            </h2>
            {error && (
              <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                { label: "Registered teams", value: stats.teams },
                { label: "Rostered players", value: stats.players },
                { label: "Tracked events", value: stats.events },
              ].map((item) => (
                <article
                  key={item.label}
                  className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-center"
                >
                  <p className="text-xs font-semibold uppercase text-slate-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {loading ? "…" : item.value}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="teams" className="space-y-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-slate-900">Teams spotlight</h2>
            <p className="text-base text-slate-600">
              Pulled directly from the `teams` table. Add a record in Supabase and it appears here
              immediately.
            </p>
          </div>
          {loading && featuredTeams.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Loading teams...
            </div>
          ) : featuredTeams.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              No teams found. Add entries to the Supabase `teams` table to populate this view.
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredTeams.map((team) => (
                <article key={team.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Team ID
                  </p>
                  <p className="truncate text-xs font-mono text-slate-500">{team.id}</p>
                  <h3 className="mt-3 text-xl font-semibold text-slate-900">{team.name}</h3>
                  {team.short_name && (
                    <p className="text-sm text-slate-500">Short name: {team.short_name}</p>
                  )}
                  <p className="mt-4 text-xs text-slate-400">
                    Added {new Date(team.created_at).toLocaleDateString()}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="divisions" className="space-y-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Active divisions</h2>
              <p className="text-base text-slate-600">
                Records from the `divisions` table capture how squads are grouped for play.
              </p>
            </div>
            <Link
              to="/admin"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand/60 hover:text-brand-dark"
            >
              Manage in dashboard
            </Link>
          </div>
          {loading && safeDivisions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Loading divisions...
            </div>
          ) : safeDivisions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              No divisions configured. Create them in Supabase to see them here.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {safeDivisions.map((division) => (
                <article
                  key={division.id}
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <h3 className="text-lg font-semibold text-slate-900">{division.name}</h3>
                  <p className="text-sm text-slate-500">
                    Level: {division.level ? division.level : "Not specified"}
                  </p>
                  <p className="mt-3 text-xs text-slate-400">
                    Created {new Date(division.created_at).toLocaleDateString()}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="events" className="space-y-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-slate-900">Events timeline</h2>
            <p className="text-base text-slate-600">
              Shows the most recent entries from the `events` table with dates and locations.
            </p>
          </div>
          {loading && safeEvents.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Loading events...
            </div>
          ) : safeEvents.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              No events recorded yet.
            </div>
          ) : (
            <div className="space-y-4">
              {safeEvents.map((event) => (
                <article
                  key={event.id}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {event.type}
                      </p>
                      <h3 className="text-xl font-semibold text-slate-900">{event.name}</h3>
                    </div>
                    <p className="text-sm text-slate-500">
                      {formatDateRange(event.start_date, event.end_date)}
                    </p>
                  </div>
                  {event.location && (
                    <p className="mt-1 text-sm text-slate-500">Location: {event.location}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <p>&copy; {new Date().getFullYear()} StallCount. Live Supabase data.</p>
          <div className="flex items-center gap-5">
            <a href="#stats" className="transition hover:text-slate-900">
              Overview
            </a>
            <Link to="/teams" className="transition hover:text-slate-900">
              Teams
            </Link>
            <Link to="/players" className="transition hover:text-slate-900">
              Players
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function formatDateRange(start, end) {
  if (!start && !end) return "Dates pending";
  const startDate = start ? new Date(start).toLocaleDateString() : "TBD";
  const endDate = end ? new Date(end).toLocaleDateString() : null;
  return endDate && endDate !== startDate ? `${startDate} – ${endDate}` : startDate;
}
