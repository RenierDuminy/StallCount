// Automatic discrepancy detection for match logs.
//
// Pure: no network, no React. Everything it needs is passed in, so it can be
// reasoned about (and hand-tested) in isolation.
//
// Design rule: every check degrades quietly. Missing rules, missing rosters or an
// empty log must produce *fewer* findings, never false ones. A checker that cries
// wolf on well-formed data gets ignored, and then it is worse than nothing.

import { MATCH_LOG_EVENT_CODES } from "./matchLogService";
import { resolveEventCode } from "./matchLogDerivation";

export const SEVERITY = {
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
};

const FINISHED_STATUSES = new Set(["finished", "completed"]);

// `events.rules` has two naming generations in the wild (older events were
// written with the pre-rename keys). These mirror the private accessors in
// src/pages/scorekeeper/useScoreKeeperData.js:213-240 — read through them, never
// `rules.game.hardCapMinutes` directly, or legacy events silently skip checks.
const getGameTimeCapMinutes = (rules) =>
  rules?.game?.timeCapMinutes ?? rules?.game?.hardCapMinutes;
const getHalfPointTarget = (rules) =>
  rules?.half?.halftimePointTarget ?? rules?.half?.pointTarget;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toTime = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Pair-wise open/close codes that must balance across the match. */
const PAIRED_CODES = [
  {
    start: MATCH_LOG_EVENT_CODES.TIMEOUT_START,
    end: MATCH_LOG_EVENT_CODES.TIMEOUT_END,
    label: "Timeout",
  },
  {
    start: MATCH_LOG_EVENT_CODES.HALFTIME_START,
    end: MATCH_LOG_EVENT_CODES.HALFTIME_END,
    label: "Halftime",
  },
  {
    start: MATCH_LOG_EVENT_CODES.STOPPAGE_START,
    end: MATCH_LOG_EVENT_CODES.STOPPAGE_END,
    label: "Stoppage",
  },
];

// Two scoring rows this close together are almost certainly a double-tap or an
// offline-queue replay rather than two real points.
const DUPLICATE_SCORE_WINDOW_MS = 2000;

function makeFinding(finding) {
  return {
    severity: SEVERITY.WARNING,
    logIds: [],
    ...finding,
  };
}

/**
 * @param {object}   input
 * @param {object}   input.match       the match row (score_a, score_b, status, team_a/team_b objects)
 * @param {Array}    input.logs        raw match_logs rows
 * @param {object}   input.derived     output of deriveMatchLogs()
 * @param {object}   [input.eventRules] events.rules jsonb (nested raw shape)
 * @param {object}   [input.rosters]   { teamA: [], teamB: [] }
 * @param {Map}      [input.eventCodeById]
 * @returns {Array} findings, most severe first
 */
export function analyseMatchLogs(input) {
  const {
    match,
    logs = [],
    derived,
    eventRules = null,
    rosters = { teamA: [], teamB: [] },
    eventCodeById = null,
  } = input || {};

  if (!match) return [];

  const findings = [];
  const rows = Array.isArray(logs) ? logs : [];
  const derivedLogs = derived?.logs ?? [];
  const totals = derived?.totals ?? { a: 0, b: 0 };

  const teamAId = match.team_a?.id ?? match.team_a ?? null;
  const teamBId = match.team_b?.id ?? match.team_b ?? null;
  const status = String(match.status || "").toLowerCase();
  const isFinished = FINISHED_STATUSES.has(status);

  const codeOf = (row) => resolveEventCode(row, eventCodeById);
  const rowsWithCode = rows.map((row) => ({ row, code: codeOf(row) }));
  const byCode = (code) => rowsWithCode.filter((entry) => entry.code === code);

  // ---------------------------------------------------------------- structural

  const startRows = byCode(MATCH_LOG_EVENT_CODES.MATCH_START);
  const endRows = byCode(MATCH_LOG_EVENT_CODES.MATCH_END);

  if (rows.length === 0) {
    findings.push(
      makeFinding({
        code: "no_logs",
        severity: isFinished ? SEVERITY.ERROR : SEVERITY.INFO,
        title: "No match logs recorded",
        detail: isFinished
          ? "This match is marked finished but has no log entries at all. Its score cannot be verified against a point-by-point record."
          : "No log entries yet. Nothing to check until scoring begins.",
      }),
    );
    // Without rows every remaining check is noise.
    return sortFindings(findings);
  }

  if (startRows.length === 0) {
    findings.push(
      makeFinding({
        code: "missing_match_start",
        severity: SEVERITY.ERROR,
        title: "Missing match start",
        detail: "No match_start entry. The timeline has no anchor, so elapsed-time checks cannot run.",
      }),
    );
  }
  if (startRows.length > 1) {
    findings.push(
      makeFinding({
        code: "duplicate_match_start",
        severity: SEVERITY.ERROR,
        title: `${startRows.length} match start entries`,
        detail: "A match can only start once. Extra entries are usually a console restart.",
        logIds: startRows.slice(1).map((entry) => entry.row.id),
      }),
    );
  }
  if (isFinished && endRows.length === 0) {
    findings.push(
      makeFinding({
        code: "missing_match_end",
        severity: SEVERITY.ERROR,
        title: "Missing match end",
        detail: "This match is marked finished but has no match_end entry.",
      }),
    );
  }
  if (endRows.length > 1) {
    findings.push(
      makeFinding({
        code: "duplicate_match_end",
        severity: SEVERITY.ERROR,
        title: `${endRows.length} match end entries`,
        detail: "Only the first match_end should exist. Later ones usually mean the match was ended twice.",
        logIds: endRows.slice(1).map((entry) => entry.row.id),
      }),
    );
  }

  // Unclosed / unopened pairs, tracked in timeline order.
  PAIRED_CODES.forEach(({ start, end, label }) => {
    let open = 0;
    const danglingEnds = [];
    const openIds = [];
    rowsWithCode.forEach(({ row, code }) => {
      if (code === start) {
        open += 1;
        openIds.push(row.id);
      } else if (code === end) {
        if (open === 0) {
          danglingEnds.push(row.id);
        } else {
          open -= 1;
          openIds.pop();
        }
      }
    });
    if (open > 0) {
      findings.push(
        makeFinding({
          code: `unclosed_${start}`,
          severity: SEVERITY.WARNING,
          title: `${label} never closed`,
          detail: `${open} ${label.toLowerCase()} start entr${open === 1 ? "y has" : "ies have"} no matching end. The clock display for this period will be wrong.`,
          logIds: openIds,
        }),
      );
    }
    if (danglingEnds.length) {
      findings.push(
        makeFinding({
          code: `unopened_${end}`,
          severity: SEVERITY.WARNING,
          title: `${label} ended without starting`,
          detail: `${danglingEnds.length} ${label.toLowerCase()} end entr${danglingEnds.length === 1 ? "y has" : "ies have"} no matching start.`,
          logIds: danglingEnds,
        }),
      );
    }
  });

  // Events after match_end.
  const firstEndTime = endRows.length ? toTime(endRows[0].row.created_at) : null;
  if (firstEndTime != null) {
    const after = rows.filter((row) => {
      const time = toTime(row.created_at);
      return time != null && time > firstEndTime && row.id !== endRows[0].row.id;
    });
    if (after.length) {
      findings.push(
        makeFinding({
          code: "events_after_match_end",
          severity: SEVERITY.WARNING,
          title: `${after.length} entr${after.length === 1 ? "y" : "ies"} logged after match end`,
          detail: "Entries recorded after the match_end timestamp. Either the match ended early or these belong to another match.",
          logIds: after.map((row) => row.id),
        }),
      );
    }
  }

  // ------------------------------------------------------------------ timeline

  const timedRows = rows
    .map((row) => ({ id: row.id, time: toTime(row.created_at) }))
    .filter((entry) => entry.time != null);

  for (let i = 1; i < timedRows.length; i += 1) {
    if (timedRows[i].time < timedRows[i - 1].time) {
      findings.push(
        makeFinding({
          code: "out_of_order",
          severity: SEVERITY.WARNING,
          title: "Entries out of chronological order",
          detail: "At least one entry has an earlier timestamp than the entry before it. Because point numbers are derived from created_at order, the log will renumber once this is fixed.",
          logIds: [timedRows[i - 1].id, timedRows[i].id],
        }),
      );
      break;
    }
  }

  // Duplicate timestamps: this is what makes updateMatchLogEntryByTimestamp
  // throw "Multiple match log entries share this timestamp".
  const timeGroups = new Map();
  timedRows.forEach((entry) => {
    const list = timeGroups.get(entry.time) || [];
    list.push(entry.id);
    timeGroups.set(entry.time, list);
  });
  const duplicateGroups = Array.from(timeGroups.values()).filter((ids) => ids.length > 1);
  if (duplicateGroups.length) {
    findings.push(
      makeFinding({
        code: "duplicate_timestamps",
        severity: SEVERITY.WARNING,
        title: `${duplicateGroups.length} timestamp collision${duplicateGroups.length === 1 ? "" : "s"}`,
        detail: "Multiple entries share an identical created_at. Their order in the timeline is arbitrary, and timestamp-based edits refuse to write against them.",
        logIds: duplicateGroups.flat(),
      }),
    );
  }

  // Near-simultaneous scoring rows.
  const scoringTimed = derivedLogs
    .filter((log) => log.isScoreEvent)
    .map((log) => ({ id: log.id, time: toTime(log.timestamp) }))
    .filter((entry) => entry.time != null);
  const rapidPairs = [];
  for (let i = 1; i < scoringTimed.length; i += 1) {
    const gap = scoringTimed[i].time - scoringTimed[i - 1].time;
    if (gap >= 0 && gap < DUPLICATE_SCORE_WINDOW_MS) {
      rapidPairs.push(scoringTimed[i - 1].id, scoringTimed[i].id);
    }
  }
  if (rapidPairs.length) {
    findings.push(
      makeFinding({
        code: "rapid_scores",
        severity: SEVERITY.WARNING,
        title: "Points scored within seconds of each other",
        detail: "Two or more scoring entries fall inside a two-second window, which usually means a double-tap or a replayed offline entry rather than two real points.",
        logIds: Array.from(new Set(rapidPairs)),
      }),
    );
  }

  // Entries outside the match window.
  const firstStartTime = startRows.length ? toTime(startRows[0].row.created_at) : null;
  if (firstStartTime != null) {
    const before = rows.filter((row) => {
      const time = toTime(row.created_at);
      return time != null && time < firstStartTime && row.id !== startRows[0].row.id;
    });
    if (before.length) {
      findings.push(
        makeFinding({
          code: "events_before_match_start",
          severity: SEVERITY.WARNING,
          title: `${before.length} entr${before.length === 1 ? "y" : "ies"} logged before match start`,
          detail: "Entries timestamped earlier than match_start.",
          logIds: before.map((row) => row.id),
        }),
      );
    }
  }

  // --------------------------------------------------------- score/attribution

  const storedA = toNumber(match.score_a) ?? 0;
  const storedB = toNumber(match.score_b) ?? 0;
  if (storedA !== totals.a || storedB !== totals.b) {
    findings.push(
      makeFinding({
        code: "score_mismatch",
        severity: SEVERITY.ERROR,
        title: "Published score does not match the log",
        detail: `Stored ${storedA}–${storedB}, log-derived ${totals.a}–${totals.b}. The log is the source of truth for player statistics, so these must agree.`,
        suggestedFix: { kind: "apply_derived_score", payload: { scoreA: totals.a, scoreB: totals.b } },
      }),
    );
  }

  // Scoring rows attributed to neither team are counted for nobody. This is how
  // a point disappears while the published score still looks plausible.
  const orphanScores = derivedLogs.filter((log) => log.isScoreEvent && log.team === null);
  if (orphanScores.length) {
    findings.push(
      makeFinding({
        code: "orphan_score_team",
        severity: SEVERITY.ERROR,
        title: `${orphanScores.length} point${orphanScores.length === 1 ? "" : "s"} not attributed to either team`,
        detail: "These scoring entries carry a team_id that is null or does not match either team in this fixture, so they count towards neither side's total.",
        logIds: orphanScores.map((log) => log.id),
      }),
    );
  }

  const missingScorer = derivedLogs.filter((log) => log.isScoreEvent && !log.scorerId);
  if (missingScorer.length) {
    findings.push(
      makeFinding({
        code: "missing_scorer",
        severity: SEVERITY.WARNING,
        title: `${missingScorer.length} point${missingScorer.length === 1 ? "" : "s"} with no scorer`,
        detail: "The point counts towards the team total but is credited to no player, so it is missing from player statistics.",
        logIds: missingScorer.map((log) => log.id),
      }),
    );
  }

  const selfAssist = derivedLogs.filter(
    (log) => log.scorerId && log.assistId && log.scorerId === log.assistId,
  );
  if (selfAssist.length) {
    findings.push(
      makeFinding({
        code: "self_assist",
        severity: SEVERITY.ERROR,
        title: `${selfAssist.length} point${selfAssist.length === 1 ? "" : "s"} assisted by the scorer`,
        detail: "A player cannot assist their own goal. This double-counts them in the statistics.",
        logIds: selfAssist.map((log) => log.id),
      }),
    );
  }

  const callahanWithAssist = derivedLogs.filter(
    (log) => log.eventCode === MATCH_LOG_EVENT_CODES.CALAHAN && log.assistId,
  );
  if (callahanWithAssist.length) {
    findings.push(
      makeFinding({
        code: "callahan_with_assist",
        severity: SEVERITY.WARNING,
        title: "Callahan recorded with an assist",
        detail: "A Callahan is caught in the opposing end zone off a turnover, so it has no assisting player.",
        logIds: callahanWithAssist.map((log) => log.id),
      }),
    );
  }

  // Roster membership. Warning only: rosters change and historical logs can
  // legitimately reference a player who has since left the team.
  const rosterA = new Set((rosters?.teamA ?? []).map((player) => player.id));
  const rosterB = new Set((rosters?.teamB ?? []).map((player) => player.id));
  if (rosterA.size || rosterB.size) {
    const offRoster = derivedLogs.filter((log) => {
      if (!log.isScoreEvent || !log.scorerId || !log.team) return false;
      const roster = log.team === "A" ? rosterA : rosterB;
      // Only judge a side whose roster we actually loaded.
      if (roster.size === 0) return false;
      return !roster.has(log.scorerId);
    });
    if (offRoster.length) {
      findings.push(
        makeFinding({
          code: "scorer_off_roster",
          severity: SEVERITY.WARNING,
          title: `${offRoster.length} point${offRoster.length === 1 ? "" : "s"} credited to a non-roster player`,
          detail: "The scorer is not on that team's roster for this event. This is expected if the player has since been removed; it is a problem if the point was credited to the wrong side.",
          logIds: offRoster.map((log) => log.id),
        }),
      );
    }
  }

  // ------------------------------------------------------------- caps & rules

  if (!eventRules) {
    findings.push(
      makeFinding({
        code: "no_event_rules",
        severity: SEVERITY.INFO,
        title: "No event rules configured",
        detail: "Cap and target checks were skipped because this event has no rules set.",
      }),
    );
  } else if (isFinished) {
    const pointTarget = toNumber(eventRules?.game?.pointTarget);
    const softCapMinutes = toNumber(eventRules?.game?.softCapMinutes);
    const timeCapMinutes = toNumber(getGameTimeCapMinutes(eventRules));
    const halfTarget = toNumber(getHalfPointTarget(eventRules));
    const timeoutsPerTeam = toNumber(eventRules?.timeouts?.perTeamPerGame);

    const winning = Math.max(totals.a, totals.b);
    const losing = Math.min(totals.a, totals.b);
    const hasCapEvidence = softCapMinutes != null || timeCapMinutes != null;

    if (pointTarget != null && winning < pointTarget && !hasCapEvidence) {
      findings.push(
        makeFinding({
          code: "below_point_target",
          severity: SEVERITY.WARNING,
          title: `Final score below the point target of ${pointTarget}`,
          detail: `The match finished ${totals.a}–${totals.b}. With no cap configured for this event, a match should normally run to ${pointTarget}.`,
        }),
      );
    }

    if (pointTarget != null && winning > pointTarget) {
      findings.push(
        makeFinding({
          code: "above_point_target",
          severity: SEVERITY.WARNING,
          title: `Winning score exceeds the point target of ${pointTarget}`,
          detail: `The match finished ${totals.a}–${totals.b}, above the configured target. Extra points usually mean a duplicated scoring entry.`,
        }),
      );
    }

    if (winning === losing) {
      findings.push(
        makeFinding({
          code: "tied_final",
          severity: SEVERITY.ERROR,
          title: "Finished match is tied",
          detail: `The log derives ${totals.a}–${totals.b}. Ultimate matches cannot end level, so a point is missing or misattributed.`,
        }),
      );
    }

    // Halftime should land near the configured half target.
    const halftimeRow = byCode(MATCH_LOG_EVENT_CODES.HALFTIME_START)[0];
    if (halfTarget != null && halftimeRow) {
      const atHalftime = derivedLogs.find((log) => log.id === halftimeRow.row.id);
      if (atHalftime) {
        const leader = Math.max(atHalftime.totalA, atHalftime.totalB);
        if (leader !== halfTarget) {
          findings.push(
            makeFinding({
              code: "halftime_score_mismatch",
              severity: SEVERITY.INFO,
              title: `Halftime called at ${atHalftime.totalA}–${atHalftime.totalB}`,
              detail: `The event's half target is ${halfTarget}. Halftime is also reachable on time, so this is only worth checking if the match was not time-capped.`,
              logIds: [halftimeRow.row.id],
            }),
          );
        }
      }
    }

    // Timeout allowance per team.
    if (timeoutsPerTeam != null && timeoutsPerTeam > 0) {
      const timeoutRows = byCode(MATCH_LOG_EVENT_CODES.TIMEOUT_START);
      [
        { id: teamAId, label: match.team_a?.name || "Team A" },
        { id: teamBId, label: match.team_b?.name || "Team B" },
      ].forEach((team) => {
        if (!team.id) return;
        const used = timeoutRows.filter((entry) => entry.row.team_id === team.id);
        if (used.length > timeoutsPerTeam) {
          findings.push(
            makeFinding({
              code: "timeouts_exceeded",
              severity: SEVERITY.WARNING,
              title: `${team.label} used ${used.length} timeouts`,
              detail: `The event allows ${timeoutsPerTeam} per team per game.`,
              logIds: used.map((entry) => entry.row.id),
            }),
          );
        }
      });
    }
  }

  return sortFindings(findings);
}

const SEVERITY_RANK = { [SEVERITY.ERROR]: 0, [SEVERITY.WARNING]: 1, [SEVERITY.INFO]: 2 };

function sortFindings(findings) {
  return findings
    .map((finding, index) => ({ ...finding, id: `${finding.code}:${index}` }))
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3));
}

export function summariseFindings(findings) {
  const list = Array.isArray(findings) ? findings : [];
  return {
    errors: list.filter((finding) => finding.severity === SEVERITY.ERROR).length,
    warnings: list.filter((finding) => finding.severity === SEVERITY.WARNING).length,
    info: list.filter((finding) => finding.severity === SEVERITY.INFO).length,
    total: list.length,
  };
}
