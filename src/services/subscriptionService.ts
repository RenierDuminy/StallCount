import { supabase } from "./supabaseClient";

export type SubscriptionTargetType = "match" | "team" | "player" | "event" | "division";

export type SubscriptionRow = {
  id: string;
  profile_id: string;
  target_type: SubscriptionTargetType | string;
  target_id: string;
  topics: string[];
  created_at?: string;
};

function normalizeTopics(topics: Array<string | null | undefined>): string[] {
  const cleaned = topics
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter((value) => value.length > 0);
  return Array.from(new Set(cleaned));
}

export async function getSubscriptions(profileId: string): Promise<SubscriptionRow[]> {
  if (!profileId) return [];
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, profile_id, target_type, target_id, topics, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load subscriptions");
  }

  return (data ?? []) as SubscriptionRow[];
}

export async function upsertSubscription(options: {
  profileId: string;
  targetType: SubscriptionTargetType | string;
  targetId: string;
  topics: string[];
}): Promise<SubscriptionRow> {
  const topics = normalizeTopics(options.topics);
  if (!options.profileId) throw new Error("profileId is required to follow a target.");
  if (!options.targetType) throw new Error("target_type is required.");
  if (!options.targetId) throw new Error("target_id is required.");

  const payload = {
    profile_id: options.profileId,
    target_type: options.targetType,
    target_id: options.targetId,
    topics,
  };

  const { data, error } = await supabase
    .from("subscriptions")
    .upsert(payload, { onConflict: "profile_id,target_type,target_id" })
    .select("id, profile_id, target_type, target_id, topics, created_at")
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message || "Failed to follow target");
  }

  return data as SubscriptionRow;
}

export async function deleteSubscriptionById(id: string) {
  if (!id) return;
  const { error } = await supabase.from("subscriptions").delete().eq("id", id);
  if (error) {
    throw new Error(error.message || "Failed to delete subscription");
  }
}

export async function unfollowTarget(options: {
  profileId: string;
  targetType: SubscriptionTargetType | string;
  targetId: string;
}) {
  const { error } = await supabase
    .from("subscriptions")
    .delete()
    .match({
      profile_id: options.profileId,
      target_type: options.targetType,
      target_id: options.targetId,
    });

  if (error) {
    throw new Error(error.message || "Failed to unfollow target");
  }
}

export function resolveTopicsInput(raw: string): string[] {
  if (!raw) return [];
  return normalizeTopics(raw.split(/[,\n]/));
}
