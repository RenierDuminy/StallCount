import { useEffect, useMemo, useState } from "react";
import { MATCH_LOG_EVENT_CODES, getMatchLogs } from "../services/matchLogService";
import { getMatchById, getRecentMatches } from "../services/matchService";

const SERIES_COLORS = {
  teamA: "#1d4ed8",
  teamB: "#b91c1c",
};

const BAND_COLORS = {
  timeout: "rgba(59, 130, 246, 0.1)",
  stoppage: "rgba(59, 130, 246, 0.18)",
  halftime: "rgba(16, 185, 129, 0.18)",
};

const MATCH_EVENT_ID_HINTS = {
  MATCH_START: 8,
  MATCH_END: 9,
};

export default function MatchesPage() {
  const [matches, setMatches] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchLoading, setMatchLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);
  const [matchLogs, setMatchLogs] = useState([]);

  useEffect(() => {
    let ignore = false;
    async function loadRecentMatches() {
      setMatchLoading(true);
      try {
        const recent = await getRecentMatches(24);
        if (!ignore) {
          setMatches(recent ?? []);
          if (!selectedMatchId && recent?.[0]?.id) {
            setSelectedMatchId(recent[0].id);
          }
        }
      } catch (err) {
        console.error("[MatchesPage] Failed to load matches", err);
      } finally {
        if (!ignore) {
          setMatchLoading(false);
        }
      }
    }
    loadRecentMatches();
    return () => {
      ignore = true;
    };
  }, [selectedMatchId]);

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
        const [match, logs] = await Promise.all([
          getMatchById(selectedMatchId),
          getMatchLogs(selectedMatchId),
        ]);
        if (!ignore) {
          setSelectedMatch(match);
          setMatchLogs(logs ?? []);
        }
      } catch (err) {
        if (!ignore) {
          setLogsError(err.message || "Unable to load match details.");
          setSelectedMatch(null);
          setMatchLogs([]);
        }
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

  const derived = useMemo(() => deriveMatchInsights(selectedMatch, matchLogs), [selectedMatch, matchLogs]);

  return (
    <div className="min-h-screen bg-[#f3f7f4] pb-16">
      <header className="border-b border-emerald-900/10 bg-[#072013] py-2 text-emerald-50 sm:py-4">
        <div className="sc-shell matches-compact-shell">
          <p className="text-l font-semibold uppercase tracking-wide text-emerald-300">Matches</p>
          <p className="mt-0.5 max-w-3xl text-sm text-emerald-100 sm:mt-1">
            Explore completed matches, view the scoring progression, and dig into a detailed point-by-point log.
          </p>
          <div className="mt-1.5 flex flex-col gap-1.5 md:flex-row md:items-center sm:mt-3 sm:gap-2.5">
            <label className="text-sm font-semibold">
              Select match
              <div className="relative mt-1 w-full md:w-96 sm:mt-1.5">
                <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/30 bg-white/10 blur-[1px]" aria-hidden="true" />
                <div className="pointer-events-none absolute inset-y-0 left-4 z-10 flex items-center text-[#0f5132]/70">
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8m-10 4h12m-9 4h6" />
                    <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="3" />
                  </svg>
                </div>
                <select
                  value={selectedMatchId}
                  disabled={matchLoading}
                  onChange={(event) => setSelectedMatchId(event.target.value)}
                  className="relative z-10 w-full appearance-none rounded-2xl border border-emerald-100/80 bg-white px-11 py-2.5 text-sm font-semibold text-[#052b1d] shadow-[0_10px_35px_rgba(5,32,19,0.12)] transition hover:border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200/70 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Pick a recent match...</option>
                  {matches.map((match) => (
                    <option key={match.id} value={match.id}>
                      {formatMatchLabel(match)}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 z-10 flex items-center text-[#0f5132]/70">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.117l3.71-3.886a.75.75 0 0 1 1.08 1.04l-4.24 4.44a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" />
                  </svg>
                </div>
              </div>
            </label>
            {selectedMatch && (
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-900/30 px-2.5 py-1.5 text-sm sm:px-3.5 sm:py-2.5">
                <p className="text-xs uppercase tracking-wide text-emerald-200">Current selection</p>
                <p className="font-semibold text-white">
                  {selectedMatch.team_a?.name} vs {selectedMatch.team_b?.name}
                </p>
                <p className="text-xs text-emerald-200">
                  Kickoff {formatKickoff(selectedMatch.start_time)} · Status {selectedMatch.status}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="sc-shell matches-compact-shell space-y-3 py-2 sm:space-y-6 sm:py-4">
        {logsError && (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{logsError}</p>
        )}
        {!selectedMatchId ? (
          <div className="rounded-3xl border border-dashed border-emerald-400/30 bg-white/70 px-3 py-4 text-center text-sm text-emerald-800 sm:px-5 sm:py-8">
            Choose a match to see the scoring timeline and full log.
          </div>
        ) : logsLoading || !derived ? (
          <div className="rounded-3xl border border-emerald-200 bg-white/90 px-3 py-4 text-center text-sm text-emerald-700 sm:px-5 sm:py-8">
            Loading match data…
          </div>
        ) : (
          <>
            {derived.insights && (
              <section className="rounded-3xl border border-emerald-200 bg-white p-3 shadow-sm sm:p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-l font-semibold uppercase tracking-wide text-emerald-800">
                      Match analytics
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <InsightTable title="Match insight" rows={derived.insights.match} />
                  <InsightTable title="Tempo insight" rows={derived.insights.tempo} />
                </div>
              </section>
            )}

            <section className="space-y-2 rounded-3xl border border-emerald-200 bg-white p-3 shadow-sm sm:space-y-3 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-2">
                <div>
                  <p className="text-l font-semibold uppercase tracking-wide text-emerald-800">Score progression</p>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-semibold sm:gap-3">
                  <span className="flex items-center gap-1 text-[#1d4ed8] sm:gap-1.5">
                    <span className="inline-block h-2 w-7 rounded-full bg-[#1d4ed8]" />
                    {selectedMatch?.team_a?.name || "Team A"}
                  </span>
                  <span className="flex items-center gap-1 text-[#b91c1c] sm:gap-1.5">
                    <span className="inline-block h-2 w-7 rounded-full bg-[#b91c1c]" />
                    {selectedMatch?.team_b?.name || "Team B"}
                  </span>
                </div>
              </div>
              <TimelineChart match={selectedMatch} timeline={derived.timeline} />
              <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500 sm:gap-2">
                <LegendSwatch color={BAND_COLORS.timeout} label="Timeout window" />
                <LegendSwatch color={BAND_COLORS.stoppage} label="Stoppage window" />
                <LegendSwatch color={BAND_COLORS.halftime} label="Halftime break" />
              </div>
            </section>

            {derived.summaries && (
              <section className="rounded-3xl border border-emerald-200 bg-white p-2.5 shadow-sm sm:p-5">
                <div className="mb-1.5 sm:mb-3">
                  <p className="text-l font-semibold uppercase tracking-wide text-emerald-800">
                    Team production
                  </p>
                </div>
                <div className="grid gap-1.5 lg:grid-cols-2 sm:gap-3">
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

            <section className="rounded-3xl border border-emerald-200 bg-white p-2.5 shadow-sm sm:p-5">
              <div className="mb-1.5 sm:mb-3">
                <p className="text-l font-semibold uppercase tracking-wide text-emerald-800">
                  Point-by-point log
                </p>
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
      <span className="inline-block h-4 w-6 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function InsightTable({ title, rows }) {
  if (!rows?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-emerald-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        No {title.toLowerCase()} available.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <table className="w-full text-sm text-slate-700">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-slate-100 text-sm">
              <td className="px-4 py-2 font-medium text-slate-500">{row.label}</td>
              <td className="px-4 py-2 text-right font-semibold text-slate-800">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineChart({ match, timeline }) {
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

  if (!match || !timeline) {
    return (
      <div className="rounded-2xl border border-dashed border-emerald-200 bg-slate-50 px-3 py-3.5 text-center text-sm text-slate-500 sm:px-5 sm:py-7">
        Timeline data unavailable.
      </div>
    );
  }

  const width = 900;
  const baseHeight = 320;
  const height = isMobile ? baseHeight * 1.5 : baseHeight;
  const padding = { top: 24, right: 48, bottom: 60, left: 54 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const yMax = Math.max(10, timeline.maxScore);

  const getX = (time) => {
    const ratio = (time - timeline.minTime) / (timeline.maxTime - timeline.minTime || 1);
    return padding.left + ratio * chartWidth;
  };

  const getY = (score) => {
    const ratio = score / (yMax || 1);
    return padding.top + (1 - ratio) * chartHeight;
  };

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

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
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
            <text x={padding.left - 10} y={y + 4} fontSize="11" textAnchor="end" fill="#475569">
              {index}
            </text>
          </g>
        );
      })}

      {timeline.timeTicks.map((tick) => {
        const x = getX(tick.value);
        const y = padding.top + chartHeight + 12;
        return (
          <g key={tick.value}>
            <text fontSize="11" fill="#475569" textAnchor="middle" dominantBaseline="middle" x={x} y={y}>
              {tick.label}
            </text>
            <line
              x1={x}
              x2={x}
              y1={padding.top + chartHeight}
              y2={padding.top + chartHeight + 6}
              stroke="#94a3b8"
              strokeWidth="1"
            />
          </g>
        );
      })}

  {renderLinePath(timeline.series.teamA, SERIES_COLORS.teamA)}
  {renderLinePath(timeline.series.teamB, SERIES_COLORS.teamB)}

  {timeline.scoringPoints.map((point) => (
    <circle
      key={`${point.team}-${point.time}`}
      cx={getX(point.time)}
      cy={getY(point.score)}
      r={4}
      fill={SERIES_COLORS[point.team]}
      stroke="white"
      strokeWidth="1.5"
    />
  ))}

      <text x={width / 2} y={20} textAnchor="middle" fontSize="16" fontWeight="600" fill="#0f172a">
        Score vs Time
      </text>
      <text x={width / 2} y={height - 8} textAnchor="middle" fontSize="12" fill="#475569">
        Minutes
      </text>
      <text
        x="14"
        y={height / 2}
        textAnchor="middle"
        fontSize="12"
        transform={`rotate(-90 14 ${height / 2})`}
        fill="#475569"
      >
        Score
      </text>
    </svg>
  );
}

function TeamOverviewCard({ title, stats }) {
  const goals = stats?.goals || [];
  const assists = stats?.assists || [];
  const connections = stats?.connections || [];

  const renderList = (label, rows, valueLabel) => {
    return (
      <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-inner">
        {rows.length ? (
          <table className="w-full text-left text-sm text-[#0b3825]">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="py-0.5 pr-2">Player</th>
                <th className="py-0.5 text-right">{valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row) => (
                <tr key={`${label}-${row.player}`} className="border-t border-slate-200 text-sm">
                  <td className="py-1 pr-2">{row.player}</td>
                  <td className="py-1 text-right font-semibold">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-0.5 text-xs text-slate-500 sm:mt-1.5">No {label.toLowerCase()} recorded.</p>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border-2 border-emerald-200 bg-white px-3 py-2.5 shadow-inner sm:px-5 sm:py-4">
      <h3 className="mb-1.5 text-lg font-semibold text-[#052b1d] sm:mb-2.5">{title}</h3>
      <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
        {renderList("Goals", goals, "Goal")}
        {renderList("Assists", assists, "Assist")}
      </div>
      <div className="mt-1.5 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-inner sm:mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Top connections</p>
        {connections.length ? (
          <table className="mt-1 w-full text-left text-sm text-[#0b3825] sm:mt-1.5">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="py-0.5 pr-2">Assist</th>
                <th className="py-0.5" />
                <th className="py-0.5 pr-2">Scorer</th>
                <th className="py-0.5 text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {connections.slice(0, 6).map((row) => (
                <tr key={`${row.assist}-${row.scorer}`} className="border-t border-slate-200 text-sm">
                  <td className="py-1 pr-2">{row.assist}</td>
                  <td className="py-1 text-center text-sm font-bold text-slate-500">→</td>
                  <td className="py-1 pr-2">{row.scorer}</td>
                  <td className="py-1 text-right font-semibold">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-1 text-xs text-slate-500 sm:mt-1.5">No assisted goals recorded.</p>
        )}
      </div>
    </div>
  );
}

function PointLogTable({ rows, teamAName, teamBName }) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-emerald-200 bg-slate-50 px-3 py-3.5 text-center text-sm text-slate-500 sm:px-5 sm:py-7">
        No match events recorded yet.
      </div>
    );
  }
  return (
    <div className="w-full overflow-x-auto px-0 sm:mx-0 sm:px-0">
      <table className="w-full table-auto text-left text-xs sm:text-sm text-[#0b3825]">
        <thead>
          <tr className="uppercase tracking-wide text-[11px] text-slate-500">
            <th className="px-1 py-0.5 sm:px-2 sm:py-1.5">#</th>
            <th className="px-1 py-0.5 sm:px-2 sm:py-1.5">Time</th>
            <th className="px-1 py-0.5 sm:px-2 sm:py-1.5">Team</th>
            <th className="px-1 py-0.5 sm:px-2 sm:py-1.5">Assist -&gt; Score</th>
            <th className="px-1 py-0.5 text-right sm:px-2 sm:py-1.5">Gap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.index}-${row.timestamp}`}
              className={`border-b border-slate-100 last:border-none ${
                row.variant === "timeout"
                  ? "bg-[#c7e5fb]"
                  : row.variant === "halftime"
                  ? "bg-[#c1f0d5]"
                  : row.variant === "callahan"
                  ? "bg-[#fef9c3]"
                  : row.variant === "goalA"
                  ? "bg-[#edf2ff]"
                  : row.variant === "goalB"
                  ? "bg-[#fff3e7]"
                  : ""
              }`}
            >
              <td className="px-1 py-0.5 font-semibold text-slate-500 sm:px-2 sm:py-1.5">{row.label}</td>
              <td className="px-1 py-0.5 whitespace-nowrap sm:px-2 sm:py-1.5">{row.formattedTime}</td>
              <td className="px-1 py-0.5 font-semibold sm:px-2 sm:py-1.5">{row.teamLabel}</td>
              <td className="px-1 py-0.5 sm:px-2 sm:py-1.5">
                {row.description === "Timeout" || row.description === "Halftime" || row.description === "Match start" ? (
                  <div className="text-center text-xs font-semibold text-slate-600 sm:text-sm">
                    {row.description}
                  </div>
                ) : (
                  <div className="grid auto-rows-min items-center gap-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-1.5">
                    <span className="text-slate-500 text-[11px] sm:text-sm sm:text-right">{row.assist || "-"}</span>
                    <span className="text-[10px] font-semibold text-slate-400 text-center sm:text-xs">-&gt;</span>
                    <span className="font-semibold text-[#052b1d]">{row.scorer || "-"}</span>
                  </div>
                )}
              </td>
              <td className="px-1 py-0.5 text-right font-mono text-[11px] text-slate-500 sm:px-2 sm:py-1.5 sm:text-xs">
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
    connectionCounts: new Map(),
  });
  const teamStats = {
    teamA: createStats(),
    teamB: createStats(),
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

  let scoreA = 0;
  let scoreB = 0;
  const snapshots = [];
  const scoringPoints = [];
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
      previousTime = matchEndEventTime;
      continue;
    }

    if (code === MATCH_LOG_EVENT_CODES.SCORE || code === MATCH_LOG_EVENT_CODES.CALAHAN) {
      const teamLabel = log.team_id === teamAId ? teamAName : teamBName;
      const teamKey =
        log.team_id === teamAId ? "teamA" : log.team_id === teamBId ? "teamB" : null;
      if (log.team_id === teamAId) {
        scoreA += 1;
        scoringPoints.push({ team: "teamA", time: timestamp, score: scoreA });
      } else if (log.team_id === teamBId) {
        scoreB += 1;
        scoringPoints.push({ team: "teamB", time: timestamp, score: scoreB });
      }
      const scorerName = log.scorer?.name ?? log.scorer_name ?? "N/A";
      let assistName = log.assist?.name ?? log.assist_name ?? "";
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
      previousTime = timestamp;
      pointIndex += 1;
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
        scorer: "—",
        assist: "—",
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
        teamLabel: "—",
        scorer: "—",
        assist: "—",
        description: "Stoppage",
        gap,
        variant: "timeout",
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
        teamLabel: "—",
        scorer: "—",
        assist: "—",
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

  const matchInsights = buildMatchInsights({
    match,
    axisStart,
    axisEnd,
    scoringPoints,
    teamAName,
    teamBName,
  });

  const summaries = {
    teamA: {
      goals: mapToSortedList(teamStats.teamA.goalCounts),
      assists: mapToSortedList(teamStats.teamA.assistCounts),
      connections: mapToConnections(teamStats.teamA.connectionCounts),
    },
    teamB: {
      goals: mapToSortedList(teamStats.teamB.goalCounts),
      assists: mapToSortedList(teamStats.teamB.assistCounts),
      connections: mapToConnections(teamStats.teamB.connectionCounts),
    },
  };

  return { timeline, logRows, summaries, insights: matchInsights };
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
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function buildMatchInsights({ match, axisStart, axisEnd, scoringPoints, teamAName, teamBName }) {
  if (!match) return null;
  const sortedPoints = [...scoringPoints].sort((a, b) => a.time - b.time);
  const firstPoint = sortedPoints[0]?.time ?? null;
  const lastPoint = sortedPoints[sortedPoints.length - 1]?.time ?? null;
  const duration = Number.isFinite(axisEnd) && Number.isFinite(axisStart) ? axisEnd - axisStart : null;

  const matchRows = [
    { label: "Match date", value: formatMatchDate(match.start_time) },
    { label: "Match duration", value: formatDurationLong(duration) },
    {
      label: "Match start",
      value: match.start_time ? new Date(match.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--",
    },
    { label: "First point", value: formatTimeLabel(firstPoint, true) },
    { label: "Last point", value: formatTimeLabel(lastPoint, true) },
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

  const tempoRows = [
    { label: "Avg time per point", value: averageTempo ? formatGap(averageTempo) : "--" },
    { label: `${teamAName} scoring gap`, value: teamAGap ? formatGap(teamAGap) : "--" },
    { label: `${teamBName} scoring gap`, value: teamBGap ? formatGap(teamBGap) : "--" },
  ];

  return { match: matchRows, tempo: tempoRows };
}




