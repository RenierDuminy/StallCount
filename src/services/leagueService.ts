import { supabase } from "./supabaseClient";
import { getCachedQuery } from "../utils/queryCache";

const DIVISIONS_CACHE_TTL_MS = 30 * 60 * 1000;
const EVENTS_CACHE_TTL_MS = 5 * 60 * 1000;

export type DivisionRow = {
  id: string;
  name: string;
  level: string | null;
  created_at: string;
};

export type EventRow = {
  id: string;
  name: string;
  type: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  created_at: string;
  rules?: Record<string, unknown> | null;
};

export type EventPoolTeam = {
  seed: number | null;
  team: {
    id: string;
    name: string;
    short_name: string | null;
  };
};

export type EventPoolRow = {
  id: string;
  name: string;
  teams: EventPoolTeam[];
};

export type EventVenueRow = {
  id: string;
  name: string;
  location: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type EventDivisionRow = {
  id: string;
  name: string;
  level: string | null;
  pools: EventPoolRow[];
};

export type EventHierarchyRow = EventRow & {
  divisions: EventDivisionRow[];
  venues: EventVenueRow[];
};

export async function getDivisions(limit = 6): Promise<DivisionRow[]> {
  return getCachedQuery(
    `divisions:list:${limit}`,
    async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("id, name, level, created_at")
        .order("name", { ascending: true })
        .limit(limit);

      if (error) {
        throw new Error(error.message || "Failed to load divisions");
      }

      return (data ?? []) as DivisionRow[];
    },
    { ttlMs: DIVISIONS_CACHE_TTL_MS },
  );
}

export async function getRecentEvents(limit = 4): Promise<EventRow[]> {
  return getCachedQuery(
    `events:recent:${limit}`,
    async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, type, start_date, end_date, location, created_at, rules")
        .order("start_date", { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message || "Failed to load events");
      }

      return (data ?? []) as EventRow[];
    },
    { ttlMs: EVENTS_CACHE_TTL_MS },
  );
}

export async function getEventsList(limit = 12): Promise<EventRow[]> {
  return getCachedQuery(
    `events:list:${limit}`,
    async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, type, start_date, end_date, location, created_at, rules")
        .order("start_date", { ascending: true })
        .limit(limit);

      if (error) {
        throw new Error(error.message || "Failed to load events");
      }

      return (data ?? []) as EventRow[];
    },
    { ttlMs: EVENTS_CACHE_TTL_MS },
  );
}

export async function getEventsByIds(ids: string[]): Promise<EventRow[]> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => typeof id === "string" && id.trim().length > 0)));
  if (!uniqueIds.length) {
    return [];
  }
  const cacheKey = `events:ids:${[...uniqueIds].sort().join(",")}`;
  return getCachedQuery(
    cacheKey,
    async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, type, start_date, end_date, location, created_at, rules")
        .in("id", uniqueIds);

      if (error) {
        throw new Error(error.message || "Failed to load events");
      }

      return (data ?? []) as EventRow[];
    },
    { ttlMs: EVENTS_CACHE_TTL_MS },
  );
}

type RawPoolTeam = {
  seed: number | null;
  team: {
    id: string;
    name: string;
    short_name: string | null;
  } | null;
};

type RawPool = {
  id: string;
  name: string;
  teams?: RawPoolTeam[] | null;
};

type RawDivision = {
  id: string;
  name: string;
  level: string | null;
  pools?: RawPool[] | null;
};

type RawVenue = {
  venue_id: string | null;
  venue?: {
    id: string;
    name: string | null;
    location: string | null;
    notes: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
};

type RawEventHierarchy = EventRow & {
  divisions?: RawDivision[] | null;
  event_venues?: RawVenue[] | null;
};

const EVENT_HIERARCHY_SELECT = `
  id,
  name,
  type,
  start_date,
  end_date,
  location,
  created_at,
  rules,
  divisions:divisions (
    id,
    name,
    level,
    pools:pools (
      id,
      name,
      teams:pool_teams (
        seed,
        team:teams (
          id,
          name,
          short_name
        )
      )
    )
  ),
  event_venues:event_venues (
    venue_id,
    venue:venues (
      id,
      name,
      location,
      notes,
      latitude,
      longitude
    )
  )
`;

export async function getEventHierarchy(eventId: string): Promise<EventHierarchyRow | null> {
  if (!eventId) {
    return null;
  }

  const { data, error } = await supabase
    .from("events")
    .select(EVENT_HIERARCHY_SELECT)
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load event hierarchy");
  }

  if (!data) {
    return null;
  }

  const typedData = data as RawEventHierarchy;

  const divisions: EventDivisionRow[] = Array.isArray(typedData.divisions)
    ? typedData.divisions.map((division) => ({
        id: division.id,
        name: division.name,
        level: division.level ?? null,
        pools: Array.isArray(division.pools)
          ? division.pools.map((pool) => ({
              id: pool.id,
              name: pool.name,
              teams: Array.isArray(pool.teams)
                ? pool.teams
                    .map((entry): EventPoolTeam | null => {
                      if (!entry?.team?.id) {
                        return null;
                      }
                      const rawSeed = entry.seed;
                      const seedValue =
                        typeof rawSeed === "number" && !Number.isNaN(rawSeed) ? rawSeed : null;
                      return {
                        seed: seedValue,
                        team: {
                          id: entry.team.id,
                          name: entry.team.name,
                          short_name: entry.team.short_name ?? null,
                        },
                      };
                    })
                    .filter((entry): entry is EventPoolTeam => Boolean(entry))
                : [],
            }))
          : [],
      }))
    : [];

  const venues: EventVenueRow[] = Array.isArray(typedData.event_venues)
    ? typedData.event_venues
        .map((entry) => {
          if (!entry?.venue?.id) {
            return null;
          }
          return {
            id: entry.venue.id,
            name: entry.venue.name ?? "Venue",
            location: entry.venue.location ?? null,
            notes: entry.venue.notes ?? null,
            latitude:
              typeof entry.venue.latitude === "number"
                ? entry.venue.latitude
                : null,
            longitude:
              typeof entry.venue.longitude === "number"
                ? entry.venue.longitude
                : null,
          };
        })
        .filter((entry): entry is EventVenueRow => Boolean(entry))
    : [];

  return {
    id: typedData.id,
    name: typedData.name,
    type: typedData.type,
    start_date: typedData.start_date ?? null,
    end_date: typedData.end_date ?? null,
    location: typedData.location ?? null,
    created_at: typedData.created_at,
    rules: typedData.rules ?? null,
    divisions,
    venues,
  };
}
