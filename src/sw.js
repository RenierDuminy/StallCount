import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener("install", () => {
  self.skipWaiting();
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
    icon: payload.icon || "/StallCount logo_192_v1.png",
    badge: payload.badge || "/StallCount logo_192_v1.png",
    tag: payload.tag || "stallcount-updates",
    data: { url: payload.url || "/", ...payload.data },
    renotify: Boolean(payload.renotify),
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

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      clientsArr.forEach((client) => client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" }));
    }),
  );
});
