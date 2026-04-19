import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import usePersistentState from "../../hooks/usePersistentState";
import { Card, Panel, SectionHeader, Chip } from "../../components/ui/primitives";
import { getEventLinkedUsers } from "../../services/userService";
import { normaliseRoleList, roleAssignmentsIncludeAdmin } from "../../utils/accessControl";

const LIGHT_INPUT_CLASS =
  "rounded-lg border border-[var(--sc-surface-light-border)] bg-white px-3 py-2 text-sm text-[var(--sc-surface-light-ink)] shadow-sm focus:border-[var(--sc-border-strong)] focus:outline-none";
const TOURNAMENT_DIRECTOR_LINKED_USERS_EVENT_KEY =
  "stallcount:tournament-director:linked-users:selected-event:v1";

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
    key: "media",
    title: "Media",
  },
];

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

export default function LinkedUsersPanel({ eventsList = [] }) {
  const { roles, rolesLoading } = useAuth();
  const [selectedEventId, setSelectedEventId] = usePersistentState(
    TOURNAMENT_DIRECTOR_LINKED_USERS_EVENT_KEY,
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

    const allowedEventIds = new Set(
      roles
        .filter((assignment) => assignment?.scope === "event" && typeof assignment?.eventId === "string")
        .map((assignment) => assignment.eventId),
    );

    if (allowedEventIds.size === 0) {
      return [];
    }

    return eventsList.filter((event) => allowedEventIds.has(event.id));
  }, [eventsList, roles]);

  useEffect(() => {
    if (!accessibleEvents.length) {
      if (selectedEventId) {
        setSelectedEventId("");
      }
      return;
    }

    if (!selectedEventId || !accessibleEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(accessibleEvents[0].id);
    }
  }, [accessibleEvents, selectedEventId, setSelectedEventId]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!selectedEventId) {
        setUsers([]);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const linkedUsers = await getEventLinkedUsers(selectedEventId);
        if (!active) return;
        setUsers(Array.isArray(linkedUsers) ? linkedUsers : []);
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
  }, [selectedEventId]);

  const selectedEvent = useMemo(
    () => accessibleEvents.find((event) => event.id === selectedEventId) || null,
    [accessibleEvents, selectedEventId],
  );

  const groupedUsers = useMemo(
    () =>
      LINKED_ROLE_GROUPS.map((group) => {
        const entries = users
          .map((user) => {
            const matchingAssignments = (Array.isArray(user.eventRoles) ? user.eventRoles : []).filter((assignment) =>
              normaliseRoleList(assignment?.roleName).includes(group.key),
            );

            if (!matchingAssignments.length) {
              return null;
            }

            return {
              ...user,
              matchingAssignments,
            };
          })
          .filter(Boolean);

        return {
          ...group,
          users: entries,
        };
      }),
    [users],
  );

  const totalLinkedUsers = users.length;

  return (
    <div className="space-y-6">
      <Card variant="light" className="space-y-4 p-5 shadow-md shadow-[rgba(8,25,21,0.06)]">
        <SectionHeader
          eyebrow="Linked users"
          eyebrowVariant="tag"
          title="Event-linked crew"
          description="Review linked users by operational role for the selected event."
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
                  getEventLinkedUsers(selectedEventId)
                    .then((linkedUsers) => {
                      setUsers(Array.isArray(linkedUsers) ? linkedUsers : []);
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

      <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
        {groupedUsers.map((group) => (
          <Panel
            key={group.key}
            variant="light"
            className="flex min-w-0 items-center justify-between gap-2 border border-[var(--sc-surface-light-border)] bg-white px-2 py-3 shadow-sm shadow-[rgba(8,25,21,0.03)]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--sc-surface-light-ink)]">{group.title}</p>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <p className="text-right text-xl font-bold leading-none text-[var(--sc-surface-light-ink)]">{group.users.length}</p>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--sc-surface-light-ink)]/55">linked</p>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {groupedUsers.map((group) => (
          <Card key={group.key} variant="light" className="space-y-3 p-5 shadow-md shadow-[rgba(8,25,21,0.06)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--sc-surface-light-border)] pb-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-[var(--sc-surface-light-ink)]">{group.title}</p>
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--sc-surface-light-ink)]/55">
                {group.users.length} linked
              </p>
            </div>

            {loading && totalLinkedUsers === 0 ? (
              <p className="text-sm text-[var(--sc-surface-light-ink)]/70">Loading users...</p>
            ) : group.users.length === 0 ? (
              <Panel variant="light" className="border border-dashed border-[var(--sc-surface-light-border)] bg-white/80 p-3 text-sm text-[var(--sc-surface-light-ink)]/70">
                No linked users in this role for the selected event.
              </Panel>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[var(--sc-surface-light-border)] bg-white">
                {group.users.map((user) => (
                  <div
                    key={`${group.key}-${user.id}`}
                    className="grid grid-cols-[minmax(0,1fr),auto] items-center gap-4 border-b border-[var(--sc-surface-light-border)] px-4 py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--sc-surface-light-ink)]">
                        {user.fullName || "Unnamed user"}
                      </p>
                      <p className="truncate text-xs text-[var(--sc-surface-light-ink)]/65">
                        {user.email || "No email recorded"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sc-surface-light-ink)]/50">
                        Linked
                      </p>
                      <p className="text-xs font-medium text-[var(--sc-surface-light-ink)]">
                        {formatGrantedAt(user.matchingAssignments[0]?.grantedAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
