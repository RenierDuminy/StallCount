import { Link } from "react-router-dom";
import { getMatchMediaDetails } from "../../utils/matchMedia";
import { HomeScoreboard } from "./HomeScoreboard";
import {
  buildMatchLink,
  describeLiveStatus,
  formatKickoff,
  formatMatchup,
  isMatchLive,
  isMatchPostponed,
  teamName,
} from "./homeFormat";

/**
 * The hero card: the match that is live now, or the next one to start.
 * The top of the card is one link to the match; actions sit outside it so
 * no interactive element is nested inside another.
 */
export function HomeFeaturedMatch({ match, liveEvent, isLoggedIn, onShare }) {
  if (!match) return null;

  const live = isMatchLive(match.status);
  const postponed = isMatchPostponed(match.status);
  const media = getMatchMediaDetails(match);
  const venue = match.venue?.name || null;
  const alertsHref = isLoggedIn ? `/notifications?targetType=match&targetId=${match.id}` : "/login";

  return (
    <article className={`home-feature${live ? " is-live" : ""}`}>
      <Link to={buildMatchLink(match.id)} className="home-feature__link" aria-label={`${formatMatchup(match)} – match details`}>
        <div className="home-feature__top">
          {live ? (
            <span className="home-tag is-live">
              <span className="home-live-dot" aria-hidden="true" />
              {describeLiveStatus(match, liveEvent)}
            </span>
          ) : postponed ? (
            <span className="home-tag">Postponed</span>
          ) : (
            <span className="home-feature__when">{formatKickoff(match.start_time)}</span>
          )}
          {match.event?.name ? <span className="home-feature__event">{match.event.name}</span> : null}
        </div>
        {live ? (
          <HomeScoreboard match={match} size="lg" />
        ) : (
          <p className="home-feature__matchup">
            {teamName(match.team_a, "Team A")} <span className="home-vs">vs</span> {teamName(match.team_b, "Team B")}
          </p>
        )}
        <div className="home-feature__bottom">
          <span className="home-feature__meta">{venue}</span>
          <span className="home-feature__cta">
            {live ? "Follow live" : "Match details"}
            <span aria-hidden="true"> →</span>
          </span>
        </div>
      </Link>
      <div className="home-feature__actions">
        {media ? (
          <a href={media.url} target="_blank" rel="noopener noreferrer" className="sc-button is-ghost home-action">
            Watch on {media.providerLabel || "stream"}
          </a>
        ) : null}
        <Link to={alertsHref} className="sc-button is-ghost home-action">
          {isLoggedIn ? "Get alerts" : "Log in for alerts"}
        </Link>
        <button type="button" onClick={() => onShare(match)} className="sc-button is-ghost home-action">
          Share
        </button>
      </div>
    </article>
  );
}
