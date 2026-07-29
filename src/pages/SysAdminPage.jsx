import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getErrorLog,
  clearErrorLog,
  subscribeToErrorLog,
} from "../components/ErrorBoundary";
import { BUILD_SHA, BUILD_TIME, checkBuildFreshness } from "../services/buildInfo";
import { describeError } from "../utils/errorMessages";
import {
  getBaseTableName,
  deleteTableRowByFilters,
  deleteTableRow,
  insertTableRow,
  queryTableRows,
  queryTableRowsByFilters,
  queryTableRowsExact,
  updateTableRow,
} from "../services/adminService";
import { getAllTeams } from "../services/teamService";
import { getEventsList } from "../services/leagueService";
import {
  listForeignKeysByReferencedTable,
  listPrimaryKeyColumns,
  listSchemaTables,
  listTableColumns,
  pickRecencyColumn,
} from "../services/schemaService";
import { Card, Panel, SectionHeader, SectionShell, Chip } from "../components/ui/primitives";

const LIMIT_OPTIONS = [20, 50, 100, 200];
const LIGHT_INPUT_CLASS =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm focus:border-border-strong focus:outline-none";

function buildTemplate(tableName) {
  const columns = listTableColumns(tableName);
  if (!columns.length) return "{\n  \n}";
  const template = columns.reduce((acc, col) => ({ ...acc, [col]: null }), {});
  return JSON.stringify(template, null, 2);
}

function formatCell(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseJsonPayload(raw, onError) {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Payload must be a JSON object.");
    }
    return parsed;
  } catch (err) {
    onError(err instanceof Error ? err.message : "Invalid JSON payload.");
    return null;
  }
}

function formatVenueOptionLabel(venue) {
  if (!venue || typeof venue !== "object") return "Unnamed venue";
  const city = String(venue.city || "").trim();
  const location = String(venue.location || "").trim();
  const name = String(venue.name || "").trim();
  const parts = [city, location, name].filter(Boolean);
  if (parts.length === 0) return "Unnamed venue";
  return parts.join(" - ");
}

const SOURCE_LABELS = {
  render: "Render crash",
  "window.onerror": "Uncaught error",
  unhandledrejection: "Promise rejection",
};

function formatTimestamp(iso) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso || "";
  return parsed.toLocaleTimeString(undefined, { hour12: false });
}

// "Which build is this browser running, and is it the deployed one?" — a stale
// service worker serving old code looks identical to a bad deploy from the UI.
function BuildIdentityRow() {
  const [freshness, setFreshness] = useState(null);
  const [checking, setChecking] = useState(false);

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      setFreshness(await checkBuildFreshness());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const stale = freshness?.stale === true;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted">
      <span>
        Build <code className="font-mono text-ink">{BUILD_SHA}</code>
      </span>
      <span>built {formatTimestamp(BUILD_TIME)}</span>
      {stale && (
        <span className="font-semibold text-amber-700">
          Stale — server has {freshness.deployed}. Reload to update.
        </span>
      )}
      {freshness && !stale && <span className="text-emerald-700">Up to date</span>}
      {!freshness && !checking && <span>Deployed build unknown (offline?)</span>}
      <button type="button" onClick={runCheck} className="underline" disabled={checking}>
        {checking ? "Checking..." : "Re-check"}
      </button>
    </div>
  );
}

function ErrorLogEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(entry.stack || entry.errorStack);

  return (
    <div className="rounded-xl border border-rose-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-rose-800">
            {entry.name}
            {entry.count > 1 && (
              <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                ×{entry.count}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-rose-500">
            {SOURCE_LABELS[entry.source] ?? entry.source}
            {entry.route ? ` · ${entry.route}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-rose-400">
          {formatTimestamp(entry.timestamp)}
        </span>
      </div>
      <p className="mt-2 break-words text-xs text-rose-700">{entry.message}</p>
      {hasDetail && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="mt-2 text-[11px] font-semibold text-rose-600 underline"
          >
            {expanded ? "Hide details" : "Show details"}
          </button>
          {expanded && (
            <div className="mt-2 space-y-2">
              {entry.stack && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-400">
                    Component stack
                  </p>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-rose-50 p-2 text-[10px] text-rose-500">
                    {entry.stack.trim()}
                  </pre>
                </div>
              )}
              {entry.errorStack && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-400">
                    Error stack
                  </p>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-rose-50 p-2 text-[10px] text-rose-500">
                    {entry.errorStack.trim()}
                  </pre>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BrokenComponentsPanel() {
  const [log, setLog] = useState(() => [...getErrorLog()]);
  const [copied, setCopied] = useState(false);

  // The log mutates in place, so without a subscription the panel would only
  // ever show errors that happened before it mounted.
  useEffect(() => subscribeToErrorLog(setLog), []);

  const handleClear = () => {
    clearErrorLog();
    setCopied(false);
  };

  // Errors reset on reload, so there has to be a way to get them off the device
  // before that happens — e.g. into a bug report from a phone in the field.
  const handleCopy = async () => {
    const report = [
      `StallCount error report`,
      `Build: ${BUILD_SHA} (built ${BUILD_TIME})`,
      `User agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`,
      `Captured: ${log.length} error(s)`,
      "",
      ...log.map((entry, i) =>
        [
          `#${i + 1} [${SOURCE_LABELS[entry.source] ?? entry.source}] ${entry.name}` +
            (entry.count > 1 ? ` (x${entry.count})` : ""),
          `  when:  ${entry.timestamp}`,
          `  route: ${entry.route || "unknown"}`,
          `  error: ${entry.message}`,
          entry.errorStack ? `  stack:\n${entry.errorStack.trim()}` : "",
          entry.stack ? `  component stack:\n${entry.stack.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside secure contexts — fall back to the console
      // so the report is still retrievable.
      console.info(report);
      window.alert("Clipboard unavailable. Report written to the browser console.");
    }
  };

  if (log.length === 0) {
    return (
      <Panel className="space-y-2 border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
        <div className="flex items-center gap-3">
          <span className="text-base">✓</span>
          <span className="font-semibold">No errors recorded this session.</span>
          <span className="text-xs text-emerald-700">
            Watching render crashes, uncaught errors and promise rejections.
          </span>
        </div>
        <BuildIdentityRow />
      </Panel>
    );
  }

  return (
    <Panel className="space-y-4 border border-rose-200 bg-rose-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-rose-800">
            {log.length} error{log.length !== 1 ? "s" : ""} this session
          </p>
          <p className="text-xs text-rose-600">Errors reset on full page reload.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleCopy} className="sc-button text-xs">
            {copied ? "Copied" : "Copy report"}
          </button>
          <button type="button" onClick={handleClear} className="sc-button text-xs">
            Clear log
          </button>
        </div>
      </div>
      <BuildIdentityRow />
      <div className="space-y-3">
        {log.map((entry) => (
          <ErrorLogEntry key={entry.id} entry={entry} />
        ))}
      </div>
    </Panel>
  );
}

export default function SysAdminPage() {
  const tables = listSchemaTables();
  const [tableSearch, setTableSearch] = useState("");
  const [selectedTable, setSelectedTable] = useState(() => tables[0] || "");
  const [orderBy, setOrderBy] = useState(() => pickRecencyColumn(tables[0] || "") || null);
  const [limit, setLimit] = useState(50);
  const [filterColumn, setFilterColumn] = useState(() => {
    const firstTable = tables[0] || "";
    const cols = firstTable ? listTableColumns(firstTable) : [];
    return cols[0] || "";
  });
  const [filterValue, setFilterValue] = useState("");
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState("");
  const [referenceError, setReferenceError] = useState("");
  const [draftPayload, setDraftPayload] = useState(buildTemplate(tables[0] || ""));
  const [draftError, setDraftError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [selectedRow, setSelectedRow] = useState(null);
  const [editPayload, setEditPayload] = useState("");
  const [primaryKey, setPrimaryKey] = useState("id");
  const [teams, setTeams] = useState([]);
  const [eventsList, setEventsList] = useState([]);
  const [venues, setVenues] = useState([]);
  const [matchForm, setMatchForm] = useState({
    eventId: "",
    teamAId: "",
    teamBId: "",
    venueId: "",
    startTime: "",
    status: "scheduled",
  });
  const [matchMessage, setMatchMessage] = useState("");
  const [matchError, setMatchError] = useState("");
  const [matchSaving, setMatchSaving] = useState(false);
  const [deleteKeyValues, setDeleteKeyValues] = useState({});
  const [cascadePreview, setCascadePreview] = useState([]);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [cascadeError, setCascadeError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [targetRowPreview, setTargetRowPreview] = useState(null);
  const [targetRowCount, setTargetRowCount] = useState(null);
  const editTextareaRef = useRef(null);

  const columns = useMemo(() => listTableColumns(selectedTable), [selectedTable]);
  const primaryKeyColumns = useMemo(() => listPrimaryKeyColumns(selectedTable), [selectedTable]);
  const deleteKeyColumns = useMemo(() => {
    if (primaryKeyColumns.length) return primaryKeyColumns;
    const fromInput = (primaryKey || "")
      .split(",")
      .map((col) => col.trim())
      .filter(Boolean);
    return fromInput.length ? fromInput : ["id"];
  }, [primaryKey, primaryKeyColumns]);
  const selectedRowId =
    selectedRow && deleteKeyColumns.length === 1 ? selectedRow[deleteKeyColumns[0]] ?? "" : "";
  const deleteKeyEntries = useMemo(
    () =>
      deleteKeyColumns.map((column) => ({
        column,
        value: (deleteKeyValues?.[column] ?? "").toString().trim(),
      })),
    [deleteKeyColumns, deleteKeyValues],
  );
  const deleteKeysReady = deleteKeyEntries.every((entry) => entry.value);

  // Delete is the only irreversible action here. Block it whenever the operator
  // can't actually see what they're about to destroy: the target doesn't exist,
  // or the cascade preview failed to build.
  const deleteBlockReason = useMemo(() => {
    if (!deleteKeysReady) return "";
    if (cascadeLoading) return "Waiting for the cascade preview to finish.";
    if (cascadeError) return "Cascade preview failed — resolve it before deleting.";
    if (targetRowCount === 0) return "No record matches that key.";
    return "";
  }, [cascadeError, cascadeLoading, deleteKeysReady, targetRowCount]);
  const deleteBlocked = Boolean(deleteBlockReason);

  const filteredTables = useMemo(() => {
    if (!tableSearch.trim()) return tables;
    const q = tableSearch.toLowerCase();
    return tables.filter((t) => t.toLowerCase().includes(q));
  }, [tableSearch, tables]);
  const sortedVenues = useMemo(() => {
    if (!Array.isArray(venues) || venues.length === 0) return [];
    return [...venues].sort((a, b) =>
      formatVenueOptionLabel(a).localeCompare(formatVenueOptionLabel(b), undefined, {
        sensitivity: "base",
      }),
    );
  }, [venues]);

  useEffect(() => {
    const nextOrder = pickRecencyColumn(selectedTable);
    setOrderBy(nextOrder || null);
    const cols = listTableColumns(selectedTable);
    setFilterColumn(cols[0] || "");
    const pkCols = listPrimaryKeyColumns(selectedTable);
    const nextPrimaryKey = pkCols.length ? pkCols.join(", ") : cols.includes("id") ? "id" : cols[0] || "id";
    setPrimaryKey(nextPrimaryKey);
    setDraftPayload(buildTemplate(selectedTable));
    setSelectedRow(null);
    setEditPayload("");
    setActionMessage("");
    setDraftError("");
    setDeleteKeyValues(() => {
      const nextKeys = pkCols.length ? pkCols : nextPrimaryKey.split(",").map((col) => col.trim()).filter(Boolean);
      return nextKeys.reduce((acc, col) => ({ ...acc, [col]: "" }), {});
    });
    setCascadePreview([]);
    setCascadeError("");
    setDeleteMessage("");
    setDeleteConfirm(false);
    setTargetRowPreview(null);
    setTargetRowCount(null);
  }, [selectedTable]);

  const loadReferenceData = useCallback(async () => {
    setReferenceError("");
    // allSettled, not all: one failing lookup shouldn't blank the other two
    // dropdowns, and the operator should be told exactly which one is missing.
    const [teamResult, eventResult, venueResult] = await Promise.allSettled([
      getAllTeams(200),
      getEventsList(200),
      queryTableRows("venues", { limit: 200, orderBy: "name" }),
    ]);

    if (teamResult.status === "fulfilled") setTeams(teamResult.value ?? []);
    if (eventResult.status === "fulfilled") setEventsList(eventResult.value ?? []);
    if (venueResult.status === "fulfilled") {
      setVenues(Array.isArray(venueResult.value) ? venueResult.value : []);
    }

    const failures = [
      ["Teams", teamResult],
      ["Events", eventResult],
      ["Venues", venueResult],
    ].filter(([, result]) => result.status === "rejected");

    if (failures.length) {
      failures.forEach(([label, result]) =>
        console.error(`[SYS] Failed to load ${label}`, result.reason),
      );
      setReferenceError(
        failures
          .map(([label, result]) => describeError(result.reason, { action: `Load ${label}`, technical: true }))
          .join(" "),
      );
    }
  }, []);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  const loadRows = useCallback(async () => {
    if (!selectedTable) return;
    setRowsLoading(true);
    setRowsError("");
    try {
      const data = await queryTableRows(selectedTable, {
        limit,
        orderBy,
        filter:
          filterColumn && filterValue
            ? { column: filterColumn, value: filterValue }
            : undefined,
      });
      setRows(data ?? []);
    } catch (err) {
      setRowsError(describeError(err, { action: `Load rows from ${selectedTable}`, technical: true }));
      setRows([]);
    } finally {
      setRowsLoading(false);
    }
  }, [selectedTable, limit, orderBy, filterColumn, filterValue]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    setDeleteKeyValues((prev) => {
      const next = {};
      deleteKeyColumns.forEach((col) => {
        next[col] = prev?.[col] ?? "";
      });
      return next;
    });
  }, [deleteKeyColumns]);

  useEffect(() => {
    if (!selectedTable || !deleteKeyColumns.length) {
      setCascadePreview([]);
      setCascadeError("");
      setTargetRowPreview(null);
      setTargetRowCount(null);
      return;
    }
    if (!deleteKeysReady) {
      setCascadePreview([]);
      setCascadeError("");
      setTargetRowPreview(null);
      setTargetRowCount(null);
      return;
    }

    let ignore = false;
    const loadCascade = async () => {
      setCascadeLoading(true);
      setCascadeError("");
      setDeleteMessage("");
      try {
        try {
          const targetResult =
            deleteKeyEntries.length === 1
              ? await queryTableRowsExact(selectedTable, {
                  column: deleteKeyEntries[0].column,
                  value: deleteKeyEntries[0].value,
                  limit: 1,
                })
              : await queryTableRowsByFilters(selectedTable, deleteKeyEntries, { limit: 1 });

          if (!ignore) {
            setTargetRowPreview(targetResult.rows[0] ?? null);
            setTargetRowCount(targetResult.count ?? targetResult.rows.length);
          }
        } catch (err) {
          if (!ignore) {
            setTargetRowPreview(null);
            setTargetRowCount(null);
            setCascadeError(describeError(err, { action: "Load target row", technical: true }));
          }
        }

        const refs = listForeignKeysByReferencedTable(selectedTable);
        const results = await Promise.all(
          refs.map(async (ref) => {
            const isComposite =
              (ref.columns?.length ?? 0) !== 1 || (ref.referencesColumns?.length ?? 0) !== 1;
            if (isComposite) {
              return {
                ref,
                rows: [],
                count: 0,
                composite: true,
                error: "",
              };
            }

            const refColumn = ref.referencesColumns?.[0];
            const keyIndex = deleteKeyColumns.findIndex((col) => col === refColumn);
            if (keyIndex === -1) {
              return {
                ref,
                rows: [],
                count: 0,
                composite: true,
                error: "",
              };
            }
            const keyValue = deleteKeyEntries[keyIndex]?.value;
            if (!keyValue) {
              return {
                ref,
                rows: [],
                count: 0,
                composite: true,
                error: "",
              };
            }

            try {
              const { rows, count } = await queryTableRowsExact(ref.table, {
                column: ref.columns[0],
                value: keyValue,
                limit: 200,
              });
              return {
                ref,
                rows,
                count: count ?? rows.length,
                composite: false,
                error: "",
              };
            } catch (err) {
              return {
                ref,
                rows: [],
                count: 0,
                composite: false,
                error: describeError(err, { action: `Load related rows from ${ref.table}`, technical: true }),
              };
            }
          }),
        );

        if (!ignore) {
          setCascadePreview(results);
        }
      } catch (err) {
        // Without this the preview silently stays empty right before a
        // destructive delete — the operator must know it is incomplete.
        if (!ignore) {
          setCascadePreview([]);
          setCascadeError(describeError(err, { action: "Build cascade preview", technical: true }));
        }
      } finally {
        if (!ignore) {
          setCascadeLoading(false);
        }
      }
    };

    loadCascade();
    return () => {
      ignore = true;
    };
  }, [deleteKeyColumns, deleteKeyEntries, deleteKeysReady, selectedTable]);

  useEffect(() => {
    if (!editTextareaRef.current) return;
    const textarea = editTextareaRef.current;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [editPayload]);

  const handleInsert = async () => {
    setDraftError("");
    setActionMessage("");
    const payload = parseJsonPayload(draftPayload, setDraftError);
    if (!payload) return;
    try {
      const saved = await insertTableRow(selectedTable, payload);
      setActionMessage("Row inserted.");
      setDraftPayload(JSON.stringify(saved ?? payload, null, 2));
      loadRows();
    } catch (err) {
      setDraftError(describeError(err, { action: `Insert into ${selectedTable}`, technical: true }));
    }
  };

  const handleUpdate = async () => {
    setDraftError("");
    setActionMessage("");
    if (!selectedRow) {
      setDraftError("Pick a row from the grid before updating.");
      return;
    }
    const payload = parseJsonPayload(editPayload || draftPayload, setDraftError);
    if (!payload) return;

    const recordId = selectedRow[primaryKey];
    if (recordId === undefined) {
      setDraftError(`Selected row has no value for primary key "${primaryKey}".`);
      return;
    }

    try {
      const saved = await updateTableRow(selectedTable, primaryKey, recordId, payload);
      const nextRow = saved ?? { ...selectedRow, ...payload };
      setSelectedRow(nextRow);
      setEditPayload(JSON.stringify(nextRow, null, 2));
      setActionMessage("Row updated.");
      loadRows();
    } catch (err) {
      setDraftError(describeError(err, { action: `Update row in ${selectedTable}`, technical: true }));
    }
  };

  const handleCreateMatch = async () => {
    setMatchError("");
    setMatchMessage("");
    const payload = {
      event_id: matchForm.eventId || null,
      team_a: matchForm.teamAId || null,
      team_b: matchForm.teamBId || null,
      venue_id: matchForm.venueId || null,
      status: matchForm.status || "scheduled",
      start_time: matchForm.startTime ? new Date(matchForm.startTime).toISOString() : null,
      score_a: 0,
      score_b: 0,
    };

    if (!payload.team_a || !payload.team_b) {
      setMatchError("Select Team A and Team B to create a match.");
      return;
    }
    setMatchSaving(true);
    try {
      const saved = await insertTableRow("matches", payload);
      setMatchMessage("Match created successfully.");
      if (saved?.id) {
        setSelectedTable("matches");
        setSelectedRow(saved);
        setEditPayload(JSON.stringify(saved, null, 2));
      }
      loadRows();
    } catch (err) {
      setMatchError(describeError(err, { action: "Create match", technical: true }));
    } finally {
      setMatchSaving(false);
    }
  };

  const handleCascadeDelete = async () => {
    setCascadeError("");
    setDeleteMessage("");
    if (!selectedTable) {
      setCascadeError("Select a table to delete from.");
      return;
    }
    if (!deleteKeysReady) {
      setCascadeError("Provide values for all primary key fields.");
      return;
    }

    setDeleteLoading(true);
    try {
      if (deleteKeyEntries.length === 1) {
        await deleteTableRow(
          selectedTable,
          deleteKeyEntries[0].column,
          deleteKeyEntries[0].value,
        );
      } else {
        await deleteTableRowByFilters(selectedTable, deleteKeyEntries);
      }
      setDeleteMessage("Record deleted. Database cascade rules applied.");
      setDeleteConfirm(false);
      setDeleteKeyValues((prev) =>
        deleteKeyColumns.reduce((acc, col) => ({ ...acc, [col]: "" }), {}),
      );
      setCascadePreview([]);
      setTargetRowPreview(null);
      setTargetRowCount(null);
      loadRows();
    } catch (err) {
      setCascadeError(describeError(err, { action: `Delete from ${selectedTable}`, technical: true }));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-ink">
      <SectionShell as="header" className="py-8">
        <Card className="space-y-5 p-6 sm:p-8 shadow-xl shadow-[rgba(8,25,21,0.08)]">
          <SectionHeader
            eyebrow="System admin"
            eyebrowVariant="tag"
            title="System admin"
            description="Desktop control room for reading, creating, and editing any tournament data in Supabase."
            action={
              <div className="flex flex-wrap gap-2">
                <Link to="/admin" className="sc-button">
                  Back to admin hub
                </Link>
                <button type="button" onClick={loadRows} className="sc-button">
                  Refresh data
                </button>
              </div>
            }
          />
          <div className="flex flex-wrap gap-2">
            <Chip variant="tag">Schema synced</Chip>
            <Chip variant="ghost" className="text-ink">
              Live Supabase access
            </Chip>
          </div>
        </Card>
      </SectionShell>

      <SectionShell className="py-4 space-y-3">
        <BrokenComponentsPanel />
        {referenceError && (
          <Panel className="flex flex-wrap items-center gap-3 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <span>{referenceError}</span>
            <button type="button" onClick={loadReferenceData} className="ml-auto sc-button text-xs">
              Retry
            </button>
          </Panel>
        )}
      </SectionShell>

      <SectionShell as="main" className="pb-16">
        <div className="grid gap-6 lg:gap-8 lg:grid-cols-[280px,minmax(0,1fr)] xl:grid-cols-[320px,minmax(0,1fr)]">
          <Card className="space-y-5 p-4 sm:p-5 lg:sticky lg:top-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">Tables</h2>
              <Chip variant="ghost" className="text-xs text-ink-muted">
                {tables.length} total
              </Chip>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Search tables</p>
              <input
                type="search"
                value={tableSearch}
                onChange={(event) => setTableSearch(event.target.value)}
                placeholder="Filter tables"
                className={LIGHT_INPUT_CLASS}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Panel className="p-3 shadow-sm shadow-[rgba(8,25,21,0.04)]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Active</p>
                <p className="truncate text-base font-semibold">{selectedTable || "None"}</p>
              </Panel>
              <Panel className="p-3 text-center shadow-sm shadow-[rgba(8,25,21,0.04)]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Columns</p>
                <p className="text-xl font-bold">{columns.length}</p>
              </Panel>
            </div>
            <Panel className="max-h-[40vh] space-y-1 overflow-y-auto p-2 shadow-inner shadow-[rgba(8,25,21,0.04)] sm:max-h-[50vh] lg:max-h-[60vh]">
              {filteredTables.map((table) => {
                const isActive = table === selectedTable;
                const cols = listTableColumns(table);
                return (
                  <button
                    key={table}
                    type="button"
                    onClick={() => setSelectedTable(table)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                      isActive ? "bg-accent text-[#03140f] shadow" : "text-ink hover:bg-surface"
                    }`}
                  >
                    <span className="truncate">{table}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      isActive ? "bg-surface" : "bg-surface-muted text-ink-muted"
                    }`}>
                      {cols.length} cols
                    </span>
                  </button>
                );
              })}
            </Panel>
            <Panel className="border border-dashed border-border bg-surface p-3 text-xs text-ink-muted">
              <p className="font-semibold text-ink">Workflow tip</p>
              <p className="mt-1">
                Focus a table, pick a row in the grid, then edit JSON on the right. Changes write straight to Supabase.
              </p>
            </Panel>
          </Card>

          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="space-y-5 p-4 sm:p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
              <SectionHeader
                eyebrow="Quick create"
                eyebrowVariant="tag"
                title="Create a match"
                description="Choose event, venue, teams, date, and status."
                action={
                  <button
                    type="button"
                    onClick={() =>
                      setMatchForm({
                        eventId: "",
                        teamAId: "",
                        teamBId: "",
                        venueId: "",
                        startTime: "",
                        status: "scheduled",
                      })
                    }
                    className="sc-button"
                  >
                    Reset form
                  </button>
                }
              />
              <div className="grid gap-4 lg:grid-cols-12">
                <div className="lg:col-span-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Event</p>
                  <select
                    value={matchForm.eventId}
                    onChange={(event) => setMatchForm((prev) => ({ ...prev, eventId: event.target.value }))}
                    className={`${LIGHT_INPUT_CLASS} appearance-none`}
                  >
                    <option value="">Select event (optional)</option>
                    {eventsList.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Venue</p>
                  <select
                    value={matchForm.venueId}
                    onChange={(event) => setMatchForm((prev) => ({ ...prev, venueId: event.target.value }))}
                    className={`${LIGHT_INPUT_CLASS} appearance-none`}
                  >
                    <option value="">Select venue (optional)</option>
                    {sortedVenues.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                        {formatVenueOptionLabel(venue)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Team A</p>
                  <select
                    value={matchForm.teamAId}
                    onChange={(event) => setMatchForm((prev) => ({ ...prev, teamAId: event.target.value }))}
                    className={`${LIGHT_INPUT_CLASS} appearance-none`}
                  >
                    <option value="">Select Team A</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Team B</p>
                  <select
                    value={matchForm.teamBId}
                    onChange={(event) => setMatchForm((prev) => ({ ...prev, teamBId: event.target.value }))}
                    className={`${LIGHT_INPUT_CLASS} appearance-none`}
                  >
                    <option value="">Select Team B</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Date</p>
                  <input
                    type="datetime-local"
                    value={matchForm.startTime}
                    onChange={(event) => setMatchForm((prev) => ({ ...prev, startTime: event.target.value }))}
                    className={LIGHT_INPUT_CLASS}
                  />
                </div>
                <div className="lg:col-span-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Status</p>
                  <select
                    value={matchForm.status}
                    onChange={(event) =>
                      setMatchForm((prev) => ({ ...prev, status: event.target.value || "scheduled" }))
                    }
                    className={`${LIGHT_INPUT_CLASS} appearance-none`}
                  >
                    {[
                      "scheduled",
                      "ready",
                      "pending",
                      "live",
                      "finished",
                      "completed",
                      "canceled",
                    ].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {(matchError || matchMessage) && (
                <div className="grid gap-3 lg:grid-cols-2">
                  {matchError && (
                    <Panel className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                      {matchError}
                    </Panel>
                  )}
                  {matchMessage && (
                    <Panel className="border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                      {matchMessage}
                    </Panel>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCreateMatch}
                  disabled={matchSaving}
                  className="sc-button"
                >
                  {matchSaving ? "Creating..." : "Create match"}
                </button>
                <Link to="/score-keeper" className="sc-button">
                  Go to score keeper
                </Link>
              </div>
            </Card>

            <Card className="space-y-5 p-4 sm:p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
              <SectionHeader
                eyebrow="Table settings"
                eyebrowVariant="tag"
                title={selectedTable || "Select a table"}
                description={`Base name: ${getBaseTableName(selectedTable) || "none"}`}
              />
              <div className="grid gap-4 lg:grid-cols-12">
                <div className="lg:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Rows</p>
                  <Panel className="p-3 shadow-sm shadow-[rgba(8,25,21,0.04)]">
                    <p className="text-2xl font-semibold">{rows.length}</p>
                    <p className="text-xs text-ink-muted">Loaded records</p>
                  </Panel>
                </div>
                <div className="lg:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Primary key</p>
                  <input
                    type="text"
                    value={primaryKey}
                    onChange={(event) => setPrimaryKey(event.target.value)}
                    className={LIGHT_INPUT_CLASS}
                  />
                </div>
                <div className="lg:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Limit</p>
                  <select
                    value={limit}
                    onChange={(event) => setLimit(Number(event.target.value) || 50)}
                    className={`${LIGHT_INPUT_CLASS} appearance-none`}
                  >
                    {LIMIT_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-12">
                <div className="lg:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Sort</p>
                  <select
                    value={orderBy || ""}
                    onChange={(event) => setOrderBy(event.target.value || null)}
                    className={`${LIGHT_INPUT_CLASS} appearance-none`}
                  >
                    <option value="">No order</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Filter column</p>
                  <select
                    value={filterColumn}
                    onChange={(event) => setFilterColumn(event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} appearance-none`}
                  >
                    <option value="">Any</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Filter value</p>
                  <input
                    type="text"
                    value={filterValue}
                    onChange={(event) => setFilterValue(event.target.value)}
                    placeholder="Value"
                    className={LIGHT_INPUT_CLASS}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={loadRows} className="sc-button">
                  Reload data
                </button>
                <Chip variant="ghost" className="text-xs capitalize text-ink-muted">
                  Default order: {orderBy || "none"}
                </Chip>
              </div>
              <Panel className="p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Schema columns</p>
                {columns.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-muted">No columns detected.</p>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs lg:grid-cols-3">
                    {columns.map((col) => (
                      <div key={col} className="rounded border border-border bg-surface px-2 py-1 font-semibold">
                        {col}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </Card>
            </div>

            <Card className="space-y-4 p-0 shadow-md shadow-[rgba(8,25,21,0.06)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-4">
                <div>
                  <p className="text-base font-semibold">Data grid</p>
                  <p className="text-xs text-ink-muted">
                    Click a row to load it into the editor. Horizontal scroll keeps dense tables manageable.
                  </p>
                </div>
                <Chip variant="ghost" className="text-xs uppercase tracking-wide text-ink-muted">
                  {rowsLoading ? "Loading" : "Live data"}
                </Chip>
              </div>
              {rowsError && (
                <Panel className="mx-6 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  <span>{rowsError}</span>
                  <button type="button" onClick={loadRows} className="ml-auto sc-button text-xs">
                    Retry
                  </button>
                </Panel>
              )}
              <div className="max-h-[45vh] overflow-auto px-6 pb-6 sm:max-h-[55vh] lg:max-h-[65vh]">
                {rowsLoading && rows.length === 0 ? (
                  <p className="text-sm text-ink-muted">Loading rows...</p>
                ) : rows.length === 0 ? (
                  <p className="text-sm text-ink-muted">No rows found.</p>
                ) : (
                  <table className="min-w-full divide-y divide-border text-xs">
                    <thead className="sticky top-0 z-10 bg-surface">
                      <tr>
                        {columns.map((col) => (
                          <th key={col} className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-ink-muted">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {rows.map((row, idx) => {
                        const isActive = selectedRow === row;
                        return (
                          <tr
                            key={row.id ?? idx}
                            className={`cursor-pointer transition hover:bg-surface-muted ${isActive ? "bg-surface" : ""}`}
                            onClick={() => {
                              setSelectedRow(row);
                              setEditPayload(JSON.stringify(row, null, 2));
                              setActionMessage("");
                              setDraftError("");
                            }}
                          >
                            {columns.map((col) => (
                              <td key={col} className="px-3 py-2 align-top text-ink">
                                <div className="max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                                  {formatCell(row[col])}
                                </div>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="space-y-4 p-4 sm:p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
                <SectionHeader
                  eyebrow="Create record"
                  eyebrowVariant="tag"
                  title="Insert JSON payload"
                  description={`Target: ${getBaseTableName(selectedTable) || "none"}`}
                  action={
                    <button type="button" onClick={() => setDraftPayload(buildTemplate(selectedTable))} className="sc-button">
                      Reset template
                    </button>
                  }
                />
                <textarea
                  value={draftPayload}
                  onChange={(event) => setDraftPayload(event.target.value)}
                  rows={12}
                  className={`${LIGHT_INPUT_CLASS} w-full font-mono text-xs`}
                  spellCheck={false}
                />
                <button type="button" onClick={handleInsert} className="sc-button">
                  Insert row
                </button>
              </Card>

              <Card className="space-y-4 p-4 sm:p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
                <SectionHeader
                  eyebrow="Edit selection"
                  eyebrowVariant="tag"
                  title="Update selected row"
                  description="Row loads when you click it in the grid."
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRow(null);
                        setEditPayload("");
                      }}
                      className="sc-button"
                    >
                      Clear selection
                    </button>
                  }
                />
                <textarea
                  ref={editTextareaRef}
                  value={editPayload}
                  onChange={(event) => setEditPayload(event.target.value)}
                  rows={12}
                  className={`${LIGHT_INPUT_CLASS} w-full font-mono text-xs`}
                  placeholder="Select a row to edit"
                  spellCheck={false}
                />
                <button type="button" onClick={handleUpdate} className="sc-button">
                  Save changes
                </button>
              </Card>
            </div>

            {(draftError || actionMessage) && (
              <Card className="space-y-2 p-4 sm:p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
                {draftError && (
                  <Panel className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {draftError}
                  </Panel>
                )}
                {actionMessage && (
                  <Panel className="border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                    {actionMessage}
                  </Panel>
                )}
              </Card>
            )}

            <Card className="space-y-4 p-4 sm:p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
              <SectionHeader
                eyebrow="Delete"
                eyebrowVariant="tag"
                title="Delete record (cascade)"
                description="Preview related rows before deleting. Cascades follow database foreign key rules."
                action={
                  selectedRow ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteKeyValues((prev) => {
                          const next = { ...prev };
                          deleteKeyColumns.forEach((col) => {
                            const value = selectedRow?.[col];
                            next[col] = value !== undefined && value !== null ? String(value) : "";
                          });
                          return next;
                        });
                      }}
                      className="sc-button"
                    >
                      Use selected row
                    </button>
                  ) : null
                }
              />

              <div className="grid gap-4 lg:grid-cols-12">
                <div className="lg:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Table</p>
                  <input
                    type="text"
                    value={selectedTable || ""}
                    disabled
                    className={`${LIGHT_INPUT_CLASS} w-full opacity-80`}
                  />
                </div>
                <div className="lg:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Primary key</p>
                  <input
                    type="text"
                    value={primaryKey}
                    onChange={(event) => setPrimaryKey(event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} w-full`}
                  />
                </div>
                <div className="lg:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {deleteKeyColumns.length > 1 ? "Primary key values" : "Record ID"}
                  </p>
                  <div className="space-y-2">
                    {deleteKeyColumns.map((column) => (
                      <div key={column} className="grid grid-cols-[100px,1fr] items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                          {column}
                        </span>
                        <input
                          type="text"
                          value={deleteKeyValues?.[column] ?? ""}
                          onChange={(event) =>
                            setDeleteKeyValues((prev) => ({ ...prev, [column]: event.target.value }))
                          }
                          placeholder={`Enter ${column}`}
                          className={`${LIGHT_INPUT_CLASS} w-full`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {deleteKeysReady && (
                <Panel className="space-y-2 border border-border/70 bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Target record</p>
                    <Chip variant="ghost" className="text-xs">
                      {targetRowCount === null ? "Checking..." : `${targetRowCount} found`}
                    </Chip>
                  </div>
                  {targetRowPreview ? (
                    <pre className="max-h-48 overflow-auto rounded-lg bg-surface-muted p-3 text-xs text-ink">
                      {JSON.stringify(targetRowPreview, null, 2)}
                    </pre>
                  ) : targetRowCount === 0 ? (
                    <p className="text-xs text-ink-muted">No record found for that ID.</p>
                  ) : (
                    <p className="text-xs text-ink-muted">Loading target row...</p>
                  )}
                </Panel>
              )}

              {deleteKeysReady && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Cascade preview
                    </p>
                    <Chip variant="ghost" className="text-xs">
                      {cascadeLoading ? "Loading..." : `${cascadePreview.length} relationships`}
                    </Chip>
                  </div>
                  {cascadeLoading ? (
                    <Panel className="border border-dashed border-border bg-transparent p-3 text-xs text-ink-muted">
                      Loading cascade preview...
                    </Panel>
                  ) : cascadePreview.length === 0 ? (
                    <Panel className="border border-dashed border-border bg-transparent p-3 text-xs text-ink-muted">
                      No foreign key relationships reference this table.
                    </Panel>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {cascadePreview.map((item) => {
                        const previewRows = item.rows ?? [];
                        const countLabel =
                          item.composite
                            ? "Composite key"
                            : typeof item.count === "number"
                              ? `${item.count} rows`
                              : `${item.rows?.length ?? 0} rows`;
                        return (
                          <Panel
                            key={`${item.ref.table}:${item.ref.columns?.join(",")}`}
                            className="space-y-2 border border-border/70 bg-surface p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                                  {item.ref.table}
                                </p>
                                <p className="text-xs text-ink-muted">
                                  FK: {item.ref.columns?.join(", ")}{" -> "}
                                  {item.ref.referencesTable}.{item.ref.referencesColumns?.join(", ")}
                                </p>
                                {item.ref.onDelete && (
                                  <p className="text-[11px] text-ink-muted">
                                    On delete: {item.ref.onDelete}
                                  </p>
                                )}
                              </div>
                              <Chip variant="ghost" className="text-xs">
                                {countLabel}
                              </Chip>
                            </div>

                            {item.composite ? (
                              <p className="text-xs text-ink-muted">
                                Composite keys are not auto-previewed.
                              </p>
                            ) : item.error ? (
                              <p className="text-xs text-rose-600">{item.error}</p>
                            ) : item.rows?.length ? (
                              <>
                                <div className="max-h-64 space-y-2 overflow-auto rounded-lg bg-surface-muted p-2">
                                  {previewRows.map((row, index) => (
                                    <pre
                                      key={`${item.ref.table}-row-${index}`}
                                      className="text-[11px] text-ink"
                                    >
                                      {JSON.stringify(row, null, 2)}
                                    </pre>
                                  ))}
                                </div>
                                {typeof item.count === "number" &&
                                  item.count > previewRows.length && (
                                    <p className="text-[11px] text-ink-muted">
                                      Showing {previewRows.length} of {item.count} related rows.
                                    </p>
                                  )}
                              </>
                            ) : (
                              <p className="text-xs text-ink-muted">No related rows found.</p>
                            )}
                          </Panel>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {cascadeError && (
                <Panel className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {cascadeError}
                </Panel>
              )}
              {deleteMessage && (
                <Panel className="border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                  {deleteMessage}
                </Panel>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                  <input
                    type="checkbox"
                    checked={deleteConfirm}
                    onChange={(event) => setDeleteConfirm(event.target.checked)}
                  />
                  I understand this will delete the record and any cascading dependencies.
                </label>
                <button
                  type="button"
                  onClick={handleCascadeDelete}
                  disabled={
                    deleteLoading || !deleteConfirm || !deleteKeysReady || deleteBlocked
                  }
                  className="sc-button"
                >
                  {deleteLoading ? "Deleting..." : "Delete with cascade"}
                </button>
                {deleteBlocked && (
                  <span className="text-xs font-semibold text-rose-700">{deleteBlockReason}</span>
                )}
              </div>
            </Card>
          </div>
        </div>
      </SectionShell>
    </div>
  );

}
