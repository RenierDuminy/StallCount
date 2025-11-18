import { supabase } from "./supabaseClient";

export async function submitSpiritScores(matchId, entries, options = {}) {
  if (!matchId) {
    throw new Error("Match reference is required to submit spirit scores.");
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("At least one spirit score entry is required.");
  }

  const { submittedBy = null, isFinal = true } = options;

  const rows = entries.map((entry) => ({
    match_id: matchId,
    rated_team_id: entry.ratedTeamId,
    rules_knowledge: Number(entry.rulesKnowledge ?? 0),
    fouls_contact: Number(entry.fouls ?? 0),
    positive_attitude: Number(entry.positiveAttitude ?? 0),
    communication: Number(entry.communication ?? 0),
    self_control: Number(entry.fairness ?? 0),
    comments: entry.notes?.trim() ? entry.notes.trim() : null,
    submitted_by: submittedBy,
    is_final: isFinal,
  }));

  const { data, error } = await supabase.from("spirit_scores").insert(rows).select("id");

  if (error) {
    throw new Error(error.message || "Failed to submit spirit scores.");
  }

  return data ?? [];
}
