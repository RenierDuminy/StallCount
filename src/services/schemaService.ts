import schemaSql from "../../SQL_structure_8-11-2026.txt?raw";

const TABLE_REGEX = /CREATE\s+TABLE\s+([^\s(]+)\s*\(/gi;
const TABLE_BLOCK_REGEX = /CREATE\s+TABLE\s+([^\s(]+)\s*\(([\s\S]*?)\);/gi;
const SCHEMA_PREFIX = "public.";

type TableColumnsMap = Record<string, string[]>;

function parseSchemaTables(schema: string): { tables: string[]; columns: TableColumnsMap } {
  const seen = new Set<string>();
  const tables: string[] = [];
  const columns: TableColumnsMap = {};
  let match;

  while ((match = TABLE_REGEX.exec(schema)) !== null) {
    const rawName = match[1].replace(/\"/g, "");
    const normalized = rawName.includes(".") ? rawName : `${SCHEMA_PREFIX}${rawName}`;

    if (!seen.has(normalized)) {
      seen.add(normalized);
      tables.push(normalized);
    }
  }

  let blockMatch;
  while ((blockMatch = TABLE_BLOCK_REGEX.exec(schema)) !== null) {
    const rawName = blockMatch[1].replace(/\"/g, "");
    const normalized = rawName.includes(".") ? rawName : `${SCHEMA_PREFIX}${rawName}`;
    const body = blockMatch[2];
    const columnNames: string[] = [];

    body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .forEach((line) => {
        if (!line || line.startsWith("CONSTRAINT") || line.startsWith("--")) return;
        const normalizedLine = line.replace(/,$/, "");
        const columnMatch = /^"?(?<name>[A-Za-z0-9_\.]+)"?\s/.exec(normalizedLine);
        if (!columnMatch?.groups?.name) return;
        const columnName = columnMatch.groups.name;
        if (!columnNames.includes(columnName)) {
          columnNames.push(columnName);
        }
      });

    columns[normalized] = columnNames;
  }

  return { tables, columns };
}

const PARSED_SCHEMA = parseSchemaTables(schemaSql);
const SCHEMA_TABLES = PARSED_SCHEMA.tables;
const SCHEMA_COLUMNS = PARSED_SCHEMA.columns;

export function listSchemaTables(): string[] {
  return SCHEMA_TABLES;
}

export function listTableColumns(tableName: string): string[] {
  return SCHEMA_COLUMNS[tableName] ?? [];
}

const RECENCY_CANDIDATES = [
  "created_at",
  "delivered_at",
  "submitted_at",
  "start_time",
  "start_date",
  "end_date",
  "updated_at",
  "id",
];

export function pickRecencyColumn(tableName: string): string | null {
  const columns = listTableColumns(tableName);
  for (const candidate of RECENCY_CANDIDATES) {
    if (columns.includes(candidate)) {
      return candidate;
    }
  }

  const fallback = columns.find((name) => name.endsWith("_at") || name.endsWith("_date"));
  return fallback ?? null;
}

export const SCHEMA_SOURCE_FILE = "SQL_structure_8-11-2026.txt";
