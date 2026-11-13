// GET /sitemap.xml (rewritten here in vercel.json): the list of public pages
// handed to search engines, built from the database on each request, so a new
// event or team appears in it without a redeploy and without anyone having to
// visit it first. Cached at Vercel's edge for an hour.
//
// Only public, read-only data is used (the anon key, the same reads a signed-out
// visitor makes). Player pages are deliberately left out: they are public, but
// a list of every player's name is not something to hand out (POPIA).

const SITE_ORIGIN = "https://stallcount.vercel.app";

const supabaseUrl =
  globalThis.process?.env?.SUPABASE_URL || globalThis.process?.env?.VITE_SUPABASE_URL;
const anonKey =
  globalThis.process?.env?.SUPABASE_ANON_KEY || globalThis.process?.env?.VITE_SUPABASE_ANON_KEY;

const STATIC_ROUTES = ["/", "/events", "/matches", "/teams", "/players", "/community"];

// Sub-pages of every event (src/pages/eventWorkspaces.js EVENT_SECTIONS);
// rosters is left out with the player pages.
const EVENT_SECTIONS = ["rules", "spirit"];

// Event addresses come from the stored `events.slug`. `slugify` (a verbatim
// copy of the one in src/pages/eventWorkspaces.js; serverless code cannot
// import from the Vite bundle, so change one, change both) is only the
// fallback for a database without the column yet.
const slugify = (value) => {
  if (typeof value !== "string") return null;
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
};

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

async function readRows(table, select, order) {
  const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}${order ? `&order=${order}` : ""}`;
  const response = await fetch(url, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "x-access-level": "user" },
  });
  if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
  return response.json();
}

function urlEntry(path, priority) {
  return `  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}${path}`)}</loc>\n    <priority>${priority}</priority>\n  </url>`;
}

export default async function handler(request, response) {
  const entries = STATIC_ROUTES.map((route) => urlEntry(route, route === "/" ? "1.0" : "0.8"));

  if (supabaseUrl && anonKey) {
    try {
      const [events, teams] = await Promise.all([
        // Before migration 20261113120000_event_slugs.sql the column does not
        // exist and the read is refused; fall back to names.
        readRows("events", "id,name,slug,start_date", "start_date.desc.nullslast").catch(() =>
          readRows("events", "id,name,start_date", "start_date.desc.nullslast"),
        ),
        readRows("teams", "id", null),
      ]);
      // Two events can share a name; the page shows the newest, so list each
      // slug once (the list is newest first).
      const seen = new Set();
      for (const event of events ?? []) {
        const slug = (typeof event?.slug === "string" && event.slug.trim()) || slugify(event?.name);
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        entries.push(urlEntry(`/events/${slug}`, "0.9"));
        for (const section of EVENT_SECTIONS) {
          entries.push(urlEntry(`/events/${slug}/${section}`, "0.5"));
        }
      }
      for (const team of teams ?? []) {
        if (team?.id) entries.push(urlEntry(`/teams/${encodeURIComponent(team.id)}`, "0.6"));
      }
    } catch (error) {
      // A partial sitemap (the static routes) beats an error page; the next
      // request tries again.
      console.error("[sitemap] database read failed:", error);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
  response.status(200);
  response.setHeader("Content-Type", "application/xml; charset=utf-8");
  response.setHeader("X-Robots-Tag", "noindex");
  response.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  response.send(xml);
}
