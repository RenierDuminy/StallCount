import { supabase } from "./supabaseClient";

export type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  created_at: string;
};

export async function getAllTeams(limit?: number): Promise<TeamRow[]> {
  let query = supabase
    .from("teams")
    .select("id, name, short_name, created_at")
    .order("name", { ascending: true });

  if (typeof limit === "number") {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || "Failed to load teams");
  }

  return (data ?? []) as TeamRow[];
}
