import {
  deletePushSubscriptionRow,
  hasPushSubscriptionRow,
  upsertPushSubscriptionRow,
} from "../services/pushSubscriptionService";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const supportsPush =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

function base64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const safe = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(safe);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * True when the browser subscription was created with the VAPID key this build
 * ships. A subscription bound to an old key is silently rejected (HTTP 403) by
 * the push service, so it must be replaced rather than reused.
 */
function subscriptionMatchesServerKey(subscription) {
  if (!subscription || !VAPID_PUBLIC_KEY) return false;
  const existing = subscription.options?.applicationServerKey;
  if (!existing) {
    // Some browsers do not expose the key; assume it matches rather than churn
    // the subscription on every visit.
    return true;
  }
  return bytesEqual(new Uint8Array(existing), base64ToUint8Array(VAPID_PUBLIC_KEY));
}

export function isPushSupported() {
  return supportsPush;
}

export async function getExistingSubscription() {
  if (!supportsPush) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function ensurePermission() {
  if (!supportsPush) {
    throw new Error("This browser does not support push notifications.");
  }
  if (Notification.permission === "denied") {
    throw new Error("Push notifications are blocked in the browser settings.");
  }
  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Accept the notification permission prompt to enable push alerts.");
    }
  }
}

async function persistSubscription(profileId, subscription) {
  const json = subscription.toJSON();
  await upsertPushSubscriptionRow({
    profile_id: profileId,
    endpoint: json.endpoint || subscription.endpoint,
    p256dh_key: json.keys?.p256dh || "",
    auth_key: json.keys?.auth || "",
  });
}

export async function ensurePushSubscription(profileId) {
  if (!supportsPush) {
    throw new Error("Push notifications are not supported in this browser.");
  }
  if (!profileId) {
    throw new Error("You must be signed in to enable push notifications.");
  }
  await ensurePermission();
  if (!VAPID_PUBLIC_KEY) {
    throw new Error("Missing VAPID public key. Set VITE_VAPID_PUBLIC_KEY in your environment.");
  }
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !subscriptionMatchesServerKey(subscription)) {
    const staleEndpoint = subscription.endpoint;
    try {
      await subscription.unsubscribe();
    } catch (err) {
      console.warn("Failed to drop stale push subscription", err);
    }
    try {
      await deletePushSubscriptionRow({ profileId, endpoint: staleEndpoint });
    } catch (err) {
      console.warn("Failed to remove stale push subscription row", err);
    }
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  await persistSubscription(profileId, subscription);
  return subscription;
}

/**
 * Reports whether push is genuinely enabled for this user on this device:
 * permission granted, a browser subscription on the current key, AND a matching
 * row in `push_subscriptions` for the dispatcher to deliver to.
 */
export async function getPushStatus(profileId) {
  const status = {
    supported: supportsPush,
    permission: supportsPush ? Notification.permission : "default",
    browserSubscribed: false,
    keyMismatch: false,
    serverLinked: false,
    enabled: false,
  };
  if (!supportsPush) return status;
  const subscription = await getExistingSubscription();
  if (!subscription) return status;
  status.browserSubscribed = true;
  status.keyMismatch = !subscriptionMatchesServerKey(subscription);
  if (profileId && !status.keyMismatch) {
    try {
      status.serverLinked = await hasPushSubscriptionRow({
        profileId,
        endpoint: subscription.endpoint,
      });
    } catch (err) {
      console.warn("Failed to verify push subscription row", err);
    }
  }
  status.enabled = status.permission === "granted" && status.browserSubscribed && !status.keyMismatch && status.serverLinked;
  return status;
}

/**
 * Quietly re-sync on app start for a signed-in user who previously granted
 * permission. Never prompts. Repairs three silent failure modes: a browser
 * subscription bound to a rotated VAPID key, a `push_subscriptions` row that
 * was pruned or never written, and an endpoint the browser rotated while the
 * app was closed (`pushsubscriptionchange`).
 */
export async function syncPushSubscription(profileId) {
  if (!supportsPush || !profileId || !VAPID_PUBLIC_KEY) return null;
  if (Notification.permission !== "granted") return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return null;
    // Only users who have explicitly enabled push have a browser subscription,
    // so re-subscribing here honours their earlier choice.
    return await ensurePushSubscription(profileId);
  } catch (err) {
    console.warn("[push] Background subscription sync failed", err);
    return null;
  }
}

export async function disablePushSubscription(profileId) {
  if (!supportsPush) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    if (profileId) {
      await deletePushSubscriptionRow({ profileId });
    }
    return true;
  }
  const endpoint = subscription.endpoint;
  try {
    await subscription.unsubscribe();
  } catch (err) {
    console.warn("Failed to unsubscribe from push manager", err);
  }
  await deletePushSubscriptionRow({ profileId, endpoint });
  return true;
}
