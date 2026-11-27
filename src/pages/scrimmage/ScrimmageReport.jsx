import { useEffect, useState } from "react";
import { MatchReportBody } from "../MatchesPage";
import { getScrimmageSnapshot, isScrimmageFinished, subscribeScrimmage } from "./scrimmageBackend";
import { downloadScrimmageMatchExport } from "./scrimmageMatchExport";

// The scrimmage's match report: the Matches page's match view (analytics,
// score progression, team overviews, point-by-point log) for the scrimmage on
// this device. There are no spirit scores. "Download PDF" prints this page;
// the print layout (A4) is the browser's own for now.

function formatStart(value) {
  if (!value) return "Start time not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Start time not set";
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ScrimmageReport({ onBack, backLabel = "Back to scrimmage" }) {
  const [snapshot, setSnapshot] = useState(() => getScrimmageSnapshot());
  useEffect(() => subscribeScrimmage(() => setSnapshot(getScrimmageSnapshot())), []);
  const { match, logs } = snapshot;
  const statusLabel = isScrimmageFinished(match) ? "Full time" : "In progress";

  return (
    <div className="scrimmage-report pb-16 text-ink">
      <header className="sc-shell matches-header-shell py-4 sm:py-6">
        <div className="sc-card-base space-y-3 p-5 sm:p-7">
          <div className="scrimmage-report-actions flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={onBack} className="sc-button is-ghost">
              {backLabel}
            </button>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadScrimmageMatchExport(snapshot)} className="sc-button is-ghost">
                Download match data
              </button>
              <button type="button" onClick={() => window.print()} className="sc-button">
                Download PDF
              </button>
            </div>
          </div>
          <div className="sc-card-muted p-4">
            <p className="font-semibold text-ink">
              {match.team_a?.name} {match.score_a ?? 0} – {match.score_b ?? 0} {match.team_b?.name}
            </p>
            <p className="text-xs text-ink-muted">
              {formatStart(match.start_time)} | {statusLabel}
            </p>
          </div>
        </div>
      </header>

      <main className="sc-shell matches-compact-shell space-y-3 py-2 sm:space-y-6 sm:py-4">
        {logs.length === 0 ? (
          <div className="sc-card-muted p-5 text-center text-sm text-ink-muted">
            Nothing has been logged in this scrimmage yet.
          </div>
        ) : (
          <MatchReportBody match={match} logs={logs} />
        )}
      </main>
    </div>
  );
}
