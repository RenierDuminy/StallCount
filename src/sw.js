import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/rules\//, /^\/.*\.[^/]+$/],
  }),
);

// Activate the new service worker only when the app asks (via updateSW in
// appUpdater.js) so the page can control when it reloads onto the new build.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return { body: event.data?.text() };
    }
  })();
  const title = payload.title || "StallCount";
  const options = {
    body: payload.body || "Tap to open StallCount.",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    // The dispatcher sends a unique `live-event-<id>` tag per event. Falling
    // back to a shared constant would make Android silently REPLACE the
    // previous notification instead of alerting again, so when no tag is given
    // we generate a unique one rather than reusing a fixed string.
    tag: payload.tag || `stallcount-${Date.now()}`,
    data: { url: payload.url || "/", ...payload.data },
    // Re-alert even when a tag repeats; without this a same-tag notification
    // updates silently on Android.
    renotify: payload.renotify !== false,
    // Android collapses notifications that arrive while the screen is locked
    // unless a vibration pattern marks them as user-facing.
    vibrate: payload.vibrate || [100, 50, 100],
    timestamp: Date.now(),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.includes(targetUrl) || client.url === self.location.origin + targetUrl) {
          client.focus();
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

// The browser can rotate or expire a push subscription while the app is
// closed. Re-subscribe here with the same server key so the device keeps a
// valid subscription, then tell any open tab to persist it. If no tab is open,
// `syncPushSubscription()` writes the new endpoint on the next app start, and
// the dispatcher prunes the dead one when the push service returns 404/410.
self.addEventListener("pushsubscriptionchange", (event) => {
  const serverKey =
    event.oldSubscription?.options?.applicationServerKey ||
    event.newSubscription?.options?.applicationServerKey ||
    null;
  const resubscribe = serverKey
    ? self.registration.pushManager
        .subscribe({ userVisibleOnly: true, applicationServerKey: serverKey })
        .catch((err) => {
          console.warn("[sw] Failed to renew push subscription", err);
          return null;
        })
    : Promise.resolve(null);
  event.waitUntil(
    resubscribe.then(() =>
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
        clientsArr.forEach((client) => client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" }));
      }),
    ),
  );
});
