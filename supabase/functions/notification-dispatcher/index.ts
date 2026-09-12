import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Delivers queued `live_events` rows as Web Push notifications.
//
// Invoked by the database (a pg_net trigger on `live_events` insert and a
// pg_cron sweeper every minute; see supabase/migrations/*notification_dispatch*).
// Safe to call concurrently: an event is only marked `sent` after at least one
// successful delivery (or once it has no valid recipients), and failures are
// recorded on the row (`attempts`, `last_error`) so they retry with backoff
// instead of vanishing.

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
  team_id?: string | null;
  player_id?: string | null;
  secondary_player_id?: string | null;
  created_at: string;
  attempts?: number | null;
  last_attempt_at?: string | null;
};

const REQUIRED_ENV = ["SUPABASE_URL", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"] as const;

function resolveDefaultSupabaseSecretKey(rawSecretKeys?: string | null) {
  if (!rawSecretKeys) return undefined;
  try {
    const parsed = JSON.parse(rawSecretKeys) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return undefined;
    const defaultKey = parsed.default;
    if (typeof defaultKey === "string" && defaultKey) return defaultKey;
    const firstKey = Object.values(parsed).find((value) => typeof value === "string" && value);
    return typeof firstKey === "string" ? firstKey : undefined;
  } catch {
    return undefined;
  }
}

const config = {
  supabaseUrl: Deno.env.get("SUPABASE_URL"),
  serviceRoleKey:
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    resolveDefaultSupabaseSecretKey(Deno.env.get("SUPABASE_SECRET_KEYS")),
  vapidPublicKey: Deno.env.get("VAPID_PUBLIC_KEY"),
  vapidPrivateKey: Deno.env.get("VAPID_PRIVATE_KEY"),
  vapidSubject: Deno.env.get("VAPID_SUBJECT") ?? "mailto:ops@stallcount.app",
  // Shared secret so only the database (cron / trigger) can trigger a dispatch.
  // Anyone holding the public anon key can otherwise hit this endpoint.
  dispatchSecret: Deno.env.get("NOTIFICATION_DISPATCH_SECRET") ?? "",
  batchSize: Number(Deno.env.get("NOTIFICATION_BATCH_SIZE") ?? 50),
  maxAttempts: Number(Deno.env.get("NOTIFICATION_MAX_ATTEMPTS") ?? 5),
  // A score alert an hour late is noise; drop events older than this.
  staleAfterMinutes: Number(Deno.env.get("NOTIFICATION_STALE_AFTER_MINUTES") ?? 60),
  // Push services discard undelivered messages after this many seconds.
  pushTtlSeconds: Number(Deno.env.get("NOTIFICATION_PUSH_TTL_SECONDS") ?? 600),
};

for (const key of REQUIRED_ENV) {
  if (!Deno.env.get(key)) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}
if (!config.serviceRoleKey) {
  throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEYS");
}

const supabase = createClient(config.supabaseUrl!, config.serviceRoleKey!);
webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey!, config.vapidPrivateKey!);

const TOPIC_EVENT_ALIASES: Record<string, string[]> = {
  goal: ["score"],
  turnover: ["turnover", "block"],
};

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
  add("team", event.team_id);
  add("player", event.player_id);
  add("player", event.secondary_player_id);
  const data = (event.data ?? {}) as Record<string, unknown>;
  add("team", data.team_id ?? data.teamId ?? data.team);
  add("player", data.player_id ?? data.playerId ?? data.player);
  add("player", data.secondary_player_id ?? data.secondaryPlayerId ?? data.secondaryPlayer);
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
  const matches: Array<{ profile_id: string; topics: string[] | null }> = [];

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
    return sub.topics.map(normalizeTopic).some((topic) => {
      if (!topic) return false;
      if (topic === normalizedEvent) return true;
      return TOPIC_EVENT_ALIASES[topic]?.includes(normalizedEvent) ?? false;
    });
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
      return `${value} - ${fallback}`;
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
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) console.warn("Failed to prune push subscription", endpoint, error.message);
}

type DeliveryOutcome = "delivered" | "pruned" | "config_error" | "transient";

async function deliver(endpoint: PushSubscriptionRow, payload: string): Promise<{ outcome: DeliveryOutcome; detail?: string }> {
  try {
    await webpush.sendNotification(
      {
        endpoint: endpoint.endpoint,
        keys: { p256dh: endpoint.p256dh_key, auth: endpoint.auth_key },
      },
      payload,
      { TTL: config.pushTtlSeconds, urgency: "high" },
    );
    return { outcome: "delivered" };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    const body = (err as { body?: string }).body ?? (err as Error).message ?? "";
    const detail = `${status ?? "network"} ${String(body).slice(0, 200)}`.trim();
    if (status === 404 || status === 410) {
      // The browser dropped this subscription; it will never work again.
      await pruneEndpoint(endpoint.endpoint);
      return { outcome: "pruned", detail };
    }
    if (status === 401 || status === 403) {
      // VAPID rejected: the keys this function holds do not match the key the
      // browser subscribed with. Retrying cannot help until the keys agree.
      console.error("Push service rejected VAPID credentials", endpoint.endpoint, detail);
      return { outcome: "config_error", detail };
    }
    console.error("Push delivery failed", endpoint.endpoint, detail);
    return { outcome: "transient", detail };
  }
}

async function updateEvent(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("live_events").update(patch).eq("id", id);
  if (error) throw error;
}

function isStale(event: LiveEventRow) {
  const created = Date.parse(event.created_at);
  if (!Number.isFinite(created)) return false;
  return Date.now() - created > config.staleAfterMinutes * 60 * 1000;
}

function backoffElapsed(event: LiveEventRow) {
  const attempts = event.attempts ?? 0;
  if (!attempts || !event.last_attempt_at) return true;
  const last = Date.parse(event.last_attempt_at);
  if (!Number.isFinite(last)) return true;
  const waitMs = Math.min(2 ** attempts, 30) * 60 * 1000;
  return Date.now() - last >= waitMs;
}

async function processEvent(event: LiveEventRow) {
  const attempts = (event.attempts ?? 0) + 1;
  const now = new Date().toISOString();

  if (isStale(event)) {
    await updateEvent(event.id, {
      sent: true,
      attempts,
      last_attempt_at: now,
      last_error: `expired: older than ${config.staleAfterMinutes} minutes`,
    });
    return { eventId: event.id, status: "expired", delivered: 0, endpoints: 0 };
  }

  const targets = buildTargetMap(event);
  const matchingSubs = await fetchMatchingSubscriptions(targets, event.event_type);
  const profileIds = Array.from(new Set(matchingSubs.map((sub) => sub.profile_id)));
  const endpoints = await fetchPushEndpoints(profileIds);
  if (!endpoints.length) {
    await updateEvent(event.id, {
      sent: true,
      attempts,
      last_attempt_at: now,
      delivered_count: 0,
      last_error: matchingSubs.length ? "no push endpoints for subscribers" : "no subscribers",
    });
    return { eventId: event.id, status: "no_recipients", delivered: 0, endpoints: 0 };
  }

  const payload = buildPayload(event);
  const counts = { delivered: 0, pruned: 0, config_error: 0, transient: 0 };
  let lastDetail = "";
  for (const endpoint of endpoints) {
    const result = await deliver(endpoint, payload);
    counts[result.outcome] += 1;
    if (result.detail && result.outcome !== "delivered") lastDetail = result.detail;
  }

  const unresolved = counts.config_error + counts.transient;
  const done = unresolved === 0 || counts.delivered > 0 || attempts >= config.maxAttempts;
  const summary = `delivered ${counts.delivered}/${endpoints.length}` +
    (counts.pruned ? `, pruned ${counts.pruned}` : "") +
    (counts.config_error ? `, vapid rejected ${counts.config_error}` : "") +
    (counts.transient ? `, failed ${counts.transient}` : "") +
    (lastDetail ? ` (${lastDetail})` : "");

  await updateEvent(event.id, {
    sent: done,
    attempts,
    last_attempt_at: now,
    delivered_count: counts.delivered,
    last_error: unresolved ? summary : null,
  });

  const status = counts.delivered > 0 ? "delivered" : done ? "gave_up" : "retry";
  return { eventId: event.id, status, delivered: counts.delivered, endpoints: endpoints.length, summary };
}

async function fetchPendingEvents(limit: number) {
  const { data, error } = await supabase
    .from("live_events")
    .select(
      "id, match_id, event_type, data, team_id, player_id, secondary_player_id, created_at, attempts, last_attempt_at",
    )
    .eq("sent", false)
    .lt("attempts", config.maxAttempts)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as LiveEventRow[]).filter(backoffElapsed);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isAuthorised(req: Request) {
  if (!config.dispatchSecret) {
    // No secret configured: fall back to the gateway's JWT check only.
    return true;
  }
  const provided = req.headers.get("x-dispatch-secret") ?? "";
  if (provided.length !== config.dispatchSecret.length) return false;
  // Constant-time compare.
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ config.dispatchSecret.charCodeAt(i);
  }
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!isAuthorised(req)) return json({ error: "Forbidden" }, 403);
  try {
    const events = await fetchPendingEvents(config.batchSize);
    const reports = [];
    for (const event of events) {
      try {
        reports.push(await processEvent(event));
      } catch (err) {
        console.error("Failed to process live event", event.id, err);
        reports.push({ eventId: event.id, status: "error", error: (err as Error).message });
        try {
          await updateEvent(event.id, {
            attempts: (event.attempts ?? 0) + 1,
            last_attempt_at: new Date().toISOString(),
            last_error: `dispatcher error: ${(err as Error).message}`.slice(0, 500),
          });
        } catch (updateErr) {
          console.error("Failed to record dispatcher error", event.id, updateErr);
        }
      }
    }
    const delivered = reports.reduce((sum, r) => sum + (("delivered" in r && r.delivered) || 0), 0);
    return json({ processed: reports.length, delivered, reports });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});
