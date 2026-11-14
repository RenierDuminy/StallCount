import { supabase, type PlayerRow } from "./supabaseClient";
import { selectAllRows, selectAllRowsForIds } from "./fetchAllRows";
import { getCachedQuery, invalidateCachedQueries, invalidateCachedQuery } from "../utils/queryCache";

const PLAYER_DIRECTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const PLAYER_IDS_CACHE_TTL_MS = 5 * 60 * 1000;

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
  // Whether a date of birth is on file. The date itself is never readable
  // through the API (POPIA); check one with getPlayerIdsWithBirthday().
  has_birthday: boolean | null;
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
    has_birthday: boolean | null;
  } | null;
  team: {
    id: string;
    name: string;
    short_name: string | null;
  } | null;
};

// `birthday` is deliberately absent: anon/authenticated may not SELECT it
// (20261108134000_hide_player_birthday.sql), and asking for it fails the query.
const PLAYER_SELECT = "id, name, gender_code, jersey_number, has_birthday, description";

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
    return "Your account cannot create or update `public.player` rows. Ask an admin to grant `player_insert` / `player_update` (or `admin_override`) for your role scope.";
  }

  return message || fallback;
}

function normalizeRosterWriteError(error: unknown, fallback: string) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("row-level security") &&
    normalized.includes("team_roster")
  ) {
    return "Your account cannot modify `public.team_roster` rows. Ask an admin to grant `roster_insert` / `roster_update` / `roster_delete` (or `admin_override`) for your event scope.";
  }

  return message || fallback;
}

export async function getAllPlayers(): Promise<PlayerRow[]> {
  // Every roster row there is: paged, or Supabase stops at 1000.
  const { data, error } = await selectAllRows(() =>
    supabase
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
      .order("id", { ascending: true })
      .order("jersey_number", { ascending: true, foreignTable: "player" })
  );

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
    event_id: row.event_id ?? null,
  }));
}

export async function getPlayersByTeam(teamId: string, eventId?: string | null) {
  if (!teamId) return [];

  let query = supabase
    .from("team_roster")
    .select(
      `
        id,
        event_id,
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
    event_id: string | null;
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
      // Paged: past 1000 players a single read silently dropped the rest from
      // the Players, Community and captain search pages.
      const { data, error } = await selectAllRows(() =>
        supabase
          .from("player")
          .select(PLAYER_SELECT)
          .order("name", { ascending: true })
          .order("id", { ascending: true })
      );

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
  return getCachedQuery(
    `players:ids:${uniqueIds.join(",")}`,
    async () => {
      const { data, error } = await selectAllRowsForIds(uniqueIds, (chunk) =>
        supabase.from("player").select(PLAYER_SELECT).in("id", chunk).order("id", { ascending: true })
      );
      if (error) {
        throw new Error(error.message || "Failed to load players");
      }
      const lookup = new Map(((data ?? []) as PlayerDirectoryRow[]).map((row) => [row.id, row]));
      return uniqueIds.map((id) => lookup.get(id)).filter((row): row is PlayerDirectoryRow => Boolean(row));
    },
    { ttlMs: PLAYER_IDS_CACHE_TTL_MS },
  );
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
    description: payload.description?.trim() || null,
  } as Record<string, unknown>;

  // The stored date is never read back, so an edit form cannot know it. Only
  // write the field when a date was actually entered; sending null here would
  // wipe the date on file every time a player is edited.
  if (payload.birthday) {
    base.birthday = payload.birthday;
  }

  if (!base.name) {
    throw new Error("Player name is required.");
  }

  if (payload.id) {
    // RLS refuses an UPDATE by matching zero rows, not with an error, so read
    // the row back: without this a refused edit reported "updated".
    const { data, error } = await supabase
      .from("player")
      .update(base)
      .eq("id", payload.id)
      .select("id");
    if (error) {
      throw new Error(normalizePlayerWriteError(error, "Unable to update player"));
    }
    if (!data || data.length === 0) {
      throw new Error(
        "This player was not updated: you can only edit players on your team's roster or players not on any team yet. Add the player to your roster first, then edit them."
      );
    }
    invalidateCachedQuery("players:directory");
    invalidateCachedQueries("players:ids");
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
  invalidateCachedQueries("players:ids");

  return data?.id as string;
}

/**
 * Ids of the players whose stored date of birth equals `birthday`
 * (YYYY-MM-DD). The date itself never leaves the database; this answers "is
 * this the right player?" for captains, and is refused for anyone without
 * roster rights.
 */
export async function getPlayerIdsWithBirthday(birthday: string): Promise<Set<string>> {
  if (!birthday) return new Set();
  const { data, error } = await supabase.rpc("players_with_birthday", { p_birthday: birthday });
  if (error) {
    throw new Error(error.message || "Unable to check the date of birth.");
  }
  return new Set(((data ?? []) as Array<{ player_id: string }>).map((row) => row.player_id));
}

/**
 * For up to 20 players, a group number per stored date of birth: two players
 * with the same number share a birthday. Null means no date on file. Used by
 * the merge tool to compare variants without showing the dates.
 */
export async function getPlayerBirthdayGroups(ids: string[]): Promise<Map<string, number | null>> {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!uniqueIds.length) return new Map();
  const { data, error } = await supabase.rpc("player_birthday_groups", { p_player_ids: uniqueIds });
  if (error) {
    throw new Error(error.message || "Unable to compare dates of birth.");
  }
  return new Map(
    ((data ?? []) as Array<{ player_id: string; birthday_group: number | null }>).map((row) => [
      row.player_id,
      row.birthday_group,
    ]),
  );
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

  // Paged: a big event (40 teams x 25 players) reaches Supabase's 1000-row cap.
  const { data, error } = await selectAllRows(() =>
    supabase
      .from("team_roster")
      .select(
        `
          id,
          event_id,
          team_id,
          is_captain,
          is_spirit_captain,
          player:player(id, name, jersey_number, gender_code, has_birthday),
          team:teams(id, name, short_name)
        `
      )
      .eq("event_id", eventId)
      .order("team_id", { ascending: true })
      .order("id", { ascending: true })
      .order("jersey_number", { ascending: true, foreignTable: "player" })
      .order("name", { ascending: true, foreignTable: "player" })
  );

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
    throw new Error(normalizeRosterWriteError(error, "Unable to add player to roster"));
  }
}

export async function removePlayerFromRoster(rosterId: string) {
  // A refused DELETE matches zero rows without an error; read it back.
  const { data, error } = await supabase
    .from("team_roster")
    .delete()
    .eq("id", rosterId)
    .select("id");

  if (error) {
    throw new Error(normalizeRosterWriteError(error, "Unable to remove roster entry"));
  }
  if (!data || data.length === 0) {
    throw new Error(
      "The player was not removed: you do not have access to change this team's roster."
    );
  }
}

export async function updateRosterCaptainRole(
  rosterId: string,
  role: "captain" | "spirit" | null
) {
  const { data, error } = await supabase
    .from("team_roster")
    .update({
      is_captain: role === "captain",
      is_spirit_captain: role === "spirit",
    })
    .eq("id", rosterId)
    .select("id");

  if (error) {
    throw new Error(normalizeRosterWriteError(error, "Unable to update captain assignment"));
  }
  // A refused UPDATE matches zero rows without an error.
  if (!data || data.length === 0) {
    throw new Error(
      "The captain assignment was not saved: you do not have access to change this team's roster."
    );
  }
}
