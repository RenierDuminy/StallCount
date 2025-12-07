import { supabase } from "./supabaseClient";

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

export async function getDivisions(limit = 6): Promise<DivisionRow[]> {
  const { data, error } = await supabase
    .from("divisions")
    .select("id, name, level, created_at")
    .order("name", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Failed to load divisions");
  }

  return (data ?? []) as DivisionRow[];
}

export async function getRecentEvents(limit = 4): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, type, start_date, end_date, location, created_at, rules")
    .order("start_date", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Failed to load events");
  }

  return (data ?? []) as EventRow[];
}

export async function getEventsList(limit = 12): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, type, start_date, end_date, location, created_at, rules")
    .order("start_date", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Failed to load events");
  }

  return (data ?? []) as EventRow[];
}

export async function getEventsByIds(ids: string[]): Promise<EventRow[]> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => typeof id === "string" && id.trim().length > 0)));
  if (!uniqueIds.length) {
    return [];
  }
  const { data, error } = await supabase
    .from("events")
    .select("id, name, type, start_date, end_date, location, created_at, rules")
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message || "Failed to load events");
  }

  return (data ?? []) as EventRow[];
}
