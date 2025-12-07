import process from "node:process";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const config = {
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:ops@stallcount.app",
  batchSize: Number(process.env.NOTIFICATION_BATCH_SIZE || 50),
};

const missing = Object.entries({
  SUPABASE_URL: config.supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
  VAPID_PUBLIC_KEY: config.vapidPublicKey,
  VAPID_PRIVATE_KEY: config.vapidPrivateKey,
}).filter(([, value]) => !value);

if (missing.length) {
  const keys = missing.map(([key]) => key).join(", ");
  throw new Error(`Missing required environment variables: ${keys}`);
}

const supabase = createClient(config.supabaseUrl, config.serviceRoleKey);
webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);

function buildEventTargets(event) {
  const targets = new Map();
  const addTarget = (type, id) => {
    if (!id) return;
    const key = type.toLowerCase();
    if (!targets.has(key)) {
      targets.set(key, new Set());
    }
    targets.get(key).add(id);
  };

  addTarget("match", event.match_id);
  const data = event.data || {};
  addTarget("team", data.team_id || data.teamId || data.team);
  addTarget("player", data.player_id || data.playerId || data.player);
  addTarget("event", data.event_id || data.eventId);
  addTarget("division", data.division_id || data.divisionId);

  if (Array.isArray(data.targets)) {
    data.targets.forEach((target) => {
      if (target?.type && target?.id) {
        addTarget(target.type, target.id);
      }
    });
  }

  return targets;
}

function filterByTopics(subscriptions, eventType) {
  const normalizedType = (eventType || "").toLowerCase();
  return subscriptions.filter((sub) => {
    if (!Array.isArray(sub.topics) || sub.topics.length === 0) return true;
    return sub.topics.some((topic) => topic?.toLowerCase() === normalizedType);
  });
}

async function fetchMatchingSubscriptions(targetMap, eventType) {
  const results = [];
  for (const [type, idSet] of targetMap.entries()) {
    const ids = Array.from(idSet);
    if (!ids.length) continue;
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id, profile_id, target_type, target_id, topics")
      .eq("target_type", type)
      .in("target_id", ids);
    if (error) {
      throw new Error(error.message || "Failed to load subscriptions.");
    }
    results.push(...(data || []));
  }
  return filterByTopics(results, eventType);
}

async function fetchPushEndpoints(profileIds) {
  if (!profileIds.length) return [];
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("profile_id, endpoint, p256dh_key, auth_key")
    .in("profile_id", profileIds);
  if (error) {
    throw new Error(error.message || "Failed to load push subscriptions.");
  }
  return data || [];
}

function buildNotificationPayload(event) {
  const data = event.data || {};
  const title = data.title || `Match update: ${event.event_type || "event"}`;
  const body = data.body || data.description || "Something just happened in StallCount.";
  const url =
    data.url ||
    data.link ||
    (event.match_id ? `/matches/${event.match_id}` : "/notifications");
  return JSON.stringify({
    title,
    body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || `live-event-${event.id}`,
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

async function removeBrokenSubscription(endpoint) {
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) {
    console.warn("Failed to prune push subscription", endpoint, error.message);
  }
}

async function deliverToEndpoint(row, payload) {
  try {
    await webpush.sendNotification(
      {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh_key,
          auth: row.auth_key,
        },
      },
      payload,
    );
    return { ok: true };
  } catch (err) {
    const status = err.statusCode || err.statusMessage;
    if (status === 404 || status === 410) {
      await removeBrokenSubscription(row.endpoint);
    } else {
      console.error("Push delivery failed", status, err.body || err.message);
    }
    return { ok: false, status };
  }
}

async function markEventSent(id) {
  const { error } = await supabase.from("live_events").update({ sent: true }).eq("id", id);
  if (error) {
    throw new Error(error.message || "Failed to mark live event as sent.");
  }
}

async function processEvent(event) {
  const targets = buildEventTargets(event);
  const subscriptions = await fetchMatchingSubscriptions(targets, event.event_type);
  if (!subscriptions.length) {
    await markEventSent(event.id);
    return { eventId: event.id, deliveries: 0, endpoints: 0 };
  }
  const profileIds = Array.from(new Set(subscriptions.map((sub) => sub.profile_id)));
  const endpoints = await fetchPushEndpoints(profileIds);
  if (!endpoints.length) {
    await markEventSent(event.id);
    return { eventId: event.id, deliveries: 0, endpoints: 0 };
  }

  const payload = buildNotificationPayload(event);
  let deliveries = 0;
  for (const endpoint of endpoints) {
    const result = await deliverToEndpoint(endpoint, payload);
    if (result.ok) deliveries += 1;
  }

  await markEventSent(event.id);
  return { eventId: event.id, deliveries, endpoints: endpoints.length };
}

async function fetchPendingEvents(limit) {
  const { data, error } = await supabase
    .from("live_events")
    .select("id, match_id, event_type, data, created_at")
    .eq("sent", false)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    throw new Error(error.message || "Failed to load pending live events.");
  }
  return data || [];
}

async function main() {
  const pending = await fetchPendingEvents(config.batchSize);
  if (!pending.length) {
    console.log("No pending live events to process.");
    return;
  }

  console.log(`Processing ${pending.length} live event(s)...`);
  for (const event of pending) {
    const result = await processEvent(event);
    console.log(
      `Event ${result.eventId}: delivered ${result.deliveries}/${result.endpoints} push notification(s).`,
    );
  }
}

main()
  .then(() => {
    console.log("Notification dispatch complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Notification dispatcher failed:", err);
    process.exit(1);
  });
