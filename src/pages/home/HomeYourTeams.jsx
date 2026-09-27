import { Link } from "react-router-dom";
import { StandardEventMatchCard } from "../../components/StandardEventMatchCard";
import { Panel } from "../../components/ui/primitives";
import {
  formatFixture,
  formatKickoff,
  formatLiveScore,
  formatMatchStatus,
  formatMatchup,
  formatRecord,
  formatResult,
  isMatchFinal,
  isMatchLive,
} from "./homeFormat";

function Fact({ label, value }) {
  if (!value) return null;
  return (
    <span>
      {label} <strong>{value}</strong>
    </span>
  );
}

function PlayerCard({ player }) {
  const { totals } = player;
  const played = totals.matches > 0;
  return (
    <Panel as={Link} to={`/players/${player.playerId}`} variant="tinted" className="home-list-card home-team-card">
      <span className="home-list-card__title font-semibold text-ink">
        {player.name}
        {player.jerseyNumber !== null && player.jerseyNumber !== undefined ? (
          <span className="home-jersey"> #{player.jerseyNumber}</span>
        ) : null}
      </span>
      <span className="home-team-card__facts">
        <Fact label="Team" value={player.teamName} />
        {played ? (
          <>
            <Fact label="Goals" value={String(totals.goals)} />
            <Fact label="Assists" value={String(totals.assists)} />
            <Fact label="Games" value={String(totals.matches)} />
          </>
        ) : (
          <span>No games recorded yet</span>
        )}
      </span>
    </Panel>
  );
}

/**
 * The signed-in user's followed teams, players and matches, laid out as the
 * page did before the redesign: a Teams list with Record / Next / Last for
 * each team, players with their team and totals, then followed matches as
 * standard match cards. Following happens on the Notifications page, which
 * the section header links to.
 */
export function HomeYourTeams({ teams, players = [], matches, teamsLoading, playersLoading = false, matchesLoading }) {
  return (
    <div className="home-card-list">
      <div>
        <h3 className="home-card-list__heading">Teams</h3>
        {teamsLoading ? (
          <p className="home-card-list__empty">Loading teams…</p>
        ) : teams.length === 0 ? (
          <p className="home-card-list__empty">Follow a team to see records and fixtures here.</p>
        ) : (
          <ul className="home-card-list__items">
            {teams.map((team) => (
              <li key={team.teamId}>
                <Panel as={Link} to={`/teams/${team.teamId}`} variant="tinted" className="home-list-card home-team-card">
                  <span className="home-list-card__title font-semibold text-ink">{team.name}</span>
                  <span className="home-team-card__facts">
                    <Fact label="Record" value={formatRecord(team.record)} />
                    <Fact label="Next" value={formatFixture(team.nextFixture)} />
                    <Fact label="Last" value={formatResult(team.lastResult)} />
                  </span>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="home-card-list__heading">Players</h3>
        {playersLoading ? (
          <p className="home-card-list__empty">Loading players…</p>
        ) : players.length === 0 ? (
          <p className="home-card-list__empty">Follow a player to see their goals and assists here.</p>
        ) : (
          <ul className="home-card-list__items">
            {players.map((player) => (
              <li key={player.playerId}>
                <PlayerCard player={player} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="home-card-list__heading">Matches</h3>
        {matchesLoading ? (
          <p className="home-card-list__empty">Loading matches…</p>
        ) : matches.length === 0 ? (
          <p className="home-card-list__empty">Follow matches to keep them pinned here.</p>
        ) : (
          <div className="home-match-cards">
            {matches.map((match) => {
              const showScore = isMatchLive(match.status) || isMatchFinal(match.status);
              return (
                <StandardEventMatchCard
                  key={match.id}
                  match={match}
                  eyebrow={match.event?.name || "Match"}
                  title={formatMatchup(match)}
                  meta={showScore ? null : formatKickoff(match.start_time)}
                  score={showScore ? formatLiveScore(match) : null}
                  status={formatMatchStatus(match.status) || "Scheduled"}
                  hideEyebrow={false}
                  compact
                  hideFinishedVenue={false}
                  hideVenue
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
