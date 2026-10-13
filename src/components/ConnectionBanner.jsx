import { useEffect, useState } from "react";
import useInstallPrompt from "../hooks/useInstallPrompt";

// Samsung Internet signs its own WebAPKs, and Google Play Protect blocks them
// as "built for an older version of Android". The target SDK is set by
// Samsung's minting server, not by our manifest, so the only fix on our side
// is to steer Samsung users to Chrome (whose WebAPKs pass) or to a plain
// home-screen shortcut, which is not an APK and is never scanned.
const isSamsungInternet =
  typeof navigator !== "undefined" && /SamsungBrowser/i.test(navigator.userAgent);

// Android intent that reopens the current page in Chrome. If Chrome is not
// installed, Android offers it from the Play Store instead.
function buildOpenInChromeHref() {
  const { host, pathname, search, hash } = window.location;
  return `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;package=com.android.chrome;end`;
}

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

  if (!online) {
    return (
      <div className="w-full border-b border-warning-border bg-warning-bg px-4 py-2 text-center text-sm font-semibold text-warning-ink">
        Offline. You can keep entering scores - changes are queued and sync when you're back online.
      </div>
    );
  }

  if (isSamsungInternet) {
    return (
      <div className="flex w-full flex-col gap-2 bg-brand/10 px-4 py-3 text-center text-sm text-brand-dark md:flex-row md:items-center md:justify-center md:gap-4">
        <span className="font-semibold">Install StallCount</span>
        <a
          href={buildOpenInChromeHref()}
          className="inline-flex items-center justify-center self-center rounded-full border border-brand/60 px-4 py-1 text-xs font-semibold text-brand-dark! no-underline transition hover:bg-brand hover:text-white!"
        >
          Open in Chrome to install
        </a>
        <span className="text-xs">
          Or stay here: Menu &rarr; Add page to &rarr; Home screen
        </span>
      </div>
    );
  }

  return (
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
  );
}
