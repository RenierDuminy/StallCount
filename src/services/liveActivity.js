// Tracks whether a foreground activity is in progress that should NOT be
// interrupted by an automatic page reload (e.g. a live scorekeeper or
// scrimmage session). The PWA auto-update manager consults isLiveActivity()
// before reloading the page when a new build is deployed.

const activeKeys = new Set();
const listeners = new Set();

function notify() {
  const active = activeKeys.size > 0;
  listeners.forEach((fn) => {
    try {
      fn(active);
    } catch {
      // ignore listener errors
    }
  });
}

/**
 * Mark a live activity as active or inactive.
 * @param {string} key - a stable identifier for the activity (e.g. "scorekeeper", "scrimmage").
 * @param {boolean} active - whether that activity is currently live.
 */
export function setLiveActivity(key, active) {
  if (!key) return;
  const had = activeKeys.has(key);
  if (active && !had) {
    activeKeys.add(key);
    notify();
  } else if (!active && had) {
    activeKeys.delete(key);
    notify();
  }
}

/** @returns {boolean} true if any live activity is currently in progress. */
export function isLiveActivity() {
  return activeKeys.size > 0;
}

/**
 * Subscribe to live-activity changes. Fires immediately with the current state.
 * @param {(active: boolean) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onLiveActivityChange(listener) {
  listeners.add(listener);
  listener(activeKeys.size > 0);
  return () => listeners.delete(listener);
}
