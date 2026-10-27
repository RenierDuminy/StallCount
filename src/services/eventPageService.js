import { getCachedQuery } from "../utils/queryCache";
import { getMatchesByEvent } from "./matchService";
import { getEventHierarchy, getEventLifecycle } from "./leagueService";
import { getBracketsByEvent } from "./playoffStructureService";

export const EVENT_PAGE_MATCH_LIMIT = 200;
// How many events /event/:slug loads to resolve a slug; enough to cover every
// event.
export const EVENT_LIST_LIMIT = 200;
export const EVENT_PAGE_CACHE_TTL_MS = 30 * 1000;

// Starts with `matches:event:<id>` on purpose: every match write already
// invalidates that prefix, so an edit refreshes an open event page too.
export function getEventPageDataKey(eventId) {
  return `matches:event:${eventId}:page`;
}

/**
 * Everything the event page (EventWorkspaceTemplate) shows, as one cached read:
 * matches, the division/pool hierarchy, brackets and lifecycle status.
 *
 * One entry instead of four means a revisit draws immediately and refreshes
 * itself through useCachedQuery.
 */
export function getEventPageData(eventId, options = {}) {
  return getCachedQuery(
    getEventPageDataKey(eventId),
    async () => {
      const [matches, hierarchy, brackets, lifecycle] = await Promise.all([
        // This entry has its own TTL, so the read underneath must not hand back
        // its own older cached rows.
        getMatchesByEvent(eventId, EVENT_PAGE_MATCH_LIMIT, { includeFinished: true, forceRefresh: true }),
        getEventHierarchy(eventId),
        // The bracket is supplementary: if it fails to load, the rest of the
        // page should still render, so swallow the error.
        getBracketsByEvent(eventId).catch(() => []),
        // Null on failure, which reads as "not completed" and keeps the
        // division standings.
        getEventLifecycle(eventId),
      ]);
      return {
        matches: matches || [],
        hierarchy: hierarchy || null,
        brackets: brackets || [],
        status: lifecycle?.status || null,
      };
    },
    { ttlMs: EVENT_PAGE_CACHE_TTL_MS, forceRefresh: Boolean(options.forceRefresh) },
  );
}
