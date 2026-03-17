import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  Chip,
  Panel,
  SectionHeader,
  SectionShell,
} from "../../components/ui/primitives";
import { getMatchesByEvent } from "../../services/matchService";
import { getEventHierarchy } from "../../services/leagueService";
import { getMatchMediaDetails } from "../../utils/matchMedia";

export const EVENT_ID = "db83a03e-b2bc-455a-a916-abe849fc65ec";
export const EVENT_SLUG = "cpt-ow-nationals-2026";
export const EVENT_NAME = "CPT OW Nationals 2026";

const MATCH_LIMIT = 200;
const LIVE_STATUSES = new Set(["live", "halftime"]);
const FINISHED_STATUSES = new Set(["finished", "completed"]);
const DIVISION_PLACEHOLDERS = ["Open", "Women"];

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

const formatMatchStatus = (status) => {
  if (!status) return "Scheduled";
  const normalized = status.toString().trim().toLowerCase();
  if (!normalized) return "Scheduled";
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

const formatMatchTime = (value) => {
  if (!value) {
    return "Start time pending";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Start time pending";
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getCompletionTime = (match) => {
  const source = match.confirmed_at || match.start_time;
  if (!source) return null;
  const timestamp = new Date(source).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const isLiveMatch = (status) => LIVE_STATUSES.has((status || "").toLowerCase());
const isFinishedMatch = (status) =>
  FINISHED_STATUSES.has((status || "").toLowerCase());

const sortByStartTimeAsc = (a, b) => {
  const left = a.start_time ? new Date(a.start_time).getTime() : Infinity;
  const right = b.start_time ? new Date(b.start_time).getTime() : Infinity;
  return left - right;
};

const buildDivisionTeams = (division) => {
  const rows = [];
  const seen = new Set();
  (division?.pools || []).forEach((pool) => {
    (pool?.teams || []).forEach((entry) => {
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

const formatScoreDiff = (value) => {
  if (!Number.isFinite(value) || value === 0) return "0";
  return value > 0 ? `+${value}` : `${value}`;
};

const StandingsTable = ({ rows }) => {
  if (!rows.length) {
    return <p className="text-sm text-ink-muted">No standings available yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded border border-border bg-surface">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Team</th>
            <th className="px-3 py-2 text-left font-semibold">Win/Loss</th>
            <th className="px-3 py-2 text-left font-semibold">Played</th>
            <th className="px-3 py-2 text-left font-semibold">Score +/-</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id}
              style={{
                background:
                  index % 2 === 0
                    ? "var(--sc-surface)"
                    : "var(--sc-surface-muted)",
              }}
            >
              <td className="px-3 py-2">
                {row.shortName ? `${row.name} (${row.shortName})` : row.name}
              </td>
              <td className="px-3 py-2">{`${row.wins}-${row.losses}`}</td>
              <td className="px-3 py-2">{row.played}</td>
              <td className="px-3 py-2">{formatScoreDiff(row.scoreDiff)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const buildDivisionStandings = (division, matches) => {
  const teams = buildDivisionTeams(division);
  const standingsByTeam = new Map(
    teams.map((team) => [
      team.id,
      {
        ...team,
        wins: 0,
        losses: 0,
        played: 0,
        scoreDiff: 0,
      },
    ]),
  );

  const poolIds = new Set((division?.pools || []).map((pool) => pool.id));
  const divisionMatches = (matches || []).filter((match) => {
    if (match?.division_id === division?.id) return true;
    if (match?.pool_id && poolIds.has(match.pool_id)) return true;
    return false;
  });

  divisionMatches.forEach((match) => {
    if (!isFinishedMatch(match?.status)) return;
    if (typeof match?.score_a !== "number" || typeof match?.score_b !== "number") {
      return;
    }

    const teamAId = match.team_a?.id;
    const teamBId = match.team_b?.id;
    const teamAStanding = teamAId ? standingsByTeam.get(teamAId) : null;
    const teamBStanding = teamBId ? standingsByTeam.get(teamBId) : null;

    if (teamAStanding) {
      teamAStanding.played += 1;
      teamAStanding.scoreDiff += match.score_a - match.score_b;
      if (match.score_a > match.score_b) {
        teamAStanding.wins += 1;
      } else if (match.score_a < match.score_b) {
        teamAStanding.losses += 1;
      }
    }

    if (teamBStanding) {
      teamBStanding.played += 1;
      teamBStanding.scoreDiff += match.score_b - match.score_a;
      if (match.score_b > match.score_a) {
        teamBStanding.wins += 1;
      } else if (match.score_b < match.score_a) {
        teamBStanding.losses += 1;
      }
    }
  });

  return Array.from(standingsByTeam.values()).sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.scoreDiff - a.scoreDiff ||
      a.name.localeCompare(b.name),
  );
};

export default function CptOwNationals2026WorkspacePage() {
  const [matches, setMatches] = useState([]);
  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copyToast, setCopyToast] = useState(null);
  const [copyToastVisible, setCopyToastVisible] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadWorkspace() {
      setLoading(true);
      setError(null);
      try {
        const [rows, hierarchy] = await Promise.all([
          getMatchesByEvent(EVENT_ID, MATCH_LIMIT, {
            includeFinished: true,
          }),
          getEventHierarchy(EVENT_ID),
        ]);
        if (!ignore) {
          setMatches(rows || []);
          setEventData(hierarchy || null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err?.message || "Unable to load matches for this event.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadWorkspace();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!copyToast) {
      setCopyToastVisible(false);
      return undefined;
    }

    setCopyToastVisible(true);
    const fadeTimer = window.setTimeout(() => {
      setCopyToastVisible(false);
    }, 1800);
    const clearTimer = window.setTimeout(() => {
      setCopyToast(null);
    }, 2400);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [copyToast]);

  const liveMatches = useMemo(
    () =>
      matches
        .filter((match) => isLiveMatch(match.status))
        .sort(sortByStartTimeAsc),
    [matches],
  );

  const recentMatches = useMemo(
    () =>
      matches
        .filter((match) => isFinishedMatch(match.status))
        .sort(
          (a, b) => (getCompletionTime(b) ?? 0) - (getCompletionTime(a) ?? 0),
        ),
    [matches],
  );

  const scheduledMatches = useMemo(
    () =>
      matches
        .filter(
          (match) =>
            !isLiveMatch(match.status) && !isFinishedMatch(match.status),
        )
        .sort(sortByStartTimeAsc),
    [matches],
  );

  const sections = [
    {
      key: "live",
      title: "Live matches",
      description: "Tracking every live point as it happens.",
      dataset: liveMatches,
      empty: "No live matches right now.",
    },
    {
      key: "recent",
      title: "Recent finals",
      description: "Latest confirmed results from the desk.",
      dataset: recentMatches,
      empty: "No completed matches recorded yet.",
    },
    {
      key: "scheduled",
      title: "Scheduled",
      description: "Upcoming fixtures waiting for pull.",
      dataset: scheduledMatches,
      empty: "No scheduled matches on the calendar.",
    },
  ];

  const standingsByDivision = useMemo(() => {
    if (!eventData?.divisions?.length) return [];
    return eventData.divisions.map((division) => ({
      id: division.id,
      name: division.name || "Division",
      rows: buildDivisionStandings(division, matches),
    }));
  }, [eventData, matches]);

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

  const eventTitle = eventData?.name || EVENT_NAME;

  const renderMatchCard = (match) => {
    const liveOrFinal =
      isLiveMatch(match.status) || isFinishedMatch(match.status);
    const mediaDetails = getMatchMediaDetails(match);
    return (
      <Panel key={match.id} variant="tinted" className="space-y-4 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {match.event?.name || eventTitle}
            </p>
            <h3 className="text-lg font-semibold text-ink">
              {formatMatchup(match)}
            </h3>
            <p className="text-xs text-ink-muted">
              {formatMatchTime(match.start_time)}
            </p>
          </div>
          <div className="text-right">
            {liveOrFinal ? (
              <>
                <p className="text-2xl font-semibold text-accent">
                  {formatScoreLine(match)}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {formatMatchStatus(match.status)}
                </p>
              </>
            ) : (
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {formatMatchStatus(match.status)}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">
            {match.venue?.name || "Venue TBC"}
          </p>
          {mediaDetails ? (
            <a
              href={mediaDetails.url}
              target="_blank"
              rel="noreferrer"
              className="sc-button is-ghost text-xs"
            >
              {mediaDetails.providerLabel || "Watch"}
            </a>
          ) : (
            <span className="text-xs text-ink-muted">
              No media link attached
            </span>
          )}
        </div>
      </Panel>
    );
  };

  return (
    <div className="pb-16 text-ink">
      {copyToast && (
        <div className="fixed bottom-4 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 px-4">
          <div
            className={`sc-alert is-success text-center text-sm transition-opacity duration-500 ${
              copyToastVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            {copyToast}
          </div>
        </div>
      )}
      <SectionShell as="main" className="space-y-6 py-8">
        <Card className="space-y-3 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Operations workspace"
            title={eventTitle}
            description="Live, final, and scheduled matches for this event."
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              to={`/event-rules?eventId=${encodeURIComponent(EVENT_ID)}`}
              className="sc-button"
            >
              Event rules
            </Link>
            <Link
              to={`/event-rosters?eventId=${encodeURIComponent(EVENT_ID)}`}
              className="sc-button"
            >
              Team rosters
            </Link>
            <a
              href="https://wfdf.sport/2025/01/wfdf-publishes-2025-2028-ultimate-rules/"
              target="_blank"
              rel="noreferrer"
              className="sc-button"
            >
              WFDF rules
            </a>
          </div>
          {error && <div className="sc-alert is-error">{error}</div>}
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            eyebrow="Standings"
            title="Team standings"
            description="Completed match results summarized by division."
          />
          {loading && standingsByDivision.length === 0 ? (
            <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
              Loading standings...
            </Card>
          ) : standingsByDivision.length === 0 ? (
            <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
              No divisions configured for this event.
            </Card>
          ) : (
            <div className="space-y-4">
              {standingsByDivision.map((division) => (
                <Panel key={division.id} variant="muted" className="space-y-3 p-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-ink">
                    {division.name}
                  </p>
                  <StandingsTable rows={division.rows} />
                </Panel>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            eyebrow="Divisions"
            title="Teams by division"
            description="Placeholder blocks for the event divisions."
          />
          <div className="space-y-4">
            {DIVISION_PLACEHOLDERS.map((divisionName) => (
              <Panel key={divisionName} variant="muted" className="space-y-2 p-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-ink">
                  {divisionName}
                </p>
                <p className="text-sm text-ink-muted">
                  Placeholder for the {divisionName} division.
                </p>
              </Panel>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            eyebrow="Fields"
            title="Venue fields"
            description="Linked via the event setup wizard."
          />
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
                    <p className="text-sm font-semibold uppercase tracking-wide text-ink">
                      {city.cityLabel}
                    </p>
                    <ul className="mt-2 ml-4 space-y-2 border-l border-border pl-3">
                      {city.locations.map((location) => (
                        <li key={`${city.cityLabel}-${location.locationLabel}`}>
                          <p className="text-sm font-semibold text-ink-muted">
                            {location.locationLabel}
                          </p>
                          <ul className="mt-1 ml-4 grid gap-2 border-l border-border pl-3 sm:grid-cols-2">
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
                                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                                    <div>
                                      <p className="uppercase tracking-wide text-ink-muted">
                                        Venue
                                      </p>
                                      <p className="text-sm font-medium text-ink">
                                        {venue.nameLabel}
                                      </p>
                                    </div>
                                    {coordText ? (
                                      <div>
                                        <p className="uppercase tracking-wide text-ink-muted">
                                          Coordinates
                                        </p>
                                        <div className="flex items-center gap-2 text-ink-muted">
                                          <span>{coordText}</span>
                                          <button
                                            type="button"
                                            className="rounded border border-border p-1 text-ink-muted transition hover:text-ink"
                                            aria-label={`Copy ${venue.cityLabel}, ${venue.locationLabel} - ${venue.nameLabel} coordinates`}
                                            title="Copy coordinates"
                                            onClick={() =>
                                              copyToClipboard(coordText, () =>
                                                setCopyToast(
                                                  `Copied ${venue.cityLabel}, ${venue.locationLabel} - ${venue.nameLabel} coordinates`,
                                                ),
                                              )
                                            }
                                          >
                                            <svg
                                              xmlns="http://www.w3.org/2000/svg"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              className="h-3.5 w-3.5"
                                              aria-hidden="true"
                                            >
                                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                            </svg>
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        <p className="uppercase tracking-wide text-ink-muted">
                                          Coordinates
                                        </p>
                                        <p className="text-ink-muted">Not set</p>
                                      </div>
                                    )}
                                  </div>
                                  {venue.notes && (
                                    <p className="mt-1 text-xs text-ink-muted">
                                      {venue.notes}
                                    </p>
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
        </Card>

        <Card className="space-y-6 p-5 sm:p-6">
          <SectionHeader
            eyebrow="Matches"
            title="Match overview"
            description="Live, recent, and scheduled matches for this event."
          />
          <div className="space-y-6">
            {sections.map((section) => (
              <Panel key={section.key} variant="muted" className="space-y-4 p-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-ink">
                    {section.title}
                  </p>
                  <p className="text-sm text-ink-muted">{section.description}</p>
                </div>
                {loading && section.dataset.length === 0 ? (
                  <Card
                    variant="muted"
                    className="p-5 text-center text-sm text-ink-muted"
                  >
                    Loading matches...
                  </Card>
                ) : section.dataset.length === 0 ? (
                  <Card
                    variant="muted"
                    className="p-5 text-center text-sm text-ink-muted"
                  >
                    {section.empty}
                  </Card>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {section.dataset.map((match) => renderMatchCard(match))}
                  </div>
                )}
              </Panel>
            ))}
          </div>
        </Card>
      </SectionShell>
    </div>
  );
}
