import schemaSql from "../../SQL_structure_28-12-2025.txt?raw";

const TABLE_REGEX = /CREATE\s+TABLE\s+([^\s(]+)\s*\(/gi;
const TABLE_BLOCK_REGEX = /CREATE\s+TABLE\s+([^\s(]+)\s*\(([\s\S]*?)\);/gi;
const SCHEMA_PREFIX = "public.";

type TableColumnsMap = Record<string, string[]>;
type TablePrimaryKeyMap = Record<string, string[]>;

type ForeignKeyRelation = {
  table: string;
  columns: string[];
  referencesTable: string;
  referencesColumns: string[];
  onDelete: string | null;
  constraint: string | null;
};

function normalizeTableName(rawName: string): string {
  const cleaned = rawName.replace(/\"/g, "");
  return cleaned.includes(".") ? cleaned : `${SCHEMA_PREFIX}${cleaned}`;
}

function parseSchemaTables(schema: string): { tables: string[]; columns: TableColumnsMap } {
  TABLE_REGEX.lastIndex = 0;
  TABLE_BLOCK_REGEX.lastIndex = 0;
  const seen = new Set<string>();
  const tables: string[] = [];
  const columns: TableColumnsMap = {};
  let match;

  while ((match = TABLE_REGEX.exec(schema)) !== null) {
    const normalized = normalizeTableName(match[1]);

    if (!seen.has(normalized)) {
      seen.add(normalized);
      tables.push(normalized);
    }
  }

  let blockMatch;
  while ((blockMatch = TABLE_BLOCK_REGEX.exec(schema)) !== null) {
    const normalized = normalizeTableName(blockMatch[1]);
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

function parseSchemaPrimaryKeys(schema: string): TablePrimaryKeyMap {
  TABLE_BLOCK_REGEX.lastIndex = 0;
  const primaryKeys: TablePrimaryKeyMap = {};
  let blockMatch;

  while ((blockMatch = TABLE_BLOCK_REGEX.exec(schema)) !== null) {
    const tableName = normalizeTableName(blockMatch[1]);
    const body = blockMatch[2];
    const pkCols: string[] = [];

    const blockPkMatch = /PRIMARY KEY\s*\(([^)]+)\)/i.exec(body);
    if (blockPkMatch?.[1]) {
      blockPkMatch[1]
        .split(",")
        .map((entry) => entry.trim().replace(/\"/g, ""))
        .filter(Boolean)
        .forEach((col) => {
          if (!pkCols.includes(col)) pkCols.push(col);
        });
    } else {
      body
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/,$/, ""))
        .forEach((line) => {
          if (!/PRIMARY KEY/i.test(line)) return;
          if (/FOREIGN KEY/i.test(line)) return;
          const inlineMatch = /^"?(?<name>[A-Za-z0-9_\.]+)"?\s/.exec(line);
          if (inlineMatch?.groups?.name) {
            const colName = inlineMatch.groups.name;
            if (!pkCols.includes(colName)) pkCols.push(colName);
          }
        });
    }

    primaryKeys[tableName] = pkCols;
  }

  return primaryKeys;
}

const SCHEMA_PRIMARY_KEYS = parseSchemaPrimaryKeys(schemaSql);

function parseSchemaForeignKeys(schema: string): ForeignKeyRelation[] {
  TABLE_BLOCK_REGEX.lastIndex = 0;
  const relations: ForeignKeyRelation[] = [];
  let blockMatch;

  while ((blockMatch = TABLE_BLOCK_REGEX.exec(schema)) !== null) {
    const tableName = normalizeTableName(blockMatch[1]);
    const body = blockMatch[2];

    body
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/,$/, ""))
      .forEach((line) => {
        if (!line || !/FOREIGN KEY/i.test(line)) return;

        const fkMatch =
          /CONSTRAINT\s+"?(?<constraint>[^\s"]+)"?\s+FOREIGN KEY\s*\((?<cols>[^)]+)\)\s+REFERENCES\s+(?<refTable>[^\s(]+)\s*\((?<refCols>[^)]+)\)(?<rest>.*)/i.exec(
            line,
          );

        if (!fkMatch?.groups) return;

        const columns = fkMatch.groups.cols
          .split(",")
          .map((entry) => entry.trim().replace(/\"/g, ""))
          .filter(Boolean);
        const referencesColumns = fkMatch.groups.refCols
          .split(",")
          .map((entry) => entry.trim().replace(/\"/g, ""))
          .filter(Boolean);
        const referencesTable = normalizeTableName(fkMatch.groups.refTable);
        const rest = fkMatch.groups.rest ?? "";
        const onDeleteMatch = /ON DELETE\s+([A-Z_]+)/i.exec(rest);

        relations.push({
          table: tableName,
          columns,
          referencesTable,
          referencesColumns,
          onDelete: onDeleteMatch ? onDeleteMatch[1].toUpperCase() : null,
          constraint: fkMatch.groups.constraint || null,
        });
      });
  }

  return relations;
}

const SCHEMA_FOREIGN_KEYS = parseSchemaForeignKeys(schemaSql);

export function listSchemaTables(): string[] {
  return SCHEMA_TABLES;
}

export function listTableColumns(tableName: string): string[] {
  return SCHEMA_COLUMNS[tableName] ?? [];
}

export function listPrimaryKeyColumns(tableName: string): string[] {
  const normalized = normalizeTableName(tableName);
  return SCHEMA_PRIMARY_KEYS[normalized] ?? SCHEMA_PRIMARY_KEYS[tableName] ?? [];
}

export function listForeignKeys(): ForeignKeyRelation[] {
  return SCHEMA_FOREIGN_KEYS;
}

export function listForeignKeysByReferencedTable(tableName: string): ForeignKeyRelation[] {
  const normalized = normalizeTableName(tableName);
  return SCHEMA_FOREIGN_KEYS.filter((relation) => relation.referencesTable === normalized);
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

export const SCHEMA_SOURCE_FILE = "SQL_structure_28-12-2025.txt";
