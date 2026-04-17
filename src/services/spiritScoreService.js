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
