import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getEventsList } from "../services/leagueService";
import { getMatchesByEvent } from "../services/matchService";
import { hydrateVenueLookup } from "../services/venueService";
import { Card, Panel, SectionHeader, SectionShell, Chip } from "../components/ui/primitives";
import { resolveMediaProviderLabel } from "../utils/matchMedia";
import { getEventWorkspacePath } from "./eventWorkspaces";

const EVENT_WORKSPACE_LABEL = "Open event overview";
const MATCHES_REFRESH_INTERVAL_MS = 30 * 1000;
const RULE_FORMAT_LABELS = {
  wfdfChampionship: "WFDF Championship",
  localSimple: "Local Simple",
};
const DIVISION_LABELS = {
  mixed: "Mixed",
  open: "Open",
  openwomen: "Open/Women",
  women: "Women",
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

const coerceNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export default function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialEventId = searchParams.get("eventId") || null;
  const [events, setEvents] = useState([]);
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

  useEffect(() => {
    if (!events.length) return;
    let nextId = requestedEventId;
    if (!nextId || !events.some((evt) => evt.id === nextId)) {
      nextId = events[0]?.id || null;
    }
    setSelectedEventId(nextId);
    if (nextId) {
      if (requestedEventId !== nextId) {
        setSearchParams({ eventId: nextId }, { replace: true });
      }
    } else if (requestedEventId) {
      setSearchParams({}, { replace: true });
    }
  }, [events, requestedEventId, setSearchParams]);

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

    const refreshMatches = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
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
      setSearchParams({ eventId }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
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

  const formatLabel = useMemo(() => {
    const format = selectedEventRules?.format;
    if (!format) return null;
    const normalized = `${format}`.trim();
    if (!normalized) return null;
    return RULE_FORMAT_LABELS[normalized] || normalized;
  }, [selectedEventRules]);

  const divisionLabel = useMemo(() => {
    const division = selectedEventRules?.division;
    if (!division) return null;
    const normalized = `${division}`.trim().toLowerCase();
    if (!normalized) return null;
    return DIVISION_LABELS[normalized] || normalized[0].toUpperCase() + normalized.slice(1);
  }, [selectedEventRules]);

  const timeoutsLabel = useMemo(() => {
    const timeouts = selectedEventRules?.timeouts;
    if (!timeouts || typeof timeouts !== "object") return null;
    const perTeam = coerceNumber(timeouts.perTeamPerGame);
    const duration = coerceNumber(timeouts.durationSeconds);
    const parts = [];
    if (perTeam !== null) {
      parts.push(`${perTeam} per team`);
    }
    if (duration !== null) {
      parts.push(`${duration} sec`);
    }
    if (!parts.length) return null;
    return parts.join(", ");
  }, [selectedEventRules]);

  const rulesSummary = useMemo(() => {
    const rules = selectedEventRules;
    if (!rules || typeof rules !== "object") return null;
    const game = rules.game || {};
    const half = rules.half || {};
    const timeouts = rules.timeouts || {};
    const clock = rules.clock || {};

    const rows = [
      { label: "Game to", value: game.pointTarget },
      { label: "Game time cap (min)", value: game.timeCapMinutes },
      { label: "Game soft cap (min)", value: game.softCapMinutes },
      { label: "Halftime at", value: half.halftimePointTarget },
      { label: "Halftime cap (min)", value: half.halftimeCapMinutes },
      { label: "Halftime break (min)", value: half.halftimeBreakMinutes },
      { label: "Timeouts per team", value: timeouts.perTeamPerGame },
    ].filter((row) => row.value !== null && row.value !== undefined && row.value !== "");

    return rows.length ? rows : null;
  }, [selectedEventRules]);

  const selectedEventWorkspacePath = selectedEvent ? getEventWorkspacePath(selectedEvent.id) : null;

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-6">
        <Card className="space-y-4 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Divisions"
            title="Division control center"
            description="Select a tournament to view its calendar, venue posture, rule set, and live fixtures."
          >
          </SectionHeader>
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-4 sm:space-y-6">
        {error && <div className="sc-alert is-error">{error}</div>}

        <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
          <Card className="space-y-4 p-6">
            <SectionHeader
              eyebrow="Events"
              title="Select an event"
              action={
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {loading ? "Loading..." : `${events.length} total`}
                </span>
              }
            />
            {loading && events.length === 0 ? (
              <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                Loading events...
              </Card>
            ) : events.length === 0 ? (
              <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                No events registered yet.
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {events.map((event) => {
                  const isActive = event.id === selectedEventId;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => handleSelectEvent(event.id)}
                      className={`${isActive ? "sc-button is-square" : "sc-button is-ghost is-square"} is-option transition hover:-translate-y-0.5`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{event.type || "Event"}</p>
                      <p className="text-base font-semibold leading-tight">{event.name}</p>
                      <p className="text-xs opacity-80">
                        {formatDate(event.start_date)} - {formatDate(event.end_date)}
                      </p>
                      {event.location && <p className="text-xs opacity-80">Location: {event.location}</p>}
                    </button>
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <Panel variant="muted" className="p-3">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">Start date</p>
                    <p className="font-semibold text-ink">{formatDate(selectedEvent.start_date)}</p>
                  </Panel>
                  <Panel variant="muted" className="p-3">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">End date</p>
                    <p className="font-semibold text-ink">{formatDate(selectedEvent.end_date)}</p>
                  </Panel>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Panel variant="muted" className="p-3">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">Event type</p>
                    <p className="font-semibold text-ink">{selectedEvent.type || "Not specified"}</p>
                  </Panel>
                  <Panel variant="muted" className="p-3">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">Location</p>
                    <p className="font-semibold text-ink">{selectedEvent.location || "TBD"}</p>
                  </Panel>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Panel variant="muted" className="p-3">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">Format</p>
                    <p className="font-semibold text-ink">{formatLabel || "Not specified"}</p>
                  </Panel>
                  <Panel variant="muted" className="p-3">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">Division</p>
                    <p className="font-semibold text-ink">{divisionLabel || "Not specified"}</p>
                  </Panel>
                  <Panel variant="muted" className="p-3">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">Timeouts</p>
                    <p className="font-semibold text-ink">{timeoutsLabel || "Not specified"}</p>
                  </Panel>
                </div>
                {rulesSummary && (
                  <Panel variant="muted" className="space-y-2 p-3">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">Rules snapshot</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {rulesSummary.map((row) => (
                        <Panel key={row.label} variant="tinted" className="p-3">
                          <p className="text-[11px] uppercase tracking-wide text-ink-muted">{row.label}</p>
                          <p className="text-sm font-semibold text-ink">{row.value}</p>
                        </Panel>
                      ))}
                    </div>
                  </Panel>
                )}
                {selectedEventWorkspacePath && (
                  <Link to={selectedEventWorkspacePath} className="sc-button justify-center">
                    {EVENT_WORKSPACE_LABEL}
                  </Link>
                )}
              </div>
            )}
          </Card>
        </div>

        <Card className="space-y-4 p-6">
          <SectionHeader
            eyebrow="Scoreboard"
            description="Monitor matches and their state"
            action={
              <div className="inline-flex flex-wrap items-center gap-2">
                {[
                  { key: "current", label: "Current Games" },
                  { key: "upcoming", label: "Upcoming Games" },
                  { key: "past", label: "Recent Games" },
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
                const rawMediaUrl = typeof match.media_url === "string" ? match.media_url.trim() : "";
                const mediaUrl = rawMediaUrl && /^https?:\/\//i.test(rawMediaUrl) ? rawMediaUrl : null;
                const mediaProviderLabel = resolveMediaProviderLabel(match.media_provider, mediaUrl);
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
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-white/70 text-ink transition hover:-translate-y-0.5 hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea4335]"
                    title={`Watch on ${mediaProviderLabel}`}
                    aria-label={`Watch on ${mediaProviderLabel}`}
                  >
                    <img src="/youtube.png" alt="" className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : null;

                const statusClass =
                  match.status === "live"
                    ? "bg-emerald-100 text-emerald-800"
                    : match.status === "halftime"
                      ? "bg-sky-100 text-sky-800"
                      : match.status === "scheduled" || match.status === "ready" || match.status === "pending"
                        ? "bg-slate-100 text-slate-700"
                        : "bg-amber-100 text-amber-800";

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
