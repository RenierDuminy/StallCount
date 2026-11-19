// The one place the app builds a link to a match, team or player page. Pages
// call these instead of typing the address, so a change to the URL scheme is
// made here once and every link follows. Event links live with the event
// workspaces: getEventPagePath() / getEventSectionPath() in
// src/pages/eventWorkspaces.js.
//
// Scheme (collection + id): /matches/<id>, /teams/<id>, /players/<id>.
// A filter stays a query parameter: /players/<id>?eventId=<event>, and the
// same for /teams/<id>?eventId=<event>.

const pathWithId = (base, id) => {
  const value = `${id ?? ""}`.trim();
  return value ? `${base}/${encodeURIComponent(value)}` : base;
};

export const MATCHES_PATH = "/matches";
export const TEAMS_PATH = "/teams";
export const PLAYERS_PATH = "/players";

/**
 * A match page. The old `/matches?matchId=<id>` form still works: MatchesPage
 * redirects it, for links already shared and push notifications already
 * delivered.
 */
export function matchPath(matchId) {
  return pathWithId(MATCHES_PATH, matchId);
}

/**
 * A team page, optionally opened on one event (`?eventId=`). Links from an
 * event's pages pass the event, so the team page shows that event; without it
 * the team page picks the team's most recent event.
 */
export function teamPath(teamId, { eventId = null } = {}) {
  const path = pathWithId(TEAMS_PATH, teamId);
  return eventId && path !== TEAMS_PATH ? `${path}?eventId=${encodeURIComponent(eventId)}` : path;
}

/** A player page, optionally filtered to one event (`?eventId=`). */
export function playerPath(playerId, { eventId = null } = {}) {
  const path = pathWithId(PLAYERS_PATH, playerId);
  return eventId && path !== PLAYERS_PATH ? `${path}?eventId=${encodeURIComponent(eventId)}` : path;
}
