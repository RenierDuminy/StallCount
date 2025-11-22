import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getBaseTableName,
  insertTableRow,
  queryTableRows,
  updateTableRow,
} from "../services/adminService";
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

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="flex w-full flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin tools</p>
            <h1 className="text-3xl font-semibold text-slate-900">Tournament director</h1>
            <p className="text-sm text-slate-600">
              Desktop-first control room to read, create, and modify any tournament data in Supabase.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            >
              Back to admin hub
            </Link>
            <button
              type="button"
              onClick={loadRows}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Refresh data
            </button>
          </div>
        </div>
      </header>

      <main className="grid w-full grid-cols-1 gap-3 px-3 pt-3 xl:grid-cols-[320px_minmax(0,1fr)] xl:px-4">
        <aside className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tables</p>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
              {tables.length} total
            </span>
          </div>
          <label className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 focus-within:border-slate-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-200">
            <span className="font-semibold uppercase tracking-wide">Search</span>
            <input
              type="search"
              value={tableSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              placeholder="Filter tables"
              className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </label>

          <div className="mt-3 flex gap-2">
            <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Active</p>
              <p className="text-sm font-semibold text-slate-900 truncate">{selectedTable || "None"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Columns</p>
              <p className="text-lg font-bold text-slate-900">{columns.length}</p>
            </div>
          </div>

          <div className="mt-3 max-h-[70vh] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-inner">
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
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-800 hover:bg-white"
                  }`}
                >
                  <span className="truncate">{table}</span>
                  <span
                    className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {cols.length} cols
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-900">PC layout tip</p>
            <p className="mt-1">
              Focus a table, pick a row in the grid, then edit JSON on the right. Changes write straight to Supabase.
            </p>
          </div>
        </aside>

        <section className="space-y-3">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Table</p>
                  <p className="text-xl font-semibold text-slate-900">
                    {selectedTable || "Select a table"}
                  </p>
                  <p className="text-xs text-slate-600">
                    Base name: {getBaseTableName(selectedTable) || "none"} | Default order: {orderBy || "none"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Limit
                    <select
                      value={limit}
                      onChange={(event) => setLimit(Number(event.target.value) || 50)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:outline-none"
                    >
                      {LIMIT_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Sort
                    <select
                      value={orderBy || ""}
                      onChange={(event) => setOrderBy(event.target.value || null)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:outline-none"
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
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-800 transition hover:border-slate-400"
                  >
                    Reload
                  </button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rows</p>
                  <p className="text-lg font-bold text-slate-900">{rows.length}</p>
                  <p className="text-[11px] text-slate-600">Loaded records</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Primary key</p>
                  <input
                    type="text"
                    value={primaryKey}
                    onChange={(event) => setPrimaryKey(event.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-900 focus:border-slate-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-600">Used for updates</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Filter</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={filterColumn}
                      onChange={(event) => setFilterColumn(event.target.value)}
                      className="w-1/2 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:outline-none"
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
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-slate-600">ilike filter</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Schema columns</p>
              {columns.length === 0 ? (
                <p className="mt-2 text-xs text-slate-600">No columns detected in schema file.</p>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-800 lg:grid-cols-3">
                  {columns.map((col) => (
                    <div key={col} className="rounded border border-slate-200 bg-white px-2 py-1 font-semibold">
                      {col}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Data grid</p>
                <p className="text-xs text-slate-600">
                  Click a row to load it into the editor. Recent rows shown with horizontal scroll for dense viewing.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
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
                <div className="p-4 text-sm text-slate-600">Loading rows...</div>
              ) : rows.length === 0 ? (
                <div className="p-4 text-sm text-slate-600">No rows found.</div>
              ) : (
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      {columns.map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-600">
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
                          className={`cursor-pointer align-top hover:bg-slate-50 ${
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
                            <td key={col} className="px-3 py-2 text-slate-900">
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
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Create record</p>
                  <p className="text-xs text-slate-600">Paste JSON payload to insert into {getBaseTableName(selectedTable)}.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraftPayload(buildTemplate(selectedTable))}
                  className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-400"
                >
                  Reset template
                </button>
              </div>
              <textarea
                value={draftPayload}
                onChange={(event) => setDraftPayload(event.target.value)}
                rows={12}
                className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-900 shadow-inner focus:border-slate-500 focus:outline-none"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handleInsert}
                className="mt-3 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Insert row
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Edit selected row</p>
                  <p className="text-xs text-slate-600">Row loads when you click it in the grid. Save writes to Supabase.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRow(null);
                    setEditPayload("");
                  }}
                  className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-400"
                >
                  Clear selection
                </button>
              </div>
              <textarea
                value={editPayload}
                onChange={(event) => setEditPayload(event.target.value)}
                rows={12}
                className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-900 shadow-inner focus:border-slate-500 focus:outline-none"
                placeholder="Select a row to edit"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handleUpdate}
                className="mt-3 inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
              >
                Save changes
              </button>
            </div>
          </div>

          {(draftError || actionMessage) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
