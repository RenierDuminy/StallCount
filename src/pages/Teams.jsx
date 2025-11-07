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
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              League overview
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">
              Registered teams
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Live data from the Supabase `teams` table. Use this view to scout
              rosters or verify entries before publishing matchups.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Teams list</h2>
              <p className="text-sm text-slate-500">
                {loading
                  ? "Loading..."
                  : `${filteredTeams.length} of ${teams.length} teams shown`}
              </p>
            </div>
            <label className="flex w-full max-w-xs items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 focus-within:border-brand focus-within:bg-white focus-within:ring-2 focus-within:ring-brand/20">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Search
              </span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Team name or short code"
                className="w-full bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none"
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
                  className="animate-pulse rounded-2xl border border-slate-100 bg-slate-50 p-5"
                >
                  <div className="h-4 w-1/2 rounded-full bg-slate-200" />
                  <div className="mt-2 h-3 w-1/3 rounded-full bg-slate-200" />
                </div>
              ))
            ) : filteredTeams.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                No teams match your search.
              </div>
            ) : (
              filteredTeams.map((team) => (
                <article
                  key={team.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Team ID
                  </p>
                  <p className="truncate text-xs font-mono text-slate-500">
                    {team.id}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold text-slate-900">
                    {team.name}
                  </h3>
                  {team.short_name && (
                    <p className="text-sm text-slate-500">
                      Short name: {team.short_name}
                    </p>
                  )}
                  {team.created_at && (
                    <p className="mt-4 text-xs text-slate-400">
                      Added {new Date(team.created_at).toLocaleDateString()}
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
