// Build identity, for answering "which build is this browser actually running?"
//
// A green Vercel deploy does not mean the browser is running that code: the
// service worker holds the previous bundle until it activates and the page
// reloads (see appUpdater.js). When new code appears to be missing, the first
// question is whether the client is stale or the deployment is. These values
// answer that without guesswork.
//
// __BUILD_SHA__ / __BUILD_TIME__ are substituted at build time by Vite
// (see the `define` block in vite.config.js).

import { clearAllCachedQueries } from "../utils/queryCache";

export const BUILD_SHA = __BUILD_SHA__;
export const BUILD_TIME = __BUILD_TIME__;

// Exposed on window so the running build can be read from a browser console on
// any device — including a phone in the field, where DevTools is not available
// but a remote console or a support prompt is.
export function publishBuildInfo() {
  if (typeof window === "undefined") return;

  window.__STALLCOUNT_BUILD__ = { sha: BUILD_SHA, builtAt: BUILD_TIME };

  console.info(
    `StallCount build ${BUILD_SHA} (built ${BUILD_TIME})`,
  );
}

// Compare the running build against the one the server is currently serving.
//
// index.html is fetched with cache: "no-store" so this bypasses both the HTTP
// cache and any stale service-worker response, giving the true deployed build.
// A mismatch means the client is running old code and has not yet reloaded onto
// the new one -- the exact condition that is otherwise invisible.
export async function fetchDeployedSha() {
  try {
    const response = await fetch("/index.html", { cache: "no-store" });
    if (!response.ok) return null;
    const html = await response.text();
    const match = html.match(/<meta name="build-sha" content="([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Returns { running, deployed, stale } — or null if the deployed build could
// not be determined (offline, fetch blocked), which is not the same as "fresh".
export async function checkBuildFreshness() {
  const deployed = await fetchDeployedSha();
  if (!deployed) return null;
  return {
    running: BUILD_SHA,
    deployed,
    stale: deployed !== BUILD_SHA,
  };
}

// Apply a pending update: swap onto the new bundle and reload onto fresh data.
//
// A plain location.reload() is not enough. The service worker serves the
// precached OLD bundle, so the page would come back on the same build it is
// already running. The waiting worker has to be activated (or the registration
// updated, if the new worker has not been picked up yet) before the reload, and
// the read-through query cache has to be dropped so the new code does not render
// data the old build cached.
//
// Best-effort throughout: every step is optional, and the reload happens even if
// the service worker is unavailable (unsupported browser, dev server, private
// mode), because on those paths a plain reload does fetch the new bundle anyway.
export async function applyAppUpdate() {
  try {
    clearAllCachedQueries();
  } catch {
    // Cache clearing must never block the reload.
  }

  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        // Pull the newest worker in case this tab has not noticed the deploy.
        await registration.update().catch(() => {});
        const waiting = registration.waiting;
        if (waiting) {
          // sw.js listens for SKIP_WAITING and activates immediately.
          waiting.postMessage({ type: "SKIP_WAITING" });
          // Give the new worker a moment to take control so the reload below is
          // served the new bundle. Capped so a worker that never activates
          // cannot leave the user staring at a spinner.
          await waitForControllerChange(3000);
        }
      }
    } catch {
      // Fall through to the reload regardless.
    }
  }

  window.location.reload();
}

function waitForControllerChange(timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", finish);
      resolve();
    }
    navigator.serviceWorker.addEventListener("controllerchange", finish);
    setTimeout(finish, timeoutMs);
  });
}
