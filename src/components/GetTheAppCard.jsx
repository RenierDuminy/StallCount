import { useMemo, useState } from "react";
import useInstallPrompt from "../hooks/useInstallPrompt";
import { Card } from "./ui/primitives";
import InstallSteps from "./InstallSteps";
import { getInstallPlatform } from "../utils/installEnvironment";

// "Get the app" card for event pages, where new visitors arrive from a shared
// link. Explains the install for the visitor's own device right here (or
// offers the browser's one-tap install), and disappears once they are running
// the installed app. The steps are shared with the header's Install guide.

const DISMISS_KEY = "stallcount:get-app-card-dismissed";

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Storage blocked: the card simply returns on the next visit.
  }
}

export default function GetTheAppCard() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const platform = useMemo(() => getInstallPlatform(), []);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [installed, setInstalled] = useState(false);

  if (platform === "installed" || dismissed || installed) return null;
  // Desktop with no native prompt: not who this page is for.
  if (platform === "desktop" && !canInstall) return null;

  const dismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  const install = async () => {
    if (await promptInstall()) setInstalled(true);
  };

  return (
    <Card className="min-w-0 space-y-3 border border-white/70 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/icon-192.png" alt="" className="h-9 w-9 shrink-0 rounded-lg" loading="lazy" />
          <h2 className="text-xl font-semibold text-ink">Install the StallCount app</h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink-muted transition hover:text-ink"
          aria-label="Hide install instructions"
        >
          Hide
        </button>
      </div>
      <p className="text-sm text-ink-muted">
        Live scores and alerts from your home screen.
      </p>
      <InstallSteps platform={platform} canInstall={canInstall} onInstall={install} />
    </Card>
  );
}
