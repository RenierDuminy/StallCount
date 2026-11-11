import { useEffect, useMemo, useState } from "react";
import { Card, Panel } from "../../components/ui/primitives";
import { parseMatchExport } from "../../services/matchExportFormat";
import {
  asPreviewRows,
  buildImportRows,
  collectReferencedPeople,
  findExistingDuplicates,
  suggestPlayerMatches,
} from "../../services/matchImport";
import { deriveMatchLogs } from "../../services/matchLogDerivation";
import { analyseMatchLogs, summariseFindings } from "../../services/matchCorrectionChecks";
import { importMatchLogs } from "../../services/matchCorrectionsService";
import { createMatch } from "../../services/matchService";
import { getPlayersByTeam } from "../../services/playerService";
import { getEventHierarchy } from "../../services/leagueService";
import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";
import { isConcludedStatus } from "../../constants/statusCodes";

// Imports a scrimmage-console export (the backup when a match could not be
// scored through the normal console) into an existing match or a new one.
// The export only knows names, so the director maps the two sides to teams and
// each named player to a roster player, previews the derived score and checks,
// then writes it in one go through importMatchLogs.

const INPUT_CLASS =
  "rounded-lg border border-[var(--sc-surface-light-border)] bg-white px-3 py-1.5 text-sm text-[var(--sc-surface-light-ink)] shadow-sm focus:border-[var(--sc-border-strong)] focus:outline-none";
const LABEL_CLASS = "text-sm font-semibold text-[var(--sc-surface-light-ink)]";
const MUTED_CLASS = "text-sm text-[var(--sc-surface-light-ink)]/75";

const EVENT_LABELS = {
  match_start: "Match start",
  match_end: "Match end",
  score: "Score",
  callahan: "Callahan",
  turnover: "Turnover",
  block: "Block",
  timeout_start: "Timeout",
  timeout_end: "Timeout end",
  halftime_start: "Halftime",
  halftime_end: "Halftime end",
  stoppage_start: "Stoppage",
  stoppage_end: "Stoppage end",
};

const teamLabel = (team) => team?.short_name || team?.name || "TBC";

const formatTime = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const toLocalInput = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const personLabel = (person) =>
  `${person.name || "Unnamed"}${Number.isFinite(person.jersey_number) ? ` #${person.jersey_number}` : ""}`;

export default function MatchImportPanel({
  eventId,
  selectedMatch,
  existingLogs = [],
  eventDefinitions = [],
  eventCodeById,
  locked = false,
  onImported,
}) {
  const [open, setOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [target, setTarget] = useState("existing");
  const [swapSides, setSwapSides] = useState(false);
  const [hierarchy, setHierarchy] = useState(null);
  const [newMatch, setNewMatch] = useState({ divisionId: "", poolId: "", teamAId: "", teamBId: "", venueId: "", startTime: "" });
  const [rosterByTeam, setRosterByTeam] = useState({});
  const [playerMap, setPlayerMap] = useState({});
  const [mode, setMode] = useState("replace");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const parsed = useMemo(() => (rawText.trim() ? parseMatchExport(rawText) : null), [rawText]);
  const data = parsed?.data && !parsed.errors.length ? parsed.data : null;

  // ------------------------------------------------------------ teams + sides

  useEffect(() => {
    if (!open || target !== "new" || !eventId) return undefined;
    let active = true;
    getEventHierarchy(eventId)
      .then((result) => active && setHierarchy(result))
      .catch(() => active && setHierarchy(null));
    return () => {
      active = false;
    };
  }, [open, target, eventId]);

  const eventTeams = useMemo(() => {
    const byId = new Map();
    (hierarchy?.divisions || []).forEach((division) => {
      if (newMatch.divisionId && division.id !== newMatch.divisionId) return;
      division.pools.forEach((pool) => {
        if (newMatch.poolId && pool.id !== newMatch.poolId) return;
        pool.teams.forEach((entry) => byId.set(entry.team.id, entry.team));
      });
    });
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [hierarchy, newMatch.divisionId, newMatch.poolId]);

  const pools = useMemo(
    () => (hierarchy?.divisions || []).find((division) => division.id === newMatch.divisionId)?.pools || [],
    [hierarchy, newMatch.divisionId],
  );

  // Export side -> real team. For an existing match the director only chooses
  // whether the export's Team A is the match's team A or team B.
  const sideMap = useMemo(() => {
    if (target === "new") return { A: newMatch.teamAId || null, B: newMatch.teamBId || null };
    const a = selectedMatch?.team_a?.id ?? null;
    const b = selectedMatch?.team_b?.id ?? null;
    return swapSides ? { A: b, B: a } : { A: a, B: b };
  }, [target, newMatch.teamAId, newMatch.teamBId, selectedMatch, swapSides]);

  useEffect(() => {
    if (!open || !data) return undefined;
    const missing = [sideMap.A, sideMap.B].filter((id) => id && !(id in rosterByTeam));
    if (!missing.length) return undefined;
    let active = true;
    Promise.all(missing.map((id) => getPlayersByTeam(id, eventId).catch(() => [])))
      .then((lists) => {
        if (!active) return;
        setRosterByTeam((prev) => {
          const next = { ...prev };
          missing.forEach((id, index) => {
            next[id] = lists[index] || [];
          });
          return next;
        });
      });
    return () => {
      active = false;
    };
  }, [open, data, sideMap, rosterByTeam, eventId]);

  const rostersBySide = useMemo(
    () => ({ A: rosterByTeam[sideMap.A] || [], B: rosterByTeam[sideMap.B] || [] }),
    [rosterByTeam, sideMap],
  );

  // ------------------------------------------------------------------ players

  const people = useMemo(() => (data ? collectReferencedPeople(data.logs) : []), [data]);

  // Re-suggest whenever the people or the rosters change (a new paste, a side
  // swap, a different team); choices the director made by hand are dropped
  // then, because they named a player on the other roster.
  const suggestions = useMemo(() => suggestPlayerMatches(people, rostersBySide), [people, rostersBySide]);
  useEffect(() => {
    setPlayerMap(suggestions);
  }, [suggestions]);

  // ------------------------------------------------------------- build + check

  const eventIdByCode = useMemo(() => {
    const map = new Map();
    eventDefinitions.forEach((definition) => {
      // Negative ids are the offline fallback list, not real rows.
      if (definition?.code && Number(definition.id) > 0) map.set(definition.code, Number(definition.id));
    });
    return map;
  }, [eventDefinitions]);

  const hasExistingLogs = target === "existing" && existingLogs.length > 0;
  const effectiveMode = hasExistingLogs ? mode : "append";

  const built = useMemo(() => {
    if (!data) return null;
    return buildImportRows(data.logs, {
      matchId: target === "existing" ? selectedMatch?.id ?? null : null,
      sideMap,
      playerMap,
      eventIdByCode,
    });
  }, [data, target, selectedMatch, sideMap, playerMap, eventIdByCode]);

  const duplicates = useMemo(() => {
    if (!built || effectiveMode !== "append" || !hasExistingLogs) return new Set();
    return findExistingDuplicates(built.rows, existingLogs);
  }, [built, effectiveMode, hasExistingLogs, existingLogs]);

  const rowsToWrite = useMemo(
    () => (built ? built.rows.filter((_, index) => !duplicates.has(index)) : []),
    [built, duplicates],
  );

  const matchTeamIds =
    target === "existing"
      ? { a: selectedMatch?.team_a?.id ?? null, b: selectedMatch?.team_b?.id ?? null }
      : { a: newMatch.teamAId || null, b: newMatch.teamBId || null };

  const preview = useMemo(() => {
    if (!built || !matchTeamIds.a || !matchTeamIds.b) return null;
    const resultRows = [
      ...(effectiveMode === "append" && hasExistingLogs ? existingLogs : []),
      ...asPreviewRows(rowsToWrite.map((row) => row.insert), eventCodeById),
    ].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const derived = deriveMatchLogs(resultRows, { teamAId: matchTeamIds.a, teamBId: matchTeamIds.b, eventCodeById });
    let summary;
    try {
      const match =
        target === "existing"
          ? selectedMatch
          : { team_a: { id: matchTeamIds.a }, team_b: { id: matchTeamIds.b }, status: "finished" };
      const findings = analyseMatchLogs({
        match,
        logs: resultRows,
        derived,
        eventRules: null,
        rosters: { teamA: rosterByTeam[matchTeamIds.a] || [], teamB: rosterByTeam[matchTeamIds.b] || [] },
        eventCodeById,
      });
      summary = { ...summariseFindings(findings), findings };
    } catch {
      summary = null;
    }
    return { derived, summary };
  }, [built, rowsToWrite, effectiveMode, hasExistingLogs, existingLogs, eventCodeById, matchTeamIds.a, matchTeamIds.b, target, selectedMatch, rosterByTeam]);

  const unmatchedPeople = people.filter((person) => !playerMap[person.key]);
  const hasMatchEnd = data?.logs.some((row) => row.event_code === MATCH_LOG_EVENT_CODES.MATCH_END);
  const firstStart = data?.logs.find((row) => row.event_code === MATCH_LOG_EVENT_CODES.MATCH_START)?.created_at;

  const blockers = [];
  if (!data) blockers.push("Paste or load an export.");
  if (target === "existing" && !selectedMatch) blockers.push("Choose the match above.");
  if (target === "existing" && locked) blockers.push("This match is live; tick “Edit anyway” above first.");
  if (target === "new" && (!newMatch.teamAId || !newMatch.teamBId)) blockers.push("Choose both teams.");
  if (target === "new" && newMatch.teamAId && newMatch.teamAId === newMatch.teamBId) blockers.push("The two teams must differ.");
  if (target === "existing" && selectedMatch && (!sideMap.A || !sideMap.B)) blockers.push("The match needs both teams assigned.");
  if (built?.unresolved.length) {
    const codes = Array.from(new Set(built.unresolved.map((row) => row.event_code))).join(", ");
    blockers.push(`The database has no event type for: ${codes}. Add it to match_events first.`);
  }
  if (built && !rowsToWrite.length) blockers.push("Every entry is already on the match; there is nothing to add.");
  if (!reason.trim()) blockers.push("Give a reason (it is recorded in the audit log).");

  // ------------------------------------------------------------------- submit

  const loadFile = (file) => {
    if (!file) return;
    file.text().then(setRawText).catch(() => setError("The file could not be read."));
  };

  const handleSubmit = async () => {
    if (blockers.length || !data) return;
    const isReplace = effectiveMode === "replace" && hasExistingLogs;
    const prompt =
      target === "new"
        ? `Create a new match and import ${rowsToWrite.length} entries?`
        : isReplace
          ? `Replace all ${existingLogs.length} existing entries on this match with ${rowsToWrite.length} imported entries? This cannot be undone.`
          : `Add ${rowsToWrite.length} entries to this match?`;
    if (!window.confirm(prompt)) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const startTime = data.match.startTime || firstStart || null;
      const startingTeamId = data.match.startingTeam ? sideMap[data.match.startingTeam] : null;
      const abbaPattern = data.match.abbaPattern && data.match.abbaPattern !== "none" ? data.match.abbaPattern : null;
      let matchId = selectedMatch?.id;
      let teamAId = matchTeamIds.a;
      let teamBId = matchTeamIds.b;
      let matchUpdates = {};

      if (target === "new") {
        const created = await createMatch({
          eventId,
          divisionId: newMatch.divisionId || null,
          poolId: newMatch.poolId || null,
          venueId: newMatch.venueId || null,
          teamAId: newMatch.teamAId,
          teamBId: newMatch.teamBId,
          startingTeamId,
          abbaPattern,
          startTime: newMatch.startTime ? new Date(newMatch.startTime).toISOString() : startTime,
          status: "scheduled",
        });
        matchId = created.id;
        teamAId = created.team_a?.id ?? newMatch.teamAId;
        teamBId = created.team_b?.id ?? newMatch.teamBId;
        if (hasMatchEnd) matchUpdates.status = "finished";
      } else {
        // Fill only what the match lacks; never overwrite set-up a TD made.
        if (hasMatchEnd && !isConcludedStatus(selectedMatch.status)) matchUpdates.status = "finished";
        if (!selectedMatch.start_time && startTime) matchUpdates.startTime = startTime;
        if (!selectedMatch.starting_team_id && startingTeamId) matchUpdates.startingTeamId = startingTeamId;
        if (!selectedMatch.abba_pattern && abbaPattern) matchUpdates.abbaPattern = abbaPattern;
      }

      const result = await importMatchLogs(
        { matchId, eventId, teamAId, teamBId, eventCodeById },
        {
          rows: rowsToWrite.map((row) => row.insert),
          mode: isReplace ? "replace" : "append",
          matchUpdates,
          reason: reason.trim(),
          summary: {
            source: data.source,
            exportedAt: data.exportedAt,
            exportTeams: [data.match.teamA.name, data.match.teamB.name],
            skippedDuplicates: duplicates.size,
            unmatchedPlayers: unmatchedPeople.map(personLabel),
          },
        },
      );
      const audit = result.auditError ? ` (audit entry not recorded: ${result.auditError})` : "";
      setNotice(
        `Imported ${result.inserted} entries${result.deletedCount ? `, replacing ${result.deletedCount}` : ""}. ` +
          `The score is now ${result.derived.totals.a}–${result.derived.totals.b}.${audit}`,
      );
      setRawText("");
      setReason("");
      onImported?.(matchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The import failed.");
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------- render

  const sideName = (side) => (side === "A" ? data?.match.teamA.name : data?.match.teamB.name);

  return (
    <Card variant="light" className="space-y-4 p-4 shadow-md shadow-[rgba(8,25,21,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--sc-surface-light-ink)]">Import scrimmage data</h2>
          <p className={MUTED_CLASS}>
            For a match scored on the scrimmage console because the normal console could not be used.
          </p>
        </div>
        <button type="button" className="sc-button" onClick={() => setOpen((value) => !value)}>
          {open ? "Close" : "Open import"}
        </button>
      </div>

      {open ? (
        <div className="space-y-5">
          {/* 1. Data */}
          <section className="space-y-2">
            <h3 className={LABEL_CLASS}>1. Exported data</h3>
            <p className={MUTED_CLASS}>
              Paste the contents of the &ldquo;Download match data (JSON)&rdquo; file, or load the file.
            </p>
            <textarea
              rows={5}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder='{"format": "stallcount.match-export", ...}'
              className={`${INPUT_CLASS} w-full font-mono text-xs`}
              spellCheck={false}
            />
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                loadFile(event.target.files?.[0]);
                event.target.value = "";
              }}
              className="text-sm text-[var(--sc-surface-light-ink)]"
            />
            {parsed?.errors.length ? (
              <Panel variant="light" className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <ul className="list-disc space-y-1 pl-5">
                  {parsed.errors.slice(0, 8).map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </Panel>
            ) : null}
            {data ? (
              <p className="text-sm text-[var(--sc-surface-light-ink)]">
                <strong>
                  {data.match.teamA.name} {data.match.scoreA ?? "?"}–{data.match.scoreB ?? "?"} {data.match.teamB.name}
                </strong>
                {" · "}
                {data.logs.length} entries
                {data.match.startTime ? ` · started ${new Date(data.match.startTime).toLocaleString()}` : ""}
              </p>
            ) : null}
            {parsed?.warnings.length ? (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-800">
                {Array.from(new Set(parsed.warnings)).slice(0, 6).map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
          </section>

          {data ? (
            <>
              {/* 2. Target */}
              <section className="space-y-2">
                <h3 className={LABEL_CLASS}>2. Where it goes</h3>
                <label className="flex items-center gap-2 text-sm text-[var(--sc-surface-light-ink)]">
                  <input type="radio" checked={target === "existing"} onChange={() => setTarget("existing")} />
                  Into the match selected above
                  {selectedMatch ? (
                    <span className="text-[var(--sc-surface-light-ink)]/75">
                      ({teamLabel(selectedMatch.team_a)} vs {teamLabel(selectedMatch.team_b)})
                    </span>
                  ) : null}
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--sc-surface-light-ink)]">
                  <input type="radio" checked={target === "new"} onChange={() => setTarget("new")} />
                  As a new match in this event
                </label>

                {target === "existing" && selectedMatch ? (
                  <div className="space-y-1 pl-6">
                    <p className="text-sm text-[var(--sc-surface-light-ink)]">
                      {data.match.teamA.name} &rarr;{" "}
                      <strong>{teamLabel(swapSides ? selectedMatch.team_b : selectedMatch.team_a)}</strong>,{" "}
                      {data.match.teamB.name} &rarr;{" "}
                      <strong>{teamLabel(swapSides ? selectedMatch.team_a : selectedMatch.team_b)}</strong>
                    </p>
                    <label className="flex items-center gap-2 text-sm text-[var(--sc-surface-light-ink)]">
                      <input type="checkbox" checked={swapSides} onChange={(event) => setSwapSides(event.target.checked)} />
                      Swap the sides
                    </label>
                  </div>
                ) : null}

                {target === "new" ? (
                  <div className="grid gap-3 pl-6 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className={LABEL_CLASS}>Division</span>
                      <select
                        className={`${INPUT_CLASS} w-full`}
                        value={newMatch.divisionId}
                        onChange={(event) => setNewMatch((prev) => ({ ...prev, divisionId: event.target.value, poolId: "" }))}
                      >
                        <option value="">Any division</option>
                        {(hierarchy?.divisions || []).map((division) => (
                          <option key={division.id} value={division.id}>{division.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className={LABEL_CLASS}>Pool</span>
                      <select
                        className={`${INPUT_CLASS} w-full`}
                        value={newMatch.poolId}
                        disabled={!newMatch.divisionId}
                        onChange={(event) => setNewMatch((prev) => ({ ...prev, poolId: event.target.value }))}
                      >
                        <option value="">No pool</option>
                        {pools.map((pool) => (
                          <option key={pool.id} value={pool.id}>{pool.name}</option>
                        ))}
                      </select>
                    </label>
                    {["A", "B"].map((side) => {
                      const field = side === "A" ? "teamAId" : "teamBId";
                      return (
                        <label key={side} className="space-y-1">
                          <span className={LABEL_CLASS}>Team for &ldquo;{sideName(side)}&rdquo;</span>
                          <select
                            className={`${INPUT_CLASS} w-full`}
                            value={newMatch[field]}
                            onChange={(event) => setNewMatch((prev) => ({ ...prev, [field]: event.target.value }))}
                          >
                            <option value="">Choose a team</option>
                            {eventTeams.map((team) => (
                              <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                    <label className="space-y-1">
                      <span className={LABEL_CLASS}>Venue</span>
                      <select
                        className={`${INPUT_CLASS} w-full`}
                        value={newMatch.venueId}
                        onChange={(event) => setNewMatch((prev) => ({ ...prev, venueId: event.target.value }))}
                      >
                        <option value="">No venue</option>
                        {(hierarchy?.venues || []).map((venue) => (
                          <option key={venue.id} value={venue.id}>{venue.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className={LABEL_CLASS}>Start time</span>
                      <input
                        type="datetime-local"
                        className={`${INPUT_CLASS} w-full`}
                        value={newMatch.startTime || toLocalInput(data.match.startTime || firstStart)}
                        onChange={(event) => setNewMatch((prev) => ({ ...prev, startTime: event.target.value }))}
                      />
                    </label>
                  </div>
                ) : null}
              </section>

              {/* 3. Players */}
              <section className="space-y-2">
                <h3 className={LABEL_CLASS}>3. Players</h3>
                {!people.length ? (
                  <p className={MUTED_CLASS}>The export names no players.</p>
                ) : !sideMap.A || !sideMap.B ? (
                  <p className={MUTED_CLASS}>Choose the teams first.</p>
                ) : (
                  <>
                    <p className={MUTED_CLASS}>
                      Matched by name, then by jersey number. Entries for a player left as &ldquo;No player&rdquo; are
                      imported without one.
                    </p>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {["A", "B"].map((side) => (
                        <table key={side} className="w-full border-collapse text-sm text-[var(--sc-surface-light-ink)]">
                          <thead>
                            <tr>
                              <th className="border-b border-[var(--sc-surface-light-border)] py-1.5 pr-3 text-left font-semibold">
                                {sideName(side)}
                              </th>
                              <th className="border-b border-[var(--sc-surface-light-border)] py-1.5 text-left font-semibold">
                                Roster player
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {people
                              .filter((person) => person.side === side)
                              .map((person) => (
                                <tr key={person.key}>
                                  <td className="border-b border-[var(--sc-surface-light-border)] py-1.5 pr-3 align-middle">
                                    {personLabel(person)}
                                    <span className="text-[var(--sc-surface-light-ink)]/60"> · {person.count}</span>
                                  </td>
                                  <td className="border-b border-[var(--sc-surface-light-border)] py-1.5">
                                    <select
                                      className={`${INPUT_CLASS} w-full ${playerMap[person.key] ? "" : "border-amber-400"}`}
                                      value={playerMap[person.key] || ""}
                                      onChange={(event) =>
                                        setPlayerMap((prev) => ({ ...prev, [person.key]: event.target.value }))
                                      }
                                    >
                                      <option value="">No player</option>
                                      {rostersBySide[side].map((player) => (
                                        <option key={player.id} value={player.id}>
                                          {player.name}
                                          {Number.isFinite(Number(player.jersey_number)) && player.jersey_number !== null
                                            ? ` #${player.jersey_number}`
                                            : ""}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      ))}
                    </div>
                  </>
                )}
              </section>

              {/* 4. Existing entries */}
              {hasExistingLogs ? (
                <section className="space-y-2">
                  <h3 className={LABEL_CLASS}>4. Entries already on the match</h3>
                  <p className={MUTED_CLASS}>This match already has {existingLogs.length} entries.</p>
                  <label className="flex items-center gap-2 text-sm text-[var(--sc-surface-light-ink)]">
                    <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
                    Replace them all with the import
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--sc-surface-light-ink)]">
                    <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} />
                    Keep them and add only the missing entries
                    {mode === "append" && built ? (
                      <span className="text-[var(--sc-surface-light-ink)]/75">
                        ({duplicates.size} already present, {rowsToWrite.length} to add)
                      </span>
                    ) : null}
                  </label>
                </section>
              ) : null}

              {/* 5. Review */}
              <section className="space-y-2">
                <h3 className={LABEL_CLASS}>{hasExistingLogs ? "5" : "4"}. Review</h3>
                {preview ? (
                  <p className="text-sm text-[var(--sc-surface-light-ink)]">
                    The match log will give{" "}
                    <strong>
                      {teamLabel(target === "existing" ? selectedMatch?.team_a : eventTeams.find((t) => t.id === matchTeamIds.a))}{" "}
                      {preview.derived.totals.a}–{preview.derived.totals.b}{" "}
                      {teamLabel(target === "existing" ? selectedMatch?.team_b : eventTeams.find((t) => t.id === matchTeamIds.b))}
                    </strong>
                    {preview.summary
                      ? ` · ${preview.summary.errors} error${preview.summary.errors === 1 ? "" : "s"}, ${preview.summary.warnings} warning${preview.summary.warnings === 1 ? "" : "s"}`
                      : ""}
                    {unmatchedPeople.length ? ` · ${unmatchedPeople.length} player${unmatchedPeople.length === 1 ? "" : "s"} not matched` : ""}
                  </p>
                ) : (
                  <p className={MUTED_CLASS}>Choose the teams to see the result.</p>
                )}
                {preview?.summary?.findings?.length ? (
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-[var(--sc-surface-light-ink)]">
                    {preview.summary.findings.slice(0, 8).map((finding, index) => (
                      <li key={`${finding.id || "finding"}-${index}`}>{finding.title}</li>
                    ))}
                  </ul>
                ) : null}

                {built ? (
                  <details className="text-sm text-[var(--sc-surface-light-ink)]">
                    <summary className="cursor-pointer font-semibold">Show the {built.rows.length} entries</summary>
                    <div className="mt-2 max-h-80 overflow-y-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="text-left">
                            <th className="border-b border-[var(--sc-surface-light-border)] py-1 pr-3">Time</th>
                            <th className="border-b border-[var(--sc-surface-light-border)] py-1 pr-3">Event</th>
                            <th className="border-b border-[var(--sc-surface-light-border)] py-1 pr-3">Team</th>
                            <th className="border-b border-[var(--sc-surface-light-border)] py-1">Players</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.logs.map((log) => {
                            const builtIndex = built.rows.findIndex((row) => row.sourceIndex === log.index);
                            const skipped = builtIndex >= 0 && duplicates.has(builtIndex);
                            return (
                              <tr key={log.index} className={skipped ? "text-[var(--sc-surface-light-ink)]/45 line-through" : ""}>
                                <td className="border-b border-[var(--sc-surface-light-border)] py-1 pr-3 tabular-nums">{formatTime(log.created_at)}</td>
                                <td className="border-b border-[var(--sc-surface-light-border)] py-1 pr-3">{EVENT_LABELS[log.event_code] || log.event_code}</td>
                                <td className="border-b border-[var(--sc-surface-light-border)] py-1 pr-3">{log.team ? sideName(log.team) : ""}</td>
                                <td className="border-b border-[var(--sc-surface-light-border)] py-1">
                                  {[log.actor, log.secondary_actor].filter(Boolean).map(personLabel).join(" ← ")}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ) : null}
                <p className={MUTED_CLASS}>
                  After the import the match opens in the log below, where every entry can still be edited.
                </p>
              </section>

              {/* Submit */}
              <section className="space-y-2">
                <label className="block space-y-1">
                  <span className={LABEL_CLASS}>Reason (recorded in the audit log)</span>
                  <input
                    type="text"
                    className={`${INPUT_CLASS} w-full`}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="e.g. Scorekeeper tablet failed; scored on the scrimmage console"
                  />
                </label>
                {blockers.length ? (
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-[var(--sc-surface-light-ink)]/80">
                    {blockers.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  className={effectiveMode === "replace" && hasExistingLogs ? "sc-button is-danger" : "sc-button"}
                  disabled={busy || blockers.length > 0}
                  onClick={handleSubmit}
                >
                  {busy
                    ? "Importing..."
                    : target === "new"
                      ? "Create match and import"
                      : effectiveMode === "replace" && hasExistingLogs
                        ? "Replace entries and import"
                        : "Import entries"}
                </button>
              </section>
            </>
          ) : null}

          {error ? (
            <Panel variant="light" className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</Panel>
          ) : null}
          {notice ? (
            <Panel variant="light" className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</Panel>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
