import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAllPlayerMatchStats } from "../services/teamService";
import { Card, SectionHeader, SectionShell, Field, Input, Select } from "../components/ui/primitives";

export default function PlayersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialEventId = searchParams.get("eventId") || "all";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("total");
  const [sortDirection, setSortDirection] = useState("desc");
  const [eventFilter, setEventFilter] = useState(initialEventId);

  useEffect(() => {
    const requestedEventId = searchParams.get("eventId") || "all";
    setEventFilter((current) => (current === requestedEventId ? current : requestedEventId));
  }, [searchParams]);

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

  const eventOptions = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const event = row.match?.event;
      if (event?.id && !map.has(event.id)) {
        map.set(event.id, event.name || "Event");
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filteredRowsByEvent = useMemo(() => {
    if (eventFilter === "all") {
      return rows;
    }
    return rows.filter((row) => row.match?.event?.id === eventFilter);
  }, [rows, eventFilter]);

  const aggregatedRows = useMemo(() => {
    const map = new Map();

    filteredRowsByEvent.forEach((row) => {
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
  }, [filteredRowsByEvent]);

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

  const handleEventFilterChange = (nextFilter) => {
    setEventFilter(nextFilter);
    if (nextFilter === "all") {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ eventId: nextFilter }, { replace: true });
  };

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-4 sm:py-6">
        <Card className="space-y-4 p-5 sm:p-7">
          <SectionHeader
            eyebrow="Players"
            title="Player impact across recorded matches"
            description="Impact across matches."
          />
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-4 sm:space-y-6">
        {error && (
          <Card variant="muted" className="border border-rose-400/40 p-4 text-sm font-semibold text-rose-100">
            {error}
          </Card>
        )}

        <Card className="space-y-4 p-4 sm:p-6">
          <SectionHeader
            eyebrow="Player stats"
            description={`Showing ${sortedRows.length} of ${aggregatedRows.length} players${
              eventFilter !== "all" ? " (event filter applied)" : ""
            }`}
            action={
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
                <Field className="w-full max-w-sm" label="Search player" htmlFor="player-search">
                  <Input
                    id="player-search"
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name or jersey #"
                  />
                </Field>
                <Field className="w-full max-w-xs" label="Event" htmlFor="player-event-filter">
                  <Select
                    id="player-event-filter"
                    value={eventFilter}
                    onChange={(e) => handleEventFilterChange(e.target.value)}
                  >
                    <option value="all">All events</option>
                    {eventOptions.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            }
          />

          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="min-w-full text-left text-sm text-ink">
              <thead>
                <tr className="uppercase tracking-wide text-[11px] text-ink-muted">
                  <th className="px-3 py-2 text-center">#</th>
                  <th className="px-3 py-2">Name</th>
                  {statHeaders.map((col) => (
                    <th key={col.key} className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`flex w-full items-center justify-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold transition ${
                          sortBy === col.key ? "bg-surface-muted text-ink" : "text-ink-muted hover:bg-surface"
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
                    <td colSpan={statHeaders.length + 2} className="px-2 py-4 text-center text-sm text-ink-muted">
                      Loading player stats...
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={statHeaders.length + 2} className="px-2 py-4 text-center text-sm text-ink-muted">
                      No player stats found.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr key={row.playerId} className="border-t border-border hover:bg-surface-muted">
                      <td className="px-3 py-2 text-center font-semibold text-ink-muted">{row.jerseyNumber ?? "-"}</td>
                      <td className="px-3 py-2">
                        <Link to={`/players/${row.playerId}`} className="font-semibold text-ink hover:text-accent">
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
        </Card>
      </SectionShell>
    </div>
  );
}
