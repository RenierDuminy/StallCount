import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  Panel,
  SectionHeader,
  SectionShell,
  Chip,
  Field,
  Input,
  Select,
} from "../components/ui/primitives";
import {
  addEventUserRoleAssignment,
  getAccessControlEvents,
  getAccessControlUserById,
  getRoleCatalog,
  removeEventUserRoleAssignment,
  searchAccessControlUsers,
} from "../services/userService";
import usePersistentState from "../hooks/usePersistentState";

const PAGE_SIZE = 20;

function userMatchesRoleFilter(user, roleFilter) {
  if (roleFilter === "all") return true;
  const assignments = Array.isArray(user.roles) ? user.roles : [];
  if (roleFilter === "none") return assignments.length === 0;
  return assignments.some(
    (assignment) =>
      assignment.roleId !== null && String(assignment.roleId) === roleFilter,
  );
}

const EVENT_ACCESS_SEARCH_KEY = "stallcount:event-access:search:v1";
const EVENT_ACCESS_ROLE_FILTER_KEY = "stallcount:event-access:role-filter:v1";
const EVENT_ACCESS_PAGE_KEY = "stallcount:event-access:page:v1";
const EVENT_ACCESS_MANAGER_QUERY_KEY = "stallcount:event-access:manager-query:v1";
const EVENT_ACCESS_SELECTED_USER_KEY = "stallcount:event-access:selected-user:v1";
const EVENT_ACCESS_SELECTED_EVENT_KEY = "stallcount:event-access:selected-event:v1";
const EVENT_ACCESS_PENDING_ROLE_KEY = "stallcount:event-access:pending-role:v1";

function formatPermissionLabel(permission) {
  if (!permission) return "Permission";
  if (permission.description) return permission.description;
  return String(permission.key || "permission").replace(/_/g, " ");
}

function normalizePermissionKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function roleHasPermission(role, permissionKey) {
  const required = normalizePermissionKey(permissionKey);
  if (!required) return false;
  const permissions = Array.isArray(role?.permissions) ? role.permissions : [];
  return permissions.some((permission) => {
    const candidate =
      typeof permission === "string"
        ? permission
        : permission?.key || permission?.name || permission?.value || "";
    return normalizePermissionKey(candidate) === required;
  });
}

function isAdminPrivilegeRole(role) {
  if (!role) return false;
  if (roleHasPermission(role, "admin_override")) return true;
  const normalizedName = normalizePermissionKey(role?.name || role?.roleName || "");
  return (
    normalizedName === "admin" ||
    normalizedName === "administrator" ||
    normalizedName === "sys_admin"
  );
}

function isUserRole(role) {
  const normalizedName = normalizePermissionKey(role?.name || role?.roleName || "");
  return normalizedName === "user";
}

function formatEventRoleLabel(entry) {
  if (!entry) return "Event role";
  const eventLabel = entry.eventName || entry.eventId || "Event";
  const roleLabel = entry.roleName || entry.roleId || "Role";
  return `${roleLabel} - ${eventLabel}`;
}

function formatEventOptionLabel(event) {
  if (!event) return "Event";
  const name = event.name || event.id || "Event";
  const range = [event.startDate, event.endDate].filter(Boolean).join(" - ");
  return range ? `${name} (${range})` : name;
}

export default function EventAccessPage() {
  const [roles, setRoles] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = usePersistentState(EVENT_ACCESS_SEARCH_KEY, "");
  const [roleFilter, setRoleFilter] = usePersistentState(EVENT_ACCESS_ROLE_FILTER_KEY, "all");
  const [page, setPage] = usePersistentState(EVENT_ACCESS_PAGE_KEY, 1);
  const [roleManagerQuery, setRoleManagerQuery] = usePersistentState(EVENT_ACCESS_MANAGER_QUERY_KEY, "");
  const [selectedUserId, setSelectedUserId] = usePersistentState(EVENT_ACCESS_SELECTED_USER_KEY, "");
  const [selectedEventId, setSelectedEventId] = usePersistentState(EVENT_ACCESS_SELECTED_EVENT_KEY, "");
  const [roleManagerBusy, setRoleManagerBusy] = useState(false);
  const [roleManagerError, setRoleManagerError] = useState("");
  const [pendingRoleId, setPendingRoleId] = usePersistentState(EVENT_ACCESS_PENDING_ROLE_KEY, "");

  // Directory table: one server-paged slice at a time.
  const [directoryUsers, setDirectoryUsers] = useState([]);
  const [directoryTotal, setDirectoryTotal] = useState(0);
  const [directoryLoading, setDirectoryLoading] = useState(false);

  // Role manager: its own search slice + the fully-detailed selected user.
  const [managerMatches, setManagerMatches] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  // Catalog data (roles + events) loads once; user rows are fetched on demand.
  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [roleRows, eventRows] = await Promise.all([
        getRoleCatalog(),
        getAccessControlEvents(),
      ]);
      setRoles(roleRows);
      setEvents(eventRows);
      setRoleManagerError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load access control data.");
    } finally {
      setLoading(false);
    }
  }

  // Debounced server-side fetch for the directory table.
  useEffect(() => {
    let cancelled = false;
    setDirectoryLoading(true);
    const handle = setTimeout(async () => {
      try {
        const { users, total } = await searchAccessControlUsers({
          search,
          page,
          pageSize: PAGE_SIZE,
        });
        if (cancelled) return;
        setDirectoryUsers(users);
        setDirectoryTotal(total);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to load users.");
      } finally {
        if (!cancelled) setDirectoryLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [search, page]);

  // Debounced server-side fetch for the role-manager user dropdown.
  useEffect(() => {
    if (!selectedEventId) {
      setManagerMatches([]);
      return undefined;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const { users } = await searchAccessControlUsers({
          search: roleManagerQuery,
          page: 1,
          pageSize: PAGE_SIZE,
        });
        if (!cancelled) setManagerMatches(users);
      } catch {
        if (!cancelled) setManagerMatches([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [roleManagerQuery, selectedEventId]);

  // Load full detail for the selected user (roles update after add/remove).
  useEffect(() => {
    if (!selectedUserId) {
      setSelectedUser(null);
      return undefined;
    }
    let cancelled = false;
    getAccessControlUserById(selectedUserId)
      .then((user) => {
        if (cancelled) return;
        setSelectedUser(user);
        if (!user) setSelectedUserId("");
      })
      .catch(() => {
        if (!cancelled) setSelectedUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedUserId, setSelectedUserId]);

  useEffect(() => {
    if (selectedEventId && !events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId("");
    }
  }, [events, selectedEventId, setSelectedEventId]);

  useEffect(() => {
    if (
      pendingRoleId &&
      !roles.some((role) => String(role.id) === String(pendingRoleId))
    ) {
      setPendingRoleId("");
    }
  }, [pendingRoleId, roles, setPendingRoleId]);

  // Refresh the current directory page (e.g. after a role change).
  async function refreshDirectory() {
    try {
      const { users, total } = await searchAccessControlUsers({
        search,
        page,
        pageSize: PAGE_SIZE,
      });
      setDirectoryUsers(users);
      setDirectoryTotal(total);
    } catch {
      // Non-fatal: the table keeps its last good page.
    }
  }

  async function handleAddRole(userId) {
    if (!userId) return;
    if (!selectedEventId) {
      setRoleManagerError("Select an event to manage roles.");
      return;
    }
    if (!pendingRoleId) {
      setRoleManagerError("Select a role to add.");
      return;
    }
    const selectedRole = roles.find((role) => String(role.id) === String(pendingRoleId));
    if (!selectedRole) {
      setRoleManagerError("Selected role is invalid.");
      return;
    }
    if (isAdminPrivilegeRole(selectedRole)) {
      setRoleManagerError("Admin privileges cannot be assigned from Event access control.");
      return;
    }

    setRoleManagerError("");
    setRoleManagerBusy(true);
    try {
      const assignment = await addEventUserRoleAssignment(userId, pendingRoleId, selectedEventId);
      setSelectedUser((prev) => {
        if (!prev || prev.id !== userId) return prev;
        const eventRoles = Array.isArray(prev.eventRoles) ? prev.eventRoles : [];
        return { ...prev, eventRoles: [...eventRoles, assignment] };
      });
      setPendingRoleId("");
      refreshDirectory();
    } catch (err) {
      setRoleManagerError(err instanceof Error ? err.message : "Unable to add role.");
    } finally {
      setRoleManagerBusy(false);
    }
  }

  async function handleRemoveRole(userId, assignment) {
    if (!userId) return;
    if (!selectedEventId) {
      setRoleManagerError("Select an event to manage roles.");
      return;
    }
    setRoleManagerError("");
    setRoleManagerBusy(true);
    try {
      await removeEventUserRoleAssignment(
        assignment.assignmentId,
        userId,
        assignment.roleId,
        selectedEventId,
      );
      setSelectedUser((prev) => {
        if (!prev || prev.id !== userId) return prev;
        const eventRoles = Array.isArray(prev.eventRoles) ? prev.eventRoles : [];
        const nextEventRoles = eventRoles.filter((role) => {
          if (assignment.assignmentId) {
            return role.assignmentId !== assignment.assignmentId;
          }
          if (assignment.eventId) {
            return role.roleId !== assignment.roleId || role.eventId !== assignment.eventId;
          }
          return role.roleId !== assignment.roleId;
        });
        return { ...prev, eventRoles: nextEventRoles };
      });
      refreshDirectory();
    } catch (err) {
      setRoleManagerError(err instanceof Error ? err.message : "Unable to remove role.");
    } finally {
      setRoleManagerBusy(false);
    }
  }

  const rolesWithPermissions = useMemo(
    () =>
      roles
        .map((role) => ({
          ...role,
          permissions: Array.isArray(role.permissions) ? role.permissions : [],
        }))
        .filter((role) => !isAdminPrivilegeRole(role) && !isUserRole(role)),
    [roles],
  );

  // Roles overlap but aren't strictly nested. To save space, list roles from
  // fewest to most permissions and show each role only the permissions not
  // already shown above; the rest collapse into a muted "+N shared" count.
  const rolePermissionRows = useMemo(() => {
    const seen = new Set();
    return [...rolesWithPermissions]
      .sort((a, b) => a.permissions.length - b.permissions.length)
      .map((role) => {
        const unique = [];
        let sharedCount = 0;
        role.permissions.forEach((permission) => {
          const key = normalizePermissionKey(
            permission?.key || permission?.name || permission?.value || permission,
          );
          if (seen.has(key)) {
            sharedCount += 1;
          } else {
            seen.add(key);
            unique.push(permission);
          }
        });
        return { role, unique, sharedCount };
      });
  }, [rolesWithPermissions]);

  // Search resets to the first page; role filter narrows the loaded page only.
  useEffect(() => {
    setPage(1);
  }, [search, setPage]);

  // Role filter is applied to the loaded page (PostgREST cross-join filtering
  // is impractical here); paging counts remain search-scoped.
  const pagedUsers = useMemo(
    () => directoryUsers.filter((user) => userMatchesRoleFilter(user, roleFilter)),
    [directoryUsers, roleFilter],
  );

  // Ensure the selected user always appears as an option in the dropdown.
  const matchingUsers = useMemo(() => {
    if (!selectedEventId) return selectedUser ? [selectedUser] : [];
    if (selectedUser && !managerMatches.some((user) => user.id === selectedUser.id)) {
      return [selectedUser, ...managerMatches].slice(0, PAGE_SIZE);
    }
    return managerMatches;
  }, [managerMatches, selectedEventId, selectedUser]);

  const selectedAssignments = Array.isArray(selectedUser?.roles) ? selectedUser.roles : [];
  const selectedEventRoles = useMemo(
    () => (Array.isArray(selectedUser?.eventRoles) ? selectedUser.eventRoles : []),
    [selectedUser],
  );

  const eventOptions = useMemo(
    () =>
      events
        .filter((event) => event?.id)
        .map((event) => ({
          id: event.id,
          name: event.name || "Event",
          startDate: event.startDate,
          endDate: event.endDate,
        })),
    [events],
  );

  const selectedEventRolesForEvent = useMemo(
    () =>
      selectedEventId
        ? selectedEventRoles.filter((entry) => entry.eventId === selectedEventId)
        : [],
    [selectedEventId, selectedEventRoles],
  );

  const availableRoles = useMemo(() => {
    const assignedRoleIds = new Set(
      selectedEventRolesForEvent
        .map((assignment) => assignment.roleId)
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value)),
    );
    return roles.filter(
      (role) => !assignedRoleIds.has(String(role.id)) && !isAdminPrivilegeRole(role),
    );
  }, [roles, selectedEventRolesForEvent]);

  const totalResults = directoryTotal;
  const pageCount = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = totalResults === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, totalResults);

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage);
    }
  }, [page, currentPage, setPage]);

  const isEmpty = !directoryLoading && pagedUsers.length === 0;

  return (
    <div className="min-h-screen bg-surface text-ink">
      <SectionShell as="header" className="py-6">
        <Card className="space-y-4 p-6 sm:p-8">
          <SectionHeader
            title="Event access control"
            action={
              <div className="flex flex-wrap gap-3">
                <Link to="/admin" className="sc-button">
                  Admin hub
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    loadData();
                    refreshDirectory();
                  }}
                  className="sc-button"
                  disabled={loading}
                >
                  {loading ? "Refreshing..." : "Refresh data"}
                </button>
              </div>
            }
          />
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-5 pb-16">
          <Panel className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">Role manager</p>
              {selectedUser ? (
                <button
                  type="button"
                  className="sc-button is-ghost text-xs"
                  onClick={() => {
                    setSelectedUserId("");
                    setRoleManagerQuery("");
                    setRoleManagerError("");
                    setPendingRoleId("");
                  }}
                >
                  Clear selection
                </button>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Event">
                <Select
                  value={selectedEventId}
                  onChange={(event) => {
                    setSelectedEventId(event.target.value);
                    setRoleManagerError("");
                    setPendingRoleId("");
                  }}
                  disabled={eventOptions.length === 0}
                >
                  <option value="">
                    {eventOptions.length === 0 ? "No linked events" : "Select an event"}
                  </option>
                  {eventOptions.map((event) => (
                    <option key={event.id} value={event.id}>
                      {formatEventOptionLabel(event)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Search user">
                <Input
                  type="search"
                  value={roleManagerQuery}
                  placeholder="Search users"
                  onChange={(event) => setRoleManagerQuery(event.target.value)}
                  disabled={!selectedEventId}
                />
              </Field>
              <Field label="Select user">
                <Select
                  value={selectedUserId}
                  onChange={(event) => {
                    setSelectedUserId(event.target.value);
                    setRoleManagerError("");
                    setPendingRoleId("");
                  }}
                  disabled={!selectedEventId || matchingUsers.length === 0}
                >
                  <option value="">
                    {!selectedEventId
                      ? "Select an event first"
                      : matchingUsers.length === 0
                        ? "No matches yet"
                        : "Choose a user"}
                  </option>
                  {matchingUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName || "Unnamed"} - {user.email || user.id}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {selectedUser ? (
              <div className="space-y-3 border-t border-border/60 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Global roles</p>
                  {roleManagerBusy ? (
                    <Chip variant="ghost" className="text-[11px] text-ink-muted">
                      Saving...
                    </Chip>
                  ) : null}
                </div>
                {selectedAssignments.length === 0 ? (
                  <span className="text-xs text-ink-muted">No role assigned</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAssignments.map((assignment) => (
                      <Chip
                        key={assignment.assignmentId || assignment.roleId}
                        variant="tag"
                        className="text-[11px]"
                      >
                        {assignment.roleName || "Role"}
                      </Chip>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Event roles (selected event)
                  </p>
                  {!selectedEventId ? (
                    <span className="text-xs text-ink-muted">Select an event to view roles.</span>
                  ) : selectedEventRolesForEvent.length === 0 ? (
                    <span className="text-xs text-ink-muted">No event roles assigned for this event.</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedEventRolesForEvent.map((entry) => (
                        <div
                          key={entry.assignmentId || `${entry.eventId}-${entry.roleId}`}
                          className="flex items-center gap-1"
                        >
                          <Chip variant="ghost" className="text-[11px]">
                            {formatEventRoleLabel(entry)}
                          </Chip>
                          <button
                            type="button"
                            className="text-[10px] uppercase tracking-wide text-rose-200 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleRemoveRole(selectedUser.id, entry)}
                            disabled={roleManagerBusy || !selectedEventId}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={pendingRoleId}
                    onChange={(event) => setPendingRoleId(event.target.value)}
                    disabled={roleManagerBusy || availableRoles.length === 0 || !selectedEventId}
                  >
                    <option value="">
                      {availableRoles.length === 0 ? "All roles assigned" : "Add role..."}
                    </option>
                    {availableRoles.map((role) => (
                      <option key={role.id} value={String(role.id)}>
                        {role.name}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    className="sc-button is-ghost text-xs"
                    onClick={() => handleAddRole(selectedUser.id)}
                    disabled={roleManagerBusy || !pendingRoleId || !selectedEventId}
                  >
                    Add role
                  </button>
                  {roleManagerError ? (
                    <span className="text-[11px] text-rose-200">{roleManagerError}</span>
                  ) : null}
                </div>
                <p className="text-[11px] text-ink-muted">
                  Admin-capable roles are excluded here. Use Admin access control for global admin assignment.
                </p>
              </div>
            ) : null}
          </Panel>
          <Panel className="space-y-3 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-ink">Role permissions</p>
              <p className="text-[11px] text-ink-muted">
                Each row adds only what it grants beyond the rows above.
              </p>
            </div>
            {rolePermissionRows.length === 0 ? (
              <p className="text-xs text-ink-muted">No role catalog loaded yet.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {rolePermissionRows.map(({ role, unique, sharedCount }) => (
                  <div
                    key={role.id}
                    className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:gap-4"
                  >
                    <p className="text-sm font-semibold text-ink sm:w-40 sm:shrink-0">{role.name}</p>
                    {role.permissions.length === 0 ? (
                      <span className="text-xs text-ink-muted">No permissions assigned</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        {sharedCount > 0 ? (
                          <span className="text-[11px] text-ink-muted">+{sharedCount} shared</span>
                        ) : null}
                        {unique.length === 0 ? (
                          <span className="text-[11px] text-ink-muted">No new permissions</span>
                        ) : (
                          unique.map((permission) => (
                            <Chip
                              key={
                                permission.key ||
                                permission.name ||
                                permission.value ||
                                formatPermissionLabel(permission)
                              }
                              variant="tag"
                              className="text-[11px]"
                            >
                              {formatPermissionLabel(permission)}
                            </Chip>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel className="space-y-4 p-5">
          <SectionHeader
            eyebrowVariant="tag"
            title="People and event access"
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Search">
              <Input
                type="search"
                value={search}
                placeholder="Search profiles"
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
            <Field label="Filter by role">
              <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">All roles</option>
                <option value="none">No role assigned</option>
                {roles.map((role) => (
                  <option key={role.id} value={String(role.id)}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-col justify-end gap-0.5 pb-1 text-xs">
              <span className="text-ink">
                Showing {pageStart}-{pageEnd} of {totalResults}
              </span>
              <span className="text-ink-muted">
                Page {currentPage} of {pageCount}
              </span>
            </div>
          </div>
          {error ? (
            <Panel className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</Panel>
          ) : null}
          <div className="overflow-hidden rounded-xl border border-border/60">
            {directoryLoading ? (
              <div className="p-6 text-sm text-ink-muted">Loading access records...</div>
            ) : isEmpty ? (
              <div className="p-6 text-sm text-ink-muted">No users match the selected filters.</div>
            ) : (
              <div className="max-h-[65vh] overflow-auto">
                <table className="w-full table-fixed divide-y divide-border text-[11px] sm:text-xs">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <th className="w-[22%] px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-ink-muted sm:px-3 sm:py-2">
                        Name
                      </th>
                      <th className="w-[24%] px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-ink-muted sm:px-3 sm:py-2">
                        Email
                      </th>
                      <th className="w-[18%] px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-ink-muted sm:px-3 sm:py-2">
                        Access levels
                      </th>
                      <th className="w-[36%] px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-ink-muted sm:px-3 sm:py-2">
                        Event roles
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {pagedUsers.map((user) => {
                      const assignments = Array.isArray(user.roles) ? user.roles : [];
                      const eventRoles = Array.isArray(user.eventRoles) ? user.eventRoles : [];
                      return (
                        <tr key={user.id} className="hover:bg-surface-muted">
                          <td className="break-words px-2 py-1.5 align-top text-[13px] font-semibold text-ink sm:px-3 sm:py-2 sm:text-sm">
                            {user.fullName || "Unnamed profile"}
                          </td>
                          <td className="break-all px-2 py-1.5 align-top text-[11px] text-ink-muted sm:px-3 sm:py-2 sm:text-[13px]">
                            {user.email || "-"}
                          </td>
                          <td className="px-2 py-1.5 align-top sm:px-3 sm:py-2">
                            {assignments.length === 0 ? (
                              <span className="text-xs text-ink-muted">No role assigned</span>
                            ) : (
                              <div className="flex flex-wrap gap-0.5 sm:gap-1">
                                {assignments.map((assignment) => (
                                  <Chip
                                    key={assignment.assignmentId || assignment.roleId}
                                    variant="tag"
                                    className="text-[11px]"
                                  >
                                    {assignment.roleName || "Role"}
                                  </Chip>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 align-top sm:px-3 sm:py-2">
                            {eventRoles.length === 0 ? (
                              <span className="text-xs text-ink-muted">No event roles</span>
                            ) : (
                              <div className="flex flex-wrap gap-0.5 sm:gap-1">
                                {eventRoles.map((entry) => (
                                  <Chip
                                    key={entry.assignmentId || `${entry.eventId}-${entry.roleId}`}
                                    variant="ghost"
                                    className="text-[11px]"
                                  >
                                    {formatEventRoleLabel(entry)}
                                  </Chip>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {totalResults > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-ink-muted">
                Showing {pageStart}-{pageEnd} of {totalResults}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="sc-button is-ghost text-xs"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="sc-button is-ghost text-xs"
                  onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
                  disabled={currentPage >= pageCount}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
          </Panel>
      </SectionShell>
    </div>
  );
}
