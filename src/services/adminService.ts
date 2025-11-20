import { supabase } from "./supabaseClient";
import { pickRecencyColumn } from "./schemaService";

export type AuditLogEntry = {
  id: number;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  change_data: Record<string, unknown> | null;
  created_at: string;
  actor: {
    id: string | null;
    full_name: string | null;
    email: string | null;
  } | null;
};

export async function getRecentAuditLogs(limit = 20): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select(
      `
        id,
        table_name,
        record_id,
        action,
        change_data,
        created_at,
        actor:profiles!audit_log_actor_id_fkey(id, full_name, email)
      `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Failed to load audit log entries");
  }

  return (data ?? []) as AuditLogEntry[];
}

function toBaseTableName(tableName: string): string {
  return tableName.includes(".") ? tableName.split(".")[1] : tableName;
}

export async function getRecentTableRows(tableName: string, limit = 20): Promise<Record<string, unknown>[]> {
  const recencyColumn = pickRecencyColumn(tableName);
  const baseName = toBaseTableName(tableName);

  const buildQuery = () => {
    let query = supabase.from(baseName).select("*").limit(limit);
    if (recencyColumn) {
      query = query.order(recencyColumn, { ascending: false, nullsFirst: false });
    }
    return query;
  };

  let { data, error } = await buildQuery();

  if (error && recencyColumn) {
    // Retry without ordering if the chosen column is missing or blocked.
    ({ data, error } = await supabase.from(baseName).select("*").limit(limit));
  }

  if (error) {
    throw new Error(error.message || `Failed to load rows from ${tableName}`);
  }

  return (data ?? []) as Record<string, unknown>[];
}
