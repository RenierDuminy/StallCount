import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  MatchCard,
  SectionHeader,
  SectionShell,
} from "../../components/ui/primitives";
import { getEventHierarchy } from "../../services/leagueService";
import { getMatchesByEvent } from "../../services/matchService";
import { getMatchMediaDetails } from "../../utils/matchMedia";

export const EVENT_ID = "2fb09ada-9a69-47ae-bfc5-96a3bca759e9";
export const EVENT_SLUG = "internal-draft-league-5";
export const EVENT_NAME = "Internal Draft League 5";
const MATCH_LIMIT = 200;
const PLAYOFF_POOL_NAME = "Playoffs";
const PLAYOFF_POOL_FALLBACK_ID = "84d96b1b-2d4d-4dc6-99ba-ecf6871aa627";
const PLAYOFFS_COLUMN_LABEL = "Playoffs";
const LIVE_STATUSES = new Set(["live", "halftime"]);
const FINISHED_STATUSES = new Set(["finished", "completed"]);
const WEEK_LABELS = ["W1", "W2", "W3", "W4", "W5"];
const MATCH_WEEK_SCHEDULE = [
  { key: "week-1", title: "Week 1", dateLabel: "17 Feb", month: 2, day: 17 },
  { key: "week-2", title: "Week 2", dateLabel: "24 Feb", month: 2, day: 24 },
  { key: "week-3", title: "Week 3", dateLabel: "3 Mar", month: 3, day: 3 },
  { key: "week-4", title: "Week 4", dateLabel: "10 Mar", month: 3, day: 10 },
  { key: "week-5", title: "Week 5", dateLabel: "17 Mar", month: 3, day: 17 },
];
const RESULT_LABELS = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  pending: "Pending",
  empty: "-",
};

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

const isLiveMatch = (status) => LIVE_STATUSES.has((status || "").toLowerCase());
const isFinishedMatch = (status) =>
  FINISHED_STATUSES.has((status || "").toLowerCase());

const sortByStartTimeAsc = (a, b) => {
  const left = a.start_time ? new Date(a.start_time).getTime() : Infinity;
  const right = b.start_time ? new Date(b.start_time).getTime() : Infinity;
  return left - right;
};

const getMatchTimestamp = (match) => {
  const source = match.start_time || match.confirmed_at;
  if (!source) return null;
  const timestamp = new Date(source).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const getWeekKey = (timestamp) => {
  const date = new Date(timestamp);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
};

const buildWeekBuckets = (matches, weekCount, matchesPerWeek) => {
  const buckets = Array.from({ length: weekCount }, () => []);
  if (!matches.length) return buckets;

  const datedMatches = matches
    .map((match) => ({ match, timestamp: getMatchTimestamp(match) }))
    .filter((entry) => entry.timestamp !== null);

  if (datedMatches.length) {
    const weekMap = new Map();
    datedMatches.forEach(({ match, timestamp }) => {
      const key = getWeekKey(timestamp);
      const entries = weekMap.get(key) || [];
      entries.push({ match, timestamp });
      weekMap.set(key, entries);
    });

    const orderedWeeks = Array.from(weekMap.values())
      .map((entries) => {
        const sorted = entries.sort((a, b) => a.timestamp - b.timestamp);
        return { timestamp: sorted[0].timestamp, matches: sorted.map((e) => e.match) };
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    orderedWeeks.slice(0, weekCount).forEach((week, index) => {
      buckets[index] = week.matches;
    });

    return buckets;
  }

  const sortedMatches = matches.slice().sort(sortByStartTimeAsc);
  const perWeek = Math.max(1, matchesPerWeek);
  sortedMatches.forEach((match, index) => {
    const bucketIndex = Math.floor(index / perWeek);
    if (bucketIndex >= weekCount) return;
    buckets[bucketIndex].push(match);
  });

  return buckets;
};

const getTeamOutcome = (match, teamId) => {
  if (!isFinishedMatch(match.status)) return RESULT_LABELS.pending;
  const scoreA = match.score_a;
  const scoreB = match.score_b;
  if (typeof scoreA !== "number" || typeof scoreB !== "number") {
    return RESULT_LABELS.pending;
  }
  if (match.team_a?.id === teamId) {
    if (scoreA > scoreB) return RESULT_LABELS.win;
    if (scoreA < scoreB) return RESULT_LABELS.loss;
    return RESULT_LABELS.draw;
  }
  if (match.team_b?.id === teamId) {
    if (scoreB > scoreA) return RESULT_LABELS.win;
    if (scoreB < scoreA) return RESULT_LABELS.loss;
    return RESULT_LABELS.draw;
  }
  return RESULT_LABELS.empty;
};

const formatWinLossPercentage = (wins, draws, played) => {
  if (!played) return RESULT_LABELS.empty;
  const ratio = (wins + draws * 0.5) / played;
  return `${(ratio * 100).toFixed(1)}%`;
};

const normalizeText = (value) =>
  (typeof value === "string" ? value.trim().toLowerCase() : "");

const getEventPools = (eventData) =>
  (eventData?.divisions || []).flatMap((division) => division?.pools || []);

const getResolvedPlayoffPool = (eventData, matches = []) => {
  const pools = getEventPools(eventData);
  const namedPool = pools.find(
    (pool) => normalizeText(pool?.name) === normalizeText(PLAYOFF_POOL_NAME),
  );
  if (namedPool?.id) {
    return namedPool;
  }

  const fallbackPool = pools.find((pool) => pool?.id === PLAYOFF_POOL_FALLBACK_ID);
  if (fallbackPool?.id) {
    return fallbackPool;
  }

  if (matches.some((match) => match?.pool_id === PLAYOFF_POOL_FALLBACK_ID)) {
    return {
      id: PLAYOFF_POOL_FALLBACK_ID,
      name: PLAYOFF_POOL_NAME,
    };
  }

  return null;
};

const buildTeams = (eventData, matches = []) => {
  const map = new Map();

  getEventPools(eventData).forEach((pool) => {
    (pool?.teams || []).forEach((entry) => {
      if (!entry?.team?.id) return;
      map.set(entry.team.id, {
        id: entry.team.id,
        name: entry.team.name || "Team",
      });
    });
  });

  matches.forEach((match) => {
    if (match.team_a?.id) {
      map.set(match.team_a.id, {
        id: match.team_a.id,
        name: match.team_a.name || "Team A",
      });
    }
    if (match.team_b?.id) {
      map.set(match.team_b.id, {
        id: match.team_b.id,
        name: match.team_b.name || "Team B",
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const getTeamStats = (matches, teamId) => {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let scored = 0;
  let conceded = 0;

  matches.forEach((match) => {
    if (!isFinishedMatch(match.status)) return;
    if (typeof match.score_a !== "number" || typeof match.score_b !== "number") {
      return;
    }

    if (match.team_a?.id === teamId) {
      scored += match.score_a;
      conceded += match.score_b;
      if (match.score_a > match.score_b) wins += 1;
      else if (match.score_a < match.score_b) losses += 1;
      else draws += 1;
      return;
    }

    if (match.team_b?.id === teamId) {
      scored += match.score_b;
      conceded += match.score_a;
      if (match.score_b > match.score_a) wins += 1;
      else if (match.score_b < match.score_a) losses += 1;
      else draws += 1;
    }
  });

  const played = wins + losses + draws;
  return {
    played,
    wins,
    losses,
    draws,
    scored,
    conceded,
    scoreDiff: scored - conceded,
    points: wins * 3 + losses * 1 + draws * 2,
    winLossPct: formatWinLossPercentage(wins, draws, played),
  };
};

const getTeamPlayoffMatch = (playoffMatches, teamId) =>
  playoffMatches
    .filter(
      (match) => match.team_a?.id === teamId || match.team_b?.id === teamId,
    )
    .sort(sortByStartTimeAsc)
    .at(-1) || null;

const getMatchWinnerId = (match) => {
  if (!isFinishedMatch(match?.status)) return null;
  if (typeof match?.score_a !== "number" || typeof match?.score_b !== "number") {
    return null;
  }
  if (match.score_a === match.score_b) {
    return null;
  }
  return match.score_a > match.score_b ? match.team_a?.id || null : match.team_b?.id || null;
};

const getPlayoffPlacementEntries = (match, seedLookup) => {
  const teamAId = match.team_a?.id;
  const teamBId = match.team_b?.id;
  const seedA = teamAId ? seedLookup.get(teamAId) : null;
  const seedB = teamBId ? seedLookup.get(teamBId) : null;
  const winnerId = getMatchWinnerId(match);

  if (
    !teamAId ||
    !teamBId ||
    !Number.isInteger(seedA) ||
    !Number.isInteger(seedB) ||
    !winnerId
  ) {
    return null;
  }

  const lowerSeed = Math.min(seedA, seedB);
  const higherSeed = Math.max(seedA, seedB);

  if (higherSeed - lowerSeed !== 1 || lowerSeed % 2 === 0) {
    return null;
  }

  const loserId = winnerId === teamAId ? teamBId : teamAId;
  return [
    { teamId: winnerId, rank: lowerSeed },
    { teamId: loserId, rank: higherSeed },
  ];
};

export default function InternalDraftLeague5Page() {
  const [eventData, setEventData] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;

    async function loadMatches() {
      setLoading(true);
      setError(null);
      try {
        const [structure, rows] = await Promise.all([
          getEventHierarchy(EVENT_ID),
          getMatchesByEvent(EVENT_ID, MATCH_LIMIT, {
            includeFinished: true,
          }),
        ]);
        if (!ignore) {
          setEventData(structure);
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

  const playoffPool = useMemo(
    () => getResolvedPlayoffPool(eventData, matches),
    [eventData, matches],
  );

  const playoffPoolId = playoffPool?.id || null;
  const playoffPoolLabel = playoffPool?.name || PLAYOFF_POOL_NAME;

  const leagueMatches = useMemo(
    () =>
      matches.filter((match) =>
        playoffPoolId ? match?.pool_id !== playoffPoolId : true,
      ),
    [matches, playoffPoolId],
  );

  const sections = useMemo(() => {
    const buckets = Array.from({ length: MATCH_WEEK_SCHEDULE.length }, () => []);

    leagueMatches.forEach((match) => {
      const timestamp = getMatchTimestamp(match);
      if (timestamp === null) return;
      const matchDate = new Date(timestamp);
      const weekIndex = MATCH_WEEK_SCHEDULE.findIndex(
        (week) =>
          week.month === matchDate.getUTCMonth() + 1 &&
          week.day === matchDate.getUTCDate(),
      );
      if (weekIndex !== -1) {
        buckets[weekIndex].push(match);
      }
    });

    return MATCH_WEEK_SCHEDULE.map((week, index) => ({
      key: week.key,
      title: `${week.title} (${week.dateLabel})`,
      dataset: buckets[index].slice().sort(sortByStartTimeAsc),
      empty: `No matches scheduled for ${week.title.toLowerCase()}.`,
    }));
  }, [leagueMatches]);

  const playoffMatches = useMemo(
    () =>
      matches
        .filter((match) => (playoffPoolId ? match?.pool_id === playoffPoolId : false))
        .slice()
        .sort(sortByStartTimeAsc),
    [matches, playoffPoolId],
  );

  const teams = useMemo(() => {
    return buildTeams(eventData, matches);
  }, [eventData, matches]);

  const matchesPerWeek = Math.max(
    1,
    Math.floor(((teams.length || 6) / 2)),
  );

  const matchesByWeek = useMemo(
    () => buildWeekBuckets(leagueMatches, WEEK_LABELS.length, matchesPerWeek),
    [leagueMatches, matchesPerWeek],
  );

  const standingsRows = useMemo(() => {
    const seededRows = teams
      .map((team) => {
        const weekResults = WEEK_LABELS.map((label, index) => {
          const match = matchesByWeek[index]?.find(
            (candidate) =>
              candidate.team_a?.id === team.id ||
              candidate.team_b?.id === team.id,
          );
          const outcome = match
            ? getTeamOutcome(match, team.id)
            : RESULT_LABELS.empty;
          return { label, outcome };
        });
        const leagueStats = getTeamStats(leagueMatches, team.id);
        const playoffMatch = getTeamPlayoffMatch(playoffMatches, team.id);

        return {
          team,
          weekResults,
          seedRank: 0,
          rank: 0,
          playoffOutcome: playoffMatch
            ? getTeamOutcome(playoffMatch, team.id)
            : RESULT_LABELS.empty,
          played: leagueStats.played,
          winLossPct: leagueStats.winLossPct,
          scoreDiff: leagueStats.scoreDiff,
          points: leagueStats.points,
        };
      })
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.scoreDiff - a.scoreDiff ||
          a.team.name.localeCompare(b.team.name),
      )
      .map((row, index) => ({
        ...row,
        seedRank: index + 1,
      }));

    const seedLookup = new Map(
      seededRows.map((row) => [row.team.id, row.seedRank]),
    );
    const finalRankByTeam = new Map(
      seededRows.map((row) => [row.team.id, row.seedRank]),
    );

    playoffMatches
      .filter((match) => getMatchWinnerId(match))
      .forEach((match) => {
        const placementEntries = getPlayoffPlacementEntries(match, seedLookup);
        if (!placementEntries) return;
        placementEntries.forEach(({ teamId, rank }) => {
          finalRankByTeam.set(teamId, rank);
        });
      });

    return seededRows
      .map((row) => ({
        ...row,
        rank: finalRankByTeam.get(row.team.id) ?? row.seedRank,
      }))
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          a.seedRank - b.seedRank ||
          a.team.name.localeCompare(b.team.name),
      );
  }, [leagueMatches, matchesByWeek, playoffMatches, teams]);

  const renderMatchCard = (match) => {
    const liveOrFinal =
      isLiveMatch(match.status) || isFinishedMatch(match.status);
    const mediaDetails = getMatchMediaDetails(match);
    const matchHref = match?.id ? `/matches?matchId=${match.id}` : null;
    const component = matchHref ? Link : "article";
    const linkProps = matchHref ? { to: matchHref } : {};
    const statusLabel = formatMatchStatus(match.status);

    return (
      <MatchCard
        key={match.id}
        as={component}
        variant="tinted"
        className={matchHref ? "cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--sc-accent)]/50" : ""}
        eyebrow={match.event?.name || "Match"}
        title={formatMatchup(match)}
        venue={match.venue}
        meta={formatMatchTime(match.start_time)}
        actions={
          mediaDetails ? (
            <a
              href={mediaDetails.url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="sc-button is-ghost text-xs"
            >
              {mediaDetails.providerLabel || "Watch"}
            </a>
          ) : (
            <span className="text-xs text-ink-muted">No media link attached</span>
          )
        }
        score={liveOrFinal ? formatScoreLine(match) : null}
        status={statusLabel}
        {...linkProps}
      />
    );
  };

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="main" className="space-y-6 py-8">
        <Card className="space-y-3 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Operations workspace"
            title={EVENT_NAME}
            description={`${EVENT_NAME}, a semi-competitive draft league held by Maties Ultimate Frisbee Club.`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/event-rosters?eventId=${EVENT_ID}`} className="sc-button">
                  View event roster
                </Link>
                <Link to={`/players?eventId=${encodeURIComponent(EVENT_ID)}`} className="sc-button">
                  Player standings
                </Link>
              </div>
            }
          />
          {error && <div className="sc-alert is-error">{error}</div>}
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            eyebrow="Standings"
            title="League results"
            description="W1-W5 results set playoff seeding, and the Playoffs pool decides the final ranking."
          />
          {loading && teams.length === 0 ? (
            <Card
              variant="muted"
              className="p-5 text-center text-sm text-ink-muted"
            >
              Loading standings...
            </Card>
          ) : teams.length === 0 ? (
            <Card
              variant="muted"
              className="p-5 text-center text-sm text-ink-muted"
            >
              No team data available yet.
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-center font-semibold">Rank</th>
                    <th className="px-3 py-2 text-left font-semibold">Team</th>
                    {WEEK_LABELS.map((label) => (
                      <th
                        key={label}
                        className="px-3 py-2 text-center font-semibold"
                      >
                        {label}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-semibold">
                      {PLAYOFFS_COLUMN_LABEL}
                    </th>
                    <th className="px-3 py-2 text-center font-semibold">W-L%</th>
                    <th className="px-3 py-2 text-center font-semibold">+/-</th>
                    <th className="px-3 py-2 text-center font-semibold">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {standingsRows.map((row, index) => (
                    <tr
                      key={row.team.id}
                      className="transition-colors"
                      style={{
                        background:
                          index % 2 === 0
                            ? "var(--sc-surface)"
                            : "var(--sc-surface-muted)",
                      }}
                    >
                      <td className="px-3 py-2 text-center font-semibold">
                        {row.rank}
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {row.team.name}
                      </td>
                      {row.weekResults.map((result) => (
                        <td
                          key={`${row.team.id}-${result.label}`}
                          className="px-3 py-2 text-center"
                        >
                          {result.outcome}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center">
                        {row.playoffOutcome}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.winLossPct}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.scoreDiff}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold">
                        {row.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {sections.map((section) => (
          <Card key={section.key} className="space-y-4 p-5 sm:p-6">
            <SectionHeader
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

        <Card className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            eyebrow="Playoffs"
            title={`${playoffPoolLabel} pool`}
            description="Playoff matches linked to the playoffs pool."
          />
          {playoffMatches.length === 0 ? (
            <Card
              variant="muted"
              className="p-5 text-center text-sm text-ink-muted"
            >
              No playoff matches linked yet.
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {playoffMatches.map((match) => renderMatchCard(match))}
            </div>
          )}
        </Card>
      </SectionShell>
    </div>
  );
}
