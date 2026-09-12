// Local / CI fallback for the `notification-dispatcher` Edge Function.
// Same rules as supabase/functions/notification-dispatcher/index.ts: an event
// is only marked `sent` after a successful delivery or once it has no valid
// recipients; failures are recorded on the row and retried with backoff.
//
//   npm run dispatch:notifications
import process from "node:process";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const config = {
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  serviceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    resolveDefaultSupabaseSecretKey(process.env.SUPABASE_SECRET_KEYS),
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:ops@stallcount.app",
  batchSize: Number(process.env.NOTIFICATION_BATCH_SIZE || 50),
  maxAttempts: Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 5),
  staleAfterMinutes: Number(process.env.NOTIFICATION_STALE_AFTER_MINUTES || 60),
  pushTtlSeconds: Number(process.env.NOTIFICATION_PUSH_TTL_SECONDS || 600),
};

function resolveDefaultSupabaseSecretKey(rawSecretKeys) {
  if (!rawSecretKeys) return undefined;
  try {
    const parsed = JSON.parse(rawSecretKeys);
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed.default || Object.values(parsed).find((value) => typeof value === "string");
  } catch {
    return undefined;
  }
}

const missing = Object.entries({
  SUPABASE_URL: config.supabaseUrl,
  "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEYS": config.serviceRoleKey,
  VAPID_PUBLIC_KEY: config.vapidPublicKey,
  VAPID_PRIVATE_KEY: config.vapidPrivateKey,
}).filter(([, value]) => !value);

if (missing.length) {
  const keys = missing.map(([key]) => key).join(", ");
  throw new Error(`Missing required environment variables: ${keys}`);
}

const supabase = createClient(config.supabaseUrl, config.serviceRoleKey);
webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);

const TOPIC_EVENT_ALIASES = {
  goal: ["score"],
  turnover: ["turnover", "block"],
};

function buildEventTargets(event) {
  const targets = new Map();
  const addTarget = (type, id) => {
    if (!id) return;
    const key = String(type).toLowerCase();
    if (!targets.has(key)) targets.set(key, new Set());
    targets.get(key).add(String(id));
  };

  addTarget("match", event.match_id);
  addTarget("team", event.team_id);
  addTarget("player", event.player_id);
  addTarget("player", event.secondary_player_id);
  const data = event.data || {};
  addTarget("team", data.team_id || data.teamId || data.team);
  addTarget("player", data.player_id || data.playerId || data.player);
  addTarget("player", data.secondary_player_id || data.secondaryPlayerId || data.secondaryPlayer);
  addTarget("event", data.event_id || data.eventId);
  addTarget("division", data.division_id || data.divisionId);

  if (Array.isArray(data.targets)) {
    data.targets.forEach((target) => {
      if (target?.type && target?.id) addTarget(target.type, target.id);
    });
  }

  return targets;
}

function filterByTopics(subscriptions, eventType) {
  const normalizedType = (eventType || "").toLowerCase();
  return subscriptions.filter((sub) => {
    if (!Array.isArray(sub.topics) || sub.topics.length === 0) return true;
    return sub.topics.some((topic) => {
      const normalizedTopic = typeof topic === "string" ? topic.trim().toLowerCase() : "";
      if (!normalizedTopic) return false;
      if (normalizedTopic === normalizedType) return true;
      return TOPIC_EVENT_ALIASES[normalizedTopic]?.includes(normalizedType) || false;
    });
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
    if (error) throw new Error(error.message || "Failed to load subscriptions.");
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
  if (error) throw new Error(error.message || "Failed to load push subscriptions.");
  return data || [];
}

function buildNotificationPayload(event) {
  const data = event.data || {};
  const title = data.title || `Match update: ${event.event_type || "event"}`;
  const body = data.body || data.description || "Something just happened in StallCount.";
  const url = data.url || data.link || (event.match_id ? `/matches/${event.match_id}` : "/notifications");
  return JSON.stringify({
    title,
    body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || `live-event-${event.id}`,
    url,
    data: { ...data, url, eventId: event.id, matchId: event.match_id, eventType: event.event_type },
  });
}

async function removeBrokenSubscription(endpoint) {
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) console.warn("Failed to prune push subscription", endpoint, error.message);
}

async function deliverToEndpoint(row, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh_key, auth: row.auth_key } },
      payload,
      { TTL: config.pushTtlSeconds, urgency: "high" },
    );
    return { outcome: "delivered" };
  } catch (err) {
    const status = err.statusCode;
    const detail = `${status ?? "network"} ${String(err.body || err.message || "").slice(0, 200)}`.trim();
    if (status === 404 || status === 410) {
      await removeBrokenSubscription(row.endpoint);
      return { outcome: "pruned", detail };
    }
    if (status === 401 || status === 403) {
      console.error("Push service rejected VAPID credentials", row.endpoint, detail);
      return { outcome: "config_error", detail };
    }
    console.error("Push delivery failed", row.endpoint, detail);
    return { outcome: "transient", detail };
  }
}

async function updateEvent(id, patch) {
  const { error } = await supabase.from("live_events").update(patch).eq("id", id);
  if (error) throw new Error(error.message || "Failed to update live event.");
}

function isStale(event) {
  const created = Date.parse(event.created_at);
  return Number.isFinite(created) && Date.now() - created > config.staleAfterMinutes * 60 * 1000;
}

function backoffElapsed(event) {
  const attempts = event.attempts ?? 0;
  if (!attempts || !event.last_attempt_at) return true;
  const last = Date.parse(event.last_attempt_at);
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= Math.min(2 ** attempts, 30) * 60 * 1000;
}

async function processEvent(event) {
  const attempts = (event.attempts ?? 0) + 1;
  const now = new Date().toISOString();

  if (isStale(event)) {
    await updateEvent(event.id, {
      sent: true,
      attempts,
      last_attempt_at: now,
      last_error: `expired: older than ${config.staleAfterMinutes} minutes`,
    });
    return { eventId: event.id, status: "expired", deliveries: 0, endpoints: 0 };
  }

  const targets = buildEventTargets(event);
  const subscriptions = await fetchMatchingSubscriptions(targets, event.event_type);
  const profileIds = Array.from(new Set(subscriptions.map((sub) => sub.profile_id)));
  const endpoints = await fetchPushEndpoints(profileIds);
  if (!endpoints.length) {
    await updateEvent(event.id, {
      sent: true,
      attempts,
      last_attempt_at: now,
      delivered_count: 0,
      last_error: subscriptions.length ? "no push endpoints for subscribers" : "no subscribers",
    });
    return { eventId: event.id, status: "no_recipients", deliveries: 0, endpoints: 0 };
  }

  const payload = buildNotificationPayload(event);
  const counts = { delivered: 0, pruned: 0, config_error: 0, transient: 0 };
  let lastDetail = "";
  for (const endpoint of endpoints) {
    const result = await deliverToEndpoint(endpoint, payload);
    counts[result.outcome] += 1;
    if (result.detail && result.outcome !== "delivered") lastDetail = result.detail;
  }

  const unresolved = counts.config_error + counts.transient;
  const done = unresolved === 0 || counts.delivered > 0 || attempts >= config.maxAttempts;
  const summary =
    `delivered ${counts.delivered}/${endpoints.length}` +
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
  return { eventId: event.id, status, deliveries: counts.delivered, endpoints: endpoints.length, summary };
}

async function fetchPendingEvents(limit) {
  const { data, error } = await supabase
    .from("live_events")
    .select(
      "id, match_id, event_type, data, team_id, player_id, secondary_player_id, created_at, attempts, last_attempt_at",
    )
    .eq("sent", false)
    .lt("attempts", config.maxAttempts)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message || "Failed to load pending live events.");
  return (data || []).filter(backoffElapsed);
}

async function main() {
  const pending = await fetchPendingEvents(config.batchSize);
  if (!pending.length) {
    console.log("No pending live events to process.");
    return;
  }

  console.log(`Processing ${pending.length} live event(s)...`);
  for (const event of pending) {
    try {
      const result = await processEvent(event);
      console.log(
        `Event ${result.eventId}: ${result.status} (${result.deliveries}/${result.endpoints})${
          result.summary ? ` ${result.summary}` : ""
        }`,
      );
    } catch (err) {
      console.error(`Event ${event.id}: dispatcher error`, err.message);
      await updateEvent(event.id, {
        attempts: (event.attempts ?? 0) + 1,
        last_attempt_at: new Date().toISOString(),
        last_error: `dispatcher error: ${err.message}`.slice(0, 500),
      }).catch((updateErr) => console.error("Failed to record dispatcher error", updateErr.message));
    }
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
