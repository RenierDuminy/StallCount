import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getPlayerDirectory,
  upsertPlayer,
  getRosterEntries,
  addPlayerToRoster,
  removePlayerFromRoster,
  updateRosterCaptainRole,
} from "../services/playerService";
import { getAllTeams } from "../services/teamService";
import { getEventsList } from "../services/leagueService";
import { Card, Panel, SectionHeader, SectionShell, Field, Input, Select, Textarea } from "../components/ui/primitives";

const EMPTY_PLAYER_FORM = {
  id: "",
  name: "",
  gender_code: "",
  jersey_number: "",
  birthday: "",
  description: "",
};

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

export default function CaptainPage() {
  const [playerDirectory, setPlayerDirectory] = useState([]);
  const [playerFilter, setPlayerFilter] = useState("");
  const [playerForm, setPlayerForm] = useState(EMPTY_PLAYER_FORM);
  const [playerSaving, setPlayerSaving] = useState(false);
  const [playerAlert, setPlayerAlert] = useState(null);

  const [teams, setTeams] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [rosterEntries, setRosterEntries] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterAlert, setRosterAlert] = useState(null);
  const [assignPlayerId, setAssignPlayerId] = useState("");
  const [assignCaptainRole, setAssignCaptainRole] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    loadDirectory();
    getAllTeams()
      .then((data) => setTeams(data ?? []))
      .catch(() => setTeams([]));
    getEventsList(50)
      .then((data) => setEvents(data ?? []))
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    if (!selectedTeamId) {
      setRosterEntries([]);
      return;
    }
    loadRoster(selectedTeamId, selectedEventId);
  }, [selectedTeamId, selectedEventId]);

  const filteredPlayers = useMemo(() => {
    const term = playerFilter.trim().toLowerCase();
    if (!term) return playerDirectory;
    return playerDirectory.filter((player) => {
      const haystack = [player.name, player.gender_code, player.jersey_number]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [playerDirectory, playerFilter]);

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

    const primary = candidates.filter((entry) => entry.includeBySignal).slice(0, 6);
    if (primary.length >= 6) return primary;

    const fallback = candidates
      .filter((entry) => !entry.includeBySignal && entry.similarity > 0)
      .slice(0, 6 - primary.length)
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

  const playerOptions = useMemo(() => {
    const entries = [];
    const seen = new Set();

    for (const entry of possibleDuplicates) {
      if (!entry?.player?.id) continue;
      if (entry.player.id === playerForm.id) continue;
      if (seen.has(entry.player.id)) continue;
      seen.add(entry.player.id);
      entries.push(entry);
    }

    if (playerFilter.trim()) {
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
    }

    return entries.slice(0, 12);
  }, [filteredPlayers, playerFilter, playerForm.id, possibleDuplicates]);

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
    if (!playerForm.name.trim()) {
      setPlayerAlert({ tone: "error", message: "Player name is required." });
      return;
    }

    setPlayerSaving(true);
    setPlayerAlert(null);

    try {
      const jerseyNumber =
        playerForm.jersey_number !== "" ? Number(playerForm.jersey_number) : null;

      await upsertPlayer({
        id: playerForm.id || undefined,
        name: playerForm.name,
        gender_code: playerForm.gender_code || null,
        birthday: playerForm.birthday || null,
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
    if (!selectedTeamId || !selectedEventId || !assignPlayerId) {
      setRosterAlert({
        tone: "error",
        message: "Select a team, event, and player before adding.",
      });
      return;
    }

    setAssigning(true);
    setRosterAlert(null);

    try {
      await addPlayerToRoster({
        playerId: assignPlayerId,
        teamId: selectedTeamId,
        eventId: selectedEventId,
        captainRole: assignCaptainRole || null,
      });
      setRosterAlert({ tone: "success", message: "Player added to roster." });
      setAssignPlayerId("");
      setAssignCaptainRole("");
      await loadRoster(selectedTeamId, selectedEventId);
    } catch (err) {
      setRosterAlert({
        tone: "error",
        message: err.message || "Unable to add the player to the roster.",
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
      await loadRoster(selectedTeamId, selectedEventId);
    } catch (err) {
      setRosterAlert({
        tone: "error",
        message: err.message || "Unable to update captain assignment.",
      });
    }
  }

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-4 sm:py-6">
        <Card className="space-y-4 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Backend workspace"
            title="Captain workspace"
            description="Maintain your player list and control the roster assignments for current events."
            action={
              <Link to="/admin" className="sc-button is-ghost">
                Back to admin hub
              </Link>
            }
          />
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-10 py-6">
        <Card as="section" className="grid gap-8 p-6 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-6">
            <SectionHeader
              eyebrow="Directory"
              title="Player directory"
              description="Add new players or update jersey numbers, names, and bios in the public.player table."
            />

            <form className="space-y-4" onSubmit={handlePlayerSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Player name" htmlFor="player-name">
                  <Input
                    id="player-name"
                    type="text"
                    value={playerForm.name}
                    onChange={(event) => handlePlayerFieldChange("name", event.target.value)}
                    required
                  />
                </Field>
                <Field label="Jersey #" htmlFor="player-jersey">
                  <Input
                    id="player-jersey"
                    type="number"
                    value={playerForm.jersey_number}
                    onChange={(event) => handlePlayerFieldChange("jersey_number", event.target.value)}
                    min="0"
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Gender code" htmlFor="player-gender">
                  <Select
                    id="player-gender"
                    value={playerForm.gender_code}
                    onChange={(event) => handlePlayerFieldChange("gender_code", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="M">M</option>
                    <option value="W">W</option>
                  </Select>
                </Field>
                <Field label="Birthday" htmlFor="player-birthday">
                  <Input
                    id="player-birthday"
                    type="date"
                    value={playerForm.birthday}
                    onChange={(event) => handlePlayerFieldChange("birthday", event.target.value)}
                  />
                </Field>
              </div>

              {playerAlert && (
                <div className={`sc-alert ${playerAlert.tone === "error" ? "is-error" : "is-success"}`}>
                  {playerAlert.message}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={playerSaving} className="sc-button disabled:cursor-not-allowed">
                  {playerSaving ? "Saving..." : playerForm.id ? "Update player" : "Add player"}
                </button>
                <button type="button" onClick={resetPlayerForm} className="sc-button is-ghost">
                  Clear form
                </button>
              </div>
            </form>
          </div>

          <Panel variant="muted" className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Existing players</h3>
              <span className="text-xs text-ink-muted">{playerDirectory.length} total</span>
            </div>

            <Field label="Search roster" htmlFor="player-search">
              <Input
                id="player-search"
                type="search"
                placeholder="Search by name, jersey, or gender"
                value={playerFilter}
                onChange={(event) => setPlayerFilter(event.target.value)}
                className="is-compact"
              />
            </Field>

            <div className="space-y-2 rounded-xl border border-border/70 bg-surface p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Possible duplicates
              </p>
              {playerDirectory.length === 0 ? (
                <p className="text-xs text-ink-muted">
                  No players yet. Use the form to add your first athlete.
                </p>
              ) : playerOptions.length === 0 ? (
                <p className="text-xs text-ink-muted">
                  {playerFilter.trim()
                    ? "No players match your search."
                    : playerForm.name.trim()
                      ? "No likely duplicates for the current form values."
                      : "Start typing a name or use search to find existing players."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {playerOptions.map((entry) => (
                    <li
                      key={`dup-${entry.player.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-1.5"
                    >
                      <div className="min-w-0 text-xs">
                        <p className="truncate font-semibold text-ink">
                          {entry.player.name}
                          {entry.player.jersey_number != null ? ` #${entry.player.jersey_number}` : ""}
                        </p>
                        <p className="truncate text-ink-muted">
                          {entry.player.birthday || "DOB unknown"} - {entry.player.gender_code || "-"}
                        </p>
                        <p className="truncate text-[11px] text-ink-muted/90">{entry.matchLabel}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectPlayer(entry.player)}
                        className="sc-button is-ghost text-xs"
                      >
                        Load
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </Card>

        <Card as="section" className="space-y-6 p-6">
          <SectionHeader
            eyebrow="Assignments"
            title="Team roster control"
            description="Link players to specific events and teams via public.team_roster. Pick the team and event, then add or remove assignments."
          />

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Select team" htmlFor="roster-team">
              <Select
                id="roster-team"
                value={selectedTeamId}
                onChange={(event) => setSelectedTeamId(event.target.value)}
              >
                <option value="">Choose a team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Select event" htmlFor="roster-event">
              <Select
                id="roster-event"
                value={selectedEventId}
                onChange={(event) => setSelectedEventId(event.target.value)}
                disabled={!selectedTeamId}
              >
                <option value="">Choose an event</option>
                {events.map((eventItem) => (
                  <option key={eventItem.id} value={eventItem.id}>
                    {eventItem.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Player to assign" htmlFor="roster-player">
              <Select
                id="roster-player"
                value={assignPlayerId}
                onChange={(event) => setAssignPlayerId(event.target.value)}
                disabled={!selectedTeamId || !selectedEventId}
              >
                <option value="">Select player</option>
                {playerDirectory.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name} {player.jersey_number != null ? `#${player.jersey_number}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <form className="flex flex-wrap items-end gap-4 text-sm" onSubmit={handleAddToRoster}>
            <Field label="Captain role" htmlFor="captain-role">
              <Select
                id="captain-role"
                value={assignCaptainRole}
                onChange={(event) => setAssignCaptainRole(event.target.value)}
                disabled={!selectedTeamId || !selectedEventId}
                className="is-compact"
              >
                <option value="">None</option>
                <option value="captain">Captain</option>
                <option value="spirit">Spirit captain</option>
              </Select>
            </Field>
            <button
              type="submit"
              disabled={assigning || !selectedTeamId || !selectedEventId}
              className="sc-button disabled:cursor-not-allowed"
            >
              {assigning ? "Adding..." : "Add to roster"}
            </button>
          </form>

          {rosterAlert && (
            <div className={`sc-alert ${rosterAlert.tone === "error" ? "is-error" : "is-success"}`}>
              {rosterAlert.message}
            </div>
          )}

          <Panel variant="muted" className="p-0">
            {rosterLoading ? (
              <div className="p-6 text-center text-sm text-ink-muted">Loading roster...</div>
            ) : rosterEntries.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-muted">
                {selectedTeamId ? "No roster entries for this filter yet." : "Select a team to view its roster."}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {rosterEntries.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-ink">
                        {entry.player?.name || "Unnamed player"}
                        {entry.player?.jersey_number != null ? ` #${entry.player.jersey_number}` : ""}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {(entry.team?.name || "Team")} - {(entry.event?.name || "Event")}
                        {entry.is_captain
                          ? " ? Captain"
                          : entry.is_spirit_captain
                            ? " ? Spirit captain"
                            : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <Select
                        className="is-compact"
                        value={entry.is_captain ? "captain" : entry.is_spirit_captain ? "spirit" : ""}
                        onChange={(event) => handleUpdateCaptain(entry.id, event.target.value || null)}
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
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </Card>
      </SectionShell>
    </div>
  );
}
