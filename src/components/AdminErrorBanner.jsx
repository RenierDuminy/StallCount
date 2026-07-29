import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getErrorLog, subscribeToErrorLog } from "./ErrorBoundary";
import { getUserRoleSlugs } from "../utils/accessControl";

// /sys-admin is gated on the `admin_override` permission, which in this codebase
// only the `admin` role carries. We match on the slug rather than the permission
// because permissions resolve exclusively through the roleCatalog, and that
// catalog is a network fetch (see ProtectedRoute) — too costly to repeat on every
// page just to decide whether to render a banner.
//
// Deliberately narrow: a captain seeing "page error found" would only be alarmed
// by something they cannot act on.
const ADMIN_BANNER_ROLES = ["admin"];

// Dismissal is per-error-count, not permanent: if a NEW error arrives after the
// operator dismisses, the banner returns. Silencing it for the whole session
// would defeat the point.
export default function AdminErrorBanner() {
  const { session, roles } = useAuth();
  const location = useLocation();
  const [log, setLog] = useState(() => [...getErrorLog()]);
  const [dismissedAtCount, setDismissedAtCount] = useState(0);

  useEffect(() => subscribeToErrorLog(setLog), []);

  // Every derived value below is defensive. This component renders on every
  // page and its only job is reporting failures, so it must tolerate malformed
  // input rather than become a failure itself. The SilentErrorBoundary in
  // AppLayout is the backstop; these guards mean it should never be needed.
  const isAdmin = useMemo(() => {
    try {
      const user = session?.user;
      if (!user || !Array.isArray(roles)) return false;
      const slugs = getUserRoleSlugs(user, roles);
      return Array.isArray(slugs) && slugs.some((slug) => ADMIN_BANNER_ROLES.includes(slug));
    } catch (err) {
      console.error("[AdminErrorBanner] Role check failed:", err);
      return false;
    }
  }, [roles, session]);

  const entries = useMemo(() => (Array.isArray(log) ? log : []), [log]);

  // Total occurrences, not entry count — a repeated error collapses into one
  // entry with a count, and that should still re-surface a dismissed banner.
  const totalErrors = useMemo(
    () =>
      entries.reduce((sum, entry) => {
        const count = Number(entry?.count);
        return sum + (Number.isFinite(count) && count > 0 ? count : 1);
      }, 0),
    [entries],
  );

  const latest = entries[entries.length - 1];
  const onSysAdmin = String(location?.pathname || "").startsWith("/sys-admin");

  if (!isAdmin) return null;
  if (totalErrors === 0) return null;
  if (totalErrors <= dismissedAtCount) return null;
  // The SysAdmin page renders the full error panel already; a banner pointing
  // at the page you are on is just noise.
  if (onSysAdmin) return null;

  const headline =
    totalErrors === 1 ? "Admin: Page error found" : `Admin: ${totalErrors} page errors found`;

  // Coerced explicitly: a non-string name/message would otherwise throw when
  // React tries to render it as a child.
  const latestSummary = latest
    ? [latest.name, latest.message].map((part) => String(part ?? "")).filter(Boolean).join(": ")
    : "";

  return (
    <div
      role="alert"
      className="w-full border-b border-rose-300 bg-rose-100 px-4 py-2 text-center text-sm text-rose-900"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-x-3 gap-y-1 sm:flex-row">
        <span className="font-semibold">{headline}</span>
        {latestSummary && (
          <span className="min-w-0 max-w-full truncate text-xs text-rose-700">
            {latestSummary}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-3">
          <Link
            to="/sys-admin"
            className="rounded-full border border-rose-400 px-3 py-0.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-200"
          >
            View details
          </Link>
          <button
            type="button"
            onClick={() => setDismissedAtCount(totalErrors)}
            className="text-xs font-semibold text-rose-700 underline"
          >
            Dismiss
          </button>
        </span>
      </div>
    </div>
  );
}
