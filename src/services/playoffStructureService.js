import { supabase } from "./supabaseClient";
import { getMatchesByIds, updateMatchParticipants } from "./matchService";

const BRACKET_FIELDS = "id, event_id, name, type, is_locked, created_at";
const BRACKET_NODE_FIELDS = "*";
const FINISHED_MATCH_STATUSES = new Set(["finished", "completed"]);

function normalizeLookupText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function formatNodeFallbackLabel(node) {
  return `Round ${node?.round ?? "--"} / Position ${node?.position ?? "--"}`;
}

function getNodeDisplayName(node) {
  const explicitName = typeof node?.name === "string" ? node.name.trim() : "";
  return explicitName || formatNodeFallbackLabel(node);
}

function formatAdvanceTarget(targetId, side, nodeLookup = new Map()) {
  if (!targetId) return null;
  const sideLabel = side ? ` (${String(side).toUpperCase()} side)` : "";
  const targetNode = nodeLookup.get(targetId);
  const targetLabel = targetNode ? getNodeDisplayName(targetNode) : targetId;
  return `${targetLabel}${sideLabel}`;
}

function getEntryRows(entry) {
  if (Array.isArray(entry?.rows)) {
    return entry.rows;
  }
  if (Array.isArray(entry)) {
    return entry;
  }
  return [];
}

function isEntryReady(entry) {
  if (entry && typeof entry === "object" && "ready" in entry) {
    return entry.ready !== false;
  }
  return true;
}

function resolvePoolRankSource(source, standingsIndex = {}) {
  const rankValue = Number(source?.rank ?? source?.seed);
  if (!Number.isInteger(rankValue) || rankValue < 1) {
    return {
      resolved: false,
      reason: "invalid rank",
    };
  }

  const poolId = source?.poolId || source?.pool_id || null;
  const divisionId = source?.divisionId || source?.division_id || null;
  const poolKey = normalizeLookupText(source?.poolName || source?.poolLabel || "");
  const divisionKey = normalizeLookupText(source?.divisionName || source?.divisionLabel || "");
  const scopedPoolKey = poolKey && divisionKey ? `${divisionKey}::${poolKey}` : "";

  const candidates = [
    poolId ? standingsIndex?.poolsById?.[poolId] : null,
    scopedPoolKey ? standingsIndex?.poolsByScopedName?.[scopedPoolKey] : null,
    poolKey ? standingsIndex?.poolsByName?.[poolKey] : null,
    divisionId ? standingsIndex?.divisionsById?.[divisionId] : null,
    divisionKey ? standingsIndex?.divisionsByName?.[divisionKey] : null,
  ].filter(Boolean);

  const entry = candidates[0] || null;
  if (!entry) {
    return {
      resolved: false,
      reason: "standings source not found",
    };
  }

  if (!isEntryReady(entry)) {
    return {
      resolved: false,
      reason: "source matches not complete",
    };
  }

  const rows = getEntryRows(entry);
  const team = rows[rankValue - 1] || null;
  if (!team?.id) {
    return {
      resolved: false,
      reason: `rank ${rankValue} not available`,
    };
  }

  return {
    resolved: true,
    teamId: team.id,
    teamName: team.name || team.shortName || `Rank ${rankValue}`,
  };
}

function resolveStaticTeamSource(source) {
  const teamId = source?.teamId || source?.team_id || null;
  if (!teamId) {
    return {
      resolved: false,
      reason: "static team source missing team id",
    };
  }

  return {
    resolved: true,
    teamId,
    teamName: source?.teamName || source?.teamLabel || "Team",
  };
}

function resolveMatchOutcomeSource(source, nodeLookup = new Map(), outcome = "winner") {
  const nodeId = source?.nodeId || source?.node_id || null;
  const matchId = source?.matchId || source?.match_id || null;
  let targetNode = null;

  if (nodeId) {
    targetNode = nodeLookup.get(nodeId) || null;
  } else if (matchId) {
    targetNode =
      Array.from(nodeLookup.values()).find((node) => node?.match_id === matchId) || null;
  }

  const match = targetNode?.match || null;
  const status = (match?.status || "").toString().trim().toLowerCase();
  if (!match || !FINISHED_MATCH_STATUSES.has(status)) {
    return {
      resolved: false,
      reason: "source match not complete",
    };
  }

  if (typeof match.score_a !== "number" || typeof match.score_b !== "number") {
    return {
      resolved: false,
      reason: "source match score missing",
    };
  }

  if (match.score_a === match.score_b) {
    return {
      resolved: false,
      reason: "source match is tied",
    };
  }

  const winner = match.score_a > match.score_b ? match.team_a : match.team_b;
  const loser = match.score_a > match.score_b ? match.team_b : match.team_a;
  const team = outcome === "winner" ? winner : loser;

  if (!team?.id) {
    return {
      resolved: false,
      reason: "source match participants missing",
    };
  }

  return {
    resolved: true,
    teamId: team.id,
    teamName: team.name || team.short_name || "Team",
  };
}

function resolveBracketSource(source, context = {}) {
  if (!source || typeof source !== "object") {
    return {
      resolved: false,
      reason: "source missing",
    };
  }

  const type = String(source.type || "").trim().toLowerCase();
  if (type === "pool_rank") {
    return resolvePoolRankSource(source, context.standingsIndex);
  }
  if (type === "static_team") {
    return resolveStaticTeamSource(source);
  }
  if (type === "winner" || type === "match_winner") {
    return resolveMatchOutcomeSource(source, context.nodeLookup, "winner");
  }
  if (type === "loser" || type === "match_loser") {
    return resolveMatchOutcomeSource(source, context.nodeLookup, "loser");
  }

  return {
    resolved: false,
    reason: `unsupported source type: ${type || "unknown"}`,
  };
}

export async function getBracketsByEvent(eventId) {
  if (!eventId) {
    return [];
  }

  const { data: bracketRows, error: bracketError } = await supabase
    .from("brackets")
    .select(BRACKET_FIELDS)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (bracketError) {
    throw new Error(bracketError.message || "Failed to load brackets.");
  }

  const brackets = Array.isArray(bracketRows) ? bracketRows : [];
  if (!brackets.length) {
    return [];
  }

  const bracketIds = brackets.map((bracket) => bracket.id).filter(Boolean);
  const { data: nodeRows, error: nodeError } = await supabase
    .from("bracket_nodes")
    .select(BRACKET_NODE_FIELDS)
    .in("bracket_id", bracketIds);

  if (nodeError) {
    throw new Error(nodeError.message || "Failed to load bracket nodes.");
  }

  const nodes = Array.isArray(nodeRows) ? nodeRows : [];
  const linkedMatchIds = Array.from(
    new Set(
      nodes
        .map((node) => node.match_id)
        .filter((matchId) => typeof matchId === "string" && matchId),
    ),
  );
  const linkedMatches = await getMatchesByIds(linkedMatchIds);
  const matchLookup = new Map((linkedMatches || []).map((match) => [match.id, match]));
  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));

  return brackets.map((bracket) => ({
    ...bracket,
    nodes: nodes
      .filter((node) => node.bracket_id === bracket.id)
      .sort(
        (left, right) =>
          (left.round ?? Number.MAX_SAFE_INTEGER) - (right.round ?? Number.MAX_SAFE_INTEGER) ||
          (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER),
      )
      .map((node) => ({
        ...node,
        match: node.match_id ? matchLookup.get(node.match_id) || null : null,
        winnerTargetLabel: formatAdvanceTarget(
          node.advance_to_winner,
          node.advance_to_winner_side,
          nodeLookup,
        ),
        loserTargetLabel: formatAdvanceTarget(
          node.advance_to_loser,
          node.advance_to_loser_side,
          nodeLookup,
        ),
      })),
  }));
}

export async function createBracket(payload = {}) {
  const insertPayload = {
    event_id: payload.eventId,
    name: payload.name,
    type: payload.type,
    is_locked: Boolean(payload.isLocked),
  };

  const { data, error } = await supabase
    .from("brackets")
    .insert(insertPayload)
    .select(BRACKET_FIELDS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to create bracket.");
  }

  return data || null;
}

export async function updateBracket(bracketId, payload = {}) {
  if (!bracketId) {
    throw new Error("Bracket ID is required.");
  }

  const updatePayload = {};
  if ("name" in payload) updatePayload.name = payload.name;
  if ("type" in payload) updatePayload.type = payload.type;
  if ("isLocked" in payload) updatePayload.is_locked = Boolean(payload.isLocked);

  const { data, error } = await supabase
    .from("brackets")
    .update(updatePayload)
    .eq("id", bracketId)
    .select(BRACKET_FIELDS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to update bracket.");
  }

  return data || null;
}

export async function deleteBracket(bracketId) {
  if (!bracketId) {
    throw new Error("Bracket ID is required.");
  }

  const { error } = await supabase
    .from("brackets")
    .delete()
    .eq("id", bracketId);

  if (error) {
    throw new Error(error.message || "Failed to delete bracket.");
  }
}

export async function createBracketNode(payload = {}) {
  const insertPayload = {
    bracket_id: payload.bracketId,
    name: payload.name || null,
    round: payload.round,
    position: payload.position,
    match_id: payload.matchId || null,
    source_a: payload.sourceA || {},
    source_b: payload.sourceB || {},
    advance_to_winner: payload.advanceToWinner || null,
    advance_to_winner_side: payload.advanceToWinnerSide || null,
    advance_to_loser: payload.advanceToLoser || null,
    advance_to_loser_side: payload.advanceToLoserSide || null,
  };

  const { data, error } = await supabase
    .from("bracket_nodes")
    .insert(insertPayload)
    .select(BRACKET_NODE_FIELDS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to create bracket node.");
  }

  return data || null;
}

export async function updateBracketNode(nodeId, payload = {}) {
  if (!nodeId) {
    throw new Error("Bracket node ID is required.");
  }

  const updatePayload = {};
  if ("name" in payload) updatePayload.name = payload.name || null;
  if ("round" in payload) updatePayload.round = payload.round;
  if ("position" in payload) updatePayload.position = payload.position;
  if ("matchId" in payload) updatePayload.match_id = payload.matchId || null;
  if ("sourceA" in payload) updatePayload.source_a = payload.sourceA || {};
  if ("sourceB" in payload) updatePayload.source_b = payload.sourceB || {};
  if ("advanceToWinner" in payload) updatePayload.advance_to_winner = payload.advanceToWinner || null;
  if ("advanceToWinnerSide" in payload) {
    updatePayload.advance_to_winner_side = payload.advanceToWinnerSide || null;
  }
  if ("advanceToLoser" in payload) updatePayload.advance_to_loser = payload.advanceToLoser || null;
  if ("advanceToLoserSide" in payload) {
    updatePayload.advance_to_loser_side = payload.advanceToLoserSide || null;
  }

  const { data, error } = await supabase
    .from("bracket_nodes")
    .update(updatePayload)
    .eq("id", nodeId)
    .select(BRACKET_NODE_FIELDS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to update bracket node.");
  }

  return data || null;
}

export async function deleteBracketNode(nodeId) {
  if (!nodeId) {
    throw new Error("Bracket node ID is required.");
  }

  const { error } = await supabase
    .from("bracket_nodes")
    .delete()
    .eq("id", nodeId);

  if (error) {
    throw new Error(error.message || "Failed to delete bracket node.");
  }
}

export async function resolveBracketMatchesForEvent({ eventId, standingsIndex, brackets }) {
  const structure = Array.isArray(brackets) ? brackets : await getBracketsByEvent(eventId);
  const flatNodes = structure.flatMap((bracket) => bracket?.nodes || []);
  const nodeLookup = new Map(flatNodes.map((node) => [node.id, node]));
  const updates = [];
  const skipped = [];

  for (const node of flatNodes) {
    const nodeName = getNodeDisplayName(node);

    if (!node?.match_id) {
      skipped.push({
        nodeId: node.id,
        nodeName,
        reason: "node has no linked match",
      });
      continue;
    }

    const sourceA = resolveBracketSource(node.source_a, { standingsIndex, nodeLookup });
    const sourceB = resolveBracketSource(node.source_b, { standingsIndex, nodeLookup });

    if (!sourceA.resolved || !sourceB.resolved) {
      const reasons = [sourceA.reason, sourceB.reason].filter(Boolean).join(" | ");
      skipped.push({
        nodeId: node.id,
        nodeName,
        reason: reasons || "unable to resolve bracket sources",
      });
      continue;
    }

    if (sourceA.teamId === sourceB.teamId) {
      skipped.push({
        nodeId: node.id,
        nodeName,
        reason: "resolved teams are identical",
      });
      continue;
    }

    const alreadyAssigned =
      node.match?.team_a?.id === sourceA.teamId && node.match?.team_b?.id === sourceB.teamId;

    if (alreadyAssigned) {
      skipped.push({
        nodeId: node.id,
        nodeName,
        reason: "match already assigned",
      });
      continue;
    }

    const updatedMatch = await updateMatchParticipants(node.match_id, {
      teamAId: sourceA.teamId,
      teamBId: sourceB.teamId,
    });

    updates.push({
      nodeId: node.id,
      nodeName,
      matchId: node.match_id,
      teamAId: sourceA.teamId,
      teamAName: sourceA.teamName,
      teamBId: sourceB.teamId,
      teamBName: sourceB.teamName,
      match: updatedMatch,
    });
  }

  return {
    brackets: structure,
    updatedCount: updates.length,
    updates,
    skipped,
  };
}

export async function clearBracketMatchAssignmentsForEvent({ eventId, brackets }) {
  const structure = Array.isArray(brackets) ? brackets : await getBracketsByEvent(eventId);
  const flatNodes = structure.flatMap((bracket) => bracket?.nodes || []);
  const cleared = [];
  const skipped = [];

  for (const node of flatNodes) {
    const nodeName = getNodeDisplayName(node);

    if (!node?.match_id) {
      skipped.push({
        nodeId: node.id,
        nodeName,
        reason: "node has no linked match",
      });
      continue;
    }

    const hasAssignedTeams = Boolean(node.match?.team_a?.id || node.match?.team_b?.id);
    if (!hasAssignedTeams) {
      skipped.push({
        nodeId: node.id,
        nodeName,
        reason: "match already clear",
      });
      continue;
    }

    const updatedMatch = await updateMatchParticipants(node.match_id, {
      teamAId: null,
      teamBId: null,
    });

    cleared.push({
      nodeId: node.id,
      nodeName,
      matchId: node.match_id,
      match: updatedMatch,
    });
  }

  return {
    brackets: structure,
    clearedCount: cleared.length,
    cleared,
    skipped,
  };
}
