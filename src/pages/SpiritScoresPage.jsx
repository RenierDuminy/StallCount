import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getEventsList } from "../services/leagueService";
import { getMatchById, getMatchesByEvent, updateMatchStatus } from "../services/matchService";
import { submitSpiritScores } from "../services/spiritScoreService";
import { getRoleCatalog } from "../services/userService";
import { Card, Field, Input, SectionHeader, SectionShell, Select, Textarea } from "../components/ui/primitives";
import { SPIRIT_SCORES_ACCESS_PERMISSIONS, userHasAnyPermission } from "../utils/accessControl";
import usePersistentState from "../hooks/usePersistentState";

const SPIRIT_CATEGORIES = [
  { key: "rulesKnowledge", label: "Rules knowledge & use" },
  { key: "fouls", label: "Fouls & body contact" },
  { key: "fairness", label: "Fair-mindedness" },
  { key: "positiveAttitude", label: "Positive attitude" },
  { key: "communication", label: "Communication" },
];

const SPIRIT_SELECTED_EVENT_KEY = "stallcount:spirit-scores:selected-event:v1";
const SPIRIT_SELECTED_MATCH_KEY = "stallcount:spirit-scores:selected-match:v1";
const SPIRIT_TEAM_SCORES_KEY = "stallcount:spirit-scores:team-scores:v1";

const createDefaultScores = () => ({
  rulesKnowledge: 2,
  fouls: 2,
  fairness: 2,
  positiveAttitude: 2,
  communication: 2,
  notes: "",
});

const createDefaultTeamScores = () => ({
  teamA: createDefaultScores(),
  teamB: createDefaultScores(),
});

export default function SpiritScoresPage() {
  const { session, roles, rolesLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const prefilledEventId = searchParams.get("eventId") || "";
  const prefilledMatchId = searchParams.get("matchId") || "";

  const [selectedEventId, setSelectedEventId] = usePersistentState(SPIRIT_SELECTED_EVENT_KEY, "");
  const [selectedMatchId, setSelectedMatchId] = usePersistentState(SPIRIT_SELECTED_MATCH_KEY, "");
  const [teamScores, setTeamScores] = usePersistentState(SPIRIT_TEAM_SCORES_KEY, createDefaultTeamScores());

  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(null);
  const [roleCatalog, setRoleCatalog] = useState([]);
  const [roleCatalogLoading, setRoleCatalogLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [matchListLoading, setMatchListLoading] = useState(false);
  const [matchDetailLoading, setMatchDetailLoading] = useState(false);
  const [matchError, setMatchError] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [submitState, setSubmitState] = useState({ message: null, variant: null });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (prefilledEventId) {
      setSelectedEventId(prefilledEventId);
    }
  }, [prefilledEventId, setSelectedEventId]);

  useEffect(() => {
    if (prefilledMatchId) {
      setSelectedMatchId(prefilledMatchId);
    }
  }, [prefilledMatchId, setSelectedMatchId]);

  useEffect(() => {
    let ignore = false;

    async function loadEvents() {
      setEventsLoading(true);
      setEventsError(null);
      try {
        const rows = await getEventsList(100);
        if (!ignore) {
          setEvents(rows ?? []);
        }
      } catch (err) {
        if (!ignore) {
          setEventsError(err instanceof Error ? err.message : "Unable to load events.");
          setEvents([]);
        }
      } finally {
        if (!ignore) {
          setEventsLoading(false);
        }
      }
    }

    loadEvents();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadRoleCatalog() {
      setRoleCatalogLoading(true);
      try {
        const catalog = await getRoleCatalog();
        if (!ignore) {
          setRoleCatalog(Array.isArray(catalog) ? catalog : []);
        }
      } catch (err) {
        if (!ignore) {
          console.error("[SpiritScoresPage] Unable to load role catalog:", err);
          setRoleCatalog([]);
        }
      } finally {
        if (!ignore) {
          setRoleCatalogLoading(false);
        }
      }
    }

    loadRoleCatalog();
    return () => {
      ignore = true;
    };
  }, []);

  const loadMatchesForEvent = useCallback(
    async (eventId, preferredMatchId = "") => {
      if (!eventId) {
        setMatches([]);
        return;
      }

      setMatchListLoading(true);
      setMatchError(null);
      try {
        const rows = await getMatchesByEvent(eventId, 100, { includeFinished: true });
        const nextMatches = rows ?? [];
        setMatches(nextMatches);

        const targetMatchId = preferredMatchId || selectedMatchId;
        if (targetMatchId && !nextMatches.some((match) => match.id === targetMatchId)) {
          setSelectedMatchId("");
        }
      } catch (err) {
        setMatches([]);
        setMatchError(err instanceof Error ? err.message : "Unable to load matches for the selected event.");
      } finally {
        setMatchListLoading(false);
      }
    },
    [selectedMatchId, setSelectedMatchId],
  );

  useEffect(() => {
    if (!selectedMatchId) {
      setMatchDetailLoading(false);
      setSelectedMatch(null);
      return;
    }

    const cached = matches.find((match) => match.id === selectedMatchId);
    if (cached) {
      setMatchDetailLoading(false);
      setSelectedMatch(cached);
      if (cached.event_id && cached.event_id !== selectedEventId) {
        setSelectedEventId(cached.event_id);
      }
      return;
    }

    let ignore = false;

    async function fetchMatch() {
      setMatchDetailLoading(true);
      setMatchError(null);
      try {
        const match = await getMatchById(selectedMatchId);
        if (ignore) return;

        if (!match) {
          setSelectedMatch(null);
          setMatchError("Unable to load the selected match.");
          return;
        }

        setSelectedMatch(match);

        const resolvedEventId = match.event_id || match.event?.id || "";
        if (resolvedEventId && resolvedEventId !== selectedEventId) {
          setSelectedEventId(resolvedEventId);
        }

        setMatches((current) => {
          if (current.some((entry) => entry.id === match.id)) {
            return current;
          }
          return [...current, match].sort(compareMatchesByStartTime);
        });
      } catch (err) {
        if (!ignore) {
          setSelectedMatch(null);
          setMatchError(err instanceof Error ? err.message : "Unable to load the selected match.");
        }
      } finally {
        if (!ignore) {
          setMatchDetailLoading(false);
        }
      }
    }

    fetchMatch();
    return () => {
      ignore = true;
    };
  }, [matches, selectedEventId, selectedMatchId, setSelectedEventId]);

  useEffect(() => {
    if (!selectedMatchId) return;
    setTeamScores(createDefaultTeamScores());
  }, [selectedMatchId, setTeamScores]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);

    if (selectedEventId) {
      nextParams.set("eventId", selectedEventId);
    } else {
      nextParams.delete("eventId");
    }

    if (selectedMatchId) {
      nextParams.set("matchId", selectedMatchId);
    } else {
      nextParams.delete("matchId");
    }

    const currentKey = searchParams.toString();
    const nextKey = nextParams.toString();
    if (currentKey !== nextKey) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, selectedEventId, selectedMatchId, setSearchParams]);

  const allowedEventIds = useMemo(() => {
    if (!Array.isArray(roles) || roles.length === 0) {
      return new Set();
    }

    const hasGlobalSpiritAccess = roles.some((assignment) => {
      if (assignment?.scope === "event" || assignment?.eventId) {
        return false;
      }
      return userHasAnyPermission(
        session?.user,
        SPIRIT_SCORES_ACCESS_PERMISSIONS,
        [assignment],
        roleCatalog,
      );
    });

    if (hasGlobalSpiritAccess) {
      return null;
    }

    const scopedEventIds = new Set();
    roles.forEach((assignment) => {
      if (!assignment?.eventId) {
        return;
      }
      if (
        userHasAnyPermission(
          session?.user,
          SPIRIT_SCORES_ACCESS_PERMISSIONS,
          [assignment],
          roleCatalog,
        )
      ) {
        scopedEventIds.add(String(assignment.eventId));
      }
    });
    return scopedEventIds;
  }, [roleCatalog, roles, session?.user]);

  const availableEvents = useMemo(() => {
    if (allowedEventIds === null) {
      return events;
    }
    return events.filter((event) => allowedEventIds.has(String(event.id)));
  }, [allowedEventIds, events]);

  useEffect(() => {
    const eventIsAvailable =
      selectedEventId &&
      availableEvents.some((event) => String(event.id) === String(selectedEventId));

    if (!selectedEventId || !eventIsAvailable) {
      setMatches([]);
      return;
    }
    void loadMatchesForEvent(selectedEventId, prefilledMatchId || selectedMatchId);
  }, [availableEvents, loadMatchesForEvent, prefilledMatchId, selectedEventId, selectedMatchId]);

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) {
      return selectedMatch?.event || null;
    }
    return availableEvents.find((event) => event.id === selectedEventId) || selectedMatch?.event || null;
  }, [availableEvents, selectedEventId, selectedMatch]);

  useEffect(() => {
    if (!selectedEventId) return;
    if (!availableEvents.some((event) => String(event.id) === String(selectedEventId))) {
      setSelectedEventId("");
    }
  }, [availableEvents, selectedEventId, setSelectedEventId]);

  const teamLabels = useMemo(
    () => ({
      teamA: selectedMatch?.team_a?.name || "Team A",
      teamB: selectedMatch?.team_b?.name || "Team B",
    }),
    [selectedMatch],
  );

  const handleEventChange = (eventId) => {
    setSelectedEventId(eventId);
    setSelectedMatchId("");
    setSelectedMatch(null);
    setMatchError(null);
    setSubmitState({ message: null, variant: null });
  };

  const handleMatchChange = (matchId) => {
    setSelectedMatchId(matchId);
    setSubmitState({ message: null, variant: null });
    if (!matchId) {
      setSelectedMatch(null);
      setMatchError(null);
    }
  };

  const updateScore = (teamKey, field, value) => {
    setTeamScores((prev) => ({
      ...prev,
      [teamKey]: {
        ...prev[teamKey],
        [field]: Math.min(4, Math.max(0, Number(value) || 0)),
      },
    }));
  };

  const updateNotes = (teamKey, value) => {
    setTeamScores((prev) => ({
      ...prev,
      [teamKey]: {
        ...prev[teamKey],
        notes: value,
      },
    }));
  };

  return (
    <div className="pb-10 text-[var(--sc-surface-dark-ink)]" style={{ background: "var(--sc-surface-light-bg)" }}>
      <SectionShell as="header" className="px-8 py-3 sm:px-18 sm:py-4 lg:px-30">
        <Card variant="light" className="space-y-2 border border-[#041311] p-4 sm:p-5">
          <SectionHeader
            title="Spirit scores"
            action={
              <Link to="/score-keeper" className="sc-button is-dark">
                Back to score keeper
              </Link>
            }
          />
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-2 px-8 sm:px-14 lg:px-20">
        <form
          className="space-y-2.5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selectedEventId) {
              setSubmitState({ message: "Select an event before submitting.", variant: "error" });
              return;
            }
            if (!selectedMatchId) {
              setSubmitState({ message: "Select a match before submitting.", variant: "error" });
              return;
            }
            if (!selectedMatch?.team_a?.id || !selectedMatch?.team_b?.id) {
              setSubmitState({
                message: "The selected match is missing team assignments.",
                variant: "error",
              });
              return;
            }

            setSubmitting(true);
            setSubmitState({ message: null, variant: null });

            try {
              const buildEntry = (teamKey, ratedTeamId) => ({
                ratedTeamId,
                rulesKnowledge: teamScores[teamKey].rulesKnowledge,
                fouls: teamScores[teamKey].fouls,
                fairness: teamScores[teamKey].fairness,
                positiveAttitude: teamScores[teamKey].positiveAttitude,
                communication: teamScores[teamKey].communication,
                notes: teamScores[teamKey].notes,
              });

              await submitSpiritScores(
                selectedMatchId,
                [
                  buildEntry("teamA", selectedMatch.team_a.id),
                  buildEntry("teamB", selectedMatch.team_b.id),
                ],
                { submittedBy: userId ?? undefined },
              );

              await updateMatchStatus(selectedMatchId, "completed");

              setTeamScores(createDefaultTeamScores());

              setSubmitState({
                message: "Spirit scores submitted",
                variant: "success",
              });
            } catch (err) {
              setSubmitState({
                message: err instanceof Error ? err.message : "Failed to submit spirit scores.",
                variant: "error",
              });
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <section className="space-y-3 rounded-2xl border border-[#041311] px-4 py-3 text-[var(--sc-surface-light-ink)] sm:px-5">
            <div className="space-y-0.5">
              <h2 className="text-xl font-semibold">Select the match to score</h2>
              <p className="text-xs text-[var(--sc-surface-light-ink)]/80 sm:text-sm">
                Choose an event, then the fixture. Redirects from the scorekeeper now prefill both the match context and the match details.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Event" className="is-light">
                {eventsLoading ? (
                  <div className="rounded-xl border border-[var(--sc-surface-light-border)] bg-white/80 px-3 py-2 text-xs text-[var(--sc-surface-light-ink)]">
                    Loading events...
                  </div>
                ) : eventsError ? (
                  <div className="sc-alert is-error">{eventsError}</div>
                ) : (
                  <Select
                    className="is-light"
                    value={selectedEventId}
                    onChange={(event) => handleEventChange(event.target.value)}
                    disabled={rolesLoading || roleCatalogLoading || availableEvents.length === 0}
                  >
                    <option value="">
                      {rolesLoading || roleCatalogLoading
                        ? "Loading access..."
                        : availableEvents.length === 0
                          ? "No available events"
                          : "Select an event..."}
                    </option>
                    {availableEvents.map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatEventLabel(item)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Match" className="is-light">
                {matchListLoading ? (
                  <div className="rounded-xl border border-[var(--sc-surface-light-border)] bg-white/80 px-3 py-2 text-xs text-[var(--sc-surface-light-ink)]">
                    Loading matches...
                  </div>
                ) : matchError && !selectedMatch ? (
                  <div className="sc-alert is-error">{matchError}</div>
                ) : (
                  <Select
                    className="is-light"
                    value={selectedMatchId}
                    onChange={(event) => handleMatchChange(event.target.value)}
                    disabled={!selectedEventId && !prefilledMatchId}
                  >
                    <option value="">
                      {!selectedEventId
                        ? "Select an event first..."
                        : matches.length
                          ? "Select a match..."
                          : "No matches available for this event"}
                    </option>
                    {matches.map((match) => (
                      <option key={match.id} value={match.id}>
                        {formatMatchLabel(match)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Match ID" htmlFor="spirit-match-id" className="is-light">
                <Input
                  className="is-light"
                  id="spirit-match-id"
                  value={selectedMatchId}
                  readOnly
                  placeholder="Select or load a match"
                />
              </Field>
            </div>

            {selectedMatch ? (
              <div className="rounded-2xl border border-[#041311]/20 bg-white/80 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--sc-surface-light-ink)]/60">
                      Loaded match
                    </p>
                    <h3 className="text-lg font-semibold text-[var(--sc-surface-light-ink)]">
                      {teamLabels.teamA} vs {teamLabels.teamB}
                    </h3>
                    <p className="text-xs text-[var(--sc-surface-light-ink)]/75 sm:text-sm">
                      {selectedEvent?.name || selectedMatch.event?.name || "Event not assigned"}
                    </p>
                  </div>
                  <div className="rounded-full border border-[#041311]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">
                    {selectedMatch.status || "Scheduled"}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <MatchDetail label="Match ID" value={selectedMatch.id} mono />
                  <MatchDetail label="Kickoff" value={formatKickoff(selectedMatch.start_time)} />
                  <MatchDetail label="Venue" value={formatVenueLabel(selectedMatch)} />
                  <MatchDetail label="Score" value={formatScoreLabel(selectedMatch)} />
                </div>

                {matchError ? <div className="mt-3 sc-alert is-error">{matchError}</div> : null}
                {matchDetailLoading ? (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
                    Refreshing match details...
                  </p>
                ) : null}
              </div>
            ) : selectedMatchId && matchDetailLoading ? (
              <div className="rounded-2xl border border-[#041311]/20 bg-white/80 px-4 py-3 text-sm text-[var(--sc-surface-light-ink)]/75">
                Loading selected match details...
              </div>
            ) : !rolesLoading && !roleCatalogLoading && availableEvents.length === 0 && !eventsError ? (
              <div className="rounded-2xl border border-[#041311]/20 bg-white/80 px-4 py-3 text-sm text-[var(--sc-surface-light-ink)]/75">
                No events are linked to your spirit score access assignments.
              </div>
            ) : null}
          </section>

          <div className="grid gap-2 md:grid-cols-2">
            {["teamA", "teamB"].map((teamKey) => (
              <section
                key={teamKey}
                className="space-y-3 rounded-2xl border border-[#041311] px-5 py-3 text-[var(--sc-surface-light-ink)] sm:px-6"
              >
                <div>
                  <h3 className="text-base font-semibold text-[var(--sc-surface-light-ink)]">
                    Score for {teamKey === "teamA" ? teamLabels.teamA : teamLabels.teamB}
                  </h3>
                </div>
                {SPIRIT_CATEGORIES.map((category) => (
                  <label
                    key={`${teamKey}-${category.key}`}
                    className="block text-sm font-semibold text-[var(--sc-surface-light-ink)]"
                  >
                    <div className="flex items-center justify-between">
                      <span>{category.label}</span>
                      <span className="text-xs text-[var(--sc-surface-light-ink)]/70">
                        {teamScores[teamKey][category.key]}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="4"
                      step="1"
                      value={teamScores[teamKey][category.key]}
                      onChange={(event) => updateScore(teamKey, category.key, event.target.value)}
                      className="mt-0.5 w-full"
                      style={{ accentColor: "#01611b" }}
                    />
                    <div className="flex justify-between text-xs text-[var(--sc-surface-light-ink)]/60">
                      <span>0</span>
                      <span>1</span>
                      <span>2</span>
                      <span>3</span>
                      <span>4</span>
                    </div>
                  </label>
                ))}
                <Field label="Notes" htmlFor={`${teamKey}-notes`} className="is-light">
                  <Textarea
                    className="is-light !min-h-[60px]"
                    id={`${teamKey}-notes`}
                    rows={2}
                    value={teamScores[teamKey].notes}
                    onChange={(event) => updateNotes(teamKey, event.target.value)}
                  />
                </Field>
              </section>
            ))}
          </div>

          {submitState.message ? (
            <div className={`sc-alert ${submitState.variant === "success" ? "is-success" : "is-error"}`}>{submitState.message}</div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={submitting} className="sc-button is-dark disabled:cursor-not-allowed">
              {submitting ? "Submitting..." : "Submit spirit scores"}
            </button>
            <Link to="/score-keeper" className="sc-button is-dark">
              Cancel
            </Link>
          </div>
        </form>
      </SectionShell>
    </div>
  );
}

function MatchDetail({ label, value, mono = false }) {
  return (
    <div className="space-y-1 rounded-xl border border-[#041311]/10 bg-white/70 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/55">{label}</p>
      <p className={`text-sm text-[var(--sc-surface-light-ink)] ${mono ? "font-mono break-all" : "font-semibold"}`}>
        {value || "TBD"}
      </p>
    </div>
  );
}

function compareMatchesByStartTime(matchA, matchB) {
  const timeA = matchA?.start_time ? new Date(matchA.start_time).getTime() : Number.POSITIVE_INFINITY;
  const timeB = matchB?.start_time ? new Date(matchB.start_time).getTime() : Number.POSITIVE_INFINITY;
  if (timeA !== timeB) {
    return timeA - timeB;
  }
  return `${matchA?.id || ""}`.localeCompare(`${matchB?.id || ""}`);
}

function formatEventLabel(event) {
  if (!event) return "Event";
  const dateLabel = event.start_date
    ? new Date(event.start_date).toLocaleDateString([], {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  return dateLabel ? `${event.name} (${dateLabel})` : event.name;
}

function formatMatchLabel(match) {
  const teamA = match.team_a?.short_name || match.team_a?.name || "Team A";
  const teamB = match.team_b?.short_name || match.team_b?.name || "Team B";
  return `${formatKickoff(match.start_time)} - ${teamA} vs ${teamB}`;
}

function formatKickoff(timestamp) {
  if (!timestamp) return "Time TBD";
  return new Date(timestamp).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatVenueLabel(match) {
  if (!match?.venue) return "Venue TBD";
  const city = typeof match.venue.city === "string" ? match.venue.city.trim() : "";
  const location = typeof match.venue.location === "string" ? match.venue.location.trim() : "";
  const name = typeof match.venue.name === "string" ? match.venue.name.trim() : "";
  const lead = [city, location].filter(Boolean).join(", ");
  return [lead, name].filter(Boolean).join(" - ") || "Venue TBD";
}

function formatScoreLabel(match) {
  const scoreA = Number.isFinite(match?.score_a) ? match.score_a : 0;
  const scoreB = Number.isFinite(match?.score_b) ? match.score_b : 0;
  return `${scoreA} - ${scoreB}`;
}
