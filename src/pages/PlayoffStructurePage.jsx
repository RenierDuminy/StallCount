import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Chip,
  Field,
  Input,
  Panel,
  SectionHeader,
  SectionShell,
  Select,
} from "../components/ui/primitives";
import usePersistentState from "../hooks/usePersistentState";
import { useAuth } from "../context/AuthContext";
import { roleAssignmentsIncludeAdmin } from "../utils/accessControl";
import { getEventHierarchy, getEventsList } from "../services/leagueService";
import { createMatch, getMatchesByEvent, updateMatch } from "../services/matchService";
import {
  createBracket,
  createBracketNode,
  clearBracketMatchAssignmentsForEvent,
  deleteBracket,
  deleteBracketNode,
  createPlayoffSchedule,
  deletePlayoffSchedule,
  getBracketsByEvent,
  getEventAutoResolve,
  getPlayoffResolveStatus,
  getPlayoffSchedules,
  requestPlayoffResolve,
  setEventAutoResolve,
  updateBracket,
  updateBracketNode,
  updatePlayoffSchedule,
} from "../services/playoffStructureService";
import { instantiateTemplate } from "../services/bracketTemplateService";
import {
  DEFAULT_SWISS_OPTIONS,
  SWISS_FIRST_ROUND_PAIRINGS,
  SWISS_FORMATS,
  SWISS_MAX_MARGIN_CAP,
  SWISS_MAX_WINS_OR_LOSSES,
  SWISS_PAIRING_TIMING_OPTIONS,
  SWISS_TIEBREAK_OPTIONS,
  swissRoundCount,
  SWISS_MAX_TEAMS,
  SWISS_MIN_ROUNDS,
  SWISS_MIN_TEAMS,
  SWISS_TEMPLATE_ID,
  defaultSeedMap,
  getTemplateById,
  listTemplates,
  validateSwissOptions,
} from "../data/bracketTemplates";
import BracketCanvas from "./playoff/BracketCanvas";
import {
  formatAdvancementTarget,
  formatMatchStatus,
  formatMatchup,
  formatNodeFallbackLabel,
  formatSourceLabel,
  formatSwissSourceLabel,
  getNodeDisplayName,
  getNodeNote,
  isByeNode,
  nextSlotForColumn,
} from "./playoff/bracketFormat";
import { matchPath } from "../utils/links";

const PLAYOFF_STRUCTURE_EVENT_KEY = "stallcount.playoffStructure.eventId";
const MATCH_LIMIT = 400;
// Seeding and advancement now run server-side (api/_lib/playoffResolve.js), so
// the finished-status vocabulary that used to live here moved with them. The
// canonical list is exported from playoffStructureService for anything on the
// client that still needs it.
const BRACKET_TYPES = [
  { value: "placement", label: "Placement" },
  { value: "single_elim", label: "Single elimination" },
  { value: "double_elim", label: "Double elimination" },
  { value: "play_in", label: "Play-in" },
  { value: "swiss", label: "Swiss draw" },
];
const SOURCE_TYPES = [
  { value: "pool_rank", label: "Pool or division rank" },
  { value: "winner", label: "Winner of node" },
  { value: "loser", label: "Loser of node" },
  { value: "static_team", label: "Static team" },
  { value: "swiss", label: "Swiss pairing" },
  { value: "swiss_rank", label: "Swiss standings position" },
  { value: "swiss_bye", label: "Swiss bye (sits this round out)" },
  { value: "bye", label: "Bye (no opponent)" },
];
// Source types that describe a Swiss bye slot rather than a team.
const BYE_SOURCE_TYPES = new Set(["swiss_bye", "bye"]);
const SWISS_SIDE_OPTIONS = [
  { value: "A", label: "Higher-ranked team" },
  { value: "B", label: "Lower-ranked team" },
];
const SEED_SOURCE_OPTIONS = [
  { value: "pool", label: "Pool finishing positions" },
  { value: "team", label: "Chosen teams" },
  { value: "swiss", label: "Swiss draw standings" },
];
const SIDE_OPTIONS = [
  { value: "", label: "None" },
  { value: "A", label: "A side" },
  { value: "B", label: "B side" },
];
const LINKED_MATCH_STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "ready", label: "Ready" },
  { value: "pending", label: "Pending" },
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function formatEventDate(value) {
  if (!value) return "Date TBC";
  try {
    return new Intl.DateTimeFormat("en-ZA", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "Date TBC";
  }
}

function formatDateTime(value) {
  if (!value) return "Time TBC";
  try {
    return new Intl.DateTimeFormat("en-ZA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Time TBC";
  }
}

function parseDateTimeLocalInput(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Match start time is invalid.");
  }

  return date.toISOString();
}

function formatDateTimeLocalInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatBracketType(value) {
  if (!value) return "Unspecified";
  const known = BRACKET_TYPES.find((option) => option.value === value);
  if (known) {
    return known.label;
  }
  return String(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// Teams in a Swiss draw, read off its first round: two per game plus the bye.
function countSwissTeams(bracket) {
  const nodes = bracket?.nodes || [];
  const rounds = nodes.map((node) => Number(node.round)).filter(Number.isFinite);
  if (!rounds.length) return 0;
  const firstRound = Math.min(...rounds);
  return nodes
    .filter((node) => Number(node.round) === firstRound)
    .reduce((sum, node) => sum + (isByeNode(node) ? 1 : 2), 0);
}

// One line describing a Swiss draw's rules, from brackets.settings.swiss.
// Missing settings read as the defaults, matching api/_lib/swissDraw.js.
function describeSwissSettings(settings) {
  const swiss = settings?.swiss || {};
  const parts = [];
  parts.push(
    swiss.mode === "advance"
      ? `Advance at ${swiss.winsToAdvance || 3} wins, out at ${swiss.lossesToExit || 3} losses`
      : "Fixed rounds",
  );
  parts.push(
    swiss.tiebreak === "strength_of_schedule"
      ? "ties: strength of schedule, then point difference"
      : "ties: point difference",
  );
  if (Number(swiss.marginCap) > 0) parts.push(`margin capped at ${swiss.marginCap}`);
  parts.push(Number(swiss.pairingLag) === 1 ? "paired one round behind" : "paired after each round");
  return parts.join(" · ");
}

function formatMatchLabel(match) {
  const when = formatDateTime(match?.start_time);
  const status = formatMatchStatus(match?.status);
  return `${formatMatchup(match)} - ${when} - ${status}`;
}

function formatVenueLabel(venue) {
  if (!venue || typeof venue !== "object") {
    return "Venue";
  }

  const parts = [venue.city, venue.location, venue.name]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);

  return parts.length ? parts.join(", ") : "Venue";
}

// Release times are free date + time values. Since the instant-resolution
// migration (20261108136000) a check runs every minute, so a release fires
// within about a minute of its time; the 6-hourly sweep is only the backup.
// Times are the operator's local clock, stored as UTC.

/** Local date key (YYYY-MM-DD) for a timestamp, for the date input. */
function toDayInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local HH:mm for a timestamp, for the time input. */
function toTimeInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Status chips for one node: whether it is waiting on a scheduled time, blocked
 * on something the operator can fix, or missing the linked match it needs.
 *
 * A node with no match_id can never resolve — neither the setup wizard nor the
 * bracket templates attach one — so it is called out explicitly rather than
 * being silently skipped.
 */
function describeNodeResolveState(node, scheduled = null) {
  const chips = [];

  // A Swiss bye slot never has a match; flagging it would be a false alarm.
  if (!node?.match_id && !isByeNode(node)) {
    chips.push({
      key: "no-match",
      label: "No match linked",
      className: "border border-amber-300/35 bg-amber-500/10 text-amber-200",
    });
  }

  // Informational, not a problem: "Bye: Team X", "Not needed this round".
  const note = getNodeNote(node);
  if (note) {
    chips.push({
      key: "note",
      label: note,
      className: "border border-sky-300/35 bg-sky-500/10 text-sky-100",
    });
  }

  // `scheduled` is the release entry covering this node, if any. It comes from
  // playoff_resolve_schedules rather than the node itself, because a date
  // covers an arbitrary group of games, not a round.
  const resolveAt = scheduled?.at ? new Date(scheduled.at) : null;
  if (resolveAt && !Number.isNaN(resolveAt.getTime()) && resolveAt.getTime() > Date.now()) {
    chips.push({
      key: "pending",
      label: `${scheduled.label ? `${scheduled.label}: ` : ""}fills ${formatDateTime(scheduled.at)}`,
      className: "border border-sky-300/35 bg-sky-500/10 text-sky-200",
    });
  }

  if (node?.last_resolve_error) {
    chips.push({
      key: "blocked",
      label: node.last_resolve_error,
      className: "border border-rose-400/35 bg-rose-500/10 text-rose-100",
    });
  }

  return chips;
}

function createEmptyBracketForm() {
  return {
    name: "",
    type: "placement",
    isLocked: false,
  };
}

function createEmptySourceForm(type = "pool_rank") {
  return {
    type,
    divisionId: "",
    poolId: "",
    rank: "1",
    nodeId: "",
    teamId: "",
    game: "1",
    side: "A",
    bracketId: "",
  };
}

function createEmptyNodeForm() {
  return {
    name: "",
    round: "1",
    position: "1",
    matchId: "",
    sourceA: createEmptySourceForm(),
    sourceB: createEmptySourceForm(),
    advanceToWinner: "",
    advanceToWinnerSide: "",
    advanceToLoser: "",
    advanceToLoserSide: "",
  };
}

function createEmptyLinkedMatchForm(defaults = {}) {
  return {
    divisionId: defaults.divisionId || "",
    poolId: defaults.poolId || "",
    venueId: defaults.venueId || "",
    startTime: defaults.startTime || "",
    status: defaults.status || "scheduled",
  };
}

function mapLinkedMatchToForm(match) {
  return createEmptyLinkedMatchForm({
    divisionId: match?.division_id || "",
    poolId: match?.pool_id || "",
    venueId: match?.venue_id || "",
    startTime: formatDateTimeLocalInput(match?.start_time),
    status: match?.status || "scheduled",
  });
}

function mapBracketToForm(bracket) {
  return {
    name: bracket?.name || "",
    type: bracket?.type || "placement",
    isLocked: Boolean(bracket?.is_locked),
  };
}

function mapSourceToForm(source) {
  const rawType = normalizeText(source?.type);
  const type =
    rawType === "match_winner"
      ? "winner"
      : rawType === "match_loser"
        ? "loser"
        : rawType || "pool_rank";

  return {
    type,
    divisionId: source?.divisionId || source?.division_id || "",
    poolId: source?.poolId || source?.pool_id || "",
    rank: String(source?.rank ?? source?.seed ?? 1),
    nodeId: source?.nodeId || source?.node_id || "",
    teamId: source?.teamId || source?.team_id || "",
    game: String(source?.game ?? 1),
    side: String(source?.side || "A").toUpperCase() === "B" ? "B" : "A",
    bracketId: source?.bracketId || source?.bracket_id || "",
    // Kept so re-saving a seeded Swiss game does not drop its tie-break seed.
    templateSeed: source?.templateSeed ?? null,
  };
}

function mapNodeToForm(node) {
  return {
    name: node?.name || "",
    round: String(node?.round ?? 1),
    position: String(node?.position ?? 1),
    matchId: node?.match_id || "",
    sourceA: mapSourceToForm(node?.source_a || {}),
    sourceB: mapSourceToForm(node?.source_b || {}),
    advanceToWinner: node?.advance_to_winner || "",
    advanceToWinnerSide: node?.advance_to_winner_side || "",
    advanceToLoser: node?.advance_to_loser || "",
    advanceToLoserSide: node?.advance_to_loser_side || "",
  };
}

function toPositiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

// Readable label for an abstract template source (used only in the template
// preview, before instantiation — no real ids yet).
function formatTemplateSource(source) {
  if (!source || typeof source !== "object") {
    return "?";
  }
  if (source.kind === "seed") {
    return `Seed ${source.seed}`;
  }
  if (source.kind === "winner") {
    return `Winner of ${source.node}`;
  }
  if (source.kind === "loser") {
    return `Loser of ${source.node}`;
  }
  if (source.kind === "swiss") {
    return formatSwissSourceLabel(source.game, source.side);
  }
  if (source.kind === "swiss_bye") {
    return "Swiss bye";
  }
  if (source.kind === "bye") {
    return "Bye";
  }
  return "?";
}

// Re-attach the round 1 seed a template stamped on a source, so editing a
// seeded game by hand keeps the Swiss ranking's final tie-break.
function withTemplateSeed(payload, sourceForm) {
  const seed = Number(sourceForm?.templateSeed);
  return Number.isInteger(seed) && seed > 0 ? { ...payload, templateSeed: seed } : payload;
}

function buildSourcePayload(sourceForm, lookups, label) {
  const payload = buildSourcePayloadForType(sourceForm, lookups, label);
  return payload.type === "swiss" ? payload : withTemplateSeed(payload, sourceForm);
}

function buildSourcePayloadForType(sourceForm, lookups, label) {
  const type = normalizeText(sourceForm?.type) || "pool_rank";

  if (type === "swiss") {
    const game = toPositiveInteger(sourceForm?.game, 0);
    if (!game) {
      throw new Error(`${label}: Swiss game number must be 1 or higher.`);
    }
    return {
      type: "swiss",
      game,
      side: sourceForm?.side === "B" ? "B" : "A",
    };
  }

  if (type === "swiss_rank") {
    const bracket = lookups.bracketById?.get(sourceForm?.bracketId || "") || null;
    const rank = toPositiveInteger(sourceForm?.rank, 0);
    if (!bracket || bracket.type !== "swiss") {
      throw new Error(`${label}: choose a Swiss draw.`);
    }
    if (bracket.id === lookups.currentBracketId) {
      throw new Error(`${label}: a Swiss draw cannot seed from its own standings.`);
    }
    if (!rank) {
      throw new Error(`${label}: position must be 1 or higher.`);
    }
    const teamCount = countSwissTeams(bracket);
    if (teamCount && rank > teamCount) {
      throw new Error(`${label}: ${bracket.name} has only ${teamCount} teams.`);
    }
    return { type: "swiss_rank", bracketId: bracket.id, bracketName: bracket.name, rank };
  }

  if (BYE_SOURCE_TYPES.has(type)) {
    return { type };
  }

  if (type === "pool_rank") {
    const rank = toPositiveInteger(sourceForm?.rank, 0);
    const selectedPool = lookups.poolById.get(sourceForm?.poolId || "") || null;
    const selectedDivision =
      lookups.divisionById.get(sourceForm?.divisionId || "") ||
      (selectedPool ? lookups.divisionById.get(selectedPool.divisionId || "") || null : null);

    if (!rank) {
      throw new Error(`${label}: rank is required.`);
    }

    if (!selectedPool && !selectedDivision) {
      throw new Error(`${label}: choose a division or pool.`);
    }

    const payload = {
      type: "pool_rank",
      rank,
    };

    if (selectedDivision?.id) {
      payload.divisionId = selectedDivision.id;
      payload.divisionName = selectedDivision.name;
    }

    if (selectedPool?.id) {
      payload.poolId = selectedPool.id;
      payload.poolName = selectedPool.name;
      if (!payload.divisionId && selectedPool.divisionId) {
        payload.divisionId = selectedPool.divisionId;
      }
      if (!payload.divisionName && selectedPool.divisionName) {
        payload.divisionName = selectedPool.divisionName;
      }
    }

    return payload;
  }

  if (type === "winner" || type === "loser") {
    const targetNode = lookups.nodeById.get(sourceForm?.nodeId || "") || null;
    if (!targetNode?.id) {
      throw new Error(`${label}: choose a source node.`);
    }
    return {
      type,
      nodeId: targetNode.id,
      nodeName: getNodeDisplayName(targetNode),
      matchId: targetNode.match_id || null,
    };
  }

  if (type === "static_team") {
    const team = lookups.teamById.get(sourceForm?.teamId || "") || null;
    if (!team?.id) {
      throw new Error(`${label}: choose a team.`);
    }
    return {
      type: "static_team",
      teamId: team.id,
      teamName: team.name,
    };
  }

  throw new Error(`${label}: unsupported source type.`);
}

function summarizeResolveResult(result) {
  const updated = result?.updatedCount || 0;
  // "already assigned" is the steady state once a bracket is resolved, so it is
  // not worth reporting back — only genuine blockers are.
  const skipped = (Array.isArray(result?.skipped) ? result.skipped : []).filter(
    (entry) => !entry.settled,
  );

  if (!updated && !skipped.length) {
    return "No playoff changes made.";
  }

  const parts = [];
  parts.push(updated ? `Updated ${updated} playoff match${updated === 1 ? "" : "es"}.` : "No playoff changes made.");

  // A Swiss round paired with a rematch still fills in, but the operator should
  // know. One warning per round is enough.
  const warnings = [
    ...new Set(
      (Array.isArray(result?.updates) ? result.updates : [])
        .map((entry) => entry.warning)
        .filter(Boolean),
    ),
  ];
  if (warnings.length) {
    parts.push(`Note: ${warnings.join(" | ")}.`);
  }

  if (skipped.length) {
    const preview = skipped
      .slice(0, 3)
      .map((entry) => `${entry.nodeName}: ${entry.reason}`)
      .join(" | ");
    const extraCount = skipped.length - Math.min(skipped.length, 3);
    parts.push(extraCount > 0 ? `${preview} | ${extraCount} more` : preview);
  }

  return parts.join(" ");
}

function summarizeClearResult(result) {
  const cleared = result?.clearedCount || 0;
  const skipped = Array.isArray(result?.skipped) ? result.skipped : [];

  if (!cleared && !skipped.length) {
    return "No playoff assignments cleared.";
  }

  const parts = [];
  parts.push(cleared ? `Cleared ${cleared} playoff match assignment${cleared === 1 ? "" : "s"}.` : "No playoff assignments cleared.");

  if (skipped.length) {
    const preview = skipped
      .slice(0, 3)
      .map((entry) => `${entry.nodeName}: ${entry.reason}`)
      .join(" | ");
    const extraCount = skipped.length - Math.min(skipped.length, 3);
    parts.push(extraCount > 0 ? `${preview} | ${extraCount} more` : preview);
  }

  return parts.join(" ");
}

function getNodeReferenceConflicts(nodeId, nodes) {
  if (!nodeId) return [];
  return (nodes || []).filter((node) => {
    if (!node || node.id === nodeId) return false;

    const sourceANodeId = node?.source_a?.nodeId || node?.source_a?.node_id || "";
    const sourceBNodeId = node?.source_b?.nodeId || node?.source_b?.node_id || "";

    return (
      node.advance_to_winner === nodeId ||
      node.advance_to_loser === nodeId ||
      sourceANodeId === nodeId ||
      sourceBNodeId === nodeId
    );
  });
}

// Derive advancement pointers from a node's sources and persist them back onto
// the upstream nodes. A resolved source payload of { type: "winner"|"loser",
// nodeId } on side A/B of `savedNodeId` means the referenced upstream node
// advances its winner/loser into that slot — the inverse of the source link.
// Also clears any upstream node that used to feed `savedNodeId` but no longer
// appears in the current sources, so re-pointing a slot doesn't leave a stale
// connector. Best-effort: advancement only draws the visual bracket and is not
// read during resolution, so failures here never block the primary save.
async function syncAdvancementFromSources({ savedNodeId, sourceA, sourceB, nodes = [] }) {
  if (!savedNodeId) return;

  // desired[upstreamNodeId] = { winner?: "A"|"B", loser?: "A"|"B" }
  const desired = new Map();
  const consider = (source, side) => {
    const type = normalizeText(source?.type);
    if (type !== "winner" && type !== "loser") return;
    const upstreamId = source?.nodeId || source?.node_id || "";
    if (!upstreamId || upstreamId === savedNodeId) return;
    const entry = desired.get(upstreamId) || {};
    entry[type] = side;
    desired.set(upstreamId, entry);
  };
  consider(sourceA, "A");
  consider(sourceB, "B");

  const patches = new Map(); // upstreamId -> partial update payload

  // Apply desired pointers.
  for (const [upstreamId, sides] of desired.entries()) {
    const patch = patches.get(upstreamId) || {};
    if (sides.winner) {
      patch.advanceToWinner = savedNodeId;
      patch.advanceToWinnerSide = sides.winner;
    }
    if (sides.loser) {
      patch.advanceToLoser = savedNodeId;
      patch.advanceToLoserSide = sides.loser;
    }
    patches.set(upstreamId, patch);
  }

  // Clear stale pointers: any node that previously advanced into savedNodeId but
  // is no longer referenced (or no longer on that winner/loser channel).
  for (const node of nodes) {
    if (!node?.id || node.id === savedNodeId) continue;
    const sides = desired.get(node.id) || {};
    const patch = patches.get(node.id) || {};
    if (node.advance_to_winner === savedNodeId && !sides.winner) {
      patch.advanceToWinner = null;
      patch.advanceToWinnerSide = null;
    }
    if (node.advance_to_loser === savedNodeId && !sides.loser) {
      patch.advanceToLoser = null;
      patch.advanceToLoserSide = null;
    }
    if (Object.keys(patch).length) {
      patches.set(node.id, patch);
    }
  }

  for (const [upstreamId, patch] of patches.entries()) {
    if (!Object.keys(patch).length) continue;
    try {
      await updateBracketNode(upstreamId, patch);
    } catch {
      // Swallow — advancement is cosmetic (visual connectors only); the node's
      // own save already succeeded and resolution reads sources, not these.
    }
  }
}

function SourceEditor({
  label,
  value,
  onChange,
  divisions,
  pools,
  nodeOptions,
  teamOptions,
  currentNodeId,
  swissBrackets = [],
}) {
  const filteredPools = useMemo(() => {
    if (!value?.divisionId) {
      return pools;
    }
    return pools.filter((pool) => pool.divisionId === value.divisionId);
  }, [pools, value?.divisionId]);

  const filteredNodes = useMemo(
    () => nodeOptions.filter((node) => node.id !== currentNodeId),
    [currentNodeId, nodeOptions],
  );

  return (
    <div className="space-y-2 rounded-2xl border border-white/15 bg-surface/60 p-2">
<div className="space-y-0.5">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-ink-muted">Choose how this slot should resolve.</p>
      </div>
      <Field label="Source type">
        <Select
          value={value.type}
          onChange={(event) =>
            onChange({
              ...createEmptySourceForm(event.target.value),
              divisionId: value.divisionId,
              templateSeed: value.templateSeed,
            })
          }
        >
          {SOURCE_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {value.type === "pool_rank" ? (
        <>
          <Field label="Division">
            <Select
              value={value.divisionId}
              onChange={(event) =>
                onChange({
                  ...value,
                  divisionId: event.target.value,
                  poolId: "",
                })
              }
            >
              <option value="">Any division</option>
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Pool" hint="Leave blank to resolve from the whole division table.">
            <Select
              value={value.poolId}
              onChange={(event) => onChange({ ...value, poolId: event.target.value })}
            >
              <option value="">Use division standings</option>
              {filteredPools.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.divisionName ? `${pool.divisionName} - ` : ""}
                  {pool.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Rank">
            <Input
              type="number"
              min="1"
              value={value.rank}
              onChange={(event) => onChange({ ...value, rank: event.target.value })}
            />
          </Field>
        </>
      ) : null}

      {value.type === "winner" || value.type === "loser" ? (
        <Field label="Source node">
          <Select
            value={value.nodeId}
            onChange={(event) => onChange({ ...value, nodeId: event.target.value })}
          >
            <option value="">Select node</option>
            {filteredNodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {value.type === "static_team" ? (
        <Field label="Team">
          <Select
            value={value.teamId}
            onChange={(event) => onChange({ ...value, teamId: event.target.value })}
          >
            <option value="">Select team</option>
            {teamOptions.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {value.type === "swiss" ? (
        <>
          <Field
            label="Swiss game"
            hint="Game 1 is the top pairing of this round, game 2 the next, and so on. Filled once every earlier round is finished."
          >
            <Input
              type="number"
              min="1"
              value={value.game}
              onChange={(event) => onChange({ ...value, game: event.target.value })}
            />
          </Field>
          <Field label="Team in that game">
            <Select value={value.side} onChange={(event) => onChange({ ...value, side: event.target.value })}>
              {SWISS_SIDE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </>
      ) : null}

      {value.type === "swiss_rank" ? (
        <>
          <Field label="Swiss draw" hint="Fills once every game of that draw is finished.">
            <Select
              value={value.bracketId}
              onChange={(event) => onChange({ ...value, bracketId: event.target.value })}
            >
              <option value="">Select Swiss draw</option>
              {swissBrackets.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.teamCount} teams)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Finishing position">
            <Input
              type="number"
              min="1"
              value={value.rank}
              onChange={(event) => onChange({ ...value, rank: event.target.value })}
            />
          </Field>
          {!swissBrackets.length ? (
            <p className="text-xs text-ink-muted">This event has no other Swiss draw to take standings from.</p>
          ) : null}
        </>
      ) : null}

      {BYE_SOURCE_TYPES.has(value.type) ? (
        <p className="text-xs text-ink-muted">
          {value.type === "bye"
            ? "The empty side of a bye slot: this game is never played."
            : "The Swiss draw puts the lowest-ranked team that has not had a bye here."}
        </p>
      ) : null}
    </div>
  );
}

const SWISS_STATUS_LABELS = { advanced: "Advanced", out: "Out", active: "Still in" };

// Standings for the selected Swiss draw, as the server's Swiss engine sees them
// (from the resolve status endpoint, so it is exactly what pairing uses).
function SwissStandingsPanel({ summary, statusError }) {
  if (!summary) {
    return (
      <Panel variant="default" className="space-y-1 border-white/20 p-2">
        <SectionHeader title="Swiss standings" />
        <p className="text-sm text-ink-muted">
          {statusError
            ? `Standings could not be worked out: ${statusError}`
            : "Standings appear once the draw has teams. Use Resolve playoffs, or refresh."}
        </p>
      </Panel>
    );
  }

  const isAdvance = summary.settings?.mode === "advance";
  const showSos = summary.settings?.tiebreak === "strength_of_schedule";
  const hasByes = summary.rows.some((row) => row.byes > 0);

  return (
    <Panel variant="default" className="space-y-2 border-white/20 p-2">
      <SectionHeader
        title="Swiss standings"
        description={describeSwissSettings({ swiss: summary.settings || {} })}
        action={
          <Chip>
            {summary.complete
              ? "Complete"
              : `${summary.roundsPaired} of ${summary.totalRounds} rounds paired`}
          </Chip>
        }
      />
      {summary.reason ? (
        <p className="text-sm text-ink-muted">
          <span className="font-semibold text-ink">Waiting on:</span> {summary.reason}
        </p>
      ) : null}
      {summary.warnings?.length ? (
        <p className="text-sm text-amber-200">{summary.warnings.join(" | ")}</p>
      ) : null}
      {summary.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Team</th>
                <th className="py-1 pr-2">W-L</th>
                {hasByes ? <th className="py-1 pr-2">Byes</th> : null}
                {showSos ? <th className="py-1 pr-2">SoS</th> : null}
                <th className="py-1 pr-2">+/-</th>
                <th className="py-1 pr-2">Scored</th>
                {isAdvance ? <th className="py-1">Status</th> : null}
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60 text-ink">
                  <td className="py-1 pr-2 text-ink-muted">{row.rank}</td>
                  <td className="py-1 pr-2 font-semibold">{row.name}</td>
                  <td className="py-1 pr-2">
                    {row.wins}-{row.losses}
                  </td>
                  {hasByes ? <td className="py-1 pr-2">{row.byes || ""}</td> : null}
                  {showSos ? <td className="py-1 pr-2">{row.sos}</td> : null}
                  <td className="py-1 pr-2">{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
                  <td className="py-1 pr-2">{row.pointsFor}</td>
                  {isAdvance ? (
                    <td className="py-1">{SWISS_STATUS_LABELS[row.status] || ""}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

function EditorSection({
  step,
  title,
  description,
  tone = "default",
  className = "",
  titleClassName = "",
  descriptionClassName = "",
  stepClassName = "",
  children,
}) {
  // Flat section, not a card: a heading over a rule, as on the event
  // template, so the editor never nests more than two boxes deep.
  void tone;
  return (
    <section className={`space-y-2 pt-1 ${className}`.trim()}>
      <div className="space-y-0.5 border-b-2 border-[var(--sc-border-strong)] pb-1">
        <h3 className={`flex items-baseline gap-1.5 text-base font-semibold text-ink ${titleClassName}`.trim()}>
          {step ? <span className={`text-emerald-200 ${stepClassName}`.trim()}>{step}.</span> : null}
          {title}
        </h3>
        {description ? <p className={`text-xs text-ink-muted ${descriptionClassName}`.trim()}>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

// Shared body for a summary node: sources, linked match, advancement. Used by
// both the wide columnar card and the narrow collapsible stack.
function BracketSummaryNodeBody({ node, lookups }) {
  const winnerTarget = formatAdvancementTarget(
    node.advance_to_winner,
    node.advance_to_winner_side,
    lookups,
  );
  const loserTarget = formatAdvancementTarget(
    node.advance_to_loser,
    node.advance_to_loser_side,
    lookups,
  );
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-ink-muted">
        <span className="text-ink">A:</span>{" "}
        {formatSourceLabel(node.source_a, lookups)}
      </p>
      <p className="text-xs text-ink-muted">
        <span className="text-ink">B:</span>{" "}
        {formatSourceLabel(node.source_b, lookups)}
      </p>
      <p className="text-xs text-ink-muted">
        Linked match:{" "}
        {node.match ? (
          <>
            {formatMatchup(node.match)} · {formatMatchStatus(node.match.status)}
          </>
        ) : (
          "None"
        )}
      </p>
      {winnerTarget ? (
        <p className="text-xs text-ink-muted">Winner → {winnerTarget}</p>
      ) : null}
      {loserTarget ? (
        <p className="text-xs text-ink-muted">Loser → {loserTarget}</p>
      ) : null}
    </div>
  );
}

export default function PlayoffStructurePage() {
  const { roles } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = usePersistentState(PLAYOFF_STRUCTURE_EVENT_KEY, "");
  const [eventData, setEventData] = useState(null);
  const [matches, setMatches] = useState([]);
  const [brackets, setBrackets] = useState([]);
  const [selectedBracketId, setSelectedBracketId] = useState("");
  // True while the bracket form is drafting a new bracket, so the auto-select
  // below does not snap the empty selection back to the first bracket.
  const [isCreatingBracket, setIsCreatingBracket] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [bracketForm, setBracketForm] = useState(createEmptyBracketForm);
  const [nodeForm, setNodeForm] = useState(createEmptyNodeForm);
  const [showCreateMatchForm, setShowCreateMatchForm] = useState(false);
  const [createMatchForm, setCreateMatchForm] = useState(createEmptyLinkedMatchForm);
  const [linkedMatchFormMode, setLinkedMatchFormMode] = useState("create");
  const [loading, setLoading] = useState(false);
  const [bracketBusy, setBracketBusy] = useState(false);
  const [nodeBusy, setNodeBusy] = useState(false);
  const [createMatchBusy, setCreateMatchBusy] = useState(false);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  // Scheduled-resolution state. `resolveStatus` is read from the server rather
  // than derived locally because the sweeper runs whether or not this page is
  // open, and net.http_post is fire-and-forget so the DB's cron history cannot
  // say what a sweep did — automation_job_state can.
  const [autoResolve, setAutoResolve] = useState(false);
  const [autoResolveBusy, setAutoResolveBusy] = useState(false);
  const [resolveStatus, setResolveStatus] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [scheduleDrafts, setScheduleDrafts] = useState({});
  const [scheduleBusy, setScheduleBusy] = useState("");
  // Scroll target so canvas clicks bring the node editor into view.
  const nodeEditorRef = useRef(null);
  // "Start from template" panel state.
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [templateBracketName, setTemplateBracketName] = useState("");
  const [templateSeedRows, setTemplateSeedRows] = useState([]);
  // "pool": seeds are pool finishing positions (resolve after pool play).
  // "team": seeds are chosen teams, for a draw that starts the event.
  // "swiss": seeds are a Swiss draw's finishing positions (Swiss into playoffs).
  const [templateSeedSource, setTemplateSeedSource] = useState("pool");
  const [templateSwissSeed, setTemplateSwissSeed] = useState({ bracketId: "", startRank: "1" });
  // Inputs hold strings; the template module parses and validates them.
  const [swissOptions, setSwissOptions] = useState(() =>
    Object.fromEntries(
      Object.entries(DEFAULT_SWISS_OPTIONS).map(([key, value]) => [key, String(value)]),
    ),
  );
  const [applyTemplateBusy, setApplyTemplateBusy] = useState(false);

  // Deep link from the Event Setup wizard ("Open Playoff Structure"): preselect
  // the requested event, then drop the query param so it doesn't fight the
  // persisted last-selected-event on later navigations.
  useEffect(() => {
    const requestedEventId = searchParams.get("eventId");
    if (!requestedEventId) {
      return;
    }
    setSelectedEventId(requestedEventId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("eventId");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, setSelectedEventId]);

  useEffect(() => {
    let active = true;

    async function loadEvents() {
      setEventsLoading(true);
      try {
        const rows = await getEventsList(120);
        if (!active) return;
        setEvents(Array.isArray(rows) ? rows : []);
      } catch (loadError) {
        if (!active) return;
        setError(loadError?.message || "Failed to load events.");
      } finally {
        if (active) {
          setEventsLoading(false);
        }
      }
    }

    loadEvents();
    return () => {
      active = false;
    };
  }, []);

  // Scope the event dropdown to events the user is actually linked to, same
  // as the other admin tools — admins/admin_override see everything, everyone
  // else only sees events where they hold an event-scoped role assignment.
  const accessibleEvents = useMemo(() => {
    if (!Array.isArray(events) || events.length === 0) {
      return [];
    }
    if (!Array.isArray(roles)) {
      return [];
    }
    if (roleAssignmentsIncludeAdmin(roles)) {
      return events;
    }
    const allowedEventIds = new Set(
      roles
        .filter((assignment) => assignment?.scope === "event" && typeof assignment?.eventId === "string")
        .map((assignment) => assignment.eventId),
    );
    if (allowedEventIds.size === 0) {
      return [];
    }
    return events.filter((event) => allowedEventIds.has(event.id));
  }, [events, roles]);

  // Auto-select the first event once we know which events this user can
  // actually access (accessibleEvents depends on roles, which may still be
  // loading when the event list itself resolves).
  useEffect(() => {
    if (selectedEventId || !Array.isArray(roles) || accessibleEvents.length === 0) {
      return;
    }
    setSelectedEventId(accessibleEvents[0].id);
  }, [accessibleEvents, roles, selectedEventId, setSelectedEventId]);

  const loadSelectedEventData = useCallback(async () => {
    if (!selectedEventId) {
      setEventData(null);
      setMatches([]);
      setBrackets([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [hierarchy, bracketRows, matchRows] = await Promise.all([
        getEventHierarchy(selectedEventId),
        getBracketsByEvent(selectedEventId),
        getMatchesByEvent(selectedEventId, MATCH_LIMIT, {
          includeFinished: true,
          forceRefresh: true,
        }),
      ]);

      setEventData(hierarchy);
      setBrackets(Array.isArray(bracketRows) ? bracketRows : []);
      setMatches(Array.isArray(matchRows) ? matchRows : []);
    } catch (loadError) {
      setError(loadError?.message || "Failed to load playoff structure.");
    } finally {
      setLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => {
    loadSelectedEventData();
  }, [loadSelectedEventData]);

  const refreshResolveStatus = useCallback(async () => {
    if (!selectedEventId) {
      setResolveStatus(null);
      return;
    }

    try {
      const status = await getPlayoffResolveStatus(selectedEventId);
      setResolveStatus(status);
      if (status?.event) {
        setAutoResolve(Boolean(status.event.autoResolve));
      }
    } catch {
      // Status is advisory; a failure here must not block the page. The
      // toggle falls back to a direct read below.
      setResolveStatus(null);
    }
  }, [selectedEventId]);

  useEffect(() => {
    refreshResolveStatus();
  }, [refreshResolveStatus]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedEventId) {
      setAutoResolve(false);
      return undefined;
    }

    getEventAutoResolve(selectedEventId)
      .then((enabled) => {
        if (!cancelled) setAutoResolve(Boolean(enabled));
      })
      .catch(() => {
        if (!cancelled) setAutoResolve(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  const handleToggleAutoResolve = useCallback(async () => {
    if (!selectedEventId) return;

    const next = !autoResolve;
    setAutoResolveBusy(true);
    setError("");
    setMessage("");

    try {
      await setEventAutoResolve(selectedEventId, next);
      setAutoResolve(next);
      setMessage(
        next
          ? "Scheduled resolution enabled. Rounds will fill in at their set times."
          : "Scheduled resolution disabled. Use the Resolve playoffs button instead.",
      );
    } catch (toggleError) {
      setError(toggleError?.message || "Failed to update the auto-resolve setting.");
    } finally {
      setAutoResolveBusy(false);
    }
  }, [autoResolve, selectedEventId]);

  const refreshSchedules = useCallback(async () => {
    if (!selectedEventId) {
      setSchedules([]);
      return;
    }

    try {
      setSchedules(await getPlayoffSchedules(selectedEventId));
    } catch (scheduleError) {
      setError(scheduleError?.message || "Failed to load release schedules.");
    }
  }, [selectedEventId]);

  useEffect(() => {
    refreshSchedules();
  }, [refreshSchedules]);

  const updateScheduleDraft = useCallback((scheduleId, patch) => {
    setScheduleDrafts((current) => ({
      ...current,
      [scheduleId]: { ...(current[scheduleId] || {}), ...patch },
    }));
  }, []);

  /** Toggle one game in or out of a schedule's coverage. */
  const toggleScheduleNode = useCallback(
    (schedule, nodeId) => {
      setScheduleDrafts((current) => {
        const draft = current[schedule.id] || {};
        const selected = draft.nodeIds ?? schedule.node_ids ?? [];
        const nodeIds = selected.includes(nodeId)
          ? selected.filter((id) => id !== nodeId)
          : [...selected, nodeId];
        return { ...current, [schedule.id]: { ...draft, nodeIds } };
      });
    },
    [],
  );

  /** A new date starts empty: the operator picks which games it covers. */
  const handleAddSchedule = useCallback(async () => {
    if (!selectedEventId || !selectedBracketId) {
      setError("Choose a bracket before adding a release date.");
      return;
    }

    setScheduleBusy("new");
    setError("");
    setMessage("");

    try {
      // Default to tomorrow 09:00 local, so a new row is never born already
      // due (which would release its games within the minute).
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      tomorrow.setHours(9, 0, 0, 0);
      const defaultAt = tomorrow.toISOString();
      await createPlayoffSchedule({
        eventId: selectedEventId,
        bracketId: selectedBracketId,
        label: "",
        resolveAt: defaultAt,
        nodeIds: [],
      });
      await refreshSchedules();
      setMessage("Release date added. Pick the games it covers, then save.");
    } catch (scheduleError) {
      setError(scheduleError?.message || "Failed to add the release date.");
    } finally {
      setScheduleBusy("");
    }
  }, [refreshSchedules, selectedBracketId, selectedEventId]);

  const handleSaveSchedule = useCallback(
    async (schedule) => {
      const draft = scheduleDrafts[schedule.id] || {};
      setScheduleBusy(schedule.id);
      setError("");
      setMessage("");

      try {
        const day = draft.day ?? toDayInputValue(schedule.resolve_at);
        if (!day) {
          throw new Error("A release date is required.");
        }

        const time = draft.time ?? toTimeInputValue(schedule.resolve_at);
        if (!/^\d{2}:\d{2}$/.test(time || "")) {
          throw new Error("A release time is required.");
        }
        // Local date + time, as the operator sees them.
        const chosen = new Date(`${day}T${time}`);
        if (Number.isNaN(chosen.getTime())) {
          throw new Error("That date and time could not be read.");
        }

        await updatePlayoffSchedule(schedule.id, {
          label: draft.label ?? schedule.label ?? "",
          resolveAt: chosen.toISOString(),
          nodeIds: draft.nodeIds ?? schedule.node_ids ?? [],
        });
        setScheduleDrafts((current) => {
          const next = { ...current };
          delete next[schedule.id];
          return next;
        });
        await refreshSchedules();
        await refreshResolveStatus();
        setMessage("Release date saved.");
      } catch (scheduleError) {
        setError(scheduleError?.message || "Failed to save the release date.");
      } finally {
        setScheduleBusy("");
      }
    },
    [refreshResolveStatus, refreshSchedules, scheduleDrafts],
  );

  const handleDeleteSchedule = useCallback(
    async (scheduleId) => {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          "Remove this release date? Its games will then fill in as soon as results allow.",
        );
        if (!confirmed) return;
      }

      setScheduleBusy(scheduleId);
      setError("");
      setMessage("");

      try {
        await deletePlayoffSchedule(scheduleId);
        await refreshSchedules();
        await refreshResolveStatus();
        setMessage("Release date removed.");
      } catch (scheduleError) {
        setError(scheduleError?.message || "Failed to remove the release date.");
      } finally {
        setScheduleBusy("");
      }
    },
    [refreshResolveStatus, refreshSchedules],
  );

  const selectedEvent = useMemo(
    () => accessibleEvents.find((event) => event.id === selectedEventId) || eventData || null,
    [accessibleEvents, eventData, selectedEventId],
  );

  useEffect(() => {
    if (!brackets.length) {
      setSelectedBracketId("");
      return;
    }

    if (!selectedBracketId && isCreatingBracket) {
      return;
    }

    if (!selectedBracketId || !brackets.some((bracket) => bracket.id === selectedBracketId)) {
      setSelectedBracketId(brackets[0].id);
    }
  }, [brackets, isCreatingBracket, selectedBracketId]);

  const selectedBracket = useMemo(
    () => brackets.find((bracket) => bracket.id === selectedBracketId) || null,
    [brackets, selectedBracketId],
  );

  const selectedBracketNodes = useMemo(() => selectedBracket?.nodes || [], [selectedBracket]);

  const bracketSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.bracket_id === selectedBracketId),
    [schedules, selectedBracketId],
  );

  /**
   * Node id -> the release entry covering it. A node listed by several
   * schedules takes the earliest time, matching buildScheduleIndex in
   * api/_lib/playoffResolve.js — keep the two in step.
   */
  const scheduleByNodeId = useMemo(() => {
    const index = new Map();
    schedules.forEach((schedule) => {
      if (schedule.enabled === false || !schedule.resolve_at) return;
      const at = new Date(schedule.resolve_at);
      if (Number.isNaN(at.getTime())) return;
      (schedule.node_ids || []).forEach((nodeId) => {
        const existing = index.get(nodeId);
        if (!existing || at.getTime() < new Date(existing.at).getTime()) {
          index.set(nodeId, { at: schedule.resolve_at, label: schedule.label || "" });
        }
      });
    });
    return index;
  }, [schedules]);

  useEffect(() => {
    if (!selectedBracket) {
      setSelectedNodeId("");
      return;
    }

    if (!selectedNodeId) {
      return;
    }

    if (!selectedBracketNodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId("");
    }
  }, [selectedBracket, selectedBracketNodes, selectedNodeId]);

  const selectedNode = useMemo(
    () => selectedBracketNodes.find((node) => node.id === selectedNodeId) || null,
    [selectedBracketNodes, selectedNodeId],
  );
  const isEditingNode = Boolean(selectedNodeId && selectedNode);

  useEffect(() => {
    setBracketForm(selectedBracket ? mapBracketToForm(selectedBracket) : createEmptyBracketForm());
  }, [selectedBracket]);

  useEffect(() => {
    setNodeForm(selectedNode ? mapNodeToForm(selectedNode) : createEmptyNodeForm());
  }, [selectedNode]);

  const divisions = useMemo(() => eventData?.divisions || [], [eventData]);

  const divisionOptions = useMemo(
    () => divisions.map((division) => ({ id: division.id, name: division.name })),
    [divisions],
  );

  const divisionById = useMemo(
    () => new Map(divisions.map((division) => [division.id, division])),
    [divisions],
  );

  const poolOptions = useMemo(
    () =>
      divisions.flatMap((division) =>
        (division.pools || []).map((pool) => ({
          id: pool.id,
          name: pool.name,
          divisionId: division.id,
          divisionName: division.name,
        })),
      ),
    [divisions],
  );

  const poolById = useMemo(
    () => new Map(poolOptions.map((pool) => [pool.id, pool])),
    [poolOptions],
  );

  const venueOptions = useMemo(
    () =>
      // Alphabetical by the label shown (numeric-aware: "Field 2" before "Field 10").
      (eventData?.venues || [])
        .map((venue) => ({
          id: venue.id,
          name: formatVenueLabel(venue),
        }))
        .sort((left, right) =>
          left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }),
        ),
    [eventData?.venues],
  );

  useEffect(() => {
    setShowCreateMatchForm(false);
    setLinkedMatchFormMode("create");
    setCreateMatchForm(
      createEmptyLinkedMatchForm({
        divisionId: divisions.length === 1 ? divisions[0].id : "",
        venueId: venueOptions.length === 1 ? venueOptions[0].id : "",
      }),
    );
  }, [divisions, selectedEventId, selectedNodeId, venueOptions]);

  const teamOptions = useMemo(() => {
    const teamMap = new Map();

    divisions.forEach((division) => {
      (division.pools || []).forEach((pool) => {
        (pool.teams || []).forEach((entry) => {
          if (!entry?.team?.id || teamMap.has(entry.team.id)) {
            return;
          }
          teamMap.set(entry.team.id, {
            id: entry.team.id,
            name: entry.team.name,
            short_name: entry.team.short_name || "",
          });
        });
      });
    });

    return Array.from(teamMap.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [divisions]);

  const teamById = useMemo(
    () => new Map(teamOptions.map((team) => [team.id, team])),
    [teamOptions],
  );

  const matchOptions = useMemo(
    () =>
      [...matches]
        .sort((left, right) => {
          const leftTime = left?.start_time ? new Date(left.start_time).getTime() : Number.MAX_SAFE_INTEGER;
          const rightTime = right?.start_time ? new Date(right.start_time).getTime() : Number.MAX_SAFE_INTEGER;
          return leftTime - rightTime;
        })
        .map((match) => ({
          ...match,
          label: formatMatchLabel(match),
        })),
    [matches],
  );

  const currentLinkedMatch = useMemo(
    () => matches.find((match) => match.id === nodeForm.matchId) || null,
    [matches, nodeForm.matchId],
  );

  const nodeById = useMemo(
    () => new Map(selectedBracketNodes.map((node) => [node.id, node])),
    [selectedBracketNodes],
  );

  const nodeOptions = useMemo(
    () =>
      selectedBracketNodes.map((node) => ({
        id: node.id,
        label: getNodeDisplayName(node),
      })),
    [selectedBracketNodes],
  );

  const bracketById = useMemo(
    () => new Map(brackets.map((bracket) => [bracket.id, bracket])),
    [brackets],
  );

  // Swiss draws other brackets can seed from. Their team count bounds the
  // ranks a "Swiss standings" source can ask for.
  const swissBracketOptions = useMemo(
    () =>
      brackets
        .filter((bracket) => bracket.type === "swiss")
        .map((bracket) => ({
          id: bracket.id,
          name: bracket.name || "Swiss draw",
          teamCount: countSwissTeams(bracket),
        })),
    [brackets],
  );

  const sourceLookups = useMemo(
    () => ({
      divisionById,
      poolById,
      teamById,
      nodeById,
      bracketById,
    }),
    [bracketById, divisionById, nodeById, poolById, teamById],
  );

  // The bottom summary spans every bracket, so winner/loser-of-node sources may
  // point at nodes in other brackets. Build a lookup across all brackets' nodes.
  const allNodesById = useMemo(
    () =>
      new Map(
        brackets.flatMap((bracket) => (bracket.nodes || []).map((node) => [node.id, node])),
      ),
    [brackets],
  );

  const summarySourceLookups = useMemo(
    () => ({
      divisionById,
      poolById,
      teamById,
      nodeById: allNodesById,
      bracketById,
    }),
    [allNodesById, bracketById, divisionById, poolById, teamById],
  );

  const createMatchPoolOptions = useMemo(() => {
    if (!createMatchForm.divisionId) {
      return poolOptions;
    }

    return poolOptions.filter((pool) => pool.divisionId === createMatchForm.divisionId);
  }, [createMatchForm.divisionId, poolOptions]);

  const stats = useMemo(() => {
    const nodeCount = brackets.reduce((total, bracket) => total + (bracket?.nodes?.length || 0), 0);
    const linkedMatchCount = new Set(
      brackets.flatMap((bracket) => (bracket?.nodes || []).map((node) => node?.match_id).filter(Boolean)),
    ).size;

    return {
      bracketCount: brackets.length,
      nodeCount,
      linkedMatchCount,
    };
  }, [brackets]);

  const templates = useMemo(() => listTemplates(), []);
  const isSwissTemplate = templateId === SWISS_TEMPLATE_ID;
  const swissOptionsError = isSwissTemplate ? validateSwissOptions(swissOptions) : "";
  const selectedTemplate = useMemo(
    () => getTemplateById(templateId, swissOptions),
    [swissOptions, templateId],
  );

  // Build the default seed -> pool/rank rows for a template using cross-pool
  // seeding over the event's actual pools. Rows already in `existingRows` keep
  // their edits, so resizing a Swiss draw does not wipe the mapping.
  const buildSeedRows = useCallback(
    (template, existingRows = []) => {
      if (!template) return [];
      const map = defaultSeedMap(template.seedCount, poolOptions);
      const existingBySeed = new Map(existingRows.map((row) => [row.seed, row]));
      return Array.from({ length: template.seedCount }, (_, index) => {
        const seedNumber = index + 1;
        const existing = existingBySeed.get(seedNumber);
        if (existing) return existing;
        const preset = map[seedNumber] || { poolIndex: 0, rank: seedNumber };
        const pool = poolOptions[preset.poolIndex] || null;
        return {
          seed: seedNumber,
          poolId: pool?.id || "",
          rank: String(preset.rank || 1),
          teamId: "",
        };
      });
    },
    [poolOptions],
  );

  const handleSelectTemplate = useCallback(
    (id) => {
      setTemplateId(id);
      const template = getTemplateById(id, swissOptions);
      setTemplateBracketName(template?.label || "");
      setTemplateSeedRows(buildSeedRows(template));
    },
    [buildSeedRows, swissOptions],
  );

  const handleChangeSwissOption = useCallback(
    (key, value) => {
      const nextOptions = { ...swissOptions, [key]: value };
      // Advance-or-out cannot pair one round behind, and its timing control is
      // disabled, so a lagged setting would leave an error nobody can clear.
      if (key === "format" && value === "advance") {
        nextOptions.pairingLag = "0";
      }
      setSwissOptions(nextOptions);
      const nextTemplate = getTemplateById(SWISS_TEMPLATE_ID, nextOptions);
      if (!nextTemplate) return;
      // The default name carries the size, so follow it unless it was edited.
      setTemplateBracketName((current) =>
        !current || current === selectedTemplate?.label ? nextTemplate.label : current,
      );
      setTemplateSeedRows((rows) => buildSeedRows(nextTemplate, rows));
    },
    [buildSeedRows, selectedTemplate?.label, swissOptions],
  );

  const handleOpenTemplatePanel = useCallback(() => {
    setError("");
    setMessage("");
    setShowTemplatePanel(true);
    const first = templates[0];
    if (first) {
      handleSelectTemplate(first.id);
    }
  }, [handleSelectTemplate, templates]);

  const handleApplyTemplate = useCallback(async () => {
    if (!selectedEventId) {
      setError("Choose an event before applying a template.");
      return;
    }
    if (swissOptionsError) {
      setError(swissOptionsError);
      return;
    }
    const template = getTemplateById(templateId, swissOptions);
    if (!template) {
      setError("Choose a template.");
      return;
    }

    // Turn each seed row into a concrete source payload, matching the shape
    // buildSourcePayload produces for hand-authored pool_rank / static_team
    // sources.
    const seedMap = {};
    if (templateSeedSource === "swiss") {
      const source = bracketById.get(templateSwissSeed.bracketId) || null;
      const startRank = toPositiveInteger(templateSwissSeed.startRank, 0);
      if (!source || source.type !== "swiss") {
        setError("Choose the Swiss draw to seed from.");
        return;
      }
      if (!startRank) {
        setError("Starting position must be 1 or higher.");
        return;
      }
      const lastRank = startRank + templateSeedRows.length - 1;
      const available = countSwissTeams(source);
      if (available && lastRank > available) {
        setError(`${source.name} has ${available} teams, so positions ${startRank}-${lastRank} do not all exist.`);
        return;
      }
      for (const row of templateSeedRows) {
        seedMap[row.seed] = {
          type: "swiss_rank",
          bracketId: source.id,
          bracketName: source.name,
          rank: startRank + row.seed - 1,
        };
      }
    } else if (templateSeedSource === "team") {
      const seenTeamIds = new Set();
      for (const row of templateSeedRows) {
        const team = teamById.get(row.teamId) || null;
        if (!team) {
          setError(`Seed ${row.seed}: choose a team.`);
          return;
        }
        if (seenTeamIds.has(team.id)) {
          setError(`Seed ${row.seed}: ${team.name} is already seeded.`);
          return;
        }
        seenTeamIds.add(team.id);
        seedMap[row.seed] = { type: "static_team", teamId: team.id, teamName: team.name };
      }
    } else {
      for (const row of templateSeedRows) {
        const pool = poolById.get(row.poolId) || null;
        const rank = toPositiveInteger(row.rank, 0);
        if (!pool) {
          setError(`Seed ${row.seed}: choose a pool.`);
          return;
        }
        if (!rank) {
          setError(`Seed ${row.seed}: rank must be 1 or higher.`);
          return;
        }
        seedMap[row.seed] = {
          type: "pool_rank",
          rank,
          poolId: pool.id,
          poolName: pool.name,
          divisionId: pool.divisionId || undefined,
          divisionName: pool.divisionName || undefined,
        };
      }
    }

    setApplyTemplateBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await instantiateTemplate({
        eventId: selectedEventId,
        template,
        bracketName: templateBracketName,
        bracketType: template.bracketType,
        seedMap,
      });
      await loadSelectedEventData();
      if (result?.bracket?.id) {
        setIsCreatingBracket(false);
        setSelectedBracketId(result.bracket.id);
      }
      setSelectedNodeId("");
      setShowTemplatePanel(false);
      setMessage(
        `Applied template "${template.label}": created ${result?.nodeCount || 0} nodes.`,
      );
    } catch (applyError) {
      setError(applyError?.message || "Failed to apply template.");
    } finally {
      setApplyTemplateBusy(false);
    }
  }, [
    bracketById,
    loadSelectedEventData,
    poolById,
    selectedEventId,
    swissOptions,
    swissOptionsError,
    teamById,
    templateBracketName,
    templateId,
    templateSeedRows,
    templateSeedSource,
    templateSwissSeed,
  ]);

  const handleRefresh = useCallback(async () => {
    setMessage("");
    await loadSelectedEventData();
  }, [loadSelectedEventData]);

  const handleStartNewBracket = useCallback(() => {
    setMessage("");
    setError("");
    setIsCreatingBracket(true);
    setSelectedBracketId("");
    setSelectedNodeId("");
    setBracketForm(createEmptyBracketForm());
    setNodeForm(createEmptyNodeForm());
  }, []);

  const handleSaveBracket = useCallback(async () => {
    if (!selectedEventId) {
      setError("Choose an event before saving a bracket.");
      return;
    }

    const name = bracketForm.name.trim();
    if (!name) {
      setError("Bracket name is required.");
      return;
    }

    if (!BRACKET_TYPES.some((option) => option.value === bracketForm.type)) {
      setError("Choose a valid bracket type.");
      return;
    }

    setBracketBusy(true);
    setError("");
    setMessage("");

    try {
      if (selectedBracketId) {
        await updateBracket(selectedBracketId, {
          name,
          type: bracketForm.type,
          isLocked: bracketForm.isLocked,
        });
        await loadSelectedEventData();
        setMessage(`Updated bracket ${name}.`);
      } else {
        const created = await createBracket({
          eventId: selectedEventId,
          name,
          type: bracketForm.type,
          isLocked: bracketForm.isLocked,
        });
        await loadSelectedEventData();
        setIsCreatingBracket(false);
        if (created?.id) {
          setSelectedBracketId(created.id);
        }
        setMessage(`Created bracket ${name}.`);
      }
    } catch (saveError) {
      setError(saveError?.message || "Failed to save bracket.");
    } finally {
      setBracketBusy(false);
    }
  }, [bracketForm, loadSelectedEventData, selectedBracketId, selectedEventId]);

  const handleDeleteBracket = useCallback(async () => {
    if (!selectedBracketId || !selectedBracket) {
      return;
    }

    const bracketNodes = selectedBracket.nodes || [];

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        bracketNodes.length > 0
          ? `Delete bracket ${selectedBracket.name} and its ${bracketNodes.length} game${
              bracketNodes.length === 1 ? "" : "s"
            }? This cannot be undone.`
          : `Delete bracket ${selectedBracket.name}?`,
      );
      if (!confirmed) {
        return;
      }
    }

    setBracketBusy(true);
    setError("");
    setMessage("");

    try {
      // Remove child nodes first — the bracket delete would otherwise fail on
      // the foreign-key constraint if any games remain. Advancement FKs point
      // forward (an earlier-round node references its later-round target), so
      // delete earliest rounds first: each node goes before the target it
      // points at, clearing the self-reference constraint in the right order.
      const orderedForDelete = bracketNodes
        .slice()
        .sort(
          (a, b) =>
            (a.round ?? 0) - (b.round ?? 0) || (a.position ?? 0) - (b.position ?? 0),
        );
      for (const node of orderedForDelete) {
        await deleteBracketNode(node.id);
      }

      await deleteBracket(selectedBracketId);
      await loadSelectedEventData();
      setSelectedBracketId("");
      setSelectedNodeId("");
      setMessage(`Deleted bracket ${selectedBracket.name}.`);
    } catch (deleteError) {
      setError(deleteError?.message || "Failed to delete bracket.");
    } finally {
      setBracketBusy(false);
    }
  }, [loadSelectedEventData, selectedBracket, selectedBracketId]);

  const handleStartNewNode = useCallback(() => {
    if (!selectedBracketId) {
      setError("Save or select a bracket before adding nodes.");
      return;
    }

    setMessage("");
    setError("");
    setSelectedNodeId("");
    setNodeForm(createEmptyNodeForm());
    setShowCreateMatchForm(false);
    setLinkedMatchFormMode("create");
  }, [selectedBracketId]);

  const scrollNodeEditorIntoView = useCallback(() => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      nodeEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  // Canvas: clicking a node selects it and brings the editor into view.
  const handleSelectNodeFromCanvas = useCallback(
    (nodeId) => {
      setMessage("");
      setError("");
      setSelectedNodeId(nodeId);
      scrollNodeEditorIntoView();
    },
    [scrollNodeEditorIntoView],
  );

  // Canvas: "Add game here" starts a new node pre-placed in the clicked column,
  // so the organiser never types round/position for the common case.
  const handleAddInColumn = useCallback(
    (roundValue) => {
      if (!selectedBracketId) {
        setError("Save or select a bracket before adding games.");
        return;
      }

      const slot = nextSlotForColumn(selectedBracketNodes, roundValue);
      setMessage("");
      setError("");
      setSelectedNodeId("");
      setNodeForm({
        ...createEmptyNodeForm(),
        round: String(slot.round),
        position: String(slot.position),
      });
      setShowCreateMatchForm(false);
      setLinkedMatchFormMode("create");
      scrollNodeEditorIntoView();
    },
    [scrollNodeEditorIntoView, selectedBracketId, selectedBracketNodes],
  );

  const openCreateLinkedForm = useCallback(() => {
    if (!selectedEventId) {
      setError("Choose an event before creating a linked match.");
      return;
    }

    setMessage("");
    setError("");
    setLinkedMatchFormMode("create");
    setCreateMatchForm(
      createEmptyLinkedMatchForm({
        divisionId: divisions.length === 1 ? divisions[0].id : "",
        venueId: venueOptions.length === 1 ? venueOptions[0].id : "",
      }),
    );
    setShowCreateMatchForm(true);
  }, [divisions, selectedEventId, venueOptions]);

  const openEditLinkedForm = useCallback(() => {
    if (!currentLinkedMatch) {
      setError("Choose a linked match before editing.");
      return;
    }

    setMessage("");
    setError("");
    setLinkedMatchFormMode("edit");
    setCreateMatchForm(mapLinkedMatchToForm(currentLinkedMatch));
    setShowCreateMatchForm(true);
  }, [currentLinkedMatch]);

  const handleToggleLinkedMatchForm = useCallback(() => {
    if (showCreateMatchForm && linkedMatchFormMode === "create") {
      setShowCreateMatchForm(false);
      setLinkedMatchFormMode("create");
      return;
    }

    openCreateLinkedForm();
  }, [linkedMatchFormMode, openCreateLinkedForm, showCreateMatchForm]);

  const handleSaveLinkedMatch = useCallback(async () => {
    if (!selectedEventId) {
      setError("Choose an event before working with a linked match.");
      return;
    }

    setCreateMatchBusy(true);
    setError("");
    setMessage("");

    try {
      const selectedPool = poolById.get(createMatchForm.poolId || "") || null;
      const divisionId = createMatchForm.divisionId || selectedPool?.divisionId || null;

      if (
        selectedPool?.divisionId &&
        createMatchForm.divisionId &&
        selectedPool.divisionId !== createMatchForm.divisionId
      ) {
        throw new Error("Selected pool does not belong to the chosen division.");
      }

      const payload = {
        eventId: selectedEventId,
        divisionId,
        poolId: selectedPool?.id || null,
        venueId: createMatchForm.venueId || null,
        status: createMatchForm.status || "scheduled",
        startTime: parseDateTimeLocalInput(createMatchForm.startTime),
      };

      const saved =
        linkedMatchFormMode === "edit" && currentLinkedMatch?.id
          ? await updateMatch(currentLinkedMatch.id, payload)
          : await createMatch(payload);

      if (!saved?.id) {
        throw new Error(
          linkedMatchFormMode === "edit"
            ? "Match was updated but no match id was returned."
            : "Match was created but no match id was returned.",
        );
      }

      setMatches((current) => {
        const next = [...current.filter((match) => match.id !== saved.id), saved];
        next.sort((left, right) => {
          const leftTime = left?.start_time ? new Date(left.start_time).getTime() : Number.MAX_SAFE_INTEGER;
          const rightTime = right?.start_time ? new Date(right.start_time).getTime() : Number.MAX_SAFE_INTEGER;
          return leftTime - rightTime;
        });
        return next;
      });
      setNodeForm((current) => ({ ...current, matchId: saved.id }));
      setShowCreateMatchForm(false);
      setLinkedMatchFormMode("create");
      setMessage(
        linkedMatchFormMode === "edit"
          ? "Updated the linked values. Save node to keep the link."
          : "Created a new linked entry and selected it for this node. Save node to keep the link.",
      );
    } catch (saveError) {
      setError(
        saveError?.message ||
          (linkedMatchFormMode === "edit" ? "Failed to update linked values." : "Failed to create linked entry."),
      );
    } finally {
      setCreateMatchBusy(false);
    }
  }, [createMatchForm, currentLinkedMatch, linkedMatchFormMode, poolById, selectedEventId]);

  // One-click: create a bare scheduled match and link it to this node, skipping
  // the venue/time grid. Division/pool are inferred from a pool_rank source when
  // one names them; everything else is left blank for later editing.
  const handleQuickCreateLinkedMatch = useCallback(async () => {
    if (!selectedEventId) {
      setError("Choose an event before creating a linked match.");
      return;
    }

    setCreateMatchBusy(true);
    setError("");
    setMessage("");

    try {
      const poolRankSource = [nodeForm.sourceA, nodeForm.sourceB].find(
        (source) => source?.type === "pool_rank" && (source.poolId || source.divisionId),
      );
      const inferredPool = poolRankSource?.poolId
        ? poolById.get(poolRankSource.poolId) || null
        : null;
      const divisionId =
        poolRankSource?.divisionId || inferredPool?.divisionId || null;

      const saved = await createMatch({
        eventId: selectedEventId,
        divisionId,
        poolId: inferredPool?.id || null,
        status: "scheduled",
        startTime: null,
      });

      if (!saved?.id) {
        throw new Error("Match was created but no match id was returned.");
      }

      setMatches((current) => {
        const next = [...current.filter((match) => match.id !== saved.id), saved];
        next.sort((left, right) => {
          const leftTime = left?.start_time ? new Date(left.start_time).getTime() : Number.MAX_SAFE_INTEGER;
          const rightTime = right?.start_time ? new Date(right.start_time).getTime() : Number.MAX_SAFE_INTEGER;
          return leftTime - rightTime;
        });
        return next;
      });
      setNodeForm((current) => ({ ...current, matchId: saved.id }));
      setShowCreateMatchForm(false);
      setLinkedMatchFormMode("create");
      setMessage("Created a scheduled match and linked it. Save node to keep the link.");
    } catch (saveError) {
      setError(saveError?.message || "Failed to create linked match.");
    } finally {
      setCreateMatchBusy(false);
    }
  }, [nodeForm.sourceA, nodeForm.sourceB, poolById, selectedEventId]);

  const handleSaveNode = useCallback(async () => {
    if (!selectedBracketId) {
      setError("Select a bracket before saving a node.");
      return;
    }

    setNodeBusy(true);
    setError("");
    setMessage("");

    try {
      const payloadLookups = { ...sourceLookups, currentBracketId: selectedBracketId };
      const sourceA = buildSourcePayload(nodeForm.sourceA, payloadLookups, "Source A");
      const sourceB = buildSourcePayload(nodeForm.sourceB, payloadLookups, "Source B");
      const round = toPositiveInteger(nodeForm.round, 1);
      const position = toPositiveInteger(nodeForm.position, 1);
      const name = nodeForm.name.trim() || null;

      if (selectedNodeId && sourceA.nodeId === selectedNodeId) {
        throw new Error("Source A cannot reference the same node.");
      }
      if (selectedNodeId && sourceB.nodeId === selectedNodeId) {
        throw new Error("Source B cannot reference the same node.");
      }
      if (selectedNodeId && nodeForm.advanceToWinner === selectedNodeId) {
        throw new Error("Winner advancement cannot point to the same node.");
      }
      if (selectedNodeId && nodeForm.advanceToLoser === selectedNodeId) {
        throw new Error("Loser advancement cannot point to the same node.");
      }

      const payload = {
        bracketId: selectedBracketId,
        name,
        round,
        position,
        matchId: nodeForm.matchId || null,
        sourceA,
        sourceB,
        advanceToWinner: nodeForm.advanceToWinner || null,
        advanceToWinnerSide: nodeForm.advanceToWinner ? nodeForm.advanceToWinnerSide || null : null,
        advanceToLoser: nodeForm.advanceToLoser || null,
        advanceToLoserSide: nodeForm.advanceToLoser ? nodeForm.advanceToLoserSide || null : null,
      };

      let savedNodeId = selectedNodeId;
      if (selectedNodeId) {
        await updateBracketNode(selectedNodeId, payload);
      } else {
        const created = await createBracketNode(payload);
        savedNodeId = created?.id || null;
      }

      // Keep advancement pointers in sync with the sources. A source of
      // "winner/loser of node X into slot A/B" means node X advances its
      // winner/loser here on that side — so write that pointer back onto the
      // upstream node(s), and clear any stale pointer that used to feed here.
      if (savedNodeId) {
        await syncAdvancementFromSources({
          savedNodeId,
          sourceA,
          sourceB,
          nodes: selectedBracketNodes,
        });
      }

      await loadSelectedEventData();
      if (!selectedNodeId && savedNodeId) {
        setSelectedNodeId(savedNodeId);
      }
      setMessage(
        `${selectedNodeId ? "Updated" : "Created"} node ${
          name || formatNodeFallbackLabel({ round, position })
        }.`,
      );
    } catch (saveError) {
      setError(saveError?.message || "Failed to save node.");
    } finally {
      setNodeBusy(false);
    }
  }, [loadSelectedEventData, nodeForm, selectedBracketId, selectedBracketNodes, selectedNodeId, sourceLookups]);

  const handleDeleteNode = useCallback(async () => {
    if (!selectedNodeId || !selectedNode) {
      return;
    }

    const conflicts = getNodeReferenceConflicts(selectedNodeId, selectedBracketNodes);
    if (conflicts.length) {
      setError(
        `Delete blocked. Referenced by ${conflicts
          .map((node) => getNodeDisplayName(node))
          .join(", ")}.`,
      );
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Delete node ${getNodeDisplayName(selectedNode)}?`);
      if (!confirmed) {
        return;
      }
    }

    setNodeBusy(true);
    setError("");
    setMessage("");

    try {
      await deleteBracketNode(selectedNodeId);
      await loadSelectedEventData();
      setSelectedNodeId("");
      setMessage(`Deleted node ${getNodeDisplayName(selectedNode)}.`);
    } catch (deleteError) {
      setError(deleteError?.message || "Failed to delete node.");
    } finally {
      setNodeBusy(false);
    }
  }, [loadSelectedEventData, selectedBracketNodes, selectedNode, selectedNodeId]);

  const handleResolvePlayoffs = useCallback(async () => {
    // Only the event id is needed now: the resolver loads its own hierarchy,
    // matches and brackets server-side rather than being handed this page's.
    if (!selectedEventId) {
      setError("Choose an event before resolving playoffs.");
      return;
    }

    setResolveBusy(true);
    setError("");
    setMessage("");

    try {
      // Resolution runs server-side so the manual button and the scheduled
      // sweeper share one implementation. It resolves to a fixed point, so a
      // chain whose earlier rounds are already played fills in a single call.
      const result = await requestPlayoffResolve(selectedEventId);
      await loadSelectedEventData();
      await refreshResolveStatus();
      setMessage(summarizeResolveResult(result));
    } catch (resolveError) {
      setError(resolveError?.message || "Failed to resolve playoff matches.");
    } finally {
      setResolveBusy(false);
    }
  }, [loadSelectedEventData, refreshResolveStatus, selectedEventId]);

  const handleClearPlayoffAssignments = useCallback(async () => {
    if (!selectedEventId) {
      setError("Choose an event before clearing playoff assignments.");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Clear assigned teams from all linked playoff matches for this event?");
      if (!confirmed) {
        return;
      }
    }

    setClearBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await clearBracketMatchAssignmentsForEvent({
        eventId: selectedEventId,
        brackets,
      });
      await loadSelectedEventData();
      setMessage(summarizeClearResult(result));
    } catch (clearError) {
      setError(clearError?.message || "Failed to clear playoff assignments.");
    } finally {
      setClearBusy(false);
    }
  }, [brackets, loadSelectedEventData, selectedEventId]);

  return (
    <div className="pb-8 text-ink">
      <SectionShell
        as="header"
        className="py-3"
        style={{ paddingLeft: "clamp(0.75rem, 1.5vw, 1.5rem)", paddingRight: "clamp(0.75rem, 1.5vw, 1.5rem)" }}
      >
        <Panel variant="tintedAlt" className="space-y-2 border-white/20 p-2 sm:p-3">
          <SectionHeader
            eyebrow="Admin tool"
            title="Playoff structure"
            description="Manage brackets and bracket nodes for an event, then resolve linked matches from the saved structure."
            action={
              <div className="flex flex-wrap items-center gap-1">
                <Link to="/admin" className="sc-button is-ghost">
                  Back to admin
                </Link>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="sc-button is-ghost"
                  disabled={loading}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={handleOpenTemplatePanel}
                  className="sc-button is-ghost"
                  disabled={loading || !selectedEventId}
                >
                  Start from template
                </button>
                <button
                  type="button"
                  onClick={handleClearPlayoffAssignments}
                  className="sc-button is-ghost"
                  disabled={clearBusy || loading || !selectedEventId}
                >
                  {clearBusy ? "Clearing..." : "Clear playoff assignments"}
                </button>
                <button
                  type="button"
                  onClick={handleToggleAutoResolve}
                  className={autoResolve ? "sc-button" : "sc-button is-ghost"}
                  disabled={autoResolveBusy || loading || !selectedEventId}
                  title="Fill in games automatically, without anyone opening this page: a couple of minutes after each result, and within a minute of each release time. A full sweep also runs every 6 hours as a backup."
                >
                  {autoResolveBusy
                    ? "Saving..."
                    : `Scheduled resolution: ${autoResolve ? "On" : "Off"}`}
                </button>
                <button
                  type="button"
                  onClick={handleResolvePlayoffs}
                  className="sc-button"
                  disabled={resolveBusy || clearBusy || loading || !selectedEventId}
                >
                  {resolveBusy ? "Resolving..." : "Resolve playoffs"}
                </button>
              </div>
            }
          />

          {/* Sweeper state. Surfaced because the schedule runs server-side, so
              without this the operator has no way to tell whether it ran. */}
          {selectedEventId && resolveStatus ? (
            <div className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
              {autoResolve ? (
                <Chip variant="live">Auto-resolve on</Chip>
              ) : (
                <Chip variant="ghost">Manual only</Chip>
              )}
              {resolveStatus.event?.pendingCount ? (
                <span>
                  {resolveStatus.event.pendingCount} game(s) held until their release date
                  {resolveStatus.event.nextDueAt
                    ? `, next ${formatDateTime(resolveStatus.event.nextDueAt)}`
                    : ""}
                </span>
              ) : null}
              {resolveStatus.event?.blockedCount ? (
                <span className="text-rose-200">
                  {resolveStatus.event.blockedCount} blocked - see the node list
                </span>
              ) : null}
              {resolveStatus.job?.last_attempted_at ? (
                <span>
                  {resolveStatus.job.kind === "pending" ? "Last run after results" : "Last sweep"}{" "}
                  {formatDateTime(resolveStatus.job.last_attempted_at)}
                  {resolveStatus.job.last_ok === false ? " (failed)" : ""}
                  {resolveStatus.job.last_message ? ` - ${resolveStatus.job.last_message}` : ""}
                </span>
              ) : (
                <span>No automatic run yet.</span>
              )}
            </div>
          ) : null}

          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))]">
            <Field label="Event" hint="Choose the event whose brackets you want to manage.">
              <Select
                value={selectedEventId}
                onChange={(event) => {
                  setSelectedEventId(event.target.value);
                  setMessage("");
                  setError("");
                  setIsCreatingBracket(false);
                  setSelectedBracketId("");
                  setSelectedNodeId("");
                }}
              >
                <option value="">Select event</option>
                {accessibleEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="space-y-1 rounded-2xl border border-white/15 bg-surface/60 p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Event details</p>
              <p className="text-lg font-semibold text-ink">{selectedEvent?.name || "No event selected"}</p>
              <p className="text-sm text-ink-muted">
                {selectedEvent?.start_date ? formatEventDate(selectedEvent.start_date) : "Date TBC"}
                {selectedEvent?.end_date ? ` to ${formatEventDate(selectedEvent.end_date)}` : ""}
              </p>
              <p className="text-sm text-ink-muted">{selectedEvent?.location || "Location TBC"}</p>
            </div>

            <div className="space-y-1.5 rounded-2xl border border-white/15 bg-surface/60 p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Structure stats</p>
              <div className="flex flex-wrap gap-1">
                <Chip>{stats.bracketCount} brackets</Chip>
                <Chip>{stats.nodeCount} nodes</Chip>
                <Chip>{stats.linkedMatchCount} linked matches</Chip>
              </div>
              <p className="text-sm text-ink-muted">
                {eventsLoading ? "Loading events..." : loading ? "Loading structure..." : "Ready"}
              </p>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-dashed border-rose-400/40 bg-rose-500/5 p-2 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="rounded-2xl border border-dashed border-emerald-400/40 bg-emerald-500/5 p-2 text-sm text-emerald-100">
              {message}
            </div>
          ) : null}
        </Panel>
      </SectionShell>
      {/* Full width: .sc-shell pads 4–10% on wide screens, which this
          editor needs for the bracket, schedule and node grids. Inline
          because .sc-shell is unlayered CSS and beats Tailwind utilities. */}
      <SectionShell
        as="main"
        className="space-y-3 py-3"
        style={{ paddingLeft: "clamp(0.75rem, 1.5vw, 1.5rem)", paddingRight: "clamp(0.75rem, 1.5vw, 1.5rem)" }}
      >
        {showTemplatePanel ? (
          <Panel variant="default" className="space-y-2 border-white/20 p-2">
            <SectionHeader
              title="Start from a template"
              description="Pick a standard structure, map each seed to a pool position or a team, and apply. Creates the bracket and all nodes wired together. Link matches to each game afterward, then use Resolve playoffs."
              action={
                <button
                  type="button"
                  onClick={() => setShowTemplatePanel(false)}
                  className="sc-button is-ghost text-xs"
                  disabled={applyTemplateBusy}
                >
                  Cancel
                </button>
              }
            />

            <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))]">
              <Field label="Template">
                <Select
                  value={templateId}
                  onChange={(event) => handleSelectTemplate(event.target.value)}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Bracket name">
                <Input
                  value={templateBracketName}
                  onChange={(event) => setTemplateBracketName(event.target.value)}
                  placeholder={selectedTemplate?.label || "Bracket name"}
                />
              </Field>
            </div>

            {isSwissTemplate ? (
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
                <Field label="Format">
                  <Select
                    value={swissOptions.format}
                    onChange={(event) => handleChangeSwissOption("format", event.target.value)}
                  >
                    {SWISS_FORMATS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Teams"
                  hint="Each round has teams ÷ 2 games. With an odd number, one team has a bye each round."
                >
                  <Input
                    type="number"
                    min={SWISS_MIN_TEAMS}
                    max={SWISS_MAX_TEAMS}
                    value={swissOptions.teamCount}
                    onChange={(event) => handleChangeSwissOption("teamCount", event.target.value)}
                  />
                </Field>
                {swissOptions.format === "advance" ? (
                  <>
                    <Field label="Wins to advance">
                      <Input
                        type="number"
                        min="1"
                        max={SWISS_MAX_WINS_OR_LOSSES}
                        value={swissOptions.winsToAdvance}
                        onChange={(event) => handleChangeSwissOption("winsToAdvance", event.target.value)}
                      />
                    </Field>
                    <Field
                      label="Losses to be out"
                      hint={`Up to ${Number.isFinite(swissRoundCount(swissOptions)) ? swissRoundCount(swissOptions) : "?"} rounds.`}
                    >
                      <Input
                        type="number"
                        min="1"
                        max={SWISS_MAX_WINS_OR_LOSSES}
                        value={swissOptions.lossesToExit}
                        onChange={(event) => handleChangeSwissOption("lossesToExit", event.target.value)}
                      />
                    </Field>
                  </>
                ) : (
                  <Field
                    label="Rounds"
                    hint="One column per round. Close to the maximum, the last rounds may need a rematch."
                  >
                    <Input
                      type="number"
                      min={SWISS_MIN_ROUNDS}
                      value={swissOptions.roundCount}
                      onChange={(event) => handleChangeSwissOption("roundCount", event.target.value)}
                    />
                  </Field>
                )}
                <Field label="Ranking tie-break" hint="After wins (and fewest losses).">
                  <Select
                    value={swissOptions.tiebreak}
                    onChange={(event) => handleChangeSwissOption("tiebreak", event.target.value)}
                  >
                    {SWISS_TIEBREAK_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Margin cap" hint="Most points one game adds to point difference. Blank = no cap.">
                  <Input
                    type="number"
                    min="1"
                    max={SWISS_MAX_MARGIN_CAP}
                    value={swissOptions.marginCap}
                    placeholder="No cap"
                    onChange={(event) => handleChangeSwissOption("marginCap", event.target.value)}
                  />
                </Field>
                <Field
                  label="Pair rounds"
                  hint="One round behind lets a round be published before the one in play ends."
                >
                  <Select
                    value={swissOptions.pairingLag}
                    onChange={(event) => handleChangeSwissOption("pairingLag", event.target.value)}
                    disabled={swissOptions.format === "advance"}
                  >
                    {SWISS_PAIRING_TIMING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Round 1 pairing">
                  <Select
                    value={swissOptions.firstRoundPairing}
                    onChange={(event) => handleChangeSwissOption("firstRoundPairing", event.target.value)}
                  >
                    {SWISS_FIRST_ROUND_PAIRINGS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : null}

            {swissOptionsError ? (
              <p className="text-sm text-amber-200">{swissOptionsError}</p>
            ) : null}

            {selectedTemplate ? (
              <p className="text-sm text-ink-muted">{selectedTemplate.description}</p>
            ) : null}

            {isSwissTemplate && selectedTemplate ? (
              <p className="text-sm text-ink-muted">
                Rules: {describeSwissSettings(selectedTemplate.settings)}. Ranking runs wins, fewest
                losses, the tie-break, then points scored, then round 1 seed. Once any game of a round
                has started, that round&apos;s teams stay put.
              </p>
            ) : null}

            {templateSeedRows.length ? (
              <div className="space-y-1">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {templateSeedSource === "team"
                      ? "Choose a team for each seed"
                      : templateSeedSource === "swiss"
                        ? "Seed from a Swiss draw"
                        : "Map seeds to pools"}
                  </p>
                  <Field label="Seeds come from">
                    <Select
                      value={templateSeedSource}
                      onChange={(event) => setTemplateSeedSource(event.target.value)}
                    >
                      {SEED_SOURCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {templateSeedSource === "pool" ? (
                  <p className="text-xs text-ink-muted">
                    Fills in once those pools have finished. Use chosen teams when this draw starts the event.
                  </p>
                ) : null}
                {templateSeedSource === "swiss" ? (
                  swissBracketOptions.length ? (
                    <div className="space-y-1">
                      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
                        <Field label="Swiss draw">
                          <Select
                            value={templateSwissSeed.bracketId}
                            onChange={(event) =>
                              setTemplateSwissSeed((current) => ({ ...current, bracketId: event.target.value }))
                            }
                          >
                            <option value="">Select Swiss draw</option>
                            {swissBracketOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name} ({option.teamCount} teams)
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Starting position" hint="1 for the top teams; e.g. 9 for a 9th-16th bracket.">
                          <Input
                            type="number"
                            min="1"
                            value={templateSwissSeed.startRank}
                            onChange={(event) =>
                              setTemplateSwissSeed((current) => ({ ...current, startRank: event.target.value }))
                            }
                          />
                        </Field>
                      </div>
                      <p className="text-xs text-ink-muted">
                        Seed 1 = position {toPositiveInteger(templateSwissSeed.startRank, 1)}, seed{" "}
                        {templateSeedRows.length} = position{" "}
                        {toPositiveInteger(templateSwissSeed.startRank, 1) + templateSeedRows.length - 1}. Fills
                        once every game of the Swiss draw is finished.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-ink-muted">
                      This event has no Swiss draw yet. Create one first, then seed this bracket from it.
                    </p>
                  )
                ) : !poolOptions.length ? (
                  <p className="text-sm text-ink-muted">
                    This event has no pools yet. Add divisions and pools first.
                  </p>
                ) : templateSeedSource === "team" ? (
                  <div className="grid gap-1">
                    {templateSeedRows.map((row, index) => (
                      <div
                        key={row.seed}
                        className="grid items-end gap-1 [grid-template-columns:auto_minmax(0,1fr)]"
                      >
                        <span className="pb-1 text-sm font-semibold text-ink">Seed {row.seed}</span>
                        <Field label="Team">
                          <Select
                            value={row.teamId || ""}
                            onChange={(event) =>
                              setTemplateSeedRows((rows) =>
                                rows.map((entry, i) =>
                                  i === index ? { ...entry, teamId: event.target.value } : entry,
                                ),
                              )
                            }
                          >
                            <option value="">Select team</option>
                            {teamOptions.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-1">
                    {templateSeedRows.map((row, index) => (
                      <div
                        key={row.seed}
                        className="grid items-end gap-1 [grid-template-columns:auto_minmax(0,1fr)_5rem]"
                      >
                        <span className="pb-1 text-sm font-semibold text-ink">Seed {row.seed}</span>
                        <Field label="Pool">
                          <Select
                            value={row.poolId}
                            onChange={(event) =>
                              setTemplateSeedRows((rows) =>
                                rows.map((entry, i) =>
                                  i === index ? { ...entry, poolId: event.target.value } : entry,
                                ),
                              )
                            }
                          >
                            <option value="">Select pool</option>
                            {poolOptions.map((pool) => (
                              <option key={pool.id} value={pool.id}>
                                {pool.name} ({pool.divisionName})
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Rank">
                          <Input
                            type="number"
                            min="1"
                            value={row.rank}
                            onChange={(event) =>
                              setTemplateSeedRows((rows) =>
                                rows.map((entry, i) =>
                                  i === index ? { ...entry, rank: event.target.value } : entry,
                                ),
                              )
                            }
                          />
                        </Field>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {selectedTemplate ? (
              <div className="space-y-0.5 rounded-2xl border border-white/15 bg-surface/60 p-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {selectedTemplate.nodes.filter((node) => node.sourceB?.kind !== "bye").length} games
                  {selectedTemplate.nodes.some((node) => node.sourceB?.kind === "bye")
                    ? ` + ${selectedTemplate.nodes.filter((node) => node.sourceB?.kind === "bye").length} bye slots`
                    : ""}
                </p>
                {/* A Swiss draw can run to hundreds of games, and every game
                    after round 1 reads the same, so preview round 1 only. */}
                {(selectedTemplate.configurable
                  ? selectedTemplate.nodes.filter((node) => node.round === 1)
                  : selectedTemplate.nodes
                ).map((node) => (
                  <p key={node.key} className="text-xs text-ink-muted">
                    <span className="text-ink">{node.name}:</span>{" "}
                    {formatTemplateSource(node.sourceA)} vs {formatTemplateSource(node.sourceB)}
                  </p>
                ))}
                {selectedTemplate.configurable ? (
                  <p className="text-xs text-ink-muted">
                    <span className="text-ink">Rounds 2 to {swissRoundCount(swissOptions)}:</span>{" "}
                    up to {Math.floor(selectedTemplate.seedCount / 2)} games each, paired from results.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2">
              <button
                type="button"
                onClick={handleApplyTemplate}
                className="sc-button"
                disabled={
                  applyTemplateBusy ||
                  !selectedEventId ||
                  // Swiss standings seed without pools; the other sources need them.
                  (templateSeedSource !== "swiss" && !poolOptions.length) ||
                  Boolean(swissOptionsError)
                }
              >
                {applyTemplateBusy ? "Applying..." : "Apply template"}
              </button>
            </div>
          </Panel>
        ) : null}
        {/* Brackets list stretches to the height of its neighbour column
            (Edit bracket + Release schedule); Nodes then run full width
            underneath both. */}
        <div className="grid items-stretch gap-2 xl:grid-cols-[minmax(17rem,19rem)_minmax(0,1fr)]">
          <Panel variant="default" className="h-full space-y-2 border-white/20 p-2">
            <SectionHeader
              title="Brackets"
              description="Pick a bracket to edit its details and nodes."
              action={
                <button type="button" onClick={handleStartNewBracket} className="sc-button is-ghost text-xs">
                  New bracket
                </button>
              }
            />

            {!selectedEventId ? (
              <Panel variant="muted" className="p-2 text-sm text-ink-muted">
                Choose an event to load its playoff structure.
              </Panel>
            ) : null}

            {selectedEventId && !brackets.length ? (
              <Panel variant="muted" className="p-2 text-sm text-ink-muted">
                No brackets linked to this event yet.
              </Panel>
            ) : null}

            <div className="grid gap-1">
              {brackets.map((bracket) => {
                const selected = bracket.id === selectedBracketId;
                return (
                  <button
                    key={bracket.id}
                    type="button"
                    onClick={() => {
                      setIsCreatingBracket(false);
                      setSelectedBracketId(bracket.id);
                      setSelectedNodeId("");
                      setMessage("");
                      setError("");
                    }}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      selected
                        ? "border-emerald-400/45 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(52,211,153,0.08)]"
                        : "border-white/15 bg-surface/70 hover:border-emerald-400/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-ink">{bracket.name || "Unnamed bracket"}</p>
                        <p className="text-xs text-ink-muted">{formatBracketType(bracket.type)}</p>
                      </div>
                      <Chip>{bracket.nodes?.length || 0} nodes</Chip>
                    </div>
                    {bracket.is_locked ? (
                      <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-amber-200">Locked</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Panel>

          <div className="space-y-3">
            <Panel variant="default" className="space-y-2 border-white/20 p-2">
              <SectionHeader
                title={selectedBracketId ? "Edit bracket" : "New bracket"}
                description="Brackets are event-level containers. Save the bracket before adding nodes."
                action={
                  selectedBracketId ? (
                    <button
                      type="button"
                      onClick={handleDeleteBracket}
                      className="sc-button sc-button-danger"
                      disabled={bracketBusy}
                    >
                      Delete bracket
                    </button>
                  ) : null
                }
              />

              {selectedBracket?.type === "swiss" ? (
                <p className="text-xs text-ink-muted">
                  <span className="font-semibold text-ink">Swiss rules:</span>{" "}
                  {describeSwissSettings(selectedBracket.settings)}. Set when the draw was created; to change
                  them, create a new draw.
                </p>
              ) : null}

              <div className="grid gap-2 md:grid-cols-3">
                <Field label="Bracket name">
                  <Input
                    value={bracketForm.name}
                    onChange={(event) => setBracketForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Open playoff"
                  />
                </Field>

                <Field label="Type">
                  <Select
                    value={bracketForm.type}
                    onChange={(event) => setBracketForm((current) => ({ ...current, type: event.target.value }))}
                  >
                    {BRACKET_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Locked">
                  <Select
                    value={bracketForm.isLocked ? "locked" : "open"}
                    onChange={(event) =>
                      setBracketForm((current) => ({
                        ...current,
                        isLocked: event.target.value === "locked",
                      }))
                    }
                  >
                    <option value="open">Open</option>
                    <option value="locked">Locked</option>
                  </Select>
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={handleSaveBracket}
                  className="sc-button"
                  disabled={bracketBusy || !selectedEventId}
                >
                  {bracketBusy ? "Saving..." : "Save bracket"}
                </button>
                {selectedBracket ? (
                  <p className="text-sm text-ink-muted">
                    {selectedBracket.nodes?.length || 0} node{selectedBracket.nodes?.length === 1 ? "" : "s"} linked
                  </p>
                ) : null}
              </div>

              {/* Feedback repeated here: the page-level banners live in the
                  header, which is scrolled well out of view by the time the
                  operator is working in this panel. */}
              {error ? (
                <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-100">
                  {error}
                </p>
              ) : null}
              {!error && message ? (
                <p className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100">
                  {message}
                </p>
              ) : null}
            </Panel>

            {/* Release schedules. Full width and above the node editor: this
                used to sit inside the narrow Nodes sidebar under the node
                list, where it was easy to miss entirely. A schedule is "these
                games may fill in at this time" — an arbitrary group of nodes,
                not a round, and as many per event as the director needs. */}
            {selectedBracketId && selectedBracketNodes.length ? (
              <Panel variant="default" className="space-y-1.5 border-white/20 p-2">
                <SectionHeader
                  title="Release schedule"
                  description={
                    autoResolve
                      ? "Dates when groups of games fill in their teams. Each group is released within about a minute of its time (your local time)."
                      : "Dates when groups of games fill in their teams. Turn on scheduled resolution above for these to run automatically."
                  }
                  action={
                    <button
                      type="button"
                      className="sc-button is-ghost text-xs"
                      onClick={handleAddSchedule}
                      disabled={scheduleBusy === "new"}
                    >
                      {scheduleBusy === "new" ? "Adding..." : "Add date"}
                    </button>
                  }
                />

                {!bracketSchedules.length ? (
                  <p className="rounded-xl border border-dashed border-white/15 px-2 py-1.5 text-xs text-ink-muted">
                    No release dates yet. Without one this bracket fills in as soon as its
                    results are in.
                  </p>
                ) : null}

                <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(20rem,1fr))]">
                  {bracketSchedules.map((schedule) => {
                    const draft = scheduleDrafts[schedule.id] || {};
                    const selectedIds = draft.nodeIds ?? schedule.node_ids ?? [];
                    const busy = scheduleBusy === schedule.id;
                    const day = draft.day ?? toDayInputValue(schedule.resolve_at);
                    return (
                      <div
                        key={schedule.id}
                        className="space-y-1 rounded-xl border border-white/10 bg-surface/50 p-1.5"
                      >
                        <div className="flex flex-wrap items-end gap-1.5">
                          <input
                            type="text"
                            placeholder="Name (e.g. Semifinals)"
                            className="sc-input is-compact min-w-[9rem] flex-1"
                            value={draft.label ?? schedule.label ?? ""}
                            onChange={(changeEvent) =>
                              updateScheduleDraft(schedule.id, { label: changeEvent.target.value })
                            }
                          />
                          <input
                            type="date"
                            className="sc-input is-compact min-w-[8rem] flex-1"
                            value={day}
                            onChange={(changeEvent) =>
                              updateScheduleDraft(schedule.id, { day: changeEvent.target.value })
                            }
                          />
                          <input
                            type="time"
                            className="sc-input is-compact min-w-[6.5rem]"
                            value={draft.time ?? toTimeInputValue(schedule.resolve_at)}
                            onChange={(changeEvent) =>
                              updateScheduleDraft(schedule.id, { time: changeEvent.target.value })
                            }
                          />
                          <button
                            type="button"
                            className="sc-button is-ghost text-xs"
                            disabled={busy}
                            onClick={() => handleSaveSchedule(schedule)}
                          >
                            {busy ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            className="sc-button is-ghost text-xs"
                            disabled={busy}
                            onClick={() => handleDeleteSchedule(schedule.id)}
                          >
                            Remove
                          </button>
                        </div>

                        <p className="text-[0.7rem] font-medium uppercase tracking-wide text-ink-muted">
                          Select the nodes that will be updated
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedBracketNodes.map((node) => {
                            const checked = selectedIds.includes(node.id);
                            return (
                              <button
                                key={node.id}
                                type="button"
                                onClick={() => toggleScheduleNode(schedule, node.id)}
                                aria-pressed={checked}
                                className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
                                  checked
                                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                                    : "border-white/20 bg-surface/60 text-ink-muted hover:border-emerald-400/40 hover:text-ink"
                                }`}
                              >
                                {checked ? <span aria-hidden="true">✓</span> : null}
                                {getNodeDisplayName(node)}
                              </button>
                            );
                          })}
                        </div>

                        <p className="text-[0.7rem] text-ink-muted">
                          {selectedIds.length} game{selectedIds.length === 1 ? "" : "s"} covered
                          {schedule.enabled === false ? " · disabled" : ""}
                          {selectedIds.length === 0
                            ? " · pick the games this date releases"
                            : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            ) : null}
          </div>
        </div>

            <div className="grid items-start gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,40rem)]">
              <Panel variant="default" className="self-start space-y-2 border-white/20 p-2">
                <SectionHeader
                  title="Nodes"
                  description="Each node maps to one scheduled playoff match."
                  action={
                    <button type="button" onClick={handleStartNewNode} className="sc-button is-ghost text-xs">
                      Add new node
                    </button>
                  }
                />

                {!selectedBracketId ? (
                  <Panel variant="muted" className="p-2 text-sm text-ink-muted">
                    Save or select a bracket first.
                  </Panel>
                ) : null}

                {selectedBracketId && !selectedBracketNodes.length ? (
                  <Panel variant="muted" className="p-2 text-sm text-ink-muted">
                    No nodes in this bracket yet.
                  </Panel>
                ) : null}

                <div className="grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))]">
                  {selectedBracketNodes.map((node) => {
                    const selected = node.id === selectedNodeId;
                    const sourceSummary = `${formatSourceLabel(node.source_a, sourceLookups)} vs ${formatSourceLabel(
                      node.source_b,
                      sourceLookups,
                    )}`;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => {
                          setSelectedNodeId(node.id);
                          setMessage("");
                          setError("");
                        }}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                          selected
                            ? "border-emerald-400/45 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(52,211,153,0.08)]"
                            : "border-white/15 bg-surface/70 hover:border-emerald-400/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="space-y-0.5">
                            <p className="text-sm font-semibold text-ink">{getNodeDisplayName(node)}</p>
                            <p className="text-xs text-ink-muted">{sourceSummary}</p>
                            <p className="text-xs text-ink-muted">
                              Round {node.round ?? "--"} · Position {node.position ?? "--"}
                            </p>
                            {/* Why this node did or did not fill in. Without
                                this the operator has to guess, which is what
                                made the old manual flow opaque. */}
                            {describeNodeResolveState(
                              node,
                              scheduleByNodeId.get(node.id) || null,
                            ).map((chip) => (
                              <span
                                key={chip.key}
                                className={`mt-0.5 mr-1 inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${chip.className}`}
                              >
                                {chip.label}
                              </span>
                            ))}
                          </div>
                          <span className="text-xs font-medium text-emerald-200">Edit</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Panel>
              <Panel variant="default" className="self-start scroll-mt-4 space-y-2 border-white/20 p-2">
                <span ref={nodeEditorRef} className="block scroll-mt-4" aria-hidden="true" />
                <SectionHeader
                  title={isEditingNode ? "Edit node" : "Add new node"}
                  description="Name the game and set its two teams. Placement and advancement are under Advanced."
                  action={
                    isEditingNode ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={handleStartNewNode}
                          className="sc-button is-ghost"
                          disabled={nodeBusy}
                        >
                          Add new node
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteNode}
                          className="sc-button sc-button-danger"
                          disabled={nodeBusy}
                        >
                          Delete node
                        </button>
                      </div>
                    ) : null
                  }
                />

                {!selectedBracketId ? (
                  <Panel variant="muted" className="p-2 text-sm text-ink-muted">
                    Nodes can only be created after a bracket exists.
                  </Panel>
                ) : (
                  <>
                    <EditorSection
                      step="1"
                      title="Game"
                      description="Name the game and link the match that holds its score."
                      tone="basics"
                    >
                      <Field label="Game name">
                        <Input
                          value={nodeForm.name}
                          onChange={(event) => setNodeForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Open 1v2"
                        />
                      </Field>
                      {!nodeForm.matchId ? (
                        <button
                          type="button"
                          onClick={handleQuickCreateLinkedMatch}
                          className="sc-button w-full sm:w-auto"
                          disabled={createMatchBusy || !selectedEventId}
                        >
                          {createMatchBusy ? "Creating..." : "Create & link match"}
                        </button>
                      ) : null}
                      <Field
                        label="Linked match"
                        hint="A one-click match is created as a blank scheduled game. Use Details to set venue and time."
                        action={
                          <div className="flex flex-wrap items-center gap-1.5">
                            {nodeForm.matchId ? (
                              <>
                                <Link
                                  to={matchPath(nodeForm.matchId)}
                                  className="text-xs text-emerald-200 underline-offset-2 hover:underline"
                                >
                                  Open
                                </Link>
                                <button
                                  type="button"
                                  onClick={openEditLinkedForm}
                                  className="text-xs text-emerald-200 underline-offset-2 hover:underline"
                                >
                                  Details
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={handleToggleLinkedMatchForm}
                                className="text-xs text-emerald-200 underline-offset-2 hover:underline"
                              >
                                {showCreateMatchForm && linkedMatchFormMode === "create" ? "Hide" : "Create with details"}
                              </button>
                            )}
                          </div>
                        }
                      >
                        <Select
                          value={nodeForm.matchId}
                          onChange={(event) => setNodeForm((current) => ({ ...current, matchId: event.target.value }))}
                        >
                          <option value="">No linked match</option>
                          {matchOptions.map((match) => (
                            <option key={match.id} value={match.id}>
                              {match.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </EditorSection>

                    {showCreateMatchForm ? (
                      <EditorSection
                        step="1a"
                        title={linkedMatchFormMode === "edit" ? "Edit linked values" : "Create linked"}
                        description={
                          linkedMatchFormMode === "edit"
                            ? "Edit the selected linked values here, then save the node if the link should remain."
                            : "Create a scheduled shell for this node, then save the node to persist the link."
                        }
                        tone="linked"
                      >
                        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
                          <Field label="Division">
                            <Select
                              value={createMatchForm.divisionId}
                              onChange={(event) =>
                                setCreateMatchForm((current) => ({
                                  ...current,
                                  divisionId: event.target.value,
                                  poolId: "",
                                }))
                              }
                              disabled={createMatchBusy}
                            >
                              <option value="">No division</option>
                              {divisionOptions.map((division) => (
                                <option key={division.id} value={division.id}>
                                  {division.name}
                                </option>
                              ))}
                            </Select>
                          </Field>

                          <Field label="Pool">
                            <Select
                              value={createMatchForm.poolId}
                              onChange={(event) =>
                                setCreateMatchForm((current) => ({
                                  ...current,
                                  poolId: event.target.value,
                                }))
                              }
                              disabled={createMatchBusy}
                            >
                              <option value="">No pool</option>
                              {createMatchPoolOptions.map((pool) => (
                                <option key={pool.id} value={pool.id}>
                                  {pool.divisionName ? `${pool.divisionName} - ` : ""}
                                  {pool.name}
                                </option>
                              ))}
                            </Select>
                          </Field>

                          <Field label="Venue">
                            <Select
                              value={createMatchForm.venueId}
                              onChange={(event) =>
                                setCreateMatchForm((current) => ({
                                  ...current,
                                  venueId: event.target.value,
                                }))
                              }
                              disabled={createMatchBusy}
                            >
                              <option value="">Venue TBC</option>
                              {venueOptions.map((venue) => (
                                <option key={venue.id} value={venue.id}>
                                  {venue.name}
                                </option>
                              ))}
                            </Select>
                          </Field>

                          <Field label="Start time">
                            <Input
                              type="datetime-local"
                              value={createMatchForm.startTime}
                              onChange={(event) =>
                                setCreateMatchForm((current) => ({
                                  ...current,
                                  startTime: event.target.value,
                                }))
                              }
                              disabled={createMatchBusy}
                            />
                          </Field>

                          <Field label="Status">
                            <Select
                              value={createMatchForm.status}
                              onChange={(event) =>
                                setCreateMatchForm((current) => ({
                                  ...current,
                                  status: event.target.value,
                                }))
                              }
                              disabled={createMatchBusy}
                            >
                              {LINKED_MATCH_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={handleSaveLinkedMatch}
                            className="sc-button is-ghost"
                            disabled={createMatchBusy}
                          >
                            {createMatchBusy
                              ? linkedMatchFormMode === "edit"
                                ? "Saving..."
                                : "Creating..."
                              : linkedMatchFormMode === "edit"
                                ? "Save"
                                : "Create and select"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowCreateMatchForm(false);
                              setLinkedMatchFormMode("create");
                            }}
                            className="sc-button is-ghost"
                            disabled={createMatchBusy}
                          >
                            Cancel
                          </button>
                        </div>
                      </EditorSection>
                    ) : null}

                    <EditorSection
                      step="2"
                      title="Participants"
                      description="Define where each side of the node should resolve from."
                      tone="participants"
                      className="p-2"
                    >
                      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))]">
                        <SourceEditor
                          label="Source A"
                          value={nodeForm.sourceA}
                          onChange={(nextValue) => setNodeForm((current) => ({ ...current, sourceA: nextValue }))}
                          divisions={divisionOptions}
                          pools={poolOptions}
                          nodeOptions={nodeOptions}
                          teamOptions={teamOptions}
                          currentNodeId={selectedNodeId}
                          swissBrackets={swissBracketOptions.filter((option) => option.id !== selectedBracketId)}
                        />
                        <SourceEditor
                          label="Source B"
                          value={nodeForm.sourceB}
                          onChange={(nextValue) => setNodeForm((current) => ({ ...current, sourceB: nextValue }))}
                          divisions={divisionOptions}
                          pools={poolOptions}
                          nodeOptions={nodeOptions}
                          teamOptions={teamOptions}
                          currentNodeId={selectedNodeId}
                          swissBrackets={swissBracketOptions.filter((option) => option.id !== selectedBracketId)}
                        />
                      </div>
                    </EditorSection>

                    <EditorSection
                      step="3"
                      title="Placement"
                      description="Where this game sits on the bracket. Set automatically from where you add the game."
                      tone="advancement"
                    >
                      <p className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-2 py-1.5 text-sm text-ink">
                        <span className="font-semibold text-emerald-200">Final round:</span> if this game is in
                        the last round, its position sets the final standings. Order the last-round games
                        from the top place down: the game at position 1 decides 1st and 2nd, position 2
                        decides 3rd and 4th, and so on.
                      </p>

                      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))]">
                        <Field label="Round" hint="Bracket column (auto-set).">
                          <Input
                            type="number"
                            min="1"
                            value={nodeForm.round}
                            onChange={(event) => setNodeForm((current) => ({ ...current, round: event.target.value }))}
                          />
                        </Field>
                        <Field label="Position" hint="Order within the column (auto-set).">
                          <Input
                            type="number"
                            min="1"
                            value={nodeForm.position}
                            onChange={(event) =>
                              setNodeForm((current) => ({ ...current, position: event.target.value }))
                            }
                          />
                        </Field>
                      </div>

                      <details className="group rounded-xl border border-amber-300/30 bg-amber-500/10 p-2">
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-ink">
                          Advancement (optional)
                          <span
                            aria-hidden="true"
                            className="ml-auto text-xs text-amber-200 transition-transform group-open:rotate-180"
                          >
                            ▼
                          </span>
                        </summary>
                      <p className="mt-1 text-xs text-ink-muted">
                        Advancement is wired automatically: when a game&rsquo;s Source A/B is set to
                        &ldquo;winner/loser of&rdquo; another game, that game&rsquo;s winner/loser pointer is
                        filled in for you. These fields are a manual override for unusual structures.
                      </p>

                      <div className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))]">
                        <div className="space-y-2">
                          <div className="space-y-0.5">
                            <p className="text-sm font-semibold text-ink">Winner advancement</p>
                            <p className="text-xs text-ink-muted">Optional target for the winner of this node.</p>
                          </div>
                          <Field label="Target node">
                            <Select
                              value={nodeForm.advanceToWinner}
                              onChange={(event) =>
                                setNodeForm((current) => ({
                                  ...current,
                                  advanceToWinner: event.target.value,
                                }))
                              }
                            >
                              <option value="">No target</option>
                              {nodeOptions
                                .filter((node) => node.id !== selectedNodeId)
                                .map((node) => (
                                  <option key={node.id} value={node.id}>
                                    {node.label}
                                  </option>
                                ))}
                            </Select>
                          </Field>
                          <Field label="Winner side">
                            <Select
                              value={nodeForm.advanceToWinnerSide}
                              onChange={(event) =>
                                setNodeForm((current) => ({
                                  ...current,
                                  advanceToWinnerSide: event.target.value,
                                }))
                              }
                            >
                              {SIDE_OPTIONS.map((option) => (
                                <option key={option.value || "none"} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>

                        <div className="space-y-2">
                          <div className="space-y-0.5">
                            <p className="text-sm font-semibold text-ink">Loser advancement</p>
                            <p className="text-xs text-ink-muted">Optional target for the loser of this node.</p>
                          </div>
                          <Field label="Target node">
                            <Select
                              value={nodeForm.advanceToLoser}
                              onChange={(event) =>
                                setNodeForm((current) => ({
                                  ...current,
                                  advanceToLoser: event.target.value,
                                }))
                              }
                            >
                              <option value="">No target</option>
                              {nodeOptions
                                .filter((node) => node.id !== selectedNodeId)
                                .map((node) => (
                                  <option key={node.id} value={node.id}>
                                    {node.label}
                                  </option>
                                ))}
                            </Select>
                          </Field>
                          <Field label="Loser side">
                            <Select
                              value={nodeForm.advanceToLoserSide}
                              onChange={(event) =>
                                setNodeForm((current) => ({
                                  ...current,
                                  advanceToLoserSide: event.target.value,
                                }))
                              }
                            >
                              {SIDE_OPTIONS.map((option) => (
                                <option key={option.value || "none"} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                      </div>
                      </details>
                    </EditorSection>

                    <section className="flex flex-wrap items-center gap-1 border-t border-border pt-2">
                      <button type="button" onClick={handleSaveNode} className="sc-button" disabled={nodeBusy}>
                        {nodeBusy ? "Saving..." : "Save node"}
                      </button>
                      <p className="text-sm text-ink-muted">
                        Nodes drive bracket resolution. Keep the match assignment here, not in custom page code.
                      </p>
                    </section>
                  </>
                )}
              </Panel>
            </div>

        {selectedBracket?.type === "swiss" ? (
          <SwissStandingsPanel
            summary={(resolveStatus?.event?.swiss || []).find(
              (entry) => entry.bracketId === selectedBracket.id,
            )}
            statusError={resolveStatus?.event?.swissError || ""}
          />
        ) : null}

        {selectedBracket ? (
          <Panel variant="default" className="space-y-2 border-white/20 p-2">
            <SectionHeader
              title="Visual bracket"
              description="The selected bracket, drawn as it plays out. Lines follow winners and losers to their next game. Click a game to edit it, or add a game to any round."
              action={
                <span className="text-sm font-semibold text-ink">
                  {selectedBracket.name || "Untitled bracket"}
                </span>
              }
            />
            {/* Wide screens: interactive canvas with connector lines. */}
            <div className="hidden lg:block">
              <BracketCanvas
                bracket={selectedBracket}
                lookups={summarySourceLookups}
                selectedNodeId={selectedNodeId}
                onSelectNode={handleSelectNodeFromCanvas}
                onAddInColumn={handleAddInColumn}
                schedules={bracketSchedules}
              />
            </div>
            {/* Narrow screens: compact tap-to-edit stack. */}
            <div className="space-y-1 lg:hidden">
              {!selectedBracketNodes.length ? (
                <p className="text-xs text-ink-muted">No games in this bracket yet.</p>
              ) : (
                selectedBracketNodes.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => handleSelectNodeFromCanvas(node.id)}
                    className={`block w-full rounded-xl border px-3 py-2 text-left transition ${
                      node.id === selectedNodeId
                        ? "border-emerald-400/45 bg-emerald-500/10"
                        : "border-white/15 bg-surface/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium text-ink">{getNodeDisplayName(node)}</span>
                      <span className="text-xs text-ink-muted">
                        Round {node.round ?? "--"} · Pos {node.position ?? "--"}
                      </span>
                    </div>
                    <BracketSummaryNodeBody node={node} lookups={summarySourceLookups} />
                  </button>
                ))
              )}
            </div>
          </Panel>
        ) : null}
      </SectionShell>
    </div>
  );
}

