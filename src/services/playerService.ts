import { supabase, type PlayerRow } from "./supabaseClient";

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

const PLAYER_SELECT = "id, name, gender_code, jersey_number, birthday, description";

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

export async function getPlayersByTeam(teamId: string) {
  if (!teamId) return [];

  const { data, error } = await supabase
    .from("team_roster")
    .select(
      `
        id,
        players:player(id, name, gender_code, jersey_number)
      `
    )
    .eq("team_id", teamId)
    .order("jersey_number", { ascending: true, foreignTable: "player" });

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
  const { data, error } = await supabase
    .from("player")
    .select(PLAYER_SELECT)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load player directory");
  }

  return (data ?? []) as PlayerDirectoryRow[];
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
      throw new Error(error.message || "Unable to update player");
    }
    return payload.id;
  }

  const { data, error } = await supabase
    .from("player")
    .insert(base)
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message || "Unable to create player");
  }

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
