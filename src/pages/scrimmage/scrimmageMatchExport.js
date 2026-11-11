import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import { MATCH_EXPORT_FORMAT, MATCH_EXPORT_VERSION } from "../../services/matchExportFormat";
import { CALAHAN_ASSIST_VALUE, SCORE_NA_PLAYER_VALUE } from "./scrimmageConstants";

// Builds the database-shaped export (see matchExportFormat.js for the format and
// the row conventions) that a tournament director imports on Match corrections.

const SCORE_CODES = new Set([MATCH_LOG_EVENT_CODES.SCORE, MATCH_LOG_EVENT_CODES.CALAHAN]);
const PLAYER_CODES = new Set([MATCH_LOG_EVENT_CODES.TURNOVER, MATCH_LOG_EVENT_CODES.BLOCK]);
const TEAM_CODES = new Set([
  MATCH_LOG_EVENT_CODES.MATCH_START,
  MATCH_LOG_EVENT_CODES.SCORE,
  MATCH_LOG_EVENT_CODES.CALAHAN,
  MATCH_LOG_EVENT_CODES.TURNOVER,
  MATCH_LOG_EVENT_CODES.BLOCK,
  MATCH_LOG_EVENT_CODES.TIMEOUT_START,
  MATCH_LOG_EVENT_CODES.TIMEOUT_END,
]);

const toPerson = (player) =>
  player
    ? {
        name: player.name || null,
        jersey_number: Number.isFinite(Number(player.jersey_number)) ? Number(player.jersey_number) : null,
      }
    : null;

export function buildScrimmageMatchExport({
  logs = [],
  rosters = {},
  teamAName,
  teamBName,
  startingTeamKey,
  abbaPattern,
  startTime,
  score,
}) {
  const players = new Map();
  [...(rosters.teamA || []), ...(rosters.teamB || [])].forEach((player) => {
    if (player?.id) players.set(player.id, player);
  });
  const personFor = (id) => {
    if (!id || id === SCORE_NA_PLAYER_VALUE || id === CALAHAN_ASSIST_VALUE) return null;
    return toPerson(players.get(id));
  };

  // Chronological, and one row per entry: an edited entry keeps its id.
  const seen = new Set();
  const ordered = [...logs]
    .filter((log) => {
      const key = log?.id;
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (Date.parse(a?.timestamp) || 0) - (Date.parse(b?.timestamp) || 0));

  const matchLogs = ordered
    .map((log) => {
      // Sessions saved before blocks had their own code marked them with a
      // hard-coded event type id 19 on a "turnover" entry.
      const code =
        log?.eventTypeId === 19 ? MATCH_LOG_EVENT_CODES.BLOCK : `${log?.eventCode || ""}`.toLowerCase();
      if (!code || !log?.timestamp) return null;
      const isScore = SCORE_CODES.has(code);
      const actorId = isScore ? log.scorerId : PLAYER_CODES.has(code) ? log.scorerId || log.actorId : null;
      const secondaryId = code === MATCH_LOG_EVENT_CODES.SCORE ? log.assistId : null;
      return {
        event_code: code,
        created_at: new Date(log.timestamp).toISOString(),
        team: TEAM_CODES.has(code) && (log.team === "A" || log.team === "B") ? log.team : null,
        team_id: null,
        actor: personFor(actorId),
        actor_id: null,
        secondary_actor: personFor(secondaryId),
        secondary_actor_id: null,
        abba_line: isScore ? log.abbaLine || "none" : null,
      };
    })
    .filter(Boolean);

  const startMs = startTime ? Date.parse(startTime) : NaN;
  return {
    format: MATCH_EXPORT_FORMAT,
    version: MATCH_EXPORT_VERSION,
    source: "scrimmage",
    exported_at: new Date().toISOString(),
    match: {
      team_a: { name: teamAName || "Team A" },
      team_b: { name: teamBName || "Team B" },
      starting_team: startingTeamKey === "A" || startingTeamKey === "B" ? startingTeamKey : null,
      abba_pattern: abbaPattern || "none",
      start_time: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
      score_a: Number.isInteger(score?.a) ? score.a : null,
      score_b: Number.isInteger(score?.b) ? score.b : null,
    },
    rosters: {
      A: (rosters.teamA || []).map(toPerson).filter(Boolean),
      B: (rosters.teamB || []).map(toPerson).filter(Boolean),
    },
    match_logs: matchLogs,
  };
}

export function downloadScrimmageMatchExport(options) {
  const payload = buildScrimmageMatchExport(options);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = `${options.teamAName || "Team A"} vs ${options.teamBName || "Team B"}`.replace(
    /[^a-z0-9]+/gi,
    "_",
  );
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${safeName}_${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
