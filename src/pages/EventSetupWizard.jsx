import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  Panel,
  SectionHeader,
  SectionShell,
  Chip,
} from "../components/ui/primitives";
import { getAllTeams } from "../services/teamService";
import {
  createEventHierarchy,
  getEventHierarchy,
  listAvailableVenues,
  listEventsForWizard,
  replaceEventHierarchy,
} from "../services/eventSetupService";

const STEPS = [
  { key: "event", title: "Event", description: "Baseline context" },
  { key: "divisions", title: "Divisions", description: "Competitive branches" },
  { key: "pools", title: "Pools", description: "Round-robin clusters" },
  {
    key: "teams",
    title: "Teams & matches",
    description: "Assignments + fixtures",
  },
  { key: "review", title: "Review", description: "Revision & validation" },
  { key: "confirm", title: "Confirm", description: "Push to database" },
];

const INITIAL_EVENT = {
  name: "",
  type: "tournament",
  start_date: "",
  end_date: "",
  location: "",
  notes: "",
};

const DEFAULT_RULES = {
  division: "mixed",
  format: "wfdfChampionship",
  game: {
    pointTarget: 15,
    softCapMinutes: null,
    softCapMode: "addOneToHighest",
    hardCapMinutes: 100,
    hardCapEndMode: "afterPoint",
  },
  half: {
    pointTarget: 8,
    timeCapMinutes: 55,
    breakMinutes: 7,
  },
  clock: {
    isRunningClockEnabled: true,
  },
  interPoint: {
    offenceOnLineSeconds: 45,
    offenceReadySeconds: 60,
    pullDeadlineSeconds: 75,
    timeoutAddsSeconds: 75,
    areTimeoutsStacked: true,
  },
  timeouts: {
    perTeamPerGame: 2,
    durationSeconds: 75,
  },
  inPointTimeout: {
    offenceSetSeconds: 75,
    defenceCheckMaxSeconds: 90,
  },
  discussions: {
    captainInterventionSeconds: 15,
    autoContestSeconds: 45,
    restartPlayMaxSeconds: 60,
  },
  discInPlay: {
    pivotCentralZoneMaxSeconds: 10,
    pivotEndZoneMaxSeconds: 20,
    newDiscRetrievalMaxSeconds: 20,
  },
  mixedRatio: {
    isEnabled: true,
    ratioRule: "A",
    initialRatioChoosingTeam: "home",
  },
};

const cloneDefaultRules = () => JSON.parse(JSON.stringify(DEFAULT_RULES));
const INITIAL_VENUE_FORM = {
  id: null,
  venueId: "",
  name: "",
  location: "",
  notes: "",
  latitude: "",
  longitude: "",
};

const matchStatuses = ["scheduled", "ready", "pending", "live", "finished"];
const createId = () =>
  `tmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const toDateTimeLocalValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 16);
};

const formatTeamOptionLabel = (team) => {
  if (!team) return "";
  return team.short_name ? `${team.name} (${team.short_name})` : team.name;
};

const formatVenueOptionLabel = (venue) => {
  if (!venue) return "";
  const name = (venue.name || "Unnamed venue").trim() || "Unnamed venue";
  const location =
    (venue.location || "Location TBD").trim() || "Location TBD";
  return `${name} (${location})`;
};

const Stepper = ({ current }) => (
  <ol className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
    {STEPS.map((step, index) => {
      const isActive = index === current;
      const isComplete = index < current;
      const pillStyle = {
        border: `1px solid ${
          isActive ? "var(--sc-accent)" : "var(--sc-border)"
        }`,
        background: isActive ? "var(--sc-accent)" : "rgba(9, 30, 24, 0.65)",
        color: isActive ? "var(--sc-button-ink)" : "var(--sc-ink)",
      };
      const badgeStyle = {
        background: isActive
          ? "rgba(0, 0, 0, 0.15)"
          : isComplete
            ? "rgba(99, 255, 160, 0.15)"
            : "rgba(255, 255, 255, 0.08)",
        color: isActive
          ? "var(--sc-button-ink)"
          : isComplete
            ? "var(--sc-ink)"
            : "var(--sc-ink-muted)",
        border: `1px solid ${
          isActive ? "rgba(3, 20, 15, 0.4)" : "rgba(255, 255, 255, 0.1)"
        }`,
      };
      return (
        <li
          key={step.key}
          className="flex items-center gap-2 rounded-full px-3 py-1"
          style={pillStyle}
        >
          <span
            className="rounded-full px-2 py-0.5 text-[11px]"
            style={badgeStyle}
          >
            {isComplete ? "✓" : index + 1}
          </span>
          {step.title}
        </li>
      );
    })}
  </ol>
);

const TextField = ({ label, className = "", ...props }) => (
  <label className="space-y-1 text-sm">
    <span className="text-xs uppercase tracking-wide text-ink-muted">
      {label}
    </span>
    <input
      className={`w-full rounded border border-border bg-white px-3 py-2 text-black ${className}`}
      {...props}
    />
  </label>
);

export default function EventSetupWizardPage() {
  const [step, setStep] = useState(0);
  const [event, setEvent] = useState(INITIAL_EVENT);
  const [divisions, setDivisions] = useState([]);
  const [eventVenues, setEventVenues] = useState([]);
  const [venueForm, setVenueForm] = useState(INITIAL_VENUE_FORM);
  const [venueMode, setVenueMode] = useState("create");
  const [selectedExistingVenueId, setSelectedExistingVenueId] = useState("");
  const [availableVenues, setAvailableVenues] = useState([]);
  const [availableVenuesLoading, setAvailableVenuesLoading] = useState(false);
  const [availableVenuesError, setAvailableVenuesError] = useState(null);
  const [divisionForm, setDivisionForm] = useState({
    id: null,
    name: "",
    level: "",
  });
  const [divisionTeamForm, setDivisionTeamForm] = useState({
    divisionId: "",
    name: "",
  });
  const [poolForm, setPoolForm] = useState({
    id: null,
    divisionId: "",
    name: "",
  });
  const [teamForm, setTeamForm] = useState({
    id: null,
    poolId: "",
    teamId: "",
    name: "",
    seed: "",
  });
  const [matchForm, setMatchForm] = useState({
    id: null,
    poolId: "",
    matchPoolId: "",
    teamA: "",
    teamAId: "",
    teamB: "",
    teamBId: "",
    start: "",
    status: "scheduled",
    venueRefId: "",
  });
  const [rules, setRules] = useState(() => cloneDefaultRules());
  const [teamOptions, setTeamOptions] = useState([]);
  const [teamOptionsError, setTeamOptionsError] = useState(null);
  const [teamOptionsLoading, setTeamOptionsLoading] = useState(false);
  const [formNotice, setFormNotice] = useState(null);
  const [submissionState, setSubmissionState] = useState({
    status: "idle",
    error: null,
    eventId: null,
    summary: null,
  });
  const [eventMode, setEventMode] = useState("create");
  const [existingEvents, setExistingEvents] = useState([]);
  const [existingEventsLoading, setExistingEventsLoading] = useState(false);
  const [existingEventsError, setExistingEventsError] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [prefillState, setPrefillState] = useState({
    status: "idle",
    error: null,
  });

  const activeDivisionId =
    poolForm.divisionId || divisionForm.id || divisions[0]?.id || "";
  const activeDivision =
    divisions.find((division) => division.id === activeDivisionId) || null;
  const activePoolId =
    teamForm.poolId ||
    matchForm.matchPoolId ||
    matchForm.poolId ||
    activeDivision?.pools?.[0]?.id ||
    "";
  const activePool =
    divisions
      .flatMap((division) => division.pools || [])
      .find((pool) => pool.id === activePoolId) || null;

  const resetWizardState = useCallback(() => {
    setEvent(INITIAL_EVENT);
    setRules(cloneDefaultRules());
    setDivisions([]);
    setEventVenues([]);
    setVenueForm(INITIAL_VENUE_FORM);
    setVenueMode("create");
    setSelectedExistingVenueId("");
    setDivisionForm({ id: null, name: "", level: "" });
    setDivisionTeamForm({ divisionId: "", name: "" });
    setPoolForm({ id: null, divisionId: "", name: "" });
    setTeamForm({ id: null, poolId: "", teamId: "", name: "", seed: "" });
    setMatchForm({
      id: null,
      poolId: "",
      matchPoolId: "",
      teamA: "",
      teamAId: "",
      teamB: "",
      teamBId: "",
      start: "",
      status: "scheduled",
      venueRefId: "",
    });
  }, []);

  const poolOptions = useMemo(
    () =>
      divisions.flatMap((division) =>
        (division.pools || []).map((pool) => ({
          id: pool.id,
          name: pool.name,
          divisionName: division.name || "Division",
          divisionId: division.id,
        })),
      ),
    [divisions],
  );

  const activePoolMeta = useMemo(() => {
    if (!activePoolId) return null;
    return poolOptions.find((option) => option.id === activePoolId) || null;
  }, [poolOptions, activePoolId]);

  const poolDivisionMap = useMemo(() => {
    const map = new Map();
    divisions.forEach((division) => {
      (division.pools || []).forEach((pool) => {
        map.set(pool.id, division);
      });
    });
    return map;
  }, [divisions]);

  const eventVenueOptions = useMemo(
    () =>
      eventVenues.map((venue) => ({
        id: venue.id,
        label: formatVenueOptionLabel(venue),
      })),
    [eventVenues],
  );

  const availableVenueLookup = useMemo(() => {
    const map = new Map();
    availableVenues.forEach((venue) => {
      if (venue?.id) {
        map.set(venue.id, venue);
      }
    });
    return map;
  }, [availableVenues]);

  const availableVenueOptions = useMemo(
    () =>
      availableVenues
        .filter((venue) => venue?.id)
        .map((venue) => ({
          id: venue.id,
          label: formatVenueOptionLabel(venue),
          venue,
        })),
    [availableVenues],
  );

  const loadExistingEvents = useCallback(async () => {
    setExistingEventsLoading(true);
    setExistingEventsError(null);
    try {
      const rows = await listEventsForWizard(100);
      setExistingEvents(rows || []);
    } catch (err) {
      setExistingEventsError(
        err?.message || "Unable to load existing events.",
      );
    } finally {
      setExistingEventsLoading(false);
    }
  }, []);

  const applyEventHierarchy = useCallback((payload) => {
    if (!payload?.event) {
      return;
    }
    const sourceRules =
      payload.event.rules && typeof payload.event.rules === "object"
        ? payload.event.rules
        : cloneDefaultRules();
    setEvent({
      name: payload.event.name || "",
      type: payload.event.type || "tournament",
      start_date: payload.event.start_date || "",
      end_date: payload.event.end_date || "",
      location: payload.event.location || "",
      notes: payload.event.notes || "",
    });
    setRules(JSON.parse(JSON.stringify(sourceRules)));
    const nextVenues = (payload.eventVenues || []).map((venue) => ({
      id: venue.id || venue.venueId || createId(),
      venueId: venue.venueId || venue.id || null,
      name: venue.name || "",
      location: venue.location || "",
      notes: venue.notes || "",
      latitude:
        venue.latitude === null || venue.latitude === undefined
          ? ""
          : String(venue.latitude),
      longitude:
        venue.longitude === null || venue.longitude === undefined
          ? ""
          : String(venue.longitude),
    }));
    const venueLookup = new Map();
    nextVenues.forEach((venue) => {
      if (venue.id) {
        venueLookup.set(venue.id, venue);
      }
      if (venue.venueId) {
        venueLookup.set(venue.venueId, venue);
      }
    });
    const nextDivisions = (payload.divisions || []).map((division) => ({
      id: division.id || createId(),
      name: division.name || "",
      level: division.level || "",
      divisionTeams: (division.divisionTeams || []).map((team) => ({
        id: team.id || createId(),
        teamId: team.teamId || "",
        name: team.name || "",
        shortName: team.shortName || null,
        displayLabel: team.displayLabel || team.name || "",
      })),
      pools: (division.pools || []).map((pool) => ({
        id: pool.id || createId(),
        name: pool.name || "",
        teams: (pool.teams || []).map((team) => ({
          id: team.id || createId(),
          name: team.name || "",
          shortName: team.shortName || null,
          teamId: team.teamId || "",
          displayLabel: team.displayLabel || team.name || "",
          seed: team.seed ?? "",
        })),
        matches: (pool.matches || []).map((match) => {
          const rawVenueRef = match.venueRefId || match.venueId || "";
          const resolvedVenue =
            (rawVenueRef && venueLookup.get(rawVenueRef)) || null;
          const venueLabel = resolvedVenue
            ? formatVenueOptionLabel(resolvedVenue)
            : match.venueLabel ||
              (match.venueName
                ? formatVenueOptionLabel({
                    name: match.venueName,
                    location: match.venueLocation,
                  })
                : "");
          return {
            id: match.id || createId(),
            teamA: match.teamA || "",
            teamAId: match.teamAId || "",
            teamB: match.teamB || "",
            teamBId: match.teamBId || "",
            start: toDateTimeLocalValue(match.start),
            status: match.status || "scheduled",
            teamALabel: match.teamALabel || match.teamA || "",
            teamBLabel: match.teamBLabel || match.teamB || "",
            venueRefId: resolvedVenue?.id || rawVenueRef || "",
            venueLabel,
          };
        }),
      })),
    }));
    setDivisions(nextDivisions);
    setEventVenues(nextVenues);
    setVenueForm(INITIAL_VENUE_FORM);
    setDivisionForm({ id: null, name: "", level: "" });
    setDivisionTeamForm({
      divisionId: nextDivisions[0]?.id || "",
      name: "",
    });
    setPoolForm({ id: null, divisionId: "", name: "" });
    setTeamForm({ id: null, poolId: "", teamId: "", name: "", seed: "" });
    setMatchForm({
      id: null,
      poolId: "",
      matchPoolId: "",
      teamA: "",
      teamAId: "",
      teamB: "",
      teamBId: "",
      start: "",
      status: "scheduled",
      venueRefId: "",
    });
  }, []);

  const handleModeChange = useCallback(
    (nextMode) => {
      if (nextMode === eventMode) {
        return;
      }
      setEventMode(nextMode);
      setSelectedEventId("");
      setPrefillState({ status: "idle", error: null });
      resetWizardState();
      if (nextMode === "edit" && existingEvents.length === 0 && !existingEventsLoading) {
        loadExistingEvents();
      }
    },
    [eventMode, existingEvents.length, existingEventsLoading, loadExistingEvents, resetWizardState],
  );

  const handleExistingEventSelection = useCallback(
    async (event) => {
      const value = event.target.value;
      setSelectedEventId(value);
      if (!value) {
        setPrefillState({ status: "idle", error: null });
        resetWizardState();
        return;
      }
      setPrefillState({ status: "loading", error: null });
      try {
        const hierarchy = await getEventHierarchy(value);
        applyEventHierarchy(hierarchy);
        setPrefillState({ status: "success", error: null });
        setFormNotice({
          type: "success",
          message: `Loaded "${hierarchy.event.name}" for editing.`,
        });
      } catch (err) {
        setPrefillState({
          status: "error",
          error: err?.message || "Unable to load event hierarchy.",
        });
      }
    },
    [applyEventHierarchy, resetWizardState],
  );

  const handleVenueFieldChange = (event) => {
    const { name, value } = event.target;
    setVenueForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAssignExistingVenue = (event) => {
    event.preventDefault();
    if (!selectedExistingVenueId) {
      setFormNotice({
        type: "error",
        message: "Select an existing venue to assign.",
      });
      return;
    }
    const selection = availableVenueLookup.get(selectedExistingVenueId);
    if (!selection) {
      setFormNotice({
        type: "error",
        message: "That venue is no longer available. Please refresh.",
      });
      return;
    }
    const duplicate = eventVenues.some(
      (venue) => venue.venueId && venue.venueId === selection.id,
    );
    if (duplicate) {
      setFormNotice({
        type: "error",
        message: "That venue is already assigned to this event.",
      });
      return;
    }
    setFormNotice(null);
    setEventVenues((prev) => [
      ...prev,
      {
        id: selection.id,
        venueId: selection.id,
        name: selection.name || "",
        location: selection.location || "",
        notes: selection.notes || "",
        latitude:
          selection.latitude === null || selection.latitude === undefined
            ? ""
            : String(selection.latitude),
        longitude:
          selection.longitude === null || selection.longitude === undefined
            ? ""
            : String(selection.longitude),
      },
    ]);
    setSelectedExistingVenueId("");
  };

  const handleVenueSubmit = (event) => {
    event.preventDefault();
    const trimmedName = venueForm.name.trim();
    if (!trimmedName) {
      setFormNotice({
        type: "error",
        message: "Venue name is required.",
      });
      return;
    }
    const payload = {
      id: venueForm.id,
      venueId: venueForm.venueId || null,
      name: trimmedName,
      location: (venueForm.location || "").trim(),
      notes: (venueForm.notes || "").trim(),
      latitude: venueForm.latitude,
      longitude: venueForm.longitude,
    };
    setFormNotice(null);
    if (venueForm.id) {
      setEventVenues((prev) =>
        prev.map((venue) =>
          venue.id === venueForm.id ? { ...venue, ...payload } : venue,
        ),
      );
    } else {
      setEventVenues((prev) => [
        ...prev,
        { ...payload, id: createId() },
      ]);
    }
    setVenueForm(INITIAL_VENUE_FORM);
  };

  const handleVenueEdit = (targetId) => {
    const target = eventVenues.find((venue) => venue.id === targetId);
    if (!target) {
      return;
    }
    setVenueMode("create");
    setVenueForm({
      id: target.id,
      venueId: target.venueId || "",
      name: target.name || "",
      location: target.location || "",
      notes: target.notes || "",
      latitude: target.latitude ?? "",
      longitude: target.longitude ?? "",
    });
  };

  const handleVenueRemove = (targetId) => {
    setEventVenues((prev) => prev.filter((venue) => venue.id !== targetId));
    if (venueForm.id === targetId) {
      setVenueForm(INITIAL_VENUE_FORM);
    }
    if (matchForm.venueRefId === targetId) {
      setMatchForm((prev) => ({ ...prev, venueRefId: "" }));
    }
    setDivisions((prev) => {
      let changed = false;
      const next = prev.map((division) => ({
        ...division,
        pools: (division.pools || []).map((pool) => ({
          ...pool,
          matches: (pool.matches || []).map((match) => {
            if (match.venueRefId !== targetId) {
              return match;
            }
            changed = true;
            return { ...match, venueRefId: "", venueLabel: "" };
          }),
        })),
      }));
      return changed ? next : prev;
    });
  };

  const handleVenueCancelEdit = () => {
    setVenueForm(INITIAL_VENUE_FORM);
  };

  const setRuleValue = (path, value) => {
    setRules((prev) => {
      const next = { ...prev };
      let node = next;
      for (let i = 0; i < path.length - 1; i += 1) {
        const key = path[i];
        node[key] = { ...node[key] };
        node = node[key];
      }
      node[path[path.length - 1]] = value;
      return next;
    });
  };

  const handleRuleNumberInput = (path) => (event) => {
    const raw = event.target.value;
    if (raw === "") {
      setRuleValue(path, null);
      return;
    }
    const parsed = Number(raw);
    setRuleValue(path, Number.isNaN(parsed) ? null : parsed);
  };

  const handleRuleBooleanInput = (path) => (event) => {
    setRuleValue(path, event.target.value === "true");
  };

  const resolveTeamSelection = (value) => {
    const input = (value || "").trim();
    if (!input) {
      return null;
    }
    const normalized = input.toLowerCase();
    return (
      teamOptions.find((team) => {
        if (!team) return false;
        if (team.id === input) return true;
        if (team.name?.toLowerCase() === normalized) return true;
        if (team.short_name && team.short_name.toLowerCase() === normalized)
          return true;
        if (formatTeamOptionLabel(team).toLowerCase() === normalized)
          return true;
        return false;
      }) || null
    );
  };

  const updateEvent = (event) => {
    const { name, value } = event.target;
    setEvent((prev) => ({ ...prev, [name]: value }));
  };

  const upsertDivision = (payload) => {
    if (payload.id) {
      setDivisions((prev) =>
        prev.map((division) =>
          division.id === payload.id
            ? {
                ...division,
                name: payload.name,
                level: payload.level,
              }
            : division,
        ),
      );
      return payload.id;
    }
    const id = createId();
    setDivisions((prev) => [
      ...prev,
      {
        id,
        name: payload.name,
        level: payload.level,
        pools: [],
        divisionTeams: [],
      },
    ]);
    return id;
  };

  const upsertPool = (divisionId, payload) => {
    setDivisions((prev) =>
      prev.map((division) => {
        if (division.id !== divisionId) return division;
        const pools = division.pools || [];
        if (payload.id) {
          return {
            ...division,
            pools: pools.map((pool) =>
              pool.id === payload.id ? { ...pool, name: payload.name } : pool,
            ),
          };
        }
        return {
          ...division,
          pools: [
            ...pools,
            { id: createId(), name: payload.name, teams: [], matches: [] },
          ],
        };
      }),
    );
  };

  const upsertPoolEntity = (poolId, updater) => {
    setDivisions((prev) =>
      prev.map((division) => ({
        ...division,
        pools: (division.pools || []).map((pool) =>
          pool.id === poolId ? updater(pool) : pool,
        ),
      })),
    );
  };

  const removePool = (poolId) => {
    setDivisions((prev) =>
      prev.map((division) => ({
        ...division,
        pools: (division.pools || []).filter((pool) => pool.id !== poolId),
      })),
    );
    setPoolForm((prev) =>
      prev.id === poolId
        ? { id: null, divisionId: prev.divisionId, name: "" }
        : prev,
    );
    setTeamForm((prev) =>
      prev.poolId === poolId
        ? { id: null, poolId: "", name: "", seed: "" }
        : prev,
    );
    setMatchForm((prev) =>
      prev.poolId === poolId
        ? {
            id: null,
            poolId: "",
            matchPoolId: "",
            teamA: "",
            teamAId: "",
            teamB: "",
            teamBId: "",
            start: "",
            status: "scheduled",
            venueRefId: "",
          }
        : prev,
    );
  };

  const handleDivisionSubmit = (event) => {
    event.preventDefault();
    const trimmed = divisionForm.name.trim();
    if (!trimmed) return;
    const id = upsertDivision({ ...divisionForm, name: trimmed });
    setDivisionForm({ id: null, name: "", level: "" });
    setPoolForm((prev) => ({ ...prev, divisionId: id }));
    setDivisionTeamForm((prev) => ({ ...prev, divisionId: id }));
  };

  const handlePoolSubmit = (event) => {
    event.preventDefault();
    const divisionId = poolForm.divisionId || activeDivision?.id;
    const name = poolForm.name.trim();
    if (!divisionId || !name) return;
    upsertPool(divisionId, poolForm.id ? poolForm : { name });
    setPoolForm({ id: null, divisionId, name: "" });
  };

  const handleDivisionTeamSubmit = (event) => {
    event.preventDefault();
    const divisionId = divisionTeamForm.divisionId || divisions[0]?.id;
    const name = divisionTeamForm.name.trim();
    if (!divisionId || !name) return;
    const selected = resolveTeamSelection(name);
    if (!selected) {
      setFormNotice({
        type: "error",
        message: "Select a valid team from the teams directory.",
      });
      return;
    }
    const divisionEntry =
      divisions.find((division) => division.id === divisionId) || null;
    const existingTeams = divisionEntry?.divisionTeams || [];
    if (existingTeams.some((team) => team.teamId === selected.id)) {
      setFormNotice({
        type: "error",
        message: "That team is already assigned to this division.",
      });
      return;
    }
    setFormNotice(null);
    setDivisions((prev) =>
      prev.map((division) => {
        if (division.id !== divisionId) {
          return division;
        }
        const nextTeams = [
          ...(division.divisionTeams || []),
          {
            id: createId(),
            teamId: selected.id,
            name: selected.name,
            shortName: selected.short_name || null,
            displayLabel: formatTeamOptionLabel(selected),
          },
        ];
        return { ...division, divisionTeams: nextTeams };
      }),
    );
    setDivisionTeamForm((prev) => ({ ...prev, divisionId, name: "" }));
  };

  const removeDivisionTeam = (divisionId, entryId, teamId) => {
    setDivisions((prev) =>
      prev.map((division) => {
        if (division.id !== divisionId) {
          return division;
        }
        return {
          ...division,
          divisionTeams: (division.divisionTeams || []).filter(
            (team) => team.id !== entryId,
          ),
          pools: (division.pools || []).map((pool) => ({
            ...pool,
            teams: (pool.teams || []).filter(
              (team) => team.teamId !== teamId,
            ),
            matches: (pool.matches || []).filter(
              (match) =>
                match.teamAId !== teamId && match.teamBId !== teamId,
            ),
          })),
        };
      }),
    );
  };

  const handleTeamSubmit = (event) => {
    event.preventDefault();
    const name = teamForm.name.trim();
    const poolId = teamForm.poolId || activePool?.id;
    if (!poolId || !name) return;
    const selected = resolveTeamSelection(name);
    if (!selected) {
      setFormNotice({
        type: "error",
        message: "Select a valid team from the teams directory.",
      });
      return;
    }
    const divisionForPool = poolDivisionMap.get(poolId);
    if (!divisionForPool) {
      setFormNotice({
        type: "error",
        message: "Assign this pool to a division with teams before adding entries.",
      });
      return;
    }
    const divisionTeams = divisionForPool.divisionTeams || [];
    if (!divisionTeams.some((team) => team.teamId === selected.id)) {
      setFormNotice({
        type: "error",
        message: "Only teams assigned to this division can be added to its pools.",
      });
      return;
    }
    setFormNotice(null);
    upsertPoolEntity(poolId, (pool) => {
      const teams = pool.teams || [];
      if (teamForm.id) {
        return {
          ...pool,
          teams: teams.map((team) =>
            team.id === teamForm.id
              ? {
                  ...team,
                  name: selected.name,
                  shortName: selected.short_name || null,
                  teamId: selected.id,
                  displayLabel: formatTeamOptionLabel(selected),
                  seed: teamForm.seed,
                }
              : team,
          ),
        };
      }
      return {
        ...pool,
        teams: [
          ...teams,
          {
            id: createId(),
            name: selected.name,
            shortName: selected.short_name || null,
            teamId: selected.id,
            displayLabel: formatTeamOptionLabel(selected),
            seed: teamForm.seed,
          },
        ],
      };
    });
    setTeamForm({ id: null, poolId, teamId: "", name: "", seed: "" });
  };

  const handleMatchSubmit = (event) => {
    event.preventDefault();
    const poolId =
      matchForm.matchPoolId ||
      matchForm.poolId ||
      teamForm.poolId ||
      activePool?.id;
    const teamA = matchForm.teamA.trim();
    const teamB = matchForm.teamB.trim();
    if (!poolId || !teamA || !teamB) return;
    const teamASelection = resolveTeamSelection(teamA);
    const teamBSelection = resolveTeamSelection(teamB);
    if (!teamASelection || !teamBSelection) {
      setFormNotice({
        type: "error",
        message: "Team A and Team B must be selected from the teams directory.",
      });
      return;
    }
    const divisionForPool = poolDivisionMap.get(poolId);
    if (!divisionForPool) {
      setFormNotice({
        type: "error",
        message: "Assign this pool to a division with teams before scheduling matches.",
      });
      return;
    }
    const divisionTeams = divisionForPool.divisionTeams || [];
    const belongsToDivision = (teamId) =>
      divisionTeams.some((team) => team.teamId === teamId);
    if (
      !belongsToDivision(teamASelection.id) ||
      !belongsToDivision(teamBSelection.id)
    ) {
      setFormNotice({
        type: "error",
        message:
          "Matches can only include teams that are assigned to the pool's division.",
      });
      return;
    }
    const selectedVenue =
      eventVenues.find((venue) => venue.id === matchForm.venueRefId) || null;
    setFormNotice(null);
    upsertPoolEntity(poolId, (pool) => {
      const matches = pool.matches || [];
      const next = {
        id: matchForm.id || createId(),
        teamA: teamASelection.name,
        teamAId: teamASelection.id,
        teamB: teamBSelection.name,
        teamBId: teamBSelection.id,
        start: matchForm.start,
        status: matchForm.status,
        teamALabel: formatTeamOptionLabel(teamASelection),
        teamBLabel: formatTeamOptionLabel(teamBSelection),
        venueRefId: selectedVenue?.id || "",
        venueLabel: selectedVenue ? formatVenueOptionLabel(selectedVenue) : "",
      };
      if (matchForm.id) {
        return {
          ...pool,
          matches: matches.map((match) =>
            match.id === matchForm.id ? next : match,
          ),
        };
      }
      return { ...pool, matches: [...matches, next] };
    });
    setMatchForm({
      id: null,
      poolId,
      matchPoolId: poolId,
      teamA: "",
      teamAId: "",
      teamB: "",
      teamBId: "",
      start: "",
      status: "scheduled",
      venueRefId: "",
    });
  };

  useEffect(() => {
    let ignore = false;
    async function loadTeams() {
      setTeamOptionsLoading(true);
      setTeamOptionsError(null);
      try {
        const rows = await getAllTeams(500);
        if (!ignore) {
          setTeamOptions(rows || []);
        }
      } catch (err) {
        if (!ignore) {
          setTeamOptionsError(err.message || "Unable to load teams directory.");
        }
      } finally {
        if (!ignore) {
          setTeamOptionsLoading(false);
        }
      }
    }
    loadTeams();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadVenues() {
      setAvailableVenuesLoading(true);
      setAvailableVenuesError(null);
      try {
        const rows = await listAvailableVenues(500);
        if (!ignore) {
          setAvailableVenues(rows || []);
        }
      } catch (err) {
        if (!ignore) {
          setAvailableVenuesError(
            err?.message || "Unable to load venues directory.",
          );
        }
      } finally {
        if (!ignore) {
          setAvailableVenuesLoading(false);
        }
      }
    }
    loadVenues();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    setFormNotice(null);
  }, [step]);

  useEffect(() => {
    if (divisions.length === 0) {
      if (divisionTeamForm.divisionId) {
        setDivisionTeamForm((prev) => ({ ...prev, divisionId: "" }));
      }
      return;
    }
    const exists = divisions.some(
      (division) => division.id === divisionTeamForm.divisionId,
    );
    if (!exists) {
      setDivisionTeamForm((prev) => ({ ...prev, divisionId: divisions[0].id }));
    }
  }, [divisions, divisionTeamForm.divisionId]);

  useEffect(() => {
    if (venueMode === "create") {
      setSelectedExistingVenueId("");
    } else if (venueMode === "existing") {
      setVenueForm(INITIAL_VENUE_FORM);
    }
  }, [venueMode]);

  useEffect(() => {
    setDivisions((prev) => {
      if (!prev.length) {
        return prev;
      }
      const lookup = new Map();
      eventVenues.forEach((venue) => {
        if (venue.id) {
          lookup.set(venue.id, venue);
        }
        if (venue.venueId) {
          lookup.set(venue.venueId, venue);
        }
      });
      let changed = false;
      const next = prev.map((division) => ({
        ...division,
        pools: (division.pools || []).map((pool) => ({
          ...pool,
          matches: (pool.matches || []).map((match) => {
            if (!match.venueRefId) {
              if (match.venueLabel) {
                changed = true;
                return { ...match, venueLabel: "" };
              }
              return match;
            }
            const venue = lookup.get(match.venueRefId);
            const nextLabel = venue
              ? formatVenueOptionLabel(venue)
              : "";
            if (match.venueLabel === nextLabel) {
              return match;
            }
            changed = true;
            return { ...match, venueLabel: nextLabel };
          }),
        })),
      }));
      return changed ? next : prev;
    });
  }, [eventVenues]);

  const summary = useMemo(() => {
    const poolCount = divisions.reduce(
      (total, division) => total + (division.pools?.length || 0),
      0,
    );
    const teamCount = divisions.reduce(
      (total, division) =>
        total +
        (division.pools || []).reduce(
          (bucket, pool) => bucket + (pool.teams?.length || 0),
          0,
        ),
      0,
    );
    const matchCount = divisions.reduce(
      (total, division) =>
        total +
        (division.pools || []).reduce(
          (bucket, pool) => bucket + (pool.matches?.length || 0),
          0,
        ),
      0,
    );
    const eventVenueCount = eventVenues.length;
    return { poolCount, teamCount, matchCount, eventVenueCount };
  }, [divisions, eventVenues]);

  const derivedSubmissionCounts = useMemo(() => {
    let validTeams = 0;
    let validMatches = 0;
    divisions.forEach((division) => {
      (division.pools || []).forEach((pool) => {
        (pool.teams || []).forEach((team) => {
          if (team?.teamId) {
            validTeams += 1;
          }
        });
        (pool.matches || []).forEach((match) => {
          if (match?.teamAId && match?.teamBId) {
            validMatches += 1;
          }
        });
      });
    });
    return { validTeams, validMatches };
  }, [divisions]);

  const isSubmissionReady = useMemo(() => {
    const hasEventBasics = Boolean(event.name && event.name.trim());
    const hasDivisions = divisions.length > 0;
    const hasPools = divisions.some(
      (division) => (division.pools || []).length > 0,
    );
    const hasValidTeams = derivedSubmissionCounts.validTeams > 0;
    const hasSelectedEvent =
      eventMode === "edit" ? Boolean(selectedEventId) : true;
    return (
      hasEventBasics && hasDivisions && hasPools && hasValidTeams && hasSelectedEvent
    );
  }, [event.name, divisions, derivedSubmissionCounts, eventMode, selectedEventId]);

  const isEditingExistingEvent = eventMode === "edit" && Boolean(selectedEventId);

  const renderEventStep = () => {
    const eventFieldsDisabled = eventMode === "edit" && !selectedEventId;
    return (
      <div className="space-y-4">
      <Panel variant="tinted" className="space-y-3 p-4">
        <SectionHeader eyebrow="Mode" title="Create or edit" />
        <div className="grid gap-3 md:grid-cols-2">
          {[
            {
              key: "create",
              title: "Create new event",
              description: "Start from a blank canvas.",
            },
            {
              key: "edit",
              title: "Edit existing event",
              description: "Load an event to revise structure.",
            },
          ].map((option) => {
            const isSelected = eventMode === option.key;
            return (
              <label
                key={option.key}
                className={`cursor-pointer rounded border p-3 text-sm ${
                  isSelected ? "border-accent bg-accent/10" : "border-border"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="event-mode"
                    value={option.key}
                    checked={isSelected}
                    onChange={() => handleModeChange(option.key)}
                  />
                  <div>
                    <p className="font-semibold text-ink">{option.title}</p>
                    <p className="text-xs text-ink-muted">
                      {option.description}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        {eventMode === "edit" && (
          <div className="space-y-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                Existing event
              </span>
              <select
                className="w-full rounded border border-border bg-white px-3 py-2 text-black"
                value={selectedEventId}
                onChange={handleExistingEventSelection}
                disabled={existingEventsLoading}
              >
                <option value="">Select an event</option>
                {existingEvents.map((existing) => (
                  <option key={existing.id} value={existing.id}>
                    {existing.name}{" "}
                    {existing.start_date
                      ? `(${existing.start_date})`
                      : "(No start date)"}
                  </option>
                ))}
              </select>
            </label>
            {existingEventsLoading && (
              <p className="text-xs text-ink-muted">Loading events...</p>
            )}
            {existingEventsError && (
              <div className="sc-alert is-error text-xs">
                {existingEventsError}
              </div>
            )}
            {prefillState.status === "loading" && (
              <p className="text-xs text-ink-muted">
                Loading event hierarchy...
              </p>
            )}
            {prefillState.status === "error" && prefillState.error && (
              <div className="sc-alert is-error text-xs">
                {prefillState.error}
              </div>
            )}
          </div>
        )}
      </Panel>
      <Panel variant="muted" className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-2">
        {Object.keys(INITIAL_EVENT)
          .filter((key) => key !== "notes")
          .map((key) => (
            <TextField
              key={key}
              label={key.replace(/_/g, " ")}
              name={key}
              type={key.includes("date") ? "date" : "text"}
              value={event[key]}
              onChange={updateEvent}
              placeholder={key === "name" ? "Event title" : undefined}
              disabled={eventFieldsDisabled}
            />
          ))}
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-xs uppercase tracking-wide text-ink-muted">
            Notes
          </span>
          <textarea
            name="notes"
            value={event.notes}
            onChange={updateEvent}
            className="min-h-[120px] w-full rounded border border-border bg-white px-3 py-2 text-black"
            disabled={eventFieldsDisabled}
          />
        </label>
        </div>
      </Panel>
      <Panel variant="muted" className="space-y-4 p-4">
        <SectionHeader
          eyebrow="Venues"
          title="Event venues"
          description="Define the locations this event will use."
        />
        <div className="grid gap-2 md:grid-cols-2">
          {[
            {
              key: "create",
              title: "Create new venue",
              description: "Capture a new location record.",
            },
            {
              key: "existing",
              title: "Assign existing venue",
              description: "Link one of the saved venues.",
            },
          ].map((option) => {
            const isSelected = venueMode === option.key;
            return (
              <label
                key={option.key}
                className={`cursor-pointer rounded border p-3 text-sm ${isSelected ? "border-accent bg-accent/10" : "border-border"}`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="venue-mode"
                    value={option.key}
                    checked={isSelected}
                    onChange={() => setVenueMode(option.key)}
                  />
                  <div>
                    <p className="font-semibold text-ink">{option.title}</p>
                    <p className="text-xs text-ink-muted">
                      {option.description}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        {venueMode === "existing" ? (
          <form className="space-y-3" onSubmit={handleAssignExistingVenue}>
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                Saved venue
              </span>
              <select
                className="w-full rounded border border-border bg-white px-3 py-2 text-black"
                value={selectedExistingVenueId}
                onChange={(event) =>
                  setSelectedExistingVenueId(event.target.value)
                }
                disabled={availableVenuesLoading || eventFieldsDisabled}
              >
                <option value="">Select a venue</option>
                {availableVenueOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {availableVenuesLoading && (
              <p className="text-xs text-ink-muted">Loading venues...</p>
            )}
            {availableVenuesError && (
              <div className="sc-alert is-error text-xs">
                {availableVenuesError}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="sc-button"
                disabled={
                  eventFieldsDisabled ||
                  !selectedExistingVenueId ||
                  availableVenuesLoading
                }
              >
                Assign venue
              </button>
            </div>
          </form>
        ) : (
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleVenueSubmit}>
            <TextField
              label="Name"
              name="name"
              value={venueForm.name}
              onChange={handleVenueFieldChange}
              placeholder="Main field"
              disabled={eventFieldsDisabled}
            />
            <TextField
              label="Location"
              name="location"
              value={venueForm.location}
              onChange={handleVenueFieldChange}
              placeholder="City, site, or complex"
              disabled={eventFieldsDisabled}
            />
            <TextField
              label="Latitude"
              name="latitude"
              type="number"
              step="any"
              value={venueForm.latitude}
              onChange={handleVenueFieldChange}
              disabled={eventFieldsDisabled}
            />
            <TextField
              label="Longitude"
              name="longitude"
              type="number"
              step="any"
              value={venueForm.longitude}
              onChange={handleVenueFieldChange}
              disabled={eventFieldsDisabled}
            />
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                Notes
              </span>
              <textarea
                name="notes"
                value={venueForm.notes}
                onChange={handleVenueFieldChange}
                className="min-h-[80px] w-full rounded border border-border bg-white px-3 py-2 text-black"
                placeholder="Surface, access instructions, etc."
                disabled={eventFieldsDisabled}
              />
            </label>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <button
                type="submit"
                className="sc-button"
                disabled={eventFieldsDisabled || !venueForm.name.trim()}
              >
                {venueForm.id ? "Save venue" : "Add venue"}
              </button>
              {venueForm.id && (
                <button
                  type="button"
                  className="sc-button is-ghost"
                  onClick={handleVenueCancelEdit}
                  disabled={eventFieldsDisabled}
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        )}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-ink-muted">
            <span className="font-semibold text-ink">Defined venues</span>
            <Chip>{eventVenues.length}</Chip>
          </div>
          {eventVenues.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Add at least one venue to capture playing locations.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {eventVenues.map((venue) => (
                <div
                  key={venue.id}
                  className="rounded border border-border p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-ink">
                      {formatVenueOptionLabel(venue)}
                    </p>
                    {venue.venueId && (
                      <span className="text-[11px] uppercase tracking-wide text-ink-muted">
                        Existing
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-ink-muted">
                    {(venue.latitude || venue.longitude) && (
                      <p>
                        Coords: {venue.latitude || "?"},{" "}
                        {venue.longitude || "?"}
                      </p>
                    )}
                    {venue.notes && <p className="line-clamp-3">{venue.notes}</p>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="sc-button is-ghost"
                      onClick={() => handleVenueEdit(venue.id)}
                      disabled={eventFieldsDisabled}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="sc-button is-destructive"
                      onClick={() => handleVenueRemove(venue.id)}
                      disabled={eventFieldsDisabled}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>
      <Panel variant="muted" className="space-y-4 p-4">
        <SectionHeader eyebrow="Rules" title="Game configuration" />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Division
            </span>
            <span className="block text-[11px] text-ink-muted italic leading-tight">
              Sets the roster category competing in this event.
            </span>
            <select
              className="w-full rounded border border-border bg-white px-3 py-2 text-black"
              value={rules.division}
              onChange={(event) =>
                setRuleValue(["division"], event.target.value)
              }
            >
              <option value="mixed">Mixed</option>
              <option value="open">Open</option>
              <option value="women">Women</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Format
            </span>
            <span className="block text-[11px] text-ink-muted italic leading-tight">
              Chooses the overarching tournament ruleset template.
            </span>
            <select
              className="w-full rounded border border-border bg-white px-3 py-2 text-black"
              value={rules.format}
              onChange={(event) =>
                setRuleValue(["format"], event.target.value)
              }
            >
              <option value="wfdfChampionship">WFDF Championship</option>
              <option value="localSimple">Local Simple</option>
            </select>
          </label>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Game
          </p>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                Point target
              </span>
              <span className="block text-[11px] text-ink-muted italic leading-tight">
                Winning score before any caps are applied.
              </span>
              <input
                type="number"
                className="w-full rounded border border-border px-3 py-2 text-black"
                value={rules.game.pointTarget ?? ""}
                onChange={handleRuleNumberInput(["game", "pointTarget"])}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                Soft cap (min)
              </span>
              <span className="block text-[11px] text-ink-muted italic leading-tight">
                Game clock minute when soft cap checks in.
              </span>
              <input
                type="number"
                className="w-full rounded border border-border px-3 py-2 text-black"
                value={rules.game.softCapMinutes ?? ""}
                onChange={handleRuleNumberInput(["game", "softCapMinutes"])}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                Soft cap mode
              </span>
              <span className="block text-[11px] text-ink-muted italic leading-tight">
                Adjusts scoring once the soft cap hits.
              </span>
              <select
                className="w-full rounded border border-border bg-white px-3 py-2 text-black"
                value={rules.game.softCapMode}
                onChange={(event) =>
                  setRuleValue(["game", "softCapMode"], event.target.value)
                }
              >
                <option value="addOneToHighest">Add one to highest</option>
                <option value="addTwoToHighest">Add two to highest</option>
                <option value="none">None</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                Hard cap (min)
              </span>
              <span className="block text-[11px] text-ink-muted italic leading-tight">
                Absolute game time limit.
              </span>
              <input
                type="number"
                className="w-full rounded border border-border px-3 py-2 text-black"
                value={rules.game.hardCapMinutes ?? ""}
                onChange={handleRuleNumberInput(["game", "hardCapMinutes"])}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                Hard cap end mode
              </span>
              <span className="block text-[11px] text-ink-muted italic leading-tight">
                Defines how play stops when the hard cap arrives.
              </span>
              <select
                className="w-full rounded border border-border bg-white px-3 py-2 text-black"
                value={rules.game.hardCapEndMode}
                onChange={(event) =>
                  setRuleValue(["game", "hardCapEndMode"], event.target.value)
                }
              >
                <option value="afterPoint">After point</option>
                <option value="immediate">Immediate</option>
              </select>
            </label>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Half
          </p>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                Point target
              </span>
              <span className="block text-[11px] text-ink-muted italic leading-tight">
                Points needed to reach halftime.
              </span>
              <input
                type="number"
                className="w-full rounded border border-border px-3 py-2 text-black"
                value={rules.half.pointTarget ?? ""}
                onChange={handleRuleNumberInput(["half", "pointTarget"])}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                Time cap (min)
              </span>
              <span className="block text-[11px] text-ink-muted italic leading-tight">
                Minutes allowed before the half time cap.
              </span>
              <input
                type="number"
                className="w-full rounded border border-border px-3 py-2 text-black"
                value={rules.half.timeCapMinutes ?? ""}
                onChange={handleRuleNumberInput(["half", "timeCapMinutes"])}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                Break (min)
              </span>
              <span className="block text-[11px] text-ink-muted italic leading-tight">
                Length of the halftime break.
              </span>
              <input
                type="number"
                className="w-full rounded border border-border px-3 py-2 text-black"
                value={rules.half.breakMinutes ?? ""}
                onChange={handleRuleNumberInput(["half", "breakMinutes"])}
              />
            </label>
          </div>
        </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-wide text-ink-muted">
            Running clock
          </span>
          <span className="block text-[11px] text-ink-muted italic leading-tight">
            Controls whether the clock pauses between points.
          </span>
          <select
            className="w-full rounded border border-border bg-white px-3 py-2 text-black"
            value={rules.clock.isRunningClockEnabled ? "true" : "false"}
            onChange={handleRuleBooleanInput(["clock", "isRunningClockEnabled"])}
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-wide text-ink-muted">
            Inter-point timeouts stack
          </span>
          <span className="block text-[11px] text-ink-muted italic leading-tight">
            Allow unused inter-point timeouts to accumulate.
          </span>
          <select
            className="w-full rounded border border-border bg-white px-3 py-2 text-black"
            value={rules.interPoint.areTimeoutsStacked ? "true" : "false"}
            onChange={handleRuleBooleanInput([
              "interPoint",
              "areTimeoutsStacked",
            ])}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Inter-point timing
        </p>
        <div className="mt-2 grid gap-3 md:grid-cols-4">
          {[
            ["Offence on line", ["interPoint", "offenceOnLineSeconds"]],
            ["Offence ready", ["interPoint", "offenceReadySeconds"]],
            ["Pull deadline", ["interPoint", "pullDeadlineSeconds"]],
            ["Timeout adds", ["interPoint", "timeoutAddsSeconds"]],
          ].map(([label, path]) => (
            <label key={label} className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                {label} (s)
              </span>
              <span className="block text-[11px] text-ink-muted italic leading-tight">
                {label === "Offence on line"
                  ? "Seconds offence has to reach the line."
                  : label === "Offence ready"
                    ? "Seconds offence gets to signal ready."
                    : label === "Pull deadline"
                      ? "Deadline for the pull after lining up."
                      : "Extra time granted after a timeout."}
              </span>
              <input
                type="number"
                className="w-full rounded border border-border px-3 py-2 text-black"
                value={path.reduce((acc, key) => acc[key], rules) ?? ""}
                onChange={handleRuleNumberInput(path)}
              />
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Timeouts & in-point timeouts
        </p>
        <div className="mt-2 grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Timeouts per team
            </span>
            <span className="block text-[11px] text-ink-muted italic leading-tight">
              Total timeouts each team gets per game.
            </span>
            <input
              type="number"
              className="w-full rounded border border-border px-3 py-2 text-black"
              value={rules.timeouts.perTeamPerGame ?? ""}
              onChange={handleRuleNumberInput(["timeouts", "perTeamPerGame"])}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Timeout duration (s)
            </span>
            <span className="block text-[11px] text-ink-muted italic leading-tight">
              Seconds each timeout lasts.
            </span>
            <input
              type="number"
              className="w-full rounded border border-border px-3 py-2 text-black"
              value={rules.timeouts.durationSeconds ?? ""}
              onChange={handleRuleNumberInput(["timeouts", "durationSeconds"])}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              In-point offence set (s)
            </span>
            <span className="block text-[11px] text-ink-muted italic leading-tight">
              Seconds offence has to reset after an in-point timeout.
            </span>
            <input
              type="number"
              className="w-full rounded border border-border px-3 py-2 text-black"
              value={rules.inPointTimeout.offenceSetSeconds ?? ""}
              onChange={handleRuleNumberInput([
                "inPointTimeout",
                "offenceSetSeconds",
              ])}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Defence check max (s)
            </span>
            <span className="block text-[11px] text-ink-muted italic leading-tight">
              Maximum time defence can take to check the disc in.
            </span>
            <input
              type="number"
              className="w-full rounded border border-border px-3 py-2 text-black"
              value={rules.inPointTimeout.defenceCheckMaxSeconds ?? ""}
              onChange={handleRuleNumberInput([
                "inPointTimeout",
                "defenceCheckMaxSeconds",
              ])}
            />
          </label>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Discussions
        </p>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          {[
            ["Captain intervention", ["discussions", "captainInterventionSeconds"]],
            ["Auto contest", ["discussions", "autoContestSeconds"]],
            ["Restart play max", ["discussions", "restartPlayMaxSeconds"]],
          ].map(([label, path]) => (
            <label key={label} className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                {label} (s)
              </span>
              <span className="block text-[11px] text-ink-muted italic leading-tight">
                {label === "Captain intervention"
                  ? "Delay before captains intervene in disputes."
                  : label === "Auto contest"
                    ? "How long before an unresolved call auto-contests."
                    : "Deadline to restart play after discussions."}
              </span>
              <input
                type="number"
                className="w-full rounded border border-border px-3 py-2 text-black"
                value={path.reduce((acc, key) => acc[key], rules) ?? ""}
                onChange={handleRuleNumberInput(path)}
              />
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Disc in play
        </p>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          {[
            [
              "Pivot central zone",
              ["discInPlay", "pivotCentralZoneMaxSeconds"],
            ],
            ["Pivot end zone", ["discInPlay", "pivotEndZoneMaxSeconds"]],
            [
              "New disc retrieval",
              ["discInPlay", "newDiscRetrievalMaxSeconds"],
            ],
          ].map(([label, path]) => (
            <label key={label} className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                {label} (s)
              </span>
              <span className="block text-[11px] text-ink-muted italic leading-tight">
                {label === "Pivot central zone"
                  ? "Maximal stall time for a pivot in the central zone."
                  : label === "Pivot end zone"
                    ? "Maximal stall time for a pivot inside the end zone."
                    : "Seconds allowed to fetch a replacement disc."}
              </span>
              <input
                type="number"
                className="w-full rounded border border-border px-3 py-2 text-black"
                value={path.reduce((acc, key) => acc[key], rules) ?? ""}
                onChange={handleRuleNumberInput(path)}
              />
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Mixed ratio
        </p>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Mixed ratio enabled
            </span>
            <span className="block text-[11px] text-ink-muted italic leading-tight">
              Toggles gender-ratio tracking for mixed play.
            </span>
            <select
              className="w-full rounded border border-border bg-white px-3 py-2 text-black"
              value={rules.mixedRatio.isEnabled ? "true" : "false"}
              onChange={handleRuleBooleanInput(["mixedRatio", "isEnabled"])}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Ratio rule
            </span>
            <span className="block text-[11px] text-ink-muted italic leading-tight">
              Selects the WFDF-style ratio application rule.
            </span>
            <select
              className="w-full rounded border border-border bg-white px-3 py-2 text-black"
              value={rules.mixedRatio.ratioRule || ""}
              onChange={(event) =>
                setRuleValue(
                  ["mixedRatio", "ratioRule"],
                  event.target.value || null,
                )
              }
            >
              <option value="">Not set</option>
              <option value="A">Rule A</option>
              <option value="B">Rule B</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Initial chooser
            </span>
            <span className="block text-[11px] text-ink-muted italic leading-tight">
              Determines the team that sets the first ratio.
            </span>
            <select
              className="w-full rounded border border-border bg-white px-3 py-2 text-black"
              value={rules.mixedRatio.initialRatioChoosingTeam || ""}
              onChange={(event) =>
                setRuleValue(
                  ["mixedRatio", "initialRatioChoosingTeam"],
                  event.target.value || null,
                )
              }
            >
              <option value="">Not set</option>
              <option value="home">Home</option>
              <option value="away">Away</option>
            </select>
          </label>
        </div>
      </div>
      </Panel>
      </div>
    );
  };

  const renderDivisionsStep = () => {
    const manageDivisionId =
      divisionTeamForm.divisionId || divisions[0]?.id || "";
    const manageDivision =
      divisions.find((division) => division.id === manageDivisionId) || null;
    return (
    <div className="grid gap-6 md:grid-cols-[320px,1fr]">
      <Panel variant="muted" className="space-y-3 p-4">
        <SectionHeader eyebrow="Divisions" title="Add or edit" />
        <form className="space-y-3" onSubmit={handleDivisionSubmit}>
          <TextField
            label="Name"
            value={divisionForm.name}
            onChange={(event) =>
              setDivisionForm((prev) => ({ ...prev, name: event.target.value }))
            }
          />
          <TextField
            label="Level"
            value={divisionForm.level}
            onChange={(event) =>
              setDivisionForm((prev) => ({
                ...prev,
                level: event.target.value,
              }))
            }
          />
          <button type="submit" className="sc-button w-full">
            {divisionForm.id ? "Save" : "Add division"}
          </button>
        </form>
      </Panel>
      <div className="space-y-3">
        {divisions.length === 0 ? (
          <Panel variant="muted" className="p-4 text-sm text-ink-muted">
            No divisions yet.
          </Panel>
        ) : (
          divisions.map((division) => (
            <Panel
              key={division.id}
              variant="tinted"
              className="flex items-center justify-between p-4"
            >
              <div>
                <p className="font-semibold">{division.name}</p>
                <p className="text-xs text-ink-muted">
                  Level {division.level || "N/A"} / Pools{" "}
                  {division.pools?.length || 0} / Division teams{" "}
                  {division.divisionTeams?.length || 0}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="sc-button is-ghost"
                  onClick={() =>
                    setDivisionForm({
                      id: division.id,
                      name: division.name,
                      level: division.level || "",
                    })
                  }
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="sc-button is-destructive"
                  onClick={() =>
                    setDivisions((prev) =>
                      prev.filter((entry) => entry.id !== division.id),
                    )
                  }
                >
                  Delete
                </button>
              </div>
            </Panel>
          ))
        )}
        {divisions.length > 0 && (
          <Panel variant="muted" className="space-y-3 p-4">
            <SectionHeader eyebrow="Division teams" title="Assign rosters" />
            <form className="space-y-3" onSubmit={handleDivisionTeamSubmit}>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-wide text-ink-muted">
                  Division
                </span>
                <select
                  className="w-full rounded border border-border bg-white px-3 py-2 text-black"
                  value={manageDivisionId}
                  onChange={(event) =>
                    setDivisionTeamForm((prev) => ({
                      ...prev,
                      divisionId: event.target.value,
                    }))
                  }
                >
                  {divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name}
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                label="Team"
                value={divisionTeamForm.name}
                onChange={(event) =>
                  setDivisionTeamForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                list="team-options-list"
                autoComplete="off"
                placeholder="Search all teams..."
              />
              <button type="submit" className="sc-button w-full">
                Add team to division
              </button>
            </form>
            {!manageDivision || (manageDivision.divisionTeams || []).length === 0 ? (
              <p className="text-xs text-ink-muted">
                No teams assigned to {manageDivision?.name || "this division"}.
              </p>
            ) : (
              <div className="space-y-2">
                {(manageDivision.divisionTeams || []).map((team) => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm"
                  >
                    <span>{team.displayLabel || team.name}</span>
                    <button
                      type="button"
                      className="sc-button is-destructive"
                      onClick={() =>
                        removeDivisionTeam(
                          manageDivision.id,
                          team.id,
                          team.teamId,
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
};

  const renderPoolsStep = () => (
    <div className="grid gap-6 md:grid-cols-[320px,1fr]">
      <Panel variant="muted" className="space-y-3 p-4">
        <SectionHeader eyebrow="Pools" title="Within division" />
        <form className="space-y-3" onSubmit={handlePoolSubmit}>
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Division
            </span>
            <select
              className="w-full rounded border border-border bg-white px-3 py-2 text-black"
              value={poolForm.divisionId || activeDivision?.id || ""}
              onChange={(event) =>
                setPoolForm((prev) => ({
                  ...prev,
                  divisionId: event.target.value,
                }))
              }
            >
              <option value="">Choose division</option>
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <TextField
            label="Pool name"
            value={poolForm.name}
            onChange={(event) =>
              setPoolForm((prev) => ({ ...prev, name: event.target.value }))
            }
          />
          <button type="submit" className="sc-button w-full">
            {poolForm.id ? "Save" : "Add pool"}
          </button>
        </form>
      </Panel>
      <div className="space-y-3">
        {!activeDivision ? (
          <Panel variant="muted" className="p-4 text-sm text-ink-muted">
            Select a division.
          </Panel>
        ) : (
          (activeDivision.pools || []).map((pool) => (
            <Panel
              key={pool.id}
              variant="tinted"
              className="flex items-center justify-between p-4"
            >
              <div>
                <p className="font-semibold">{pool.name}</p>
                <p className="text-xs text-ink-muted">
                  Teams {pool.teams?.length || 0} / Matches{" "}
                  {pool.matches?.length || 0}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="sc-button is-ghost"
                  onClick={() =>
                    setPoolForm({
                      id: pool.id,
                      divisionId: activeDivision.id,
                      name: pool.name,
                    })
                  }
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="sc-button is-destructive"
                  onClick={() => removePool(pool.id)}
                >
                  Delete
                </button>
              </div>
            </Panel>
          ))
        )}
      </div>
    </div>
  );

  const renderTeamsStep = () => {
    const currentTeamsPoolId = teamForm.poolId || activePool?.id || "";
    const currentDivisionForTeams = currentTeamsPoolId
      ? poolDivisionMap.get(currentTeamsPoolId) || null
      : null;
    const divisionTeamDatalistId = currentDivisionForTeams
      ? `division-team-options-${currentDivisionForTeams.id}`
      : "team-options-list";
    const canAssignPoolTeams =
      Boolean(currentDivisionForTeams) &&
      (currentDivisionForTeams.divisionTeams || []).length > 0;
    const currentMatchesPoolId =
      matchForm.matchPoolId ||
      matchForm.poolId ||
      teamForm.poolId ||
      activePool?.id ||
      "";
    const currentDivisionForMatches = currentMatchesPoolId
      ? poolDivisionMap.get(currentMatchesPoolId) || null
      : null;
    const matchDivisionDataListId = currentDivisionForMatches
      ? `division-team-options-${currentDivisionForMatches.id}`
      : "team-options-list";
    const canPlanMatches =
      Boolean(currentDivisionForMatches) &&
      (currentDivisionForMatches.divisionTeams || []).length > 0;
    return (
    <div className="space-y-4">
      {teamOptionsLoading && (
        <div className="text-xs uppercase tracking-wide text-ink-muted">
          Loading team directory...
        </div>
      )}
      {teamOptionsError && (
        <div className="sc-alert is-error text-xs">{teamOptionsError}</div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel variant="muted" className="space-y-3 p-4">
          <SectionHeader
            eyebrow="Teams"
            title={
              activePool
                ? `Pool ${activePool.name}${
                    activePoolMeta?.divisionName
                      ? ` (${activePoolMeta.divisionName})`
                      : ""
                  }`
                : "Select a pool"
            }
          />
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Pool
            </span>
            <select
              className="w-full rounded border border-border bg-white px-3 py-2 text-black"
              value={teamForm.poolId || activePool?.id || ""}
              onChange={(event) =>
                setTeamForm((prev) => ({ ...prev, poolId: event.target.value }))
              }
            >
              <option value="">Select pool</option>
              {poolOptions.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.name} ({pool.divisionName})
                </option>
              ))}
            </select>
          </label>
          <TextField
            label="Team name"
            value={teamForm.name}
            onChange={(event) =>
              setTeamForm((prev) => ({ ...prev, name: event.target.value }))
            }
            list={divisionTeamDatalistId}
            autoComplete="off"
            placeholder={
              canAssignPoolTeams
                ? "Select from assigned teams..."
                : "Assign division teams first"
            }
            disabled={!canAssignPoolTeams}
          />
          {!canAssignPoolTeams && (
            <p className="text-xs text-ink-muted">
              Assign teams to the division in Step 2 to populate this pool.
            </p>
          )}
          <TextField
            label="Seed"
            value={teamForm.seed}
            onChange={(event) =>
              setTeamForm((prev) => ({ ...prev, seed: event.target.value }))
            }
          />
          <button
            type="button"
            className="sc-button w-full"
            onClick={handleTeamSubmit}
            disabled={!canAssignPoolTeams}
          >
            {teamForm.id ? "Save team" : "Add team"}
          </button>
          <div className="space-y-2">
            {!activePool || (activePool.teams || []).length === 0 ? (
              <p className="text-xs text-ink-muted">No teams yet.</p>
            ) : (
              activePool.teams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm"
                >
                  <span>
                    {team.displayLabel || team.name} - Seed {team.seed || "--"}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="sc-button is-ghost"
                      onClick={() =>
                        setTeamForm({
                          id: team.id,
                          poolId: activePool.id,
                          teamId: team.teamId || "",
                          name: team.displayLabel || team.name,
                          seed: team.seed || "",
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="sc-button is-destructive"
                      onClick={() =>
                        upsertPoolEntity(activePool.id, (pool) => ({
                          ...pool,
                          teams: (pool.teams || []).filter(
                            (entry) => entry.id !== team.id,
                          ),
                        }))
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
        <Panel variant="muted" className="space-y-3 p-4">
          <SectionHeader eyebrow="Matches" title="Round planning" />
          <div className="grid gap-2 md:grid-cols-2">
            <TextField
              label="Team A"
              value={matchForm.teamA}
              onChange={(event) =>
                setMatchForm((prev) => ({ ...prev, teamA: event.target.value }))
              }
              list={matchDivisionDataListId}
              autoComplete="off"
              placeholder={
                canPlanMatches
                  ? "Select from division teams..."
                  : "Assign division teams first"
              }
              disabled={!canPlanMatches}
            />
            <TextField
              label="Team B"
              value={matchForm.teamB}
              onChange={(event) =>
                setMatchForm((prev) => ({ ...prev, teamB: event.target.value }))
              }
              list={matchDivisionDataListId}
              autoComplete="off"
              placeholder={
                canPlanMatches
                  ? "Select from division teams..."
                  : "Assign division teams first"
              }
              disabled={!canPlanMatches}
            />
          </div>
          {!canPlanMatches && (
            <p className="text-xs text-ink-muted">
              Choose a pool tied to a division that has teams assigned to plan matches.
            </p>
          )}
          <TextField
            label="Start"
            type="datetime-local"
            value={matchForm.start}
            onChange={(event) =>
              setMatchForm((prev) => ({ ...prev, start: event.target.value }))
            }
            disabled={!canPlanMatches}
          />
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Status
            </span>
            <select
              className="w-full rounded border border-border bg-white px-3 py-2 text-black"
              value={matchForm.status}
              onChange={(event) =>
                setMatchForm((prev) => ({
                  ...prev,
                  status: event.target.value,
                }))
              }
              disabled={!canPlanMatches}
            >
              {matchStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Pool
            </span>
            <select
              className="w-full rounded border border-border bg-white px-3 py-2 text-black"
              value={
                matchForm.matchPoolId ||
                matchForm.poolId ||
                teamForm.poolId ||
                activePool?.id ||
                ""
              }
              onChange={(event) =>
                setMatchForm((prev) => ({
                  ...prev,
                  matchPoolId: event.target.value,
                }))
              }
            >
              <option value="">Select pool</option>
              {poolOptions.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.name} ({pool.divisionName})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Venue
            </span>
            <select
              className="w-full rounded border border-border bg-white px-3 py-2 text-black"
              value={matchForm.venueRefId || ""}
              onChange={(event) =>
                setMatchForm((prev) => ({
                  ...prev,
                  venueRefId: event.target.value,
                }))
              }
              disabled={!canPlanMatches || eventVenueOptions.length === 0}
            >
              <option value="">No venue selected</option>
              {eventVenueOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {eventVenueOptions.length === 0 && (
            <p className="text-xs text-ink-muted">
              Define event venues in Step 1 to assign them here.
            </p>
          )}
          <button
            type="button"
            className="sc-button w-full"
            onClick={handleMatchSubmit}
            disabled={!canPlanMatches}
          >
            {matchForm.id ? "Save match" : "Add match"}
          </button>
          <div className="space-y-4">
            {(activeDivision?.pools || []).map((pool) => (
              <div key={pool.id} className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-ink-muted">
                  <span className="font-semibold text-ink">
                    {pool.name || "Pool"}
                  </span>
                  <span>
                    Matches {(pool.matches || []).length}
                  </span>
                </div>
                {(pool.matches || []).length === 0 ? (
                  <p className="text-xs text-ink-muted">
                    No matches yet for this pool.
                  </p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {pool.matches.map((match) => (
                      <div
                        key={match.id}
                        className="rounded border border-border px-3 py-2 text-sm"
                      >
                        <p className="font-semibold">
                          {match.teamALabel || match.teamA || "Team A"} vs{" "}
                          {match.teamBLabel || match.teamB || "Team B"}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {match.status} - {match.start || "TBD"}
                        </p>
                        <p className="text-xs text-ink-muted">
                          Venue: {match.venueLabel || "Not assigned"}
                        </p>
                        <div className="mt-1 flex gap-2">
                          <button
                            type="button"
                            className="sc-button is-ghost"
                            onClick={() =>
                              setMatchForm({
                                id: match.id,
                                poolId: pool.id,
                                matchPoolId: pool.id,
                                teamA: match.teamALabel || match.teamA,
                                teamAId: match.teamAId || "",
                                teamB: match.teamBLabel || match.teamB,
                                teamBId: match.teamBId || "",
                                start: match.start || "",
                                status: match.status,
                                venueRefId: match.venueRefId || "",
                              })
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="sc-button is-destructive"
                            onClick={() =>
                              upsertPoolEntity(pool.id, (poolState) => ({
                                ...poolState,
                                matches: (poolState.matches || []).filter(
                                  (entry) => entry.id !== match.id,
                                ),
                              }))
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
};

  const renderReviewStep = () => (
    <div className="space-y-4">
      <Panel variant="muted" className="space-y-3 p-4">
        <SectionHeader
          eyebrow="Event"
          title={event.name || "Untitled event"}
          description="Verify the baseline metadata."
        />
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">
              Type
            </dt>
            <dd className="font-semibold text-ink">
              {event.type || "tournament"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">
              Location
            </dt>
            <dd className="font-semibold text-ink">
              {event.location || "TBD"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">
              Start date
            </dt>
            <dd className="font-semibold text-ink">
              {event.start_date || "Pending"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">
              End date
            </dt>
            <dd className="font-semibold text-ink">
              {event.end_date || "Pending"}
            </dd>
          </div>
      <div className="sm:col-span-2">
        <dt className="text-xs uppercase tracking-wide text-ink-muted">
          Notes
        </dt>
        <dd className="text-ink-muted">
          {event.notes || "No additional notes captured."}
        </dd>
      </div>
    </dl>
  </Panel>

      <Panel variant="muted" className="space-y-3 p-4">
        <SectionHeader
          eyebrow="Venues"
          title="Event venues"
          description="Confirm the locations tied to this event."
        />
        {eventVenues.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No venues have been added for this event.
          </p>
        ) : (
          <div className="space-y-2">
            {eventVenues.map((venue) => (
              <div
                key={venue.id}
                className="rounded border border-border p-3 text-sm"
              >
                <p className="font-semibold text-ink">{venue.name}</p>
                <p className="text-xs text-ink-muted">
                  {venue.location || "Location pending"}
                </p>
                {(venue.latitude || venue.longitude) && (
                  <p className="text-xs text-ink-muted">
                    {venue.latitude || "?"}, {venue.longitude || "?"}
                  </p>
                )}
                {venue.notes && (
                  <p className="mt-1 text-xs text-ink-muted">{venue.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel variant="muted" className="space-y-3 p-4">
        <SectionHeader eyebrow="Structure" title="Divisions & pools" />
        {divisions.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Add at least one division to review the structure.
          </p>
        ) : (
          <div className="space-y-3">
            {divisions.map((division) => (
              <div
                key={division.id}
                className="rounded border border-border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{division.name}</p>
                    <p className="text-xs text-ink-muted">
                      Level {division.level || "N/A"}
                    </p>
                  </div>
                  <Chip>{division.pools?.length || 0} pools</Chip>
                </div>
                {(division.pools || []).length === 0 ? (
                  <p className="mt-2 text-xs text-ink-muted">
                    No pools have been assigned yet.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {(division.pools || []).map((pool) => (
                      <div
                        key={pool.id}
                        className="rounded border border-dashed border-border p-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between">
                          <p className="font-semibold text-ink">{pool.name}</p>
                          <span className="text-ink-muted">
                            Teams {(pool.teams || []).length} / Matches{" "}
                            {(pool.matches || []).length}
                          </span>
                        </div>
                        {(pool.teams || []).length > 0 && (
                          <ul className="mt-1 list-disc pl-4 text-ink-muted">
                            {pool.teams.map((team) => (
                              <li key={team.id}>
                                {team.displayLabel || team.name}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );

  const renderConfirmStep = () => {
    const submissionInFlight = submissionState.status === "submitting";
    const submissionSucceeded = submissionState.status === "success";
    return (
      <div className="space-y-4">
        <Panel variant="muted" className="space-y-3 p-4">
          <SectionHeader eyebrow="Checklist" title="Ready to publish-" />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                Venues
              </p>
              <p className="text-2xl font-semibold text-ink">
                {summary.eventVenueCount}
              </p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                Divisions
              </p>
              <p className="text-2xl font-semibold text-ink">
                {divisions.length}
              </p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                Pools
              </p>
              <p className="text-2xl font-semibold text-ink">
                {summary.poolCount}
              </p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                Teams (valid)
              </p>
              <p className="text-2xl font-semibold text-ink">
                {derivedSubmissionCounts.validTeams}
              </p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                Matches (valid)
              </p>
              <p className="text-2xl font-semibold text-ink">
                {derivedSubmissionCounts.validMatches}
              </p>
            </div>
          </div>
        </Panel>

        <Panel variant="muted" className="space-y-3 p-4">
          <SectionHeader
            eyebrow="Confirmation"
            title="Submit hierarchy to database"
          />
          {!isSubmissionReady ? (
            <Card variant="muted" className="p-4 text-sm text-ink-muted">
              Complete the earlier steps and ensure at least one pool has
              assigned teams before submitting.
            </Card>
          ) : (
            <>
              <p className="text-sm text-ink">
                Once confirmed, the event, its venues, divisions, pools, pool
                teams, and scheduled matches will be created in the database as
                a single batch.
              </p>
              {submissionState.error && (
                <div className="sc-alert is-error">{submissionState.error}</div>
              )}
              {submissionSucceeded && submissionState.summary && (
                <div className="sc-alert is-success space-y-1">
                  <p>Event created successfully.</p>
                  <p className="text-xs">
                    Event ID:{" "}
                    <span className="font-mono">{submissionState.eventId}</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    Venues {submissionState.summary.eventVenueCount ?? 0} /
                    Divisions {submissionState.summary.divisionCount} /
                    Division teams{" "}
                    {submissionState.summary.divisionTeamCount ?? 0} / Pools{" "}
                    {submissionState.summary.poolCount} / Pool teams{" "}
                    {submissionState.summary.poolTeamCount} / Matches{" "}
                    {submissionState.summary.matchCount}
                  </p>
                </div>
              )}
              <button
                type="button"
                className="sc-button"
                onClick={handleSubmitToDatabase}
                disabled={submissionInFlight}
              >
                {submissionInFlight ? "Submitting..." : "Submit to database"}
              </button>
            </>
          )}
        </Panel>
      </div>
    );
  };

  const renderStep = () => {
    switch (STEPS[step].key) {
      case "event":
        return renderEventStep();
      case "divisions":
        return renderDivisionsStep();
      case "pools":
        return renderPoolsStep();
      case "teams":
        return renderTeamsStep();
      case "review":
        return renderReviewStep();
      case "confirm":
        return renderConfirmStep();
      default:
        return null;
    }
  };

  const handleSubmitToDatabase = async () => {
    if (!isSubmissionReady || submissionState.status === "submitting") {
      if (!isSubmissionReady) {
        setFormNotice({
          type: "error",
          message: "Complete the earlier steps before confirming the event.",
        });
      }
      return;
    }
    setFormNotice(null);
    setSubmissionState({
      status: "submitting",
      error: null,
      eventId: null,
      summary: null,
    });
    try {
      const action = isEditingExistingEvent
        ? replaceEventHierarchy
        : createEventHierarchy;
      const payloadBase = {
        event: { ...event, rules },
        divisions,
        eventVenues,
      };
      const payload = isEditingExistingEvent
        ? { ...payloadBase, eventId: selectedEventId }
        : payloadBase;
      const result = await action(payload);
      setSubmissionState({
        status: "success",
        error: null,
        eventId: result.eventId,
        summary: result,
      });
      setFormNotice({
        type: "success",
        message: isEditingExistingEvent
          ? "Event hierarchy updated successfully."
          : "Event hierarchy submitted successfully.",
      });
      if (isEditingExistingEvent) {
        loadExistingEvents();
      }
    } catch (err) {
      const message = err?.message || "Unable to submit event hierarchy.";
      setSubmissionState({
        status: "error",
        error: message,
        eventId: null,
        summary: null,
      });
      setFormNotice({ type: "error", message });
    }
  };

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-6">
        <Card className="space-y-4 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Admin"
            title="Event setup wizard"
            description="Walk through event creation from high level to granular pools."
          />
          <Stepper current={step} />
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-6">
        <Card className="space-y-6 p-6 sm:p-8">
          <SectionHeader
            eyebrow={`Step ${step + 1} of ${STEPS.length}`}
            title={STEPS[step].title}
            description={STEPS[step].description}
          />
          {formNotice && (
            <div
              className={`sc-alert ${formNotice.type === "error" ? "is-error" : "is-success"}`}
            >
              {formNotice.message}
            </div>
          )}
          {renderStep()}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs uppercase tracking-wide text-ink-muted">
            <span>
              Venues {summary.eventVenueCount} - Divisions {divisions.length} -
              Pools {summary.poolCount} - Teams {summary.teamCount} - Matches{" "}
              {summary.matchCount}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="sc-button is-ghost"
                disabled={step === 0}
                onClick={() => setStep((prev) => Math.max(0, prev - 1))}
              >
                Back
              </button>
              <button
                type="button"
                className="sc-button"
                disabled={
                  step === STEPS.length - 1 ||
                  (step === 0 && eventMode === "edit" && !selectedEventId)
                }
                onClick={() =>
                  setStep((prev) => Math.min(STEPS.length - 1, prev + 1))
                }
              >
                {step === STEPS.length - 2 ? "Confirm" : "Next"}
              </button>
            </div>
          </div>
        </Card>

        <Card className="space-y-3 p-6">
          <SectionHeader
            eyebrow="Blueprint"
            title={event.name || "Untitled event"}
            description="Share this outline with the tournament crew."
          />
          {divisions.length === 0 ? (
            <Panel variant="muted" className="p-4 text-sm text-ink-muted">
              Add divisions to build the blueprint.
            </Panel>
          ) : (
            divisions.map((division) => (
              <Panel
                key={division.id}
                variant="tinted"
                className="space-y-2 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{division.name}</p>
                  <Chip>{division.pools?.length || 0} pools</Chip>
                </div>
                {(division.pools || []).map((pool) => (
                  <div
                    key={pool.id}
                    className="rounded border border-border p-3 text-sm"
                  >
                    <p className="font-semibold">{pool.name}</p>
                    <p className="text-xs text-ink-muted">
                      Teams {pool.teams?.length || 0} / Matches{" "}
                      {pool.matches?.length || 0}
                    </p>
                  </div>
                ))}
              </Panel>
            ))
          )}
        </Card>
      </SectionShell>
      <datalist id="team-options-list">
        {teamOptions.map((team) => (
          <option key={team.id} value={formatTeamOptionLabel(team)} />
        ))}
      </datalist>
      {divisions.map((division) => (
        <datalist
          key={`division-team-options-${division.id}`}
          id={`division-team-options-${division.id}`}
        >
          {(division.divisionTeams || []).map((team) => (
            <option
              key={`${division.id}-${team.teamId}`}
              value={team.displayLabel || team.name}
            />
          ))}
        </datalist>
      ))}
    </div>
  );
}
