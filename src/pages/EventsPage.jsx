import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getEventsList } from "../services/leagueService";
import { getMatchesByEvent } from "../services/matchService";
import { hydrateVenueLookup } from "../services/venueService";
import { Card, Panel, SectionHeader, SectionShell, Chip } from "../components/ui/primitives";
import { getMatchMediaDetails } from "../utils/matchMedia";
import { getEventWorkspacePath } from "./eventWorkspaces";

const MATCHES_REFRESH_INTERVAL_MS = 30 * 1000;
const DIVISION_LABELS = {
  mixed: "Mixed",
  open: "Open",
  openwomen: "Open/Women",
  women: "Women",
};
const EVENT_STATUS_TABS = {
  current: new Set(["active", "current", "live"]),
  past: new Set(["completed", "finished", "past"]),
  upcoming: new Set(["scheduled", "upcoming"]),
};

const parseDateOnly = (value, endOfDay = false) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  const date = match
    ? new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0,
      )
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

const getEventStatusTab = (event) => {
  const status = (event?.status || "").toString().trim().toLowerCase();
  if (EVENT_STATUS_TABS.current.has(status)) return "current";
  if (EVENT_STATUS_TABS.past.has(status)) return "past";
  if (EVENT_STATUS_TABS.upcoming.has(status)) return "upcoming";

  const startDate = parseDateOnly(event?.start_date);
  const endDate = parseDateOnly(event?.end_date || event?.start_date, true);
  const now = new Date();

  if (endDate && endDate < now) return "past";
  if (startDate && startDate > now) return "upcoming";
  return "current";
};

const getEventsForStatusTab = (events, statusTab) =>
  events.filter((event) => getEventStatusTab(event) === statusTab);

export default function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialEventId = searchParams.get("eventId") || null;
  const initialStatusTab = normalizeEventStatusTab(searchParams.get("status"));
  const [events, setEvents] = useState([]);
  const [eventStatusTab, setEventStatusTab] = useState(initialStatusTab);
  const [selectedEventId, setSelectedEventId] = useState(initialEventId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState(null);
  const [matchTab, setMatchTab] = useState("current");
  const [venueLookup, setVenueLookup] = useState({});

  useEffect(() => {
    let ignore = false;
    async function loadEvents() {
      setLoading(true);
      setError(null);
      try {
        const list = await getEventsList(50);
        if (!ignore) {
          setEvents(list || []);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Unable to load events.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    loadEvents();
    return () => {
      ignore = true;
    };
  }, []);

  const requestedEventId = searchParams.get("eventId") || null;
  const requestedStatusTab = normalizeEventStatusTab(searchParams.get("status"));

  useEffect(() => {
    setEventStatusTab(requestedStatusTab);
  }, [requestedStatusTab]);

  const filteredEvents = useMemo(() => {
    const normalizedTab = normalizeEventStatusTab(eventStatusTab);
    return getEventsForStatusTab(events, normalizedTab);
  }, [eventStatusTab, events]);

  useEffect(() => {
    if (!events.length) return;
    let nextTab = eventStatusTab;
    let nextId = requestedEventId;

    if (nextId && !filteredEvents.some((evt) => evt.id === nextId)) {
      const requestedEvent = events.find((evt) => evt.id === nextId);
      if (requestedEvent) {
        nextTab = getEventStatusTab(requestedEvent);
      }
    }

    const nextFilteredEvents =
      nextTab === eventStatusTab
        ? filteredEvents
        : getEventsForStatusTab(events, nextTab);

    if (!nextId || !nextFilteredEvents.some((evt) => evt.id === nextId)) {
      nextId = nextFilteredEvents[0]?.id || null;
    }
    setEventStatusTab(nextTab);
    setSelectedEventId(nextId);
    if (nextId) {
      if (requestedEventId !== nextId || requestedStatusTab !== nextTab) {
        setSearchParams({ eventId: nextId, status: nextTab }, { replace: true });
      }
    } else if (requestedEventId) {
      setSearchParams({}, { replace: true });
    }
  }, [eventStatusTab, events, filteredEvents, requestedEventId, requestedStatusTab, setSearchParams]);

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
    const nextEvents = getEventsForStatusTab(events, nextTab);
    const nextEventId = nextEvents[0]?.id || null;

    setEventStatusTab(nextTab);
    setSelectedEventId(nextEventId);
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
              <div className="grid gap-3">
                <Panel variant="muted" className="p-3">
                  <p className="text-xs uppercase tracking-wide text-ink-muted">Name</p>
                  <p className="text-base font-semibold text-ink">{selectedEvent.name}</p>
                </Panel>
                <Panel variant="muted" className="p-3">
                  <p className="text-xs uppercase tracking-wide text-ink-muted">Dates</p>
                  <p className="font-semibold text-ink">
                    {formatDate(selectedEvent.start_date)} - {formatDate(selectedEvent.end_date)}
                  </p>
                </Panel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Panel variant="muted" className="p-3">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">Location</p>
                    <p className="font-semibold text-ink">{selectedEvent.location || "TBD"}</p>
                  </Panel>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Panel variant="muted" className="p-3">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">Division</p>
                    <p className="font-semibold text-ink">{divisionLabel || "Not specified"}</p>
                  </Panel>
                </div>
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
                const isNavigable =
                  match.status === "live" ||
                  match.status === "halftime" ||
                  match.status === "finished" ||
                  match.status === "completed";
                const mediaDetails = getMatchMediaDetails(match);
                const mediaUrl = mediaDetails?.url || null;
                const mediaProviderLabel = mediaDetails?.providerLabel || "Stream";
                const handleMediaClick = (event) => {
                  event.stopPropagation();
                  if (isNavigable) {
                    event.preventDefault();
                  }
                  if (mediaUrl && typeof window !== "undefined") {
                    window.open(mediaUrl, "_blank", "noopener,noreferrer");
                  }
                };
                const handleMediaKeyDown = (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleMediaClick(event);
                  }
                };
                const mediaButton = mediaUrl ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={handleMediaClick}
                    onKeyDown={handleMediaKeyDown}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-media-border bg-media-bg text-media-ink transition hover:-translate-y-0.5 hover:bg-media-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-media"
                    title={`Watch on ${mediaProviderLabel}`}
                    aria-label={`Watch on ${mediaProviderLabel}`}
                  >
                    <img src="/youtube.png" alt="" className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : null;

                const statusClass =
                  match.status === "live"
                    ? "border border-live-border bg-live-bg text-live-ink"
                    : match.status === "halftime"
                      ? "border border-live-border bg-live-bg text-live-ink"
                      : match.status === "scheduled" || match.status === "ready" || match.status === "pending"
                        ? "border border-border bg-surface-muted text-ink-muted"
                        : "border border-warning-border bg-warning-bg text-warning-ink";

                const content = (
                  <>
                    <div className="flex items-center justify-between text-xs text-ink-muted">
                      <span>
                        {formatDate(match.start_time)} at {formatTime(match.start_time)}
                      </span>
                      <div className="flex items-center gap-2">
                        {mediaButton}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusClass}`}
                        >
                          {match.status || "Status"}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      {resolveVenueName(match)}
                    </p>
                    <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-semibold text-ink">
                      <div className="min-w-0">
                        <p className="truncate">{match.team_a?.name || "Team A"}</p>
                      </div>
                      <div className="text-center text-base font-bold">
                        {(match.score_a ?? 0)} : {(match.score_b ?? 0)}
                      </div>
                      <div className="min-w-0 text-right">
                        <p className="truncate">{match.team_b?.name || "Team B"}</p>
                      </div>
                    </div>
                  </>
                );

                if (isNavigable) {
                  return (
                    <Panel
                      key={match.id}
                      as={Link}
                      to={`/matches?matchId=${encodeURIComponent(match.id)}`}
                      variant="tinted"
                      className="h-full p-4 text-sm transition hover:-translate-y-0.5"
                    >
                      {content}
                    </Panel>
                  );
                }

                return (
                  <Panel key={match.id} as="article" variant="tinted" className="h-full p-4 text-sm">
                    {content}
                  </Panel>
                );
              })}
            </div>
          )}
        </Card>
      </SectionShell>
    </div>
  );
}
