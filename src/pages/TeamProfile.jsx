import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MatchMediaButton } from "../components/MatchMediaButton";
import { Card, Chip, Panel, SectionHeader, SectionShell, Field, Select } from "../components/ui/primitives";
import { getPlayersByTeam } from "../services/playerService";
import {
  getSpiritScoresForMatches,
  getTeamDetails,
  getTeamMatches,
  getTeamPlayerStats,
} from "../services/teamService";
import { hydrateVenueLookup } from "../services/venueService";
import { getMatchMediaDetails } from "../utils/matchMedia";

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

export default function TeamProfilePage() {
  const { teamId } = useParams();
  const [activeTab, setActiveTab] = useState("games");
  const [eventFilter, setEventFilter] = useState("all");
  const [state, setState] = useState({
    loading: true,
    error: "",
    team: null,
    matches: [],
    roster: [],
    playerStats: [],
    spiritScores: [],
  });
  const [venueLookup, setVenueLookup] = useState({});

  useEffect(() => {
    let ignore = false;

    async function loadProfile() {
      if (!teamId) {
        setState({
          loading: false,
          error: "No team selected.",
          team: null,
          matches: [],
          roster: [],
          playerStats: [],
          spiritScores: [],
        });
        return;
      }

      setState((prev) => ({
        ...prev,
        loading: true,
        error: "",
      }));

      try {
        const [team, matches, roster, playerStats] = await Promise.all([
          getTeamDetails(teamId),
          getTeamMatches(teamId),
          getPlayersByTeam(teamId),
          getTeamPlayerStats(teamId),
        ]);

        if (!team) {
          throw new Error("Team not found.");
        }

        const spiritScores =
          matches.length > 0
            ? await getSpiritScoresForMatches(matches.map((match) => match.id))
            : [];

        if (!ignore) {
          setState({
            loading: false,
            error: "",
            team,
            matches,
            roster,
            playerStats,
            spiritScores,
          });
        }
      } catch (err) {
        if (!ignore) {
          setState({
            loading: false,
            error: err instanceof Error ? err.message : "Unable to load team profile.",
            team: null,
            matches: [],
            roster: [],
            playerStats: [],
            spiritScores: [],
          });
        }
      }
    }

    loadProfile();
    return () => {
      ignore = true;
    };
  }, [teamId]);

  useEffect(() => {
    const venueIds = state.matches
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
  }, [state.matches, venueLookup]);

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
      if (eventId && !options.has(eventId)) {
        options.set(eventId, match.event?.name || "Event");
      }
    });
    return Array.from(options.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state.matches]);

  const filteredMatches = useMemo(() => {
    if (eventFilter === "all") {
      return state.matches;
    }
    return state.matches.filter((match) => match.event?.id === eventFilter);
  }, [state.matches, eventFilter]);

  const filteredSpiritScores = useMemo(() => {
    if (eventFilter === "all") {
      return state.spiritScores;
    }
    return state.spiritScores.filter((entry) => {
      const match = matchesById.get(entry.match_id);
      return match?.event?.id === eventFilter;
    });
  }, [state.spiritScores, matchesById, eventFilter]);

  const filteredPlayerStats = useMemo(() => {
    if (eventFilter === "all") {
      return state.playerStats;
    }
    return state.playerStats.filter((player) =>
      player.matchIds?.some((matchId) => matchesById.get(matchId)?.event?.id === eventFilter),
    );
  }, [state.playerStats, matchesById, eventFilter]);

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
        activePlayers: eventFilter === "all" ? state.roster.length : filteredPlayerStats.length,
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
      activePlayers: eventFilter === "all" ? state.roster.length : filteredPlayerStats.length,
    };
  }, [eventFilter, filteredMatches, filteredPlayerStats, filteredSpiritScores, state.roster, state.team]);

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
  const locationLabel = state.team?.division?.event?.location || "";
  const displayName = state.team?.name
    ? `${state.team.name}${state.team.short_name ? ` (${state.team.short_name})` : ""}`
    : "Loading team...";

  return (
    <div className="min-h-screen bg-[#f5fbf6] text-[var(--sc-surface-light-ink)]">
      <SectionShell className="space-y-6 py-8">
        <Card variant="light" className="space-y-5 p-6 sm:p-8 shadow-xl shadow-[rgba(8,25,21,0.08)]">
          <SectionHeader
            eyebrow="Team profile"
            eyebrowVariant="tag"
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
              <div className="flex flex-wrap gap-2">
                {locationLabel && <Chip variant="ghost">{`Location: ${locationLabel}`}</Chip>}
              </div>
            </SectionHeader>
        </Card>

        {state.error ? (
          <Card variant="light" className="p-6 text-sm text-rose-700 shadow-md shadow-[rgba(8,25,21,0.06)]">
            {state.error}{" "}
            <Link to="/teams" className="font-semibold underline">
              Return to teams list
            </Link>
            .
          </Card>
        ) : (
          <>
            <Card variant="light" className="space-y-6 p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
              <SectionHeader
                eyebrow="Season snapshot"
                eyebrowVariant="tag"
                title="Performance overview"
                description="Key indicators compiled from schedule, roster, and spirit data."
                action={
                  <Field className="w-full max-w-xs" label="Event" htmlFor="team-event-filter">
                    <Select
                      id="team-event-filter"
                      value={eventFilter}
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
                }
              />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryStat label="Games played" value={metrics.gamesPlayed} />
                <SummaryStat label="Record (W-L-D)" value={ready ? recordLabel : "—"} />
                <SummaryStat
                  label="Goals for / against"
                  value={ready ? `${metrics.goalsFor} / ${metrics.goalsAgainst}` : "—"}
                />
                <SummaryStat label="Goal diff" value={ready ? metrics.goalDiff : "—"} />
                <SummaryStat label="Spirit average" value={spiritAverageLabel} />
                <SummaryStat label="Active players" value={metrics.activePlayers} />
              </div>
            </Card>

            <Card variant="light" className="space-y-6 p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
              <div className="flex flex-wrap items-center gap-3">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-full border border-[var(--sc-surface-light-border)] px-4 py-2 text-sm font-semibold transition ${
                      activeTab === tab.id
                        ? "border-[#0a3d29] bg-[#0a3d29] text-white shadow"
                        : "text-[var(--sc-surface-light-ink)]/75 hover:bg-white/70"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                {state.loading ? (
                  <Panel
                    variant="light"
                    className="border border-dashed border-[var(--sc-surface-light-border)] bg-white/70 p-6 text-center text-sm text-[var(--sc-surface-light-ink)]/70"
                  >
                    Loading live team data...
                  </Panel>
                ) : (
                  <>
                    {activeTab === "games" && (
                      <GamesTable matches={filteredMatches} teamId={state.team?.id} venueLookup={venueLookup} />
                    )}
                    {activeTab === "players" && (
                      <PlayersTable
                        stats={filteredPlayerStats}
                        rosterCount={eventFilter === "all" ? state.roster.length : filteredPlayerStats.length}
                      />
                    )}
                    {activeTab === "spirit" && (
                      <SpiritTab
                        received={spiritBreakdown.received}
                        given={spiritBreakdown.given}
                        teamId={state.team?.id}
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

function GamesTable({ matches, teamId, venueLookup }) {
  if (!matches?.length) {
    return <EmptyState message="No games available for this team yet." />;
  }

  const resolveVenueName = (match) =>
    match.venue?.name || (match.venue_id && venueLookup?.[match.venue_id]) || "Venue TBD";

  return (
    <Panel variant="light" className="overflow-x-auto p-0 shadow-sm shadow-[rgba(8,25,21,0.04)]">
      <table className="min-w-full divide-y divide-[var(--sc-surface-light-border)] text-sm text-[var(--sc-surface-light-ink)]/85">
        <thead className="bg-white/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
          <tr>
            <th className="px-4 py-3">Date &amp; time</th>
            <th className="px-4 py-3">Team 1</th>
            <th className="px-4 py-3 text-center">Score</th>
            <th className="px-4 py-3">Team 2</th>
            <th className="px-4 py-3">Pool</th>
            <th className="px-4 py-3">Field</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--sc-surface-light-border)]/70">
          {matches.map((match) => {
            const isTeamA = Boolean(teamId && match.team_a?.id === teamId);
            const isTeamB = Boolean(teamId && match.team_b?.id === teamId);
            const leftTeam = isTeamA ? match.team_a : isTeamB ? match.team_b : match.team_a;
            const rightTeam = isTeamA ? match.team_b : isTeamB ? match.team_a : match.team_b;
            const leftScore = isTeamA ? match.score_a : isTeamB ? match.score_b : match.score_a;
            const rightScore = isTeamA ? match.score_b : isTeamB ? match.score_a : match.score_b;
            const goalsFor = Number.isFinite(leftScore) ? leftScore : 0;
            const goalsAgainst = Number.isFinite(rightScore) ? rightScore : 0;
            const mediaDetails = getMatchMediaDetails(match);
      const scoreClass =
        goalsFor > goalsAgainst
          ? "text-emerald-600"
          : goalsFor < goalsAgainst
            ? "text-rose-600"
            : "text-[var(--sc-surface-light-ink)]/70";

            return (
              <tr key={match.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-[var(--sc-surface-light-ink)]/70">
                  <div className="flex items-center gap-2">
                    <span>{formatMatchTime(match.start_time)}</span>
                    {mediaDetails ? (
                      <MatchMediaButton media={mediaDetails} />
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-[var(--sc-surface-light-ink)]">
                  {leftTeam ? (
                    <Link
                      to={`/teams/${leftTeam.id}`}
                      className="text-[var(--sc-surface-light-ink)] underline decoration-dotted decoration-[var(--sc-surface-light-border)] underline-offset-4 transition hover:text-[var(--sc-surface-light-ink)]/70"
                    >
                      {leftTeam.name}
                    </Link>
                  ) : (
                    "TBD"
                  )}
                </td>
                <td className={`px-4 py-3 text-center text-base font-semibold ${scoreClass}`}>
                  {Number.isFinite(leftScore) && Number.isFinite(rightScore)
                    ? `${leftScore} - ${rightScore}`
                    : "TBD"}
                </td>
                <td className="px-4 py-3 font-semibold text-[var(--sc-surface-light-ink)]">
                  {rightTeam ? (
                    <Link
                      to={`/teams/${rightTeam.id}`}
                      className="text-[var(--sc-surface-light-ink)] underline decoration-dotted decoration-[var(--sc-surface-light-border)] underline-offset-4 transition hover:text-[var(--sc-surface-light-ink)]/70"
                    >
                      {rightTeam.name}
                    </Link>
                  ) : (
                    "TBD"
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--sc-surface-light-ink)]/70">
                  {match.pool?.name || match.division?.name || "—"}
                </td>
                <td className="px-4 py-3 text-[var(--sc-surface-light-ink)]/70">
                  {resolveVenueName(match)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function PlayersTable({ stats, rosterCount }) {
  const [sortConfig, setSortConfig] = useState({ key: "total", direction: "desc" });

  const sortedStats = useMemo(() => {
    if (!stats?.length) return [];
    const data = [...stats];
    const compare = (a, b) => {
      const dir = sortConfig.direction === "asc" ? 1 : -1;
      const getValue = (row) => {
        if (sortConfig.key === "total") return row.goals + row.assists;
        if (sortConfig.key === "playerName") return row.playerName?.toLowerCase() ?? "";
        if (sortConfig.key === "jerseyNumber") return row.jerseyNumber ?? Number.NEGATIVE_INFINITY;
        return row[sortConfig.key] ?? 0;
      };
      const aVal = getValue(a);
      const bVal = getValue(b);
      if (aVal === bVal) {
        return a.playerName.localeCompare(b.playerName) * dir;
      }
      if (typeof aVal === "string" || typeof bVal === "string") {
        return (aVal > bVal ? 1 : -1) * dir;
      }
      return (Number(aVal) > Number(bVal) ? 1 : -1) * dir;
    };
    return data.sort(compare);
  }, [stats, sortConfig]);

  const requestSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "desc" };
    });
  };

  const renderSortLabel = (label, key) => {
    const isActive = sortConfig.key === key;
    const arrow = isActive ? (sortConfig.direction === "asc" ? "↑" : "↓") : "";
    return (
      <button
        type="button"
        onClick={() => requestSort(key)}
        className={`inline-flex items-center gap-1 text-left ${
          isActive ? "text-[var(--sc-surface-light-ink)]" : "text-[var(--sc-surface-light-ink)]/70"
        }`}
      >
        {label} {arrow && <span className="text-[10px]">{arrow}</span>}
      </button>
    );
  };

  if (!stats?.length) {
    return (
      <div className="space-y-4">
        <EmptyState message="No player stats recorded for this team yet." />
        <p className="text-center text-sm text-[var(--sc-surface-light-ink)]/70">
          Active roster count: {rosterCount || 0}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Panel variant="light" className="overflow-x-auto p-0 shadow-sm shadow-[rgba(8,25,21,0.04)]">
        <table className="min-w-full divide-y divide-[var(--sc-surface-light-border)] text-sm text-[var(--sc-surface-light-ink)]/85">
          <thead className="bg-white/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
            <tr>
              <th className="px-4 py-3">{renderSortLabel("Number", "jerseyNumber")}</th>
              <th className="px-4 py-3">{renderSortLabel("Player", "playerName")}</th>
              <th className="px-4 py-3 text-right">{renderSortLabel("Goals", "goals")}</th>
              <th className="px-4 py-3 text-right">{renderSortLabel("Assists", "assists")}</th>
              <th className="px-4 py-3 text-right">{renderSortLabel("Blocks", "blocks")}</th>
              <th className="px-4 py-3 text-right">{renderSortLabel("Turnovers", "turnovers")}</th>
              <th className="px-4 py-3 text-right">{renderSortLabel("Games", "games")}</th>
              <th className="px-4 py-3 text-right">{renderSortLabel("Total (G+A)", "total")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--sc-surface-light-border)]/70">
            {sortedStats.map((stat) => {
              const total = stat.goals + stat.assists;
              return (
                <tr key={stat.playerId}>
                  <td className="px-4 py-3 font-semibold text-[var(--sc-surface-light-ink)]">
                    {stat.jerseyNumber ?? "--"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[var(--sc-surface-light-ink)]">
                      <Link
                        to={`/players/${stat.playerId}`}
                        className="text-[var(--sc-surface-light-ink)] underline decoration-dotted decoration-[var(--sc-surface-light-border)] underline-offset-4 transition hover:text-[var(--sc-surface-light-ink)]/70"
                      >
                        {stat.playerName}
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[var(--sc-surface-light-ink)]">
                    {stat.goals}
                  </td>
                  <td className="px-4 py-3 text-right">{stat.assists}</td>
                  <td className="px-4 py-3 text-right">{stat.blocks}</td>
                  <td className="px-4 py-3 text-right">{stat.turnovers}</td>
                  <td className="px-4 py-3 text-right">{stat.games || 0}</td>
                  <td className="px-4 py-3 text-right">{formatPerGame(total, stat.games)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <p className="text-center text-sm text-[var(--sc-surface-light-ink)]/70">
        Active roster count: {rosterCount || 0}
      </p>
    </div>
  );
}

function SpiritTab({ received, given, teamId }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-full flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-full lg:min-w-[700px] lg:flex-1">
          <h3 className="text-base font-semibold text-[var(--sc-surface-light-ink)]">Spirit received</h3>
          <p className="text-sm text-[var(--sc-surface-light-ink)]/70">
            Scores from opponents about this team&apos;s spirit performance.
          </p>
          <SpiritTable
            variant="received"
            entries={received}
            emptyLabel="No spirit scores received."
            teamId={teamId}
          />
        </div>
        <div className="w-full lg:min-w-[700px] lg:flex-1">
          <h3 className="text-base font-semibold text-[var(--sc-surface-light-ink)]">Spirit given</h3>
          <p className="text-sm text-[var(--sc-surface-light-ink)]/70">
            Scores this team submitted for their opponents.
          </p>
          <SpiritTable
            variant="given"
            entries={given}
            emptyLabel="No submitted spirit scores."
            teamId={teamId}
          />
        </div>
      </div>
    </div>
  );
}

function SpiritTable({ entries, emptyLabel, teamId, variant = "received" }) {
  if (!entries?.length) {
    return <EmptyState message={emptyLabel} />;
  }

  return (
    <Panel
      variant="light"
      className="mt-3 overflow-hidden rounded-lg border border-[var(--sc-surface-light-border)]/70 shadow-sm shadow-[rgba(8,25,21,0.04)]"
    >
      <div className="overflow-x-auto bg-white/90">
        <table className="min-w-[720px] text-sm text-[var(--sc-surface-light-ink)]/85">
          <thead className="bg-[var(--sc-surface-light-bg)]">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
              <th className="border-b border-[var(--sc-surface-light-border)]/70 px-3 py-2">Score</th>
              <th className="border-b border-[var(--sc-surface-light-border)]/70 px-3 py-2">
                {variant === "received" ? "Given by" : "Given to"}
              </th>
              <th className="border-b border-[var(--sc-surface-light-border)]/70 px-2 py-2 text-center">Total</th>
              <th className="border-b border-[var(--sc-surface-light-border)]/70 px-2 py-2 text-center">Rules</th>
              <th className="border-b border-[var(--sc-surface-light-border)]/70 px-2 py-2 text-center">Contact</th>
              <th className="border-b border-[var(--sc-surface-light-border)]/70 px-2 py-2 text-center">Fair</th>
              <th className="border-b border-[var(--sc-surface-light-border)]/70 px-2 py-2 text-center">Attitude</th>
              <th className="border-b border-[var(--sc-surface-light-border)]/70 px-2 py-2 text-center">Communication</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {entries.map((entry) => {
              const isTeamA = teamId && entry.match?.team_a?.id === teamId;
              const goalsFor = isTeamA ? entry.match?.score_a ?? 0 : entry.match?.score_b ?? 0;
              const goalsAgainst = isTeamA ? entry.match?.score_b ?? 0 : entry.match?.score_a ?? 0;
              const opponent =
                variant === "received"
                  ? resolveOpponent(entry.match, teamId)
                  : resolveRatedTeam(entry);
              return (
                <tr key={entry.id} className="border-t border-[var(--sc-surface-light-border)]/60">
                  <td className="px-3 py-2 font-semibold text-[var(--sc-surface-light-ink)]">
                    {Number.isFinite(goalsFor) && Number.isFinite(goalsAgainst)
                      ? `${goalsFor} - ${goalsAgainst}`
                      : "TBD"}
                  </td>
                  <td className="px-3 py-2 text-[var(--sc-surface-light-ink)]/80">
                    {opponent ? (
                      <Link
                        to={`/teams/${opponent.id}`}
                        className="text-[var(--sc-surface-light-ink)] underline decoration-dotted decoration-[var(--sc-surface-light-border)] underline-offset-4 transition hover:text-[var(--sc-surface-light-ink)]/70"
                      >
                        {opponent.name}
                      </Link>
                    ) : (
                      "TBD"
                    )}
                  </td>
                  <td className="px-2 py-2 text-center font-semibold text-[var(--sc-surface-light-ink)]">
                    {entry.total ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-center">{entry.rules_knowledge ?? "—"}</td>
                  <td className="px-2 py-2 text-center">{entry.fouls_contact ?? "—"}</td>
                  <td className="px-2 py-2 text-center">{entry.self_control ?? "—"}</td>
                  <td className="px-2 py-2 text-center">{entry.positive_attitude ?? "—"}</td>
                  <td className="px-2 py-2 text-center">{entry.communication ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function SummaryStat({ label, value }) {
  return (
    <Panel variant="light" className="p-4 shadow-sm shadow-[rgba(8,25,21,0.04)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-[var(--sc-surface-light-ink)]">{value}</p>
    </Panel>
  );
}

function EmptyState({ message }) {
  return (
    <Panel
      variant="light"
      className="border border-dashed border-[var(--sc-surface-light-border)] bg-white/70 px-6 py-8 text-center text-sm text-[var(--sc-surface-light-ink)]/70"
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

function formatFullDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function formatPerGame(total, games) {
  if (!games) return "0.00";
  return (total / games).toFixed(2);
}
