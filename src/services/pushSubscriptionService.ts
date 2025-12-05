import { supabase } from "./supabaseClient";

export type PushSubscriptionRow = {
  id?: string;
  profile_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  created_at?: string;
};

export async function upsertPushSubscriptionRow(payload: PushSubscriptionRow) {
  if (!payload.profile_id || !payload.endpoint) {
    throw new Error("Profile and endpoint are required for push subscriptions.");
  }
  const record = {
    profile_id: payload.profile_id,
    endpoint: payload.endpoint,
    p256dh_key: payload.p256dh_key,
    auth_key: payload.auth_key,
  };

  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(record, { onConflict: "endpoint" })
    .select("id, profile_id, endpoint, created_at")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to store push subscription.");
  }

  return data;
}

export async function deletePushSubscriptionRow(options: { endpoint?: string; profileId?: string }) {
  if (!options.endpoint && !options.profileId) return;
  let query = supabase.from("push_subscriptions").delete();
  if (options.endpoint) {
    query = query.eq("endpoint", options.endpoint);
  }
  if (options.profileId) {
    query = query.eq("profile_id", options.profileId);
  }
  const { error } = await query;
  if (error) {
    throw new Error(error.message || "Failed to remove push subscription.");
  }
}
