import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getRecentAuditLogs, getRecentTableRows } from "../services/adminService";
import { listSchemaTables, SCHEMA_SOURCE_FILE } from "../services/schemaService";

export default function SysAdminPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [tableRows, setTableRows] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState("");
  const schemaTables = listSchemaTables();

  useEffect(() => {
    let ignore = false;

    const loadAuditLog = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getRecentAuditLogs(20);
        if (!ignore) {
          setEntries(data);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Unable to load audit log entries.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadAuditLog();
    return () => {
      ignore = true;
    };
  }, []);

  const refreshAuditLog = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getRecentAuditLogs(20);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh audit log.");
    } finally {
      setLoading(false);
    }
  };

  const loadTableRows = async (tableName) => {
    setSelectedTable(tableName);
    setTableRows([]);
    setTableError("");
    setTableLoading(true);
    try {
      const rows = await getRecentTableRows(tableName, 20);
      setTableRows(rows ?? []);
    } catch (err) {
      setTableError(err instanceof Error ? err.message : "Unable to load table rows.");
    } finally {
      setTableLoading(false);
    }
  };

  return (
    <div className="sc-shell space-y-8">
      <header className="sc-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
              Backend workspace
            </p>
            <h1 className="text-3xl font-semibold text-[var(--sc-ink)]">Systems admin tools</h1>
            <p className="mt-2 text-sm text-[var(--sc-ink-muted)]">
              Configure leagues, manage access policies, and audit StallCount data.
            </p>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center justify-center rounded-full border border-[var(--sc-border)] px-4 py-2 text-sm font-semibold text-[var(--sc-accent)] transition hover:border-[var(--sc-accent)] hover:bg-[#e6fffa]"
          >
            Back to admin hub
          </Link>
        </div>
      </header>

      <section className="sc-card">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[var(--sc-ink)]">Database tables</h2>
            <p className="text-sm text-[var(--sc-ink-muted)]">
              Listed from {SCHEMA_SOURCE_FILE}; reflects every CREATE TABLE statement in the schema dump.
            </p>
          </div>
          <span className="rounded-full border border-[var(--sc-border)] px-4 py-1 text-sm font-semibold text-[var(--sc-accent)]">
            {schemaTables.length} tables
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {schemaTables.map((table) => {
            const [schema, name] = table.includes(".") ? table.split(".") : ["public", table];
            const isActive = selectedTable === table;
            return (
              <button
                key={table}
                type="button"
                onClick={() => loadTableRows(table)}
                className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm shadow-sm transition hover:-translate-y-0.5 ${
                  isActive
                    ? "border-[var(--sc-accent)] bg-white"
                    : "border-[var(--sc-border-strong)] bg-[var(--sc-surface-muted)] hover:border-[var(--sc-border)]"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                    {schema}
                  </p>
                  <p className="truncate text-sm font-semibold text-[var(--sc-ink)]">{name}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                    isActive
                      ? "bg-[var(--sc-accent)] text-white"
                      : "bg-white text-[var(--sc-accent)]"
                  }`}
                >
                  Table
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-[var(--sc-border)] bg-white/80 p-4 sm:p-6">
          {selectedTable ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                    Preview
                  </p>
                  <h3 className="text-lg font-semibold text-[var(--sc-ink)]">
                    {selectedTable} (latest 20)
                  </h3>
                </div>
                {tableLoading && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-accent)]">
                    Loading...
                  </span>
                )}
              </div>

              {tableError && (
                <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                  {tableError}
                </p>
              )}

              {!tableLoading && !tableError && tableRows.length === 0 && (
                <p className="mt-4 text-sm text-[var(--sc-ink-muted)]">No rows found.</p>
              )}

              {!tableLoading && tableRows.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--sc-border-strong)]">
                  <TablePreview rows={tableRows} />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--sc-ink-muted)]">
              Select a table above to view the 20 most recent entries.
            </p>
          )}
        </div>
      </section>

      <section className="sc-card">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[var(--sc-ink)]">Audit log</h2>
            <p className="text-sm text-[var(--sc-ink-muted)]">
              Showing the 20 most recent entries from the public.audit_log table.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshAuditLog}
            className="inline-flex items-center justify-center rounded-full border border-[var(--sc-border)] px-4 py-2 text-sm font-semibold text-[var(--sc-accent)] transition hover:border-[var(--sc-accent)] hover:bg-[#e6fffa]"
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--sc-border)]">
          {loading ? (
            <div className="p-6 text-sm text-[var(--sc-ink-muted)]">Loading audit entries...</div>
          ) : entries.length === 0 ? (
            <div className="p-6 text-sm text-[var(--sc-ink-muted)]">
              No audit entries recorded yet.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-[var(--sc-border-strong)] text-sm">
              <thead className="bg-[var(--sc-surface-muted)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Table</th>
                  <th className="px-4 py-3">Record ID</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-border-strong)] bg-white">
                {entries.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--sc-ink-muted)]">
                      {formatTimestamp(entry.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="sc-pill border-[var(--sc-border-strong)] text-[var(--sc-accent)]">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold">{entry.table_name}</td>
                    <td className="px-4 py-3 text-xs text-[var(--sc-ink-muted)]">
                      {entry.record_id || "N/A"}
                    </td>
                    <td className="px-4 py-3">
                      {entry.actor?.full_name || entry.actor?.email || entry.actor?.id || "Unknown"}
                    </td>
                    <td className="px-4 py-3">
                      {entry.change_data ? (
                        <pre className="max-h-40 overflow-y-auto rounded-xl bg-[var(--sc-surface-muted)] p-3 text-xs">
                          {JSON.stringify(entry.change_data, null, 2)}
                        </pre>
                      ) : (
                        <span className="text-xs text-[var(--sc-ink-muted)]">No diff</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function TablePreview({ rows }) {
  const columns = Object.keys(rows[0] ?? {});

  if (columns.length === 0) {
    return <div className="p-4 text-sm text-[var(--sc-ink-muted)]">No columns detected.</div>;
  }

  const renderValue = (value) => {
    if (value === null || value === undefined) return "N/A";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <table className="min-w-full divide-y divide-[var(--sc-border-strong)] text-sm">
      <thead className="bg-[var(--sc-surface-muted)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
        <tr>
          {columns.map((col) => (
            <th key={col} className="px-4 py-2">
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--sc-border-strong)] bg-white">
        {rows.map((row, idx) => (
          <tr key={row.id ?? idx} className="align-top">
            {columns.map((col) => (
              <td key={col} className="max-w-xs px-4 py-2 text-[var(--sc-ink)]">
                <div className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                  {renderValue(row[col])}
                </div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatTimestamp(value) {
  if (!value) return "N/A";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
