import { normaliseRoleList, userHasAnyPermission } from "./accessControl";

/**
 * Scope resolution for role assignments.
 *
 * Assignments come from `getUserAccessRoleAssignments` and carry one of three
 * scopes: "global" (user_roles), "event" (event_user_roles), or "team"
 * (team_user_roles). The helpers here answer "which events / teams may this
 * user act on", generalising the per-event pattern that SpiritScoresPage and
 * MediaAdminPage previously hand-rolled.
 *
 * Throughout, `null` means UNRESTRICTED (the established sentinel), an empty
 * Set means "nothing allowed", and a populated Set is an explicit allow-list.
 */

// Roles that bypass team/event scoping entirely — but only when granted
// globally. `scorekeeper` is deliberately absent: scorekeepers are scoped like
// everyone else.
export const SCOPE_OVERRIDE_ROLES = [
  "admin",
  "administrator",
  "sys_admin",
  "tournament_director",
  "field_assistant",
];

export const SCOPE_OVERRIDE_PERMISSIONS = ["admin_override"];

// `roles.scope` is "event" for every non-admin role in the database today, so
// team-scoped roles are identified by slug. The scope column is still checked
// first so this keeps working if the data is migrated later.
export const TEAM_SCOPED_ROLE_SLUGS = ["captain", "team_manager"];

function roleSlugsOf(source) {
  return normaliseRoleList(
    source?.roleName || source?.role?.name || source?.name || "",
  );
}

/** Which table an assignment came from, inferred from the ids it carries. */
export function assignmentScopeOf(assignment) {
  if (assignment?.teamId) return "team";
  if (assignment?.eventId || assignment?.scope === "event") return "event";
  return "global";
}

/** True when a role catalog entry grants team-scoped access. */
export function isTeamScopedRole(role) {
  if (!role) return false;
  const scope = String(role.scope || "").trim().toLowerCase();
  if (scope === "team") return true;
  return roleSlugsOf(role).some((slug) => TEAM_SCOPED_ROLE_SLUGS.includes(slug));
}

/**
 * True when the user holds an override role/permission GLOBALLY.
 *
 * The global check matters: a tournament_director scoped to one event must not
 * gain access to every other event.
 */
export function hasScopeOverride(user, roleAssignments, roleCatalog) {
  if (!Array.isArray(roleAssignments)) return false;

  return roleAssignments.some((assignment) => {
    if (assignmentScopeOf(assignment) !== "global") return false;
    if (roleSlugsOf(assignment).some((slug) => SCOPE_OVERRIDE_ROLES.includes(slug))) {
      return true;
    }
    return userHasAnyPermission(
      user,
      SCOPE_OVERRIDE_PERMISSIONS,
      [assignment],
      roleCatalog,
    );
  });
}

/**
 * Resolve the events and teams a user may act on for a given permission set.
 *
 * @returns {{
 *   eventIds: Set<string>|null,      // null = every event
 *   teamIds: Set<string>|null,       // null = every team
 *   globalTeamIds: Set<string>,      // team grants with no event_id
 *   teamsByEvent: Map<string, Set<string>|null>, // null bucket = all teams in that event
 *   unrestricted: boolean,
 *   loading: boolean,
 * }}
 */
export function resolveAccessScope({ user, roleAssignments, roleCatalog, permissions } = {}) {
  const empty = {
    eventIds: new Set(),
    teamIds: new Set(),
    globalTeamIds: new Set(),
    teamsByEvent: new Map(),
    unrestricted: false,
    loading: false,
  };

  // `roles === null` is AuthContext's loading sentinel — never a denial.
  if (!Array.isArray(roleAssignments)) {
    return { ...empty, loading: true };
  }

  const unrestricted = {
    eventIds: null,
    teamIds: null,
    globalTeamIds: new Set(),
    teamsByEvent: new Map(),
    unrestricted: true,
    loading: false,
  };

  if (hasScopeOverride(user, roleAssignments, roleCatalog)) {
    return unrestricted;
  }

  const grants = roleAssignments.filter((assignment) =>
    userHasAnyPermission(user, permissions, [assignment], roleCatalog),
  );

  // A global grant carrying the permission is unrestricted for this permission set.
  if (grants.some((assignment) => assignmentScopeOf(assignment) === "global")) {
    return unrestricted;
  }

  const eventIds = new Set();
  const teamIds = new Set();
  const globalTeamIds = new Set();
  const teamsByEvent = new Map();

  grants.forEach((assignment) => {
    const scope = assignmentScopeOf(assignment);
    const eventId = assignment?.eventId ? String(assignment.eventId) : null;
    const teamId = assignment?.teamId ? String(assignment.teamId) : null;

    if (scope === "event" && eventId) {
      eventIds.add(eventId);
      // An event grant covers every team in that event.
      teamsByEvent.set(eventId, null);
      return;
    }

    if (scope === "team" && teamId) {
      teamIds.add(teamId);

      if (!eventId) {
        // No event on the grant: it applies to this team in every event.
        globalTeamIds.add(teamId);
        return;
      }

      // A team grant with an event also grants access to the parent event.
      eventIds.add(eventId);
      const bucket = teamsByEvent.get(eventId);
      if (bucket === null) return; // already unrestricted for this event
      const next = bucket ?? new Set();
      next.add(teamId);
      teamsByEvent.set(eventId, next);
    }
  });

  return { eventIds, teamIds, globalTeamIds, teamsByEvent, unrestricted: false, loading: false };
}

/**
 * Teams the user may act on within a specific event. `null` = all teams.
 *
 * Only `globalTeamIds` (grants with no event) are merged into an event's
 * bucket. Merging the flat `teamIds` would leak a team granted at one event
 * into every other event.
 */
export function allowedTeamIdsForEvent(scope, eventId) {
  if (!scope || scope.unrestricted) return null;

  const key = eventId ? String(eventId) : null;
  if (!key) return new Set();

  const bucket = scope.teamsByEvent.get(key);
  if (bucket === null) return null;

  const merged = new Set(bucket ?? []);
  scope.globalTeamIds.forEach((teamId) => merged.add(teamId));
  return merged;
}

/** Filter a list against an allow-set, where `null` means unrestricted. */
export function filterByScope(items, allowedIds, idKey = "id") {
  const list = Array.isArray(items) ? items : [];
  if (allowedIds === null) return list;
  return list.filter((item) => allowedIds.has(String(item?.[idKey])));
}

/** True when the user has no event and no team access at all. */
export function scopeIsEmpty(scope) {
  if (!scope || scope.loading || scope.unrestricted) return false;
  if (scope.eventIds === null || scope.teamIds === null) return false;
  return scope.eventIds.size === 0 && scope.teamIds.size === 0;
}

/**
 * Events a user may act on. Shared by LinkedUsersPanel and
 * TournamentDirectorPage, which previously duplicated this logic verbatim.
 */
export function selectAccessibleEvents(
  eventsList,
  { user, roleAssignments, roleCatalog, permissions } = {},
) {
  const list = Array.isArray(eventsList) ? eventsList : [];
  if (list.length === 0) return [];
  if (!Array.isArray(roleAssignments)) return [];

  const scope = resolveAccessScope({ user, roleAssignments, roleCatalog, permissions });
  return filterByScope(list, scope.eventIds);
}
