import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  MatchCard,
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

const formatMatchup = (match) => {
  const teamA = match.team_a?.name || "Team A";
  const teamB = match.team_b?.name || "Team B";
  return `${teamA} vs ${teamB}`;
};

const formatScoreLine = (match) => {
  const scoreA =
    typeof match.score_a === "number" ? match.score_a.toString() : "-";
  const scoreB =
    typeof match.score_b === "number" ? match.score_b.toString() : "-";
  return `${scoreA} - ${scoreB}`;
};

const formatMatchStatus = (status, fallback = "Scheduled") => {
  const normalized = (status || "").toString().trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const normalizeSortText = (value) =>
  (typeof value === "string" ? value.trim().toLowerCase() : "");

const sortVenuesByCityLocationName = (venues = []) =>
  [...venues].sort((left, right) => {
    const leftCity = normalizeSortText(left?.city);
    const rightCity = normalizeSortText(right?.city);
    if (leftCity !== rightCity) return leftCity.localeCompare(rightCity);

    const leftLocation = normalizeSortText(left?.location);
    const rightLocation = normalizeSortText(right?.location);
    if (leftLocation !== rightLocation) return leftLocation.localeCompare(rightLocation);

    const leftName = normalizeSortText(left?.name);
    const rightName = normalizeSortText(right?.name);
    return leftName.localeCompare(rightName);
  });

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
const renderMatchRow = (match, options = {}) => {
  const { showScore = false } = options;
  const matchHref = match?.id ? `/matches?matchId=${match.id}` : null;
  const component = matchHref ? Link : "article";
  const linkProps = matchHref ? { to: matchHref } : {};
  return (
    <MatchCard
      key={match.id}
      as={component}
      variant="tinted"
      className={matchHref ? "cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--sc-accent)]/50" : ""}
      eyebrow={match.event?.name || "Match"}
      title={formatMatchup(match)}
      venue={match.venue}
      meta={formatDateTime(match.start_time)}
      score={showScore ? formatScoreLine(match) : null}
      status={formatMatchStatus(match.status, showScore ? "Final" : "Scheduled")}
      scoreAlign={showScore ? "right" : "left"}
      {...linkProps}
    />
  );
};
export default function DROwLeague26Page() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [matchesByPool, setMatchesByPool] = useState({});
  const [copyToast, setCopyToast] = useState(null);

  const sortedVenues = useMemo(
    () => sortVenuesByCityLocationName(eventData?.venues || []),
    [eventData?.venues],
  );

  const venuesByCity = useMemo(() => {
    const cityMap = new Map();
    sortedVenues.forEach((venue) => {
      const cityLabel = venue.city?.trim() || "City TBD";
      const locationLabel = venue.location?.trim() || "Location TBD";
      const nameLabel = venue.name?.trim() || "Venue";

      if (!cityMap.has(cityLabel)) {
        cityMap.set(cityLabel, new Map());
      }
      const locationMap = cityMap.get(cityLabel);
      if (!locationMap.has(locationLabel)) {
        locationMap.set(locationLabel, []);
      }

      locationMap.get(locationLabel).push({
        ...venue,
        cityLabel,
        locationLabel,
        nameLabel,
      });
    });

    return Array.from(cityMap.entries()).map(([cityLabel, locationMap]) => ({
      cityLabel,
      locations: Array.from(locationMap.entries()).map(([locationLabel, venues]) => ({
        locationLabel,
        venues,
      })),
    }));
  }, [sortedVenues]);

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
                  <Chip>{sortedVenues.length}</Chip>
                </div>
                {venuesByCity.length ? (
                  <ul className="space-y-3">
                    {venuesByCity.map((city) => (
                      <li key={city.cityLabel} className="rounded-lg border border-border bg-surface p-3">
                        <p className="text-sm font-semibold uppercase tracking-wide text-ink">{city.cityLabel}</p>
                        <ul className="mt-2 ml-4 space-y-2 border-l border-border pl-3">
                          {city.locations.map((location) => (
                            <li key={`${city.cityLabel}-${location.locationLabel}`}>
                              <p className="text-sm font-semibold text-ink-muted">{location.locationLabel}</p>
                              <ul className="mt-1 ml-4 space-y-2 border-l border-border pl-3">
                                {location.venues.map((venue) => {
                                  const coordText =
                                    typeof venue.latitude === "number" &&
                                    !Number.isNaN(venue.latitude) &&
                                    typeof venue.longitude === "number" &&
                                    !Number.isNaN(venue.longitude)
                                      ? `${venue.latitude.toFixed(4)}, ${venue.longitude.toFixed(4)}`
                                      : "";
                                  return (
                                    <li
                                      key={venue.id}
                                      className="rounded-md border border-border bg-surface-muted px-3 py-2"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-medium text-ink">{venue.nameLabel}</p>
                                        <button
                                          type="button"
                                          disabled={!coordText}
                                          className="sc-button is-ghost text-[11px] uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
                                          onClick={() =>
                                            copyToClipboard(coordText, () =>
                                              setCopyToast(
                                                `Copied ${venue.cityLabel}, ${venue.locationLabel} - ${venue.nameLabel} coordinates`,
                                              ),
                                            )
                                          }
                                        >
                                          Copy coordiantes
                                        </button>
                                      </div>
                                      {venue.notes && (
                                        <p className="mt-1 text-xs text-ink-muted">{venue.notes}</p>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
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
                                <div className="space-y-4">
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-ink-muted">
                                      Teams
                                    </p>
                                    <TeamTable
                                      rows={(pool.teams || [])
                                        .map((entry) => ({
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
                                        }))
                                        .sort((a, b) => {
                                          if (a.seed !== null && b.seed !== null) {
                                            return a.seed - b.seed || a.name.localeCompare(b.name);
                                          }
                                          if (a.seed !== null) return -1;
                                          if (b.seed !== null) return 1;
                                          return a.name.localeCompare(b.name);
                                        })}
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
                                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                                          {poolMatches.current.map((match) =>
                                            renderMatchRow(match, { showScore: true }),
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
                                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                                          {poolMatches.finished.map((match) =>
                                            renderMatchRow(match, { showScore: true }),
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {poolMatches.other.length > 0 && (
                                      <div>
                                        <p className="text-xs uppercase tracking-wide text-ink-muted">
                                          Scheduled
                                        </p>
                                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                                          {poolMatches.other.map((match) =>
                                            renderMatchRow(match, { showScore: false }),
                                          )}
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
