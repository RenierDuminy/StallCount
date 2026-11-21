import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getPlayerMatchStats } from "../services/teamService";
import { Card, Panel, SectionShell, Field, Select } from "../components/ui/primitives";
import { matchPath } from "../utils/links";
import { EVENT_SECTIONS, getEventSectionPath } from "./eventWorkspaces";
import { usePageMeta, withSiteName } from "../utils/pageMeta";

export default function PlayerProfilePage() {
  const { playerId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialEventId = searchParams.get("eventId") || "all";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventFilter, setEventFilter] = useState(initialEventId);

  useEffect(() => {
    const requestedEventId = searchParams.get("eventId") || "all";
    setEventFilter((current) => (current === requestedEventId ? current : requestedEventId));
  }, [searchParams]);

  useEffect(() => {
    let ignore = false;
    async function loadPlayer() {
      setLoading(true);
      setError(null);
      try {
        const data = await getPlayerMatchStats(playerId);
        if (!ignore) {
          setRows(data || []);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Unable to load player stats.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadPlayer();
    return () => {
      ignore = true;
    };
  }, [playerId]);

  const identity = useMemo(() => {
    const first = rows[0];
    return {
      name: first?.player?.name || "Player",
      jersey: first?.player?.jersey_number ?? null,
    };
  }, [rows]);

  const eventOptions = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const event = row.match?.event;
      if (!event?.id) return;
      const startTime = row.match?.start_time || null;
      const existing = map.get(event.id);
      if (!existing) {
        map.set(event.id, { id: event.id, name: event.name || "Event", slug: event.slug || null, startTime });
      } else if (startTime && (!existing.startTime || startTime > existing.startTime)) {
        existing.startTime = startTime;
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.startTime && b.startTime) return b.startTime.localeCompare(a.startTime);
      if (a.startTime) return -1;
      if (b.startTime) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (eventFilter === "all") {
      return rows;
    }
    return rows.filter((row) => row.match?.event?.id === eventFilter);
  }, [eventFilter, rows]);

  const profile = useMemo(() => {
    if (!filteredRows.length) return null;
    const first = filteredRows[0];
    const name = first.player?.name || identity.name || "Player";
    const jersey = first.player?.jersey_number ?? identity.jersey ?? null;

    const totals = filteredRows.reduce(
      (acc, row) => {
        acc.goals += row.goals || 0;
        acc.assists += row.assists || 0;
        acc.blocks += row.blocks || 0;
        acc.turnovers += row.turnovers || 0;
        acc.callahans += row.callahans || 0;
        acc.matches.add(row.match_id);
        return acc;
      },
      { goals: 0, assists: 0, blocks: 0, turnovers: 0, callahans: 0, matches: new Set() },
    );

    const games = totals.matches.size || 0;
    const totalPoints = totals.goals + totals.assists + totals.callahans;

    return {
      name,
      jersey,
      games,
      totals,
      totalPoints,
      totalsPerGame: games ? totalPoints / games : 0,
      assistPerGame: games ? totals.assists / games : 0,
      goalsPerGame: games ? totals.goals / games : 0,
    };
  }, [filteredRows, identity.jersey, identity.name]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const aTime = a.match?.start_time ? new Date(a.match.start_time).getTime() : 0;
      const bTime = b.match?.start_time ? new Date(b.match.start_time).getTime() : 0;
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;
      return bTime - aTime;
    });
  }, [filteredRows]);

  useEffect(() => {
    if (eventFilter === "all") {
      if (searchParams.has("eventId")) {
        setSearchParams({}, { replace: true });
      }
      return;
    }

    if (searchParams.get("eventId") !== eventFilter) {
      setSearchParams({ eventId: eventFilter }, { replace: true });
    }
  }, [eventFilter, searchParams, setSearchParams]);

  const backToPlayersHref =
    (eventFilter !== "all" &&
      getEventSectionPath(
        eventOptions.find((option) => option.id === eventFilter),
        EVENT_SECTIONS.PLAYERS,
      )) ||
    "/players";

  const displayName = `${profile?.name || identity.name}${
    (profile?.jersey ?? identity.jersey) != null ? ` (#${profile?.jersey ?? identity.jersey})` : ""
  }`;

  // Search title: the player's name once their stats have loaded.
  usePageMeta(
    rows.length && identity.name !== "Player"
      ? {
          title: withSiteName(identity.name),
          description: `${identity.name}: goals, assists, blocks and turnovers by match and event.`,
        }
      : null,
  );

  const showCallahans = filteredRows.some((row) => (row.callahans || 0) > 0);
  const showEventInRows = eventFilter === "all" && eventOptions.length > 1;
  const selectedEventName =
    eventFilter !== "all" ? eventOptions.find((option) => option.id === eventFilter)?.name : null;

  // The layout follows the width the page actually has (container queries),
  // not the screen size, so a half-screen window is treated like a tablet:
  // one column throughout, summary above the match table; the summary tiles
  // and the table columns adapt to the width (one row of tiles when wide).
  return (
    <div className="min-h-screen bg-light-page text-[var(--sc-surface-light-ink)]">
      <SectionShell className="space-y-3 py-3 sm:space-y-5 sm:py-6">
        <Card
          variant="light"
          className="@container p-4 shadow-md shadow-[rgba(8,25,21,0.06)] sm:p-6"
        >
          <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-end @2xl:justify-between">
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-semibold text-[var(--sc-surface-light-ink)] sm:text-3xl">
                {displayName}
              </h1>
              {profile ? (
                <p className="mt-1 text-sm text-[var(--sc-surface-light-ink)]/70">
                  {profile.games} {profile.games === 1 ? "game" : "games"}
                  {selectedEventName
                    ? ` at ${selectedEventName}`
                    : eventOptions.length > 1
                      ? ` across ${eventOptions.length} events`
                      : ""}
                </p>
              ) : null}
            </div>
            <div className="flex w-full flex-col gap-2 @lg:flex-row @lg:items-end @2xl:w-auto">
              {eventOptions.length > 0 ? (
                <Field className="w-full @lg:max-w-xs" label="Event" htmlFor="player-event-filter">
                  <Select
                    id="player-event-filter"
                    value={eventFilter}
                    onChange={(event) => setEventFilter(event.target.value)}
                  >
                    <option value="all">All events</option>
                    {eventOptions.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Link to={backToPlayersHref} className="sc-button is-light whitespace-nowrap text-center text-sm">
                Back to players
              </Link>
            </div>
          </div>
        </Card>

        {error && (
          <Card variant="light" className="border border-rose-400/40 bg-rose-950/10 p-4 text-sm font-semibold text-rose-700 shadow-md shadow-[rgba(8,25,21,0.06)]">
            {error}
          </Card>
        )}

        {loading ? (
          <Panel
            variant="light"
            className="border border-dashed border-[var(--sc-surface-light-border)] bg-white/70 p-4 text-center text-sm text-[var(--sc-surface-light-ink)]/70 sm:p-6"
          >
            Loading player stats...
          </Panel>
        ) : !filteredRows.length ? (
          <Panel
            variant="light"
            className="border border-dashed border-[var(--sc-surface-light-border)] bg-white/70 p-4 text-center text-sm text-[var(--sc-surface-light-ink)]/70 sm:p-6"
          >
            {eventFilter === "all"
              ? "No stats recorded for this player yet."
              : "No stats recorded for this player in the selected event."}
          </Panel>
        ) : (
          <div className="@container">
            <div className="grid gap-3 sm:gap-4">
              <Card variant="light" className="space-y-3 p-3 shadow-md shadow-[rgba(8,25,21,0.06)] sm:p-4">
                <h2 className="text-lg font-semibold text-[var(--sc-surface-light-ink)]">Summary</h2>
                {/* auto-fill: as many tiles per row as fit, so 2 on a phone,
                    one row on a wide window. */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 sm:gap-3">
                  <SummaryStat
                    label="Total"
                    value={profile.totalPoints}
                    helper={`${profile.totalsPerGame.toFixed(1)}/game`}
                  />
                  <SummaryStat label="Goals" value={profile.totals.goals} helper={`${profile.goalsPerGame.toFixed(1)}/game`} />
                  <SummaryStat label="Assists" value={profile.totals.assists} helper={`${profile.assistPerGame.toFixed(1)}/game`} />
                  <SummaryStat label="Blocks" value={profile.totals.blocks} />
                  <SummaryStat label="Turnovers" value={profile.totals.turnovers} />
                  <SummaryStat label="Games played" value={profile.games} />
                  {showCallahans && (
                    <SummaryStat label="Callahans" value={profile.totals.callahans} tone="gold" />
                  )}
                </div>
                <p className="text-xs text-[var(--sc-surface-light-ink)]/60">
                  Total is goals plus assists{showCallahans ? " plus Callahans" : ""}.
                </p>
              </Card>

              <Card variant="light" className="@container min-w-0 space-y-3 p-3 shadow-md shadow-[rgba(8,25,21,0.06)] sm:p-4">
                <h2 className="text-lg font-semibold text-[var(--sc-surface-light-ink)]">Matches</h2>
                <Panel variant="light" className="overflow-x-auto p-0 shadow-sm shadow-[rgba(8,25,21,0.04)]">
                  <table className="min-w-full divide-y divide-[var(--sc-surface-light-border)] text-sm text-[var(--sc-surface-light-ink)]/85">
                    <thead className="bg-white/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/60">
                      <tr>
                        <th className="px-3 py-2">Match</th>
                        <StatHeader full="Total" short="Tot" />
                        <StatHeader full="Goals" short="G" />
                        <StatHeader full="Assists" short="A" />
                        <StatHeader full="Blocks" short="B" />
                        <StatHeader full="Turnovers" short="TO" />
                        {showCallahans ? <StatHeader full="Callahans" short="CAL" /> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sc-surface-light-border)]/70">
                      {sortedRows.map((row) => {
                        const matchHref = row.match_id ? matchPath(row.match_id) : "/matches";
                        const detail = [
                          formatMatchDate(row.match?.start_time),
                          showEventInRows ? row.match?.event?.name : null,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <tr key={row.match_id} className="hover:bg-white/60">
                            {/* w-full + max-w-0: the column takes the space the
                                number columns leave, so the label can tell
                                whether the full names fit. */}
                            <td className="w-full max-w-0 px-3 py-2">
                              <Link
                                to={matchHref}
                                className="block font-semibold text-(--sc-surface-light-ink)! underline decoration-dotted decoration-(--sc-surface-light-border) underline-offset-4 transition hover:text-(--sc-surface-light-ink)/70!"
                              >
                                <FitLabel full={buildMatchLabel(row)} short={buildMatchLabel(row, { short: true })} />
                              </Link>
                              {detail ? (
                                <span className="mt-0.5 block truncate text-xs text-[var(--sc-surface-light-ink)]/60">
                                  {detail}
                                </span>
                              ) : null}
                            </td>
                            {/* Total: goals + assists + Callahans, as in the summary. */}
                            <StatCell value={(row.goals || 0) + (row.assists || 0) + (row.callahans || 0)} strong />
                            <StatCell value={row.goals} />
                            <StatCell value={row.assists} />
                            <StatCell value={row.blocks} />
                            <StatCell value={row.turnovers} />
                            {showCallahans ? <StatCell value={row.callahans} circled /> : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Panel>
              </Card>
            </div>
          </div>
        )}
      </SectionShell>
    </div>
  );
}

const MATCH_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatMatchDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : MATCH_DATE_FORMATTER.format(date);
}

// The full column name once the matches card is wide enough (a container
// query on the card, so it follows a split-screen window too); otherwise the
// abbreviation, with the full name as its tooltip.
function StatHeader({ full, short }) {
  return (
    <th className="whitespace-nowrap px-2 py-2 text-center sm:px-3">
      <abbr title={full} className="no-underline @xl:hidden">
        {short}
      </abbr>
      <span className="hidden @xl:inline">{full}</span>
    </th>
  );
}

// `circled`: a non-zero value gets a circle outline (the Callahans column).
function StatCell({ value, strong = false, circled = false }) {
  const shown = value ?? 0;
  return (
    <td
      className={`whitespace-nowrap px-2 py-2 text-center tabular-nums text-[var(--sc-surface-light-ink)] sm:px-3 ${strong ? "font-semibold" : ""}`}
    >
      {circled && shown ? (
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-current px-1 leading-none">
          {shown}
        </span>
      ) : circled ? (
        <span className="text-[var(--sc-surface-light-ink)]/40">–</span>
      ) : (
        shown
      )}
    </td>
  );
}

function SummaryStat({ label, value, helper, tone = "default" }) {
  const isGold = tone === "gold";
  return (
    <Panel
      variant="light"
      className={`p-3 shadow-sm shadow-[rgba(8,25,21,0.04)] sm:p-4 ${isGold ? "border-amber-400/60" : ""}`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wide ${isGold ? "text-amber-600" : "text-[var(--sc-surface-light-ink)]/60"}`}>
        {label}
      </p>
      <p className={`mt-0.5 text-xl font-semibold sm:mt-1 sm:text-2xl ${isGold ? "text-amber-700" : "text-[var(--sc-surface-light-ink)]"}`}>
        {value ?? 0}
      </p>
      {helper && (
        <p className={`mt-0.5 text-xs ${isGold ? "text-amber-600/80" : "text-[var(--sc-surface-light-ink)]/50"}`}>
          {helper}
        </p>
      )}
    </Panel>
  );
}

function buildMatchLabel(row, { short = false } = {}) {
  const pick = (team, fallback) =>
    (short ? team?.short_name || team?.name : team?.name || team?.short_name) || fallback;
  return `${pick(row.match?.team_a, "Team A")} vs ${pick(row.match?.team_b, "Team B")}`;
}

/**
 * Shows `full` when it fits on one line in the space available, else `short`
 * (cut with an ellipsis if even that is too long). An invisible copy of the
 * full text is measured, so the choice is re-made whenever the width changes.
 */
function FitLabel({ full, short }) {
  const boxRef = useRef(null);
  const measureRef = useRef(null);
  const [fits, setFits] = useState(true);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure || full === short) return undefined;
    const check = () => setFits(measure.offsetWidth <= box.clientWidth);
    check();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(check);
    observer.observe(box);
    return () => observer.disconnect();
  }, [full, short]);

  return (
    <span ref={boxRef} className="relative block" title={full}>
      <span className="block truncate">{fits ? full : short}</span>
      <span
        ref={measureRef}
        aria-hidden="true"
        className="invisible absolute left-0 top-0 whitespace-nowrap"
      >
        {full}
      </span>
    </span>
  );
}
