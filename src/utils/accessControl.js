/**
 * Role id -> slug, mirroring `public.roles`.
 *
 * These are the ids the database actually issues (11-18). The previous table
 * mapped 1-4 to display names that no longer exist in `roles` at all, so every
 * lookup through it either missed or produced a slug nothing matched — most
 * dangerously id 2 -> "Score keeper", which `normaliseRoleList` turns into
 * `score_keeper`, not the real `scorekeeper`.
 *
 * Values are the canonical slugs stored in `roles.name`, so they need no
 * further normalisation. This table is only a fallback for user metadata
 * (`role_id` / `role_ids`); the authoritative source is the role assignments
 * and the role catalog fetched from the database.
 */
const ROLE_NAME_BY_ID = {
  11: "admin",
  12: "field_assistant",
  13: "captain",
  14: "user",
  15: "media",
  16: "tournament_director",
  17: "scorekeeper",
  18: "team_manager",
};

/**
 * Every role slug in `public.roles`, and every permission key in
 * `public.permissions`. Exported so a typo in an access list can be caught
 * rather than silently matching nothing.
 */
const ALL_ROLE_SLUGS = Object.freeze([
  "admin",
  "field_assistant",
  "captain",
  "user",
  "media",
  "tournament_director",
  "scorekeeper",
  "team_manager",
]);

const ALL_PERMISSION_KEYS = Object.freeze([
  "event_insert",
  "event_update",
  "event_delete",
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
  "role_edit",
  "match_insert",
  "match_update",
  "match_delete",
  "admin_override",
]);

/**
 * What each role grants, mirroring `public.role_permissions`.
 *
 * This is documentation and a dev-time cross-check, NOT an authority: the
 * catalog fetched from the database is what every runtime check reads, so a
 * grant changed in Supabase takes effect without touching this file. It exists
 * so the access lists below can be reasoned about, and so a drift between the
 * two is noticed in development rather than on a field.
 *
 * Note `admin` holds `admin_override` and nothing else — it is deliberately not
 * granted the individual permissions, because `admin_override` short-circuits
 * every check (see ProtectedRoute).
 */
const ROLE_PERMISSIONS_SNAPSHOT = Object.freeze({
  admin: Object.freeze(["admin_override"]),
  field_assistant: Object.freeze([
    "roster_insert",
    "roster_update",
    "roster_delete",
    "player_update",
    "media_edit",
    "match_insert",
    "match_update",
    "match_delete",
  ]),
  captain: Object.freeze([
    "team_update",
    "roster_insert",
    "roster_update",
    "roster_delete",
    "player_insert",
    "player_update",
  ]),
  user: Object.freeze([]),
  media: Object.freeze(["media_edit"]),
  tournament_director: Object.freeze([
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
    "role_edit",
    "match_insert",
    "match_update",
    "match_delete",
  ]),
  scorekeeper: Object.freeze(["match_insert", "match_update", "match_delete"]),
  team_manager: Object.freeze([
    "team_update",
    "roster_insert",
    "roster_update",
    "roster_delete",
    "player_insert",
    "player_update",
  ]),
});

// Every non-viewer role. The admin hub is a launcher: it shows each user the
// tools their own grants unlock, so the list is "has any elevated role", not a
// curated subset. It previously omitted scorekeeper, field_assistant and
// team_manager, all of which hold real permissions in `role_permissions` —
// note the hub route itself gates on `requireNonViewer`, so those roles could
// already reach it and this constant disagreed with the route.
const ADMIN_TOOL_ACCESS_ROLES = [
  "admin",
  "tournament_director",
  "field_assistant",
  "scorekeeper",
  "captain",
  "team_manager",
  "media",
];
// Roles that may run the scorekeeper console.
//
// `captain` and `team_manager` are deliberately absent. Their grants live in
// `team_user_roles`, which `has_event_permission` does not read, so every match
// write they attempted was refused by RLS after the console had already let
// them in — the operator reached match setup and failed there. The team/event
// split is intentional and stays, so these roles are simply not console roles:
// running matches is event authority, managing a roster is team authority.
const SCOREKEEPER_ACCESS_ROLES = [
  "scorekeeper",
  "field_assistant",
  "tournament_director",
];
// Cosmetic: this drives the captain-tools tile on UserPage, not the `/captain`
// route (which gates on CAPTAIN_ACCESS_PERMISSIONS alone). `team_manager` holds
// exactly the same roster and team permissions as `captain` in
// `role_permissions`, so it could already open the page — the tile just never
// offered the link. Same membership as TEAM_MANAGEMENT_ACCESS_ROLES below.
const CAPTAIN_ACCESS_ROLES = ["captain", "team_manager"];
// Roles that are granted per team via team_user_roles.
const TEAM_MANAGEMENT_ACCESS_ROLES = ["captain", "team_manager"];
const TOURNAMENT_DIRECTOR_ACCESS_ROLES = ["tournament_director"];
const SYS_ADMIN_ACCESS_ROLES = ["admin"];
const ADMIN_ACCESS_ACCESS_ROLES = ["admin"];
const EVENT_SETUP_ACCESS_ROLES = ["tournament_director"];
// Load-bearing: `/spirit-scores` gates on this list, not on
// SPIRIT_SCORES_ACCESS_PERMISSIONS. Spirit scoring is a captain's duty and
// captains hold no match permissions, so the old permission gate excluded
// exactly the intended audience while admitting any match-writing role. The
// page scopes its event dropdown by the same list.
const SPIRIT_SCORES_ACCESS_ROLES = [
  "captain",
  "team_manager",
  "scorekeeper",
  "field_assistant",
  "tournament_director",
];
// Match corrections repairs the point-by-point record after the fact. Field
// assistants are included because they are the people on the field who witness
// the mistake; `admin` reaches it through admin_override rather than this list.
const MATCH_CORRECTIONS_ACCESS_ROLES = [
  "tournament_director",
  "field_assistant",
  "admin",
];
// Correcting a log is a match write, so gate on match-write permissions rather
// than the broad TD bundle. This is also the permission set the panel passes to
// useAccessScope: a role-gated user still only sees events they are scoped to.
const MATCH_CORRECTIONS_ACCESS_PERMISSIONS = [
  "match_insert",
  "match_update",
  "admin_override",
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
// The console's core action is writing match_logs rows, which RLS gates on
// `match_insert` — not `match_update`. Gating on the OR of both let roles
// holding only `match_update` open the console, start the match and move
// matches.score_a/score_b, while every log insert was rejected: the published
// score advanced and the point-by-point record stayed empty. Require the
// permission the primary write actually needs.
const SCOREKEEPER_ACCESS_PERMISSIONS = ["match_insert", "admin_override"];
// Roster management: team, roster and player writes only.
//
// `match_update` was previously in this list and was the one entry that did not
// belong — nothing on CaptainPage touches a match (it calls upsertPlayer,
// addPlayerToRoster, removePlayerFromRoster and updateRosterCaptainRole, and
// nothing else). Because `/captain` gates on permissions alone, that single
// entry let every match-writing role in: a `scorekeeper`, whose grants are
// match_insert/match_update/match_delete and nothing else, could open the
// roster tool and add or remove players from any team in scope. The same list
// is passed to useAccessScope, so it also widened which events they saw there.
const CAPTAIN_ACCESS_PERMISSIONS = [
  "team_update",
  "roster_insert",
  "roster_update",
  "roster_delete",
  "player_insert",
  "player_update",
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

export function roleAssignmentsIncludeAdmin(roleAssignments) {
  if (!Array.isArray(roleAssignments)) {
    return false;
  }

  return roleAssignments.some((assignment) => {
    const roleId = assignment?.roleId ?? assignment?.role?.id ?? null;
    const roleNames = [
      assignment?.roleName,
      assignment?.role?.name,
      roleId !== null && roleId !== undefined ? ROLE_NAME_BY_ID[roleId] : null,
    ];
    const slugs = new Set(roleNames.flatMap((value) => normaliseRoleList(value)));
    return slugs.has("admin") || slugs.has("administrator") || slugs.has("sys_admin");
  });
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

/**
 * Dev-only sanity checks on the access lists above.
 *
 * Two classes of mistake are silent at runtime and expensive on a field:
 *   - a role slug or permission key that does not exist (typo, or renamed in
 *     the database) matches nothing, so the gate quietly denies everyone;
 *   - an access list that no role can satisfy is a page nobody can open.
 *
 * `admin_override` is excluded from the "unsatisfiable" check because
 * ProtectedRoute short-circuits on it before any list is consulted.
 */
function auditAccessLists() {
  const roleSet = new Set(ALL_ROLE_SLUGS);
  const permissionSet = new Set(ALL_PERMISSION_KEYS);
  const problems = [];

  const roleLists = {
    ADMIN_TOOL_ACCESS_ROLES,
    SCOREKEEPER_ACCESS_ROLES,
    CAPTAIN_ACCESS_ROLES,
    TEAM_MANAGEMENT_ACCESS_ROLES,
    TOURNAMENT_DIRECTOR_ACCESS_ROLES,
    SYS_ADMIN_ACCESS_ROLES,
    ADMIN_ACCESS_ACCESS_ROLES,
    EVENT_SETUP_ACCESS_ROLES,
    SPIRIT_SCORES_ACCESS_ROLES,
    MATCH_CORRECTIONS_ACCESS_ROLES,
  };
  const permissionLists = {
    MATCH_CORRECTIONS_ACCESS_PERMISSIONS,
    ADMIN_OVERRIDE_PERMISSIONS,
    MEDIA_ACCESS_PERMISSIONS,
    ADMIN_ACCESS_PERMISSIONS,
    EVENT_ACCESS_PERMISSIONS,
    SIGNUP_MANAGEMENT_ACCESS_PERMISSIONS,
    SPIRIT_SCORES_ACCESS_PERMISSIONS,
    SCOREKEEPER_ACCESS_PERMISSIONS,
    CAPTAIN_ACCESS_PERMISSIONS,
    EVENT_SETUP_ACCESS_PERMISSIONS,
    TOURNAMENT_DIRECTOR_ACCESS_PERMISSIONS,
    SYS_ADMIN_ACCESS_PERMISSIONS,
  };

  Object.entries(roleLists).forEach(([name, list]) => {
    list.forEach((slug) => {
      if (!roleSet.has(slug)) problems.push(`${name}: unknown role "${slug}"`);
    });
  });

  // Lists that are admin-only by design, so "no other role satisfies it" is the
  // intent rather than a mistake.
  const ADMIN_ONLY_LISTS = new Set([
    "ADMIN_OVERRIDE_PERMISSIONS",
    "SYS_ADMIN_ACCESS_PERMISSIONS",
  ]);

  Object.entries(permissionLists).forEach(([name, list]) => {
    list.forEach((key) => {
      if (!permissionSet.has(key)) problems.push(`${name}: unknown permission "${key}"`);
    });
    if (ADMIN_ONLY_LISTS.has(name)) return;
    const satisfiable = Object.entries(ROLE_PERMISSIONS_SNAPSHOT).some(
      ([role, granted]) =>
        role !== "admin" && list.some((key) => key !== "admin_override" && granted.includes(key)),
    );
    if (!satisfiable) {
      problems.push(`${name}: no role other than admin can satisfy this list`);
    }
  });

  return problems;
}

if (import.meta.env?.DEV) {
  const problems = auditAccessLists();
  if (problems.length) {
    console.error(`[accessControl] ${problems.join("; ")}`);
  }
}

export {
  ROLE_NAME_BY_ID,
  ALL_ROLE_SLUGS,
  ALL_PERMISSION_KEYS,
  ROLE_PERMISSIONS_SNAPSHOT,
  auditAccessLists,
  ADMIN_TOOL_ACCESS_ROLES,
  SCOREKEEPER_ACCESS_ROLES,
  CAPTAIN_ACCESS_ROLES,
  TEAM_MANAGEMENT_ACCESS_ROLES,
  TOURNAMENT_DIRECTOR_ACCESS_ROLES,
  SYS_ADMIN_ACCESS_ROLES,
  ADMIN_ACCESS_ACCESS_ROLES,
  EVENT_SETUP_ACCESS_ROLES,
  SPIRIT_SCORES_ACCESS_ROLES,
  MATCH_CORRECTIONS_ACCESS_ROLES,
  MATCH_CORRECTIONS_ACCESS_PERMISSIONS,
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
