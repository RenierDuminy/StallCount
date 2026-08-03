export const TOURNAMENT_DIRECTOR_SELECTED_EVENT_KEY =
  "stallcount:tournament-director:selected-event:v1";

// Schedule filters are stored per event: the excluded values are event-specific
// (venues, teams, divisions), so restoring one event's exclusions onto another
// would silently hide rows the user never chose to hide.
export const TOURNAMENT_DIRECTOR_SCHEDULE_FILTERS_KEY_PREFIX =
  "stallcount:tournament-director:schedule-filters:v1";

export function getScheduleFiltersStorageKey(eventId) {
  return `${TOURNAMENT_DIRECTOR_SCHEDULE_FILTERS_KEY_PREFIX}:${eventId || "none"}`;
}
