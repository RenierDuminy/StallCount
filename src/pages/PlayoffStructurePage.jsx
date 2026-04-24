import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { getEventHierarchy, getEventsList } from "../services/leagueService";
import { createMatch, getMatchesByEvent, updateMatch } from "../services/matchService";
import {
  createBracket,
  createBracketNode,
  clearBracketMatchAssignmentsForEvent,
  deleteBracket,
  deleteBracketNode,
  getBracketsByEvent,
  resolveBracketMatchesForEvent,
  updateBracket,
  updateBracketNode,
} from "../services/playoffStructureService";

const PLAYOFF_STRUCTURE_EVENT_KEY = "stallcount.playoffStructure.eventId";
const MATCH_LIMIT = 400;
const FINISHED_MATCH_STATUSES = new Set(["finished", "completed", "final"]);
const BRACKET_TYPES = [
  { value: "placement", label: "Placement" },
  { value: "single_elim", label: "Single elimination" },
  { value: "double_elim", label: "Double elimination" },
  { value: "play_in", label: "Play-in" },
  { value: "custom", label: "Custom" },
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

function formatMatchStatus(value) {
  if (!value) return "Unknown";
  return String(value)
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatNodeFallbackLabel(node) {
  return `Round ${node?.round ?? "--"} / Position ${node?.position ?? "--"}`;
}

function getNodeDisplayName(node) {
  const name = typeof node?.name === "string" ? node.name.trim() : "";
  return name || formatNodeFallbackLabel(node);
}

function getTeamDisplayName(team) {
  if (!team || typeof team !== "object") return "TBD";
  return team.name || team.short_name || team.shortName || "TBD";
}

function formatMatchup(match) {
  const left = getTeamDisplayName(match?.team_a);
  const right = getTeamDisplayName(match?.team_b);
  return `${left} vs ${right}`;
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

function isFinishedStatus(status) {
  return FINISHED_MATCH_STATUSES.has(normalizeText(status));
}

function createStandingsRow(team) {
  return {
    id: team.id,
    name: team.name || team.short_name || team.shortName || "Team",
    shortName: team.short_name || team.shortName || "",
    wins: 0,
    losses: 0,
    plusMinus: 0,
  };
}

function ensureStandingsRow(map, team) {
  if (!team?.id) return null;
  if (!map.has(team.id)) {
    map.set(team.id, createStandingsRow(team));
  }
  return map.get(team.id);
}

function sortStandingsRows(rows) {
  return [...rows].sort((left, right) => {
    if (right.wins !== left.wins) return right.wins - left.wins;
    if (left.losses !== right.losses) return left.losses - right.losses;
    if (right.plusMinus !== left.plusMinus) return right.plusMinus - left.plusMinus;
    return left.name.localeCompare(right.name);
  });
}

function buildDivisionTeams(division) {
  const teamMap = new Map();
  (division?.pools || []).forEach((pool) => {
    (pool?.teams || []).forEach((entry) => {
      if (entry?.team?.id && !teamMap.has(entry.team.id)) {
        teamMap.set(entry.team.id, entry.team);
      }
    });
  });
  return Array.from(teamMap.values());
}

function calculateStandingsRows(teams, matches) {
  const rows = new Map();
  (teams || []).forEach((team) => {
    ensureStandingsRow(rows, team);
  });

  (matches || []).forEach((match) => {
    if (!isFinishedStatus(match?.status)) return;
    if (!match?.team_a?.id || !match?.team_b?.id) return;

    const teamA = ensureStandingsRow(rows, match.team_a);
    const teamB = ensureStandingsRow(rows, match.team_b);
    const scoreA = Number.isFinite(match?.score_a) ? Number(match.score_a) : 0;
    const scoreB = Number.isFinite(match?.score_b) ? Number(match.score_b) : 0;

    if (!teamA || !teamB) return;

    teamA.plusMinus += scoreA - scoreB;
    teamB.plusMinus += scoreB - scoreA;

    if (scoreA > scoreB) {
      teamA.wins += 1;
      teamB.losses += 1;
    } else if (scoreB > scoreA) {
      teamB.wins += 1;
      teamA.losses += 1;
    }
  });

  return sortStandingsRows(Array.from(rows.values()));
}

function isMatchCollectionComplete(matches) {
  return Array.isArray(matches) && matches.length > 0 && matches.every((match) => isFinishedStatus(match?.status));
}

function buildPoolStandings(pool, matches) {
  const poolTeams = (pool?.teams || []).map((entry) => entry.team).filter(Boolean);
  return {
    id: pool?.id || "",
    name: pool?.name || "Pool",
    divisionId: pool?.divisionId || "",
    divisionName: pool?.divisionName || "",
    rows: calculateStandingsRows(poolTeams, matches),
    ready: isMatchCollectionComplete(matches),
    matchCount: Array.isArray(matches) ? matches.length : 0,
  };
}

function buildDivisionStandings(division, poolBuckets) {
  const teams = buildDivisionTeams(division);
  const divisionMatches = (division?.pools || []).flatMap((pool) => poolBuckets.get(pool.id) || []);
  const poolsWithMatches = (division?.pools || []).filter((pool) => (poolBuckets.get(pool.id) || []).length > 0);

  return {
    id: division?.id || "",
    name: division?.name || "Division",
    rows: calculateStandingsRows(teams, divisionMatches),
    ready:
      poolsWithMatches.length > 0 &&
      poolsWithMatches.every((pool) => isMatchCollectionComplete(poolBuckets.get(pool.id) || [])),
    matchCount: divisionMatches.length,
  };
}

function buildPlayoffStandingsIndex(eventData, matches, brackets) {
  const bracketMatchIds = new Set(
    (brackets || [])
      .flatMap((bracket) => bracket?.nodes || [])
      .map((node) => node?.match_id)
      .filter(Boolean),
  );

  const poolBuckets = new Map();
  (matches || []).forEach((match) => {
    if (!match?.pool_id || bracketMatchIds.has(match.id)) {
      return;
    }
    const bucket = poolBuckets.get(match.pool_id) || [];
    bucket.push(match);
    poolBuckets.set(match.pool_id, bucket);
  });

  const standingsIndex = {
    poolsById: {},
    poolsByName: {},
    poolsByScopedName: {},
    divisionsById: {},
    divisionsByName: {},
  };

  (eventData?.divisions || []).forEach((division) => {
    const divisionEntry = buildDivisionStandings(division, poolBuckets);
    standingsIndex.divisionsById[division.id] = divisionEntry;

    const divisionKey = normalizeText(division.name);
    if (divisionKey && !standingsIndex.divisionsByName[divisionKey]) {
      standingsIndex.divisionsByName[divisionKey] = divisionEntry;
    }

    (division?.pools || []).forEach((pool) => {
      const poolEntry = buildPoolStandings(
        {
          ...pool,
          divisionId: division.id,
          divisionName: division.name,
        },
        poolBuckets.get(pool.id) || [],
      );

      standingsIndex.poolsById[pool.id] = poolEntry;

      const poolKey = normalizeText(pool.name);
      if (poolKey && !standingsIndex.poolsByName[poolKey]) {
        standingsIndex.poolsByName[poolKey] = poolEntry;
      }

      const scopedKey = divisionKey && poolKey ? `${divisionKey}::${poolKey}` : "";
      if (scopedKey && !standingsIndex.poolsByScopedName[scopedKey]) {
        standingsIndex.poolsByScopedName[scopedKey] = poolEntry;
      }
    });
  });

  return standingsIndex;
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

function formatSourceLabel(source, lookups = {}) {
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
  const skipped = Array.isArray(result?.skipped) ? result.skipped : [];

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
    <div className="space-y-4 rounded-2xl border border-border bg-surface/60 p-4">
      <div className="space-y-1">
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
    default: "border border-border bg-surface/40",
    basics: "border border-white/10 bg-white/[0.03]",
    linked: "border border-sky-400/25 bg-sky-500/10",
    participants: "border border-emerald-400/20 bg-emerald-500/8",
    advancement: "border border-amber-300/25 bg-amber-500/10",
  };

  return (
    <section className={`space-y-4 rounded-2xl p-4 ${toneClasses[tone] || toneClasses.default} ${className}`.trim()}>
      <div className="flex flex-wrap items-start gap-3">
        {step ? (
          <span
            className={`inline-flex min-w-[2rem] items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200 ${stepClassName}`.trim()}
          >
            {step}
          </span>
        ) : null}
        <div className="space-y-1">
          <p className={`text-sm font-semibold text-ink ${titleClassName}`.trim()}>{title}</p>
          {description ? <p className={`text-xs text-ink-muted ${descriptionClassName}`.trim()}>{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
export default function PlayoffStructurePage() {
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

  useEffect(() => {
    let active = true;

    async function loadEvents() {
      setEventsLoading(true);
      try {
        const rows = await getEventsList(120);
        if (!active) return;
        setEvents(Array.isArray(rows) ? rows : []);
        if (!selectedEventId && rows?.[0]?.id) {
          setSelectedEventId(rows[0].id);
        }
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
  }, [selectedEventId, setSelectedEventId]);

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

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) || eventData || null,
    [eventData, events, selectedEventId],
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

    if ((selectedBracket.nodes || []).length > 0) {
      setError("Delete the bracket nodes first.");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Delete bracket ${selectedBracket.name}?`);
      if (!confirmed) {
        return;
      }
    }

    setBracketBusy(true);
    setError("");
    setMessage("");

    try {
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

      if (selectedNodeId) {
        await updateBracketNode(selectedNodeId, payload);
        await loadSelectedEventData();
        setMessage(`Updated node ${name || formatNodeFallbackLabel({ round, position })}.`);
      } else {
        const created = await createBracketNode(payload);
        await loadSelectedEventData();
        if (created?.id) {
          setSelectedNodeId(created.id);
        }
        setMessage(`Created node ${name || formatNodeFallbackLabel({ round, position })}.`);
      }
    } catch (saveError) {
      setError(saveError?.message || "Failed to save node.");
    } finally {
      setNodeBusy(false);
    }
  }, [loadSelectedEventData, nodeForm, selectedBracketId, selectedNodeId, sourceLookups]);

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
    if (!selectedEventId || !eventData) {
      setError("Choose an event before resolving playoffs.");
      return;
    }

    setResolveBusy(true);
    setError("");
    setMessage("");

    try {
      const standingsIndex = buildPlayoffStandingsIndex(eventData, matches, brackets);
      const result = await resolveBracketMatchesForEvent({
        eventId: selectedEventId,
        standingsIndex,
        brackets,
      });
      await loadSelectedEventData();
      setMessage(summarizeResolveResult(result));
    } catch (resolveError) {
      setError(resolveError?.message || "Failed to resolve playoff matches.");
    } finally {
      setResolveBusy(false);
    }
  }, [brackets, eventData, loadSelectedEventData, matches, selectedEventId]);

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
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-6">
        <Panel variant="tintedAlt" className="space-y-5 p-5 sm:p-6">
          <SectionHeader
            eyebrow="Admin tool"
            title="Playoff structure"
            description="Manage brackets and bracket nodes for an event, then resolve linked matches from the saved structure."
            action={
              <div className="flex flex-wrap items-center gap-2">
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
                  onClick={handleClearPlayoffAssignments}
                  className="sc-button is-ghost"
                  disabled={clearBusy || loading || !selectedEventId}
                >
                  {clearBusy ? "Clearing..." : "Clear playoff assignments"}
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

          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
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
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="space-y-2 rounded-2xl border border-border bg-surface/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Event details</p>
              <p className="text-lg font-semibold text-ink">{selectedEvent?.name || "No event selected"}</p>
              <p className="text-sm text-ink-muted">
                {selectedEvent?.start_date ? formatEventDate(selectedEvent.start_date) : "Date TBC"}
                {selectedEvent?.end_date ? ` to ${formatEventDate(selectedEvent.end_date)}` : ""}
              </p>
              <p className="text-sm text-ink-muted">{selectedEvent?.location || "Location TBC"}</p>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-surface/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Structure stats</p>
              <div className="flex flex-wrap gap-2">
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
            <div className="rounded-2xl border border-dashed border-rose-400/40 bg-rose-500/5 p-4 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="rounded-2xl border border-dashed border-emerald-400/40 bg-emerald-500/5 p-4 text-sm text-emerald-100">
              {message}
            </div>
          ) : null}
        </Panel>
      </SectionShell>
      <SectionShell as="main" className="space-y-6 py-6">
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(17rem,19rem)_minmax(0,1fr)]">
          <Panel variant="default" className="space-y-4 p-5">
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
              <Panel variant="muted" className="p-4 text-sm text-ink-muted">
                Choose an event to load its playoff structure.
              </Panel>
            ) : null}

            {selectedEventId && !brackets.length ? (
              <Panel variant="muted" className="p-4 text-sm text-ink-muted">
                No brackets linked to this event yet.
              </Panel>
            ) : null}

            <div className="grid gap-2">
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
                        : "border-border bg-surface/70 hover:border-emerald-400/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-ink">{bracket.name || "Unnamed bracket"}</p>
                        <p className="text-xs text-ink-muted">{formatBracketType(bracket.type)}</p>
                      </div>
                      <Chip>{bracket.nodes?.length || 0} nodes</Chip>
                    </div>
                    {bracket.is_locked ? (
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-200">Locked</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Panel>

          <div className="space-y-6">
            <Panel variant="default" className="space-y-5 p-5">
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

              <div className="grid gap-4 md:grid-cols-3">
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

              <div className="flex flex-wrap items-center gap-2">
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
            </Panel>

            <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))] xl:grid-cols-[minmax(17rem,19rem)_minmax(0,1fr)]">
              <Panel variant="default" className="self-start space-y-4 p-5">
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
                  <Panel variant="muted" className="p-4 text-sm text-ink-muted">
                    Save or select a bracket first.
                  </Panel>
                ) : null}

                {selectedBracketId && !selectedBracketNodes.length ? (
                  <Panel variant="muted" className="p-4 text-sm text-ink-muted">
                    No nodes in this bracket yet.
                  </Panel>
                ) : null}

                <div className="grid gap-2">
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
                            : "border-border bg-surface/70 hover:border-emerald-400/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-ink">{getNodeDisplayName(node)}</p>
                            <p className="text-xs text-ink-muted">{sourceSummary}</p>
                            <p className="text-xs text-ink-muted">
                              Round {node.round ?? "--"} · Position {node.position ?? "--"}
                            </p>
                          </div>
                          <span className="text-xs font-medium text-emerald-200">Edit</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Panel>
              <Panel variant="default" className="self-start space-y-5 p-5">
                <SectionHeader
                  title={isEditingNode ? "Edit node" : "Add new node"}
                  description="Use structured inputs so organisers do not need to manage JSON by hand."
                  action={
                    isEditingNode ? (
                      <div className="flex flex-wrap items-center gap-2">
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
                  <Panel variant="muted" className="p-4 text-sm text-ink-muted">
                    Nodes can only be created after a bracket exists.
                  </Panel>
                ) : (
                  <>
                    <EditorSection
                      step="1"
                      title="Basics"
                      description="Name the node and place it in the bracket order."
                      tone="basics"
                    >
                      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
                        <Field label="Node name">
                          <Input
                            value={nodeForm.name}
                            onChange={(event) => setNodeForm((current) => ({ ...current, name: event.target.value }))}
                            placeholder="Open 1v2"
                          />
                        </Field>

                        <Field label="Round">
                          <Input
                            type="number"
                            min="1"
                            value={nodeForm.round}
                            onChange={(event) => setNodeForm((current) => ({ ...current, round: event.target.value }))}
                          />
                        </Field>

                        <Field label="Position">
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
                    </EditorSection>

                    <EditorSection
                      step="2"
                      title="Linked match"
                      description="Connect this node to a scheduled match or create one here."
                      tone="linked"
                    >
                      <Field
                        label="Linked match"
                        hint="Choose the scheduled match this node should populate, or create one here."
                        action={
                          <div className="flex flex-wrap items-center gap-3">
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
                                  Edit
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              onClick={handleToggleLinkedMatchForm}
                              className="text-xs text-emerald-200 underline-offset-2 hover:underline"
                            >
                              {showCreateMatchForm && linkedMatchFormMode === "create" ? "Hide" : "Create"}
                            </button>
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
                        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
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
                        <div className="flex flex-wrap items-center gap-2">
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
                      className="p-5"
                    >
                      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
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

                    <EditorSection
                      step="4"
                      title="Advancement"
                      description="Send winners and losers to their next destinations."
                      tone="advancement"
                      className="p-5"
                    >
                      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
                        <div className="space-y-4 rounded-2xl border border-border bg-surface/60 p-4">
                          <div className="space-y-1">
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

                        <div className="space-y-4 rounded-2xl border border-border bg-surface/60 p-4">
                          <div className="space-y-1">
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
                    </EditorSection>

                    {selectedNode ? (
                      <EditorSection
                        step="5"
                        title="Preview"
                        description="Quick summary of the currently selected node."
                        className="border-[var(--sc-surface-light-border)] bg-[var(--sc-surface-light)] text-[var(--sc-surface-light-ink)]"
                        titleClassName="text-[var(--sc-surface-light-ink)]"
                        descriptionClassName="text-[var(--sc-surface-light-ink)]/70"
                        stepClassName="border-[var(--sc-surface-light-ink)]/20 bg-white/70 text-[var(--sc-surface-light-ink)]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip>{getNodeDisplayName(selectedNode)}</Chip>
                          {selectedNode.match ? <Chip>{formatMatchStatus(selectedNode.match.status)}</Chip> : null}
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

                    <section className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
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
      </SectionShell>
    </div>
  );
}

