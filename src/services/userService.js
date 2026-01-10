import { supabase } from "./supabaseClient";

function mapRoleAssignments(assignments) {
  return (Array.isArray(assignments) ? assignments : []).map((assignment) => ({
    assignmentId: assignment.id,
    roleId: assignment.role_id ?? assignment.role?.id ?? null,
    roleName: assignment.role?.name ?? null,
    roleDescription: assignment.role?.description ?? "",
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
          role:roles(id, name, description)
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
    const primaryRole = roles[0]?.roleName || null;
    return {
      ...data,
      role: primaryRole,
      roles,
      email: data.email || user.email,
    };
  }

  return {
    id: user.id,
    full_name: user.user_metadata?.full_name || "",
    role: user.user_metadata?.role || "",
    roles: [],
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
        role:roles(id, name, description)
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
          role:roles(id, name, description)
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

    return {
      id: row.id,
      email: row.email || "",
      fullName: row.full_name || "",
      createdAt: row.created_at || null,
      roles,
    };
  });
}

export async function getRoleCatalog() {
  const { data, error } = await supabase
    .from("roles")
    .select(
      `
        id,
        name,
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

  const { data, error } = await supabase
    .from("user")
    .update({ role_id: normalizedRoleId })
    .eq("id", userId)
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
