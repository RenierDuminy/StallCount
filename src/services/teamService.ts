import { supabase } from "./supabaseClient";
import { getCachedQuery } from "../utils/queryCache";

const TEAMS_CACHE_TTL_MS = 10 * 60 * 1000;

export type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  created_at: string;
};

export async function getAllTeams(limit?: number): Promise<TeamRow[]> {
  const cacheLimit = typeof limit === "number" ? limit : "all";
  return getCachedQuery(
    `teams:list:${cacheLimit}`,
    async () => {
      let query = supabase
        .from("teams")
        .select("id, name, short_name, created_at")
        .order("name", { ascending: true });

      if (typeof limit === "number") {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message || "Failed to load teams");
      }

      return (data ?? []) as TeamRow[];
    },
    { ttlMs: TEAMS_CACHE_TTL_MS },
  );
}

export async function getTeamsByIds(ids: string[]): Promise<TeamRow[]> {
  const uniqueIds = Array.from(
    new Set(
      (ids || [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((value) => value.length > 0),
    ),
  );

  if (uniqueIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("teams")
    .select("id, name, short_name, created_at")
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message || "Failed to load teams by id");
  }

  const lookup = new Map(((data ?? []) as TeamRow[]).map((row) => [row.id, row]));
  return uniqueIds.map((id) => lookup.get(id)).filter((row): row is TeamRow => Boolean(row));
}

export type TeamDivisionInfo = {
  id: string;
  name: string;
  level: string | null;
  event: {
    id: string;
    name: string;
    location: string | null;
  } | null;
};

export type TeamDetailsRow = TeamRow & {
  division: TeamDivisionInfo | null;
};

export async function getTeamDetails(teamId: string): Promise<TeamDetailsRow | null> {
  if (!teamId) {
    return null;
  }

  const { data, error } = await supabase
    .from("teams")
    .select(
      `
        id,
        name,
        short_name,
        created_at,
        division_links:division_teams(
          division:divisions(
            id,
            name,
            level,
            event:events(id, name, location)
          )
        )
      `
    )
    .eq("id", teamId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load team details");
  }

  if (!data) {
    return null;
  }

  const firstDivision = Array.isArray((data as any).division_links)
    ? (data as any).division_links[0]
    : null;

  const division =
    firstDivision?.division && firstDivision.division.id
      ? {
          id: firstDivision.division.id as string,
          name: firstDivision.division.name as string,
          level: (firstDivision.division.level as string | null) ?? null,
          event: firstDivision.division.event
            ? {
                id: firstDivision.division.event.id as string,
                name: firstDivision.division.event.name as string,
                location: (firstDivision.division.event.location as string | null) ?? null,
              }
            : null,
        }
      : null;

  return {
    id: data.id,
    name: data.name,
    short_name: data.short_name ?? null,
    created_at: data.created_at,
    division,
  };
}

type LinkedTeam = {
  id: string;
  name: string;
  short_name: string | null;
} | null;

export type TeamMatchRow = {
  id: string;
  start_time: string | null;
  status: string;
  score_a: number;
  score_b: number;
  media_link: Record<string, unknown> | null;
  media_provider: string | null;
  media_url: string | null;
  media_status: string | null;
  has_media: boolean | null;
  venue_id: string | null;
  event: {
    id: string;
    name: string;
  } | null;
  division: {
    id: string;
    name: string;
  } | null;
  pool: {
    id: string;
    name: string;
  } | null;
  venue: {
    id: string;
    name: string | null;
  } | null;
  team_a: LinkedTeam;
  team_b: LinkedTeam;
};

export async function getTeamMatches(teamId: string): Promise<TeamMatchRow[]> {
  if (!teamId) {
    return [];
  }

  const { data, error } = await supabase
    .from("matches")
    .select(
      `
        id,
        start_time,
        status,
        score_a,
        score_b,
        media_link,
        media_provider,
        media_url,
        media_status,
        has_media,
        venue_id,
        event:events(id, name),
        division:divisions(id, name),
        pool:pools(id, name),
        venue:venues(id, name),
        team_a:teams!matches_team_a_fkey(id, name, short_name),
        team_b:teams!matches_team_b_fkey(id, name, short_name)
      `
    )
    .or(`team_a.eq.${teamId},team_b.eq.${teamId}`)
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load team matches");
  }

  return (data ?? []) as TeamMatchRow[];
}

export type PlayerStatRow = {
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  goals: number;
  assists: number;
  blocks: number;
  turnovers: number;
  games: number;
  matchIds: string[];
};

export type PlayerMatchStatRow = {
  match_id: string;
  player_id: string;
  team_id: string | null;
  goals: number | null;
  assists: number | null;
  blocks: number | null;
  turnovers: number | null;
  match: {
    id: string;
    start_time: string | null;
    status: string | null;
    event: { id: string; name: string | null } | null;
    team_a: { id: string; name: string | null; short_name: string | null } | null;
    team_b: { id: string; name: string | null; short_name: string | null } | null;
  } | null;
  player: { id: string; name: string | null; jersey_number: number | null } | null;
  team: { id: string; name: string | null; short_name: string | null } | null;
};

type PlayerStatQueryRow = {
  match_id: string;
  player_id: string;
  goals: number | null;
  assists: number | null;
  blocks: number | null;
  turnovers: number | null;
  player: {
    id: string;
    name: string;
    jersey_number: number | null;
  } | null;
};

export async function getTeamPlayerStats(teamId: string): Promise<PlayerStatRow[]> {
  if (!teamId) {
    return [];
  }

  const { data, error } = await supabase
    .from("player_match_stats")
    .select(
      `
        match_id,
        player_id,
        goals,
        assists,
        blocks,
        turnovers,
        player:player(id, name, jersey_number)
      `
    )
    .eq("team_id", teamId);

  if (error) {
    throw new Error(error.message || "Failed to load player stats");
  }

  const rows = (data ?? []) as PlayerStatQueryRow[];
  const statsMap = new Map<
    string,
    PlayerStatRow & {
      matchIds: Set<string>;
    }
  >();

  for (const row of rows) {
    const playerId = row.player_id;
    if (!playerId) continue;

    if (!statsMap.has(playerId)) {
      statsMap.set(playerId, {
        playerId,
        playerName: row.player?.name || "Player",
        jerseyNumber: row.player?.jersey_number ?? null,
        goals: 0,
        assists: 0,
        blocks: 0,
        turnovers: 0,
        games: 0,
        matchIds: new Set<string>(),
      });
    }

    const entry = statsMap.get(playerId);
    if (!entry) continue;

    entry.goals += row.goals ?? 0;
    entry.assists += row.assists ?? 0;
    entry.blocks += row.blocks ?? 0;
    entry.turnovers += row.turnovers ?? 0;
    entry.matchIds.add(row.match_id);
  }

  const results: PlayerStatRow[] = Array.from(statsMap.values()).map((entry) => ({
    playerId: entry.playerId,
    playerName: entry.playerName,
    jerseyNumber: entry.jerseyNumber,
    goals: entry.goals,
    assists: entry.assists,
    blocks: entry.blocks,
    turnovers: entry.turnovers,
    games: entry.matchIds.size,
    matchIds: Array.from(entry.matchIds),
  }));

  return results.sort((a, b) => {
    const aTotal = a.goals + a.assists;
    const bTotal = b.goals + b.assists;
    if (bTotal !== aTotal) return bTotal - aTotal;
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.playerName.localeCompare(b.playerName);
  });
}

export async function getAllPlayerMatchStats(): Promise<PlayerMatchStatRow[]> {
  const { data, error } = await supabase
    .from("player_match_stats")
    .select(
      `
        match_id,
        player_id,
        team_id,
        goals,
        assists,
        blocks,
        turnovers,
        match:matches(
          id,
          start_time,
          status,
          event:events(id, name),
          team_a:teams!matches_team_a_fkey(id, name, short_name),
          team_b:teams!matches_team_b_fkey(id, name, short_name)
        ),
        player:player(id, name, jersey_number),
        team:teams(id, name, short_name)
      `
    )
    .order("match_id", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load player match stats");
  }

  return (data ?? []) as PlayerMatchStatRow[];
}

export async function getPlayerMatchStats(playerId: string): Promise<PlayerMatchStatRow[]> {
  if (!playerId) return [];

  const { data, error } = await supabase
    .from("player_match_stats")
    .select(
      `
        match_id,
        player_id,
        team_id,
        goals,
        assists,
        blocks,
        turnovers,
        match:matches(
          id,
          start_time,
          status,
          event:events(id, name),
          team_a:teams!matches_team_a_fkey(id, name, short_name),
          team_b:teams!matches_team_b_fkey(id, name, short_name)
        ),
        player:player(id, name, jersey_number),
        team:teams(id, name, short_name)
      `
    )
    .eq("player_id", playerId)
    .order("match_id", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load player match stats");
  }

  return (data ?? []) as PlayerMatchStatRow[];
}

export type SpiritScoreRow = {
  id: string;
  match_id: string;
  rated_team_id: string;
  total: number | null;
  rules_knowledge: number | null;
  fouls_contact: number | null;
  positive_attitude: number | null;
  communication: number | null;
  self_control: number | null;
  match: {
    id: string;
    start_time: string | null;
    score_a: number | null;
    score_b: number | null;
    team_a: LinkedTeam;
    team_b: LinkedTeam;
  } | null;
};

export async function getSpiritScoresForMatches(matchIds: string[]): Promise<SpiritScoreRow[]> {
  if (!matchIds || matchIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("spirit_scores")
    .select(
      `
        id,
        match_id,
        rated_team_id,
        total,
        rules_knowledge,
        fouls_contact,
        positive_attitude,
        communication,
        self_control,
        match:matches(
          id,
          start_time,
          score_a,
          score_b,
          team_a:teams!matches_team_a_fkey(id, name, short_name),
          team_b:teams!matches_team_b_fkey(id, name, short_name)
        )
      `
    )
    .in("match_id", matchIds);

  if (error) {
    throw new Error(error.message || "Failed to load spirit scores");
  }

  return (data ?? []) as SpiritScoreRow[];
}
