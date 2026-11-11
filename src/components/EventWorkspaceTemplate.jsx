import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  Chip,
  Panel,
  SectionHeader,
  SectionShell,
} from "./ui/primitives";
import { StandardEventMatchCard } from "./StandardEventMatchCard";
import { isForfeitStatus } from "../constants/statusCodes";
import {
  StandardStandingsLegend,
  StandardStandingsTable,
} from "./StandardStandingsTable";
import {
  isFinishedMatch,
} from "../utils/standings";
import {
  EVENT_PAGE_CACHE_TTL_MS,
  getEventPageData,
  getEventPageDataKey,
} from "../services/eventPageService";
import { useCachedQuery } from "../hooks/useCachedQuery";
import {
  buildFinalStandings,
  buildPoolStandings,
  getPlayoffMatchIds,
  getFinalStandingsModes,
  isCompletedEventStatus,
} from "../utils/eventStandings";
import BracketStructureView from "../pages/playoff/BracketStructureView";
import StandingsRulesInfo from "./StandingsRulesInfo";
import GetTheAppCard from "./GetTheAppCard";
import { buildVenueMapsUrl } from "../utils/mapsLink";
import EventFollowNotice from "./EventFollowNotice";

// Generic event workspace, modelled on the Stellenbosch Internal Draft League VI
// page. Everything except the rule documents is read from the database, so the
// same layout works for any event: pass `eventId`, and optionally the event's
// rule PDFs as `ruleDocuments` ([{ name, href }]). The Rules card is hidden when
// none are given. Once the event is marked completed, final standings (derived
// from the playoff placement games) replace the per-pool division standings.
const EMPTY_LIST = [];
const TEAM_STANDINGS_GRID_STYLE = {
  gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
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

// Pool names are sometimes stored with the division in them ("Open - Pool A",
// "Pool A (Open)"); the schedule already sits under the division heading, so the
// card shows only the pool part. A name that is nothing but the division is kept.
const stripDivisionFromPoolName = (poolName, divisionName) => {
  let pool = String(poolName || "").trim();
  // "<division> - <pool>": keep the part after the last spaced dash, even when
  // the prefix is not spelled exactly like the division ("Open Div - Pool A").
  const dashParts = pool.split(/\s+[-–—]\s+/);
  if (dashParts.length > 1 && dashParts[dashParts.length - 1].trim()) {
    pool = dashParts[dashParts.length - 1].trim();
  }
  const division = String(divisionName || "").trim();
  if (!pool || !division) return pool;
  const SEPARATORS = " -–—:|/()";
  const trimSeparators = (text) => {
    let start = 0;
    let end = text.length;
    while (start < end && SEPARATORS.includes(text[start])) start += 1;
    while (end > start && SEPARATORS.includes(text[end - 1])) end -= 1;
    return text.slice(start, end);
  };
  const lowerPool = pool.toLowerCase();
  const lowerDivision = division.toLowerCase();
  let stripped = pool;
  const core = trimSeparators(pool);
  const lowerCore = core.toLowerCase();
  // Only a whole word: "Opener" in the Open division stays "Opener".
  const nextChar = lowerPool[division.length];
  const prevChar = lowerCore[lowerCore.length - division.length - 1];
  if (lowerPool.startsWith(lowerDivision) && (nextChar === undefined || SEPARATORS.includes(nextChar))) {
    stripped = trimSeparators(pool.slice(division.length));
  } else if (lowerCore.endsWith(lowerDivision) && (prevChar === undefined || SEPARATORS.includes(prevChar))) {
    stripped = trimSeparators(core.slice(0, core.length - division.length));
  }
  return stripped || pool;
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

// `forfeit_teamA` / `forfeit_teamB` name the team that forfeited; show it by
// name instead of the raw status code ("Forfeit_teama").
const formatMatchStatus = (status, fallback = "Scheduled", match = null) => {
  const normalized = (status || "").toString().trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "forfeit_teama") {
    return `${match?.team_a?.name || "Team A"} forfeited`;
  }
  if (normalized === "forfeit_teamb") {
    return `${match?.team_b?.name || "Team B"} forfeited`;
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

// Size the match-card grid by available width, not by how many matches the day
// has. Each column is at least ~22rem; `auto-fill` (not `auto-fit`) keeps empty
// tracks, so a lone card stays one track wide instead of stretching across a
// maximised window. `min(100%, 22rem)` lets it collapse to a single full-width
// column on phones and split-screen. It follows the grid's own width, so it
// needs no viewport breakpoints.
const SCHEDULE_GRID_CLASS =
  "grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))]";

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

function PdfIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 2v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}


export default function EventWorkspaceTemplate({
  eventId,
  fallbackName = "Event",
  ruleDocuments = [],
}) {
  // One cached read for the whole page (see eventPageService). A revisit, or a
  // visit from a link that warmed it, draws immediately and refreshes itself.
  // Switching events changes the key, so old and new rows never mix.
  const pageQuery = useCachedQuery(
    eventId ? getEventPageDataKey(eventId) : null,
    ({ forceRefresh }) => getEventPageData(eventId, { forceRefresh }),
    { ttlMs: EVENT_PAGE_CACHE_TTL_MS },
  );
  const matches = pageQuery.data?.matches ?? EMPTY_LIST;
  const eventData = pageQuery.data?.hierarchy ?? null;
  const brackets = pageQuery.data?.brackets ?? EMPTY_LIST;
  const eventStatus = pageQuery.data?.status ?? null;
  const loading = pageQuery.isLoading;
  // A failed refresh keeps the last good data; the error shows only when there
  // is nothing else to show.
  const error =
    pageQuery.error && !pageQuery.data
      ? pageQuery.error.message || "Unable to load matches for this event."
      : null;
  // Always starts closed: a league with many fields makes it very long.
  const [venueFieldsOpen, setVenueFieldsOpen] = useState(false);
  // Schedule day sections the viewer has collapsed, keyed "divisionId:dayKey".
  // Everything starts expanded.
  const [collapsedScheduleDays, setCollapsedScheduleDays] = useState(() => new Set());

  // A firmer "hook" at each division boundary in the match schedule: proximity
  // snapping lets a scroll that comes to rest near a division's start settle
  // with its rule at the top, without capturing scrolling anywhere else. The
  // page scrolls on <html>, so the snap type is set there while this page is
  // mounted and restored on the way out.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollSnapType;
    root.style.scrollSnapType = "y proximity";
    return () => {
      root.style.scrollSnapType = previous;
    };
  }, []);

  const playoffMatchIds = useMemo(() => getPlayoffMatchIds(brackets), [brackets]);

  // Playoff game name ("Semifinal 1") by match id, for the schedule cards'
  // corner label: the playoff counterpart of the pool name.
  const playoffNodeNameByMatchId = useMemo(() => {
    const names = new Map();
    (brackets || []).forEach((bracket) => {
      (bracket?.nodes || []).forEach((node) => {
        const name = typeof node?.name === "string" ? node.name.trim() : "";
        if (node?.match_id && name) names.set(node.match_id, name);
      });
    });
    return names;
  }, [brackets]);

  const isEventCompleted = isCompletedEventStatus(eventStatus);

  // Per-division final standings mode (see getFinalStandingsModes): a division
  // with playoffs gets a playoff-only final table once one has a result and
  // keeps its pool tables; a division without playoffs gets a full final table
  // once the event is completed, which replaces its pool tables.
  const finalModeByDivision = useMemo(
    () =>
      getFinalStandingsModes({ eventData, matches, playoffMatchIds, isEventCompleted }),
    [eventData, matches, playoffMatchIds, isEventCompleted],
  );

  const finalStandings = useMemo(
    () =>
      buildFinalStandings({ eventData, matches, brackets, modeByDivision: finalModeByDivision }),
    [eventData, matches, brackets, finalModeByDivision],
  );

  // Division standings exclude playoff games, and skip any division whose
  // final table has replaced them.
  const standingsByPool = useMemo(() => {
    if (!eventData?.divisions?.length) return [];
    return eventData.divisions
      .filter((division) => finalModeByDivision.get(division.id) !== "all")
      .flatMap((division, divisionIndex) =>
        (division?.pools || []).map((pool, poolIndex) => ({
          id: pool.id || `${division.id || divisionIndex}-${poolIndex}`,
          name: pool.name || "Pool",
          rows: buildPoolStandings(pool, matches, playoffMatchIds),
        })),
      );
  }, [eventData, matches, playoffMatchIds, finalModeByDivision]);

  // Every division's pools replaced by final tables: hide the whole block.
  const showDivisionStandings =
    !(eventData?.divisions || []).length ||
    (eventData?.divisions || []).some(
      (division) => finalModeByDivision.get(division.id) !== "all",
    );

  const scheduleDivisions = useMemo(() => {
    const divisionNames = new Map(
      (eventData?.divisions || []).map((division) => [division.id, division.name]),
    );
    return buildScheduleDivisions(matches, divisionNames);
  }, [matches, eventData]);

  // Pool names by pool id, only for divisions with more than one pool: with a
  // single pool the label would say nothing.
  const poolLabelById = useMemo(() => {
    const labels = new Map();
    (eventData?.divisions || []).forEach((division) => {
      const pools = division?.pools || [];
      if (pools.length < 2) return;
      pools.forEach((pool) => {
        if (pool?.id && pool.name) labels.set(pool.id, stripDivisionFromPoolName(pool.name, division.name));
      });
    });
    return labels;
  }, [eventData]);

  const scheduleDayKeys = useMemo(
    () =>
      scheduleDivisions.flatMap((division) =>
        division.days.map((day) => `${division.id}:${day.key}`),
      ),
    [scheduleDivisions],
  );
  const allScheduleDaysCollapsed =
    scheduleDayKeys.length > 0 &&
    scheduleDayKeys.every((key) => collapsedScheduleDays.has(key));

  const toggleScheduleDay = (key) => {
    setCollapsedScheduleDays((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllScheduleDays = () => {
    setCollapsedScheduleDays(
      allScheduleDaysCollapsed ? new Set() : new Set(scheduleDayKeys),
    );
  };

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

  const fieldsOpen = venueFieldsOpen;
  // Location headings only help when there is more than one location to tell
  // apart, or the single one has a real name.
  const showLocationHeadings =
    venuesByCity.reduce((total, city) => total + city.locations.length, 0) > 1 ||
    venuesByCity.some((city) => city.locations.some((location) => location.locationLabel !== "Location TBD"));

  // Bracket lookups let node source labels resolve to human names ("Pool A
  // #1", "Winner of Quarterfinal 1") instead of raw ids.
  const bracketLookups = useMemo(() => {
    const divisions = eventData?.divisions || [];
    const divisionById = new Map(
      divisions.filter((division) => division?.id).map((division) => [division.id, division]),
    );
    const poolById = new Map(
      divisions
        .flatMap((division) => division?.pools || [])
        .filter((pool) => pool?.id)
        .map((pool) => [pool.id, pool]),
    );
    const teamById = new Map(
      divisions
        .flatMap((division) => division?.pools || [])
        .flatMap((pool) => pool?.teams || [])
        .map((entry) => entry?.team || entry)
        .filter((team) => team?.id)
        .map((team) => [team.id, team]),
    );
    const nodeById = new Map(
      (brackets || []).flatMap((bracket) =>
        (bracket?.nodes || []).map((node) => [node.id, node]),
      ),
    );
    return { divisionById, poolById, teamById, nodeById };
  }, [brackets, eventData]);

  // Skip any bracket with no games yet so an empty scaffold doesn't take up a
  // heading.
  const playoffBrackets = useMemo(
    () => (brackets || []).filter((bracket) => (bracket?.nodes || []).length > 0),
    [brackets],
  );

  const renderBracketMatchCard = (match) => {
    const showScore = isFinishedMatch(match.status);
    return (
      <StandardEventMatchCard
        match={match}
        eyebrow={match.start_time ? formatMatchTime(match.start_time) : "Time TBC"}
        title={formatMatchup(match)}
        score={showScore ? formatScoreLine(match) : null}
        status={formatMatchStatus(match.status, showScore ? "Final" : "Scheduled", match)}
        phase={isForfeitStatus(match.status) ? "forfeit" : undefined}
      />
    );
  };

  const eventTitle = eventData?.name || fallbackName;

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="main" className="w-full max-w-none space-y-4 py-4 sm:py-5">
        <Card className="min-w-0 space-y-3 border border-white/70 p-3 sm:p-4">
          <SectionHeader
            title={eventTitle}
          />
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:flex-row sm:flex-wrap sm:justify-end">
            <Link
              to={`/event-rules?eventId=${encodeURIComponent(eventId)}`}
              className="sc-button w-full whitespace-nowrap sm:w-auto"
            >
              Event rules
            </Link>
            <Link
              to={`/event-rosters?eventId=${encodeURIComponent(eventId)}`}
              className="sc-button w-full whitespace-nowrap sm:w-auto"
            >
              Team rosters
            </Link>
            <Link
              to={`/players?eventId=${encodeURIComponent(eventId)}`}
              className="sc-button w-full whitespace-nowrap sm:w-auto"
            >
              Player standings
            </Link>
            <Link
              to={`/event-spirit?eventId=${encodeURIComponent(eventId)}`}
              className="sc-button w-full whitespace-nowrap sm:w-auto"
            >
              Spirit scores
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

        {/* New visitors arrive here from shared links: install first (on
            iPhone alerts need the installed app), then a pointer to follows.
            Both can be dismissed. Completed events have nothing left to alert
            about, so the follow notice is skipped. */}
        <GetTheAppCard />
        {!isEventCompleted ? <EventFollowNotice eventId={eventId} /> : null}

        {ruleDocuments.length ? (
        <Card className="min-w-0 space-y-3 border border-white/70 p-3 sm:p-4">
          <SectionHeader title="Rules" />
          <div className="grid gap-3 sm:grid-cols-2">
            {ruleDocuments.map((document) => (
              <a
                key={document.href}
                href={document.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition hover:bg-surface-muted"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white">
                  <PdfIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink group-hover:underline break-words whitespace-normal">
                    {document.name}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </Card>
        ) : null}

        <Card className="min-w-0 space-y-3 border border-white/70 p-3 sm:p-4">
          <SectionHeader
            title="Team standings"
          />
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Final standings
              </p>
              {finalStandings.length ? <StandardStandingsLegend /> : null}
            </div>
            {finalStandings.length ? (
              <div className="grid items-start gap-2" style={TEAM_STANDINGS_GRID_STYLE}>
                {finalStandings.map((division) => (
                  <Panel key={division.id} variant="muted" className="min-w-0 space-y-1.5 border border-white/50 p-2">
                    <p className="truncate text-xs font-semibold uppercase tracking-wide text-ink" title={division.name}>
                      {division.name}
                    </p>
                    {/* Playoff-only W-L/+/- would read like the ranking, which
                        comes from the bracket instead, so +/- is hidden. */}
                    <StandardStandingsTable
                      rows={division.rows}
                      showRank
                      showScoreDiff={division.mode !== "playoffs"}
                    />
                  </Panel>
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
          </div>
          {showDivisionStandings ? (
          <div className="border-t border-white/30 pt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Division standings
                </p>
                <StandingsRulesInfo />
              </div>
              <StandardStandingsLegend />
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
                  <StandardStandingsTable rows={pool.rows} />
                </Panel>
              ))}
            </div>
          )}
          </div>
          ) : null}
        </Card>

        <Card className="min-w-0 space-y-2 border border-white/70 p-3 sm:p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={fieldsOpen}
            onClick={() => setVenueFieldsOpen(!fieldsOpen)}
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
                  fieldsOpen ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </button>
          {fieldsOpen ? (
            sortedVenues.length ? (
              <div className="space-y-4 pt-1">
                {venuesByCity.map((city) => (
                  <section key={city.cityLabel} className="space-y-3">
                    {venuesByCity.length > 1 ? (
                      <h3 className="text-base font-semibold text-ink">{city.cityLabel}</h3>
                    ) : null}
                    {city.locations.map((location) => (
                      <div key={`${city.cityLabel}-${location.locationLabel}`} className="space-y-1">
                        {showLocationHeadings ? (
                          <h4 className="text-sm font-semibold text-ink/85 pb-1">{location.locationLabel}</h4>
                        ) : null}
                        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-2">
                          {location.venues.map((venue) => {
                            const mapsUrl = buildVenueMapsUrl(venue);
                            const tileClass =
                              "flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm font-medium no-underline";
                            return (
                              <li key={venue.id}>
                                {mapsUrl ? (
                                  // Colour set inline: the global unlayered `a { color }` rule beats Tailwind's text-* classes.
                                  <a
                                    href={mapsUrl}
                                    {...(mapsUrl.startsWith("http")
                                      ? { target: "_blank", rel: "noopener noreferrer" }
                                      : {})}
                                    className={`${tileClass} transition hover:border-[var(--sc-border-strong)] hover:bg-surface`}
                                    style={{ color: "var(--sc-ink)" }}
                                    aria-label={`Open ${venue.cityLabel}, ${venue.locationLabel} - ${venue.nameLabel} in maps`}
                                    title="Open in maps"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="h-5 w-5 shrink-0"
                                      aria-hidden="true"
                                    >
                                      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
                                      <circle cx="12" cy="10" r="2.5" />
                                    </svg>
                                    <span
                                      className="truncate underline decoration-2 underline-offset-4"
                                      style={{ textDecorationColor: "var(--sc-accent)" }}
                                    >
                                      {venue.nameLabel}
                                    </span>
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="h-3.5 w-3.5 shrink-0 opacity-75"
                                      aria-hidden="true"
                                    >
                                      <path d="M7 17 17 7" />
                                      <path d="M8 7h9v9" />
                                    </svg>
                                  </a>
                                ) : (
                                  <span className={tileClass} style={{ color: "var(--sc-ink)" }}>
                                    <span className="truncate">{venue.nameLabel}</span>
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink/80">No fields linked to this event yet.</p>
            )
          ) : null}
        </Card>

        <section className="min-w-0 space-y-3">
          {/* Not SectionHeader: its action slot sits at the far right (or wraps
              below on phones), and the toggle belongs beside the title. */}
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold text-ink">Matches</h2>
            {scheduleDayKeys.length ? (
              <button
                type="button"
                className="sc-button whitespace-nowrap"
                onClick={toggleAllScheduleDays}
              >
                {allScheduleDaysCollapsed ? "Expand all" : "Collapse all"}
              </button>
            ) : null}
          </div>
          {scheduleDivisions.length ? (
            <div className="space-y-8">
              {scheduleDivisions.map((division) => (
                <div key={division.id} className="min-w-0 snap-start space-y-3">
                  {/* Division heading: the home page's section rule (2px white
                      at 75%). It pins to the top of the screen while this
                      division's matches scroll past and lets go at the next
                      division; the translucent backing keeps it legible over
                      the cards passing underneath. */}
                  <div className="sticky top-0 z-10 border-t-2 border-white/75 bg-[var(--sc-surface)]/85 pb-2 pt-2.5 backdrop-blur-sm">
                    <h3 className="text-xl font-extrabold tracking-tight text-ink">
                      {division.name}
                    </h3>
                  </div>
                  {division.days.map((day) => {
                    const dayKey = `${division.id}:${day.key}`;
                    const dayOpen = !collapsedScheduleDays.has(dayKey);
                    return (
                    <div key={day.key} className="min-w-0 space-y-2">
                      <h4>
                        <button
                          type="button"
                          className="flex w-full items-center gap-1.5 text-left text-sm font-semibold text-ink-muted transition hover:text-ink"
                          aria-expanded={dayOpen}
                          onClick={() => toggleScheduleDay(dayKey)}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`h-4 w-4 shrink-0 transition-transform ${
                              dayOpen ? "rotate-90" : ""
                            }`}
                            aria-hidden="true"
                          >
                            <path d="m9 6 6 6-6 6" />
                          </svg>
                          <span>{formatScheduleDayLabel(day.startTime)}</span>
                          <span className="text-xs font-normal">
                            ({day.matches.length})
                          </span>
                        </button>
                      </h4>
                      {dayOpen ? (
                      <div className={SCHEDULE_GRID_CLASS}>
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
                              cornerLabel={
                                playoffNodeNameByMatchId.get(match.id) ||
                                poolLabelById.get(match.pool_id) ||
                                ""
                              }
                              hideEyebrow={false}
                              title={formatMatchup(match)}
                              score={showScore ? formatScoreLine(match) : null}
                              status={formatMatchStatus(
                                match.status,
                                showScore ? "Final" : "Scheduled",
                                match,
                              )}
                              phase={
                                isForfeitStatus(match.status)
                                  ? "forfeit"
                                  : undefined
                              }
                            />
                          );
                        })}
                      </div>
                      ) : null}
                    </div>
                    );
                  })}
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
        </section>

        {/* Hidden until a bracket has games (playoffBrackets drops empty
            scaffolds), so events without playoffs show no section at all. */}
        {playoffBrackets.length ? (
        <section className="space-y-3">
          <SectionHeader
            title="Playoffs"
            description="Seeds, rounds, and placements. Fixtures fill in as each round is decided."
          />
          {playoffBrackets.length > 1 ? (
            <div className="space-y-3 sm:space-y-6">
              {playoffBrackets.map((bracket) => (
                <div
                  key={bracket.id}
                  className="space-y-2 rounded-2xl border border-[var(--sc-border-strong)] bg-[var(--sc-surface)]/40 p-2 sm:space-y-3 sm:p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[var(--sc-border-strong)] pb-1.5 sm:pb-2">
                    <h3 className="text-sm font-semibold text-[var(--sc-ink)] sm:text-lg">
                      {bracket.name || "Bracket"}
                    </h3>
                  </div>
                  <BracketStructureView
                    bracket={bracket}
                    lookups={bracketLookups}
                    renderMatchCard={renderBracketMatchCard}
                    emptyMessage="No games in this bracket yet."
                  />
                </div>
              ))}
            </div>
          ) : (
            <BracketStructureView
              bracket={playoffBrackets[0]}
              lookups={bracketLookups}
              renderMatchCard={renderBracketMatchCard}
              emptyMessage="No games in this bracket yet."
            />
          )}
        </section>
        ) : null}
      </SectionShell>
    </div>
  );
}
