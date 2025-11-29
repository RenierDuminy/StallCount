import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useScoreKeeperDataV2 } from "./useScoreKeeperDataV2";

export default function ScoreKeeperViewV2() {
  const [primaryRunning, setPrimaryRunning] = useState(false);
  const [secondaryRunning, setSecondaryRunning] = useState(false);
  const [possession, setPossession] = useState("A");
  const {
    events,
    matches,
    logs,
    mappedLogs,
    selectedEventId,
    setSelectedEventId,
    selectedMatchId,
    setSelectedMatchId,
    eventsLoading,
    matchesLoading,
    logsLoading,
    eventsError,
    matchesError,
    logsError,
    activeMatch,
  } = useScoreKeeperDataV2();

  const derivedMatch = useMemo(() => {
    const emptyTeams = {
      A: { name: "", short: "", score: null },
      B: { name: "", short: "", score: null },
    };
    if (!activeMatch) {
      return { teams: emptyTeams, venue: "", kickoff: "", status: "" };
    }
    return {
      teams: {
        A: {
          name: activeMatch.team_a?.name || "",
          short: activeMatch.team_a?.short_name || "",
          score: Number.isFinite(activeMatch.score_a) ? activeMatch.score_a : null,
        },
        B: {
          name: activeMatch.team_b?.name || "",
          short: activeMatch.team_b?.short_name || "",
          score: Number.isFinite(activeMatch.score_b) ? activeMatch.score_b : null,
        },
      },
      venue: activeMatch.venue?.name || "",
      kickoff: activeMatch.start_time
        ? new Date(activeMatch.start_time).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
      status: activeMatch.status || "",
    };
  }, [activeMatch]);

  const logsToDisplay = mappedLogs || [];

  const logStyles = useMemo(
    () => ({
      "match-start": {
        bg: "bg-[#d4f5e1]",
        border: "border-[#16a34a]/60",
        label: "text-black",
      },
      "score-A": {
        bg: "bg-[#ffe8d3]",
        border: "border-[#f97316]/50",
        label: "text-black",
      },
      "score-B": {
        bg: "bg-[#dbeafe]",
        border: "border-[#2563eb]/50",
        label: "text-black",
      },
      "timeout-A": {
        bg: "bg-[#fef3c7]",
        border: "border-[#f59e0b]/60",
        label: "text-black",
      },
      "timeout-B": {
        bg: "bg-[#fef3c7]",
        border: "border-[#f59e0b]/60",
        label: "text-black",
      },
      "turnover-A": {
        bg: "bg-[#cffafe]",
        border: "border-[#06b6d4]/50",
        label: "text-black",
      },
      "turnover-B": {
        bg: "bg-[#cffafe]",
        border: "border-[#06b6d4]/50",
        label: "text-black",
      },
      "throwaway-A": {
        bg: "bg-[#ffe4e6]",
        border: "border-[#fb7185]/60",
        label: "text-black",
      },
      "throwaway-B": {
        bg: "bg-[#ffe4e6]",
        border: "border-[#fb7185]/60",
        label: "text-black",
      },
      "block-A": {
        bg: "bg-[#dcfce7]",
        border: "border-[#22c55e]/60",
        label: "text-black",
      },
      "block-B": {
        bg: "bg-[#dcfce7]",
        border: "border-[#22c55e]/60",
        label: "text-black",
      },
      halftime: {
        bg: "bg-[#e0e7ff]",
        border: "border-[#4338ca]/50",
        label: "text-black",
      },
      stoppage: {
        bg: "bg-[#fecdd3]",
        border: "border-[#ef4444]/60",
        label: "text-black",
      },
      "match-end": {
        bg: "bg-[#d1fae5]",
        border: "border-[#0f5132]/60",
        label: "text-black",
      },
    }),
    []
  );

  return (
    <div className="sc-shell w-full scorekeeper-compact text-black">
      <header className="compact-card w-full">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col leading-tight">
            <h1 className="text-xl font-semibold text-black">Score keeper console v2</h1>
            <p className="text-xs text-black">
              UI-only scaffold using existing scorekeeper styles.
            </p>
          </div>
          <Link to="/admin" className="compact-button is-ghost text-xs">
            Back to admin hub
          </Link>
        </div>
      </header>

      <main className="space-y-3 py-2">
        <section className="rounded-3xl border border-emerald-900/15 bg-white/90 p-2 shadow-card/60">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-slate-900">
                <span>{derivedMatch.teams.A.name || "-"}</span>
                <span className="text-base text-slate-400">vs</span>
                <span>{derivedMatch.teams.B.name || "-"}</span>
              </h2>
              <p className="text-sm text-slate-600">
                {[derivedMatch.kickoff, derivedMatch.venue, derivedMatch.status].filter(Boolean).join(" | ") || "-"}
              </p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-emerald-400 hover:text-emerald-800"
            >
              Adjust setup
            </button>
          </div>
        </section>

        <section className="space-y-2 rounded-3xl border border-[#0f5132]/30 bg-[#ecfdf3] p-3 text-[#0f5132] shadow-card/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#0f5132]/80">
                Match setup
              </p>
              <h3 className="text-lg font-semibold text-[#0f5132]">Pre-game controls</h3>
            </div>
            <button
              type="button"
              className="rounded-full bg-[#0f5132] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0a3b24]"
            >
              Save setup
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
              <span className="shrink-0">Event</span>
              <select
                value={selectedEventId || ""}
                onChange={(event) => setSelectedEventId(event.target.value || null)}
                className="flex-1 min-w-[160px] rounded-2xl border border-[#0f5132]/30 bg-white px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none"
              >
                <option value="">Select an event...</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
              <span className="shrink-0">Match</span>
              <select
                value={selectedMatchId || ""}
                onChange={(event) => setSelectedMatchId(event.target.value || null)}
                className="flex-1 min-w-[160px] rounded-2xl border border-[#0f5132]/30 bg-white px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none"
              >
                <option value="">Select a match...</option>
                {matches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {match.team_a?.name || "Team A"} vs {match.team_b?.name || "Team B"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
              <span className="shrink-0">Starting lineup</span>
              <input
                type="text"
                placeholder="Pulling team..."
                className="flex-1 min-w-[160px] rounded-2xl border border-[#0f5132]/30 bg-white px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none"
              />
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
              <span className="shrink-0">Duration (min)</span>
              <input
                type="number"
                min="1"
                value={90}
                readOnly
                className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-white px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none"
              />
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
              <span className="shrink-0">ABBA</span>
              <select className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-white px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none">
                <option>None</option>
                <option>Male</option>
                <option>Female</option>
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-2 rounded-3xl border border-emerald-900/15 bg-gradient-to-b from-white to-slate-50 p-2 shadow-lg">
          <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white/90 shadow-inner">
            <div className="grid gap-1.5 p-1.5 md:grid-cols-[1fr_auto] md:items-center">
              <div className="rounded-2xl p-1 text-center text-slate-800 min-w-0">
                <div className="flex w-full flex-col items-center rounded-2xl border border-slate-200 px-2.5 py-4 text-slate-900">
                  <p className="w-full min-w-0 text-[clamp(3rem,12vw,5.5rem)] font-semibold leading-none">
                    45:00
                  </p>
                  <p className="text-xs uppercase tracking-wide text-slate-700/80">Match clock</p>
                </div>
                <div className="mt-3 flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold">
                      Set Time (min):
                      <input
                        type="number"
                        min="1"
                        value={60}
                        readOnly
                        className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-center text-slate-800 outline-none"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setPrimaryRunning((prev) => !prev)}
                      className="w-24 rounded-full bg-[#1e3a8a] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#162e6a]"
                    >
                      {primaryRunning ? "Pause" : "Play"}
                    </button>
                  </div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Hold to reset</p>
                </div>
              </div>
            </div>
            <div className="grid gap-1.5 p-1.5 md:grid-cols-[1fr_auto] md:items-center">
              <div className="rounded-2xl p-1 text-center text-slate-800 min-w-0">
                <div className="flex w-full flex-col items-center rounded-2xl border border-slate-200 px-2.5 py-4 text-slate-900">
                  <p className="w-full min-w-0 text-[clamp(2.6rem,11vw,5rem)] font-semibold leading-none">
                    60
                  </p>
                  <p className="text-xs uppercase tracking-wide text-slate-700/80">Timeout</p>
                </div>
                <div className="mt-3 flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold">
                      Set Time (sec):
                      <input
                        type="number"
                        min="0"
                        value={60}
                        readOnly
                        className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-center text-slate-800 outline-none"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setSecondaryRunning((prev) => !prev)}
                      className="w-24 rounded-full bg-[#1e3a8a] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#162e6a]"
                    >
                      {secondaryRunning ? "Pause" : "Play"}
                    </button>
                    <button
                      type="button"
                      className="w-32 rounded-full bg-[#1e3a8a] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#162e6a]"
                    >
                      Discussion 1:00
                    </button>
                  </div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Hold to reset</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              className="w-full rounded-full bg-[#1e3a8a] px-3 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-[#162e6a]"
            >
              Additional time options
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-2 shadow-card/30">
          <div className="flex flex-col gap-1 text-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-xl font-semibold">Possession</h3>
            <p className="text-sm font-semibold">
              {possession === "A"
                ? `${derivedMatch.teams.A.short || "-"} control`
                : `${derivedMatch.teams.B.short || "-"} control`}
            </p>
          </div>
          <div className="mt-3 space-y-2">
            <div className="relative flex w-full items-stretch gap-1 rounded-2xl bg-[#b1b1b1] p-1 text-sm font-semibold text-slate-900">
              <button
                type="button"
                onClick={() => setPossession("A")}
                className={`flex-1 rounded-2xl px-3 py-3 text-center transition ${
                  possession === "A" ? "bg-[#0f5132] text-white shadow" : "bg-[#b1b1b1] text-slate-700"
                }`}
              >
                {derivedMatch.teams.A.short || "-"}
              </button>
              <button
                type="button"
                onClick={() => setPossession("B")}
                className={`flex-1 rounded-2xl px-3 py-3 text-center transition ${
                  possession === "B" ? "bg-[#0f5132] text-white shadow" : "bg-[#b1b1b1] text-slate-700"
                }`}
              >
                {derivedMatch.teams.B.short || "-"}
              </button>
            </div>
            <p className="text-center text-[11px] uppercase tracking-wide text-slate-500">
              Drag across to update possession
            </p>
          </div>
        </section>

        <section className="space-y-2 rounded-3xl border border-[#0f5132]/40 bg-white p-2 shadow-card/30">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
            <button
              type="button"
              className="w-full rounded-full bg-[#0f5132] px-3 py-2 text-center text-sm font-semibold text-white shadow-card transition hover:bg-[#0a3b24]"
            >
              Add score - {derivedMatch.teams.A.short || "-"}
            </button>
            <div className="px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#0f5132]/80">
              ABBA disabled
            </div>
            <button
              type="button"
              className="w-full rounded-full bg-[#0f5132] px-3 py-2 text-center text-sm font-semibold text-white shadow-card transition hover:bg-[#0a3b24]"
            >
              Add score - {derivedMatch.teams.B.short || "-"}
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] gap-1.5 rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-2 text-sm text-[#0f5132] shadow-inner">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-xl font-semibold shadow">
                {derivedMatch.teams.A.short || "-"}
              </span>
              <div>
                <p className="text-sm font-semibold">{derivedMatch.teams.A.name || "-"}</p>
                <p className="text-[11px] uppercase tracking-wide text-[#0f5132]/80">Pulling</p>
              </div>
            </div>
            <div className="px-2 text-center text-2xl font-semibold">
              {Number.isFinite(derivedMatch.teams.A.score) ? derivedMatch.teams.A.score : "-"} -{" "}
              {Number.isFinite(derivedMatch.teams.B.score) ? derivedMatch.teams.B.score : "-"}
            </div>
            <div className="flex items-center justify-end gap-2">
              <div className="text-right">
                <p className="text-sm font-semibold">{derivedMatch.teams.B.name || "-"}</p>
                <p className="text-[11px] uppercase tracking-wide text-[#0f5132]/80">Receiving</p>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-xl font-semibold shadow">
                {derivedMatch.teams.B.short || "-"}
              </span>
            </div>
          </div>
        </section>

        <section className="space-y-2 rounded-3xl border border-slate-200 bg-white p-3 shadow-card/40">
          <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-black">
                Match feed
              </p>
              <h3 className="text-lg font-semibold text-black">Live log</h3>
            </div>
          </header>

          <div className="space-y-2">
            {logsToDisplay.length === 0 && (
              <p className="text-sm font-semibold text-black">No match events loaded yet.</p>
            )}
            {logsToDisplay.slice().reverse().map((log) => {
              const styles = logStyles[log.type] || {
                bg: "bg-white/90",
                border: "border-[var(--sc-border)]",
                label: "text-black",
              };
              const alignClass =
                log.team === "A" ? "text-left" : log.team === "B" ? "text-right" : "text-center";
              const isScoreEvent = log.type === "score-A" || log.type === "score-B";
              const isMatchEnd = log.type === "match-end";
              const scoreLayout = isScoreEvent || isMatchEnd;
              return (
                <article
                  key={log.id}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm shadow-sm transition hover:shadow-md ${styles.bg} ${styles.border}`}
                >
                  <div className={`w-full ${alignClass}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-black">
                      {log.title || "Match event"}
                    </p>
                    {log.description && !scoreLayout && (
                      <p className="text-xs text-black">{log.description}</p>
                    )}
                  </div>

                  {scoreLayout && log.scoreLine ? (
                    <div className="mt-3 grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
                      {log.team === "A" ? (
                        <div className="text-left text-xs text-black">
                          <p className="font-semibold text-black">{derivedMatch.teams.A.name || "-"}</p>
                          <p className="font-semibold text-black">
                            Scorer: {log.scorer || "Unassigned"} -> Assist: {log.assist || "Unassigned"}
                          </p>
                        </div>
                      ) : (
                        <div />
                      )}

                      <p className="text-center text-lg font-semibold text-black">
                        {Number.isFinite(log.scoreLine.a) ? log.scoreLine.a : "-"} -{" "}
                        {Number.isFinite(log.scoreLine.b) ? log.scoreLine.b : "-"}
                      </p>

                      {log.team === "B" ? (
                        <div className="text-right text-xs text-black">
                          <p className="font-semibold text-black">{derivedMatch.teams.B.name || "-"}</p>
                          <p className="font-semibold text-black">
                            Scorer: {log.scorer || "Unassigned"} -> Assist: {log.assist || "Unassigned"}
                          </p>
                        </div>
                      ) : (
                        <div />
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="space-y-2 rounded-3xl border border-slate-200 bg-white p-3 shadow-card/20">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-black">Debug data</h3>
            {(eventsLoading || matchesLoading || logsLoading) && (
              <span className="text-xs font-semibold text-black">Loading...</span>
            )}
          </div>
          {eventsError && (
            <p className="text-xs font-semibold text-rose-600">Events error: {eventsError}</p>
          )}
          {matchesError && (
            <p className="text-xs font-semibold text-rose-600">Matches error: {matchesError}</p>
          )}
          {logsError && (
            <p className="text-xs font-semibold text-rose-600">Logs error: {logsError}</p>
          )}
          <div className="space-y-2 text-xs text-black">
            <div>
              <p className="font-semibold">Events</p>
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-2">
                {JSON.stringify(events, null, 2)}
              </pre>
            </div>
            <div>
              <p className="font-semibold">Matches</p>
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-2">
                {JSON.stringify(matches, null, 2)}
              </pre>
            </div>
            <div>
              <p className="font-semibold">Logs</p>
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-2">
                {JSON.stringify(logs, null, 2)}
              </pre>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}








