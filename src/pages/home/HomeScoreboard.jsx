import { formatScore, teamName } from "./homeFormat";

/**
 * Two stacked team rows with right-aligned scores, for the live featured
 * match. Stacking (rather than "A 13 – 9 B" on one line) keeps long team
 * names readable at phone width.
 */
export function HomeScoreboard({ match, size = "lg" }) {
  const rows = [
    { key: "a", name: teamName(match?.team_a, "Team A"), score: match?.score_a },
    { key: "b", name: teamName(match?.team_b, "Team B"), score: match?.score_b },
  ];

  return (
    <div className={`home-scoreboard is-${size}`}>
      {rows.map((row) => (
        <div key={row.key} className="home-scoreboard__row">
          <span className="home-scoreboard__team">{row.name}</span>
          <span className="home-scoreboard__score">{formatScore(row.score)}</span>
        </div>
      ))}
    </div>
  );
}
