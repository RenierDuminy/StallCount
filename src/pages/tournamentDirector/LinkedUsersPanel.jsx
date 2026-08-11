import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import usePersistentState from "../../hooks/usePersistentState";
import { Card, Panel, SectionHeader, Chip } from "../../components/ui/primitives";
import { getEventLinkedUsers, getTeamLinkedUsers } from "../../services/userService";
import { normaliseRoleList, roleAssignmentsIncludeAdmin } from "../../utils/accessControl";
import { assignmentScopeOf } from "../../utils/roleScope";
import { TOURNAMENT_DIRECTOR_SELECTED_EVENT_KEY } from "./persistenceKeys";

const LIGHT_INPUT_CLASS =
  "rounded-lg border border-[var(--sc-surface-light-border)] bg-white px-3 py-1.5 text-sm text-[var(--sc-surface-light-ink)] shadow-sm focus:border-[var(--sc-border-strong)] focus:outline-none";
const LINKED_ROLE_GROUPS = [
  {
    key: "tournament_director",
    title: "Tournament directors",
  },
  {
    key: "field_assistant",
    title: "Field assistants",
  },
  {
    key: "captain",
    title: "Captains",
  },
  {
    key: "team_manager",
    title: "Team managers",
  },
  {
    key: "media",
    title: "Media",
  },
];

function compareAlphabetical(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { sensitivity: "base" });
}

/**
 * Load event-scoped and team-scoped grants for an event and merge them by user
 * id, so someone holding both kinds appears once carrying both lists.
 */
async function loadLinkedCrew(eventId) {
  const [linkedUsers, teamLinkedUsers] = await Promise.all([
    getEventLinkedUsers(eventId),
    getTeamLinkedUsers({ eventId }).catch(() => []),
  ]);

  const merged = new Map();
  (Array.isArray(linkedUsers) ? linkedUsers : []).forEach((user) => {
    merged.set(user.id, { ...user, teamRoles: [] });
  });
  (Array.isArray(teamLinkedUsers) ? teamLinkedUsers : []).forEach((user) => {
    const existing = merged.get(user.id);
    if (existing) {
      existing.teamRoles = [...(existing.teamRoles ?? []), ...(user.teamRoles ?? [])];
      return;
    }
    merged.set(user.id, { ...user, eventRoles: [] });
  });

  return Array.from(merged.values()).sort((left, right) =>
    compareAlphabetical(left.fullName || left.email || "", right.fullName || right.email || ""),
  );
}

function formatGrantedAt(value) {
  if (!value) return "Grant date unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Grant date unknown";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export default function LinkedUsersPanel({ eventsList = [], eventOptionsReady = true }) {
  const { roles, rolesLoading } = useAuth();
  const [selectedEventId, setSelectedEventId] = usePersistentState(
    TOURNAMENT_DIRECTOR_SELECTED_EVENT_KEY,
    "",
  );
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const accessibleEvents = useMemo(() => {
    if (!Array.isArray(eventsList) || eventsList.length === 0) {
      return [];
    }

    if (!Array.isArray(roles)) {
      return [];
    }

    if (roleAssignmentsIncludeAdmin(roles)) {
      return eventsList;
    }

    // Team grants carry their parent event, so they widen event access too.
    const allowedEventIds = new Set(
      roles
        .filter((assignment) => {
          const scope = assignmentScopeOf(assignment);
          if (scope !== "event" && scope !== "team") return false;
          return typeof assignment?.eventId === "string";
        })
        .map((assignment) => assignment.eventId),
    );

    if (allowedEventIds.size === 0) {
      return [];
    }

    return eventsList.filter((event) => allowedEventIds.has(event.id));
  }, [eventsList, roles]);

  useEffect(() => {
    if (!eventOptionsReady) {
      return;
    }

    if (!accessibleEvents.length) {
      if (selectedEventId) {
        setSelectedEventId("");
      }
      return;
    }

    if (!selectedEventId || !accessibleEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(accessibleEvents[0].id);
    }
  }, [accessibleEvents, eventOptionsReady, selectedEventId, setSelectedEventId]);

  const selectedEvent = useMemo(
    () => accessibleEvents.find((event) => event.id === selectedEventId) || null,
    [accessibleEvents, selectedEventId],
  );

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!eventOptionsReady) {
        return;
      }

      if (!selectedEventId || !selectedEvent) {
        setUsers([]);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const crew = await loadLinkedCrew(selectedEventId);
        if (!active) return;
        setUsers(crew);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load linked users.");
        setUsers([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [eventOptionsReady, selectedEvent, selectedEventId]);

  const groupedUsers = useMemo(
    () =>
      LINKED_ROLE_GROUPS.map((group) => {
        const entries = [];

        users.forEach((user) => {
          const allAssignments = [
            ...(Array.isArray(user.eventRoles) ? user.eventRoles : []),
            ...(Array.isArray(user.teamRoles) ? user.teamRoles : []),
          ];
          const matchingAssignments = allAssignments.filter((assignment) =>
            normaliseRoleList(assignment?.roleName).includes(group.key),
          );

          if (!matchingAssignments.length) return;

          // One row per team so a captain of several teams is listed under
          // each. Assignments without a team (event-scoped roles) collapse
          // into a single teamless row.
          const teamAssignments = matchingAssignments.filter((assignment) => assignment?.teamName);
          const eventOnlyAssignments = matchingAssignments.filter(
            (assignment) => !assignment?.teamName,
          );

          teamAssignments.forEach((assignment) => {
            entries.push({
              ...user,
              rowKey: `${user.id}-${assignment.assignmentId || assignment.teamId}`,
              teamName: assignment.teamName || "",
              matchingAssignments: [assignment],
            });
          });

          if (eventOnlyAssignments.length > 0) {
            entries.push({
              ...user,
              rowKey: `${user.id}-event`,
              teamName: "",
              matchingAssignments: eventOnlyAssignments,
            });
          }
        });

        // Team first, then user. Teamless (event-wide) rows sort last.
        entries.sort((left, right) => {
          if (Boolean(left.teamName) !== Boolean(right.teamName)) {
            return left.teamName ? -1 : 1;
          }
          const byTeam = compareAlphabetical(left.teamName, right.teamName);
          if (byTeam !== 0) return byTeam;
          return compareAlphabetical(
            left.fullName || left.email || "",
            right.fullName || right.email || "",
          );
        });

        return {
          ...group,
          users: entries,
          // Rows are per user-team pairing; the tile counts people.
          personCount: new Set(entries.map((entry) => entry.id)).size,
        };
      }),
    [users],
  );

  const totalLinkedUsers = users.length;

  return (
    <div className="space-y-4">
      <Card variant="light" className="space-y-3 p-4 shadow-md shadow-[rgba(8,25,21,0.06)]">
        <SectionHeader
          title="Event-linked crew"
          action={
            <>
              <Link to="/admin/event-access" className="sc-button">
                Event access control
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (!selectedEventId) return;
                  setLoading(true);
                  setError("");
                  loadLinkedCrew(selectedEventId)
                    .then((crew) => {
                      setUsers(crew);
                    })
                    .catch((err) => {
                      setError(err instanceof Error ? err.message : "Unable to refresh linked users.");
                      setUsers([]);
                    })
                    .finally(() => {
                      setLoading(false);
                    });
                }}
                className="sc-button"
              >
                Refresh users
              </button>
            </>
          }
        />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),auto]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-surface-light-ink)]/70">Event</p>
            <select
              value={selectedEventId}
              onChange={(event) => setSelectedEventId(event.target.value)}
              className={`${LIGHT_INPUT_CLASS} mt-2 w-full appearance-none`}
            >
              {rolesLoading ? <option value="">Loading access...</option> : null}
              {!rolesLoading && accessibleEvents.length === 0 ? <option value="">No accessible events</option> : null}
              {accessibleEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Chip variant="ghost" className="text-xs text-[var(--sc-surface-light-ink)]/80">
              {selectedEvent?.type || "Event"}
            </Chip>
            <Chip variant="ghost" className="text-xs text-[var(--sc-surface-light-ink)]/80">
              {loading ? "Loading users" : `${totalLinkedUsers} linked`}
            </Chip>
          </div>
        </div>

        {error ? (
          <Panel variant="light" className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </Panel>
        ) : null}
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2">
        {groupedUsers.map((group) => (
          <Panel
            key={group.key}
            variant="light"
            className="flex min-w-0 items-center justify-between gap-2 border border-[var(--sc-surface-light-border)] bg-white px-2 py-2 shadow-sm shadow-[rgba(8,25,21,0.03)]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--sc-surface-light-ink)]">{group.title}</p>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <p className="text-right text-lg font-bold leading-none text-[var(--sc-surface-light-ink)]">{group.personCount}</p>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--sc-surface-light-ink)]/55">linked</p>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-4">
        {groupedUsers.map((group) => (
          <Card key={group.key} variant="light" className="space-y-2.5 p-4 shadow-md shadow-[rgba(8,25,21,0.06)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--sc-surface-light-border)] pb-2">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-[var(--sc-surface-light-ink)]">{group.title}</p>
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--sc-surface-light-ink)]/55">
                {group.personCount} linked
              </p>
            </div>

            {loading && totalLinkedUsers === 0 ? (
              <p className="text-sm text-[var(--sc-surface-light-ink)]/70">Loading users...</p>
            ) : group.users.length === 0 ? (
              <Panel variant="light" className="border border-dashed border-[var(--sc-surface-light-border)] bg-white/80 p-2.5 text-sm text-[var(--sc-surface-light-ink)]/70">
                No linked users in this role for the selected event.
              </Panel>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[var(--sc-surface-light-border)] bg-white">
                {group.users.map((entry, index) => {
                  // Rows are pre-sorted by team; print a heading whenever the
                  // team changes so each team's crew reads as one block.
                  const previous = index > 0 ? group.users[index - 1] : null;
                  const showTeamHeading = !previous || previous.teamName !== entry.teamName;

                  return (
                    <div key={`${group.key}-${entry.rowKey}`}>
                      {showTeamHeading ? (
                        <p className="border-b border-[var(--sc-surface-light-border)]/30 bg-[var(--sc-surface-light-tint)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sc-surface-light-ink)]/80">
                          {entry.teamName || "Event-wide"}
                        </p>
                      ) : null}
                      <div className="grid grid-cols-[minmax(0,1fr),auto] items-center gap-3 border-b border-[var(--sc-surface-light-border)] px-3 py-2 last:border-b-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--sc-surface-light-ink)]">
                            {entry.fullName || "Unnamed user"}
                          </p>
                          <p className="truncate text-xs text-[var(--sc-surface-light-ink)]/65">
                            {entry.email || "No email recorded"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sc-surface-light-ink)]/50">
                            Linked
                          </p>
                          <p className="text-xs font-medium text-[var(--sc-surface-light-ink)]">
                            {formatGrantedAt(entry.matchingAssignments[0]?.grantedAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
