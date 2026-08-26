import { useMemo, useState } from "react";
import { Card, Panel } from "../../components/ui/primitives";
import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";

const LIGHT_INPUT_CLASS =
  "rounded-lg border border-[var(--sc-surface-light-border)] bg-white px-3 py-1.5 text-sm text-[var(--sc-surface-light-ink)] shadow-sm focus:border-[var(--sc-border-strong)] focus:outline-none";

const SCORING_CODES = new Set([MATCH_LOG_EVENT_CODES.SCORE, MATCH_LOG_EVENT_CODES.CALAHAN]);

function formatDateTime(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toLocaleString();
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

  const teamAId = match?.team_a?.id ?? null;
  const teamBId = match?.team_b?.id ?? null;

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

  const handleSubmit = (event) => {
    event.preventDefault();

    if (isEdit) {
      // Pass keys explicitly so the service's hasOwnProperty guards clear a value
      // when it is blanked, rather than leaving the old one in place.
      const updates = {
        eventTypeCode: eventCode,
        teamId: teamId || null,
        actorId: isScoring ? scorerId || null : null,
        secondaryActorId: isScoring && !isCallahan ? assistId || null : null,
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
        createdAt: state.createdAt,
      },
      reason,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card
        variant="light"
        className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto p-4 shadow-xl"
      >
        <div>
          <h3 className="text-base font-semibold text-[var(--sc-surface-light-ink)]">
            {isEdit ? "Edit log entry" : "Add log entry"}
          </h3>
          <p className="mt-1 text-xs text-[var(--sc-surface-light-ink)]/70">
            {isEdit
              ? `Recorded at ${formatDateTime(log?.timestamp)}`
              : `Will be inserted ${state.anchorLabel} (${formatDateTime(state.createdAt)})`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">
              Event type
            </p>
            <select
              value={eventCode}
              onChange={(event) => setEventCode(event.target.value)}
              className={`${LIGHT_INPUT_CLASS} mt-1 w-full appearance-none`}
            >
              {eventDefinitions.map((definition) => (
                <option key={definition.code} value={definition.code}>
                  {definition.description || definition.code}
                </option>
              ))}
            </select>
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
              Reason
            </p>
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why this entry is being changed"
              className={`${LIGHT_INPUT_CLASS} mt-1 w-full`}
            />
            <p className="mt-1 text-[11px] text-[var(--sc-surface-light-ink)]/60">
              Stored in the audit log. Match logs keep no edit history of their own.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="sc-button" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="sc-button" disabled={saving}>
              {saving ? "Saving..." : isEdit ? "Save changes" : "Add entry"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
