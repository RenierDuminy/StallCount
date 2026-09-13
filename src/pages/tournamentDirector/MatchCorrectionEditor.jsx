import { useMemo, useState } from "react";
import { Card, Panel } from "../../components/ui/primitives";
import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";

const LIGHT_INPUT_CLASS =
  "rounded-lg border border-[var(--sc-surface-light-border)] bg-white px-3 py-1.5 text-sm text-[var(--sc-surface-light-ink)] shadow-sm focus:border-[var(--sc-border-strong)] focus:outline-none";

const SCORING_CODES = new Set([MATCH_LOG_EVENT_CODES.SCORE, MATCH_LOG_EVENT_CODES.CALAHAN]);

const REASON_MAX_LENGTH = 100;

// Grouped the way the scorekeeper console groups its own controls (score entry,
// possession, timing, breaks) rather than as one flat alphabetical list — a
// director reaching for "Timeout" scans one row instead of the whole vocabulary.
const EVENT_TYPE_GROUPS = [
  { label: "Score", codes: [MATCH_LOG_EVENT_CODES.SCORE, MATCH_LOG_EVENT_CODES.CALAHAN] },
  { label: "Possession", codes: [MATCH_LOG_EVENT_CODES.TURNOVER] },
  {
    label: "Timeout",
    codes: [MATCH_LOG_EVENT_CODES.TIMEOUT_START, MATCH_LOG_EVENT_CODES.TIMEOUT_END],
  },
  {
    label: "Halftime",
    codes: [MATCH_LOG_EVENT_CODES.HALFTIME_START, MATCH_LOG_EVENT_CODES.HALFTIME_END],
  },
  {
    label: "Stoppage",
    codes: [MATCH_LOG_EVENT_CODES.STOPPAGE_START, MATCH_LOG_EVENT_CODES.STOPPAGE_END],
  },
  {
    label: "Match",
    codes: [MATCH_LOG_EVENT_CODES.MATCH_START, MATCH_LOG_EVENT_CODES.MATCH_END],
  },
];

function formatDateTime(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toLocaleString();
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm:ss" in local time, not
// the UTC ISO string the log stores — converting through UTC fields here would
// silently shift the picker by the viewer's offset every time it opened.
function toDateTimeLocalValue(iso) {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "";
  const date = new Date(parsed);
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function fromDateTimeLocalValue(value) {
  if (!value) return null;
  // new Date parses this form as local time, matching what the input displayed.
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

// Renders a millisecond gap as seconds to one decimal place, dropping the
// decimal when it's a whole number so "2s" doesn't read as "2.0s".
function formatGapSeconds(ms) {
  const seconds = Math.abs(ms) / 1000;
  const rounded = Math.round(seconds * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}s`;
}

/**
 * Add/edit form for a single match log entry.
 *
 * Scorer and assist options are drawn from the two rosters plus any player
 * already referenced by this match's logs ("strays"). Without the strays a
 * player who has since left the roster would render as an empty selection and
 * be silently cleared the moment the form was saved.
 */
export default function MatchCorrectionEditor({
  state,
  match,
  rosters,
  eventDefinitions,
  saving,
  onCancel,
  onSubmit,
}) {
  const isEdit = state.mode === "edit";
  const log = state.log ?? null;

  const [eventCode, setEventCode] = useState(
    log?.eventCode || MATCH_LOG_EVENT_CODES.SCORE,
  );
  const [teamId, setTeamId] = useState(log?.teamId ?? match?.team_a?.id ?? "");
  const [scorerId, setScorerId] = useState(log?.scorerId ?? "");
  const [assistId, setAssistId] = useState(log?.assistId ?? "");
  const [reason, setReason] = useState("");
  const [createdAt, setCreatedAt] = useState(state.createdAt ?? null);
  const [timeError, setTimeError] = useState("");

  const teamAId = match?.team_a?.id ?? null;
  const teamBId = match?.team_b?.id ?? null;

  // Bounds come from this entry's neighbours in the timeline (see openInsertEditor /
  // openEditEditor in the panel) — there is no point-number column, so created_at is
  // the only thing that fixes an entry's position, and letting the picker drift past
  // a neighbour would silently reorder the log.
  const minBoundMs = Number.isFinite(Date.parse(state.minTime)) ? Date.parse(state.minTime) : null;
  const maxBoundMs = Number.isFinite(Date.parse(state.maxTime)) ? Date.parse(state.maxTime) : null;

  const knownCodes = useMemo(
    () => new Set((eventDefinitions ?? []).map((definition) => definition.code)),
    [eventDefinitions],
  );

  const playerOptions = useMemo(() => {
    const base = teamId === teamBId ? rosters.teamB : teamId === teamAId ? rosters.teamA : [];
    const merged = new Map();
    [...base, ...(rosters.strays ?? [])].forEach((player) => {
      if (player?.id) merged.set(player.id, player);
    });
    return Array.from(merged.values());
  }, [rosters, teamId, teamAId, teamBId]);

  const isScoring = SCORING_CODES.has(eventCode);
  const isCallahan = eventCode === MATCH_LOG_EVENT_CODES.CALAHAN;

  const handleTimeChange = (value) => {
    const iso = fromDateTimeLocalValue(value);
    if (!iso) {
      setCreatedAt(null);
      setTimeError("Enter a valid date and time.");
      return;
    }
    const ms = Date.parse(iso);
    if (minBoundMs != null && ms <= minBoundMs) {
      setTimeError(`Must be after ${formatDateTime(state.minTime)}.`);
    } else if (maxBoundMs != null && ms >= maxBoundMs) {
      setTimeError(`Must be before ${formatDateTime(state.maxTime)}.`);
    } else {
      setTimeError("");
    }
    setCreatedAt(iso);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (timeError || !createdAt) return;

    if (isEdit) {
      // Pass keys explicitly so the service's hasOwnProperty guards clear a value
      // when it is blanked, rather than leaving the old one in place.
      const updates = {
        eventTypeCode: eventCode,
        teamId: teamId || null,
        actorId: isScoring ? scorerId || null : null,
        secondaryActorId: isScoring && !isCallahan ? assistId || null : null,
        createdAt: createdAt !== log?.timestamp ? createdAt : undefined,
      };
      onSubmit({ mode: "edit", logId: log.id, updates, before: log, reason });
      return;
    }

    onSubmit({
      mode: "insert",
      input: {
        matchId: match.id,
        eventTypeCode: eventCode,
        teamId: teamId || null,
        actorId: isScoring ? scorerId || null : null,
        secondaryActorId: isScoring && !isCallahan ? assistId || null : null,
        createdAt,
      },
      reason,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card
        variant="light"
        className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto p-4 shadow-xl"
      >
        <div>
          <h3 className="text-base font-semibold text-[var(--sc-surface-light-ink)]">
            {isEdit ? "Edit log entry" : "Add log entry"}
          </h3>
          <p className="mt-1 text-xs text-[var(--sc-surface-light-ink)]/70">
            {isEdit
              ? `Recorded at ${formatDateTime(log?.timestamp)}`
              : `Will be inserted ${state.anchorLabel}`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">
              Event type
            </p>
            {/* Pill grid, matching the tap-target style of the scorekeeper console's
                own event controls instead of a plain text dropdown. Two columns from
                sm up, where there's room to show more groups without scrolling. */}
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {EVENT_TYPE_GROUPS.map((group) => {
                const availableCodes = group.codes.filter((code) => knownCodes.has(code));
                if (!availableCodes.length) return null;
                return (
                  <div
                    key={group.label}
                    className="rounded-lg border border-[var(--sc-surface-light-border)] p-2"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/50">
                      {group.label}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {availableCodes.map((code) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setEventCode(code)}
                          aria-pressed={eventCode === code}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            eventCode === code
                              ? "border-[#0f5132] bg-[#0f5132] text-white"
                              : "border-[var(--sc-surface-light-border)] bg-white text-[var(--sc-surface-light-ink)] hover:border-[#0f5132]/60"
                          }`}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">
              Team
            </p>
            <select
              value={teamId}
              onChange={(event) => {
                setTeamId(event.target.value);
                // The roster changes with the team, so a player from the old side
                // would no longer be a valid choice.
                setScorerId("");
                setAssistId("");
              }}
              className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
            >
              <option value="">Unassigned</option>
              {teamAId ? <option value={teamAId}>{match.team_a?.name || "Team A"}</option> : null}
              {teamBId ? <option value={teamBId}>{match.team_b?.name || "Team B"}</option> : null}
            </select>
          </div>

          {isScoring ? (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">
                  Scorer
                </p>
                <select
                  value={scorerId}
                  onChange={(event) => setScorerId(event.target.value)}
                  className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                >
                  <option value="">No scorer recorded</option>
                  {playerOptions.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.jersey_number != null ? `#${player.jersey_number} ` : ""}
                      {player.name}
                    </option>
                  ))}
                </select>
              </div>

              {!isCallahan ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">
                    Assist
                  </p>
                  <select
                    value={assistId}
                    onChange={(event) => setAssistId(event.target.value)}
                    className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
                  >
                    <option value="">No assist recorded</option>
                    {playerOptions
                      .filter((player) => player.id !== scorerId)
                      .map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.jersey_number != null ? `#${player.jersey_number} ` : ""}
                          {player.name}
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <Panel
                  variant="light"
                  className="border border-sky-200 bg-sky-50 p-2 text-xs text-sky-800"
                >
                  A Callahan is caught in the opposing end zone off a turnover, so it carries no
                  assist.
                </Panel>
              )}
            </>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">
              Time
            </p>
            <input
              type="datetime-local"
              step="1"
              value={toDateTimeLocalValue(createdAt)}
              min={state.minTime ? toDateTimeLocalValue(state.minTime) : undefined}
              max={state.maxTime ? toDateTimeLocalValue(state.maxTime) : undefined}
              onChange={(event) => handleTimeChange(event.target.value)}
              className={`${LIGHT_INPUT_CLASS} mt-1 w-full`}
            />
            <p className="mt-1 text-[11px] text-[var(--sc-surface-light-ink)]/60">
              {(() => {
                const createdAtMs = Number.isFinite(Date.parse(createdAt)) ? Date.parse(createdAt) : null;
                const afterPrevious =
                  createdAtMs != null && minBoundMs != null
                    ? `${formatGapSeconds(createdAtMs - minBoundMs)} after previous`
                    : null;
                const beforeNext =
                  createdAtMs != null && maxBoundMs != null
                    ? `${formatGapSeconds(maxBoundMs - createdAtMs)} before next event`
                    : null;
                if (afterPrevious && beforeNext) return `${afterPrevious} and ${beforeNext}.`;
                if (afterPrevious) return `${afterPrevious}.`;
                if (beforeNext) return `${beforeNext}.`;
                return "Position in the log is set entirely by this timestamp.";
              })()}
            </p>
            {timeError ? <p className="mt-1 text-[11px] font-semibold text-rose-600">{timeError}</p> : null}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">
              Reason <span className="normal-case font-normal opacity-70">(optional)</span>
            </p>
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX_LENGTH))}
              maxLength={REASON_MAX_LENGTH}
              placeholder="Why this entry is being changed"
              className={`${LIGHT_INPUT_CLASS} mt-1 w-full`}
            />
            <p className="mt-1 flex justify-between text-[11px] text-[var(--sc-surface-light-ink)]/60">
              <span>Stored in the audit log. Match logs keep no edit history of their own.</span>
              <span className="shrink-0 pl-2 tabular-nums">
                {reason.length}/{REASON_MAX_LENGTH}
              </span>
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="sc-button" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="sc-button" disabled={saving || !!timeError || !createdAt}>
              {saving ? "Saving..." : isEdit ? "Save changes" : "Add entry"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
