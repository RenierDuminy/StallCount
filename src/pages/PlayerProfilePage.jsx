import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getPlayerMatchStats } from "../services/teamService";
import { Card, Panel, SectionHeader, SectionShell, Field, Select } from "../components/ui/primitives";

export default function PlayerProfilePage() {
  const { playerId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialEventId = searchParams.get("eventId") || "all";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventFilter, setEventFilter] = useState(initialEventId);

  useEffect(() => {
    const requestedEventId = searchParams.get("eventId") || "all";
    setEventFilter((current) => (current === requestedEventId ? current : requestedEventId));
  }, [searchParams]);

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

  const identity = useMemo(() => {
    const first = rows[0];
    return {
      name: first?.player?.name || "Player",
      jersey: first?.player?.jersey_number ?? null,
    };
  }, [rows]);

  const eventOptions = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const event = row.match?.event;
      if (event?.id && !map.has(event.id)) {
        map.set(event.id, event.name || "Event");
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (eventFilter === "all") {
      return rows;
    }
    return rows.filter((row) => row.match?.event?.id === eventFilter);
  }, [eventFilter, rows]);

  const profile = useMemo(() => {
    if (!filteredRows.length) return null;
    const first = filteredRows[0];
    const name = first.player?.name || identity.name || "Player";
    const jersey = first.player?.jersey_number ?? identity.jersey ?? null;

    const totals = filteredRows.reduce(
      (acc, row) => {
        acc.goals += row.goals || 0;
        acc.assists += row.assists || 0;
        acc.blocks += row.blocks || 0;
        acc.turnovers += row.turnovers || 0;
        acc.callahans += row.callahans || 0;
        acc.matches.add(row.match_id);
        return acc;
      },
      { goals: 0, assists: 0, blocks: 0, turnovers: 0, callahans: 0, matches: new Set() },
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
  }, [filteredRows, identity.jersey, identity.name]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const aTime = a.match?.start_time ? new Date(a.match.start_time).getTime() : 0;
      const bTime = b.match?.start_time ? new Date(b.match.start_time).getTime() : 0;
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;
      return bTime - aTime;
    });
  }, [filteredRows]);

  useEffect(() => {
    if (eventFilter === "all") {
      if (searchParams.has("eventId")) {
        setSearchParams({}, { replace: true });
      }
      return;
    }

    if (searchParams.get("eventId") !== eventFilter) {
      setSearchParams({ eventId: eventFilter }, { replace: true });
    }
  }, [eventFilter, searchParams, setSearchParams]);

  const backToPlayersHref =
    eventFilter !== "all" ? `/players?eventId=${encodeURIComponent(eventFilter)}` : "/players";

  const displayName = `${profile?.name || identity.name}${
    (profile?.jersey ?? identity.jersey) != null ? ` (#${profile?.jersey ?? identity.jersey})` : ""
  }`;

  return (
    <div className="min-h-screen bg-[#f5fbf6] text-[var(--sc-surface-light-ink)]">
      <SectionShell className="space-y-3 py-3 sm:space-y-6 sm:py-8">
        <Card variant="light" className="space-y-3 p-4 shadow-xl shadow-[rgba(8,25,21,0.08)] sm:space-y-5 sm:p-8">
          <SectionHeader
            eyebrowVariant="tag"
            title={displayName}
            action={
              <Link to={backToPlayersHref} className="sc-button is-light text-sm">
                Back to players
              </Link>
            }
          />
        </Card>

        {error && (
          <Card variant="light" className="border border-rose-400/40 bg-rose-950/10 p-4 text-sm font-semibold text-rose-700 shadow-md shadow-[rgba(8,25,21,0.06)]">
            {error}
          </Card>
        )}

        <Card variant="light" className="space-y-3 p-4 shadow-md shadow-[rgba(8,25,21,0.06)] sm:space-y-6 sm:p-6">
          <SectionHeader
            eyebrow="Season snapshot"
            eyebrowVariant="tag"
            title="Performance summary"
            description="Stats compiled from recorded matches."
            action={
              eventOptions.length > 0 ? (
                <Field className="w-full max-w-xs" label="Event" htmlFor="player-event-filter">
                  <Select
                    id="player-event-filter"
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
              ) : null
            }
          />

          {loading ? (
            <Panel
              variant="light"
              className="border border-dashed border-[var(--sc-surface-light-border)] bg-white/70 p-4 text-center text-sm text-[var(--sc-surface-light-ink)]/70 sm:p-6"
            >
              Loading player stats...
            </Panel>
          ) : !filteredRows.length ? (
            <Panel
              variant="light"
              className="border border-dashed border-[var(--sc-surface-light-border)] bg-white/70 p-4 text-center text-sm text-[var(--sc-surface-light-ink)]/70 sm:p-6"
            >
              {eventFilter === "all"
                ? "No stats recorded for this player yet."
                : "No stats recorded for this player in the selected event."}
            </Panel>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
                <SummaryStat label="Total (G+A)" value={profile.totalPoints} />
                <SummaryStat label="Goals" value={profile.totals.goals} helper={`${profile.goalsPerGame.toFixed(1)}/game`} />
                <SummaryStat label="Assists" value={profile.totals.assists} helper={`${profile.assistPerGame.toFixed(1)}/game`} />
                <SummaryStat label="Blocks" value={profile.totals.blocks} />
                <SummaryStat label="Turnovers" value={profile.totals.turnovers} />
                <SummaryStat label="Games played" value={profile.games} />
                {profile.totals.callahans > 0 && (
                  <SummaryStat label="Callahans" value={profile.totals.callahans} tone="gold" />
                )}
              </div>

              <Panel variant="light" className="overflow-x-auto p-0 shadow-sm shadow-[rgba(8,25,21,0.04)]">
                <table className="min-w-full divide-y divide-[var(--sc-surface-light-border)] text-sm text-[var(--sc-surface-light-ink)]/85">
                  <thead className="bg-white/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
                    <tr>
                      <th className="px-3 py-1.5">Match</th>
                      <th className="px-3 py-1.5 text-right">G</th>
                      <th className="px-3 py-1.5 text-right">A</th>
                      <th className="px-3 py-1.5 text-right">B</th>
                      <th className="px-3 py-1.5 text-right">TO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--sc-surface-light-border)]/70">
                    {sortedRows.map((row) => {
                      const matchHref = row.match_id
                        ? `/matches?matchId=${encodeURIComponent(row.match_id)}`
                        : "/matches";
                      return (
                        <tr key={row.match_id} className="hover:bg-white/60">
                          <td className="px-3 py-1.5">
                            <Link
                              to={matchHref}
                              className="font-semibold text-[var(--sc-surface-light-ink)] underline decoration-dotted decoration-[var(--sc-surface-light-border)] underline-offset-4 transition hover:text-[var(--sc-surface-light-ink)]/70"
                            >
                              {buildMatchLabel(row)}
                            </Link>
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold">{row.goals ?? 0}</td>
                          <td className="px-3 py-1.5 text-right">{row.assists ?? 0}</td>
                          <td className="px-3 py-1.5 text-right">{row.blocks ?? 0}</td>
                          <td className="px-3 py-1.5 text-right">{row.turnovers ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Panel>
            </>
          )}
        </Card>
      </SectionShell>
    </div>
  );
}

function SummaryStat({ label, value, helper, tone = "default" }) {
  const isGold = tone === "gold";
  return (
    <Panel
      variant="light"
      className={`p-3 shadow-sm shadow-[rgba(8,25,21,0.04)] sm:p-4 ${isGold ? "border-amber-400/60" : ""}`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wide ${isGold ? "text-amber-600" : "text-[var(--sc-surface-light-ink)]/60"}`}>
        {label}
      </p>
      <p className={`mt-0.5 text-xl font-semibold sm:mt-1 sm:text-2xl ${isGold ? "text-amber-700" : "text-[var(--sc-surface-light-ink)]"}`}>
        {value ?? 0}
      </p>
      {helper && (
        <p className={`mt-0.5 text-xs ${isGold ? "text-amber-600/80" : "text-[var(--sc-surface-light-ink)]/50"}`}>
          {helper}
        </p>
      )}
    </Panel>
  );
}

function buildMatchLabel(row) {
  const teamA = row.match?.team_a?.short_name || row.match?.team_a?.name || "Team A";
  const teamB = row.match?.team_b?.short_name || row.match?.team_b?.name || "Team B";
  return `${teamA} vs ${teamB}`;
}
