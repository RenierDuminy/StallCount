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

export async function getAllPlayers(): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from("team_roster")
    .select(
      `
        id,
        event_id,
        team_id,
        players:players(id, name, gender_code, jersey_number),
        teams:teams(id, name, short_name)
      `
    )
    .order("team_id", { ascending: true })
    .order("jersey_number", { ascending: true, foreignTable: "players" });

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
        players:players(id, name, gender_code, jersey_number)
      `
    )
    .eq("team_id", teamId)
    .order("jersey_number", { ascending: true, foreignTable: "players" });

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
