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
}

// Reload now if it is safe, otherwise wait until no live activity is running.
function reloadWhenSafe() {
  if (reloadPending) return;
  reloadPending = true;

  if (!isLiveActivity()) {
    doReload();
    return;
  }

  // A match is live — defer. Reload when the activity ends, or on the next
  // navigation away from the current view (pagehide covers back/forward/close
  // and in-app navigations that unload the document).
  const stop = onLiveActivityChange((active) => {
    if (!active) {
      stop();
      doReload();
    }
  });

  const onPageHide = () => doReload();
  window.addEventListener("pagehide", onPageHide, { once: true });
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
