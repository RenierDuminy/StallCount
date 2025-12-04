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

const EMPTY_PLAYER_FORM = {
  id: "",
  name: "",
  gender_code: "",
  jersey_number: "",
  birthday: "",
  description: "",
};

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

  const selectedPlayer = useMemo(
    () => playerDirectory.find((player) => player.id === playerForm.id),
    [playerDirectory, playerForm.id]
  );

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
    <div className="pb-16 text-[var(--sc-ink)]">
      <header className="sc-shell py-4 sm:py-6">
        <div className="sc-card-base space-y-3 p-6 sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sc-chip">Backend workspace</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
              Captain workspace
            </span>
          </div>
          <p className="text-sm text-[var(--sc-ink-muted)]">
            Maintain your player list and control the roster assignments for current events.
          </p>
          <Link to="/admin" className="sc-button is-ghost">
            Back to admin hub
          </Link>
        </div>
      </header>

      <main className="sc-shell space-y-10 py-6">
        <section className="grid gap-8 sc-card-base p-6 shadow-sm lg:grid-cols-[1.1fr,0.9fr]">
          <div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Player directory</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Add new players or update jersey numbers, names, and bios in the `public.player`
                  table.
                </p>
              </div>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handlePlayerSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Player name
                  <input
                    type="text"
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-brand focus:outline-none"
                    value={playerForm.name}
                    onChange={(event) => handlePlayerFieldChange("name", event.target.value)}
                    required
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Jersey #
                  <input
                    type="number"
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-brand focus:outline-none"
                    value={playerForm.jersey_number}
                    onChange={(event) => handlePlayerFieldChange("jersey_number", event.target.value)}
                    min="0"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Gender code
                  <select
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-brand focus:outline-none"
                    value={playerForm.gender_code}
                    onChange={(event) => handlePlayerFieldChange("gender_code", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="M">M</option>
                    <option value="W">W</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Birthday
                  <input
                    type="date"
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-brand focus:outline-none"
                    value={playerForm.birthday}
                    onChange={(event) => handlePlayerFieldChange("birthday", event.target.value)}
                  />
                </label>
              </div>

              <label className="text-sm font-medium text-slate-700">
                Description / Notes
                <textarea
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-brand focus:outline-none"
                  rows={3}
                  value={playerForm.description}
                  onChange={(event) => handlePlayerFieldChange("description", event.target.value)}
                />
              </label>

              {playerAlert && (
                <p
                  className={`text-sm ${
                    playerAlert.tone === "error" ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  {playerAlert.message}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={playerSaving}
                  className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {playerSaving ? "Saving..." : playerForm.id ? "Update player" : "Add player"}
                </button>
                <button
                  type="button"
                  onClick={resetPlayerForm}
                  className="text-sm font-semibold text-slate-500 transition hover:text-slate-900"
                >
                  Clear form
                </button>
              </div>
            </form>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Existing players
              </h3>
              <span className="text-xs text-slate-400">{playerDirectory.length} total</span>
            </div>

            <label className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Search roster
              <input
                type="search"
                placeholder="Search by name, jersey, or gender"
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
                value={playerFilter}
                onChange={(event) => setPlayerFilter(event.target.value)}
              />
            </label>

            <div className="mt-4">
              {filteredPlayers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                  {playerDirectory.length === 0
                    ? "No players yet. Use the form to add your first athlete."
                    : "No players match your search."}
                </div>
              ) : (
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:border-brand focus:outline-none"
                  value={playerForm.id}
                  onChange={(event) => {
                    const player = playerDirectory.find((p) => p.id === event.target.value);
                    if (player) {
                      handleSelectPlayer(player);
                    } else {
                      resetPlayerForm();
                    }
                  }}
                >
                  <option value="">Select player to edit</option>
                  {filteredPlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name} #{player.jersey_number || "—"} ({player.gender_code || "-"})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Team roster control</h2>
            <p className="text-sm text-slate-600">
              Link players to specific events and teams via `public.team_roster`. Pick the team + event,
              then add or remove assignments.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Select team
              <select
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-brand focus:outline-none"
                value={selectedTeamId}
                onChange={(event) => setSelectedTeamId(event.target.value)}
              >
                <option value="">Choose a team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-slate-700">
              Select event
              <select
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-brand focus:outline-none"
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
              </select>
            </label>

            <label className="text-sm font-medium text-slate-700">
              Player to assign
              <select
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-brand focus:outline-none"
                value={assignPlayerId}
                onChange={(event) => setAssignPlayerId(event.target.value)}
                disabled={!selectedTeamId || !selectedEventId}
              >
                <option value="">Select player</option>
                {playerDirectory.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name} #{player.jersey_number || "—"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <form
            className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-700"
            onSubmit={handleAddToRoster}
          >
            <label className="text-sm font-medium text-slate-700">
              Captain role
              <select
                className="mt-1 w-48 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
                value={assignCaptainRole}
                onChange={(event) => setAssignCaptainRole(event.target.value)}
                disabled={!selectedTeamId || !selectedEventId}
              >
                <option value="">None</option>
                <option value="captain">Captain</option>
                <option value="spirit">Spirit Captain</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={assigning || !selectedTeamId || !selectedEventId}
              className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {assigning ? "Adding..." : "Add to roster"}
            </button>
          </form>

          {rosterAlert && (
            <p
              className={`mt-3 text-sm ${
                rosterAlert.tone === "error" ? "text-rose-600" : "text-emerald-600"
              }`}
            >
              {rosterAlert.message}
            </p>
          )}

          <div className="mt-6 rounded-2xl border border-slate-200">
            {rosterLoading ? (
              <div className="p-6 text-center text-sm text-slate-500">Loading roster…</div>
            ) : rosterEntries.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                {selectedTeamId
                  ? "No roster entries for this filter yet."
                  : "Select a team to view its roster."}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rosterEntries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 text-sm text-slate-700"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {entry.player?.name || "Unnamed player"}{" "}
                          {entry.player?.jersey_number != null
                            ? `#${entry.player.jersey_number}`
                            : ""}
                        </p>
                        <p className="text-xs text-slate-500">
                          {entry.team?.name || "Team"} · {entry.event?.name || "Event"}
                          {entry.is_captain
                            ? " · Captain"
                            : entry.is_spirit_captain
                              ? " · Spirit Captain"
                              : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <label className="flex items-center gap-2 text-slate-500">
                          Role
                          <select
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900 focus:border-brand focus:outline-none"
                            value={
                              entry.is_captain ? "captain" : entry.is_spirit_captain ? "spirit" : ""
                            }
                            onChange={(event) =>
                              handleUpdateCaptain(entry.id, event.target.value || null)
                            }
                          >
                            <option value="">None</option>
                            <option value="captain">Captain</option>
                            <option value="spirit">Spirit Captain</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveRosterEntry(entry.id)}
                          className="font-semibold uppercase tracking-wide text-rose-500 transition hover:text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
