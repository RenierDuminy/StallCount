import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPlayerMatchStats } from "../services/teamService";

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

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="border-b border-slate-200 bg-white py-3 text-slate-800 sm:py-5">
        <div className="sc-shell matches-compact-shell flex items-center gap-3">
          <Link
            to="/players"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
          >
            Back
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Player</p>
            <p className="text-lg font-semibold text-slate-900">
              {profile?.name || "Player"} {profile?.jersey ? `(#${profile.jersey})` : ""}
            </p>
            <p className="text-sm text-slate-600">
              Per-match contributions across recorded games ({profile?.games || 0} total)
            </p>
          </div>
        </div>
      </header>

      <main className="sc-shell matches-compact-shell py-4 sm:py-6 space-y-3">
        {error && (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          {loading ? (
            <p className="text-sm text-slate-600">Loading player stats...</p>
          ) : !rows.length ? (
            <p className="text-sm text-slate-600">No stats recorded for this player yet.</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <SummaryTile label="Total points" value={profile.totalPoints} helper="Goals + assists" />
                <SummaryTile label="Goals" value={profile.totals.goals} helper={`${profile.goalsPerGame.toFixed(1)} per game`} />
                <SummaryTile label="Assists" value={profile.totals.assists} helper={`${profile.assistPerGame.toFixed(1)} per game`} />
                <SummaryTile label="Blocks" value={profile.totals.blocks} helper="Defensive plays" />
                <SummaryTile label="Turnovers" value={profile.totals.turnovers} helper="Recorded turnovers" />
                <SummaryTile label="Games played" value={profile.games} helper="Matches with stats" />
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-left text-sm text-slate-800">
                  <thead>
                    <tr className="uppercase tracking-wide text-[11px] text-slate-500">
                      <th className="px-3 py-2">Match</th>
                      <th className="px-3 py-2 text-center">Goals</th>
                      <th className="px-3 py-2 text-center">Assists</th>
                      <th className="px-3 py-2 text-center">Blocks</th>
                      <th className="px-3 py-2 text-center">Turnovers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const matchLabel = buildMatchLabel(row);
                      return (
                        <tr key={row.match_id} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <p className="font-semibold text-slate-900">{matchLabel}</p>
                            <p className="text-xs text-slate-500">
                              {(row.match?.event?.name || "Event") + " - " + (row.match?.start_time || "TBD")}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-center font-semibold">{row.goals ?? 0}</td>
                          <td className="px-3 py-2 text-center font-semibold">{row.assists ?? 0}</td>
                          <td className="px-3 py-2 text-center font-semibold">{row.blocks ?? 0}</td>
                          <td className="px-3 py-2 text-center font-semibold">{row.turnovers ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function SummaryTile({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}

function buildMatchLabel(row) {
  const teamA = row.match?.team_a?.short_name || row.match?.team_a?.name || "Team A";
  const teamB = row.match?.team_b?.short_name || row.match?.team_b?.name || "Team B";
  return `${teamA} vs ${teamB}`;
}
