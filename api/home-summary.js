import { createClient } from "@supabase/supabase-js";
import { HOME_SUMMARY_SECTIONS, buildHomeSummary, readLimits } from "./_lib/homeSummary.js";

// GET /api/home-summary?section=hero|below-fold|streaming|finals[&limit params]
//
// The home page's public summaries, cached at Vercel's edge for 15-60 s so
// that every visitor shares one database read per section instead of each
// browser making its own. Read with the anon key, so it returns exactly what a
// signed-out visitor could read anyway. The personalised "Your notifications"
// section is not here: it is per person and stays a direct read.
//
// A failed essential read answers 502 with no-store, and the client then reads
// Supabase directly (src/services/homeSummaryService.js), so this endpoint
// can never take the home page down.

const supabaseUrl =
  globalThis.process?.env?.SUPABASE_URL || globalThis.process?.env?.VITE_SUPABASE_URL;
const anonKey =
  globalThis.process?.env?.SUPABASE_ANON_KEY || globalThis.process?.env?.VITE_SUPABASE_ANON_KEY;

let client = null;
function getClient() {
  if (!client) {
    client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const section = String(req.query?.section ?? "");
  const config = HOME_SUMMARY_SECTIONS[section];
  if (!config) {
    res.setHeader("Cache-Control", "no-store");
    res.status(400).json({ error: "Unknown section" });
    return;
  }

  if (!supabaseUrl || !anonKey) {
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ error: "Supabase environment variables are missing" });
    return;
  }

  try {
    const summary = await buildHomeSummary(getClient(), section, readLimits(section, req.query));
    // s-maxage: how long the edge serves its copy without asking us.
    // stale-while-revalidate: past that, the edge keeps serving the old copy
    // while it fetches a new one, so no visitor waits on the database.
    // max-age=0: browsers do not keep it; the app has its own cache.
    res.setHeader(
      "Cache-Control",
      `public, max-age=0, s-maxage=${config.maxAgeSeconds}, stale-while-revalidate=${config.maxAgeSeconds * 2}`,
    );
    res.status(200).json(summary);
  } catch (error) {
    console.error(`[home-summary] ${section} failed`, error);
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: error?.message || "Failed to build summary" });
  }
}
