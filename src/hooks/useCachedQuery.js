import { useCallback, useEffect, useRef, useState } from "react";
import { peekCachedQuery, subscribeCachedQuery } from "../utils/queryCache";

const DEFAULT_TTL_MS = 60 * 1000;

function isHidden() {
  return typeof document !== "undefined" && document.hidden;
}

function readInitial(key, enabled) {
  if (!enabled || !key) return { data: undefined, updatedAt: null };
  const entry = peekCachedQuery(key);
  return entry ? { data: entry.value, updatedAt: entry.updatedAt } : { data: undefined, updatedAt: null };
}

/**
 * Reads a cached service query and keeps it current.
 *
 * `key` must be the same raw cache key the service passes to `getCachedQuery`,
 * so this hook can draw the cached value on the first render and hear about
 * background revalidations. `fetcher({ forceRefresh })` is the service call.
 *
 *  - First render uses whatever the cache already holds, so a returning
 *    visitor sees data immediately rather than after an effect and a promise.
 *  - Any write to the key (a background revalidation, another view's fetch, an
 *    invalidation after an edit) updates this view.
 *  - Returning to the tab, regaining focus or coming back online refetches if
 *    the data is older than `ttlMs`.
 *
 * `isLoading` is true only while there is no data at all; pages show their
 * shell with skeletons for that case and refresh quietly otherwise.
 */
export function useCachedQuery(key, fetcher, options = {}) {
  const {
    ttlMs = DEFAULT_TTL_MS,
    enabled = true,
    refetchInterval = null,
    refetchOnFocus = true,
  } = options;
  const active = Boolean(enabled && key);

  const [state, setState] = useState(() => ({
    key,
    ...readInitial(key, active),
    error: null,
    isFetching: false,
  }));

  // A new key means a different query: start from that key's cache, not the
  // previous key's data. Adjusting state during render avoids a frame of
  // mismatched data.
  if (state.key !== key) {
    const next = { key, ...readInitial(key, active), error: null, isFetching: false };
    setState(next);
  }

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const updatedAtRef = useRef(state.updatedAt);
  updatedAtRef.current = state.key === key ? state.updatedAt : null;

  const runFetch = useCallback(
    async ({ force = false } = {}) => {
      if (!active) return undefined;
      setState((prev) => (prev.key === key ? { ...prev, isFetching: true } : prev));
      try {
        const value = await fetcherRef.current({ forceRefresh: force });
        setState((prev) =>
          prev.key === key
            ? {
                ...prev,
                data: value,
                updatedAt: peekCachedQuery(key)?.updatedAt ?? Date.now(),
                error: null,
                isFetching: false,
              }
            : prev,
        );
        return value;
      } catch (error) {
        setState((prev) => (prev.key === key ? { ...prev, error, isFetching: false } : prev));
        return undefined;
      }
    },
    [active, key],
  );

  const refetchIfStale = useCallback(() => {
    const updatedAt = updatedAtRef.current;
    if (!updatedAt || Date.now() - updatedAt >= ttlMs) {
      void runFetch({ force: Boolean(updatedAt) });
    }
  }, [runFetch, ttlMs]);

  // Initial load. `getCachedQuery` returns the cached value and revalidates in
  // the background when stale; the subscription below delivers that result.
  useEffect(() => {
    if (!active) return;
    void runFetch();
  }, [active, runFetch]);

  useEffect(() => {
    if (!active) return undefined;
    return subscribeCachedQuery(key, (entry) => {
      if (entry) {
        setState((prev) =>
          prev.key === key && entry.updatedAt !== prev.updatedAt
            ? { ...prev, data: entry.value, updatedAt: entry.updatedAt, error: null }
            : prev,
        );
      } else {
        // Invalidated (usually after an edit): fetch again, keeping the old
        // value on screen until the new one lands.
        void runFetch({ force: true });
      }
    });
  }, [active, key, runFetch]);

  useEffect(() => {
    if (!active || !refetchOnFocus || typeof window === "undefined") return undefined;
    const handleVisible = () => {
      if (!isHidden()) refetchIfStale();
    };
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", handleVisible);
    window.addEventListener("online", handleVisible);
    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", handleVisible);
      window.removeEventListener("online", handleVisible);
    };
  }, [active, refetchOnFocus, refetchIfStale]);

  useEffect(() => {
    if (!active || !refetchInterval) return undefined;
    const timer = setInterval(() => {
      // Nobody can read a hidden tab; the visibility listener catches up.
      if (isHidden()) return;
      void runFetch({ force: true });
    }, refetchInterval);
    return () => clearInterval(timer);
  }, [active, refetchInterval, runFetch]);

  const current = state.key === key ? state : { data: undefined, updatedAt: null, error: null, isFetching: false };
  const hasData = current.data !== undefined;

  return {
    data: current.data,
    error: current.error,
    updatedAt: current.updatedAt,
    isLoading: active && !hasData && !current.error,
    isRefreshing: hasData && current.isFetching,
    refetch: runFetch,
  };
}
