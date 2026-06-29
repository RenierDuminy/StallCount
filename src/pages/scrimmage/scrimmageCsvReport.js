import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";

// Maps internal event codes to the human-readable event labels used in the
// generic CTFDA-style CSV export. Includes every start/stop event so the export
// is a complete, replayable record of the match.
const EVENT_LABELS = {
  [MATCH_LOG_EVENT_CODES.MATCH_START]: "Start",
  [MATCH_LOG_EVENT_CODES.MATCH_END]: "End",
  [MATCH_LOG_EVENT_CODES.SCORE]: "Score",
  [MATCH_LOG_EVENT_CODES.CALAHAN]: "Score",
  [MATCH_LOG_EVENT_CODES.TURNOVER]: "Turnover",
  [MATCH_LOG_EVENT_CODES.TIMEOUT_START]: "TimeOut",
  [MATCH_LOG_EVENT_CODES.TIMEOUT_END]: "TimeOut End",
  [MATCH_LOG_EVENT_CODES.HALFTIME_START]: "HalfTime",
  [MATCH_LOG_EVENT_CODES.HALFTIME_END]: "HalfTime End",
  [MATCH_LOG_EVENT_CODES.STOPPAGE_START]: "Stoppage",
  [MATCH_LOG_EVENT_CODES.STOPPAGE_END]: "Stoppage End",
};

const CSV_HEADERS = ["match_id", "time", "event", "team", "score", "assist"];

const BLOCK_EVENT_TYPE_ID = 19;

// A block ("drop") is a possession-change event flagged either by its event type
// id or by "block" appearing in the code/description.
function isBlockLog(log) {
  if (!log) return false;
  if (Number.isFinite(log.eventTypeId) && log.eventTypeId === BLOCK_EVENT_TYPE_ID) return true;
  if (`${log.eventCode || ""}`.toLowerCase().includes("block")) return true;
  return `${log.eventDescription || ""}`.toLowerCase().includes("block");
}

// Events that are not team-specific in the export format (blank team column),
// matching the provided CTFDA files.
const TEAMLESS_EVENT_CODES = new Set([
  MATCH_LOG_EVENT_CODES.MATCH_START,
  MATCH_LOG_EVENT_CODES.MATCH_END,
  MATCH_LOG_EVENT_CODES.HALFTIME_START,
  MATCH_LOG_EVENT_CODES.HALFTIME_END,
]);

function escapeCsv(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function pad(value) {
  return `${value}`.padStart(2, "0");
}

// Formats an ISO timestamp into the "YYYY/MM/DD, HH:MM:SS" form used by the
// provided CSV files (local time).
function formatTimestamp(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const datePart = `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${datePart}, ${timePart}`;
}

function resolveEventLabel(log) {
  if (isBlockLog(log)) return "Block";
  const code = `${log?.eventCode || ""}`.toLowerCase();
  if (EVENT_LABELS[code]) return EVENT_LABELS[code];
  // Fall back to the description, or a tidied version of the raw code.
  if (log?.eventDescription) return log.eventDescription;
  if (!code) return "Event";
  return code.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildScrimmageReportCsv({ logs, teamAName, teamBName }) {
  const matchId = `${teamAName || "Team A"} vs ${teamBName || "Team B"}`;
  const teamLabel = (teamKey) => {
    if (teamKey === "A") return teamAName || "Team A";
    if (teamKey === "B") return teamBName || "Team B";
    return "";
  };

  // Export in chronological order so the file reads as a match replay.
  const ordered = [...(logs || [])].sort((a, b) => {
    const left = new Date(a?.timestamp || 0).getTime() || 0;
    const right = new Date(b?.timestamp || 0).getTime() || 0;
    return left - right;
  });

  const rows = ordered.map((log) => {
    const code = `${log?.eventCode || ""}`.toLowerCase();
    const isScore =
      code === MATCH_LOG_EVENT_CODES.SCORE || code === MATCH_LOG_EVENT_CODES.CALAHAN;
    const isTurnover = code === MATCH_LOG_EVENT_CODES.TURNOVER || isBlockLog(log);
    // The "score" column carries the scorer name on scores (matching the provided
    // files). For turnovers and drops/blocks it carries the relevant player, so the
    // person responsible is recorded. Other events leave both columns blank.
    const playerName = log?.scorerName || log?.actorName || "";
    const scorer = isScore
      ? log?.scorerName || "N/A"
      : isTurnover
        ? playerName
        : "";
    const assist = isScore ? log?.assistName || "N/A" : "";
    const team = TEAMLESS_EVENT_CODES.has(code) ? "" : teamLabel(log?.team);
    return [
      escapeCsv(matchId),
      escapeCsv(formatTimestamp(log?.timestamp)),
      escapeCsv(resolveEventLabel(log)),
      escapeCsv(team),
      escapeCsv(scorer),
      escapeCsv(assist),
    ].join(",");
  });

  return [CSV_HEADERS.join(","), ...rows].join("\n");
}

export function downloadScrimmageReportCsv({ logs, teamAName, teamBName }) {
  const csv = buildScrimmageReportCsv({ logs, teamAName, teamBName });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = `${teamAName || "Team A"} vs ${teamBName || "Team B"}`.replace(
    /[^a-z0-9]+/gi,
    "_"
  );
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${safeName}_${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
