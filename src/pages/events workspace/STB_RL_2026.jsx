import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  Chip,
  Panel,
  SectionHeader,
  SectionShell,
} from "../../components/ui/primitives";
import { StandardEventMatchCard } from "../../components/StandardEventMatchCard";
import { useAuth } from "../../context/AuthContext";
import { getEventHierarchy } from "../../services/leagueService";
import { getMatchesByEvent } from "../../services/matchService";
import { getBracketsByEvent } from "../../services/playoffStructureService";
import BracketStructureView from "../playoff/BracketStructureView";
import { executeCustomScript } from "../../services/customScriptService";
import {
  getStbRl26RosterSyncStatus,
  invokeStbRl26RosterSync,
} from "../../services/stbRl26RosterSyncService";
import {
  userHasAnyRole,
  SYS_ADMIN_ACCESS_ROLES,
  TOURNAMENT_DIRECTOR_ACCESS_ROLES,
} from "../../utils/accessControl";

export const EVENT_ID = "e6a34716-f9d6-4d70-bc1a-b610a04e3eaf";
export const EVENT_SLUG = "stellenbosch-rl-2026";
export const EVENT_NAME = "Stellenbosch RL 2026";
const MATCH_LIMIT = 200;
const SAST_TIMEZONE = "Africa/Johannesburg";
const SAST_UTC_OFFSET_HOURS = 2;
const AUTO_ROSTER_SYNC_HOUR_SAST = 17;
const AUTO_ROSTER_SYNC_INTERVAL_MS = 30 * 1000;
const ROSTER_SCRIPT_SLUG = "STB_RL_26_update_rosters";
const LIVE_STATUSES = new Set(["live", "halftime"]);
const FINISHED_STATUSES = new Set(["finished", "completed"]);
const STANDINGS_WIN_POINTS = 3;
const STANDINGS_LOSS_POINTS = 1;
const STANDINGS_CLOSE_LOSS_POINTS = 2;
const STANDINGS_CLOSE_LOSS_MAX_MARGIN = 4;
const TEAM_STANDINGS_GRID_STYLE = {
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))",
};
const MENS_DIVISION_POOL_LETTERS = new Set(["a", "b", "c", "d"]);
const MENS_DIVISION_STANDINGS_START_DATE = "2026-04-13";
const MENS_DIVISION_STANDINGS_END_DATE = "2026-07-23";
const SUMMARY_RULES_HREF = "/rules/stellenbosch-rl-2026-rules-summary.pdf";
const FULL_RULES_HREF = "/rules/stellenbosch-rl-2026-rules.pdf";
const RULE_DOCUMENTS = [
  {
    name: "Rules-of-Ultimate - STB 5v5 edition (summary).pdf",
    href: SUMMARY_RULES_HREF,
  },
  {
    name: "Rules-of-Ultimate - STB 5v5 edition.pdf",
    href: FULL_RULES_HREF,
  },
];
const PHASE_WEEK_GROUPS = [
  {
    id: "phase-1",
    title: "Pool play",
    description: "Round robin pool games (MMP) and development fixtures (FMP).",
    weeks: [
      {
        id: "week-1",
        label: "Week 1",
        dateRange: "13 Apr - 16 Apr",
        days: [
          { id: "2026-04-13", day: "Monday", date: "13 Apr" },
          { id: "2026-04-14", day: "Tuesday", date: "14 Apr" },
          { id: "2026-04-15", day: "Wednesday", date: "15 Apr" },
          { id: "2026-04-16", day: "Thursday", date: "16 Apr" },
        ],
      },
      {
        id: "week-2",
        label: "Week 2",
        dateRange: "20 Apr - 23 Apr",
        days: [
          { id: "2026-04-20", day: "Monday", date: "20 Apr" },
          { id: "2026-04-21", day: "Tuesday", date: "21 Apr" },
          { id: "2026-04-22", day: "Wednesday", date: "22 Apr" },
          { id: "2026-04-23", day: "Thursday", date: "23 Apr" },
        ],
      },
      {
        id: "week-3",
        label: "Week 3",
        dateRange: "27 Apr - 30 Apr",
        days: [
          { id: "2026-04-27", day: "Monday", date: "27 Apr" },
          { id: "2026-04-28", day: "Tuesday", date: "28 Apr" },
          { id: "2026-04-29", day: "Wednesday", date: "29 Apr" },
          { id: "2026-04-30", day: "Thursday", date: "30 Apr" },
        ],
      },
    ],
  },
  {
    id: "phase-2",
    title: "Pool crossover",
    description:
      "MMP crossover games with FMP round robin pool games, followed by the MMP seeding stage with FMP crossover and seeding fixtures.",
    weeks: [
      {
        id: "week-4",
        label: "Week 4",
        dateRange: "4 May - 7 May",
        days: [
          { id: "2026-05-04", day: "Monday", date: "4 May" },
          { id: "2026-05-05", day: "Tuesday", date: "5 May" },
          { id: "2026-05-06", day: "Wednesday", date: "6 May" },
          { id: "2026-05-07", day: "Thursday", date: "7 May" },
        ],
      },
      {
        id: "week-5",
        label: "Week 5",
        dateRange: "11 May - 14 May",
        days: [
          { id: "2026-05-11", day: "Monday", date: "11 May" },
          { id: "2026-05-12", day: "Tuesday", date: "12 May" },
          { id: "2026-05-13", day: "Wednesday", date: "13 May" },
          { id: "2026-05-14", day: "Thursday", date: "14 May" },
        ],
      },
      {
        id: "week-6",
        label: "Week 6",
        dateRange: "18 May - 21 May",
        days: [
          { id: "2026-05-18", day: "Monday", date: "18 May" },
          { id: "2026-05-19", day: "Tuesday", date: "19 May" },
          { id: "2026-05-20", day: "Wednesday", date: "20 May" },
          { id: "2026-05-21", day: "Thursday", date: "21 May" },
        ],
      },
      {
        id: "week-7",
        label: "Week 7",
        dateRange: "20 Jul - 23 Jul",
        days: [
          { id: "2026-07-20", day: "Monday", date: "20 Jul" },
          { id: "2026-07-21", day: "Tuesday", date: "21 Jul" },
          { id: "2026-07-22", day: "Wednesday", date: "22 Jul" },
          { id: "2026-07-23", day: "Thursday", date: "23 Jul" },
        ],
      },
    ],
  },
];

const BRACKET_TYPE_LABELS = {
  placement: "Placement",
  single_elim: "Single elimination",
  double_elim: "Double elimination",
  play_in: "Play-in",
  custom: "Custom",
};

// Human label for a bracket's `type` column, shown beside its name when the
// event publishes more than one bracket.
function formatBracketType(value) {
  if (!value) return "Bracket";
  return (
    BRACKET_TYPE_LABELS[value] ||
    String(value)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

function PdfIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14 2v5h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 16h8M8 12h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const formatMatchup = (match) => {
  const teamA = match.team_a?.name || "Team A";
  const teamB = match.team_b?.name || "Team B";
  return `${teamA} vs ${teamB}`;
};

const formatScoreLine = (match) => {
  const scoreA =
    typeof match.score_a === "number" ? match.score_a.toString() : "-";
  const scoreB =
    typeof match.score_b === "number" ? match.score_b.toString() : "-";
  return `${scoreA} - ${scoreB}`;
};

const formatMatchStatus = (status) => {
  if (!status) return "Scheduled";
  const normalized = status.toString().trim().toLowerCase();
  if (!normalized) return "Scheduled";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const isLiveMatch = (status) => LIVE_STATUSES.has((status || "").toLowerCase());
const isFinishedMatch = (status) =>
  FINISHED_STATUSES.has((status || "").toLowerCase());

const formatMatchTime = (value) => {
  if (!value) {
    return "Start time pending";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Start time pending";
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SAST_TIMEZONE,
  });
};

const formatDateKey = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: SAST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const sortByStartTimeAsc = (left, right) => {
  const leftTime = left?.start_time ? new Date(left.start_time).getTime() : Infinity;
  const rightTime = right?.start_time ? new Date(right.start_time).getTime() : Infinity;
  return leftTime - rightTime;
};

const buildPoolTeams = (pool) => {
  const rows = [];
  const seen = new Set();
  (pool?.teams || []).forEach((entry) => {
    if (!entry?.team?.id || seen.has(entry.team.id)) return;
    seen.add(entry.team.id);
    rows.push({
      id: entry.team.id,
      name: entry.team.name || "Team",
      shortName: entry.team.short_name || null,
      seed:
        typeof entry.seed === "number" && !Number.isNaN(entry.seed)
          ? entry.seed
          : null,
    });
  });
  rows.sort((a, b) => {
    if (a.seed !== null && b.seed !== null) {
      return a.seed - b.seed || a.name.localeCompare(b.name);
    }
    if (a.seed !== null) return -1;
    if (b.seed !== null) return 1;
    return a.name.localeCompare(b.name);
  });
  return rows;
};

const getEventPools = (eventData) =>
  (eventData?.divisions || []).flatMap((division, divisionIndex) =>
    (division?.pools || []).map((pool, poolIndex) => ({
      ...pool,
      id: pool.id || `${division.id || divisionIndex}-${poolIndex}`,
      name: pool.name || "Pool",
    })),
  );

const getPoolLetter = (pool) => {
  const normalizedName = (pool?.name || "").toString().trim().toLowerCase();
  const poolMatch = normalizedName.match(/\bpool\s*([a-z])\b/);
  const singleLetterMatch = normalizedName.match(/^([a-z])$/);
  return poolMatch?.[1] || singleLetterMatch?.[1] || "";
};

const isCombinedHousePool = (pool) =>
  MENS_DIVISION_POOL_LETTERS.has(getPoolLetter(pool));

const buildStandingsPoolGroups = (eventData) => {
  const pools = getEventPools(eventData);
  const combinedPools = pools.filter(isCombinedHousePool);
  const separatePools = pools.filter((pool) => !isCombinedHousePool(pool));

  return [
    ...(combinedPools.length
      ? [
          {
            id: "mens-division",
            name: "Men's Division",
            pools: combinedPools,
            showRank: true,
            matchMode: "team_date_range",
            matchStartDateKey: MENS_DIVISION_STANDINGS_START_DATE,
            matchEndDateKey: MENS_DIVISION_STANDINGS_END_DATE,
          },
        ]
      : []),
    ...separatePools.map((pool) => ({
      id: pool.id,
      name: pool.name,
      pools: [pool],
    })),
  ];
};

const buildPoolGroupTeams = (pools) => {
  const rowsByTeam = new Map();
  (pools || []).forEach((pool) => {
    buildPoolTeams(pool).forEach((team) => {
      const existing = rowsByTeam.get(team.id);
      if (!existing) {
        rowsByTeam.set(team.id, team);
        return;
      }
      if (
        existing.seed === null ||
        (team.seed !== null && team.seed < existing.seed)
      ) {
        rowsByTeam.set(team.id, team);
      }
    });
  });
  return Array.from(rowsByTeam.values()).sort((a, b) => {
    if (a.seed !== null && b.seed !== null) {
      return a.seed - b.seed || a.name.localeCompare(b.name);
    }
    if (a.seed !== null) return -1;
    if (b.seed !== null) return 1;
    return a.name.localeCompare(b.name);
  });
};

const buildPoolGroupIds = (pools) =>
  new Set((pools || []).map((pool) => pool?.id).filter(Boolean));

const formatScoreDiff = (value) => {
  if (!Number.isFinite(value) || value === 0) return "0";
  return value > 0 ? `+${value}` : `${value}`;
};

const getStandingsLossPoints = (scoreFor, scoreAgainst) =>
  scoreAgainst - scoreFor <= STANDINGS_CLOSE_LOSS_MAX_MARGIN
    ? STANDINGS_CLOSE_LOSS_POINTS
    : STANDINGS_LOSS_POINTS;

const StandingsTable = ({ rows, showRank = false }) => {
  if (!rows.length) {
    return <p className="text-sm text-ink-muted">No standings available yet.</p>;
  }
  return (
    <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded border border-border bg-surface">
      <table className="w-full table-fixed whitespace-nowrap text-xs">
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            {showRank ? (
              <th className="w-8 px-0.5 py-1 text-center font-semibold">#</th>
            ) : null}
            <th className="w-full px-1 py-1 text-left font-semibold">Team</th>
            <th className="w-10 px-0.5 py-1 text-center font-semibold">Pts</th>
            <th className="w-10 px-0.5 py-1 text-center font-semibold">W-L</th>
            <th className="w-9 px-0.5 py-1 text-center font-semibold">+/-</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id}
              style={{
                background:
                  index % 2 === 0
                    ? "var(--sc-surface)"
                    : "var(--sc-surface-muted)",
              }}
            >
              {showRank ? (
                <td className="px-0.5 py-1 text-center tabular-nums text-ink-muted">
                  {index + 1}
                </td>
              ) : null}
              <td className="min-w-0 px-1 py-1" title={row.name}>
                <span className="block truncate">{row.name}</span>
              </td>
              <td className="px-0.5 py-1 text-center tabular-nums">{row.points}</td>
              <td className="px-0.5 py-1 text-center tabular-nums">{`${row.wins}-${row.losses}`}</td>
              <td className="px-0.5 py-1 text-center tabular-nums">{formatScoreDiff(row.scoreDiff)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const isDateKeyInRange = (dateKey, startDateKey, endDateKey) => {
  if (!dateKey) return false;
  if (startDateKey && dateKey < startDateKey) return false;
  if (endDateKey && dateKey > endDateKey) return false;
  return true;
};

const buildPoolGroupStandings = (pools, matches, options = {}) => {
  const teams = buildPoolGroupTeams(pools);
  const poolIds = buildPoolGroupIds(pools);
  const teamIds = new Set(teams.map((team) => team.id));
  const standingsByTeam = new Map(
    teams.map((team) => [
      team.id,
      {
        ...team,
        wins: 0,
        losses: 0,
        played: 0,
        points: 0,
        scoreDiff: 0,
      },
    ]),
  );

  const poolMatches = (matches || []).filter((match) => {
    if (options.matchMode === "team_date_range") {
      if (
        !isDateKeyInRange(
          formatDateKey(match?.start_time),
          options.matchStartDateKey,
          options.matchEndDateKey,
        )
      ) {
        return false;
      }

      const teamAId = match?.team_a?.id;
      const teamBId = match?.team_b?.id;
      return teamIds.has(teamAId) && teamIds.has(teamBId);
    }

    return match?.pool_id && poolIds.has(match.pool_id);
  });

  poolMatches.forEach((match) => {
    if (!isFinishedMatch(match?.status)) return;
    if (typeof match?.score_a !== "number" || typeof match?.score_b !== "number") {
      return;
    }

    const teamAId = match.team_a?.id;
    const teamBId = match.team_b?.id;
    const teamAStanding = teamAId ? standingsByTeam.get(teamAId) : null;
    const teamBStanding = teamBId ? standingsByTeam.get(teamBId) : null;

    if (teamAStanding) {
      teamAStanding.played += 1;
      teamAStanding.scoreDiff += match.score_a - match.score_b;
      if (match.score_a > match.score_b) {
        teamAStanding.wins += 1;
        teamAStanding.points += STANDINGS_WIN_POINTS;
      } else if (match.score_a < match.score_b) {
        teamAStanding.losses += 1;
        teamAStanding.points += getStandingsLossPoints(match.score_a, match.score_b);
      }
    }

    if (teamBStanding) {
      teamBStanding.played += 1;
      teamBStanding.scoreDiff += match.score_b - match.score_a;
      if (match.score_b > match.score_a) {
        teamBStanding.wins += 1;
        teamBStanding.points += STANDINGS_WIN_POINTS;
      } else if (match.score_b < match.score_a) {
        teamBStanding.losses += 1;
        teamBStanding.points += getStandingsLossPoints(match.score_b, match.score_a);
      }
    }
  });

  return Array.from(standingsByTeam.values()).sort(
    (a, b) =>
      b.points - a.points ||
      b.scoreDiff - a.scoreDiff ||
      b.wins - a.wins ||
      a.losses - b.losses ||
      a.name.localeCompare(b.name),
  );
};

const padNumber = (value) => String(value).padStart(2, "0");

const getSastDateParts = (value = new Date()) => {
  const shifted = new Date(value.getTime() + SAST_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
};

const createDateForSastTime = ({ year, monthIndex, day, hour, minute = 0 }) =>
  new Date(Date.UTC(year, monthIndex, day, hour - SAST_UTC_OFFSET_HOURS, minute, 0, 0));

const formatSastScheduleTime = (value) => {
  if (!value) return "Not scheduled";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SAST_TIMEZONE,
  });
};

const formatDurationUntil = (milliseconds) => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "due now";
  }

  const totalMinutes = Math.ceil(milliseconds / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const buildRosterSyncErrorDetails = (output) => {
  const sections = [];

  if (Array.isArray(output?.logs) && output.logs.length > 0) {
    sections.push(`Recent logs:\n${output.logs.slice(-12).join("\n")}`);
  }

  const stack = String(output?.error?.stack || "").trim();
  if (stack) {
    sections.push(`Stack trace:\n${stack}`);
  }

  return sections.join("\n\n").trim();
};

const getRosterScriptScheduleSnapshot = (value = new Date()) => {
  const parts = getSastDateParts(value);
  const isTodaysSlotActive = parts.hour >= AUTO_ROSTER_SYNC_HOUR_SAST;
  const currentSlotAt = createDateForSastTime({
    year: parts.year,
    monthIndex: parts.monthIndex,
    day: isTodaysSlotActive ? parts.day : parts.day - 1,
    hour: AUTO_ROSTER_SYNC_HOUR_SAST,
  });
  const nextSlotAt = createDateForSastTime({
    year: parts.year,
    monthIndex: parts.monthIndex,
    day: isTodaysSlotActive ? parts.day + 1 : parts.day,
    hour: AUTO_ROSTER_SYNC_HOUR_SAST,
  });
  const currentSlotParts = getSastDateParts(currentSlotAt);

  return {
    currentSlotKey: `${currentSlotParts.year}-${padNumber(currentSlotParts.monthIndex + 1)}-${padNumber(currentSlotParts.day)}T${padNumber(AUTO_ROSTER_SYNC_HOUR_SAST)}:00`,
    currentSlotLabel: formatSastScheduleTime(currentSlotAt),
    currentSlotAt,
    nextSlotAt,
    nextSlotLabel: formatSastScheduleTime(nextSlotAt),
    millisUntilNextSlot: Math.max(0, nextSlotAt.getTime() - value.getTime()),
  };
};

const DAY_MATCH_GRID_CLASS = "flex flex-wrap gap-2";
const DAY_MATCH_CARD_WIDTH_CLASS = "w-full sm:w-[17rem] xl:w-[18rem]";
const DAY_FINISHED_MATCH_CARD_WIDTH_CLASS =
  "w-[calc(50%-0.25rem)] min-w-0 sm:w-[12rem] xl:w-[12.5rem]";

const getDayMatchCardWidthClass = (match) =>
  isFinishedMatch(match?.status)
    ? DAY_FINISHED_MATCH_CARD_WIDTH_CLASS
    : DAY_MATCH_CARD_WIDTH_CLASS;

function DayScheduleColumn({ day, matches, renderMatchCard, loading }) {
  return (
    <section className="space-y-2 px-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          {day.day}
        </p>
        <p className="text-sm font-semibold text-ink">{day.date}</p>
      </div>
      {loading ? (
        <p className="text-sm text-ink-muted">Loading matches...</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-ink-muted">No matches linked yet.</p>
      ) : (
        <div className={DAY_MATCH_GRID_CLASS}>
          {matches.map((match) => (
            <div key={match.id} className={getDayMatchCardWidthClass(match)}>
              {renderMatchCard(match)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WeekScheduleCard({ week, renderMatchCard, loading }) {
  const visibleDays = loading
    ? week.days
    : week.days.filter((day) => day.matches.length > 0);

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-surface-muted/40 px-2 py-3 sm:px-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-ink">{week.label}</p>
          <p className="text-sm text-ink-muted">{week.dateRange}</p>
        </div>
        <Chip>{week.matchCount} matches</Chip>
      </div>
      <div className="divide-y divide-border/60">
        {visibleDays.map((day) => (
          <div
            key={`${week.id}-${day.day}`}
            className="py-2.5 first:pt-0 last:pb-0"
          >
            <DayScheduleColumn
              day={day}
              matches={day.matches}
              renderMatchCard={renderMatchCard}
              loading={loading}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StellenboschRl2026WorkspacePage() {
  const { session, roles } = useAuth();
  const scriptRunLockRef = useRef(false);
  const [eventData, setEventData] = useState(null);
  const [matches, setMatches] = useState([]);
  const [brackets, setBrackets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoSyncSchedule, setAutoSyncSchedule] = useState(() =>
    getRosterScriptScheduleSnapshot(),
  );
  const [timerState, setTimerState] = useState(null);
  const [scriptRunState, setScriptRunState] = useState({
    running: false,
    message: "",
    tone: "success",
    details: "",
  });

  const refreshTimerState = useCallback(async () => {
    try {
      const nextState = await getStbRl26RosterSyncStatus();
      setTimerState(nextState || null);
    } catch (fetchError) {
      if (import.meta.env.DEV) {
        setTimerState(null);
        return null;
      }
      throw fetchError;
    }
    return null;
  }, []);

  const loadWorkspace = useCallback(async (ignoreRef) => {
    setLoading(true);
    setError(null);
    try {
      const [structure, rows, bracketRows] = await Promise.all([
        getEventHierarchy(EVENT_ID),
        getMatchesByEvent(EVENT_ID, MATCH_LIMIT, {
          includeFinished: true,
        }),
        // The bracket is supplementary: if it fails to load the schedule below
        // should still render, so swallow the error and fall back to none.
        getBracketsByEvent(EVENT_ID).catch(() => []),
      ]);
      if (!ignoreRef?.current) {
        setEventData(structure || null);
        setMatches(rows || []);
        setBrackets(bracketRows || []);
      }
    } catch (err) {
      if (!ignoreRef?.current) {
        setError(err?.message || "Unable to load this event.");
      }
    } finally {
      if (!ignoreRef?.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const ignoreRef = { current: false };
    loadWorkspace(ignoreRef);
    return () => {
      ignoreRef.current = true;
    };
  }, [loadWorkspace]);

  const rosterUpdateAccessRoles = useMemo(
    () => [...SYS_ADMIN_ACCESS_ROLES, ...TOURNAMENT_DIRECTOR_ACCESS_ROLES],
    [],
  );
  const canRunAdminScripts = useMemo(
    () => userHasAnyRole(session?.user, rosterUpdateAccessRoles, roles),
    [roles, rosterUpdateAccessRoles, session?.user],
  );

  useEffect(() => {
    setAutoSyncSchedule(getRosterScriptScheduleSnapshot());
    if (canRunAdminScripts) {
      refreshTimerState().catch(() => {});
    }

    const intervalId = window.setInterval(() => {
      setAutoSyncSchedule(getRosterScriptScheduleSnapshot());
      if (canRunAdminScripts) {
        refreshTimerState().catch(() => {});
      }
    }, AUTO_ROSTER_SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canRunAdminScripts, refreshTimerState]);

  const workspaceTitle = eventData?.name || EVENT_NAME;
  const standingsGroups = useMemo(
    () =>
      buildStandingsPoolGroups(eventData).map((group) => ({
        ...group,
        rows: buildPoolGroupStandings(group.pools, matches, group),
      })),
    [eventData, matches],
  );
  const datedMatches = useMemo(
    () =>
      (matches || [])
        .filter((match) => formatDateKey(match.start_time))
        .sort(sortByStartTimeAsc),
    [matches],
  );
  const bindWeekMatches = useCallback(
    (week) => {
      const days = week.days.map((day) => ({
        ...day,
        matches: datedMatches.filter(
          (match) => formatDateKey(match.start_time) === day.id,
        ),
      }));
      return {
        ...week,
        days,
        matchCount: days.reduce((total, day) => total + day.matches.length, 0),
      };
    },
    [datedMatches],
  );
  const phaseSchedules = useMemo(
    () =>
      PHASE_WEEK_GROUPS.map((phase) => ({
        ...phase,
        weeks: phase.weeks.map(bindWeekMatches),
      })),
    [bindWeekMatches],
  );

  const runRosterUpdate = useCallback(async ({
    trigger = "manual",
    scheduleSlot,
    forceFullSync = false,
  } = {}) => {
    if (scriptRunLockRef.current) {
      return null;
    }

    const activeScheduleSlot = scheduleSlot || getRosterScriptScheduleSnapshot();
    scriptRunLockRef.current = true;
    setScriptRunState({
      running: true,
      message: "",
      tone: "success",
      details: "",
    });

    try {
      let output;
      try {
        output = await invokeStbRl26RosterSync({ forceFullSync });
      } catch (backendError) {
        if (!import.meta.env.DEV) {
          throw backendError;
        }

        output = await executeCustomScript({
          slug: ROSTER_SCRIPT_SLUG,
          context: {
            eventId: EVENT_ID,
            trigger,
            forceFullSync,
            slotKey: activeScheduleSlot.currentSlotKey,
            slotLabel: activeScheduleSlot.currentSlotLabel,
            useBundledSource: true,
            allowBrowserExecution: true,
          },
        });
      }

      setAutoSyncSchedule(getRosterScriptScheduleSnapshot());

      if (output.ok) {
        await loadWorkspace();
        await refreshTimerState().catch(() => {});
        setScriptRunState({
          running: false,
          message:
            forceFullSync
              ? output.result?.message ||
                "Full roster sync completed. Event data has been refreshed."
              : output.result?.message ||
                "Roster update script completed. Event data has been refreshed.",
          tone: "success",
          details: "",
        });
        return output;
      }

      const failureMessage =
        output.error?.message ||
        output.result?.message ||
        (forceFullSync ? "Full roster sync failed." : "Roster update script failed.");
      await refreshTimerState().catch(() => {});
      setScriptRunState({
        running: false,
        message: failureMessage,
        tone: "error",
        details: buildRosterSyncErrorDetails(output),
      });
      return output;
    } catch (runError) {
      await refreshTimerState().catch(() => {});
      setScriptRunState({
        running: false,
        message:
          runError instanceof Error
            ? runError.message || "Roster update script failed."
            : String(runError || "Roster update script failed."),
        tone: "error",
        details: buildRosterSyncErrorDetails({
          error: {
            stack: runError instanceof Error ? runError.stack || "" : "",
          },
        }),
      });
      return null;
    } finally {
      scriptRunLockRef.current = false;
    }
  }, [loadWorkspace, refreshTimerState]);

  const handleRunRosterUpdate = useCallback(async () => {
    await runRosterUpdate({
      trigger: "manual",
      scheduleSlot: getRosterScriptScheduleSnapshot(),
    });
  }, [runRosterUpdate]);

  const handleRunFullRosterUpdate = useCallback(async () => {
    await runRosterUpdate({
      trigger: "manual-full-sync",
      scheduleSlot: getRosterScriptScheduleSnapshot(),
      forceFullSync: true,
    });
  }, [runRosterUpdate]);

  // An event can carry several brackets (championship plus placement, or one
  // per division). Show them all, skipping any that have no games yet so an
  // empty scaffold bracket doesn't take up a heading.
  const playoffBrackets = useMemo(
    () => (brackets || []).filter((bracket) => (bracket?.nodes || []).length > 0),
    [brackets],
  );

  // Lookups let bracket source labels resolve to human names ("Pool A #1",
  // "Winner of Quarterfinal 1") instead of raw ids.
  const bracketLookups = useMemo(() => {
    const divisions = eventData?.divisions || [];
    const divisionById = new Map(
      divisions.filter((division) => division?.id).map((division) => [division.id, division]),
    );
    const poolById = new Map(
      divisions
        .flatMap((division) => division?.pools || [])
        .filter((pool) => pool?.id)
        .map((pool) => [pool.id, pool]),
    );
    // Pool teams arrive as { seed, team } entries, so unwrap before indexing.
    const teamById = new Map(
      divisions
        .flatMap((division) => division?.pools || [])
        .flatMap((pool) => pool?.teams || [])
        .map((entry) => entry?.team || entry)
        .filter((team) => team?.id)
        .map((team) => [team.id, team]),
    );
    const nodeById = new Map(
      (brackets || []).flatMap((bracket) =>
        (bracket?.nodes || []).map((node) => [node.id, node]),
      ),
    );
    return { divisionById, poolById, teamById, nodeById };
  }, [brackets, eventData]);

  const renderMatchCard = (match, options = {}) => {
    const liveOrFinal =
      isLiveMatch(match.status) || isFinishedMatch(match.status);

    return (
      <StandardEventMatchCard
        key={match.id}
        match={match}
        title={options.title || formatMatchup(match)}
        meta={formatMatchTime(match.start_time)}
        score={liveOrFinal ? formatScoreLine(match) : null}
        status={formatMatchStatus(match.status)}
        hideEyebrow
        compact
      />
    );
  };

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="main" className="space-y-5 px-2 py-6 sm:px-3">
        <Card className="space-y-3 px-3 py-4 sm:px-4">
          <SectionHeader
            title={workspaceTitle}
            action={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex-none">
                  <Link
                    to={`/event-rosters?eventId=${encodeURIComponent(EVENT_ID)}`}
                    className="sc-button min-w-0 text-center text-xs leading-tight min-[380px]:text-sm"
                  >
                    Team rosters
                  </Link>
                  <Link
                    to={`/players?eventId=${encodeURIComponent(EVENT_ID)}`}
                    className="sc-button min-w-0 text-center text-xs leading-tight min-[380px]:text-sm"
                  >
                    Player standings
                  </Link>
                </div>
                {canRunAdminScripts ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="sc-button is-ghost"
                      onClick={handleRunRosterUpdate}
                      disabled={scriptRunState.running}
                    >
                      {scriptRunState.running ? "Running roster update..." : "Run roster update"}
                    </button>
                    <button
                      type="button"
                      className="sc-button is-ghost"
                      onClick={handleRunFullRosterUpdate}
                      disabled={scriptRunState.running}
                    >
                      {scriptRunState.running ? "Running full sync..." : "Run full roster sync"}
                    </button>
                    <Link
                      to={`/admin/custom-scripts?script=${encodeURIComponent(ROSTER_SCRIPT_SLUG)}&eventId=${encodeURIComponent(EVENT_ID)}`}
                      className="sc-button is-ghost"
                    >
                      Edit custom script
                    </Link>
                  </div>
                ) : null}
              </div>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {RULE_DOCUMENTS.map((document) => (
              <a
                key={document.href}
                href={document.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition hover:bg-surface-muted"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white">
                  <PdfIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink group-hover:underline break-words whitespace-normal">
                    {document.name}
                  </p>
                </div>
              </a>
            ))}
          </div>
          {error && <div className="sc-alert is-error">{error}</div>}
          {canRunAdminScripts && scriptRunState.message ? (
            <div
              className={`sc-alert ${scriptRunState.tone === "error" ? "is-error" : "is-success"}`}
            >
              {scriptRunState.message}
            </div>
          ) : null}
          {canRunAdminScripts && scriptRunState.tone === "error" && scriptRunState.details ? (
            <Panel variant="muted" className="space-y-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Error details
              </p>
              <pre className="max-h-72 overflow-auto rounded-2xl border border-border bg-surface p-3 text-xs text-ink-muted whitespace-pre-wrap break-words">
                {scriptRunState.details}
              </pre>
            </Panel>
          ) : null}
          {canRunAdminScripts ? (
            <Panel variant="muted" className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip>Auto roster sync</Chip>
                <Chip variant="ghost">Daily at 17:00 SAST</Chip>
              </div>
              <p className="text-xs text-ink-muted">
                Next run: {autoSyncSchedule.nextSlotLabel} ({formatDurationUntil(autoSyncSchedule.millisUntilNextSlot)}).
                {" "}Current slot: {autoSyncSchedule.currentSlotLabel}.
                {timerState?.last_successful_run_at ? (
                  <>
                    {" "}Last successful update: {formatSastScheduleTime(timerState.last_successful_run_at)}.
                  </>
                ) : null}
                {timerState?.last_processed_signup_timestamp ? (
                  <>
                    {" "}Latest signup timestamp: {formatSastScheduleTime(timerState.last_processed_signup_timestamp)}.
                  </>
                ) : null}
                {timerState?.last_attempted_at ? (
                  <>
                    {" "}Last attempt: {formatSastScheduleTime(timerState.last_attempted_at)} (
                    {timerState.last_ok ? "success" : "failed"}).
                  </>
                ) : (
                  " No backend attempt has been recorded yet."
                )}
              </p>
            </Panel>
          ) : null}
        </Card>

        <Card className="min-w-0 space-y-3 border border-white/70 p-3 sm:p-4">
          <SectionHeader title="Team standings" />
          <p className="text-xs text-ink-muted">
            Points: {STANDINGS_WIN_POINTS} for a win, {STANDINGS_CLOSE_LOSS_POINTS} for losing by {STANDINGS_CLOSE_LOSS_MAX_MARGIN} or less,
            and {STANDINGS_LOSS_POINTS} for any other loss.
          </p>
          <div>
            {loading && standingsGroups.length === 0 ? (
              <Card variant="muted" className="p-3 text-center text-sm text-ink-muted">
                Loading standings...
              </Card>
            ) : standingsGroups.length === 0 ? (
              <Card variant="muted" className="p-3 text-center text-sm text-ink-muted">
                No pool teams configured for this event.
              </Card>
            ) : (
              <div className="grid items-start gap-2" style={TEAM_STANDINGS_GRID_STYLE}>
                {standingsGroups.map((group) => (
                  <Panel
                    key={group.id}
                    variant="muted"
                    className="min-w-0 space-y-1.5 border border-white/50 p-2"
                  >
                    <p
                      className="truncate text-xs font-semibold uppercase tracking-wide text-ink"
                      title={group.name}
                    >
                      {group.name}
                    </p>
                    <StandingsTable rows={group.rows} showRank={group.showRank} />
                  </Panel>
                ))}
              </div>
            )}
          </div>
        </Card>

        <div className="divide-y divide-border/70">
          {phaseSchedules.map((phase) => (
            <section
              key={phase.id}
              className="space-y-3 py-4 first:pt-0 last:pb-0 sm:py-5"
            >
              <SectionHeader
                title={phase.title}
                action={<Chip>{phase.weeks.length} weeks</Chip>}
              />
              <div className="space-y-3">
                {phase.weeks.map((week) => (
                  <WeekScheduleCard
                    key={week.id}
                    week={week}
                    renderMatchCard={renderMatchCard}
                    loading={loading}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="space-y-3 py-4 sm:py-5">
          <SectionHeader
            title="Playoffs"
            description="Winners and losers both advance. Fixtures fill in as each round is decided."
            action={<Chip>Weeks 8-12</Chip>}
          />
          {playoffBrackets.length > 1 ? (
            // Several brackets (e.g. championship + placement, or one per
            // division): head each with its own name so they stay distinct.
            <div className="space-y-3 sm:space-y-6">
              {playoffBrackets.map((bracket) => (
                <div
                  key={bracket.id}
                  className="space-y-2 rounded-2xl border border-[var(--sc-border-strong)] bg-[var(--sc-surface)]/40 p-2 sm:space-y-3 sm:p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[var(--sc-border-strong)] pb-1.5 sm:pb-2">
                    <h3 className="text-sm font-semibold text-[var(--sc-ink)] sm:text-lg">
                      {bracket.name || "Bracket"}
                    </h3>
                    <Chip>{formatBracketType(bracket.type)}</Chip>
                  </div>
                  <BracketStructureView
                    bracket={bracket}
                    lookups={bracketLookups}
                    renderMatchCard={renderMatchCard}
                    emptyMessage="No games in this bracket yet."
                  />
                </div>
              ))}
            </div>
          ) : (
            <BracketStructureView
              bracket={playoffBrackets[0] || null}
              lookups={bracketLookups}
              renderMatchCard={renderMatchCard}
              emptyMessage={
                loading
                  ? "Loading the playoff bracket..."
                  : "The playoff bracket has not been published yet."
              }
            />
          )}
        </section>
      </SectionShell>
    </div>
  );
}
