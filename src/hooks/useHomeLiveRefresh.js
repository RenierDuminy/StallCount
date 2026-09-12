import { useEffect, useRef } from "react";
import { supabase } from "../services/supabaseClient";

// Idle safety net. Nothing is live, so nothing will push us an update — but a
// match scheduled for 17:00 has to be noticed by a tab that was opened at 16:45.
// This is the only traffic the home page generates while the league is quiet,
// so it is deliberately slow.
const IDLE_POLL_INTERVAL_MS = 10 * 60 * 1000;

// Fallback poll while a match is live, in case the realtime channel silently
// drops (backgrounded tab, flaky network, dropped socket). Realtime should beat
// this to the punch almost every time; it exists so a dead socket degrades to
// "slightly stale" instead of "frozen until reload".
const LIVE_POLL_INTERVAL_MS = 30 * 1000;

// Realtime fires per row. A single point can touch `matches` (score) and
// `live_events` (ticker) at once, and several matches can score together, so
// coalesce a burst into one refetch.
const REALTIME_DEBOUNCE_MS = 1200;

/**
 * Keeps the home page's live surfaces current without polling the server on a
 * fast timer.
 *
 * Two modes, switched automatically by `hasLiveMatches`:
 *
 *  - Idle (nothing live): no realtime channel at all, just a slow ~10 min poll.
 *    Costs effectively nothing on a quiet day, and is what eventually notices
 *    that a scheduled match has kicked off.
 *  - Live (something is live): opens one channel watching `matches` and
 *    `live_events`, debounced, plus a 30 s fallback poll. When the last match
 *    finishes the caller flips `hasLiveMatches` back to false, the channel is
 *    torn down, and we drop back to the idle cadence.
 *
 * `onRefresh` must be stable-safe: it is held in a ref, so changing it does not
 * resubscribe. Only the live/idle transition tears the channel down.
 */
export function useHomeLiveRefresh({ hasLiveMatches, onRefresh, enabled = true }) {
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return undefined;

    let isActive = true;
    let debounceTimer = null;
    let isRefreshing = false;

    // Guards against overlapping refetches: a burst of realtime events plus a
    // fallback poll landing together must not fire two concurrent loads.
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

    const scheduleRefresh = () => {
      if (!isActive) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void runRefresh();
      }, REALTIME_DEBOUNCE_MS);
    };

    const pollIntervalMs = hasLiveMatches ? LIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS;
    const pollTimer = setInterval(() => {
      // A hidden tab cannot be read, and waking it up just to refetch burns a
      // request for nobody. The visibilitychange listener below catches up the
      // moment the user comes back.
      if (typeof document !== "undefined" && document.hidden) return;
      void runRefresh();
    }, pollIntervalMs);

    const handleVisibilityChange = () => {
      if (typeof document === "undefined" || document.hidden) return;
      // Returning to the tab is the one moment staleness is most visible, so
      // refresh immediately rather than waiting for the next tick.
      void runRefresh();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    let channel = null;
    if (hasLiveMatches) {
      channel = supabase
        .channel("home-live-updates")
        .on(
          "postgres_changes",
          // Score writes and the live -> finished transition both land here, so
          // this one subscription keeps the hero score current *and* is what
          // tells us the last live match has ended.
          { event: "UPDATE", schema: "public", table: "matches" },
          () => scheduleRefresh(),
        )
        .on(
          "postgres_changes",
          // Clock / point-status ticker detail behind the hero card.
          { event: "INSERT", schema: "public", table: "live_events" },
          () => scheduleRefresh(),
        )
        .subscribe();
    }

    return () => {
      isActive = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(pollTimer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [enabled, hasLiveMatches]);
}
