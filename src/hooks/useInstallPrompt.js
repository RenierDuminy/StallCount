import { useCallback, useEffect, useState } from "react";

export default function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredPrompt(event);
      setIsSupported(true);
    }

    function handleAppInstalled() {
      setDeferredPrompt(null);
      setIsSupported(false);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome !== "accepted") {
      return false;
    }
    setDeferredPrompt(null);
    return true;
  }, [deferredPrompt]);

  return {
    canInstall: Boolean(deferredPrompt) || isSupported,
    promptInstall,
  };
}
