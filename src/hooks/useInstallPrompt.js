import { useCallback, useSyncExternalStore } from "react";

// The browser's install offer (`beforeinstallprompt`) fires once, early in the
// page load. It is captured here at module load into one shared store, so
// every component sees it, including ones that mount later (the event page's
// "Get the app" card is inside a lazy route and used to miss it, falling back
// to menu instructions while the header could prompt).

let deferredPrompt = null;
const listeners = new Set();

const emit = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit();
  });
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => deferredPrompt;
const getServerSnapshot = () => null;

export default function useInstallPrompt() {
  const prompt = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const promptInstall = useCallback(async () => {
    const current = deferredPrompt;
    if (!current) return false;
    // A prompt event can only be used once.
    deferredPrompt = null;
    emit();
    current.prompt();
    const { outcome } = await current.userChoice;
    return outcome === "accepted";
  }, []);

  return {
    canInstall: Boolean(prompt),
    promptInstall,
  };
}
