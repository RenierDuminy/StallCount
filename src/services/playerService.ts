import { supabase, type PlayerRow } from "./supabaseClient";
import { getCachedQuery, invalidateCachedQuery } from "../utils/queryCache";

const PLAYER_DIRECTORY_CACHE_TTL_MS = 10 * 60 * 1000;

type TeamRosterRow = {
  id: string;
  event_id: string | null;
  team_id: string | null;
  players: {
    id: string;
    name: string;
    gender_code: "M" | "W" | null;
    jersey_number: number | null;
  } | null;
  teams: {
    id: string;
    name: string;
    short_name: string | null;
  } | null;
};

export type PlayerDirectoryRow = {
  id: string;
  name: string;
  gender_code: "M" | "W" | null;
  jersey_number: number | null;
  birthday: string | null;
  description: string | null;
};

export type RosterEntry = {
  id: string;
  player: {
    id: string;
    name: string;
    jersey_number: number | null;
  } | null;
  event: {
    id: string;
    name: string;
  } | null;
  team: {
    id: string;
    name: string;
  } | null;
  is_captain: boolean;
  is_spirit_captain: boolean;
};

export type EventRosterEntry = {
  id: string;
  event_id: string | null;
  team_id: string | null;
  is_captain: boolean | null;
  is_spirit_captain: boolean | null;
  player: {
    id: string;
    name: string;
    jersey_number: number | null;
    gender_code: "M" | "W" | null;
    birthday: string | null;
  } | null;
  team: {
    id: string;
    name: string;
    short_name: string | null;
  } | null;
};

const PLAYER_SELECT = "id, name, gender_code, jersey_number, birthday, description";

function normalizePlayerWriteError(error: unknown, fallback: string) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("row-level security") &&
    normalized.includes("player")
  ) {
    return "Your account cannot create or update `public.player` rows. Event-scoped roles in `event_user_roles` are not enough here because `player` has no `event_id`. Ask an admin to grant `manage_users`, or add a player-write policy/function that checks event access.";
  }

  return message || fallback;
}

export async function getAllPlayers(): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from("team_roster")
    .select(
      `
        id,
        event_id,
        team_id,
        players:player(id, name, gender_code, jersey_number),
        teams:teams(id, name, short_name)
      `
    )
    .order("team_id", { ascending: true })
    .order("jersey_number", { ascending: true, foreignTable: "player" });

  if (error) {
    throw new Error(error.message || "Failed to load players");
  }

  const rows = (data ?? []) as TeamRosterRow[];

  return rows.map((row) => ({
    id: row.players?.id ?? row.id,
    name: row.players?.name ?? "Unnamed player",
    gender_code: row.players?.gender_code ?? null,
    event_id: row.event_id ?? null,
    team_id: row.team_id ?? row.teams?.id ?? null,
    team_name: row.teams?.name ?? null,
    jersey_number: row.players?.jersey_number ?? null,
  }));
}

export async function getPlayersByTeam(teamId: string, eventId?: string | null) {
  if (!teamId) return [];

  let query = supabase
    .from("team_roster")
    .select(
      `
        id,
        players:player(id, name, gender_code, jersey_number)
      `
    )
    .eq("team_id", teamId);

  if (eventId) {
    query = query.eq("event_id", eventId);
  }

  const { data, error } = await query.order("jersey_number", {
    ascending: true,
    foreignTable: "player",
  });

  if (error) {
    throw new Error(error.message || "Failed to load team roster");
  }

  const rows = (data ?? []) as Array<{
    id: string;
    players: {
      id: string;
      name: string;
      gender_code: "M" | "W" | null;
      jersey_number: number | null;
    } | null;
  }>;

  return rows.map((row) => ({
    id: row.players?.id ?? row.id,
    name: row.players?.name ?? "Unnamed player",
    jersey_number: row.players?.jersey_number ?? null,
  }));
}

export async function getPlayerDirectory(): Promise<PlayerDirectoryRow[]> {
  return getCachedQuery(
    "players:directory",
    async () => {
      const { data, error } = await supabase
        .from("player")
        .select(PLAYER_SELECT)
        .order("name", { ascending: true });

      if (error) {
        throw new Error(error.message || "Failed to load player directory");
      }

      return (data ?? []) as PlayerDirectoryRow[];
    },
    { ttlMs: PLAYER_DIRECTORY_CACHE_TTL_MS },
  );
}

export async function getPlayersByIds(ids: string[]): Promise<PlayerDirectoryRow[]> {
  const uniqueIds = Array.from(new Set((ids || []).filter((id) => typeof id === "string" && id.trim().length > 0)));
  if (!uniqueIds.length) return [];
  const { data, error } = await supabase.from("player").select(PLAYER_SELECT).in("id", uniqueIds);
  if (error) {
    throw new Error(error.message || "Failed to load players");
  }
  return (data ?? []) as PlayerDirectoryRow[];
}

type UpsertPlayerPayload = {
  id?: string | null;
  name: string;
  gender_code?: "M" | "W" | null;
  jersey_number?: number | null;
  birthday?: string | null;
  description?: string | null;
};

export async function upsertPlayer(payload: UpsertPlayerPayload) {
  const base = {
    name: payload.name?.trim(),
    gender_code: payload.gender_code || null,
    jersey_number:
      typeof payload.jersey_number === "number" && !Number.isNaN(payload.jersey_number)
        ? payload.jersey_number
        : null,
    birthday: payload.birthday || null,
    description: payload.description?.trim() || null,
  };

  if (!base.name) {
    throw new Error("Player name is required.");
  }

  if (payload.id) {
    const { error } = await supabase.from("player").update(base).eq("id", payload.id);
    if (error) {
      throw new Error(normalizePlayerWriteError(error, "Unable to update player"));
    }
    invalidateCachedQuery("players:directory");
    return payload.id;
  }

  const { data, error } = await supabase
    .from("player")
    .insert(base)
    .select("id")
    .single();

  if (error) {
    throw new Error(normalizePlayerWriteError(error, "Unable to create player"));
  }

  invalidateCachedQuery("players:directory");

  return data?.id as string;
}

export async function getRosterEntries(teamId: string, eventId?: string | null) {
  if (!teamId) return [];

  let query = supabase
    .from("team_roster")
    .select(
      `
        id,
        is_captain,
        is_spirit_captain,
        player:player(id, name, jersey_number),
        team:teams(id, name),
        event:events(id, name)
      `
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  if (eventId) {
    query = query.eq("event_id", eventId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || "Failed to load team roster entries");
  }

  return (data ?? []) as RosterEntry[];
}

export async function getEventRosters(eventId: string): Promise<EventRosterEntry[]> {
  if (!eventId) {
    return [];
  }

  const { data, error } = await supabase
    .from("team_roster")
    .select(
      `
        id,
        event_id,
        team_id,
        is_captain,
        is_spirit_captain,
        player:player(id, name, jersey_number, gender_code, birthday),
        team:teams(id, name, short_name)
      `
    )
    .eq("event_id", eventId)
    .order("team_id", { ascending: true })
    .order("jersey_number", { ascending: true, foreignTable: "player" })
    .order("name", { ascending: true, foreignTable: "player" });

  if (error) {
    throw new Error(error.message || "Failed to load event rosters");
  }

  return (data ?? []) as EventRosterEntry[];
}

export async function addPlayerToRoster(options: {
  playerId: string;
  teamId: string;
  eventId: string;
  captainRole?: "captain" | "spirit" | null;
}) {
  const payload = {
    player_id: options.playerId,
    team_id: options.teamId,
    event_id: options.eventId,
    is_captain: options.captainRole === "captain",
    is_spirit_captain: options.captainRole === "spirit",
  };

  const { error } = await supabase.from("team_roster").insert(payload);

  if (error) {
    throw new Error(error.message || "Unable to add player to roster");
  }
}

export async function removePlayerFromRoster(rosterId: string) {
  const { error } = await supabase.from("team_roster").delete().eq("id", rosterId);

  if (error) {
    throw new Error(error.message || "Unable to remove roster entry");
  }
}

export async function updateRosterCaptainRole(
  rosterId: string,
  role: "captain" | "spirit" | null
) {
  const { error } = await supabase
    .from("team_roster")
    .update({
      is_captain: role === "captain",
      is_spirit_captain: role === "spirit",
    })
    .eq("id", rosterId);

  if (error) {
    throw new Error(error.message || "Unable to update captain assignment");
  }
}
