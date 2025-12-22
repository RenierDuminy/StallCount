import { supabase } from "./supabaseClient";

const normalizeText = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const normalizeDate = (value) => {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return null;
  }
  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return trimmed;
};

const normalizeTimestamp = (value) => {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

const toNullableNumber = (value) => {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

const EVENT_TYPES = new Set(["league", "tournament", "season"]);
const MATCH_STATUS_CODES = new Set([
  "scheduled",
  "ready",
  "pending",
  "live",
  "halftime",
  "finished",
  "completed",
  "canceled",
]);

const normalizeEventType = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (EVENT_TYPES.has(normalized)) {
    return normalized;
  }
  return "tournament";
};

const normalizeMatchStatus = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (MATCH_STATUS_CODES.has(normalized)) {
    return normalized;
  }
  return "scheduled";
};

const isRlsViolation = (error) => {
  const message = error?.message || error?.toString() || "";
  return /row-level security/i.test(message);
};

const parseRulesJson = (rulesValue) => {
  if (!rulesValue) {
    return null;
  }
  if (typeof rulesValue === "object") {
    return rulesValue;
  }
  if (typeof rulesValue === "string") {
    try {
      const parsed = JSON.parse(rulesValue);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  return null;
};

const formatTeamDisplayLabel = (team) => {
  if (!team) {
    return "";
  }
  const name = normalizeText(team.name);
  const shortName = normalizeText(team.short_name);
  if (name && shortName) {
    return `${name} (${shortName})`;
  }
  return name || shortName || "";
};

const cleanDivisionsInput = (divisions) =>
  Array.isArray(divisions)
    ? divisions
        .filter((entry) => normalizeText(entry?.name))
        .map((division) => ({
          ...division,
          divisionTeams: Array.isArray(division?.divisionTeams)
            ? division.divisionTeams
            : [],
          pools: Array.isArray(division?.pools) ? division.pools : [],
        }))
    : [];

const cleanEventVenuesInput = (eventVenues) =>
  Array.isArray(eventVenues)
    ? eventVenues
        .map((venue) => {
          const name = normalizeText(venue?.name);
          if (!name) {
            return null;
          }
          const location = normalizeText(venue?.location);
          const notes = normalizeText(venue?.notes);
          const venueId = normalizeText(venue?.venueId);
          return {
            id: venue?.id || venueId || null,
            venueId: venueId || null,
            name,
            location: location || null,
            notes: notes || null,
            latitude: toNullableNumber(venue?.latitude),
            longitude: toNullableNumber(venue?.longitude),
          };
        })
        .filter(Boolean)
    : [];

const persistDivisions = async (eventId, cleanedDivisions) => {
  const divisionPayload = cleanedDivisions.map((division) => ({
    event_id: eventId,
    name: normalizeText(division.name),
    level: normalizeText(division.level) || null,
  }));

  const divisionIdLookup = new Map();

  if (divisionPayload.length) {
    const { data: insertedDivisions, error: divisionsError } = await supabase
      .from("divisions")
      .insert(divisionPayload)
      .select("id");

    if (divisionsError) {
      throw new Error(divisionsError.message || "Failed to create divisions.");
    }

    insertedDivisions.forEach((row, index) => {
      const original = cleanedDivisions[index];
      if (row?.id && original?.id) {
        divisionIdLookup.set(original.id, row.id);
      }
    });
  }

  return { divisionPayload, divisionIdLookup };
};

const persistPools = async (cleanedDivisions, divisionIdLookup) => {
  const poolRecords = [];
  const poolSourceDivisions = [];
  cleanedDivisions.forEach((division) => {
    const dbDivisionId = divisionIdLookup.get(division.id);
    if (!dbDivisionId) {
      return;
    }
    (division.pools || [])
      .filter((pool) => normalizeText(pool?.name))
      .forEach((pool) => {
        poolRecords.push({
          division_id: dbDivisionId,
          name: normalizeText(pool.name),
        });
        poolSourceDivisions.push({
          clientDivisionId: division.id,
          clientPoolId: pool.id,
        });
      });
  });

  const poolIdLookup = new Map();

  if (poolRecords.length) {
    const { data: insertedPools, error: poolsError } = await supabase
      .from("pools")
      .insert(poolRecords)
      .select("id");

    if (poolsError) {
      throw new Error(poolsError.message || "Failed to create pools.");
    }

    insertedPools.forEach((row, index) => {
      const mapping = poolSourceDivisions[index];
      if (row?.id && mapping?.clientPoolId) {
        poolIdLookup.set(mapping.clientPoolId, row.id);
      }
    });
  }

  return { poolRecords, poolIdLookup };
};

const persistDivisionTeams = async (cleanedDivisions, divisionIdLookup) => {
  const records = [];
  const dedupe = new Set();
  cleanedDivisions.forEach((division) => {
    const divisionId = divisionIdLookup.get(division.id);
    if (!divisionId) {
      return;
    }
    (division.divisionTeams || []).forEach((team) => {
      if (!team?.teamId) {
        return;
      }
      const key = `${divisionId}:${team.teamId}`;
      if (dedupe.has(key)) {
        return;
      }
      dedupe.add(key);
      records.push({
        division_id: divisionId,
        team_id: team.teamId,
      });
    });
  });

  if (records.length) {
    const { error } = await supabase.from("division_teams").insert(records);
    if (error) {
      throw new Error(error.message || "Failed to assign teams to divisions.");
    }
  }

  return records.length;
};

const persistPoolTeams = async (cleanedDivisions, poolIdLookup) => {
  const poolTeamPayload = [];
  const poolTeamKeys = new Set();
  cleanedDivisions.forEach((division) => {
    (division.pools || []).forEach((pool) => {
      const poolId = poolIdLookup.get(pool.id);
      if (!poolId) {
        return;
      }
      (pool.teams || []).forEach((team) => {
        if (!team?.teamId) {
          return;
        }
        const dedupeKey = `${poolId}:${team.teamId}`;
        if (poolTeamKeys.has(dedupeKey)) {
          return;
        }
        poolTeamKeys.add(dedupeKey);
        poolTeamPayload.push({
          pool_id: poolId,
          team_id: team.teamId,
          seed: toNullableNumber(team.seed),
        });
      });
    });
  });

  if (poolTeamPayload.length) {
    const { error: poolTeamError } = await supabase
      .from("pool_teams")
      .insert(poolTeamPayload);
    if (poolTeamError) {
      throw new Error(poolTeamError.message || "Failed to add teams to pools.");
    }
  }

  return poolTeamPayload.length;
};

const persistMatches = async (
  cleanedDivisions,
  divisionIdLookup,
  poolIdLookup,
  eventId,
  venueIdLookup = new Map(),
) => {
  const matchPayload = [];
  const matchKeys = new Set();
  cleanedDivisions.forEach((division) => {
    const divisionId = divisionIdLookup.get(division.id);
    if (!divisionId) {
      return;
    }
    (division.pools || []).forEach((pool) => {
      const poolId = poolIdLookup.get(pool.id);
      if (!poolId) {
        return;
      }
      (pool.matches || []).forEach((match) => {
        if (!match?.teamAId || !match?.teamBId) {
          return;
        }
        if (match.teamAId === match.teamBId) {
          return;
        }
        const startTime = normalizeTimestamp(match.start);
        const dedupeKey = `${poolId}:${match.teamAId}:${match.teamBId}:${startTime || "nostart"}`;
        if (matchKeys.has(dedupeKey)) {
          return;
        }
        matchKeys.add(dedupeKey);
        const clientVenueRef = match.venueRefId || match.venueId || null;
        const mappedVenueId =
          (clientVenueRef &&
            (venueIdLookup.get(clientVenueRef) || clientVenueRef)) ||
          null;
        matchPayload.push({
          event_id: eventId,
          division_id: divisionId,
          pool_id: poolId,
          team_a: match.teamAId,
          team_b: match.teamBId,
          status: normalizeMatchStatus(match.status),
          start_time: startTime,
          venue_id: mappedVenueId,
        });
      });
    });
  });

  if (matchPayload.length) {
    const { error: matchesError } = await supabase
      .from("matches")
      .insert(matchPayload);
    if (matchesError) {
      throw new Error(matchesError.message || "Failed to create matches.");
    }
  }

  return matchPayload.length;
};

const persistEventVenues = async (eventId, cleanedEventVenues) => {
  if (!cleanedEventVenues.length) {
    return { count: 0, venueIdLookup: new Map() };
  }

  const venueIdLookup = new Map();
  const upsertPayload = [];
  const insertPayload = [];
  const insertClientRefs = [];

  cleanedEventVenues.forEach((venue) => {
    const baseRecord = {
      name: venue.name,
      location: venue.location,
      notes: venue.notes,
      latitude: venue.latitude,
      longitude: venue.longitude,
    };
    const clientId = venue.id || venue.venueId || null;
    if (venue.venueId) {
      upsertPayload.push({ id: venue.venueId, ...baseRecord });
      if (clientId) {
        venueIdLookup.set(clientId, venue.venueId);
      }
      venueIdLookup.set(venue.venueId, venue.venueId);
    } else {
      insertPayload.push(baseRecord);
      insertClientRefs.push(clientId);
    }
  });

  if (upsertPayload.length) {
    const { error: venueUpsertError } = await supabase
      .from("venues")
      .upsert(upsertPayload, { onConflict: "id" });

    if (venueUpsertError) {
      if (isRlsViolation(venueUpsertError)) {
        throw new Error(
          "Your Supabase policies currently block inserting venues. Assign an existing venue or update the RLS policy to allow inserts for admin accounts.",
        );
      }
      throw new Error(venueUpsertError.message || "Failed to save venues.");
    }
  }

  const insertedVenueLookup = new Map();

  if (insertPayload.length) {
    const { data: insertedVenues, error: venueInsertError } = await supabase
      .from("venues")
      .insert(insertPayload)
      .select("id");

    if (venueInsertError) {
      if (isRlsViolation(venueInsertError)) {
        throw new Error(
          "Your Supabase policies currently block inserting venues. Assign an existing venue or update the RLS policy to allow inserts for admin accounts.",
        );
      }
      throw new Error(venueInsertError.message || "Failed to create venues.");
    }

    (insertedVenues ?? []).forEach((row, index) => {
      const clientId = insertClientRefs[index];
      if (row?.id && clientId) {
        insertedVenueLookup.set(clientId, row.id);
        venueIdLookup.set(clientId, row.id);
        venueIdLookup.set(row.id, row.id);
      }
    });
  }

  const linkPayload = [];
  const linkKeys = new Set();

  cleanedEventVenues.forEach((venue) => {
    const clientId = venue.id || venue.venueId || null;
    const venueId =
      venue.venueId ||
      insertedVenueLookup.get(clientId) ||
      venueIdLookup.get(clientId);
    if (!venueId) {
      return;
    }
    const dedupeKey = `${eventId}:${venueId}`;
    if (linkKeys.has(dedupeKey)) {
      return;
    }
    linkKeys.add(dedupeKey);
    linkPayload.push({
      event_id: eventId,
      venue_id: venueId,
    });
  });

  if (linkPayload.length) {
    const { error: eventVenueError } = await supabase
      .from("event_venues")
      .insert(linkPayload);

    if (eventVenueError) {
      throw new Error(
        eventVenueError.message || "Failed to link venues to event.",
      );
    }
  }

  return { count: linkPayload.length, venueIdLookup };
};

const deleteExistingHierarchy = async (eventId) => {
  const { error: eventVenueDeleteError } = await supabase
    .from("event_venues")
    .delete()
    .eq("event_id", eventId);

  if (eventVenueDeleteError) {
    throw new Error(
      eventVenueDeleteError.message || "Failed to remove event venues.",
    );
  }

  const { data: existingDivisions, error: divisionQueryError } = await supabase
    .from("divisions")
    .select("id")
    .eq("event_id", eventId);

  if (divisionQueryError) {
    throw new Error(divisionQueryError.message || "Failed to load divisions.");
  }

  const divisionIds = (existingDivisions ?? []).map((entry) => entry.id);

  if (divisionIds.length) {
    const { error: divisionTeamsDeleteError } = await supabase
      .from("division_teams")
      .delete()
      .in("division_id", divisionIds);

    if (divisionTeamsDeleteError) {
      throw new Error(
        divisionTeamsDeleteError.message ||
          "Failed to remove division teams.",
      );
    }
  }

  const { data: existingPools, error: poolsQueryError } = divisionIds.length
    ? await supabase
        .from("pools")
        .select("id")
        .in("division_id", divisionIds)
    : { data: [], error: null };

  if (poolsQueryError) {
    throw new Error(poolsQueryError.message || "Failed to load pools.");
  }

  const poolIds = (existingPools ?? []).map((entry) => entry.id);

  const { error: matchDeleteError } = await supabase
    .from("matches")
    .delete()
    .eq("event_id", eventId);

  if (matchDeleteError) {
    throw new Error(matchDeleteError.message || "Failed to remove matches.");
  }

  if (poolIds.length) {
    const { error: poolTeamDeleteError } = await supabase
      .from("pool_teams")
      .delete()
      .in("pool_id", poolIds);

    if (poolTeamDeleteError) {
      throw new Error(
        poolTeamDeleteError.message || "Failed to remove pool teams.",
      );
    }

    const { error: poolsDeleteError } = await supabase
      .from("pools")
      .delete()
      .in("id", poolIds);

    if (poolsDeleteError) {
      throw new Error(poolsDeleteError.message || "Failed to remove pools.");
    }
  }

  if (divisionIds.length) {
    const { error: divisionsDeleteError } = await supabase
      .from("divisions")
      .delete()
      .in("id", divisionIds);

    if (divisionsDeleteError) {
      throw new Error(
        divisionsDeleteError.message || "Failed to remove divisions.",
      );
    }
  }
};

export async function createEventHierarchy(payload) {
  const { event, divisions, eventVenues } = payload || {};
  const name = normalizeText(event?.name);
  if (!name) {
    throw new Error("Event name is required.");
  }

  const parsedRules = parseRulesJson(event?.rules);
  if (!parsedRules) {
    throw new Error(
      "Invalid rules JSON. Please provide a valid rules configuration.",
    );
  }

  const eventInsert = {
    name,
    type: normalizeEventType(event?.type),
    start_date: normalizeDate(event?.start_date),
    end_date: normalizeDate(event?.end_date),
    location: normalizeText(event?.location) || null,
    rules: parsedRules,
  };

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .insert(eventInsert)
    .select("id")
    .maybeSingle();

  if (eventError) {
    throw new Error(eventError.message || "Failed to create event.");
  }

  const eventId = eventRow?.id;
  if (!eventId) {
    throw new Error("Event creation failed: missing identifier.");
  }

  const cleanedDivisions = cleanDivisionsInput(divisions);
  const cleanedEventVenues = cleanEventVenuesInput(eventVenues);
  const { divisionPayload, divisionIdLookup } = await persistDivisions(
    eventId,
    cleanedDivisions,
  );
  const divisionTeamCount = await persistDivisionTeams(
    cleanedDivisions,
    divisionIdLookup,
  );
  const { poolRecords, poolIdLookup } = await persistPools(
    cleanedDivisions,
    divisionIdLookup,
  );
  const poolTeamCount = await persistPoolTeams(cleanedDivisions, poolIdLookup);
  const { count: eventVenueCount, venueIdLookup } = await persistEventVenues(
    eventId,
    cleanedEventVenues,
  );
  const matchCount = await persistMatches(
    cleanedDivisions,
    divisionIdLookup,
    poolIdLookup,
    eventId,
    venueIdLookup,
  );

  return {
    eventId,
    divisionCount: divisionPayload.length,
    poolCount: poolRecords.length,
    divisionTeamCount,
    poolTeamCount,
    matchCount,
    eventVenueCount,
  };
}

export async function replaceEventHierarchy(payload) {
  const { eventId, event, divisions, eventVenues } = payload || {};
  const normalizedEventId = normalizeText(eventId);
  if (!normalizedEventId) {
    throw new Error("Event identifier is required.");
  }

  const name = normalizeText(event?.name);
  if (!name) {
    throw new Error("Event name is required.");
  }

  const parsedRules = parseRulesJson(event?.rules);
  if (!parsedRules) {
    throw new Error(
      "Invalid rules JSON. Please provide a valid rules configuration.",
    );
  }

  const updatePayload = {
    name,
    type: normalizeEventType(event?.type),
    start_date: normalizeDate(event?.start_date),
    end_date: normalizeDate(event?.end_date),
    location: normalizeText(event?.location) || null,
    rules: parsedRules,
  };

  const { error: updateError } = await supabase
    .from("events")
    .update(updatePayload)
    .eq("id", normalizedEventId);

  if (updateError) {
    throw new Error(updateError.message || "Failed to update event.");
  }

  await deleteExistingHierarchy(normalizedEventId);

  const cleanedDivisions = cleanDivisionsInput(divisions);
  const cleanedEventVenues = cleanEventVenuesInput(eventVenues);
  const { divisionPayload, divisionIdLookup } = await persistDivisions(
    normalizedEventId,
    cleanedDivisions,
  );
  const divisionTeamCount = await persistDivisionTeams(
    cleanedDivisions,
    divisionIdLookup,
  );
  const { poolRecords, poolIdLookup } = await persistPools(
    cleanedDivisions,
    divisionIdLookup,
  );
  const poolTeamCount = await persistPoolTeams(cleanedDivisions, poolIdLookup);
  const { count: eventVenueCount, venueIdLookup } = await persistEventVenues(
    normalizedEventId,
    cleanedEventVenues,
  );
  const matchCount = await persistMatches(
    cleanedDivisions,
    divisionIdLookup,
    poolIdLookup,
    normalizedEventId,
    venueIdLookup,
  );

  return {
    eventId: normalizedEventId,
    divisionCount: divisionPayload.length,
    poolCount: poolRecords.length,
    divisionTeamCount,
    poolTeamCount,
    matchCount,
    eventVenueCount,
  };
}

export async function listEventsForWizard(limit = 50) {
  const effectiveLimit =
    typeof limit === "number" && Number.isFinite(limit) ? limit : 50;

  const { data, error } = await supabase
    .from("events")
    .select("id, name, start_date, end_date, location, created_at")
    .order("created_at", { ascending: false })
    .limit(effectiveLimit);

  if (error) {
    throw new Error(error.message || "Failed to load events.");
  }

  return data ?? [];
}

export async function listAvailableVenues(limit = 200) {
  const effectiveLimit =
    typeof limit === "number" && Number.isFinite(limit) ? limit : 200;

  const { data, error } = await supabase
    .from("venues")
    .select("id, name, location, notes, latitude, longitude")
    .order("name", { ascending: true })
    .limit(effectiveLimit);

  if (error) {
    throw new Error(error.message || "Failed to load venues.");
  }

  return data ?? [];
}

export async function getEventHierarchy(eventId) {
  const normalizedEventId = normalizeText(eventId);
  if (!normalizedEventId) {
    throw new Error("Event identifier is required.");
  }

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("id, name, type, start_date, end_date, location, rules")
    .eq("id", normalizedEventId)
    .maybeSingle();

  if (eventError) {
    throw new Error(eventError.message || "Failed to load event.");
  }

  if (!eventRow) {
    throw new Error("Event not found.");
  }

  const { data: eventVenueRows, error: eventVenueError } = await supabase
    .from("event_venues")
    .select(
      `
        venue_id,
        venue:venues(id, name, location, notes, latitude, longitude)
      `,
    )
    .eq("event_id", normalizedEventId);

  if (eventVenueError) {
    throw new Error(eventVenueError.message || "Failed to load venues.");
  }

  const { data: divisionRows, error: divisionError } = await supabase
    .from("divisions")
    .select("id, name, level")
    .eq("event_id", normalizedEventId);

  if (divisionError) {
    throw new Error(divisionError.message || "Failed to load divisions.");
  }

  const divisionIds = (divisionRows ?? []).map((row) => row.id);

  const { data: poolRows, error: poolError } = divisionIds.length
    ? await supabase
        .from("pools")
        .select("id, name, division_id")
        .in("division_id", divisionIds)
    : { data: [], error: null };

  if (poolError) {
    throw new Error(poolError.message || "Failed to load pools.");
  }

  const poolIds = (poolRows ?? []).map((row) => row.id);

  const { data: poolTeamRows, error: poolTeamError } = poolIds.length
    ? await supabase
        .from("pool_teams")
        .select(
          `
            pool_id,
            team_id,
            seed,
            team:teams(id, name, short_name)
          `,
        )
        .in("pool_id", poolIds)
    : { data: [], error: null };

  if (poolTeamError) {
    throw new Error(poolTeamError.message || "Failed to load pool teams.");
  }

  const { data: divisionTeamRows, error: divisionTeamError } = divisionIds.length
    ? await supabase
        .from("division_teams")
        .select(
          `
            division_id,
            team_id,
            team:teams(id, name, short_name)
          `,
        )
        .in("division_id", divisionIds)
    : { data: [], error: null };

  if (divisionTeamError) {
    throw new Error(
      divisionTeamError.message || "Failed to load division teams.",
    );
  }

  const { data: matchesRows, error: matchesError } = await supabase
    .from("matches")
    .select(
      `
        id,
        division_id,
        pool_id,
        team_a,
        team_b,
        venue_id,
        status,
        start_time,
        team_a_meta:teams!matches_team_a_fkey (id, name, short_name),
        team_b_meta:teams!matches_team_b_fkey (id, name, short_name),
        venue:venues!matches_venue_id_fkey (id, name, location, notes, latitude, longitude)
      `,
    )
    .eq("event_id", normalizedEventId);

  if (matchesError) {
    throw new Error(matchesError.message || "Failed to load matches.");
  }

  const poolsByDivision = new Map();
  (poolRows ?? []).forEach((pool) => {
    const existing = poolsByDivision.get(pool.division_id) || [];
    existing.push({ id: pool.id, name: pool.name });
    poolsByDivision.set(pool.division_id, existing);
  });

  const teamsByPool = new Map();
  (poolTeamRows ?? []).forEach((row) => {
    const bucket = teamsByPool.get(row.pool_id) || [];
    bucket.push({
      id: `${row.pool_id || "pool"}:${row.team_id || "team"}`,
      teamId: row.team_id,
      name: row.team?.name || "",
      shortName: row.team?.short_name || null,
      displayLabel: formatTeamDisplayLabel(row.team),
      seed: row.seed ?? "",
    });
    teamsByPool.set(row.pool_id, bucket);
  });

  const matchesByPool = new Map();
  (matchesRows ?? []).forEach((row) => {
    const bucket = matchesByPool.get(row.pool_id) || [];
    bucket.push({
      id: row.id,
      teamA: row.team_a_meta?.name || "",
      teamAId: row.team_a_meta?.id || row.team_a || "",
      teamB: row.team_b_meta?.name || "",
      teamBId: row.team_b_meta?.id || row.team_b || "",
      status: normalizeMatchStatus(row.status),
      start: row.start_time,
      teamALabel: formatTeamDisplayLabel(row.team_a_meta),
      teamBLabel: formatTeamDisplayLabel(row.team_b_meta),
      venueId: row.venue_id || null,
      venueName: row.venue?.name || "",
      venueLocation: row.venue?.location || "",
      venueRefId: row.venue_id || null,
    });
    matchesByPool.set(row.pool_id, bucket);
  });

  const divisionTeamsByDivision = new Map();
  (divisionTeamRows ?? []).forEach((row) => {
    const bucket = divisionTeamsByDivision.get(row.division_id) || [];
    bucket.push({
      id: `${row.division_id}:${row.team_id}`,
      teamId: row.team_id,
      name: row.team?.name || "",
      shortName: row.team?.short_name || null,
      displayLabel: formatTeamDisplayLabel(row.team),
    });
    divisionTeamsByDivision.set(row.division_id, bucket);
  });

  const divisions = (divisionRows ?? []).map((division) => {
    const pools = poolsByDivision.get(division.id) || [];
    return {
      id: division.id,
      name: division.name,
      level: division.level,
      divisionTeams: divisionTeamsByDivision.get(division.id) || [],
      pools: pools.map((pool) => ({
        ...pool,
        teams: teamsByPool.get(pool.id) || [],
        matches: matchesByPool.get(pool.id) || [],
      })),
    };
  });

  const eventVenues = (eventVenueRows ?? []).map((row) => ({
    id: row.venue_id,
    venueId: row.venue_id,
    name: row.venue?.name || "",
    location: row.venue?.location || "",
    notes: row.venue?.notes || "",
    latitude: row.venue?.latitude ?? null,
    longitude: row.venue?.longitude ?? null,
  }));

  return {
    event: eventRow,
    divisions,
    eventVenues,
  };
}
