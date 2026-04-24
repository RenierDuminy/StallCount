import { supabase } from "./supabaseClient";
import { getCachedQuery, invalidateCachedQueries } from "../utils/queryCache";

const TOURNAMENT_OVERVIEW_CACHE_TTL_MS = 30 * 1000;

const TOURNAMENT_OVERVIEW_MATCH_FIELDS = `
  id,
  event_id,
  division_id,
  pool_id,
  start_time,
  confirmed_at,
  status,
  score_a,
  score_b,
  captains_confirmed,
  scorekeeper,
  starting_team_id,
  abba_pattern,
  media_link,
  media_provider,
  media_url,
  media_status,
  has_media,
  venue:venues!matches_venue_id_fkey (id, name),
  team_a:teams!matches_team_a_fkey (id, name, short_name),
  team_b:teams!matches_team_b_fkey (id, name, short_name)
`;

function getDisplayTeamName(team) {
  if (!team || typeof team !== "object") return "TBD";
  return team.short_name || team.name || "TBD";
}

function coerceNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getSpiritCategoryValues(row) {
  if (!row) return null;

  return {
    rulesKnowledge: row.rules_knowledge ?? "",
    foulsContact: row.fouls_contact ?? "",
    positiveAttitude: row.positive_attitude ?? "",
    communication: row.communication ?? "",
    selfControl: row.self_control ?? "",
  };
}

function buildSpiritLookup(rows) {
  const grouped = new Map();
  const latestRows = new Map();

  (rows || []).forEach((row) => {
    const matchId = typeof row?.match_id === "string" ? row.match_id : "";
    const ratedTeamId = typeof row?.rated_team_id === "string" ? row.rated_team_id : "";
    if (!matchId) return;
    if (!ratedTeamId) return;

    const latestKey = `${matchId}:${ratedTeamId}`;
    const previous = latestRows.get(latestKey);
    const previousTime = previous?.submitted_at ? new Date(previous.submitted_at).getTime() : 0;
    const rowTime = row?.submitted_at ? new Date(row.submitted_at).getTime() : 0;
    if (!previous || rowTime >= previousTime) {
      latestRows.set(latestKey, row);
    }

    const total =
      coerceNumber(row?.rules_knowledge) +
      coerceNumber(row?.fouls_contact) +
      coerceNumber(row?.positive_attitude) +
      coerceNumber(row?.communication) +
      coerceNumber(row?.self_control);

    const matchBucket = grouped.get(matchId) || new Map();
    const teamBucket = matchBucket.get(ratedTeamId) || { total: 0, count: 0 };
    teamBucket.total += total;
    teamBucket.count += 1;
    matchBucket.set(ratedTeamId, teamBucket);
    grouped.set(matchId, matchBucket);
  });

  return { grouped, latestRows };
}

export async function getTournamentOverview(eventId, options = {}) {
  if (!eventId) {
    return {
      matches: [],
      summary: {
        totalMatches: 0,
        completedMatches: 0,
        liveMatches: 0,
        scheduledMatches: 0,
        confirmedMatches: 0,
        averageSpiritScore: null,
        uniqueTeamCount: 0,
      },
    };
  }

  const { forceRefresh = false } = options;

  return getCachedQuery(
    `tournament-director:overview:${eventId}`,
    async () => {
      const { data: matches, error: matchesError } = await supabase
        .from("matches")
        .select(TOURNAMENT_OVERVIEW_MATCH_FIELDS)
        .eq("event_id", eventId)
        .order("start_time", { ascending: true, nullsFirst: false });

      if (matchesError) {
        throw new Error(matchesError.message || "Failed to load tournament overview matches.");
      }

      const matchRows = Array.isArray(matches) ? matches : [];
      const matchIds = matchRows.map((match) => match.id).filter(Boolean);

      let spiritRows = [];
      if (matchIds.length > 0) {
        const { data, error } = await supabase
          .from("spirit_scores")
          .select(
            "match_id, rated_team_id, rules_knowledge, fouls_contact, positive_attitude, communication, self_control, submitted_at",
          )
          .in("match_id", matchIds);

        if (error) {
          throw new Error(error.message || "Failed to load spirit score data.");
        }

        spiritRows = Array.isArray(data) ? data : [];
      }

      const { grouped: spiritLookup, latestRows: latestSpiritRows } = buildSpiritLookup(spiritRows);
      const liveStatuses = new Set(["live", "halftime", "in_progress", "in progress", "initialized"]);
      const completedStatuses = new Set(["finished", "completed", "final"]);
      const uniqueTeams = new Set();

      const rows = matchRows.map((match) => {
        if (match?.team_a?.id) uniqueTeams.add(match.team_a.id);
        if (match?.team_b?.id) uniqueTeams.add(match.team_b.id);

        const spiritSummary = spiritLookup.get(match.id) || null;
        const teamABucket = match?.team_a?.id ? spiritSummary?.get(match.team_a.id) || null : null;
        const teamBBucket = match?.team_b?.id ? spiritSummary?.get(match.team_b.id) || null : null;
        const spiritScoreA =
          teamABucket && teamABucket.count > 0
            ? Number((teamABucket.total / teamABucket.count).toFixed(1))
            : null;
        const spiritScoreB =
          teamBBucket && teamBBucket.count > 0
            ? Number((teamBBucket.total / teamBBucket.count).toFixed(1))
            : null;
        const latestSpiritA =
          match?.team_a?.id ? latestSpiritRows.get(`${match.id}:${match.team_a.id}`) || null : null;
        const latestSpiritB =
          match?.team_b?.id ? latestSpiritRows.get(`${match.id}:${match.team_b.id}`) || null : null;

        return {
          ...match,
          displayTeamA: getDisplayTeamName(match.team_a),
          displayTeamB: getDisplayTeamName(match.team_b),
          displayVenue: match?.venue?.name || "Unassigned",
          spiritScoreA,
          spiritScoreB,
          spiritCategoriesA: getSpiritCategoryValues(latestSpiritA),
          spiritCategoriesB: getSpiritCategoryValues(latestSpiritB),
          spiritSubmissionCountA: teamABucket?.count || 0,
          spiritSubmissionCountB: teamBBucket?.count || 0,
        };
      });

      const summary = rows.reduce(
        (acc, match) => {
          acc.totalMatches += 1;

          const normalizedStatus = typeof match.status === "string" ? match.status.trim().toLowerCase() : "";
          if (completedStatuses.has(normalizedStatus)) {
            acc.completedMatches += 1;
          } else if (liveStatuses.has(normalizedStatus)) {
            acc.liveMatches += 1;
          } else {
            acc.scheduledMatches += 1;
          }

          if (match.captains_confirmed) {
            acc.confirmedMatches += 1;
          }

          if (typeof match.spiritScoreA === "number") {
            acc.spiritScoreTotal += match.spiritScoreA;
            acc.spiritScoreCount += 1;
          }
          if (typeof match.spiritScoreB === "number") {
            acc.spiritScoreTotal += match.spiritScoreB;
            acc.spiritScoreCount += 1;
          }

          return acc;
        },
        {
          totalMatches: 0,
          completedMatches: 0,
          liveMatches: 0,
          scheduledMatches: 0,
          confirmedMatches: 0,
          spiritScoreTotal: 0,
          spiritScoreCount: 0,
        },
      );

      return {
        matches: rows,
        summary: {
          totalMatches: summary.totalMatches,
          completedMatches: summary.completedMatches,
          liveMatches: summary.liveMatches,
          scheduledMatches: summary.scheduledMatches,
          confirmedMatches: summary.confirmedMatches,
          averageSpiritScore:
            summary.spiritScoreCount > 0
              ? Number((summary.spiritScoreTotal / summary.spiritScoreCount).toFixed(1))
              : null,
          uniqueTeamCount: uniqueTeams.size,
        },
      };
    },
    forceRefresh
      ? { ttlMs: 0, staleWhileRevalidate: false, forceRefresh: true }
      : { ttlMs: TOURNAMENT_OVERVIEW_CACHE_TTL_MS },
  );
}

export function invalidateTournamentOverview(eventId) {
  if (!eventId) return;
  invalidateCachedQueries(`tournament-director:overview:${eventId}`);
}
