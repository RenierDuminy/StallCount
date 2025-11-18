import { supabase } from "./supabaseClient";

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
