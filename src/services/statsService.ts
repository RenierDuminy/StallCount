import { supabase } from "./supabaseClient";
import { getCachedQuery } from "../utils/queryCache";

const TABLE_COUNT_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getTableCount(tableName: string): Promise<number> {
  return getCachedQuery(
    `stats:count:${tableName}`,
    async () => {
      const { count, error } = await supabase
        .from(tableName)
        .select("*", { count: "exact", head: true });

      if (error) {
        throw new Error(error.message || `Failed to count ${tableName}`);
      }

      return count ?? 0;
    },
    { ttlMs: TABLE_COUNT_CACHE_TTL_MS },
  );
}
