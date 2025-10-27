import { supabase } from "./supabaseClient";
import { cacheUpdate, clearCachedUpdate, getCachedUpdates } from "./localCache";

/** 
 * Subscribe to realtime updates for the matches table.
 * Calls onChange(eventType, newRow) whenever a change happens.
 */
export function subscribeToMatchUpdates(onChange) {
  const channel = supabase
    .channel("match-updates")
    .on(
      "postgres_changes",
      {
        event: "*", // INSERT, UPDATE, DELETE
        schema: "public",
        table: "matches",
      },
      (payload) => {
        console.log("Realtime event:", payload);
        onChange(payload.eventType, payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Update a match score.
 * Tries to sync immediately; if offline, caches the update locally.
 */
export async function updateScore(matchId, newScoreA, newScoreB) {
  const update = {
    id: crypto.randomUUID(),
    matchId,
    score_a: newScoreA,
    score_b: newScoreB,
    timestamp: Date.now(),
  };

  try {
    const { error } = await supabase
      .from("matches")
      .update({ score_a: newScoreA, score_b: newScoreB })
      .eq("id", matchId);

    if (error) throw error;
    console.log("✅ Synced online:", update);
  } catch (err) {
    console.warn("⚠️ Offline — caching update:", err.message);
    await cacheUpdate(update);
  }
}

/**
 * Sync any locally cached updates when back online.
 */
export async function syncCachedUpdates() {
  const updates = await getCachedUpdates();
  for (const u of updates) {
    try {
      const { error } = await supabase
        .from("matches")
        .update({ score_a: u.score_a, score_b: u.score_b })
        .eq("id", u.matchId);
      if (!error) {
        await clearCachedUpdate(u.id);
        console.log("✅ Synced cached update:", u);
      }
    } catch (e) {
      console.error("Still offline:", e.message);
    }
  }
}
