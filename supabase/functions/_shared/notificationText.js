// The wording of every push notification, in one place. Imported by the
// notification-dispatcher Edge Function (Deno) and by the local fallback
// scripts/sendLiveEventNotifications.js (Node), so the two can never drift.
// Plain JavaScript with no imports, so both runtimes can load it.
//
// Rules (decided 2026-11-13):
// - Short title saying what happened, a body that adds something (never a
//   repeat of the title). " | " separates the parts of a title.
// - Score only on match end: "Final: X 13 – 9 Y". Opponent only on match
//   start: "Match start | X vs Y". No event or division names (a team plays
//   in one event at a time).
// - No notification for the END of a timeout, halftime or stoppage
//   (SILENT_EVENT_CODES); the dispatcher marks those sent without delivering.
// - A player follow gets wording that leads with the player
//   (buildPlayerNotificationText).
//
// The input is a live_events row's `data` (written by the database function
// enqueue_live_event_from_log: team_name, player_name, secondary_player_name,
// match_name, ...) plus the match's current teams and score.

export const SILENT_EVENT_CODES = new Set(["timeout_end", "halftime_end", "stoppage_end"]);

const SEP = " | ";

const text = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * @param {string} eventCode   live_events.event_type
 * @param {object} data        live_events.data
 * @param {object} match       { teamAName, teamBName, scoreA, scoreB } (may be partial)
 * @returns {{ title: string, body: string }}
 */
export function buildNotificationText(eventCode, data = {}, match = {}) {
  const teamA = text(match.teamAName) || "Team A";
  const teamB = text(match.teamBName) || "Team B";
  const matchName = text(data.match_name) || `${teamA} vs ${teamB}`;
  const team = text(data.team_name);
  const player = text(data.player_name);
  const second = text(data.secondary_player_name);

  switch (eventCode) {
    case "match_start":
      return { title: `Match start${SEP}${teamA} vs ${teamB}`, body: "Follow it live on StallCount." };
    case "match_end": {
      const hasScore = Number.isFinite(match.scoreA) && Number.isFinite(match.scoreB);
      return {
        title: hasScore ? `Final: ${teamA} ${match.scoreA} – ${match.scoreB} ${teamB}` : `Final${SEP}${matchName}`,
        body: "Match finished.",
      };
    }
    case "score":
      return {
        title: team ? `${team} score` : "Goal",
        body: player ? (second ? `${player} from ${second}` : player) : matchName,
      };
    case "callahan":
      return { title: `Callahan!${team ? ` ${team}` : ""}`, body: player || matchName };
    case "turnover":
      return { title: `Turnover${team ? `${SEP}${team}` : ""}`, body: player ? `Thrown by ${player}` : matchName };
    case "block":
      return { title: `Block${team ? `${SEP}${team}` : ""}`, body: player || matchName };
    case "timeout_start":
      return { title: `Timeout${team ? `${SEP}${team}` : ""}`, body: matchName };
    case "halftime_start":
      return { title: "Halftime", body: matchName };
    case "stoppage_start":
      return { title: "Play stopped", body: matchName };
    default:
      return { title: matchName, body: "New update on StallCount." };
  }
}

/**
 * Wording for someone who follows a player named on the row. Returns null
 * when the event has no player-specific wording (the general text is used).
 *
 * @param {string} eventCode
 * @param {object} data
 * @param {string} followedPlayerId  the followed player's id
 */
export function buildPlayerNotificationText(eventCode, data = {}, followedPlayerId) {
  const team = text(data.team_name);
  const player = text(data.player_name);
  const second = text(data.secondary_player_name);
  const isActor = followedPlayerId && String(data.player_id ?? "") === String(followedPlayerId);
  const isSecond = followedPlayerId && String(data.secondary_player_id ?? "") === String(followedPlayerId);

  if (eventCode === "score") {
    if (isActor && player) {
      return { title: `${player} scores`, body: [second && `Assist: ${second}`, team].filter(Boolean).join(SEP) };
    }
    if (isSecond && second) {
      return { title: `${second} assists`, body: [player && `Goal: ${player}`, team].filter(Boolean).join(SEP) };
    }
  }
  if (!isActor || !player) return null;
  switch (eventCode) {
    case "callahan":
      return { title: `Callahan! ${player}`, body: team };
    case "turnover":
      return { title: `${player}: turnover`, body: team };
    case "block":
      return { title: `${player}: block`, body: team };
    default:
      return null;
  }
}
