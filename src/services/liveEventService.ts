import { supabase } from "./supabaseClient";

export type LiveEventRow = {
  id: string;
  match_id: string;
  event_type: string;
  data: Record<string, unknown> | null;
  created_at: string;
};

export async function getRecentLiveEvents(limit = 50): Promise<LiveEventRow[]> {
  const { data, error } = await supabase
    .from("live_events")
    .select("id, match_id, event_type, data, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Failed to load live events.");
  }

  return (data ?? []) as LiveEventRow[];
}
