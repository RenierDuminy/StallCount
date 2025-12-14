import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getRecentMatches, getMatchById, updateMatchStatus } from "../services/matchService";
import { submitSpiritScores } from "../services/spiritScoreService";
import { Card, Panel, SectionHeader, SectionShell, Field, Input, Select, Textarea } from "../components/ui/primitives";

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
    <div className="pb-16 text-[var(--sc-surface-dark-ink)]" style={{ background: "var(--sc-surface-light-bg)" }}>
      <SectionShell as="header" className="py-4 sm:py-6">
        <Card variant="light" className="space-y-4 border border-[#041311] p-6 sm:p-7">
          <SectionHeader
            eyebrow="Spirit entry"
            title="Spirit scores"
            description="Capture spirit scores for both teams after the final whistle and submit them directly to the event database."
            action={
              <Link to="/score-keeper" className="sc-button is-dark">
                Back to score keeper
              </Link>
            }
          />
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-6">
        <Card as="section" variant="light" className="space-y-6 border border-[#041311] p-6 shadow-lg">
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
                  { submittedBy: userId ?? undefined },
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
            <Card variant="light" className="space-y-4 border border-[#041311] p-5 text-[var(--sc-surface-light-ink)]">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Match</p>
                <h2 className="text-2xl font-semibold">Select the match to score</h2>
                <p className="text-sm text-[var(--sc-surface-light-ink)]/80">Built for direct sunlight: higher contrast and neutral background.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Match" className="is-light">
                  {matchLoading ? (
                    <div className="rounded-xl border border-[var(--sc-surface-light-border)] bg-white/80 px-3 py-2 text-xs text-[var(--sc-surface-light-ink)]">
                      Loading matches...
                    </div>
                  ) : matchError ? (
                    <div className="sc-alert is-error">{matchError}</div>
                  ) : (
                    <Select className="is-light" value={selectedMatchId} onChange={(event) => setSelectedMatchId(event.target.value)}>
                      <option value="">Select a match...</option>
                      {matches.map((match) => (
                        <option key={match.id} value={match.id}>
                          {formatMatchLabel(match)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Match ID" htmlFor="spirit-match-id" className="is-light">
                  <Input
                    className="is-light"
                    id="spirit-match-id"
                    value={selectedMatchId}
                    onChange={(event) => setSelectedMatchId(event.target.value)}
                    placeholder="Enter match ID"
                  />
                </Field>
              </div>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              {["teamA", "teamB"].map((teamKey) => (
                <Panel key={teamKey} variant="light" className="space-y-4 border border-[#041311] p-4 shadow-md">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Spirit scores for</p>
                    <h3 className="text-lg font-semibold text-[var(--sc-surface-light-ink)]">
                      {teamKey === "teamA" ? teamLabels.teamA : teamLabels.teamB}
                    </h3>
                  </div>
                  {SPIRIT_CATEGORIES.map((category) => (
                    <label
                      key={`${teamKey}-${category.key}`}
                      className="block text-sm font-semibold text-[var(--sc-surface-light-ink)]"
                    >
                      <div className="flex items-center justify-between">
                        <span>{category.label}</span>
                        <span className="text-xs text-[var(--sc-surface-light-ink)]/70">
                          {teamScores[teamKey][category.key]}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="1"
                        value={teamScores[teamKey][category.key]}
                        onChange={(event) => updateScore(teamKey, category.key, event.target.value)}
                        className="mt-1 w-full"
                        style={{ accentColor: "#01611b" }}
                      />
                      <div className="flex justify-between text-[15px] text-[var(--sc-surface-light-ink)]/60">
                        <span>0</span>
                        <span>1</span>
                        <span>2</span>
                        <span>3</span>
                        <span>4</span>
                      </div>
                    </label>
                  ))}
                  <Field label="Notes" htmlFor={`${teamKey}-notes`} className="is-light">
                    <Textarea
                      className="is-light"
                      id={`${teamKey}-notes`}
                      rows={3}
                      value={teamScores[teamKey].notes}
                      onChange={(event) => updateNotes(teamKey, event.target.value)}
                    />
                  </Field>
                </Panel>
              ))}
            </div>

            {submitState.message && <div className={`sc-alert ${submitState.variant === "success" ? "is-success" : "is-error"}`}>{submitState.message}</div>}

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={submitting} className="sc-button is-dark disabled:cursor-not-allowed">
                {submitting ? "Submitting..." : "Submit spirit scores"}
              </button>
              <Link to="/score-keeper" className="sc-button is-dark">
                Cancel
              </Link>
            </div>
          </form>
        </Card>
      </SectionShell>
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
