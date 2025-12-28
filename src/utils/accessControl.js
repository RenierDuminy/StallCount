const ROLE_NAME_BY_ID = {
  1: "Administrator",
  2: "Score keeper",
  3: "Captain",
  4: "Standard user",
};

const ADMIN_TOOL_ACCESS_ROLES = ["admin", "tournament_director", "media", "captain"];

function normalizeRoleSlug(value) {
  if (value === undefined || value === null) return null;

  if (typeof value === "object") {
    if (typeof value.name === "string") {
      value = value.name;
    } else if (typeof value.label === "string") {
      value = value.label;
    } else if (typeof value.value === "string" || typeof value.value === "number") {
      value = value.value;
    } else {
      return null;
    }
  }

  const stringValue = String(value).trim();
  if (!stringValue) return null;

  return stringValue.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function normaliseRoleList(input) {
  if (input === undefined || input === null) return [];

  const sourceArray = Array.isArray(input)
    ? input
    : typeof input === "object"
      ? Object.values(input)
      : String(input).split(",");

  return sourceArray
    .map((value) => normalizeRoleSlug(value))
    .filter((role) => Boolean(role));
}

function collectAssignmentRoles(assignments) {
  if (!Array.isArray(assignments)) return [];

  return assignments
    .map((assignment) => assignment?.roleName || assignment?.role?.name || assignment?.roleId || null)
    .filter(Boolean);
}

export function getUserRoleSlugs(user, roleAssignments) {
  if (!user && !Array.isArray(roleAssignments)) return [];

  const collected = new Set();

  if (Array.isArray(roleAssignments)) {
    collectAssignmentRoles(roleAssignments).forEach((value) => {
      normaliseRoleList(value).forEach((role) => collected.add(role));
    });
  }

  const shouldFallbackToMetadata = roleAssignments === undefined;
  if (shouldFallbackToMetadata && user) {
    const appMeta = user.app_metadata || {};
    const userMeta = user.user_metadata || {};

    [appMeta.role, appMeta.roles, userMeta.role, userMeta.roles].forEach((source) => {
      normaliseRoleList(source).forEach((role) => collected.add(role));
    });

    const roleId = userMeta.role_id;
    if (roleId && ROLE_NAME_BY_ID[roleId]) {
      normaliseRoleList(ROLE_NAME_BY_ID[roleId]).forEach((role) => collected.add(role));
    }

    const roleIds = Array.isArray(userMeta.role_ids) ? userMeta.role_ids : [];
    roleIds.forEach((id) => {
      const label = ROLE_NAME_BY_ID[id] || id;
      normaliseRoleList(label).forEach((role) => collected.add(role));
    });
  }

  return Array.from(collected);
}

export function userHasAnyRole(user, allowedRoles, roleAssignments) {
  const normalizedAllowed = new Set(normaliseRoleList(allowedRoles));
  if (normalizedAllowed.size === 0) {
    return false;
  }

  const userRoles = getUserRoleSlugs(user, roleAssignments);
  return userRoles.some((role) => normalizedAllowed.has(role));
}

export { ROLE_NAME_BY_ID, ADMIN_TOOL_ACCESS_ROLES };
