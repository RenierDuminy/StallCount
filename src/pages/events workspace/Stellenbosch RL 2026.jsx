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
const TEAM_STANDINGS_GRID_STYLE = {
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))",
};
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
    title: "Phase 1",
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
    title: "Phase 2",
    description: "MMP crossover games with FMP round robin pool games.",
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
    ],
  },
  {
    id: "phase-3",
    title: "Phase 3",
    description: "MMP seeding games with FMP crossover and seeding fixtures.",
    weeks: [
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
    ],
  },
];

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

const formatScoreDiff = (value) => {
  if (!Number.isFinite(value) || value === 0) return "0";
  return value > 0 ? `+${value}` : `${value}`;
};

const StandingsTable = ({ rows }) => {
  if (!rows.length) {
    return <p className="text-sm text-ink-muted">No standings available yet.</p>;
  }
  return (
    <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded border border-border bg-surface">
      <table className="w-full table-fixed whitespace-nowrap text-xs">
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="w-full px-1 py-1 text-left font-semibold">Team</th>
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
              <td className="min-w-0 px-1 py-1" title={row.name}>
                <span className="block truncate">{row.name}</span>
              </td>
              <td className="px-0.5 py-1 text-center tabular-nums">{`${row.wins}-${row.losses}`}</td>
              <td className="px-0.5 py-1 text-center tabular-nums">{formatScoreDiff(row.scoreDiff)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const buildPoolStandings = (pool, matches) => {
  const teams = buildPoolTeams(pool);
  const standingsByTeam = new Map(
    teams.map((team) => [
      team.id,
      {
        ...team,
        wins: 0,
        losses: 0,
        played: 0,
        scoreDiff: 0,
      },
    ]),
  );

  const poolMatches = (matches || []).filter((match) => match?.pool_id === pool?.id);

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
      } else if (match.score_a < match.score_b) {
        teamAStanding.losses += 1;
      }
    }

    if (teamBStanding) {
      teamBStanding.played += 1;
      teamBStanding.scoreDiff += match.score_b - match.score_a;
      if (match.score_b > match.score_a) {
        teamBStanding.wins += 1;
      } else if (match.score_b < match.score_a) {
        teamBStanding.losses += 1;
      }
    }
  });

  return Array.from(standingsByTeam.values()).sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.scoreDiff - a.scoreDiff ||
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
      const [structure, rows] = await Promise.all([
        getEventHierarchy(EVENT_ID),
        getMatchesByEvent(EVENT_ID, MATCH_LIMIT, {
          includeFinished: true,
        }),
      ]);
      if (!ignoreRef?.current) {
        setEventData(structure || null);
        setMatches(rows || []);
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
  const standingsByPool = useMemo(() => {
    if (!eventData?.divisions?.length) return [];
    return eventData.divisions.flatMap((division, divisionIndex) =>
      (division?.pools || []).map((pool, poolIndex) => ({
        id: pool.id || `${division.id || divisionIndex}-${poolIndex}`,
        name: pool.name || "Pool",
        rows: buildPoolStandings(pool, matches),
      })),
    );
  }, [eventData, matches]);
  const datedMatches = useMemo(
    () =>
      (matches || [])
        .filter((match) => formatDateKey(match.start_time))
        .sort(sortByStartTimeAsc),
    [matches],
  );
  const phaseSchedules = useMemo(
    () =>
      PHASE_WEEK_GROUPS.map((phase) => ({
        ...phase,
        weeks: phase.weeks.map((week) => {
          const days = week.days.map((day) => ({
            ...day,
            matches: datedMatches.filter(
              (match) => formatDateKey(match.start_time) === day.id,
            ),
          }));
          return {
            ...week,
            days,
            matchCount: days.reduce(
              (total, day) => total + day.matches.length,
              0,
            ),
          };
        }),
      })),
    [datedMatches],
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
                    View event roster
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
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Pool standings
            </p>
            {loading && standingsByPool.length === 0 ? (
              <Card variant="muted" className="p-3 text-center text-sm text-ink-muted">
                Loading standings...
              </Card>
            ) : standingsByPool.length === 0 ? (
              <Card variant="muted" className="p-3 text-center text-sm text-ink-muted">
                No pools configured for this event.
              </Card>
            ) : (
              <div className="grid items-start gap-2" style={TEAM_STANDINGS_GRID_STYLE}>
                {standingsByPool.map((pool) => (
                  <Panel
                    key={pool.id}
                    variant="muted"
                    className="min-w-0 space-y-1.5 border border-white/50 p-2"
                  >
                    <p
                      className="truncate text-xs font-semibold uppercase tracking-wide text-ink"
                      title={pool.name}
                    >
                      {pool.name}
                    </p>
                    <StandingsTable rows={pool.rows} />
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
                title={`${phase.title} weekly fixtures`}
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

        <Card className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            title="Knockout layout pending"
          />
        </Card>
      </SectionShell>
    </div>
  );
}
