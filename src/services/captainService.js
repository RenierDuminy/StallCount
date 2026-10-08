import { supabase } from "./supabaseClient";
import { invalidateCachedQueries } from "../utils/queryCache";
import { fromSupabaseError } from "../utils/errorMessages";
import { isConcludedStatus } from "../constants/statusCodes";
import { dedupeSpiritRows } from "../utils/spirit";

/**
 * Captain portal data access.
 *
 * Reads go straight to the tables (public RLS allows them). Both writes go
 * through SECURITY DEFINER functions (see
 * supabase/migrations/20261007000000_captain_match_confirmation.sql) because
 * captains hold no match permissions and RLS would reject a direct insert. The
 * functions — not this file — enforce team access and the confirmation lock;
 * the helpers below only mirror those rules so the UI can explain them.
 *
 * Deliberately uncached: a captain confirms and immediately expects to see the
 * other side's state, and the lists are one team's fixtures in one event.
 */

const CAPTAIN_MATCH_FIELDS = `
  id,
  event_id,
  division_id,
  pool_id,
  start_time,
  status,
  score_a,
  score_b,
  captains_confirmed,
  confirmed_at,
  team_a_confirmed_at,
  team_b_confirmed_at,
  venue:venues!matches_venue_id_fkey (id, name),
  team_a:teams!matches_team_a_fkey (id, name, short_name),
  team_b:teams!matches_team_b_fkey (id, name, short_name)
`;

const SPIRIT_FIELDS =
  "id, match_id, rated_team_id, rules_knowledge, fouls_contact, self_control, positive_attitude, communication, total, comments, submitted_at, is_final";

/** Every match `teamId` plays in `eventId`, kick-off order. */
export async function getTeamMatchesForEvent(eventId, teamId) {
  if (!eventId || !teamId) return [];

  const { data, error } = await supabase
    .from("matches")
    .select(CAPTAIN_MATCH_FIELDS)
    .eq("event_id", eventId)
    .or(`team_a.eq.${teamId},team_b.eq.${teamId}`)
    .order("start_time", { ascending: true, nullsFirst: false });

  if (error) {
    throw fromSupabaseError(error, "Unable to load your team's matches.");
  }
  return data ?? [];
}

/**
 * Latest final spirit row per (match, rated team) for the given matches, as a
 * Map keyed `${matchId}:${ratedTeamId}`. Collapsing duplicates the same way as
 * the public spirit tables keeps the portal showing what those pages count.
 */
export async function getSpiritScoresForMatches(matchIds) {
  const ids = (matchIds || []).filter(Boolean);
  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from("spirit_scores")
    .select(SPIRIT_FIELDS)
    .in("match_id", ids)
    .eq("is_final", true);

  if (error) {
    throw fromSupabaseError(error, "Unable to load spirit scores.");
  }

  const byKey = new Map();
  dedupeSpiritRows(data ?? []).forEach((row) => {
    byKey.set(`${row.match_id}:${row.rated_team_id}`, row);
  });
  return byKey;
}

function invalidateAfterCaptainWrite(match) {
  if (match?.event_id) {
    invalidateCachedQueries(`matches:event:${match.event_id}`);
    invalidateCachedQueries(`spirit-scores:event:${match.event_id}`);
  }
  invalidateCachedQueries("matches:recent");
  invalidateCachedQueries("teams:matches");
}

/**
 * Save the spirit score `actingTeamId` gives its opponent. Updates the existing
 * row if there is one, so "add" and "update" are the same call.
 *
 * @param {object} match  needs `id` and `event_id`
 * @param {string} actingTeamId  the captain's own team
 * @param {{rules_knowledge:number, fouls_contact:number, self_control:number,
 *          positive_attitude:number, communication:number, comments?:string}} scores
 */
export async function saveCaptainSpiritScore(match, actingTeamId, scores) {
  const { data, error } = await supabase.rpc("captain_save_spirit_score", {
    target_match_id: match.id,
    acting_team_id: actingTeamId,
    p_rules_knowledge: scores.rules_knowledge,
    p_fouls_contact: scores.fouls_contact,
    p_self_control: scores.self_control,
    p_positive_attitude: scores.positive_attitude,
    p_communication: scores.communication,
    p_comments: scores.comments ?? null,
  });

  if (error) {
    throw fromSupabaseError(error, "Unable to save the spirit score.");
  }
  invalidateAfterCaptainWrite(match);
  return data;
}

/** Confirm the result on behalf of `actingTeamId`. Returns the new confirmation state. */
export async function confirmMatchResult(match, actingTeamId) {
  const { data, error } = await supabase.rpc("captain_confirm_match_result", {
    target_match_id: match.id,
    acting_team_id: actingTeamId,
  });

  if (error) {
    throw fromSupabaseError(error, "Unable to confirm the result.");
  }
  invalidateAfterCaptainWrite(match);
  return Array.isArray(data) ? data[0] ?? null : data;
}

/** Which side of the match `teamId` is on: "a", "b", or null. */
export function teamSideOf(match, teamId) {
  if (!match || !teamId) return null;
  if (String(match.team_a?.id) === String(teamId)) return "a";
  if (String(match.team_b?.id) === String(teamId)) return "b";
  return null;
}

/**
 * Everything the portal needs to render one match from `teamId`'s point of
 * view. Mirrors the checks in the SQL functions; the server stays authoritative.
 */
export function describeCaptainMatch(match, teamId, spiritByKey) {
  const side = teamSideOf(match, teamId);
  const own = side === "a" ? match.team_a : match.team_b;
  const opponent = side === "a" ? match.team_b : match.team_a;
  const ownScore = side === "a" ? match.score_a : match.score_b;
  const opponentScore = side === "a" ? match.score_b : match.score_a;

  const ownConfirmedAt = side === "a" ? match.team_a_confirmed_at : match.team_b_confirmed_at;
  const opponentConfirmedAt = side === "a" ? match.team_b_confirmed_at : match.team_a_confirmed_at;
  const fullyConfirmed = Boolean(match.captains_confirmed);

  const spiritGiven = opponent?.id ? spiritByKey?.get(`${match.id}:${opponent.id}`) ?? null : null;
  const spiritReceived = own?.id ? spiritByKey?.get(`${match.id}:${own.id}`) ?? null : null;

  const concluded = isConcludedStatus(match.status);
  const locked = fullyConfirmed || Boolean(ownConfirmedAt);

  let confirmBlocker = null;
  if (locked) confirmBlocker = null;
  else if (!opponent?.id) confirmBlocker = "Opponent not set yet";
  else if (!concluded) confirmBlocker = "Match not completed yet";
  else if (!spiritGiven) confirmBlocker = "Give your spirit score first";

  return {
    side,
    own,
    opponent,
    ownScore: Number.isFinite(ownScore) ? ownScore : 0,
    opponentScore: Number.isFinite(opponentScore) ? opponentScore : 0,
    ownConfirmedAt,
    opponentConfirmedAt,
    fullyConfirmed,
    concluded,
    locked,
    spiritGiven,
    spiritReceived,
    canEditSpirit: !locked && Boolean(opponent?.id),
    canConfirm: !locked && !confirmBlocker,
    confirmBlocker,
  };
}
