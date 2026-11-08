// What kind of device/browser the visitor is on, for install and push advice.
//
// The one fact that drives most of this: on iPhone/iPad, web push only works
// from the installed (home-screen) app, iOS 16.4+. Safari in a tab never gets
// a push permission prompt, and iOS never fires `beforeinstallprompt`, so the
// install has to be explained step by step.

const getUserAgent = () =>
  typeof navigator !== "undefined" ? navigator.userAgent || "" : "";

/** Running as the installed app (home screen / desktop app window). */
export function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
  } catch {
    // matchMedia unsupported: fall through to the iOS flag.
  }
  return typeof navigator !== "undefined" && navigator.standalone === true;
}

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with touch). */
export function isIOSDevice() {
  const ua = getUserAgent();
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return (
    /Macintosh/i.test(ua) &&
    typeof navigator !== "undefined" &&
    Number(navigator.maxTouchPoints) > 1
  );
}

export function isAndroidDevice() {
  return /Android/i.test(getUserAgent());
}

/**
 * Social-app web views (Instagram, Facebook, Messenger, LinkedIn, Snapchat,
 * TikTok, Line). They cannot install an app or receive push; the visitor has
 * to open the page in their real browser first. WhatsApp hands links to the
 * system browser, so it is not listed.
 */
export function isInAppBrowser() {
  return /Instagram|FBAN|FBAV|FB_IAB|Messenger|LinkedInApp|Snapchat|musical_ly|TikTok|Line\//i.test(
    getUserAgent(),
  );
}

export function isSamsungInternetBrowser() {
  return /SamsungBrowser/i.test(getUserAgent());
}

/**
 * The install situation in one value, for choosing which instructions to show:
 *  - "installed"  already running as the app
 *  - "in-app"     inside a social app's web view: open in the browser first
 *  - "ios"        iPhone/iPad browser: Share -> Add to Home Screen
 *  - "android"    Android browser (a native prompt may also be available)
 *  - "desktop"    anything else
 */
export function getInstallPlatform() {
  if (isStandaloneApp()) return "installed";
  if (isInAppBrowser()) return "in-app";
  if (isIOSDevice()) return "ios";
  if (isAndroidDevice()) return "android";
  return "desktop";
}
