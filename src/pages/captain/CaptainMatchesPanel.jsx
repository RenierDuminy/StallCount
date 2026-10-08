import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionHeader } from "../../components/ui/primitives";
import {
  confirmMatchResult,
  describeCaptainMatch,
  getSpiritScoresForMatches,
  getTeamMatchesForEvent,
  saveCaptainSpiritScore,
} from "../../services/captainService";
import {
  MATCH_STATUS,
  isClosedStatus,
  isForfeitStatus,
  isInProgressStatus,
} from "../../constants/statusCodes";
import { SPIRIT_DIMENSIONS, SPIRIT_MAX_SCORE } from "../../utils/spirit";
import CaptainSpiritEditor from "./CaptainSpiritEditor";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function spiritTotal(row) {
  if (!row) return null;
  return SPIRIT_DIMENSIONS.reduce((sum, { key }) => {
    const value = Number(row[key]);
    return sum + (Number.isFinite(value) ? Math.min(SPIRIT_MAX_SCORE, Math.max(0, value)) : 0);
  }, 0);
}

function formatDate(timestamp) {
  if (!timestamp) return "Date TBD";
  return new Date(timestamp).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatStamp(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function teamName(team) {
  return team?.name || team?.short_name || "TBD";
}

const STATUS_LABELS = {
  [MATCH_STATUS.SCHEDULED]: "Scheduled",
  [MATCH_STATUS.INITIALIZED]: "Ready",
  [MATCH_STATUS.POSTPONED]: "Postponed",
  [MATCH_STATUS.LIVE]: "Live",
  [MATCH_STATUS.HALFTIME]: "Halftime",
  [MATCH_STATUS.FINISHED]: "Final",
  [MATCH_STATUS.COMPLETED]: "Final",
  [MATCH_STATUS.CANCELED]: "Canceled",
};

function statusLabel(status) {
  if (isForfeitStatus(status)) return "Forfeit";
  return STATUS_LABELS[String(status || "").toLowerCase()] || "Scheduled";
}

/** Which list a match belongs in, from the captain's point of view. */
function bucketOf(info, match) {
  if (info.fullyConfirmed) return "confirmed";
  if (info.concluded) return "action";
  if (isClosedStatus(match.status)) return "closed"; // canceled / forfeit: nothing to confirm
  return "upcoming";
}

/**
 * Display strings for both sides' sign-off state. The opponent's spirit score
 * for you stays hidden until yours is in, so it cannot colour the score you
 * give — before that, only whether it exists is shown.
 */
function describeSides(info) {
  const givenTotal = spiritTotal(info.spiritGiven);
  const receivedTotal = spiritTotal(info.spiritReceived);
  return {
    ownWon: info.concluded && info.ownScore > info.opponentScore,
    opponentWon: info.concluded && info.opponentScore > info.ownScore,
    ownSpirit: givenTotal !== null ? String(givenTotal) : null,
    opponentSpirit: !info.spiritReceived
      ? null
      : info.spiritGiven
        ? String(receivedTotal)
        : "Submitted",
  };
}

// ---------------------------------------------------------------------------
// Icons (stroke icons, sized by the caller via className)
// ---------------------------------------------------------------------------

function Icon({ children, className = "h-4 w-4", strokeWidth = 2 }) {
  return (
    <svg
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const CheckIcon = (props) => (
  <Icon {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
// Clock hands only: drawn inside the pending ring, which serves as the dial.
const ClockHandsIcon = (props) => (
  <Icon {...props}>
    <path d="M12 5v7l4 3" />
  </Icon>
);
const LockIcon = (props) => (
  <Icon {...props}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
);
const RefreshIcon = (props) => (
  <Icon {...props}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </Icon>
);

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function StatusTag({ status }) {
  const live = isInProgressStatus(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${
        live ? "text-live-ink" : "text-ink-muted"
      }`}
    >
      {live ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {statusLabel(status)}
    </span>
  );
}

function SummaryStat({ value, label, emphasis = false }) {
  return (
    <div className="py-2 pr-3 sm:px-4 sm:first:pl-0">
      <p className={`text-2xl font-semibold tabular-nums ${emphasis && value > 0 ? "text-accent" : "text-ink"}`}>
        {value}
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{label}</p>
    </div>
  );
}

function MatchMeta({ match }) {
  return (
    <p className="truncate text-xs text-ink-muted">
      {formatDate(match.start_time)}
      {match.start_time ? ` · ${formatTime(match.start_time)}` : ""}
      {match.venue?.name ? ` · ${match.venue.name}` : ""}
    </p>
  );
}

function LockedNote({ info }) {
  return (
    <p className="flex items-start gap-2 text-xs text-ink-muted">
      <LockIcon className="h-4 w-4 text-ink" strokeWidth={2.5} />
      {info.fullyConfirmed
        ? "Result confirmed by both captains. Contact the tournament director for corrections."
        : `Confirmed by you. Awaiting ${teamName(info.opponent)}.`}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Result layout: your team | score | opponent, at every width
// ---------------------------------------------------------------------------

/** One line of a side's sign-off state. `alignRight` mirrors it for the opponent. */
function Checkpoint({ done, label, detail, alignRight = false }) {
  return (
    <div className={`flex min-w-0 items-start gap-1.5 sm:gap-2 ${alignRight ? "flex-row-reverse text-right" : ""}`}>
      {/* Solid when done, outlined when pending: both read clearly on the dark page. */}
      <span
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full sm:h-6 sm:w-6 ${
          done
            ? "bg-accent text-[var(--sc-button-ink)]"
            : "border-2 border-ink-muted text-ink"
        }`}
      >
        {done ? (
          <CheckIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={3.5} />
        ) : (
          <ClockHandsIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={3} />
        )}
      </span>
      <div className="min-w-0 leading-tight">
        <p className={`text-[11px] font-semibold sm:text-xs ${done ? "text-ink" : "text-ink-muted"}`}>{label}</p>
        {detail ? <p className="truncate text-[11px] text-ink-muted">{detail}</p> : null}
      </div>
    </div>
  );
}

/** Side column: one team's name, the spirit score that team GAVE, and its confirmation. */
function TeamSide({ team, won, spirit, confirmedAt, alignRight = false }) {
  return (
    <div className={`min-w-0 space-y-2 sm:space-y-2.5 ${alignRight ? "text-right" : ""}`}>
      <p
        className={`line-clamp-2 break-words text-sm leading-snug sm:text-lg ${
          won ? "font-bold" : "font-medium"
        } text-ink`}
      >
        {teamName(team)}
      </p>
      <div className={`flex flex-col gap-1.5 sm:gap-2 ${alignRight ? "items-end" : "items-start"}`}>
        <Checkpoint
          done={Boolean(spirit)}
          label="Spirit given"
          detail={spirit === "Submitted" ? "Shown after yours" : spirit || "Not submitted"}
          alignRight={alignRight}
        />
        <Checkpoint
          done={Boolean(confirmedAt)}
          label={confirmedAt ? "Confirmed" : "Pending confirmation"}
          detail={confirmedAt ? formatStamp(confirmedAt) : null}
          alignRight={alignRight}
        />
      </div>
    </div>
  );
}

function Scoreboard({ match, info, sides }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 sm:items-center sm:gap-6">
      <TeamSide team={info.own} won={sides.ownWon} spirit={sides.ownSpirit} confirmedAt={info.ownConfirmedAt} />
      <div className="flex flex-col items-center gap-1">
        <p className="flex items-center gap-1.5 text-3xl font-semibold tabular-nums text-ink sm:gap-3 sm:text-4xl">
          <span className={!sides.ownWon && info.concluded ? "text-ink-muted" : ""}>{info.ownScore}</span>
          <span className="text-lg text-ink-muted sm:text-xl">–</span>
          <span className={!sides.opponentWon && info.concluded ? "text-ink-muted" : ""}>{info.opponentScore}</span>
        </p>
        <StatusTag status={match.status} />
      </div>
      <TeamSide
        team={info.opponent}
        won={sides.opponentWon}
        spirit={sides.opponentSpirit}
        confirmedAt={info.opponentConfirmedAt}
        alignRight
      />
    </div>
  );
}

/** Desktop: blocker text on the left, both actions inline on the right. */
function DesktopActions({ info, busy, onEditSpirit, onConfirm }) {
  return (
    <div className="hidden flex-wrap items-center justify-between gap-2 border-t border-dashed border-border pt-3 lg:flex">
      {info.locked ? (
        <LockedNote info={info} />
      ) : (
        <>
          <p className="text-xs text-ink-muted">{info.confirmBlocker || "Ready to confirm."}</p>
          <div className="flex flex-wrap items-center gap-2">
            {info.canEditSpirit ? (
              <button type="button" onClick={onEditSpirit} disabled={busy} className="sc-button is-ghost text-xs">
                {info.spiritGiven ? "Edit spirit score" : "Enter spirit score"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || !info.canConfirm}
              className="sc-button text-xs disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? "Confirming..." : "Confirm result"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Phone: say the next step, then one full-width button for it. A disabled
 * Confirm button is noise on a phone, so it appears only once confirming is
 * actually possible.
 */
function MobileActions({ info, busy, onEditSpirit, onConfirm }) {
  return (
    <div className="space-y-2 border-t border-dashed border-border pt-3 lg:hidden">
      {info.locked ? (
        <LockedNote info={info} />
      ) : info.canConfirm ? (
        <>
          <p className="text-xs text-ink-muted">Next: confirm the {info.ownScore}–{info.opponentScore} result.</p>
          <button type="button" onClick={onConfirm} disabled={busy} className="sc-button w-full disabled:cursor-not-allowed">
            {busy ? "Confirming..." : "Confirm result"}
          </button>
          {info.canEditSpirit ? (
            <button
              type="button"
              onClick={onEditSpirit}
              disabled={busy}
              className="w-full py-1.5 text-center text-xs font-semibold text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Edit spirit score
            </button>
          ) : null}
        </>
      ) : info.canEditSpirit && !info.spiritGiven ? (
        <>
          <p className="text-xs text-ink-muted">Next: score {teamName(info.opponent)}&apos;s spirit.</p>
          <button type="button" onClick={onEditSpirit} disabled={busy} className="sc-button w-full disabled:cursor-not-allowed">
            Enter spirit score
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-ink-muted">{info.confirmBlocker || "Nothing to do yet."}</p>
          {info.canEditSpirit ? (
            <button type="button" onClick={onEditSpirit} disabled={busy} className="sc-button is-ghost w-full">
              Edit spirit score
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One match entry and the plain fixture list
// ---------------------------------------------------------------------------

/** A played match: a flat entry in its section, separated from the next by a rule. */
function ResultEntry({ match, info, editing, busy, onEditSpirit, onCancelSpirit, onSaveSpirit, onConfirm }) {
  const sides = describeSides(info);
  return (
    <li className="py-4 first:pt-3">
      {editing ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <MatchMeta match={match} />
            <span className="text-sm font-semibold tabular-nums text-ink">
              {info.ownScore}–{info.opponentScore}
            </span>
          </div>
          <div className="border-l-2 border-accent pl-3 sm:pl-4">
            <CaptainSpiritEditor
              opponentName={teamName(info.opponent)}
              existing={info.spiritGiven}
              saving={busy}
              onSave={onSaveSpirit}
              onCancel={onCancelSpirit}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <MatchMeta match={match} />
            <Scoreboard match={match} info={info} sides={sides} />
            <DesktopActions info={info} busy={busy} onEditSpirit={onEditSpirit} onConfirm={onConfirm} />
            <MobileActions info={info} busy={busy} onEditSpirit={onEditSpirit} onConfirm={onConfirm} />
          </div>
        </>
      )}
    </li>
  );
}

/** Upcoming / in-progress / canceled fixtures: nothing to sign off yet, so a plain table. */
function FixtureTable({ items }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-[0.12em] text-ink-muted">
          <tr className="border-b border-border/70">
            <th className="py-2 pr-3 text-left font-semibold">Date</th>
            <th className="px-3 py-2 text-left font-semibold">Opponent</th>
            <th className="hidden px-3 py-2 text-left font-semibold sm:table-cell">Venue</th>
            <th className="px-3 py-2 text-right font-semibold">Score</th>
            <th className="py-2 pl-3 text-right font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map(({ match, info }) => {
            const started = isInProgressStatus(match.status);
            return (
              <tr key={match.id}>
                <td className="whitespace-nowrap py-2 pr-3 text-xs text-ink-muted">
                  {formatDate(match.start_time)}
                  <span className="block">{formatTime(match.start_time)}</span>
                </td>
                <td className="px-3 py-2 font-medium text-ink">{teamName(info.opponent)}</td>
                <td className="hidden px-3 py-2 text-xs text-ink-muted sm:table-cell">
                  {match.venue?.name || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink">
                  {started ? `${info.ownScore}–${info.opponentScore}` : "—"}
                </td>
                <td className="whitespace-nowrap py-2 pl-3 text-right">
                  <StatusTag status={match.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A titled group of matches: heading over a rule, entries below. */
function MatchSection({ id, title, count, children }) {
  const headingId = `captain-matches-${id}`;
  return (
    <section aria-labelledby={headingId} className="space-y-1">
      <div className="flex items-baseline justify-between border-b border-border pb-1.5">
        <h3 id={headingId} className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {title}
        </h3>
        <span className="text-xs tabular-nums text-ink-muted">{count}</span>
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/**
 * The captain's match list: give/update spirit scores and confirm results.
 * Every rule shown here is re-checked by the SQL functions behind
 * captainService, which are the real lock.
 */
export default function CaptainMatchesPanel({ selectedEventId, selectedTeam, canManageTeam }) {
  const teamId = selectedTeam?.id ? String(selectedTeam.id) : "";
  const [matches, setMatches] = useState([]);
  const [spiritByKey, setSpiritByKey] = useState(() => new Map());
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);
  const [editingMatchId, setEditingMatchId] = useState("");
  const [busyMatchId, setBusyMatchId] = useState("");

  const load = useCallback(async () => {
    if (!selectedEventId || !teamId) {
      setMatches([]);
      setSpiritByKey(new Map());
      return;
    }
    setLoading(true);
    try {
      const rows = await getTeamMatchesForEvent(selectedEventId, teamId);
      const spirit = await getSpiritScoresForMatches(rows.map((row) => row.id));
      setMatches(rows);
      setSpiritByKey(spirit);
    } catch (err) {
      setAlert({ tone: "error", message: err.message || "Unable to load matches." });
    } finally {
      setLoading(false);
    }
  }, [selectedEventId, teamId]);

  useEffect(() => {
    setAlert(null);
    setEditingMatchId("");
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const groups = { action: [], upcoming: [], confirmed: [], closed: [] };
    matches.forEach((match) => {
      const info = describeCaptainMatch(match, teamId, spiritByKey);
      if (!info.side) return;
      groups[bucketOf(info, match)].push({ match, info });
    });
    // Most recent first for anything already played; kick-off order for the rest.
    groups.confirmed.reverse();
    groups.closed.reverse();
    // Awaiting-you before awaiting-opponent, then most recent first.
    groups.action.reverse();
    groups.action.sort((left, right) => Number(left.info.locked) - Number(right.info.locked));
    return groups;
  }, [matches, spiritByKey, teamId]);

  const awaitingYou = grouped.action.filter(({ info }) => !info.locked).length;
  const awaitingOpponent = grouped.action.length - awaitingYou;

  function guard() {
    if (canManageTeam()) return true;
    setAlert({ tone: "error", message: "You do not have captain access for this team." });
    return false;
  }

  async function handleSaveSpirit(match, scores) {
    if (!guard()) return;
    setBusyMatchId(match.id);
    setAlert(null);
    try {
      await saveCaptainSpiritScore(match, teamId, scores);
      setEditingMatchId("");
      setAlert({ tone: "success", message: "Spirit score saved." });
      await load();
    } catch (err) {
      setAlert({ tone: "error", message: err.message || "Unable to save the spirit score." });
    } finally {
      setBusyMatchId("");
    }
  }

  async function handleConfirm(match, info) {
    if (!guard()) return;
    const confirmed = window.confirm(
      `Confirm the result ${teamName(info.own)} ${info.ownScore} – ${info.opponentScore} ${teamName(info.opponent)}?\n\n` +
        "Once confirmed you can no longer change your spirit score for this match.",
    );
    if (!confirmed) return;

    setBusyMatchId(match.id);
    setAlert(null);
    try {
      const state = await confirmMatchResult(match, teamId);
      setAlert({
        tone: "success",
        message: state?.captains_confirmed
          ? "Result confirmed by both captains. The match is now locked."
          : `Result confirmed. Awaiting ${teamName(info.opponent)}.`,
      });
      await load();
    } catch (err) {
      setAlert({ tone: "error", message: err.message || "Unable to confirm the result." });
    } finally {
      setBusyMatchId("");
    }
  }

  const renderResults = (items) => (
    <ul className="divide-y divide-border">
      {items.map(({ match, info }) => (
        <ResultEntry
          key={match.id}
          match={match}
          info={info}
          editing={editingMatchId === match.id}
          busy={busyMatchId === match.id}
          onEditSpirit={() => setEditingMatchId(match.id)}
          onCancelSpirit={() => setEditingMatchId("")}
          onSaveSpirit={(scores) => handleSaveSpirit(match, scores)}
          onConfirm={() => handleConfirm(match, info)}
        />
      ))}
    </ul>
  );

  return (
    <div className="space-y-6 px-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          title="Match results & spirit"
          description="After each match, submit your spirit score for the opposing team and confirm the result. A result is final once both captains have confirmed it."
        />
        {teamId ? (
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="sc-button is-ghost inline-flex items-center gap-1.5 text-xs"
          >
            <RefreshIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} strokeWidth={2.5} />
            Refresh
          </button>
        ) : null}
      </div>

      {alert ? (
        <div className={`sc-alert ${alert.tone === "error" ? "is-error" : "is-success"}`}>{alert.message}</div>
      ) : null}

      {!selectedEventId || !teamId ? (
        <p className="text-sm text-ink-muted">Select an event and team to view your matches.</p>
      ) : loading && matches.length === 0 ? (
        <p className="text-sm text-ink-muted">Loading matches...</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-ink-muted">{teamName(selectedTeam)} has no matches in this event yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 border-y border-border sm:grid-cols-4 sm:divide-x sm:divide-border">
            <SummaryStat value={awaitingYou} label="Awaiting you" emphasis />
            <SummaryStat value={awaitingOpponent} label="Awaiting opponent" />
            <SummaryStat value={grouped.confirmed.length} label="Confirmed" />
            <SummaryStat value={grouped.upcoming.length} label="Upcoming" />
          </div>

          {grouped.action.length > 0 ? (
            <MatchSection id="action" title="Awaiting sign-off" count={grouped.action.length}>
              {renderResults(grouped.action)}
            </MatchSection>
          ) : null}

          {grouped.upcoming.length > 0 ? (
            <MatchSection id="upcoming" title="Upcoming & in progress" count={grouped.upcoming.length}>
              <FixtureTable items={grouped.upcoming} />
            </MatchSection>
          ) : null}

          {grouped.confirmed.length > 0 ? (
            <MatchSection id="confirmed" title="Confirmed results" count={grouped.confirmed.length}>
              {renderResults(grouped.confirmed)}
            </MatchSection>
          ) : null}

          {grouped.closed.length > 0 ? (
            <MatchSection id="closed" title="Canceled & forfeited" count={grouped.closed.length}>
              <FixtureTable items={grouped.closed} />
            </MatchSection>
          ) : null}
        </>
      )}
    </div>
  );
}
