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
import { defaultSeedMap, getTemplateById, listTemplates } from "../data/bracketTemplates";
import BracketCanvas from "./playoff/BracketCanvas";
import {
  formatAdvancementTarget,
  formatMatchStatus,
  formatMatchup,
  formatNodeFallbackLabel,
  formatSourceLabel,
  getNodeDisplayName,
  groupNodesByRound,
  nextSlotForColumn,
  roundColumnLabel,
} from "./playoff/bracketFormat";

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
];
const SOURCE_TYPES = [
  { value: "pool_rank", label: "Pool or division rank" },
  { value: "winner", label: "Winner of node" },
  { value: "loser", label: "Loser of node" },
  { value: "static_team", label: "Static team" },
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

// The sweeper runs EVERY 6 HOURS, on SERVER TIME (pg_cron fires in UTC):
// 00:00, 06:00, 12:00, 18:00 UTC — see
// supabase/migrations/*_playoff_auto_resolve.sql.
//
// South Africa (SAST) is UTC+2 and has no daylight saving, so for local users
// those sweeps land at 02:00, 08:00, 14:00 and 20:00. The times the dropdown
// offers are derived from the UTC grid rather than hardcoded, so they stay
// correct for an operator in any timezone.
//
// A release time between those points does not take effect until the next one,
// so letting an operator type 14:30 and watch nothing happen until 16:00 SAST
// would be misleading. The UI therefore only ever offers real sweep times.
const SWEEP_INTERVAL_HOURS = 6;

/** The sweep times of one local day, as Date objects. */
function buildSweepTimesForDay(dayValue) {
  const base = dayValue ? new Date(`${dayValue}T00:00`) : null;
  if (!base || Number.isNaN(base.getTime())) {
    return [];
  }

  const times = [];
  // Walk UTC sweep points across a 48-hour window and keep the ones that land
  // on the requested local day — the UTC grid does not align to local midnight
  // in every timezone (SAST is +02:00, so sweeps fall at 02:00/08:00/14:00/20:00).
  const startUtc = Date.UTC(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    0,
    0,
    0,
    0,
  );
  for (let hour = -24; hour <= 48; hour += SWEEP_INTERVAL_HOURS) {
    const candidate = new Date(startUtc + hour * 3600 * 1000);
    const aligned = new Date(candidate);
    aligned.setUTCMinutes(0, 0, 0);
    aligned.setUTCHours(Math.floor(aligned.getUTCHours() / SWEEP_INTERVAL_HOURS) * SWEEP_INTERVAL_HOURS);
    if (
      aligned.getFullYear() === base.getFullYear() &&
      aligned.getMonth() === base.getMonth() &&
      aligned.getDate() === base.getDate() &&
      !times.some((existing) => existing.getTime() === aligned.getTime())
    ) {
      times.push(aligned);
    }
  }

  return times.sort((left, right) => left - right);
}

/** Local date key (YYYY-MM-DD) for a timestamp, for the date input. */
function toDayInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The sweep times as they read on THIS operator's clock, e.g.
 * "02:00, 08:00, 14:00, 20:00". Derived rather than hardcoded so a TD working
 * from another timezone is not told SAST times that contradict the dropdown
 * in front of them.
 */
function describeLocalSweepTimes() {
  const today = new Date();
  const times = buildSweepTimesForDay(toDayInputValue(today)).map(toTimeInputValue);
  return times.join(", ");
}

/** Local HH:mm for a timestamp, matching the option values below. */
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

  if (!node?.match_id) {
    chips.push({
      key: "no-match",
      label: "No match linked",
      className: "border border-amber-300/35 bg-amber-500/10 text-amber-200",
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
  return "?";
}

function buildSourcePayload(sourceForm, lookups, label) {
  const type = normalizeText(sourceForm?.type) || "pool_rank";

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
    </div>
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
  const toneClasses = {
    default: "border border-white/15 bg-surface/40",
    basics: "border border-white/10 bg-white/[0.03]",
    linked: "border border-sky-400/25 bg-sky-500/10",
    participants: "border border-emerald-400/20 bg-emerald-500/8",
    advancement: "border border-amber-300/25 bg-amber-500/10",
  };

  return (
    <section className={`space-y-4 rounded-2xl p-4 ${toneClasses[tone] || toneClasses.default} ${className}`.trim()}>
      <div className="flex flex-wrap items-start gap-1.5">
        {step ? (
          <span
            className={`inline-flex min-w-[2rem] items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200 ${stepClassName}`.trim()}
          >
            {step}
          </span>
        ) : null}
        <div className="space-y-0.5">
          <p className={`text-sm font-semibold text-ink ${titleClassName}`.trim()}>{title}</p>
          {description ? <p className={`text-xs text-ink-muted ${descriptionClassName}`.trim()}>{description}</p> : null}
        </div>
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

// A single node rendered as an always-expanded card for the wide bracket view.
function BracketSummaryNodeCard({ node, lookups }) {
  return (
    <div className="rounded-xl border border-white/15 bg-surface/70 px-1.5 py-1">
      <div className="mb-0.5 flex items-baseline justify-between gap-1">
        <span className="text-sm font-medium text-ink">{getNodeDisplayName(node)}</span>
        <span className="text-[0.65rem] text-ink-muted">Pos {node.position ?? "--"}</span>
      </div>
      <BracketSummaryNodeBody node={node} lookups={lookups} />
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
      // Default to the next real sweep after tomorrow, so a new row is never
      // born already-due (which would release its games on the very next
      // sweep) and never carries a time the sweeper does not actually run at.
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const sweeps = buildSweepTimesForDay(toDayInputValue(tomorrow));
      const defaultAt = (
        sweeps.find((sweep) => sweep.getTime() > Date.now()) ||
        sweeps[0] ||
        new Date(Date.now() + 6 * 60 * 60 * 1000)
      ).toISOString();
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

        // Snap to a real sweep time: if the chosen one is not in the day's
        // list (a changed date can orphan the previous selection), fall back
        // to that day's first sweep rather than writing a time that would sit
        // idle until the next one.
        const sweeps = buildSweepTimesForDay(day);
        if (!sweeps.length) {
          throw new Error("That date has no sweep times.");
        }
        const wanted = draft.time ?? toTimeInputValue(schedule.resolve_at);
        const chosen =
          sweeps.find((sweep) => toTimeInputValue(sweep) === wanted) || sweeps[0];

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

    if (!selectedBracketId || !brackets.some((bracket) => bracket.id === selectedBracketId)) {
      setSelectedBracketId(brackets[0].id);
    }
  }, [brackets, selectedBracketId]);

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
      (eventData?.venues || []).map((venue) => ({
        id: venue.id,
        name: formatVenueLabel(venue),
      })),
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

  const sourceLookups = useMemo(
    () => ({
      divisionById,
      poolById,
      teamById,
      nodeById,
    }),
    [divisionById, nodeById, poolById, teamById],
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
    }),
    [allNodesById, divisionById, poolById, teamById],
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
  const selectedTemplate = useMemo(() => getTemplateById(templateId), [templateId]);

  // Build the default seed -> pool/rank rows for a template using cross-pool
  // seeding over the event's actual pools.
  const buildSeedRows = useCallback(
    (template) => {
      if (!template) return [];
      const map = defaultSeedMap(template.seedCount, poolOptions);
      return Array.from({ length: template.seedCount }, (_, index) => {
        const seedNumber = index + 1;
        const preset = map[seedNumber] || { poolIndex: 0, rank: seedNumber };
        const pool = poolOptions[preset.poolIndex] || null;
        return {
          seed: seedNumber,
          poolId: pool?.id || "",
          rank: String(preset.rank || 1),
        };
      });
    },
    [poolOptions],
  );

  const handleSelectTemplate = useCallback(
    (id) => {
      setTemplateId(id);
      const template = getTemplateById(id);
      setTemplateBracketName(template?.label || "");
      setTemplateSeedRows(buildSeedRows(template));
    },
    [buildSeedRows],
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
    const template = getTemplateById(templateId);
    if (!template) {
      setError("Choose a template.");
      return;
    }

    // Turn each seed row into a concrete pool_rank source payload, matching the
    // shape buildSourcePayload produces for hand-authored pool_rank sources.
    const seedMap = {};
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
    loadSelectedEventData,
    poolById,
    selectedEventId,
    templateBracketName,
    templateId,
    templateSeedRows,
  ]);

  const handleRefresh = useCallback(async () => {
    setMessage("");
    await loadSelectedEventData();
  }, [loadSelectedEventData]);

  const handleStartNewBracket = useCallback(() => {
    setMessage("");
    setError("");
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
      const sourceA = buildSourcePayload(nodeForm.sourceA, sourceLookups, "Source A");
      const sourceB = buildSourcePayload(nodeForm.sourceB, sourceLookups, "Source B");
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
      <SectionShell as="header" className="py-3">
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
                  title="Release games on their scheduled dates automatically, without anyone opening this page. Sweeps every 6 hours."
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
                  Last sweep {formatDateTime(resolveStatus.job.last_attempted_at)}
                  {resolveStatus.job.last_ok === false ? " (failed)" : ""}
                  {resolveStatus.job.last_message ? ` - ${resolveStatus.job.last_message}` : ""}
                </span>
              ) : (
                <span>No scheduled sweep has run yet.</span>
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
      <SectionShell as="main" className="space-y-3 py-3">
        {showTemplatePanel ? (
          <Panel variant="default" className="space-y-2 border-white/20 p-2">
            <SectionHeader
              title="Start from a template"
              description="Pick a standard structure, map each seed to a pool, and apply. Creates the bracket and all nodes wired together. Link matches to each game afterward, then use Resolve playoffs."
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

            {selectedTemplate ? (
              <p className="text-sm text-ink-muted">{selectedTemplate.description}</p>
            ) : null}

            {templateSeedRows.length ? (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Map seeds to pools
                </p>
                {!poolOptions.length ? (
                  <p className="text-sm text-ink-muted">
                    This event has no pools yet. Add divisions and pools first.
                  </p>
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
                  {selectedTemplate.nodes.length} games
                </p>
                {selectedTemplate.nodes.map((node) => (
                  <p key={node.key} className="text-xs text-ink-muted">
                    <span className="text-ink">{node.name}:</span>{" "}
                    {formatTemplateSource(node.sourceA)} vs {formatTemplateSource(node.sourceB)}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2">
              <button
                type="button"
                onClick={handleApplyTemplate}
                className="sc-button"
                disabled={applyTemplateBusy || !selectedEventId || !poolOptions.length}
              >
                {applyTemplateBusy ? "Applying..." : "Apply template"}
              </button>
            </div>
          </Panel>
        ) : null}
        <div className="grid items-start gap-2 xl:grid-cols-[minmax(17rem,19rem)_minmax(0,1fr)]">
          <Panel variant="default" className="space-y-2 border-white/20 p-2">
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
                      ? `Dates when groups of games fill in their teams. The sweeper runs every 6 hours on server time (UTC) — ${describeLocalSweepTimes()} in your timezone — so only those times can be chosen.`
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
                          {/* Date + sweep-time, not a free datetime: the
                              sweeper only runs every 6 hours, so an arbitrary
                              time would silently wait for the next one. */}
                          <input
                            type="date"
                            className="sc-input is-compact min-w-[8rem] flex-1"
                            value={day}
                            onChange={(changeEvent) =>
                              updateScheduleDraft(schedule.id, { day: changeEvent.target.value })
                            }
                          />
                          <Select
                            className="is-compact min-w-[7rem]"
                            value={draft.time ?? toTimeInputValue(schedule.resolve_at)}
                            onChange={(changeEvent) =>
                              updateScheduleDraft(schedule.id, { time: changeEvent.target.value })
                            }
                          >
                            {buildSweepTimesForDay(day).map((sweep) => {
                              const value = toTimeInputValue(sweep);
                              return (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              );
                            })}
                          </Select>
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

            <div className="grid items-start gap-2 [grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))] xl:grid-cols-[minmax(17rem,19rem)_minmax(0,1fr)]">
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

                <div className="grid gap-1">
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
                      title="Basics"
                      description="Give this game a name. Its bracket placement is set automatically."
                      tone="basics"
                    >
                      <Field label="Game name">
                        <Input
                          value={nodeForm.name}
                          onChange={(event) => setNodeForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Open 1v2"
                        />
                      </Field>
                    </EditorSection>

                    <EditorSection
                      step="2"
                      title="Linked match"
                      description="Every game needs a match to hold its score. Create one in a click, or pick an existing one."
                      tone="linked"
                    >
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
                                  to={`/matches?matchId=${nodeForm.matchId}`}
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
                        step="2a"
                        title={linkedMatchFormMode === "edit" ? "Edit linked values" : "Create linked"}
                        description={
                          linkedMatchFormMode === "edit"
                            ? "Edit the selected linked values here, then save the node if the link should remain."
                            : "Create a scheduled shell for this node, then save the node to persist the link."
                        }
                        tone="linked"
                        className="bg-sky-500/12"
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
                      step="3"
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
                        />
                      </div>
                    </EditorSection>

                    <details className="group rounded-2xl border border-amber-300/25 bg-amber-500/10 p-2">
                      <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-ink">
                        <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full border border-amber-300/35 bg-amber-500/10 px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                          Adv
                        </span>
                        Advanced — placement &amp; advancement
                      </summary>
                      <p className="mt-1 text-xs text-ink-muted">
                        Placement is set automatically from where you add the game on the bracket.
                        Advancement is now wired automatically: when a game's Source A/B is set to
                        &ldquo;winner/loser of&rdquo; another game, that game&rsquo;s winner/loser pointer is
                        filled in for you. The fields below are a manual override for unusual structures.
                      </p>

                      <div className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))]">
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

                      <div className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))]">
                        <div className="space-y-2 rounded-2xl border border-white/15 bg-surface/60 p-2">
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

                        <div className="space-y-2 rounded-2xl border border-white/15 bg-surface/60 p-2">
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

                    {selectedNode ? (
                      <EditorSection
                        title="Preview"
                        description="Quick summary of the currently selected node."
                        className="sc-surface-light border border-[#0b1f19]/20 text-[var(--sc-surface-light-ink)]"
                        titleClassName="text-[var(--sc-surface-light-ink)]"
                        descriptionClassName="text-[var(--sc-surface-light-ink)]/70"
                        stepClassName="border-[var(--sc-surface-light-ink)]/20 bg-white/70 text-[var(--sc-surface-light-ink)]"
                      >
                        <div className="flex flex-wrap items-center gap-1">
                          <Chip className="border-[#0b1f19]/20 bg-white/70 text-[var(--sc-surface-light-ink)]">
                            {getNodeDisplayName(selectedNode)}
                          </Chip>
                          {selectedNode.match ? (
                            <Chip className="border-[#0b1f19]/20 bg-white/70 text-[var(--sc-surface-light-ink)]">
                              {formatMatchStatus(selectedNode.match.status)}
                            </Chip>
                          ) : null}
                        </div>
                        <p className="text-sm text-[var(--sc-surface-light-ink)]">
                          {formatSourceLabel(selectedNode.source_a, sourceLookups)} vs {formatSourceLabel(selectedNode.source_b, sourceLookups)}
                        </p>
                        {selectedNode.match ? (
                          <p className="text-sm text-[var(--sc-surface-light-ink)]">
                            Linked match: {formatMatchup(selectedNode.match)} - {formatDateTime(selectedNode.match.start_time)}
                          </p>
                        ) : (
                          <p className="text-sm text-[var(--sc-surface-light-ink)]">No linked match yet.</p>
                        )}
                      </EditorSection>
                    ) : null}

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
          </div>
        </div>

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

        <Panel variant="default" className="space-y-2 border-white/20 p-2">
          <SectionHeader
            title="Bracket summary"
            description="Every bracket and node for this event at a glance. Expand a node for its sources, linked match, and advancement."
          />
          {!brackets.length ? (
            <Panel variant="muted" className="p-2 text-sm text-ink-muted">
              No brackets for this event yet.
            </Panel>
          ) : (
            <div className="space-y-2">
              {brackets.map((bracket) => {
                const bracketNodes = bracket.nodes || [];
                const rounds = groupNodesByRound(bracketNodes);
                const totalRounds = rounds.length;
                return (
                  <div
                    key={bracket.id}
                    className="space-y-1.5 rounded-2xl border border-white/15 bg-surface/60 p-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <p className="text-sm font-semibold text-ink">
                        {bracket.name || "Untitled bracket"}
                      </p>
                      <div className="flex flex-wrap items-center gap-1">
                        <Chip>{formatBracketType(bracket.type)}</Chip>
                        {bracket.is_locked ? <Chip>Locked</Chip> : null}
                        <Chip>
                          {bracketNodes.length} node{bracketNodes.length === 1 ? "" : "s"}
                        </Chip>
                        {totalRounds ? (
                          <Chip>
                            {totalRounds} round{totalRounds === 1 ? "" : "s"}
                          </Chip>
                        ) : null}
                      </div>
                    </div>

                    {!bracketNodes.length ? (
                      <p className="text-xs text-ink-muted">No nodes in this bracket yet.</p>
                    ) : (
                      <>
                        {/* Wide screens: round-by-round columns using the extra width. */}
                        <div className="hidden overflow-x-auto lg:block">
                          <div className="flex min-w-full items-stretch gap-2 pb-0.5">
                            {rounds.map((column, columnIndex) => (
                              <div
                                key={column.round}
                                className="flex min-w-[15rem] flex-1 flex-col gap-1.5"
                              >
                                <div className="flex items-baseline justify-between gap-1 border-b border-border pb-0.5">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-ink">
                                    {roundColumnLabel(column.round, totalRounds, columnIndex)}
                                  </span>
                                  <span className="text-[0.65rem] text-ink-muted">
                                    {column.nodes.length} node
                                    {column.nodes.length === 1 ? "" : "s"}
                                  </span>
                                </div>
                                <div className="flex flex-1 flex-col justify-around gap-1.5">
                                  {column.nodes.map((node) => (
                                    <BracketSummaryNodeCard
                                      key={node.id}
                                      node={node}
                                      lookups={summarySourceLookups}
                                    />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Narrow screens: collapsible stack (compact). */}
                        <div className="space-y-1 lg:hidden">
                          {bracketNodes.map((node) => (
                            <details
                              key={node.id}
                              className="rounded-xl border border-white/15 bg-surface/70 px-1.5 py-1"
                            >
                              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-1">
                                <span className="text-sm font-medium text-ink">
                                  {getNodeDisplayName(node)}
                                </span>
                                <span className="text-xs text-ink-muted">
                                  Round {node.round ?? "--"} · Position {node.position ?? "--"}
                                </span>
                              </summary>
                              <div className="mt-1 border-t border-border pt-1">
                                <BracketSummaryNodeBody node={node} lookups={summarySourceLookups} />
                              </div>
                            </details>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </SectionShell>
    </div>
  );
}

