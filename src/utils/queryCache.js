const CACHE_PREFIX = "sc:queryCache";
const CACHE_VERSION = 1;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

const memoryCache = new Map();
const inflight = new Map();

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
      storage.removeItem(key);
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

function writeCacheEntry(key, value) {
  const entry = {
    value,
    updatedAt: Date.now(),
  };
  memoryCache.set(key, entry);

  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore quota/storage errors to avoid breaking runtime queries.
  }
}

function isFresh(entry, ttlMs) {
  return Date.now() - entry.updatedAt < ttlMs;
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
  const { ttlMs = DEFAULT_TTL_MS, staleWhileRevalidate = true, forceRefresh = false } = options;
  const key = buildKey(rawKey);
  const cached = readCacheEntry(key);

  if (forceRefresh || FORCE_FRESH_FETCH_ON_PAGE_RELOAD) {
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
        void fetchAndCache(key, fetcher);
      }
      return cached.value;
    }
  }

  return fetchAndCache(key, fetcher);
}

export function invalidateCachedQuery(rawKey) {
  const key = buildKey(rawKey);
  memoryCache.delete(key);
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
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

  if (!storage) return;
  try {
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (key && key.startsWith(scopedPrefix)) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage errors.
  }
}
