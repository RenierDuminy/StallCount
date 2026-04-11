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
const HANDBOOK_PHASES = [
  {
    id: "phase-1",
    phase: "Phase 1",
    dates: "14 Apr - 30 Apr",
    mmp: "Pool stage",
    fmp: "Development stage",
  },
  {
    id: "phase-2",
    phase: "Phase 2",
    dates: "4 May - 21 May",
    mmp: "Crossover stage",
    fmp: "Pool stage",
  },
  {
    id: "phase-3",
    phase: "Phase 3",
    dates: "20 Jul - 6 Aug",
    mmp: "Seeding stage",
    fmp: "Crossover and seeding stage",
  },
  {
    id: "phase-4",
    phase: "Phase 4",
    dates: "10 Aug - 25 Aug",
    mmp: "Knockouts",
    fmp: "Knockouts",
  },
];
const HANDBOOK_DIVISIONS = [
  {
    id: "mmp",
    name: "MMP League",
    description: "Mondays, Tuesdays, and Thursdays",
    pools: [
      {
        id: "pool-a",
        name: "Pool A",
        teams: ["Eendrag 1", "Piekemol", "Helshoogte", "Huis Visser"],
      },
      {
        id: "pool-b",
        name: "Pool B",
        teams: ["Wilgenhof 1", "Dagbreek 1", "Majuba", "Eendrag 3"],
      },
      {
        id: "pool-c",
        name: "Pool C",
        teams: ["Simonsberg", "Metanoia", "Dagbreek 3", "Helderberg"],
      },
      {
        id: "pool-d",
        name: "Pool D",
        teams: ["Barbarians", "Eendrag 2", "Dagbreek 2", "Wilgenhof 2"],
      },
    ],
  },
  {
    id: "fmp",
    name: "FMP League",
    description: "Wednesdays",
    pools: [
      {
        id: "pool-e",
        name: "Pool E",
        teams: [
          "Harmonica",
          "Lydia/Venustia",
          "Metanoia/Silene",
          "Isa/Olympus",
        ],
      },
      {
        id: "pool-f",
        name: "Pool F",
        teams: [
          "Nerina/Heemstede",
          "Irene/Sonop",
          "Huis ten Bosch/Minerva",
          "Valkyries (CSCs + unaffiliated)",
        ],
      },
    ],
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

const normalizePoolTeams = (teams = []) =>
  teams
    .map((team, index) => {
      if (typeof team === "string") {
        return {
          id: `team-${index}-${team}`,
          name: team,
          shortName: null,
          seed: null,
          order: index,
        };
      }

      return {
        id: team?.team?.id || `team-${index}-${team?.team?.name || "team"}`,
        name: team?.team?.name || "Team",
        shortName: team?.team?.short_name || null,
        seed:
          typeof team?.seed === "number" && !Number.isNaN(team.seed)
            ? team.seed
            : null,
        order: index,
      };
    })
    .sort((left, right) => {
      if (left.seed !== null && right.seed !== null) {
        return left.seed - right.seed || left.order - right.order;
      }
      if (left.seed !== null) return -1;
      if (right.seed !== null) return 1;
      return left.order - right.order;
    });

const getFallbackDivisions = () =>
  HANDBOOK_DIVISIONS.map((division) => ({
    id: division.id,
    name: division.name,
    description: division.description,
    pools: division.pools.map((pool) => ({
      id: pool.id,
      name: pool.name,
      teams: normalizePoolTeams(pool.teams),
    })),
  }));

const getConfiguredDivisions = (eventData) =>
  (eventData?.divisions || [])
    .map((division) => ({
      id: division.id,
      name: division.name || "Division",
      description: division.level || null,
      pools: (division.pools || []).map((pool) => ({
        id: pool.id,
        name: pool.name || "Pool",
        teams: normalizePoolTeams(pool.teams || []),
      })),
    }))
    .filter((division) =>
      division.pools.some((pool) => Array.isArray(pool.teams) && pool.teams.length > 0),
    );

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

function DayScheduleColumn({ day, matches, renderMatchCard, loading }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-muted/70 p-3">
      <div className="mb-3 rounded-xl border border-border bg-surface px-3 py-2 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          {day.day}
        </p>
        <p className="text-sm font-semibold text-ink">{day.date}</p>
      </div>
      {loading ? (
        <p className="text-sm text-ink-muted">Loading scheduled matches...</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-ink-muted">No scheduled matches linked yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {matches.map((match) => renderMatchCard(match))}
        </div>
      )}
    </div>
  );
}

function WeekScheduleCard({ week, renderMatchCard, loading }) {
  return (
    <Panel variant="muted" className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-ink">{week.label}</p>
          <p className="text-sm text-ink-muted">{week.dateRange}</p>
        </div>
        <Chip>{week.matchCount} matches</Chip>
      </div>
      <div className="grid gap-3 xl:grid-cols-4">
        {week.days.map((day) => (
          <DayScheduleColumn
            key={`${week.id}-${day.day}`}
            day={day}
            matches={day.matches}
            renderMatchCard={renderMatchCard}
            loading={loading}
          />
        ))}
      </div>
    </Panel>
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
  const configuredDivisions = getConfiguredDivisions(eventData);
  const displayDivisions =
    configuredDivisions.length > 0 ? configuredDivisions : getFallbackDivisions();
  const structureSourceLabel =
    configuredDivisions.length > 0
      ? "Configured event structure"
      : "Fixture handbook structure";
  const scheduledMatches = useMemo(
    () =>
      (matches || [])
        .filter((match) => (match?.status || "").toLowerCase() === "scheduled")
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
            matches: scheduledMatches.filter(
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
    [scheduledMatches],
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
        });
        return output;
      }

      await refreshTimerState().catch(() => {});
      setScriptRunState({
        running: false,
        message:
          forceFullSync
            ? output.error?.message || "Full roster sync failed."
            : output.error?.message || "Roster update script failed.",
        tone: "error",
      });
      return output;
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

  const renderScheduledMatchCard = (match) => {
    return (
      <StandardEventMatchCard
        key={match.id}
        match={match}
        eyebrow={match.venue?.name || "Venue TBC"}
        title={formatMatchup(match)}
        meta={formatMatchTime(match.start_time)}
        status={formatMatchStatus(match.status)}
      />
    );
  };

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="main" className="space-y-6 py-8">
        <Card className="space-y-3 p-6 sm:p-8">
          <SectionHeader
            title={workspaceTitle}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/event-rosters?eventId=${encodeURIComponent(EVENT_ID)}`}
                  className="sc-button"
                >
                  View event roster
                </Link>
                <Link
                  to={`/players?eventId=${encodeURIComponent(EVENT_ID)}`}
                  className="sc-button"
                >
                  Player standings
                </Link>
                {canRunAdminScripts ? (
                  <>
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
                  </>
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
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    PDF document
                  </p>
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
          {canRunAdminScripts ? (
            <Panel variant="muted" className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip>Auto roster sync</Chip>
                <Chip variant="ghost">Daily at 17:00 SAST</Chip>
              </div>
              <p className="text-sm text-ink-muted">
                This roster sync now runs automatically on the backend, independent of whether this page is open.
                Next run: {autoSyncSchedule.nextSlotLabel} ({formatDurationUntil(autoSyncSchedule.millisUntilNextSlot)}).
              </p>
              <p className="text-xs text-ink-muted">
                Current slot: {autoSyncSchedule.currentSlotLabel}.
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

        <Card className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            eyebrow="League format"
            title="2026 structure overview"
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {HANDBOOK_PHASES.map((phase) => (
              <Panel key={phase.id} variant="muted" className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {phase.phase}
                    </p>
                    <p className="text-sm font-semibold text-ink">{phase.dates}</p>
                  </div>
                  <Chip>{phase.mmp}</Chip>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-surface px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      Mens Residence
                    </p>
                    <p className="text-sm font-medium text-ink">{phase.mmp}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      Womens Residence
                    </p>
                    <p className="text-sm font-medium text-ink">{phase.fmp}</p>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
          <Panel variant="muted" className="min-w-0 space-y-4 overflow-hidden p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Pools and assigned teams
                </p>
                <p className="text-sm text-ink-muted">
                  Using configured event pools when available, with the fixture handbook as fallback.
                </p>
              </div>
              <Chip>{structureSourceLabel}</Chip>
            </div>
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              {displayDivisions.map((division) => (
                <Card
                  key={division.id}
                  variant="bordered"
                  className="min-w-0 space-y-4 overflow-hidden p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold text-ink">{division.name}</p>
                      {division.description ? (
                        <p className="text-sm text-ink-muted">{division.description}</p>
                      ) : null}
                    </div>
                    <Chip>{division.pools.length} pools</Chip>
                  </div>
                  <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-2">
                    <div className="flex min-w-max gap-3">
                      {division.pools.map((pool) => (
                        <Panel
                          key={pool.id}
                          variant="tinted"
                          className="w-[180px] shrink-0 space-y-2 p-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-ink">
                              {pool.name}
                            </p>
                            <Chip>{pool.teams.length} teams</Chip>
                          </div>
                          <div className="space-y-2">
                            {pool.teams.map((team) => (
                              <div
                                key={team.id}
                                className="rounded-lg border border-border bg-surface px-2 py-1.5"
                              >
                                <p className="text-xs font-medium leading-snug text-ink">
                                  {team.name}
                                  {team.shortName ? ` (${team.shortName})` : ""}
                                </p>
                                {team.seed !== null ? (
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                                    Seed {team.seed}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </Panel>
                      ))}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Panel>
        </Card>

        {phaseSchedules.map((phase) => (
          <Card key={phase.id} className="space-y-4 p-5 sm:p-6">
            <SectionHeader
              eyebrow={phase.title}
              title={`${phase.title} weekly fixtures`}
              action={<Chip>{phase.weeks.length} weeks</Chip>}
            />
            <div className="space-y-4">
              {phase.weeks.map((week) => (
                <WeekScheduleCard
                  key={week.id}
                  week={week}
                  renderMatchCard={renderScheduledMatchCard}
                  loading={loading}
                />
              ))}
            </div>
          </Card>
        ))}

        <Card className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            eyebrow="Phase 4"
            title="Knockout layout pending"
          />
          <Panel variant="muted" className="space-y-3 p-4 text-sm text-ink-muted">
            <p>
              A detailed structure will be added here once the knockout stage format 
              and matchups are confirmed. Please 
              check back closer to the end of Phase 3 for updates on the knockout stage 
              layout and schedule.
            </p>

          </Panel>
        </Card>
      </SectionShell>
    </div>
  );
}
