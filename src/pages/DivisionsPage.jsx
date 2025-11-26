import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getEventsList } from "../services/leagueService";
import { getMatchesByEvent } from "../services/matchService";
import { hydrateVenueLookup } from "../services/venueService";

export default function DivisionsPage() {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState(null);
  const [matchTab, setMatchTab] = useState("upcoming");
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
          setSelectedEventId((list && list[0]?.id) || null);
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
    async function loadMatches() {
      setMatchesLoading(true);
      setMatchesError(null);
      try {
        const list = await getMatchesByEvent(selectedEventId, 200, { includeFinished: true });
        if (!ignore) {
          setMatches(list || []);
        }
      } catch (err) {
        if (!ignore) {
          setMatchesError(err.message || "Unable to load matches for this event.");
          setMatches([]);
        }
      } finally {
        if (!ignore) {
          setMatchesLoading(false);
        }
      }
    }
    loadMatches();
    return () => {
      ignore = true;
    };
  }, [selectedEventId]);

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
        buckets.past.push(match);
        return;
      }
      buckets.upcoming.push(match);
    });
    return buckets;
  }, [matches]);

  const activeMatches = matchBuckets[matchTab] || [];

  const resolveVenueName = (match) =>
    match.venue?.name || (match.venue_id && venueLookup[match.venue_id]) || "Venue TBD";

  return (
    <div className="pb-16 text-[var(--sc-ink)]">
      <header className="sc-shell py-6">
        <div className="sc-card-base p-6 sm:p-8 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sc-chip">Divisions</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
              Events and fixtures
            </span>
          </div>
          <h1 className="text-3xl font-semibold">Pick an event to explore its details.</h1>
          <p className="text-sm text-[var(--sc-ink-muted)] max-w-3xl">
            Browse tournaments, check schedules, and jump into match details.
          </p>
        </div>
      </header>

      <main className="sc-shell space-y-4 sm:space-y-6">
        {error && (
          <p className="sc-card-muted border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {error}
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="sc-card-base p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="sc-chip">Events</span>
                <p className="text-sm font-semibold text-[var(--sc-ink)]">Select an event</p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                {loading ? "Loading..." : `${events.length} total`}
              </span>
            </div>
            {loading && events.length === 0 ? (
              <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">
                No events registered yet.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {events.map((event) => {
                  const isActive = event.id === selectedEventId;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setSelectedEventId(event.id)}
                      className={`sc-card-base w-full text-left transition hover:-translate-y-0.5 ${
                        isActive ? "border-[var(--sc-accent)] shadow-[0_16px_40px_rgba(5,43,29,0.18)]" : ""
                      }`}
                      style={{ padding: "16px" }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                        {event.type || "Event"}
                      </p>
                      <p className="text-base font-semibold text-[var(--sc-ink)]">{event.name}</p>
                      <p className="text-xs text-[var(--sc-ink-muted)]">
                        {formatDate(event.start_date)} - {formatDate(event.end_date)}
                      </p>
                      {event.location && (
                        <p className="mt-1 text-xs text-[var(--sc-ink-muted)]">Location: {event.location}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="sc-card-base p-6 space-y-3">
            <p className="sc-chip">Event details</p>
            {!selectedEvent ? (
              <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">
                Select an event to view its details.
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="sc-card-muted p-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--sc-ink-muted)]">Name</p>
                  <p className="text-base font-semibold text-[var(--sc-ink)]">{selectedEvent.name}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sc-card-muted p-3">
                    <p className="text-xs uppercase tracking-wide text-[var(--sc-ink-muted)]">Start date</p>
                    <p className="font-semibold text-[var(--sc-ink)]">{formatDate(selectedEvent.start_date)}</p>
                  </div>
                  <div className="sc-card-muted p-3">
                    <p className="text-xs uppercase tracking-wide text-[var(--sc-ink-muted)]">End date</p>
                    <p className="font-semibold text-[var(--sc-ink)]">{formatDate(selectedEvent.end_date)}</p>
                  </div>
                </div>
                <div className="sc-card-muted p-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--sc-ink-muted)]">Event type</p>
                  <p className="font-semibold text-[var(--sc-ink)]">{selectedEvent.type || "Not specified"}</p>
                </div>
                <div className="sc-card-muted p-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--sc-ink-muted)]">Location</p>
                  <p className="font-semibold text-[var(--sc-ink)]">{selectedEvent.location || "TBD"}</p>
                </div>
                <div className="sc-card-muted p-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--sc-ink-muted)]">Created</p>
                  <p className="font-semibold text-[var(--sc-ink)]">
                    {formatDate(selectedEvent.created_at)} at{" "}
                    {selectedEvent.created_at
                      ? new Date(selectedEvent.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--"}
                  </p>
                </div>
                <p className="text-xs text-[var(--sc-ink-muted)]">
                  Choose an event, then head to Matches for full fixtures.
                </p>
              </div>
            )}
          </section>
        </div>

        <section className="sc-card-base p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="sc-chip">Scoreboard</p>
              <p className="text-sm text-[var(--sc-ink-muted)]">View matches for the selected event by status.</p>
            </div>
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
          </div>

          {matchesError && (
            <p className="sc-card-muted border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {matchesError}
            </p>
          )}

          {matchesLoading && activeMatches.length === 0 ? (
            <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">Loading matches...</div>
          ) : activeMatches.length === 0 ? (
            <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">
              No matches in this category yet.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activeMatches.map((match) => {
                const isNavigable =
                  match.status === "live" ||
                  match.status === "halftime" ||
                  match.status === "finished" ||
                  match.status === "completed";
                const cardContent = (
                  <article
                    key={match.id}
                    className={`sc-card-base h-full p-4 text-sm transition ${
                      isNavigable ? "hover:-translate-y-0.5" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-[var(--sc-ink-muted)]">
                      <span>
                        {formatDate(match.start_time)} at {formatTime(match.start_time)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                          match.status === "live"
                            ? "bg-emerald-100 text-emerald-800"
                            : match.status === "halftime"
                              ? "bg-sky-100 text-sky-800"
                              : match.status === "scheduled" || match.status === "ready" || match.status === "pending"
                                ? "bg-slate-100 text-slate-700"
                                : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {match.status || "Status"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                      {resolveVenueName(match)}
                    </p>
                    <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-semibold text-[var(--sc-ink)]">
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
                  </article>
                );

                return isNavigable ? (
                  <Link
                    key={match.id}
                    to={`/matches?matchId=${encodeURIComponent(match.id)}`}
                    className="block h-full"
                  >
                    {cardContent}
                  </Link>
                ) : (
                  <div key={match.id} className="h-full">
                    {cardContent}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
