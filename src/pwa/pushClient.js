import {
  deletePushSubscriptionRow,
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
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const json = subscription.toJSON();
  await upsertPushSubscriptionRow({
    profile_id: profileId,
    endpoint: json.endpoint || subscription.endpoint,
    p256dh_key: json.keys?.p256dh || "",
    auth_key: json.keys?.auth || "",
  });
  return subscription;
}

export async function disablePushSubscription(profileId) {
  if (!supportsPush) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;
  const endpoint = subscription.endpoint;
  try {
    await subscription.unsubscribe();
  } catch (err) {
    console.warn("Failed to unsubscribe from push manager", err);
  }
  await deletePushSubscriptionRow({ profileId, endpoint });
  return true;
}
