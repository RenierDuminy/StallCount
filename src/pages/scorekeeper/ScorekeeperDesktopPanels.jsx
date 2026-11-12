// PC-only panels for the scorekeeper console: both rosters with this match's
// per-player numbers, and a point-by-point summary. Everything here is derived
// from the console's `logs` (chronological), never stored, so a deleted or
// edited entry corrects the tables on the next render like the rest of the
// console.
// Derived numbers come from scorekeeperDesktopStats.js.

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return "--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const sortByJersey = (players) =>
  [...players].sort((a, b) => {
    const numA = Number.isFinite(Number(a?.jersey_number)) ? Number(a.jersey_number) : null;
    const numB = Number.isFinite(Number(b?.jersey_number)) ? Number(b.jersey_number) : null;
    if (numA !== null && numB !== null) return numA - numB;
    if (numA !== null) return -1;
    if (numB !== null) return 1;
    return (a?.name || "").localeCompare(b?.name || "");
  });

// Stat columns are told apart by vertical dividing lines, not colour.
const STAT_COLUMNS = [
  { key: "goals", label: "G", title: "Goals" },
  { key: "assists", label: "A", title: "Assists" },
  { key: "turnovers", label: "T", title: "Turnovers" },
  { key: "blocks", label: "B", title: "Blocks" },
];
const STAT_CELL = "border-l border-[#0f5132]/25 text-center";

function StatValue({ value }) {
  if (!value) {
    return <span className="text-slate-300" aria-label="0">·</span>;
  }
  return <span className="font-bold text-slate-900">{value}</span>;
}

export function DesktopRosterPanel({ teamName, players, stats, loading, error }) {
  const rows = sortByJersey((players || []).filter((player) => player?.id));
  const totals = rows.reduce(
    (acc, player) => {
      const row = stats.get(player.id);
      if (row) {
        acc.goals += row.goals;
        acc.assists += row.assists;
        acc.turnovers += row.turnovers;
        acc.blocks += row.blocks;
      }
      return acc;
    },
    { goals: 0, assists: 0, turnovers: 0, blocks: 0 },
  );

  return (
    <section className="rounded-3xl border border-[#0f5132]/40 bg-white p-2 text-[#0f5132]">
      <h3 className="border-b-2 border-[#0f5132]/30 pb-1 text-base font-semibold">{teamName}</h3>
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
      {loading ? (
        <p className="mt-2 text-xs">Loading roster...</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No players assigned.</p>
      ) : (
        <table className="mt-1 w-full table-fixed text-sm tabular-nums">
          <colgroup>
            <col className="w-6" />
            <col />
            {STAT_COLUMNS.map((column) => (
              <col key={column.key} className="w-7" />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b-2 border-[#0f5132]/30">
              <th className="py-1 text-left text-xs font-bold text-slate-600">#</th>
              <th className="py-1 text-left text-xs font-bold text-slate-600">Player</th>
              {STAT_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  title={column.title}
                  className={`py-1 text-xs font-extrabold uppercase text-slate-700 ${STAT_CELL}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((player) => {
              const row = stats.get(player.id);
              return (
                <tr key={player.id} className="border-t border-[#0f5132]/10 even:bg-slate-50">
                  <td className="py-1 font-extrabold">{player.jersey_number ?? "-"}</td>
                  <td className="truncate py-1 pr-1 text-slate-900" title={player.name || "Player"}>
                    {player.name || "Player"}
                  </td>
                  {STAT_COLUMNS.map((column) => (
                    <td key={column.key} className={`py-1 ${STAT_CELL}`}>
                      <StatValue value={row?.[column.key]} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#0f5132]/30 font-bold">
              <td className="py-1.5" colSpan={2}>Team total</td>
              {STAT_COLUMNS.map((column) => (
                <td key={column.key} className={`py-1.5 text-base text-slate-900 ${STAT_CELL}`}>
                  {totals[column.key]}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  );
}

export function PointSummaryPanel({ points, teamAShort, teamBShort }) {
  return (
    <section className="rounded-3xl border border-[#0f5132]/40 bg-white p-2 text-[#0f5132]">
      <h3 className="border-b-2 border-[#0f5132]/30 pb-1 text-base font-semibold">Point summary</h3>
      {points.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No points scored yet.</p>
      ) : (
        <table className="mt-1 w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1 text-left font-semibold">Pt</th>
              <th className="py-1 text-left font-semibold">Team</th>
              <th className="py-1 text-left font-semibold">Score</th>
              <th className="py-1 text-left font-semibold">Goal / assist</th>
              <th className="py-1 text-left font-semibold">Line</th>
              <th className="py-1 text-right font-semibold" title="Time since the previous point ended (includes stoppages)">
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) =>
              point.kind === "halftime" ? (
                <tr key={point.key} className="border-t border-[#0f5132]/10 bg-[#ecfdf3]">
                  <td className="py-1 text-center text-xs font-semibold uppercase tracking-wide" colSpan={6}>
                    Halftime
                  </td>
                </tr>
              ) : (
                <tr
                  key={point.key}
                  className={`border-t border-[#0f5132]/10 ${point.pending ? "opacity-60" : ""}`}
                >
                  <td className="py-1 pr-1">{point.number}</td>
                  <td className="py-1 pr-1 font-semibold">
                    {point.team === "A" ? teamAShort : point.team === "B" ? teamBShort : "?"}
                  </td>
                  <td className="py-1 pr-1 font-semibold text-slate-900">
                    {point.totalA}-{point.totalB}
                  </td>
                  <td className="py-1 pr-1 text-slate-900">
                    {point.scorerName || "Unassigned"}
                    {point.assistName ? <span className="text-slate-500"> / {point.assistName}</span> : null}
                  </td>
                  <td className="py-1 pr-1">{point.line || ""}</td>
                  <td className="py-1 text-right">{formatDuration(point.durationSeconds)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
