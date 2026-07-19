// Build identity, for answering "which build is this browser actually running?"
//
// A green Vercel deploy does not mean the browser is running that code: the
// service worker holds the previous bundle until it activates and the page
// reloads (see appUpdater.js). When new code appears to be missing, the first
// question is whether the client is stale or the deployment is. These values
// answer that without guesswork.
//
// __BUILD_SHA__ / __BUILD_TIME__ are substituted at build time by Vite
// (see the `define` block in vite.config.js).

export const BUILD_SHA = __BUILD_SHA__;
export const BUILD_TIME = __BUILD_TIME__;

// Exposed on window so the running build can be read from a browser console on
// any device — including a phone in the field, where DevTools is not available
// but a remote console or a support prompt is.
export function publishBuildInfo() {
  if (typeof window === "undefined") return;

  window.__STALLCOUNT_BUILD__ = { sha: BUILD_SHA, builtAt: BUILD_TIME };

  console.info(
    `StallCount build ${BUILD_SHA} (built ${BUILD_TIME})`,
  );
}

// Compare the running build against the one the server is currently serving.
//
// index.html is fetched with cache: "no-store" so this bypasses both the HTTP
// cache and any stale service-worker response, giving the true deployed build.
// A mismatch means the client is running old code and has not yet reloaded onto
// the new one -- the exact condition that is otherwise invisible.
export async function fetchDeployedSha() {
  try {
    const response = await fetch("/index.html", { cache: "no-store" });
    if (!response.ok) return null;
    const html = await response.text();
    const match = html.match(/<meta name="build-sha" content="([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Returns { running, deployed, stale } — or null if the deployed build could
// not be determined (offline, fetch blocked), which is not the same as "fresh".
export async function checkBuildFreshness() {
  const deployed = await fetchDeployedSha();
  if (!deployed) return null;
  return {
    running: BUILD_SHA,
    deployed,
    stale: deployed !== BUILD_SHA,
  };
}
