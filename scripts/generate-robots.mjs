// Writes public/robots.txt at build time. The sitemap itself is no longer a
// file: /sitemap.xml is built from the database on request by api/sitemap.js
// (rewritten in vercel.json). Do not write public/sitemap.xml here: Vercel
// serves a real file ahead of any rewrite, which would hide the live one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const robotsOutputPath = path.join(projectRoot, "public", "robots.txt");
const staleSitemapPath = path.join(projectRoot, "public", "sitemap.xml");

// The one official address (no domain of its own; see SeoManager.jsx). Never
// a preview deployment's VERCEL_URL, or previews would advertise themselves.
const baseUrl = (process.env.VITE_SITE_URL || "https://stallcount.vercel.app").replace(/\/$/, "");

// Staff and personal areas. No trailing slash, so the area's own page is
// covered as well as everything under it (`/admin` and `/admin/...`). These
// pages also carry a noindex tag (SeoManager); this keeps crawlers out.
const robotsContent = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /captain
Disallow: /scorekeeper
Disallow: /spirit-scores
Disallow: /notifications
Disallow: /user
Disallow: /login
Disallow: /overlays/
Disallow: /overlay-debug.html

Sitemap: ${baseUrl}/sitemap.xml
`;

fs.writeFileSync(robotsOutputPath, robotsContent, "utf8");
if (fs.existsSync(staleSitemapPath)) fs.rmSync(staleSitemapPath);

console.log(`Generated robots.txt: ${robotsOutputPath}`);
