import { useEffect, useMemo, useState } from "react";
import {
  Card,
  Panel,
  SectionHeader,
  SectionShell,
} from "../components/ui/primitives";
import { getMatchesByEvent } from "../services/matchService";
import { getMatchMediaDetails } from "../utils/matchMedia";

const EVENT_ID = "4473483d-bc4d-443b-b93e-65375c35a8b4";
const MATCH_LIMIT = 200;
const LIVE_STATUSES = new Set(["live", "halftime"]);
const FINISHED_STATUSES = new Set(["finished", "completed"]);

const formatMatchup = (match) => {
  const teamA = match.team_a?.name || "Team A";
  const teamB = match.team_b?.name || "Team B";
  return `${teamA} vs ${teamB}`;
};

const formatScoreLine = (match) => {
  const scoreA =
    typeof match.score_a === "number" ? match.score_a.toString() : "-";
  const scoreB =
    typeof match.score_b === "number" ? match.score_b.toString() : "-";
  return `${scoreA} - ${scoreB}`;
};

const formatMatchStatus = (status) => {
  if (!status) return "Scheduled";
  const normalized = status.toString().trim().toLowerCase();
  if (!normalized) return "Scheduled";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatMatchTime = (value) => {
  if (!value) {
    return "Start time pending";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Start time pending";
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getCompletionTime = (match) => {
  const source = match.confirmed_at || match.start_time;
  if (!source) return null;
  const timestamp = new Date(source).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const isLiveMatch = (status) => LIVE_STATUSES.has((status || "").toLowerCase());
const isFinishedMatch = (status) =>
  FINISHED_STATUSES.has((status || "").toLowerCase());

const sortByStartTimeAsc = (a, b) => {
  const left = a.start_time ? new Date(a.start_time).getTime() : Infinity;
  const right = b.start_time ? new Date(b.start_time).getTime() : Infinity;
  return left - right;
};

export default function DRTestingPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;

    async function loadMatches() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getMatchesByEvent(EVENT_ID, MATCH_LIMIT, {
          includeFinished: true,
        });
        if (!ignore) {
          setMatches(rows || []);
        }
      } catch (err) {
        if (!ignore) {
          setError(err?.message || "Unable to load matches for this event.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadMatches();
    return () => {
      ignore = true;
    };
  }, []);

  const liveMatches = useMemo(
    () =>
      matches
        .filter((match) => isLiveMatch(match.status))
        .sort(sortByStartTimeAsc),
    [matches],
  );

  const recentMatches = useMemo(
    () =>
      matches
        .filter((match) => isFinishedMatch(match.status))
        .sort(
          (a, b) => (getCompletionTime(b) ?? 0) - (getCompletionTime(a) ?? 0),
        ),
    [matches],
  );

  const scheduledMatches = useMemo(
    () =>
      matches
        .filter(
          (match) =>
            !isLiveMatch(match.status) && !isFinishedMatch(match.status),
        )
        .sort(sortByStartTimeAsc),
    [matches],
  );

  const sections = [
    {
      key: "live",
      title: "Live matches",
      description: "Tracking every live point as it happens.",
      dataset: liveMatches,
      empty: "No live matches right now.",
    },
    {
      key: "recent",
      title: "Recent finals",
      description: "Latest confirmed results from the desk.",
      dataset: recentMatches,
      empty: "No completed matches recorded yet.",
    },
    {
      key: "scheduled",
      title: "Scheduled",
      description: "Upcoming fixtures waiting for pull.",
      dataset: scheduledMatches,
      empty: "No scheduled matches on the calendar.",
    },
  ];

  const renderMatchCard = (match) => {
    const liveOrFinal =
      isLiveMatch(match.status) || isFinishedMatch(match.status);
    const mediaDetails = getMatchMediaDetails(match);
    return (
      <Panel key={match.id} variant="tinted" className="space-y-4 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {match.event?.name || "Match"}
            </p>
            <h3 className="text-lg font-semibold text-ink">
              {formatMatchup(match)}
            </h3>
            <p className="text-xs text-ink-muted">
              {formatMatchTime(match.start_time)}
            </p>
          </div>
          <div className="text-right">
            {liveOrFinal ? (
              <>
                <p className="text-2xl font-semibold text-accent">
                  {formatScoreLine(match)}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {formatMatchStatus(match.status)}
                </p>
              </>
            ) : (
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {formatMatchStatus(match.status)}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">
            {match.venue?.name || "Venue TBC"}
          </p>
          {mediaDetails ? (
            <a
              href={mediaDetails.url}
              target="_blank"
              rel="noreferrer"
              className="sc-button is-ghost text-xs"
            >
              {mediaDetails.providerLabel || "Watch"}
            </a>
          ) : (
            <span className="text-xs text-ink-muted">
              No media link attached
            </span>
          )}
        </div>
      </Panel>
    );
  };

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="main" className="space-y-6 py-8">
        <Card className="space-y-3 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Operations workspace"
            title="Casual event monitoring"
            description="Live, final, and scheduled matches for the testing event."
          />
          {error && <div className="sc-alert is-error">{error}</div>}
        </Card>

        {sections.map((section) => (
          <Card key={section.key} className="space-y-4 p-5 sm:p-6">
            <SectionHeader
              eyebrow="Matches"
              title={section.title}
              description={section.description}
            />
            {loading && section.dataset.length === 0 ? (
              <Card
                variant="muted"
                className="p-5 text-center text-sm text-ink-muted"
              >
                Loading matches...
              </Card>
            ) : section.dataset.length === 0 ? (
              <Card
                variant="muted"
                className="p-5 text-center text-sm text-ink-muted"
              >
                {section.empty}
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {section.dataset.map((match) => renderMatchCard(match))}
              </div>
            )}
          </Card>
        ))}
      </SectionShell>
    </div>
  );
}
