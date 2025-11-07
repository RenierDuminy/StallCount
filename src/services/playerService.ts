import { supabase, type PlayerRow } from "./supabaseClient";

type TeamRosterRow = {
  id: string;
  jersey_number: number | null;
  event_id: string | null;
  team_id: string | null;
  players: {
    id: string;
    name: string;
    gender_code: "M" | "W" | null;
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
        jersey_number,
        event_id,
        team_id,
        players:players(id, name, gender_code),
        teams:teams(id, name, short_name)
      `
    )
    .order("team_id", { ascending: true })
    .order("jersey_number", { ascending: true });

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
    jersey_number: row.jersey_number ?? null,
  }));
}
