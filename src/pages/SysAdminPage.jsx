import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getRecentAuditLogs } from "../services/adminService";

export default function SysAdminPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--sc-border)]">
          {loading ? (
            <div className="p-6 text-sm text-[var(--sc-ink-muted)]">Loading audit entries…</div>
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
                      {entry.record_id || "—"}
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

function formatTimestamp(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
