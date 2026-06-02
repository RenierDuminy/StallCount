import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getPlayerDirectory,
  upsertPlayer,
  getRosterEntries,
  addPlayerToRoster,
  removePlayerFromRoster,
  updateRosterCaptainRole,
} from "../services/playerService";
import { getTeamsLinkedToEvent } from "../services/teamService";
import { getEventsList } from "../services/leagueService";
import { SectionHeader, SectionShell, Field, Input, Select, Textarea } from "../components/ui/primitives";
import usePersistentState from "../hooks/usePersistentState";

const EMPTY_PLAYER_FORM = {
  id: "",
  name: "",
  gender_code: "",
  jersey_number: "",
  birthday: "",
  description: "",
};

const CAPTAIN_PLAYER_FORM_KEY = "stallcount:captain:player-form:v1";
const CAPTAIN_SELECTED_EVENT_KEY = "stallcount:captain:selected-event:v1";
const CAPTAIN_SELECTED_TEAM_KEY = "stallcount:captain:selected-team:v1";
const CAPTAIN_ASSIGN_PLAYER_KEY = "stallcount:captain:assign-player:v1";
const CAPTAIN_ASSIGN_FILTER_KEY = "stallcount:captain:assign-filter:v1";
const PLAYER_RESULT_LIMIT = 8;

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeName(value) {
  const normalized = normalizeName(value);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

function levenshteinDistance(left, right) {
  const source = String(left || "");
  const target = String(right || "");
  if (!source) return target.length;
  if (!target) return source.length;

  const previous = Array.from({ length: target.length + 1 }, (_, index) => index);
  const current = new Array(target.length + 1);

  for (let i = 1; i <= source.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= target.length; j += 1) {
      const substitutionCost = source[i - 1] === target[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost
      );
    }
    for (let j = 0; j <= target.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[target.length];
}

function nameSimilarity(left, right) {
  const source = String(left || "");
  const target = String(right || "");
  if (!source || !target) return 0;
  if (source === target) return 1;

  const maxLength = Math.max(source.length, target.length);
  if (maxLength === 0) return 0;

  const distance = levenshteinDistance(source, target);
  return Math.max(0, 1 - distance / maxLength);
}

function getRosterRolePriority(entry) {
  if (entry?.is_captain) return 0;
  if (entry?.is_spirit_captain) return 1;
  return 2;
}

function compareRosterEntries(left, right) {
  const roleDelta = getRosterRolePriority(left) - getRosterRolePriority(right);
  if (roleDelta !== 0) {
    return roleDelta;
  }

  const leftName = String(left?.player?.name || "").trim();
  const rightName = String(right?.player?.name || "").trim();
  const nameDelta = leftName.localeCompare(rightName, undefined, {
    sensitivity: "base",
  });
  if (nameDelta !== 0) {
    return nameDelta;
  }

  const leftJersey = Number.isFinite(Number(left?.player?.jersey_number))
    ? Number(left.player.jersey_number)
    : Number.POSITIVE_INFINITY;
  const rightJersey = Number.isFinite(Number(right?.player?.jersey_number))
    ? Number(right.player.jersey_number)
    : Number.POSITIVE_INFINITY;
  if (leftJersey !== rightJersey) {
    return leftJersey - rightJersey;
  }

  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function getRosterRoleTags(entry) {
  const tags = [];
  if (entry?.is_captain) {
    tags.push({ label: "C", title: "Captain" });
  }
  if (entry?.is_spirit_captain) {
    tags.push({ label: "SC", title: "Spirit captain" });
  }
  return tags;
}

function EditIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="3"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function CaptainPage() {
  const [playerDirectory, setPlayerDirectory] = useState([]);
  const [playerForm, setPlayerForm] = usePersistentState(CAPTAIN_PLAYER_FORM_KEY, EMPTY_PLAYER_FORM);
  const [playerSaving, setPlayerSaving] = useState(false);
  const [playerAlert, setPlayerAlert] = useState(null);

  const [eventTeams, setEventTeams] = useState([]);
  const [eventTeamsLoading, setEventTeamsLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = usePersistentState(CAPTAIN_SELECTED_TEAM_KEY, "");
  const [selectedEventId, setSelectedEventId] = usePersistentState(CAPTAIN_SELECTED_EVENT_KEY, "");
  const [rosterEntries, setRosterEntries] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterAlert, setRosterAlert] = useState(null);
  const [assignPlayerIds, setAssignPlayerIds] = usePersistentState(CAPTAIN_ASSIGN_PLAYER_KEY, []);
  const [assignPlayerFilter, setAssignPlayerFilter] = usePersistentState(CAPTAIN_ASSIGN_FILTER_KEY, "");
  const [assigning, setAssigning] = useState(false);
  const [editingRosterEntryId, setEditingRosterEntryId] = useState("");
  const [playerEditorOpen, setPlayerEditorOpen] = useState(false);
  const previousEventIdRef = useRef(selectedEventId);

  useEffect(() => {
    loadDirectory();
    getEventsList(50)
      .then((data) => setEvents(data ?? []))
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    const eventChanged = previousEventIdRef.current !== selectedEventId;
    previousEventIdRef.current = selectedEventId;

    if (eventChanged) {
      setSelectedTeamId("");
      setRosterEntries([]);
      setAssignPlayerIds([]);
      setAssignPlayerFilter("");
      setEditingRosterEntryId("");
    }

    if (!selectedEventId) {
      setEventTeams([]);
      setEventTeamsLoading(false);
      if (eventChanged) {
        setRosterEntries([]);
      }
      return;
    }

    let isCancelled = false;
    setEventTeamsLoading(true);

    getTeamsLinkedToEvent(selectedEventId)
      .then((data) => {
        if (isCancelled) return;
        setEventTeams(data ?? []);
      })
      .catch((err) => {
        if (isCancelled) return;
        setEventTeams([]);
        setRosterAlert({
          tone: "error",
          message: err.message || "Unable to load event teams.",
        });
      })
      .finally(() => {
        if (!isCancelled) {
          setEventTeamsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    selectedEventId,
    setAssignPlayerFilter,
    setAssignPlayerIds,
    setSelectedTeamId,
  ]);

  useEffect(() => {
    if (!selectedEventId || !selectedTeamId) {
      setRosterEntries([]);
      return;
    }
    loadRoster(selectedTeamId, selectedEventId);
  }, [selectedTeamId, selectedEventId]);

  const filteredPlayers = useMemo(() => {
    const term = playerForm.name.trim().toLowerCase();
    if (!term) return playerDirectory;
    return playerDirectory.filter((player) => {
      const haystack = [player.name, player.gender_code, player.jersey_number]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [playerDirectory, playerForm.name]);

  const possibleDuplicates = useMemo(() => {
    if (!playerForm.name.trim()) return [];

    const formName = normalizeName(playerForm.name);
    const formBirthday = playerForm.birthday || "";
    const formGender = playerForm.gender_code || "";
    const formTokens = new Set(tokenizeName(playerForm.name));
    const jerseyValue =
      playerForm.jersey_number !== "" && Number.isFinite(Number(playerForm.jersey_number))
        ? Number(playerForm.jersey_number)
        : null;

    const candidates = playerDirectory
      .filter((player) => player.id !== playerForm.id)
      .map((player) => {
        const playerName = normalizeName(player.name);
        const playerTokens = tokenizeName(player.name);
        const similarity = nameSimilarity(formName, playerName);
        const sharedTokens = playerTokens.filter((token) => formTokens.has(token)).length;
        const birthdaysMatch =
          Boolean(formBirthday) && Boolean(player.birthday) && player.birthday === formBirthday;
        const namesEqual = Boolean(formName) && Boolean(playerName) && formName === playerName;
        const jerseyMatches = jerseyValue !== null && player.jersey_number === jerseyValue;
        const genderMatches = formGender && player.gender_code && player.gender_code === formGender;

        let score = 0;
        if (namesEqual) score += 12;
        if (birthdaysMatch) score += 8;
        if (sharedTokens > 0) score += Math.min(sharedTokens * 2, 6);
        if (similarity >= 0.85) score += 6;
        else if (similarity >= 0.7) score += 4;
        else if (similarity >= 0.55) score += 2;
        else if (similarity >= 0.4) score += 1;
        if (jerseyMatches) score += 2;
        if (genderMatches) score += 1;

        const includeBySignal =
          namesEqual ||
          birthdaysMatch ||
          sharedTokens > 0 ||
          similarity >= 0.45 ||
          (jerseyMatches && similarity >= 0.3);

        let matchLabel = "Closest option";
        if (namesEqual && birthdaysMatch) {
          matchLabel = "Exact name + DOB";
        } else if (namesEqual) {
          matchLabel = "Exact name";
        } else if (birthdaysMatch && (sharedTokens > 0 || similarity >= 0.45)) {
          matchLabel = "DOB + similar name";
        } else if (birthdaysMatch) {
          matchLabel = "Same DOB";
        } else if (sharedTokens >= 2 || similarity >= 0.7) {
          matchLabel = "Likely duplicate";
        } else if (sharedTokens > 0 || similarity >= 0.45) {
          matchLabel = "Similar name";
        }

        return {
          player,
          score,
          similarity,
          includeBySignal,
          matchLabel,
        };
      })
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        if (right.similarity !== left.similarity) return right.similarity - left.similarity;
        return `${left.player.name || ""}`.localeCompare(`${right.player.name || ""}`);
      });

    const primary = candidates
      .filter((entry) => entry.includeBySignal)
      .slice(0, PLAYER_RESULT_LIMIT);
    if (primary.length >= PLAYER_RESULT_LIMIT) return primary;

    const fallback = candidates
      .filter((entry) => !entry.includeBySignal && entry.similarity > 0)
      .slice(0, PLAYER_RESULT_LIMIT - primary.length)
      .map((entry) => ({
        ...entry,
        matchLabel: "Closest option",
      }));

    return [...primary, ...fallback];
  }, [
    playerDirectory,
    playerForm.birthday,
    playerForm.gender_code,
    playerForm.id,
    playerForm.jersey_number,
    playerForm.name,
  ]);

  const duplicateBanner = useMemo(() => {
    const formName = normalizeName(playerForm.name);
    if (!formName) return null;

    const hasExactNameMatch = playerDirectory.some((player) => {
      if (!player || player.id === playerForm.id) return false;
      return normalizeName(player.name) === formName;
    });

    if (!hasExactNameMatch) return null;

    const hasPossibleDuplication = playerDirectory.some((player) => {
      if (!player || player.id === playerForm.id) return false;
      return (
        normalizeName(player.name) === formName &&
        String(player.gender_code || "") === String(playerForm.gender_code || "") &&
        String(player.birthday || "") === String(playerForm.birthday || "")
      );
    });

    if (hasPossibleDuplication) {
      return {
        tone: "danger",
        message: "Warning: Possible duplication",
      };
    }

    return {
      tone: "caution",
      message: "Caution: Existing name found",
    };
  }, [playerDirectory, playerForm.birthday, playerForm.gender_code, playerForm.id, playerForm.name]);

  const hasExistingPlayerLookupInput = Boolean(playerForm.name.trim());

  const rosterPlayerIds = useMemo(() => {
    const ids = new Set();
    for (const entry of rosterEntries) {
      const playerId = entry?.player?.id;
      if (playerId) {
        ids.add(playerId);
      }
    }
    return ids;
  }, [rosterEntries]);

  const playerOptions = useMemo(() => {
    if (!hasExistingPlayerLookupInput) return [];

    const entries = [];
    const seen = new Set();

    for (const entry of possibleDuplicates) {
      if (!entry?.player?.id) continue;
      if (entry.player.id === playerForm.id) continue;
      if (seen.has(entry.player.id)) continue;
      seen.add(entry.player.id);
      entries.push(entry);
    }

    for (const player of filteredPlayers) {
      if (!player?.id) continue;
      if (player.id === playerForm.id) continue;
      if (seen.has(player.id)) continue;
      seen.add(player.id);
      entries.push({
        player,
        matchLabel: "Search result",
      });
    }

    return entries
      .sort((left, right) => {
        const leftAssigned = rosterPlayerIds.has(left.player.id);
        const rightAssigned = rosterPlayerIds.has(right.player.id);
        const assignedDelta = Number(rightAssigned) - Number(leftAssigned);
        if (assignedDelta !== 0) return assignedDelta;

        const scoreDelta = (right.score || 0) - (left.score || 0);
        if (scoreDelta !== 0) return scoreDelta;

        return `${left.player.name || ""}`.localeCompare(`${right.player.name || ""}`);
      })
      .slice(0, PLAYER_RESULT_LIMIT);
  }, [
    filteredPlayers,
    hasExistingPlayerLookupInput,
    playerForm.id,
    possibleDuplicates,
    rosterPlayerIds,
  ]);

  const sortedRosterEntries = useMemo(
    () => [...rosterEntries].sort(compareRosterEntries),
    [rosterEntries],
  );

  const assignPlayerOptions = useMemo(() => {
    if (!selectedEventId || !selectedTeamId) {
      return [];
    }

    const term = assignPlayerFilter.trim().toLowerCase();
    if (!term) {
      return [];
    }

    const options = playerDirectory
      .filter((player) => player?.id)
      .filter((player) => {
        const haystack = [player.name, player.gender_code, player.jersey_number, player.birthday]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
      .sort((left, right) => {
        const assignedDelta = Number(rosterPlayerIds.has(right.id)) - Number(rosterPlayerIds.has(left.id));
        if (assignedDelta !== 0) return assignedDelta;
        return `${left.name || ""}`.localeCompare(`${right.name || ""}`);
      });

    return options.slice(0, PLAYER_RESULT_LIMIT);
  }, [assignPlayerFilter, playerDirectory, rosterPlayerIds, selectedEventId, selectedTeamId]);

  const selectedAssignPlayerIds = useMemo(() => {
    if (Array.isArray(assignPlayerIds)) {
      return assignPlayerIds.filter(Boolean);
    }
    return assignPlayerIds ? [assignPlayerIds] : [];
  }, [assignPlayerIds]);

  const selectedAssignPlayers = useMemo(() => {
    const selectedIds = new Set(selectedAssignPlayerIds);
    return playerDirectory.filter((player) => selectedIds.has(player.id));
  }, [playerDirectory, selectedAssignPlayerIds]);

  const assignableSelectedPlayerIds = useMemo(
    () => selectedAssignPlayerIds.filter((playerId) => !rosterPlayerIds.has(playerId)),
    [rosterPlayerIds, selectedAssignPlayerIds],
  );

  function toggleAssignPlayer(playerId) {
    if (!playerId || rosterPlayerIds.has(playerId)) return;

    setAssignPlayerIds((previous) => {
      const current = Array.isArray(previous)
        ? previous.filter(Boolean)
        : previous
          ? [previous]
          : [];
      if (current.includes(playerId)) {
        return current.filter((id) => id !== playerId);
      }
      return [...current, playerId];
    });
  }

  async function loadDirectory() {
    try {
      const data = await getPlayerDirectory();
      setPlayerDirectory(data ?? []);
    } catch (err) {
      setPlayerAlert({ tone: "error", message: err.message || "Unable to load players." });
    }
  }

  async function loadRoster(teamId, eventId) {
    setRosterLoading(true);
    setRosterAlert(null);
    try {
      const data = await getRosterEntries(teamId, eventId);
      setRosterEntries(data ?? []);
    } catch (err) {
      setRosterAlert({ tone: "error", message: err.message || "Unable to load roster." });
    } finally {
      setRosterLoading(false);
    }
  }

  function handlePlayerFieldChange(field, value) {
    setPlayerForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleSelectPlayer(player) {
    setPlayerForm({
      id: player.id,
      name: player.name || "",
      gender_code: player.gender_code || "",
      jersey_number: player.jersey_number ?? "",
      birthday: player.birthday ?? "",
      description: player.description ?? "",
    });
    setPlayerAlert(null);
  }

  function resetPlayerForm() {
    setPlayerForm(EMPTY_PLAYER_FORM);
    setPlayerAlert(null);
  }

  async function handlePlayerSubmit(event) {
    event.preventDefault();
    const normalizedName = playerForm.name.trim();
    const normalizedGender = String(playerForm.gender_code || "").trim();
    const normalizedBirthday = String(playerForm.birthday || "").trim();

    if (!normalizedName) {
      setPlayerAlert({ tone: "error", message: "Player name is required." });
      return;
    }
    if (!normalizedGender) {
      setPlayerAlert({ tone: "error", message: "Gender is required." });
      return;
    }
    if (!normalizedBirthday) {
      setPlayerAlert({ tone: "error", message: "Birthday is required." });
      return;
    }

    if (!playerForm.id && duplicateBanner?.tone === "danger") {
      const confirmed = window.confirm(
        "Warning: Possible duplication. Add this player anyway?"
      );
      if (!confirmed) {
        setPlayerAlert({
          tone: "error",
          message: "Player was not added. Review the possible duplicate before continuing.",
        });
        return;
      }
    }

    setPlayerSaving(true);
    setPlayerAlert(null);

    try {
      const jerseyNumber =
        playerForm.jersey_number !== "" ? Number(playerForm.jersey_number) : null;

      await upsertPlayer({
        id: playerForm.id || undefined,
        name: normalizedName,
        gender_code: normalizedGender,
        birthday: normalizedBirthday,
        description: playerForm.description || null,
        jersey_number: jerseyNumber ?? null,
      });

      setPlayerAlert({
        tone: "success",
        message: playerForm.id ? "Player updated." : "Player added.",
      });
      await loadDirectory();
      if (!playerForm.id) {
        setPlayerForm(EMPTY_PLAYER_FORM);
      }
    } catch (err) {
      setPlayerAlert({
        tone: "error",
        message: err.message || "Unable to save player.",
      });
    } finally {
      setPlayerSaving(false);
    }
  }

  async function handleAddToRoster(event) {
    event.preventDefault();
    if (!selectedTeamId || !selectedEventId || assignableSelectedPlayerIds.length === 0) {
      setRosterAlert({
        tone: "error",
        message: "Select a team, event, and at least one player before adding.",
      });
      return;
    }

    setAssigning(true);
    setRosterAlert(null);

    try {
      await Promise.all(
        assignableSelectedPlayerIds.map((playerId) =>
          addPlayerToRoster({
            playerId,
            teamId: selectedTeamId,
            eventId: selectedEventId,
            captainRole: null,
          }),
        ),
      );
      setRosterAlert({
        tone: "success",
        message:
          assignableSelectedPlayerIds.length === 1
            ? "Player added to roster."
            : `${assignableSelectedPlayerIds.length} players added to roster.`,
      });
      setAssignPlayerIds([]);
      setAssignPlayerFilter("");
      await loadRoster(selectedTeamId, selectedEventId);
    } catch (err) {
      setRosterAlert({
        tone: "error",
        message: err.message || "Unable to add players to the roster.",
      });
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemoveRosterEntry(entryId) {
    const confirmed = window.confirm(
      "Remove this player from the roster? This action cannot be undone."
    );
    if (!confirmed) return;

    setRosterAlert(null);
    try {
      await removePlayerFromRoster(entryId);
      setRosterAlert({ tone: "success", message: "Roster entry removed." });
      setEditingRosterEntryId("");
      await loadRoster(selectedTeamId, selectedEventId);
    } catch (err) {
      setRosterAlert({
        tone: "error",
        message: err.message || "Unable to remove the player.",
      });
    }
  }

  async function handleUpdateCaptain(entryId, roleValue) {
    setRosterAlert(null);
    try {
      await updateRosterCaptainRole(entryId, roleValue || null);
      setRosterAlert({ tone: "success", message: "Captain assignment updated." });
      setEditingRosterEntryId("");
      await loadRoster(selectedTeamId, selectedEventId);
    } catch (err) {
      setRosterAlert({
        tone: "error",
        message: err.message || "Unable to update captain assignment.",
      });
    }
  }

  return (
    <div className="pb-12 text-ink sm:pb-16">
      <SectionShell as="header" className="py-3 sm:py-5">
        <div className="border-b border-border pb-3 sm:pb-5">
          <SectionHeader
            title="Captain workspace"
            action={
              <Link to="/admin" className="sc-button is-ghost">
                Back to admin hub
              </Link>
            }
          />
        </div>
      </SectionShell>

      <SectionShell as="main" className="space-y-6 py-3 sm:space-y-8 sm:py-5">
        <section className="space-y-4 rounded-xl border border-border/80 border-l-4 border-l-warning-border bg-[rgba(15,37,31,0.38)] p-3 sm:space-y-5 sm:p-4">
          <SectionHeader
            title="Team roster control"
          />

          <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
            <Field label="Select event" htmlFor="roster-event">
              <Select
                id="roster-event"
                value={selectedEventId}
                onChange={(event) => setSelectedEventId(event.target.value)}
              >
                <option value="">Choose an event</option>
                {events.map((eventItem) => (
                  <option key={eventItem.id} value={eventItem.id}>
                    {eventItem.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Select team" htmlFor="roster-team">
              <Select
                id="roster-team"
                value={selectedTeamId}
                onChange={(event) => {
                  setSelectedTeamId(event.target.value);
                  setRosterEntries([]);
                  setAssignPlayerIds([]);
                  setAssignPlayerFilter("");
                  setEditingRosterEntryId("");
                }}
                disabled={!selectedEventId || eventTeamsLoading}
              >
                <option value="">
                  {!selectedEventId
                    ? "Choose an event first"
                    : eventTeamsLoading
                      ? "Loading teams..."
                      : "Choose a team"}
                </option>
                {eventTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <section className="space-y-3 border-t border-border-strong pt-4 sm:space-y-4 sm:pt-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ink-muted">{assignPlayerOptions.length} shown</span>
            </div>

            <Field label="Search players" htmlFor="assign-player-search">
              <Input
                id="assign-player-search"
                type="search"
                placeholder="Search by name, jersey, birthday, or gender"
                value={assignPlayerFilter}
                onChange={(event) => setAssignPlayerFilter(event.target.value)}
                className="is-compact"
                disabled={!selectedEventId || !selectedTeamId}
              />
            </Field>

            <div>
              <button
                type="button"
                onClick={() => setPlayerEditorOpen(true)}
                className="sc-button is-ghost text-xs"
              >
                Create/Update player
              </button>
            </div>

            <div className="space-y-2 rounded-xl border border-border-strong bg-surface p-2.5 sm:p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Players to assign</p>
              {!selectedEventId || !selectedTeamId ? (
                <p className="text-xs text-ink-muted">Select an event and team first.</p>
              ) : rosterLoading ? (
                <p className="text-xs text-ink-muted">Loading roster players...</p>
              ) : playerDirectory.length === 0 ? (
                <p className="text-xs text-ink-muted">No players in directory yet.</p>
              ) : !assignPlayerFilter.trim() ? (
                <p className="text-xs text-ink-muted">Start typing to search available players.</p>
              ) : assignPlayerOptions.length === 0 ? (
                <p className="text-xs text-ink-muted">
                  No players match your search.
                </p>
              ) : (
                <ul className="space-y-2">
                  {assignPlayerOptions.map((player) => {
                    const isAssigned = rosterPlayerIds.has(player.id);
                    const isSelected = selectedAssignPlayerIds.includes(player.id);

                    return (
                      <li
                        key={`assign-${player.id}`}
                        className={`flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-1.5 sm:px-2.5 ${
                          isAssigned ? "bg-surface-muted/50 text-ink-muted" : ""
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2 text-xs">
                          {isAssigned ? (
                            <span
                              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/70 bg-accent/15 text-accent"
                              title="Already assigned"
                            >
                              <CheckIcon />
                            </span>
                          ) : (
                            <span className="h-5 w-5 shrink-0" aria-hidden="true" />
                          )}
                          <div className="min-w-0">
                            <p className={`truncate font-semibold ${isAssigned ? "text-ink-muted" : "text-ink"}`}>
                              {player.name}
                              {player.jersey_number != null ? ` #${player.jersey_number}` : ""}
                            </p>
                            <p className="truncate text-ink-muted">
                              {player.birthday || "DOB unknown"} - {player.gender_code || "-"}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleAssignPlayer(player.id)}
                          className={`sc-button is-ghost text-xs ${
                            isAssigned ? "cursor-not-allowed opacity-45 hover:text-ink-muted" : ""
                          }`}
                          disabled={isAssigned}
                        >
                          {isSelected ? "Selected" : "Select"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <form
              className="space-y-2.5 rounded-xl border border-border-strong bg-surface px-3 py-2.5 text-sm sm:space-y-3 sm:py-3"
              onSubmit={handleAddToRoster}
            >
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Selected players
                </p>
                {selectedAssignPlayers.length > 0 ? (
                  <ul className="space-y-1 text-xs text-ink">
                    {selectedAssignPlayers.map((player) => (
                      <li key={`selected-${player.id}`} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-semibold">
                          {player.name || "Unnamed player"}
                          {player.jersey_number != null ? ` #${player.jersey_number}` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleAssignPlayer(player.id)}
                          className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted hover:text-ink"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-ink-muted">
                    Choose one or more players from the list above to assign them to this roster.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-2 sm:gap-3">
                <button
                  type="submit"
                  disabled={
                    assigning ||
                    !selectedTeamId ||
                    !selectedEventId ||
                    assignableSelectedPlayerIds.length === 0
                  }
                  className="sc-button disabled:cursor-not-allowed"
                >
                  {assigning
                    ? "Adding..."
                    : assignableSelectedPlayerIds.length > 1
                      ? `Add ${assignableSelectedPlayerIds.length} to roster`
                      : "Add to roster"}
                </button>
              </div>
            </form>
          </section>

          {rosterAlert && (
            <div className={`sc-alert ${rosterAlert.tone === "error" ? "is-error" : "is-success"}`}>
              {rosterAlert.message}
            </div>
          )}

          <section className="overflow-hidden rounded-xl border border-border-strong bg-surface-muted">
            {rosterLoading ? (
              <div className="p-4 text-center text-sm text-ink-muted sm:p-6">Loading roster...</div>
            ) : sortedRosterEntries.length === 0 ? (
              <div className="p-4 text-center text-sm text-ink-muted sm:p-6">
                {selectedTeamId
                  ? "No roster entries for this filter yet."
                  : "Select an event and team to view its roster."}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {sortedRosterEntries.map((entry) => {
                  const isEditing = editingRosterEntryId === entry.id;
                  const playerName = entry.player?.name || "Unnamed player";

                  return (
                    <li key={entry.id} className="px-3 py-2.5 text-sm sm:px-4 sm:py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                            {getRosterRoleTags(entry).length > 0 ? (
                              <span className="flex flex-nowrap gap-1">
                                {getRosterRoleTags(entry).map((tag) => (
                                  <span
                                    key={`${entry.id}-${tag.label}`}
                                    title={tag.title}
                                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                                    style={{
                                      background: "var(--sc-accent)",
                                      color: "var(--sc-button-ink)",
                                      borderColor: "var(--sc-accent-strong)",
                                    }}
                                  >
                                    {tag.label}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                            <span className="min-w-0 truncate">{playerName}</span>
                            {entry.player?.jersey_number != null ? (
                              <span className="text-xs font-medium text-ink-muted">
                                #{entry.player.jersey_number}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingRosterEntryId(isEditing ? "" : entry.id)}
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
                            isEditing
                              ? "border-accent bg-accent text-[var(--sc-button-ink)]"
                              : "border-border bg-surface text-ink-muted hover:border-accent hover:text-ink"
                          }`}
                          aria-expanded={isEditing}
                          aria-label={`Edit roster controls for ${playerName}`}
                          title="Edit roster entry"
                        >
                          <EditIcon />
                        </button>
                      </div>

                      {isEditing ? (
                        <div className="mt-2.5 flex flex-col gap-2 rounded-xl border border-border/70 bg-surface px-3 py-2.5 text-xs sm:mt-3 sm:flex-row sm:items-center sm:justify-end sm:py-3">
                          <Select
                            className="is-compact sm:w-48"
                            value={entry.is_captain ? "captain" : entry.is_spirit_captain ? "spirit" : ""}
                            onChange={(event) => handleUpdateCaptain(entry.id, event.target.value || null)}
                            aria-label={`Captain role for ${playerName}`}
                          >
                            <option value="">None</option>
                            <option value="captain">Captain</option>
                            <option value="spirit">Spirit captain</option>
                          </Select>
                          <button
                            type="button"
                            onClick={() => handleRemoveRosterEntry(entry.id)}
                            className="sc-button is-ghost text-xs text-rose-200 hover:text-white"
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </section>
      </SectionShell>

      {playerEditorOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 px-3 py-4 backdrop-blur-[2px] sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-label="Create/Update players"
          onClick={() => setPlayerEditorOpen(false)}
        >
          <section
            className="w-full max-w-5xl rounded-xl border border-border/80 border-l-4 border-l-accent bg-surface-muted p-3 text-ink shadow-strong sm:p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-border-strong pb-3">
              <SectionHeader
                title="Create/Update players"
              />
              <button
                type="button"
                onClick={() => setPlayerEditorOpen(false)}
                className="sc-button is-ghost shrink-0 text-xs"
              >
                Close
              </button>
            </div>

            <div className="space-y-5 sm:space-y-6">
              <section className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Existing players</h3>
                  <span className="text-xs text-ink-muted">{playerDirectory.length} total</span>
                </div>

                <div className="space-y-2 rounded-xl border border-border-strong bg-surface p-2.5 sm:p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Possible duplicates
                  </p>
                  {playerDirectory.length === 0 ? (
                    <p className="text-xs text-ink-muted">
                      No players yet. Use the form to add your first athlete.
                    </p>
                  ) : !hasExistingPlayerLookupInput ? (
                    <p className="text-xs text-ink-muted">
                      Start typing in Player name to find existing players.
                    </p>
                  ) : playerOptions.length === 0 ? (
                    <p className="text-xs text-ink-muted">
                      No players match the current player name.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {playerOptions.map((entry) => {
                        const isAssigned = rosterPlayerIds.has(entry.player.id);

                        return (
                          <li
                            key={`dup-${entry.player.id}`}
                            className={`flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-1.5 sm:px-2.5 ${
                              isAssigned ? "bg-surface-muted/50 text-ink-muted" : ""
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2 text-xs">
                              {isAssigned ? (
                                <span
                                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/70 bg-accent/15 text-accent"
                                  title="Already assigned"
                                >
                                  <CheckIcon />
                                </span>
                              ) : (
                                <span className="h-5 w-5 shrink-0" aria-hidden="true" />
                              )}
                              <div className="min-w-0">
                                <p className={`truncate font-semibold ${isAssigned ? "text-ink-muted" : "text-ink"}`}>
                                  {entry.player.name}
                                  {entry.player.jersey_number != null ? ` #${entry.player.jersey_number}` : ""}
                                </p>
                                <p className="truncate text-ink-muted">
                                  {entry.player.birthday || "DOB unknown"} - {entry.player.gender_code || "-"}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSelectPlayer(entry.player)}
                              className={`sc-button is-ghost text-xs ${
                                isAssigned ? "cursor-not-allowed opacity-45 hover:text-ink-muted" : ""
                              }`}
                              disabled={isAssigned}
                            >
                              Load
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>

              <form className="space-y-3 border-t border-border-strong pt-4 sm:space-y-4 sm:pt-5" onSubmit={handlePlayerSubmit}>
                <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                  <Field label="Player name" htmlFor="player-name">
                    <Input
                      id="player-name"
                      type="text"
                      value={playerForm.name}
                      onChange={(event) => handlePlayerFieldChange("name", event.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Birthday" htmlFor="player-birthday">
                    <Input
                      id="player-birthday"
                      type="date"
                      value={playerForm.birthday}
                      onChange={(event) => handlePlayerFieldChange("birthday", event.target.value)}
                      required
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3 md:col-span-2 md:gap-4">
                    <Field label="Gender code" htmlFor="player-gender">
                      <Select
                        id="player-gender"
                        value={playerForm.gender_code}
                        onChange={(event) => handlePlayerFieldChange("gender_code", event.target.value)}
                        required
                      >
                        <option value="">Select</option>
                        <option value="M">M</option>
                        <option value="W">W</option>
                      </Select>
                    </Field>
                    <Field label="Jersey # (optional)" htmlFor="player-jersey">
                      <Input
                        id="player-jersey"
                        type="number"
                        value={playerForm.jersey_number}
                        onChange={(event) => handlePlayerFieldChange("jersey_number", event.target.value)}
                        min="0"
                      />
                    </Field>
                  </div>
                </div>

                {playerAlert && (
                  <div className={`sc-alert ${playerAlert.tone === "error" ? "is-error" : "is-success"}`}>
                    {playerAlert.message}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <button type="submit" disabled={playerSaving} className="sc-button disabled:cursor-not-allowed">
                    {playerSaving ? "Saving..." : playerForm.id ? "Update player" : "Add player"}
                  </button>
                  <button type="button" onClick={resetPlayerForm} className="sc-button is-ghost">
                    Clear form
                  </button>
                </div>

                {duplicateBanner && (
                  <div
                    className={[
                      "rounded-xl border px-3 py-2 text-sm font-medium",
                      duplicateBanner.tone === "danger"
                        ? "border-red-500/50 bg-red-500/10 text-red-200"
                        : "border-yellow-400/50 bg-yellow-400/10 text-yellow-100",
                    ].join(" ")}
                  >
                    {duplicateBanner.message}
                  </div>
                )}
              </form>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
