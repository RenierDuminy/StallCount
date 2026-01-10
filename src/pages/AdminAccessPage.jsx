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
import { getAccessControlUsers, getRoleCatalog } from "../services/userService";

function formatRoleCounts(users) {
  return users.reduce((acc, user) => {
    const assignments = Array.isArray(user.roles) ? user.roles : [];
    if (assignments.length === 0) {
      acc.set("none", (acc.get("none") || 0) + 1);
      return acc;
    }
    assignments.forEach((assignment) => {
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

export default function AdminAccessPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [userRows, roleRows] = await Promise.all([
        getAccessControlUsers(),
        getRoleCatalog(),
      ]);
      setUsers(userRows);
      setRoles(roleRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load access control data.");
    } finally {
      setLoading(false);
    }
  }

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
      const matchesRole = (() => {
        if (roleKey === null) return true;
        if (roleKey === "none") return assignments.length === 0;
        return assignments.some((assignment) => assignment.roleId !== null && String(assignment.roleId) === roleKey);
      })();
      return matchesQuery && matchesRole;
    });
  }, [users, search, roleFilter]);

  const roleCounts = useMemo(() => formatRoleCounts(users), [users]);
  const rolesWithPermissions = useMemo(
    () =>
      roles.map((role) => ({
        ...role,
        permissions: Array.isArray(role.permissions) ? role.permissions : [],
      })),
    [roles],
  );

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
              Roles: {roles.length}
            </Chip>
            <Chip variant="ghost" className="text-xs text-ink-muted">
              Unassigned: {roleCounts.get("none") || 0}
            </Chip>
          </div>
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-5 pb-16">
        <Card className="space-y-5 p-5">
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
                {filteredUsers.length} result{filteredUsers.length === 1 ? "" : "s"} shown
              </span>
            </Panel>
          </div>
          {error ? (
            <Panel className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</Panel>
          ) : null}
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
                        Access levels
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {filteredUsers.map((user) => {
                      const assignments = Array.isArray(user.roles) ? user.roles : [];
                      return (
                        <tr key={user.id} className="hover:bg-surface-muted">
                          <td className="px-3 py-2 font-mono text-[11px] text-ink-muted">{user.id}</td>
                          <td className="px-3 py-2 text-sm font-semibold text-ink">
                            {user.fullName || "Unnamed profile"}
                          </td>
                          <td className="px-3 py-2 text-[13px] text-ink-muted">{user.email || "-"}</td>
                          <td className="px-3 py-2">
                            {assignments.length === 0 ? (
                              <span className="text-xs text-ink-muted">No role assigned</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {assignments.map((assignment) => (
                                  <Chip key={assignment.assignmentId || assignment.roleId} variant="tag">
                                    {assignment.roleName || "Role"}
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
        </Card>
      </SectionShell>
    </div>
  );
}
