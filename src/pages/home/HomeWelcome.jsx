import { Link } from "react-router-dom";
import { formatCount } from "./homeFormat";

/**
 * First-visit orientation for logged-out visitors: what StallCount is and the
 * two things most people came to do. Dismissal is remembered per device by the
 * caller.
 */
export function HomeWelcome({ stats, statsLoaded, onDismiss, onFindEvent }) {
  const statParts = statsLoaded
    ? [
        [stats.teams, "teams"],
        [stats.players, "players"],
        [stats.events, "events"],
      ].filter(([value]) => value > 0)
    : [];

  return (
    <section className="home-welcome" aria-labelledby="home-title">
      <button type="button" className="home-welcome__dismiss" onClick={onDismiss}>
        Got it
        <span className="sr-only">, hide this introduction</span>
      </button>
      <h1 id="home-title" className="home-welcome__title">
        Live scores, fixtures and results for ultimate frisbee
      </h1>
      <p className="home-welcome__lead">
        Follow leagues and tournaments, check results, and get score alerts for your team.
      </p>
      <div className="home-welcome__actions">
        <a href="#home-events" className="sc-button" onClick={onFindEvent}>
          Find an event
        </a>
        <Link to="/login" className="sc-button is-ghost">
          Log in to follow a team
        </Link>
      </div>
      {statParts.length > 0 ? (
        <p className="home-welcome__stats">
          {statParts.map(([value, label]) => `${formatCount(value)} ${label}`).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
