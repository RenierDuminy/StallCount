const ROLE_NAME_BY_ID = {
  1: "Administrator",
  2: "Score keeper",
  3: "Captain",
  4: "Standard user",
};

const ADMIN_TOOL_ACCESS_ROLES = ["admin", "tournament_director", "media", "captain"];
const SCOREKEEPER_ACCESS_ROLES = ["tournament_director", "field_assistant", "scorekeeper"];
const CAPTAIN_ACCESS_ROLES = ["captain"];
const TOURNAMENT_DIRECTOR_ACCESS_ROLES = ["tournament_director"];
const SYS_ADMIN_ACCESS_ROLES = ["admin"];
const ADMIN_ACCESS_ACCESS_ROLES = ["admin"];
const EVENT_SETUP_ACCESS_ROLES = ["tournament_director"];
const SPIRIT_SCORES_ACCESS_ROLES = [
  "captain",
  "team_manager",
  "scorekeeper",
  "field_assistant",
  "tournament_director",
];
const ADMIN_OVERRIDE_PERMISSIONS = ["admin_override"];
const MEDIA_ACCESS_PERMISSIONS = ["media_edit", "admin_override"];
const ADMIN_ACCESS_PERMISSIONS = ["role_edit", "admin_override"];
const EVENT_ACCESS_PERMISSIONS = ["role_edit", "admin_override"];
const SIGNUP_MANAGEMENT_ACCESS_PERMISSIONS = [
  "roster_insert",
  "roster_update",
  "roster_delete",
  "player_insert",
  "player_update",
  "player_delete",
  "admin_override",
];
const SPIRIT_SCORES_ACCESS_PERMISSIONS = ["match_insert", "match_update", "admin_override"];
const SCOREKEEPER_ACCESS_PERMISSIONS = ["match_insert", "match_update", "admin_override"];
const CAPTAIN_ACCESS_PERMISSIONS = [
  "team_update",
  "roster_insert",
  "roster_update",
  "roster_delete",
  "player_insert",
  "player_update",
  "match_update",
  "admin_override",
];
const EVENT_SETUP_ACCESS_PERMISSIONS = [
  "event_insert",
  "event_update",
  "team_insert",
  "team_update",
  "team_delete",
  "match_insert",
  "match_update",
  "match_delete",
  "admin_override",
];
const TOURNAMENT_DIRECTOR_ACCESS_PERMISSIONS = [
  "event_insert",
  "event_update",
  "team_insert",
  "team_update",
  "team_delete",
  "roster_insert",
  "roster_update",
  "roster_delete",
  "player_insert",
  "player_update",
  "player_delete",
  "media_edit",
  "match_insert",
  "match_update",
  "match_delete",
  "admin_override",
];
const SYS_ADMIN_ACCESS_PERMISSIONS = ["admin_override"];

function normalizePermissionKey(value) {
  if (value === undefined || value === null) return null;

  if (typeof value === "object") {
    if (typeof value.key === "string") {
      value = value.key;
    } else if (typeof value.name === "string") {
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

export function normalisePermissionList(input) {
  if (input === undefined || input === null) return [];

  const sourceArray = Array.isArray(input)
    ? input
    : typeof input === "object"
      ? Object.values(input)
      : String(input).split(",");

  return sourceArray
    .map((value) => normalizePermissionKey(value))
    .filter((permission) => Boolean(permission));
}

function collectAssignmentRoles(assignments) {
  if (!Array.isArray(assignments)) return [];

  return assignments
    .map((assignment) => assignment?.roleName || assignment?.role?.name || assignment?.roleId || null)
    .filter(Boolean);
}

function normalizeRoleCatalog(roleCatalog) {
  if (!Array.isArray(roleCatalog)) return new Map();

  const map = new Map();
  roleCatalog.forEach((role) => {
    if (!role) return;
    if (role.id !== undefined && role.id !== null) {
      map.set(String(role.id), role);
    }
    const slug = normalizeRoleSlug(role.name);
    if (slug) {
      map.set(slug, role);
    }
  });
  return map;
}

function collectRolePermissions(roleAssignments, roleCatalog) {
  const catalog = normalizeRoleCatalog(roleCatalog);
  const permissions = new Set();
  if (!Array.isArray(roleAssignments)) return permissions;

  roleAssignments.forEach((assignment) => {
    const roleKey = normalizeRoleSlug(
      assignment?.roleName || assignment?.role?.name || assignment?.roleId || null,
    );
    const roleIdKey =
      assignment?.roleId !== null && assignment?.roleId !== undefined
        ? String(assignment.roleId)
        : null;
    const role = (roleIdKey && catalog.get(roleIdKey)) || (roleKey && catalog.get(roleKey)) || null;
    if (!role) return;
    const rolePermissions = Array.isArray(role.permissions) ? role.permissions : [];
    rolePermissions.forEach((permission) => {
      const key = normalizePermissionKey(permission);
      if (key) permissions.add(key);
    });
  });

  return permissions;
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

export function getUserPermissionKeys(user, roleAssignments, roleCatalog, directPermissions) {
  const collected = new Set();

  const direct = normalisePermissionList(directPermissions);
  direct.forEach((permission) => collected.add(permission));

  collectRolePermissions(roleAssignments, roleCatalog).forEach((permission) =>
    collected.add(permission),
  );

  const shouldFallbackToMetadata = roleAssignments === undefined && user;
  if (shouldFallbackToMetadata) {
    const appMeta = user.app_metadata || {};
    const userMeta = user.user_metadata || {};
    [appMeta.permissions, userMeta.permissions].forEach((source) => {
      normalisePermissionList(source).forEach((permission) => collected.add(permission));
    });
  }

  return Array.from(collected);
}

export function userHasAnyPermission(
  user,
  allowedPermissions,
  roleAssignments,
  roleCatalog,
  directPermissions,
) {
  const normalizedAllowed = new Set(normalisePermissionList(allowedPermissions));
  if (normalizedAllowed.size === 0) {
    return false;
  }

  const userPermissions = getUserPermissionKeys(
    user,
    roleAssignments,
    roleCatalog,
    directPermissions,
  );
  return userPermissions.some((permission) => normalizedAllowed.has(permission));
}

export {
  ROLE_NAME_BY_ID,
  ADMIN_TOOL_ACCESS_ROLES,
  SCOREKEEPER_ACCESS_ROLES,
  CAPTAIN_ACCESS_ROLES,
  TOURNAMENT_DIRECTOR_ACCESS_ROLES,
  SYS_ADMIN_ACCESS_ROLES,
  ADMIN_ACCESS_ACCESS_ROLES,
  EVENT_SETUP_ACCESS_ROLES,
  SPIRIT_SCORES_ACCESS_ROLES,
  ADMIN_OVERRIDE_PERMISSIONS,
  ADMIN_ACCESS_PERMISSIONS,
  EVENT_ACCESS_PERMISSIONS,
  SIGNUP_MANAGEMENT_ACCESS_PERMISSIONS,
  SPIRIT_SCORES_ACCESS_PERMISSIONS,
  SCOREKEEPER_ACCESS_PERMISSIONS,
  CAPTAIN_ACCESS_PERMISSIONS,
  EVENT_SETUP_ACCESS_PERMISSIONS,
  TOURNAMENT_DIRECTOR_ACCESS_PERMISSIONS,
  SYS_ADMIN_ACCESS_PERMISSIONS,
  MEDIA_ACCESS_PERMISSIONS,
};
