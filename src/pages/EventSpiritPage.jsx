import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SectionHeader, SectionShell } from "../components/ui/primitives";
import { getEventHierarchy } from "../services/leagueService";
import { getSpiritScoresByEvent } from "../services/teamService";
import {
  SPIRIT_DIMENSIONS,
  SPIRIT_MAX_SCORE,
  SPIRIT_MAX_TOTAL,
  buildSpiritRanking,
  formatSpiritScore,
  summariseSpiritRanking,
} from "../utils/spirit";
import SpiritRadarChart from "../components/SpiritRadarChart";
import { EVENT_SECTIONS } from "./eventWorkspaces";
import { useEventSectionRoute } from "./eventRouteHooks";
import { usePageMeta, withSiteName } from "../utils/pageMeta";
import { teamPath } from "../utils/links";

const MAX_TOTAL = SPIRIT_MAX_TOTAL;

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

function SpiritRankingTable({ rows, eventId = null }) {
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
          {rows.map(({ team, spirit, rank }) => (
            <tr key={team.id} className="transition-colors odd:bg-surface even:bg-surface-muted sc-theme-row">
              <td className="px-0.5 py-1 text-center tabular-nums text-ink">{rank ?? "–"}</td>
              <td className="px-1 py-1">
                <Link to={teamPath(team.id, { eventId })} className="block truncate sc-theme-link">
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
  // `/events/<slug>/spirit`: the event comes from the slug.
  const { event: routeEvent, element: routeElement } = useEventSectionRoute(EVENT_SECTIONS.SPIRIT);
  const eventId = routeElement ? "" : routeEvent?.id || "";
  usePageMeta(
    routeEvent?.name
      ? { title: withSiteName(`Spirit scores – ${routeEvent.name}`), description: `${routeEvent.name}. Spirit score rankings by team and division: average WFDF spirit scores each team received.` }
      : null,
  );
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


  if (routeElement) return routeElement;

  return (
    <div className="min-h-screen pb-16 text-ink">
      {/* The title band, then the content straight on the page. Written
          with the sc-theme-* classes, so it follows the theme. */}
      <div className="sc-theme-band">
        <SectionShell as="header" className="w-full max-w-none space-y-3 py-4 sm:py-5">
          <SectionHeader
            title={event?.name ? `${event.name} – Spirit` : "Event spirit"}
            description={`The average spirit score each team received from its opponents: 0 to ${SPIRIT_MAX_SCORE} in each WFDF category, ${MAX_TOTAL} in total.`}
          />
          {error ? <div className="sc-alert is-error">{error}</div> : null}
        </SectionShell>
      </div>

      <SectionShell as="main" className="w-full max-w-none space-y-8 py-4 sm:py-6">
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
              <section className="min-w-0 space-y-4">
                <SectionHeader
                  className="sc-theme-rule pb-3"
                  title="Event spirit profile"
                  description={`Average of all ${summary.teams} rated teams.`}
                />
                <div className="grid gap-5 md:grid-cols-2 md:items-center">
                  <div>
                    <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-white">
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
                        <span className="inline-block h-0.5 w-5 bg-team-a" /> Average
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
            <section key={division.id} className="min-w-0 space-y-3">
              <SectionHeader className="sc-theme-rule pb-3" title={divisions.length > 1 ? `Team ranking – ${division.name}` : "Team ranking"} />
              <div className="min-w-0 space-y-2">
                {scoreRows.length ? null : (
                  <p className="text-xs text-ink-muted">No spirit scores have been submitted yet.</p>
                )}
                <SpiritRankingTable rows={division.rows} eventId={eventId} />
              </div>
            </section>
            ))}
          </>
        )}
      </SectionShell>
    </div>
  );
}
