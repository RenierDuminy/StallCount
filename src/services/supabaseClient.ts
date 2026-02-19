import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const VIEWER_ACCESS_ROLE = "user";

let hasAuthenticatedSession = false;

export function setSupabaseAuthState(isAuthenticated: boolean) {
  hasAuthenticatedSession = Boolean(isAuthenticated);
}

const viewerFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (!hasAuthenticatedSession) {
    headers.set("x-access-level", VIEWER_ACCESS_ROLE);
  }
  return fetch(input, { ...init, headers });
};

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase environment variables are missing. Check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: viewerFetch,
  },
});

export type PlayerRow = {
  id: string;
  name: string;
  gender_code: "M" | "W" | null;
  event_id: string | null;
  team_id: string | null;
  team_name: string | null;
  jersey_number: number | null;
};
