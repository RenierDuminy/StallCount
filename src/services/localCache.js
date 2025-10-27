import { openDB } from "idb";

const DB_NAME = "stallcount-cache";
const STORE = "pending-updates";

export const dbPromise = openDB(DB_NAME, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE)) {
      db.createObjectStore(STORE, { keyPath: "id" });
    }
  },
});

// ✅ Save a local update when offline
export async function cacheUpdate(update) {
  const db = await dbPromise;
  await db.put(STORE, update);
}

// ✅ Get all cached updates waiting to sync
export async function getCachedUpdates() {
  const db = await dbPromise;
  return await db.getAll(STORE);
}

// ✅ Remove a cached update once synced
export async function clearCachedUpdate(id) {
  const db = await dbPromise;
  await db.delete(STORE, id);
}
