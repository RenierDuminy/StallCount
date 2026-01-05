import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, Field, Panel, SectionHeader, SectionShell, Select } from "../components/ui/primitives";
import { getEventsList } from "../services/leagueService";
import { getEventRosters } from "../services/playerService";

export default function EventRostersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialEventId = searchParams.get("eventId") || "";
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(initialEventId);
  const [rosters, setRosters] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingRosters, setLoadingRosters] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    async function loadEvents() {
      setLoadingEvents(true);
      try {
        const list = await getEventsList(100);
        if (!ignore) {
          setEvents(list || []);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Unable to load events.");
        }
      } finally {
        if (!ignore) {
          setLoadingEvents(false);
        }
      }
    }
    loadEvents();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!events.length) return;
    if (!selectedEventId || !events.some((evt) => evt.id === selectedEventId)) {
      setSelectedEventId(events[0]?.id || "");
    }
  }, [events, selectedEventId]);

  useEffect(() => {
    if (selectedEventId) {
      setSearchParams({ eventId: selectedEventId });
    } else {
      setSearchParams({});
    }
  }, [selectedEventId, setSearchParams]);

  useEffect(() => {
    if (!selectedEventId) {
      setRosters([]);
      return;
    }
    let ignore = false;
    async function loadRosters() {
      setLoadingRosters(true);
      setError("");
      try {
        const list = await getEventRosters(selectedEventId);
        if (!ignore) {
          setRosters(list || []);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Unable to load event rosters.");
          setRosters([]);
        }
      } finally {
        if (!ignore) {
          setLoadingRosters(false);
        }
      }
    }
    loadRosters();
    return () => {
      ignore = true;
    };
  }, [selectedEventId]);

  const groupedTeams = useMemo(() => {
    const map = new Map();
    rosters.forEach((entry) => {
      const teamId = entry.team?.id || entry.team_id;
      if (!teamId) return;
      if (!map.has(teamId)) {
        map.set(teamId, {
          teamId,
          name: entry.team?.name || "Team",
          shortName: entry.team?.short_name || null,
          players: [],
        });
      }
      const roster = map.get(teamId);
      roster.players.push({
        id: entry.id,
        name: entry.player?.name || "Player",
        jersey: entry.player?.jersey_number ?? null,
        gender: entry.player?.gender_code ?? null,
        isCaptain: Boolean(entry.is_captain),
        isSpiritCaptain: Boolean(entry.is_spirit_captain),
      });
    });

    const getRoleRank = (player) => {
      if (player.isCaptain) return 0;
      if (player.isSpiritCaptain) return 1;
      return 2;
    };

    const teams = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    teams.forEach((team) => {
      team.players.sort((a, b) => {
        const rankDiff = getRoleRank(a) - getRoleRank(b);
        if (rankDiff !== 0) {
          return rankDiff;
        }
        return a.name.localeCompare(b.name);
      });
    });
    return teams;
  }, [rosters]);

  const maxPlayers = groupedTeams.reduce((max, team) => Math.max(max, team.players.length), 0);

  const selectedEvent = events.find((evt) => evt.id === selectedEventId) || null;

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-4 sm:py-6">
        <Card className="space-y-4 p-5 sm:p-7">
          <SectionHeader
            eyebrow="Event rosters"
            title="Team rosters by event"
            description="View the full set of registered players grouped by their teams."
            action={
              <Field className="w-full max-w-xs" label="Select event" htmlFor="event-roster-filter">
                <Select
                  id="event-roster-filter"
                  value={selectedEventId}
                  onChange={(event) => setSelectedEventId(event.target.value)}
                  disabled={loadingEvents || events.length === 0}
                >
                  {events.length === 0 ? (
                    <option value="">No events available</option>
                  ) : (
                    events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))
                  )}
                </Select>
              </Field>
            }
          />
          {selectedEvent && (
            <div className="text-sm text-ink-muted">
              {selectedEvent.location ? `${selectedEvent.location} - ` : ""}
              {selectedEvent.start_date
                ? new Date(selectedEvent.start_date).toLocaleDateString()
                : "Start TBD"}
              {" to "}
              {selectedEvent.end_date
                ? new Date(selectedEvent.end_date).toLocaleDateString()
                : "End TBD"}
            </div>
          )}
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-4 sm:space-y-6">
        {error && (
          <Card variant="muted" className="border border-rose-300/30 p-4 text-sm text-rose-700">
            {error}
          </Card>
        )}

        <Card className="space-y-4 p-4 sm:p-6">
          <SectionHeader
            eyebrow="Rosters"
            description={
              selectedEventId
                ? `Showing ${groupedTeams.length} teams - ${rosters.length} player assignments`
                : "Select an event to display its rosters"
            }
          />

          {loadingRosters ? (
            <Panel variant="muted" className="p-5 text-center text-sm text-ink-muted">
              Loading rosters...
            </Panel>
          ) : !selectedEventId ? (
            <Panel variant="muted" className="p-5 text-center text-sm text-ink-muted">
              Choose an event to see its rosters.
            </Panel>
          ) : groupedTeams.length === 0 ? (
            <Panel variant="muted" className="p-5 text-center text-sm text-ink-muted">
              No roster entries were found for this event.
            </Panel>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-auto border border-border text-left text-sm text-ink">
                <thead>
                  <tr className="bg-surface-muted text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {groupedTeams.map((team) => (
                      <th key={team.teamId} className="border-b border-border px-3 py-2 text-center whitespace-nowrap">
                        <div className="text-sm font-semibold text-ink">{team.name}</div>
                        {team.shortName && (
                          <div className="text-[11px] uppercase tracking-wide text-ink-muted">
                            {team.shortName}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxPlayers }).map((_, rowIndex) => (
                    <tr key={rowIndex}>
                      {groupedTeams.map((team) => {
                        const player = team.players[rowIndex];
                        return (
                          <td
                            key={`${team.teamId}-${rowIndex}`}
                            className="border-x border-border px-3 py-1.5 align-top whitespace-nowrap"
                          >
                            {player ? (
                              <RosterPlayerCard player={player} />
                            ) : (
                              <span className="text-xs text-ink-muted"></span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </SectionShell>
    </div>
  );
}

function RosterPlayerCard({ player }) {
  const jerseyLabel = typeof player.jersey === "number" ? `#${player.jersey}` : null;
  const genderLabel = player.gender ? player.gender : "--";
  const tags = [];
  if (player.isCaptain) {
    tags.push({ label: "C", title: "Captain" });
  }
  if (player.isSpiritCaptain) {
    tags.push({ label: "SC", title: "Spirit captain" });
  }
  return (
    <div className="flex flex-nowrap items-center gap-2 text-sm font-semibold text-ink">
      {tags.length > 0 && (
        <div className="flex flex-nowrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag.label}
              title={tag.title}
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
              style={{
                background: "var(--sc-accent)",
                color: "var(--sc-button-ink)",
                borderColor: "var(--sc-accent-strong)",
              }}
            >
              {tag.label}
            </span>
          ))}
        </div>
      )}
      <span>{player.name}</span>
      <span className="text-xs text-ink-muted">({genderLabel})</span>
      {jerseyLabel && (
        <span className="text-xs text-ink-muted">{jerseyLabel}</span>
      )}
    </div>
  );
}
