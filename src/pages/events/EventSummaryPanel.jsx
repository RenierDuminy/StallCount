import { useCallback } from "react";
import { getMatchesByEvent } from "../../services/matchService";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import {
  isConcludedStatus,
  isForfeitStatus,
  isInProgressStatus,
  isPendingStatus,
} from "../../constants/statusCodes";

// Same raw key getMatchesByEvent uses for (eventId, null, includeFinished),
// so useCachedQuery hears its revalidations and match-write invalidations.
const matchesKey = (eventId) =>
  eventId ? `matches:event:${eventId}:limit=null:includeFinished=true` : null;

const isCanceled = (status) => {
  const s = (status || "").toString().trim().toLowerCase();
  return s === "canceled" || s === "cancelled";
};

const teamName = (team, fallback) => team?.short_name || team?.name || fallback;

const describeMatch = (match) =>
  `${teamName(match.team_a, "Team A")} ${match.score_a}–${match.score_b} ${teamName(match.team_b, "Team B")}`;

/**
 * Pure summary of an event's matches. Progress counts finished/completed
 * matches against every match still meant to be played: canceled and
 * forfeited games never will be, so they are left out of the total.
 */
function summarizeEventMatches(matches = [], now = Date.now()) {
  const teamIds = new Set();
  const concluded = [];
  let scheduled = 0;
  let live = 0;
  let forfeits = 0;
  let canceled = 0;
  let nextMatch = null;

  matches.forEach((match) => {
    if (match.team_a?.id) teamIds.add(match.team_a.id);
    if (match.team_b?.id) teamIds.add(match.team_b.id);
    const { status } = match;

    if (isForfeitStatus(status)) {
      forfeits += 1;
    } else if (isCanceled(status)) {
      canceled += 1;
    } else if (isConcludedStatus(status)) {
      concluded.push(match);
    } else if (isInProgressStatus(status)) {
      live += 1;
    } else if (isPendingStatus(status)) {
      scheduled += 1;
      const startMs = match.start_time ? new Date(match.start_time).getTime() : NaN;
      if (Number.isFinite(startMs) && startMs >= now - 15 * 60 * 1000) {
        if (!nextMatch || startMs < new Date(nextMatch.start_time).getTime()) {
          nextMatch = match;
        }
      }
    }
  });

  const playable = matches.length - forfeits - canceled;
  // Highlights (closest / biggest win / highest-scoring) and points come only
  // from played matches: forfeits and cancellations never reach `concluded`.
  const scored = concluded.filter(
    (m) => typeof m.score_a === "number" && typeof m.score_b === "number",
  );
  const totalPoints = scored.reduce((sum, m) => sum + m.score_a + m.score_b, 0);
  const pickBy = (fn, better) =>
    scored.reduce((best, m) => (best === null || better(fn(m), fn(best)) ? m : best), null);
  const margin = (m) => Math.abs(m.score_a - m.score_b);

  return {
    total: matches.length,
    playable,
    completed: concluded.length,
    scheduled,
    live,
    forfeits,
    teams: teamIds.size,
    percentComplete: playable > 0 ? Math.round((concluded.length / playable) * 100) : 0,
    totalPoints,
    averagePoints: scored.length ? totalPoints / scored.length : null,
    closest: pickBy(margin, (a, b) => a < b),
    biggestWin: pickBy(margin, (a, b) => a > b),
    highestScoring: pickBy((m) => m.score_a + m.score_b, (a, b) => a > b),
    nextMatch,
  };
}

const formatNextStart = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function Stat({ label, value, tone = "" }) {
  return (
    <div className="min-w-0">
      <p className={`text-2xl font-semibold tabular-nums leading-none ${tone || "text-ink"}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold text-ink-muted">{label}</p>
    </div>
  );
}

function Highlight({ label, value, detail }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-white/15 py-2">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-right text-sm font-semibold text-ink">
        {value}
        {detail ? <span className="ml-2 font-normal text-ink-muted">{detail}</span> : null}
      </p>
    </div>
  );
}

export default function EventSummaryPanel({ eventId }) {
  const fetcher = useCallback(
    ({ forceRefresh } = {}) =>
      getMatchesByEvent(eventId, null, { includeFinished: true, forceRefresh }),
    [eventId],
  );
  const { data, error, isLoading } = useCachedQuery(matchesKey(eventId), fetcher, {
    enabled: Boolean(eventId),
  });

  if (!eventId) return null;
  if (isLoading) {
    return <p className="text-sm text-ink-muted">Loading the event summary...</p>;
  }
  if (error && !data) {
    return <p className="text-sm text-ink-muted">The event summary could not be loaded.</p>;
  }

  const summary = summarizeEventMatches(data || []);
  if (summary.total === 0) {
    return <p className="text-sm text-ink-muted">No matches have been scheduled for this event yet.</p>;
  }

  const highlights = [];
  if (summary.nextMatch) {
    highlights.push({
      label: "Next up",
      value: `${teamName(summary.nextMatch.team_a, "TBC")} vs ${teamName(summary.nextMatch.team_b, "TBC")}`,
      detail: formatNextStart(summary.nextMatch.start_time),
    });
  }
  if (summary.closest) {
    highlights.push({
      label: "Closest finish",
      value: describeMatch(summary.closest),
    });
  }
  if (summary.biggestWin && margin(summary.biggestWin) > margin(summary.closest)) {
    highlights.push({
      label: "Biggest win",
      value: describeMatch(summary.biggestWin),
      detail: `by ${margin(summary.biggestWin)}`,
    });
  }
  if (summary.highestScoring) {
    highlights.push({
      label: "Highest-scoring match",
      value: describeMatch(summary.highestScoring),
      detail: `${summary.highestScoring.score_a + summary.highestScoring.score_b} points`,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Event progress</p>
          <p className="text-sm font-semibold tabular-nums text-ink">{summary.percentComplete}% complete</p>
        </div>
        <p className="mt-0.5 text-xs text-ink-muted">
          {summary.completed} of {summary.playable} matches completed
        </p>
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Completed" value={summary.completed} />
        <Stat label="Scheduled" value={summary.scheduled} />
        {summary.live > 0 ? <Stat label="Live now" value={summary.live} tone="text-live" /> : null}
        <Stat label="Teams" value={summary.teams} />
        {summary.totalPoints > 0 ? <Stat label="Points scored" value={summary.totalPoints} /> : null}
        {summary.averagePoints !== null ? (
          <Stat label="Points per match" value={summary.averagePoints.toFixed(1)} />
        ) : null}
        {summary.forfeits > 0 ? <Stat label="Forfeits" value={summary.forfeits} /> : null}
      </div>

      {highlights.length ? (
        <div className="border-b border-white/15">
          {highlights.map((item) => (
            <Highlight key={item.label} {...item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function margin(match) {
  return match ? Math.abs(match.score_a - match.score_b) : 0;
}
