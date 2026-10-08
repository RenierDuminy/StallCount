import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getTeamsLinkedToEvent } from "../services/teamService";
import { getEventsList } from "../services/leagueService";
import { SectionHeader, SectionShell, Field, Select } from "../components/ui/primitives";
import usePersistentState from "../hooks/usePersistentState";
import useAccessScope from "../hooks/useAccessScope";
import { CAPTAIN_ACCESS_PERMISSIONS } from "../utils/accessControl";
import { filterByScope } from "../utils/roleScope";
import CaptainMatchesPanel from "./captain/CaptainMatchesPanel";
import CaptainRosterPanel from "./captain/CaptainRosterPanel";

// Keys kept from the single-purpose roster page so a returning captain lands on
// the same event and team.
const CAPTAIN_SELECTED_EVENT_KEY = "stallcount:captain:selected-event:v1";
const CAPTAIN_SELECTED_TEAM_KEY = "stallcount:captain:selected-team:v1";
const CAPTAIN_TAB_KEY = "stallcount:captain:tab:v1";

function TabIcon({ children }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const TABS = [
  {
    key: "matches",
    label: "Matches & spirit",
    // Clipboard with a tick: results to sign off.
    icon: (
      <TabIcon>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V3h6v1" />
        <path d="m9 13 2 2 4-4" />
      </TabIcon>
    ),
  },
  {
    key: "roster",
    label: "Roster",
    // Group of people.
    icon: (
      <TabIcon>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M16 5a3 3 0 0 1 0 6" />
        <path d="M18 14a5 5 0 0 1 3 6" />
      </TabIcon>
    ),
  },
];
const TAB_KEYS = new Set(TABS.map((tab) => tab.key));

/**
 * Captain portal: one place for a captain's duties for their team in an event —
 * spirit scores and result confirmation (Matches tab) and roster management
 * (Roster tab). The event/team picker is shared by both tabs.
 */
export default function CaptainPage() {
  const [events, setEvents] = useState([]);
  const [eventTeams, setEventTeams] = useState([]);
  const [eventTeamsLoading, setEventTeamsLoading] = useState(false);
  const [eventTeamsError, setEventTeamsError] = useState(null);
  const [selectedEventId, setSelectedEventId] = usePersistentState(CAPTAIN_SELECTED_EVENT_KEY, "");
  const [selectedTeamId, setSelectedTeamId] = usePersistentState(CAPTAIN_SELECTED_TEAM_KEY, "");
  const [storedTab, setActiveTab] = usePersistentState(CAPTAIN_TAB_KEY, "matches");
  const activeTab = TAB_KEYS.has(storedTab) ? storedTab : "matches";
  const previousEventIdRef = useRef(selectedEventId);

  useEffect(() => {
    getEventsList(50)
      .then((data) => setEvents(data ?? []))
      .catch(() => setEvents([]));
  }, []);

  // Which events/teams this user may manage. Admin, tournament director and
  // field assistant bypass scoping entirely (see roleScope.js).
  const {
    scope: accessScope,
    ready: scopeResolved,
    isEmpty: hasNoTeamAccess,
    filterEvents,
    teamsForEvent,
  } = useAccessScope(CAPTAIN_ACCESS_PERMISSIONS);

  const availableEvents = useMemo(() => filterEvents(events), [filterEvents, events]);

  const allowedTeamIds = useMemo(
    () => teamsForEvent(selectedEventId),
    [teamsForEvent, selectedEventId],
  );

  const availableTeams = useMemo(
    () => filterByScope(eventTeams, allowedTeamIds),
    [eventTeams, allowedTeamIds],
  );

  const selectedTeam = useMemo(
    () => availableTeams.find((team) => String(team.id) === String(selectedTeamId)) || null,
    [availableTeams, selectedTeamId],
  );

  // Clear a persisted selection that is no longer permitted. Gated on
  // scopeResolved so a page load doesn't wipe a valid selection.
  useEffect(() => {
    if (!scopeResolved) return;
    if (
      selectedEventId &&
      !availableEvents.some((event) => String(event.id) === String(selectedEventId))
    ) {
      setSelectedEventId("");
    }
  }, [scopeResolved, availableEvents, selectedEventId, setSelectedEventId]);

  useEffect(() => {
    if (!scopeResolved || eventTeamsLoading) return;
    if (
      selectedTeamId &&
      !availableTeams.some((team) => String(team.id) === String(selectedTeamId))
    ) {
      setSelectedTeamId("");
    }
  }, [scopeResolved, eventTeamsLoading, availableTeams, selectedTeamId, setSelectedTeamId]);

  // A captain usually manages one team, so pick it for them.
  useEffect(() => {
    if (!scopeResolved || eventTeamsLoading || selectedTeamId) return;
    if (allowedTeamIds !== null && availableTeams.length === 1) {
      setSelectedTeamId(String(availableTeams[0].id));
    }
  }, [scopeResolved, eventTeamsLoading, selectedTeamId, allowedTeamIds, availableTeams, setSelectedTeamId]);

  useEffect(() => {
    const eventChanged = previousEventIdRef.current !== selectedEventId;
    previousEventIdRef.current = selectedEventId;
    if (eventChanged) {
      setSelectedTeamId("");
    }

    if (!selectedEventId) {
      setEventTeams([]);
      setEventTeamsLoading(false);
      return;
    }

    let isCancelled = false;
    setEventTeamsLoading(true);
    setEventTeamsError(null);

    getTeamsLinkedToEvent(selectedEventId)
      .then((data) => {
        if (!isCancelled) setEventTeams(data ?? []);
      })
      .catch((err) => {
        if (isCancelled) return;
        setEventTeams([]);
        setEventTeamsError(err.message || "Unable to load event teams.");
      })
      .finally(() => {
        if (!isCancelled) setEventTeamsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedEventId, setSelectedTeamId]);

  /**
   * Client-side guard for captain actions. This is a UX affordance only —
   * real enforcement lives in RLS on team_roster and in the captain SQL
   * functions for spirit scores and result confirmation.
   */
  const canManageTeam = useCallback(() => {
    if (accessScope.unrestricted) return true;
    if (allowedTeamIds === null) return true;
    return Boolean(selectedTeamId) && allowedTeamIds.has(String(selectedTeamId));
  }, [accessScope.unrestricted, allowedTeamIds, selectedTeamId]);

  return (
    <div className="sc-captain-portal pb-12 text-ink sm:pb-16">
      <SectionShell as="header" className="py-3 sm:py-5">
        <div className="border-b border-border pb-3 sm:pb-5">
          <SectionHeader
            title="Captain portal"
            description="Spirit scores, result confirmation and your team roster."
            action={
              <Link to="/admin" className="sc-button is-ghost">
                Back to admin hub
              </Link>
            }
          />
        </div>
      </SectionShell>

      <SectionShell as="main" className="space-y-4 py-3 sm:space-y-6 sm:py-5">
        {!scopeResolved ? (
          <p className="px-1 text-sm text-ink-muted">Checking access...</p>
        ) : hasNoTeamAccess ? (
          <section className="space-y-3 rounded-xl border border-border/80 border-l-4 border-l-warning-border bg-[rgba(15,37,31,0.38)] p-4 sm:p-5">
            <SectionHeader title="No team access yet" />
            <p className="text-sm text-ink-muted">
              Captain tools are granted per team. You do not currently hold a captain or team
              manager role for any team, so there is nothing to manage here.
            </p>
            <p className="text-sm text-ink-muted">
              Ask your tournament director to grant you access for your team, then reload this
              page.
            </p>
            <Link to="/admin" className="sc-button is-ghost w-fit">
              Back to admin hub
            </Link>
          </section>
        ) : (
          <>
            <section className="grid gap-3 rounded-xl border border-border/80 bg-surface-muted p-3 sm:gap-4 sm:p-4 md:grid-cols-2">
              <Field label="Event" htmlFor="captain-event">
                <Select
                  id="captain-event"
                  value={selectedEventId}
                  onChange={(event) => setSelectedEventId(event.target.value)}
                >
                  <option value="">
                    {availableEvents.length === 0 ? "No events available" : "Choose an event"}
                  </option>
                  {availableEvents.map((eventItem) => (
                    <option key={eventItem.id} value={eventItem.id}>
                      {eventItem.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Team" htmlFor="captain-team">
                <Select
                  id="captain-team"
                  value={selectedTeamId}
                  onChange={(event) => setSelectedTeamId(event.target.value)}
                  disabled={!selectedEventId || eventTeamsLoading}
                >
                  <option value="">
                    {!selectedEventId
                      ? "Choose an event first"
                      : eventTeamsLoading
                        ? "Loading teams..."
                        : availableTeams.length === 0
                          ? "No teams available"
                          : "Choose a team"}
                  </option>
                  {availableTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
              </Field>

              {eventTeamsError ? (
                <div className="sc-alert is-error md:col-span-2">{eventTeamsError}</div>
              ) : null}
            </section>

            {/* Segmented control: the active tab is a solid lime pill, the
                inactive one an outlined pill, so the two never look alike. */}
            <div
              role="tablist"
              aria-label="Captain tools"
              className="grid grid-cols-2 gap-1 rounded-full border border-border-strong p-1 sm:inline-grid sm:w-auto"
            >
              {TABS.map((tab) => {
                const active = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    id={`captain-tab-${tab.key}`}
                    aria-selected={active}
                    aria-controls={`captain-panel-${tab.key}`}
                    onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? "bg-accent text-[var(--sc-button-ink)] shadow-[0_4px_14px_rgba(198,255,98,0.25)]"
                        : "text-ink hover:bg-white/10"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div
              role="tabpanel"
              id={`captain-panel-${activeTab}`}
              aria-labelledby={`captain-tab-${activeTab}`}
            >
              {activeTab === "matches" ? (
                <CaptainMatchesPanel
                  selectedEventId={selectedEventId}
                  selectedTeam={selectedTeam}
                  canManageTeam={canManageTeam}
                />
              ) : (
                <CaptainRosterPanel
                  selectedEventId={selectedEventId}
                  selectedTeamId={selectedTeamId}
                  canManageTeam={canManageTeam}
                />
              )}
            </div>
          </>
        )}
      </SectionShell>
    </div>
  );
}
