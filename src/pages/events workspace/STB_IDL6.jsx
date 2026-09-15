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
import {
  StandardStandingsLegend,
  StandardStandingsTable,
} from "../../components/StandardStandingsTable";
import {
  buildPoolGroupStandings,
  isFinishedMatch,
} from "../../utils/standings";
import { getMatchesByEvent } from "../../services/matchService";
import { getEventHierarchy } from "../../services/leagueService";
import { getBracketsByEvent } from "../../services/playoffStructureService";
import BracketStructureView from "../playoff/BracketStructureView";

export const EVENT_ID = "abd01401-fba2-42f2-9bf9-7dfdce3e44d6";
export const EVENT_SLUG = "stellenbosch-idl-6";
export const EVENT_NAME = "Stellenbosch Internal Draft League VI";
const MATCH_LIMIT = 200;
const SUMMARY_RULES_HREF = "/rules/stellenbosch-rl-2026-rules-summary.pdf";
const FULL_RULES_HREF = "/rules/stellenbosch-rl-2026-rules.pdf";
const RULE_DOCUMENTS = [
  {
    name: "Rules-of-Ultimate - STB 5v5 edition (summary).pdf",
    href: SUMMARY_RULES_HREF,
  },
  {
    name: "Rules-of-Ultimate - STB 5v5 edition.pdf",
    href: FULL_RULES_HREF,
  },
];
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

const buildPoolStandings = (pool, matches) =>
  // Plain pool table: no league points, so WFDF ranking leads on games won.
  buildPoolGroupStandings([pool], matches);

export default function StellenboschIdl6WorkspacePage() {
  const [matches, setMatches] = useState([]);
  const [eventData, setEventData] = useState(null);
  const [brackets, setBrackets] = useState([]);
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
        const [rows, hierarchy, bracketRows] = await Promise.all([
          getMatchesByEvent(EVENT_ID, MATCH_LIMIT, {
            includeFinished: true,
          }),
          getEventHierarchy(EVENT_ID),
          // The bracket is supplementary: if it fails to load, the rest of
          // the workspace should still render, so swallow the error.
          getBracketsByEvent(EVENT_ID).catch(() => []),
        ]);
        if (!ignore) {
          setMatches(rows || []);
          setEventData(hierarchy || null);
          setBrackets(bracketRows || []);
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
        status={formatMatchStatus(match.status, showScore ? "Final" : "Scheduled")}
      />
    );
  };

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
          <SectionHeader title="Rules" />
          <div className="grid gap-3 sm:grid-cols-2">
            {RULE_DOCUMENTS.map((document) => (
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
              bracket={playoffBrackets[0] || null}
              lookups={bracketLookups}
              renderMatchCard={renderBracketMatchCard}
              emptyMessage={
                loading
                  ? "Loading the playoff bracket..."
                  : "The playoff bracket has not been published yet."
              }
            />
          )}
        </section>
      </SectionShell>
    </div>
  );
}
