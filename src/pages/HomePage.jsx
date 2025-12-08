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
          toSettled(getTableCount("player")),
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
          setError(`Unable to load ${failures.join(", ")}. Please refresh and try again.`);
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
  const nextStreamedMatch = safeMatches.find((match) => matchHasStream(match)) || null;

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
    <div className="pb-20 text-[var(--sc-ink)]">
      <header className="sc-shell space-y-8 py-8">
        <div className="sc-card-base sc-hero p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="sc-chip">Home</span>
              <span className="sc-pill-ghost text-xs uppercase tracking-wide text-[var(--sc-ink-muted)]">
                Live league view
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
              <span className="sc-tag">Realtime</span>
              <span className="sc-chip">Sync on</span>
            </div>
          </div>

          <div className="mt-7 grid gap-8 lg:grid-cols-[1.05fr,0.95fr] lg:items-center">
            <div className="space-y-6">
              <div className="space-y-4">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--sc-ink-muted)]">
                  StallCount Insight Hub
                </p>
                <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
                  Delivering{" "}
                  <span className="text-[var(--sc-accent)]">clarity</span> for every competition touchpoint
                </h1>
                <p className="max-w-2xl text-base text-[var(--sc-ink-muted)]">
                  Keep tournaments, clubs, and broadcast partners aligned with live scoring, curated player data, and
                  division intelligence built for modern event directors.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link to="/teams" className="sc-button">
                  Browse teams
                </Link>
                <Link to="/players" className="sc-button is-ghost">
                  Player list
                </Link>
              </div>
              <div className="flex flex-wrap gap-3">
                {[
                  { label: "Registered teams", value: stats.teams },
                  { label: "Rostered players", value: stats.players },
                  { label: "Tracked events", value: stats.events },
                ].map((item) => (
                  <div key={item.label} className="sc-metric">
                    <strong>{loading ? "..." : item.value}</strong>
                    <span className="text-sm text-[var(--sc-ink-muted)]">{item.label}</span>
                  </div>
                ))}
              </div>
              {error && (
                <p className="rounded-xl border border-rose-400/40 bg-rose-950/50 p-4 text-sm font-semibold text-rose-100">
                  {error}
                </p>
              )}
            </div>

            <div className="grid gap-4">
              <div className="sc-card-muted sc-frosted p-5">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                  <span>Next match</span>
                  <span className="sc-chip">Live data</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-[var(--sc-ink)]">
                  {nextMatch ? formatMatchup(nextMatch) : "Awaiting schedule"}
                </p>
                <p className="text-sm text-[var(--sc-ink-muted)]">
                  {nextMatch ? formatMatchTime(nextMatch.start_time) : "Add matches to see them highlighted here."}
                </p>
              </div>
              <div className="sc-card-muted sc-frosted p-5">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                  <span>Next streamed match</span>
                  <span className="sc-chip">{nextStreamedMatch ? "Stream ready" : "No media"}</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-[var(--sc-ink)]">
                  {nextStreamedMatch ? formatMatchup(nextStreamedMatch) : "Stream schedule pending"}
                </p>
                <p className="text-sm text-[var(--sc-ink-muted)]">
                  {nextStreamedMatch
                    ? formatMatchTime(nextStreamedMatch.start_time)
                    : "Attach media links to upcoming matches to see them here."}
                </p>
                {nextStreamedMatch && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                    Provider:{" "}
                    <span className="text-[var(--sc-ink)]">
                      {formatMediaProvider(nextStreamedMatch.media_provider)}
                    </span>{" "}
                    <span className="ml-2 text-[var(--sc-ink-muted)]">
                      Status: {nextStreamedMatch.media_status || nextStreamedMatch.status || "pending"}
                    </span>
                  </p>
                )}
              </div>
              <div className="sc-card-muted sc-frosted p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">Spotlight event</p>
                <p className="mt-2 text-lg font-semibold text-[var(--sc-ink)]">
                  {highlightedEvent ? highlightedEvent.name : "Nothing scheduled yet"}
                </p>
                <p className="text-sm text-[var(--sc-ink-muted)]">
                  {highlightedEvent
                    ? formatDateRange(highlightedEvent.start_date, highlightedEvent.end_date)
                    : "Create events to highlight seasons, tournaments, or showcases."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="space-y-12">
        <section className="sc-shell grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          <div id="events" className="sc-card-base space-y-4 p-5 sm:p-6 lg:p-7">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="sc-chip">Events</p>
                <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">Timeline</h2>
                <p className="text-sm text-[var(--sc-ink-muted)]">Key milestones, launch dates, and venues at a glance.</p>
              </div>
            </div>
            {loading && safeEvents.length === 0 ? (
              <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">Loading events...</div>
            ) : safeEvents.length === 0 ? (
              <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">
                No events recorded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {safeEvents.map((event) => (
                  <article key={event.id} className="sc-card-muted p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                          {event.type}
                        </p>
                        <h3 className="text-lg font-semibold text-[var(--sc-ink)]">{event.name}</h3>
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
          </div>

          <div className="space-y-6">
            <section id="matches" className="sc-card-base space-y-4 p-5 sm:p-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="sc-chip">Matches</p>
                  <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">Latest match reports</h2>
                </div>
              </div>
              {loading && safeMatches.length === 0 ? (
                <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">Loading matches...</div>
              ) : safeMatches.length === 0 ? (
                <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">
                  No matches recorded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {safeMatches.slice(0, 4).map((match) => (
                    <Link
                      key={match.id}
                      to={`/matches?matchId=${match.id}`}
                      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-accent)]/70"
                    >
                      <article className="rounded-2xl border border-[var(--sc-border)]/80 bg-[rgba(10,29,24,0.85)] p-4 shadow-lg transition hover:-translate-y-0.5 hover:shadow-strong hover:border-[var(--sc-border-glow)]/60">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                              {match.event?.name || "Match"}
                            </p>
                            <h3 className="text-xl font-semibold text-[var(--sc-ink)]">{formatMatchup(match)}</h3>
                            <p className="text-xs text-[var(--sc-ink-muted)]">{formatMatchTime(match.start_time)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-3xl font-semibold text-[var(--sc-accent)]">
                              {match.score_a} <span className="text-[var(--sc-border)]">-</span> {match.score_b}
                            </p>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                              {match.status || "scheduled"}
                            </p>
                          </div>
                        </div>
                      </article>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>

        <section className="sc-shell grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          <div id="divisions" className="sc-card-base space-y-4 p-5 sm:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="sc-chip">Divisions</p>
                <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">Active divisions</h2>
              </div>
              <Link to="/admin" className="sc-button is-ghost">
                Manage in dashboard
              </Link>
            </div>
            {loading && safeDivisions.length === 0 ? (
              <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">Loading divisions...</div>
            ) : safeDivisions.length === 0 ? (
              <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">
                No divisions yet. Add one in the dashboard to see it here.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {safeDivisions.map((division) => (
                  <article key={division.id} className="sc-card-muted p-4 transition hover:-translate-y-0.5">
                    <h3 className="text-lg font-semibold text-[var(--sc-ink)]">{division.name}</h3>
                    <p className="text-sm text-[var(--sc-ink-muted)]">
                      Level: {division.level ? division.level : "Not specified"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div
            id="teams"
            className="sc-card-base space-y-4 border border-[var(--sc-border-strong)]/70 bg-[radial-gradient(circle_at_12%_20%,rgba(99,255,160,0.12),transparent_50%),radial-gradient(circle_at_82%_0%,rgba(103,233,193,0.18),transparent_40%),linear-gradient(150deg,rgba(12,33,27,0.9),rgba(6,22,18,0.95))] p-5 sm:p-6 lg:p-7"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="sc-chip">Teams</p>
                <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">Teams spotlight</h2>
                <p className="text-sm text-[var(--sc-ink-muted)] sm:text-base">
                  Handpicked programs showcasing league talent and operational excellence.
                </p>
              </div>
              <Link to="/teams" className="sc-button">
                View all
              </Link>
            </div>
            {loading && featuredTeams.length === 0 ? (
              <div className="rounded-2xl border border-[var(--sc-border)] bg-[rgba(6,22,18,0.7)] p-5 text-center text-sm text-[var(--sc-ink-muted)]">
                Loading teams...
              </div>
            ) : featuredTeams.length === 0 ? (
              <div className="rounded-2xl border border-[var(--sc-border)] bg-[rgba(6,22,18,0.7)] p-5 text-center text-sm text-[var(--sc-ink-muted)]">
                No teams found. Add a team to start the list.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {featuredTeams.slice(0, 4).map((team) => (
                  <Link
                    key={team.id}
                    to={`/teams/${team.id}`}
                    className="rounded-2xl border border-[var(--sc-border)]/80 bg-[rgba(10,29,24,0.85)] p-4 shadow-lg transition hover:-translate-y-0.5 hover:shadow-strong hover:border-[var(--sc-border-glow)]/60"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[var(--sc-accent)] shadow-[0_0_0_6px_rgba(198,255,98,0.12)]" />
                      <h3 className="text-xl font-semibold text-[var(--sc-ink)]">{team.name}</h3>
                    </div>
                    {team.short_name && (
                      <p className="mt-2 text-sm text-[var(--sc-ink-muted)]">Short name: {team.short_name}</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="sc-shell mt-10">
        <div className="sc-card-muted flex flex-col gap-3 p-4 text-sm md:flex-row md:items-center md:justify-between">
          <p className="font-semibold text-[var(--sc-ink)]">
            &copy; {new Date().getFullYear()} StallCount. Trusted competition intelligence.
          </p>
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <a href="#events" className="font-semibold text-[var(--sc-accent)]">
              Overview
            </a>
            <Link to="/teams" className="font-semibold text-[var(--sc-accent)]">
              Teams
            </Link>
            <Link to="/players" className="font-semibold text-[var(--sc-accent)]">
              Players
            </Link>
            {session && (
              <button type="button" onClick={handleLogout} disabled={signingOut} className="sc-button is-ghost">
                {signingOut ? "Signing out..." : "Log out"}
              </button>
            )}
          </div>
        </div>
        {signOutError && <p className="sc-shell pb-2 text-xs text-rose-300">{signOutError}</p>}
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

function matchHasStream(match) {
  if (!match) return false;
  if (typeof match.media_url === "string" && match.media_url.trim()) return true;
  if (match.has_media) return true;
  const primaryUrl = match.media_link?.primary?.url;
  return typeof primaryUrl === "string" && primaryUrl.trim().length > 0;
}

function formatMediaProvider(provider) {
  const normalized = typeof provider === "string" ? provider.replace(/_/g, " ").trim() : "";
  if (!normalized) return "Custom";
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
