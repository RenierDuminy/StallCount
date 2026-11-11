import { useMemo, useState } from "react";
import { Panel, Textarea } from "../../components/ui/primitives";
import {
  addPlayerToRoster,
  getEventRosters,
  getPlayerDirectory,
  getPlayerIdsWithBirthday,
  upsertPlayer,
} from "../../services/playerService";
import { invalidateCachedQuery } from "../../utils/queryCache";
import { BULK_ROSTER_COLUMNS, parseBulkRosterText, planBulkRoster } from "../../services/bulkRosterImport";

const ACTION_LABELS = { create: "New player", add: "Add to roster", skip: "Already on roster" };
const EXAMPLE = "team\tname\tgender\tbirthday\tjersey\trole\nSharks\tJane Mokoena\tW\t1999-04-12\t7\tcaptain";

/**
 * Event access: paste a list to create players and put them on this event's
 * team rosters. Strict: any problem blocks the whole list.
 */
export default function BulkRosterImportPanel({ eventId, teams = [], teamsLoading = false }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null); // { errors, plan }
  const [writing, setWriting] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total, failures[] }

  const counts = useMemo(() => {
    const plan = result?.plan || [];
    return {
      create: plan.filter((row) => row.action === "create").length,
      add: plan.filter((row) => row.action === "add").length,
      skip: plan.filter((row) => row.action === "skip").length,
    };
  }, [result]);

  const resetResult = () => {
    setResult(null);
    setProgress(null);
  };

  async function handleCheck() {
    resetResult();
    const parsed = parseBulkRosterText(text, { teams });
    if (parsed.errors.length) {
      setResult({ errors: parsed.errors, plan: [] });
      return;
    }
    setChecking(true);
    try {
      const dates = Array.from(new Set(parsed.rows.map((row) => row.birthday)));
      const [directory, eventRosters, birthdaySets] = await Promise.all([
        getPlayerDirectory(),
        getEventRosters(eventId),
        Promise.all(dates.map((date) => getPlayerIdsWithBirthday(date))),
      ]);
      const idsByBirthday = new Map(dates.map((date, i) => [date, birthdaySets[i]]));
      const planned = planBulkRoster(parsed.rows, { directory, idsByBirthday, eventRosters });
      setResult(planned);
    } catch (err) {
      setResult({ errors: [{ line: 0, message: err instanceof Error ? err.message : "Unable to check the list." }], plan: [] });
    } finally {
      setChecking(false);
    }
  }

  async function handleImport() {
    const work = (result?.plan || []).filter((row) => row.action !== "skip");
    if (!work.length) return;
    setWriting(true);
    const failures = [];
    let done = 0;
    setProgress({ done, total: work.length, failures });
    for (const row of work) {
      try {
        const playerId =
          row.action === "create"
            ? await upsertPlayer({ name: row.name, gender_code: row.gender, jersey_number: row.jersey, birthday: row.birthday })
            : row.playerId;
        await addPlayerToRoster({ playerId, teamId: row.team.id, eventId, captainRole: row.role });
      } catch (err) {
        failures.push({ line: row.line, name: row.name, message: err instanceof Error ? err.message : "Failed." });
      }
      done += 1;
      setProgress({ done, total: work.length, failures: [...failures] });
    }
    invalidateCachedQuery("players:directory");
    setWriting(false);
  }

  const blocked = Boolean(result?.errors?.length);
  const finished = progress && progress.done === progress.total && !writing;

  return (
    <Panel className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Bulk add players to rosters</h2>
          <p className="text-sm text-ink/80">Paste a list to create players and put them on team rosters for this event.</p>
        </div>
        <button type="button" className="sc-button is-ghost" onClick={() => setOpen((value) => !value)}>
          {open ? "Hide" : "Open"}
        </button>
      </div>

      {open ? (
        !eventId ? (
          <p className="text-sm text-ink/80">Select an event first.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 text-sm text-ink/85">
              <p>
                The first line is the header. Separate columns with tabs (paste straight from a spreadsheet) or commas.
                Columns can be in any order; quotes are not supported. If any line has a problem, nothing is imported.
              </p>
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-1 pr-3 font-semibold">Column</th>
                    <th className="py-1 pr-3 font-semibold">Required</th>
                    <th className="py-1 font-semibold">Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {BULK_ROSTER_COLUMNS.map((column) => (
                    <tr key={column.key} className="border-b border-border/50">
                      <td className="py-1 pr-3 font-mono">{column.key}</td>
                      <td className="py-1 pr-3">{column.required ? "Yes" : "No"}</td>
                      <td className="py-1">{column.help}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                A player is matched to an existing record only when both the name and the birthday match. A name that
                exists with a different or missing birthday is refused, so duplicates are not created. Existing records
                are never changed. A player already on another team in this event is refused.
                {teamsLoading ? " Loading teams..." : ` Teams in this event: ${teams.map((team) => team.name).join(", ") || "none"}.`}
              </p>
            </div>

            <Textarea
              rows={10}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                resetResult();
              }}
              placeholder={EXAMPLE}
              className="font-mono text-sm"
              disabled={writing}
            />

            <div className="flex flex-wrap gap-2">
              <button type="button" className="sc-button" onClick={handleCheck} disabled={checking || writing || teamsLoading || !text.trim()}>
                {checking ? "Checking..." : "Check list"}
              </button>
              {result && !blocked && !finished ? (
                <button
                  type="button"
                  className="sc-button"
                  onClick={handleImport}
                  disabled={writing || counts.create + counts.add === 0}
                >
                  {writing ? `Importing ${progress?.done ?? 0} of ${progress?.total ?? 0}...` : `Import ${counts.create + counts.add} players`}
                </button>
              ) : null}
            </div>

            {blocked ? (
              <div className="sc-alert is-error space-y-1">
                <p className="font-semibold">
                  {result.errors.length} problem{result.errors.length === 1 ? "" : "s"}. Fix them and check again; nothing has been imported.
                </p>
                <ul className="list-disc pl-5">
                  {result.errors.map((error, index) => (
                    <li key={index}>{error.line ? `Line ${error.line}: ` : ""}{error.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result && !blocked ? (
              <div className="space-y-2">
                <p className="text-sm text-ink">
                  {counts.create} new player{counts.create === 1 ? "" : "s"}, {counts.add} existing player
                  {counts.add === 1 ? "" : "s"} to add, {counts.skip} already on their roster.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-1 pr-3 font-semibold">Line</th>
                        <th className="py-1 pr-3 font-semibold">Team</th>
                        <th className="py-1 pr-3 font-semibold">Name</th>
                        <th className="py-1 pr-3 font-semibold">Gender</th>
                        <th className="py-1 pr-3 font-semibold">Jersey</th>
                        <th className="py-1 pr-3 font-semibold">Role</th>
                        <th className="py-1 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.plan.map((row) => (
                        <tr key={row.line} className="border-b border-border/50 align-top">
                          <td className="py-1 pr-3">{row.line}</td>
                          <td className="py-1 pr-3">{row.team.name}</td>
                          <td className="py-1 pr-3">{row.name}</td>
                          <td className="py-1 pr-3">{row.gender}</td>
                          <td className="py-1 pr-3">{row.jersey ?? "–"}</td>
                          <td className="py-1 pr-3">{row.role === "spirit" ? "Spirit captain" : row.role === "captain" ? "Captain" : "–"}</td>
                          <td className="py-1">
                            {ACTION_LABELS[row.action]}
                            {row.action === "skip" && row.role ? " (role not changed)" : ""}
                            {row.notes.map((note) => (
                              <span key={note} className="block text-ink/75">{note}</span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {finished ? (
              progress.failures.length ? (
                <div className="sc-alert is-error space-y-1">
                  <p className="font-semibold">
                    {progress.total - progress.failures.length} of {progress.total} imported. These failed:
                  </p>
                  <ul className="list-disc pl-5">
                    {progress.failures.map((failure) => (
                      <li key={failure.line}>Line {failure.line} ({failure.name}): {failure.message}</li>
                    ))}
                  </ul>
                  <p>Check the list again to retry: players already added will show as already on roster.</p>
                </div>
              ) : (
                <div className="sc-alert is-success">All {progress.total} players imported.</div>
              )
            ) : null}
          </div>
        )
      ) : null}
    </Panel>
  );
}
