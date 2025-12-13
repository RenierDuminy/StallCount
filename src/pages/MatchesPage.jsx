import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MATCH_LOG_EVENT_CODES, getMatchLogs } from "../services/matchLogService";
import { getMatchById, getMatchesByEvent } from "../services/matchService";
import { getEventsList } from "../services/leagueService";
import { MatchMediaButton } from "../components/MatchMediaButton";
import { getMatchMediaDetails } from "../utils/matchMedia";
import { useAuth } from "../context/AuthContext";

const SERIES_COLORS = {
  teamA: "#1d4ed8",
  teamB: "#b91c1c",
};

const BAND_COLORS = {
  timeout: "rgba(59, 130, 246, 0.1)",
  stoppage: "rgba(128, 0, 0, 0.18)",
  halftime: "rgba(16, 185, 129, 0.18)",
};

const MATCH_EVENT_ID_HINTS = {
  MATCH_START: 8,
  MATCH_END: 9,
};

export default function MatchesPage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [matches, setMatches] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchLoading, setMatchLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);
  const [matchLogs, setMatchLogs] = useState([]);

  useEffect(() => {
    let ignore = false;
    const loadEvents = async () => {
      setEventsLoading(true);
      setEventsError(null);
      try {
        const data = await getEventsList(50);
        if (!ignore) {
          setEvents(data ?? []);
          if (!selectedEventId && data?.[0]?.id) {
            setSelectedEventId(data[0].id);
          }
        }
      } catch (err) {
        if (!ignore) {
          setEventsError(err instanceof Error ? err.message : "Unable to load events.");
        }
      } finally {
        if (!ignore) {
          setEventsLoading(false);
        }
      }
    };
    loadEvents();
    return () => {
      ignore = true;
    };
  }, [selectedEventId]);

  const loadMatchesForEvent = useCallback(
    async (eventId, preferredMatchId = null) => {
      if (!eventId) {
        setMatches([]);
        setSelectedMatchId("");
        return;
      }
      setMatchLoading(true);
      try {
        const data = await getMatchesByEvent(eventId, 50, { includeFinished: true });
        setMatches(data ?? []);
        if (data?.length) {
          const exists = preferredMatchId && data.some((m) => m.id === preferredMatchId);
          setSelectedMatchId(exists ? preferredMatchId : data[0].id);
        } else {
          setSelectedMatchId("");
        }
      } catch (err) {
        setMatches([]);
        setSelectedMatchId("");
        console.error("[MatchesPage] Failed to load matches", err);
      } finally {
        setMatchLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const fromQuery = searchParams.get("matchId");
    if (fromQuery && fromQuery !== selectedMatchId) {
      setSelectedMatchId(fromQuery);
    }
  }, [searchParams, selectedMatchId]);

  useEffect(() => {
    const fromQuery = searchParams.get("matchId");
    if (!fromQuery || !events.length || selectedEventId) return;
    // Try to resolve event from the match so we can load its matches.
    (async () => {
      try {
        const match = await getMatchById(fromQuery);
        if (match?.event_id) {
          setSelectedEventId(match.event_id);
          await loadMatchesForEvent(match.event_id, fromQuery);
        }
      } catch (err) {
        console.error("[MatchesPage] Failed to resolve match from query", err);
      }
    })();
  }, [events.length, loadMatchesForEvent, searchParams, selectedEventId]);

  useEffect(() => {
    if (selectedEventId) {
      void loadMatchesForEvent(selectedEventId, selectedMatchId);
    }
  }, [selectedEventId, loadMatchesForEvent]); 

  useEffect(() => {
    if (!selectedMatchId) {
      setSelectedMatch(null);
      setMatchLogs([]);
      return;
    }
    let ignore = false;
    async function loadMatchData() {
      setLogsLoading(true);
      setLogsError(null);
      try {
        const [match, logs] = await Promise.all([getMatchById(selectedMatchId), getMatchLogs(selectedMatchId)]);
        if (!ignore) {
          setSelectedMatch(match);
          setMatchLogs(logs ?? []);
        }
      } catch (err) {
        if (!ignore) return;
        setLogsError(err instanceof Error ? err.message : "Unable to load match details.");
        setSelectedMatch(null);
        setMatchLogs([]);
      } finally {
        if (!ignore) {
          setLogsLoading(false);
        }
      }
    }
    loadMatchData();
    return () => {
      ignore = true;
    };
  }, [selectedMatchId]);

  const matchMediaDetails = useMemo(() => getMatchMediaDetails(selectedMatch), [selectedMatch]);
  const derived = useMemo(() => deriveMatchInsights(selectedMatch, matchLogs), [selectedMatch, matchLogs]);
  const showLoginBanner = !session && selectedMatchId && !logsLoading && !derived?.timeline;

  return (
    <div className="pb-16 text-ink">
      <header className="sc-shell py-4 sm:py-6">
        <div className="sc-card-base space-y-3 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sc-chip">Matches</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Select a Event and Match to view
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 md:gap-4 md:items-start">
            <label className="space-y-1 text-sm font-semibold text-ink">
              <span>Select event</span>
              <div className="sc-card-muted relative flex items-center gap-3 p-3">
                <div className="text-ink-muted" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </div>
                {eventsLoading ? (
                  <p className="text-sm text-ink-muted">Loading events...</p>
                ) : eventsError ? (
                  <p className="text-sm text-rose-600">{eventsError}</p>
                ) : (
                  <select
                    value={selectedEventId}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedEventId(value);
                      setSelectedMatchId("");
                      if (value) {
                        setSearchParams({}, { replace: true });
                      }
                    }}
                    className="w-full appearance-none rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-inner outline-none focus:border-accent focus:ring-2 focus:ring-[var(--sc-accent)]/50"
                  >
                    <option value="" className="bg-surface text-ink">
                      Pick an event...
                    </option>
                    {events.map((event) => (
                      <option
                        key={event.id}
                        value={event.id}
                        className="bg-surface text-ink"
                      >
                        {event.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="text-ink-muted" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.117l3.71-3.886a.75.75 0 0 1 1.08 1.04l-4.24 4.44a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" />
                  </svg>
                </div>
              </div>
            </label>
            <label className="space-y-1 text-sm font-semibold text-ink">
              <span>Select match</span>
              <div className="sc-card-muted relative flex items-center gap-3 p-3">
                <div className="text-ink-muted" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8m-10 4h12m-9 4h6" />
                    <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="3" />
                  </svg>
                </div>
                <select
                  value={selectedMatchId}
                  disabled={matchLoading || !selectedEventId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedMatchId(value);
                    if (value) {
                      setSearchParams({ matchId: value }, { replace: true });
                    } else {
                      setSearchParams({}, { replace: true });
                    }
                  }}
                  className="w-full appearance-none rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-inner outline-none focus:border-accent focus:ring-2 focus:ring-[var(--sc-accent)]/50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <option value="" className="bg-surface text-ink">
                    {!selectedEventId
                      ? "Select an event first..."
                      : matchLoading
                        ? "Loading matches..."
                        : matches.length
                          ? "Select a match..."
                          : "No matches for this event"}
                  </option>
                  {matches.map((match) => (
                    <option
                      key={match.id}
                      value={match.id}
                      className="bg-surface text-ink"
                    >
                      {formatMatchLabel(match)}
                    </option>
                  ))}
                </select>
                <div className="text-ink-muted" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.117l3.71-3.886a.75.75 0 0 1 1.08 1.04l-4.24 4.44a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" />
                  </svg>
                </div>
              </div>
            </label>
            {selectedMatch && (
              <div className="sc-card-muted p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-ink-muted">Current selection</p>
                    <p className="font-semibold text-ink">
                      {selectedMatch.team_a?.name} vs {selectedMatch.team_b?.name}
                    </p>
                    <p className="text-xs text-ink-muted">
                      Kickoff {formatKickoff(selectedMatch.start_time)} | Status {selectedMatch.status}
                    </p>
                  </div>
                  {matchMediaDetails ? <MatchMediaButton media={matchMediaDetails} /> : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="sc-shell matches-compact-shell space-y-3 py-2 sm:space-y-6 sm:py-4">
        {showLoginBanner && (
          <div
            role="alert"
            className="sc-card-base border border-amber-300/60 bg-amber-50/90 text-amber-900 shadow-lg"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Match data hidden</p>
                <p className="text-xs text-amber-800">
                  Detailed score progression and logs are visible only after signing in.
                </p>
              </div>
              <Link
                to="/login"
                className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-amber-600"
              >
                Sign in to view
              </Link>
            </div>
          </div>
        )}
        {logsError && (
          <p className="sc-card-muted border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {logsError}
          </p>
        )}
        {!selectedEventId ? (
          <div className="sc-card-muted p-5 text-center text-sm text-ink-muted">
            Choose an event above to load its fixture list and associated telemetry.
          </div>
        ) : !selectedMatchId ? (
          <div className="sc-card-muted p-5 text-center text-sm text-ink-muted">
            Select a match to unlock the scoring timeline, possession map, and match log.
          </div>
        ) : logsLoading || !derived ? (
          <div className="sc-card-muted p-5 text-center text-sm text-ink-muted">
            Loading match intelligence...
          </div>
        ) : (
          <>
            {derived.insights && (
              <section className="sc-card-base space-y-3 p-4 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="sc-chip">Match analytics</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <InsightTable title="Match insight" rows={derived.insights.match} />
                  <InsightTable title="Tempo insight" rows={derived.insights.tempo} />
                </div>
              </section>
            )}

            <section className="sc-card-base space-y-2 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="sc-chip">Score progression</span>
              </div>
              <TimelineChart match={selectedMatch} timeline={derived.timeline} possessionTimeline={derived.possessionTimeline} />
            </section>

            {derived.summaries && (
              <section className="sc-card-base space-y-3 p-4 sm:p-6">
                <div className="flex items-center gap-2">
                  <span className="sc-chip">Team production</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <TeamOverviewCard
                    title={`${selectedMatch?.team_a?.name || "Team A"} overview`}
                    stats={derived.summaries.teamA}
                  />
                  <TeamOverviewCard
                    title={`${selectedMatch?.team_b?.name || "Team B"} overview`}
                    stats={derived.summaries.teamB}
                  />
                </div>
              </section>
            )}

            <section className="sc-card-base space-y-3 p-4 sm:p-6">
              <div className="flex items-center gap-2">
                <span className="sc-chip">Point-by-point log</span>
              </div>
              <PointLogTable rows={derived.logRows} teamAName={selectedMatch?.team_a?.name} teamBName={selectedMatch?.team_b?.name} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function LegendSwatch({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs sm:gap-1.5">
      <span
        className="inline-block h-4 w-6 rounded-sm border border-black/60"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function InsightTable({ title, rows }) {
  if (!rows?.length) {
    return (
      <div className="sc-card-muted p-4 text-sm text-ink-muted">No {title.toLowerCase()} available.</div>
    );
  }
  return (
    <div className="sc-card-base">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <table className="w-full text-sm text-ink">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-border text-sm">
              <td className="px-4 py-2 font-medium text-ink-muted">{row.label}</td>
              <td className="px-4 py-2 text-right font-semibold text-ink">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineChart({ match, timeline, possessionTimeline }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;
      const small = window.innerWidth <= 640;
      setIsMobile(small);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!match || !timeline) {
    return (
      <div className="sc-card-muted p-5 text-center text-sm text-ink-muted">Timeline data unavailable.</div>
    );
  }

  const graphClassName = "mx-auto w-full";
  const width = 900;
  const baseHeight = 300;
  const possessionSegments = possessionTimeline?.segments || [];
  const possessionScores = possessionTimeline?.scores || [];
  const possessionBandHeight = possessionSegments.length ? (isMobile ? 18 : 14) : 0;
  const possessionBandGap = possessionSegments.length ? 24 : 0;
  const chartCanvasHeight = isMobile ? baseHeight * 1.35 : baseHeight;
  const height = chartCanvasHeight + possessionBandHeight + possessionBandGap;
  const padding = { top: 26, right: 44, bottom: 52, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = chartCanvasHeight - padding.top - padding.bottom;
  const yMax = Math.max(10, timeline.maxScore);
  const legendY = height - 35;
  const minutesLabelY = legendY - 8;

  const getX = (time) => {
    const ratio = (time - timeline.minTime) / (timeline.maxTime - timeline.minTime || 1);
    return padding.left + ratio * chartWidth;
  };

  const getY = (score) => padding.top + (1 - score / (yMax || 1)) * chartHeight;

  const renderLinePath = (points, color) => {
    if (!points.length) return null;
    const sorted = [...points].sort((a, b) => a.time - b.time);
    let path = `M${getX(sorted[0].time)},${getY(sorted[0].score)}`;
    for (let i = 1; i < sorted.length; i += 1) {
      const curr = sorted[i];
      path += ` L${getX(curr.time)},${getY(curr.score)}`;
    }
    return <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />;
  };

  const teamAName = match?.team_a?.name || "Team A";
  const teamBName = match?.team_b?.name || "Team B";
  const finalScoreA =
    timeline.series?.teamA?.[timeline.series.teamA.length - 1]?.score ?? match?.score_a ?? 0;
  const finalScoreB =
    timeline.series?.teamB?.[timeline.series.teamB.length - 1]?.score ?? match?.score_b ?? 0;
  const chartTitle = `${teamAName} ${finalScoreA} - ${finalScoreB} ${teamBName}`;

  return (
    <div className={`${graphClassName} relative pb-14`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <rect x="0" y="0" width={width} height={height} fill="white" rx="18" />

        {timeline.bands.map((band) => (
          <rect
            key={`${band.type}-${band.start}`}
            x={getX(band.start)}
            y={padding.top}
            width={Math.max(2, getX(band.end) - getX(band.start))}
            height={chartHeight}
            fill={BAND_COLORS[band.type] || "rgba(125,125,125,0.15)"}
          />
        ))}

        <line
          x1={padding.left}
          y1={padding.top + chartHeight}
          x2={padding.left + chartWidth}
          y2={padding.top + chartHeight}
          stroke="#cbd5f5"
          strokeWidth="1"
        />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartHeight} stroke="#cbd5f5" strokeWidth="1" />

        {Array.from({ length: yMax + 1 }).map((_, index) => {
          const y = getY(index);
          return (
            <g key={index}>
              <line x1={padding.left} x2={padding.left + chartWidth} y1={y} y2={y} stroke="#cbd5f5" strokeDasharray="4 6" strokeWidth="0.5" />
              <text x={padding.left - 10} y={y + 4} fontSize="9.35" textAnchor="end" fill="#000">
                {index}
              </text>
            </g>
          );
        })}

        {/* X-axis labels removed to make room for unified timeline labels */}

        {timeline.scoringPoints.map((point) => {
          const cx = getX(point.time);
          const cy = getY(point.score);
          const baselineY = padding.top + chartHeight;
          return (
            <g key={`${point.team}-${point.time}`}>
              <line x1={cx} x2={cx} y1={cy} y2={baselineY} stroke="#cbd5f5" strokeWidth="0.8" />
              <circle
                cx={cx}
                cy={cy}
                r={4}
                fill={SERIES_COLORS[point.team]}
                stroke="white"
                strokeWidth="1.5"
              />
            </g>
          );
        })}

        {renderLinePath(timeline.series.teamA, SERIES_COLORS.teamA)}
        {renderLinePath(timeline.series.teamB, SERIES_COLORS.teamB)}

        <text x={width / 2} y={20} textAnchor="middle" fontSize="13.6" fontWeight="600" fill="#0f172a">
          {chartTitle}
        </text>

        {possessionSegments.length > 0 && (
          <g>
            <rect
              x={padding.left}
              y={padding.top + chartHeight}
              width={chartWidth}
              height={possessionBandHeight}
              fill="#f8fafc"
              rx="4"
            />
            {timeline.timeTicks.map((tick) => {
              const x = getX(tick.value);
              const labelY = padding.top + chartHeight + possessionBandHeight + 12;
              return (
                <text
                  key={`possession-tick-${tick.value}`}
                  fontSize="9.35"
                  fill="#475569"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  x={x}
                  y={labelY}
                >
                  {tick.label}
                </text>
              );
            })}
            {possessionSegments.map((segment, index) => {
              const xStart = getX(segment.start);
              const xEnd = getX(segment.end);
              const segWidth = Math.max(2, xEnd - xStart);
              const fill =
                segment.team === "teamA"
                  ? SERIES_COLORS.teamA
                  : segment.team === "teamB"
                    ? SERIES_COLORS.teamB
                    : segment.team === "band"
                      ? "rgba(148, 163, 184, 0.9)"
                      : "rgba(226, 232, 240, 0.9)";
              return (
                <rect
                  key={`${segment.team || "unknown"}-${segment.start}-${index}`}
                  x={xStart}
                  y={padding.top + chartHeight}
                  width={segWidth}
                  height={possessionBandHeight}
                  fill={fill}
                  opacity="0.9"
                />
              );
            })}
          </g>
        )}

        <text x={width / 2} y={minutesLabelY} textAnchor="middle" fontSize="10.2" fill="#000">
          Minutes
        </text>
        <text
          x="14"
          y={height / 2}
          textAnchor="middle"
          fontSize="10.2"
          transform={`rotate(-90 14 ${height / 2})`}
          fill="#000">
          Score
        </text>

        <foreignObject x={width * 0.15} y={legendY} width={width * 0.7} height="40">
          <div
            xmlns="http://www.w3.org/1999/xhtml"
            className="flex flex-wrap items-center justify-center gap-4 text-xs"
          >
            <span className="flex flex-wrap items-center gap-3 text-sm font-semibold text-black">
              <LegendSwatch color={SERIES_COLORS.teamA} label={teamAName} />
              <LegendSwatch color={SERIES_COLORS.teamB} label={teamBName} />
            </span>
            <span className="flex flex-wrap items-center gap-2 text-xs text-black">
              <LegendSwatch color={BAND_COLORS.timeout} label="Timeout" />
              <LegendSwatch color={BAND_COLORS.stoppage} label="Stoppage" />
              <LegendSwatch color={BAND_COLORS.halftime} label="Halftime" />
            </span>
          </div>
        </foreignObject>
      </svg>
    </div>
  );
}
function PossessionTimeline({ timeline, teamAName, teamBName }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => {
      if (typeof window === "undefined") return;
      setIsMobile(window.innerWidth <= 640);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!timeline) {
    return (
      <div className="sc-card-muted p-5 text-center text-sm text-ink-muted">
        Possession data unavailable. Log turnovers to populate this view.
      </div>
    );
  }

  const segments = timeline.segments || [];
  const turnovers = timeline.turnovers || [];
  const scoreMarkers = timeline.scores || [];
  const timeTicks = timeline.timeTicks || [];
  const width = 900;
  const baseHeight = 118;
  const height = isMobile ? baseHeight * 1.05 : baseHeight;
  const padding = { top: 12, right: 36, bottom: 32, left: 36 };
  const chartWidth = width - padding.left - padding.right;
  const bandHeight = isMobile ? 28 : 24;
  const bandY = padding.top;
  const tickY = bandY + bandHeight + 18;
  const unknownColor = "#e2e8f0";
  const bandColor = "#475569";

  const getX = (time) => {
    const ratio = (time - timeline.minTime) / (timeline.maxTime - timeline.minTime || 1);
    return padding.left + ratio * chartWidth;
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      <rect x="0" y="0" width={width} height={height} fill="white" rx="18" />

      {segments.map((segment, index) => {
        const xStart = getX(segment.start);
        const xEnd = getX(segment.end);
        const segWidth = Math.max(2, xEnd - xStart);
        const fill =
          segment.team === "teamA"
            ? SERIES_COLORS.teamA
            : segment.team === "teamB"
              ? SERIES_COLORS.teamB
              : segment.team === "band"
                ? bandColor
                : unknownColor;
        return (
          <g key={`${segment.team || "unknown"}-${segment.start}-${index}`}>
            <rect
              x={xStart}
              y={bandY}
              width={segWidth}
              height={bandHeight}
              fill={fill}
              opacity="0.75"
              rx="0"
            />
          </g>
        );
      })}

      {scoreMarkers.map((score, index) => {
        const x = getX(score.time);
        const y = bandY + bandHeight + 3;
        return (
          <path
            key={`${score.team || "score"}-${score.time}-${index}`}
            d={`M${x - 3.25},${y + 5} L${x},${y} L${x + 3.25},${y + 5}`}
            fill="none"
            stroke="#0f172a"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}

      {timeTicks.map((tick) => {
        const x = getX(tick.value);
        return (
          <g key={tick.value}>
            <text fontSize="11" fill="#475569" textAnchor="middle" dominantBaseline="middle" x={x} y={tickY + 4}>
              {tick.label}
            </text>
            <line x1={x} x2={x} y1={tickY} y2={tickY + 6} stroke="#94a3b8" strokeWidth="1" />
          </g>
        );
      })}

      <text x={width / 2} y={height - 10} textAnchor="middle" fontSize="12" fill="#475569">
        Minutes
      </text>
    </svg>
  );
}

function TeamOverviewCard({ title, stats }) {
  const goals = stats?.goals || [];
  const assists = stats?.assists || [];
  const turnovers = stats?.turnovers || [];
  const connections = stats?.connections || [];
  const production = stats?.production;
  const summaryStats = [
    { key: "holds", label: "Holds", value: production?.holds },
    { key: "clean", label: "Clean holds", value: production?.cleanHolds },
    { key: "turnovers", label: "Total turnovers", value: production?.totalTurnovers },
    { key: "breaks", label: "Breaks", value: production?.breaks },
    { key: "breakChances", label: "Break chances", value: production?.breakChances },
  ];
  const formatStatValue = (value) => (Number.isFinite(value) ? value : value === 0 ? 0 : "--");

  const renderList = (label, rows, valueLabel) => {
    return (
      <div className="sc-card-muted p-3">
        {rows.length ? (
          <table className="w-full text-left text-sm text-ink">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-0.5 pr-2">{valueLabel}</th>
                <th className="py-0.5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row) => (
                <tr key={`${label}-${row.player}`} className="border-t border-border text-sm">
                  <td className="py-1 pr-2">{row.player}</td>
                  <td className="py-1 text-right font-semibold">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-0.5 text-xs text-ink-muted sm:mt-1.5">No {label.toLowerCase()} recorded.</p>
        )}
      </div>
    );
  };

  return (
    <div className="sc-card-base p-3 sm:p-5">
      <h3 className="mb-1.5 text-lg font-semibold text-ink sm:mb-2.5">{title}</h3>
      {production && (
        <div className="mb-2 grid grid-cols-2 gap-2 text-center sm:mb-3 sm:grid-cols-5 sm:gap-3">
          {summaryStats.map((item) => (
            <div
              key={item.key}
              className="rounded-xl border border-border bg-surface px-2 py-3"
            >
              <p className="text-lg font-semibold text-ink sm:text-xl">
                {formatStatValue(item.value)}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted sm:text-[11px]">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 sm:gap-3">
        {renderList("Goals", goals, "Goal")}
        {renderList("Assists", assists, "Assist")}
        {renderList("Turnovers", turnovers, "Turnover")}
      </div>
      <div className="mt-1.5 sc-card-muted p-3 sm:mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Top connections</p>
        {connections.length ? (
          <table className="mt-1 w-full text-left text-sm text-ink sm:mt-1.5">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-0.5 pr-2">Assist</th>
                <th className="py-0.5" />
                <th className="py-0.5 pr-2">Scorer</th>
                <th className="py-0.5 text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {connections.slice(0, 6).map((row) => (
                <tr key={`${row.assist}-${row.scorer}`} className="border-t border-border text-sm">
                  <td className="py-1 pr-2">{row.assist}</td>
                  <td className="py-1 text-center text-sm font-bold text-ink-muted">→</td>
                  <td className="py-1 pr-2">{row.scorer}</td>
                  <td className="py-1 text-right font-semibold">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-1 text-xs text-ink-muted sm:mt-1.5">No assisted goals recorded.</p>
        )}
      </div>
    </div>
  );
}

function PointLogTable({ rows, teamAName, teamBName }) {
  if (!rows.length) {
    return (
      <div className="sc-card-muted p-5 text-center text-sm text-ink-muted">No match events recorded yet.</div>
    );
  }
  return (
    <div className="w-full overflow-x-auto px-0 sm:mx-0 sm:px-0">
      <table className="w-full table-auto text-left text-xs sm:text-sm text-black">
        <thead className="text-white">
          <tr className="uppercase tracking-wide text-[11px]">
            <th className="px-1 py-0.5 sm:px-2 sm:py-1.5">Time</th>
            <th className="px-1 py-0.5 sm:px-2 sm:py-1.5">Team</th>
            <th className="px-1 py-0.5 sm:px-2 sm:py-1.5">Assist → Score</th>
            <th className="px-1 py-0.5 text-right sm:px-2 sm:py-1.5">Gap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.index}-${row.timestamp}`}
              className={`border-b border-border last:border-none ${
                row.variant === "timeout"
                  ? "bg-[#95df88]"
                : row.variant === "stoppage"
                  ? "bg-[#fd5050]"
                : row.variant === "halftime"
                  ? "bg-[#269828]"
                : row.variant === "callahan"
                  ? "bg-[#fef9c3]"
                : row.variant === "goalA"
                  ? "bg-[#6591ff]"
                : row.variant === "goalB"
                  ? "bg-[#ffc892]"
                : row.variant === "turnoverA"
                  ? "bg-[#e0f2fe]"
                : row.variant === "turnoverB"
                  ? "bg-[#e0f2fe]"
                  : ""
              }`}
            >
              <td className="px-1 py-0.5 whitespace-nowrap text-black sm:px-2 sm:py-1.5">{row.formattedTime}</td>
              <td className="px-1 py-0.5 font-semibold text-black sm:px-2 sm:py-1.5">{row.teamLabel}</td>
              <td className="px-1 py-0.5 sm:px-2 sm:py-1.5">
                {row.description === "Timeout" ||
                row.description === "Halftime" ||
                row.description === "Match start" ||
                row.description === "Stoppage" ||
                row.variant?.startsWith("turnover") ? (
                  <div className="text-center text-xs font-semibold text-black sm:text-sm">
                    <div>{row.description}</div>
                    {row.metaDetails && (
                      <p className="text-[10px] font-normal text-ink-muted sm:text-xs">
                        {row.metaDetails}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid auto-rows-min items-center gap-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-1.5">
                    <span className="text-black text-[11px] sm:text-sm sm:text-right">{row.assist || "-"}</span>
                    <span className="text-[10px] font-semibold text-black text-center sm:text-xs">→</span>
                    <span className="font-semibold text-black">{row.scorer || "-"}</span>
                  </div>
                )}
              </td>
              <td className="px-1 py-0.5 text-right font-mono text-[11px] text-black sm:px-2 sm:py-1.5 sm:text-xs">
                {row.gap}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function deriveMatchInsights(match, logs) {
  if (!match) return null;
  const teamAId = match.team_a?.id || null;
  const teamBId = match.team_b?.id || null;
  const teamAName = match.team_a?.name || "Team A";
  const teamBName = match.team_b?.name || "Team B";
  const createStats = () => ({
    goalCounts: new Map(),
    assistCounts: new Map(),
    turnoverCounts: new Map(),
    connectionCounts: new Map(),
  });
  const teamStats = {
    teamA: createStats(),
    teamB: createStats(),
  };
  const createProductionTotals = () => ({
    holds: 0,
    cleanHolds: 0,
    breaks: 0,
    breakChances: 0,
    totalTurnovers: 0,
  });
  const teamProduction = {
    teamA: createProductionTotals(),
    teamB: createProductionTotals(),
  };
  const incrementCount = (map, name) => {
    const normalized = typeof name === "string" ? name.trim() : "";
    if (!normalized) return;
    map.set(normalized, (map.get(normalized) || 0) + 1);
  };
  const recordConnection = (stats, assist, scorer) => {
    const cleanedAssist = typeof assist === "string" ? assist.trim() : "";
    const cleanedScorer = typeof scorer === "string" ? scorer.trim() : "";
    if (!cleanedAssist || !cleanedScorer) return;
    const key = `${cleanedAssist}:::${cleanedScorer}`;
    stats.connectionCounts.set(key, (stats.connectionCounts.get(key) || 0) + 1);
  };
  const toTeamKey = (teamId) => {
    if (!teamId) return null;
    if (teamId === teamAId) return "teamA";
    if (teamId === teamBId) return "teamB";
    return null;
  };
  const getOppositeTeam = (teamKey) => {
    if (teamKey === "teamA") return "teamB";
    if (teamKey === "teamB") return "teamA";
    return null;
  };
  const inferInitialOffense = () => {
    if (match.starting_team_id === teamAId) return "teamB";
    if (match.starting_team_id === teamBId) return "teamA";
    return "teamA";
  };
  const normalizeTeamKey = (teamKey) => (teamKey === "teamA" || teamKey === "teamB" ? teamKey : null);
  const fallbackOffense = normalizeTeamKey(inferInitialOffense()) || "teamA";
  let pointStartingOffense = fallbackOffense;
  let pointStartingDefense = getOppositeTeam(pointStartingOffense);
  let currentPossession = pointStartingOffense;
  let pointTurnovers = 0;
  const resetPointState = (nextOffense) => {
    const normalized = normalizeTeamKey(nextOffense) || fallbackOffense;
    pointStartingOffense = normalized;
    pointStartingDefense = getOppositeTeam(normalized);
    currentPossession = pointStartingOffense;
    pointTurnovers = 0;
  };
  resetPointState(fallbackOffense);

  let scoreA = 0;
  let scoreB = 0;
  const snapshots = [];
  const scoringPoints = [];
  const turnovers = [];
  const timestamps = [];
  const pendingBands = {
    timeout: null,
    stoppage: null,
    halftime: null,
  };
  const bands = [];
  const logRows = [];
  let matchStartLogged = false;
  let previousTime = null;
  let pointIndex = 1;

  const toClockMs = (value) => {
    const parts = parseTimeParts(value);
    if (!parts) return null;
    return (
      parts.hours * 3600000 + parts.minutes * 60000 + parts.seconds * 1000 + parts.milliseconds
    );
  };

  let timelineStart = toClockMs(match.start_time);
  let timelineEnd = null;
  let matchStartEventTime = null;
  let matchEndEventTime = null;

  const pushSnapshot = (time) => {
    if (!Number.isFinite(time)) return;
    timestamps.push(time);
    snapshots.push({ time, scoreA, scoreB });
  };

  if (Number.isFinite(timelineStart)) {
    snapshots.push({ time: timelineStart, scoreA: 0, scoreB: 0 });
    timestamps.push(timelineStart);
  }

  for (const log of logs) {
    const code = log.event?.code;
    const typeId = Number(log.event_type_id) || null;
    const timestamp = toClockMs(log.created_at);
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const formattedTime = formatTimeLabel(timestamp, true);
    const gap = previousTime ? formatGap(timestamp - previousTime) : "0:00";

    const isMatchStart =
      code === MATCH_LOG_EVENT_CODES.MATCH_START || typeId === MATCH_EVENT_ID_HINTS.MATCH_START;
    const isMatchEnd =
      code === MATCH_LOG_EVENT_CODES.MATCH_END || typeId === MATCH_EVENT_ID_HINTS.MATCH_END;

    if (isMatchStart) {
      if (!matchStartEventTime || timestamp < matchStartEventTime) {
        matchStartEventTime = timestamp;
      }
      timelineStart = matchStartEventTime;
      snapshots.unshift({ time: matchStartEventTime, scoreA: 0, scoreB: 0 });
      timestamps.push(matchStartEventTime);
      if (!matchStartLogged) {
        logRows.unshift({
          label: "Start",
          index: 0,
          timestamp,
          formattedTime,
          teamLabel: "-",
          scorer: "-",
          assist: "-",
          description: "Match start",
          gap: "-",
          variant: "halftime",
        });
        matchStartLogged = true;
      }
      previousTime = matchStartEventTime;
      continue;
    }
    if (isMatchEnd) {
      if (!matchEndEventTime || timestamp > matchEndEventTime) {
        matchEndEventTime = timestamp;
      }
      timelineEnd = matchEndEventTime;
      pushSnapshot(matchEndEventTime);
      logRows.push({
        label: "End",
        index: 0,
        timestamp,
        formattedTime,
        teamLabel: "-",
        scorer: "-",
        assist: "-",
        description: "Match end",
        gap: "-",
        variant: "halftime",
      });
      previousTime = matchEndEventTime;
      continue;
    }

    if (code === MATCH_LOG_EVENT_CODES.SCORE || code === MATCH_LOG_EVENT_CODES.CALAHAN) {
      const teamLabel = log.team_id === teamAId ? teamAName : teamBName;
      const teamKey = toTeamKey(log.team_id);
      if (teamKey) {
        if (teamKey === pointStartingOffense) {
          teamProduction[teamKey].holds += 1;
          if (pointTurnovers === 0) {
            teamProduction[teamKey].cleanHolds += 1;
          }
        } else if (teamKey === pointStartingDefense) {
          teamProduction[teamKey].breaks += 1;
        }
      }
      if (log.team_id === teamAId) {
        scoreA += 1;
        scoringPoints.push({ team: "teamA", time: timestamp, score: scoreA });
      } else if (log.team_id === teamBId) {
        scoreB += 1;
        scoringPoints.push({ team: "teamB", time: timestamp, score: scoreB });
      }
      const scorerName = log.actor?.name ?? log.scorer_name ?? "N/A";
      let assistName = log.secondary_actor?.name ?? log.assist_name ?? "";
      if (code === MATCH_LOG_EVENT_CODES.CALAHAN && !assistName) {
        assistName = "Callahan";
      }
      pushSnapshot(timestamp);
      logRows.push({
        label: pointIndex.toString(),
        index: pointIndex,
        timestamp,
        formattedTime,
        teamLabel,
        scorer: scorerName,
        assist: assistName,
        description: code === MATCH_LOG_EVENT_CODES.CALAHAN ? "Callahan goal" : "Scored",
        gap,
        variant:
          code === MATCH_LOG_EVENT_CODES.CALAHAN
            ? "callahan"
            : log.team_id === teamAId
              ? "goalA"
              : "goalB",
      });
      if (teamKey) {
        const stats = teamStats[teamKey];
        incrementCount(stats.goalCounts, scorerName);
        if (assistName && assistName !== "Callahan") {
          incrementCount(stats.assistCounts, assistName);
          recordConnection(stats, assistName, scorerName);
        }
      }
      const nextOffense = teamKey
        ? getOppositeTeam(teamKey)
        : getOppositeTeam(pointStartingOffense);
      resetPointState(nextOffense);
      previousTime = timestamp;
      pointIndex += 1;
      continue;
    }

    const eventCodeLower = (code || "").toLowerCase();

    if (eventCodeLower === MATCH_LOG_EVENT_CODES.TURNOVER || eventCodeLower === "block") {
      const eventLabel = (log.event?.description || "").trim();
      const actorName = log.actor?.name ?? log.scorer_name ?? "";
      const normalizedLabel = eventLabel.toLowerCase();
      const isBlockEvent = eventCodeLower === "block" || normalizedLabel.includes("block");
      const reportedTeamKey = toTeamKey(log.team_id);
      const previouslyHoldingTeam = currentPossession;
      let gainingTeamKey = reportedTeamKey;
      if (previouslyHoldingTeam && reportedTeamKey && reportedTeamKey === previouslyHoldingTeam && !isBlockEvent) {
        gainingTeamKey = getOppositeTeam(reportedTeamKey);
      }
      if (!gainingTeamKey && previouslyHoldingTeam) {
        gainingTeamKey = getOppositeTeam(previouslyHoldingTeam);
      }

      const losingTeamKey =
        previouslyHoldingTeam ||
        (gainingTeamKey ? getOppositeTeam(gainingTeamKey) : null);
      if (losingTeamKey) {
        teamProduction[losingTeamKey].totalTurnovers += 1;
      }
      pointTurnovers += 1;
      if (pointStartingDefense && gainingTeamKey === pointStartingDefense) {
        teamProduction[pointStartingDefense].breakChances += 1;
      }
      if (gainingTeamKey) {
        currentPossession = gainingTeamKey;
      }

      const creditedTeamKey = isBlockEvent ? gainingTeamKey : losingTeamKey;
      if (creditedTeamKey) {
        const creditedStats = teamStats[creditedTeamKey];
        if (creditedStats?.turnoverCounts && actorName) {
          incrementCount(creditedStats.turnoverCounts, actorName);
        }
      }

      const gainingTeamLabel =
        gainingTeamKey === "teamA" ? teamAName : gainingTeamKey === "teamB" ? teamBName : "-";
      const losingTeamLabel =
        losingTeamKey === "teamA" ? teamAName : losingTeamKey === "teamB" ? teamBName : "-";
      const variant =
        gainingTeamKey === "teamA" ? "turnoverA" : gainingTeamKey === "teamB" ? "turnoverB" : "turnover";

      turnovers.push({
        time: timestamp,
        team: gainingTeamKey,
        source: isBlockEvent ? "block" : "turnover",
      });

      const metaDetails = actorName
        ? isBlockEvent
          ? `${actorName} denied ${losingTeamLabel || "opposition"}`
          : `${actorName} credited`
        : `${gainingTeamLabel || "Team"} gains possession`;

      logRows.push({
        label: "TO",
        index: pointIndex,
        timestamp,
        formattedTime,
        teamLabel: gainingTeamLabel,
        scorer: "-",
        assist: "-",
        description: eventLabel || (isBlockEvent ? "Block" : "Turnover"),
        metaDetails,
        gap,
        variant,
      });
      previousTime = timestamp;
      continue;
    }

    if (code === MATCH_LOG_EVENT_CODES.TIMEOUT_START) {
      pendingBands.timeout = timestamp;
      pushSnapshot(timestamp);
      logRows.push({
        label: "TO",
        index: pointIndex,
        timestamp,
        formattedTime,
        teamLabel: log.team_id === teamAId ? teamAName : teamBName,
        scorer: "-",
        assist: "-",
        description: "Timeout",
        gap,
        variant: "timeout",
      });
      previousTime = timestamp;
      continue;
    }
    if (code === MATCH_LOG_EVENT_CODES.TIMEOUT_END && pendingBands.timeout) {
      bands.push({ type: "timeout", start: pendingBands.timeout, end: timestamp });
      pendingBands.timeout = null;
      pushSnapshot(timestamp);
      previousTime = timestamp;
      continue;
    }
    if (code === MATCH_LOG_EVENT_CODES.STOPPAGE_START) {
      pendingBands.stoppage = timestamp;
      pushSnapshot(timestamp);
      logRows.push({
        label: "ST",
        index: pointIndex,
        timestamp,
        formattedTime,
        teamLabel: "-",
        scorer: "-",
        assist: "-",
        description: "Stoppage",
        gap,
        variant: "stoppage",
      });
      previousTime = timestamp;
      continue;
    }
    if (code === MATCH_LOG_EVENT_CODES.STOPPAGE_END && pendingBands.stoppage) {
      bands.push({ type: "stoppage", start: pendingBands.stoppage, end: timestamp });
      pendingBands.stoppage = null;
      pushSnapshot(timestamp);
      previousTime = timestamp;
      continue;
    }
    if (code === MATCH_LOG_EVENT_CODES.HALFTIME_START) {
      pendingBands.halftime = timestamp;
      pushSnapshot(timestamp);
      logRows.push({
        label: "HT",
        index: pointIndex,
        timestamp,
        formattedTime,
        teamLabel: "-",
        scorer: "-",
        assist: "-",
        description: "Halftime",
        gap,
        variant: "halftime",
      });
      previousTime = timestamp;
      continue;
    }
    if (code === MATCH_LOG_EVENT_CODES.HALFTIME_END && pendingBands.halftime) {
      bands.push({ type: "halftime", start: pendingBands.halftime, end: timestamp });
      pendingBands.halftime = null;
      pushSnapshot(timestamp);
      previousTime = timestamp;
      continue;
    }
  }

  Object.entries(pendingBands).forEach(([type, start]) => {
    if (start) {
      bands.push({
        type,
        start,
        end: timestamps[timestamps.length - 1] || start + 60_000,
      });
    }
  });

  const defaultStart = Number.isFinite(timelineStart)
    ? timelineStart
    : timestamps.length > 0
      ? Math.min(...timestamps)
      : toClockMs(new Date().toISOString());

  let defaultEnd = Number.isFinite(timelineEnd)
    ? timelineEnd
    : timestamps.length > 0
      ? Math.max(...timestamps)
      : defaultStart + 5 * 60_000;

  if (defaultEnd <= defaultStart) {
    defaultEnd = defaultStart + 5 * 60_000;
  }

  const axisStart = Number.isFinite(matchStartEventTime) ? matchStartEventTime : defaultStart;
  let axisEnd = Number.isFinite(matchEndEventTime) ? matchEndEventTime : defaultEnd;
  if (axisEnd <= axisStart) {
    axisEnd = axisStart + 5 * 60_000;
  }

  if (!snapshots.some((snap) => snap.time === axisStart)) {
    snapshots.unshift({ time: axisStart, scoreA: 0, scoreB: 0 });
    timestamps.push(axisStart);
  }
  if (!snapshots.some((snap) => snap.time === axisEnd)) {
    snapshots.push({ time: axisEnd, scoreA, scoreB });
    timestamps.push(axisEnd);
  }

  const boundedSnapshots = [...snapshots]
    .sort((a, b) => a.time - b.time)
    .filter((snap) => snap.time >= axisStart && snap.time <= axisEnd);

  const boundedScoringPoints = scoringPoints.filter(
    (point) => point.time >= axisStart && point.time <= axisEnd,
  );

  const boundedBands = bands
    .map((band) => {
      const start = Math.max(axisStart, band.start);
      const end = Math.min(axisEnd, band.end);
      if (!(Number.isFinite(start) && Number.isFinite(end))) {
        return null;
      }
      return start < end
        ? {
            ...band,
            start,
            end,
          }
        : null;
    })
    .filter(Boolean);

  const timeline = {
    minTime: axisStart,
    maxTime: axisEnd,
    maxScore: Math.max(scoreA, scoreB),
    series: {
      teamA: boundedSnapshots.map((snap) => ({ time: snap.time, score: snap.scoreA })),
      teamB: boundedSnapshots.map((snap) => ({ time: snap.time, score: snap.scoreB })),
    },
    scoringPoints: boundedScoringPoints,
    bands: boundedBands,
    timeTicks: buildTimeTicks(axisStart, axisEnd),
  };

  const mapToSortedList = (map) =>
    Array.from(map.entries())
      .map(([player, count]) => ({ player, count }))
      .sort((a, b) => b.count - a.count || a.player.localeCompare(b.player));

  const mapToConnections = (map) =>
    Array.from(map.entries())
      .map(([key, count]) => {
        const [assist, scorer] = key.split(":::");
        return { assist, scorer, count };
      })
      .sort((a, b) => b.count - a.count || a.assist.localeCompare(b.assist));

  const possessionTimeline = buildPossessionTimeline({
    turnovers,
    scoringPoints,
    axisStart,
    axisEnd,
    timeTicks: timeline.timeTicks,
    bands: boundedBands,
    startingTeamId: match.starting_team_id,
    teamAId,
    teamBId,
  });

  const matchInsights = buildMatchInsights({
    match,
    axisStart,
    axisEnd,
    scoringPoints,
    teamAName,
    teamBName,
    possessionTimeline,
    turnoverCount: turnovers.length,
    matchStartEventTime,
  });

  const summaries = {
    teamA: {
      goals: mapToSortedList(teamStats.teamA.goalCounts),
      assists: mapToSortedList(teamStats.teamA.assistCounts),
      turnovers: mapToSortedList(teamStats.teamA.turnoverCounts),
      connections: mapToConnections(teamStats.teamA.connectionCounts),
      production: { ...teamProduction.teamA },
    },
    teamB: {
      goals: mapToSortedList(teamStats.teamB.goalCounts),
      assists: mapToSortedList(teamStats.teamB.assistCounts),
      turnovers: mapToSortedList(teamStats.teamB.turnoverCounts),
      connections: mapToConnections(teamStats.teamB.connectionCounts),
      production: { ...teamProduction.teamB },
    },
  };

  return { timeline, possessionTimeline, logRows, summaries, insights: matchInsights };
}

function buildPossessionTimeline({
  turnovers,
  scoringPoints,
  axisStart,
  axisEnd,
  timeTicks,
  bands,
  startingTeamId,
  teamAId,
  teamBId,
}) {
  if (!Number.isFinite(axisStart) || !Number.isFinite(axisEnd) || axisEnd <= axisStart) {
    return null;
  }

  const scoreFlipTurnovers = (scoringPoints || [])
    .filter((point) => Number.isFinite(point.time))
    .map((point) => ({
      time: Math.min(Math.max(point.time, axisStart), axisEnd),
      team: point.team === "teamA" ? "teamB" : point.team === "teamB" ? "teamA" : null,
      source: "score",
    }))
    .filter((entry) => entry.team && entry.time >= axisStart && entry.time <= axisEnd);

  const normalizedTurnovers = (turnovers || [])
    .filter((entry) => Number.isFinite(entry.time))
    .map((entry) => ({
      ...entry,
      time: Math.min(Math.max(entry.time, axisStart), axisEnd),
      source: entry.source || "turnover",
    }))
    .filter((entry) => entry.time >= axisStart && entry.time <= axisEnd);

  const sortedTurnovers = [...normalizedTurnovers, ...scoreFlipTurnovers].sort(
    (a, b) => a.time - b.time,
  );

  const inferInitialTeam = () => {
    if (startingTeamId && startingTeamId === teamAId) return "teamB";
    if (startingTeamId && startingTeamId === teamBId) return "teamA";
    const firstTeam = sortedTurnovers[0]?.team;
    if (firstTeam === "teamA") return "teamB";
    if (firstTeam === "teamB") return "teamA";
    return null;
  };

  let currentTeam = inferInitialTeam();
  let cursor = axisStart;
  const segments = [];

  const pushSegment = (endTime, team) => {
    if (!Number.isFinite(endTime) || endTime <= cursor) return;
    segments.push({ start: cursor, end: endTime, team: team || null });
  };

  for (const turnover of sortedTurnovers) {
    pushSegment(turnover.time, currentTeam);
    currentTeam = turnover.team || null;
    cursor = turnover.time;
  }

  const interruptionBands = (bands || []).filter(
    (band) => band.type === "timeout" || band.type === "stoppage" || band.type === "halftime",
  );

  const applyBands = (baseSegments) => {
    if (!interruptionBands.length) return baseSegments;
    const output = [];
    for (const segment of baseSegments) {
      let pending = [segment];
      for (const band of interruptionBands) {
        const next = [];
        for (const piece of pending) {
          if (band.end <= piece.start || band.start >= piece.end) {
            next.push(piece);
            continue;
          }
          if (band.start > piece.start) {
            next.push({ ...piece, end: band.start });
          }
          const bandStart = Math.max(piece.start, band.start);
          const bandEnd = Math.min(piece.end, band.end);
          if (bandEnd > bandStart) {
            next.push({ start: bandStart, end: bandEnd, team: "band" });
          }
          if (band.end < piece.end) {
            next.push({ ...piece, start: band.end });
          }
        }
        pending = next;
      }
      output.push(...pending.filter((p) => p.end > p.start));
    }
    return output;
  };

  const cleanedSegments = applyBands(segments);
  const scoreMarkers = (scoringPoints || [])
    .filter((point) => Number.isFinite(point.time))
    .map((point) => ({
      ...point,
      time: Math.min(Math.max(point.time, axisStart), axisEnd),
    }))
    .filter((point) => point.time >= axisStart && point.time <= axisEnd);

  return {
    minTime: axisStart,
    maxTime: axisEnd,
    segments: cleanedSegments,
    turnovers: sortedTurnovers,
    scores: scoreMarkers,
    timeTicks: timeTicks || buildTimeTicks(axisStart, axisEnd),
  };
}

function buildTimeTicks(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [];
  }
  const intervalMs = 5 * 60000;
  const durationMs = end - start;
  const ticks = [];
  let offset = 0;

  while (offset <= durationMs) {
    const minutes = Math.round(offset / 60000);
    ticks.push({ value: start + offset, label: `${minutes}'` });
    offset += intervalMs;
  }

  const lastTick = ticks[ticks.length - 1];
  if (!lastTick || lastTick.value !== end) {
    const minutes = Math.round(durationMs / 60000);
    ticks.push({ value: end, label: `${minutes}'` });
  }

  return ticks;
}

function formatMatchLabel(match) {
  const teamA = match.team_a?.short_name || match.team_a?.name || "Team A";
  const teamB = match.team_b?.short_name || match.team_b?.name || "Team B";
  const kickoff = formatKickoff(match.start_time);
  return `${kickoff} – ${teamA} vs ${teamB}`;
}

function formatKickoff(timestamp) {
  if (!timestamp) return "TBD";
  return new Date(timestamp).toLocaleString([], {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatGap(diffMs) {
  if (!Number.isFinite(diffMs) || diffMs <= 0) return "0:00";
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function parseTimeParts(value) {
  if (!value) return null;
  const text = typeof value === "string" ? value : value?.toISOString?.();
  if (typeof text !== "string") return null;
  const match = text.match(/(?:T|\s)(\d{2}):(\d{2}):(\d{2})(\.(\d+))?/);
  if (!match) return null;
  const milliText = match[5] ? match[5].padEnd(3, "0").slice(0, 3) : "0";
  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
    seconds: Number(match[3]),
    milliseconds: Number(milliText),
  };
}

function formatTimeLabel(ms, includeSeconds = false) {
  if (!Number.isFinite(ms)) return "--:--";
  const hours = Math.floor(ms / 3600000) % 24;
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const base = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return includeSeconds ? `${base}:${String(seconds).padStart(2, "0")}` : base;
}

function formatDurationLong(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "--";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${String(hours).padStart(1, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatMatchDate(timestamp) {
  if (!timestamp) return "TBD";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function buildMatchInsights({
  match,
  axisStart,
  axisEnd,
  scoringPoints,
  teamAName,
  teamBName,
  possessionTimeline,
  turnoverCount,
  matchStartEventTime,
}) {
  if (!match) return null;
  const sortedPoints = [...scoringPoints].sort((a, b) => a.time - b.time);
  const firstPoint = sortedPoints[0]?.time ?? null;
  const lastPoint = sortedPoints[sortedPoints.length - 1]?.time ?? null;
  const duration = Number.isFinite(axisEnd) && Number.isFinite(axisStart) ? axisEnd - axisStart : null;
  const matchStartLabel = Number.isFinite(matchStartEventTime)
    ? formatTimeLabel(matchStartEventTime, true)
    : match.start_time
      ? new Date(match.start_time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : "--";

  const matchRows = [
    { label: "Match date", value: formatMatchDate(match.start_time) },
    { label: "Match start", value: matchStartLabel },
    { label: "First point", value: formatTimeLabel(firstPoint, true) },
    { label: "Last point", value: formatTimeLabel(lastPoint, true) },
    {
      label: "Match duration",
      value: (() => {
        const base = formatDurationLong(duration);
        const minutes = Number.isFinite(duration) ? Math.round(duration / 60000) : null;
        return Number.isFinite(minutes) ? `${base} (${minutes} min)` : base;
      })(),
    },
  ];

  const averageTempo = (() => {
    if (sortedPoints.length < 2 || !Number.isFinite(firstPoint) || !Number.isFinite(lastPoint)) return null;
    return (lastPoint - firstPoint) / (sortedPoints.length - 1);
  })();

  const teamAverageGap = (teamKey) => {
    const times = sortedPoints.filter((point) => point.team === teamKey).map((point) => point.time);
    if (times.length < 2) return null;
    let total = 0;
    for (let i = 1; i < times.length; i += 1) {
      total += times[i] - times[i - 1];
    }
    return total / (times.length - 1);
  };

  const teamAGap = teamAverageGap("teamA");
  const teamBGap = teamAverageGap("teamB");

  const formatMsShort = (ms) => (Number.isFinite(ms) && ms > 0 ? formatGap(ms) : "--");
  const formatRatio = (value, decimals = 2) =>
    Number.isFinite(value) && value >= 0 ? value.toFixed(decimals) : "--";
  const formatPercent = (value, decimals = 1) =>
    Number.isFinite(value) && value >= 0 ? `${value.toFixed(decimals)}%` : "--";

  const possessionMetrics = (() => {
    if (!turnoverCount || turnoverCount <= 0) return null;
    const segments = possessionTimeline?.segments || [];
    if (!segments.length) return null;
    const totals = { teamA: { duration: 0, count: 0 }, teamB: { duration: 0, count: 0 } };
    segments.forEach((segment) => {
      if (segment.team === "teamA" || segment.team === "teamB") {
        const span = segment.end - segment.start;
        if (span > 0) {
          totals[segment.team].duration += span;
          totals[segment.team].count += 1;
        }
      }
    });
    const totalDuration = totals.teamA.duration + totals.teamB.duration;
    return {
      averages: {
        teamA: totals.teamA.count > 0 ? totals.teamA.duration / totals.teamA.count : null,
        teamB: totals.teamB.count > 0 ? totals.teamB.duration / totals.teamB.count : null,
      },
      shares: {
        teamA: totalDuration > 0 ? (totals.teamA.duration / totalDuration) * 100 : null,
        teamB: totalDuration > 0 ? (totals.teamB.duration / totalDuration) * 100 : null,
      },
    };
  })();

  const avgTurnsPerPoint = (() => {
    const points = sortedPoints.length;
    if (!points || !Number.isFinite(turnoverCount) || turnoverCount <= 0) return null;
    return turnoverCount / points;
  })();

  const tempoRows = [
    { label: "Avg time per point", value: averageTempo ? formatGap(averageTempo) : "--" },
    { label: `${teamAName} scoring gap`, value: teamAGap ? formatGap(teamAGap) : "--" },
    { label: `${teamBName} scoring gap`, value: teamBGap ? formatGap(teamBGap) : "--" },
  ];

  if (possessionMetrics?.averages) {
    tempoRows.push(
      {
        label: `${teamAName} avg possession`,
        value: formatMsShort(possessionMetrics.averages.teamA),
      },
      {
        label: `${teamBName} avg possession`,
        value: formatMsShort(possessionMetrics.averages.teamB),
      },
    );
  }

  if (possessionMetrics?.shares) {
    tempoRows.push(
      {
        label: `${teamAName} possession %`,
        value: formatPercent(possessionMetrics.shares.teamA),
      },
      {
        label: `${teamBName} possession %`,
        value: formatPercent(possessionMetrics.shares.teamB),
      },
    );
  }

  if (turnoverCount > 0 && Number.isFinite(avgTurnsPerPoint)) {
    tempoRows.push({ label: "Avg turns per point", value: formatRatio(avgTurnsPerPoint) });
  }

  return { match: matchRows, tempo: tempoRows };
}
