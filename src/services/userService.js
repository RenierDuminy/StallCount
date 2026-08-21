import { supabase } from "./supabaseClient";
import { getCachedQuery } from "../utils/queryCache";

// The role catalog is identical for every user and changes very rarely, so it
// is cached rather than refetched by each page that needs it.
const ROLE_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

function mapRoleAssignments(assignments) {
  return (Array.isArray(assignments) ? assignments : []).map((assignment) => ({
    assignmentId: assignment.id,
    roleId: assignment.role_id ?? assignment.role?.id ?? null,
    roleName: assignment.role?.name ?? null,
    roleScope: assignment.role?.scope ?? "global",
    roleDescription: assignment.role?.description ?? "",
    grantedAt: assignment.created_at ?? null,
    grantedBy: assignment.granted_by ?? null,
  }));
}

function mapEventRoleAssignments(assignments) {
  return (Array.isArray(assignments) ? assignments : []).map((assignment) => ({
    assignmentId: assignment.id,
    roleId: assignment.role_id ?? assignment.role?.id ?? null,
    roleName: assignment.role?.name ?? null,
    roleScope: assignment.role?.scope ?? "event",
    roleDescription: assignment.role?.description ?? "",
    eventId: assignment.event_id ?? assignment.event?.id ?? null,
    eventName: assignment.event?.name ?? "",
    eventStartDate: assignment.event?.start_date ?? null,
    eventEndDate: assignment.event?.end_date ?? null,
    grantedAt: assignment.created_at ?? null,
    grantedBy: assignment.granted_by ?? null,
  }));
}

function mapTeamRoleAssignments(assignments) {
  return (Array.isArray(assignments) ? assignments : []).map((assignment) => ({
    assignmentId: assignment.id,
    roleId: assignment.role_id ?? assignment.role?.id ?? null,
    roleName: assignment.role?.name ?? null,
    roleScope: assignment.role?.scope ?? "team",
    roleDescription: assignment.role?.description ?? "",
    teamId: assignment.team_id ?? assignment.team?.id ?? null,
    teamName: assignment.team?.name ?? "",
    teamShortName: assignment.team?.short_name ?? null,
    // Team grants keep their event details so callers can resolve parent-event
    // access without a second lookup.
    eventId: assignment.event_id ?? assignment.event?.id ?? null,
    eventName: assignment.event?.name ?? "",
    eventStartDate: assignment.event?.start_date ?? null,
    eventEndDate: assignment.event?.end_date ?? null,
    grantedAt: assignment.created_at ?? null,
    grantedBy: assignment.granted_by ?? null,
  }));
}

function mapRolePermissions(permissionRows) {
  const items = Array.isArray(permissionRows) ? permissionRows : [];
  return items
    .map((row) => row?.permission)
    .filter((permission) => permission?.key)
    .map((permission) => ({
      id: permission.id ?? null,
      key: permission.key,
      description: permission.description || "",
    }));
}

export async function getCurrentUser() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("[getCurrentUser] Unable to fetch auth user:", authError);
    return null;
  }

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      `
        id,
        email,
        full_name,
        assignments:user_roles!user_roles_user_id_fkey(
          id,
          role_id,
          created_at,
          granted_by,
          role:roles(id, name, description, scope)
        ),
        event_roles:event_user_roles!event_user_roles_user_id_fkey(
          id,
          role_id,
          event_id,
          created_at,
          granted_by,
          role:roles(id, name, description, scope),
          event:events(id, name, start_date, end_date)
        ),
        team_roles:team_user_roles!team_user_roles_user_id_fkey(
          id,
          role_id,
          team_id,
          event_id,
          created_at,
          granted_by,
          role:roles(id, name, description, scope),
          team:teams(id, name, short_name),
          event:events(id, name, start_date, end_date)
        )
      `,
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[getCurrentUser] Falling back to auth profile:", error);
  }

  if (data) {
    const roles = mapRoleAssignments(data.assignments);
    const eventRoles = mapEventRoleAssignments(data.event_roles);
    const teamRoles = mapTeamRoleAssignments(data.team_roles);
    const primaryRole = roles[0]?.roleName || null;
    return {
      ...data,
      role: primaryRole,
      roles,
      eventRoles,
      teamRoles,
      email: data.email || user.email,
    };
  }

  return {
    id: user.id,
    full_name: user.user_metadata?.full_name || "",
    role: user.user_metadata?.role || "",
    roles: [],
    eventRoles: [],
    teamRoles: [],
    email: user.email,
  };
}

export async function getUserRoleAssignments(userId) {
  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select(
      `
        id,
        user_id,
        role_id,
        created_at,
        granted_by,
        role:roles(id, name, description, scope)
      `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getUserRoleAssignments] Unable to load roles:", error);
    throw new Error(error.message || "Failed to load user roles");
  }

  return mapRoleAssignments(data);
}

export async function getUserEventRoleAssignments(userId) {
  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("event_user_roles")
    .select(
      `
        id,
        user_id,
        role_id,
        event_id,
        created_at,
        granted_by,
        role:roles(id, name, description, scope),
        event:events(id, name, start_date, end_date)
      `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getUserEventRoleAssignments] Unable to load event roles:", error);
    throw new Error(error.message || "Failed to load user event roles");
  }

  return mapEventRoleAssignments(data);
}

const TEAM_ROLE_SELECT = `
  id,
  user_id,
  role_id,
  team_id,
  event_id,
  created_at,
  granted_by,
  role:roles(id, name, description, scope),
  team:teams(id, name, short_name),
  event:events(id, name, start_date, end_date)
`;

export async function getUserTeamRoleAssignments(userId) {
  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("team_user_roles")
    .select(TEAM_ROLE_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getUserTeamRoleAssignments] Unable to load team roles:", error);
    throw new Error(error.message || "Failed to load user team roles");
  }

  return mapTeamRoleAssignments(data);
}

export async function getUserAccessRoleAssignments(userId) {
  if (!userId) {
    return [];
  }

  const [globalRoles, eventRoles, teamRoles] = await Promise.all([
    getUserRoleAssignments(userId),
    getUserEventRoleAssignments(userId),
    // Team roles must never be able to break global/event access: this feeds
    // AuthContext, so a throw here would lock users out of every gated route.
    getUserTeamRoleAssignments(userId).catch((error) => {
      console.error("[getUserAccessRoleAssignments] Team roles unavailable:", error);
      return [];
    }),
  ]);

  const seen = new Set();
  const combined = [];

  const appendUnique = (assignment, scope) => {
    const roleId = assignment?.roleId ?? null;
    const roleName = assignment?.roleName ?? "";
    const eventId = assignment?.eventId ?? null;
    const teamId = assignment?.teamId ?? null;
    // Scope and team are part of the key: two captain grants for different
    // teams at the same event are distinct grants and must both survive.
    const key = [
      scope,
      roleId ?? "none",
      String(roleName).trim().toLowerCase(),
      eventId ?? "-",
      teamId ?? "-",
    ].join("|");
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    combined.push({
      ...assignment,
      scope,
    });
  };

  (Array.isArray(globalRoles) ? globalRoles : []).forEach((assignment) =>
    appendUnique(assignment, "global"),
  );
  (Array.isArray(eventRoles) ? eventRoles : []).forEach((assignment) =>
    appendUnique(assignment, "event"),
  );
  (Array.isArray(teamRoles) ? teamRoles : []).forEach((assignment) =>
    appendUnique(assignment, "team"),
  );

  return combined;
}

const ACCESS_CONTROL_USER_SELECT = `
  id,
  email,
  full_name,
  created_at,
  assignments:user_roles!user_roles_user_id_fkey(
    id,
    role_id,
    created_at,
    role:roles(id, name, description, scope)
  ),
  event_roles:event_user_roles!event_user_roles_user_id_fkey(
    id,
    role_id,
    event_id,
    created_at,
    granted_by,
    role:roles(id, name, description, scope),
    event:events(id, name, start_date, end_date)
  ),
  team_roles:team_user_roles!team_user_roles_user_id_fkey(
    id,
    role_id,
    team_id,
    event_id,
    created_at,
    granted_by,
    role:roles(id, name, description, scope),
    team:teams(id, name, short_name),
    event:events(id, name, start_date, end_date)
  )
`;

function mapAccessControlUserRow(row) {
  return {
    id: row.id,
    email: row.email || "",
    fullName: row.full_name || "",
    createdAt: row.created_at || null,
    roles: mapRoleAssignments(row.assignments),
    eventRoles: mapEventRoleAssignments(row.event_roles),
    teamRoles: mapTeamRoleAssignments(row.team_roles),
  };
}

export async function getAccessControlUsers(limit = 500) {
  let query = supabase
    .from("profiles")
    .select(ACCESS_CONTROL_USER_SELECT)
    .order("created_at", { ascending: true });

  if (typeof limit === "number") {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || "Failed to load users");
  }

  return (data ?? []).map(mapAccessControlUserRow);
}

// Escape PostgREST `or` filter special characters so a search term containing
// commas/parens can't break out of the filter expression.
function escapeOrPattern(value) {
  return String(value).replace(/([%,()\\])/g, "\\$1");
}

/**
 * Server-side searched + paginated access-control users.
 * Returns { users, total } where total is the full match count (for paging).
 *
 * @param {object} [opts]
 * @param {string} [opts.search]   Name / email / id substring.
 * @param {number} [opts.page]     1-based page number.
 * @param {number} [opts.pageSize] Rows per page.
 */
export async function searchAccessControlUsers({
  search = "",
  page = 1,
  pageSize = 20,
} = {}) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 20;
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  let query = supabase
    .from("profiles")
    .select(ACCESS_CONTROL_USER_SELECT, { count: "exact" })
    .order("created_at", { ascending: true })
    .range(from, to);

  const term = search.trim();
  if (term) {
    const pattern = `%${escapeOrPattern(term)}%`;
    // `id` is a uuid; PostgREST's or() can't cast it to text for ilike, so we
    // only add an exact id match when the term is a full UUID.
    const filters = [`full_name.ilike.${pattern}`, `email.ilike.${pattern}`];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term)) {
      filters.push(`id.eq.${term}`);
    }
    query = query.or(filters.join(","));
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(error.message || "Failed to load users");
  }

  return {
    users: (data ?? []).map(mapAccessControlUserRow),
    total: typeof count === "number" ? count : (data?.length ?? 0),
  };
}

/**
 * Fetch a single access-control user by id, with full role detail.
 * Used by the role manager once a user is selected from search results.
 */
export async function getAccessControlUserById(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(ACCESS_CONTROL_USER_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load user");
  }

  return data ? mapAccessControlUserRow(data) : null;
}

export async function getEventLinkedUsers(eventId) {
  if (!eventId) {
    return [];
  }

  const { data, error } = await supabase
    .from("event_user_roles")
    .select(
      `
        id,
        user_id,
        role_id,
        event_id,
        created_at,
        granted_by,
        role:roles(id, name, description, scope),
        event:events(id, name, start_date, end_date),
        user:profiles!event_user_roles_user_id_fkey(id, email, full_name, created_at)
      `,
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load linked users");
  }

  const grouped = new Map();

  (data ?? []).forEach((row) => {
    const userId = row?.user?.id || row?.user_id || null;
    if (!userId) return;

    const mappedEventRole = mapEventRoleAssignments([row])[0];
    if (!mappedEventRole) return;

    const existing = grouped.get(userId) || {
      id: userId,
      email: row?.user?.email || "",
      fullName: row?.user?.full_name || "",
      createdAt: row?.user?.created_at || null,
      eventRoles: [],
    };

    existing.eventRoles = [...existing.eventRoles, mappedEventRole];
    grouped.set(userId, existing);
  });

  return Array.from(grouped.values()).sort((left, right) => {
    const leftLabel = left.fullName || left.email || "";
    const rightLabel = right.fullName || right.email || "";
    return leftLabel.localeCompare(rightLabel);
  });
}

/**
 * Users holding team-scoped grants, grouped per user.
 * Pass `teamId` for a single team, `eventId` for every team in an event.
 */
export async function getTeamLinkedUsers({ teamId, eventId } = {}) {
  if (!teamId && !eventId) {
    return [];
  }

  let query = supabase
    .from("team_user_roles")
    .select(
      `${TEAM_ROLE_SELECT},
        user:profiles!team_user_roles_user_id_fkey(id, email, full_name, created_at)
      `,
    )
    .order("created_at", { ascending: true });

  if (teamId) {
    query = query.eq("team_id", teamId);
  }
  if (eventId) {
    query = query.eq("event_id", eventId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || "Failed to load team-linked users");
  }

  const grouped = new Map();

  (data ?? []).forEach((row) => {
    const userId = row?.user?.id || row?.user_id || null;
    if (!userId) return;

    const mappedTeamRole = mapTeamRoleAssignments([row])[0];
    if (!mappedTeamRole) return;

    const existing = grouped.get(userId) || {
      id: userId,
      email: row?.user?.email || "",
      fullName: row?.user?.full_name || "",
      createdAt: row?.user?.created_at || null,
      teamRoles: [],
    };

    existing.teamRoles = [...existing.teamRoles, mappedTeamRole];
    grouped.set(userId, existing);
  });

  return Array.from(grouped.values()).sort((left, right) => {
    const leftLabel = left.fullName || left.email || "";
    const rightLabel = right.fullName || right.email || "";
    return leftLabel.localeCompare(rightLabel);
  });
}

export async function getAccessControlEvents(limit = 500) {
  let query = supabase
    .from("events")
    .select("id, name, start_date, end_date, created_at")
    .order("start_date", { ascending: false })
    .order("name", { ascending: true });

  if (typeof limit === "number") {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || "Failed to load events");
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name || "Event",
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    createdAt: row.created_at ?? null,
  }));
}

export async function getRoleCatalog() {
  return getCachedQuery(
    "roles:catalog:v1",
    async () => {
      const { data, error } = await supabase
        .from("roles")
        .select(
          `
        id,
        name,
        scope,
        description,
        role_permissions:role_permissions!role_permissions_role_id_fkey(
          permission:permissions(id, key, description)
        )
      `,
        )
        .order("name", { ascending: true });

      if (error) {
        throw new Error(error.message || "Failed to load roles");
      }

      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        scope: row.scope || "event",
        description: row.description || "",
        permissions: mapRolePermissions(row.role_permissions),
      }));
    },
    { ttlMs: ROLE_CATALOG_CACHE_TTL_MS },
  );
}

export async function updateUserRoleAssignment(userId, nextRoleId) {
  if (!userId) {
    throw new Error("User ID is required to update access.");
  }

  let normalizedRoleId = null;
  if (nextRoleId !== null && nextRoleId !== undefined && nextRoleId !== "") {
    const parsed = Number(nextRoleId);
    normalizedRoleId = Number.isNaN(parsed) ? null : parsed;
  }

  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  const grantedBy = actor?.id ?? null;

  const { error: clearError } = await supabase.from("user_roles").delete().eq("user_id", userId);
  if (clearError) {
    throw new Error(clearError.message || "Failed to update user access level");
  }

  if (normalizedRoleId === null) {
    return {
      id: userId,
      roleId: null,
      roleName: null,
    };
  }

  const { data, error } = await supabase
    .from("user_roles")
    .insert({
      user_id: userId,
      role_id: normalizedRoleId,
      granted_by: grantedBy,
    })
    .select("id, role_id, role:roles(id, name)")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to update user access level");
  }

  return {
    id: data?.id ?? userId,
    roleId: data?.role_id ?? normalizedRoleId,
    roleName: data?.role?.name ?? null,
  };
}

export async function addUserRoleAssignment(userId, roleId) {
  if (!userId) {
    throw new Error("User ID is required to add a role.");
  }

  let normalizedRoleId = null;
  if (roleId !== null && roleId !== undefined && roleId !== "") {
    const parsed = Number(roleId);
    normalizedRoleId = Number.isNaN(parsed) ? null : parsed;
  }

  if (normalizedRoleId === null) {
    throw new Error("Role ID is required to add a role.");
  }

  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  const grantedBy = actor?.id ?? null;

  const { data, error } = await supabase
    .from("user_roles")
    .insert({
      user_id: userId,
      role_id: normalizedRoleId,
      granted_by: grantedBy,
    })
    .select("id, role_id, created_at, granted_by, role:roles(id, name, description)")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to add user role");
  }

  const mapped = mapRoleAssignments(data ? [data] : []);
  return mapped[0] || {
    assignmentId: data?.id ?? null,
    roleId: normalizedRoleId,
    roleName: data?.role?.name ?? null,
    roleDescription: data?.role?.description ?? "",
    grantedAt: data?.created_at ?? null,
    grantedBy: data?.granted_by ?? null,
  };
}

export async function removeUserRoleAssignment(assignmentId, userId, roleId) {
  if (!assignmentId && (!userId || roleId === undefined || roleId === null || roleId === "")) {
    throw new Error("Assignment ID or user/role identifiers are required to remove a role.");
  }

  let query = supabase.from("user_roles").delete();

  if (assignmentId) {
    query = query.eq("id", assignmentId);
  } else {
    const parsed = Number(roleId);
    const normalizedRoleId = Number.isNaN(parsed) ? null : parsed;
    if (normalizedRoleId === null) {
      throw new Error("Valid role ID is required to remove a role.");
    }
    query = query.eq("user_id", userId).eq("role_id", normalizedRoleId);
  }

  const { error } = await query;

  if (error) {
    throw new Error(error.message || "Failed to remove user role");
  }
}

export async function addEventUserRoleAssignment(userId, roleId, eventId) {
  if (!userId) {
    throw new Error("User ID is required to add an event role.");
  }
  if (!eventId) {
    throw new Error("Event ID is required to add an event role.");
  }

  let normalizedRoleId = null;
  if (roleId !== null && roleId !== undefined && roleId !== "") {
    const parsed = Number(roleId);
    normalizedRoleId = Number.isNaN(parsed) ? null : parsed;
  }

  if (normalizedRoleId === null) {
    throw new Error("Role ID is required to add an event role.");
  }

  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  const grantedBy = actor?.id ?? null;

  const { data, error } = await supabase
    .from("event_user_roles")
    .insert({
      user_id: userId,
      role_id: normalizedRoleId,
      event_id: eventId,
      granted_by: grantedBy,
    })
    .select("id, role_id, event_id, created_at, granted_by, role:roles(id, name, description), event:events(id, name, start_date, end_date)")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to add event role");
  }

  const mapped = mapEventRoleAssignments(data ? [data] : []);
  return mapped[0] || {
    assignmentId: data?.id ?? null,
    roleId: normalizedRoleId,
    roleName: data?.role?.name ?? null,
    roleDescription: data?.role?.description ?? "",
    eventId: data?.event_id ?? eventId,
    eventName: data?.event?.name ?? "",
    eventStartDate: data?.event?.start_date ?? null,
    eventEndDate: data?.event?.end_date ?? null,
    grantedAt: data?.created_at ?? null,
    grantedBy: data?.granted_by ?? null,
  };
}

export async function addTeamUserRoleAssignment(userId, roleId, teamId, eventId = null) {
  if (!userId) {
    throw new Error("User ID is required to add a team role.");
  }
  if (!teamId) {
    throw new Error("Team ID is required to add a team role.");
  }
  // team_user_roles.event_id is NOT NULL, and the RLS policy resolves a
  // tournament director's authority through the event. Without one, only a
  // global admin could ever insert.
  if (!eventId) {
    throw new Error("Event ID is required to add a team role.");
  }

  let normalizedRoleId = null;
  if (roleId !== null && roleId !== undefined && roleId !== "") {
    const parsed = Number(roleId);
    normalizedRoleId = Number.isNaN(parsed) ? null : parsed;
  }

  if (normalizedRoleId === null) {
    throw new Error("Role ID is required to add a team role.");
  }

  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  const grantedBy = actor?.id ?? null;

  const { data, error } = await supabase
    .from("team_user_roles")
    .insert({
      user_id: userId,
      role_id: normalizedRoleId,
      team_id: teamId,
      event_id: eventId,
      granted_by: grantedBy,
    })
    .select(TEAM_ROLE_SELECT)
    .maybeSingle();

  if (error) {
    // 23505 = the unique constraint / partial unique index on this table.
    if (error.code === "23505") {
      throw new Error("That user already has this role for this team.");
    }
    throw new Error(error.message || "Failed to add team role");
  }

  return mapTeamRoleAssignments(data ? [data] : [])[0] ?? null;
}

export async function removeTeamUserRoleAssignment(
  assignmentId,
  userId,
  roleId,
  teamId,
  eventId = null,
) {
  if (
    !assignmentId &&
    (!userId || !teamId || roleId === undefined || roleId === null || roleId === "")
  ) {
    throw new Error(
      "Assignment ID or user/team/role identifiers are required to remove a team role.",
    );
  }

  let query = supabase.from("team_user_roles").delete();

  if (assignmentId) {
    query = query.eq("id", assignmentId);
  } else {
    const parsed = Number(roleId);
    const normalizedRoleId = Number.isNaN(parsed) ? null : parsed;
    if (normalizedRoleId === null) {
      throw new Error("Valid role ID is required to remove a team role.");
    }
    // event_id is NOT NULL on this table, so without one the identifier trio is
    // ambiguous: matching on it is the only way to target a single grant.
    if (!eventId) {
      throw new Error("Event ID is required to remove a team role by user/team/role.");
    }
    query = query
      .eq("user_id", userId)
      .eq("team_id", teamId)
      .eq("role_id", normalizedRoleId)
      .eq("event_id", eventId);
  }

  const { error } = await query;

  if (error) {
    throw new Error(error.message || "Failed to remove team role");
  }
}

export async function removeEventUserRoleAssignment(assignmentId, userId, roleId, eventId) {
  if (!assignmentId && (!userId || !eventId || roleId === undefined || roleId === null || roleId === "")) {
    throw new Error("Assignment ID or user/event/role identifiers are required to remove an event role.");
  }

  let query = supabase.from("event_user_roles").delete();

  if (assignmentId) {
    query = query.eq("id", assignmentId);
  } else {
    const parsed = Number(roleId);
    const normalizedRoleId = Number.isNaN(parsed) ? null : parsed;
    if (normalizedRoleId === null) {
      throw new Error("Valid role ID is required to remove an event role.");
    }
    query = query.eq("user_id", userId).eq("event_id", eventId).eq("role_id", normalizedRoleId);
  }

  const { error } = await query;

  if (error) {
    throw new Error(error.message || "Failed to remove event role");
  }
}
