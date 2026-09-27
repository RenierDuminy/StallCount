import { useEffect, useMemo, useState } from "react";
import { Card, Chip, Field, Input, Select } from "../../components/ui/primitives";
import {
  addEventUserRoleAssignment,
  addTeamUserRoleAssignment,
  getRoleCatalog,
  searchAccessControlUsers,
} from "../../services/userService";
import { getTeamsLinkedToEvent } from "../../services/teamService";
import {
  isAdminPrivilegeRole,
  isTeamScopedRole,
  isUserRole,
} from "../../utils/roleScope";

const LIGHT_INPUT_CLASS =
  "rounded-lg border border-[var(--sc-surface-light-border)] bg-white px-3 py-1.5 text-sm text-[var(--sc-surface-light-ink)] shadow-sm focus:border-[var(--sc-border-strong)] focus:outline-none";
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_PAGE_SIZE = 8;

function grantKey(grant) {
  return `${grant.roleId}::${grant.teamId || ""}`;
}

/**
 * Bulk add-only builder: search users, stack one or more role grants per
 * user, then save everything in one batch. Editing/removing existing grants
 * still lives on EventAccessPage - this panel only appends.
 */
export default function BulkRoleAssignmentPanel({ eventId, onAssigned }) {
  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [eventTeams, setEventTeams] = useState([]);
  const [eventTeamsLoading, setEventTeamsLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [builderRows, setBuilderRows] = useState([]); // [{ userId, fullName, email, roleGrants: [] }]
  const [pendingRoleIdByUser, setPendingRoleIdByUser] = useState({});
  const [pendingTeamIdByUser, setPendingTeamIdByUser] = useState({});

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveResults, setSaveResults] = useState(null); // { succeeded: number, failed: [{label, message}] }

  useEffect(() => {
    let cancelled = false;
    setRolesLoading(true);
    getRoleCatalog()
      .then((rows) => {
        if (!cancelled) setRoles(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setRoles([]);
      })
      .finally(() => {
        if (!cancelled) setRolesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!eventId) {
      setEventTeams([]);
      setEventTeamsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setEventTeamsLoading(true);
    getTeamsLinkedToEvent(eventId)
      .then((data) => {
        if (!cancelled) setEventTeams(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setEventTeams([]);
      })
      .finally(() => {
        if (!cancelled) setEventTeamsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (!eventId || !searchQuery.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }
    let cancelled = false;
    setSearchLoading(true);
    const handle = setTimeout(async () => {
      try {
        const { users } = await searchAccessControlUsers({
          search: searchQuery,
          page: 1,
          pageSize: SEARCH_PAGE_SIZE,
        });
        if (!cancelled) setSearchResults(Array.isArray(users) ? users : []);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery, eventId]);

  const selectableRoles = useMemo(
    () => roles.filter((role) => !isAdminPrivilegeRole(role) && !isUserRole(role)),
    [roles],
  );
  const nonTeamRoles = useMemo(
    () => selectableRoles.filter((role) => !isTeamScopedRole(role)),
    [selectableRoles],
  );
  const teamScopedRoles = useMemo(
    () => selectableRoles.filter((role) => isTeamScopedRole(role)),
    [selectableRoles],
  );

  function addUserToBuilder(user) {
    setBuilderRows((prev) => {
      if (prev.some((row) => row.userId === user.id)) return prev;
      return [...prev, { userId: user.id, fullName: user.fullName, email: user.email, roleGrants: [] }];
    });
    setSearchQuery("");
    setSearchResults([]);
  }

  function removeUserFromBuilder(userId) {
    setBuilderRows((prev) => prev.filter((row) => row.userId !== userId));
    setPendingRoleIdByUser((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    setPendingTeamIdByUser((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }

  function availableTeamsForUserRole(userId, roleId) {
    const row = builderRows.find((entry) => entry.userId === userId);
    const takenTeamIds = new Set(
      (row?.roleGrants || [])
        .filter((grant) => String(grant.roleId) === String(roleId))
        .map((grant) => String(grant.teamId)),
    );
    return eventTeams.filter((team) => !takenTeamIds.has(String(team.id)));
  }

  function addRoleGrant(userId) {
    const roleId = pendingRoleIdByUser[userId];
    if (!roleId) return;
    const role = selectableRoles.find((entry) => String(entry.id) === String(roleId));
    if (!role) return;
    const teamScoped = isTeamScopedRole(role);
    const teamId = teamScoped ? pendingTeamIdByUser[userId] : null;
    if (teamScoped && !teamId) return;

    const team = teamScoped ? eventTeams.find((entry) => String(entry.id) === String(teamId)) : null;
    const grant = {
      roleId,
      roleName: role.name,
      isTeamScoped: teamScoped,
      teamId: teamScoped ? teamId : null,
      teamName: team?.name || null,
    };

    setBuilderRows((prev) =>
      prev.map((row) => {
        if (row.userId !== userId) return row;
        if (row.roleGrants.some((existing) => grantKey(existing) === grantKey(grant))) return row;
        return { ...row, roleGrants: [...row.roleGrants, grant] };
      }),
    );
    setPendingRoleIdByUser((prev) => ({ ...prev, [userId]: "" }));
    setPendingTeamIdByUser((prev) => ({ ...prev, [userId]: "" }));
  }

  function removeRoleGrant(userId, grant) {
    setBuilderRows((prev) =>
      prev.map((row) => {
        if (row.userId !== userId) return row;
        return { ...row, roleGrants: row.roleGrants.filter((entry) => grantKey(entry) !== grantKey(grant)) };
      }),
    );
  }

  const totalPendingGrants = builderRows.reduce((sum, row) => sum + row.roleGrants.length, 0);

  async function handleSaveAll() {
    if (!eventId || totalPendingGrants === 0) return;
    setSaving(true);
    setSaveError("");
    setSaveResults(null);

    const jobs = [];
    builderRows.forEach((row) => {
      row.roleGrants.forEach((grant) => {
        jobs.push({ userId: row.userId, label: `${row.fullName || row.email} - ${grant.roleName}`, grant });
      });
    });

    const outcomes = await Promise.allSettled(
      jobs.map((job) =>
        job.grant.isTeamScoped
          ? addTeamUserRoleAssignment(job.userId, job.grant.roleId, job.grant.teamId, eventId)
          : addEventUserRoleAssignment(job.userId, job.grant.roleId, eventId),
      ),
    );

    const failed = [];
    let succeeded = 0;
    outcomes.forEach((outcome, index) => {
      const job = jobs[index];
      if (outcome.status === "fulfilled") {
        succeeded += 1;
      } else {
        failed.push({
          label: job.label,
          message: outcome.reason instanceof Error ? outcome.reason.message : "Failed to add role.",
        });
      }
    });

    // Drop only the grants that succeeded; failed ones stay so they can be retried.
    const failedKeys = new Set(
      jobs
        .filter((_, index) => outcomes[index].status === "rejected")
        .map((job) => `${job.userId}::${grantKey(job.grant)}`),
    );
    setBuilderRows((prev) =>
      prev
        .map((row) => ({
          ...row,
          roleGrants: row.roleGrants.filter((grant) => failedKeys.has(`${row.userId}::${grantKey(grant)}`)),
        }))
        .filter((row) => row.roleGrants.length > 0),
    );

    setSaveResults({ succeeded, failed });
    setSaving(false);

    if (succeeded > 0 && typeof onAssigned === "function") {
      onAssigned();
    }
  }

  if (!eventId) {
    return (
      <Card variant="light" className="space-y-2 p-4 shadow-md shadow-[rgba(8,25,21,0.06)]">
        <p className="text-sm text-[var(--sc-surface-light-ink)]/70">Select an event above first.</p>
      </Card>
    );
  }

  return (
    <Card variant="light" className="space-y-4 p-4 shadow-md shadow-[rgba(8,25,21,0.06)]">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--sc-surface-light-ink)]">Add users</p>
        <p className="text-xs text-[var(--sc-surface-light-ink)]/70">
          Search for people, stack one or more roles on each, then save them all at once.
        </p>
      </div>

      <Field label="Search by name or email">
        <Input
          type="search"
          className={LIGHT_INPUT_CLASS}
          value={searchQuery}
          placeholder="Start typing a name or email..."
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </Field>

      {searchQuery.trim() ? (
        <div className="overflow-hidden rounded-xl border border-[var(--sc-surface-light-border)] bg-white">
          {searchLoading ? (
            <p className="p-3 text-xs text-[var(--sc-surface-light-ink)]/70">Searching...</p>
          ) : searchResults.length === 0 ? (
            <p className="p-3 text-xs text-[var(--sc-surface-light-ink)]/70">No matches.</p>
          ) : (
            searchResults.map((user) => (
              <button
                key={user.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 border-b border-[var(--sc-surface-light-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--sc-surface-light-tint)] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => addUserToBuilder(user)}
                disabled={builderRows.some((row) => row.userId === user.id)}
              >
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-[var(--sc-surface-light-ink)]">
                    {user.fullName || "Unnamed"}
                  </span>{" "}
                  <span className="text-[var(--sc-surface-light-ink)]/65">{user.email || user.id}</span>
                </span>
                {builderRows.some((row) => row.userId === user.id) ? (
                  <Chip variant="ghost" className="text-[10px]">Added</Chip>
                ) : (
                  <span className="text-xs font-semibold text-[var(--sc-border-strong)]">Add</span>
                )}
              </button>
            ))
          )}
        </div>
      ) : null}

      {builderRows.length === 0 ? (
        <p className="text-xs text-[var(--sc-surface-light-ink)]/70">
          No users added yet. Search above to start building the list.
        </p>
      ) : (
        <div className="space-y-3">
          {builderRows.map((row) => {
            const pendingRoleId = pendingRoleIdByUser[row.userId] || "";
            const pendingRole = selectableRoles.find(
              (role) => String(role.id) === String(pendingRoleId),
            );
            const pendingRoleTeamScoped = isTeamScopedRole(pendingRole);
            const pendingTeamId = pendingTeamIdByUser[row.userId] || "";
            const availableTeams = pendingRoleTeamScoped
              ? availableTeamsForUserRole(row.userId, pendingRoleId)
              : [];

            return (
              <div
                key={row.userId}
                className="space-y-2 rounded-xl border border-[var(--sc-surface-light-border)] bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--sc-surface-light-ink)]">
                      {row.fullName || "Unnamed"}
                    </p>
                    <p className="truncate text-xs text-[var(--sc-surface-light-ink)]/65">{row.email}</p>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] uppercase tracking-wide text-rose-500 hover:text-rose-600"
                    onClick={() => removeUserFromBuilder(row.userId)}
                    disabled={saving}
                  >
                    Remove
                  </button>
                </div>

                {row.roleGrants.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {row.roleGrants.map((grant) => (
                      <div key={grantKey(grant)} className="flex items-center gap-1">
                        <Chip variant="tag" className="text-[11px]">
                          {grant.roleName}
                          {grant.teamName ? ` - ${grant.teamName}` : ""}
                        </Chip>
                        <button
                          type="button"
                          className="text-[10px] uppercase tracking-wide text-rose-500 hover:text-rose-600"
                          onClick={() => removeRoleGrant(row.userId, grant)}
                          disabled={saving}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={LIGHT_INPUT_CLASS}
                    value={pendingRoleId}
                    onChange={(event) => {
                      setPendingRoleIdByUser((prev) => ({ ...prev, [row.userId]: event.target.value }));
                      setPendingTeamIdByUser((prev) => ({ ...prev, [row.userId]: "" }));
                    }}
                    disabled={saving || rolesLoading}
                  >
                    <option value="">Add role...</option>
                    {nonTeamRoles.length > 0 ? (
                      <optgroup label="Event roles">
                        {nonTeamRoles.map((role) => (
                          <option key={role.id} value={String(role.id)}>
                            {role.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {teamScopedRoles.length > 0 ? (
                      <optgroup label="Team roles">
                        {teamScopedRoles.map((role) => (
                          <option key={role.id} value={String(role.id)}>
                            {role.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>

                  {pendingRoleTeamScoped ? (
                    <select
                      className={LIGHT_INPUT_CLASS}
                      value={pendingTeamId}
                      onChange={(event) =>
                        setPendingTeamIdByUser((prev) => ({ ...prev, [row.userId]: event.target.value }))
                      }
                      disabled={saving || eventTeamsLoading}
                    >
                      <option value="">
                        {eventTeamsLoading
                          ? "Loading teams..."
                          : availableTeams.length === 0
                            ? "All teams already assigned"
                            : "Select a team (required)"}
                      </option>
                      {availableTeams.map((team) => (
                        <option key={team.id} value={String(team.id)}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  <button
                    type="button"
                    className="sc-button is-ghost text-xs"
                    onClick={() => addRoleGrant(row.userId)}
                    disabled={
                      saving ||
                      !pendingRoleId ||
                      (pendingRoleTeamScoped && !pendingTeamId)
                    }
                  >
                    Add role
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--sc-surface-light-border)] pt-3">
        <button
          type="button"
          className="sc-button"
          onClick={handleSaveAll}
          disabled={saving || totalPendingGrants === 0}
        >
          {saving ? "Saving..." : `Save all (${totalPendingGrants})`}
        </button>
        {saveError ? <span className="text-xs text-rose-600">{saveError}</span> : null}
      </div>

      {saveResults ? (
        <div className="space-y-1 rounded-xl border border-[var(--sc-surface-light-border)] bg-white p-3 text-xs">
          <p className="font-semibold text-emerald-600">{saveResults.succeeded} role(s) added.</p>
          {saveResults.failed.length > 0 ? (
            <div className="space-y-0.5">
              {saveResults.failed.map((failure) => (
                <p key={failure.label} className="text-rose-600">
                  {failure.label}: {failure.message}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
