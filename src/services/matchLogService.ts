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
} as const;

export type MatchLogInput = {
  matchId: string;
  eventTypeCode: keyof typeof MATCH_LOG_EVENT_CODES | string;
  teamId?: string | null;
  scorerId?: string | null;
  assistId?: string | null;
};

export type MatchLogRow = {
  id: string;
  match_id: string;
  event_type_id: number;
  team_id: string | null;
  scorer_id: string | null;
  assist_id: string | null;
  created_at: string;
  event?: {
    id: number;
    code: string | null;
    description: string | null;
    category: string | null;
  } | null;
  scorer?: { id: string; name: string | null } | null;
  assist?: { id: string; name: string | null } | null;
};

export type MatchLogUpdate = {
  teamId?: string | null;
  scorerId?: string | null;
  assistId?: string | null;
};

const eventTypeCache = new Map<string, number>();

const MATCH_LOG_SELECT =
  "id, match_id, event_type_id, team_id, scorer_id, assist_id, created_at, event:match_events!match_logs_event_type_id_fkey(id, code, description, category), scorer:players!match_logs_scorer_id_fkey(id, name), assist:players!match_logs_assist_id_fkey(id, name)";

async function resolveEventTypeId(eventTypeCode: string): Promise<number> {
  if (eventTypeCache.has(eventTypeCode)) {
    return eventTypeCache.get(eventTypeCode)!;
  }

  const { data, error } = await supabase
    .from("match_events")
    .select("id")
    .eq("code", eventTypeCode)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      error?.message || `Unable to resolve event type: ${eventTypeCode}`
    );
  }

  eventTypeCache.set(eventTypeCode, data.id);
  return data.id;
}

export async function getMatchLogs(matchId: string) {
  const { data, error } = await supabase
    .from("match_logs")
    .select(MATCH_LOG_SELECT)
    .eq("match_id", matchId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to fetch match logs");
  }

  return (data ?? []) as MatchLogRow[];
}

export async function createMatchLogEntry(input: MatchLogInput) {
  const eventTypeId = await resolveEventTypeId(input.eventTypeCode);

  const { data, error } = await supabase
    .from("match_logs")
    .insert({
      match_id: input.matchId,
      event_type_id: eventTypeId,
      team_id: input.teamId ?? null,
      scorer_id: input.scorerId ?? null,
      assist_id: input.assistId ?? null,
    })
    .select(MATCH_LOG_SELECT)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create match log");
  }

  return data as MatchLogRow;
}

export async function updateMatchLogEntry(logId: string, updates: MatchLogUpdate) {
  const updatePayload: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(updates, "teamId")) {
    updatePayload.team_id = updates.teamId ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "scorerId")) {
    updatePayload.scorer_id = updates.scorerId ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "assistId")) {
    updatePayload.assist_id = updates.assistId ?? null;
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
  const { data, error } = await supabase
    .from("match_events")
    .select("id, code, description, category")
    .order("code", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load match event definitions");
  }

  return data ?? [];
}
