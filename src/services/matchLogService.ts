import { supabase } from "./supabaseClient";

export const MATCH_LOG_EVENT_CODES = {
  SCORE: "score",
  MATCH_START: "match_start",
  MATCH_END: "match_end",
  TURNOVER: "turnover",
  TIMEOUT_START: "timeout_start",
  TIMEOUT_END: "timeout_end",
  HALFTIME_START: "halftime_start",
  HALFTIME_END: "halftime_end",
  STOPPAGE_START: "stoppage_start",
  STOPPAGE_END: "stoppage_end",
  CALAHAN: "callahan",
} as const;

export const DEFAULT_MATCH_EVENT_DEFINITIONS = [
  { code: MATCH_LOG_EVENT_CODES.SCORE, description: "Score" },
  { code: MATCH_LOG_EVENT_CODES.MATCH_START, description: "Match start" },
  { code: MATCH_LOG_EVENT_CODES.MATCH_END, description: "Match end" },
  { code: MATCH_LOG_EVENT_CODES.TURNOVER, description: "Turnover" },
  { code: MATCH_LOG_EVENT_CODES.TIMEOUT_START, description: "Timeout start" },
  { code: MATCH_LOG_EVENT_CODES.TIMEOUT_END, description: "Timeout end" },
  { code: MATCH_LOG_EVENT_CODES.HALFTIME_START, description: "Halftime start" },
  { code: MATCH_LOG_EVENT_CODES.HALFTIME_END, description: "Halftime end" },
  { code: MATCH_LOG_EVENT_CODES.STOPPAGE_START, description: "Stoppage start" },
  { code: MATCH_LOG_EVENT_CODES.STOPPAGE_END, description: "Stoppage end" },
  { code: MATCH_LOG_EVENT_CODES.CALAHAN, description: "Callahan goal" },
] as const;

export type MatchLogInput = {
  matchId: string;
  eventTypeCode?: keyof typeof MATCH_LOG_EVENT_CODES | string;
  eventTypeId?: number | null;
  teamId?: string | null;
  actorId?: string | null;
  secondaryActorId?: string | null;
  abbaLine?: string | null;
  createdAt?: string | null;
  optimisticId?: string | null;
};

export type MatchLogRow = {
  id: string;
  match_id: string;
  event_type_id: number;
  team_id: string | null;
  actor_id: string | null;
  secondary_actor_id: string | null;
  abba_line: string | null;
  optimistic_id?: string | null;
  created_at: string;
  event?: {
    id: number;
    code: string | null;
    description: string | null;
  } | null;
  actor?: { id: string; name: string | null } | null;
  secondary_actor?: { id: string; name: string | null } | null;
};

export type MatchLogUpdate = {
  teamId?: string | null;
  actorId?: string | null;
  secondaryActorId?: string | null;
  eventTypeCode?: keyof typeof MATCH_LOG_EVENT_CODES | string;
  abbaLine?: string | null;
};

const eventTypeCache = new Map<string, number>();

const MATCH_LOG_SELECT =
  "id, match_id, event_type_id, team_id, actor_id, secondary_actor_id, abba_line, created_at, optimistic_id, event:match_events!match_logs_event_type_id_fkey(id, code, description), actor:player!match_logs_actor_id_fkey(id, name), secondary_actor:player!match_logs_secondary_actor_id_fkey(id, name)";
const MATCH_LOG_SELECT_LEGACY =
  "id, match_id, event_type_id, team_id, actor_id, secondary_actor_id, abba_line, created_at, event:match_events!match_logs_event_type_id_fkey(id, code, description), actor:player!match_logs_actor_id_fkey(id, name), secondary_actor:player!match_logs_secondary_actor_id_fkey(id, name)";

const prefersOptimisticId =
  typeof import.meta !== "undefined" &&
  typeof import.meta.env !== "undefined" &&
  import.meta.env?.VITE_SUPPORTS_MATCH_LOG_OPTIMISTIC_ID === "true";

let matchLogsSupportsOptimisticId: boolean = Boolean(prefersOptimisticId);

function isMissingOptimisticColumn(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String((error as any).message || "") : "";
  return message.toLowerCase().includes("optimistic_id");
}

async function ensureDefaultMatchEvents() {
  // Writes are blocked by RLS; keep this noop to avoid accidental inserts.
}

async function resolveEventTypeId(eventTypeCode: string): Promise<number> {
  if (eventTypeCache.has(eventTypeCode)) {
    return eventTypeCache.get(eventTypeCode)!;
  }

  const fetchId = async () => {
    const { data, error } = await supabase
      .from("match_events")
      .select("id")
      .eq("code", eventTypeCode)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || `Unable to resolve event type: ${eventTypeCode}`);
    }

    return data?.id ?? null;
  };

  let id = await fetchId();

  if (!id) {
    throw new Error(
      `Missing match_events entry for code "${eventTypeCode}". Ask an admin to seed match_events.`
    );
  }

  eventTypeCache.set(eventTypeCode, id);
  return id;
}

export async function getMatchLogs(matchId: string) {
  const selectClause = matchLogsSupportsOptimisticId ? MATCH_LOG_SELECT : MATCH_LOG_SELECT_LEGACY;
  const { data, error } = await supabase
    .from("match_logs")
    .select(selectClause)
    .eq("match_id", matchId)
    .order("created_at", { ascending: true });

  if (error) {
    if (matchLogsSupportsOptimisticId && isMissingOptimisticColumn(error)) {
      matchLogsSupportsOptimisticId = false;
      return getMatchLogs(matchId);
    }
    throw new Error(error.message || "Failed to fetch match logs");
  }

  return (data ?? []) as MatchLogRow[];
}

export async function createMatchLogEntry(input: MatchLogInput) {
  const resolvedEventTypeId =
    typeof input.eventTypeId === "number" && Number.isFinite(input.eventTypeId)
      ? input.eventTypeId
      : input.eventTypeCode
        ? await resolveEventTypeId(input.eventTypeCode)
        : null;

  if (!resolvedEventTypeId) {
    throw new Error("eventTypeId or eventTypeCode is required to create a match log entry.");
  }

  const payload: Record<string, unknown> = {
    match_id: input.matchId,
    event_type_id: resolvedEventTypeId,
    team_id: input.teamId ?? null,
    actor_id: input.actorId ?? null,
    secondary_actor_id: input.secondaryActorId ?? null,
    abba_line: input.abbaLine ?? null,
    created_at: input.createdAt || undefined,
  };

  if (matchLogsSupportsOptimisticId) {
    payload.optimistic_id = input.optimisticId ?? null;
  }

  const { data, error } = await supabase
    .from("match_logs")
    .insert(payload)
    .select(matchLogsSupportsOptimisticId ? MATCH_LOG_SELECT : MATCH_LOG_SELECT_LEGACY)
    .maybeSingle();

  if (error || !data) {
    if (matchLogsSupportsOptimisticId && isMissingOptimisticColumn(error)) {
      matchLogsSupportsOptimisticId = false;
      return createMatchLogEntry(input);
    }
    throw new Error(error?.message || "Failed to create match log");
  }

  return data as MatchLogRow;
}

export async function updateMatchLogEntry(logId: string, updates: MatchLogUpdate) {
  const updatePayload: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(updates, "teamId")) {
    updatePayload.team_id = updates.teamId ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "actorId")) {
    updatePayload.actor_id = updates.actorId ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "secondaryActorId")) {
    updatePayload.secondary_actor_id = updates.secondaryActorId ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "eventTypeCode") && updates.eventTypeCode) {
    updatePayload.event_type_id = await resolveEventTypeId(updates.eventTypeCode);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "abbaLine")) {
    updatePayload.abba_line = updates.abbaLine ?? null;
  }

  if (Object.keys(updatePayload).length === 0) {
    const { data, error } = await supabase
      .from("match_logs")
      .select(MATCH_LOG_SELECT)
      .eq("id", logId)
      .maybeSingle();

    if (error || !data) {
      throw new Error(error?.message || "Failed to fetch match log");
    }

    return data as MatchLogRow;
  }

  const { data, error } = await supabase
    .from("match_logs")
    .update(updatePayload)
    .eq("id", logId)
    .select(MATCH_LOG_SELECT)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message || "Failed to update match log");
  }

  return data as MatchLogRow;
}

export async function deleteMatchLogEntry(logId: string) {
  const { error } = await supabase.from("match_logs").delete().eq("id", logId);
  if (error) {
    throw new Error(error.message || "Failed to delete match log");
  }
}

export async function getMatchEventDefinitions() {
  const load = async () => {
    const { data, error } = await supabase
      .from("match_events")
      .select("id, code, description")
      .order("code", { ascending: true });

    if (error) {
      throw new Error(error.message || "Failed to load match event definitions");
    }

    return data ?? [];
  };

  return load();
}
