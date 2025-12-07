import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import webpush from "https://deno.land/x/webpush@v1.4.3/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type PushSubscriptionRow = {
  profile_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
};

type LiveEventRow = {
  id: string;
  match_id: string;
  event_type: string;
  data?: Record<string, unknown> | null;
  created_at: string;
};

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
] as const;

const config = {
  supabaseUrl: Deno.env.get("SUPABASE_URL"),
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  vapidPublicKey: Deno.env.get("VAPID_PUBLIC_KEY"),
  vapidPrivateKey: Deno.env.get("VAPID_PRIVATE_KEY"),
  batchSize: 50,
};

for (const key of REQUIRED_ENV) {
  if (!Deno.env.get(key)) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}

const supabase = createClient(config.supabaseUrl!, config.serviceRoleKey!);
webpush.setVapidDetails(
  "mailto:ops@stallcount.app",
  config.vapidPublicKey!,
  config.vapidPrivateKey!,
);

type TargetMap = Map<string, Set<string>>;

function buildTargetMap(event: LiveEventRow): TargetMap {
  const map: TargetMap = new Map();
  const add = (type: string, id?: unknown) => {
    if (!id) return;
    const value = String(id);
    const key = type.toLowerCase();
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(value);
  };

  add("match", event.match_id);
  const data = (event.data ?? {}) as Record<string, unknown>;
  add("team", data.team_id ?? data.teamId ?? data.team);
  add("player", data.player_id ?? data.playerId ?? data.player);
  add("event", data.event_id ?? data.eventId);
  add("division", data.division_id ?? data.divisionId);

  if (Array.isArray(data.targets)) {
    for (const target of data.targets) {
      if (target && typeof target === "object") {
        const obj = target as { type?: string; id?: string };
        add(obj.type ?? "", obj.id);
      }
    }
  }

  return map;
}

function normalizeTopic(topic?: unknown) {
  return typeof topic === "string" ? topic.trim().toLowerCase() : "";
}

async function fetchMatchingSubscriptions(targets: TargetMap, eventType: string) {
  const matches: Array<{
    profile_id: string;
    topics: string[] | null;
  }> = [];

  for (const [type, ids] of targets.entries()) {
    if (!ids.size) continue;
    const { data, error } = await supabase
      .from("subscriptions")
      .select("profile_id, topics")
      .eq("target_type", type)
      .in("target_id", Array.from(ids));
    if (error) throw error;
    matches.push(...(data ?? []));
  }

  const normalizedEvent = (eventType ?? "").toLowerCase();
  return matches.filter((sub) => {
    if (!Array.isArray(sub.topics) || sub.topics.length === 0) return true;
    return sub.topics.map(normalizeTopic).includes(normalizedEvent);
  });
}

async function fetchPushEndpoints(profileIds: string[]): Promise<PushSubscriptionRow[]> {
  if (!profileIds.length) return [];
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("profile_id, endpoint, p256dh_key, auth_key")
    .in("profile_id", profileIds);
  if (error) throw error;
  return (data ?? []) as PushSubscriptionRow[];
}

function buildPayload(event: LiveEventRow) {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const fallbackName =
    (typeof data.target_name === "string" && data.target_name) ||
    (typeof data.match_name === "string" && data.match_name) ||
    "";
  const url =
    (typeof data.url === "string" && data.url) ||
    (typeof data.link === "string" && data.link) ||
    (event.match_id ? `/matches/${event.match_id}` : "/notifications");

  const decorate = (value: string | undefined, fallback: string) => {
    if (value && fallbackName && !value.toLowerCase().includes(fallbackName.toLowerCase())) {
      return `${value} · ${fallback}`;
    }
    return value ?? fallback;
  };

  return JSON.stringify({
    title: decorate(
      typeof data.title === "string" ? data.title : undefined,
      fallbackName ? `Update: ${fallbackName}` : `Match update: ${event.event_type}`,
    ),
    body: decorate(
      typeof data.body === "string" ? data.body : undefined,
      (typeof data.description === "string" && data.description) || "New activity on StallCount.",
    ),
    icon: (typeof data.icon === "string" && data.icon) || "/icon-192.png",
    badge: (typeof data.badge === "string" && data.badge) || "/icon-192.png",
    tag: (typeof data.tag === "string" && data.tag) || `live-event-${event.id}`,
    url,
    data: {
      ...data,
      url,
      eventId: event.id,
      matchId: event.match_id,
      eventType: event.event_type,
    },
  });
}

async function pruneEndpoint(endpoint: string) {
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

async function deliver(endpoint: PushSubscriptionRow, payload: string) {
  try {
    await webpush.sendNotification(
      {
        endpoint: endpoint.endpoint,
        keys: {
          p256dh: endpoint.p256dh_key,
          auth: endpoint.auth_key,
        },
      },
      payload,
    );
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await pruneEndpoint(endpoint.endpoint);
    } else {
      console.error("Push delivery failed", err);
    }
    return false;
  }
}

async function markEventSent(id: string) {
  await supabase.from("live_events").update({ sent: true }).eq("id", id);
}

async function processEvent(event: LiveEventRow) {
  const targets = buildTargetMap(event);
  const matchingSubs = await fetchMatchingSubscriptions(targets, event.event_type);
  if (!matchingSubs.length) {
    await markEventSent(event.id);
    return { delivered: 0, endpoints: 0 };
  }
  const profileIds = Array.from(new Set(matchingSubs.map((sub) => sub.profile_id)));
  const endpoints = await fetchPushEndpoints(profileIds);
  if (!endpoints.length) {
    await markEventSent(event.id);
    return { delivered: 0, endpoints: 0 };
  }

  const payload = buildPayload(event);
  let deliveredCount = 0;
  for (const endpoint of endpoints) {
    if (await deliver(endpoint, payload)) deliveredCount += 1;
  }
  await markEventSent(event.id);
  return { delivered: deliveredCount, endpoints: endpoints.length };
}

async function fetchPendingEvents(limit: number) {
  const { data, error } = await supabase
    .from("live_events")
    .select("id, match_id, event_type, data, created_at")
    .eq("sent", false)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LiveEventRow[];
}

serve(async () => {
  try {
    const events = await fetchPendingEvents(config.batchSize);
    const reports = [];
    for (const event of events) {
      const result = await processEvent(event);
      reports.push({ eventId: event.id, ...result });
    }
    return new Response(JSON.stringify({ processed: reports.length, reports }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
