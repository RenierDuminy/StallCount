import { useCallback, useMemo, useState } from "react";
import {
  SEASON_REPORT_FILES,
  buildSeasonReport,
  downloadCsv,
  rowsToCsv,
  seasonReportFilename,
} from "../services/seasonReportService";
import { describeError } from "../utils/errorMessages";
import { Card, Panel, SectionHeader, Chip } from "./ui/primitives";

const LIGHT_INPUT_CLASS =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm focus:border-border-strong focus:outline-none";

// Downloads fired in a tight loop get dropped by the browser — Chrome in
// particular silently discards all but the first few. A small gap between
// saves keeps all 22 landing in the downloads folder.
const DOWNLOAD_GAP_MS = 250;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Season report extraction — the app-side equivalent of running
 * scripts/seasonReportExtract.sql section by section in the Supabase SQL
 * editor. Pick an event, pull every related record, download the 22 CSVs.
 */
export default function SeasonReportPanel({ events = [] }) {
  const [eventId, setEventId] = useState("");
  const [report, setReport] = useState(null);
  const [reportEventId, setReportEventId] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [downloadingAll, setDownloadingAll] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === eventId) ?? null,
    [events, eventId],
  );

  // The loaded report belongs to whichever event was selected when Build ran.
  // If the dropdown has moved on since, the counts and downloads on screen are
  // for the old event — so they are hidden rather than shown mislabelled.
  const reportIsCurrent = Boolean(report) && reportEventId === eventId;

  const handleBuild = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError("");
    setProgress(null);
    setReport(null);
    try {
      const data = await buildSeasonReport(eventId, (done, total, label) =>
        setProgress({ done, total, label }),
      );
      setReport(data);
      setReportEventId(eventId);
    } catch (err) {
      setError(describeError(err, { action: "Build season report", technical: true }));
      setReport(null);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [eventId]);

  const handleDownloadOne = useCallback(
    (entry) => {
      if (!report) return;
      const csv = rowsToCsv(report[entry.key] ?? []);
      downloadCsv(seasonReportFilename(entry.file, selectedEvent?.name), csv);
    },
    [report, selectedEvent],
  );

  const handleDownloadAll = useCallback(async () => {
    if (!report) return;
    setDownloadingAll(true);
    try {
      for (const entry of SEASON_REPORT_FILES) {
        const csv = rowsToCsv(report[entry.key] ?? []);
        downloadCsv(seasonReportFilename(entry.file, selectedEvent?.name), csv);
        await wait(DOWNLOAD_GAP_MS);
      }
    } finally {
      setDownloadingAll(false);
    }
  }, [report, selectedEvent]);

  const totalRows = useMemo(() => {
    if (!report) return 0;
    return SEASON_REPORT_FILES.reduce(
      (sum, entry) => sum + (report[entry.key]?.length ?? 0),
      0,
    );
  }, [report]);

  return (
    <Card className="space-y-5 p-4 sm:p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
      <SectionHeader
        eyebrow="Season report"
        eyebrowVariant="tag"
        title="Export event data"
        description="Pick an event to pull every related record — matches, logs, rosters, spirit scores, brackets and the lookup tables — and download each as its own CSV."
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[260px] flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Event</p>
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
          >
            <option value="">Select an event</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleBuild}
          disabled={!eventId || loading}
          className="sc-button"
        >
          {loading ? "Building..." : "Build report"}
        </button>
        {reportIsCurrent && (
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloadingAll}
            className="sc-button"
          >
            {downloadingAll
              ? "Downloading..."
              : `Download all ${SEASON_REPORT_FILES.length}`}
          </button>
        )}
      </div>

      {loading && progress && (
        <Panel className="border border-border/70 bg-surface p-3 text-xs text-ink-muted">
          Loading {progress.label}... ({progress.done} of {progress.total})
        </Panel>
      )}

      {error && (
        <Panel className="flex flex-wrap items-center gap-3 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={handleBuild} className="ml-auto sc-button text-xs">
            Retry
          </button>
        </Panel>
      )}

      {report && !reportIsCurrent && (
        <Panel className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          The event selection changed. Build the report again to export
          {selectedEvent?.name ? ` ${selectedEvent.name}` : " the selected event"}.
        </Panel>
      )}

      {reportIsCurrent && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip variant="tag">{selectedEvent?.name ?? "Event"}</Chip>
            <Chip variant="ghost" className="text-xs text-ink-muted">
              {totalRows.toLocaleString()} rows across {SEASON_REPORT_FILES.length} files
            </Chip>
          </div>

          <div className="space-y-2">
            {SEASON_REPORT_FILES.map((entry) => {
              const count = report[entry.key]?.length ?? 0;
              return (
                <Panel
                  key={entry.key}
                  className="flex flex-wrap items-start gap-3 border border-border/70 bg-surface p-3"
                >
                  <div className="min-w-[240px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                        {entry.section}
                      </span>
                      <p className="text-sm font-semibold text-ink">{entry.label}</p>
                      <Chip variant="ghost" className="text-[11px] text-ink-muted">
                        {count.toLocaleString()} row{count === 1 ? "" : "s"}
                      </Chip>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">{entry.summary}</p>
                    <p className="mt-1 font-mono text-[11px] text-ink-muted">
                      {seasonReportFilename(entry.file, selectedEvent?.name)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadOne(entry)}
                    className="sc-button text-xs"
                  >
                    Download
                  </button>
                </Panel>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
