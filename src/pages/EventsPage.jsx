import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getEventsList } from "../services/leagueService";
import { Card, Panel, SectionHeader, SectionShell } from "../components/ui/primitives";
import EventSummaryPanel from "./events/EventSummaryPanel";
import { getEventPagePath } from "./eventWorkspaces";
import { CLOSED_STATUSES, IN_PROGRESS_STATUSES, PENDING_STATUSES } from "../constants/statusCodes";

const DIVISION_LABELS = {
  mixed: "Mixed",
  open: "Open",
  openwomen: "Open/Women",
  women: "Women",
};
// Tab KEYS are UI groupings; the VALUES are canonical match_status codes,
// since events.Status is a FK to that table. Kept exactly-cased (not
// lowercased) because getEventsList filters server-side with an exact match
// against events.Status — pass the constants through verbatim.
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

  const formatDate = (value) => {
    if (!value) return "TBD";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "TBD";
    return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  };

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
                  const eventWorkspacePath = getEventPagePath(event);
                  const wrapClass = `${
                    isActive ? "sc-button is-square" : "sc-button is-ghost is-square"
                  } flex min-h-[88px] lg:min-h-[58px] w-full overflow-hidden rounded-[var(--sc-radius-md)] p-0`;

                  return (
                    <div
                      key={event.id}
                      className={wrapClass}
                      style={{ borderColor: isActive ? undefined : "rgba(255,255,255,0.9)" }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectEvent(event.id)}
                        className={`flex min-h-[88px] lg:min-h-[58px] flex-1 items-center justify-start bg-transparent px-4 text-left text-inherit transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ${
                          isActive
                            ? "hover:bg-black/[0.06] focus-visible:ring-black/40"
                            : "hover:bg-white/[0.06] focus-visible:ring-white/50"
                        }`}
                        aria-pressed={isActive}
                      >
                        <span className="text-base font-semibold leading-tight">{event.name}</span>
                      </button>
                      {eventWorkspacePath ? (
                        <Link
                          to={eventWorkspacePath}
                          // A selected card swaps to the light-green button
                          // background, so the white divider/hover/ring used on
                          // ghost cards would vanish against it — invert them to
                          // dark so "Open" stays legible either way.
                          //
                          // text-inherit! (not plain text-inherit): theme.css sets
                          // `a { color: var(--sc-accent-strong) }` unlayered, which
                          // outranks Tailwind's layered utilities. The !important
                          // flips that precedence and covers a:hover too; without
                          // it the link renders bright green and vanishes against
                          // a selected card.
                          className={`flex min-h-[88px] lg:min-h-[58px] w-16 shrink-0 items-center justify-center border-l bg-transparent px-3 text-sm font-semibold uppercase tracking-[0.18em] text-inherit! transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ${
                            isActive
                              ? "border-black/25 hover:bg-black/[0.10] focus-visible:ring-black/40"
                              : "border-white/30 hover:bg-white/[0.10] focus-visible:ring-white/50"
                          }`}
                          aria-label={`Open ${event.name}`}
                          title={`Open ${event.name}`}
                        >
                          Open
                        </Link>
                      ) : (
                        <span
                          className={`flex min-h-[88px] lg:min-h-[58px] w-16 shrink-0 items-center justify-center border-l px-3 text-sm font-semibold uppercase tracking-[0.18em] select-none ${
                            isActive
                              ? "border-black/15 text-black/30"
                              : "border-white/10 text-ink-muted/40"
                          }`}
                        >
                          Open
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="space-y-4 p-6">
            <h2 className="text-xl font-semibold leading-tight text-ink">Event summary</h2>
            {!selectedEvent ? (
              <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                Select an event to see its summary.
              </Card>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold leading-tight text-ink">{selectedEvent.name}</h3>
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
                <EventSummaryPanel eventId={selectedEvent.id} />
              </div>
            )}
          </Card>
        </div>
      </SectionShell>
    </div>
  );
}
