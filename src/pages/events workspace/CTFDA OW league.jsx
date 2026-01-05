import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  Panel,
  SectionHeader,
  SectionShell,
  Chip,
} from "../../components/ui/primitives";
import { getMatchesByEvent } from "../../services/matchService";
import { getEventHierarchy } from "../../services/leagueService";
export const EVENT_ID = "0d3369f9-8461-4f02-b343-5679bb17d644";
export const EVENT_SLUG = "ctfda-ow-league";
const MATCH_LIMIT = 400;
const CURRENT_MATCH_STATUSES = new Set(["live", "halftime"]);
const FINISHED_MATCH_STATUSES = new Set(["finished", "completed"]);
const formatDate = (value) => {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};
const formatDateTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatCoordinate = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value.toFixed(4);
};

const copyToClipboard = async (text, onSuccess, onError) => {
  try {
    await navigator.clipboard.writeText(text);
    if (onSuccess) {
      onSuccess();
    }
  } catch (err) {
    if (onError) {
      onError(err);
    }
  }
};
const buildPoolMatchBuckets = (matches = []) => {
  const buckets = {};
  matches.forEach((match) => {
    const poolId = match.pool_id || "unassigned";
    if (!buckets[poolId]) {
      buckets[poolId] = { current: [], finished: [], other: [] };
    }
    const normalizedStatus = (match.status || "").toLowerCase();
    if (CURRENT_MATCH_STATUSES.has(normalizedStatus)) {
      buckets[poolId].current.push(match);
      return;
    }
    if (FINISHED_MATCH_STATUSES.has(normalizedStatus)) {
      buckets[poolId].finished.push(match);
      return;
    }
    buckets[poolId].other.push(match);
  });
  Object.values(buckets).forEach((bucket) => {
    bucket.current.sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
    bucket.finished.sort(
      (a, b) =>
        new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
    );
  });
  return buckets;
};
const buildDivisionTeams = (division) => {
  const rows = [];
  const seen = new Set();
  (division.pools || []).forEach((pool) => {
    (pool.teams || []).forEach((entry) => {
      if (!entry?.team?.id || seen.has(entry.team.id)) return;
      seen.add(entry.team.id);
      rows.push({
        id: entry.team.id,
        name: entry.team.name || "Team",
        shortName: entry.team.short_name || null,
        seed:
          typeof entry.seed === "number" && !Number.isNaN(entry.seed)
            ? entry.seed
            : null,
        pool: pool.name || "Pool",
      });
    });
  });
  rows.sort((a, b) => {
    if (a.seed !== null && b.seed !== null) {
      return a.seed - b.seed || a.name.localeCompare(b.name);
    }
    if (a.seed !== null) return -1;
    if (b.seed !== null) return 1;
    return a.name.localeCompare(b.name);
  });
  return rows;
};
const TeamTable = ({ rows, columns }) => {
  if (!rows.length) {
    return <p className="text-sm text-ink-muted">No teams registered yet.</p>;
  }
  return (
    <div
      className="overflow-x-auto rounded border"
      style={{
        background: "var(--sc-surface)",
        borderColor: "var(--sc-border)",
        color: "var(--sc-ink)",
      }}
    >
      <table className="min-w-full text-sm">
        <thead
          className="text-xs uppercase tracking-wide"
          style={{
            background: "var(--sc-surface-muted)",
            color: "var(--sc-ink-strong)",
          }}
        >
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-3 py-2 text-left font-semibold"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id}
              className="transition-colors"
              style={{
                background:
                  index % 2 === 0
                    ? "var(--sc-surface)"
                    : "var(--sc-surface-muted)",
                color: "var(--sc-ink)",
              }}
            >
              {columns.map((column) => (
                <td key={column.key} className="px-3 py-2 align-middle">
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
const renderMatchRow = (match) => (
  <div
    key={match.id}
    className="rounded border border-border p-2 text-xs text-ink"
  >
    <div className="flex justify-between text-[11px] uppercase tracking-wide text-ink-muted">
      <span>{formatDateTime(match.start_time)}</span>
      <span>{match.status || "Status"}</span>
    </div>
    <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-semibold">
      <div className="truncate">{match.team_a?.name || "Team A"}</div>
      <div className="text-center text-base font-bold">
        {match.score_a ?? 0} : {match.score_b ?? 0}
      </div>
      <div className="truncate text-right">
        {match.team_b?.name || "Team B"}
      </div>
    </div>
  </div>
);
export default function DROwLeague26Page() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [matchesByPool, setMatchesByPool] = useState({});
  const [copyToast, setCopyToast] = useState(null);
  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [structure, matches] = await Promise.all([
          getEventHierarchy(EVENT_ID),
          getMatchesByEvent(EVENT_ID, MATCH_LIMIT, { includeFinished: true }),
        ]);
        if (ignore) return;
        setEventData(structure);
        setMatchesByPool(buildPoolMatchBuckets(matches));
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Unable to load OW League data.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);
  return (
    <div className="pb-16 text-ink">
      {copyToast && (
        <div className="fixed bottom-4 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 px-4">
          <div
            className="sc-alert is-success text-center text-sm"
            onAnimationEnd={() => {
              setTimeout(() => setCopyToast(null), 2000);
            }}
          >
            {copyToast}
          </div>
        </div>
      )}
      <SectionShell as="main" className="space-y-6 py-8">
        <Card className="space-y-4 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Operations Workspace"
            title="OW League overview"
            description="Monitor the league structure along with live and completed matches grouped by pools."
          />
          <Panel variant="muted" className="p-4 text-sm text-ink">
            This workspace is still under construction. Data below refreshes
            whenever you open the page and will expand as more tooling ships.
          </Panel>
        </Card>
        {error && <div className="sc-alert is-error">{error}</div>}
        {loading ? (
          <Card
            variant="muted"
            className="p-6 text-center text-sm text-ink-muted"
          >
            Loading event hierarchy and match feed...
          </Card>
        ) : !eventData ? (
          <Card
            variant="muted"
            className="p-6 text-center text-sm text-ink-muted"
          >
            Event not found.
          </Card>
        ) : (
          <>
            <Card className="space-y-3 p-6 sm:p-8">
              <SectionHeader
                eyebrow="Event"
                title={eventData.name}
                description="Divisions, pools, assigned teams, and recent matches."
                action={<Chip>{eventData.type || "Event"}</Chip>}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Panel variant="muted" className="p-3">
                  <p className="text-xs uppercase tracking-wide text-ink-muted">
                    Start date
                  </p>
                  <p className="font-semibold">
                    {formatDate(eventData.start_date)}
                  </p>
                </Panel>
                <Panel variant="muted" className="p-3">
                  <p className="text-xs uppercase tracking-wide text-ink-muted">
                    End date
                  </p>
                  <p className="font-semibold">
                    {formatDate(eventData.end_date)}
                  </p>
                </Panel>
                <Panel variant="muted" className="p-3">
                  <p className="text-xs uppercase tracking-wide text-ink-muted">
                    Location
                  </p>
                  <p className="font-semibold">{eventData.location || "TBD"}</p>
                </Panel>
                <Panel variant="muted" className="p-3">
                  <p className="text-xs uppercase tracking-wide text-ink-muted">
                    Divisions
                  </p>
                  <p className="font-semibold">
                    {eventData.divisions.length || 0}
                  </p>
                </Panel>
              </div>
              <Panel variant="muted" className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-ink-muted">
                      Venues
                    </p>
                    <p className="text-sm text-ink-muted">
                      Linked via the event setup wizard
                    </p>
                  </div>
                  <Chip>{eventData.venues?.length || 0}</Chip>
                </div>
                {eventData.venues?.length ? (
                  <ul className="grid gap-2 md:grid-cols-2">
                    {eventData.venues.map((venue) => {
                      const lat = formatCoordinate(venue.latitude);
                      const lon = formatCoordinate(venue.longitude);
                      const locationLabel = venue.location || "Location TBD";
                      const nameLabel = venue.name || "Venue";
                      const compositeLabel = `${locationLabel} (${nameLabel})`;
                      const coordText =
                        lat && lon ? `${lat}, ${lon}` : null;
                      return (
                        <li
                          key={venue.id}
                          className="rounded border border-border p-3 text-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1 text-left">
                              <p className="font-semibold text-ink">
                                {locationLabel}
                              </p>
                              <p className="text-xs text-ink-muted">
                                ({nameLabel})
                              </p>
                              {venue.notes && (
                                <p className="text-xs text-ink-muted">
                                  {venue.notes}
                                </p>
                              )}
                              {(lat || lon) && (
                                <p className="text-xs text-ink-muted">
                                  Coords: {lat || "--"}, {lon || "--"}
                                </p>
                              )}
                            </div>
                            {coordText && (
                              <button
                                type="button"
                                className="sc-button is-ghost text-[11px] uppercase tracking-wide"
                                onClick={() =>
                                  copyToClipboard(coordText, () =>
                                    setCopyToast(
                                      `Copied ${compositeLabel} coordinates`,
                                    ),
                                  )
                                }
                              >
                                Copy coords
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-muted">
                    No venues linked to this event yet.
                  </p>
                )}
              </Panel>
              <div className="flex justify-end">
                <Link
                  to={`/event-rosters?eventId=${encodeURIComponent(EVENT_ID)}`}
                  className="sc-button"
                >
                  View event rosters
                </Link>
              </div>
            </Card>
            {eventData.divisions.length === 0 ? (
              <Card
                variant="muted"
                className="p-6 text-center text-sm text-ink-muted"
              >
                No divisions have been configured for this event yet.
              </Card>
            ) : (
              <>
                {eventData.divisions.map((division) => {
                  const divisionTeams = buildDivisionTeams(division);
                  const divisionColumns = [
                    {
                      key: "seed",
                      label: "Seed",
                      render: (row) =>
                        row.seed !== null ? `#${row.seed}` : "--",
                    },
                    {
                      key: "team",
                      label: "Team",
                      render: (row) =>
                        row.shortName
                          ? `${row.name} (${row.shortName})`
                          : row.name,
                    },
                    {
                      key: "pool",
                      label: "Pool",
                      render: (row) => row.pool,
                    },
                  ];
                  return (
                    <Card key={division.id} className="space-y-4 p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-ink-muted">
                            Division
                          </p>
                          <p className="text-lg font-semibold text-ink">
                            {division.name}
                          </p>
                          {division.level && (
                            <p className="text-sm text-ink-muted">
                              Competitive level: {division.level}
                            </p>
                          )}
                        </div>
                        <Chip>{division.pools.length} pools</Chip>
                      </div>
                      <Panel variant="muted" className="space-y-2 p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-wide text-ink-muted">
                            Division teams
                          </p>
                          <Chip>{divisionTeams.length}</Chip>
                        </div>
                        <TeamTable
                          rows={divisionTeams}
                          columns={divisionColumns}
                        />
                      </Panel>
                      {division.pools.length === 0 ? (
                        <Panel
                          variant="muted"
                          className="p-4 text-sm text-ink-muted"
                        >
                          No pools are registered for this division.
                        </Panel>
                      ) : (
                        <div className="space-y-4">
                          {division.pools.map((pool) => {
                            const poolMatches = matchesByPool[pool.id] || {
                              current: [],
                              finished: [],
                              other: [],
                            };
                            return (
                              <Panel
                                key={pool.id}
                                variant="tinted"
                                className="space-y-4 p-4"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-ink-muted">
                                      Pool
                                    </p>
                                    <p className="text-base font-semibold text-ink">
                                      {pool.name}
                                    </p>
                                  </div>
                                  <Chip>{pool.teams.length} teams</Chip>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-ink-muted">
                                      Teams
                                    </p>
                                    <TeamTable
                                      rows={(pool.teams || []).map((entry) => ({
                                        id:
                                          entry.team?.id ||
                                          `${pool.id}-${entry.seed}-${entry.team?.name}`,
                                        name: entry.team?.name || "Team",
                                        shortName:
                                          entry.team?.short_name || null,
                                        seed:
                                          typeof entry.seed === "number" &&
                                          !Number.isNaN(entry.seed)
                                            ? entry.seed
                                            : null,
                                      }))}
                                      columns={[
                                        {
                                          key: "seed",
                                          label: "Seed",
                                          render: (row) =>
                                            row.seed !== null
                                              ? `#${row.seed}`
                                              : "--",
                                        },
                                        {
                                          key: "name",
                                          label: "Team",
                                          render: (row) =>
                                            row.shortName
                                              ? `${row.name} (${row.shortName})`
                                              : row.name,
                                        },
                                      ]}
                                    />
                                  </div>
                                  <div className="space-y-3">
                                    <div>
                                      <p className="text-xs uppercase tracking-wide text-ink-muted">
                                        Current matches
                                      </p>
                                      {poolMatches.current.length === 0 ? (
                                        <p className="text-sm text-ink-muted">
                                          None live right now
                                        </p>
                                      ) : (
                                        <div className="mt-2 space-y-2">
                                          {poolMatches.current.map(
                                            renderMatchRow,
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <p className="text-xs uppercase tracking-wide text-ink-muted">
                                        Finished matches
                                      </p>
                                      {poolMatches.finished.length === 0 ? (
                                        <p className="text-sm text-ink-muted">
                                          No results recorded yet
                                        </p>
                                      ) : (
                                        <div className="mt-2 space-y-2">
                                          {poolMatches.finished.map(
                                            renderMatchRow,
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {poolMatches.other.length > 0 && (
                                      <div>
                                        <p className="text-xs uppercase tracking-wide text-ink-muted">
                                          Scheduled
                                        </p>
                                        <div className="mt-2 space-y-2">
                                          {poolMatches.other.map((match) => (
                                            <div
                                              key={match.id}
                                              className="rounded border border-dashed border-border p-2 text-xs"
                                            >
                                              <div className="flex justify-between text-[11px] uppercase tracking-wide text-ink-muted">
                                                <span>
                                                  {formatDateTime(
                                                    match.start_time,
                                                  )}
                                                </span>
                                                <span>
                                                  {match.status || "Pending"}
                                                </span>
                                              </div>
                                              <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-semibold">
                                                <div className="truncate">
                                                  {match.team_a?.name ||
                                                    "Team A"}
                                                </div>
                                                <div className="text-center">
                                                  vs
                                                </div>
                                                <div className="truncate text-right">
                                                  {match.team_b?.name ||
                                                    "Team B"}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </Panel>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </>
            )}
          </>
        )}
      </SectionShell>
    </div>
  );
}
