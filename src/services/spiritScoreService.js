import { supabase } from "./supabaseClient";
import { latestFinalSpiritRows } from "../utils/spirit";

/**
 * The spirit scores already submitted for a match: the latest final row per
 * rated team (the same rows the public pages show), as a Map keyed by
 * rated_team_id. Empty when nothing has been submitted.
 */
export async function getSubmittedSpiritScores(matchId) {
  if (!matchId) return new Map();
  const { data, error } = await supabase
    .from("spirit_scores")
    .select(
      "id, match_id, rated_team_id, rules_knowledge, fouls_contact, self_control, positive_attitude, communication, comments, submitted_at, is_final",
    )
    .eq("match_id", matchId)
    .eq("is_final", true);
  if (error) {
    throw new Error(error.message || "Failed to load submitted spirit scores.");
  }
  return new Map(latestFinalSpiritRows(data ?? []).map((row) => [row.rated_team_id, row]));
}

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

  // Replace, never add: a (match, rated team) pair that already has a score
  // (from a captain, an earlier submission or a tournament director) has its
  // latest row updated. Inserting each time left several rows per pair, which
  // pages then averaged together.
  const { data: existingRows, error: loadError } = await supabase
    .from("spirit_scores")
    .select("id, rated_team_id, submitted_at")
    .eq("match_id", matchId)
    .in(
      "rated_team_id",
      rows.map((row) => row.rated_team_id),
    )
    .order("submitted_at", { ascending: false });

  if (loadError) {
    throw new Error(loadError.message || "Failed to load existing spirit scores.");
  }

  const latestIdByTeam = new Map();
  (existingRows || []).forEach((row) => {
    if (!latestIdByTeam.has(row.rated_team_id)) latestIdByTeam.set(row.rated_team_id, row.id);
  });

  const saved = [];
  for (const row of rows) {
    const existingId = latestIdByTeam.get(row.rated_team_id);
    const { data, error } = existingId
      ? await supabase
          .from("spirit_scores")
          .update({ ...row, submitted_at: new Date().toISOString() })
          .eq("id", existingId)
          .select("id")
      : await supabase.from("spirit_scores").insert(row).select("id");

    if (error) {
      throw new Error(error.message || "Failed to submit spirit scores.");
    }
    // An update refused by RLS succeeds with no rows; say so rather than
    // reporting a save that did not happen.
    if (!data?.length) {
      throw new Error("Spirit score was not saved: you may not have permission to change it.");
    }
    saved.push(...data);
  }

  return saved;
}

function normalizeSpiritCategoryScore(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const score = Number(value);
  if (!Number.isFinite(score)) {
    return null;
  }

  return Math.max(0, Math.min(5, Math.round(score)));
}

export async function saveTournamentDirectorSpiritScores(matchId, entries = []) {
  if (!matchId) {
    throw new Error("Match reference is required to update spirit scores.");
  }

  const normalizedEntries = (entries || [])
    .map((entry) => ({
      ratedTeamId: typeof entry?.ratedTeamId === "string" ? entry.ratedTeamId : "",
      scores: entry?.scores && typeof entry.scores === "object" ? entry.scores : null,
    }))
    .filter((entry) => entry.ratedTeamId && entry.scores);

  if (!normalizedEntries.length) {
    return [];
  }

  const teamIds = normalizedEntries.map((entry) => entry.ratedTeamId);
  const { data: existingRows, error: loadError } = await supabase
    .from("spirit_scores")
    .select("id, rated_team_id, submitted_at")
    .eq("match_id", matchId)
    .in("rated_team_id", teamIds)
    .order("submitted_at", { ascending: false });

  if (loadError) {
    throw new Error(loadError.message || "Failed to load existing spirit scores.");
  }

  const existingByTeam = new Map();
  (existingRows || []).forEach((row) => {
    if (!existingByTeam.has(row.rated_team_id)) {
      existingByTeam.set(row.rated_team_id, row);
    }
  });

  const savedRows = [];
  for (const entry of normalizedEntries) {
    const payload = {
      rules_knowledge: normalizeSpiritCategoryScore(entry.scores.rulesKnowledge),
      fouls_contact: normalizeSpiritCategoryScore(entry.scores.foulsContact),
      positive_attitude: normalizeSpiritCategoryScore(entry.scores.positiveAttitude),
      communication: normalizeSpiritCategoryScore(entry.scores.communication),
      self_control: normalizeSpiritCategoryScore(entry.scores.selfControl),
      is_final: true,
    };
    const existing = existingByTeam.get(entry.ratedTeamId);

    if (existing?.id) {
      const { data, error } = await supabase
        .from("spirit_scores")
        .update(payload)
        .eq("id", existing.id)
        .select("id")
        .maybeSingle();

      if (error) {
        throw new Error(error.message || "Failed to update spirit score.");
      }
      if (data) savedRows.push(data);
      continue;
    }

    const { data, error } = await supabase
      .from("spirit_scores")
      .insert({
        ...payload,
        match_id: matchId,
        rated_team_id: entry.ratedTeamId,
        submitted_by: null,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to create spirit score.");
    }
    if (data) savedRows.push(data);
  }

  return savedRows;
}
