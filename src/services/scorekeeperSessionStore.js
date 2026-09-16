const SESSION_VERSION = 1;

/**
 * Sessions are namespaced by format so two formats cannot clobber each other.
 *
 * The replaced 7v7 and 5v5 consoles both wrote one un-namespaced key and told
 * themselves apart by a `ruleset` field inside the payload, so starting one
 * format discarded a live session of the other. The scorekeeper console always
 * passes a format, so that key is no longer written; the fallback below only
 * guards a caller that omits the argument.
 *
 * Any session still sitting under the old key belongs to a console that no
 * longer exists and is never read. It expires on its own via the TTL, so there
 * is nothing to migrate — a match that was live across the switchover is
 * resumed from the database like any other, not from that snapshot.
 */
export const SCOREKEEPER_SESSION_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getStorageKey(userId, format) {
  const suffix = userId ? String(userId) : "guest";
  if (!format) return `scorekeeper:session:${suffix}`;
  return `scorekeeper:session:${format}:${suffix}`;
}

export function loadScorekeeperSession(userId, format) {
  const storage = getStorage();
  if (!storage || !userId) return null;

  const key = getStorageKey(userId, format);
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

export function saveScorekeeperSession(userId, data, format) {
  const storage = getStorage();
  if (!storage || !userId || !data) return;

  const key = getStorageKey(userId, format);
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

export function clearScorekeeperSession(userId, format) {
  const storage = getStorage();
  if (!storage || !userId) return;
  storage.removeItem(getStorageKey(userId, format));
}
