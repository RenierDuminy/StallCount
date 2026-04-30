import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getEventPlayerMatchStats } from "../services/teamService";
import { getEventsList } from "../services/leagueService";
import { Card, SectionHeader, SectionShell, Field, Input, Select } from "../components/ui/primitives";

function getStatRowTeam(row) {
  const statTeam = row.team || null;
  const fallbackTeam =
    row.team_id && row.match
      ? [row.match.team_a, row.match.team_b].find((team) => team?.id === row.team_id) || null
      : null;
  const teamId = statTeam?.id || fallbackTeam?.id || row.team_id || null;
  const teamName = statTeam?.short_name || statTeam?.name || fallbackTeam?.short_name || fallbackTeam?.name || null;

  if (!teamId && !teamName) {
    return null;
  }

  return {
    id: teamId,
    name: teamName || "Team",
  };
}

export default function PlayersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialEventId = searchParams.get("eventId") || "";
  const initialDivisionId = searchParams.get("divisionId") || "";
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("total");
  const [sortDirection, setSortDirection] = useState("desc");
  const [eventFilter, setEventFilter] = useState(initialEventId);
  const [divisionFilter, setDivisionFilter] = useState(initialDivisionId);

  useEffect(() => {
    const requestedEventId = searchParams.get("eventId") || "";
    const requestedDivisionId = searchParams.get("divisionId") || "";
    setEventFilter((current) => (current === requestedEventId ? current : requestedEventId));
    setDivisionFilter((current) => (current === requestedDivisionId ? current : requestedDivisionId));
  }, [searchParams]);

  useEffect(() => {
    let ignore = false;
    async function loadEvents() {
      setEventsLoading(true);
      setEventsError(null);
      try {
        const data = await getEventsList(200);
        if (!ignore) {
          setEvents(data || []);
        }
      } catch (err) {
        if (!ignore) {
          setEventsError(err.message || "Unable to load events.");
          setEvents([]);
        }
      } finally {
        if (!ignore) {
          setEventsLoading(false);
        }
      }
    }
    loadEvents();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadStats() {
      if (!eventFilter) {
        setRows([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await getEventPlayerMatchStats(eventFilter);
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
  }, [eventFilter]);

  const filters = useMemo(
    () => ({
      search: search.trim().toLowerCase(),
    }),
    [search],
  );

  const divisionOptions = useMemo(() => {
    const map = new Map();

    rows.forEach((row) => {
      const division = row.match?.division;
      if (division?.id && !map.has(division.id)) {
        map.set(division.id, division.name || "Division");
      }
    });

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  useEffect(() => {
    if (!divisionFilter) {
      return;
    }

    const divisionStillAvailable = divisionOptions.some(
      (division) => String(division.id) === String(divisionFilter),
    );

    if (!divisionStillAvailable) {
      setDivisionFilter("");
    }
  }, [divisionFilter, divisionOptions]);

  const filteredRows = useMemo(() => {
    if (!divisionFilter) {
      return rows;
    }

    return rows.filter((row) => row.match?.division?.id === divisionFilter);
  }, [divisionFilter, rows]);

  const aggregatedRows = useMemo(() => {
    const map = new Map();

    filteredRows.forEach((row) => {
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
          teamOptions: new Map(),
          callahans: 0,
        });
      }

      const entry = map.get(playerId);
      const goals = row.goals || 0;
      const assists = row.assists || 0;
      entry.goals += goals;
      entry.assists += assists;
      entry.blocks += row.blocks || 0;
      entry.turnovers += row.turnovers || 0;
      entry.callahans += row.callahans || 0;
      entry.matchIds.add(row.match_id);

      const team = getStatRowTeam(row);
      if (team) {
        const teamKey = team.id || team.name;
        if (!entry.teamOptions.has(teamKey)) {
          entry.teamOptions.set(teamKey, {
            id: team.id,
            name: team.name,
            goals: 0,
            assists: 0,
            total: 0,
          });
        }

        const teamEntry = entry.teamOptions.get(teamKey);
        teamEntry.goals += goals;
        teamEntry.assists += assists;
        teamEntry.total += goals + assists;
      }
    });

    return Array.from(map.values()).map((entry) => {
      const games = entry.matchIds.size || 0;
      const total = entry.goals + entry.assists;
      const primaryTeam =
        Array.from(entry.teamOptions.values()).sort((a, b) => {
          if (b.total !== a.total) return b.total - a.total;
          if (b.goals !== a.goals) return b.goals - a.goals;
          return a.name.localeCompare(b.name);
        })[0] || null;

      return {
        ...entry,
        games,
        total,
        teamId: primaryTeam?.id ?? null,
        teamName: primaryTeam?.name ?? null,
      };
    });
  }, [filteredRows]);

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
    { key: "callahans", label: "Callahans" },
  ];
  const tableColumnCount = statHeaders.length + 3;

  const handleEventFilterChange = (nextFilter) => {
    setEventFilter(nextFilter);
    setDivisionFilter("");

    if (!nextFilter) {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ eventId: nextFilter }, { replace: true });
  };

  const handleDivisionFilterChange = (nextFilter) => {
    setDivisionFilter(nextFilter);

    if (!eventFilter) {
      setSearchParams({}, { replace: true });
      return;
    }

    if (!nextFilter) {
      setSearchParams({ eventId: eventFilter }, { replace: true });
      return;
    }

    setSearchParams({ eventId: eventFilter, divisionId: nextFilter }, { replace: true });
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

        <Card className="space-y-4 px-2 py-4 sm:px-3 sm:py-6">
          <SectionHeader
            eyebrow="Player stats"
            description={
              eventFilter
                ? `Showing ${sortedRows.length} of ${aggregatedRows.length} players for the selected event${
                    divisionFilter ? " and division." : "."
                  }`
                : "Select an event to load player stats."
            }
            action={
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
                <Field className="w-full max-w-sm" label="Search player" htmlFor="player-search">
                  <Input
                    id="player-search"
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name or jersey"
                  />
                </Field>
                <Field className="w-full max-w-xs" label="Event" htmlFor="player-event-filter">
                  <Select
                    id="player-event-filter"
                    value={eventFilter}
                    onChange={(e) => handleEventFilterChange(e.target.value)}
                    disabled={eventsLoading || events.length === 0}
                  >
                    <option value="">
                      {eventsLoading
                        ? "Loading events..."
                        : events.length
                          ? "Select an event..."
                          : "No events available"}
                    </option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {divisionOptions.length > 0 ? (
                  <Field className="w-full max-w-xs" label="Division" htmlFor="player-division-filter">
                    <Select
                      id="player-division-filter"
                      value={divisionFilter}
                      onChange={(e) => handleDivisionFilterChange(e.target.value)}
                    >
                      <option value="">All divisions</option>
                      {divisionOptions.map((division) => (
                        <option key={division.id} value={division.id}>
                          {division.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </div>
            }
          />

          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="min-w-full text-left text-sm text-ink">
              <thead>
                <tr className="uppercase text-[11px] text-ink-muted">
                  <th className="px-1 py-2 text-center" aria-label="Rank"></th>
                  <th className="px-1 py-2">Name</th>
                  <th className="px-1 py-2">Team</th>
                  {statHeaders.map((col) => (
                    <th key={col.key} className="px-1 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`flex w-full items-center justify-center gap-px rounded-md px-0 py-0.5 text-xs font-semibold transition ${
                          sortBy === col.key ? "bg-surface-muted text-ink" : "text-ink-muted hover:bg-surface"
                        }`}
                      >
                        <span>{col.label}</span>
                        <span className="text-[10px] leading-none">
                          {sortBy === col.key ? (sortDirection === "asc" ? "\u2191" : "\u2193") : ""}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventsError ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-1 py-4 text-center text-sm text-ink-muted">
                      {eventsError}
                    </td>
                  </tr>
                ) : !eventFilter ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-1 py-4 text-center text-sm text-ink-muted">
                      Select an event to load player stats.
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-1 py-4 text-center text-sm text-ink-muted">
                      Loading player stats...
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-1 py-4 text-center text-sm text-ink-muted">
                      No player stats found.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row, index) => (
                    <tr key={row.playerId} className="border-t border-border hover:bg-surface-muted">
                      <td className="px-1 py-2 text-center font-semibold text-ink-muted">{index + 1}</td>
                      <td className="px-1 py-2">
                        <Link
                          to={
                            eventFilter
                              ? `/players/${row.playerId}?eventId=${encodeURIComponent(eventFilter)}`
                              : `/players/${row.playerId}`
                          }
                          className="font-semibold text-ink hover:text-accent"
                        >
                          {row.playerName}
                        </Link>
                      </td>
                      <td className="px-1 py-2">
                        {row.teamName ? (
                          row.teamId ? (
                            <Link to={`/teams/${row.teamId}`} className="font-semibold text-ink hover:text-accent">
                              {row.teamName}
                            </Link>
                          ) : (
                            <span className="font-semibold text-ink">{row.teamName}</span>
                          )
                        ) : (
                          <span className="text-ink-muted">-</span>
                        )}
                      </td>
                      <td className="px-1 py-2 text-center font-semibold">{row.total}</td>
                      <td className="px-1 py-2 text-center font-semibold">{row.assists}</td>
                      <td className="px-1 py-2 text-center font-semibold">{row.goals}</td>
                      <td className="px-1 py-2 text-center font-semibold">{row.games}</td>
                      <td className="px-1 py-2 text-center font-semibold">{row.callahans}</td>
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
