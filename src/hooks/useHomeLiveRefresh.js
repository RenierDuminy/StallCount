import { useEffect, useRef } from "react";

// Idle safety net. Nothing is live, but a match scheduled for 17:00 has to be
// noticed by a tab that was opened at 16:45. This is the only traffic the home
// page generates while the league is quiet, so it is deliberately slow.
const IDLE_POLL_INTERVAL_MS = 2 * 60 * 1000;

// While a match is live. The home summaries are edge-cached for about 15 s
// (api/home-summary.js), so polling faster than this would mostly re-read the
// same cached copy.
const LIVE_POLL_INTERVAL_MS = 30 * 1000;

/**
 * Keeps the home page's live surfaces current by polling, switched between two
 * cadences by `hasLiveMatches`: every 30 s while something is live, every
 * 2 min otherwise. A hidden tab does not poll; returning to it refreshes at
 * once.
 *
 * There is deliberately no Supabase Realtime channel here (removed
 * 2026-11-14). The home page is the one page every visitor opens, and a
 * channel per viewer on all `matches` updates meant every score fanned out to
 * every open tab, each change was checked against RLS once per subscriber, and
 * the plan's realtime connection cap became the limit on how many people could
 * watch. The data is the same for everyone, so a shared, edge-cached poll is
 * cheaper and scales. The match page keeps its own realtime channel for the
 * one match it shows.
 *
 * `onRefresh` is held in a ref, so changing it does not restart the timer.
 */
export function useHomeLiveRefresh({ hasLiveMatches, onRefresh, enabled = true }) {
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return undefined;

    let isActive = true;
    let isRefreshing = false;

    // Guards against overlapping refetches (a poll landing while the
    // visibility refresh is still running).
    const runRefresh = async () => {
      if (!isActive || isRefreshing) return;
      isRefreshing = true;
      try {
        await onRefreshRef.current?.();
      } catch (err) {
        console.error("[useHomeLiveRefresh] Refresh failed:", err);
      } finally {
        isRefreshing = false;
      }
    };

    const pollIntervalMs = hasLiveMatches ? LIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS;
    const pollTimer = setInterval(() => {
      // A hidden tab cannot be read; the visibilitychange listener below
      // catches up the moment the user comes back.
      if (typeof document !== "undefined" && document.hidden) return;
      void runRefresh();
    }, pollIntervalMs);

    const handleVisibilityChange = () => {
      if (typeof document === "undefined" || document.hidden) return;
      void runRefresh();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      isActive = false;
      clearInterval(pollTimer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [enabled, hasLiveMatches]);
}
