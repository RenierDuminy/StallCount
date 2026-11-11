import { supabase } from "./supabaseClient";
import { ALL_STATUS_CODES, MATCH_STATUS } from "../constants/statusCodes";
import {
  getBracketsByEvent,
  createBracket,
  createBracketNode,
} from "./playoffStructureService";
import { instantiateTemplate } from "./bracketTemplateService";
import { getTemplateById } from "../data/bracketTemplates";
import { invalidateCachedQueries } from "../utils/queryCache";

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
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

const EVENT_TYPES = new Set(["league", "tournament", "season"]);
// Validation gate for writes, so it must mirror match_status(code) exactly.
// Previously accepted "ready"/"pending" (not valid codes — the insert would
// fail the FK) and rejected "postponed"/"forfeit", which are.
//
// normalizeMatchStatus lowercases its input before checking this set, so the
// set itself must be lowercased too — `forfeit_teamA`/`forfeit_teamB` are
// stored with a capital A/B, so building this straight from ALL_STATUS_CODES
// would silently reject a caller passing the correct DB casing (lowercased to
// "forfeit_teama", which never matches) and fall back to "scheduled". Same
// trap that "Initialized" used to spring before that row was lowercased.
//
// Maps lowercased -> canonical casing so normalizeMatchStatus can validate
// case-insensitively while still writing back the exact stored spelling
// (e.g. "forfeit_teamA", not "forfeit_teama" — the latter fails the FK).
const MATCH_STATUS_CODE_BY_LOWERCASE = new Map(
  ALL_STATUS_CODES.map((code) => [code.toLowerCase(), code]),
);

const normalizeEventType = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (EVENT_TYPES.has(normalized)) {
    return normalized;
  }
  return "tournament";
};

const normalizeMatchStatus = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  const canonical = MATCH_STATUS_CODE_BY_LOWERCASE.get(normalized);
  return canonical ?? "scheduled";
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) => typeof value === "string" && UUID_REGEX.test(value);

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

// Normalizes the wizard's richer per-match fields into their `matches` columns.
// A starting team that isn't one of the two competing teams is dropped.
const buildMatchExtras = (match) => {
  const scoreA = toNullableNumber(match?.scoreA);
  const scoreB = toNullableNumber(match?.scoreB);
  const abbaPattern = normalizeText(match?.abbaPattern) || null;
  const scorekeeper = normalizeText(match?.scorekeeperId) || null;
  const startingTeamId = normalizeText(match?.startingTeamId);
  const validStartingTeam =
    startingTeamId === match?.teamAId || startingTeamId === match?.teamBId
      ? startingTeamId
      : null;
  return {
    score_a: Number.isInteger(scoreA) && scoreA >= 0 ? scoreA : 0,
    score_b: Number.isInteger(scoreB) && scoreB >= 0 ? scoreB : 0,
    captains_confirmed: Boolean(match?.captainsConfirmed),
    scorekeeper,
    starting_team_id: validStartingTeam,
    abba_pattern: abbaPattern,
  };
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
          const city = normalizeText(venue?.city);
          const location = normalizeText(venue?.location);
          const notes = normalizeText(venue?.notes);
          const venueId = normalizeText(venue?.venueId);
          return {
            id: venue?.id || venueId || null,
            venueId: venueId || null,
            name,
            city: city || null,
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
          ...buildMatchExtras(match),
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
      city: venue.city,
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
      .upsert(linkPayload, { onConflict: "event_id,venue_id" });

    if (eventVenueError) {
      throw new Error(
        eventVenueError.message || "Failed to link venues to event.",
      );
    }
  }

  return { count: linkPayload.length, venueIdLookup };
};

const hasOwnKeys = (value) => Object.keys(value).length > 0;

const areJsonValuesEqual = (left, right) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const buildFlatRecordChanges = (nextRecord, previousRecord, keys) => {
  if (!previousRecord) {
    return { ...nextRecord };
  }
  return keys.reduce((changes, key) => {
    if (nextRecord[key] !== previousRecord[key]) {
      changes[key] = nextRecord[key];
    }
    return changes;
  }, {});
};

const normalizeSignaturePart = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  return String(value).trim().toLowerCase();
};

const buildVenueSignature = (venue) =>
  [
    venue?.name,
    venue?.city,
    venue?.location,
    venue?.notes,
    venue?.latitude,
    venue?.longitude,
  ]
    .map(normalizeSignaturePart)
    .join("|");

const buildDivisionSignature = (division) =>
  [division?.name, division?.level].map(normalizeSignaturePart).join("|");

const buildPoolSignature = (pool) =>
  [pool?.division_id, pool?.name].map(normalizeSignaturePart).join("|");

const buildMatchSignature = (match) =>
  [match?.pool_id, match?.team_a, match?.team_b, match?.start_time]
    .map(normalizeSignaturePart)
    .join("|");

const buildHierarchyIndex = (hierarchy) => {
  const hierarchyEventId = normalizeText(hierarchy?.event?.id);
  const index = {
    event: null,
    venueById: new Map(),
    venueIds: new Set(),
    venueIdBySignature: new Map(),
    divisionById: new Map(),
    divisionIds: new Set(),
    divisionIdBySignature: new Map(),
    poolById: new Map(),
    poolIds: new Set(),
    poolIdBySignature: new Map(),
    divisionTeamByKey: new Map(),
    divisionTeamKeys: new Set(),
    poolTeamByKey: new Map(),
    poolTeamKeys: new Set(),
    matchById: new Map(),
    matchIds: new Set(),
    matchIdBySignature: new Map(),
  };

  if (!hierarchy || typeof hierarchy !== "object") {
    return index;
  }

  if (hierarchy.event && typeof hierarchy.event === "object") {
    index.event = {
      name: normalizeText(hierarchy.event.name),
      type: normalizeEventType(hierarchy.event.type),
      start_date: normalizeDate(hierarchy.event.start_date),
      end_date: normalizeDate(hierarchy.event.end_date),
      location: normalizeText(hierarchy.event.location) || null,
      rules: parseRulesJson(hierarchy.event.rules),
    };
  }

  (hierarchy.eventVenues ?? []).forEach((venue) => {
    const venueId = normalizeText(venue?.venueId || venue?.id);
    if (!isUuid(venueId)) {
      return;
    }
    index.venueIds.add(venueId);
    const indexedVenue = {
      name: normalizeText(venue?.name),
      city: normalizeText(venue?.city) || null,
      location: normalizeText(venue?.location) || null,
      notes: normalizeText(venue?.notes) || null,
      latitude: toNullableNumber(venue?.latitude),
      longitude: toNullableNumber(venue?.longitude),
    };
    index.venueById.set(venueId, indexedVenue);
    index.venueIdBySignature.set(buildVenueSignature(indexedVenue), venueId);
  });

  (hierarchy.divisions ?? []).forEach((division) => {
    const divisionId = normalizeText(division?.id);
    if (isUuid(divisionId)) {
      const indexedDivision = {
        name: normalizeText(division?.name),
        level: normalizeText(division?.level) || null,
      };
      index.divisionIds.add(divisionId);
      index.divisionById.set(divisionId, indexedDivision);
      index.divisionIdBySignature.set(
        buildDivisionSignature(indexedDivision),
        divisionId,
      );
    }

    (division?.divisionTeams ?? []).forEach((team) => {
      if (!isUuid(divisionId) || !team?.teamId) {
        return;
      }
      const key = `${divisionId}:${team.teamId}`;
      index.divisionTeamKeys.add(key);
      index.divisionTeamByKey.set(key, {
        division_id: divisionId,
        team_id: team.teamId,
      });
    });

    (division?.pools ?? []).forEach((pool) => {
      const poolId = normalizeText(pool?.id);
      if (isUuid(poolId)) {
        const indexedPool = {
          division_id: isUuid(divisionId) ? divisionId : null,
          name: normalizeText(pool?.name),
        };
        index.poolIds.add(poolId);
        index.poolById.set(poolId, indexedPool);
        index.poolIdBySignature.set(buildPoolSignature(indexedPool), poolId);
      }

      (pool?.teams ?? []).forEach((team) => {
        if (!isUuid(poolId) || !team?.teamId) {
          return;
        }
        const key = `${poolId}:${team.teamId}`;
        index.poolTeamKeys.add(key);
        index.poolTeamByKey.set(key, {
          pool_id: poolId,
          team_id: team.teamId,
          seed: toNullableNumber(team.seed),
        });
      });

      (pool?.matches ?? []).forEach((match) => {
        const matchId = normalizeText(match?.id);
        if (!isUuid(matchId)) {
          return;
        }
        const venueId = normalizeText(match?.venueRefId || match?.venueId) || null;
        const indexedMatch = {
          event_id: hierarchyEventId || null,
          division_id: isUuid(divisionId) ? divisionId : null,
          pool_id: isUuid(poolId) ? poolId : null,
          team_a: match?.teamAId || "",
          team_b: match?.teamBId || "",
          status: normalizeMatchStatus(match?.status),
          start_time: normalizeTimestamp(match?.start),
          venue_id: venueId,
          ...buildMatchExtras(match),
        };
        index.matchIds.add(matchId);
        index.matchById.set(matchId, indexedMatch);
        index.matchIdBySignature.set(buildMatchSignature(indexedMatch), matchId);
      });
    });
  });

  return index;
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
    // New events always start life as "scheduled" — the column is `Status`
    // (capitalised) in the DB, an FK to match_status(code) shared with matches.
    Status: MATCH_STATUS.SCHEDULED,
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

// ---------------------------------------------------------------------------
// Saving an edited event (replaceEventHierarchy)
//
// The save runs in two stages so a mistake cannot leave an event half-written:
//
// 1. Plan (no network). Compare the wizard's state with the snapshot it was
//    loaded from and list every change: what is added, updated and removed.
//    `previewEventHierarchyUpdate` returns the same plan as plain sentences
//    for the confirmation dialog.
// 2. Check, then write. Before the first write:
//    - removals the user cannot make are refused up front, by name. Removing
//      anything inside an event (field links, teams from divisions/pools,
//      pools, divisions) needs `event_delete`, which no role holds, so for a
//      tournament director the database used to refuse them *silently* and
//      the save reported success (and a refused unlink + re-insert crashed on
//      event_venues_pkey);
//    - the database is re-read, and the save stops if anything it is about to
//      change or remove was changed by someone else since the wizard loaded;
//    - matches a bracket node links to are never deleted.
//    Every update and delete is then read back and must touch exactly the
//    rows it targeted, so a refusal can never pass as success. If a write
//    still fails (e.g. the network drops), the error says what was already
//    saved.
//
// New rows are referred to by placeholder refs until they exist, so the plan
// can be built before anything is inserted.
// ---------------------------------------------------------------------------

const MATCH_COMPARE_KEYS = [
  "event_id",
  "division_id",
  "pool_id",
  "team_a",
  "team_b",
  "status",
  "start_time",
  "venue_id",
  "score_a",
  "score_b",
  "captains_confirmed",
  "scorekeeper",
  "starting_team_id",
  "abba_pattern",
];
const VENUE_COMPARE_KEYS = ["name", "city", "location", "notes", "latitude", "longitude"];

const newRef = (kind, index) => ({ newRef: kind, index });
const isNewRef = (value) => Boolean(value && typeof value === "object" && value.newRef);
const refKey = (value) => (isNewRef(value) ? `new:${value.newRef}:${value.index}` : value ?? "");

const plural = (count, word, pluralWord = `${word}s`) => `${count} ${count === 1 ? word : pluralWord}`;

const collectTeamNames = (hierarchy) => {
  const names = new Map();
  (hierarchy?.divisions ?? []).forEach((division) => {
    (division?.divisionTeams ?? []).forEach((team) => {
      if (team?.teamId && team.name) names.set(team.teamId, team.name);
    });
    (division?.pools ?? []).forEach((pool) => {
      (pool?.teams ?? []).forEach((team) => {
        if (team?.teamId && team.name) names.set(team.teamId, team.name);
      });
      (pool?.matches ?? []).forEach((match) => {
        if (match?.teamAId && match.teamA) names.set(match.teamAId, match.teamA);
        if (match?.teamBId && match.teamB) names.set(match.teamBId, match.teamB);
      });
    });
  });
  return names;
};

function buildEventHierarchyPlan(payload) {
  const { eventId, event, divisions, eventVenues, originalHierarchy } = payload || {};
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
    throw new Error("Invalid rules JSON. Please provide a valid rules configuration.");
  }

  const originalIndex = buildHierarchyIndex(originalHierarchy);
  const teamNames = new Map([
    ...collectTeamNames(originalHierarchy),
    ...collectTeamNames({ divisions }),
  ]);
  const teamName = (teamId) => teamNames.get(teamId) || "a team";

  const plan = {
    eventId: normalizedEventId,
    originalIndex,
    eventUpdate: null,
    venueUpdates: [],
    venueInserts: [],
    venueLinkAdds: [],
    venueLinkRemoves: [],
    divisionUpdates: [],
    divisionInserts: [],
    poolUpdates: [],
    poolInserts: [],
    divisionTeamAdds: [],
    divisionTeamRemoves: [],
    poolTeamUpserts: [],
    poolTeamRemoves: [],
    matchUpdates: [],
    matchInserts: [],
    matchDeletes: [],
    poolDeletes: [],
    divisionDeletes: [],
    counts: {},
  };

  // --- Event -------------------------------------------------------------
  const nextEventRecord = {
    name,
    type: normalizeEventType(event?.type),
    start_date: normalizeDate(event?.start_date),
    end_date: normalizeDate(event?.end_date),
    location: normalizeText(event?.location) || null,
    rules: parsedRules,
  };
  const eventChanges = buildFlatRecordChanges(nextEventRecord, originalIndex.event, [
    "name",
    "type",
    "start_date",
    "end_date",
    "location",
  ]);
  if (!originalIndex.event || !areJsonValuesEqual(nextEventRecord.rules, originalIndex.event.rules)) {
    eventChanges.rules = nextEventRecord.rules;
  }
  if (hasOwnKeys(eventChanges)) plan.eventUpdate = eventChanges;

  // --- Fields (venues) ---------------------------------------------------
  const venueRefByClientId = new Map();
  const desiredVenueKeys = new Set();
  const insertedVenueBySignature = new Map();
  cleanEventVenuesInput(eventVenues).forEach((venue) => {
    const record = {
      name: venue.name,
      city: venue.city,
      location: venue.location,
      notes: venue.notes,
      latitude: venue.latitude,
      longitude: venue.longitude,
    };
    const signature = buildVenueSignature(record);
    const clientId = venue.id || venue.venueId || null;
    const explicitId = normalizeText(venue.venueId || venue.id);
    const existingId = isUuid(explicitId) ? explicitId : originalIndex.venueIdBySignature.get(signature);

    let ref;
    if (isUuid(existingId)) {
      ref = existingId;
      const original = originalIndex.venueById.get(existingId);
      if (original) {
        const changes = buildFlatRecordChanges(record, original, VENUE_COMPARE_KEYS);
        if (hasOwnKeys(changes)) {
          plan.venueUpdates.push({ id: existingId, changes, label: record.name });
        }
      }
      // A venue picked from the shared list (not linked to this event yet) is
      // linked as it is; its details belong to every event that uses it.
    } else if (insertedVenueBySignature.has(signature)) {
      ref = insertedVenueBySignature.get(signature);
    } else {
      ref = newRef("venue", plan.venueInserts.length);
      plan.venueInserts.push({ record, label: record.name });
      insertedVenueBySignature.set(signature, ref);
    }
    if (clientId) venueRefByClientId.set(clientId, ref);
    if (isUuid(ref)) venueRefByClientId.set(ref, ref);

    const key = refKey(ref);
    if (desiredVenueKeys.has(key)) return;
    desiredVenueKeys.add(key);
    if (isNewRef(ref) || !originalIndex.venueIds.has(ref)) {
      plan.venueLinkAdds.push({ venueRef: ref, label: record.name });
    }
  });
  originalIndex.venueIds.forEach((venueId) => {
    if (!desiredVenueKeys.has(venueId)) {
      plan.venueLinkRemoves.push({
        venueId,
        label: originalIndex.venueById.get(venueId)?.name || "a field",
      });
    }
  });

  // --- Divisions ---------------------------------------------------------
  const cleanedDivisions = cleanDivisionsInput(divisions);
  // Refs are kept beside the wizard's objects, never written onto them.
  const divisionRefs = new Map();
  const poolRefs = new Map();
  const desiredDivisionIds = new Set();
  cleanedDivisions.forEach((division) => {
    const divisionName = normalizeText(division.name);
    const level = normalizeText(division.level) || null;
    const rawId = normalizeText(division.id);
    const existingId = isUuid(rawId)
      ? rawId
      : originalIndex.divisionIdBySignature.get(buildDivisionSignature({ name: divisionName, level }));
    let ref;
    if (isUuid(existingId)) {
      ref = existingId;
      desiredDivisionIds.add(existingId);
      const original = originalIndex.divisionById.get(existingId);
      if (original) {
        const changes = buildFlatRecordChanges({ name: divisionName, level }, original, ["name", "level"]);
        if (hasOwnKeys(changes)) plan.divisionUpdates.push({ id: existingId, changes, label: divisionName });
      }
    } else {
      ref = newRef("division", plan.divisionInserts.length);
      plan.divisionInserts.push({
        record: { event_id: normalizedEventId, name: divisionName, level },
        label: divisionName,
      });
    }
    divisionRefs.set(division, ref);
  });

  // --- Pools -------------------------------------------------------------
  const desiredPoolIds = new Set();
  cleanedDivisions.forEach((division) => {
    const divisionRef = divisionRefs.get(division);
    (division.pools || [])
      .filter((pool) => normalizeText(pool?.name))
      .forEach((pool) => {
        const poolName = normalizeText(pool.name);
        const rawId = normalizeText(pool.id);
        const existingId = isUuid(rawId)
          ? rawId
          : isUuid(divisionRef)
            ? originalIndex.poolIdBySignature.get(buildPoolSignature({ division_id: divisionRef, name: poolName }))
            : null;
        let ref;
        if (isUuid(existingId)) {
          ref = existingId;
          desiredPoolIds.add(existingId);
          const original = originalIndex.poolById.get(existingId);
          if (original) {
            const changes = {};
            if (original.name !== poolName) changes.name = poolName;
            if (refKey(divisionRef) !== (original.division_id ?? "")) changes.division_id = divisionRef;
            if (hasOwnKeys(changes)) plan.poolUpdates.push({ id: existingId, changes, label: poolName });
          }
        } else {
          ref = newRef("pool", plan.poolInserts.length);
          plan.poolInserts.push({ divisionRef, name: poolName, label: `${poolName} (${normalizeText(division.name)})` });
        }
        poolRefs.set(pool, ref);
      });
  });

  // --- Teams in divisions and pools --------------------------------------
  const desiredDivisionTeamKeys = new Set();
  cleanedDivisions.forEach((division) => {
    (division.divisionTeams || []).forEach((team) => {
      if (!team?.teamId) return;
      const key = `${refKey(divisionRefs.get(division))}:${team.teamId}`;
      if (desiredDivisionTeamKeys.has(key)) return;
      desiredDivisionTeamKeys.add(key);
      if (!originalIndex.divisionTeamKeys.has(key)) {
        plan.divisionTeamAdds.push({
          divisionRef: divisionRefs.get(division),
          teamId: team.teamId,
          label: `${teamName(team.teamId)} to ${normalizeText(division.name)}`,
        });
      }
    });
  });
  originalIndex.divisionTeamKeys.forEach((key) => {
    if (desiredDivisionTeamKeys.has(key)) return;
    const [divisionId, teamId] = key.split(":");
    plan.divisionTeamRemoves.push({
      divisionId,
      teamId,
      label: `${teamName(teamId)} from ${originalIndex.divisionById.get(divisionId)?.name || "a division"}`,
    });
  });

  const desiredPoolTeamKeys = new Set();
  const usedSeeds = new Set();
  cleanedDivisions.forEach((division) => {
    (division.pools || []).forEach((pool) => {
      if (!poolRefs.has(pool)) return;
      (pool.teams || []).forEach((team) => {
        if (!team?.teamId) return;
        const key = `${refKey(poolRefs.get(pool))}:${team.teamId}`;
        if (desiredPoolTeamKeys.has(key)) return;
        desiredPoolTeamKeys.add(key);
        const seed = toNullableNumber(team.seed);
        if (seed !== null && (!Number.isInteger(seed) || seed < 1)) {
          throw new Error(`${teamName(team.teamId)} in ${normalizeText(pool.name)} has seed ${team.seed}; seeds are whole numbers from 1.`);
        }
        const seedKey = `${refKey(poolRefs.get(pool))}:${seed}`;
        if (seed !== null && usedSeeds.has(seedKey)) {
          throw new Error(`Two teams in ${normalizeText(pool.name)} have seed ${seed}.`);
        }
        if (seed !== null) usedSeeds.add(seedKey);
        const original = originalIndex.poolTeamByKey.get(key);
        if (!original || original.seed !== seed) {
          plan.poolTeamUpserts.push({
            poolRef: poolRefs.get(pool),
            teamId: team.teamId,
            seed,
            isNew: !original,
            label: `${teamName(team.teamId)} in ${normalizeText(pool.name)}`,
          });
        }
      });
    });
  });
  originalIndex.poolTeamKeys.forEach((key) => {
    if (desiredPoolTeamKeys.has(key)) return;
    const [poolId, teamId] = key.split(":");
    plan.poolTeamRemoves.push({
      poolId,
      teamId,
      label: `${teamName(teamId)} from ${originalIndex.poolById.get(poolId)?.name || "a pool"}`,
    });
  });

  // --- Matches -----------------------------------------------------------
  const desiredMatchIds = new Set();
  const desiredMatchSignatures = new Set();
  cleanedDivisions.forEach((division) => {
    (division.pools || []).forEach((pool) => {
      if (!poolRefs.has(pool)) return;
      (pool.matches || []).forEach((match) => {
        const matchLabel = `${teamName(match?.teamAId)} vs ${teamName(match?.teamBId)}`;
        if (!match?.teamAId || !match?.teamBId) {
          // A saved match with no teams yet (a playoff or Swiss game the
          // resolver fills later) is kept untouched, never deleted: ON DELETE
          // SET NULL would silently unlink its bracket node (Mixed Nationals
          // 2026, 2026-11-10).
          const keptId = normalizeText(match?.id);
          if (isUuid(keptId)) desiredMatchIds.add(keptId);
          return;
        }
        if (match.teamAId === match.teamBId) {
          throw new Error(`A match in ${normalizeText(pool.name)} has ${teamName(match.teamAId)} playing itself.`);
        }
        const clientVenueRef = match.venueRefId || match.venueId || null;
        let venueRef = null;
        if (clientVenueRef) {
          venueRef = venueRefByClientId.get(clientVenueRef) ?? (isUuid(clientVenueRef) ? clientVenueRef : undefined);
          if (venueRef === undefined) {
            throw new Error(`${matchLabel} is on a field that is not in this event's field list.`);
          }
        }
        const record = {
          event_id: normalizedEventId,
          division_id: divisionRefs.get(division),
          pool_id: poolRefs.get(pool),
          team_a: match.teamAId,
          team_b: match.teamBId,
          status: normalizeMatchStatus(match.status),
          start_time: normalizeTimestamp(match.start),
          venue_id: venueRef,
          ...buildMatchExtras(match),
        };
        const signature = buildMatchSignature({ ...record, pool_id: refKey(record.pool_id) });
        if (desiredMatchSignatures.has(signature)) return;
        desiredMatchSignatures.add(signature);

        const rawId = normalizeText(match.id);
        const existingId = isUuid(rawId) ? rawId : originalIndex.matchIdBySignature.get(signature);
        if (isUuid(existingId)) {
          desiredMatchIds.add(existingId);
          const original = originalIndex.matchById.get(existingId);
          if (original) {
            const changes = {};
            MATCH_COMPARE_KEYS.forEach((key) => {
              if (refKey(record[key]) !== refKey(original[key])) changes[key] = record[key];
            });
            if (hasOwnKeys(changes)) plan.matchUpdates.push({ id: existingId, changes, label: matchLabel });
          } else {
            // Known to the wizard but not to the snapshot it loaded: write it
            // whole, as before. There is nothing to compare it against.
            plan.matchUpdates.push({ id: existingId, changes: record, label: matchLabel, unknownOriginal: true });
          }
        } else {
          plan.matchInserts.push({ record, label: matchLabel });
        }
      });
    });
  });
  originalIndex.matchIds.forEach((matchId) => {
    if (desiredMatchIds.has(matchId)) return;
    const original = originalIndex.matchById.get(matchId);
    plan.matchDeletes.push({
      id: matchId,
      label: `${teamName(original?.team_a)} vs ${teamName(original?.team_b)}`,
    });
  });

  originalIndex.poolIds.forEach((poolId) => {
    if (!desiredPoolIds.has(poolId)) {
      plan.poolDeletes.push({ id: poolId, label: originalIndex.poolById.get(poolId)?.name || "a pool" });
    }
  });
  originalIndex.divisionIds.forEach((divisionId) => {
    if (!desiredDivisionIds.has(divisionId)) {
      plan.divisionDeletes.push({ id: divisionId, label: originalIndex.divisionById.get(divisionId)?.name || "a division" });
    }
  });

  plan.counts = {
    divisionCount: cleanedDivisions.length,
    poolCount: cleanedDivisions.reduce((total, division) => total + (division.pools?.length || 0), 0),
    divisionTeamCount: desiredDivisionTeamKeys.size,
    poolTeamCount: desiredPoolTeamKeys.size,
    matchCount: desiredMatchIds.size + plan.matchInserts.length,
    eventVenueCount: desiredVenueKeys.size,
  };
  return plan;
}

// Removals that need `event_delete` (no role holds it; admins pass through
// admin_override). Match deletion is separate (`match_delete`, held by TDs).
const structureRemovalsOf = (plan) => [
  ...plan.venueLinkRemoves.map((entry) => `Field ${entry.label} from the event`),
  ...plan.divisionTeamRemoves.map((entry) => `${entry.label}`),
  ...plan.poolTeamRemoves.map((entry) => `${entry.label}`),
  ...plan.poolDeletes.map((entry) => `Pool ${entry.label}`),
  ...plan.divisionDeletes.map((entry) => `Division ${entry.label}`),
];

const summarisePlan = (plan) => {
  const lines = [];
  const add = (items, verb, word, pluralWord) => {
    if (items.length) lines.push(`${verb} ${plural(items.length, word, pluralWord)}: ${items.map((item) => item.label).join(", ")}`);
  };
  if (plan.eventUpdate) lines.push(`Update event details: ${Object.keys(plan.eventUpdate).join(", ")}`);
  add(plan.venueInserts, "Create", "new field");
  add(plan.venueUpdates, "Edit", "field");
  add(plan.venueLinkAdds.filter((entry) => !isNewRef(entry.venueRef)), "Add", "existing field");
  add(plan.venueLinkRemoves, "Remove", "field");
  add(plan.divisionInserts, "Create", "division");
  add(plan.divisionUpdates, "Rename", "division");
  add(plan.divisionDeletes, "Delete", "division");
  add(plan.poolInserts, "Create", "pool");
  add(plan.poolUpdates, "Change", "pool");
  add(plan.poolDeletes, "Delete", "pool");
  add(plan.divisionTeamAdds, "Add", "team to a division", "teams to divisions");
  add(plan.divisionTeamRemoves, "Remove", "team from a division", "teams from divisions");
  add(plan.poolTeamUpserts.filter((entry) => entry.isNew), "Add", "team to a pool", "teams to pools");
  add(plan.poolTeamUpserts.filter((entry) => !entry.isNew), "Change seed of", "pool team");
  add(plan.poolTeamRemoves, "Remove", "team from a pool", "teams from pools");
  add(plan.matchInserts, "Create", "match", "matches");
  add(plan.matchUpdates, "Update", "match", "matches");
  add(plan.matchDeletes, "Delete", "match", "matches");
  return lines;
};

/**
 * What saving the wizard would change, without writing anything.
 * Returns { lines, blocked }: `lines` describe every change; `blocked` lists
 * removals the user cannot make (only filled when `canRemoveStructure` is
 * false). Throws on invalid input, like the save itself.
 */
export function previewEventHierarchyUpdate(payload) {
  const plan = buildEventHierarchyPlan(payload);
  return {
    lines: summarisePlan(plan),
    blocked: payload?.canRemoveStructure ? [] : structureRemovalsOf(plan),
  };
}

// Anything the save is about to change or remove that someone else changed
// since the wizard loaded its snapshot.
const findStaleRecords = (plan, currentIndex) => {
  const { originalIndex } = plan;
  const stale = [];
  if (plan.eventUpdate) {
    const before = originalIndex.event;
    const now = currentIndex.event;
    const keys = ["name", "type", "start_date", "end_date", "location"];
    if (!now || keys.some((key) => before?.[key] !== now[key]) || !areJsonValuesEqual(before?.rules, now.rules)) {
      stale.push("the event details");
    }
  }
  const sameRecord = (before, now, keys) =>
    Boolean(before && now) && keys.every((key) => refKey(before[key]) === refKey(now[key]));
  plan.venueUpdates.forEach((entry) => {
    if (!sameRecord(originalIndex.venueById.get(entry.id), currentIndex.venueById.get(entry.id), VENUE_COMPARE_KEYS)) {
      stale.push(`field ${entry.label}`);
    }
  });
  [...plan.divisionUpdates, ...plan.divisionDeletes].forEach((entry) => {
    if (!sameRecord(originalIndex.divisionById.get(entry.id), currentIndex.divisionById.get(entry.id), ["name", "level"])) {
      stale.push(`division ${entry.label}`);
    }
  });
  [...plan.poolUpdates, ...plan.poolDeletes].forEach((entry) => {
    if (!sameRecord(originalIndex.poolById.get(entry.id), currentIndex.poolById.get(entry.id), ["division_id", "name"])) {
      stale.push(`pool ${entry.label}`);
    }
  });
  [...plan.matchUpdates, ...plan.matchDeletes].forEach((entry) => {
    if (entry.unknownOriginal) return;
    if (!sameRecord(originalIndex.matchById.get(entry.id), currentIndex.matchById.get(entry.id), MATCH_COMPARE_KEYS)) {
      stale.push(`match ${entry.label}`);
    }
  });
  plan.poolTeamUpserts.forEach((entry) => {
    if (entry.isNew || !isUuid(entry.poolRef)) return;
    const key = `${entry.poolRef}:${entry.teamId}`;
    if (originalIndex.poolTeamByKey.get(key)?.seed !== currentIndex.poolTeamByKey.get(key)?.seed) {
      stale.push(`seed of ${entry.label}`);
    }
  });
  return stale;
};

const listForMessage = (items, limit = 6) =>
  items.length > limit ? `${items.slice(0, limit).join("; ")}; and ${items.length - limit} more` : items.join("; ");

export async function replaceEventHierarchy(payload) {
  const plan = buildEventHierarchyPlan(payload);
  const eventId = plan.eventId;

  // --- Checks before the first write ----------------------------------------
  if (!payload?.canRemoveStructure) {
    const blocked = structureRemovalsOf(plan);
    if (blocked.length) {
      throw new Error(
        `Nothing was saved. Only an admin can remove these from an event: ${listForMessage(blocked)}. ` +
          "Put them back in the wizard and save, or ask an admin to make the removal.",
      );
    }
  }

  const current = await getEventHierarchy(eventId);
  const stale = findStaleRecords(plan, buildHierarchyIndex(current));
  if (stale.length) {
    throw new Error(
      `Nothing was saved. Someone else changed this event since you opened it: ${listForMessage(stale)}. ` +
        "Use \"Refresh data from database\" and make your changes again.",
    );
  }

  if (plan.matchDeletes.length) {
    const { data: linkedNodes, error: linkedError } = await supabase
      .from("bracket_nodes")
      .select("match_id")
      .in("match_id", plan.matchDeletes.map((entry) => entry.id));
    if (linkedError) {
      throw new Error(linkedError.message || "Failed to check bracket links.");
    }
    // Never delete a match a bracket node links to: the wizard does not show
    // brackets, and the FK would unlink the node without any warning. It is
    // removed on the Playoff structure page instead.
    const linkedIds = new Set((linkedNodes ?? []).map((row) => row.match_id));
    plan.matchDeletes = plan.matchDeletes.filter((entry) => !linkedIds.has(entry.id));
  }

  // --- Writes ---------------------------------------------------------------
  const created = { venue: [], division: [], pool: [] };
  const resolve = (value) => {
    if (!isNewRef(value)) return value ?? null;
    const id = created[value.newRef]?.[value.index];
    if (!id) throw new Error(`Internal error: new ${value.newRef} was not created.`);
    return id;
  };
  const resolveRecord = (record) =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [key, resolve(value)]));

  const done = [];
  const step = async (label, run) => {
    try {
      await run();
      done.push(label);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        done.length
          ? `Saving stopped at "${label}": ${message}. Already saved: ${done.join(", ")}. Use "Refresh data from database" before trying again.`
          : `Nothing was saved. "${label}" failed: ${message}`,
        { cause: err },
      );
    }
  };
  // An UPDATE or DELETE refused by RLS returns success with zero rows, so
  // every one is read back and must touch exactly the rows it targeted.
  const expectRows = async (query, expected, refusal) => {
    const { data, error } = await query;
    if (error) throw new Error(error.message || refusal);
    if ((data ?? []).length !== expected) throw new Error(`${refusal} (the database refused the change)`);
  };
  const insertReturningIds = async (table, rows, refusal) => {
    const { data, error } = await supabase.from(table).insert(rows).select("id");
    if (error) {
      throw new Error(
        isRlsViolation(error) ? `${refusal}: you do not have permission` : error.message || refusal,
      );
    }
    if ((data ?? []).length !== rows.length) throw new Error(`${refusal} (the database refused the change)`);
    return data.map((row) => row.id);
  };

  if (plan.eventUpdate) {
    await step("event details", () =>
      expectRows(
        supabase.from("events").update(plan.eventUpdate).eq("id", eventId).select("id"),
        1,
        "Could not update the event details",
      ),
    );
  }

  if (plan.venueUpdates.length) {
    await step("field details", async () => {
      for (const entry of plan.venueUpdates) {
        await expectRows(
          supabase.from("venues").update(entry.changes).eq("id", entry.id).select("id"),
          1,
          `Could not update field ${entry.label}`,
        );
      }
    });
  }
  if (plan.venueInserts.length) {
    await step("new fields", async () => {
      created.venue = await insertReturningIds(
        "venues",
        plan.venueInserts.map((entry) => entry.record),
        "Could not create the new fields",
      );
    });
  }
  if (plan.venueLinkAdds.length) {
    await step("fields added to the event", async () => {
      const { error } = await supabase.from("event_venues").upsert(
        plan.venueLinkAdds.map((entry) => ({ event_id: eventId, venue_id: resolve(entry.venueRef) })),
        { onConflict: "event_id,venue_id", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message || "Could not add the fields to the event");
    });
  }
  if (plan.venueLinkRemoves.length) {
    await step("fields removed from the event", () =>
      expectRows(
        supabase
          .from("event_venues")
          .delete()
          .eq("event_id", eventId)
          .in("venue_id", plan.venueLinkRemoves.map((entry) => entry.venueId))
          .select("venue_id"),
        plan.venueLinkRemoves.length,
        "Could not remove fields from the event",
      ),
    );
  }

  if (plan.divisionUpdates.length) {
    await step("division changes", async () => {
      for (const entry of plan.divisionUpdates) {
        await expectRows(
          supabase.from("divisions").update(entry.changes).eq("id", entry.id).select("id"),
          1,
          `Could not update division ${entry.label}`,
        );
      }
    });
  }
  if (plan.divisionInserts.length) {
    await step("new divisions", async () => {
      created.division = await insertReturningIds(
        "divisions",
        plan.divisionInserts.map((entry) => entry.record),
        "Could not create the new divisions",
      );
    });
  }
  if (plan.poolUpdates.length) {
    await step("pool changes", async () => {
      for (const entry of plan.poolUpdates) {
        await expectRows(
          supabase.from("pools").update(resolveRecord(entry.changes)).eq("id", entry.id).select("id"),
          1,
          `Could not update pool ${entry.label}`,
        );
      }
    });
  }
  if (plan.poolInserts.length) {
    await step("new pools", async () => {
      created.pool = await insertReturningIds(
        "pools",
        plan.poolInserts.map((entry) => ({ division_id: resolve(entry.divisionRef), name: entry.name })),
        "Could not create the new pools",
      );
    });
  }

  if (plan.divisionTeamAdds.length) {
    await step("teams added to divisions", async () => {
      const { error } = await supabase.from("division_teams").upsert(
        plan.divisionTeamAdds.map((entry) => ({ division_id: resolve(entry.divisionRef), team_id: entry.teamId })),
        { onConflict: "division_id,team_id", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message || "Could not add teams to divisions");
    });
  }
  if (plan.divisionTeamRemoves.length) {
    await step("teams removed from divisions", async () => {
      for (const entry of plan.divisionTeamRemoves) {
        await expectRows(
          supabase
            .from("division_teams")
            .delete()
            .eq("division_id", entry.divisionId)
            .eq("team_id", entry.teamId)
            .select("team_id"),
          1,
          `Could not remove ${entry.label}`,
        );
      }
    });
  }
  if (plan.poolTeamRemoves.length) {
    await step("teams removed from pools", async () => {
      for (const entry of plan.poolTeamRemoves) {
        await expectRows(
          supabase
            .from("pool_teams")
            .delete()
            .eq("pool_id", entry.poolId)
            .eq("team_id", entry.teamId)
            .select("team_id"),
          1,
          `Could not remove ${entry.label}`,
        );
      }
    });
  }

  // A pool's seeds must stay unique (pool_teams_pool_id_seed_key), so swapping
  // two seeds in one write fails. Clear the seeds that change first.
  const reseeded = plan.poolTeamUpserts.filter((entry) => !entry.isNew);
  if (reseeded.length) {
    await step("seeds cleared for reseeding", async () => {
      for (const entry of reseeded) {
        await expectRows(
          supabase
            .from("pool_teams")
            .update({ seed: null })
            .eq("pool_id", entry.poolRef)
            .eq("team_id", entry.teamId)
            .select("team_id"),
          1,
          `Could not change the seed of ${entry.label}`,
        );
      }
    });
  }
  if (plan.poolTeamUpserts.length) {
    await step("pool teams and seeds", async () => {
      const { error } = await supabase.from("pool_teams").upsert(
        plan.poolTeamUpserts.map((entry) => ({ pool_id: resolve(entry.poolRef), team_id: entry.teamId, seed: entry.seed })),
        { onConflict: "pool_id,team_id" },
      );
      if (error) throw new Error(error.message || "Could not update pool teams");
    });
  }
  if (plan.matchUpdates.length) {
    await step("match changes", async () => {
      for (const entry of plan.matchUpdates) {
        await expectRows(
          supabase.from("matches").update(resolveRecord(entry.changes)).eq("id", entry.id).select("id"),
          1,
          `Could not update match ${entry.label}`,
        );
      }
    });
  }
  if (plan.matchInserts.length) {
    await step("new matches", async () => {
      await insertReturningIds(
        "matches",
        plan.matchInserts.map((entry) => resolveRecord(entry.record)),
        "Could not create the new matches",
      );
    });
  }
  if (plan.matchDeletes.length) {
    await step("deleted matches", () =>
      expectRows(
        supabase.from("matches").delete().in("id", plan.matchDeletes.map((entry) => entry.id)).select("id"),
        plan.matchDeletes.length,
        "Could not delete matches",
      ),
    );
  }
  if (plan.poolDeletes.length) {
    await step("deleted pools", () =>
      expectRows(
        supabase.from("pools").delete().in("id", plan.poolDeletes.map((entry) => entry.id)).select("id"),
        plan.poolDeletes.length,
        "Could not delete pools",
      ),
    );
  }
  if (plan.divisionDeletes.length) {
    await step("deleted divisions", () =>
      expectRows(
        supabase.from("divisions").delete().in("id", plan.divisionDeletes.map((entry) => entry.id)).select("id"),
        plan.divisionDeletes.length,
        "Could not delete divisions",
      ),
    );
  }

  if (done.length) {
    invalidateCachedQueries(`matches:event:${eventId}`);
  }

  return {
    eventId,
    ...plan.counts,
    changes: summarisePlan(plan),
  };
}

// Seeds the event's brackets from the wizard's sketched structure, but ONLY when
// the event has no brackets yet. Node sources reference divisions/pools by NAME
// (resolved here against the freshly persisted hierarchy) so the caller does not
// have to thread client->DB id maps out of create/replaceEventHierarchy.
//
// This is intentionally create-only and NEVER overwrites existing brackets: the
// standalone Playoff Structure page is the source of truth for real brackets
// (advancement wiring, linked matches, winner/loser/static sources), and the
// wizard can only express pool_rank sketches. If we tore brackets down on every
// wizard save we would silently destroy that richer data. So once any bracket
// exists for the event, this is a no-op.
export async function seedEventBracketsIfEmpty(eventId, brackets = []) {
  const normalizedEventId = normalizeText(eventId);
  if (!normalizedEventId) {
    return { bracketCount: 0, nodeCount: 0 };
  }

  const desired = Array.isArray(brackets)
    ? brackets.filter((bracket) => normalizeText(bracket?.name))
    : [];

  if (!desired.length) {
    return { bracketCount: 0, nodeCount: 0 };
  }

  // If the event already has brackets (sketched here earlier OR built in the
  // Playoff Structure page), leave them untouched — never clobber real data.
  const existing = await getBracketsByEvent(normalizedEventId);
  if (existing.length) {
    return { bracketCount: 0, nodeCount: 0 };
  }

  // Build a name -> id resolver from the freshly persisted hierarchy so node
  // sources (division name + pool name + rank) map onto real DB ids.
  const hierarchy = await getEventHierarchy(normalizedEventId);
  const divisionIdByName = new Map();
  const poolIdByName = new Map();
  (hierarchy.divisions || []).forEach((division) => {
    const divisionKey = normalizeSignaturePart(division.name);
    if (divisionKey) {
      divisionIdByName.set(divisionKey, division.id);
    }
    (division.pools || []).forEach((pool) => {
      const poolKey = `${divisionKey}::${normalizeSignaturePart(pool.name)}`;
      poolIdByName.set(poolKey, pool.id);
    });
  });

  // Sources MUST carry a `type`: resolveBracketSource dispatches on it, and an
  // untyped source resolves to nothing, so a node seeded without one can never
  // advance a team — not via the Playoff Structure page's button, and not via
  // the scheduled resolver. (Rows seeded before this was fixed are repaired by
  // the backfill in supabase/migrations/*_playoff_auto_resolve.sql.)
  //
  // Both casings are written because the resolver reads either and the rest of
  // the app writes camelCase; keeping the snake_case keys stays compatible with
  // anything already reading the old shape.
  const resolveSource = (source) => {
    if (!source || typeof source !== "object") {
      return {};
    }
    const divisionKey = normalizeSignaturePart(source.divisionName);
    const poolKey = `${divisionKey}::${normalizeSignaturePart(source.poolName)}`;
    const rank = toNullableNumber(source.rank);
    const resolved = {};
    if (divisionIdByName.has(divisionKey)) {
      resolved.division_id = divisionIdByName.get(divisionKey);
      resolved.divisionId = resolved.division_id;
    }
    if (poolIdByName.has(poolKey)) {
      resolved.pool_id = poolIdByName.get(poolKey);
      resolved.poolId = resolved.pool_id;
    }
    if (Number.isInteger(rank) && rank >= 1) {
      resolved.rank = rank;
    }
    // An unmappable source stays untyped so it reports as unconfigured rather
    // than as a broken pool_rank pointing at nothing.
    if (!resolved.pool_id && !resolved.division_id) {
      return {};
    }
    return { type: "pool_rank", ...resolved };
  };

  // A sketch made from a template, with every one of its games still present,
  // is built through the same instantiateTemplate as the Playoff Structure
  // page, so it keeps its winner/loser wiring and connectors. The sketch only
  // contributes what it can express: the seeds (taken from its seeded games'
  // pool sources) and the game names. A sketch whose games were added or
  // removed no longer matches the template and falls back to the plain path.
  const buildFromTemplate = async (bracket) => {
    const template = bracket?.templateId ? getTemplateById(bracket.templateId) : null;
    const sketchNodes = Array.isArray(bracket.nodes) ? bracket.nodes : [];
    if (!template || template.configurable || sketchNodes.length !== template.nodes.length) {
      return null;
    }
    const sketchByKey = new Map(sketchNodes.map((node) => [node.templateKey, node]));
    if (!template.nodes.every((node) => sketchByKey.has(node.key))) {
      return null;
    }

    const seedMap = {};
    const nodeNames = {};
    template.nodes.forEach((node) => {
      const sketch = sketchByKey.get(node.key);
      nodeNames[node.key] = normalizeText(sketch.name);
      [
        [node.sourceA, sketch.sourceA],
        [node.sourceB, sketch.sourceB],
      ].forEach(([templateSource, sketchSource]) => {
        if (templateSource?.kind === "seed") {
          seedMap[templateSource.seed] = resolveSource(sketchSource);
        }
      });
    });

    return instantiateTemplate({
      eventId: normalizedEventId,
      template,
      bracketName: normalizeText(bracket.name),
      bracketType: template.bracketType,
      seedMap,
      nodeNames,
    });
  };

  let bracketCount = 0;
  let nodeCount = 0;
  for (const bracket of desired) {
    const fromTemplate = await buildFromTemplate(bracket);
    if (fromTemplate) {
      bracketCount += 1;
      nodeCount += fromTemplate.nodeCount || 0;
      continue;
    }

    const created = await createBracket({
      eventId: normalizedEventId,
      name: normalizeText(bracket.name),
      type: normalizeText(bracket.type) || "single_elim",
    });
    if (!created?.id) {
      continue;
    }
    bracketCount += 1;
    const nodes = Array.isArray(bracket.nodes) ? bracket.nodes : [];
    for (const node of nodes) {
      await createBracketNode({
        bracketId: created.id,
        name: normalizeText(node.name) || null,
        round: toNullableNumber(node.round),
        position: toNullableNumber(node.position),
        sourceA: resolveSource(node.sourceA),
        sourceB: resolveSource(node.sourceB),
      });
      nodeCount += 1;
    }
  }

  return { bracketCount, nodeCount };
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
    .select("id, name, city, location, notes, latitude, longitude")
    .order("city", { ascending: true })
    .order("location", { ascending: true })
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
    .select("id, name, type, start_date, end_date, location, rules, status:Status")
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
        venue:venues(id, name, city, location, notes, latitude, longitude)
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
        score_a,
        score_b,
        captains_confirmed,
        scorekeeper,
        starting_team_id,
        abba_pattern,
        team_a_meta:teams!matches_team_a_fkey (id, name, short_name),
        team_b_meta:teams!matches_team_b_fkey (id, name, short_name),
        venue:venues!matches_venue_id_fkey (id, name, city, location, notes, latitude, longitude)
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
      venueCity: row.venue?.city || "",
      venueLocation: row.venue?.location || "",
      venueRefId: row.venue_id || null,
      scoreA: row.score_a ?? "",
      scoreB: row.score_b ?? "",
      captainsConfirmed: Boolean(row.captains_confirmed),
      scorekeeperId: row.scorekeeper || "",
      startingTeamId: row.starting_team_id || "",
      abbaPattern: row.abba_pattern || "",
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
    city: row.venue?.city || "",
    location: row.venue?.location || "",
    notes: row.venue?.notes || "",
    latitude: row.venue?.latitude ?? null,
    longitude: row.venue?.longitude ?? null,
  }));

  // Brackets are loaded into a wizard-friendly shape whose node sources reference
  // divisions/pools by NAME, so they survive the clone id-strip and resolve back
  // to real ids on first seed via seedEventBracketsIfEmpty. NOTE: this shape is
  // lossy (pool_rank only) — it is a summary for the wizard, not an editable copy
  // of brackets built in the Playoff Structure page.
  const divisionNameById = new Map(
    (divisionRows ?? []).map((division) => [division.id, division.name || ""]),
  );
  const poolNameById = new Map(
    (poolRows ?? []).map((pool) => [
      pool.id,
      { name: pool.name || "", divisionId: pool.division_id },
    ]),
  );
  const labelSource = (source) => {
    if (!source || typeof source !== "object") {
      return { divisionName: "", poolName: "", rank: "" };
    }
    const poolMeta = source.pool_id ? poolNameById.get(source.pool_id) : null;
    const divisionId = source.division_id || poolMeta?.divisionId || null;
    return {
      divisionName: divisionId ? divisionNameById.get(divisionId) || "" : "",
      poolName: poolMeta?.name || "",
      rank: source.rank ?? "",
    };
  };

  let brackets;
  try {
    const bracketRows = await getBracketsByEvent(normalizedEventId);
    brackets = (bracketRows || []).map((bracket) => ({
      id: bracket.id,
      name: bracket.name || "",
      type: bracket.type || "single_elim",
      nodes: (bracket.nodes || []).map((node) => ({
        id: node.id,
        name: node.name || "",
        round: node.round ?? "",
        position: node.position ?? "",
        sourceA: labelSource(node.source_a),
        sourceB: labelSource(node.source_b),
      })),
    }));
  } catch {
    // Brackets are optional context for the wizard; a load failure should not
    // block editing the rest of the hierarchy.
    brackets = [];
  }

  return {
    event: eventRow,
    divisions,
    eventVenues,
    brackets,
  };
}
