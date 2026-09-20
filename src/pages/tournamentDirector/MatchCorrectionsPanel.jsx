import { useCallback, useEffect, useMemo, useState } from "react";
import usePersistentState from "../../hooks/usePersistentState";
import useAccessScope from "../../hooks/useAccessScope";
import { Card, Panel, SectionHeader, Chip } from "../../components/ui/primitives";
import { MATCH_CORRECTIONS_ACCESS_PERMISSIONS } from "../../utils/accessControl";
import { getMatchesByEvent } from "../../services/matchService";
import {
  getMatchLogs,
  getMatchEventDefinitions,
  MATCH_LOG_EVENT_CODES,
} from "../../services/matchLogService";
import { getPlayersByTeam, getPlayersByIds } from "../../services/playerService";
import {
  deriveMatchLogs,
  buildNameLookup,
  buildEventCodeMap,
  buildPointLogRows,
} from "../../services/matchLogDerivation";
import {
  analyseMatchLogs,
  summariseFindings,
  buildChecklist,
  SEVERITY,
} from "../../services/matchCorrectionChecks";
import {
  applyLogInsert,
  applyLogUpdate,
  applyLogDelete,
  recomputeAndPublishScore,
  invalidateAfterCorrection,
  computeInsertTimestamp,
} from "../../services/matchCorrectionsService";
import {
  TOURNAMENT_DIRECTOR_SELECTED_EVENT_KEY,
  TOURNAMENT_DIRECTOR_CORRECTIONS_MATCH_KEY,
} from "./persistenceKeys";
import MatchCorrectionEditor from "./MatchCorrectionEditor";

const LIGHT_INPUT_CLASS =
  "rounded-lg border border-[var(--sc-surface-light-border)] bg-white px-3 py-1.5 text-sm text-[var(--sc-surface-light-ink)] shadow-sm focus:border-[var(--sc-border-strong)] focus:outline-none";

// Corrections are usually made after the fact, so the finished matches the
// scorekeeper hides are exactly the ones wanted here. The service default of 24
// would silently truncate a tournament's fixture list.
const MATCH_FETCH_LIMIT = 500;

const SEVERITY_STYLES = {
  [SEVERITY.ERROR]: "border-rose-200 bg-rose-50 text-rose-700",
  [SEVERITY.WARNING]: "border-amber-200 bg-amber-50 text-amber-800",
  [SEVERITY.INFO]: "border-sky-200 bg-sky-50 text-sky-800",
};

function formatClock(timestamp) {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return "--:--";
  return new Date(parsed).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function describeMatch(match) {
  const teamA = match.team_a?.short_name || match.team_a?.name || "TBC";
  const teamB = match.team_b?.short_name || match.team_b?.name || "TBC";
  const status = match.status || "unknown";
  return `${status} · ${teamA} ${match.score_a ?? 0} – ${match.score_b ?? 0} ${teamB}`;
}

// Row tints copied from PointLogTable in MatchesPage. `turnoverA`/`turnoverB`
// share the same neutral fill there, so both map to one class here.
const VARIANT_ROW_CLASS = {
  timeout: "bg-[#95df88]",
  stoppage: "bg-[#fd5050]",
  halftime: "bg-[#269828]",
  callahan: "bg-[#facc15]",
  goalA: "bg-[#3b82f6]",
  goalB: "bg-[#fb923c]",
  turnoverA: "bg-[#eceff3]",
  turnoverB: "bg-[#eceff3]",
  turnover: "bg-[#eceff3]",
};

// Mirrors getEventSymbol in MatchesPage, which decides from the row's
// description rather than the raw code (so "Block" gets its own icon).
function eventSymbol(row) {
  const description = (row.description || "").toLowerCase();
  if (row.log?.eventTypeId === 11) return "♻️";
  if (description.includes("block")) return "🛡️";
  if (description.includes("turnover")) return "🗑️";
  if (description.includes("match start")) return "▶️";
  if (description.includes("match end")) return "🏁";
  if (description.includes("timeout")) return "⏸️";
  if (description.includes("halftime")) return "⏱️";
  if (description.includes("stoppage")) return "⛔";
  if (row.variant === "callahan") return "+1 🤩";
  if (row.variant === "goalA" || row.variant === "goalB" || description.includes("score")) {
    return "+1";
  }
  return "•";
}

// MatchesPage renders these descriptions as a centred label instead of the
// "assist → scorer" pair.
const LABEL_ONLY_DESCRIPTIONS = new Set([
  "Timeout",
  "Halftime",
  "Match start",
  "Stoppage",
]);

function rendersAsLabel(row) {
  return (
    LABEL_ONLY_DESCRIPTIONS.has(row.description) ||
    row.variant?.startsWith("turnover") ||
    !row.isScore
  );
}

// Icon buttons, matching the pencil/trash glyphs used for match edit/delete in
// TournamentOverviewPanel — corrections gets a plus for "insert after" to match.
function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <path
        d="M4 14.5V16h1.5l8.85-8.85-1.5-1.5L4 14.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m12.4 4.6 1-1a1.4 1.4 0 0 1 2 2l-1 1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InsertIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

const ICON_BUTTON_CLASS =
  "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--sc-surface-light-border)] bg-white text-[var(--sc-surface-light-ink)] shadow-sm transition hover:bg-[#edf7f0] focus:outline-none focus:ring-2 focus:ring-[#0a3d29]/40 disabled:cursor-not-allowed disabled:opacity-40";
const DELETE_ICON_BUTTON_CLASS =
  "inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-700 bg-red-600 text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-40";

export default function MatchCorrectionsPanel({ eventsList = [], eventsReady = true }) {
  // Match-write permissions, not the broad TD bundle: this panel is reachable by
  // field assistants through /match-corrections, and scoping them by the TD
  // permission set would hand them an empty event list.
  const { filterEvents, ready: accessReady } = useAccessScope(
    MATCH_CORRECTIONS_ACCESS_PERMISSIONS,
  );
  const [selectedEventId, setSelectedEventId] = usePersistentState(
    TOURNAMENT_DIRECTOR_SELECTED_EVENT_KEY,
    "",
  );
  const [selectedMatchId, setSelectedMatchId] = usePersistentState(
    TOURNAMENT_DIRECTOR_CORRECTIONS_MATCH_KEY,
    "",
  );

  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [logRows, setLogRows] = useState([]);
  const [rosters, setRosters] = useState({ teamA: [], teamB: [] });
  const [eventDefinitions, setEventDefinitions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editorState, setEditorState] = useState(null);
  const [highlightedLogId, setHighlightedLogId] = useState("");
  // A live match is being written by a scorekeeper console right now; editing the
  // same rows from here would fight it. Opt in explicitly instead.
  const [allowLiveEdit, setAllowLiveEdit] = useState(false);

  const accessibleEvents = useMemo(() => filterEvents(eventsList), [filterEvents, eventsList]);
  const eventOptionsReady = eventsReady && accessReady;

  useEffect(() => {
    if (!eventOptionsReady) {
      return;
    }

    if (!accessibleEvents.length) {
      if (selectedEventId) {
        setSelectedEventId("");
      }
      return;
    }

    if (!selectedEventId || !accessibleEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(accessibleEvents[0].id);
    }
  }, [accessibleEvents, eventOptionsReady, selectedEventId, setSelectedEventId]);

  const selectedEvent = useMemo(
    () => accessibleEvents.find((event) => event.id === selectedEventId) || null,
    [accessibleEvents, selectedEventId],
  );

  // Event type definitions are needed to resolve codes and to fill the type
  // dropdown. Loaded once; the service caches to localStorage behind us.
  useEffect(() => {
    let active = true;
    getMatchEventDefinitions()
      .then((definitions) => {
        if (active) setEventDefinitions(definitions ?? []);
      })
      .catch(() => {
        if (active) setEventDefinitions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const eventCodeById = useMemo(() => buildEventCodeMap(eventDefinitions), [eventDefinitions]);

  // ------------------------------------------------------------------ matches

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!eventOptionsReady) return;
      if (!selectedEventId || !selectedEvent) {
        setMatches([]);
        return;
      }

      setMatchesLoading(true);
      setError("");
      try {
        const rows = await getMatchesByEvent(selectedEventId, MATCH_FETCH_LIMIT, {
          includeFinished: true,
          forceRefresh: true,
        });
        if (!active) return;
        setMatches(Array.isArray(rows) ? rows : []);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load matches.");
        setMatches([]);
      } finally {
        if (active) setMatchesLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [eventOptionsReady, selectedEvent, selectedEventId]);

  // Keep the persisted match valid for the chosen event.
  useEffect(() => {
    if (matchesLoading) return;
    if (!matches.length) {
      if (selectedMatchId) setSelectedMatchId("");
      return;
    }
    if (!selectedMatchId || !matches.some((match) => match.id === selectedMatchId)) {
      setSelectedMatchId(matches[0].id);
    }
  }, [matches, matchesLoading, selectedMatchId, setSelectedMatchId]);

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedMatchId) || null,
    [matches, selectedMatchId],
  );

  const teamAId = selectedMatch?.team_a?.id ?? null;
  const teamBId = selectedMatch?.team_b?.id ?? null;

  // --------------------------------------------------------------- log + roster

  const loadLogs = useCallback(
    async (isActive = () => true) => {
      if (!selectedMatchId || !selectedMatch) {
        setLogRows([]);
        setRosters({ teamA: [], teamB: [] });
        return;
      }

      setLoading(true);
      setError("");
      try {
        const [rows, rosterA, rosterB] = await Promise.all([
          getMatchLogs(selectedMatchId),
          teamAId ? getPlayersByTeam(teamAId, selectedEventId) : Promise.resolve([]),
          teamBId ? getPlayersByTeam(teamBId, selectedEventId) : Promise.resolve([]),
        ]);
        if (!isActive()) return;

        // Logs can reference players who have since left the roster. Without
        // folding them in, opening the editor on such a row would show an empty
        // scorer and silently clear it on save.
        const rosterIds = new Set([...rosterA, ...rosterB].map((player) => player.id));
        const strayIds = Array.from(
          new Set(
            rows
              .flatMap((row) => [row.actor_id, row.secondary_actor_id])
              .filter((id) => id && !rosterIds.has(id)),
          ),
        );
        let strays = [];
        if (strayIds.length) {
          strays = await getPlayersByIds(strayIds).catch(() => []);
          if (!isActive()) return;
        }

        setLogRows(rows);
        setRosters({
          teamA: rosterA,
          teamB: rosterB,
          strays: strays.map((player) => ({ id: player.id, name: player.name })),
        });
      } catch (err) {
        if (!isActive()) return;
        setError(err instanceof Error ? err.message : "Unable to load match logs.");
        setLogRows([]);
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [selectedEventId, selectedMatch, selectedMatchId, teamAId, teamBId],
  );

  useEffect(() => {
    let active = true;
    loadLogs(() => active);
    return () => {
      active = false;
    };
  }, [loadLogs]);

  // ------------------------------------------------------------ derive + check

  const nameLookup = useMemo(
    () => buildNameLookup(rosters.teamA ?? [], rosters.teamB ?? [], rosters.strays ?? []),
    [rosters],
  );

  const derived = useMemo(
    () => deriveMatchLogs(logRows, { teamAId, teamBId, nameLookup, eventCodeById }),
    [logRows, teamAId, teamBId, nameLookup, eventCodeById],
  );

  const findings = useMemo(() => {
    if (!selectedMatch) return [];
    return analyseMatchLogs({
      match: selectedMatch,
      logs: logRows,
      derived,
      eventRules: selectedEvent?.rules ?? null,
      rosters,
      eventCodeById,
    });
  }, [selectedMatch, logRows, derived, selectedEvent, rosters, eventCodeById]);

  const summary = useMemo(() => summariseFindings(findings), [findings]);
  const checklist = useMemo(() => buildChecklist(findings), [findings]);

  // Render-ready rows replicating the matches page log (possession-aware turnover
  // attribution, labels, meta lines). Each row keeps its log id so it stays editable.
  const pointRows = useMemo(
    () => (selectedMatch ? buildPointLogRows(derived.logs, selectedMatch) : []),
    [derived.logs, selectedMatch],
  );

  const flaggedLogIds = useMemo(() => {
    const set = new Set();
    findings.forEach((finding) => (finding.logIds ?? []).forEach((id) => set.add(id)));
    return set;
  }, [findings]);

  const storedA = selectedMatch?.score_a ?? 0;
  const storedB = selectedMatch?.score_b ?? 0;
  const scoreMatches = storedA === derived.totals.a && storedB === derived.totals.b;

  const isLive = ["live", "halftime"].includes(String(selectedMatch?.status || "").toLowerCase());
  const editingLocked = isLive && !allowLiveEdit;

  const correctionContext = useMemo(
    () => ({
      matchId: selectedMatchId,
      eventId: selectedEventId,
      teamAId,
      teamBId,
      eventCodeById,
    }),
    [selectedMatchId, selectedEventId, teamAId, teamBId, eventCodeById],
  );

  // ------------------------------------------------------------------ mutating

  const runCorrection = useCallback(
    async (operation, successMessage) => {
      setSaving(true);
      setError("");
      setNotice("");
      try {
        const result = await operation();
        if (result?.auditError) {
          setNotice(`${successMessage} (audit entry not recorded: ${result.auditError})`);
        } else {
          setNotice(successMessage);
        }
        // Pull the match back so the published score shown here reflects the write.
        const rows = await getMatchesByEvent(selectedEventId, MATCH_FETCH_LIMIT, {
          includeFinished: true,
          forceRefresh: true,
        });
        setMatches(Array.isArray(rows) ? rows : []);
        await loadLogs();
      } catch (err) {
        setError(err instanceof Error ? err.message : "The correction could not be applied.");
      } finally {
        setSaving(false);
      }
    },
    [loadLogs, selectedEventId],
  );

  const handleApplyDerivedScore = () =>
    runCorrection(async () => {
      const result = await recomputeAndPublishScore(correctionContext);
      invalidateAfterCorrection(correctionContext);
      return result;
    }, "Published score reconciled to the log.");

  const handleDelete = (log) => {
    const label = `${log.eventDescription}${log.scorerName ? ` by ${log.scorerName}` : ""}`;
    if (!window.confirm(`Delete this entry?\n\n${label} at ${formatClock(log.timestamp)}`)) {
      return;
    }
    const reason = window.prompt("Reason for this correction (recorded in the audit log):", "");
    if (reason === null) return;
    runCorrection(
      () => applyLogDelete(correctionContext, log.id, { before: log, reason }),
      "Entry deleted and score republished.",
    );
  };

  const handleEditorSubmit = (payload) => {
    const { mode, reason } = payload;
    if (mode === "edit") {
      return runCorrection(
        () =>
          applyLogUpdate(correctionContext, payload.logId, payload.updates, {
            before: payload.before,
            reason,
          }),
        "Entry updated and score republished.",
      ).then(() => setEditorState(null));
    }
    return runCorrection(
      () => applyLogInsert(correctionContext, payload.input, { reason }),
      "Entry inserted and score republished.",
    ).then(() => setEditorState(null));
  };

  const openInsertEditor = (anchorLog) => {
    const ordered = derived.logs;
    const anchorIndex = anchorLog ? ordered.findIndex((log) => log.id === anchorLog.id) : -1;
    const next = anchorIndex >= 0 ? ordered[anchorIndex + 1] : ordered[0];
    const createdAt = computeInsertTimestamp(
      anchorLog?.timestamp ?? null,
      next?.timestamp ?? null,
      ordered.map((log) => log.timestamp),
    );
    setEditorState({
      mode: "insert",
      createdAt,
      // The time input must not let the operator drag the new entry past its
      // neighbours — that would silently reorder the log it is meant to slot into.
      minTime: anchorLog?.timestamp ?? null,
      maxTime: next?.timestamp ?? null,
      anchorLabel: anchorLog
        ? `after ${anchorLog.eventDescription} at ${formatClock(anchorLog.timestamp)}`
        : "at the start of the match",
    });
  };

  const openEditEditor = (log) => {
    const ordered = derived.logs;
    const index = ordered.findIndex((entry) => entry.id === log.id);
    const previous = index > 0 ? ordered[index - 1] : null;
    const next = index >= 0 ? ordered[index + 1] : null;
    setEditorState({
      mode: "edit",
      log,
      createdAt: log.timestamp,
      // Bounded by this entry's own neighbours so an edit can't jump it out of
      // its slot in the timeline — the log's order has no other record of it.
      minTime: previous?.timestamp ?? null,
      maxTime: next?.timestamp ?? null,
    });
  };

  const rosterOptions = useMemo(
    () => ({
      teamA: rosters.teamA ?? [],
      teamB: rosters.teamB ?? [],
      strays: rosters.strays ?? [],
    }),
    [rosters],
  );

  return (
    <div className="space-y-4">
      <Card variant="light" className="space-y-3 p-4 shadow-md shadow-[rgba(8,25,21,0.06)]">
        <SectionHeader
          title="Match corrections"
          description="Repair the point-by-point record. The log is the source of truth for player statistics, so the published score is republished from it after every change."
          action={
            <button
              type="button"
              onClick={() => loadLogs()}
              className="sc-button"
              disabled={loading || saving}
            >
              Reload log
            </button>
          }
        />

        {/* Event and match sit side by side from md up; stacked on phones. */}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">
              Event
            </p>
            <select
              value={selectedEventId}
              onChange={(event) => setSelectedEventId(event.target.value)}
              className={`${LIGHT_INPUT_CLASS} mt-2 w-full appearance-none`}
            >
              {!eventOptionsReady ? <option value="">Loading access...</option> : null}
              {eventOptionsReady && accessibleEvents.length === 0 ? (
                <option value="">No accessible events</option>
              ) : null}
              {accessibleEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">
              Match
            </p>
            <select
              value={selectedMatchId}
              onChange={(event) => setSelectedMatchId(event.target.value)}
              className={`${LIGHT_INPUT_CLASS} mt-2 w-full appearance-none`}
              disabled={matchesLoading || !matches.length}
            >
              {matchesLoading ? <option value="">Loading matches...</option> : null}
              {!matchesLoading && !matches.length ? (
                <option value="">No matches in this event</option>
              ) : null}
              {matches.map((match) => (
                <option key={match.id} value={match.id}>
                  {describeMatch(match)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <Panel variant="light" className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </Panel>
        ) : null}
        {notice ? (
          <Panel
            variant="light"
            className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            {notice}
          </Panel>
        ) : null}
      </Card>

      {selectedMatch ? (
        <>
          <Card variant="light" className="space-y-3 p-4 shadow-md shadow-[rgba(8,25,21,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Chip variant="ghost" className="text-xs text-[var(--sc-surface-light-ink)]/80">
                  {summary.errors} error{summary.errors === 1 ? "" : "s"}
                </Chip>
                <Chip variant="ghost" className="text-xs text-[var(--sc-surface-light-ink)]/80">
                  {summary.warnings} warning{summary.warnings === 1 ? "" : "s"}
                </Chip>
                <Chip variant="ghost" className="text-xs text-[var(--sc-surface-light-ink)]/80">
                  {derived.logs.length} log entries
                </Chip>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--sc-surface-light-ink)]/70">
                  Published {storedA}–{storedB} · From log {derived.totals.a}–{derived.totals.b}
                </span>
                {!scoreMatches ? (
                  <button
                    type="button"
                    onClick={handleApplyDerivedScore}
                    className="sc-button"
                    disabled={saving || editingLocked}
                  >
                    Apply log-derived score
                  </button>
                ) : null}
              </div>
            </div>

            {isLive ? (
              <Panel
                variant="light"
                className="flex flex-wrap items-center justify-between gap-2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
              >
                <span>
                  This match is {selectedMatch.status}. A scorekeeper console may be writing to it
                  right now — edits made here can be overwritten.
                </span>
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={allowLiveEdit}
                    onChange={(event) => setAllowLiveEdit(event.target.checked)}
                  />
                  Edit anyway
                </label>
              </Panel>
            ) : null}
          </Card>

          {/* Desktop puts the checklist beside the log so a director can read an
              issue and act on the offending row without scrolling between them.
              Below xl they stack, checklist first. */}
          <div className="grid gap-4 xl:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] xl:items-start">
            <Card
              variant="light"
              className="space-y-2 p-4 shadow-md shadow-[rgba(8,25,21,0.06)] xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">
                Detected issues
              </p>
              {loading ? (
                <p className="text-sm text-[var(--sc-surface-light-ink)]/80">Checking match log...</p>
              ) : (
                // Every check runs and gets a row, checked off when it raised nothing
                // — buildChecklist has already sorted failed checks to the top so a
                // director sees defects before wading past a page of checkmarks.
                <ul className="space-y-1.5">
                  {checklist.map((check) => (
                    <li key={check.key}>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span
                          aria-hidden="true"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                            check.passed
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {check.passed ? "✓" : "✗"}
                        </span>
                        <span className={check.passed ? "text-[var(--sc-surface-light-ink)]" : "text-rose-800"}>
                          {check.label}
                        </span>
                        {!check.passed ? (
                          <span className="text-xs font-normal text-[var(--sc-surface-light-ink)]/60">
                            ({check.findings.length})
                          </span>
                        ) : null}
                      </div>

                      {!check.passed ? (
                        // Indented under the group heading, most severe first
                        // (buildChecklist already sorted these).
                        <ul className="ml-7 mt-1 space-y-1.5 border-l border-[var(--sc-surface-light-border)] pl-3">
                          {check.findings.map((finding) => (
                            <li key={finding.id}>
                              <Panel
                                variant="light"
                                className={`border p-2.5 text-sm ${
                                  SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES[SEVERITY.INFO]
                                }`}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-semibold">{finding.title}</p>
                                    <p className="mt-1 text-xs opacity-90">{finding.detail}</p>
                                  </div>
                                  {finding.logIds?.length ? (
                                    <button
                                      type="button"
                                      className="sc-button shrink-0 text-xs"
                                      onClick={() => setHighlightedLogId(finding.logIds[0])}
                                    >
                                      Show {finding.logIds.length} entr
                                      {finding.logIds.length === 1 ? "y" : "ies"}
                                    </button>
                                  ) : null}
                                </div>
                              </Panel>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card variant="light" className="space-y-3 p-4 shadow-md shadow-[rgba(8,25,21,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">
                Match log
              </p>
              <button
                type="button"
                className="sc-button"
                onClick={() => openInsertEditor(null)}
                disabled={saving || editingLocked}
              >
                Add entry at start
              </button>
            </div>

            {!pointRows.length && !loading ? (
              <div className="sc-card-muted p-5 text-center text-sm text-ink-muted">
                No match events recorded yet.
              </div>
            ) : null}

            {/* Desktop: the full table, matching PointLogTable on the matches page
                with the correction columns added. Hidden on small screens, where a
                nine-column table would force horizontal scrolling to reach the
                action buttons. */}
            <div className="hidden w-full overflow-x-auto lg:block">
              <table className="w-full table-auto text-left text-xs text-black sm:text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
                    <th className="px-1 py-0.5 sm:px-2 sm:py-1.5">#</th>
                    <th className="px-1 py-0.5 sm:px-2 sm:py-1.5">Time</th>
                    <th className="px-1 py-0.5 text-center sm:px-2 sm:py-1.5">Event</th>
                    <th className="px-1 py-0.5 sm:px-2 sm:py-1.5">Team</th>
                    <th className="px-1 py-0.5 text-center sm:px-2 sm:py-1.5">Assist → Score</th>
                    <th className="px-1 py-0.5 text-center sm:px-2 sm:py-1.5">Score</th>
                    <th className="px-1 py-0.5 text-right sm:px-2 sm:py-1.5">Gap</th>
                    <th className="px-1 py-0.5 text-right sm:px-2 sm:py-1.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pointRows.map((row) => {
                    const flagged = flaggedLogIds.has(row.id);
                    const highlighted = highlightedLogId === row.id;
                    // Flagged/highlighted rows keep their event-type tint so colour
                    // still reads as "what kind of event"; the issue is marked with
                    // red side borders instead of overriding the fill.
                    const rowTint = VARIANT_ROW_CLASS[row.variant] || "";
                    const flagBorder = highlighted
                      ? "border-l-8 border-r-8 border-l-red-600 border-r-red-600 ring-2 ring-inset ring-amber-500"
                      : flagged
                        ? "border-l-8 border-r-8 border-l-red-600 border-r-red-600"
                        : "";
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-border last:border-none ${rowTint} ${flagBorder} ${
                          row.isBandEnd ? "opacity-60" : ""
                        }`}
                      >
                        <td className="px-1 py-0.5 text-black/70 sm:px-2 sm:py-1.5">{row.label}</td>
                        <td className="whitespace-nowrap px-1 py-0.5 text-black sm:px-2 sm:py-1.5">
                          {formatClock(row.timestamp)}
                        </td>
                        <td className="px-1 py-0.5 text-center text-base sm:px-2 sm:py-1.5">
                          <span aria-label={row.description || "Event"} title={row.description || "Event"}>
                            {eventSymbol(row)}
                          </span>
                        </td>
                        <td className="px-1 py-0.5 font-semibold text-black sm:px-2 sm:py-1.5">
                          {row.teamLabel === "Unassigned" ? (
                            <span className="text-rose-700">Unassigned</span>
                          ) : (
                            row.teamLabel
                          )}
                        </td>
                        <td className="px-1 py-0.5 text-center sm:px-2 sm:py-1.5">
                          {rendersAsLabel(row) ? (
                            <div className="text-center text-xs font-semibold text-black sm:text-sm">
                              <div>{row.description}</div>
                              {row.metaDetails ? (
                                <p className="text-[10px] font-normal text-black/70 sm:text-xs">
                                  {row.metaDetails}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <div className="grid auto-rows-min items-center gap-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-1.5">
                              <span className="text-[11px] text-black sm:text-right sm:text-sm">
                                {row.assist || "-"}
                              </span>
                              <span className="text-center text-[10px] font-semibold text-black sm:text-xs">
                                →
                              </span>
                              <span className="font-semibold text-black sm:text-left">
                                {row.scorer || "-"}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-1 py-0.5 text-center font-mono text-[11px] text-black sm:px-2 sm:py-1.5 sm:text-xs">
                          {row.isScore ? `${row.totalA}-${row.totalB}` : "-"}
                        </td>
                        <td className="px-1 py-0.5 text-right font-mono text-[11px] text-black sm:px-2 sm:py-1.5 sm:text-xs">
                          {row.gap}
                        </td>
                        <td className="px-1 py-0.5 sm:px-2 sm:py-1.5">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className={ICON_BUTTON_CLASS}
                              disabled={saving || editingLocked}
                              onClick={() => openEditEditor(row.log)}
                              aria-label="Edit entry"
                              title="Edit entry"
                            >
                              <EditIcon />
                            </button>
                            <button
                              type="button"
                              className={ICON_BUTTON_CLASS}
                              disabled={saving || editingLocked}
                              onClick={() => openInsertEditor(row.log)}
                              aria-label="Insert after"
                              title="Insert after"
                            >
                              <InsertIcon />
                            </button>
                            <button
                              type="button"
                              className={DELETE_ICON_BUTTON_CLASS}
                              disabled={saving || editingLocked}
                              onClick={() => handleDelete(row.log)}
                              aria-label="Delete entry"
                              title="Delete entry"
                            >
                              <DeleteIcon />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: one card per entry. Same tints and symbols, but stacked so
                the action buttons stay reachable without sideways scrolling. */}
            <ul className="space-y-2 lg:hidden">
              {pointRows.map((row) => {
                const flagged = flaggedLogIds.has(row.id);
                const highlighted = highlightedLogId === row.id;
                const tint = VARIANT_ROW_CLASS[row.variant] || "bg-white";
                const flagBorder = highlighted
                  ? "border-l-8 border-r-8 border-l-red-600 border-r-red-600 ring-2 ring-inset ring-amber-500"
                  : flagged
                    ? "border-l-8 border-r-8 border-l-red-600 border-r-red-600"
                    : "border border-[var(--sc-surface-light-border)]";
                return (
                  <li
                    key={row.id}
                    className={`rounded-lg p-3 text-black ${tint} ${flagBorder} ${
                      row.isBandEnd ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-base" aria-label={row.description} title={row.description}>
                          {eventSymbol(row)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {row.label !== "·" ? `${row.label} · ` : ""}
                            {row.description}
                          </p>
                          <p className="text-[11px] text-black/70">
                            {formatClock(row.timestamp)}
                            {row.teamLabel && row.teamLabel !== "-" ? ` · ${row.teamLabel}` : ""}
                            {row.gap !== "-" ? ` · +${row.gap}` : ""}
                          </p>
                        </div>
                      </div>
                      {row.isScore ? (
                        <span className="shrink-0 font-mono text-sm font-semibold">
                          {row.totalA}-{row.totalB}
                        </span>
                      ) : null}
                    </div>

                    {row.isScore && !rendersAsLabel(row) ? (
                      <p className="mt-2 text-xs">
                        <span>{row.assist || "-"}</span>
                        <span className="px-1 font-semibold">→</span>
                        <span className="font-semibold">{row.scorer || "-"}</span>
                      </p>
                    ) : row.metaDetails ? (
                      <p className="mt-2 text-[11px] text-black/70">{row.metaDetails}</p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        className={ICON_BUTTON_CLASS}
                        disabled={saving || editingLocked}
                        onClick={() => openEditEditor(row.log)}
                        aria-label="Edit entry"
                        title="Edit entry"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        className={ICON_BUTTON_CLASS}
                        disabled={saving || editingLocked}
                        onClick={() => openInsertEditor(row.log)}
                        aria-label="Insert after"
                        title="Insert after"
                      >
                        <InsertIcon />
                      </button>
                      <button
                        type="button"
                        className={DELETE_ICON_BUTTON_CLASS}
                        disabled={saving || editingLocked}
                        onClick={() => handleDelete(row.log)}
                        aria-label="Delete entry"
                        title="Delete entry"
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            </Card>
          </div>
        </>
      ) : null}

      {editorState ? (
        <MatchCorrectionEditor
          state={editorState}
          match={selectedMatch}
          rosters={rosterOptions}
          eventDefinitions={eventDefinitions}
          saving={saving}
          onCancel={() => setEditorState(null)}
          onSubmit={handleEditorSubmit}
        />
      ) : null}
    </div>
  );
}
