const SESSION_VERSION = 1;
export const SCOREKEEPER_SESSION_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getStorageKey(userId) {
  const suffix = userId ? String(userId) : "guest";
  return `scorekeeper:session:${suffix}`;
}

export function loadScorekeeperSession(userId) {
  const storage = getStorage();
  if (!storage || !userId) return null;

  const key = getStorageKey(userId);
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    const record = JSON.parse(raw);
    if (!record || record.version !== SESSION_VERSION) {
      storage.removeItem(key);
      return null;
    }

    if (typeof record.expiresAt === "number" && record.expiresAt < Date.now()) {
      storage.removeItem(key);
      return null;
    }

    return record;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function saveScorekeeperSession(userId, data) {
  const storage = getStorage();
  if (!storage || !userId || !data) return;

  const key = getStorageKey(userId);
  const now = Date.now();

  const record = {
    version: SESSION_VERSION,
    userId,
    updatedAt: now,
    expiresAt: now + SCOREKEEPER_SESSION_TTL_MS,
    data: {
      ...data,
      updatedAt: now,
    },
  };

  try {
    storage.setItem(key, JSON.stringify(record));
  } catch {
    // Ignore quota/storage errors to avoid breaking the console.
  }
}

export function clearScorekeeperSession(userId) {
  const storage = getStorage();
  if (!storage || !userId) return;
  storage.removeItem(getStorageKey(userId));
}
