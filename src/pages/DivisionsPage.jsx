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
    <div className="min-h-screen bg-[#f3f7f4] pb-16">
      <header className="border-b border-emerald-900/10 bg-[#072013] py-3 text-emerald-50 sm:py-5">
        <div className="sc-shell matches-compact-shell">
          <p className="text-l font-semibold uppercase tracking-wide text-emerald-300">Divisions</p>
          <p className="mt-1 max-w-3xl text-sm text-emerald-100 sm:mt-1.5">
            Browse every registered event and pick one to explore its details.
          </p>
        </div>
      </header>

      <main className="sc-shell matches-compact-shell py-4 sm:py-6">
        {error && (
          <p className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-emerald-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-l font-semibold uppercase tracking-wide text-emerald-800">Events</p>
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {loading ? "Loading..." : `${events.length} total`}
              </span>
            </div>
            {loading && events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-emerald-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-600">
                Loading events...
              </div>
            ) : events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-emerald-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-600">
                No events registered yet.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {events.map((event) => {
                  const isActive = event.id === selectedEventId;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setSelectedEventId(event.id)}
                      className={`rounded-2xl border px-3 py-3 text-left text-sm transition hover:border-emerald-400 hover:shadow ${
                        isActive
                          ? "border-emerald-500 bg-emerald-50 shadow-sm"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        {event.type || "Event"}
                      </p>
                      <p className="text-base font-semibold text-[#04140c]">{event.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(event.start_date)} — {formatDate(event.end_date)}
                      </p>
                      {event.location && (
                        <p className="mt-1 text-xs text-slate-600">Location: {event.location}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-emerald-200 bg-white p-3 shadow-sm sm:p-4">
            <p className="text-l font-semibold uppercase tracking-wide text-emerald-800">Event details</p>
            {!selectedEvent ? (
              <div className="mt-3 rounded-2xl border border-dashed border-emerald-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-600">
                Select an event to view its details.
              </div>
            ) : (
              <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
                <div>
                  <p className="text-xs uppercase tracking-wide text-emerald-700">Name</p>
                  <p className="text-base font-semibold text-[#052b1d]">{selectedEvent.name}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-emerald-700">Start date</p>
                    <p className="font-semibold text-[#052b1d]">{formatDate(selectedEvent.start_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-emerald-700">End date</p>
                    <p className="font-semibold text-[#052b1d]">{formatDate(selectedEvent.end_date)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-emerald-700">Event type</p>
                  <p className="font-semibold text-[#052b1d]">{selectedEvent.type || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-emerald-700">Location</p>
                  <p className="font-semibold text-[#052b1d]">{selectedEvent.location || "TBD"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-emerald-700">Created</p>
                  <p className="font-semibold text-[#052b1d]">
                    {formatDate(selectedEvent.created_at)} at{" "}
                    {selectedEvent.created_at
                      ? new Date(selectedEvent.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--"}
                  </p>
                </div>
                <p className="text-xs text-emerald-800/80">
                  Pick an event here, then navigate to Matches to explore fixtures and logs for the selected tournament.
                </p>
              </div>
            )}
          </section>
        </div>

        <section className="mt-3 rounded-3xl border border-emerald-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-l font-semibold uppercase tracking-wide text-emerald-800">
                Scoreboard
              </p>
              <p className="text-xs text-slate-600">
                View matches for the selected event by status.
              </p>
            </div>
            <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50/40 p-1 text-xs font-semibold text-emerald-800">
              {[
                { key: "current", label: "Current Games" },
                { key: "upcoming", label: "Upcoming Games" },
                { key: "past", label: "Recent Games" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setMatchTab(tab.key)}
                  className={`rounded-full px-3 py-1 transition ${
                    matchTab === tab.key
                      ? "bg-white text-emerald-900 shadow-sm"
                      : "text-emerald-700 hover:bg-white/80"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {matchesError && (
            <p className="mb-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {matchesError}
            </p>
          )}

          {matchesLoading && activeMatches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-600">
              Loading matches...
            </div>
          ) : activeMatches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-600">
              No matches in this category yet.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activeMatches.map((match) => {
                const isNavigable =
                  match.status === "live" ||
                  match.status === "halftime" ||
                  match.status === "finished" ||
                  match.status === "completed";
                const cardContent = (
                  <article
                    key={match.id}
                    className={`flex h-full flex-col rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 shadow-sm transition ${
                      isNavigable ? "hover:border-emerald-400 hover:shadow-md" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>{formatDate(match.start_time)} · {formatTime(match.start_time)}</span>
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
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {resolveVenueName(match)}
                    </p>
                    <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-semibold text-[#04140c]">
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
