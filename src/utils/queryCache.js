const CACHE_PREFIX = "sc:queryCache";
// v3: entries now store `updatedAt` first so the size index can read it without
// parsing; older versions are deleted on startup (see getPersistedIndex).
const CACHE_VERSION = 3;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
// Past this age a cached value is not worth showing at all: it is treated as a
// miss, so the page shows its loading state instead of days-old data.
const DEFAULT_MAX_STALE_MS = 24 * 60 * 60 * 1000;
// localStorage is shared with the Supabase session. If the cache fills it, the
// session write after a Google sign-in throws and the user lands logged out, so
// the cache keeps itself to a fraction of the ~5M-character browser quota.
// Sizes are in characters (key + value), which is what browsers count.
const MAX_PERSISTED_TOTAL_CHARS = 1500 * 1000;
// A single entry bigger than this lives in memory only.
const MAX_PERSISTED_ENTRY_CHARS = 300 * 1000;

const memoryCache = new Map();
const inflight = new Map();
// Per-key listeners, so a mounted view learns about a background revalidation
// instead of keeping whatever value it was first handed.
const listeners = new Map();

function notify(key) {
  const set = listeners.get(key);
  if (!set) return;
  const entry = memoryCache.get(key) ?? null;
  set.forEach((listener) => {
    try {
      listener(entry);
    } catch (error) {
      console.error("[queryCache] Listener failed:", error);
    }
  });
}

function didPageLoadFromManualReload() {
  if (typeof window === "undefined") return false;
  try {
    const entries = window.performance?.getEntriesByType?.("navigation");
    if (Array.isArray(entries) && entries.length > 0) {
      return entries.some((entry) => entry?.type === "reload");
    }
    // Legacy fallback for browsers without Navigation Timing Level 2.
    return window.performance?.navigation?.type === 1;
  } catch {
    return false;
  }
}

const FORCE_FRESH_FETCH_ON_PAGE_RELOAD = didPageLoadFromManualReload();
// After a manual reload, only the FIRST read of each key must skip the cache:
// that is what "refresh" asks for. Once a key has been written during this page
// load it is fresh, and later reads (revisiting a page, another page sharing
// the key) use the cache normally. Without this, one reload turned the cache
// off for the rest of the session and every page waited on the network.
const writtenSincePageLoad = new Set();

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function buildKey(rawKey) {
  return `${CACHE_PREFIX}:v${CACHE_VERSION}:${rawKey}`;
}

const CURRENT_PREFIX = buildKey("");
const STORED_UPDATED_AT_PATTERN = /^\{"updatedAt":(\d+)/;

// key -> { size, updatedAt } for every entry of this version in localStorage.
// Built once by scanning storage; the scan also deletes entries left by older
// cache versions, which would otherwise sit there using quota forever.
let persistedIndex = null;

function getPersistedIndex(storage) {
  if (persistedIndex) return persistedIndex;
  persistedIndex = new Map();
  try {
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (!key || !key.startsWith(CACHE_PREFIX)) continue;
      const raw = key.startsWith(CURRENT_PREFIX) ? storage.getItem(key) || "" : "";
      const match = raw.match(STORED_UPDATED_AT_PATTERN);
      if (!match) {
        storage.removeItem(key);
        continue;
      }
      persistedIndex.set(key, { size: key.length + raw.length, updatedAt: Number(match[1]) });
    }
  } catch {
    // Ignore storage errors; the index just starts out incomplete.
  }
  return persistedIndex;
}

function removePersisted(storage, key) {
  getPersistedIndex(storage).delete(key);
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
}

// Deletes the oldest persisted entries until the cache's total is <= limit.
function evictPersistedUntil(storage, limit) {
  const index = getPersistedIndex(storage);
  let total = 0;
  index.forEach(({ size }) => {
    total += size;
  });
  if (total <= limit) return;
  const oldestFirst = [...index.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  for (const [key, { size }] of oldestFirst) {
    if (total <= limit) break;
    removePersisted(storage, key);
    total -= size;
  }
}

function persistEntry(storage, key, entry) {
  // `updatedAt` first, so the index scan can read it without parsing the value.
  const raw = JSON.stringify({ updatedAt: entry.updatedAt, value: entry.value });
  const size = key.length + raw.length;
  removePersisted(storage, key);
  if (size > MAX_PERSISTED_ENTRY_CHARS) return;

  evictPersistedUntil(storage, MAX_PERSISTED_TOTAL_CHARS - size);
  try {
    storage.setItem(key, raw);
  } catch {
    // Storage is full of something else. Give up the whole cache rather than
    // compete with the session for space, then try once more.
    evictPersistedUntil(storage, 0);
    try {
      storage.setItem(key, raw);
    } catch {
      return;
    }
  }
  getPersistedIndex(storage).set(key, { size, updatedAt: entry.updatedAt });
}

// Purge old versions at startup, before anything else writes to storage.
{
  const storage = getStorage();
  if (storage) getPersistedIndex(storage);
}

function readCacheEntry(key) {
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.updatedAt !== "number") {
      removePersisted(storage, key);
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    removePersisted(storage, key);
    return null;
  }
}

function writeCacheEntry(key, value) {
  const entry = {
    value,
    updatedAt: Date.now(),
  };
  memoryCache.set(key, entry);
  writtenSincePageLoad.add(key);

  const storage = getStorage();
  if (storage) {
    persistEntry(storage, key, entry);
  }

  notify(key);
}

function isFresh(entry, ttlMs) {
  return Date.now() - entry.updatedAt < ttlMs;
}

function isUsable(entry, maxStaleMs) {
  return Boolean(entry) && Date.now() - entry.updatedAt < maxStaleMs;
}

function fetchAndCache(key, fetcher) {
  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      writeCacheEntry(key, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export async function getCachedQuery(rawKey, fetcher, options = {}) {
  const {
    ttlMs = DEFAULT_TTL_MS,
    staleWhileRevalidate = true,
    forceRefresh = false,
    refreshOnPageReload = true,
    maxStaleMs = DEFAULT_MAX_STALE_MS,
  } = options;
  const key = buildKey(rawKey);
  const entry = readCacheEntry(key);
  const cached = isUsable(entry, maxStaleMs) ? entry : null;

  const forceAfterReload =
    refreshOnPageReload && FORCE_FRESH_FETCH_ON_PAGE_RELOAD && !writtenSincePageLoad.has(key);

  if (forceRefresh || forceAfterReload) {
    try {
      return await fetchAndCache(key, fetcher);
    } catch (error) {
      if (cached) {
        return cached.value;
      }
      throw error;
    }
  }

  if (cached) {
    const fresh = isFresh(cached, ttlMs);
    if (fresh || staleWhileRevalidate) {
      if (!fresh) {
        // A failed background revalidation keeps the cached value; listeners
        // simply hear nothing.
        fetchAndCache(key, fetcher).catch((error) => {
          console.error(`[queryCache] Background refresh failed for ${rawKey}:`, error);
        });
      }
      return cached.value;
    }
  }

  return fetchAndCache(key, fetcher);
}

/**
 * Synchronous read for a first render: returns `{ value, updatedAt }` when a
 * usable entry exists, otherwise null. Never fetches.
 */
export function peekCachedQuery(rawKey, options = {}) {
  const { maxStaleMs = DEFAULT_MAX_STALE_MS } = options;
  const entry = readCacheEntry(buildKey(rawKey));
  return isUsable(entry, maxStaleMs) ? entry : null;
}

/**
 * Calls `listener(entry | null)` whenever the key is written or invalidated.
 * Returns an unsubscribe function.
 */
export function subscribeCachedQuery(rawKey, listener) {
  const key = buildKey(rawKey);
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0 && listeners.get(key) === set) {
      listeners.delete(key);
    }
  };
}

export function invalidateCachedQuery(rawKey) {
  const key = buildKey(rawKey);
  memoryCache.delete(key);
  const storage = getStorage();
  if (storage) {
    removePersisted(storage, key);
  }
  notify(key);
}

// Drop every cached read, in both layers. Used when applying an app update:
// the new build may read data whose shape has changed, so nothing cached by the
// old build should survive the reload.
export function clearAllCachedQueries() {
  memoryCache.clear();
  persistedIndex = null;

  const storage = getStorage();
  if (!storage) return;
  try {
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage errors.
  }
}

export function invalidateCachedQueries(prefix) {
  const storage = getStorage();
  const scopedPrefix = buildKey(prefix);
  memoryCache.forEach((_value, key) => {
    if (key.startsWith(scopedPrefix)) {
      memoryCache.delete(key);
    }
  });

  if (storage) {
    try {
      for (let i = storage.length - 1; i >= 0; i -= 1) {
        const key = storage.key(i);
        if (key && key.startsWith(scopedPrefix)) {
          removePersisted(storage, key);
        }
      }
    } catch {
      // Ignore storage errors.
    }
  }

  // Mounted views on an invalidated key refetch in response.
  listeners.forEach((_set, key) => {
    if (key.startsWith(scopedPrefix)) {
      notify(key);
    }
  });
}
