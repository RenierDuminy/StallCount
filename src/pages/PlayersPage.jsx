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
    <div className="pb-16 text-[var(--sc-ink)]">
      <header className="sc-shell py-4 sm:py-6">
        <div className="sc-card-base space-y-2 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sc-chip">Players</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
              Impact across matches
            </span>
          </div>
          <h1 className="text-3xl font-semibold text-[var(--sc-ink)]">Player impact across recorded matches</h1>
          <p className="text-sm text-[var(--sc-ink-muted)]">Tap a player for their game-by-game breakdown.</p>
        </div>
      </header>

      <main className="sc-shell matches-compact-shell space-y-3 py-2 sm:space-y-6 sm:py-4">
        {error && (
          <p className="sc-card-muted border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {error}
          </p>
        )}

        <section className="sc-card-base p-4 sm:p-6 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_480px]">
            <label className="sc-card-muted flex items-center gap-2 p-2 text-sm font-semibold text-[var(--sc-ink)]">
              <span className="whitespace-nowrap text-[var(--sc-ink-muted)]">Search player</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or jersey #"
                className="w-full bg-transparent text-sm text-[var(--sc-ink)] outline-none placeholder:text-[var(--sc-ink-muted)]"
              />
            </label>
          </div>

          <div className="sc-card-muted text-xs text-[var(--sc-ink-muted)]">
            <p className="p-2">
              Showing {sortedRows.length} of {rows.length || 0} players
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[var(--sc-border)]">
            <table className="min-w-full text-left text-sm text-[var(--sc-ink)]">
              <thead>
                <tr className="uppercase tracking-wide text-[11px] text-[var(--sc-ink-muted)]">
                  <th className="px-3 py-2 text-center">#</th>
                  <th className="px-3 py-2">Name</th>
                  {statHeaders.map((col) => (
                    <th key={col.key} className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`flex w-full items-center justify-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold transition ${
                          sortBy === col.key ? "bg-[var(--sc-surface-muted)] text-[var(--sc-ink)]" : "text-[var(--sc-ink-muted)] hover:bg-[var(--sc-surface)]"
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
                    <td colSpan={statHeaders.length + 2} className="px-2 py-3 text-center text-sm text-[var(--sc-ink-muted)]">
                      Loading player stats...
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={statHeaders.length + 2} className="px-2 py-3 text-center text-sm text-[var(--sc-ink-muted)]">
                      No player stats found.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr key={row.playerId} className="border-t border-[var(--sc-border)] hover:bg-[var(--sc-surface)]">
                      <td className="px-3 py-2 text-center font-semibold text-[var(--sc-ink-muted)]">
                        {row.jerseyNumber ?? "-"}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to={`/players/${row.playerId}`}
                          className="font-semibold text-[var(--sc-ink)] hover:text-[var(--sc-accent)]"
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
