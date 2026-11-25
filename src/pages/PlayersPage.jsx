import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getEventPlayerMatchStats } from "../services/teamService";
import { getEventsList } from "../services/leagueService";
import { Panel, SectionShell, Field, Input, Select } from "../components/ui/primitives";
import { playerPath, teamPath } from "../utils/links";
import { EVENT_SECTIONS, getEventSectionPath } from "./eventWorkspaces";
import { useEventSectionRoute, useLegacyEventSectionRedirect } from "./eventRouteHooks";
import { useFullHeadingsIfTheyFit } from "../hooks/useFullHeadingsIfTheyFit";

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

/**
 * `/players`: player statistics. With no event, it asks for one. An old
 * `/players?eventId=` link (before 2026-11-20) redirects to the event's own
 * address, keeping `?divisionId=`; retire after 2027-05-20.
 */
export default function PlayersRoute() {
  const [searchParams] = useSearchParams();
  if (searchParams.get("eventId")) return <LegacyPlayersRedirect />;
  return <PlayersPage eventId="" />;
}

function LegacyPlayersRedirect() {
  return useLegacyEventSectionRedirect(EVENT_SECTIONS.PLAYERS);
}

/** `/events/<slug>/players`: one event's player statistics, found by its slug. */
export function EventPlayersPage() {
  const { event, element } = useEventSectionRoute(EVENT_SECTIONS.PLAYERS);
  if (element) return element;
  return <PlayersPage key={event.id} eventId={event.id} />;
}

function PlayersPage({ eventId }) {
  // The event comes from the address (`/events/<slug>/players`); the division
  // is a filter, so it stays a query parameter (`?divisionId=`). Each choice is
  // a new history entry, so Back steps through earlier choices.
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const eventFilter = eventId;
  const divisionFilter = searchParams.get("divisionId") || "";
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("total");
  const [sortDirection, setSortDirection] = useState("desc");

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

  // A division this event does not have (an old link): drop the filter once
  // the statistics have loaded, so it is not cleared while they load.
  useEffect(() => {
    if (!divisionFilter || loading || rows.length === 0) {
      return;
    }

    const divisionStillAvailable = divisionOptions.some(
      (division) => String(division.id) === String(divisionFilter),
    );

    if (!divisionStillAvailable) {
      setSearchParams({}, { replace: true });
    }
  }, [divisionFilter, divisionOptions, loading, rows.length, setSearchParams]);

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
      const total = entry.goals + entry.assists + entry.callahans;
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
          case "blocks":
            return row.blocks;
          case "turnovers":
            return row.turnovers;
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

      if (aVal !== bVal) {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      // Ties always fall back to the same descending total/goals/name order
      // so the row order stays stable when only the direction changes.
      if (a.total !== b.total) {
        return b.total - a.total;
      }
      if (a.goals !== b.goals) {
        return b.goals - a.goals;
      }
      return a.playerName.localeCompare(b.playerName);
    });
    return list;
  }, [filteredAggregated, sortBy, sortDirection]);

  const toggleSort = (column) => {
    if (sortBy === column) {
      setSortDirection((dir) => (dir === "desc" ? "asc" : "desc"));
      return;
    }
    setSortBy(column);
    setSortDirection("desc");
  };

  // The Callahans column only appears when someone in the list has one.
  const showCallahans = sortedRows.some((row) => (row.callahans || 0) > 0);
  // `full` when the table fits with full words (useFullHeadingsIfTheyFit),
  // else `label`.
  const statHeaders = [
    { key: "total", label: "Tot", full: "Total" },
    { key: "goals", label: "G", full: "Goals" },
    { key: "assists", label: "A", full: "Assists" },
    { key: "blocks", label: "B", full: "Blocks" },
    { key: "turnovers", label: "TO", full: "Turnovers" },
    { key: "games", label: "GP", full: "Games" },
    ...(showCallahans ? [{ key: "callahans", label: "Cal", full: "Callahans" }] : []),
  ];
  const [tablePanelRef, showFullHeadings] = useFullHeadingsIfTheyFit(
    `${eventFilter}|${sortedRows.length}|${showCallahans}`,
  );

  const handleEventFilterChange = (nextFilter) => {
    const next = events.find((event) => event.id === nextFilter);
    navigate(next ? getEventSectionPath(next, EVENT_SECTIONS.PLAYERS) : "/players");
  };

  const handleDivisionFilterChange = (nextFilter) => {
    setSearchParams(nextFilter ? { divisionId: nextFilter } : {});
  };

  const selectedEvent = events.find((event) => event.id === eventFilter) || null;
  const emptyMessage = eventsError
    ? eventsError
    : !eventFilter
      ? "Select an event to load player stats."
      : loading
        ? "Loading player stats..."
        : sortedRows.length === 0
          ? search.trim()
            ? "No players match your search."
            : "No statistics have been recorded yet."
          : null;

  return (
    <div className="min-h-screen pb-16 text-ink">
      {/* Laid out like the event's Rosters page (no cards; a header, then a
          section below a rule). Written with the sc-theme-* classes, so it
          follows the theme (dark by default; see theme.css). */}
      <div className="sc-theme-band">
        <SectionShell as="header" className="w-full max-w-none space-y-3 py-4 sm:py-5">
          <div className="space-y-1">
            <h1 className="text-h2 font-semibold text-ink">
              {selectedEvent?.name ? `${selectedEvent.name} – Player statistics` : "Player statistics"}
            </h1>
            {selectedEvent ? (
              <p className="text-sm text-ink-muted">
                {[
                  selectedEvent.location,
                  `${selectedEvent.start_date ? new Date(selectedEvent.start_date).toLocaleDateString("en-GB") : "Start TBD"} to ${
                    selectedEvent.end_date ? new Date(selectedEvent.end_date).toLocaleDateString("en-GB") : "End TBD"
                  }`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,14rem)_minmax(0,16rem)] sm:items-end">
            <Field label="Event" htmlFor="player-event-filter">
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
            <Field label="Division" htmlFor="player-division-filter">
              <Select
                id="player-division-filter"
                value={divisionFilter}
                onChange={(e) => handleDivisionFilterChange(e.target.value)}
                disabled={divisionOptions.length === 0}
              >
                <option value="">All divisions</option>
                {divisionOptions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Search player" htmlFor="player-search">
              <Input
                id="player-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or jersey"
              />
            </Field>
          </div>
          {error ? <div className="sc-alert is-error">{error}</div> : null}
        </SectionShell>
      </div>

      <SectionShell as="main" className="w-full max-w-none space-y-6 py-4 sm:py-6">
        <section className="min-w-0 space-y-4">
          <div className="space-y-1 sc-theme-rule pb-3">
            <h2 className="text-2xl font-semibold text-ink">Player stats</h2>
            <p className="text-sm text-ink-muted">
              {eventFilter
                ? `Showing ${sortedRows.length} of ${aggregatedRows.length} players${
                    divisionFilter ? " in the selected division" : ""
                  }`
                : "Select an event to load player stats"}
            </p>
          </div>

          {emptyMessage ? (
            <p className="py-6 text-center text-sm text-ink-muted">{emptyMessage}</p>
          ) : (
            <Panel ref={tablePanelRef} className="overflow-x-auto p-0">
              <table className="min-w-full divide-y divide-border text-left text-sm text-ink">
                <thead className="text-xs font-semibold uppercase tracking-wide">
                  <tr>
                    <th className="py-2 pl-3 pr-1.5 text-center" aria-label="Rank">#</th>
                    <th className="py-2 pl-1.5 pr-3">Player</th>
                    <th className="px-3 py-2">Team</th>
                    {statHeaders.map((col) => (
                      <th key={col.key} className="whitespace-nowrap px-2 py-2 text-center sm:px-3">
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          title={col.full}
                          className={`inline-flex items-center justify-center gap-px text-xs font-semibold uppercase transition ${
                            sortBy === col.key ? "text-ink underline underline-offset-4" : "text-ink-muted hover:text-ink"
                          }`}
                        >
                          <span>{showFullHeadings ? col.full : col.label}</span>
                          {sortBy === col.key && (
                            <span className="text-xs leading-none">
                              {sortDirection === "asc" ? "↑" : "↓"}
                            </span>
                          )}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {sortedRows.map((row, index) => (
                    <tr key={row.playerId} className="transition-colors sc-theme-row">
                      <td className="py-1.5 pl-3 pr-1.5 text-center text-xs font-semibold text-ink">
                        {index + 1}
                      </td>
                      <td className="py-1.5 pl-1.5 pr-3">
                        <div className="flex items-center gap-2">
                          <Link
                            to={
                              eventFilter
                                ? playerPath(row.playerId, { eventId: eventFilter })
                                : playerPath(row.playerId)
                            }
                            className="font-semibold sc-theme-link"
                          >
                            {row.playerName}
                          </Link>
                          {row.jerseyNumber != null && (
                            <span className="shrink-0 text-xs text-ink">#{row.jerseyNumber}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        {row.teamName ? (
                          row.teamId ? (
                            <Link
                              to={teamPath(row.teamId, { eventId: eventFilter || null })}
                              className="sc-theme-link"
                            >
                              {row.teamName}
                            </Link>
                          ) : (
                            <span className="text-ink">{row.teamName}</span>
                          )
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <StatCell value={row.total} strong active={sortBy === "total"} />
                      <StatCell value={row.goals} active={sortBy === "goals"} />
                      <StatCell value={row.assists} active={sortBy === "assists"} />
                      <StatCell value={row.blocks} active={sortBy === "blocks"} />
                      <StatCell value={row.turnovers} active={sortBy === "turnovers"} />
                      <StatCell value={row.games} active={sortBy === "games"} />
                      {showCallahans ? (
                        <StatCell value={row.callahans} circled active={sortBy === "callahans"} />
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </section>
      </SectionShell>
    </div>
  );
}

// Centred under its heading. `circled`: a non-zero value gets a circle
// outline (the Callahans column, as on the player page). `active`: the column
// the table is sorted by, tinted.
function StatCell({ value, strong = false, circled = false, active = false }) {
  const shown = value ?? 0;
  return (
    <td
      className={`whitespace-nowrap px-2 py-1.5 text-center tabular-nums text-ink sm:px-3 ${
        strong ? "font-semibold" : ""
      } ${active ? "sc-theme-cell-active" : ""}`}
    >
      {circled && shown ? (
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-current px-1 leading-none">
          {shown}
        </span>
      ) : circled ? (
        <span className="text-ink-muted">–</span>
      ) : (
        shown
      )}
    </td>
  );
}
