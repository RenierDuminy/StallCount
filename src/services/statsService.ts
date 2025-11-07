import { supabase } from "./supabaseClient";

export async function getTableCount(tableName: string): Promise<number> {
  const { count, error } = await supabase
    .from(tableName)
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(error.message || `Failed to count ${tableName}`);
  }

  return count ?? 0;
}
