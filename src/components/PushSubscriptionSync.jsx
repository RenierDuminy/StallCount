import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";

// Keeps the device's push subscription linked to the signed-in user without
// any UI. Runs once per session (and again if the service worker reports a
// subscription change) and never prompts for permission: it only re-syncs
// devices where the user already enabled push on the Notifications page.
export default function PushSubscriptionSync() {
  const { session } = useAuth();
  const profileId = session?.user?.id ?? null;

  useEffect(() => {
    if (!profileId) return undefined;
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return undefined;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const { syncPushSubscription } = await import("../pwa/pushClient");
        if (cancelled) return;
        await syncPushSubscription(profileId);
      } catch (err) {
        console.warn("[push] Subscription sync skipped", err);
      }
    };
    void run();
    const handleMessage = (event) => {
      if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED") {
        void run();
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [profileId]);

  return null;
}
