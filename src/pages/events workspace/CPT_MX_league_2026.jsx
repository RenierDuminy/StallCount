import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  Chip,
  Panel,
  SectionHeader,
  SectionShell,
} from "../../components/ui/primitives";
import { StandardEventMatchCard } from "../../components/StandardEventMatchCard";
import { getMatchesByEvent } from "../../services/matchService";
import { getEventHierarchy } from "../../services/leagueService";

export const EVENT_ID = "1952f80d-f534-46d8-93ef-136e045429fc";
export const EVENT_SLUG = "ctfda-mx-league";
export const EVENT_NAME = "CTFDA MX League";
export const EVENT_WORKSPACE_PRIORITY = 10;
const MATCH_LIMIT = 200;
const FINISHED_STATUSES = new Set(["finished", "completed"]);
const CANCELED_STATUSES = new Set(["canceled", "cancelled"]);
const TEAM_STANDINGS_GRID_STYLE = {
  gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
};
const VENUE_GRID_CLASS =
  "flex flex-wrap gap-2";

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

const isFinishedMatch = (status) =>
  FINISHED_STATUSES.has((status || "").toLowerCase());
const isCanceledMatch = (status) =>
  CANCELED_STATUSES.has((status || "").toLowerCase());

const buildPoolTeams = (pool) => {
  const rows = [];
  const seen = new Set();
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

const formatMatchTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatScheduleDayLabel = (value) => {
  if (!value) return "Date TBC";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date TBC";
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
};

const formatMatchup = (match) => {
  const teamA = match?.team_a?.name || "Team A";
  const teamB = match?.team_b?.name || "Team B";
  return `${teamA} vs ${teamB}`;
};

const formatScoreLine = (match) => {
  const scoreA =
    typeof match?.score_a === "number" ? match.score_a.toString() : "-";
  const scoreB =
    typeof match?.score_b === "number" ? match.score_b.toString() : "-";
  return `${scoreA} - ${scoreB}`;
};

const formatMatchStatus = (status, fallback = "Scheduled") => {
  const normalized = (status || "").toString().trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

// Desktop: size the match-card grid to how many matches that day has so the
// cards expand to fill the row instead of leaving a fixed 3-column gap.
const getScheduleGridClass = (matchCount) => {
  if (matchCount <= 1) return "grid gap-2";
  if (matchCount === 2) return "grid gap-2 md:grid-cols-2";
  return "grid gap-2 md:grid-cols-2 2xl:grid-cols-3";
};

const buildScheduleDays = (matches = []) => {
  const buckets = new Map();
  matches.forEach((match) => {
    const startTime = match?.start_time || null;
    const dayKey = startTime
      ? new Date(startTime).toISOString().slice(0, 10)
      : "tbc";
    if (!buckets.has(dayKey)) {
      buckets.set(dayKey, { key: dayKey, startTime, matches: [] });
    }
    buckets.get(dayKey).matches.push(match);
  });

  const days = Array.from(buckets.values());
  days.forEach((day) => {
    day.matches.sort((a, b) => {
      const aTime = a?.start_time ? new Date(a.start_time).getTime() : Infinity;
      const bTime = b?.start_time ? new Date(b.start_time).getTime() : Infinity;
      if (aTime !== bTime) return aTime - bTime;
      return formatMatchup(a).localeCompare(formatMatchup(b));
    });
  });
  days.sort((a, b) => {
    const aTime = a.startTime ? new Date(a.startTime).getTime() : Infinity;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : Infinity;
    return aTime - bTime;
  });
  return days;
};

// Split the schedule by division (top level), then by day within each division.
// `divisionNames` maps a division_id to its display name (from the hierarchy).
const buildScheduleDivisions = (matches = [], divisionNames = new Map()) => {
  const buckets = new Map();
  matches.forEach((match) => {
    const divisionId = match?.division_id || "unassigned";
    if (!buckets.has(divisionId)) {
      buckets.set(divisionId, { id: divisionId, matches: [] });
    }
    buckets.get(divisionId).matches.push(match);
  });

  const divisions = Array.from(buckets.values()).map((bucket) => ({
    id: bucket.id,
    name:
      bucket.id === "unassigned"
        ? "Unassigned"
        : divisionNames.get(bucket.id) || "Division",
    days: buildScheduleDays(bucket.matches),
  }));

  divisions.sort((a, b) => {
    if (a.id === "unassigned") return 1;
    if (b.id === "unassigned") return -1;
    return a.name.localeCompare(b.name);
  });
  return divisions;
};

// Form-guide dots shown under each team name in the standings.
const FORM_DOT_COLORS = {
  win: "#16a34a", // green
  loss: "#eab308", // yellow
  canceled: "#dc2626", // red
  scheduled: "#9ca3af", // gray (not yet played)
  draw: "#9ca3af", // gray (finished, level score)
};

const FORM_OUTCOME_LABELS = {
  win: "Win",
  loss: "Loss",
  canceled: "Canceled",
  scheduled: "Scheduled",
  draw: "Draw",
};

const FORM_LEGEND_ITEMS = ["win", "loss", "canceled", "scheduled"];

const getTeamMatchOutcome = (match, teamScore, oppScore) => {
  if (isCanceledMatch(match?.status)) return "canceled";
  if (
    isFinishedMatch(match?.status) &&
    typeof teamScore === "number" &&
    typeof oppScore === "number"
  ) {
    if (teamScore > oppScore) return "win";
    if (teamScore < oppScore) return "loss";
    return "draw";
  }
  return "scheduled";
};

const buildTeamFormEntry = (match, opponent, teamScore, oppScore) => {
  const outcome = getTeamMatchOutcome(match, teamScore, oppScore);
  const opponentName = opponent?.short_name || opponent?.name || "TBD";
  const hasScore =
    outcome !== "scheduled" &&
    typeof teamScore === "number" &&
    typeof oppScore === "number";
  const scorePart = hasScore ? ` ${teamScore}-${oppScore}` : "";
  return {
    outcome,
    title: `${FORM_OUTCOME_LABELS[outcome]}${scorePart} vs ${opponentName}`,
  };
};

const FormDots = ({ form, className = "", dotClassName = "h-1.5 w-1.5", wrap = true }) => {
  if (!form?.length) return null;
  return (
    <div className={`flex ${wrap ? "flex-wrap" : "flex-nowrap"} gap-0.5 ${className}`} aria-hidden="true">
      {form.map((entry, index) => (
        <span
          key={index}
          title={entry.title}
          className={`inline-block rounded-full ${dotClassName}`}
          style={{ backgroundColor: FORM_DOT_COLORS[entry.outcome] || FORM_DOT_COLORS.scheduled }}
        />
      ))}
    </div>
  );
};

const FormLegend = () => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-wide text-ink-muted">
    {FORM_LEGEND_ITEMS.map((outcome) => (
      <span key={outcome} className="inline-flex items-center gap-1">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: FORM_DOT_COLORS[outcome] }}
        />
        {FORM_OUTCOME_LABELS[outcome]}
      </span>
    ))}
  </div>
);

const StandingsTable = ({ rows }) => {
  if (!rows.length) {
    return <p className="text-sm text-ink-muted">No standings available yet.</p>;
  }
  return (
    <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded border border-border bg-surface">
      <table className="w-full table-auto whitespace-nowrap text-xs">
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="w-full px-1 py-1 text-left font-semibold">Team</th>
            <th className="whitespace-nowrap px-2 py-1 text-center font-semibold">Form</th>
            <th className="w-10 px-0.5 py-1 text-center font-semibold">W-L</th>
            <th className="w-9 px-0.5 py-1 text-center font-semibold">+/-</th>
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
              <td className="min-w-0 px-1 py-1 align-top" title={row.name}>
                <span className="block truncate">
                  {row.name}
                </span>
              </td>
              <td className="whitespace-nowrap px-2 py-1 align-middle">
                <FormDots form={row.form} className="justify-center" dotClassName="h-[7px] w-[7px]" wrap={false} />
              </td>
              <td className="px-0.5 py-1 text-center align-top tabular-nums">{`${row.wins}-${row.losses}`}</td>
              <td className="px-0.5 py-1 text-center align-top tabular-nums">{formatScoreDiff(row.scoreDiff)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const buildPoolStandings = (pool, matches) => {
  const teams = buildPoolTeams(pool);
  const standingsByTeam = new Map(
    teams.map((team) => [
      team.id,
      {
        ...team,
        wins: 0,
        losses: 0,
        played: 0,
        scoreDiff: 0,
        form: [],
      },
    ]),
  );

  const poolMatches = (matches || []).filter((match) => match?.pool_id === pool?.id);

  poolMatches.forEach((match) => {
    const teamAId = match.team_a?.id;
    const teamBId = match.team_b?.id;
    const teamAStanding = teamAId ? standingsByTeam.get(teamAId) : null;
    const teamBStanding = teamBId ? standingsByTeam.get(teamBId) : null;

    // Record a form dot for every match (played, canceled, or still scheduled).
    if (teamAStanding) {
      teamAStanding.form.push(
        buildTeamFormEntry(match, match.team_b, match.score_a, match.score_b),
      );
    }
    if (teamBStanding) {
      teamBStanding.form.push(
        buildTeamFormEntry(match, match.team_a, match.score_b, match.score_a),
      );
    }

    if (!isFinishedMatch(match?.status)) return;
    if (typeof match?.score_a !== "number" || typeof match?.score_b !== "number") {
      return;
    }

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

export default function CptMxLeagueWorkspacePage() {
  const [matches, setMatches] = useState([]);
  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copyToast, setCopyToast] = useState(null);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const [venueFieldsOpen, setVenueFieldsOpen] = useState(false);

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

  const standingsByPool = useMemo(() => {
    if (!eventData?.divisions?.length) return [];
    return eventData.divisions.flatMap((division, divisionIndex) =>
      (division?.pools || []).map((pool, poolIndex) => ({
        id: pool.id || `${division.id || divisionIndex}-${poolIndex}`,
        name: pool.name || "Pool",
        rows: buildPoolStandings(pool, matches),
      })),
    );
  }, [eventData, matches]);

  const scheduleDivisions = useMemo(() => {
    const divisionNames = new Map(
      (eventData?.divisions || []).map((division) => [division.id, division.name]),
    );
    return buildScheduleDivisions(matches, divisionNames);
  }, [matches, eventData]);

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
      <SectionShell as="main" className="w-full max-w-none space-y-4 py-4 sm:py-5">
        <Card className="min-w-0 space-y-3 border border-white/70 p-3 sm:p-4">
          <SectionHeader
            title={eventTitle}
          />
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:flex-row sm:flex-wrap sm:justify-end">
            <Link
              to={`/event-rules?eventId=${encodeURIComponent(EVENT_ID)}`}
              className="sc-button w-full whitespace-nowrap sm:w-auto"
            >
              Event rules
            </Link>
            <Link
              to={`/event-rosters?eventId=${encodeURIComponent(EVENT_ID)}`}
              className="sc-button w-full whitespace-nowrap sm:w-auto"
            >
              Team rosters
            </Link>
            <Link
              to={`/players?eventId=${encodeURIComponent(EVENT_ID)}`}
              className="sc-button w-full whitespace-nowrap sm:w-auto"
            >
              Player standings
            </Link>
            <a
              href="https://wfdf.sport/2025/01/wfdf-publishes-2025-2028-ultimate-rules/"
              target="_blank"
              rel="noreferrer"
              className="sc-button w-full whitespace-nowrap sm:w-auto"
            >
              WFDF rules
            </a>
          </div>
          {error && <div className="sc-alert is-error">{error}</div>}
        </Card>

        <Card className="min-w-0 space-y-3 border border-white/70 p-3 sm:p-4">
          <SectionHeader
            title="Team standings"
          />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Final standings
            </p>
            <Panel
              variant="muted"
              className="border border-white/50 p-4 text-center text-sm font-semibold uppercase tracking-wide text-ink-muted"
            >
              TBC
            </Panel>
          </div>
          <div className="border-t border-white/30 pt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Division standings
              </p>
              <FormLegend />
            </div>
          {loading && standingsByPool.length === 0 ? (
            <Card variant="muted" className="p-3 text-center text-sm text-ink-muted">
              Loading standings...
            </Card>
          ) : standingsByPool.length === 0 ? (
            <Card variant="muted" className="p-3 text-center text-sm text-ink-muted">
              No pools configured for this event.
            </Card>
          ) : (
            <div className="grid items-start gap-2" style={TEAM_STANDINGS_GRID_STYLE}>
              {standingsByPool.map((pool) => (
                <Panel key={pool.id} variant="muted" className="min-w-0 space-y-1.5 border border-white/50 p-2">
                  <p className="truncate text-xs font-semibold uppercase tracking-wide text-ink" title={pool.name}>
                    {pool.name}
                  </p>
                  <StandingsTable rows={pool.rows} />
                </Panel>
              ))}
            </div>
          )}
          </div>
        </Card>

        <Card className="min-w-0 space-y-2 border border-white/70 p-3 sm:p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={venueFieldsOpen}
            onClick={() => setVenueFieldsOpen((open) => !open)}
          >
            <span className="text-xl font-semibold text-ink">Fields</span>
            <span className="flex shrink-0 items-center gap-2">
              <Chip>{sortedVenues.length}</Chip>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-5 w-5 text-ink-muted transition-transform ${
                  venueFieldsOpen ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </button>
          {venueFieldsOpen ? (
            <Panel variant="muted" className="min-w-0 space-y-2 border border-white/50 p-3">
              {venuesByCity.length ? (
                <ul className="space-y-1.5">
                  {venuesByCity.map((city) => (
                    <li key={city.cityLabel} className="rounded-lg border border-border bg-surface p-2">
                      <p className="text-sm font-semibold uppercase tracking-wide text-ink">
                        {city.cityLabel}
                      </p>
                      <ul className="mt-1.5 space-y-1.5 border-l border-border pl-2 sm:ml-1.5">
                        {city.locations.map((location) => (
                          <li key={`${city.cityLabel}-${location.locationLabel}`}>
                            <p className="text-sm font-semibold text-ink-muted">
                              {location.locationLabel}
                            </p>
                            <ul className={`mt-1 border-l border-border pl-2 sm:ml-1.5 ${VENUE_GRID_CLASS}`}>
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
                                    className="flex w-fit min-w-[8.5rem] max-w-full items-center justify-between gap-2 rounded-md border border-border bg-surface-muted px-2 py-1.5"
                                  >
                                    <div className="min-w-0 max-w-[12rem]">
                                      <p className="truncate text-sm font-medium text-ink">
                                        {venue.nameLabel}
                                      </p>
                                    </div>
                                    {coordText ? (
                                      <button
                                        type="button"
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-ink-muted transition hover:text-ink"
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
                                          className="h-5 w-5"
                                          aria-hidden="true"
                                        >
                                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                      </button>
                                    ) : (
                                      <span className="shrink-0 text-xs text-ink-muted">
                                        No coords
                                      </span>
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
          ) : null}
        </Card>

        <Card className="min-w-0 space-y-3 border border-white/70 p-3 sm:p-4">
          <SectionHeader
            title="Matches"
          />
          {scheduleDivisions.length ? (
            <div className="space-y-6">
              {scheduleDivisions.map((division) => (
                <div key={division.id} className="min-w-0 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">
                    {division.name}
                  </h3>
                  {division.days.map((day) => (
                    <div key={day.key} className="min-w-0 space-y-2">
                      <h4 className="text-sm font-semibold text-ink-muted">
                        {formatScheduleDayLabel(day.startTime)}
                      </h4>
                      <div className={getScheduleGridClass(day.matches.length)}>
                        {day.matches.map((match) => {
                          const showScore = isFinishedMatch(match.status);
                          return (
                            <StandardEventMatchCard
                              key={match.id}
                              match={match}
                              eyebrow={
                                match.start_time
                                  ? formatMatchTime(match.start_time)
                                  : "Time TBC"
                              }
                              hideEyebrow={false}
                              title={formatMatchup(match)}
                              score={showScore ? formatScoreLine(match) : null}
                              status={formatMatchStatus(
                                match.status,
                                showScore ? "Final" : "Scheduled",
                              )}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <Panel
              variant="muted"
              className="border border-white/50 p-4 text-center text-sm font-semibold uppercase tracking-wide text-ink-muted"
            >
              TBC
            </Panel>
          )}
        </Card>
      </SectionShell>
    </div>
  );
}
