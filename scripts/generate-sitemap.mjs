import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.join(projectRoot, "public", "sitemap.xml");
const robotsOutputPath = path.join(projectRoot, "public", "robots.txt");

function getBaseUrl() {
  const candidate =
    process.env.VITE_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;

  if (!candidate) {
    return "https://stallcount.vercel.app";
  }

  const withProtocol = candidate.startsWith("http") ? candidate : `https://${candidate}`;
  return withProtocol.replace(/\/$/, "");
}

const baseUrl = getBaseUrl();
const routes = [
  "/",
  "/events",
  "/matches",
  "/teams",
  "/players",
  "/community",
  "/event-rosters",
  "/event-rules",
];

const urlEntries = routes
  .map(
    (route) => `  <url>
    <loc>${baseUrl}${route}</loc>
    <changefreq>daily</changefreq>
    <priority>${route === "/" ? "1.0" : "0.8"}</priority>
  </url>`,
  )
  .join("\n");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`;

fs.writeFileSync(outputPath, sitemap, "utf8");

const robotsContent = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /sys-admin/
Disallow: /captain/
Disallow: /score-keeper
Disallow: /score-keeper-5v5
Disallow: /notifications
Disallow: /user
Disallow: /tournament-director
Disallow: /spirit-scores

Sitemap: ${baseUrl}/sitemap.xml
`;

fs.writeFileSync(robotsOutputPath, robotsContent, "utf8");

console.log(`Generated sitemap: ${outputPath}`);
console.log(`Generated robots.txt: ${robotsOutputPath}`);
