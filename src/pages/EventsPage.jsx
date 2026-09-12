import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getEventsList } from "../services/leagueService";
import { getMatchesByEvent } from "../services/matchService";
import { hydrateVenueLookup } from "../services/venueService";
import { Card, Panel, SectionHeader, SectionShell, Chip } from "../components/ui/primitives";
import { StandardEventMatchCard } from "../components/StandardEventMatchCard";
import { getEventWorkspacePath } from "./eventWorkspaces";
import { CLOSED_STATUSES, IN_PROGRESS_STATUSES, PENDING_STATUSES } from "../constants/statusCodes";

const isMatchLive = (status) => {
  const normalized = (status || "").toString().trim().toLowerCase();
  return normalized === "live" || normalized === "halftime";
};

const isMatchFinal = (status) => {
  const normalized = (status || "").toString().trim().toLowerCase();
  return normalized === "finished" || normalized === "completed";
};

const formatMatchup = (match) => {
  const teamA = match.team_a?.name || "Team A";
  const teamB = match.team_b?.name || "Team B";
  return `${teamA} vs ${teamB}`;
};

const formatLiveScore = (match) => {
  const left = typeof match.score_a === "number" ? match.score_a : "-";
  const right = typeof match.score_b === "number" ? match.score_b : "-";
  return `${left} - ${right}`;
};

const formatMatchStatus = (status) => {
  const normalized = (status || "").toString().trim().toLowerCase();
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const MATCHES_REFRESH_INTERVAL_MS = 30 * 1000;
const DIVISION_LABELS = {
  mixed: "Mixed",
  open: "Open",
  openwomen: "Open/Women",
  women: "Women",
};
// Tab KEYS are UI groupings; the VALUES are canonical match_status codes,
// since events.Status is a FK to that table. Kept exactly-cased (not
// lowercased) because `Initialized` is stored capitalised and getEventsList
// filters server-side with an exact match against events.Status.
const EVENT_STATUS_TAB_CODES = {
  current: IN_PROGRESS_STATUSES,
  past: CLOSED_STATUSES,
  upcoming: PENDING_STATUSES,
};

const parseEventRules = (rawRules) => {
  if (!rawRules) return null;
  if (typeof rawRules === "string") {
    try {
      return JSON.parse(rawRules);
    } catch {
      return null;
    }
  }
  if (typeof rawRules === "object") return rawRules;
  return null;
};

const normalizeEventStatusTab = (value) => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "active" || normalized === "current" || normalized === "live") {
    return "current";
  }
  if (normalized === "past" || normalized === "completed" || normalized === "finished") {
    return "past";
  }
  if (normalized === "upcoming" || normalized === "upcomming" || normalized === "scheduled") {
    return "upcoming";
  }
  return "current";
};


export default function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialEventId = searchParams.get("eventId") || null;
  const initialStatusTab = normalizeEventStatusTab(searchParams.get("status"));
  // Events are fetched per-tab, lazily: only the initial tab is loaded up
  // front. `null` means "not fetched yet" for that tab (vs. `[]`, fetched
  // and empty), so tab switches only hit the DB the first time they're used.
  const [eventsByTab, setEventsByTab] = useState({ current: null, past: null, upcoming: null });
  const [eventsLoadingTab, setEventsLoadingTab] = useState(null);
  const [eventStatusTab, setEventStatusTab] = useState(initialStatusTab);
  const [selectedEventId, setSelectedEventId] = useState(initialEventId);
  const [error, setError] = useState(null);
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState(null);
  const [matchTab, setMatchTab] = useState("current");
  const [venueLookup, setVenueLookup] = useState({});

  const loading = eventsLoadingTab === eventStatusTab && eventsByTab[eventStatusTab] === null;
  const events = useMemo(
    () => Object.values(eventsByTab).flatMap((list) => list || []),
    [eventsByTab],
  );
  const filteredEvents = eventsByTab[eventStatusTab] || [];

  // Fetch a tab's events from the DB the first time it's needed, filtered
  // server-side to that tab's status codes so switching tabs only ever
  // loads the events relevant to it.
  useEffect(() => {
    if (eventsByTab[eventStatusTab] !== null) return undefined;
    let ignore = false;
    setEventsLoadingTab(eventStatusTab);
    setError(null);
    getEventsList(50, { status: EVENT_STATUS_TAB_CODES[eventStatusTab] })
      .then((list) => {
        if (ignore) return;
        setEventsByTab((prev) => ({ ...prev, [eventStatusTab]: list || [] }));
      })
      .catch((err) => {
        if (ignore) return;
        setError(err.message || "Unable to load events.");
        setEventsByTab((prev) => ({ ...prev, [eventStatusTab]: [] }));
      })
      .finally(() => {
        if (!ignore) setEventsLoadingTab(null);
      });
    return () => {
      ignore = true;
    };
  }, [eventStatusTab, eventsByTab]);

  const requestedEventId = searchParams.get("eventId") || null;
  const requestedStatusTab = normalizeEventStatusTab(searchParams.get("status"));

  useEffect(() => {
    setEventStatusTab(requestedStatusTab);
  }, [requestedStatusTab]);

  useEffect(() => {
    if (eventsByTab[eventStatusTab] === null) return; // this tab hasn't loaded yet
    let nextId = requestedEventId;

    if (!nextId || !filteredEvents.some((evt) => evt.id === nextId)) {
      nextId = filteredEvents[0]?.id || null;
    }
    setSelectedEventId(nextId);
    if (nextId) {
      if (requestedEventId !== nextId || requestedStatusTab !== eventStatusTab) {
        setSearchParams({ eventId: nextId, status: eventStatusTab }, { replace: true });
      }
    } else if (requestedEventId) {
      setSearchParams({}, { replace: true });
    }
  }, [eventStatusTab, eventsByTab, filteredEvents, requestedEventId, requestedStatusTab, setSearchParams]);

  const selectedEvent = useMemo(
    () => events.find((evt) => evt.id === selectedEventId) || null,
    [events, selectedEventId],
  );

  useEffect(() => {
    if (!selectedEventId) {
      setMatches([]);
      return;
    }
    let ignore = false;
    async function loadMatches({ background = false, forceRefresh = false } = {}) {
      if (!background) {
        setMatchesLoading(true);
      }
      setMatchesError(null);
      try {
        const list = await getMatchesByEvent(selectedEventId, 200, {
          includeFinished: true,
          forceRefresh,
        });
        if (!ignore) {
          setMatches(list || []);
        }
      } catch (err) {
        if (!ignore) {
          setMatchesError(err.message || "Unable to load matches for this event.");
          if (!background) {
            setMatches([]);
          }
        }
      } finally {
        if (!ignore && !background) {
          setMatchesLoading(false);
        }
      }
    }
    void loadMatches();

    const hasLiveMatches = () =>
      matches.some((m) => {
        const s = (m.status || "").toLowerCase();
        return s === "live" || s === "halftime" || s === "in_progress";
      });

    const refreshMatches = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      if (!hasLiveMatches()) return;
      void loadMatches({ background: true, forceRefresh: true });
    };

    const intervalId = window.setInterval(refreshMatches, MATCHES_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshMatches);
    document.addEventListener("visibilitychange", refreshMatches);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshMatches);
      document.removeEventListener("visibilitychange", refreshMatches);
    };
  }, [selectedEventId]);

  const handleSelectEvent = (eventId) => {
    setSelectedEventId(eventId);
    if (eventId) {
      setSearchParams({ eventId, status: eventStatusTab }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const handleSelectEventStatusTab = (tabKey) => {
    const nextTab = normalizeEventStatusTab(tabKey);
    const cachedEvents = eventsByTab[nextTab];
    const nextEventId = (cachedEvents && cachedEvents[0]?.id) || null;

    setEventStatusTab(nextTab);
    // If this tab's events aren't loaded yet, leave selection to the effect
    // above once the fetch resolves and filteredEvents updates - don't guess.
    if (cachedEvents !== null) {
      setSelectedEventId(nextEventId);
    }
    setSearchParams(
      nextEventId ? { eventId: nextEventId, status: nextTab } : { status: nextTab },
      { replace: true },
    );
  };

  useEffect(() => {
    const venueIds = matches
      .map((match) => match.venue_id)
      .filter((id) => id && venueLookup[id] === undefined);

    if (venueIds.length === 0) return;

    let ignore = false;
    hydrateVenueLookup(venueIds)
      .then((lookup) => {
        if (!ignore) {
          setVenueLookup((prev) => ({ ...prev, ...lookup }));
        }
      })
      .catch((err) => {
        console.error("Unable to load venues", err);
      });

    return () => {
      ignore = true;
    };
  }, [matches, venueLookup]);

  const formatDate = (value) => {
    if (!value) return "TBD";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "TBD";
    return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  };

  const formatTime = (value) => {
    if (!value) return "--:--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--:--";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const matchBuckets = useMemo(() => {
    const buckets = { current: [], upcoming: [], past: [] };
    const now = Date.now();
    matches.forEach((match) => {
      const status = (match.status || "").toLowerCase();
      const startMs = match.start_time ? new Date(match.start_time).getTime() : null;
      if (status === "live" || status === "halftime") {
        buckets.current.push(match);
        return;
      }
      if (status === "finished" || status === "completed" || status === "canceled") {
        buckets.past.push(match);
        return;
      }
      if (startMs && startMs < now - 60 * 60 * 1000) {
        return;
      }
      if (status === "scheduled") {
        buckets.upcoming.push(match);
        return;
      }
    });
    return buckets;
  }, [matches]);

  const activeMatches = useMemo(() => {
    const bucket = matchBuckets[matchTab] || [];
    if (matchTab === "current") {
      return bucket.filter((match) => (match.status || "").toLowerCase() === "live");
    }
    return bucket;
  }, [matchBuckets, matchTab]);

  const resolveVenueName = (match) =>
    match.venue?.name || (match.venue_id && venueLookup[match.venue_id]) || "Venue TBD";

  const selectedEventRules = useMemo(
    () => parseEventRules(selectedEvent?.rules),
    [selectedEvent?.rules],
  );

  const divisionLabel = useMemo(() => {
    const division = selectedEventRules?.division;
    if (!division) return null;
    const normalized = `${division}`.trim().toLowerCase();
    if (!normalized) return null;
    return DIVISION_LABELS[normalized] || normalized[0].toUpperCase() + normalized.slice(1);
  }, [selectedEventRules]);

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="main" className="space-y-4 sm:space-y-6 pt-6">
        {error && <div className="sc-alert is-error">{error}</div>}

        <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
          <Card className="space-y-4 p-6">
            <SectionHeader
              title="Select an event"
              action={
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                  <div className="grid w-full grid-cols-3 gap-2 sm:w-auto">
                    {[
                      { key: "current", label: "Active" },
                      { key: "past", label: "Past" },
                      { key: "upcoming", label: "Upcoming" },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => handleSelectEventStatusTab(tab.key)}
                        className={`${eventStatusTab === tab.key ? "sc-button" : "sc-button is-ghost"} min-w-0 justify-center px-3`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                </div>
              }
            />
            {loading && filteredEvents.length === 0 ? (
              <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                Loading events...
              </Card>
            ) : filteredEvents.length === 0 ? (
              <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                No events match this status.
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredEvents.map((event) => {
                  const isActive = event.id === selectedEventId;
                  const eventWorkspacePath = getEventWorkspacePath(event.id);
                  const wrapClass = `${
                    isActive ? "sc-button is-square" : "sc-button is-ghost is-square"
                  } flex min-h-[88px] w-full overflow-hidden rounded-[var(--sc-radius-md)] p-0`;

                  return (
                    <div
                      key={event.id}
                      className={wrapClass}
                      style={{ borderColor: isActive ? undefined : "rgba(255,255,255,0.9)" }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectEvent(event.id)}
                        className="flex min-h-[88px] flex-1 items-center justify-start bg-transparent px-4 text-left text-inherit transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
                        aria-pressed={isActive}
                      >
                        <span className="text-base font-semibold leading-tight">{event.name}</span>
                      </button>
                      {eventWorkspacePath ? (
                        <Link
                          to={eventWorkspacePath}
                          className="flex min-h-[88px] w-16 shrink-0 items-center justify-center border-l border-white/30 bg-transparent px-3 text-sm font-semibold uppercase tracking-[0.18em] text-inherit transition hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
                          aria-label={`Open ${event.name}`}
                          title={`Open ${event.name}`}
                        >
                          Open
                        </Link>
                      ) : (
                        <span className="flex min-h-[88px] w-16 shrink-0 items-center justify-center border-l border-white/10 px-3 text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted/40 select-none">
                          Open
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="space-y-3 p-6">
            <Chip>Event details</Chip>
            {!selectedEvent ? (
              <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                Select an event to view its details.
              </Card>
            ) : (
              <div className="space-y-2">
                <h2 className="text-lg font-semibold leading-tight text-ink">{selectedEvent.name}</h2>
                <Panel variant="muted" className="grid grid-cols-2 gap-x-4 gap-y-2 p-3 lg:grid-cols-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-ink-muted">Dates</p>
                    <p className="text-sm font-semibold text-ink">
                      {formatDate(selectedEvent.start_date)} - {formatDate(selectedEvent.end_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-ink-muted">Location</p>
                    <p className="text-sm font-semibold text-ink">{selectedEvent.location || "TBD"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-ink-muted">Division</p>
                    <p className="text-sm font-semibold text-ink">{divisionLabel || "Not specified"}</p>
                  </div>
                </Panel>
              </div>
            )}
          </Card>
        </div>

        <Card className="space-y-4 p-6">
          <SectionHeader
            action={
              <div className="inline-flex flex-wrap items-center gap-2">
                {[
                  { key: "current", label: "Current" },
                  { key: "upcoming", label: "Upcoming" },
                  { key: "past", label: "Recent" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setMatchTab(tab.key)}
                    className={matchTab === tab.key ? "sc-button" : "sc-button is-ghost"}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            }
          />

          {matchesError && <div className="sc-alert is-error text-sm">{matchesError}</div>}

          {matchesLoading && activeMatches.length === 0 ? (
            <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
              Loading matches...
            </Card>
          ) : activeMatches.length === 0 ? (
            <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
              No matches currently fall in this category.
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activeMatches.map((match) => {
                const live = isMatchLive(match.status);
                const final = isMatchFinal(match.status);
                const showScore = live || final;
                const statusLabel = formatMatchStatus(match.status) || (live ? "Live" : "Scheduled");
                const metaParts = [
                  `${formatDate(match.start_time)} at ${formatTime(match.start_time)}`,
                  resolveVenueName(match),
                ].filter(Boolean);

                return (
                  <StandardEventMatchCard
                    key={match.id}
                    match={match}
                    variant="tinted"
                    className="h-full"
                    title={formatMatchup(match)}
                    meta={metaParts.join(" · ")}
                    score={showScore ? formatLiveScore(match) : null}
                    status={statusLabel}
                    compact={false}
                    hideVenue
                  />
                );
              })}
            </div>
          )}
        </Card>
      </SectionShell>
    </div>
  );
}
