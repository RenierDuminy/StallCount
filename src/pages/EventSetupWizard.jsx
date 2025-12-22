import { useEffect, useMemo, useState } from "react";
import { Card, Panel, SectionHeader, SectionShell, Chip } from "../components/ui/primitives";
import { getAllTeams } from "../services/teamService";

const STEPS = [
  { key: "event", title: "Event", description: "Baseline context" },
  { key: "divisions", title: "Divisions", description: "Competitive branches" },
  { key: "pools", title: "Pools", description: "Round-robin clusters" },
  { key: "teams", title: "Teams & matches", description: "Assignments + fixtures" },
];

const INITIAL_EVENT = { name: "", type: "tournament", start_date: "", end_date: "", location: "", notes: "" };
const matchStatuses = ["scheduled", "ready", "pending", "live", "finished"];
const createId = () => `tmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const Stepper = ({ current }) => (
  <ol className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
    {STEPS.map((step, index) => {
      const isActive = index === current;
      const isComplete = index < current;
      return (
        <li
          key={step.key}
          className={`flex items-center gap-2 rounded-full border px-3 py-1 ${
            isActive ? "border-ink bg-ink text-white" : "border-border bg-white/70 text-ink"
          }`}
        >
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              isActive ? "bg-white/20 text-white" : isComplete ? "bg-ink/10 text-ink" : "bg-ink/5 text-ink-muted"
            }`}
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
    <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
    <input className={`w-full rounded border border-border bg-white px-3 py-2 text-black ${className}`} {...props} />
  </label>
);

export default function EventSetupWizardPage() {
  const [step, setStep] = useState(0);
  const [event, setEvent] = useState(INITIAL_EVENT);
  const [divisions, setDivisions] = useState([]);
  const [divisionForm, setDivisionForm] = useState({ id: null, name: "", level: "" });
  const [poolForm, setPoolForm] = useState({ id: null, divisionId: "", name: "" });
  const [teamForm, setTeamForm] = useState({ id: null, poolId: "", name: "", seed: "" });
  const [matchForm, setMatchForm] = useState({ id: null, poolId: "", teamA: "", teamB: "", start: "", status: "scheduled" });

  const [teamOptions, setTeamOptions] = useState([]);
  const [teamOptionsError, setTeamOptionsError] = useState(null);
  const [teamOptionsLoading, setTeamOptionsLoading] = useState(false);

  const activeDivisionId = poolForm.divisionId || divisionForm.id || divisions[0]?.id || "";
  const activeDivision = divisions.find((division) => division.id === activeDivisionId) || null;
  const activePoolId = teamForm.poolId || matchForm.poolId || activeDivision?.pools?.[0]?.id || "";
  const activePool = divisions.flatMap((division) => division.pools || []).find((pool) => pool.id === activePoolId) || null;

  const updateEvent = (event) => {
    const { name, value } = event.target;
    setEvent((prev) => ({ ...prev, [name]: value }));
  };

  const upsertDivision = (payload) => {
    if (payload.id) {
      setDivisions((prev) => prev.map((division) => (division.id === payload.id ? { ...division, ...payload } : division)));
      return payload.id;
    }
    const id = createId();
    setDivisions((prev) => [...prev, { id, name: payload.name, level: payload.level, pools: [] }]);
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
            pools: pools.map((pool) => (pool.id === payload.id ? { ...pool, name: payload.name } : pool)),
          };
        }
        return { ...division, pools: [...pools, { id: createId(), name: payload.name, teams: [], matches: [] }] };
      }),
    );
  };

  const upsertPoolEntity = (poolId, updater) => {
    setDivisions((prev) =>
      prev.map((division) => ({
        ...division,
        pools: (division.pools || []).map((pool) => (pool.id === poolId ? updater(pool) : pool)),
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
    setPoolForm((prev) => (prev.id === poolId ? { id: null, divisionId: prev.divisionId, name: "" } : prev));
    setTeamForm((prev) => (prev.poolId === poolId ? { id: null, poolId: "", name: "", seed: "" } : prev));
    setMatchForm((prev) =>
      prev.poolId === poolId ? { id: null, poolId: "", teamA: "", teamB: "", start: "", status: "scheduled" } : prev,
    );
  };

  const handleDivisionSubmit = (event) => {
    event.preventDefault();
    const trimmed = divisionForm.name.trim();
    if (!trimmed) return;
    const id = upsertDivision({ ...divisionForm, name: trimmed });
    setDivisionForm({ id: null, name: "", level: "" });
    setPoolForm((prev) => ({ ...prev, divisionId: id }));
  };

  const handlePoolSubmit = (event) => {
    event.preventDefault();
    const divisionId = poolForm.divisionId || activeDivision?.id;
    const name = poolForm.name.trim();
    if (!divisionId || !name) return;
    upsertPool(divisionId, poolForm.id ? poolForm : { name });
    setPoolForm({ id: null, divisionId, name: "" });
  };

  const handleTeamSubmit = (event) => {
    event.preventDefault();
    const name = teamForm.name.trim();
    const poolId = teamForm.poolId || activePool?.id;
    if (!poolId || !name) return;
    upsertPoolEntity(poolId, (pool) => {
      const teams = pool.teams || [];
      if (teamForm.id) {
        return { ...pool, teams: teams.map((team) => (team.id === teamForm.id ? { ...team, name, seed: teamForm.seed } : team)) };
      }
      return { ...pool, teams: [...teams, { id: createId(), name, seed: teamForm.seed }] };
    });
    setTeamForm({ id: null, poolId, name: "", seed: "" });
  };

  const handleMatchSubmit = (event) => {
    event.preventDefault();
    const poolId = matchForm.poolId || activePool?.id;
    const teamA = matchForm.teamA.trim();
    const teamB = matchForm.teamB.trim();
    if (!poolId || !teamA || !teamB) return;
    upsertPoolEntity(poolId, (pool) => {
      const matches = pool.matches || [];
      const next = { id: matchForm.id || createId(), teamA, teamB, start: matchForm.start, status: matchForm.status };
      if (matchForm.id) {
        return { ...pool, matches: matches.map((match) => (match.id === matchForm.id ? next : match)) };
      }
      return { ...pool, matches: [...matches, next] };
    });
    setMatchForm({ id: null, poolId, teamA: "", teamB: "", start: "", status: "scheduled" });
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

  const summary = useMemo(() => {
    const poolCount = divisions.reduce((total, division) => total + (division.pools?.length || 0), 0);
    const teamCount = divisions.reduce(
      (total, division) => total + (division.pools || []).reduce((bucket, pool) => bucket + (pool.teams?.length || 0), 0),
      0,
    );
    const matchCount = divisions.reduce(
      (total, division) => total + (division.pools || []).reduce((bucket, pool) => bucket + (pool.matches?.length || 0), 0),
      0,
    );
    return { poolCount, teamCount, matchCount };
  }, [divisions]);

  const renderEventStep = () => (
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
            />
          ))}
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-xs uppercase tracking-wide text-ink-muted">Notes</span>
          <textarea
            name="notes"
            value={event.notes}
            onChange={updateEvent}
            className="min-h-[120px] w-full rounded border border-border bg-white px-3 py-2 text-black"
          />
        </label>
      </div>
    </Panel>
  );

  const renderDivisionsStep = () => (
    <div className="grid gap-6 md:grid-cols-[320px,1fr]">
      <Panel variant="muted" className="space-y-3 p-4">
        <SectionHeader eyebrow="Divisions" title="Add or edit" />
        <form className="space-y-3" onSubmit={handleDivisionSubmit}>
          <TextField label="Name" value={divisionForm.name} onChange={(event) => setDivisionForm((prev) => ({ ...prev, name: event.target.value }))} />
          <TextField label="Level" value={divisionForm.level} onChange={(event) => setDivisionForm((prev) => ({ ...prev, level: event.target.value }))} />
          <button type="submit" className="sc-button w-full">{divisionForm.id ? "Save" : "Add division"}</button>
        </form>
      </Panel>
      <div className="space-y-3">
        {divisions.length === 0 ? (
          <Panel variant="muted" className="p-4 text-sm text-ink-muted">No divisions yet.</Panel>
        ) : (
          divisions.map((division) => (
            <Panel key={division.id} variant="tinted" className="flex items-center justify-between p-4">
              <div>
                <p className="font-semibold">{division.name}</p>
                <p className="text-xs text-ink-muted">
                  Level {division.level || "N/A"} - Pools {division.pools?.length || 0}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="sc-button is-ghost" onClick={() => setDivisionForm({ id: division.id, name: division.name, level: division.level || "" })}>Edit</button>
                <button type="button" className="sc-button is-destructive" onClick={() => setDivisions((prev) => prev.filter((entry) => entry.id !== division.id))}>Delete</button>
              </div>
            </Panel>
          ))
        )}
      </div>
    </div>
  );

  const renderPoolsStep = () => (
    <div className="grid gap-6 md:grid-cols-[320px,1fr]">
      <Panel variant="muted" className="space-y-3 p-4">
        <SectionHeader eyebrow="Pools" title="Within division" />
        <form className="space-y-3" onSubmit={handlePoolSubmit}>
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">Division</span>
            <select
              className="w-full rounded border border-border bg-white px-3 py-2 text-black"
              value={poolForm.divisionId || activeDivision?.id || ""}
              onChange={(event) => setPoolForm((prev) => ({ ...prev, divisionId: event.target.value }))}
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
            onChange={(event) => setPoolForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <button type="submit" className="sc-button w-full">
            {poolForm.id ? "Save" : "Add pool"}
          </button>
        </form>
      </Panel>
      <div className="space-y-3">
        {!activeDivision ? (
          <Panel variant="muted" className="p-4 text-sm text-ink-muted">Select a division.</Panel>
        ) : (
          (activeDivision.pools || []).map((pool) => (
            <Panel key={pool.id} variant="tinted" className="flex items-center justify-between p-4">
              <div>
                <p className="font-semibold">{pool.name}</p>
                <p className="text-xs text-ink-muted">Teams {pool.teams?.length || 0} ? Matches {pool.matches?.length || 0}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="sc-button is-ghost" onClick={() => setPoolForm({ id: pool.id, divisionId: activeDivision.id, name: pool.name })}>Edit</button>
                <button type="button" className="sc-button is-destructive" onClick={() => removePool(pool.id)}>
                  Delete
                </button>
              </div>
            </Panel>
          ))
        )}
      </div>
    </div>
  );

  const renderTeamsStep = () => (
    <div className="space-y-4">
      {teamOptionsLoading && (
        <div className="text-xs uppercase tracking-wide text-ink-muted">Loading team directory...</div>
      )}
      {teamOptionsError && <div className="sc-alert is-error text-xs">{teamOptionsError}</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel variant="muted" className="space-y-3 p-4">
          <SectionHeader eyebrow="Teams" title={activePool ? `Pool ${activePool.name}` : "Select a pool"} />
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">Pool</span>
            <select
              className="w-full rounded border border-border bg-white px-3 py-2 text-black"
              value={teamForm.poolId || activePool?.id || ""}
              onChange={(event) => setTeamForm((prev) => ({ ...prev, poolId: event.target.value }))}
            >
              <option value="">Select pool</option>
              {divisions.flatMap((division) => division.pools || []).map((pool) => (
                <option key={pool.id} value={pool.id}>{pool.name}</option>
              ))}
            </select>
          </label>
          <TextField
            label="Team name"
            value={teamForm.name}
            onChange={(event) => setTeamForm((prev) => ({ ...prev, name: event.target.value }))}
            list="team-options-list"
            autoComplete="off"
            placeholder="Search teams..."
          />
          <TextField label="Seed" value={teamForm.seed} onChange={(event) => setTeamForm((prev) => ({ ...prev, seed: event.target.value }))} />
          <button type="button" className="sc-button w-full" onClick={handleTeamSubmit}>{teamForm.id ? "Save team" : "Add team"}</button>
          <div className="space-y-2">
            {!activePool || (activePool.teams || []).length === 0 ? (
              <p className="text-xs text-ink-muted">No teams yet.</p>
            ) : (
              activePool.teams.map((team) => (
                <div key={team.id} className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm">
                  <span>{team.name} ? Seed {team.seed || "--"}</span>
                  <div className="flex gap-2">
                    <button type="button" className="sc-button is-ghost" onClick={() => setTeamForm({ id: team.id, poolId: activePool.id, name: team.name, seed: team.seed || "" })}>Edit</button>
                    <button type="button" className="sc-button is-destructive" onClick={() => upsertPoolEntity(activePool.id, (pool) => ({ ...pool, teams: (pool.teams || []).filter((entry) => entry.id !== team.id) }))}>Delete</button>
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
                onChange={(event) => setMatchForm((prev) => ({ ...prev, teamA: event.target.value }))}
                list="team-options-list"
                autoComplete="off"
                placeholder="Search teams..."
              />
              <TextField
                label="Team B"
                value={matchForm.teamB}
                onChange={(event) => setMatchForm((prev) => ({ ...prev, teamB: event.target.value }))}
                list="team-options-list"
                autoComplete="off"
                placeholder="Search teams..."
              />
            </div>
          <TextField label="Start" type="datetime-local" value={matchForm.start} onChange={(event) => setMatchForm((prev) => ({ ...prev, start: event.target.value }))} />
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted">Status</span>
            <select
              className="w-full rounded border border-border bg-white px-3 py-2 text-black"
              value={matchForm.status}
              onChange={(event) => setMatchForm((prev) => ({ ...prev, status: event.target.value }))}
            >
              {matchStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <button type="button" className="sc-button w-full" onClick={handleMatchSubmit}>{matchForm.id ? "Save match" : "Add match"}</button>
          <div className="space-y-2">
            {!activePool || (activePool.matches || []).length === 0 ? (
              <p className="text-xs text-ink-muted">No matches yet.</p>
            ) : (
              activePool.matches.map((match) => (
                <div key={match.id} className="rounded border border-border px-3 py-2 text-sm">
                  <p className="font-semibold">{match.teamA} vs {match.teamB}</p>
                    <p className="text-xs text-ink-muted">
                      {match.status} - {match.start || "TBD"}
                    </p>
                  <div className="mt-1 flex gap-2">
                    <button type="button" className="sc-button is-ghost" onClick={() => setMatchForm({ id: match.id, poolId: activePool.id, teamA: match.teamA, teamB: match.teamB, start: match.start || "", status: match.status })}>Edit</button>
                    <button type="button" className="sc-button is-destructive" onClick={() => upsertPoolEntity(activePool.id, (pool) => ({ ...pool, matches: (pool.matches || []).filter((entry) => entry.id !== match.id) }))}>Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
      <datalist id="team-options-list">
        {teamOptions.map((team) => (
          <option
            key={team.id}
            value={
              team.short_name
                ? `${team.name} (${team.short_name})`
                : team.name
            }
          />
        ))}
      </datalist>
    </div>
  );

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
      default:
        return null;
    }
  };

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-6">
        <Card className="space-y-4 p-6 sm:p-8">
          <SectionHeader eyebrow="Admin" title="Event setup wizard" description="Walk through event creation from high level to granular pools." />
          <Stepper current={step} />
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-6">
        <Card className="space-y-6 p-6 sm:p-8">
          <SectionHeader eyebrow={`Step ${step + 1} of ${STEPS.length}`} title={STEPS[step].title} description={STEPS[step].description} />
          {renderStep()}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs uppercase tracking-wide text-ink-muted">
            <span>
              Divisions {divisions.length} - Pools {summary.poolCount} - Teams {summary.teamCount} - Matches {summary.matchCount}
            </span>
            <div className="flex gap-2">
              <button type="button" className="sc-button is-ghost" disabled={step === 0} onClick={() => setStep((prev) => Math.max(0, prev - 1))}>Back</button>
              <button type="button" className="sc-button" disabled={step === STEPS.length - 1} onClick={() => setStep((prev) => Math.min(STEPS.length - 1, prev + 1))}>{step === STEPS.length - 1 ? "Review" : "Next"}</button>
            </div>
          </div>
        </Card>

        <Card className="space-y-3 p-6">
          <SectionHeader eyebrow="Blueprint" title={event.name || "Untitled event"} description="Share this outline with the tournament crew." />
          {divisions.length === 0 ? (
            <Panel variant="muted" className="p-4 text-sm text-ink-muted">Add divisions to build the blueprint.</Panel>
          ) : (
            divisions.map((division) => (
              <Panel key={division.id} variant="tinted" className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{division.name}</p>
                  <Chip>{division.pools?.length || 0} pools</Chip>
                </div>
                {(division.pools || []).map((pool) => (
                  <div key={pool.id} className="rounded border border-border p-3 text-sm">
                    <p className="font-semibold">{pool.name}</p>
                    <p className="text-xs text-ink-muted">Teams {pool.teams?.length || 0} ? Matches {pool.matches?.length || 0}</p>
                  </div>
                ))}
              </Panel>
            ))
          )}
        </Card>
      </SectionShell>
    </div>
  );
}
