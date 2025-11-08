import { supabase } from "./supabaseClient";

/**
 * Update a match score.
 * Throws if the write fails so callers can surface an error to the operator.
 */
export async function updateScore(matchId, newScoreA, newScoreB) {
  const { error } = await supabase
    .from("matches")
    .update({ score_a: newScoreA, score_b: newScoreB })
    .eq("id", matchId);

  if (error) {
    throw new Error(error.message || "Failed to update match score");
  }
}
