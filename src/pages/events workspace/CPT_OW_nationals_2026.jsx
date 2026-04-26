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

export const EVENT_ID = "db83a03e-b2bc-455a-a916-abe849fc65ec";
export const EVENT_SLUG = "cpt-ow-nationals-2026";
export const EVENT_NAME = "CPT OW Nationals 2026";
const MATCH_LIMIT = 200;
const LIVE_STATUSES = new Set(["live", "halftime"]);
const FINISHED_STATUSES = new Set(["finished", "completed"]);
const SECTION_GRID_CLASS =
  "grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr))]";
const VENUE_GRID_CLASS =
  "flex flex-wrap gap-2";
const MATCH_GRID_CLASS =
  "grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]";
const FRIDAY_MATCH_GRID_CLASS =
  "grid justify-start gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),18rem))]";
const SCHEDULE_TIMEZONE = "Africa/Johannesburg";
const SCHEDULE_DAY_KEYS = {
  day0: "2026-04-24",
  day1: "2026-04-25",
  day2: "2026-04-26",
  day3: "2026-04-27",
};
const SCHEDULE_DAYS = [
  {
    key: SCHEDULE_DAY_KEYS.day0,
    title: "Friday 24 Apr",
    mode: "ordered",
  },
  {
    key: SCHEDULE_DAY_KEYS.day1,
    title: "Saturday 25 Apr",
    mode: "pools",
  },
  {
    key: SCHEDULE_DAY_KEYS.day2,
    title: "Sunday 26 Apr",
    mode: "pools-with-semis",
  },
  {
    key: SCHEDULE_DAY_KEYS.day3,
    title: "Monday 27 Apr",
    mode: "divisions",
  },
];

const getMatchGridClass = (dayKey) =>
  dayKey === SCHEDULE_DAY_KEYS.day0 ? FRIDAY_MATCH_GRID_CLASS : MATCH_GRID_CLASS;

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
    timeZone: SCHEDULE_TIMEZONE,
  });
};

const formatDateKey = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: SCHEDULE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const getScheduleMinutes = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: SCHEDULE_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

const isLiveMatch = (status) => LIVE_STATUSES.has((status || "").toLowerCase());
const isFinishedMatch = (status) =>
  FINISHED_STATUSES.has((status || "").toLowerCase());

const sortByStartTimeAsc = (a, b) => {
  const left = a.start_time ? new Date(a.start_time).getTime() : Infinity;
  const right = b.start_time ? new Date(b.start_time).getTime() : Infinity;
  return left - right;
};

const buildPoolLookup = (divisions = []) => {
  const lookup = new Map();
  (divisions || []).forEach((division, divisionIndex) => {
    (division?.pools || []).forEach((pool, poolIndex) => {
      lookup.set(pool.id, {
        id: pool.id,
        name: pool.name || "Pool",
        order: divisionIndex * 100 + poolIndex,
      });
    });
  });
  return lookup;
};

const buildDivisionLookup = (divisions = []) => {
  const lookup = new Map();
  (divisions || []).forEach((division, divisionIndex) => {
    if (!division?.id) return;
    lookup.set(division.id, {
      id: division.id,
      name: division.name || "Division",
      order: divisionIndex,
    });
  });
  return lookup;
};

const normalizeScheduleText = (value) =>
  (typeof value === "string" ? value.trim().toLowerCase() : "");

const matchIncludesSemiFinalLabel = (match, poolLookup) => {
  const poolName = normalizeScheduleText(poolLookup.get(match?.pool_id)?.name);
  const teamAName = normalizeScheduleText(match?.team_a?.name);
  const teamBName = normalizeScheduleText(match?.team_b?.name);
  const venueName = normalizeScheduleText(match?.venue?.name);
  const searchable = [poolName, teamAName, teamBName, venueName].join(" ");
  return /(?:\bsf\s*\d*\b|\bsemi[-\s]?finals?\b|\bsemifinals?\b)/.test(searchable);
};

const isDayTwoSemiFinal = (match, poolLookup) => {
  if (formatDateKey(match?.start_time) !== SCHEDULE_DAY_KEYS.day2) {
    return false;
  }
  if (matchIncludesSemiFinalLabel(match, poolLookup)) {
    return true;
  }

  const startMinutes = getScheduleMinutes(match?.start_time);
  if (startMinutes === null || startMinutes < 18 * 60) {
    return false;
  }

  return true;
};

const buildPoolGroups = (matchesForDay = [], poolLookup) => {
  const groups = new Map();

  matchesForDay.forEach((match) => {
    const pool = poolLookup.get(match?.pool_id);
    const groupKey = pool?.id || "unassigned";
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        title: pool?.name || "Unassigned matches",
        order: pool?.order ?? Number.MAX_SAFE_INTEGER,
        matches: [],
      });
    }
    groups.get(groupKey).matches.push(match);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      matches: [...group.matches].sort(sortByStartTimeAsc),
    }))
    .sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.title.localeCompare(right.title);
    });
};

const buildDivisionGroups = (matchesForDay = [], divisionLookup) => {
  const groups = new Map();

  matchesForDay.forEach((match) => {
    const division = divisionLookup.get(match?.division_id);
    const groupKey = division?.id || "unassigned";
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        title: division?.name || "Unassigned matches",
        order: division?.order ?? Number.MAX_SAFE_INTEGER,
        matches: [],
      });
    }
    groups.get(groupKey).matches.push(match);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      matches: [...group.matches].sort(sortByStartTimeAsc),
    }))
    .sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.title.localeCompare(right.title);
    });
};

const buildDailySchedule = (matches = [], poolLookup, divisionLookup) =>
  SCHEDULE_DAYS.map((day) => {
    const dayMatches = (matches || [])
      .filter((match) => formatDateKey(match?.start_time) === day.key)
      .sort(sortByStartTimeAsc);
    const semifinalMatches =
      day.key === SCHEDULE_DAY_KEYS.day2
        ? dayMatches.filter((match) => isDayTwoSemiFinal(match, poolLookup))
        : [];
    const poolMatches =
      day.key === SCHEDULE_DAY_KEYS.day2
        ? dayMatches.filter((match) => !isDayTwoSemiFinal(match, poolLookup))
        : dayMatches;

    return {
      ...day,
      matches: dayMatches,
      poolGroups:
        day.mode === "ordered"
          ? []
          : day.mode === "divisions"
            ? buildDivisionGroups(poolMatches, divisionLookup)
            : buildPoolGroups(poolMatches, poolLookup),
      semifinalMatches,
    };
  });

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

const StandingsTable = ({ rows }) => {
  if (!rows.length) {
    return <p className="text-sm text-ink-muted">No standings available yet.</p>;
  }
  return (
    <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded border border-border bg-surface">
      <table className="w-full min-w-max whitespace-nowrap text-sm">
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-3 py-1.5 text-left font-semibold">Team</th>
            <th className="px-3 py-1.5 text-center font-semibold">Win/Loss</th>
            <th className="px-3 py-1.5 text-center font-semibold">Played</th>
            <th className="px-3 py-1.5 text-center font-semibold">Score +/-</th>
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
              <td className="px-3 py-1.5">
                {row.shortName ? `${row.name} (${row.shortName})` : row.name}
              </td>
              <td className="px-3 py-1.5 text-center">{`${row.wins}-${row.losses}`}</td>
              <td className="px-3 py-1.5 text-center">{row.played}</td>
              <td className="px-3 py-1.5 text-center">{formatScoreDiff(row.scoreDiff)}</td>
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
      },
    ]),
  );

  const poolMatches = (matches || []).filter((match) => match?.pool_id === pool?.id);

  poolMatches.forEach((match) => {
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
  const poolLookup = useMemo(
    () => buildPoolLookup(eventData?.divisions || []),
    [eventData?.divisions],
  );
  const divisionLookup = useMemo(
    () => buildDivisionLookup(eventData?.divisions || []),
    [eventData?.divisions],
  );
  const dailySchedule = useMemo(
    () => buildDailySchedule(matches, poolLookup, divisionLookup),
    [matches, poolLookup, divisionLookup],
  );

  const renderMatchCard = (match, options = {}) => {
    const liveOrFinal =
      isLiveMatch(match.status) || isFinishedMatch(match.status);
    return (
      <StandardEventMatchCard
        key={match.id}
        match={match}
        title={options.title || formatMatchup(match)}
        meta={formatMatchTime(match.start_time)}
        score={liveOrFinal ? formatScoreLine(match) : null}
        status={formatMatchStatus(match.status)}
        hideEyebrow
        compact
      />
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
          {loading && standingsByPool.length === 0 ? (
            <Card variant="muted" className="p-3 text-center text-sm text-ink-muted">
              Loading standings...
            </Card>
          ) : standingsByPool.length === 0 ? (
            <Card variant="muted" className="p-3 text-center text-sm text-ink-muted">
              No pools configured for this event.
            </Card>
          ) : (
            <div className={SECTION_GRID_CLASS}>
              {standingsByPool.map((pool) => (
                <Panel key={pool.id} variant="muted" className="min-w-0 space-y-2 border border-white/50 p-3">
                  <p className="text-sm font-semibold uppercase tracking-wide text-ink">
                    {pool.name}
                  </p>
                  <StandingsTable rows={pool.rows} />
                </Panel>
              ))}
            </div>
          )}
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
            title="Daily schedule"
          />
          <div className="divide-y divide-white/30">
            {dailySchedule.map((day) => (
              <div key={day.key} className="min-w-0 space-y-3 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-ink">{day.title}</p>
                  </div>
                  <Chip>{day.matches.length} matches</Chip>
                </div>
                {loading && day.matches.length === 0 ? (
                  <p className="rounded border border-border bg-surface/70 p-2 text-center text-sm text-ink-muted">
                    Loading matches...
                  </p>
                ) : day.matches.length === 0 ? (
                  <p className="rounded border border-border bg-surface/70 p-2 text-center text-sm text-ink-muted">
                    No matches scheduled for this day.
                  </p>
                ) : day.mode === "ordered" ? (
                  <div className={getMatchGridClass(day.key)}>
                    {day.matches.map((match) =>
                      renderMatchCard(match),
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {day.poolGroups.map((poolGroup) => (
                      <div
                        key={`${day.key}-${poolGroup.key}`}
                        className="min-w-0 space-y-2 border-t border-white/20 pt-2 first:border-t-0 first:pt-0"
                      >
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold uppercase tracking-wide text-ink">
                              {poolGroup.title}
                            </p>
                          </div>
                          <Chip>{poolGroup.matches.length} matches</Chip>
                        </div>
                        <div className={getMatchGridClass(day.key)}>
                          {poolGroup.matches.map((match) =>
                            renderMatchCard(match),
                          )}
                        </div>
                      </div>
                    ))}

                    {day.semifinalMatches.length > 0 ? (
                      <div className="min-w-0 space-y-2 border-t border-white/25 pt-3">
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold uppercase tracking-wide text-ink">
                              Semi-finals
                            </p>
                          </div>
                          <Chip>{day.semifinalMatches.length} matches</Chip>
                        </div>
                        <div className={getMatchGridClass(day.key)}>
                          {day.semifinalMatches.map((match, index) => {
                            const semiLabel = `SF${index + 1}`;
                            return renderMatchCard(match, {
                              title: `${semiLabel}: ${formatMatchup(match)}`,
                            });
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </SectionShell>
    </div>
  );
}
