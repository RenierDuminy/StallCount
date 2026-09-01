// Player de-duplication console.
//
// Search -> select the variants -> compare them side by side -> pick the one to
// keep -> preview exactly how many rows will be rewritten -> merge.
//
// The merge itself lives in playerMergeService.js, which documents why the five
// referencing tables need three different strategies. This file is the workflow
// and the confirmation gate around it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Panel, SectionHeader, SectionShell, Chip } from "../components/ui/primitives";
import { describeError } from "../utils/errorMessages";
import {
  buildMergePlan,
  getPlayerComparisonProfile,
  mergePlayers,
  preflightMergePermissions,
  searchPlayersByName,
} from "../services/playerMergeService";

const INPUT_CLASS =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm focus:border-border-strong focus:outline-none";

// Rows of the comparison table. Each pulls one field off a profile so the table
// can be rendered as "metric down the side, player across the top".
const COMPARISON_ROWS = [
  { key: "name", label: "Name", get: (p) => p.player.name },
  { key: "id", label: "Player ID", get: (p) => p.player.id, mono: true },
  { key: "gender", label: "Gender", get: (p) => p.player.gender_code || "—" },
  { key: "jersey", label: "Jersey", get: (p) => p.player.jersey_number ?? "—" },
  { key: "birthday", label: "Birthday", get: (p) => p.player.birthday || "—" },
  { key: "created", label: "Date created", get: (p) => formatDate(p.player.created_at) },
  { key: "updated", label: "Last updated", get: (p) => formatDate(p.player.updated_at) },
  { key: "events", label: "Events participated", get: (p) => p.eventCount, numeric: true },
  { key: "rosters", label: "Roster features", get: (p) => p.rosterCount, numeric: true },
  { key: "statMatches", label: "Matches with stats", get: (p) => p.matchesWithStats, numeric: true },
  { key: "goals", label: "Scores (goals)", get: (p) => p.goals, numeric: true },
  { key: "assists", label: "Assists", get: (p) => p.assists, numeric: true },
  { key: "blocks", label: "Blocks", get: (p) => p.blocks, numeric: true },
  { key: "turnovers", label: "Turns", get: (p) => p.turnovers, numeric: true },
  {
    key: "logs",
    label: "Match log mentions",
    get: (p) => p.matchLogActorCount + p.matchLogAssistCount,
    numeric: true,
  },
  { key: "description", label: "Description", get: (p) => p.player.description || "—" },
];

function formatDate(iso) {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function PlayerMergePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searched, setSearched] = useState(false);

  // Selected players, keyed by id, holding the loaded comparison profile.
  const [profiles, setProfiles] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [profileError, setProfileError] = useState("");
  const [loadingIds, setLoadingIds] = useState([]);

  const [keeperId, setKeeperId] = useState("");
  const [reason, setReason] = useState("");

  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  // The plan is kept after a selection change but flagged stale, so the confirm
  // controls stay on screen with a visible reason instead of disappearing.
  const [planStale, setPlanStale] = useState(false);
  const [preflight, setPreflight] = useState(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [planError, setPlanError] = useState("");

  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [mergeResult, setMergeResult] = useState(null);
  const resultRef = useRef(null);

  // The outcome panel sits at the top of the page; after a merge the operator is
  // at the bottom next to the button. Bring the result to them.
  useEffect(() => {
    if (mergeResult || mergeError) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [mergeError, mergeResult]);

  const selectedProfiles = useMemo(
    () => selectedIds.map((id) => profiles[id]).filter(Boolean),
    [profiles, selectedIds],
  );
  const keeperProfile = keeperId ? profiles[keeperId] : null;
  const duplicateIds = useMemo(
    () => selectedIds.filter((id) => id !== keeperId),
    [keeperId, selectedIds],
  );

  // Any change to the selection invalidates a plan built against the old one.
  //
  // This used to setPlan(null), which made the entire confirm block — checkbox,
  // name field and Merge button — silently vanish whenever the operator picked
  // a survivor or ticked another player after previewing. It reads as "the merge
  // button doesn't work". Keep the plan visible but mark it stale, so the reason
  // is on screen and re-previewing is one obvious click.
  const resetPlan = useCallback(() => {
    setPlanStale(true);
    setPlanError("");
    setConfirmChecked(false);
    setConfirmName("");
    setMergeError("");
  }, []);

  const handleSearch = useCallback(
    async (event) => {
      event?.preventDefault();
      const term = searchTerm.trim();
      if (!term) return;
      setSearching(true);
      setSearchError("");
      try {
        setResults(await searchPlayersByName(term));
        setSearched(true);
      } catch (err) {
        setSearchError(describeError(err, { action: "Search players", technical: true }));
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [searchTerm],
  );

  const handleToggle = useCallback(
    async (playerId) => {
      resetPlan();
      setMergeResult(null);

      if (selectedIds.includes(playerId)) {
        setSelectedIds((prev) => prev.filter((id) => id !== playerId));
        if (keeperId === playerId) setKeeperId("");
        return;
      }

      setSelectedIds((prev) => [...prev, playerId]);

      // Profiles are fetched once and kept; re-ticking a player is instant.
      if (profiles[playerId]) return;

      setLoadingIds((prev) => [...prev, playerId]);
      setProfileError("");
      try {
        const profile = await getPlayerComparisonProfile(playerId);
        setProfiles((prev) => ({ ...prev, [playerId]: profile }));
      } catch (err) {
        setProfileError(describeError(err, { action: "Load player details", technical: true }));
        setSelectedIds((prev) => prev.filter((id) => id !== playerId));
      } finally {
        setLoadingIds((prev) => prev.filter((id) => id !== playerId));
      }
    },
    [keeperId, profiles, resetPlan, selectedIds],
  );

  // Probes each write the merge needs, with writes that change nothing, so an
  // RLS block is found before the first destructive step rather than halfway in.
  const handlePreflight = useCallback(async () => {
    setPreflightLoading(true);
    setPreflight(null);
    try {
      setPreflight(await preflightMergePermissions({ keeperId, duplicateIds }));
    } catch (err) {
      setPreflight({
        ok: false,
        checks: [],
        failures: [{ table: "—", operation: "preflight", message: String(err?.message || err) }],
      });
    } finally {
      setPreflightLoading(false);
    }
  }, [duplicateIds, keeperId]);

  const handleBuildPlan = useCallback(async () => {
    setPlanLoading(true);
    setPlanError("");
    setMergeError("");
    setConfirmChecked(false);
    setConfirmName("");
    try {
      setPlan(await buildMergePlan({ keeperId, duplicateIds }));
      setPlanStale(false);
    } catch (err) {
      setPlan(null);
      setPlanStale(false);
      setPlanError(describeError(err, { action: "Build merge preview", technical: true }));
    } finally {
      setPlanLoading(false);
    }
  }, [duplicateIds, keeperId]);

  const handleMerge = useCallback(async () => {
    // Unconditional, before any guard: if this line is absent from the console
    // the click never reached the handler, which means the button was disabled
    // rather than the merge failing. That distinction is the whole diagnosis.
    console.info("[player-merge] merge clicked", { keeperId, duplicateIds });
    setMerging(true);
    setMergeError("");
    try {
      const result = await mergePlayers({
        keeperId,
        duplicateIds,
        reason,
        snapshots: {
          keeper: keeperProfile?.player ?? null,
          losers: duplicateIds.map((id) => profiles[id]?.player).filter(Boolean),
        },
      });
      setMergeResult({
        ...result,
        keptName: keeperProfile?.player?.name ?? "",
        mergedCount: duplicateIds.length,
      });
      // The merged-away players no longer exist; clear them out of the workspace
      // so the page cannot be used to merge a deleted id a second time.
      setProfiles((prev) => {
        const next = { ...prev };
        duplicateIds.forEach((id) => delete next[id]);
        return next;
      });
      setResults((prev) => prev.filter((row) => !duplicateIds.includes(row.id)));
      setSelectedIds([]);
      setKeeperId("");
      setPlan(null);
      setPlanStale(false);
      setConfirmChecked(false);
      setConfirmName("");
      setReason("");
    } catch (err) {
      // Show the raw message, not describeError's rewrite. These errors are
      // written for the operator and name the exact table, column and PostgREST
      // code — and describeError only passes an authored message through when it
      // is under 200 chars, which these deliberately are not.
      console.error("[player-merge] failed", err);
      setMergeError(
        String(err?.message || describeError(err, { action: "Merge players", technical: true })),
      );
    } finally {
      setMerging(false);
    }
  }, [duplicateIds, keeperId, keeperProfile, profiles, reason]);

  const nameMatches =
    Boolean(keeperProfile) &&
    confirmName.trim().toLowerCase() === String(keeperProfile.player.name || "").trim().toLowerCase();
  const planHasBlockers = Boolean(plan?.blocked?.length);
  const canMerge =
    Boolean(plan) &&
    !planStale &&
    !planHasBlockers &&
    Boolean(keeperId) &&
    duplicateIds.length > 0 &&
    confirmChecked &&
    nameMatches &&
    !merging;

  return (
    <div className="min-h-screen bg-surface text-ink">
      <SectionShell as="header" className="py-8">
        <Card className="space-y-5 p-6 sm:p-8 shadow-xl shadow-[rgba(8,25,21,0.08)]">
          <SectionHeader
            eyebrow="System admin"
            eyebrowVariant="tag"
            title="Player de-duplication"
            description="Find the variants of one person, compare them, then fold them into a single player record. Every reference is repointed before the duplicates are removed."
            action={
              <div className="flex flex-wrap gap-2">
                <Link to="/sys-admin" className="sc-button">
                  Back to sys admin
                </Link>
              </div>
            }
          />
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-6 pb-16">
        {mergeResult && (
          <div ref={resultRef} className="sc-alert is-success space-y-2">
            <p>
              Merged {mergeResult.mergedCount} duplicate
              {mergeResult.mergedCount === 1 ? "" : "s"} into {mergeResult.keptName}.
            </p>
            <ul className="space-y-0.5 text-xs font-normal text-ink-muted">
              {mergeResult.steps.map((step, index) => (
                <li key={`${step.table}-${step.action}-${index}`}>
                  <code className="font-mono text-ink">{step.table}</code> — {step.action}
                  {typeof step.repointed === "number" ? ` · ${step.repointed} repointed` : ""}
                  {typeof step.collapsed === "number" ? ` · ${step.collapsed} collapsed` : ""}
                  {typeof step.updated === "number" ? ` · ${step.updated} totalled` : ""}
                  {typeof step.inserted === "number" ? ` · ${step.inserted} moved` : ""}
                  {typeof step.deleted === "number" ? ` · ${step.deleted} removed` : ""}
                  {typeof step.count === "number" ? ` · ${step.count} rows` : ""}
                </li>
              ))}
            </ul>
            {mergeResult.auditError && (
              <p className="text-xs font-normal text-warning-ink">
                The merge succeeded but the audit entry failed: {mergeResult.auditError}
              </p>
            )}
          </div>
        )}

        {/* 1 — Search */}
        <Card className="space-y-4 p-4 sm:p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
          <SectionHeader
            eyebrow="Step 1"
            eyebrowVariant="tag"
            title="Find the player"
            description="Search the whole directory by name. Duplicates usually come from different events, so the search is not event-scoped."
          />
          <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Name contains</p>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="e.g. Jansen"
                className={`${INPUT_CLASS} mt-1 w-full`}
              />
            </div>
            <button type="submit" className="sc-button" disabled={searching || !searchTerm.trim()}>
              {searching ? "Searching..." : "Search"}
            </button>
          </form>

          {searchError && (
            <div className="sc-alert is-error">
              {searchError}
            </div>
          )}
          {profileError && (
            <div className="sc-alert is-error">
              {profileError}
            </div>
          )}

          {searched && results.length === 0 && !searching && (
            <p className="text-sm text-ink-muted">No players match that name.</p>
          )}

          {results.length > 0 && (
            <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {results.map((row) => {
                const checked = selectedIds.includes(row.id);
                const loading = loadingIds.includes(row.id);
                return (
                  <label
                    key={row.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-surface-muted ${
                      checked ? "bg-surface-muted" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={loading}
                      onChange={() => handleToggle(row.id)}
                    />
                    <span className="font-semibold">{row.name}</span>
                    <span className="text-xs text-ink-muted">
                      {row.gender_code || "—"} · #{row.jersey_number ?? "—"} ·{" "}
                      {row.birthday || "no birthday"}
                    </span>
                    <span className="ml-auto font-mono text-[11px] text-ink-muted">{row.id}</span>
                    {loading && <span className="text-xs text-ink-muted">Loading...</span>}
                  </label>
                );
              })}
            </div>
          )}
        </Card>

        {/* 2 — Compare */}
        {selectedProfiles.length > 0 && (
          <Card className="space-y-4 p-4 sm:p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
            <SectionHeader
              eyebrow="Step 2"
              eyebrowVariant="tag"
              title="Compare the variants"
              description="One column per player. Pick the row that should survive — the others are folded into it."
            />
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Field
                    </th>
                    {selectedProfiles.map((profile) => {
                      const isKeeper = profile.player.id === keeperId;
                      return (
                        <th
                          key={profile.player.id}
                          className={`min-w-[200px] px-3 py-2 text-left align-top ${
                            isKeeper
                              ? "bg-[var(--sc-alert-success-bg)] border-x border-[var(--sc-alert-success-border)]"
                              : ""
                          }`}
                        >
                          <div className="space-y-2">
                            <p className="text-sm font-semibold text-ink">{profile.player.name}</p>
                            <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                              <input
                                type="radio"
                                name="keeper"
                                checked={isKeeper}
                                onChange={() => {
                                  setKeeperId(profile.player.id);
                                  resetPlan();
                                }}
                              />
                              Keep this one
                            </label>
                            {isKeeper && <Chip variant="tag">Survivor</Chip>}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {COMPARISON_ROWS.map((rowDef) => {
                    // Highlight rows where the variants disagree — those are the
                    // fields worth reading before choosing.
                    const values = selectedProfiles.map((profile) => rowDef.get(profile));
                    const differs = new Set(values.map((value) => String(value))).size > 1;
                    return (
                      <tr key={rowDef.key} className={differs ? "bg-warning-bg" : ""}>
                        <td
                          className={`sticky left-0 z-10 px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
                            differs ? "bg-surface text-warning-ink" : "bg-surface text-ink-muted"
                          }`}
                        >
                          {rowDef.label}
                        </td>
                        {selectedProfiles.map((profile, index) => (
                          <td
                            key={profile.player.id}
                            className={`px-3 py-2 align-top text-ink ${
                              profile.player.id === keeperId
                                ? "bg-[var(--sc-alert-success-bg)] border-x border-[var(--sc-alert-success-border)]"
                                : ""
                            } ${rowDef.mono ? "font-mono text-[11px]" : ""} ${
                              rowDef.numeric ? "tabular-nums" : ""
                            }`}
                          >
                            {String(values[index])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-muted">
              Highlighted rows differ between the selected players. Counters are summed on merge, so
              differing stat rows are combined rather than overwritten.
            </p>
          </Card>
        )}

        {/* 3 — Preview and merge */}
        {keeperId && duplicateIds.length > 0 && (
          <Card className="space-y-4 p-4 sm:p-6 shadow-md shadow-[rgba(8,25,21,0.06)]">
            <SectionHeader
              eyebrow="Step 3"
              eyebrowVariant="tag"
              title="Preview and merge"
              description={`Fold ${duplicateIds.length} duplicate${
                duplicateIds.length === 1 ? "" : "s"
              } into ${keeperProfile?.player?.name ?? "the kept player"}.`}
              action={
                <button
                  type="button"
                  onClick={handleBuildPlan}
                  className="sc-button"
                  disabled={planLoading}
                >
                  {planLoading ? "Counting..." : plan ? "Re-count" : "Preview changes"}
                </button>
              }
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handlePreflight}
                className="sc-button"
                disabled={preflightLoading}
              >
                {preflightLoading ? "Checking access..." : "Check my permissions"}
              </button>
              <span className="text-xs text-ink-muted">
                Probes every write the merge needs without changing anything.
              </span>
            </div>

            {preflight && (
              <Panel
                className={`space-y-2 border p-3 text-xs ${
                  preflight.ok
                    ? "border-[var(--sc-alert-success-border)] bg-[var(--sc-alert-success-bg)]"
                    : "border-live-border bg-live-bg"
                }`}
              >
                <p className="font-semibold text-ink">
                  {preflight.ok
                    ? "All probed reads and writes are permitted."
                    : `${preflight.failures.length} check(s) failed — the merge would stall here.`}
                </p>
                {preflight.userId && (
                  <p className="font-mono text-[11px] text-ink-muted">user {preflight.userId}</p>
                )}
                {preflight.failures.length > 0 && (
                  <ul className="space-y-1">
                    {preflight.failures.map((check, index) => (
                      <li key={`${check.table}-${check.operation}-${index}`} className="text-live-ink">
                        <code className="font-mono">{check.table}</code> · {check.operation}
                        {check.code ? ` · ${check.code}` : ""} — {check.message}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}


            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Reason (recorded in the audit log)
              </p>
              <input
                type="text"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Same player registered twice at Nationals"
                className={`${INPUT_CLASS} mt-1 w-full`}
              />
            </div>

            {planError && (
              <div className="sc-alert is-error">
                {planError}
              </div>
            )}

            {plan && (
              <Panel className="space-y-3 border border-border/70 bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Rows that will be rewritten
                  </p>
                  <Chip variant="ghost" className="text-xs">
                    {plan.totalRows} total
                  </Chip>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {plan.entries.map((entry) => (
                    <div
                      key={`${entry.table}.${entry.column}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[11px] text-ink">
                          {entry.table}.{entry.column}
                        </p>
                        <p className="text-ink-muted">
                          {entry.label}
                          {entry.kind === "derived" ? " · rebuilt by trigger, then swept" : ""}
                          {entry.kind === "roster" ? " · duplicates collapsed" : ""}
                        </p>
                      </div>
                      {entry.error ? (
                        <span className="shrink-0 font-semibold text-live">Unreadable</span>
                      ) : (
                        <span className="shrink-0 font-semibold tabular-nums">{entry.count}</span>
                      )}
                    </div>
                  ))}
                </div>
                {planHasBlockers && (
                  <p className="text-xs font-semibold text-live">
                    Some tables could not be counted, so the merge is blocked — it would rewrite rows
                    nobody has seen. Resolve the read error first:{" "}
                    {plan.blocked.map((entry) => entry.error).join(" ")}
                  </p>
                )}
                <p className="text-xs text-ink-muted">
                  The {duplicateIds.length} duplicate player row
                  {duplicateIds.length === 1 ? "" : "s"} will be deleted once every reference above
                  points at {keeperProfile?.player?.name ?? "the kept player"}.
                </p>
              </Panel>
            )}

            {mergeError && (
              <div className="sc-alert is-error">
                {mergeError}
              </div>
            )}

            {plan && planStale && (
              <Panel className="border border-warning-border bg-warning-bg p-3 text-xs text-warning-ink">
                The selection changed after this preview was built, so the counts
                below are out of date. Click{" "}
                <span className="font-semibold">Re-count</span> to refresh them and
                re-enable the merge.
              </Panel>
            )}

            {plan && !planHasBlockers && (
              <div className="space-y-3 rounded-xl border border-live-border bg-live-bg p-4">
                <label className="flex items-start gap-2 text-xs font-semibold text-live-ink">
                  <input
                    type="checkbox"
                    checked={confirmChecked}
                    onChange={(event) => setConfirmChecked(event.target.checked)}
                    className="mt-0.5"
                  />
                  I understand this rewrites {plan.totalRows} row
                  {plan.totalRows === 1 ? "" : "s"} and permanently deletes{" "}
                  {duplicateIds.length} player record{duplicateIds.length === 1 ? "" : "s"}. This
                  cannot be undone from the UI.
                </label>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-live-ink">
                    Type the kept player&rsquo;s name to confirm
                  </p>
                  <input
                    type="text"
                    value={confirmName}
                    onChange={(event) => setConfirmName(event.target.value)}
                    placeholder={keeperProfile?.player?.name ?? ""}
                    className={`${INPUT_CLASS} mt-1 w-full max-w-sm`}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleMerge}
                  disabled={!canMerge}
                  className="sc-button"
                >
                  {merging ? "Merging..." : "Merge players"}
                </button>
                {/* A disabled button with no stated reason is the whole problem
                    this page had — always say which gate is still closed. */}
                {!canMerge && !merging && (
                  <p className="text-xs font-semibold text-live">
                    {planStale
                      ? "Re-count the preview before merging."
                      : !confirmChecked
                        ? "Tick the confirmation box to enable the merge."
                        : !confirmName.trim()
                          ? "Type the kept player's name to enable the merge."
                          : !nameMatches
                            ? "Name does not match the kept player."
                            : !plan
                              ? "Build the preview first."
                              : "Merge is not ready yet."}
                  </p>
                )}

                {/* The outcome has to appear where the operator is looking. The
                    success panel lives at the top of the page, which on a long
                    comparison table is well off-screen — a completed merge then
                    reads as "I pressed merge and nothing happened". */}
                {merging && (
                  <p className="text-xs font-semibold text-ink">
                    Merging — do not close this tab.
                  </p>
                )}
              </div>
            )}
          </Card>
        )}
      </SectionShell>
    </div>
  );
}
