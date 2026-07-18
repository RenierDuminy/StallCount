// Shared formatting/layout helpers for the playoff structure page and the
// visual BracketCanvas. Extracted verbatim from PlayoffStructurePage.jsx so both
// surfaces share one implementation instead of drifting copies.

function normalizeText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function formatMatchStatus(value) {
  if (!value) return "Unknown";
  return String(value)
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatNodeFallbackLabel(node) {
  return `Round ${node?.round ?? "--"} / Position ${node?.position ?? "--"}`;
}

export function getNodeDisplayName(node) {
  const name = typeof node?.name === "string" ? node.name.trim() : "";
  return name || formatNodeFallbackLabel(node);
}

export function getTeamDisplayName(team) {
  if (!team || typeof team !== "object") return "TBD";
  return team.name || team.short_name || team.shortName || "TBD";
}

export function formatMatchup(match) {
  const left = getTeamDisplayName(match?.team_a);
  const right = getTeamDisplayName(match?.team_b);
  return `${left} vs ${right}`;
}

export function formatSourceLabel(source, lookups = {}) {
  if (!source || typeof source !== "object") {
    return "Source missing";
  }

  const type = normalizeText(source.type);
  if (type === "pool_rank") {
    const poolId = source.poolId || source.pool_id || "";
    const divisionId = source.divisionId || source.division_id || "";
    const rank = source.rank || source.seed || "?";
    const pool = lookups.poolById?.get(poolId) || null;
    const division = lookups.divisionById?.get(divisionId) || null;
    const label =
      pool?.name ||
      source.poolName ||
      source.pool_name ||
      division?.name ||
      source.divisionName ||
      source.division_name ||
      "Standings";
    return `${label} #${rank}`;
  }

  if (type === "winner" || type === "match_winner") {
    const nodeId = source.nodeId || source.node_id || "";
    const node = lookups.nodeById?.get(nodeId) || null;
    return `Winner of ${node ? getNodeDisplayName(node) : "node"}`;
  }

  if (type === "loser" || type === "match_loser") {
    const nodeId = source.nodeId || source.node_id || "";
    const node = lookups.nodeById?.get(nodeId) || null;
    return `Loser of ${node ? getNodeDisplayName(node) : "node"}`;
  }

  if (type === "static_team") {
    const teamId = source.teamId || source.team_id || "";
    const team = lookups.teamById?.get(teamId) || null;
    return team?.name || team?.short_name || source.teamName || source.team_name || "Static team";
  }

  return `Unsupported source: ${source.type || "unknown"}`;
}

// Resolve where a node's winner / loser advances to, as a display string.
export function formatAdvancementTarget(nodeId, side, lookups = {}) {
  if (!nodeId) return "";
  const target = lookups.nodeById?.get(nodeId) || null;
  const name = target ? getNodeDisplayName(target) : "node";
  const sideLabel = side ? ` (${String(side).toUpperCase()})` : "";
  return `${name}${sideLabel}`;
}

// Coerce a round/position value to a finite number. The DB (via PostgREST) can
// hand these back as numeric strings, so Number.isFinite alone would reject
// "2" and silently collapse every node into round 0 / position 0.
function toFiniteNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

// Group a bracket's nodes into ordered round columns for the wide-screen view.
// Rounds sort ascending; nodes within a round sort by position then name.
export function groupNodesByRound(nodes = []) {
  const byRound = new Map();
  for (const node of nodes) {
    const round = toFiniteNumber(node?.round, 0);
    if (!byRound.has(round)) {
      byRound.set(round, []);
    }
    byRound.get(round).push(node);
  }
  return Array.from(byRound.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([round, roundNodes]) => ({
      round,
      nodes: roundNodes
        .slice()
        .sort(
          (a, b) =>
            toFiniteNumber(a.position, 0) - toFiniteNumber(b.position, 0) ||
            getNodeDisplayName(a).localeCompare(getNodeDisplayName(b)),
        ),
    }));
}

export function roundColumnLabel(round, totalRounds, index) {
  // Best-effort human label for a round column, keyed off distance from the
  // final round (which is typically the last column).
  const fromEnd = totalRounds - 1 - index;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${round}`;
}

// Compute the round/position a new node would take if added to a given column.
// `roundValue` is the round number the column represents (1-based). Position is
// one past the highest existing position in that round (or 1 for a new column).
export function nextSlotForColumn(nodes = [], roundValue) {
  const requested = toFiniteNumber(roundValue, 1);
  const round = Number.isInteger(requested) && requested >= 1 ? requested : 1;
  const inRound = (nodes || []).filter(
    (node) => toFiniteNumber(node?.round, 1) === round,
  );
  const maxPosition = inRound.reduce(
    (max, node) => Math.max(max, toFiniteNumber(node?.position, 0)),
    0,
  );
  return { round, position: maxPosition + 1 };
}
