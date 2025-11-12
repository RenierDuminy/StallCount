import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllTeams } from "../services/teamService";
import { getDivisions, getRecentEvents } from "../services/leagueService";
import { getTableCount } from "../services/statsService";
import { getRecentMatches } from "../services/matchService";

export default function HomePage() {
  const [featuredTeams, setFeaturedTeams] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [events, setEvents] = useState([]);
  const [matches, setMatches] = useState([]);
  const [stats, setStats] = useState({ teams: 0, players: 0, events: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all([
          toSettled(getAllTeams(6)),
          toSettled(getDivisions(4)),
          toSettled(getRecentEvents(4)),
          toSettled(getRecentMatches(6)),
          toSettled(getTableCount("players")),
          toSettled(getTableCount("teams")),
          toSettled(getTableCount("events")),
        ]);

        if (ignore) return;

        const [
          teamsResult,
          divisionsResult,
          eventsResult,
          matchesResult,
          playersCountResult,
          teamsCountResult,
          eventsCountResult,
        ] = results;

        const failures = [];

        if (teamsResult.status === "fulfilled") {
          setFeaturedTeams(teamsResult.value);
        } else {
          failures.push("teams");
          console.error("[HomePage] Failed to load teams:", teamsResult.reason);
        }

        if (divisionsResult.status === "fulfilled") {
          setDivisions(divisionsResult.value);
        } else {
          failures.push("divisions");
          console.error("[HomePage] Failed to load divisions:", divisionsResult.reason);
        }

        if (eventsResult.status === "fulfilled") {
          setEvents(eventsResult.value);
        } else {
          failures.push("events");
          console.error("[HomePage] Failed to load events:", eventsResult.reason);
        }

        if (matchesResult.status === "fulfilled") {
          setMatches(matchesResult.value);
        } else {
          failures.push("matches");
          console.error("[HomePage] Failed to load matches:", matchesResult.reason);
        }

        setStats({
          players:
            playersCountResult.status === "fulfilled" ? playersCountResult.value : 0,
          teams: teamsCountResult.status === "fulfilled" ? teamsCountResult.value : 0,
          events: eventsCountResult.status === "fulfilled" ? eventsCountResult.value : 0,
        });

        if (failures.length > 0) {
          setError(
            `Unable to load ${failures.join(
              ", "
            )}. Check Supabase policies or network access and try again.`
          );
        }
      } catch (err) {
        if (!ignore) {
          console.error("[HomePage] Unexpected load error:", err);
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
  const safeMatches = useMemo(() => matches ?? [], [matches]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-16 px-6 py-16 md:py-20">
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

        <section id="matches" className="space-y-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-slate-900">Matches</h2>
            <p className="text-base text-slate-600">
              Recent fixtures with scores and kickoff times pulled from the `matches` table.
            </p>
          </div>
          {loading && safeMatches.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Loading matches...
            </div>
          ) : safeMatches.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              No matches recorded yet.
            </div>
          ) : (
            <div className="space-y-4">
              {safeMatches.map((match) => (
                <article
                  key={match.id}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {match.event?.name || "Match"}
                      </p>
                      <h3 className="text-xl font-semibold text-slate-900">
                        {formatMatchup(match)}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {formatMatchTime(match.start_time)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-semibold text-slate-900">
                        {match.score_a} <span className="text-slate-400">-</span> {match.score_b}
                      </p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {match.status || "scheduled"}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
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
                <article
                  key={team.id}
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <h3 className="text-xl font-semibold text-slate-900">{team.name}</h3>
                  {team.short_name && (
                    <p className="mt-2 text-sm text-slate-500">Short name: {team.short_name}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

      </div>

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

function toSettled(promise) {
  return promise
    .then((value) => ({ status: "fulfilled", value }))
    .catch((reason) => ({ status: "rejected", reason }));
}

function formatMatchTime(timestamp) {
  if (!timestamp) return "Start time pending";
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatMatchup(match) {
  const teamA = match.team_a?.name || "Team A";
  const teamB = match.team_b?.name || "Team B";
  return `${teamA} vs ${teamB}`;
}
