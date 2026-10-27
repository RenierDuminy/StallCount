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
//
// A newer version is applied straight away rather than offered in a dialog: the
// background updater reloads onto a downloaded build regardless, so a "Not now"
// could not be honoured and only made the update look unreliable. Every step is
// shown (found → downloading → reload → "Updated to …"), so the user sees the
// update happen instead of being told "latest" and then watching the app reload.

import { useCallback, useEffect, useRef, useState } from "react";
import { Panel } from "./ui/primitives";
import {
  BUILD_SHA,
  BUILD_TIME,
  applyAppUpdate,
  checkBuildFreshness,
  consumeUpdateNotice,
} from "../services/buildInfo";

// idle | checking | current | updating | updated | offline | error
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
  // Read once: an update reload just landed here, so confirm it.
  const [updateNotice] = useState(() => consumeUpdateNotice());
  const [status, setStatus] = useState(() => (updateNotice ? "updated" : STATUS_IDLE));
  const [deployedSha, setDeployedSha] = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);
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
    if (!result.stale) {
      setCheckedAt(new Date());
      setStatus("current");
      return;
    }

    setStatus("updating");
    try {
      await applyAppUpdate();
    } catch {
      // applyAppUpdate reloads on its own; if it threw before reloading, the
      // button has to become usable again rather than stay stuck on "Updating".
      if (isMountedRef.current) setStatus("error");
    }
  }, []);

  const builtAt = formatBuildTime(BUILD_TIME);
  const busy = status === "checking" || status === "updating";

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
              disabled={busy}
            >
              <IconRefresh className={`mr-2 inline h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              {status === "checking" ? "Checking..." : status === "updating" ? "Updating..." : "Check for updates"}
            </button>
          </div>

          <p className="text-sm text-ink-muted" role="status" aria-live="polite">
            {status === STATUS_IDLE
              ? "Check whether a newer version of StallCount has been released."
              : null}
            {status === "checking" ? "Checking for a newer version..." : null}
            {status === "current"
              ? `You are running the latest version. Checked with the server at ${checkedAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
              : null}
            {status === "updating" ? (
              <span className="font-semibold text-ink">
                Version <span className="font-mono">{deployedSha}</span> found. Downloading it now; the
                app will reload when it is ready.
              </span>
            ) : null}
            {status === "updated" ? (
              <span className="font-semibold text-ink">
                Updated to <span className="font-mono">{updateNotice?.to}</span> (was{" "}
                <span className="font-mono">{updateNotice?.from}</span>).
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
    </>
  );
}
