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
    <div className="sc-shell space-y-8">
      <header className="sc-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
              League overview
            </p>
            <h1 className="text-3xl font-semibold text-[var(--sc-ink)]">Registered teams</h1>
            <p className="mt-2 text-sm text-[var(--sc-ink-muted)]">
              Live data from the Supabase `teams` table. Use this view to scout rosters or verify entries before
              publishing matchups.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full border border-[var(--sc-border)] px-4 py-2 text-sm font-semibold text-[var(--sc-accent)] transition hover:border-[var(--sc-accent)] hover:bg-[#fff0f5]"
          >
            Back to site
          </Link>
        </div>
      </header>

      <main className="sc-card">
        <section>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--sc-ink)]">Teams list</h2>
              <p className="text-sm text-[var(--sc-ink-muted)]">
                {loading ? "Loading..." : `${filteredTeams.length} of ${teams.length} teams shown`}
              </p>
            </div>
            <label className="flex w-full max-w-xs items-center gap-2 rounded-full border border-[var(--sc-border)] bg-[var(--sc-surface-muted)] px-3 py-2 text-sm text-[var(--sc-ink-muted)] focus-within:border-[var(--sc-accent)] focus-within:bg-white focus-within:ring-2 focus-within:ring-[var(--sc-accent)]/20">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                Search
              </span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Team name or short code"
                className="w-full bg-transparent text-[var(--sc-ink)] placeholder:text-[var(--sc-ink-muted)] focus:outline-none"
              />
            </label>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading && teams.length === 0 ? (
              Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse rounded-2xl border border-[var(--sc-border-strong)] bg-[var(--sc-surface-muted)] p-5"
                >
                  <div className="h-4 w-1/2 rounded-full bg-white/40" />
                  <div className="mt-2 h-3 w-1/3 rounded-full bg-white/30" />
                </div>
              ))
            ) : filteredTeams.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-[var(--sc-border)] bg-[var(--sc-surface-muted)] px-6 py-10 text-center text-sm text-[var(--sc-ink-muted)]">
                No teams match your search.
              </div>
            ) : (
              filteredTeams.map((team) => (
                <Link
                  key={team.id}
                  to={`/teams/${team.id}`}
                  className="group rounded-2xl border border-[var(--sc-border)] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--sc-accent)]/60 hover:shadow-lg"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                    Team
                  </p>
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
