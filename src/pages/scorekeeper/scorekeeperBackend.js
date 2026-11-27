// Where the scorekeeper console reads and writes. The console's data and
// action hooks never call a service directly: they go through one of these
// objects, so the same console can run against the database (the real
// console) or against this device only (the scrimmage console,
// `src/pages/scrimmage/scrimmageBackend.js`). Both must offer every member
// listed here, with the same argument and return shapes as the services.
import { supabase } from "../../services/supabaseClient";
import { getEventsList } from "../../services/leagueService";
import {
  getMatchById,
  getMatchesByEvent,
  initialiseMatch,
  updateMatchStatus,
} from "../../services/matchService";
import { getPlayersByTeam } from "../../services/playerService";
import { getRoleCatalog } from "../../services/userService";
import {
  createMatchLogEntry,
  deleteMatchLogEntry,
  findMatchLogByOptimisticId,
  getMatchEventDefinitions,
  getMatchLogs,
  updateMatchLogEntry,
  updateMatchLogEntryByOptimisticId,
  updateMatchLogEntryByTimestamp,
} from "../../services/matchLogService";
import { hydrateVenueLookup } from "../../services/venueService";
import { updateScore } from "../../services/realtimeService";
import {
  enqueueMatchLogEntry,
  listOfflineQueue,
  markOfflineQueueFailure,
  processOfflineQueue,
  removeOfflineQueueItem,
  upsertScoreUpdate,
} from "../../services/offlineQueue";
import { getAccessibleScorekeeperEventIds } from "../../utils/accessControl";

export const SUPABASE_SCOREKEEPER_BACKEND = {
  // False: writes can fail for want of a connection, so they go through the
  // offline queue. A local backend sets this true and is never queued.
  local: false,
  // Session namespace override (null: the format's own) and the user id used
  // when nobody is signed in (null: no session is saved).
  sessionRuleset: null,
  guestUserId: null,

  async loadAbbaLines() {
    const { data, error } = await supabase.from("abba_line").select("line");
    if (error) throw error;
    return (data || []).map((row) => row.line);
  },

  /** Live events this user may score, or [] when roles are not loaded yet. */
  async listEvents(roles) {
    if (!Array.isArray(roles)) return [];
    const [data, roleCatalog] = await Promise.all([
      getEventsList(12, { status: "live" }),
      getRoleCatalog(),
    ]);
    const accessibleEventIds = getAccessibleScorekeeperEventIds(roles, roleCatalog);
    return accessibleEventIds === null
      ? data
      : data.filter((event) => accessibleEventIds.has(event.id));
  },

  getMatchesByEvent,
  getMatchById,
  getPlayersByTeam,
  hydrateVenueLookup,
  initialiseMatch,
  updateMatchStatus,
  updateScore,

  getMatchEventDefinitions,
  getMatchLogs,
  createMatchLogEntry,
  updateMatchLogEntry,
  updateMatchLogEntryByOptimisticId,
  updateMatchLogEntryByTimestamp,
  deleteMatchLogEntry,
  findMatchLogByOptimisticId,

  enqueueMatchLogEntry,
  listOfflineQueue,
  markOfflineQueueFailure,
  processOfflineQueue,
  removeOfflineQueueItem,
  upsertScoreUpdate,
};
