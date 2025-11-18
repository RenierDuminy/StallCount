import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPlayersByTeam } from "../services/playerService";
import {
  getSpiritScoresForMatches,
  getTeamDetails,
  getTeamMatches,
  getTeamPlayerStats,
} from "../services/teamService";

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

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Team profile
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">
              {state.team?.name || "Loading team..."}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {state.team?.short_name ? `Short name: ${state.team.short_name} · ` : ""}
              {state.team?.division
                ? `${state.team.division.name}${
                    state.team.division.event ? ` · ${state.team.division.event.name}` : ""
                  }`
                : "Division assignment pending"}
            </p>
            {state.team?.division?.event?.location && (
              <p className="text-sm text-slate-500">
                Location: {state.team.division.event.location}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
            <Link
              to="/teams"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-slate-700 transition hover:border-brand hover:text-brand-dark"
            >
              All teams
            </Link>
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-slate-700 transition hover:border-brand hover:text-brand-dark"
            >
              Home
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {state.error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-5 text-rose-700">
            {state.error}{" "}
            <Link to="/teams" className="font-semibold underline">
              Return to teams list
            </Link>
            .
          </div>
        ) : (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            </section>

            <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      activeTab === tab.id
                        ? "bg-slate-900 text-white shadow"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                {state.loading ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                    Loading live team data...
                  </div>
                ) : (
                  <>
                    {activeTab === "games" && (
                      <GamesTable matches={state.matches} teamId={state.team?.id} />
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
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function GamesTable({ matches, teamId }) {
  if (!matches?.length) {
    return <EmptyState message="No games available for this team yet." />;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Date &amp; time</th>
            <th className="px-4 py-3">Team 1</th>
            <th className="px-4 py-3 text-center">Score</th>
            <th className="px-4 py-3">Team 2</th>
            <th className="px-4 py-3">Pool</th>
            <th className="px-4 py-3">Field</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {matches.map((match) => {
            const isTeamA = teamId && match.team_a?.id === teamId;
            const opponent = isTeamA ? match.team_b : match.team_a;
            const goalsFor = isTeamA ? match.score_a ?? 0 : match.score_b ?? 0;
            const goalsAgainst = isTeamA ? match.score_b ?? 0 : match.score_a ?? 0;
            const scoreClass =
              goalsFor > goalsAgainst
                ? "text-emerald-600"
                : goalsFor < goalsAgainst
                  ? "text-rose-600"
                  : "text-slate-600";

            return (
              <tr key={match.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {formatMatchTime(match.start_time)}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {match.team_a ? (
                    <Link
                      to={`/teams/${match.team_a.id}`}
                      className="text-slate-900 underline decoration-dotted decoration-slate-300 underline-offset-4 transition hover:text-slate-600"
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
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {opponent ? (
                    <Link
                      to={`/teams/${opponent.id}`}
                      className="text-slate-900 underline decoration-dotted decoration-slate-300 underline-offset-4 transition hover:text-slate-600"
                    >
                      {opponent.name}
                    </Link>
                  ) : (
                    "TBD"
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {match.pool?.name || match.division?.name || "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {match.venue?.name || "Venue TBD"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlayersTable({ stats, rosterCount }) {
  if (!stats?.length) {
    return (
      <div className="space-y-4">
        <EmptyState message="No player stats recorded for this team yet." />
        <p className="text-center text-sm text-slate-500">
          Active roster count: {rosterCount || 0}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Assists</th>
              <th className="px-4 py-3 text-right">Goals</th>
              <th className="px-4 py-3 text-right">Games</th>
              <th className="px-4 py-3 text-right">Tot/Gm</th>
              <th className="px-4 py-3 text-right">Ast/Gm</th>
              <th className="px-4 py-3 text-right">Gls/Gm</th>
              <th className="px-4 py-3 text-right">Callahans</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stats.map((stat) => {
              const total = stat.goals + stat.assists;
              return (
                <tr key={stat.playerId}>
                  <td className="px-4 py-2 text-slate-600">{stat.jerseyNumber ?? "—"}</td>
                  <td className="px-4 py-2 font-semibold text-slate-900">{stat.playerName}</td>
                  <td className="px-4 py-2 text-right font-semibold text-slate-900">{total}</td>
                  <td className="px-4 py-2 text-right">{stat.assists}</td>
                  <td className="px-4 py-2 text-right">{stat.goals}</td>
                  <td className="px-4 py-2 text-right">{stat.games}</td>
                  <td className="px-4 py-2 text-right">{formatPerGame(total, stat.games)}</td>
                  <td className="px-4 py-2 text-right">{formatPerGame(stat.assists, stat.games)}</td>
                  <td className="px-4 py-2 text-right">{formatPerGame(stat.goals, stat.games)}</td>
                  <td className="px-4 py-2 text-right text-slate-400">0</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-center text-sm text-slate-500">
        Active roster count: {rosterCount || 0}
      </p>
    </div>
  );
}

function SpiritTab({ received, given, teamId }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Spirit received</h3>
        <p className="text-sm text-slate-500">
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
        <h3 className="text-base font-semibold text-slate-900">Spirit given</h3>
        <p className="text-sm text-slate-500">
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
    <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
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
        <tbody className="divide-y divide-slate-100">
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
                <td className="px-4 py-2 font-semibold text-slate-900">
                  {Number.isFinite(goalsFor) && Number.isFinite(goalsAgainst)
                    ? `${goalsFor} - ${goalsAgainst}`
                    : "TBD"}
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {opponent ? (
                    <Link
                      to={`/teams/${opponent.id}`}
                      className="text-slate-900 underline decoration-dotted decoration-slate-300 underline-offset-4 transition hover:text-slate-600"
                    >
                      {opponent.name}
                    </Link>
                  ) : (
                    "TBD"
                  )}
                </td>
                <td className="px-4 py-2 text-right font-semibold text-slate-900">
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
    </div>
  );
}

function SummaryStat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
      {message}
    </div>
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
