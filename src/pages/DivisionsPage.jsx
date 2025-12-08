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

  const rulesSummary = useMemo(() => {
    const rules = selectedEvent?.rules;
    if (!rules || typeof rules !== "object") return null;
    const game = rules.game || {};
    const half = rules.half || {};
    const timeouts = rules.timeouts || {};
    const clock = rules.clock || {};

    const rows = [
      { label: "Game to", value: game.pointTarget },
      { label: "Soft cap (min)", value: game.softCapMinutes },
      { label: "Hard cap (min)", value: game.hardCapMinutes },
      { label: "Half at", value: half.pointTarget },
      { label: "Half time cap (min)", value: half.timeCapMinutes },
      { label: "Half break (min)", value: half.breakMinutes },
      { label: "Timeouts per team", value: timeouts.perTeamPerGame },
      { label: "Timeout length (sec)", value: timeouts.durationSeconds },
      {
        label: "Running clock",
        value:
          typeof clock.isRunningClockEnabled === "boolean"
            ? clock.isRunningClockEnabled
              ? "Enabled"
              : "Disabled"
            : null,
      },
    ].filter((row) => row.value !== null && row.value !== undefined && row.value !== "");

    return rows.length ? rows : null;
  }, [selectedEvent?.rules]);

  return (
    <div className="pb-16 text-[var(--sc-ink)]">
      <header className="sc-shell py-6">
        <div className="sc-card-base p-6 sm:p-8 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sc-chip">Divisions</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
              Event operations
            </span>
          </div>
          <h1 className="text-3xl font-semibold">Division control center</h1>
          <p className="text-sm text-[var(--sc-ink-muted)] max-w-3xl">
            Select a tournament to view its calendar, venue posture, rule set, and live fixtures—everything organizers
            need to keep divisions moving on time.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/division-results" className="sc-button">
              Division results
            </Link>
            <span className="text-xs text-[var(--sc-ink-muted)]">
              View consolidated standings and scoring ladders.
            </span>
          </div>
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
                      className={`w-full text-left transition ${
                        isActive ? "sc-button" : "sc-button is-ghost !text-[var(--sc-ink)]"
                      } !flex !flex-col !items-start !justify-start !gap-1.5 !rounded-2xl !px-4 !py-3`}
                    >
                      <p
                        className={`text-xs font-semibold uppercase tracking-wide ${
                          isActive ? "text-[#0b2c23]" : "text-[var(--sc-ink-muted)]"
                        }`}
                      >
                        {event.type || "Event"}
                      </p>
                      <p className={`text-base font-semibold ${isActive ? "text-[#03140f]" : "text-[var(--sc-ink)]"}`}>
                        {event.name}
                      </p>
                      <p className={`text-xs ${isActive ? "text-[#0b2c23]" : "text-[var(--sc-ink-muted)]"}`}>
                        {formatDate(event.start_date)} - {formatDate(event.end_date)}
                      </p>
                      {event.location && (
                        <p className={`mt-1 text-xs ${isActive ? "text-[#0b2c23]" : "text-[var(--sc-ink-muted)]"}`}>
                          Location: {event.location}
                        </p>
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
                {rulesSummary && (
                  <div className="sc-card-muted p-3 space-y-2">
                    <p className="text-xs uppercase tracking-wide text-[var(--sc-ink-muted)]">Rules snapshot</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {rulesSummary.map((row) => (
                        <div key={row.label} className="rounded-xl border border-[var(--sc-border)]/60 bg-white/5 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-[var(--sc-ink-muted)]">{row.label}</p>
                          <p className="text-sm font-semibold text-[var(--sc-ink)]">{row.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-[var(--sc-ink-muted)]">
                  Lock an event here and transition to Matches for deeper analytics or officiating detail.
                </p>
              </div>
            )}
          </section>
        </div>

        <section className="sc-card-base p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="sc-chip">Scoreboard</p>
              <p className="text-sm text-[var(--sc-ink-muted)]">
                Monitor streaming assignments and results for the selected event, filtered by competitive state.
              </p>
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
                const rawMediaUrl = typeof match.media_url === "string" ? match.media_url.trim() : "";
                const mediaUrl = rawMediaUrl && /^https?:\/\//i.test(rawMediaUrl) ? rawMediaUrl : null;
                const mediaProviderLabel = (() => {
                  const raw = (match.media_provider || "stream").replace(/_/g, " ").trim();
                  if (!raw) return "Stream";
                  return raw
                    .split(" ")
                    .filter(Boolean)
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(" ");
                })();
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
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--sc-border)] bg-white/70 text-[var(--sc-ink)] transition hover:-translate-y-0.5 hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea4335]"
                    title={`Watch on ${mediaProviderLabel}`}
                    aria-label={`Watch on ${mediaProviderLabel}`}
                  >
                    <img src="/youtube.png" alt="" className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : null;
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
                      <div className="flex items-center gap-2">
                        {mediaButton}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                            match.status === "live"
                              ? "bg-emerald-100 text-emerald-800"
                              : match.status === "halftime"
                                ? "bg-sky-100 text-sky-800"
                                : match.status === "scheduled" ||
                                    match.status === "ready" ||
                                    match.status === "pending"
                                  ? "bg-slate-100 text-slate-700"
                                  : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {match.status || "Status"}
                        </span>
                      </div>
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
