import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import usePersistentState from "../../hooks/usePersistentState";
import { Card, Panel, SectionHeader, Chip } from "../../components/ui/primitives";
import { getEventHierarchy } from "../../services/leagueService";
import { getTournamentOverview, invalidateTournamentOverview } from "../../services/tournamentDirectorService";

const LIGHT_INPUT_CLASS =
  "rounded-lg border border-[var(--sc-surface-light-border)] bg-white px-3 py-2 text-sm text-[var(--sc-surface-light-ink)] shadow-sm focus:border-[var(--sc-border-strong)] focus:outline-none";
const TOURNAMENT_DIRECTOR_EVENT_KEY = "stallcount:tournament-director:selected-event:v1";

function formatDateParts(timestamp) {
  if (!timestamp) {
    return { date: "TBD", time: "TBD" };
  }

  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return { date: "TBD", time: "TBD" };
  }

  return {
    date: new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(value),
    time: new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(value),
  };
}

function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return "Dates not set";
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const start = startDate ? formatter.format(new Date(startDate)) : null;
  const end = endDate ? formatter.format(new Date(endDate)) : null;
  if (start && end) return start === end ? start : `${start} to ${end}`;
  return start || end || "Dates not set";
}

function formatRatio(value, total) {
  if (!total) return "0 / 0";
  return `${value} / ${total}`;
}

function getStatusBadgeClass(status) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";

  if (normalized === "live") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (normalized === "completed") {
    return "border-emerald-700 bg-emerald-700 text-white";
  }
  if (normalized === "finished") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "scheduled") {
    return "border-slate-300 bg-slate-100 text-slate-600";
  }

  return "border-slate-300 bg-slate-100 text-slate-600";
}

function SummaryMetric({ label, value, detail }) {
  return (
    <Panel variant="light" className="p-4 shadow-sm shadow-[rgba(8,25,21,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[var(--sc-surface-light-ink)]">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[var(--sc-surface-light-ink)]/70">{detail}</p> : null}
    </Panel>
  );
}

export default function TournamentOverviewPanel({ eventsList = [] }) {
  const navigate = useNavigate();
  const { roles, rolesLoading } = useAuth();
  const [selectedEventId, setSelectedEventId] = usePersistentState(TOURNAMENT_DIRECTOR_EVENT_KEY, "");
  const [eventSummary, setEventSummary] = useState(null);
  const [overview, setOverview] = useState({ matches: [], summary: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const accessibleEvents = useMemo(() => {
    if (!Array.isArray(eventsList) || eventsList.length === 0) {
      return [];
    }

    if (!Array.isArray(roles)) {
      return rolesLoading ? [] : eventsList;
    }

    const hasGlobalAccess = roles.some((assignment) => assignment?.scope === "global");
    if (hasGlobalAccess) {
      return eventsList;
    }

    const allowedEventIds = new Set(
      roles
        .filter((assignment) => assignment?.scope === "event" && typeof assignment?.eventId === "string")
        .map((assignment) => assignment.eventId),
    );

    if (allowedEventIds.size === 0) {
      return [];
    }

    return eventsList.filter((event) => allowedEventIds.has(event.id));
  }, [eventsList, roles, rolesLoading]);

  useEffect(() => {
    if (!accessibleEvents.length) {
      if (selectedEventId) {
        setSelectedEventId("");
      }
      return;
    }

    if (!selectedEventId || !accessibleEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(accessibleEvents[0].id);
    }
  }, [accessibleEvents, selectedEventId, setSelectedEventId]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!selectedEventId) {
        setOverview({ matches: [], summary: null });
        setEventSummary(null);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [hierarchy, overviewData] = await Promise.all([
          getEventHierarchy(selectedEventId),
          getTournamentOverview(selectedEventId),
        ]);

        if (!active) return;
        setEventSummary(hierarchy);
        setOverview(overviewData);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load tournament overview.");
        setEventSummary(null);
        setOverview({ matches: [], summary: null });
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [selectedEventId]);

  const selectedEvent = useMemo(
    () => accessibleEvents.find((event) => event.id === selectedEventId) || null,
    [accessibleEvents, selectedEventId],
  );

  const summary = overview.summary;
  const totalMatches = summary?.totalMatches || 0;
  const divisionCount = eventSummary?.divisions?.length || 0;
  const venueCount = eventSummary?.venues?.length || 0;
  const dateRangeLabel = formatDateRange(selectedEvent?.start_date, selectedEvent?.end_date);

  return (
    <div className="space-y-6">
      <Card variant="light" className="space-y-5 p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
        <SectionHeader
          eyebrow="Tournament overview"
          eyebrowVariant="tag"
          title="Overview"
          description="Pick an event to review the tournament summary and every scheduled match in chronological order."
          action={
            <button
              type="button"
              onClick={async () => {
                if (!selectedEventId) return;
                setLoading(true);
                setError("");
                invalidateTournamentOverview(selectedEventId);
                try {
                  const [hierarchy, overviewData] = await Promise.all([
                    getEventHierarchy(selectedEventId),
                    getTournamentOverview(selectedEventId, { forceRefresh: true }),
                  ]);
                  setEventSummary(hierarchy);
                  setOverview(overviewData);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Unable to refresh tournament overview.");
                } finally {
                  setLoading(false);
                }
              }}
              className="sc-button"
            >
              Refresh overview
            </button>
          }
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),auto]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Event</p>
            <select
              value={selectedEventId}
              onChange={(event) => setSelectedEventId(event.target.value)}
              className={`${LIGHT_INPUT_CLASS} mt-2 w-full appearance-none`}
            >
              {rolesLoading ? <option value="">Loading access...</option> : null}
              {!rolesLoading && accessibleEvents.length === 0 ? <option value="">No accessible events</option> : null}
              {accessibleEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Chip variant="ghost" className="text-xs text-[var(--sc-surface-light-ink)]/80">
              {selectedEvent?.type || "Event"}
            </Chip>
            <Chip variant="ghost" className="text-xs text-[var(--sc-surface-light-ink)]/80">
              {selectedEvent?.status || "Status unknown"}
            </Chip>
          </div>
        </div>
        {selectedEvent ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel variant="light" className="p-4 shadow-sm shadow-[rgba(8,25,21,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">Tournament</p>
              <p className="mt-2 text-lg font-semibold text-[var(--sc-surface-light-ink)]">{selectedEvent.name}</p>
              <p className="mt-1 text-sm text-[var(--sc-surface-light-ink)]/70">{selectedEvent.location || "Location not set"}</p>
            </Panel>
            <Panel variant="light" className="p-4 shadow-sm shadow-[rgba(8,25,21,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">Dates</p>
              <p className="mt-2 text-lg font-semibold text-[var(--sc-surface-light-ink)]">{dateRangeLabel}</p>
              <p className="mt-1 text-sm text-[var(--sc-surface-light-ink)]/70">{divisionCount} divisions, {venueCount} venues</p>
            </Panel>
            <Panel variant="light" className="p-4 shadow-sm shadow-[rgba(8,25,21,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">Participation</p>
              <p className="mt-2 text-lg font-semibold text-[var(--sc-surface-light-ink)]">{summary?.uniqueTeamCount || 0} teams</p>
              <p className="mt-1 text-sm text-[var(--sc-surface-light-ink)]/70">{totalMatches} matches loaded</p>
            </Panel>
          </div>
        ) : null}
        {error ? (
          <Panel variant="light" className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </Panel>
        ) : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryMetric label="Matches" value={totalMatches} detail="All rows in schedule order" />
        <SummaryMetric
          label="Completed"
          value={summary?.completedMatches || 0}
          detail={formatRatio(summary?.completedMatches || 0, totalMatches)}
        />
        <SummaryMetric
          label="Live"
          value={summary?.liveMatches || 0}
          detail={formatRatio(summary?.liveMatches || 0, totalMatches)}
        />
        <SummaryMetric
          label="Scheduled"
          value={summary?.scheduledMatches || 0}
          detail={formatRatio(summary?.scheduledMatches || 0, totalMatches)}
        />
        <SummaryMetric
          label="Captain Confirmed"
          value={summary?.confirmedMatches || 0}
          detail={formatRatio(summary?.confirmedMatches || 0, totalMatches)}
        />
      </div>

      <Card variant="light" className="space-y-4 p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
        <SectionHeader
          eyebrow="Matches"
          eyebrowVariant="tag"
          title="Chronological schedule"
          description={
            summary?.averageSpiritScore != null
              ? `Average spirit score across submitted matches: ${summary.averageSpiritScore}`
              : "Spirit score shows when at least one submission exists for a match."
          }
          action={
            <Chip variant="ghost" className="text-xs uppercase tracking-wide text-[var(--sc-surface-light-ink)]/80">
              {loading ? "Loading" : `${totalMatches} rows`}
            </Chip>
          }
        />
        <div className="overflow-hidden rounded-2xl border border-[var(--sc-surface-light-border)] bg-[#f8fcf9]">
          {loading && overview.matches.length === 0 ? (
            <p className="p-4 text-sm text-[var(--sc-surface-light-ink)]/70">Loading overview...</p>
          ) : overview.matches.length === 0 ? (
            <p className="p-4 text-sm text-[var(--sc-surface-light-ink)]/70">No matches found for this event.</p>
          ) : (
            <div className="overflow-auto">
            <table className="min-w-full table-fixed divide-y divide-[var(--sc-surface-light-border)] text-sm">
              <thead className="sticky top-0 z-10 bg-[#eef7f1] shadow-sm">
                <tr>
                  {[
                    "Date",
                    "Time",
                    "Venue",
                    "Status",
                    "Team A",
                    "SA",
                    "SB",
                    "Team B",
                    "Spirit",
                    "Captain",
                  ].map((column) => (
                    <th
                      key={column}
                      className="whitespace-nowrap px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--sc-surface-light-ink)]/55"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-surface-light-border)]/70">
                {overview.matches.map((match, index) => {
                  const { date, time } = formatDateParts(match.start_time || match.confirmed_at);
                  return (
                    <tr
                      key={match.id}
                      className={`cursor-pointer transition hover:bg-[#e8f4ec] ${index % 2 === 0 ? "bg-white" : "bg-[#fbfdfb]"}`}
                      onClick={() => navigate(`/matches?matchId=${encodeURIComponent(match.id)}`)}
                    >
                      <td className="whitespace-nowrap px-2 py-2 text-[var(--sc-surface-light-ink)]">
                        <div className="flex flex-col">
                          <span className="font-semibold">{date}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-[var(--sc-surface-light-ink)]/80">
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow-sm">
                          {time}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[var(--sc-surface-light-ink)]">
                        <span className="block max-w-[7rem] truncate font-medium">{match.displayVenue}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-[var(--sc-surface-light-ink)]">
                        <span
                          className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${getStatusBadgeClass(match.status)}`}
                        >
                          {match.status || "Unknown"}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-medium text-[var(--sc-surface-light-ink)]">
                        <span className="block max-w-[7rem] truncate">{match.displayTeamA}</span>
                      </td>
                      <td className="whitespace-nowrap px-1.5 py-2 text-center">
                        <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-[#eaf5ee] px-1.5 py-0.5 font-bold tabular-nums text-[var(--sc-surface-light-ink)] shadow-sm">
                          {match.score_a ?? 0}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-1.5 py-2 text-center">
                        <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-[#eaf5ee] px-1.5 py-0.5 font-bold tabular-nums text-[var(--sc-surface-light-ink)] shadow-sm">
                          {match.score_b ?? 0}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-medium text-[var(--sc-surface-light-ink)]">
                        <span className="block max-w-[7rem] truncate">{match.displayTeamB}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-[var(--sc-surface-light-ink)]">
                        {match.spiritScoreA !== null || match.spiritScoreB !== null ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7f0] px-1.5 py-0.5 font-semibold tabular-nums">
                            <span>{match.spiritScoreA ?? "-"}</span>
                            <span className="text-[9px] text-[var(--sc-surface-light-ink)]/45">/</span>
                            <span>{match.spiritScoreB ?? "-"}</span>
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                            -
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                            match.captains_confirmed
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {match.captains_confirmed ? "Yes" : "No"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
