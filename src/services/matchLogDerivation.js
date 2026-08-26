// Shared match-log -> score derivation.
//
// The invariant, copied verbatim from the scorekeeper console that established it:
// "The log is the score." Totals are a straight count of scoring rows with no
// baseline and no reference to matches.score_a/score_b, so there is nothing to
// infer and nothing that can compound. Reading the published columns back in here
// is what previously let a re-derive fold the existing total into a new baseline
// and double the score on every console remount.
//
// This is a plain-function lift of `deriveLogsFromRows` in
// src/pages/scorekeeper/useScoreKeeperData.js (~line 2770). The 7v7 and 5v5
// scorekeeper hooks still hold their own copies: they are the highest-risk files
// in the app and are deliberately left untouched here so an admin-side change
// cannot break live scoring. If you change the counting rules, change them in all
// three places or the console and the corrections page will disagree.

import { MATCH_LOG_EVENT_CODES } from "./matchLogService";

/**
 * Resolve a log row's event code. The `event:match_events(...)` join supplies it,
 * but the embed can come back null, so callers may pass an id -> code map built
 * from getMatchEventDefinitions() as a fallback. Never hardcode numeric ids:
 * MatchesPage does (MATCH_EVENT_ID_HINTS) and that is the thing to avoid.
 */
export function resolveEventCode(row, eventCodeById) {
  const embedded = row?.event?.code;
  if (typeof embedded === "string" && embedded.trim()) {
    return embedded.trim();
  }
  if (eventCodeById && row?.event_type_id != null) {
    return eventCodeById.get(Number(row.event_type_id)) || null;
  }
  return null;
}

export function isScoringCode(code) {
  return code === MATCH_LOG_EVENT_CODES.SCORE || code === MATCH_LOG_EVENT_CODES.CALAHAN;
}

/**
 * Replay log rows in `created_at` order into a running score plus per-row detail.
 *
 * A scoring row whose team_id matches neither team yields `team: null` and
 * increments neither total. That is the existing behaviour and it is preserved on
 * purpose: the corrections page reports it as a finding rather than silently
 * guessing a side. It is exactly how a point can go missing while the published
 * score still looks plausible.
 *
 * @param {Array} rows        match_logs rows, already ordered by created_at
 * @param {object} options
 * @param {string} options.teamAId
 * @param {string} options.teamBId
 * @param {Map}    [options.nameLookup]     playerId -> name, used when the actor embed is null
 * @param {Map}    [options.eventCodeById]  event_type_id -> code fallback
 * @returns {{ totals: { a: number, b: number }, logs: Array }}
 */
export function deriveMatchLogs(rows, options = {}) {
  const { teamAId, teamBId, nameLookup = new Map(), eventCodeById = null } = options;

  let runningA = 0;
  let runningB = 0;
  let scoreOrderIndexCounter = 0;

  const source = Array.isArray(rows) ? rows : [];

  const logs = source.map((row) => {
    const teamKey =
      row.team_id && row.team_id === teamBId
        ? "B"
        : row.team_id && row.team_id === teamAId
          ? "A"
          : null;

    const eventCode = resolveEventCode(row, eventCodeById);
    const isScoreEvent = isScoringCode(eventCode);

    let scoreOrderIndex = null;
    if (isScoreEvent) {
      scoreOrderIndex = scoreOrderIndexCounter;
      scoreOrderIndexCounter += 1;
      if (teamKey === "A") {
        runningA += 1;
      } else if (teamKey === "B") {
        runningB += 1;
      }
    }

    const scorerName =
      row.actor?.name || (row.actor_id ? nameLookup.get(row.actor_id) : null) || null;
    const assistName =
      row.secondary_actor?.name ||
      (row.secondary_actor_id ? nameLookup.get(row.secondary_actor_id) : null) ||
      null;

    return {
      id: row.id,
      team: teamKey,
      teamId: row.team_id ?? null,
      timestamp: row.created_at,
      scorerName,
      scorerId: row.actor_id ?? null,
      assistName,
      assistId: row.secondary_actor_id ?? null,
      eventTypeId: row.event_type_id ?? null,
      eventCode,
      eventDescription: row.event?.description || eventCode || "Event",
      isScoreEvent,
      // Running score *after* this row, so the table can show a score column.
      totalA: runningA,
      totalB: runningB,
      scoreOrderIndex,
      // Preserved as stored. Re-deriving the ABBA line needs the event's
      // abbaPattern rule, which corrections has no reason to recompute.
      abbaLine: row.abba_line ?? null,
      optimisticId: row.optimistic_id ?? null,
    };
  });

  return {
    totals: { a: runningA, b: runningB },
    logs,
  };
}

// ---------------------------------------------------------------------------
// Point-log rows, replicating the matches page.
//
// `buildPointLogRows` mirrors the row-building half of `deriveMatchInsights` in
// src/pages/MatchesPage.jsx (~line 1483) so the corrections table renders the
// same log a viewer sees. The parts that matter and are easy to miss:
//
//   * A turnover row shows the team *gaining* possession, which is frequently
//     not the team on the row: possession is tracked across the match and the
//     logged team_id is reinterpreted against it.
//   * `*_end` events (timeout/halftime/stoppage) produce NO row on the matches
//     page — they close a band. Corrections still needs them addressable, so
//     they are emitted with `isBandEnd: true` for the caller to render quietly.
//   * Labels are "Start"/"End"/"HT"/"ST"/"TO"/point number, and turnover and
//     match-start rows carry a `metaDetails` second line.
//
// MatchesPage owns the original; if its log rendering changes, change this too.

const TEAM_A = "teamA";
const TEAM_B = "teamB";

function formatGapLabel(diffMs) {
  if (!Number.isFinite(diffMs) || diffMs <= 0) return "0:00";
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/**
 * @param {Array}  derivedLogs  output of deriveMatchLogs().logs
 * @param {object} match        needs team_a/team_b (id, name, short_name) and starting_team_id
 * @returns {Array} render-ready rows, one per log entry, each carrying `id`
 */
export function buildPointLogRows(derivedLogs, match) {
  const teamAId = match?.team_a?.id ?? match?.team_a ?? null;
  const teamBId = match?.team_b?.id ?? match?.team_b ?? null;
  const teamAName = match?.team_a?.name || "Team A";
  const teamBName = match?.team_b?.name || "Team B";
  const teamAShort = match?.team_a?.short_name || teamAName;
  const teamBShort = match?.team_b?.short_name || teamBName;

  const opposite = (key) => (key === TEAM_A ? TEAM_B : key === TEAM_B ? TEAM_A : null);
  const shortOf = (key) => (key === TEAM_A ? teamAShort : key === TEAM_B ? teamBShort : "-");
  const nameOf = (key) => (key === TEAM_A ? teamAName : key === TEAM_B ? teamBName : "-");
  const keyOfTeamId = (teamId) => {
    if (!teamId) return null;
    if (teamId === teamAId) return TEAM_A;
    if (teamId === teamBId) return TEAM_B;
    return null;
  };

  // Receiving team starts on offence; starting_team_id is the pulling team.
  const fallbackOffense =
    match?.starting_team_id === teamAId
      ? TEAM_B
      : match?.starting_team_id === teamBId
        ? TEAM_A
        : TEAM_A;

  let currentPossession = fallbackOffense;
  let previousTime = null;
  let pointIndex = 1;

  return (Array.isArray(derivedLogs) ? derivedLogs : []).map((log) => {
    const timestamp = Date.parse(log.timestamp);
    const gap =
      previousTime != null && Number.isFinite(timestamp)
        ? formatGapLabel(timestamp - previousTime)
        : "-";

    const base = {
      id: log.id,
      log,
      timestamp: log.timestamp,
      eventCode: log.eventCode,
      gap,
      metaDetails: null,
      isBandEnd: false,
    };

    const advance = () => {
      if (Number.isFinite(timestamp)) previousTime = timestamp;
    };

    switch (log.eventCode) {
      case MATCH_LOG_EVENT_CODES.MATCH_START: {
        const pullingTeamId = match?.starting_team_id || log.teamId || null;
        const pullingKey = keyOfTeamId(pullingTeamId);
        advance();
        return {
          ...base,
          label: "Start",
          description: "Match start",
          teamLabel: pullingKey ? shortOf(pullingKey) : "Unassigned",
          scorer: "-",
          assist: "-",
          // The matches page surfaces who pulled; keep that context here.
          metaDetails: `Pulling team: ${pullingKey ? nameOf(pullingKey) : "Unassigned"}`,
          variant: "halftime",
          gap: "-",
        };
      }

      case MATCH_LOG_EVENT_CODES.MATCH_END:
        advance();
        return {
          ...base,
          label: "End",
          description: "Match end",
          teamLabel: "-",
          scorer: "-",
          assist: "-",
          variant: "halftime",
          gap: "-",
        };

      case MATCH_LOG_EVENT_CODES.SCORE:
      case MATCH_LOG_EVENT_CODES.CALAHAN: {
        const isCallahan = log.eventCode === MATCH_LOG_EVENT_CODES.CALAHAN;
        const teamKey = log.team === "A" ? TEAM_A : log.team === "B" ? TEAM_B : null;
        const row = {
          ...base,
          label: String(pointIndex),
          description: isCallahan ? "Callahan goal" : "Scored",
          teamLabel: teamKey ? shortOf(teamKey) : "Unassigned",
          scorer: log.scorerName || "N/A",
          assist: isCallahan ? "Callahan" : log.assistName || "",
          variant: isCallahan ? "callahan" : teamKey === TEAM_B ? "goalB" : "goalA",
          isScore: true,
          totalA: log.totalA,
          totalB: log.totalB,
        };
        // Possession switches to the conceding team for the next point.
        currentPossession = teamKey ? opposite(teamKey) : opposite(currentPossession);
        pointIndex += 1;
        advance();
        return row;
      }

      case MATCH_LOG_EVENT_CODES.TURNOVER: {
        const label = (log.eventDescription || "").trim();
        const isBlock = label.toLowerCase().includes("block");
        const reportedKey = log.team === "A" ? TEAM_A : log.team === "B" ? TEAM_B : null;
        const holding = currentPossession;

        // A turnover logged against the team that already had the disc means the
        // *other* side gained it; a block is credited to the team making it.
        let gainingKey = reportedKey;
        if (holding && reportedKey && reportedKey === holding && !isBlock) {
          gainingKey = opposite(reportedKey);
        }
        if (!gainingKey && holding) {
          gainingKey = opposite(holding);
        }
        const losingKey = holding || (gainingKey ? opposite(gainingKey) : null);
        if (gainingKey) currentPossession = gainingKey;

        const actorName = log.scorerName || "";
        const metaDetails = actorName
          ? isBlock
            ? `${actorName} denied ${losingKey ? nameOf(losingKey) : "opposition"}`
            : `${actorName} credited`
          : `${gainingKey ? nameOf(gainingKey) : "Team"} gains possession`;

        advance();
        return {
          ...base,
          label: "TO",
          description: label || (isBlock ? "Block" : "Turnover"),
          teamLabel: gainingKey ? shortOf(gainingKey) : "-",
          scorer: "-",
          assist: "-",
          metaDetails,
          isBlock,
          variant:
            gainingKey === TEAM_A ? "turnoverA" : gainingKey === TEAM_B ? "turnoverB" : "turnover",
        };
      }

      case MATCH_LOG_EVENT_CODES.TIMEOUT_START: {
        const teamKey = log.team === "A" ? TEAM_A : log.team === "B" ? TEAM_B : null;
        advance();
        return {
          ...base,
          label: "TO",
          description: "Timeout",
          teamLabel: teamKey ? shortOf(teamKey) : "-",
          scorer: "-",
          assist: "-",
          variant: "timeout",
        };
      }

      case MATCH_LOG_EVENT_CODES.STOPPAGE_START:
        advance();
        return {
          ...base,
          label: "ST",
          description: "Stoppage",
          teamLabel: "-",
          scorer: "-",
          assist: "-",
          variant: "stoppage",
        };

      case MATCH_LOG_EVENT_CODES.HALFTIME_START:
        advance();
        return {
          ...base,
          label: "HT",
          description: "Halftime",
          teamLabel: "-",
          scorer: "-",
          assist: "-",
          variant: "halftime",
        };

      // The matches page emits no row for these — they only close a band. They
      // are kept here so a director can still see and repair them, marked so the
      // table can render them de-emphasised.
      case MATCH_LOG_EVENT_CODES.TIMEOUT_END:
      case MATCH_LOG_EVENT_CODES.STOPPAGE_END:
      case MATCH_LOG_EVENT_CODES.HALFTIME_END: {
        const endLabels = {
          [MATCH_LOG_EVENT_CODES.TIMEOUT_END]: "Timeout end",
          [MATCH_LOG_EVENT_CODES.STOPPAGE_END]: "Stoppage end",
          [MATCH_LOG_EVENT_CODES.HALFTIME_END]: "Halftime end",
        };
        advance();
        return {
          ...base,
          label: "·",
          description: endLabels[log.eventCode],
          teamLabel: "-",
          scorer: "-",
          assist: "-",
          variant: "",
          isBandEnd: true,
        };
      }

      default:
        advance();
        return {
          ...base,
          label: "·",
          description: log.eventDescription || "Event",
          teamLabel: log.team ? shortOf(log.team === "A" ? TEAM_A : TEAM_B) : "-",
          scorer: "-",
          assist: "-",
          variant: "",
        };
    }
  });
}

/** Build the playerId -> name fallback map from one or more roster arrays. */
export function buildNameLookup(...rosters) {
  const lookup = new Map();
  rosters.flat().forEach((player) => {
    if (player?.id && player?.name) {
      lookup.set(player.id, player.name);
    }
  });
  return lookup;
}

/** Build the event_type_id -> code map from getMatchEventDefinitions(). */
export function buildEventCodeMap(definitions) {
  const map = new Map();
  (Array.isArray(definitions) ? definitions : []).forEach((definition) => {
    if (definition?.id != null && definition?.code) {
      map.set(Number(definition.id), definition.code);
    }
  });
  return map;
}
