// Manual "check for updates" control for the user account page.
//
// The app already updates itself in the background (see appUpdater.js), but that
// path is invisible and is deliberately deferred while a match is live. This
// gives the user an explicit way to ask "am I on the latest build?" and to force
// the swap — useful in the field when someone has been told a fix is deployed
// and needs to confirm their device actually has it.
//
// The version code is the short commit SHA: BUILD_SHA is compiled into this
// bundle, and the deployed SHA is read from an uncached fetch of index.html.

import { useCallback, useEffect, useRef, useState } from "react";
import { Panel } from "./ui/primitives";
import { BUILD_SHA, BUILD_TIME, applyAppUpdate, checkBuildFreshness } from "../services/buildInfo";

// idle | checking | current | outdated | error
const STATUS_IDLE = "idle";

function formatBuildTime(value) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString();
  } catch {
    return null;
  }
}

function IconRefresh({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

export default function AppUpdateChecker() {
  const [status, setStatus] = useState(STATUS_IDLE);
  const [deployedSha, setDeployedSha] = useState(null);
  const [updating, setUpdating] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleCheck = useCallback(async () => {
    setStatus("checking");
    setDeployedSha(null);

    // Offline is a known answer, not a failure to report as an error.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      if (isMountedRef.current) setStatus("offline");
      return;
    }

    const result = await checkBuildFreshness();
    if (!isMountedRef.current) return;

    if (!result) {
      setStatus("error");
      return;
    }

    setDeployedSha(result.deployed);
    setStatus(result.stale ? "outdated" : "current");
  }, []);

  const handleUpdate = useCallback(async () => {
    setUpdating(true);
    try {
      await applyAppUpdate();
    } catch {
      // applyAppUpdate reloads on its own; if it threw before reloading, the
      // button has to become usable again rather than stay stuck on "Updating".
      if (isMountedRef.current) {
        setUpdating(false);
        setStatus("error");
      }
    }
  }, []);

  const builtAt = formatBuildTime(BUILD_TIME);
  const isOutdated = status === "outdated";

  return (
    <>
      <section className="space-y-3 border-t border-border pt-3 sm:space-y-4 sm:pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">App version</p>
        <Panel variant="muted" className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Installed version
              </p>
              <p className="font-mono text-sm font-semibold text-ink">{BUILD_SHA}</p>
              {builtAt ? <p className="text-xs text-ink-muted">Built {builtAt}</p> : null}
            </div>
            <button
              type="button"
              className="sc-button is-ghost shrink-0"
              onClick={handleCheck}
              disabled={status === "checking"}
            >
              <IconRefresh
                className={`mr-2 inline h-4 w-4 ${status === "checking" ? "animate-spin" : ""}`}
              />
              {status === "checking" ? "Checking..." : "Check for updates"}
            </button>
          </div>

          <p className="text-sm text-ink-muted" role="status" aria-live="polite">
            {status === STATUS_IDLE
              ? "Check whether a newer version of StallCount has been released."
              : null}
            {status === "checking" ? "Checking for a newer version..." : null}
            {status === "current" ? "You are running the latest version." : null}
            {status === "outdated" ? (
              <span className="font-semibold text-warning-ink">
                A newer version is available ({deployedSha}).
              </span>
            ) : null}
            {status === "offline"
              ? "You are offline. Reconnect to check for a newer version."
              : null}
            {status === "error"
              ? "Could not reach the update server. Try again in a moment."
              : null}
          </p>
        </Panel>
      </section>

      {isOutdated ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-3 py-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-update-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !updating) {
              setStatus(STATUS_IDLE);
            }
          }}
        >
          <Panel
            variant="light"
            className="w-full max-w-md space-y-4 p-5 shadow-2xl shadow-black/20 sm:p-6"
          >
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
                Update available
              </p>
              <h3
                id="app-update-title"
                className="text-lg font-bold text-[var(--sc-surface-light-ink)]"
              >
                A new version of StallCount is ready
              </h3>
              <p className="text-sm text-[var(--sc-surface-light-ink)]/75">
                Updating reloads the app to load the new version and refresh all data. Any unsaved
                work on this page will be lost.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--sc-surface-light-ink)]/70">
              <span>{BUILD_SHA}</span>
              <span aria-hidden="true">&rarr;</span>
              <span className="font-semibold text-[var(--sc-surface-light-ink)]">{deployedSha}</span>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="sc-button is-ghost"
                onClick={() => setStatus(STATUS_IDLE)}
                disabled={updating}
              >
                Not now
              </button>
              <button type="button" className="sc-button" onClick={handleUpdate} disabled={updating}>
                {updating ? "Updating..." : "Update app"}
              </button>
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
