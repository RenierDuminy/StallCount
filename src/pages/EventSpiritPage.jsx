import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SectionHeader, SectionShell } from "../components/ui/primitives";
import { getEventHierarchy } from "../services/leagueService";
import { getSpiritScoresByEvent } from "../services/teamService";
import {
  SPIRIT_DIMENSIONS,
  SPIRIT_MAX_SCORE,
  buildSpiritRanking,
  formatSpiritScore,
  summariseSpiritRanking,
} from "../utils/spirit";
import SpiritRadarChart from "../components/SpiritRadarChart";
import { getEventPagePath } from "./eventWorkspaces";

const MAX_TOTAL = SPIRIT_MAX_SCORE * SPIRIT_DIMENSIONS.length;

/**
 * Orders a division's teams by spirit total (best first); teams with no final
 * scores go last, alphabetically, and carry no rank.
 */
function rankDivisionTeams(teams, ranking) {
  const rows = teams.map((team) => ({ team, spirit: ranking.get(team.id) || null }));
  rows.sort((a, b) => {
    if (a.spirit && b.spirit) {
      return b.spirit.total - a.spirit.total || a.team.name.localeCompare(b.team.name);
    }
    if (a.spirit) return -1;
    if (b.spirit) return 1;
    return a.team.name.localeCompare(b.team.name);
  });
  let rank = 0;
  return rows.map((row) => ({ ...row, rank: row.spirit ? (rank += 1) : null }));
}

function SpiritRankingTable({ rows }) {
  return (
    <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded border border-border bg-surface">
      <table className="w-full whitespace-nowrap text-xs">
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="w-8 px-0.5 py-1 text-center font-semibold">#</th>
            <th className="px-1 py-1 text-left font-semibold">Team</th>
            <th className="w-10 px-0.5 py-1 text-center font-semibold" title="Games rated">
              GP
            </th>
            {SPIRIT_DIMENSIONS.map(({ key, label, short }) => (
              <th key={key} className="w-14 px-0.5 py-1 text-center font-semibold" title={label}>
                {short}
              </th>
            ))}
            <th className="w-14 px-0.5 py-1 text-center font-semibold" title={`Out of ${MAX_TOTAL}`}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ team, spirit, rank }, index) => (
            <tr
              key={team.id}
              style={{
                background: index % 2 === 0 ? "var(--sc-surface)" : "var(--sc-surface-muted)",
              }}
            >
              <td className="px-0.5 py-1 text-center tabular-nums text-ink-muted">{rank ?? "–"}</td>
              <td className="px-1 py-1">
                <Link to={`/teams/${team.id}`} className="block truncate text-inherit! hover:underline">
                  {team.name}
                </Link>
              </td>
              <td className="px-0.5 py-1 text-center tabular-nums">{spirit ? spirit.games : "–"}</td>
              {SPIRIT_DIMENSIONS.map(({ key }) => (
                <td key={key} className="px-0.5 py-1 text-center tabular-nums">
                  {formatSpiritScore(spirit?.averages[key])}
                </td>
              ))}
              <td className="px-0.5 py-1 text-center font-semibold tabular-nums">
                {spirit ? formatSpiritScore(spirit.total) : "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EventSpiritPage() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("eventId") || "";
  const [event, setEvent] = useState(null);
  const [scoreRows, setScoreRows] = useState([]);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!eventId) return undefined;
    let ignore = false;
    Promise.all([getEventHierarchy(eventId), getSpiritScoresByEvent(eventId)])
      .then(([hierarchy, rows]) => {
        if (ignore) return;
        setEvent(hierarchy);
        setScoreRows(rows || []);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : "Unable to load spirit scores.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [eventId]);

  const ranking = useMemo(() => buildSpiritRanking(scoreRows), [scoreRows]);
  const summary = useMemo(() => summariseSpiritRanking(ranking), [ranking]);

  const divisions = useMemo(
    () =>
      (event?.divisions || [])
        .map((division) => {
          const seen = new Set();
          const teams = [];
          (division.pools || []).forEach((pool) =>
            (pool.teams || []).forEach(({ team }) => {
              if (team?.id && !seen.has(team.id)) {
                seen.add(team.id);
                teams.push(team);
              }
            }),
          );
          return { id: division.id, name: division.name, rows: rankDivisionTeams(teams, ranking) };
        })
        .filter((division) => division.rows.length),
    [event, ranking],
  );

  const backPath = event ? getEventPagePath({ id: eventId, name: event.name }) : null;

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="main" className="w-full max-w-none space-y-6 py-4 sm:py-5">
        <header className="min-w-0 space-y-3">
          <SectionHeader
            title={event?.name ? `${event.name} – Spirit` : "Event spirit"}
            description={`Average WFDF spirit scores received (0–${SPIRIT_MAX_SCORE} per category, ${MAX_TOTAL} total). Final submissions only.`}
          />
          {backPath ? (
            <div className="flex justify-end">
              <Link to={backPath} className="sc-button whitespace-nowrap">
                Back to event
              </Link>
            </div>
          ) : null}
          {error ? <div className="sc-alert is-error">{error}</div> : null}
        </header>

        {!eventId ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            Choose an event from its page to see spirit rankings.
          </p>
        ) : loading ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            Loading spirit scores...
          </p>
        ) : !divisions.length ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            No teams found for this event.
          </p>
        ) : (
          <>
            {summary ? (
              <section className="min-w-0 space-y-4 border-t border-border pt-6">
                <SectionHeader
                  title="Event spirit profile"
                  description={`Average of all ${summary.teams} rated teams.`}
                />
                <div className="grid gap-5 md:grid-cols-2 md:items-center">
                  <div>
                    <div className="mx-auto w-full max-w-md rounded-2xl bg-white">
                      <SpiritRadarChart
                        large
                        values={summary.average}
                        title="Event average"
                        totalLabel={summary.averageTotal.toFixed(1)}
                        showBaseline={false}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-sm text-ink-muted">
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-0.5 w-5 bg-[#1d4ed8]" /> Average
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0 space-y-4">
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase tracking-wide text-ink-muted">
                        <tr>
                          <th className="py-1.5 text-left font-semibold">Category</th>
                          <th className="w-14 py-1.5 text-center font-semibold">Avg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {SPIRIT_DIMENSIONS.map(({ key, label }) => (
                          <tr key={key} className="border-t border-border">
                            <td className="py-2 pr-2">{label}</td>
                            <td className="py-2 text-center font-semibold tabular-nums">
                              {formatSpiritScore(summary.average[key])}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}
            {divisions.map((division) => (
            <section key={division.id} className="min-w-0 space-y-3 border-t border-border pt-6">
              <SectionHeader title={divisions.length > 1 ? `Team ranking – ${division.name}` : "Team ranking"} />
              <div className="min-w-0 space-y-2">
                {scoreRows.length ? null : (
                  <p className="text-xs text-ink-muted">No spirit scores have been submitted yet.</p>
                )}
                <SpiritRankingTable rows={division.rows} />
              </div>
            </section>
            ))}
          </>
        )}
      </SectionShell>
    </div>
  );
}
