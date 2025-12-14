import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPlayerMatchStats } from "../services/teamService";
import { Card, Panel, SectionHeader, SectionShell } from "../components/ui/primitives";

export default function PlayerProfilePage() {
  const { playerId } = useParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;
    async function loadPlayer() {
      setLoading(true);
      setError(null);
      try {
        const data = await getPlayerMatchStats(playerId);
        if (!ignore) {
          setRows(data || []);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Unable to load player stats.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadPlayer();
    return () => {
      ignore = true;
    };
  }, [playerId]);

  const profile = useMemo(() => {
    if (!rows.length) return null;
    const first = rows[0];
    const name = first.player?.name || "Player";
    const jersey = first.player?.jersey_number ?? null;

    const totals = rows.reduce(
      (acc, row) => {
        acc.goals += row.goals || 0;
        acc.assists += row.assists || 0;
        acc.blocks += row.blocks || 0;
        acc.turnovers += row.turnovers || 0;
        acc.matches.add(row.match_id);
        return acc;
      },
      { goals: 0, assists: 0, blocks: 0, turnovers: 0, matches: new Set() },
    );

    const games = totals.matches.size || 0;
    const totalPoints = totals.goals + totals.assists;

    return {
      name,
      jersey,
      games,
      totals,
      totalPoints,
      totalsPerGame: games ? totalPoints / games : 0,
      assistPerGame: games ? totals.assists / games : 0,
      goalsPerGame: games ? totals.goals / games : 0,
    };
  }, [rows]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aTime = a.match?.start_time ? new Date(a.match.start_time).getTime() : 0;
      const bTime = b.match?.start_time ? new Date(b.match.start_time).getTime() : 0;
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;
      return bTime - aTime;
    });
  }, [rows]);

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="pt-6">
        <Card className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            eyebrow="Player profile"
            title={`${profile?.name || "Player"}${profile?.jersey ? ` (#${profile.jersey})` : ""}`}
            description={`Per-match contributions across recorded games (${profile?.games || 0} total).`}
            action={
              <Link to="/players" className="sc-button is-ghost">
                Back to players
              </Link>
            }
          >
            <p className="text-xs text-ink-muted">
              Keep tabs on consistency, high-leverage playmaking, and areas to coach.
            </p>
          </SectionHeader>
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-4 sm:space-y-6">
        {error && <div className="sc-alert is-error">{error}</div>}

        <Card className="space-y-5 p-5 sm:p-6">
          <SectionHeader
            eyebrow="Performance summary"
            title="Match impact ledger"
            description="Totals and per-game rhythm derived from the latest recorded fixtures."
          />

          {loading ? (
            <Panel variant="muted" className="p-4 text-sm text-ink-muted">
              Loading player stats...
            </Panel>
          ) : !rows.length ? (
            <Panel variant="muted" className="p-4 text-sm text-ink-muted">
              No stats recorded for this player yet.
            </Panel>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryTile label="Total points" value={profile.totalPoints} helper="Goals + assists" />
                <SummaryTile label="Goals" value={profile.totals.goals} helper={`${profile.goalsPerGame.toFixed(1)} per game`} />
                <SummaryTile label="Assists" value={profile.totals.assists} helper={`${profile.assistPerGame.toFixed(1)} per game`} />
                <SummaryTile label="Blocks" value={profile.totals.blocks} helper="Defensive plays" />
                <SummaryTile label="Turnovers" value={profile.totals.turnovers} helper="Recorded turnovers" />
                <SummaryTile label="Games played" value={profile.games} helper="Matches with stats" />
              </div>

              <Panel variant="blank" className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-surface-muted/40 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      <tr>
                        <th className="px-4 py-3">Match</th>
                        <th className="px-4 py-3 text-center">Goals</th>
                        <th className="px-4 py-3 text-center">Assists</th>
                        <th className="px-4 py-3 text-center">Blocks</th>
                        <th className="px-4 py-3 text-center">Turnovers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row) => {
                        const matchHref = row.match_id
                          ? `/matches?matchId=${encodeURIComponent(row.match_id)}`
                          : "/matches";
                        return (
                          <tr key={row.match_id} className="border-t border-border/60">
                            <td className="px-4 py-3">
                              <Link
                                to={matchHref}
                                className="font-semibold text-ink transition hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                              >
                                {buildMatchLabel(row)}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-center font-semibold">{row.goals ?? 0}</td>
                            <td className="px-4 py-3 text-center font-semibold">{row.assists ?? 0}</td>
                            <td className="px-4 py-3 text-center font-semibold">{row.blocks ?? 0}</td>
                            <td className="px-4 py-3 text-center font-semibold">{row.turnovers ?? 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}
        </Card>
      </SectionShell>
    </div>
  );
}

function SummaryTile({ label, value, helper }) {
  return (
    <Panel variant="tinted" className="space-y-1.5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="text-2xl font-semibold text-ink">{value ?? 0}</p>
      {helper ? <p className="text-xs text-ink-muted">{helper}</p> : null}
    </Panel>
  );
}

function buildMatchLabel(row) {
  const teamA = row.match?.team_a?.short_name || row.match?.team_a?.name || "Team A";
  const teamB = row.match?.team_b?.short_name || row.match?.team_b?.name || "Team B";
  return `${teamA} vs ${teamB}`;
}

function formatMatchTime(value) {
  if (!value) return "TBD time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD time";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
