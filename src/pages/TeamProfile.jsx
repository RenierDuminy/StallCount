import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MatchMediaButton } from "../components/MatchMediaButton";
import { Card, Chip, Panel, SectionHeader, SectionShell } from "../components/ui/primitives";
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

  const metrics = useMemo(() => {
    if (!state.team) {
      return {
        gamesPlayed: state.matches.length,
        wins: 0,
        losses: 0,
        draws: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        spiritAverage: null,
        activePlayers: state.roster.length,
      };
    }

    let wins = 0;
    let losses = 0;
    let draws = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;

    for (const match of state.matches) {
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

    const receivedEntries = state.spiritScores.filter(
      (entry) => entry.rated_team_id === state.team?.id
    );

    const spiritAverage =
      receivedEntries.length > 0
        ? receivedEntries.reduce((sum, entry) => sum + (entry.total ?? 0), 0) /
          receivedEntries.length
        : null;

    return {
      gamesPlayed: state.matches.length,
      wins,
      losses,
      draws,
      goalsFor,
      goalsAgainst,
      goalDiff: goalsFor - goalsAgainst,
      spiritAverage,
      activePlayers: state.roster.length,
    };
  }, [state.matches, state.roster, state.spiritScores, state.team]);

  const spiritBreakdown = useMemo(() => {
    if (!state.team) {
      return { received: [], given: [] };
    }

    const received = [];
    const given = [];

    for (const entry of state.spiritScores) {
      if (entry.rated_team_id === state.team.id) {
        received.push(entry);
      } else {
        given.push(entry);
      }
    }

    return { received, given };
  }, [state.spiritScores, state.team]);

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
  const shortNameLabel = state.team?.short_name ? `Short name: ${state.team.short_name}` : "";

  return (
    <div className="min-h-screen bg-[#f5fbf6] text-[var(--sc-surface-light-ink)]">
      <SectionShell className="space-y-6 py-8">
        <Card variant="light" className="space-y-5 p-6 sm:p-8 shadow-xl shadow-[rgba(8,25,21,0.08)]">
          <SectionHeader
            eyebrow="Team profile"
            eyebrowVariant="tag"
            title={state.team?.name || "Loading team..."}
            description={divisionSummary}
            action={
              <div className="flex flex-wrap gap-2">
                <Link to="/teams" className="sc-button is-ghost text-sm">
                  All teams
                </Link>
                <Link to="/" className="sc-button is-ghost text-sm">
                  Home
                </Link>
              </div>
            }
          >
            <div className="flex flex-wrap gap-2">
              {shortNameLabel && <Chip variant="tag">{shortNameLabel}</Chip>}
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
              />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryStat label="Games played" value={metrics.gamesPlayed} />
                <SummaryStat label="Record" value={ready ? recordLabel : "—"} />
                <SummaryStat
                  label="Goals for / against"
                  value={ready ? `${metrics.goalsFor} / ${metrics.goalsAgainst}` : "—"}
                />
                <SummaryStat label="Goal diff" value={ready ? metrics.goalDiff : "—"} />
                <SummaryStat label="Spirit average" value={spiritAverageLabel} />
                <SummaryStat label="Active players" value={metrics.activePlayers} />
                <SummaryStat
                  label="Last updated"
                  value={state.team ? formatFullDate(state.team.created_at) : "—"}
                />
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
                      <GamesTable
                        matches={state.matches}
                        teamId={state.team?.id}
                        venueLookup={venueLookup}
                      />
                    )}
                    {activeTab === "players" && (
                      <PlayersTable stats={state.playerStats} rosterCount={state.roster.length} />
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
            const isTeamA = teamId && match.team_a?.id === teamId;
            const opponent = isTeamA ? match.team_b : match.team_a;
            const goalsFor = isTeamA ? match.score_a ?? 0 : match.score_b ?? 0;
            const goalsAgainst = isTeamA ? match.score_b ?? 0 : match.score_a ?? 0;
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
                  {match.team_a ? (
                    <Link
                      to={`/teams/${match.team_a.id}`}
                      className="text-[var(--sc-surface-light-ink)] underline decoration-dotted decoration-[var(--sc-surface-light-border)] underline-offset-4 transition hover:text-[var(--sc-surface-light-ink)]/70"
                    >
                      {match.team_a.name}
                    </Link>
                  ) : (
                    "TBD"
                  )}
                </td>
                <td className={`px-4 py-3 text-center text-base font-semibold ${scoreClass}`}>
                  {Number.isFinite(goalsFor) && Number.isFinite(goalsAgainst)
                    ? `${goalsFor} - ${goalsAgainst}`
                    : "TBD"}
                </td>
                <td className="px-4 py-3 font-semibold text-[var(--sc-surface-light-ink)]">
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
                    <p className="text-xs text-[var(--sc-surface-light-ink)]/60">
                      Total: {total} ({stat.goals} G / {stat.assists} A)
                    </p>
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
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
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
      <div>
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
  );
}

function SpiritTable({ entries, emptyLabel, teamId, variant = "received" }) {
  if (!entries?.length) {
    return <EmptyState message={emptyLabel} />;
  }

  return (
    <Panel variant="light" className="mt-3 overflow-x-auto p-0 shadow-sm shadow-[rgba(8,25,21,0.04)]">
      <table className="min-w-full divide-y divide-[var(--sc-surface-light-border)] text-sm text-[var(--sc-surface-light-ink)]/85">
        <thead className="bg-white/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
          <tr>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">
              {variant === "received" ? "Given by" : "Given to"}
            </th>
            <th className="px-4 py-3 text-right">Total</th>
            <th className="px-4 py-3 text-right">Rules</th>
            <th className="px-4 py-3 text-right">Contact</th>
            <th className="px-4 py-3 text-right">Fair</th>
            <th className="px-4 py-3 text-right">Attitude</th>
            <th className="px-4 py-3 text-right">Communication</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--sc-surface-light-border)]/70">
          {entries.map((entry) => {
            const isTeamA = teamId && entry.match?.team_a?.id === teamId;
            const goalsFor = isTeamA ? entry.match?.score_a ?? 0 : entry.match?.score_b ?? 0;
            const goalsAgainst = isTeamA ? entry.match?.score_b ?? 0 : entry.match?.score_a ?? 0;
            const opponent =
              variant === "received"
                ? resolveOpponent(entry.match, teamId)
                : resolveRatedTeam(entry);
            return (
              <tr key={entry.id}>
                <td className="px-4 py-2 font-semibold text-[var(--sc-surface-light-ink)]">
                  {Number.isFinite(goalsFor) && Number.isFinite(goalsAgainst)
                    ? `${goalsFor} - ${goalsAgainst}`
                    : "TBD"}
                </td>
                <td className="px-4 py-2 text-[var(--sc-surface-light-ink)]/80">
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
                <td className="px-4 py-2 text-right font-semibold text-[var(--sc-surface-light-ink)]">
                  {entry.total ?? "—"}
                </td>
                <td className="px-4 py-2 text-right">{entry.rules_knowledge ?? "—"}</td>
                <td className="px-4 py-2 text-right">{entry.fouls_contact ?? "—"}</td>
                <td className="px-4 py-2 text-right">{entry.self_control ?? "—"}</td>
                <td className="px-4 py-2 text-right">{entry.positive_attitude ?? "—"}</td>
                <td className="px-4 py-2 text-right">{entry.communication ?? "—"}</td>
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
