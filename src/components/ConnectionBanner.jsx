import { useEffect, useState } from "react";
import useInstallPrompt from "../hooks/useInstallPrompt";

export default function ConnectionBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const { canInstall, promptInstall } = useInstallPrompt();

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online && !canInstall) return null;

  return online ? (
    <div className="flex w-full flex-col gap-2 bg-brand/10 px-4 py-3 text-center text-sm text-brand-dark md:flex-row md:items-center md:justify-center md:gap-4">
      <span className="font-semibold">Install StallCount</span>
      <button
        type="button"
        onClick={promptInstall}
        className="inline-flex items-center justify-center rounded-full border border-brand/60 px-4 py-1 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white"
      >
        Add to device
      </button>
    </div>
  ) : (
    <div className="w-full bg-amber-500/90 px-4 py-2 text-center text-sm font-semibold text-white">
      Connection lost. You can keep entering scores offline—changes will sync when you're
      back online.
    </div>
  );
}
