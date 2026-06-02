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

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="pt-3 sm:pt-6">
        <Card className="space-y-3 p-4 sm:space-y-4 sm:p-6">
          <SectionHeader
            eyebrow="Player profile"
            title={`${profile?.name || identity.name}${(profile?.jersey ?? identity.jersey) ? ` (#${profile?.jersey ?? identity.jersey})` : ""}`}
            action={
              <Link to={backToPlayersHref} className="sc-button is-ghost">
                Back to players
              </Link>
            }
          >
          </SectionHeader>
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-3 sm:space-y-6">
        {error && <div className="sc-alert is-error">{error}</div>}

        <Card className="space-y-3 p-4 sm:space-y-5 sm:p-6">
          <SectionHeader
            title="Performance summary"
            action={
              eventOptions.length > 0 ? (
                <Field className="w-full max-w-xs" label="Event filter" htmlFor="player-event-filter">
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
            <Panel variant="muted" className="p-3 text-sm text-ink-muted sm:p-4">
              Loading player stats...
            </Panel>
          ) : !filteredRows.length ? (
            <Panel variant="muted" className="p-3 text-sm text-ink-muted sm:p-4">
              {eventFilter === "all"
                ? "No stats recorded for this player yet."
                : "No stats recorded for this player in the selected event."}
            </Panel>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
                <SummaryTile label="Total points" value={profile.totalPoints} helper="Goals + assists" />
                <SummaryTile label="Goals" value={profile.totals.goals} helper={`${profile.goalsPerGame.toFixed(1)} per game`} />
                <SummaryTile label="Assists" value={profile.totals.assists} helper={`${profile.assistPerGame.toFixed(1)} per game`} />
                <SummaryTile label="Blocks" value={profile.totals.blocks} helper="Defensive plays" />
                <SummaryTile label="Turnovers" value={profile.totals.turnovers} helper="Recorded turnovers" />
                <SummaryTile label="Games played" value={profile.games} helper="Matches with stats" />
                {profile.totals.callahans > 0 && (
                  <SummaryTile
                    label="Callahans"
                    value={profile.totals.callahans}
                    helper="Defensive scores"
                    tone="gold"
                  />
                )}
              </div>

              <Panel variant="blank" className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-surface-muted/40 text-[8px] font-semibold uppercase tracking-wide text-ink-muted sm:text-[11px]">
                      <tr>
                        <th className="px-3 py-1.5 sm:px-4 sm:py-2">Match</th>
                        <th className="px-3 py-1.5 text-center sm:px-4 sm:py-2">Goals</th>
                        <th className="px-3 py-1.5 text-center sm:px-4 sm:py-2">Assists</th>
                        <th className="px-3 py-1.5 text-center sm:px-4 sm:py-2">Blocks</th>
                        <th className="px-3 py-1.5 text-center sm:px-4 sm:py-2">Turnovers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row) => {
                        const matchHref = row.match_id
                          ? `/matches?matchId=${encodeURIComponent(row.match_id)}`
                          : "/matches";
                        return (
                          <tr key={row.match_id} className="border-t border-border/60">
                            <td className="px-3 py-2 sm:px-4 sm:py-3">
                              <Link
                                to={matchHref}
                                className="font-semibold text-ink transition hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                              >
                                {buildMatchLabel(row)}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-center font-semibold sm:px-4 sm:py-3">{row.goals ?? 0}</td>
                            <td className="px-3 py-2 text-center font-semibold sm:px-4 sm:py-3">{row.assists ?? 0}</td>
                            <td className="px-3 py-2 text-center font-semibold sm:px-4 sm:py-3">{row.blocks ?? 0}</td>
                            <td className="px-3 py-2 text-center font-semibold sm:px-4 sm:py-3">{row.turnovers ?? 0}</td>
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

function SummaryTile({ label, value, helper, tone = "default" }) {
  const isGold = tone === "gold";

  return (
    <Panel
      variant="tinted"
      className={`space-y-1 p-3 sm:space-y-1.5 sm:p-4 ${
        isGold ? "border-amber-400/80 text-amber-200" : ""
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wide ${isGold ? "text-amber-300" : "text-ink-muted"}`}>
        {label}
      </p>
      <p className={`text-xl font-semibold sm:text-2xl ${isGold ? "text-amber-200" : "text-ink"}`}>{value ?? 0}</p>
      {helper ? <p className={`text-xs ${isGold ? "text-amber-200/80" : "text-ink-muted"}`}>{helper}</p> : null}
    </Panel>
  );
}

function buildMatchLabel(row) {
  const teamA = row.match?.team_a?.short_name || row.match?.team_a?.name || "Team A";
  const teamB = row.match?.team_b?.short_name || row.match?.team_b?.name || "Team B";
  return `${teamA} vs ${teamB}`;
}
