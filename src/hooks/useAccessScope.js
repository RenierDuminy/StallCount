import { useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  allowedTeamIdsForEvent,
  filterByScope,
  resolveAccessScope,
  scopeIsEmpty,
} from "../utils/roleScope";

/**
 * Which events and teams the current user may act on, for a given permission set.
 *
 * This is the single entry point admin pages should use instead of hand-rolling
 * an `accessibleEvents` memo. All the actual scope logic lives in
 * `src/utils/roleScope.js`; this hook only wires it to AuthContext.
 *
 * Access is deliberately *per permission set*, not absolute: Spirit Scores is
 * open to captains and scorekeepers while Tournament Director is not, so the
 * same user must get different lists on those pages. Pass the page's permission
 * constant from `src/utils/accessControl.js`.
 *
 * `permissions` must be a stable reference (a module-level constant) or the
 * memo below will recompute on every render.
 *
 * @param {string[]} permissions Permission keys the page requires.
 * @returns {{
 *   scope: ReturnType<typeof resolveAccessScope>,
 *   ready: boolean,        // roles AND catalog resolved; false means "still loading", not "denied"
 *   isEmpty: boolean,      // resolved, and the user may act on nothing
 *   unrestricted: boolean, // global override — sees everything
 *   filterEvents: (events: any[]) => any[],
 *   teamsForEvent: (eventId: string) => Set<string>|null, // null = all teams
 * }}
 */
export default function useAccessScope(permissions) {
  const { session, roles, rolesLoading, roleCatalog, roleCatalogLoading } = useAuth();
  const user = session?.user ?? null;

  const scope = useMemo(
    () =>
      resolveAccessScope({
        user,
        roleAssignments: roles,
        roleCatalog,
        permissions,
      }),
    [user, roles, roleCatalog, permissions],
  );

  // The catalog is required to resolve permissions, so a page is only safe to
  // render its filtered list once BOTH roles and catalog have landed. Without
  // this, an in-flight load is indistinguishable from "no access" and pages
  // flash "No accessible events".
  const ready =
    !scope.loading && !rolesLoading && !roleCatalogLoading && roleCatalog !== null;

  const filterEvents = useCallback(
    (events) => filterByScope(events, scope.eventIds),
    [scope],
  );

  const teamsForEvent = useCallback(
    (eventId) => allowedTeamIdsForEvent(scope, eventId),
    [scope],
  );

  return {
    scope,
    ready,
    isEmpty: ready && scopeIsEmpty(scope),
    unrestricted: scope.unrestricted,
    filterEvents,
    teamsForEvent,
  };
}
