import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import { MATCH_EXPORT_FORMAT, MATCH_EXPORT_VERSION } from "../../services/matchExportFormat";
import { SCRIMMAGE_TEAM_A_ID, SCRIMMAGE_TEAM_B_ID } from "./scrimmageBackend";

// Builds the database-shaped export (see matchExportFormat.js for the format and
// the row conventions) that a tournament director imports on Match corrections,
// from the scrimmage's stored rows (scrimmageBackend.js). Those rows are written
// by the same console as a live match, so they already follow the conventions;
// this only swaps local ids for sides, names and jersey numbers.

const SCORE_CODES = new Set([MATCH_LOG_EVENT_CODES.SCORE, MATCH_LOG_EVENT_CODES.CALAHAN]);
const TEAM_CODES = new Set([
  MATCH_LOG_EVENT_CODES.MATCH_START,
  MATCH_LOG_EVENT_CODES.SCORE,
  MATCH_LOG_EVENT_CODES.CALAHAN,
  MATCH_LOG_EVENT_CODES.TURNOVER,
  MATCH_LOG_EVENT_CODES.BLOCK,
  MATCH_LOG_EVENT_CODES.TIMEOUT_START,
  MATCH_LOG_EVENT_CODES.TIMEOUT_END,
]);

const sideOf = (teamId) =>
  teamId === SCRIMMAGE_TEAM_A_ID ? "A" : teamId === SCRIMMAGE_TEAM_B_ID ? "B" : null;

const toPerson = (player) =>
  player
    ? {
        name: player.name || null,
        jersey_number: Number.isFinite(Number(player.jersey_number)) && player.jersey_number !== null
          ? Number(player.jersey_number)
          : null,
      }
    : null;

export function buildScrimmageMatchExport({ match, players = {}, logs = [] }) {
  const rosterA = players[SCRIMMAGE_TEAM_A_ID] || [];
  const rosterB = players[SCRIMMAGE_TEAM_B_ID] || [];
  const lookup = new Map([...rosterA, ...rosterB].map((player) => [player.id, player]));
  const personFor = (id) => (id ? toPerson(lookup.get(id)) : null);

  const matchLogs = logs
    .map((row) => {
      const code = row.event?.code;
      if (!code || !row.created_at) return null;
      return {
        event_code: code,
        created_at: new Date(row.created_at).toISOString(),
        team: TEAM_CODES.has(code) ? sideOf(row.team_id) : null,
        team_id: null,
        actor: personFor(row.actor_id),
        actor_id: null,
        secondary_actor: code === MATCH_LOG_EVENT_CODES.SCORE ? personFor(row.secondary_actor_id) : null,
        secondary_actor_id: null,
        abba_line: SCORE_CODES.has(code) ? row.abba_line || "none" : null,
      };
    })
    .filter(Boolean);

  const startMs = match?.start_time ? Date.parse(match.start_time) : NaN;
  return {
    format: MATCH_EXPORT_FORMAT,
    version: MATCH_EXPORT_VERSION,
    source: "scrimmage",
    exported_at: new Date().toISOString(),
    match: {
      team_a: { name: match?.team_a?.name || "Team A" },
      team_b: { name: match?.team_b?.name || "Team B" },
      starting_team: sideOf(match?.starting_team_id),
      abba_pattern: match?.abba_pattern || "none",
      start_time: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
      score_a: Number.isInteger(match?.score_a) ? match.score_a : null,
      score_b: Number.isInteger(match?.score_b) ? match.score_b : null,
    },
    rosters: {
      A: rosterA.map(toPerson).filter(Boolean),
      B: rosterB.map(toPerson).filter(Boolean),
    },
    match_logs: matchLogs,
  };
}

export function downloadScrimmageMatchExport(snapshot) {
  const payload = buildScrimmageMatchExport(snapshot);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = `${payload.match.team_a.name} vs ${payload.match.team_b.name}`.replace(/[^a-z0-9]+/gi, "_");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${safeName}_${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
