import { supabase } from "./supabaseClient";

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
    const primaryRole = roles[0]?.roleName || null;
    return {
      ...data,
      role: primaryRole,
      roles,
      eventRoles,
      email: data.email || user.email,
    };
  }

  return {
    id: user.id,
    full_name: user.user_metadata?.full_name || "",
    role: user.user_metadata?.role || "",
    roles: [],
    eventRoles: [],
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

export async function getUserAccessRoleAssignments(userId) {
  if (!userId) {
    return [];
  }

  const [globalRoles, eventRoles] = await Promise.all([
    getUserRoleAssignments(userId),
    getUserEventRoleAssignments(userId),
  ]);

  const seen = new Set();
  const combined = [];

  const appendUnique = (assignment, scope) => {
    const roleId = assignment?.roleId ?? null;
    const roleName = assignment?.roleName ?? "";
    const eventId = assignment?.eventId ?? null;
    const key = `${roleId ?? "none"}|${String(roleName).trim().toLowerCase()}|${eventId ?? "global"}`;
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

  return combined;
}

export async function getAccessControlUsers(limit = 500) {
  let query = supabase
    .from("profiles")
    .select(
      `
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
        )
      `,
    )
    .order("created_at", { ascending: true });

  if (typeof limit === "number") {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || "Failed to load users");
  }

  return (data ?? []).map((row) => {
    const roles = mapRoleAssignments(row.assignments);
    const eventRoles = mapEventRoleAssignments(row.event_roles);

    return {
      id: row.id,
      email: row.email || "",
      fullName: row.full_name || "",
      createdAt: row.created_at || null,
      roles,
      eventRoles,
    };
  });
}

export async function getAccessControlEvents(limit = 500) {
  let query = supabase
    .from("events")
    .select("id, name, start_date, end_date, created_at")
    .order("start_date", { ascending: true })
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
