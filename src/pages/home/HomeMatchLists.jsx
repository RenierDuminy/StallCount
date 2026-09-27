import { Link } from "react-router-dom";
import { StandardEventMatchCard } from "../../components/StandardEventMatchCard";
import { Panel } from "../../components/ui/primitives";
import {
  buildMatchLink,
  formatClockTime,
  formatLiveScore,
  formatMatchStatus,
  formatMatchup,
  formatScore,
  groupMatchesByDay,
  isMatchFinal,
  isMatchLive,
  isMatchPostponed,
  teamName,
} from "./homeFormat";

/** Kick-off time, or a status label when the time is no longer the point. */
function MatchTimeCell({ match }) {
  if (isMatchLive(match.status)) {
    return (
      <span className="home-tag is-live is-compact">
        <span className="home-live-dot" aria-hidden="true" />
        Live
      </span>
    );
  }
  if (isMatchPostponed(match.status)) return <span className="home-tag is-compact">Postponed</span>;
  if (isMatchFinal(match.status)) return <span className="home-tag is-compact">Final</span>;
  return formatClockTime(match.start_time);
}

function hasScore(match) {
  return isMatchLive(match.status) || isMatchFinal(match.status);
}

function MatchupTitle({ match }) {
  return (
    <>
      {teamName(match.team_a, "Team A")} <span className="home-vs">vs</span> {teamName(match.team_b, "Team B")}
    </>
  );
}

/**
 * "Coming up": day headings, each followed by one card per fixture. The cards
 * are built from the same pieces as the shared MatchCard — its panel, its
 * uppercase event eyebrow, semibold title and venue line — with the kick-off
 * time added as a left column.
 */
export function HomeAgendaList({ matches }) {
  const groups = groupMatchesByDay(matches);
  return (
    <div className="home-card-list">
      {groups.map((group) => (
        <div key={group.key}>
          <h3 className="home-card-list__heading">{group.label}</h3>
          <ul className="home-card-list__items">
            {group.matches.map((match) => (
              <li key={match.id}>
                <Panel
                  as={Link}
                  to={buildMatchLink(match.id)}
                  variant="tinted"
                  className={`home-list-card${isMatchLive(match.status) ? " is-live" : ""}`}
                >
                  <span className="home-match-row__time">
                    <MatchTimeCell match={match} />
                  </span>
                  <span className="home-row__body">
                    {match.event?.name ? (
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        {match.event.name}
                      </span>
                    ) : null}
                    <span className="home-list-card__title font-semibold text-ink">
                      <MatchupTitle match={match} />
                    </span>
                    {match.venue?.name ? (
                      <span className="text-xs font-semibold text-ink-muted">{match.venue.name}</span>
                    ) : null}
                  </span>
                  {hasScore(match) ? (
                    <span className="home-row__score">
                      {formatScore(match.score_a)}–{formatScore(match.score_b)}
                    </span>
                  ) : null}
                </Panel>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Results and Watch use the app's shared match card (the one these sections
// used before the redesign), so they look the same here as on /matches.
export function HomeResultList({ matches }) {
  return (
    <div className="home-match-cards">
      {matches.map((match) => (
        <StandardEventMatchCard
          key={match.id}
          match={match}
          eyebrow={match.event?.name || "Match"}
          title={formatMatchup(match)}
          meta={null}
          score={formatLiveScore(match)}
          status={formatMatchStatus(match.status) || "Final"}
          hideEyebrow={false}
          compact={false}
          scoreAlign="right"
          hideVenue
        />
      ))}
    </div>
  );
}

export function HomeWatchList({ matches }) {
  return (
    <div className="home-match-cards">
      {matches.map((match) => (
        <StandardEventMatchCard
          key={match.id}
          match={match}
          eyebrow={match.event?.name || "Stream"}
          title={formatMatchup(match)}
          meta={null}
          score={isMatchLive(match.status) || isMatchFinal(match.status) ? formatLiveScore(match) : null}
          status={formatMatchStatus(match.status) || "Scheduled"}
          hideEyebrow={false}
          compact
          hideFinishedVenue={false}
          hideVenue
        />
      ))}
    </div>
  );
}
