import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getRecentAuditLogs, getRecentTableRows } from "../services/adminService";
import { listSchemaTables, SCHEMA_SOURCE_FILE } from "../services/schemaService";
import { Card, Panel, SectionHeader, SectionShell, Chip } from "../components/ui/primitives";

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
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-6">
        <Card className="space-y-4 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Backend workspace"
            title="Systems admin tools"
            description="Configure leagues, manage access policies, and audit StallCount data."
            action={
              <Link to="/admin" className="sc-button is-ghost">
                Back to admin hub
              </Link>
            }
          />
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-6">
        <Card as="section" className="space-y-5 p-6 sm:p-7">
          <SectionHeader
            eyebrow="Database tables"
            title="Schema overview"
            description={`Listed from ${SCHEMA_SOURCE_FILE}; reflects every CREATE TABLE statement in the schema dump.`}
            action={<Chip variant="ghost">{schemaTables.length} tables</Chip>}
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {schemaTables.map((table) => {
              const [schema, name] = table.includes(".") ? table.split(".") : ["public", table];
              const isActive = selectedTable === table;
              return (
                <button
                  key={table}
                  type="button"
                  onClick={() => loadTableRows(table)}
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition hover:-translate-y-0.5 ${
                    isActive ? "border-accent bg-surface" : "border-border bg-surface-muted hover:border-border-strong"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{schema}</p>
                    <p className="truncate text-sm font-semibold text-ink">{name}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${isActive ? "bg-accent text-[#03140f]" : "bg-surface text-accent"}`}>
                    Table
                  </span>
                </button>
              );
            })}
          </div>

          <Panel variant="muted" className="space-y-3 p-4">
            {selectedTable ? (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Preview</p>
                    <h3 className="text-lg font-semibold text-ink">{selectedTable} (latest 20)</h3>
                  </div>
                  {tableLoading && <span className="text-xs font-semibold uppercase tracking-wide text-accent">Loading...</span>}
                </div>
                {tableError && <div className="sc-alert is-error">{tableError}</div>}
                {!tableLoading && !tableError && tableRows.length === 0 && <p className="text-sm text-ink-muted">No rows found.</p>}
                {!tableLoading && tableRows.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <TablePreview rows={tableRows} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-muted">Select a table above to view the 20 most recent entries.</p>
            )}
          </Panel>
        </Card>

        <Card as="section" className="space-y-5 p-6 sm:p-7">
          <SectionHeader
            eyebrow="Audit log"
            title="Recent changes"
            description="Showing the 20 most recent entries from the public.audit_log table."
            action={
              <button type="button" onClick={refreshAuditLog} className="sc-button is-ghost" disabled={loading}>
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            }
          />

          {error && <div className="sc-alert is-error">{error}</div>}

          <Panel variant="muted" className="overflow-x-auto p-0">
            {loading ? (
              <div className="p-6 text-sm text-ink-muted">Loading audit entries...</div>
            ) : entries.length === 0 ? (
              <div className="p-6 text-sm text-ink-muted">No audit entries recorded yet.</div>
            ) : (
              <table className="min-w-full divide-y divide-[var(--sc-border-strong)] text-sm">
                <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Table</th>
                    <th className="px-4 py-3">Record ID</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sc-border-strong)] bg-surface">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatTimestamp(entry.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className="sc-pill border-border-strong text-accent">{entry.action}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold">{entry.table_name}</td>
                      <td className="px-4 py-3 text-xs text-ink-muted">{entry.record_id || "N/A"}</td>
                      <td className="px-4 py-3">{entry.actor?.full_name || entry.actor?.email || entry.actor?.id || "Unknown"}</td>
                      <td className="px-4 py-3">
                        {entry.change_data ? (
                          <pre className="max-h-40 overflow-y-auto rounded-xl bg-surface-muted p-3 text-xs">{JSON.stringify(entry.change_data, null, 2)}</pre>
                        ) : (
                          <span className="text-xs text-ink-muted">No diff</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </Card>
      </SectionShell>
    </div>
  );
}

function TablePreview({ rows }) {
  const columns = Object.keys(rows[0] ?? {});

  if (columns.length === 0) {
    return <div className="p-4 text-sm text-ink-muted">No columns detected.</div>;
  }

  const renderValue = (value) => {
    if (value === null || value === undefined) return "N/A";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <table className="min-w-full divide-y divide-[var(--sc-border-strong)] text-sm">
      <thead className="bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
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
              <td key={col} className="max-w-xs px-4 py-2 text-ink">
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
