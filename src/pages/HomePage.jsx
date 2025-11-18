import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllTeams } from "../services/teamService";
import { getDivisions, getRecentEvents } from "../services/leagueService";
import { getTableCount } from "../services/statsService";
import { getRecentMatches } from "../services/matchService";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../services/supabaseClient";

export default function HomePage() {
  const [featuredTeams, setFeaturedTeams] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [events, setEvents] = useState([]);
  const [matches, setMatches] = useState([]);
  const [stats, setStats] = useState({ teams: 0, players: 0, events: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(null);
  const { session } = useAuth();

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all([
          toSettled(getAllTeams()),
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
            `Unable to load ${failures.join(", ")}. Check Supabase policies or network access and try again.`
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
  const nextMatch = safeMatches[0] || null;
  const highlightedEvent = safeEvents[0] || null;

  async function handleLogout() {
    setSignOutError(null);
    setSigningOut(true);
    try {
      const { error: signOutErr } = await supabase.auth.signOut();
      if (signOutErr) {
        throw signOutErr;
      }
    } catch (err) {
      setSignOutError(err?.message || "Unable to log out right now.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#01150c] via-[#033b21] to-[#e6f9ed] text-[#052b1d]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(circle_at_top,_rgba(253,241,244,0.45),transparent_70%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,_rgba(109,16,48,0.25),transparent_55%)]"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-16 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <section className="grid gap-10 lg:grid-cols-[1.1fr,0.9fr] lg:items-stretch">
          <div className="space-y-8 rounded-[36px] border border-white/20 bg-gradient-to-br from-[#0a3b24] via-[#0f5132] to-[#052b1d] p-10 text-white shadow-[0_40px_120px_rgba(4,20,12,0.6)]">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-rose-100">
              <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden="true" />
              Live league data
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
              Bring every Stall Count update into one beautiful hub
            </h1>
            <p className="text-lg leading-relaxed text-white/85">
              Follow matches, manage rosters, and share scores instantly. Every section on this page reflects the Supabase tables powering the experience.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/teams"
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#0f5132] shadow-lg transition hover:-translate-y-0.5 hover:bg-emerald-50"
              >
                Teams database
              </Link>
              <Link
                to="/players"
                className="inline-flex items-center justify-center rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Team rosters
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 shadow-inner">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                  Next match
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {nextMatch ? formatMatchup(nextMatch) : "Awaiting schedule"}
                </p>
                <p className="text-sm text-white/70">
                  {nextMatch
                    ? formatMatchTime(nextMatch.start_time)
                    : "Add matches in Supabase to populate this card."}
                </p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/5 p-4 shadow-inner">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                  Spotlight event
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {highlightedEvent ? highlightedEvent.name : "Nothing scheduled yet"}
                </p>
                <p className="text-sm text-white/70">
                  {highlightedEvent
                    ? formatDateRange(highlightedEvent.start_date, highlightedEvent.end_date)
                    : "Create events to highlight seasons, tournaments, or showcases."}
                </p>
              </div>
            </div>
          </div>
          <div
            className="rounded-[36px] border border-[#9ae6b4] bg-white/95 p-6 text-[#052b1d] shadow-2xl backdrop-blur"
            id="stats"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1b7b4b]">
                League snapshot
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#c6f6d5] px-3 py-1 text-xs font-semibold text-[#0f5132]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                Realtime
              </span>
            </div>
            {error && (
              <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                { label: "Registered teams", value: stats.teams },
                { label: "Rostered players", value: stats.players },
                { label: "Tracked events", value: stats.events },
              ].map((item) => (
                <article
                  key={item.label}
                  className="rounded-2xl border border-[#c6f6d5] bg-[#f0fff4] p-4 text-center shadow-sm"
                >
                  <p className="text-xs font-semibold uppercase text-[#1b7b4b]">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#052b1d]">
                    {loading ? "�" : item.value}
                  </p>
                </article>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-[#c6f6d5] bg-[#f0fff4] p-4 text-sm text-[#0f5132]">
              Live counts reflect whatever is currently stored in Supabase. Add or edit rows and this dashboard updates automatically.
            </div>
          </div>
        </section>

        <section
          id="events"
          className="space-y-6 rounded-[32px] border border-[#9ae6b4] bg-white/90 p-8 text-[#052b1d] shadow-xl"
        >
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-[#052b1d]">Events timeline</h2>
            <p className="text-base text-[#1d5a3b]">
              Shows the most recent entries from the `events` table with dates and locations.
            </p>
          </div>
          {loading && safeEvents.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#c6f6d5] bg-[#f0fff4] px-6 py-10 text-center text-sm text-[#1d5a3b]">
              Loading events...
            </div>
          ) : safeEvents.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#c6f6d5] bg-[#f0fff4] px-6 py-10 text-center text-sm text-[#1d5a3b]">
              No events recorded yet.
            </div>
          ) : (
            <div className="relative border-l-2 border-dashed border-[#9ae6b4] pl-6">
              {safeEvents.map((event) => (
                <article
                  key={event.id}
                  className="relative mb-6 rounded-3xl border border-[#c6f6d5] bg-white p-5 shadow-sm last:mb-0"
                >
                  <span className="absolute -left-8 top-5 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-[#1c8f5a]" aria-hidden="true" />
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#1b7b4b]">
                        {event.type}
                      </p>
                      <h3 className="text-xl font-semibold text-[#052b1d]">{event.name}</h3>
                    </div>
                    <p className="text-sm text-[#1d5a3b]">
                      {formatDateRange(event.start_date, event.end_date)}
                    </p>
                  </div>
                  {event.location && (
                    <p className="mt-1 text-sm text-[#1d5a3b]">Location: {event.location}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section
          id="divisions"
          className="space-y-6 rounded-[32px] border border-[#9ae6b4] bg-white/90 p-8 text-[#052b1d] shadow-xl"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-[#052b1d]">Active divisions</h2>
              <p className="text-base text-[#1d5a3b]">
                Records from the `divisions` table capture how squads are grouped for play.
              </p>
            </div>
            <Link
              to="/admin"
              className="inline-flex items-center justify-center rounded-full border border-[#9ae6b4] px-5 py-2 text-sm font-semibold text-[#0f5132] transition hover:border-[#0f5132] hover:bg-[#e6fffa]"
            >
              Manage in dashboard
            </Link>
          </div>
          {loading && safeDivisions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#c6f6d5] bg-[#f0fff4] px-6 py-10 text-center text-sm text-[#1d5a3b]">
              Loading divisions...
            </div>
          ) : safeDivisions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#c6f6d5] bg-[#f0fff4] px-6 py-10 text-center text-sm text-[#1d5a3b]">
              No divisions configured. Create them in Supabase to see them here.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {safeDivisions.map((division) => (
                <article
                  key={division.id}
                  className="rounded-3xl border border-[#c6f6d5] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <h3 className="text-lg font-semibold text-[#052b1d]">{division.name}</h3>
                  <p className="text-sm text-[#1d5a3b]">
                    Level: {division.level ? division.level : "Not specified"}
                  </p>
                  <p className="mt-3 text-xs text-[#1b7b4b]">
                    Created {new Date(division.created_at).toLocaleDateString()}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section
          id="matches"
          className="space-y-6 rounded-[32px] border border-[#9ae6b4] bg-white/90 p-8 text-[#052b1d] shadow-xl"
        >
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-[#052b1d]">Matches</h2>
            <p className="text-base text-[#1d5a3b]">
              Recent fixtures with scores and kickoff times pulled from the `matches` table.
            </p>
          </div>
          {loading && safeMatches.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#c6f6d5] bg-[#f0fff4] px-6 py-10 text-center text-sm text-[#1d5a3b]">
              Loading matches...
            </div>
          ) : safeMatches.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#c6f6d5] bg-[#f0fff4] px-6 py-10 text-center text-sm text-[#1d5a3b]">
              No matches recorded yet.
            </div>
          ) : (
            <div className="space-y-4">
              {safeMatches.map((match) => (
                <article
                  key={match.id}
                  className="rounded-3xl border border-[#c6f6d5] bg-[#f0fff4] p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#1b7b4b]">
                        {match.event?.name || "Match"}
                      </p>
                      <h3 className="text-xl font-semibold text-[#052b1d]">
                        {formatMatchup(match)}
                      </h3>
                      <p className="text-xs text-[#1d5a3b]">
                        {formatMatchTime(match.start_time)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-semibold text-[#0f5132]">
                        {match.score_a} <span className="text-[#8fb8ab]">-</span> {match.score_b}
                      </p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#1b7b4b]">
                        {match.status || "scheduled"}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section
          id="teams"
          className="space-y-6 rounded-[32px] border border-[#9ae6b4] bg-white/90 p-8 text-[#052b1d] shadow-xl"
        >
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-[#052b1d]">Teams spotlight</h2>
            <p className="text-base text-[#1d5a3b]">
              Pulled directly from the `teams` table. Add a record in Supabase and it appears here immediately.
            </p>
          </div>
          {loading && featuredTeams.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#c6f6d5] bg-[#f0fff4] px-6 py-10 text-center text-sm text-[#1d5a3b]">
              Loading teams...
            </div>
          ) : featuredTeams.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#c6f6d5] bg-[#f0fff4] px-6 py-10 text-center text-sm text-[#1d5a3b]">
              No teams found. Add entries to the Supabase `teams` table to populate this view.
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredTeams.map((team) => (
                <Link
                  key={team.id}
                  to={`/teams/${team.id}`}
                  className="group rounded-3xl border border-[#c6f6d5] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#0f5132]/70 hover:shadow-lg"
                >
                  <h3 className="text-xl font-semibold text-[#052b1d] group-hover:text-[#0f5132]">
                    {team.name}
                  </h3>
                  {team.short_name && (
                    <p className="mt-2 text-sm text-[#1d5a3b]">Short name: {team.short_name}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="border-t border-white/10 bg-[#04140c]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-sm text-rose-100 md:flex-row md:items-center md:justify-between">
          <p>&copy; {new Date().getFullYear()} StallCount. Live Supabase data.</p>
          <div className="flex flex-wrap items-center gap-3 md:gap-5">
            <a href="#stats" className="transition hover:text-white">
              Overview
            </a>
            <Link to="/teams" className="transition hover:text-white">
              Teams
            </Link>
            <Link to="/players" className="transition hover:text-white">
              Players
            </Link>
            {session && (
              <button
                type="button"
                onClick={handleLogout}
                disabled={signingOut}
                className="rounded-full border border-white/20 px-4 py-1 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {signingOut ? "Signing out..." : "Log out"}
              </button>
            )}
          </div>
        </div>
        {signOutError && (
          <p className="mx-auto max-w-7xl px-6 pb-4 text-xs text-rose-300">
            {signOutError}
          </p>
        )}
      </footer>
    </div>
  );
}

function formatDateRange(start, end) {
  if (!start && !end) return "Dates pending";
  const startDate = start ? new Date(start).toLocaleDateString() : "TBD";
  const endDate = end ? new Date(end).toLocaleDateString() : null;
  return endDate && endDate !== startDate ? `${startDate} - ${endDate}` : startDate;
}

function toSettled(promise) {
  return promise
    .then((value) => ({ status: "fulfilled", value }))
    .catch((reason) => ({ status: "rejected", reason }));
}

function formatMatchTime(timestamp) {
  if (!timestamp) return "Start time pending";
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatMatchup(match) {
  const teamA = match.team_a?.name || "Team A";
  const teamB = match.team_b?.name || "Team B";
  return `${teamA} vs ${teamB}`;
}
