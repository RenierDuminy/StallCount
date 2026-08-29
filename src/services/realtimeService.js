import { supabase } from "./supabaseClient";
import { fromSupabaseError } from "../utils/errorMessages";

/**
 * Update a match score.
 * Throws if the write fails so callers can surface an error to the operator.
 *
 * The `.select()` is load-bearing: an UPDATE whose RLS USING clause matches no
 * row is not an error. Postgres reports zero rows affected and supabase-js
 * returns `{ error: null }`, so a bare update() returned cleanly while writing
 * nothing — the operator saw the score move, the offline queue treated the
 * retry as successful and dropped the item, and the point was lost for good.
 * Selecting the row back turns an RLS denial into a thrown error.
 */
export async function updateScore(matchId, newScoreA, newScoreB) {
  const { data, error } = await supabase
    .from("matches")
    .update({ score_a: newScoreA, score_b: newScoreB })
    .eq("id", matchId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw fromSupabaseError(error, "Failed to update match score");
  }

  if (!data) {
    throw new Error(
      "Score update was rejected: you do not have permission to update this match, or it no longer exists."
    );
  }
}
