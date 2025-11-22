import { supabase } from "./supabaseClient";

export type VenueRow = {
  id: string;
  name: string | null;
};

const venueCache = new Map<string, VenueRow>();

function cacheVenues(rows: VenueRow[]) {
  rows.forEach((row) => {
    if (row?.id) {
      venueCache.set(row.id, { id: row.id, name: row.name ?? null });
    }
  });
}

export async function getVenuesByIds(ids: Array<string | null | undefined>): Promise<VenueRow[]> {
  const requested = Array.from(new Set((ids || []).filter(Boolean) as string[]));
  const missing = requested.filter((id) => !venueCache.has(id));

  if (missing.length > 0) {
    const { data, error } = await supabase.from("venues").select("id, name").in("id", missing);
    if (error) {
      throw new Error(error.message || "Failed to load venues");
    }
    cacheVenues((data ?? []) as VenueRow[]);
  }

  return requested
    .map((id) => venueCache.get(id))
    .filter((row): row is VenueRow => Boolean(row));
}

export function getCachedVenueName(id: string | null | undefined): string | null {
  if (!id) return null;
  return venueCache.get(id)?.name ?? null;
}

export async function hydrateVenueLookup(
  ids: Array<string | null | undefined>,
): Promise<Record<string, string | null>> {
  await getVenuesByIds(ids);
  const lookup: Record<string, string | null> = {};
  venueCache.forEach((row, venueId) => {
    lookup[venueId] = row.name ?? null;
  });
  return lookup;
}
