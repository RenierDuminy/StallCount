// Automatic PWA update handling.
//
// When a new build is deployed, vite-plugin-pwa produces a new service worker
// and a new precached bundle. The running page keeps executing the OLD
// JavaScript until it is reloaded, which is why updates otherwise require a
// manual refresh. This module detects the new version and reloads the page
// automatically to load the new code.
//
// Because a code update can only be applied by reloading the whole page (there
// is no per-section hot-swap in production), the reload is full-page. To avoid
// interrupting a live match, the reload is deferred while a scorekeeper or
// scrimmage session is active (see liveActivity.js); it fires as soon as the
// activity ends or on the next navigation.

import { isLiveActivity, onLiveActivityChange } from "./liveActivity";

// How often to poll the server for a new service worker (a deploy that happens
// while the tab stays open). 30 minutes is a reasonable balance.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

let reloadPending = false;
let hasReloaded = false;

function doReload() {
  if (hasReloaded) return;
  hasReloaded = true;
  window.location.reload();

  // reload() is asynchronous and can be refused (a beforeunload prompt the user
  // dismisses, or a bfcache restore). If this code is still running shortly
  // after, the navigation did not happen -- clear both latches so a later
  // update attempt is not silently swallowed.
  setTimeout(() => {
    hasReloaded = false;
    reloadPending = false;
  }, 5000);
}

// Reload now if it is safe, otherwise wait until no live activity is running.
//
// The deferred path must be careful with `pagehide`: on mobile it fires when the
// tab is merely backgrounded, and the page is then restored from the bfcache
// rather than unloaded. Treating that as an unload would mark the reload as
// done while the old bundle is still running, leaving the tab pinned to the old
// build forever (every later controllerchange would return at the guard below).
// So a bfcache restore explicitly releases the latch and re-arms the update.
function reloadWhenSafe() {
  if (reloadPending) return;
  reloadPending = true;

  if (!isLiveActivity()) {
    doReload();
    return;
  }

  // Declared before the subscription below: onLiveActivityChange invokes its
  // listener synchronously with the current state, so `stop` must already be
  // assignable by the time the listener can run.
  let stop = () => {};

  function cleanup() {
    stop();
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
  }

  // A match is live — defer until it ends, or until the document really unloads.
  stop = onLiveActivityChange((active) => {
    if (!active) {
      cleanup();
      doReload();
    }
  });

  // Only reload here if the match has genuinely finished; otherwise let the
  // live-activity listener above own the timing.
  function onPageHide() {
    if (!isLiveActivity()) {
      cleanup();
      doReload();
    }
  }

  // Restored from the bfcache: the page never unloaded and is still on the old
  // bundle. Release the latch so a future controllerchange can retry.
  function onPageShow(event) {
    if (event.persisted) {
      cleanup();
      reloadPending = false;
    }
  }

  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
}

export async function registerAutoUpdate() {
  if (!("serviceWorker" in navigator)) return;

  const { registerSW } = await import("virtual:pwa-register");

  const updateSW = registerSW({
    immediate: true,
    // Fired when a new service worker has been installed and is waiting.
    onNeedRefresh() {
      // Activate the waiting worker; controllerchange (below) then reloads.
      void updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Poll periodically so long-lived tabs pick up deploys without a manual
      // check. The first check happens immediately via registerSW(immediate).
      setInterval(() => {
        // Only check when the tab is visible and online to avoid useless work.
        if (document.visibilityState === "visible" && navigator.onLine) {
          registration.update().catch(() => {});
        }
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  // When the new service worker takes control, the fresh bundle is available.
  // Reload (deferred if a match is live) so the page runs the new code.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    reloadWhenSafe();
  });

  // Re-check for updates whenever the tab regains focus.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.update().catch(() => {});
      });
    }
  });
}
