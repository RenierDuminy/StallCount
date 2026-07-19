import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Identify the build so a running client can be matched against a deployment.
// On Vercel the SHA comes from the environment; locally it comes from git.
// Neither is guaranteed (shallow clone, no git, tarball), hence the fallback.
function resolveCommitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const COMMIT_SHA = resolveCommitSha();

// Stamp the SHA into index.html so a client can fetch it uncached and compare
// it against its own build -- see checkBuildFreshness() in buildInfo.js.
function buildShaPlugin() {
  return {
    name: "stallcount-build-sha",
    transformIndexHtml(html) {
      return html.replace(
        /<meta name="build-sha" content="[^"]*" \/>/,
        `<meta name="build-sha" content="${COMMIT_SHA}" />`,
      );
    },
  };
}

export default defineConfig({
  define: {
    __BUILD_SHA__: JSON.stringify(COMMIT_SHA),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    buildShaPlugin(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      // "prompt", not "autoUpdate": appUpdater.js handles activation itself via
      // onNeedRefresh so the reload can be deferred during a live match.
      // "autoUpdate" would add a second, competing reload path.
      registerType: "prompt",
      includeAssets: [
        "favicon.svg",
        "robots.txt",
        "sitemap.xml",
        "assets/stallcount-logo.svg",
        "assets/stallcount-logo.png",
      ],
      manifest: {
        name: "StallCount",
        short_name: "StallCount",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#111827",
        description:
          "Supabase-backed score keeping with offline resilience and realtime sync.",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      devOptions: {
        enabled: true,
        suppressWarnings: true,
      },
      injectManifest: {},
    }),
  ],
});
