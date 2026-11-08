import { useState } from "react";
import { isSamsungInternetBrowser } from "../utils/installEnvironment";

// How to install StallCount on the visitor's own device, in one place. Used by
// the event page's "Get the app" card and the header's "Install app" guide, so
// both say the same thing.
//
// The steps name the BROWSER's menu by where it is and what it looks like:
// "the menu at the top right" was read as StallCount's own menu button, which
// sits in the same corner, and led people round in a loop.

export function ShareIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function Steps({ items }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ol>
  );
}

function isSafariDesktop() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/i.test(ua);
}

function isFirefoxDesktop() {
  return typeof navigator !== "undefined" && /Firefox/i.test(navigator.userAgent || "");
}

/**
 * `platform` comes from getInstallPlatform(). `canInstall`/`onInstall` come
 * from useInstallPrompt(): when the browser offers a native prompt, a single
 * Install button replaces the manual steps.
 */
export default function InstallSteps({ platform, canInstall, onInstall }) {
  const [copied, setCopied] = useState(false);

  if (platform === "installed") {
    return <p className="text-sm text-ink">StallCount is already installed on this device.</p>;
  }

  if (platform === "in-app") {
    const copyLink = async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    };
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          This app can&rsquo;t install StallCount. Open the page in your browser first.
        </p>
        <Steps
          items={[
            <>Tap <strong>&middot;&middot;&middot;</strong> at the top.</>,
            <>Choose <strong>Open in browser</strong> (or <strong>Open in Safari</strong>).</>,
          ]}
        />
        <button type="button" className="sc-button is-ghost w-full sm:w-auto" onClick={copyLink}>
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
    );
  }

  if (canInstall) {
    return (
      <div className="space-y-3">
        <button type="button" className="sc-button w-full sm:w-auto" onClick={onInstall}>
          Install StallCount
        </button>
      </div>
    );
  }

  if (platform === "ios") {
    return (
      <div className="space-y-3">
        <Steps
          items={[
            <>
              Tap <strong>Share</strong> <ShareIcon className="inline h-4 w-4 align-text-bottom" />{" "}
              (Safari: bottom bar, or under <strong>&middot;&middot;&middot;</strong>; Chrome: address bar).
            </>,
            <>
              Tap <strong>Add to Home Screen</strong>.
            </>,
            <>
              Tap <strong>Add</strong>, then open it and sign in.
            </>,
          ]}
        />
      </div>
    );
  }

  if (platform === "android") {
    return (
      <Steps
        items={
          isSamsungInternetBrowser()
            ? [
                <>
                  Tap <strong>&#9776;</strong> in the bottom bar.
                </>,
                <>Tap <strong>Add page to</strong>, then <strong>Home screen</strong>.</>,
              ]
            : [
                <>
                  Tap <strong>&#8942;</strong> beside the <strong>web address</strong> at the very top
                  (not the StallCount menu).
                </>,
                <>
                  Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.
                </>,
              ]
        }
      />
    );
  }

  // Desktop.
  if (isSafariDesktop()) {
    return (
      <Steps
        items={[
          <>In Safari&rsquo;s top menu bar, click <strong>File</strong>.</>,
          <>Click <strong>Add to Dock</strong>, then <strong>Add</strong>.</>,
        ]}
      />
    );
  }
  if (isFirefoxDesktop()) {
    return (
      <p className="text-sm text-ink-muted">
        Firefox can&rsquo;t install apps. Use Chrome or Edge, or your phone.
      </p>
    );
  }
  return (
    <Steps
      items={[
        <>
          Click the install icon in the address bar, or the browser menu &rarr;{" "}
          <strong>Install StallCount</strong>.
        </>,
        <>Click <strong>Install</strong>.</>,
      ]}
    />
  );
}
