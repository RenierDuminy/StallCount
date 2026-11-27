import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { MatchMediaButton } from "../components/MatchMediaButton";
import CalendarSubscribeButton from "../components/CalendarSubscribeButton";
import { isPastEvent } from "../utils/eventStandings";
import { Card, Chip, Panel, SectionHeader, SectionShell, Field, Select } from "../components/ui/primitives";
import { getPlayersByTeam } from "../services/playerService";
import {
  getSpiritScoresForMatches,
  getTeamDetails,
  getTeamMatches,
  getTeamPlayerStats,
} from "../services/teamService";
import { getEventPagePath } from "./eventWorkspaces";
import { getMatchMediaDetails } from "../utils/matchMedia";
import { matchPath, playerPath, teamPath } from "../utils/links";
import { usePageMeta, withSiteName } from "../utils/pageMeta";
import { getForfeitWinnerSide, isForfeitMatch } from "../utils/standings";
import { MATCH_STATUS, isInProgressStatus, isPendingStatus } from "../constants/statusCodes";
import { useFullHeadingsIfTheyFit } from "../hooks/useFullHeadingsIfTheyFit";
import { SPIRIT_DIMENSIONS } from "../utils/spirit";

const TABS = [
  { id: "games", label: "Games" },
  { id: "players", label: "Players & Stats" },
  { id: "spirit", label: "Spirit Scores" },
];

const GAME_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const EMPTY_LIST = [];

function pickMostRecentEventId(matches) {
  let best = null;
  for (const match of matches ?? []) {
    const eventId = match?.event?.id;
    if (!eventId) continue;
    const time = match.start_time || "";
    if (!best || time > best.time) best = { eventId, time };
  }
  return best?.eventId ?? null;
}

export default function TeamProfilePage() {
  const { teamId } = useParams();
  // Arriving from an event's page carries ?eventId=: open on that event.
  const [searchParams] = useSearchParams();
  const requestedEventId = searchParams.get("eventId") || "";
  const [activeTab, setActiveTab] = useState("games");
  // "" until the team's matches load, then the most recent event. "All events"
  // is opt-in because it loads every game's stats.
  const [eventFilter, setEventFilter] = useState("");
  const [state, setState] = useState({
    loading: true,
    error: "",
    team: null,
    matches: [],
  });
  const [scoped, setScoped] = useState({
    loading: true,
    key: "",
    roster: [],
    playerStats: [],
    spiritScores: [],
  });

  useEffect(() => {
    let ignore = false;

    async function loadProfile() {
      if (!teamId) {
        setState({ loading: false, error: "No team selected.", team: null, matches: [] });
        return;
      }

      setState((prev) => ({ ...prev, loading: true, error: "" }));
      setEventFilter("");

      try {
        const [team, matches] = await Promise.all([getTeamDetails(teamId), getTeamMatches(teamId)]);

        if (!team) {
          throw new Error("Team not found.");
        }

        if (!ignore) {
          setState({ loading: false, error: "", team, matches });
          const playedRequested =
            requestedEventId && matches.some((match) => match.event?.id === requestedEventId);
          setEventFilter(playedRequested ? requestedEventId : pickMostRecentEventId(matches) ?? "all");
        }
      } catch (err) {
        if (!ignore) {
          setState({
            loading: false,
            error: err instanceof Error ? err.message : "Unable to load team profile.",
            team: null,
            matches: [],
          });
        }
      }
    }

    loadProfile();
    return () => {
      ignore = true;
    };
  }, [teamId, requestedEventId]);

  // Roster, player stats and spirit for the selected event only.
  useEffect(() => {
    if (!teamId || !eventFilter || state.loading || !state.team) return undefined;
    let ignore = false;
    const key = `${teamId}:${eventFilter}`;
    const scopeMatchIds =
      eventFilter === "all"
        ? state.matches.map((match) => match.id)
        : state.matches.filter((match) => match.event?.id === eventFilter).map((match) => match.id);

    Promise.all([
      getPlayersByTeam(teamId, eventFilter === "all" ? null : eventFilter),
      getTeamPlayerStats(
        teamId,
        eventFilter === "all" ? undefined : { eventId: eventFilter, matchIds: scopeMatchIds },
      ),
      getSpiritScoresForMatches(scopeMatchIds),
    ])
      .then(([roster, playerStats, spiritScores]) => {
        if (!ignore) setScoped({ loading: false, key, roster, playerStats, spiritScores });
      })
      .catch((err) => {
        console.error("Unable to load team event data", err);
        if (!ignore) setScoped({ loading: false, key, roster: [], playerStats: [], spiritScores: [] });
      });

    return () => {
      ignore = true;
    };
  }, [teamId, eventFilter, state.loading, state.team, state.matches]);

  const scopedReady = scoped.key === `${teamId}:${eventFilter}` && !scoped.loading;
  const roster = scopedReady ? scoped.roster : EMPTY_LIST;
  const playerStats = scopedReady ? scoped.playerStats : EMPTY_LIST;
  const spiritScores = scopedReady ? scoped.spiritScores : EMPTY_LIST;

  const matchesById = useMemo(() => {
    const map = new Map();
    state.matches.forEach((match) => {
      if (match?.id) {
        map.set(match.id, match);
      }
    });
    return map;
  }, [state.matches]);

  const eventOptions = useMemo(() => {
    const options = new Map();
    state.matches.forEach((match) => {
      const eventId = match.event?.id;
      if (!eventId) return;
      const startTime = match.start_time || null;
      const existing = options.get(eventId);
      if (!existing) {
        options.set(eventId, {
          id: eventId,
          name: match.event?.name || "Event",
          status: match.event?.status ?? null,
          endDate: match.event?.end_date ?? null,
          startTime,
        });
      } else if (startTime && (!existing.startTime || startTime > existing.startTime)) {
        existing.startTime = startTime;
      }
    });
    return Array.from(options.values()).sort((a, b) => {
      if (a.startTime && b.startTime) return b.startTime.localeCompare(a.startTime);
      if (a.startTime) return -1;
      if (b.startTime) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [state.matches]);

  // The calendar is per team within one event, so it is offered only when one
  // event is chosen, and not once that event has concluded.
  const selectedEventOption =
    eventFilter && eventFilter !== "all" ? eventOptions.find((option) => option.id === eventFilter) : null;

  const filteredMatches = useMemo(() => {
    if (eventFilter === "all") {
      return state.matches;
    }
    return state.matches.filter((match) => match.event?.id === eventFilter);
  }, [state.matches, eventFilter]);

  const filteredSpiritScores = useMemo(() => {
    if (eventFilter === "all") {
      return spiritScores;
    }
    return spiritScores.filter((entry) => {
      const match = matchesById.get(entry.match_id);
      return match?.event?.id === eventFilter;
    });
  }, [spiritScores, matchesById, eventFilter]);

  // The whole roster (for the chosen event, or every event) plus anyone else
  // with stats for this team in those games, e.g. a sub-in. Rostered players
  // without stats show with zeros.
  const filteredPlayerStats = useMemo(() => {
    const inScope = (matchId) =>
      eventFilter === "all" || matchesById.get(matchId)?.event?.id === eventFilter;
    const rows = new Map();

    for (const player of playerStats) {
      // Older cached rows have no per-match lines; fall back to their totals.
      const lines = Array.isArray(player.perMatch)
        ? player.perMatch.filter((line) => inScope(line.matchId))
        : null;
      const matchIds = (player.matchIds ?? []).filter(inScope);
      if (matchIds.length === 0) continue;
      const sum = (key) =>
        lines ? lines.reduce((total, line) => total + (line[key] ?? 0), 0) : player[key] ?? 0;
      rows.set(player.playerId, {
        ...player,
        goals: sum("goals"),
        assists: sum("assists"),
        blocks: sum("blocks"),
        turnovers: sum("turnovers"),
        callahans: sum("callahans"),
        games: matchIds.length,
        matchIds,
      });
    }

    for (const member of roster) {
      if (eventFilter !== "all" && member.event_id !== eventFilter) continue;
      if (!member.id || rows.has(member.id)) continue;
      rows.set(member.id, {
        playerId: member.id,
        playerName: member.name,
        jerseyNumber: member.jersey_number ?? null,
        goals: 0,
        assists: 0,
        blocks: 0,
        turnovers: 0,
        callahans: 0,
        games: 0,
        matchIds: [],
      });
    }

    const all = Array.from(rows.values());
    // "All events" lists only players who contributed (any goal, assist,
    // block, turnover or Callahan), so a team with several seasons does not
    // list every player it ever rostered. One event shows its full roster.
    if (eventFilter === "all") {
      return all.filter(
        (row) => row.goals + row.assists + row.blocks + row.turnovers + (row.callahans ?? 0) > 0,
      );
    }
    return all;
  }, [playerStats, roster, matchesById, eventFilter]);

  const rosterCount = useMemo(() => {
    const ids = new Set(
      roster
        .filter((member) => eventFilter === "all" || member.event_id === eventFilter)
        .map((member) => member.id),
    );
    return ids.size;
  }, [roster, eventFilter]);

  const metrics = useMemo(() => {
    const sourceMatches = filteredMatches;
    const sourceSpirit = filteredSpiritScores;
    const countableMatches = sourceMatches.filter((match) => {
      const scoreA = match?.score_a;
      const scoreB = match?.score_b;
      if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
        return false;
      }
      return !(scoreA === 0 && scoreB === 0);
    });

    if (!state.team) {
      return {
        gamesPlayed: countableMatches.length,
        wins: 0,
        losses: 0,
        draws: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        spiritAverage: null,
        activePlayers: rosterCount,
      };
    }

    let wins = 0;
    let losses = 0;
    let draws = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;

    for (const match of countableMatches) {
      const isTeamA = match.team_a?.id === state.team.id;
      const forScore = isTeamA ? match.score_a ?? 0 : match.score_b ?? 0;
      const againstScore = isTeamA ? match.score_b ?? 0 : match.score_a ?? 0;
      goalsFor += forScore;
      goalsAgainst += againstScore;
      if (forScore > againstScore) {
        wins += 1;
      } else if (forScore < againstScore) {
        losses += 1;
      } else {
        draws += 1;
      }
    }

    const receivedEntries = sourceSpirit.filter((entry) => entry.rated_team_id === state.team?.id);

    const spiritAverage =
      receivedEntries.length > 0
        ? receivedEntries.reduce((sum, entry) => sum + (entry.total ?? 0), 0) /
          receivedEntries.length
        : null;

    return {
      gamesPlayed: countableMatches.length,
      wins,
      losses,
      draws,
      goalsFor,
      goalsAgainst,
      goalDiff: goalsFor - goalsAgainst,
      spiritAverage,
      activePlayers: rosterCount,
    };
  }, [filteredMatches, filteredSpiritScores, rosterCount, state.team]);

  const spiritBreakdown = useMemo(() => {
    if (!state.team) {
      return { received: [], given: [] };
    }

    const received = [];
    const given = [];

    for (const entry of filteredSpiritScores) {
      if (entry.rated_team_id === state.team.id) {
        received.push(entry);
      } else {
        given.push(entry);
      }
    }

    return { received, given };
  }, [filteredSpiritScores, state.team]);

  const hasSpiritScores = spiritBreakdown.received.length > 0 || spiritBreakdown.given.length > 0;

  const visibleTabs = useMemo(() => {
    return TABS.filter((tab) => tab.id !== "spirit" || hasSpiritScores);
  }, [hasSpiritScores]);

  useEffect(() => {
    if (visibleTabs.some((tab) => tab.id === activeTab)) {
      return;
    }
    setActiveTab("games");
  }, [activeTab, visibleTabs]);

  const recordLabel =
    metrics.draws > 0
      ? `${metrics.wins}-${metrics.losses}-${metrics.draws}`
      : `${metrics.wins}-${metrics.losses}`;

  const spiritAverageLabel =
    metrics.spiritAverage === null ? "—" : metrics.spiritAverage.toFixed(2);

  const ready = Boolean(!state.loading && state.team && !state.error);
  const divisionSummary = state.team?.division
    ? `${state.team.division.name}${
        state.team.division.event ? ` · ${state.team.division.event.name}` : ""
      }`
    : "Division assignment pending";
  const displayName = state.team?.name
    ? `${state.team.name}${state.team.short_name ? ` (${state.team.short_name})` : ""}`
    : "Loading team...";

  // Search title: the team's name, with its division and event when known.
  usePageMeta(
    state.team?.name
      ? {
          title: withSiteName(state.team.name),
          description: `${state.team.name}${
            state.team.division ? ` · ${divisionSummary}` : ""
          }. Roster, results, player stats and spirit scores.`,
        }
      : null,
  );

  return (
    <div className="min-h-screen bg-light-page text-[var(--sc-surface-light-ink)]">
      <SectionShell className="space-y-3 py-3 sm:space-y-6 sm:py-8">
        <Card variant="light" className="space-y-3 p-4 shadow-xl shadow-[rgba(8,25,21,0.08)] sm:space-y-5 sm:p-8">
          <SectionHeader
            title={displayName}
            description={divisionSummary}
            action={
              <div className="flex flex-wrap gap-2">
                <Link to="/teams" className="sc-button is-light text-sm">
                  Back to teams list
                </Link>
              </div>
            }
            >
            </SectionHeader>
        </Card>

        {state.error ? (
          <Card variant="light" className="p-4 text-sm text-rose-700 shadow-md shadow-[rgba(8,25,21,0.06)] sm:p-6">
            {state.error}{" "}
            <Link to="/teams" className="font-semibold underline">
              Return to teams list
            </Link>
            .
          </Card>
        ) : (
          <>
            <Card variant="light" className="space-y-3 p-4 shadow-md shadow-[rgba(8,25,21,0.06)] sm:space-y-6 sm:p-6">
              <SectionHeader
                eyebrowVariant="tag"
                title="Performance overview"
                description="Key indicators compiled from schedule, roster, and spirit data."
                action={
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
                    <Field className="w-full max-w-xs" label="Event" htmlFor="team-event-filter">
                      <Select
                        id="team-event-filter"
                        value={eventFilter || "all"}
                        onChange={(event) => setEventFilter(event.target.value)}
                      >
                        <option value="all">All events</option>
                        {eventOptions.map((event) => (
                          <option key={event.id} value={event.id}>
                            {event.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {selectedEventOption && state.team?.id ? (
                      <CalendarSubscribeButton
                        eventId={selectedEventOption.id}
                        teamId={state.team.id}
                        concluded={isPastEvent(selectedEventOption)}
                        className="w-full max-w-xs sm:w-auto"
                      />
                    ) : null}
                  </div>
                }
              />
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
                <SummaryStat label="Games played" value={metrics.gamesPlayed} />
                <SummaryStat label="Record (W-L-D)" value={ready ? recordLabel : "—"} />
                <SummaryStat
                  label="Goals for / against"
                  value={ready ? `${metrics.goalsFor} / ${metrics.goalsAgainst}` : "—"}
                />
                <SummaryStat label="Goal diff" value={ready ? metrics.goalDiff : "—"} />
                {hasSpiritScores && <SummaryStat label="Spirit average" value={spiritAverageLabel} />}
                <SummaryStat label="Active players" value={metrics.activePlayers} />
              </div>
            </Card>

            <Card variant="light" className="space-y-3 p-4 shadow-md shadow-[rgba(8,25,21,0.06)] sm:space-y-6 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-full border border-[var(--sc-surface-light-border)] px-3 py-1.5 text-sm font-semibold transition sm:px-4 sm:py-2 ${
                      activeTab === tab.id
                        ? "border-light-primary bg-light-primary text-white shadow"
                        : "text-[var(--sc-surface-light-ink)]/75 hover:bg-white/70"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3 sm:space-y-4">
                {state.loading || (activeTab !== "games" && !scopedReady) ? (
                  <Panel
                    variant="light"
                    className="border border-dashed border-[var(--sc-surface-light-border)] bg-white/70 p-4 text-center text-sm text-[var(--sc-surface-light-ink)]/70 sm:p-6"
                  >
                    Loading live team data...
                  </Panel>
                ) : (
                  <>
                    {activeTab === "games" && (
                      <GamesTable matches={filteredMatches} teamId={state.team?.id} showEvent={eventFilter === "all"} />
                    )}
                    {activeTab === "players" && (
                      <PlayersTable
                        stats={filteredPlayerStats}
                        rosterCount={rosterCount}
                      />
                    )}
                    {activeTab === "spirit" && visibleTabs.some((tab) => tab.id === "spirit") && (
                      <SpiritTab
                        received={spiritBreakdown.received}
                        given={spiritBreakdown.given}
                        teamId={state.team?.id}
                        matchesById={matchesById}
                      />
                    )}
                  </>
                )}
              </div>
            </Card>
          </>
        )}
      </SectionShell>
    </div>
  );
}

const MUTED_SCORE_CLASS = "text-[var(--sc-surface-light-ink)]/60";

const WIN_CLASS = "text-emerald-600";
const LOSS_CLASS = "text-rose-600";

// What the Score column shows for one match, seen from `ourSide` ("a" / "b").
// Three levels: a bold score, a quiet word, a dash. Colour only ever means a
// result. A forfeit has no score (WFDF A7.3.5), so its word carries the result
// colour; cancelled and postponed are grey; a live match gets a small dot.
function describeScoreCell(match, ourSide, ourScore, theirScore) {
  const status = `${match?.status ?? ""}`.toLowerCase();
  const hasScore = Number.isFinite(ourScore) && Number.isFinite(theirScore);
  const scoreText = hasScore ? `${ourScore} – ${theirScore}` : "–";

  if (isForfeitMatch(match)) {
    const winner = getForfeitWinnerSide(match);
    if (!winner) return { text: "Forfeit", isWord: true, className: MUTED_SCORE_CLASS };
    return winner === ourSide
      ? { text: "Forfeit", isWord: true, title: "Won by forfeit", className: WIN_CLASS }
      : { text: "Forfeit", isWord: true, title: "Lost by forfeit", className: LOSS_CLASS };
  }
  if (status === MATCH_STATUS.CANCELED) {
    return { text: "Cancelled", isWord: true, className: MUTED_SCORE_CLASS };
  }
  if (status === MATCH_STATUS.POSTPONED) {
    return { text: "Postponed", isWord: true, className: MUTED_SCORE_CLASS };
  }
  if (isInProgressStatus(status)) {
    return {
      text: scoreText,
      live: true,
      title: status === MATCH_STATUS.HALFTIME ? "Halftime" : "Live",
      className: "text-[var(--sc-surface-light-ink)]",
    };
  }
  if (isPendingStatus(status) || !hasScore) {
    return { text: "–", isWord: true, className: MUTED_SCORE_CLASS };
  }
  return {
    text: scoreText,
    className:
      ourScore > theirScore
        ? WIN_CLASS
        : ourScore < theirScore
          ? LOSS_CLASS
          : "text-[var(--sc-surface-light-ink)]/70",
  };
}

// Most recent first; matches with no start time go last.
function sortNewestFirst(matches) {
  const time = (match) => {
    const ms = Date.parse(match?.start_time);
    return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
  };
  return [...matches].sort((a, b) => time(b) - time(a));
}

function GamesTable({ matches, teamId, showEvent = true }) {
  if (!matches?.length) {
    return <EmptyState message="No games available for this team yet." />;
  }

  // Team | Score | Opposition reads as one scoreline: the team sits against the
  // score and the opposition starts after it. From 640px the two share a width, so the score is the centre line; on a
  // phone they take only what their names need, so no gap opens after the date.
  const sideWidth = showEvent ? "sm:w-[25%]" : "sm:w-[40%]";
  const teamCell = `py-2 pl-2 pr-2 text-right sm:min-w-[7rem] sm:py-3 sm:pl-4 sm:pr-3 ${sideWidth}`;
  const scoreCellBase = "w-24 whitespace-nowrap px-1 text-center sm:w-28";
  // A row with a media icon under its score keeps the height of the others: the
  // score moves up into the cell's padding and the icon takes a 20px box.
  const scorePadding = "py-2 sm:py-3";
  const scorePaddingWithMedia = "py-0 sm:py-1";
  const oppositionCell = `py-2 pl-2 pr-3 text-left sm:min-w-[7rem] sm:py-3 sm:pl-3 sm:pr-4 ${sideWidth}`;

  return (
    <Panel variant="light" className="overflow-x-auto p-0 shadow-sm shadow-[rgba(8,25,21,0.04)]">
      <table className="min-w-full divide-y divide-[var(--sc-surface-light-border)] text-sm text-[var(--sc-surface-light-ink)]/85">
        <thead className="bg-white/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
          <tr>
            <th className="px-3 py-2 sm:px-4 sm:py-3">Date &amp; time</th>
            <th className={teamCell}>Team</th>
            <th className={`${scoreCellBase} ${scorePadding}`}>Score</th>
            <th className={oppositionCell}>Opposition</th>
            {showEvent ? <th className="whitespace-nowrap px-3 py-2 sm:px-4 sm:py-3">Event</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--sc-surface-light-border)]/70">
          {sortNewestFirst(matches).map((match) => {
            const isTeamA = Boolean(teamId && match.team_a?.id === teamId);
            const isTeamB = Boolean(teamId && match.team_b?.id === teamId);
            const leftTeam = isTeamA ? match.team_a : isTeamB ? match.team_b : match.team_a;
            const rightTeam = isTeamA ? match.team_b : isTeamB ? match.team_a : match.team_b;
            const leftScore = isTeamA ? match.score_a : isTeamB ? match.score_b : match.score_a;
            const rightScore = isTeamA ? match.score_b : isTeamB ? match.score_a : match.score_b;
            const mediaDetails = getMatchMediaDetails(match);
            const scoreCell = describeScoreCell(match, isTeamB ? "b" : "a", leftScore, rightScore);

            return (
              <tr key={match.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-[var(--sc-surface-light-ink)]/70 sm:px-4 sm:py-3">
                  {match.id ? (
                    <Link
                      to={matchPath(match.id)}
                      className="text-inherit! underline decoration-dotted decoration-[var(--sc-surface-light-border)] underline-offset-4 transition hover:text-[var(--sc-surface-light-ink)]!"
                    >
                      {formatMatchTime(match.start_time)}
                    </Link>
                  ) : (
                    <span>{formatMatchTime(match.start_time)}</span>
                  )}
                </td>
                <td className={`${teamCell} font-semibold text-[var(--sc-surface-light-ink)]`}>
                  {!leftTeam ? (
                    "TBD"
                  ) : leftTeam.id === teamId ? (
                    <span>{leftTeam.name}</span>
                  ) : (
                    <Link
                      to={teamPath(leftTeam.id, { eventId: match.event?.id })}
                      className="text-[var(--sc-surface-light-ink)]! underline decoration-dotted decoration-[var(--sc-surface-light-border)] underline-offset-4 transition hover:text-[var(--sc-surface-light-ink)]/70!"
                    >
                      {leftTeam.name}
                    </Link>
                  )}
                </td>
                <td
                  className={`${scoreCellBase} ${mediaDetails ? scorePaddingWithMedia : scorePadding} ${
                    scoreCell.isWord ? "text-sm font-normal" : "text-base font-semibold"
                  } ${scoreCell.className}`}
                >
                  <div title={scoreCell.title} className={mediaDetails ? "leading-5" : undefined}>
                    {scoreCell.live ? (
                      <span
                        aria-hidden="true"
                        className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-600 align-middle"
                      />
                    ) : null}
                    {scoreCell.text}
                    {scoreCell.title ? <span className="sr-only"> ({scoreCell.title})</span> : null}
                  </div>
                  {mediaDetails ? (
                    <div className="flex justify-center">
                      <MatchMediaButton media={mediaDetails} className="h-5! w-5!" />
                    </div>
                  ) : null}
                </td>
                <td className={`${oppositionCell} font-semibold text-[var(--sc-surface-light-ink)]`}>
                  {!rightTeam ? (
                    "TBD"
                  ) : rightTeam.id === teamId ? (
                    <span>{rightTeam.name}</span>
                  ) : (
                    <Link
                      to={teamPath(rightTeam.id, { eventId: match.event?.id })}
                      className="text-[var(--sc-surface-light-ink)]! underline decoration-dotted decoration-[var(--sc-surface-light-border)] underline-offset-4 transition hover:text-[var(--sc-surface-light-ink)]/70!"
                    >
                      {rightTeam.name}
                    </Link>
                  )}
                </td>
                {showEvent ? (
                <td className="whitespace-nowrap px-3 py-2 text-[var(--sc-surface-light-ink)]/70 sm:px-4 sm:py-3">
                  {match.event?.id ? (
                    <Link
                      to={getEventPagePath(match.event)}
                      className="text-[var(--sc-surface-light-ink)]! underline decoration-dotted decoration-[var(--sc-surface-light-border)] underline-offset-4 transition hover:text-[var(--sc-surface-light-ink)]/70!"
                    >
                      {match.event.name || "Event"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

// The same table as the event's Player statistics page (PlayersPage.jsx):
// headings, sorting, tie-breaks, centred cells and the Callahans column, less
// the Team column, which on a team's own page would repeat one name.
function PlayersTable({ stats, rosterCount }) {
  const [sortBy, setSortBy] = useState("total");
  const [sortDirection, setSortDirection] = useState("desc");

  const rows = useMemo(
    () =>
      (stats || []).map((row) => ({
        ...row,
        total: (row.goals || 0) + (row.assists || 0) + (row.callahans || 0),
      })),
    [stats],
  );

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      if (aVal !== bVal) {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
      // Ties always fall back to the same descending total/goals/name order
      // so the row order stays stable when only the direction changes.
      if (a.total !== b.total) return b.total - a.total;
      if ((a.goals || 0) !== (b.goals || 0)) return (b.goals || 0) - (a.goals || 0);
      return (a.playerName || "").localeCompare(b.playerName || "");
    });
    return list;
  }, [rows, sortBy, sortDirection]);

  const toggleSort = (column) => {
    if (sortBy === column) {
      setSortDirection((dir) => (dir === "desc" ? "asc" : "desc"));
      return;
    }
    setSortBy(column);
    setSortDirection("desc");
  };

  // The Callahans column only appears when someone in the list has one.
  const showCallahans = sortedRows.some((row) => (row.callahans || 0) > 0);
  const statHeaders = [
    { key: "total", label: "Tot", full: "Total" },
    { key: "goals", label: "G", full: "Goals" },
    { key: "assists", label: "A", full: "Assists" },
    { key: "blocks", label: "B", full: "Blocks" },
    { key: "turnovers", label: "TO", full: "Turnovers" },
    { key: "games", label: "GP", full: "Games" },
    ...(showCallahans ? [{ key: "callahans", label: "Cal", full: "Callahans" }] : []),
  ];
  const [tablePanelRef, showFullHeadings] = useFullHeadingsIfTheyFit(
    `${sortedRows.length}|${showCallahans}`,
  );

  if (!sortedRows.length) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <EmptyState message="No players on the roster or with stats for this team yet." />
        <p className="text-center text-sm text-[var(--sc-surface-light-ink)]/70">
          Roster count: {rosterCount || 0}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <Panel ref={tablePanelRef} variant="light" className="overflow-x-auto p-0 shadow-sm shadow-[rgba(8,25,21,0.04)]">
        <table className="min-w-full divide-y divide-[var(--sc-surface-light-border)] text-sm text-[var(--sc-surface-light-ink)]/85">
          <thead className="bg-white/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
            <tr>
              <th className="py-1.5 pl-3 pr-1.5 text-center" aria-label="Rank">#</th>
              <th className="py-1.5 pl-1.5 pr-3">Player</th>
              {statHeaders.map((col) => (
                <th key={col.key} className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3">
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    title={col.full}
                    className={`inline-flex items-center justify-center gap-px text-xs font-semibold uppercase transition ${
                      sortBy === col.key
                        ? "text-[var(--sc-surface-light-ink)]"
                        : "text-[var(--sc-surface-light-ink)]/60 hover:text-[var(--sc-surface-light-ink)]"
                    }`}
                  >
                    <span>{showFullHeadings ? col.full : col.label}</span>
                    {sortBy === col.key && (
                      <span className="text-xs leading-none">{sortDirection === "asc" ? "↑" : "↓"}</span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--sc-surface-light-border)]/70">
            {sortedRows.map((row, index) => (
              <tr key={row.playerId} className="transition-colors hover:bg-(--sc-surface-light-ink)/5">
                <td className="py-1.5 pl-3 pr-1.5 text-center text-xs font-semibold text-[var(--sc-surface-light-ink)]/50">
                  {index + 1}
                </td>
                <td className="py-1.5 pl-1.5 pr-3">
                  <div className="flex items-center gap-2">
                    <Link
                      to={playerPath(row.playerId)}
                      className="font-semibold text-(--sc-surface-light-ink)! underline decoration-dotted decoration-(--sc-surface-light-border) underline-offset-4 transition hover:text-(--sc-surface-light-ink)/70!"
                    >
                      {row.playerName}
                    </Link>
                    {row.jerseyNumber != null && (
                      <span className="shrink-0 text-xs font-semibold text-(--sc-surface-light-ink)/40">
                        #{row.jerseyNumber}
                      </span>
                    )}
                  </div>
                </td>
                <PlayerStatCell value={row.total} strong />
                <PlayerStatCell value={row.goals} />
                <PlayerStatCell value={row.assists} />
                <PlayerStatCell value={row.blocks} />
                <PlayerStatCell value={row.turnovers} />
                <PlayerStatCell value={row.games} />
                {showCallahans ? <PlayerStatCell value={row.callahans} circled /> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <p className="text-center text-sm text-[var(--sc-surface-light-ink)]/70">
        Roster count: {rosterCount || 0}
      </p>
    </div>
  );
}

// StatCell from PlayersPage.jsx: centred under its heading; `circled` rings a
// non-zero Callahan count.
function PlayerStatCell({ value, strong = false, circled = false }) {
  const shown = value ?? 0;
  return (
    <td
      className={`whitespace-nowrap px-2 py-1.5 text-center tabular-nums sm:px-3 ${
        strong ? "font-semibold text-[var(--sc-surface-light-ink)]" : "text-[var(--sc-surface-light-ink)]/85"
      }`}
    >
      {circled && shown ? (
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-current px-1 leading-none">
          {shown}
        </span>
      ) : circled ? (
        <span className="text-[var(--sc-surface-light-ink)]/40">–</span>
      ) : (
        shown
      )}
    </td>
  );
}

function SpiritTab({ received, given, teamId, matchesById }) {
  return (
    // Side by side only when both 720px tables fit in full (container query on
    // the tab, so a split-screen window counts too); otherwise one above the other.
    <div className="@container">
      <div className="flex flex-col gap-3 sm:gap-6 @min-[92rem]:flex-row @min-[92rem]:items-start">
        <div className="w-full min-w-0 @min-[92rem]:flex-1">
          <h3 className="text-base font-semibold text-[var(--sc-surface-light-ink)]">Spirit received</h3>
          <p className="text-sm text-[var(--sc-surface-light-ink)]/70">
            Spirit scores this team received from its opponents, 0 to 4 per category.
          </p>
          <SpiritTable
            variant="received"
            entries={received}
            emptyLabel="No spirit scores received."
            teamId={teamId}
            matchesById={matchesById}
          />
        </div>
        <div className="w-full min-w-0 @min-[92rem]:flex-1">
          <h3 className="text-base font-semibold text-[var(--sc-surface-light-ink)]">Spirit given</h3>
          <p className="text-sm text-[var(--sc-surface-light-ink)]/70">
            Spirit scores this team gave its opponents.
          </p>
          <SpiritTable
            variant="given"
            entries={given}
            emptyLabel="No submitted spirit scores."
            teamId={teamId}
            matchesById={matchesById}
          />
        </div>
      </div>
    </div>
  );
}

// Same order as the games table: most recent match first.
function sortByMatchNewestFirst(entries) {
  const time = (entry) => {
    const ms = Date.parse(entry?.match?.start_time);
    return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
  };
  return [...entries].sort((a, b) => time(b) - time(a));
}

// The shared WFDF categories: same order and headings as the event spirit page,
// with the full category name on hover.
const SPIRIT_COLUMNS = SPIRIT_DIMENSIONS;

// Styled like the games table: the same panel, header, row rules and score
// cell, so the two tabs read as one page.
function SpiritTable({ entries, emptyLabel, teamId, matchesById, variant = "received" }) {
  if (!entries?.length) {
    return <EmptyState message={emptyLabel} />;
  }

  const headCell = "whitespace-nowrap px-3 py-2 sm:px-4 sm:py-3";
  const numberCell = "whitespace-nowrap px-2 py-2 text-center sm:px-3 sm:py-3";

  return (
    <Panel variant="light" className="mt-2 overflow-x-auto p-0 shadow-sm shadow-[rgba(8,25,21,0.04)] sm:mt-3">
      <table className="w-full min-w-[720px] divide-y divide-[var(--sc-surface-light-border)] text-sm text-[var(--sc-surface-light-ink)]/85">
        <thead className="bg-white/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
          <tr>
            <th className={headCell}>Date &amp; time</th>
            <th className={headCell}>{variant === "received" ? "Given by" : "Given to"}</th>
            <th className={`${numberCell} text-center`}>Score</th>
            <th className={numberCell}>Total</th>
            {SPIRIT_COLUMNS.map((col) => (
              <th key={col.key} className={numberCell} title={col.label}>
                {col.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--sc-surface-light-border)]/70">
          {sortByMatchNewestFirst(entries).map((entry) => {
            // The spirit read carries no match status, so take the full match
            // from the games list for the score cell (forfeits, cancellations).
            const match = matchesById?.get(entry.match?.id) || entry.match;
            const isTeamB = Boolean(teamId && match?.team_b?.id === teamId);
            const ourScore = isTeamB ? match?.score_b : match?.score_a;
            const theirScore = isTeamB ? match?.score_a : match?.score_b;
            const scoreCell = describeScoreCell(match, isTeamB ? "b" : "a", ourScore, theirScore);
            const opponent =
              variant === "received" ? resolveOpponent(match, teamId) : resolveRatedTeam(entry);
            return (
              <tr key={entry.id}>
                <td className="whitespace-nowrap px-3 py-2 text-[var(--sc-surface-light-ink)]/70 sm:px-4 sm:py-3">
                  {match?.id ? (
                    <Link
                      to={matchPath(match.id)}
                      className="text-inherit! underline decoration-dotted decoration-[var(--sc-surface-light-border)] underline-offset-4 transition hover:text-[var(--sc-surface-light-ink)]!"
                    >
                      {formatMatchTime(match.start_time)}
                    </Link>
                  ) : (
                    formatMatchTime(match?.start_time)
                  )}
                </td>
                <td className="px-3 py-2 font-semibold text-[var(--sc-surface-light-ink)] sm:px-4 sm:py-3">
                  {!opponent ? (
                    "TBD"
                  ) : opponent.id === teamId ? (
                    <span>{opponent.name}</span>
                  ) : (
                    <Link
                      to={teamPath(opponent.id, { eventId: match?.event?.id })}
                      className="text-[var(--sc-surface-light-ink)]! underline decoration-dotted decoration-[var(--sc-surface-light-border)] underline-offset-4 transition hover:text-[var(--sc-surface-light-ink)]/70!"
                    >
                      {opponent.name}
                    </Link>
                  )}
                </td>
                <td
                  title={scoreCell.title}
                  className={`${numberCell} ${scoreCell.isWord ? "font-normal" : "font-semibold"} ${scoreCell.className}`}
                >
                  {scoreCell.text}
                  {scoreCell.title ? <span className="sr-only"> ({scoreCell.title})</span> : null}
                </td>
                <td className={`${numberCell} font-semibold text-[var(--sc-surface-light-ink)]`}>
                  {entry.total ?? "—"}
                </td>
                {SPIRIT_COLUMNS.map((col) => (
                  <td key={col.key} className={numberCell}>
                    {entry[col.key] ?? "—"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function SummaryStat({ label, value }) {
  return (
    <Panel variant="light" className="p-3 shadow-sm shadow-[rgba(8,25,21,0.04)] sm:p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold text-[var(--sc-surface-light-ink)] sm:mt-1 sm:text-2xl">{value}</p>
    </Panel>
  );
}

function EmptyState({ message }) {
  return (
    <Panel
      variant="light"
      className="border border-dashed border-[var(--sc-surface-light-border)] bg-white/70 px-4 py-5 text-center text-sm text-[var(--sc-surface-light-ink)]/70 sm:px-6 sm:py-8"
    >
      {message}
    </Panel>
  );
}

function resolveOpponent(match, teamId) {
  if (!match) {
    return null;
  }
  if (!teamId) {
    return match.team_b || match.team_a || null;
  }
  return match.team_a?.id === teamId ? match.team_b : match.team_a;
}

function resolveRatedTeam(entry) {
  if (!entry?.match) {
    return null;
  }
  if (entry.rated_team_id === entry.match.team_a?.id) {
    return entry.match.team_a;
  }
  if (entry.rated_team_id === entry.match.team_b?.id) {
    return entry.match.team_b;
  }
  return null;
}

function formatMatchTime(value) {
  if (!value) {
    return "TBD";
  }
  try {
    return GAME_TIME_FORMATTER.format(new Date(value));
  } catch {
    return value;
  }
}
