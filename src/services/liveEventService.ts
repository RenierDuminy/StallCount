import { supabase } from "./supabaseClient";
import { getCachedQuery } from "../utils/queryCache";

const RECENT_LIVE_EVENTS_CACHE_TTL_MS = 15 * 1000;

export type LiveEventRow = {
  id: string;
  match_id: string;
  event_type: string;
  data: Record<string, unknown> | null;
  team_id?: string | null;
  player_id?: string | null;
  secondary_player_id?: string | null;
  created_at: string;
};

export async function getRecentLiveEvents(limit = 50): Promise<LiveEventRow[]> {
  return getCachedQuery(
    `live-events:recent:${limit}`,
    async () => {
      const { data, error } = await supabase
        .from("live_events")
        .select("id, match_id, event_type, data, team_id, player_id, secondary_player_id, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message || "Failed to load live events.");
      }

      return (data ?? []) as LiveEventRow[];
    },
    { ttlMs: RECENT_LIVE_EVENTS_CACHE_TTL_MS },
  );
}
