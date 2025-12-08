import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllTeams } from "../services/teamService";

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadTeams() {
      try {
        setLoading(true);
        const data = await getAllTeams();
        if (!ignore) {
          setTeams(data);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Unable to load teams");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadTeams();
    return () => {
      ignore = true;
    };
  }, []);

  const filteredTeams = useMemo(() => {
    if (!query.trim()) {
      return teams;
    }
    const q = query.toLowerCase();
    return teams.filter((team) => {
      return (
        team.name?.toLowerCase().includes(q) ||
        team.short_name?.toLowerCase().includes(q)
      );
    });
  }, [teams, query]);

  return (
    <div className="pb-16 text-[var(--sc-ink)]">
      <header className="sc-shell py-6">
        <div className="sc-card-base space-y-3 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sc-chip">Teams</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
              Operations directory
            </span>
          </div>
          <h1 className="text-3xl font-semibold text-[var(--sc-ink)]">Registered teams</h1>
          <p className="text-sm text-[var(--sc-ink-muted)]">
            Review participating clubs, confirm short codes, and launch into individual team workspaces without leaving
            the control room.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/" className="sc-button is-ghost">
              Back to home
            </Link>
            <Link to="/matches" className="sc-button">
              View matches
            </Link>
          </div>
        </div>
      </header>

      <main className="sc-shell space-y-4 sm:space-y-6">
        <section className="sc-card-base p-6 space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="sc-chip">Teams list</p>
              <p className="text-sm text-[var(--sc-ink-muted)]">
                {loading ? "Refreshing enrollment..." : `${filteredTeams.length} of ${teams.length} clubs visible`}
              </p>
            </div>
            <label className="sc-card-muted flex w-full max-w-xs items-center gap-2 p-2 text-sm text-[var(--sc-ink-muted)]">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                Search
              </span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by team or short code"
                className="w-full bg-transparent text-[var(--sc-ink)] placeholder:text-[var(--sc-ink-muted)] outline-none"
              />
            </label>
          </div>

          {error && (
            <div className="sc-card-muted border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading && teams.length === 0 ? (
              Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="sc-card-muted animate-pulse p-5">
                  <div className="h-4 w-1/2 rounded-full bg-white/60" />
                  <div className="mt-2 h-3 w-1/3 rounded-full bg-white/50" />
                </div>
              ))
            ) : filteredTeams.length === 0 ? (
              <div className="col-span-full sc-card-muted p-6 text-center text-sm text-[var(--sc-ink-muted)]">
                No teams match your search.
              </div>
            ) : (
              filteredTeams.map((team) => (
                <Link
                  key={team.id}
                  to={`/teams/${team.id}`}
                  className="rounded-2xl border border-[var(--sc-border)]/80 bg-[rgba(10,29,24,0.85)] p-4 shadow-lg transition hover:-translate-y-0.5 hover:shadow-strong hover:border-[var(--sc-border-glow)]/60"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">Team</p>
                  <h3 className="mt-3 text-xl font-semibold text-[var(--sc-ink)] group-hover:text-[var(--sc-accent)]">
                    {team.name}
                  </h3>
                  {team.short_name && (
                    <p className="text-sm text-[var(--sc-ink-muted)]">Short name: {team.short_name}</p>
                  )}
                </Link>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
