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
    <div className="bg-[#f3f7f4] pb-16 text-[var(--sc-ink)]">
      <header className="border-b border-emerald-900/10 bg-[#072013] py-6 text-emerald-50">
        <div className="sc-shell space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Home</p>
            <h1 className="text-3xl font-semibold">League command center</h1>
            <p className="mt-1.5 max-w-3xl text-sm text-emerald-100">
              Follow matches, manage rosters, and keep every Supabase table in sync with the public hub.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr] lg:items-stretch">
            <div className="space-y-6 rounded-[32px] border border-white/10 bg-gradient-to-br from-[#0a3b24] via-[#0f5132] to-[#052b1d] p-8 text-white shadow-[0_35px_80px_rgba(5,32,19,0.5)]">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-rose-100">
                <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden="true" />
                Live league data
              </span>
              <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Bring every Stall Count update into one beautiful hub
              </h2>
              <p className="text-base leading-relaxed text-white/85">
                Every section on this page reflects the Supabase tables powering the experience.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/teams"
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--sc-accent)] shadow-lg transition hover:-translate-y-0.5 hover:bg-emerald-50"
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
            <div id="stats" className="sc-card space-y-6 bg-white/95 text-[var(--sc-ink)] shadow-2xl backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-accent)]">
                    League snapshot
                  </p>
                  <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">Realtime status</h2>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--sc-border)] px-3 py-1 text-xs font-semibold text-[var(--sc-accent)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                  Synced
                </span>
              </div>
              {error && (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Registered teams", value: stats.teams },
                  { label: "Rostered players", value: stats.players },
                  { label: "Tracked events", value: stats.events },
                ].map((item) => (
                  <article
                    key={item.label}
                    className="rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-surface)] p-1 text-center shadow-sm"
                  >
                    <p className="text-xs font-semibold uppercase text-[var(--sc-accent)]">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--sc-ink)]">
                      {loading ? "..." : item.value}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="sc-shell space-y-6 py-6">


        <section id="events" className="sc-card space-y-5">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">Events timeline</h2>
            <p className="text-sm text-[var(--sc-ink-muted)] sm:text-base">
              Shows the most recent entries from the `events` table with dates and locations.
            </p>
          </div>
          {loading && safeEvents.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--sc-border)] bg-[var(--sc-surface)] px-5 py-8 text-center text-sm text-[var(--sc-ink-muted)]">
              Loading events...
            </div>
          ) : safeEvents.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--sc-border)] bg-[var(--sc-surface)] px-5 py-8 text-center text-sm text-[var(--sc-ink-muted)]">
              No events recorded yet.
            </div>
          ) : (
            <div className="relative border-l-2 border-dashed border-[var(--sc-border)] pl-6">
              {safeEvents.map((event) => (
                <article
                  key={event.id}
                  className="relative mb-6 rounded-3xl border border-[var(--sc-border)] bg-white p-5 text-[var(--sc-ink)] shadow-sm last:mb-0"
                >
                  <span className="absolute -left-8 top-5 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-[var(--sc-accent)]" aria-hidden="true" />
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-accent)]">
                        {event.type}
                      </p>
                      <h3 className="text-xl font-semibold text-[var(--sc-ink)]">{event.name}</h3>
                    </div>
                    <p className="text-sm text-[var(--sc-ink-muted)]">
                      {formatDateRange(event.start_date, event.end_date)}
                    </p>
                  </div>
                  {event.location && (
                    <p className="mt-1 text-sm text-[var(--sc-ink-muted)]">Location: {event.location}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="divisions" className="sc-card space-y-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">Active divisions</h2>
            </div>
            <Link
              to="/admin"
              className="inline-flex items-center justify-center rounded-full border border-[var(--sc-border)] px-5 py-2 text-sm font-semibold text-[var(--sc-accent)] transition hover:border-[var(--sc-accent)] hover:bg-[var(--sc-surface)]"
            >
              Manage in dashboard
            </Link>
          </div>
          {loading && safeDivisions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--sc-border)] bg-[var(--sc-surface)] px-5 py-8 text-center text-sm text-[var(--sc-ink-muted)]">
              Loading divisions...
            </div>
          ) : safeDivisions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--sc-border)] bg-[var(--sc-surface)] px-5 py-8 text-center text-sm text-[var(--sc-ink-muted)]">
              No divisions configured. Create them in Supabase to see them here.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {safeDivisions.map((division) => (
                <article
                  key={division.id}
                  className="rounded-3xl border border-[var(--sc-border)] bg-white p-4 text-[var(--sc-ink)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <h3 className="text-lg font-semibold text-[var(--sc-ink)]">{division.name}</h3>
                  <p className="text-sm text-[var(--sc-ink-muted)]">
                    Level: {division.level ? division.level : "Not specified"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="matches" className="sc-card space-y-5">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">Matches</h2>
          </div>
          {loading && safeMatches.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--sc-border)] bg-[var(--sc-surface)] px-5 py-8 text-center text-sm text-[var(--sc-ink-muted)]">
              Loading matches...
            </div>
          ) : safeMatches.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--sc-border)] bg-[var(--sc-surface)] px-5 py-8 text-center text-sm text-[var(--sc-ink-muted)]">
              No matches recorded yet.
            </div>
          ) : (
            <div className="space-y-4">
              {safeMatches.map((match) => (
                <article
                  key={match.id}
                  className="rounded-3xl border border-[var(--sc-border)] bg-[var(--sc-surface)] p-5 text-[var(--sc-ink)] shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-accent)]">
                        {match.event?.name || "Match"}
                      </p>
                      <h3 className="text-xl font-semibold text-[var(--sc-ink)]">
                        {formatMatchup(match)}
                      </h3>
                      <p className="text-xs text-[var(--sc-ink-muted)]">
                        {formatMatchTime(match.start_time)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-semibold text-[var(--sc-accent)]">
                        {match.score_a} <span className="text-[var(--sc-border)]">-</span> {match.score_b}
                      </p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-accent)]">
                        {match.status || "scheduled"}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="teams" className="sc-card space-y-5">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">Teams spotlight</h2>
            <p className="text-sm text-[var(--sc-ink-muted)] sm:text-base">
              Pulled directly from the `teams` table. Add a record in Supabase and it appears here immediately.
            </p>
          </div>
          {loading && featuredTeams.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--sc-border)] bg-[var(--sc-surface)] px-5 py-8 text-center text-sm text-[var(--sc-ink-muted)]">
              Loading teams...
            </div>
          ) : featuredTeams.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--sc-border)] bg-[var(--sc-surface)] px-5 py-8 text-center text-sm text-[var(--sc-ink-muted)]">
              No teams found. Add entries to the Supabase `teams` table to populate this view.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredTeams.map((team) => (
                <Link
                  key={team.id}
                  to={`/teams/${team.id}`}
                  className="group rounded-3xl border border-[var(--sc-border)] bg-white p-4 text-[var(--sc-ink)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--sc-accent)] hover:shadow-lg"
                >
                  <h3 className="text-xl font-semibold text-[var(--sc-ink)] group-hover:text-[var(--sc-accent)]">
                    {team.name}
                  </h3>
                  {team.short_name && (
                    <p className="mt-2 text-sm text-[var(--sc-ink-muted)]">Short name: {team.short_name}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-emerald-900/10 bg-[#072013]">
        <div className="sc-shell flex flex-col gap-3 py-6 text-sm text-rose-100 md:flex-row md:items-center md:justify-between">
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
          <p className="sc-shell pb-4 text-xs text-rose-300">{signOutError}</p>
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
