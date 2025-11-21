import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllPlayerMatchStats } from "../services/teamService";

export default function PlayersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("total");
  const [sortDirection, setSortDirection] = useState("desc");

  useEffect(() => {
    let ignore = false;
    async function loadStats() {
      setLoading(true);
      setError(null);
      try {
        const data = await getAllPlayerMatchStats();
        if (!ignore) {
          setRows(data || []);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Unable to load player match stats.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    loadStats();
    return () => {
      ignore = true;
    };
  }, []);

  const filters = useMemo(
    () => ({
      search: search.trim().toLowerCase(),
    }),
    [search],
  );

  const aggregatedRows = useMemo(() => {
    const map = new Map();

    rows.forEach((row) => {
      const playerId = row.player?.id;
      if (!playerId) return;

      if (!map.has(playerId)) {
        map.set(playerId, {
          playerId,
          playerName: row.player?.name || "Player",
          jerseyNumber: row.player?.jersey_number ?? null,
          goals: 0,
          assists: 0,
          blocks: 0,
          turnovers: 0,
          games: 0,
          matchIds: new Set(),
          callahans: 0,
        });
      }

      const entry = map.get(playerId);
      entry.goals += row.goals || 0;
      entry.assists += row.assists || 0;
      entry.blocks += row.blocks || 0;
      entry.turnovers += row.turnovers || 0;
      entry.matchIds.add(row.match_id);
    });

    return Array.from(map.values()).map((entry) => {
      const games = entry.matchIds.size || 0;
      const total = entry.goals + entry.assists;
      return {
        ...entry,
        games,
        total,
        totalsPerGame: games ? total / games : 0,
        assistsPerGame: games ? entry.assists / games : 0,
        goalsPerGame: games ? entry.goals / games : 0,
      };
    });
  }, [rows]);

  const filteredAggregated = useMemo(() => {
    return aggregatedRows.filter((row) => {
      const name = row.playerName.toLowerCase();
      const jersey = String(row.jerseyNumber ?? "");

      if (filters.search && !name.includes(filters.search) && !jersey.includes(filters.search)) {
        return false;
      }
      return true;
    });
  }, [aggregatedRows, filters]);

  const sortedRows = useMemo(() => {
    const list = [...filteredAggregated];
    list.sort((a, b) => {
      const getValue = (row, key) => {
        switch (key) {
          case "total":
            return row.total;
          case "assists":
            return row.assists;
          case "goals":
            return row.goals;
          case "games":
            return row.games;
          case "totalsPerGame":
            return row.totalsPerGame;
          case "assistsPerGame":
            return row.assistsPerGame;
          case "goalsPerGame":
            return row.goalsPerGame;
          case "callahans":
            return row.callahans;
          default:
            return 0;
        }
      };

      const aVal = getValue(a, sortBy);
      const bVal = getValue(b, sortBy);

      if (aVal === bVal) {
        if (a.total === b.total && a.goals === b.goals) {
          return a.playerName.localeCompare(b.playerName);
        }
        if (a.total !== b.total) {
          return b.total - a.total;
        }
        return b.goals - a.goals;
      }

      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [filteredAggregated, sortBy, sortDirection]);

  const toggleSort = (column) => {
    setSortBy((current) => {
      if (current !== column) {
        setSortDirection("desc");
        return column;
      }
      setSortDirection((dir) => (dir === "desc" ? "asc" : "desc"));
      return column;
    });
  };

  const statHeaders = [
    { key: "total", label: "Total" },
    { key: "assists", label: "Assists" },
    { key: "goals", label: "Goals" },
    { key: "games", label: "Games" },
    { key: "totalsPerGame", label: "Tot/Gm" },
    { key: "assistsPerGame", label: "Ast/Gm" },
    { key: "goalsPerGame", label: "Gls/Gm" },
    { key: "callahans", label: "Callahans" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="border-b border-slate-200 bg-white py-3 text-slate-800 sm:py-5">
        <div className="sc-shell matches-compact-shell">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Players</p>
          <p className="mt-1 max-w-4xl text-lg font-semibold text-slate-900 sm:mt-1.5">
            Contributions by player across all recorded matches
          </p>
          <p className="text-sm text-slate-600">Click any player to view their per-match breakdown.</p>
        </div>
      </header>

      <main className="sc-shell matches-compact-shell py-4 sm:py-6 space-y-3">
        {error && (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_480px]">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="whitespace-nowrap">Search player</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or jersey #"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
              />
            </label>
          </div>

          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            Showing {sortedRows.length} of {rows.length || 0} players
          </div>

          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-left text-sm text-slate-800">
              <thead>
                <tr className="uppercase tracking-wide text-[11px] text-slate-500">
                  <th className="px-3 py-2 text-center">#</th>
                  <th className="px-3 py-2">Name</th>
                  {statHeaders.map((col) => (
                    <th key={col.key} className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`flex w-full items-center justify-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold transition ${
                          sortBy === col.key
                            ? "bg-slate-100 text-slate-900"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span>{col.label}</span>
                        <span className="text-[10px] leading-none">
                          {sortBy === col.key ? (sortDirection === "asc" ? "ASC" : "DESC") : ""}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={statHeaders.length + 2} className="px-2 py-3 text-center text-sm text-slate-600">
                      Loading player stats...
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={statHeaders.length + 2} className="px-2 py-3 text-center text-sm text-slate-600">
                      No player stats found.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr key={row.playerId} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 text-center font-semibold text-slate-700">
                        {row.jerseyNumber ?? "-"}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to={`/players/${row.playerId}`}
                          className="font-semibold text-slate-900 hover:text-sky-600"
                        >
                          {row.playerName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-center font-semibold">{row.total}</td>
                      <td className="px-3 py-2 text-center font-semibold">{row.assists}</td>
                      <td className="px-3 py-2 text-center font-semibold">{row.goals}</td>
                      <td className="px-3 py-2 text-center font-semibold">{row.games}</td>
                      <td className="px-3 py-2 text-center font-semibold">{row.totalsPerGame.toFixed(1)}</td>
                      <td className="px-3 py-2 text-center font-semibold">{row.assistsPerGame.toFixed(1)}</td>
                      <td className="px-3 py-2 text-center font-semibold">{row.goalsPerGame.toFixed(1)}</td>
                      <td className="px-3 py-2 text-center font-semibold">{row.callahans}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
