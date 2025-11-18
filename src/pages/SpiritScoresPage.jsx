import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getRecentMatches, getMatchById, updateMatchStatus } from "../services/matchService";
import { submitSpiritScores } from "../services/spiritScoreService";

const SPIRIT_CATEGORIES = [
  { key: "rulesKnowledge", label: "Rules knowledge & use" },
  { key: "fouls", label: "Fouls & body contact" },
  { key: "fairness", label: "Fair-mindedness" },
  { key: "positiveAttitude", label: "Positive attitude" },
  { key: "communication", label: "Communication" },
];

const createDefaultScores = () => ({
  rulesKnowledge: 2,
  fouls: 2,
  fairness: 2,
  positiveAttitude: 2,
  communication: 2,
  notes: "",
});

export default function SpiritScoresPage() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [searchParams] = useSearchParams();
  const prefilledMatchId = searchParams.get("matchId") || "";

  const [selectedMatchId, setSelectedMatchId] = useState(prefilledMatchId);
  const [matches, setMatches] = useState([]);
  const [matchLoading, setMatchLoading] = useState(true);
  const [matchError, setMatchError] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [teamScores, setTeamScores] = useState({
    teamA: createDefaultScores(),
    teamB: createDefaultScores(),
  });
  const [submitState, setSubmitState] = useState({ message: null, variant: null });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadMatches() {
      setMatchLoading(true);
      setMatchError(null);
      try {
        const recent = await getRecentMatches(30);
        setMatches(recent ?? []);
      } catch (err) {
        setMatchError(err.message || "Unable to load match list.");
      } finally {
        setMatchLoading(false);
      }
    }
    loadMatches();
  }, []);

  useEffect(() => {
    if (!selectedMatchId) {
      setSelectedMatch(null);
      return;
    }

    const cached = matches.find((match) => match.id === selectedMatchId);
    if (cached) {
      setSelectedMatch(cached);
      return;
    }

    let ignore = false;
    async function fetchMatch() {
      try {
        const match = await getMatchById(selectedMatchId);
        if (!ignore) {
          setSelectedMatch(match);
        }
      } catch (err) {
        if (!ignore) {
          setMatchError(err.message || "Unable to load the selected match.");
          setSelectedMatch(null);
        }
      }
    }
    fetchMatch();
    return () => {
      ignore = true;
    };
  }, [selectedMatchId, matches]);

  const teamLabels = useMemo(() => {
    return {
      teamA: selectedMatch?.team_a?.name || "Team A",
      teamB: selectedMatch?.team_b?.name || "Team B",
    };
  }, [selectedMatch]);

  const updateScore = (teamKey, field, value) => {
    setTeamScores((prev) => ({
      ...prev,
      [teamKey]: {
        ...prev[teamKey],
        [field]: Math.min(4, Math.max(0, Number(value) || 0)),
      },
    }));
  };

  const updateNotes = (teamKey, value) => {
    setTeamScores((prev) => ({
      ...prev,
      [teamKey]: {
        ...prev[teamKey],
        notes: value,
      },
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Spirit entry
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">Spirit scores</h1>
            <p className="mt-2 text-sm text-slate-600">
              Capture spirit scores for both teams after the final whistle and submit them directly to the event database.
            </p>
          </div>
          <Link
            to="/score-keeper"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
          >
            Back to score keeper
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <form
            className="space-y-8"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!selectedMatchId) {
                setSubmitState({ message: "Select a match before submitting.", variant: "error" });
                return;
              }
              if (!selectedMatch?.team_a?.id || !selectedMatch?.team_b?.id) {
                setSubmitState({
                  message: "The selected match is missing team assignments.",
                  variant: "error",
                });
                return;
              }

              setSubmitting(true);
              setSubmitState({ message: null, variant: null });

              try {
                const buildEntry = (teamKey, ratedTeamId) => ({
                  ratedTeamId,
                  rulesKnowledge: teamScores[teamKey].rulesKnowledge,
                  fouls: teamScores[teamKey].fouls,
                  fairness: teamScores[teamKey].fairness,
                  positiveAttitude: teamScores[teamKey].positiveAttitude,
                  communication: teamScores[teamKey].communication,
                  notes: teamScores[teamKey].notes,
                });

                await submitSpiritScores(
                  selectedMatchId,
                  [
                    buildEntry("teamA", selectedMatch.team_a.id),
                    buildEntry("teamB", selectedMatch.team_b.id),
                  ],
                  { submittedBy: userId ?? undefined }
                );

                await updateMatchStatus(selectedMatchId, "completed");

                setSubmitState({
                  message: "Spirit scores submitted successfully.",
                  variant: "success",
                });
              } catch (err) {
                setSubmitState({
                  message: err instanceof Error ? err.message : "Failed to submit spirit scores.",
                  variant: "error",
                });
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">
                Match
                {matchLoading ? (
                  <p className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Loading matches...
                  </p>
                ) : matchError ? (
                  <p className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                    {matchError}
                  </p>
                ) : (
                  <select
                    value={selectedMatchId}
                    onChange={(event) => setSelectedMatchId(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-brand focus:outline-none"
                  >
                    <option value="">Select a match…</option>
                    {matches.map((match) => (
                      <option key={match.id} value={match.id}>
                        {formatMatchLabel(match)}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Match ID
                <input
                  value={selectedMatchId}
                  onChange={(event) => setSelectedMatchId(event.target.value)}
                  placeholder="Enter match ID"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </label>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {["teamA", "teamB"].map((teamKey) => (
                <div
                  key={teamKey}
                  className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Spirit scores for
                    </p>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {teamKey === "teamA" ? teamLabels.teamA : teamLabels.teamB}
                    </h3>
                  </div>
                  {SPIRIT_CATEGORIES.map((category) => (
                    <label key={`${teamKey}-${category.key}`} className="block text-sm font-semibold text-slate-700">
                      <div className="flex items-center justify-between">
                        <span>{category.label}</span>
                        <span className="text-xs text-slate-500">{teamScores[teamKey][category.key]}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="1"
                        value={teamScores[teamKey][category.key]}
                        onChange={(event) => updateScore(teamKey, category.key, event.target.value)}
                        className="mt-1 w-full accent-brand"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>0</span>
                        <span>1</span>
                        <span>2</span>
                        <span>3</span>
                        <span>4</span>
                      </div>
                    </label>
                  ))}
                  <label className="text-sm font-semibold text-slate-700">
                    Notes
                    <textarea
                      rows={3}
                      value={teamScores[teamKey].notes}
                      onChange={(event) => updateNotes(teamKey, event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none"
                    />
                  </label>
                </div>
              ))}
            </div>

            {submitState.message && (
              <p
                className={`rounded-2xl px-3 py-2 text-sm ${
                  submitState.variant === "success"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {submitState.message}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "Submit spirit scores"}
              </button>
              <Link
                to="/score-keeper"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
              >
                Cancel
              </Link>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

function formatMatchLabel(match) {
  const teamA = match.team_a?.short_name || match.team_a?.name || "Team A";
  const teamB = match.team_b?.short_name || match.team_b?.name || "Team B";
  const kickoff = match.start_time
    ? new Date(match.start_time).toLocaleString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Time TBD";
  return `${kickoff} - ${teamA} vs ${teamB}`;
}
