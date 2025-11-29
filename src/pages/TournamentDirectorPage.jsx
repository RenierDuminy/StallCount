import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getBaseTableName,
  insertTableRow,
  queryTableRows,
  updateTableRow,
} from "../services/adminService";
import { getAllTeams } from "../services/teamService";
import { getEventsList } from "../services/leagueService";
import { listSchemaTables, listTableColumns, pickRecencyColumn } from "../services/schemaService";

const LIMIT_OPTIONS = [20, 50, 100, 200];

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

export default function TournamentDirectorPage() {
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

  const columns = useMemo(() => listTableColumns(selectedTable), [selectedTable]);

  const filteredTables = useMemo(() => {
    if (!tableSearch.trim()) return tables;
    const q = tableSearch.toLowerCase();
    return tables.filter((t) => t.toLowerCase().includes(q));
  }, [tableSearch, tables]);

  useEffect(() => {
    const nextOrder = pickRecencyColumn(selectedTable);
    setOrderBy(nextOrder || null);
    const cols = listTableColumns(selectedTable);
    setFilterColumn(cols[0] || "");
    setPrimaryKey(cols.includes("id") ? "id" : cols[0] || "id");
    setDraftPayload(buildTemplate(selectedTable));
    setSelectedRow(null);
    setEditPayload("");
    setActionMessage("");
    setDraftError("");
  }, [selectedTable]);

  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const [teamRows, eventRows, venueRows] = await Promise.all([
          getAllTeams(200),
          getEventsList(200),
          queryTableRows("venues", { limit: 200, orderBy: "name" }),
        ]);
        setTeams(teamRows ?? []);
        setEventsList(eventRows ?? []);
        setVenues(Array.isArray(venueRows) ? venueRows : []);
      } catch (err) {
        console.error("[TD] Failed to load reference data", err);
      }
    };
    loadReferenceData();
  }, []);

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
      setRowsError(err instanceof Error ? err.message : "Unable to load rows.");
      setRows([]);
    } finally {
      setRowsLoading(false);
    }
  }, [selectedTable, limit, orderBy, filterColumn, filterValue]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

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
      setDraftError(err instanceof Error ? err.message : "Insert failed.");
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
      setDraftError(err instanceof Error ? err.message : "Update failed.");
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
      setMatchError(err instanceof Error ? err.message : "Failed to create match.");
    } finally {
      setMatchSaving(false);
    }
  };

  return (
    <div className="pb-12 text-[var(--td-ink)]">
      <header className="sc-shell py-4 sm:py-6">
        <div className="td-card-base space-y-3 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="td-chip">Admin tools</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">
              Tournament director
            </span>
          </div>
          <h1 className="text-3xl font-semibold text-[var(--td-ink)]">Tournament director</h1>
          <p className="text-sm text-[var(--td-ink-muted)]">
            Desktop-first control room to read, create, and modify any tournament data in Supabase.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/admin" className="td-button is-ghost">
              Back to admin hub
            </Link>
            <button type="button" onClick={loadRows} className="td-button">
              Refresh data
            </button>
          </div>
        </div>
      </header>

      <main className="grid w-full grid-cols-1 gap-3 px-3 pt-3 xl:grid-cols-[320px_minmax(0,1fr)] xl:px-4">
        <aside className="h-full rounded-2xl border border-[var(--td-border)] bg-white p-4 shadow-sm xl:sticky xl:top-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">Tables</p>
            <span className="rounded-full bg-[var(--td-surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--td-ink-muted)]">
              {tables.length} total
            </span>
          </div>
          <label className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2 text-xs text-[var(--td-ink-muted)] focus-within:border-[var(--td-border-strong)] focus-within:bg-white focus-within:ring-2 focus-within:ring-[var(--td-border-strong)]/60">
            <span className="font-semibold uppercase tracking-wide">Search</span>
            <input
              type="search"
              value={tableSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              placeholder="Filter tables"
              className="w-full bg-transparent text-sm text-[var(--td-ink)] placeholder:text-[var(--td-ink-muted)] focus:outline-none"
            />
          </label>

          <div className="mt-3 flex gap-2">
            <div className="flex-1 rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">Active</p>
              <p className="text-sm font-semibold text-[var(--td-ink)] truncate">{selectedTable || "None"}</p>
            </div>
            <div className="rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">Columns</p>
              <p className="text-lg font-bold text-[var(--td-ink)]">{columns.length}</p>
            </div>
          </div>

          <div className="mt-3 max-h-[70vh] space-y-1 overflow-y-auto rounded-xl border border-[var(--td-border)] bg-[var(--td-surface-muted)] p-2 shadow-inner">
            {filteredTables.map((table) => {
              const isActive = table === selectedTable;
              const cols = listTableColumns(table);
              return (
                <button
                  key={table}
                  type="button"
                  onClick={() => setSelectedTable(table)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                    isActive
                      ? "bg-[var(--td-ink)] text-white shadow-sm"
                      : "text-slate-800 hover:bg-white"
                  }`}
                >
                  <span className="truncate">{table}</span>
                  <span
                    className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      isActive ? "bg-[var(--td-surface-muted)] text-[var(--td-ink)]" : "bg-[var(--td-surface-muted)] text-[var(--td-ink-muted)]"
                    }`}
                  >
                    {cols.length} cols
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-xl border border-dashed border-[var(--td-border)] bg-[var(--td-surface-muted)] p-3 text-xs text-[var(--td-ink-muted)]">
            <p className="font-semibold text-[var(--td-ink)]">PC layout tip</p>
            <p className="mt-1">
              Focus a table, pick a row in the grid, then edit JSON on the right. Changes write straight to Supabase.
            </p>
          </div>
        </aside>

        <section className="space-y-3">
          <div className="rounded-2xl border border-[var(--td-border)] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">
                  Quick create
                </p>
                <h2 className="text-xl font-semibold text-[var(--td-ink)]">Create a match</h2>
                <p className="text-xs text-[var(--td-ink-muted)]">
                  Choose event, teams, venue, and start time. Names are displayed for clarity.
                </p>
              </div>
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
                className="rounded border border-[var(--td-border-strong)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--td-ink-muted)] hover:border-[var(--td-border-strong)]"
              >
                Reset form
              </button>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--td-ink)]">
                Event
                <select
                  value={matchForm.eventId}
                  onChange={(event) => setMatchForm((prev) => ({ ...prev, eventId: event.target.value }))}
                  className="rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2 text-sm text-[var(--td-ink)] focus:border-[var(--td-border-strong)] focus:outline-none"
                >
                  <option value="">Select event (optional)</option>
                  {eventsList.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--td-ink)]">
                Team A
                <select
                  value={matchForm.teamAId}
                  onChange={(event) => setMatchForm((prev) => ({ ...prev, teamAId: event.target.value }))}
                  className="rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2 text-sm text-[var(--td-ink)] focus:border-[var(--td-border-strong)] focus:outline-none"
                >
                  <option value="">Select Team A</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--td-ink)]">
                Team B
                <select
                  value={matchForm.teamBId}
                  onChange={(event) => setMatchForm((prev) => ({ ...prev, teamBId: event.target.value }))}
                  className="rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2 text-sm text-[var(--td-ink)] focus:border-[var(--td-border-strong)] focus:outline-none"
                >
                  <option value="">Select Team B</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--td-ink)]">
                Venue
                <select
                  value={matchForm.venueId}
                  onChange={(event) => setMatchForm((prev) => ({ ...prev, venueId: event.target.value }))}
                  className="rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2 text-sm text-[var(--td-ink)] focus:border-[var(--td-border-strong)] focus:outline-none"
                >
                  <option value="">Select venue (optional)</option>
                  {venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>
                      {venue.name || "Unnamed venue"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--td-ink)]">
                Start time
                <input
                  type="datetime-local"
                  value={matchForm.startTime}
                  onChange={(event) => setMatchForm((prev) => ({ ...prev, startTime: event.target.value }))}
                  className="rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2 text-sm text-[var(--td-ink)] focus:border-[var(--td-border-strong)] focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--td-ink)]">
                Status
                <select
                  value={matchForm.status}
                  onChange={(event) => setMatchForm((prev) => ({ ...prev, status: event.target.value || "scheduled" }))}
                  className="rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2 text-sm text-[var(--td-ink)] focus:border-[var(--td-border-strong)] focus:outline-none"
                >
                  {["scheduled", "ready", "pending", "live", "finished", "completed", "canceled"].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {(matchError || matchMessage) && (
              <div className="mt-3 space-y-2">
                {matchError && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {matchError}
                  </p>
                )}
                {matchMessage && (
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                    {matchMessage}
                  </p>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleCreateMatch}
                disabled={matchSaving}
                className="inline-flex items-center justify-center rounded-lg bg-[var(--td-ink)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--td-ink-muted)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {matchSaving ? "Creating..." : "Create match"}
              </button>
              <Link to="/score-keeper" className="inline-flex items-center justify-center rounded-lg border border-[var(--td-border)] px-4 py-2 text-sm font-semibold text-[var(--td-ink)] transition hover:border-[var(--td-border-strong)]">
                Go to score keeper
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-[var(--td-border)] bg-white p-4 shadow-sm lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">Table</p>
                  <p className="text-xl font-semibold text-[var(--td-ink)]">
                    {selectedTable || "Select a table"}
                  </p>
                  <p className="text-xs text-[var(--td-ink-muted)]">
                    Base name: {getBaseTableName(selectedTable) || "none"} | Default order: {orderBy || "none"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <label className="flex items-center gap-2 rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">
                    Limit
                    <select
                      value={limit}
                      onChange={(event) => setLimit(Number(event.target.value) || 50)}
                      className="rounded border border-[var(--td-border)] bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:outline-none"
                    >
                      {LIMIT_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">
                    Sort
                    <select
                      value={orderBy || ""}
                      onChange={(event) => setOrderBy(event.target.value || null)}
                      className="rounded border border-[var(--td-border)] bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:outline-none"
                    >
                      <option value="">No order</option>
                      {columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={loadRows}
                    className="rounded-lg border border-[var(--td-border-strong)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-800 transition hover:border-[var(--td-border-strong)]"
                  >
                    Reload
                  </button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">Rows</p>
                  <p className="text-lg font-bold text-[var(--td-ink)]">{rows.length}</p>
                  <p className="text-[11px] text-[var(--td-ink-muted)]">Loaded records</p>
                </div>
                <div className="rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">Primary key</p>
                  <input
                    type="text"
                    value={primaryKey}
                    onChange={(event) => setPrimaryKey(event.target.value)}
                    className="mt-1 w-full rounded border border-[var(--td-border-strong)] px-2 py-1 text-sm font-semibold text-[var(--td-ink)] focus:border-[var(--td-border-strong)] focus:outline-none"
                  />
                  <p className="text-[11px] text-[var(--td-ink-muted)]">Used for updates</p>
                </div>
                <div className="rounded-lg border border-[var(--td-border)] bg-[var(--td-surface-muted)] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">Filter</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={filterColumn}
                      onChange={(event) => setFilterColumn(event.target.value)}
                      className="w-1/2 rounded border border-[var(--td-border-strong)] bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:outline-none"
                    >
                      <option value="">Any</option>
                      {columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={filterValue}
                      onChange={(event) => setFilterValue(event.target.value)}
                      placeholder="Value"
                      className="w-full rounded border border-[var(--td-border-strong)] px-2 py-1 text-sm text-[var(--td-ink)] placeholder:text-slate-400 focus:border-[var(--td-border-strong)] focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-[var(--td-ink-muted)]">ilike filter</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--td-border)] bg-[var(--td-surface-muted)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">Schema columns</p>
              {columns.length === 0 ? (
                <p className="mt-2 text-xs text-[var(--td-ink-muted)]">No columns detected in schema file.</p>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-800 lg:grid-cols-3">
                  {columns.map((col) => (
                    <div key={col} className="rounded border border-[var(--td-border)] bg-white px-2 py-1 font-semibold">
                      {col}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--td-border)] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--td-border)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[var(--td-ink)]">Data grid</p>
                <p className="text-xs text-[var(--td-ink-muted)]">
                  Click a row to load it into the editor. Recent rows shown with horizontal scroll for dense viewing.
                </p>
              </div>
              <span className="rounded-full bg-[var(--td-surface-muted)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">
                {rowsLoading ? "Loading..." : "Live data"}
              </span>
            </div>
            {rowsError && (
              <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                {rowsError}
              </div>
            )}
            <div className="max-h-[55vh] overflow-auto">
              {rowsLoading && rows.length === 0 ? (
                <div className="p-4 text-sm text-[var(--td-ink-muted)]">Loading rows...</div>
              ) : rows.length === 0 ? (
                <div className="p-4 text-sm text-[var(--td-ink-muted)]">No rows found.</div>
              ) : (
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-[var(--td-surface-muted)] sticky top-0 z-10">
                    <tr>
                      {columns.map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-[var(--td-ink-muted)]">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => {
                      const isActive = selectedRow === row;
                      return (
                        <tr
                          key={row.id ?? idx}
                          className={`cursor-pointer align-top hover:bg-[var(--td-surface-muted)] ${
                            isActive ? "bg-amber-50" : ""
                          }`}
                          onClick={() => {
                            setSelectedRow(row);
                            setEditPayload(JSON.stringify(row, null, 2));
                            setActionMessage("");
                            setDraftError("");
                          }}
                        >
                          {columns.map((col) => (
                            <td key={col} className="px-3 py-2 text-[var(--td-ink)]">
                              <div className="max-w-xs overflow-hidden text-ellipsis whitespace-nowrap align-top">
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
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--td-border)] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--td-ink)]">Create record</p>
                  <p className="text-xs text-[var(--td-ink-muted)]">Paste JSON payload to insert into {getBaseTableName(selectedTable)}.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraftPayload(buildTemplate(selectedTable))}
                  className="rounded border border-[var(--td-border-strong)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--td-ink-muted)] hover:border-[var(--td-border-strong)]"
                >
                  Reset template
                </button>
              </div>
              <textarea
                value={draftPayload}
                onChange={(event) => setDraftPayload(event.target.value)}
                rows={12}
                className="mt-3 w-full rounded-xl border border-[var(--td-border)] bg-[var(--td-surface-muted)] p-3 font-mono text-xs text-[var(--td-ink)] shadow-inner focus:border-[var(--td-border-strong)] focus:outline-none"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handleInsert}
                className="mt-3 inline-flex items-center justify-center rounded-lg bg-[var(--td-ink)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--td-ink-muted)]"
              >
                Insert row
              </button>
            </div>

            <div className="rounded-2xl border border-[var(--td-border)] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--td-ink)]">Edit selected row</p>
                  <p className="text-xs text-[var(--td-ink-muted)]">Row loads when you click it in the grid. Save writes to Supabase.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRow(null);
                    setEditPayload("");
                  }}
                  className="rounded border border-[var(--td-border-strong)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--td-ink-muted)] hover:border-[var(--td-border-strong)]"
                >
                  Clear selection
                </button>
              </div>
              <textarea
                value={editPayload}
                onChange={(event) => setEditPayload(event.target.value)}
                rows={12}
                className="mt-3 w-full rounded-xl border border-[var(--td-border)] bg-[var(--td-surface-muted)] p-3 font-mono text-xs text-[var(--td-ink)] shadow-inner focus:border-[var(--td-border-strong)] focus:outline-none"
                placeholder="Select a row to edit"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handleUpdate}
                className="mt-3 inline-flex items-center justify-center rounded-lg border border-[var(--td-border-strong)] px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-[var(--td-border-strong)]"
              >
                Save changes
              </button>
            </div>
          </div>

          {(draftError || actionMessage) && (
            <div className="rounded-2xl border border-[var(--td-border)] bg-white p-4 shadow-sm">
              {draftError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {draftError}
                </p>
              )}
              {actionMessage && (
                <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                  {actionMessage}
                </p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
