import { createMatchLogEntry, type MatchLogInput } from "./matchLogService";
import { updateScore } from "./realtimeService";

export type ScoreUpdatePayload = {
  matchId: string;
  scoreA: number;
  scoreB: number;
};

export type OfflineQueueItem =
  | {
      id: string;
      kind: "match_log";
      payload: MatchLogInput;
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number;
    }
  | {
      id: string;
      kind: "score_update";
      payload: ScoreUpdatePayload;
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number;
    };

const DB_NAME = "stallcount-offline";
const DB_VERSION = 1;
const STORE_NAME = "queue";
const LOCAL_FALLBACK_KEY = "stallcount:offlineQueue:v1";

let dbPromise: Promise<IDBDatabase> | null = null;
let backend: "idb" | "local" | "memory" | null = null;
const memoryFallback: OfflineQueueItem[] = [];
let isProcessing = false;

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function canUseLocalStorage() {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function createRequestPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb() {
  if (dbPromise) return dbPromise;
  if (!canUseIndexedDb()) {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function ensureBackend() {
  if (backend) return backend;
  if (canUseIndexedDb()) {
    try {
      await openDb();
      backend = "idb";
      return backend;
    } catch {
      dbPromise = null;
    }
  }
  if (canUseLocalStorage()) {
    backend = "local";
    return backend;
  }
  backend = "memory";
  return backend;
}

function readLocalQueue() {
  if (backend === "memory") {
    return [...memoryFallback];
  }
  if (!canUseLocalStorage()) {
    return [...memoryFallback];
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as OfflineQueueItem[];
  } catch {
    return [];
  }
}

function writeLocalQueue(items: OfflineQueueItem[]) {
  if (backend === "memory") {
    memoryFallback.splice(0, memoryFallback.length, ...items);
    return;
  }
  if (!canUseLocalStorage()) {
    memoryFallback.splice(0, memoryFallback.length, ...items);
    return;
  }
  try {
    window.localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(items));
  } catch {
    memoryFallback.splice(0, memoryFallback.length, ...items);
  }
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    let result: T;

    run(store)
      .then((value) => {
        result = value;
      })
      .catch((err) => {
        tx.abort();
        reject(err);
      });

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function createQueueId(prefix = "queue") {
  const rand = Math.random().toString(16).slice(2);
  return `${prefix}-${Date.now()}-${rand}`;
}

export async function listOfflineQueue() {
  const backendToUse = await ensureBackend();
  if (backendToUse === "idb") {
    const items = await withStore("readonly", (store) =>
      createRequestPromise<OfflineQueueItem[]>(store.getAll()),
    );
    return (items || []).sort((a, b) => a.createdAt - b.createdAt);
  }
  const items = readLocalQueue();
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getOfflineQueueItem(id: string) {
  const backendToUse = await ensureBackend();
  if (backendToUse === "idb") {
    return withStore("readonly", (store) =>
      createRequestPromise<OfflineQueueItem | undefined>(store.get(id)),
    );
  }
  return readLocalQueue().find((item) => item.id === id);
}

async function saveOfflineQueueItem(item: OfflineQueueItem) {
  const backendToUse = await ensureBackend();
  if (backendToUse === "idb") {
    await withStore("readwrite", (store) =>
      createRequestPromise(store.put(item)),
    );
    return;
  }
  const items = readLocalQueue().filter((entry) => entry.id !== item.id);
  items.push(item);
  writeLocalQueue(items);
}

export async function removeOfflineQueueItem(id: string) {
  const backendToUse = await ensureBackend();
  if (backendToUse === "idb") {
    await withStore("readwrite", (store) =>
      createRequestPromise(store.delete(id)),
    );
    return;
  }
  const items = readLocalQueue().filter((entry) => entry.id !== id);
  writeLocalQueue(items);
}

export async function markOfflineQueueFailure(id: string) {
  const item = await getOfflineQueueItem(id);
  if (!item) return;
  const updated = {
    ...item,
    attempts: Math.max(0, (item.attempts ?? 0) + 1),
    lastAttemptAt: Date.now(),
  };
  await saveOfflineQueueItem(updated);
}

export async function enqueueMatchLogEntry(
  payload: MatchLogInput,
  options: { id?: string; attempts?: number; lastAttemptAt?: number; createdAt?: number } = {},
) {
  const item: OfflineQueueItem = {
    id: options.id || createQueueId("match-log"),
    kind: "match_log",
    payload,
    createdAt: Number.isFinite(options.createdAt) ? options.createdAt : Date.now(),
    attempts: Number.isFinite(options.attempts) ? Math.max(0, options.attempts) : 0,
    lastAttemptAt: Number.isFinite(options.lastAttemptAt)
      ? options.lastAttemptAt
      : undefined,
  };
  await saveOfflineQueueItem(item);
  return item;
}

export async function upsertScoreUpdate(
  payload: ScoreUpdatePayload,
  options: { id?: string; attempts?: number; lastAttemptAt?: number; createdAt?: number } = {},
) {
  const items = await listOfflineQueue();
  const remaining = items.filter(
    (item) => !(item.kind === "score_update" && item.payload.matchId === payload.matchId),
  );
  const nextItem: OfflineQueueItem = {
    id: options.id || createQueueId("score-update"),
    kind: "score_update",
    payload,
    createdAt: Number.isFinite(options.createdAt) ? options.createdAt : Date.now(),
    attempts: Number.isFinite(options.attempts) ? Math.max(0, options.attempts) : 0,
    lastAttemptAt: Number.isFinite(options.lastAttemptAt)
      ? options.lastAttemptAt
      : undefined,
  };
  remaining.push(nextItem);
  const backendToUse = await ensureBackend();
  if (backendToUse === "idb") {
    await withStore("readwrite", async (store) => {
      await createRequestPromise(store.clear());
      for (const item of remaining) {
        await createRequestPromise(store.put(item));
      }
      return undefined;
    });
  } else {
    writeLocalQueue(remaining);
  }
  return nextItem;
}

function getBackoffMs(attempts: number) {
  const safeAttempts = Number.isFinite(attempts) ? Math.max(0, attempts) : 0;
  const base = 2000;
  const max = 60000;
  return Math.min(max, base * Math.pow(2, Math.min(safeAttempts, 5)));
}

function shouldAttempt(item: OfflineQueueItem, now: number) {
  if (!item.lastAttemptAt) return true;
  const backoff = getBackoffMs(item.attempts ?? 0);
  return now - item.lastAttemptAt >= backoff;
}

export async function processOfflineQueue(options: {
  onItemSuccess?: (item: OfflineQueueItem) => void;
  onItemError?: (item: OfflineQueueItem, error: unknown) => void;
} = {}) {
  if (isProcessing) return { processed: 0, succeeded: 0, failed: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: true };
  }
  isProcessing = true;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  try {
    const items = await listOfflineQueue();
    const now = Date.now();
    for (const item of items) {
      if (!shouldAttempt(item, now)) {
        continue;
      }
      processed += 1;
      try {
        if (item.kind === "match_log") {
          await createMatchLogEntry(item.payload);
        } else if (item.kind === "score_update") {
          await updateScore(item.payload.matchId, item.payload.scoreA, item.payload.scoreB);
        }
        await removeOfflineQueueItem(item.id);
        succeeded += 1;
        options.onItemSuccess?.(item);
      } catch (error) {
        failed += 1;
        await markOfflineQueueFailure(item.id);
        options.onItemError?.(item, error);
      }
    }
  } finally {
    isProcessing = false;
  }
  return { processed, succeeded, failed };
}
