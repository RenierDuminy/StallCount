// Per-match rule overrides, persisted locally.
//
// The scorekeeper's `rules` state is the FLAT normalized shape (matchDuration,
// timeoutSeconds, ...) while `normalizeEventRules()` parses the NESTED raw shape
// (game.timeCapMinutes, timeouts.durationSeconds, ...). We store and read back the
// flat shape directly so no lossy round-trip through the normalizer is needed.
//
// Scope: this is localStorage, so overrides are per-device and per-browser. They
// survive reloads, navigation and the scorekeeper session TTL, but they do not
// follow the user to another device and are lost if site data is cleared.

const STORE_VERSION = 1;
const KEY_PREFIX = "scorekeeper:matchRules:";
// Overrides outlive a session deliberately; prune only so storage cannot grow forever.
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 90; // 90 days

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getStorageKey(matchId) {
  return `${KEY_PREFIX}${matchId}`;
}

export function loadMatchRules(matchId) {
  const storage = getStorage();
  if (!storage || !matchId) return null;

  const key = getStorageKey(matchId);
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    const record = JSON.parse(raw);
    if (!record || record.version !== STORE_VERSION || !record.rules) {
      storage.removeItem(key);
      return null;
    }
    if (
      typeof record.updatedAt === "number" &&
      Date.now() - record.updatedAt > MAX_AGE_MS
    ) {
      storage.removeItem(key);
      return null;
    }
    return record.rules;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function saveMatchRules(matchId, rules) {
  const storage = getStorage();
  if (!storage || !matchId || !rules) return false;

  const record = {
    version: STORE_VERSION,
    matchId,
    updatedAt: Date.now(),
    rules,
  };

  try {
    storage.setItem(getStorageKey(matchId), JSON.stringify(record));
    return true;
  } catch {
    // Quota or private-mode failure: never break the console over a settings save.
    return false;
  }
}

export function clearMatchRules(matchId) {
  const storage = getStorage();
  if (!storage || !matchId) return;
  try {
    storage.removeItem(getStorageKey(matchId));
  } catch {
    // Ignore storage errors.
  }
}

// Drop expired entries so abandoned matches cannot accumulate indefinitely.
export function pruneStoredMatchRules() {
  const storage = getStorage();
  if (!storage) return;
  try {
    const staleKeys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      try {
        const record = JSON.parse(storage.getItem(key));
        const updatedAt = record?.updatedAt;
        if (
          record?.version !== STORE_VERSION ||
          (typeof updatedAt === "number" && Date.now() - updatedAt > MAX_AGE_MS)
        ) {
          staleKeys.push(key);
        }
      } catch {
        staleKeys.push(key);
      }
    }
    staleKeys.forEach((key) => storage.removeItem(key));
  } catch {
    // Ignore storage errors.
  }
}
