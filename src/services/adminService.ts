import { supabase } from "./supabaseClient";
import { listTableColumns, pickRecencyColumn } from "./schemaService";

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

export type TableQueryOptions = {
  limit?: number;
  orderBy?: string | null;
  ascending?: boolean;
  filter?: { column: string; value: string };
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
        actor:user!audit_log_actor_id_fkey(id, full_name, email)
      `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Failed to load audit log entries");
  }

  return (data ?? []) as AuditLogEntry[];
}

export function getBaseTableName(tableName: string): string {
  return tableName.includes(".") ? tableName.split(".")[1] : tableName;
}

export async function queryTableRows(
  tableName: string,
  options: TableQueryOptions = {},
): Promise<Record<string, unknown>[]> {
  const recencyColumn = options.orderBy ?? pickRecencyColumn(tableName);
  const columns = listTableColumns(tableName);
  const baseName = getBaseTableName(tableName);
  const limit = options.limit ?? 50;
  const shouldOrder = !!(recencyColumn && columns.includes(recencyColumn));

  const buildQuery = (withOrdering: boolean) => {
    let query = supabase.from(baseName).select("*").limit(limit);

    if (
      withOrdering &&
      shouldOrder &&
      recencyColumn
    ) {
      query = query.order(recencyColumn, { ascending: options.ascending ?? false, nullsFirst: false });
    }

    if (options.filter?.column && options.filter.value !== undefined && options.filter.value !== "") {
      if (columns.includes(options.filter.column)) {
        query = query.ilike(options.filter.column, `%${options.filter.value}%`);
      }
    }

    return query;
  };

  let { data, error } = await buildQuery(true);

  if (error && shouldOrder) {
    // Retry without ordering if the chosen column is missing or blocked.
    ({ data, error } = await buildQuery(false));
  }

  if (error) {
    throw new Error(error.message || `Failed to load rows from ${tableName}`);
  }

  return (data ?? []) as Record<string, unknown>[];
}

export async function getRecentTableRows(tableName: string, limit = 20): Promise<Record<string, unknown>[]> {
  return queryTableRows(tableName, { limit });
}

export async function insertTableRow(
  tableName: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from(getBaseTableName(tableName))
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || `Failed to insert row into ${tableName}`);
  }

  return (data as Record<string, unknown>) ?? null;
}

export async function updateTableRow(
  tableName: string,
  primaryKey: string,
  recordId: string | number,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  if (!primaryKey) {
    throw new Error("Primary key column is required to update a row.");
  }

  const { data, error } = await supabase
    .from(getBaseTableName(tableName))
    .update(payload)
    .eq(primaryKey, recordId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || `Failed to update row in ${tableName}`);
  }

  return (data as Record<string, unknown>) ?? null;
}

export async function queryTableRowsExact(
  tableName: string,
  options: { column: string; value: string | number; limit?: number },
): Promise<{ rows: Record<string, unknown>[]; count: number | null }> {
  if (!options.column) {
    throw new Error("Column is required to query rows.");
  }
  const columns = listTableColumns(tableName);
  if (columns.length && !columns.includes(options.column)) {
    throw new Error(`Column "${options.column}" not found on ${tableName}.`);
  }

  const { data, error, count } = await supabase
    .from(getBaseTableName(tableName))
    .select("*", { count: "exact" })
    .eq(options.column, options.value)
    .limit(options.limit ?? 200);

  if (error) {
    throw new Error(error.message || `Failed to load rows from ${tableName}`);
  }

  return { rows: (data ?? []) as Record<string, unknown>[], count };
}

export async function queryTableRowsByFilters(
  tableName: string,
  filters: { column: string; value: string | number }[],
  options: { limit?: number } = {},
): Promise<{ rows: Record<string, unknown>[]; count: number | null }> {
  const columns = listTableColumns(tableName);
  const validFilters = (filters || []).filter((filter) => filter.column);
  if (!validFilters.length) {
    throw new Error("At least one filter is required to query rows.");
  }
  validFilters.forEach((filter) => {
    if (columns.length && !columns.includes(filter.column)) {
      throw new Error(`Column "${filter.column}" not found on ${tableName}.`);
    }
  });

  let query = supabase
    .from(getBaseTableName(tableName))
    .select("*", { count: "exact" })
    .limit(options.limit ?? 200);

  validFilters.forEach((filter) => {
    query = query.eq(filter.column, filter.value);
  });

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message || `Failed to load rows from ${tableName}`);
  }

  return { rows: (data ?? []) as Record<string, unknown>[], count };
}

export async function deleteTableRow(
  tableName: string,
  primaryKey: string,
  recordId: string | number,
): Promise<Record<string, unknown> | null> {
  if (!primaryKey) {
    throw new Error("Primary key column is required to delete a row.");
  }

  const { data, error } = await supabase
    .from(getBaseTableName(tableName))
    .delete()
    .eq(primaryKey, recordId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || `Failed to delete row from ${tableName}`);
  }

  return (data as Record<string, unknown>) ?? null;
}

export async function deleteTableRowByFilters(
  tableName: string,
  filters: { column: string; value: string | number }[],
): Promise<Record<string, unknown>[]> {
  const columns = listTableColumns(tableName);
  const validFilters = (filters || []).filter((filter) => filter.column);
  if (!validFilters.length) {
    throw new Error("At least one filter is required to delete rows.");
  }
  validFilters.forEach((filter) => {
    if (columns.length && !columns.includes(filter.column)) {
      throw new Error(`Column "${filter.column}" not found on ${tableName}.`);
    }
  });

  let query = supabase.from(getBaseTableName(tableName)).delete();
  validFilters.forEach((filter) => {
    query = query.eq(filter.column, filter.value);
  });

  const { data, error } = await query.select("*");
  if (error) {
    throw new Error(error.message || `Failed to delete rows from ${tableName}`);
  }

  return (data ?? []) as Record<string, unknown>[];
}
