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
  addUserRoleAssignment,
  addEventUserRoleAssignment,
  getAccessControlEvents,
  getAccessControlUsers,
  getRoleCatalog,
  removeUserRoleAssignment,
  removeEventUserRoleAssignment,
} from "../services/userService";

function formatRoleCounts(users, adminRoleIds) {
  return users.reduce((acc, user) => {
    const assignments = Array.isArray(user.roles) ? user.roles : [];
    const eventRoles = Array.isArray(user.eventRoles) ? user.eventRoles : [];
    const adminAssignments = assignments.filter((assignment) => {
      if (!assignment) return false;
      if (assignment.roleId !== null && assignment.roleId !== undefined) {
        return adminRoleIds.has(String(assignment.roleId));
      }
      const name = String(assignment.roleName || "").toLowerCase();
      return name === "admin" || name === "administrator";
    });
    if (adminAssignments.length === 0 && eventRoles.length === 0) {
      acc.set("none", (acc.get("none") || 0) + 1);
      return acc;
    }
    adminAssignments.forEach((assignment) => {
      if (assignment.roleId === null || assignment.roleId === undefined) {
        return;
      }
      const key = String(assignment.roleId);
      acc.set(key, (acc.get(key) || 0) + 1);
    });
    eventRoles.forEach((assignment) => {
      if (assignment.roleId === null || assignment.roleId === undefined) {
        return;
      }
      const key = String(assignment.roleId);
      acc.set(key, (acc.get(key) || 0) + 1);
    });
    return acc;
  }, new Map());
}

function formatPermissionLabel(permission) {
  if (!permission) return "Permission";
  if (permission.description) return permission.description;
  return String(permission.key || "permission").replace(/_/g, " ");
}

function formatEventRoleLabel(entry) {
  if (!entry) return "Event role";
  const eventLabel = entry.eventName || entry.eventId || "Event";
  const roleLabel = entry.roleName || entry.roleId || "Role";
  return `${eventLabel} - ${roleLabel}`;
}

function formatEventOptionLabel(event) {
  if (!event) return "Event";
  const name = event.name || event.id || "Event";
  const range = [event.startDate, event.endDate].filter(Boolean).join(" - ");
  return range ? `${name} (${range})` : name;
}

function isAdminRole(role) {
  const name = String(role?.name || role?.roleName || "").toLowerCase();
  return name === "admin" || name === "administrator";
}

function isAdminAssignment(assignment, adminRoleIds) {
  if (!assignment) return false;
  if (assignment.roleId !== null && assignment.roleId !== undefined) {
    return adminRoleIds.has(String(assignment.roleId));
  }
  const name = String(assignment.roleName || "").toLowerCase();
  return name === "admin" || name === "administrator";
}

export default function AdminAccessPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [roleManagerQuery, setRoleManagerQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [roleManagerBusy, setRoleManagerBusy] = useState(false);
  const [roleManagerError, setRoleManagerError] = useState("");
  const [pendingRoleId, setPendingRoleId] = useState("");
  const [pendingAdminRoleId, setPendingAdminRoleId] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [userRows, roleRows, eventRows] = await Promise.all([
        getAccessControlUsers(),
        getRoleCatalog(),
        getAccessControlEvents(),
      ]);
      setUsers(userRows);
      setRoles(roleRows);
      setEvents(eventRows);
      setRoleManagerQuery("");
      setSelectedUserId("");
      setSelectedEventId("");
      setRoleManagerError("");
      setPendingRoleId("");
      setPendingAdminRoleId("");
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load access control data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEventRole(userId) {
    if (!userId) return;
    if (!selectedEventId) {
      setRoleManagerError("Select an event to manage roles.");
      return;
    }
    if (!pendingRoleId) {
      setRoleManagerError("Select a role to add.");
      return;
    }

    setRoleManagerError("");
    setRoleManagerBusy(true);
    try {
      const assignment = await addEventUserRoleAssignment(userId, pendingRoleId, selectedEventId);
      setUsers((prev) =>
        prev.map((user) => {
          if (user.id !== userId) return user;
          const eventRoles = Array.isArray(user.eventRoles) ? user.eventRoles : [];
          return { ...user, eventRoles: [...eventRoles, assignment] };
        }),
      );
      setPendingRoleId("");
    } catch (err) {
      setRoleManagerError(err instanceof Error ? err.message : "Unable to add role.");
    } finally {
      setRoleManagerBusy(false);
    }
  }

  async function handleRemoveEventRole(userId, assignment) {
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
      setUsers((prev) =>
        prev.map((user) => {
          if (user.id !== userId) return user;
          const eventRoles = Array.isArray(user.eventRoles) ? user.eventRoles : [];
          const nextEventRoles = eventRoles.filter((role) => {
            if (assignment.assignmentId) {
              return role.assignmentId !== assignment.assignmentId;
            }
            if (assignment.eventId) {
              return role.roleId !== assignment.roleId || role.eventId !== assignment.eventId;
            }
            return role.roleId !== assignment.roleId;
          });
          return { ...user, eventRoles: nextEventRoles };
        }),
      );
    } catch (err) {
      setRoleManagerError(err instanceof Error ? err.message : "Unable to remove role.");
    } finally {
      setRoleManagerBusy(false);
    }
  }

  async function handleAddAdminRole(userId) {
    if (!userId) return;
    if (!pendingAdminRoleId) {
      setRoleManagerError("Select an admin role to add.");
      return;
    }

    setRoleManagerError("");
    setRoleManagerBusy(true);
    try {
      const assignment = await addUserRoleAssignment(userId, pendingAdminRoleId);
      setUsers((prev) =>
        prev.map((user) => {
          if (user.id !== userId) return user;
          const roles = Array.isArray(user.roles) ? user.roles : [];
          return { ...user, roles: [...roles, assignment] };
        }),
      );
      setPendingAdminRoleId("");
    } catch (err) {
      setRoleManagerError(err instanceof Error ? err.message : "Unable to add admin role.");
    } finally {
      setRoleManagerBusy(false);
    }
  }

  async function handleRemoveAdminRole(userId, assignment) {
    if (!userId) return;
    setRoleManagerError("");
    setRoleManagerBusy(true);
    try {
      await removeUserRoleAssignment(assignment.assignmentId, userId, assignment.roleId);
      setUsers((prev) =>
        prev.map((user) => {
          if (user.id !== userId) return user;
          const roles = Array.isArray(user.roles) ? user.roles : [];
          const nextRoles = roles.filter((role) => {
            if (assignment.assignmentId) {
              return role.assignmentId !== assignment.assignmentId;
            }
            return role.roleId !== assignment.roleId;
          });
          return { ...user, roles: nextRoles };
        }),
      );
    } catch (err) {
      setRoleManagerError(err instanceof Error ? err.message : "Unable to remove admin role.");
    } finally {
      setRoleManagerBusy(false);
    }
  }

  const adminRoleIds = useMemo(() => {
    const adminRoles = roles.filter((role) => isAdminRole(role));
    return new Set(adminRoles.map((role) => String(role.id)));
  }, [roles]);
  const adminRoles = useMemo(() => roles.filter((role) => isAdminRole(role)), [roles]);
  const eventRoles = useMemo(() => roles.filter((role) => !isAdminRole(role)), [roles]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const roleKey = roleFilter === "all" ? null : roleFilter;
    return users.filter((user) => {
      const matchesQuery = query
        ? [user.fullName, user.email, user.id].some((value) => {
            if (!value) return false;
            return String(value).toLowerCase().includes(query);
          })
        : true;
      const assignments = Array.isArray(user.roles) ? user.roles : [];
      const eventAssignments = Array.isArray(user.eventRoles) ? user.eventRoles : [];
      const adminAssignments = assignments.filter((assignment) =>
        isAdminAssignment(assignment, adminRoleIds),
      );
      const matchesRole = (() => {
        if (roleKey === null) return true;
        if (roleKey === "none") return adminAssignments.length === 0 && eventAssignments.length === 0;
        if (adminRoleIds.has(String(roleKey))) {
          return adminAssignments.some(
            (assignment) => assignment.roleId !== null && String(assignment.roleId) === roleKey,
          );
        }
        return eventAssignments.some(
          (assignment) => assignment.roleId !== null && String(assignment.roleId) === roleKey,
        );
      })();
      return matchesQuery && matchesRole;
    });
  }, [users, search, roleFilter, adminRoleIds]);

  const roleCounts = useMemo(() => formatRoleCounts(users, adminRoleIds), [users, adminRoleIds]);
  const rolesWithPermissions = useMemo(
    () =>
      roles.map((role) => ({
        ...role,
        permissions: Array.isArray(role.permissions) ? role.permissions : [],
      })),
    [roles],
  );

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  const matchingUsers = useMemo(() => {
    const query = roleManagerQuery.trim().toLowerCase();
    if (!query) {
      if (selectedUser) {
        return [selectedUser];
      }
      return [];
    }
    const matches = users.filter((user) => {
      return [user.fullName, user.email, user.id].some((value) => {
        if (!value) return false;
        return String(value).toLowerCase().includes(query);
      });
    });
    const trimmed = matches.slice(0, 20);
    if (selectedUser && !trimmed.some((user) => user.id === selectedUser.id)) {
      return [selectedUser, ...trimmed].slice(0, 20);
    }
    return trimmed;
  }, [users, roleManagerQuery, selectedUser]);

  const selectedAssignments = Array.isArray(selectedUser?.roles) ? selectedUser.roles : [];
  const selectedEventRoles = Array.isArray(selectedUser?.eventRoles) ? selectedUser.eventRoles : [];
  const adminAssignments = selectedAssignments.filter((assignment) =>
    isAdminAssignment(assignment, adminRoleIds),
  );
  const legacyAssignments = selectedAssignments.filter(
    (assignment) => !isAdminAssignment(assignment, adminRoleIds),
  );

  const eventOptions = useMemo(() => {
    const map = new Map();
    events.forEach((event) => {
      if (!event?.id) return;
      map.set(event.id, {
        id: event.id,
        name: event.name || "Event",
        startDate: event.startDate,
        endDate: event.endDate,
      });
    });
    users.forEach((user) => {
      const entries = Array.isArray(user.eventRoles) ? user.eventRoles : [];
      entries.forEach((entry) => {
        if (!entry.eventId) return;
        if (!map.has(entry.eventId)) {
          map.set(entry.eventId, {
            id: entry.eventId,
            name: entry.eventName || "Event",
            startDate: entry.eventStartDate,
            endDate: entry.eventEndDate,
          });
        }
      });
    });
    return Array.from(map.values());
  }, [events, users]);

  useEffect(() => {
    if (!selectedEventId) return;
    if (!eventOptions.some((event) => event.id === selectedEventId)) {
      setSelectedEventId("");
    }
  }, [selectedEventId, eventOptions]);

  const selectedEventRolesForEvent = selectedEventId
    ? selectedEventRoles.filter((entry) => entry.eventId === selectedEventId)
    : [];
  const assignedEventRoleIds = new Set(
    selectedEventRolesForEvent
      .map((assignment) => assignment.roleId)
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value)),
  );
  const availableEventRoles = eventRoles.filter(
    (role) => !assignedEventRoleIds.has(String(role.id)),
  );
  const assignedAdminRoleIds = new Set(
    adminAssignments
      .map((assignment) => assignment.roleId)
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value)),
  );
  const availableAdminRoles = adminRoles.filter(
    (role) => !assignedAdminRoleIds.has(String(role.id)),
  );

  const pageSize = 20;
  const totalResults = filteredUsers.length;
  const pageCount = Math.max(1, Math.ceil(totalResults / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = totalResults === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, totalResults);
  const pagedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage);
    }
  }, [page, currentPage]);

  const isEmpty = !loading && filteredUsers.length === 0;

  return (
    <div className="min-h-screen bg-surface text-ink">
      <SectionShell as="header" className="py-6">
        <Card className="space-y-4 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Admin"
            title="Access control"
            description="Review every profile and adjust StallCount access tiers in one dense grid."
            action={
              <div className="flex flex-wrap gap-3">
                <Link to="/admin" className="sc-button">
                  Admin hub
                </Link>
                <button type="button" onClick={loadData} className="sc-button" disabled={loading}>
                  {loading ? "Refreshing..." : "Refresh data"}
                </button>
              </div>
            }
          />
          <div className="flex flex-wrap gap-2">
            <Chip variant="ghost" className="text-xs text-ink-muted">
              Users: {users.length}
            </Chip>
            <Chip variant="ghost" className="text-xs text-ink-muted">
              Event roles: {eventRoles.length}
            </Chip>
            <Chip variant="ghost" className="text-xs text-ink-muted">
              Admin roles: {adminRoles.length}
            </Chip>
            <Chip variant="ghost" className="text-xs text-ink-muted">
              Unassigned: {roleCounts.get("none") || 0}
            </Chip>
          </div>
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-5 pb-16">
        <Card className="space-y-5 p-5">
          <Panel className="space-y-4 border border-border/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Role manager</p>
                <p className="text-xs text-ink-muted">
                  Assign admin access globally and event roles in this order: user, role, event.
                </p>
              </div>
              {selectedUser ? (
                <button
                  type="button"
                  className="sc-button is-ghost text-xs"
                  onClick={() => {
                    setSelectedUserId("");
                    setRoleManagerQuery("");
                    setSelectedEventId("");
                    setRoleManagerError("");
                    setPendingRoleId("");
                    setPendingAdminRoleId("");
                  }}
                >
                  Clear selection
                </button>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Search user" hint="Name, email, or UUID">
                <Input
                  type="search"
                  value={roleManagerQuery}
                  placeholder="Search users"
                  onChange={(event) => setRoleManagerQuery(event.target.value)}
                />
              </Field>
              <Field label="Select user" hint="Top 20 matches">
                <Select
                  value={selectedUserId}
                  onChange={(event) => {
                    setSelectedUserId(event.target.value);
                    setSelectedEventId("");
                    setRoleManagerError("");
                    setPendingRoleId("");
                    setPendingAdminRoleId("");
                  }}
                  disabled={matchingUsers.length === 0}
                >
                  <option value="">
                    {matchingUsers.length === 0 ? "No matches yet" : "Choose a user"}
                  </option>
                  {matchingUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName || "Unnamed"} - {user.email || user.id}
                    </option>
                  ))}
                </Select>
              </Field>
              <Panel className="flex flex-col justify-center gap-1 p-4 text-xs">
                <span className="font-semibold uppercase tracking-wide text-ink-muted">Selected</span>
                <span className="text-ink">
                  {selectedUser ? selectedUser.fullName || "Unnamed profile" : "No user selected"}
                </span>
                {selectedUser ? (
                  <span className="text-[11px] text-ink-muted">{selectedUser.email || selectedUser.id}</span>
                ) : null}
              </Panel>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Role" hint="Select event role first">
                <Select
                  value={pendingRoleId}
                  onChange={(event) => {
                    setPendingRoleId(event.target.value);
                    setSelectedEventId("");
                    setRoleManagerError("");
                  }}
                  disabled={!selectedUser || roleManagerBusy || eventRoles.length === 0}
                >
                  <option value="">
                    {!selectedUser
                      ? "Select a user first"
                      : eventRoles.length === 0
                        ? "No event roles available"
                        : "Select a role"}
                  </option>
                  {eventRoles.map((role) => (
                    <option key={role.id} value={String(role.id)}>
                      {role.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Event" hint="Select after role">
                <Select
                  value={selectedEventId}
                  onChange={(event) => {
                    setSelectedEventId(event.target.value);
                    setRoleManagerError("");
                  }}
                  disabled={!selectedUser || !pendingRoleId || eventOptions.length === 0}
                >
                  <option value="">
                    {!selectedUser
                      ? "Select a user first"
                      : !pendingRoleId
                        ? "Select a role first"
                        : eventOptions.length === 0
                          ? "No linked events"
                          : "Select an event"}
                  </option>
                  {eventOptions.map((event) => (
                    <option key={event.id} value={event.id}>
                      {formatEventOptionLabel(event)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Panel className="flex flex-col justify-center gap-1 p-4 text-xs">
                <span className="font-semibold uppercase tracking-wide text-ink-muted">Sequence</span>
                <span className="text-ink">
                  {selectedUser
                    ? pendingRoleId
                      ? selectedEventId
                        ? "Ready to add event role"
                        : "Step 3: select event"
                      : "Step 2: select role"
                    : "Step 1: select user"}
                </span>
              </Panel>
            </div>
            {selectedUser ? (
              <div className="space-y-3 rounded-xl border border-border/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">Admin access</p>
                    <p className="text-xs text-ink-muted">Admin roles are global, all other roles are event-linked.</p>
                  </div>
                  {roleManagerBusy ? (
                    <Chip variant="ghost" className="text-[11px] text-ink-muted">
                      Saving...
                    </Chip>
                  ) : null}
                </div>
                {adminAssignments.length === 0 ? (
                  <span className="text-xs text-ink-muted">No admin role assigned</span>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {adminAssignments.map((assignment) => (
                      <div
                        key={assignment.assignmentId || assignment.roleId}
                        className="flex items-center gap-1"
                      >
                        <Chip variant="tag">{assignment.roleName || "Role"}</Chip>
                        <button
                          type="button"
                          className="text-[10px] uppercase tracking-wide text-rose-200 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => handleRemoveAdminRole(selectedUser.id, assignment)}
                          disabled={roleManagerBusy}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {legacyAssignments.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">
                      Legacy global roles
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {legacyAssignments.map((assignment) => (
                        <div
                          key={assignment.assignmentId || assignment.roleId}
                          className="flex items-center gap-1"
                        >
                          <Chip variant="tag">{assignment.roleName || "Role"}</Chip>
                          <button
                            type="button"
                            className="text-[10px] uppercase tracking-wide text-rose-200 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleRemoveAdminRole(selectedUser.id, assignment)}
                            disabled={roleManagerBusy}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={pendingAdminRoleId}
                    onChange={(event) => setPendingAdminRoleId(event.target.value)}
                    disabled={roleManagerBusy || availableAdminRoles.length === 0}
                  >
                    <option value="">
                      {availableAdminRoles.length === 0 ? "Admin already assigned" : "Grant admin..."}
                    </option>
                    {availableAdminRoles.map((role) => (
                      <option key={role.id} value={String(role.id)}>
                        {role.name}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    className="sc-button is-ghost text-xs"
                    onClick={() => handleAddAdminRole(selectedUser.id)}
                    disabled={roleManagerBusy || !pendingAdminRoleId}
                  >
                    Add admin
                  </button>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Event roles (selected event)
                  </p>
                  {!selectedEventId ? (
                    <span className="text-xs text-ink-muted">Select an event to view roles.</span>
                  ) : selectedEventRolesForEvent.length === 0 ? (
                    <span className="text-xs text-ink-muted">No event roles assigned for this event.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedEventRolesForEvent.map((entry) => (
                        <div
                          key={entry.assignmentId || `${entry.eventId}-${entry.roleId}`}
                          className="flex items-center gap-1"
                        >
                          <Chip variant="ghost">{formatEventRoleLabel(entry)}</Chip>
                          <button
                            type="button"
                            className="text-[10px] uppercase tracking-wide text-rose-200 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleRemoveEventRole(selectedUser.id, entry)}
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
                  <button
                    type="button"
                    className="sc-button is-ghost text-xs"
                    onClick={() => handleAddEventRole(selectedUser.id)}
                    disabled={
                      roleManagerBusy ||
                      !pendingRoleId ||
                      !selectedEventId ||
                      !availableEventRoles.some((role) => String(role.id) === String(pendingRoleId))
                    }
                  >
                    Add role
                  </button>
                  {roleManagerError ? (
                    <span className="text-[11px] text-rose-200">{roleManagerError}</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-muted">Search for a user to manage their roles.</p>
            )}
          </Panel>
          <Panel className="space-y-3 border border-border/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Role permissions</p>
                <p className="text-xs text-ink-muted">
                  Each role grants these permissions to users who hold it.
                </p>
              </div>
              <Chip variant="ghost" className="text-xs text-ink-muted">
                Permissions mapped: {rolesWithPermissions.length}
              </Chip>
            </div>
            {rolesWithPermissions.length === 0 ? (
              <p className="text-xs text-ink-muted">No role catalog loaded yet.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rolesWithPermissions.map((role) => (
                  <div key={role.id} className="rounded-xl border border-border/60 p-3">
                    <p className="text-sm font-semibold text-ink">{role.name}</p>
                    <p className="text-xs text-ink-muted">{role.description || "No description"}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {role.permissions.length === 0 ? (
                        <Chip variant="ghost" className="text-[11px] text-ink-muted">
                          No permissions assigned
                        </Chip>
                      ) : (
                        role.permissions.map((permission) => (
                          <Chip key={permission.key} variant="tag" className="text-[11px]">
                            {formatPermissionLabel(permission)}
                          </Chip>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <SectionHeader
            eyebrow="Directory"
            eyebrowVariant="tag"
            title="People and access"
            description="Filter by name, role, or email to find the account you need."
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Search" hint="Name, email, or UUID">
              <Input
                type="search"
                value={search}
                placeholder="Search profiles"
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
            <Field label="Filter by role" hint="Limit the grid to a tier">
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
            <Panel className="flex flex-col justify-center gap-1 p-4 text-xs">
              <span className="font-semibold uppercase tracking-wide text-ink-muted">Highlight</span>
              <span className="text-ink">
                Showing {pageStart}-{pageEnd} of {totalResults}
              </span>
              <span className="text-ink-muted">
                Page {currentPage} of {pageCount}
              </span>
            </Panel>
          </div>
          {error ? (
            <Panel className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</Panel>
          ) : null}
          <Panel className="p-0">
            {loading ? (
              <div className="p-6 text-sm text-ink-muted">Loading access records...</div>
            ) : isEmpty ? (
              <div className="p-6 text-sm text-ink-muted">No users match the selected filters.</div>
            ) : (
              <div className="max-h-[65vh] overflow-auto">
                <table className="min-w-full divide-y divide-border text-xs">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-ink-muted">
                        User ID
                      </th>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-ink-muted">
                        Name
                      </th>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-ink-muted">
                        Email
                      </th>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-ink-muted">
                        Admin access
                      </th>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-ink-muted">
                        Event roles
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {pagedUsers.map((user) => {
                      const assignments = Array.isArray(user.roles) ? user.roles : [];
                      const adminAssignments = assignments.filter((assignment) =>
                        isAdminAssignment(assignment, adminRoleIds),
                      );
                      const eventRoles = Array.isArray(user.eventRoles) ? user.eventRoles : [];
                      return (
                        <tr key={user.id} className="hover:bg-surface-muted">
                          <td className="px-3 py-2 font-mono text-[11px] text-ink-muted">{user.id}</td>
                          <td className="px-3 py-2 text-sm font-semibold text-ink">
                            {user.fullName || "Unnamed profile"}
                          </td>
                          <td className="px-3 py-2 text-[13px] text-ink-muted">{user.email || "-"}</td>
                          <td className="px-3 py-2">
                            {adminAssignments.length === 0 ? (
                              <span className="text-xs text-ink-muted">No admin role assigned</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {adminAssignments.map((assignment) => (
                                  <Chip key={assignment.assignmentId || assignment.roleId} variant="tag">
                                    {assignment.roleName || "Role"}
                                  </Chip>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {eventRoles.length === 0 ? (
                              <span className="text-xs text-ink-muted">No event roles</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {eventRoles.map((entry) => (
                                  <Chip key={entry.assignmentId || `${entry.eventId}-${entry.roleId}`} variant="ghost">
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
          </Panel>
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
        </Card>
      </SectionShell>
    </div>
  );
}
