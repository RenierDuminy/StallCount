import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import usePersistentState from "../../hooks/usePersistentState";
import { Card, Panel, SectionHeader, Chip } from "../../components/ui/primitives";
import { getEventHierarchy } from "../../services/leagueService";
import { getTournamentOverview, invalidateTournamentOverview } from "../../services/tournamentDirectorService";
import { createMatch, deleteMatch, updateMatch } from "../../services/matchService";
import { saveTournamentDirectorSpiritScores } from "../../services/spiritScoreService";
import { getEventLinkedUsers } from "../../services/userService";
import { roleAssignmentsIncludeAdmin } from "../../utils/accessControl";
import { TOURNAMENT_DIRECTOR_SELECTED_EVENT_KEY } from "./persistenceKeys";

const LIGHT_INPUT_CLASS =
  "rounded-lg border border-[var(--sc-surface-light-border)] bg-white px-3 py-1.5 text-sm text-[var(--sc-surface-light-ink)] shadow-sm focus:border-[var(--sc-border-strong)] focus:outline-none";
const MATCH_STATUS_OPTIONS = [
  "scheduled",
  "ready",
  "pending",
  "initialized",
  "live",
  "halftime",
  "finished",
  "completed",
  "canceled",
];
const SPIRIT_CATEGORIES = [
  { key: "rulesKnowledge", label: "Rules knowledge" },
  { key: "foulsContact", label: "Fouls and contact" },
  { key: "positiveAttitude", label: "Positive attitude" },
  { key: "communication", label: "Communication" },
  { key: "selfControl", label: "Self-control" },
];

const EMPTY_SPIRIT_SCORES = {
  teamA: {
    rulesKnowledge: "",
    foulsContact: "",
    positiveAttitude: "",
    communication: "",
    selfControl: "",
  },
  teamB: {
    rulesKnowledge: "",
    foulsContact: "",
    positiveAttitude: "",
    communication: "",
    selfControl: "",
  },
};

const EMPTY_MATCH_EDIT_FORM = {
  date: "",
  time: "",
  venueId: "",
  status: "scheduled",
  teamAId: "",
  teamBId: "",
  scoreA: "0",
  scoreB: "0",
  spiritScores: EMPTY_SPIRIT_SCORES,
  captainsConfirmed: false,
};

const EMPTY_MATCH_CREATE_FORM = {
  date: "",
  time: "",
  divisionId: "",
  poolId: "",
  venueId: "",
  status: "scheduled",
  teamAId: "",
  teamBId: "",
  scoreA: "0",
  scoreB: "0",
  captainsConfirmed: false,
  confirmedDate: "",
  confirmedTime: "",
  scorekeeperId: "",
  startingTeamId: "",
  abbaPattern: "",
  mediaProvider: "",
  mediaUrl: "",
  mediaStatus: "",
  hasMedia: false,
  mediaLinkJson: "",
};

function createEmptySpiritScores() {
  return {
    teamA: { ...EMPTY_SPIRIT_SCORES.teamA },
    teamB: { ...EMPTY_SPIRIT_SCORES.teamB },
  };
}

function createEmptyMatchEditForm() {
  return {
    ...EMPTY_MATCH_EDIT_FORM,
    spiritScores: createEmptySpiritScores(),
  };
}

function createEmptyMatchCreateForm() {
  return { ...EMPTY_MATCH_CREATE_FORM };
}

function formatDateParts(timestamp) {
  if (!timestamp) {
    return { date: "TBD", time: "TBD" };
  }

  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return { date: "TBD", time: "TBD" };
  }

  return {
    date: new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(value),
    time: new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(value),
  };
}

function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return "Dates not set";
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const start = startDate ? formatter.format(new Date(startDate)) : null;
  const end = endDate ? formatter.format(new Date(endDate)) : null;
  if (start && end) return start === end ? start : `${start} to ${end}`;
  return start || end || "Dates not set";
}

function formatRatio(value, total) {
  if (!total) return "0 / 0";
  return `${value} / ${total}`;
}

function getLocalDateTimeParts(timestamp) {
  if (!timestamp) {
    return { date: "", time: "" };
  }

  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return { date: "", time: "" };
  }

  const pad = (part) => String(part).padStart(2, "0");
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

function buildStartTime(date, time) {
  if (!date && !time) {
    return null;
  }

  if (!date) {
    throw new Error("Select a date before saving a match time.");
  }

  const value = new Date(`${date}T${time || "00:00"}`);
  if (Number.isNaN(value.getTime())) {
    throw new Error("Enter a valid date and time.");
  }

  return value.toISOString();
}

function buildSpiritScores(teamAScores, teamBScores) {
  const resolveScores = (scores) =>
    SPIRIT_CATEGORIES.reduce(
      (acc, category) => ({
        ...acc,
        [category.key]: scores?.[category.key] === null || scores?.[category.key] === undefined
          ? ""
          : String(scores[category.key]),
      }),
      {},
    );

  return {
    teamA: resolveScores(teamAScores),
    teamB: resolveScores(teamBScores),
  };
}

function normalizeEditForm(form) {
  if (!form || typeof form !== "object") {
    return createEmptyMatchEditForm();
  }

  return {
    ...createEmptyMatchEditForm(),
    ...form,
    spiritScores: buildSpiritScores(form.spiritScores?.teamA, form.spiritScores?.teamB),
  };
}

function buildEditForm(match) {
  const { date, time } = getLocalDateTimeParts(match?.start_time);
  return {
    date,
    time,
    venueId: match?.venue?.id || "",
    status: match?.status || "scheduled",
    teamAId: match?.team_a?.id || "",
    teamBId: match?.team_b?.id || "",
    scoreA: String(match?.score_a ?? 0),
    scoreB: String(match?.score_b ?? 0),
    spiritScores: buildSpiritScores(match?.spiritCategoriesA, match?.spiritCategoriesB),
    captainsConfirmed: Boolean(match?.captains_confirmed),
  };
}

function normalizeMatchScore(value, label) {
  if (value === "" || value === null || value === undefined) {
    return 0;
  }

  const score = Number(value);
  if (!Number.isInteger(score) || score < 0) {
    throw new Error(`${label} must be a non-negative whole number.`);
  }

  return score;
}

function buildCreateMediaLink(form) {
  const rawJson = typeof form.mediaLinkJson === "string" ? form.mediaLinkJson.trim() : "";
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("Media link JSON must be an object.");
      }
      return parsed;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Media link JSON is invalid.");
    }
  }

  const provider = typeof form.mediaProvider === "string" ? form.mediaProvider.trim() : "";
  const url = typeof form.mediaUrl === "string" ? form.mediaUrl.trim() : "";
  const status = typeof form.mediaStatus === "string" ? form.mediaStatus.trim() : "";

  if (!provider && !url && !status) {
    return null;
  }

  return {
    primary: {
      provider: provider || null,
      url: url || null,
      status: status || null,
    },
  };
}

function normalizeSpiritCategoryScores(scores, teamLabel) {
  const hasAnyScore = SPIRIT_CATEGORIES.some((category) => {
    const value = scores?.[category.key];
    return value !== "" && value !== null && value !== undefined;
  });

  if (!hasAnyScore) {
    return null;
  }

  return SPIRIT_CATEGORIES.reduce((acc, category) => {
    const value = scores?.[category.key];
    if (value === "" || value === null || value === undefined) {
      return { ...acc, [category.key]: null };
    }

    const score = Number(value);
    if (!Number.isFinite(score) || score < 0 || score > 5) {
      throw new Error(`${teamLabel} ${category.label.toLowerCase()} must be a number from 0 to 5.`);
    }

    return { ...acc, [category.key]: Math.round(score) };
  }, {});
}

function getSpiritScoreTotal(scores) {
  if (!scores) {
    return "";
  }

  return SPIRIT_CATEGORIES.reduce((total, category) => {
    const value = scores[category.key];
    const numericValue = value === "" || value === null || value === undefined ? 0 : Number(value);
    return total + (Number.isFinite(numericValue) ? numericValue : 0);
  }, 0);
}

function hasSpiritScoreValues(scores) {
  return SPIRIT_CATEGORIES.some((category) => {
    const value = scores?.[category.key];
    return value !== "" && value !== null && value !== undefined;
  });
}

function getTeamOptionName(teamOptions, teamId, fallback) {
  const team = teamOptions.find((option) => option.id === teamId);
  return team?.short_name || team?.name || fallback;
}

function getStatusBadgeClass(status) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";

  if (normalized === "live") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (normalized === "completed") {
    return "border-emerald-700 bg-emerald-700 text-white";
  }
  if (normalized === "finished") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "canceled") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (normalized === "scheduled") {
    return "border-slate-300 bg-slate-100 text-slate-600";
  }

  return "border-slate-300 bg-slate-100 text-slate-600";
}

function SummaryMetric({ label, value, detail }) {
  return (
    <Panel variant="light" className="min-w-0 px-2 py-2.5 shadow-sm shadow-[rgba(8,25,21,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">{label}</p>
      <p className="mt-1 text-xl font-bold text-[var(--sc-surface-light-ink)]">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[var(--sc-surface-light-ink)]/70">{detail}</p> : null}
    </Panel>
  );
}

export default function TournamentOverviewPanel({ eventsList = [], eventOptionsReady = true }) {
  const navigate = useNavigate();
  const { roles, rolesLoading } = useAuth();
  const [selectedEventId, setSelectedEventId] = usePersistentState(TOURNAMENT_DIRECTOR_SELECTED_EVENT_KEY, "");
  const [eventSummary, setEventSummary] = useState(null);
  const [overview, setOverview] = useState({ matches: [], summary: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingMatch, setEditingMatch] = useState(null);
  const [editForm, setEditForm] = useState(() => createEmptyMatchEditForm());
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editDeleting, setEditDeleting] = useState(false);
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [createForm, setCreateForm] = useState(() => createEmptyMatchCreateForm());
  const [createError, setCreateError] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [linkedUsers, setLinkedUsers] = useState([]);

  const accessibleEvents = useMemo(() => {
    if (!Array.isArray(eventsList) || eventsList.length === 0) {
      return [];
    }

    if (!Array.isArray(roles)) {
      return [];
    }

    if (roleAssignmentsIncludeAdmin(roles)) {
      return eventsList;
    }

    const allowedEventIds = new Set(
      roles
        .filter((assignment) => assignment?.scope === "event" && typeof assignment?.eventId === "string")
        .map((assignment) => assignment.eventId),
    );

    if (allowedEventIds.size === 0) {
      return [];
    }

    return eventsList.filter((event) => allowedEventIds.has(event.id));
  }, [eventsList, roles]);

  useEffect(() => {
    if (!eventOptionsReady) {
      return;
    }

    if (!accessibleEvents.length) {
      if (selectedEventId) {
        setSelectedEventId("");
      }
      return;
    }

    if (!selectedEventId || !accessibleEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(accessibleEvents[0].id);
    }
  }, [accessibleEvents, eventOptionsReady, selectedEventId, setSelectedEventId]);

  const selectedEvent = useMemo(
    () => accessibleEvents.find((event) => event.id === selectedEventId) || null,
    [accessibleEvents, selectedEventId],
  );

  const loadOverview = useCallback(
    async ({ forceRefresh = false, isActive = () => true } = {}) => {
      if (!eventOptionsReady) {
        return;
      }

      if (!selectedEventId || !selectedEvent) {
        if (isActive()) {
          setOverview({ matches: [], summary: null });
          setEventSummary(null);
        }
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [hierarchy, overviewData] = await Promise.all([
          getEventHierarchy(selectedEventId),
          getTournamentOverview(selectedEventId, forceRefresh ? { forceRefresh: true } : undefined),
        ]);

        if (!isActive()) return;
        setEventSummary(hierarchy);
        setOverview(overviewData);
      } catch (err) {
        if (!isActive()) return;
        setError(err instanceof Error ? err.message : "Unable to load tournament overview.");
        setEventSummary(null);
        setOverview({ matches: [], summary: null });
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [eventOptionsReady, selectedEvent, selectedEventId],
  );

  useEffect(() => {
    let active = true;
    loadOverview({ isActive: () => active });

    return () => {
      active = false;
    };
  }, [loadOverview]);

  useEffect(() => {
    let active = true;

    const loadLinkedUsers = async () => {
      if (!selectedEventId) {
        setLinkedUsers([]);
        return;
      }

      try {
        const users = await getEventLinkedUsers(selectedEventId);
        if (active) {
          setLinkedUsers(Array.isArray(users) ? users : []);
        }
      } catch (err) {
        console.warn("[TD] Failed to load event-linked scorekeepers", err);
        if (active) {
          setLinkedUsers([]);
        }
      }
    };

    loadLinkedUsers();

    return () => {
      active = false;
    };
  }, [selectedEventId]);

  const summary = overview.summary;
  const totalMatches = summary?.totalMatches || 0;
  const divisionCount = eventSummary?.divisions?.length || 0;
  const venueCount = eventSummary?.venues?.length || 0;
  const dateRangeLabel = formatDateRange(selectedEvent?.start_date, selectedEvent?.end_date);
  const teamOptions = useMemo(() => {
    const lookup = new Map();
    const addTeam = (team) => {
      if (!team?.id) return;
      lookup.set(team.id, {
        id: team.id,
        name: team.name || team.short_name || "Unnamed team",
        short_name: team.short_name || null,
      });
    };

    (eventSummary?.divisions || []).forEach((division) => {
      (division.pools || []).forEach((pool) => {
        (pool.teams || []).forEach((entry) => addTeam(entry.team));
      });
    });
    (overview.matches || []).forEach((match) => {
      addTeam(match.team_a);
      addTeam(match.team_b);
    });

    return Array.from(lookup.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [eventSummary, overview.matches]);
  const divisionOptions = useMemo(
    () =>
      (eventSummary?.divisions || [])
        .filter((division) => division?.id)
        .map((division) => ({
          id: division.id,
          name: division.name || "Division",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [eventSummary],
  );
  const poolOptions = useMemo(() => {
    const rows = [];
    (eventSummary?.divisions || []).forEach((division) => {
      (division?.pools || []).forEach((pool) => {
        if (!pool?.id) return;
        rows.push({
          id: pool.id,
          name: pool.name || "Pool",
          divisionId: division.id,
          divisionName: division.name || "Division",
          teams: Array.isArray(pool.teams) ? pool.teams : [],
        });
      });
    });
    return rows.sort((a, b) => `${a.divisionName} ${a.name}`.localeCompare(`${b.divisionName} ${b.name}`));
  }, [eventSummary]);
  const createPoolOptions = useMemo(
    () =>
      createForm.divisionId
        ? poolOptions.filter((pool) => pool.divisionId === createForm.divisionId)
        : poolOptions,
    [createForm.divisionId, poolOptions],
  );
  const createTeamOptions = useMemo(() => {
    const selectedPool = createForm.poolId
      ? poolOptions.find((pool) => pool.id === createForm.poolId)
      : null;
    const poolTeams = selectedPool?.teams
      ?.map((entry) => entry?.team)
      .filter((team) => team?.id)
      .map((team) => ({
        id: team.id,
        name: team.name || team.short_name || "Unnamed team",
        short_name: team.short_name || null,
      }));
    return poolTeams?.length ? poolTeams : teamOptions;
  }, [createForm.poolId, poolOptions, teamOptions]);
  const startingTeamOptions = useMemo(() => {
    const selected = [createForm.teamAId, createForm.teamBId].filter(Boolean);
    return selected
      .map((teamId) => createTeamOptions.find((team) => team.id === teamId))
      .filter(Boolean);
  }, [createForm.teamAId, createForm.teamBId, createTeamOptions]);
  const scorekeeperOptions = useMemo(
    () =>
      (linkedUsers || [])
        .filter((user) => user?.id)
        .map((user) => ({
          id: user.id,
          label: user.fullName || user.email || "Linked user",
          email: user.email || "",
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [linkedUsers],
  );
  const venueOptions = useMemo(() => {
    const lookup = new Map();
    (eventSummary?.venues || []).forEach((venue) => {
      if (venue?.id) lookup.set(venue.id, venue);
    });
    (overview.matches || []).forEach((match) => {
      if (match?.venue?.id && !lookup.has(match.venue.id)) {
        lookup.set(match.venue.id, { id: match.venue.id, name: match.venue.name || "Venue" });
      }
    });
    return Array.from(lookup.values()).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [eventSummary, overview.matches]);
  const normalizedEditForm = useMemo(() => normalizeEditForm(editForm), [editForm]);
  const statusOptions = useMemo(() => {
    if (!normalizedEditForm.status || MATCH_STATUS_OPTIONS.includes(normalizedEditForm.status)) {
      return MATCH_STATUS_OPTIONS;
    }

    return [normalizedEditForm.status, ...MATCH_STATUS_OPTIONS];
  }, [normalizedEditForm.status]);
  const createStatusOptions = useMemo(() => {
    if (!createForm.status || MATCH_STATUS_OPTIONS.includes(createForm.status)) {
      return MATCH_STATUS_OPTIONS;
    }

    return [createForm.status, ...MATCH_STATUS_OPTIONS];
  }, [createForm.status]);

  const openMatchCreator = () => {
    if (!selectedEventId) return;
    setCreateForm(createEmptyMatchCreateForm());
    setCreateError("");
    setCreatingMatch(true);
  };

  const closeMatchCreator = () => {
    if (createSaving) return;
    setCreatingMatch(false);
    setCreateForm(createEmptyMatchCreateForm());
    setCreateError("");
  };

  const handleCreateField = (field, value) => {
    setCreateForm((prev) => {
      if (field === "divisionId") {
        const poolStillAvailable = value && poolOptions.some((pool) => pool.id === prev.poolId && pool.divisionId === value);
        return {
          ...prev,
          divisionId: value,
          poolId: poolStillAvailable ? prev.poolId : "",
        };
      }

      if (field === "poolId") {
        const selectedPool = poolOptions.find((pool) => pool.id === value);
        const allowedTeamIds = selectedPool
          ? new Set(selectedPool.teams.map((entry) => entry?.team?.id).filter(Boolean))
          : null;
        return {
          ...prev,
          poolId: value,
          divisionId: selectedPool?.divisionId || prev.divisionId,
          teamAId: allowedTeamIds && !allowedTeamIds.has(prev.teamAId) ? "" : prev.teamAId,
          teamBId: allowedTeamIds && !allowedTeamIds.has(prev.teamBId) ? "" : prev.teamBId,
          startingTeamId: allowedTeamIds && !allowedTeamIds.has(prev.startingTeamId) ? "" : prev.startingTeamId,
        };
      }

      if (field === "teamAId" || field === "teamBId") {
        const nextForm = { ...prev, [field]: value };
        if (nextForm.startingTeamId && ![nextForm.teamAId, nextForm.teamBId].includes(nextForm.startingTeamId)) {
          nextForm.startingTeamId = "";
        }
        return nextForm;
      }

      return { ...prev, [field]: value };
    });
  };

  const openMatchEditor = (match) => {
    setEditingMatch(match);
    setEditForm(buildEditForm(match));
    setEditError("");
    setEditDeleting(false);
  };

  const closeMatchEditor = () => {
    if (editSaving || editDeleting) return;
    setEditingMatch(null);
    setEditForm(createEmptyMatchEditForm());
    setEditError("");
    setEditDeleting(false);
  };

  const handleEditField = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSpiritField = (teamKey, categoryKey, value) => {
    setEditForm((prev) => ({
      ...normalizeEditForm(prev),
      spiritScores: {
        ...normalizeEditForm(prev).spiritScores,
        [teamKey]: {
          ...normalizeEditForm(prev).spiritScores[teamKey],
          [categoryKey]: value,
        },
      },
    }));
  };

  const handleSaveMatchCreate = async (event) => {
    event.preventDefault();
    if (!selectedEventId || createSaving) return;

    setCreateSaving(true);
    setCreateError("");

    try {
      const form = createForm || createEmptyMatchCreateForm();

      if (form.teamAId && form.teamBId && form.teamAId === form.teamBId) {
        throw new Error("Team A and Team B must be different teams.");
      }

      const startTime = buildStartTime(form.date, form.time);
      const scoreA = normalizeMatchScore(form.scoreA, "Team A score");
      const scoreB = normalizeMatchScore(form.scoreB, "Team B score");
      const confirmedAt = form.captainsConfirmed
        ? form.confirmedDate || form.confirmedTime
          ? buildStartTime(form.confirmedDate, form.confirmedTime)
          : new Date().toISOString()
        : null;
      const mediaLink = buildCreateMediaLink(form);

      await createMatch({
        eventId: selectedEventId,
        divisionId: form.divisionId,
        poolId: form.poolId,
        venueId: form.venueId,
        teamAId: form.teamAId,
        teamBId: form.teamBId,
        startingTeamId: form.startingTeamId,
        abbaPattern: form.abbaPattern,
        status: form.status,
        startTime,
        scoreA,
        scoreB,
        captainsConfirmed: form.captainsConfirmed,
        confirmedAt,
        scorekeeperId: form.scorekeeperId,
        mediaLink,
        mediaProvider: form.mediaProvider,
        mediaUrl: form.mediaUrl,
        mediaStatus: form.mediaStatus,
        hasMedia: form.hasMedia || Boolean(mediaLink),
      });

      invalidateTournamentOverview(selectedEventId);
      await loadOverview({ forceRefresh: true });
      setCreatingMatch(false);
      setCreateForm(createEmptyMatchCreateForm());
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unable to create match.");
    } finally {
      setCreateSaving(false);
    }
  };

  const handleSaveMatchEdit = async (event) => {
    event.preventDefault();
    if (!editingMatch?.id) return;
    if (editDeleting) return;

    setEditSaving(true);
    setEditError("");

    try {
      const form = normalizeEditForm(editForm);

      if (form.teamAId && form.teamBId && form.teamAId === form.teamBId) {
        throw new Error("Team A and Team B must be different teams.");
      }

      const startTime = buildStartTime(form.date, form.time);
      const scoreA = normalizeMatchScore(form.scoreA, "Team A score");
      const scoreB = normalizeMatchScore(form.scoreB, "Team B score");
      const spiritScoresA = normalizeSpiritCategoryScores(form.spiritScores.teamA, "Team A");
      const spiritScoresB = normalizeSpiritCategoryScores(form.spiritScores.teamB, "Team B");
      const confirmedAt = form.captainsConfirmed
        ? editingMatch.confirmed_at || new Date().toISOString()
        : null;

      await updateMatch(editingMatch.id, {
        startTime,
        venueId: form.venueId,
        status: form.status,
        teamAId: form.teamAId,
        teamBId: form.teamBId,
        scoreA,
        scoreB,
        captainsConfirmed: form.captainsConfirmed,
        confirmedAt,
      });

      const spiritEntries = [];
      if (spiritScoresA && form.teamAId) {
        spiritEntries.push({ ratedTeamId: form.teamAId, scores: spiritScoresA });
      }
      if (spiritScoresB && form.teamBId) {
        spiritEntries.push({ ratedTeamId: form.teamBId, scores: spiritScoresB });
      }
      if (spiritEntries.length) {
        await saveTournamentDirectorSpiritScores(editingMatch.id, spiritEntries);
      }

      invalidateTournamentOverview(selectedEventId);
      await loadOverview({ forceRefresh: true });
      setEditingMatch(null);
      setEditForm(createEmptyMatchEditForm());
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Unable to update match.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteMatch = async () => {
    if (!editingMatch?.id) return;

    const confirmed = window.confirm(
      `Delete ${editingMatch.displayTeamA} vs ${editingMatch.displayTeamB}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setEditDeleting(true);
    setEditError("");

    try {
      await deleteMatch(editingMatch.id);
      invalidateTournamentOverview(selectedEventId);
      await loadOverview({ forceRefresh: true });
      setEditingMatch(null);
      setEditForm(createEmptyMatchEditForm());
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Unable to delete match.");
    } finally {
      setEditDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card variant="light" className="space-y-3 p-4 shadow-md shadow-[rgba(8,25,21,0.06)]">
        <SectionHeader
          title="Overview"
          action={
            <button
              type="button"
              onClick={async () => {
                if (!selectedEventId) return;
                invalidateTournamentOverview(selectedEventId);
                await loadOverview({ forceRefresh: true });
              }}
              className="sc-button"
            >
              Refresh overview
            </button>
          }
        />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),auto]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Event</p>
            <select
              value={selectedEventId}
              onChange={(event) => setSelectedEventId(event.target.value)}
              className={`${LIGHT_INPUT_CLASS} mt-2 w-full appearance-none`}
            >
              {rolesLoading ? <option value="">Loading access...</option> : null}
              {!rolesLoading && accessibleEvents.length === 0 ? <option value="">No accessible events</option> : null}
              {accessibleEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Chip variant="ghost" className="text-xs text-[var(--sc-surface-light-ink)]/80">
              {selectedEvent?.type || "Event"}
            </Chip>
            <Chip variant="ghost" className="text-xs text-[var(--sc-surface-light-ink)]/80">
              {selectedEvent?.status || "Status unknown"}
            </Chip>
          </div>
        </div>
        {selectedEvent ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
            <Panel variant="light" className="p-3 shadow-sm shadow-[rgba(8,25,21,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">Tournament</p>
              <p className="mt-1 text-lg font-semibold text-[var(--sc-surface-light-ink)]">{selectedEvent.name}</p>
              <p className="mt-1 text-sm text-[var(--sc-surface-light-ink)]/70">{selectedEvent.location || "Location not set"}</p>
            </Panel>
            <Panel variant="light" className="p-3 shadow-sm shadow-[rgba(8,25,21,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">Dates</p>
              <p className="mt-1 text-lg font-semibold text-[var(--sc-surface-light-ink)]">{dateRangeLabel}</p>
              <p className="mt-1 text-sm text-[var(--sc-surface-light-ink)]/70">{divisionCount} divisions, {venueCount} venues</p>
            </Panel>
            <Panel variant="light" className="p-3 shadow-sm shadow-[rgba(8,25,21,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">Participation</p>
              <p className="mt-1 text-lg font-semibold text-[var(--sc-surface-light-ink)]">{summary?.uniqueTeamCount || 0} teams</p>
              <p className="mt-1 text-sm text-[var(--sc-surface-light-ink)]/70">{totalMatches} matches loaded</p>
            </Panel>
          </div>
        ) : null}
        {error ? (
          <Panel variant="light" className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </Panel>
        ) : null}
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
        <SummaryMetric label="Matches" value={totalMatches} detail="All rows in schedule order" />
        <SummaryMetric
          label="Completed"
          value={summary?.completedMatches || 0}
          detail={formatRatio(summary?.completedMatches || 0, totalMatches)}
        />
        <SummaryMetric
          label="Live"
          value={summary?.liveMatches || 0}
          detail={formatRatio(summary?.liveMatches || 0, totalMatches)}
        />
        <SummaryMetric
          label="Scheduled"
          value={summary?.scheduledMatches || 0}
          detail={formatRatio(summary?.scheduledMatches || 0, totalMatches)}
        />
        <SummaryMetric
          label="Captain Confirmed"
          value={summary?.confirmedMatches || 0}
          detail={formatRatio(summary?.confirmedMatches || 0, totalMatches)}
        />
      </div>

      <Card variant="light" className="space-y-3 p-4 shadow-md shadow-[rgba(8,25,21,0.06)]">
        <SectionHeader
          title="Chronological schedule"
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Chip variant="ghost" className="text-xs uppercase tracking-wide text-[var(--sc-surface-light-ink)]/80">
                {loading ? "Loading" : `${totalMatches} rows`}
              </Chip>
              <button
                type="button"
                onClick={openMatchCreator}
                className="sc-button bg-[#0a3d29] text-white"
                disabled={!selectedEventId}
              >
                + Match
              </button>
            </div>
          }
        />
        <div className="overflow-hidden rounded-xl border border-[var(--sc-surface-light-border)] bg-[#f8fcf9]">
          {loading && overview.matches.length === 0 ? (
            <p className="p-4 text-sm text-[var(--sc-surface-light-ink)]/70">Loading overview...</p>
          ) : overview.matches.length === 0 ? (
            <p className="p-4 text-sm text-[var(--sc-surface-light-ink)]/70">No matches found for this event.</p>
          ) : (
            <div className="overflow-auto">
            <table className="min-w-full table-fixed divide-y divide-[var(--sc-surface-light-border)] text-sm">
              <thead className="sticky top-0 z-10 bg-[#eef7f1] shadow-sm">
                <tr>
                  {[
                    "Date",
                    "Time",
                    "Venue",
                    "Status",
                    "Team A",
                    "SA",
                    "SB",
                    "Team B",
                    "Spirit",
                    "Captain",
                    "",
                  ].map((column) => (
                    <th
                      key={column || "actions"}
                      className="whitespace-nowrap px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--sc-surface-light-ink)]/55"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-surface-light-border)]/70">
                {overview.matches.map((match, index) => {
                  const { date, time } = formatDateParts(match.start_time || match.confirmed_at);
                  return (
                    <tr
                      key={match.id}
                      className={`cursor-pointer transition hover:bg-[#e8f4ec] ${index % 2 === 0 ? "bg-white" : "bg-[#fbfdfb]"}`}
                      onClick={() => navigate(`/matches?matchId=${encodeURIComponent(match.id)}`)}
                    >
                      <td className="whitespace-nowrap px-2 py-1.5 text-[var(--sc-surface-light-ink)]">
                        <div className="flex flex-col">
                          <span className="font-semibold">{date}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-[var(--sc-surface-light-ink)]/80">
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow-sm">
                          {time}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-[var(--sc-surface-light-ink)]">
                        <span className="block max-w-[7rem] truncate font-medium">{match.displayVenue}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-[var(--sc-surface-light-ink)]">
                        <span
                          className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${getStatusBadgeClass(match.status)}`}
                        >
                          {match.status || "Unknown"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-medium text-[var(--sc-surface-light-ink)]">
                        <span className="block max-w-[7rem] truncate">{match.displayTeamA}</span>
                      </td>
                      <td className="whitespace-nowrap px-1.5 py-1.5 text-center">
                        <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-[#eaf5ee] px-1.5 py-0.5 font-bold tabular-nums text-[var(--sc-surface-light-ink)] shadow-sm">
                          {match.score_a ?? 0}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-1.5 py-1.5 text-center">
                        <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-[#eaf5ee] px-1.5 py-0.5 font-bold tabular-nums text-[var(--sc-surface-light-ink)] shadow-sm">
                          {match.score_b ?? 0}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-medium text-[var(--sc-surface-light-ink)]">
                        <span className="block max-w-[7rem] truncate">{match.displayTeamB}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-[var(--sc-surface-light-ink)]">
                        {match.spiritScoreA !== null || match.spiritScoreB !== null ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7f0] px-1.5 py-0.5 font-semibold tabular-nums">
                            <span>{match.spiritScoreA ?? "-"}</span>
                            <span className="text-[9px] text-[var(--sc-surface-light-ink)]/45">/</span>
                            <span>{match.spiritScoreB ?? "-"}</span>
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                            -
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                            match.captains_confirmed
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {match.captains_confirmed ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openMatchEditor(match);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--sc-surface-light-border)] bg-white text-[var(--sc-surface-light-ink)] shadow-sm transition hover:bg-[#edf7f0] focus:outline-none focus:ring-2 focus:ring-[#0a3d29]/40"
                          aria-label={`Edit match ${match.displayTeamA} vs ${match.displayTeamB}`}
                          title="Edit match"
                        >
                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                            <path
                              d="M4 14.5V16h1.5l8.85-8.85-1.5-1.5L4 14.5Z"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinejoin="round"
                            />
                            <path
                              d="m12.4 4.6 1-1a1.4 1.4 0 0 1 2 2l-1 1"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </Card>

      {creatingMatch ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-3 py-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="td-create-match-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeMatchCreator();
            }
          }}
        >
          <Card
            as="form"
            variant="light"
            className="relative max-h-[94vh] w-full max-w-3xl overflow-auto p-4 shadow-2xl shadow-black/20"
            onSubmit={handleSaveMatchCreate}
          >
            <button
              type="button"
              onClick={closeMatchCreator}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--sc-surface-light-border)] bg-white text-[var(--sc-surface-light-ink)] transition hover:bg-[#eef7f1]"
              disabled={createSaving}
              aria-label="Close create match"
              title="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>

            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--sc-surface-light-border)] pb-3 pr-10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">Create match</p>
                <h3 id="td-create-match-title" className="text-lg font-bold text-[var(--sc-surface-light-ink)]">
                  {selectedEvent?.name || "Selected event"}
                </h3>
                <p className="mt-1 break-all text-xs text-[var(--sc-surface-light-ink)]/65">
                  Event ID: {selectedEventId}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Event</span>
                <select value={selectedEventId} disabled className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}>
                  <option value={selectedEventId}>{selectedEvent?.name || selectedEventId}</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Division</span>
                <select
                  value={createForm.divisionId}
                  onChange={(event) => handleCreateField("divisionId", event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                >
                  <option value="">Unassigned</option>
                  {divisionOptions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Pool</span>
                <select
                  value={createForm.poolId}
                  onChange={(event) => handleCreateField("poolId", event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                >
                  <option value="">Unassigned</option>
                  {createPoolOptions.map((pool) => (
                    <option key={pool.id} value={pool.id}>
                      {pool.divisionName} - {pool.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Venue</span>
                <select
                  value={createForm.venueId}
                  onChange={(event) => handleCreateField("venueId", event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                >
                  <option value="">Unassigned</option>
                  {venueOptions.map((venue) => (
                    <option key={venue.id} value={venue.id}>
                      {venue.name || "Unnamed venue"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Date</span>
                <input
                  type="date"
                  value={createForm.date}
                  onChange={(event) => handleCreateField("date", event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Time</span>
                <input
                  type="time"
                  value={createForm.time}
                  onChange={(event) => handleCreateField("time", event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Status</span>
                <select
                  value={createForm.status}
                  onChange={(event) => handleCreateField("status", event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                >
                  {createStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Scorekeeper</span>
                <select
                  value={createForm.scorekeeperId}
                  onChange={(event) => handleCreateField("scorekeeperId", event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                >
                  <option value="">Unassigned</option>
                  {scorekeeperOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email ? `${user.label} - ${user.email}` : user.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem]">
                <label className="block min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Team A</span>
                  <select
                    value={createForm.teamAId}
                    onChange={(event) => handleCreateField("teamAId", event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                  >
                    <option value="">Unassigned</option>
                    {createTeamOptions.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.short_name ? `${team.short_name} - ${team.name}` : team.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Score</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={createForm.scoreA}
                    onChange={(event) => handleCreateField("scoreA", event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} mt-1 w-full tabular-nums`}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem]">
                <label className="block min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Team B</span>
                  <select
                    value={createForm.teamBId}
                    onChange={(event) => handleCreateField("teamBId", event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                  >
                    <option value="">Unassigned</option>
                    {createTeamOptions.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.short_name ? `${team.short_name} - ${team.name}` : team.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Score</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={createForm.scoreB}
                    onChange={(event) => handleCreateField("scoreB", event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} mt-1 w-full tabular-nums`}
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Starting team</span>
                <select
                  value={createForm.startingTeamId}
                  onChange={(event) => handleCreateField("startingTeamId", event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                >
                  <option value="">Unassigned</option>
                  {startingTeamOptions.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.short_name || team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">ABBA pattern</span>
                <input
                  type="text"
                  value={createForm.abbaPattern}
                  onChange={(event) => handleCreateField("abbaPattern", event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full`}
                  placeholder="ABBA"
                />
              </label>
            </div>

            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 rounded-lg border border-[var(--sc-surface-light-border)] bg-white p-3">
              <label className="flex items-center gap-3 text-sm font-semibold text-[var(--sc-surface-light-ink)]">
                <input
                  type="checkbox"
                  checked={createForm.captainsConfirmed}
                  onChange={(event) => handleCreateField("captainsConfirmed", event.target.checked)}
                  className="h-4 w-4"
                  style={{ accentColor: "#0a3d29" }}
                />
                Captain confirmed
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Confirmed date</span>
                <input
                  type="date"
                  value={createForm.confirmedDate}
                  onChange={(event) => handleCreateField("confirmedDate", event.target.value)}
                  disabled={!createForm.captainsConfirmed}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full disabled:bg-slate-100`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Confirmed time</span>
                <input
                  type="time"
                  value={createForm.confirmedTime}
                  onChange={(event) => handleCreateField("confirmedTime", event.target.value)}
                  disabled={!createForm.captainsConfirmed}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full disabled:bg-slate-100`}
                />
              </label>
            </div>

            <div className="mt-3 space-y-3 rounded-lg border border-[var(--sc-surface-light-border)] bg-white p-3">
              <label className="flex items-center gap-3 text-sm font-semibold text-[var(--sc-surface-light-ink)]">
                <input
                  type="checkbox"
                  checked={createForm.hasMedia}
                  onChange={(event) => handleCreateField("hasMedia", event.target.checked)}
                  className="h-4 w-4"
                  style={{ accentColor: "#0a3d29" }}
                />
                Has media
              </label>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Media provider</span>
                  <input
                    type="text"
                    value={createForm.mediaProvider}
                    onChange={(event) => handleCreateField("mediaProvider", event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} mt-1 w-full`}
                    placeholder="youtube"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Media URL</span>
                  <input
                    type="url"
                    value={createForm.mediaUrl}
                    onChange={(event) => handleCreateField("mediaUrl", event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} mt-1 w-full`}
                    placeholder="https://"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Media status</span>
                  <input
                    type="text"
                    value={createForm.mediaStatus}
                    onChange={(event) => handleCreateField("mediaStatus", event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} mt-1 w-full`}
                    placeholder="ready"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Media link JSON</span>
                <textarea
                  value={createForm.mediaLinkJson}
                  onChange={(event) => handleCreateField("mediaLinkJson", event.target.value)}
                  rows={3}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full font-mono text-xs`}
                  placeholder='{"primary":{"provider":"youtube","url":"https://...","status":"ready"}}'
                  spellCheck={false}
                />
              </label>
            </div>

            {createError ? (
              <Panel variant="light" className="mt-3 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {createError}
              </Panel>
            ) : null}

            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-[var(--sc-surface-light-border)] pt-3">
              <button type="button" onClick={closeMatchCreator} className="sc-button" disabled={createSaving}>
                Cancel
              </button>
              <button type="submit" className="sc-button bg-[#0a3d29] text-white" disabled={createSaving}>
                {createSaving ? "Creating..." : "Create match"}
              </button>
            </div>
          </Card>
        </div>
      ) : null}

      {editingMatch ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-3 py-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="td-edit-match-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeMatchEditor();
            }
          }}
        >
          <Card
            as="form"
            variant="light"
            className="relative max-h-[94vh] w-full max-w-3xl overflow-auto p-4 shadow-2xl shadow-black/20"
            onSubmit={handleSaveMatchEdit}
          >
            <button
              type="button"
              onClick={closeMatchEditor}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--sc-surface-light-border)] bg-white text-[var(--sc-surface-light-ink)] transition hover:bg-[#eef7f1]"
              disabled={editSaving || editDeleting}
              aria-label="Close edit match"
              title="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--sc-surface-light-border)] pb-3 pr-10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">Edit match</p>
                <h3 id="td-edit-match-title" className="text-lg font-bold text-[var(--sc-surface-light-ink)]">
                  {editingMatch.displayTeamA} vs {editingMatch.displayTeamB}
                </h3>
                <p className="mt-1 break-all text-xs text-[var(--sc-surface-light-ink)]/65">
                  Match ID: {editingMatch.id}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Date</span>
                <input
                  type="date"
                  value={normalizedEditForm.date}
                  onChange={(event) => handleEditField("date", event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Time</span>
                <input
                  type="time"
                  value={normalizedEditForm.time}
                  onChange={(event) => handleEditField("time", event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Venue</span>
                <select
                  value={normalizedEditForm.venueId}
                  onChange={(event) => handleEditField("venueId", event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                >
                  <option value="">Unassigned</option>
                  {venueOptions.map((venue) => (
                    <option key={venue.id} value={venue.id}>
                      {venue.name || "Unnamed venue"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Status</span>
                <select
                  value={normalizedEditForm.status}
                  onChange={(event) => handleEditField("status", event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem]">
                <label className="block min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Team A</span>
                  <select
                    value={normalizedEditForm.teamAId}
                    onChange={(event) => handleEditField("teamAId", event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                  >
                    <option value="">Unassigned</option>
                    {teamOptions.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.short_name ? `${team.short_name} - ${team.name}` : team.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Score</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={normalizedEditForm.scoreA}
                    onChange={(event) => handleEditField("scoreA", event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} mt-1 w-full tabular-nums`}
                    aria-label={`${getTeamOptionName(teamOptions, normalizedEditForm.teamAId, "Team A")} score`}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem]">
                <label className="block min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Team B</span>
                  <select
                    value={normalizedEditForm.teamBId}
                    onChange={(event) => handleEditField("teamBId", event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                  >
                    <option value="">Unassigned</option>
                    {teamOptions.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.short_name ? `${team.short_name} - ${team.name}` : team.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Score</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={normalizedEditForm.scoreB}
                    onChange={(event) => handleEditField("scoreB", event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} mt-1 w-full tabular-nums`}
                    aria-label={`${getTeamOptionName(teamOptions, normalizedEditForm.teamBId, "Team B")} score`}
                  />
                </label>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-lg border border-[var(--sc-surface-light-border)] bg-white">
              <table className="min-w-full divide-y divide-[var(--sc-surface-light-border)] text-sm">
                <thead className="bg-[#eef7f1]">
                  <tr>
                    <th className="px-1 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--sc-surface-light-ink)]/60">
                      Category
                    </th>
                    <th className="px-1 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--sc-surface-light-ink)]/60">
                      {getTeamOptionName(teamOptions, normalizedEditForm.teamAId, "Team A")}
                    </th>
                    <th className="px-1 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--sc-surface-light-ink)]/60">
                      {getTeamOptionName(teamOptions, normalizedEditForm.teamBId, "Team B")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sc-surface-light-border)]/70">
                  {SPIRIT_CATEGORIES.map((category) => (
                    <tr key={category.key}>
                      <td className="px-1 py-1.5 font-semibold text-[var(--sc-surface-light-ink)]">
                        {category.label}
                      </td>
                      {["teamA", "teamB"].map((teamKey) => (
                        <td key={`${category.key}-${teamKey}`} className="px-1 py-1.5">
                          <input
                            type="number"
                            min="0"
                            max="5"
                            step="1"
                            value={normalizedEditForm.spiritScores[teamKey][category.key]}
                            onChange={(event) => handleSpiritField(teamKey, category.key, event.target.value)}
                            className={`${LIGHT_INPUT_CLASS} w-16 px-2`}
                            placeholder="0-5"
                            aria-label={`${category.label} ${teamKey === "teamA" ? "Team A" : "Team B"}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-[#f8fcf9]">
                    <td className="px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
                      Total
                    </td>
                    <td className="px-1 py-1.5 font-bold tabular-nums text-[var(--sc-surface-light-ink)]">
                      {hasSpiritScoreValues(normalizedEditForm.spiritScores.teamA) ? getSpiritScoreTotal(normalizedEditForm.spiritScores.teamA) : "-"}
                    </td>
                    <td className="px-1 py-1.5 font-bold tabular-nums text-[var(--sc-surface-light-ink)]">
                      {hasSpiritScoreValues(normalizedEditForm.spiritScores.teamB) ? getSpiritScoreTotal(normalizedEditForm.spiritScores.teamB) : "-"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <label className="mt-3 flex items-center gap-3 rounded-lg border border-[var(--sc-surface-light-border)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--sc-surface-light-ink)]">
              <input
                type="checkbox"
                checked={normalizedEditForm.captainsConfirmed}
                onChange={(event) => handleEditField("captainsConfirmed", event.target.checked)}
                className="h-4 w-4"
                style={{ accentColor: "#0a3d29" }}
              />
              Captain confirmed
            </label>

            {editError ? (
              <Panel variant="light" className="mt-3 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {editError}
              </Panel>
            ) : null}

            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-[var(--sc-surface-light-border)] pt-3">
              <button
                type="button"
                onClick={handleDeleteMatch}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-red-700 bg-red-600 text-white shadow-[var(--sc-shadow-lift)] transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                disabled={editSaving || editDeleting}
                aria-label={editDeleting ? "Deleting match" : "Delete match"}
                title={editDeleting ? "Deleting..." : "Delete match"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
              <button type="button" onClick={closeMatchEditor} className="sc-button" disabled={editSaving || editDeleting}>
                Cancel
              </button>
              <button type="submit" className="sc-button bg-[#0a3d29] text-white" disabled={editSaving || editDeleting}>
                {editSaving ? "Saving..." : "Save match"}
              </button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
