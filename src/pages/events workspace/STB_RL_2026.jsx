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
import { invokeStbRl26RosterSync } from "../../services/stbRl26RosterSyncService";
import {
  userHasAnyRole,
  SYS_ADMIN_ACCESS_ROLES,
  TOURNAMENT_DIRECTOR_ACCESS_ROLES,
} from "../../utils/accessControl";
import {
  StandardStandingsLegend,
  StandardStandingsTable,
} from "../../components/StandardStandingsTable";
import {
  LEAGUE_POINTS_SCORING,
  buildPoolGroupStandings,
  getEventPools,
  isFinishedMatch,
  isLiveMatch,
} from "../../utils/standings";

export const EVENT_ID = "e6a34716-f9d6-4d70-bc1a-b610a04e3eaf";
export const EVENT_SLUG = "stellenbosch-rl-2026";
export const EVENT_NAME = "Stellenbosch RL 2026";
const MATCH_LIMIT = 200;
const SAST_TIMEZONE = "Africa/Johannesburg";
const SAST_UTC_OFFSET_HOURS = 2;
const AUTO_ROSTER_SYNC_HOUR_SAST = 17;
const ROSTER_SCRIPT_SLUG = "STB_RL_26_update_rosters";
// This event awards league points; the shared standings module owns the model
// (3 / 2 / 1 and the forfeit split). Aliased here because the rules blurb below
// quotes the numbers back to the reader.
const STANDINGS_SCORING = LEAGUE_POINTS_SCORING;
const TEAM_STANDINGS_GRID_STYLE = {
  gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
};
const MENS_DIVISION_POOL_LETTERS = new Set(["a", "b", "c", "d"]);
const MENS_DIVISION_STANDINGS_START_DATE = "2026-04-13";
// Extended through week 12 (27 Aug) so the team standings table covers the
// full 12-week season, playoffs included, rather than stopping at the end of
// pool play (23 Jul).
const MENS_DIVISION_STANDINGS_END_DATE = "2026-08-27";
const WOMENS_DIVISION_POOL_LETTERS = new Set(["e", "f"]);
const WOMENS_DIVISION_STANDINGS_START_DATE = MENS_DIVISION_STANDINGS_START_DATE;
const WOMENS_DIVISION_STANDINGS_END_DATE = MENS_DIVISION_STANDINGS_END_DATE;
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
// Playoff weeks. Same Mon-Thu cadence as weeks 1-7, continuing from 27 Jul.
// Rendered in a collapsed dropdown because the bracket view below is the
// primary way to follow this phase.
const PLAYOFF_WEEK_GROUP = {
  id: "phase-3",
  title: "Playoff schedule",
  description: "Day-by-day fixtures for the playoff weeks.",
  weeks: [
    {
      id: "week-8",
      label: "Week 8",
      dateRange: "27 Jul - 30 Jul",
      days: [
        { id: "2026-07-27", day: "Monday", date: "27 Jul" },
        { id: "2026-07-28", day: "Tuesday", date: "28 Jul" },
        { id: "2026-07-29", day: "Wednesday", date: "29 Jul" },
        { id: "2026-07-30", day: "Thursday", date: "30 Jul" },
      ],
    },
    {
      id: "week-9",
      label: "Week 9",
      dateRange: "3 Aug - 6 Aug",
      days: [
        { id: "2026-08-03", day: "Monday", date: "3 Aug" },
        { id: "2026-08-04", day: "Tuesday", date: "4 Aug" },
        { id: "2026-08-05", day: "Wednesday", date: "5 Aug" },
        { id: "2026-08-06", day: "Thursday", date: "6 Aug" },
      ],
    },
    {
      id: "week-10",
      label: "Week 10",
      dateRange: "10 Aug - 13 Aug",
      days: [
        { id: "2026-08-10", day: "Monday", date: "10 Aug" },
        { id: "2026-08-11", day: "Tuesday", date: "11 Aug" },
        { id: "2026-08-12", day: "Wednesday", date: "12 Aug" },
        { id: "2026-08-13", day: "Thursday", date: "13 Aug" },
      ],
    },
    {
      id: "week-11",
      label: "Week 11",
      dateRange: "17 Aug - 20 Aug",
      days: [
        { id: "2026-08-17", day: "Monday", date: "17 Aug" },
        { id: "2026-08-18", day: "Tuesday", date: "18 Aug" },
        { id: "2026-08-19", day: "Wednesday", date: "19 Aug" },
        { id: "2026-08-20", day: "Thursday", date: "20 Aug" },
      ],
    },
    {
      id: "week-12",
      label: "Week 12",
      dateRange: "24 Aug - 27 Aug",
      days: [
        { id: "2026-08-24", day: "Monday", date: "24 Aug" },
        { id: "2026-08-25", day: "Tuesday", date: "25 Aug" },
        { id: "2026-08-26", day: "Wednesday", date: "26 Aug" },
        { id: "2026-08-27", day: "Thursday", date: "27 Aug" },
      ],
    },
  ],
};

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

const getPoolLetter = (pool) => {
  const normalizedName = (pool?.name || "").toString().trim().toLowerCase();
  const poolMatch = normalizedName.match(/\bpool\s*([a-z])\b/);
  const singleLetterMatch = normalizedName.match(/^([a-z])$/);
  return poolMatch?.[1] || singleLetterMatch?.[1] || "";
};

const isMensDivisionPool = (pool) =>
  MENS_DIVISION_POOL_LETTERS.has(getPoolLetter(pool));

const isWomensDivisionPool = (pool) =>
  WOMENS_DIVISION_POOL_LETTERS.has(getPoolLetter(pool));

const isCombinedHousePool = (pool) =>
  isMensDivisionPool(pool) || isWomensDivisionPool(pool);

// Each division's pools are merged into a single ranked standings table scored
// across the whole season, rather than one table per pool. Because the pools are
// combined, a match cannot be attributed by pool_id alone (crossover fixtures
// pair teams from different pools), so matches are matched on both teams being
// in the division and the match falling inside the season date range.
const DIVISION_STANDINGS_GROUPS = [
  {
    id: "mens-division",
    name: "Men's Division",
    includesPool: isMensDivisionPool,
    matchStartDateKey: MENS_DIVISION_STANDINGS_START_DATE,
    matchEndDateKey: MENS_DIVISION_STANDINGS_END_DATE,
  },
  {
    id: "womens-division",
    name: "Women's Division",
    includesPool: isWomensDivisionPool,
    matchStartDateKey: WOMENS_DIVISION_STANDINGS_START_DATE,
    matchEndDateKey: WOMENS_DIVISION_STANDINGS_END_DATE,
  },
];

const buildStandingsPoolGroups = (eventData) => {
  const pools = getEventPools(eventData);
  const separatePools = pools.filter((pool) => !isCombinedHousePool(pool));

  const divisionGroups = DIVISION_STANDINGS_GROUPS.flatMap((division) => {
    const divisionPools = pools.filter(division.includesPool);
    if (!divisionPools.length) return [];
    return [
      {
        id: division.id,
        name: division.name,
        pools: divisionPools,
        showRank: true,
        matchMode: "team_date_range",
        matchStartDateKey: division.matchStartDateKey,
        matchEndDateKey: division.matchEndDateKey,
      },
    ];
  });

  return [
    ...divisionGroups,
    ...separatePools.map((pool) => ({
      id: pool.id,
      name: pool.name,
      pools: [pool],
    })),
  ];
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
  const [scriptRunState, setScriptRunState] = useState({
    running: false,
    message: "",
    tone: "success",
    details: "",
  });

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

  const workspaceTitle = eventData?.name || EVENT_NAME;
  const standingsGroups = useMemo(
    () =>
      buildStandingsPoolGroups(eventData).map((group) => ({
        ...group,
        rows: buildPoolGroupStandings(group.pools, matches, {
          ...group,
          scoring: STANDINGS_SCORING,
          // Date filtering is SAST-based for this event, so the workspace
          // supplies the key rather than the shared module assuming a zone.
          getMatchDateKey: (match) => formatDateKey(match?.start_time),
        }),
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
  const playoffSchedule = useMemo(
    () => ({
      ...PLAYOFF_WEEK_GROUP,
      weeks: PLAYOFF_WEEK_GROUP.weeks.map(bindWeekMatches),
    }),
    [bindWeekMatches],
  );
  const playoffScheduleMatchCount = useMemo(
    () =>
      playoffSchedule.weeks.reduce((total, week) => total + week.matchCount, 0),
    [playoffSchedule],
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

      if (output.ok) {
        await loadWorkspace();
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
      setScriptRunState({
        running: false,
        message: failureMessage,
        tone: "error",
        details: buildRosterSyncErrorDetails(output),
      });
      return output;
    } catch (runError) {
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
  }, [loadWorkspace]);

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
        </Card>

        <Card className="min-w-0 space-y-3 border border-white/70 p-3 sm:p-4">
          <SectionHeader title="Team standings" />
          <p className="text-xs text-ink-muted">
            Points: {STANDINGS_SCORING.winPoints} for a win, {STANDINGS_SCORING.closeLossPoints} for losing by {STANDINGS_SCORING.closeLossMaxMargin} or less,
            and {STANDINGS_SCORING.lossPoints} for any other loss. A forfeit ({STANDINGS_SCORING.forfeitScore}-0)
            awards {STANDINGS_SCORING.forfeitWinPoints} to the innocent team and {STANDINGS_SCORING.forfeitLossPoints} to the team that forfeits.
          </p>
          <StandardStandingsLegend />
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
                    <StandardStandingsTable
                      rows={group.rows}
                      showRank={group.showRank}
                      showPoints
                    />
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
          <details className="group rounded-xl border border-border/70 bg-surface-muted/40">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div>
                <p className="text-base font-semibold text-ink">
                  {playoffSchedule.title}
                </p>
                <p className="text-sm text-ink-muted">
                  {playoffSchedule.description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Chip>{playoffScheduleMatchCount} matches</Chip>
                <span
                  aria-hidden="true"
                  className="text-ink-muted transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
              </div>
            </summary>
            <div className="space-y-3 px-2 pb-3 sm:px-3">
              {playoffSchedule.weeks.map((week) => (
                <WeekScheduleCard
                  key={week.id}
                  week={week}
                  renderMatchCard={renderMatchCard}
                  loading={loading}
                />
              ))}
            </div>
          </details>
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
