import {
  createBracket,
  createBracketNode,
  updateBracketNode,
  deleteBracket,
  deleteBracketNode,
} from "./playoffStructureService";

// Resolve a template source into the pass-1 payload written at node creation.
// - seed   -> the concrete pool_rank payload the caller supplied in `seedMap`.
// - winner -> placeholder {} (wired in pass 2 once real node ids exist).
// - loser  -> placeholder {} (wired in pass 2).
function resolvePass1Source(source, seedMap) {
  if (!source || typeof source !== "object") {
    return {};
  }
  if (source.kind === "seed") {
    const payload = seedMap?.[source.seed];
    if (!payload) {
      throw new Error(`No seed mapping provided for seed ${source.seed}.`);
    }
    return payload;
  }
  // winner / loser sources are node references — resolved in pass 2.
  return {};
}

function isNodeRefSource(source) {
  return source?.kind === "winner" || source?.kind === "loser";
}

// Build the winner/loser source payload wired in pass 2, matching the runtime
// shape produced by buildSourcePayload (PlayoffStructurePage) and consumed by
// resolveMatchOutcomeSource (playoffStructureService).
function buildNodeRefSource(source, keyToId, nodesByKey) {
  const targetId = keyToId.get(source.node);
  const targetNode = nodesByKey.get(source.node);
  if (!targetId) {
    throw new Error(`Template references unknown node key "${source.node}".`);
  }
  return {
    type: source.kind, // "winner" | "loser"
    nodeId: targetId,
    nodeName: targetNode?.name || "",
    matchId: null,
  };
}

// Instantiate a bracket template against a real event.
//
// Args:
//   eventId      - the event to create the bracket under
//   template     - a BracketTemplate from bracketTemplates.js
//   bracketName  - optional override; defaults to template.label
//   bracketType  - optional override; defaults to template.bracketType
//   seedMap      - { [seedNumber]: poolRankPayload } already resolved by the
//                  caller (e.g. via the page's buildSourcePayload pool_rank branch)
//
// Two passes with best-effort rollback (no DB transaction spans these calls):
//   pass 1: create every node (seed sources filled, node-ref sources blank)
//   pass 2: wire winner/loser sources + advancement FKs to the created ids
// On any failure, created nodes (reverse order) then the bracket are deleted.
export async function instantiateTemplate({
  eventId,
  template,
  bracketName,
  bracketType,
  seedMap,
}) {
  if (!eventId) {
    throw new Error("An event is required to apply a template.");
  }
  if (!template || !Array.isArray(template.nodes) || !template.nodes.length) {
    throw new Error("Invalid template.");
  }

  const nodesByKey = new Map(template.nodes.map((node) => [node.key, node]));

  const bracket = await createBracket({
    eventId,
    name: (bracketName || template.label || "Bracket").trim(),
    type: bracketType || template.bracketType || "single_elim",
    isLocked: false,
  });
  if (!bracket?.id) {
    throw new Error("Failed to create the bracket.");
  }

  const keyToId = new Map();
  const createdNodeIds = [];

  try {
    // Pass 1 — create all nodes.
    for (const node of template.nodes) {
      const created = await createBracketNode({
        bracketId: bracket.id,
        name: node.name || null,
        round: node.round,
        position: node.position,
        matchId: null,
        sourceA: resolvePass1Source(node.sourceA, seedMap),
        sourceB: resolvePass1Source(node.sourceB, seedMap),
        advanceToWinner: null,
        advanceToWinnerSide: null,
        advanceToLoser: null,
        advanceToLoserSide: null,
      });
      if (!created?.id) {
        throw new Error(`Failed to create node "${node.name || node.key}".`);
      }
      keyToId.set(node.key, created.id);
      createdNodeIds.push(created.id);
    }

    // Pass 2 — wire node-reference sources + advancement FKs.
    for (const node of template.nodes) {
      const patch = {};
      if (isNodeRefSource(node.sourceA)) {
        patch.sourceA = buildNodeRefSource(node.sourceA, keyToId, nodesByKey);
      }
      if (isNodeRefSource(node.sourceB)) {
        patch.sourceB = buildNodeRefSource(node.sourceB, keyToId, nodesByKey);
      }
      if (node.advanceWinnerTo) {
        patch.advanceToWinner = keyToId.get(node.advanceWinnerTo) || null;
        patch.advanceToWinnerSide = node.advanceWinnerSide || null;
      }
      if (node.advanceLoserTo) {
        patch.advanceToLoser = keyToId.get(node.advanceLoserTo) || null;
        patch.advanceToLoserSide = node.advanceLoserSide || null;
      }
      if (Object.keys(patch).length) {
        await updateBracketNode(keyToId.get(node.key), patch);
      }
    }

    return { bracket, nodeCount: createdNodeIds.length };
  } catch (error) {
    // Best-effort rollback: remove downstream nodes first (reverse creation
    // order) to avoid self-FK reference guards, then the bracket.
    for (const nodeId of [...createdNodeIds].reverse()) {
      try {
        await deleteBracketNode(nodeId);
      } catch {
        // Swallow — we surface the original error below.
      }
    }
    try {
      await deleteBracket(bracket.id);
    } catch {
      // Swallow — orphan bracket can be removed manually if this also fails.
    }
    throw new Error(
      `Template apply failed and was rolled back: ${error?.message || "unknown error"}`,
    );
  }
}
