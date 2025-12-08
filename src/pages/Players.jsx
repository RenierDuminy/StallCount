import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllPlayers } from "../services/playerService";

const GENDER_BADGES = {
  M: "Men's",
  W: "Women's",
};

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadPlayers() {
      try {
        setLoading(true);
        const data = await getAllPlayers();
        if (!ignore) {
          setPlayers(data);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Unable to load players");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadPlayers();
    return () => {
      ignore = true;
    };
  }, []);

  const groupedPlayers = useMemo(() => {
    const map = new Map();
    const lowered = query.trim().toLowerCase();

    players.forEach((player) => {
      if (
        lowered &&
        !`${player.name ?? ""}`.toLowerCase().includes(lowered) &&
        !`${player.team_name ?? ""}`.toLowerCase().includes(lowered)
      ) {
        return;
      }

      const teamKey = player.team_name || "Unassigned";
      if (!map.has(teamKey)) {
        map.set(teamKey, []);
      }
      map.get(teamKey).push(player);
    });

    return Array.from(map.entries()).sort(([teamA], [teamB]) =>
      teamA.localeCompare(teamB)
    );
  }, [players, query]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex w-full flex-col gap-3 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Roster intelligence
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">Player roster</h1>
            <p className="mt-2 text-sm text-slate-600">
              Audit-ready player data synced from Supabase. Search by athlete or team, validate jersey assignments, and
              keep broadcast notes accurate.
            </p>
          </div>
          <Link
            to="/teams"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            View teams
          </Link>
        </div>
      </header>

      <main className="w-full px-6 py-10">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <label className="flex w-full max-w-sm items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600 focus-within:border-brand focus-within:bg-white focus-within:ring-2 focus-within:ring-brand/20">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Search
              </span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Player or team name"
                className="w-full bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </label>
            <p className="text-sm text-slate-500">
              {loading ? "Refreshing roster..." : `${players.length} active profiles`}
            </p>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="mt-6 space-y-6">
            {loading && players.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                Retrieving player data...
              </div>
            ) : groupedPlayers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                No roster entries match this filter.
              </div>
            ) : (
              groupedPlayers.map(([teamName, roster]) => (
                <article
                  key={teamName}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-inner"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">
                        {teamName}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {roster.length} player{roster.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-100/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Number</th>
                          <th className="px-4 py-3">Player</th>
                          <th className="px-4 py-3">Gender</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {roster.map((player) => (
                          <tr key={player.id}>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {player.jersey_number ?? "--"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">
                                {player.name || "Unnamed player"}
                              </div>
                              {player.team_name && (
                                <p className="text-xs text-slate-500">{player.team_name}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {player.gender_code ? (
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                                  {GENDER_BADGES[player.gender_code] || player.gender_code}
                                </span>
                              ) : (
                                <span className="text-slate-400">--</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
