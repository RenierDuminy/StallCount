import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getOpenMatches, initialiseMatch } from "../services/matchService";
import { updateScore } from "../services/realtimeService";

const DEFAULT_DURATION = 90;

export default function ScoreKeeperPage() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState(null);
  const [selectedMatchId, setSelectedMatchId] = useState(null);

  const [activeMatch, setActiveMatch] = useState(null);
  const [initialising, setInitialising] = useState(false);

  const [setupForm, setSetupForm] = useState({
    startTime: "",
    startingTeamId: "",
    abbaPattern: "ABBA",
  });

  const [score, setScore] = useState({ a: 0, b: 0 });
  const [logs, setLogs] = useState([]);
  const [timerSeconds, setTimerSeconds] = useState(DEFAULT_DURATION * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [consoleError, setConsoleError] = useState(null);

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) || null,
    [matches, selectedMatchId]
  );

  useEffect(() => {
    loadMatches();
  }, []);

  useEffect(() => {
    if (!selectedMatchId && matches.length > 0) {
      setSelectedMatchId(matches[0].id);
    }
  }, [matches, selectedMatchId]);

  useEffect(() => {
    if (selectedMatch) {
      setSetupForm({
        startTime: toDateTimeLocal(selectedMatch.start_time),
        startingTeamId:
          selectedMatch.starting_team_id ||
          selectedMatch.team_a?.id ||
          selectedMatch.team_b?.id ||
          "",
        abbaPattern: selectedMatch.abba_pattern || "ABBA",
      });
    } else {
      setSetupForm({
        startTime: toDateTimeLocal(),
        startingTeamId: "",
        abbaPattern: "ABBA",
      });
    }
  }, [selectedMatch]);

  useEffect(() => {
    if (activeMatch) {
      setScore({
        a: activeMatch.score_a ?? 0,
        b: activeMatch.score_b ?? 0,
      });
      setLogs([]);
      setTimerSeconds(DEFAULT_DURATION * 60);
      setTimerRunning(false);
    }
  }, [activeMatch]);

  const currentMatchName =
    activeMatch?.event?.name ||
    selectedMatch?.event?.name ||
    "Select a match to begin";
  const displayTeamA =
    activeMatch?.team_a?.name || selectedMatch?.team_a?.name || "Team A";
  const displayTeamB =
    activeMatch?.team_b?.name || selectedMatch?.team_b?.name || "Team B";
  const matchDuration = DEFAULT_DURATION;
  const consoleReady = Boolean(activeMatch);

  async function loadMatches() {
    setMatchesLoading(true);
    setMatchesError(null);
    try {
      const data = await getOpenMatches(12);
      setMatches(data);
    } catch (err) {
      setMatchesError(err.message || "Unable to load matches.");
    } finally {
      setMatchesLoading(false);
    }
  }

  async function handleInitialiseMatch(event) {
    event.preventDefault();
    if (!selectedMatch) return;
    if (!userId) {
      setConsoleError("You must be signed in to initialise a match.");
      return;
    }
    setInitialising(true);
    setConsoleError(null);
    try {
      const payload = {
        start_time: setupForm.startTime
          ? new Date(setupForm.startTime).toISOString()
          : new Date().toISOString(),
        starting_team_id:
          setupForm.startingTeamId ||
          selectedMatch.team_a?.id ||
          selectedMatch.team_b?.id,
        abba_pattern: setupForm.abbaPattern,
        scorekeeper: userId,
      };
      const updated = await initialiseMatch(selectedMatch.id, payload);
      setActiveMatch(updated);
      setMatches((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m))
      );
      await loadMatches();
    } catch (err) {
      setConsoleError(err.message || "Failed to initialise match.");
    } finally {
      setInitialising(false);
    }
  }

  function handleToggleTimer() {
    if (!consoleReady) return;
    if (timerSeconds === 0) {
      setTimerSeconds(matchDuration * 60);
    }
    setTimerRunning((prev) => !prev);
  }

  function handleResetTimer() {
    setTimerRunning(false);
    setTimerSeconds(matchDuration * 60);
  }

  function handleResetConsole() {
    if (!consoleReady) return;
    setScore({
      a: activeMatch?.score_a ?? 0,
      b: activeMatch?.score_b ?? 0,
    });
    setLogs([]);
    setTimerSeconds(matchDuration * 60);
    setTimerRunning(false);
  }

  async function handleAddScore(team) {
    if (!consoleReady) return;
    const newScoreA = team === "A" ? score.a + 1 : score.a;
    const newScoreB = team === "B" ? score.b + 1 : score.b;
    setScore({ a: newScoreA, b: newScoreB });
    setLogs((prev) => [
      {
        id: crypto.randomUUID(),
        team,
        timestamp: new Date().toISOString(),
        totalA: newScoreA,
        totalB: newScoreB,
      },
      ...prev,
    ]);
    if (activeMatch) {
      try {
        await updateScore(activeMatch.id, newScoreA, newScoreB);
      } catch (err) {
        console.error("Failed to sync score:", err.message);
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
              Backend workspace
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">
              Score keeper console
            </h1>
            <p className="text-sm text-slate-500 md:max-w-2xl">
              Select a match, initialise the setup, and capture every score in one StallCount-native
              interface.
            </p>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-brand-dark"
          >
            Back to admin hub
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 pb-16">
        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Matches ready to record</h2>
              <p className="text-sm text-slate-500">
                Filtered from the Supabase `matches` table. Select one to configure the console.
              </p>
            </div>
            <button
              type="button"
              onClick={loadMatches}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-brand/50 hover:text-brand-dark"
            >
              Refresh list
            </button>
          </div>
          {matchesLoading ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Loading matches...
            </div>
          ) : matchesError ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700">
              {matchesError}
            </div>
          ) : matches.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              No matches available. Create fixtures in Supabase to see them here.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {matches.map((match) => (
                <button
                  type="button"
                  key={match.id}
                  onClick={() => setSelectedMatchId(match.id)}
                  className={`rounded-3xl border bg-white p-5 text-left shadow-sm transition focus:outline-none ${
                    selectedMatchId === match.id
                      ? "border-brand/70 ring-2 ring-brand/30"
                      : "border-slate-200 hover:border-brand/40"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {match.event?.name || "Match"}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {match.team_a?.name || "Team A"} vs {match.team_b?.name || "Team B"}
                  </p>
                  <p className="text-xs text-slate-500">{formatMatchTime(match.start_time)}</p>
                  <div className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {match.status || "scheduled"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Match setup</h2>
              <p className="text-sm text-slate-500">
                Assign starting team, ABBA pattern, and kick-off time before going live.
              </p>
            </div>
            {initialising && (
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
                Initialising...
              </span>
            )}
          </div>
          {selectedMatch ? (
            <form className="mt-6 grid gap-5 md:grid-cols-2" onSubmit={handleInitialiseMatch}>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Teams
                  </p>
                  <p className="mt-2 text-sm text-slate-900">
                    {selectedMatch.team_a?.name || "Team A"} vs{" "}
                    {selectedMatch.team_b?.name || "Team B"}
                  </p>
                  {selectedMatch.venue?.name && (
                    <p className="text-xs text-slate-500">
                      Venue: {selectedMatch.venue.name}
                    </p>
                  )}
                </div>
                <label className="block text-sm font-medium text-slate-700">
                  Start time
                  <input
                    type="datetime-local"
                    name="startTime"
                    value={setupForm.startTime}
                    onChange={(event) =>
                      setSetupForm((prev) => ({ ...prev, startTime: event.target.value }))
                    }
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </label>
              </div>
              <div className="space-y-4">
                <fieldset className="rounded-2xl border border-slate-200 p-4">
                  <legend className="text-sm font-semibold text-slate-900">
                    Starting pull
                  </legend>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    {[selectedMatch.team_a, selectedMatch.team_b]
                      .filter(Boolean)
                      .map((team) => (
                        <label key={team.id} className="inline-flex items-center gap-2">
                          <input
                            type="radio"
                            name="startingTeam"
                            value={team.id}
                            checked={setupForm.startingTeamId === team.id}
                            onChange={(event) =>
                              setSetupForm((prev) => ({
                                ...prev,
                                startingTeamId: event.target.value,
                              }))
                            }
                          />
                          <span>{team.name}</span>
                        </label>
                      ))}
                  </div>
                </fieldset>
                <label className="block text-sm font-medium text-slate-700">
                  ABBA pattern
                  <select
                    name="abbaPattern"
                    value={setupForm.abbaPattern}
                    onChange={(event) =>
                      setSetupForm((prev) => ({ ...prev, abbaPattern: event.target.value }))
                    }
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  >
                    <option value="ABBA">ABBA</option>
                    <option value="BAAB">BAAB</option>
                    <option value="AABB">AABB</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={initialising}
                  className="inline-flex w-full items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Initialise match
                </button>
                {consoleError && (
                  <p className="text-xs text-rose-600">{consoleError}</p>
                )}
              </div>
            </form>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Select a match from the list above to configure it.
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card/40">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {currentMatchName}
              </p>
              <h2 className="text-xl font-semibold text-slate-900">
                {consoleReady
                  ? `${displayTeamA} vs ${displayTeamB}`
                  : "Select and initialise a match to begin"}
              </h2>
              {activeMatch?.venue?.name && (
                <p className="text-xs text-slate-500">
                  Venue: {activeMatch.venue.name}
                </p>
              )}
            </div>
            <div className="text-right text-sm text-slate-500">
              <p>Duration: {matchDuration} min</p>
              <p>Status: {consoleReady ? "Live" : "Awaiting setup"}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-[1.1fr,0.9fr]">
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase tracking-wide text-slate-500">Team A</span>
                  <p className="text-2xl font-semibold text-slate-900">{displayTeamA}</p>
                  <p className="mt-2 text-4xl font-semibold text-slate-900">{score.a}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs uppercase tracking-wide text-slate-500">Team B</span>
                  <p className="text-2xl font-semibold text-slate-900">{displayTeamB}</p>
                  <p className="mt-2 text-4xl font-semibold text-slate-900">{score.b}</p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleAddScore("A")}
                  disabled={!consoleReady}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand/40 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Add score {displayTeamA}
                </button>
                <button
                  type="button"
                  onClick={() => handleAddScore("B")}
                  disabled={!consoleReady}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand/40 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Add score {displayTeamB}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Game clock
              </p>
              <p className="mt-4 text-5xl font-semibold text-slate-900">
                {formatClock(timerSeconds)}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleToggleTimer}
                  disabled={!consoleReady}
                  className="inline-flex flex-1 items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {timerRunning ? "Pause" : "Start"} timer
                </button>
                <button
                  type="button"
                  onClick={handleResetTimer}
                  disabled={!consoleReady}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand/40 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reset
                </button>
              </div>
              <button
                type="button"
                onClick={handleResetConsole}
                disabled={!consoleReady}
                className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-brand/40 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset live console
              </button>
            </div>
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Score log</h3>
              <p className="text-xs text-slate-500">{logs.length} events</p>
            </div>
            {logs.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
                {consoleReady
                  ? "No scores yet. Log the first point using the buttons above."
                  : "Initialise a match to start logging scores."}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {logs.map((log) => (
                  <article
                    key={log.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {log.team === "A" ? displayTeamA : displayTeamB}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      {log.totalA} - {log.totalB}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatMatchTime(timestamp) {
  if (!timestamp) return "Start time pending";
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function toDateTimeLocal(value) {
  const date = value ? new Date(value) : new Date();
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}
