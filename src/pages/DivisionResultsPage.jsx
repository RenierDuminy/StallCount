import { Link } from "react-router-dom";
import "./divisionResults.css";

const residencePoolRounds = [
  {
    label: "W1",
    matches: [
      { teamA: "Eendrag 1", teamB: "Wilgenhof 2", scoreA: 15, scoreB: 0 },
      { teamA: "Wilgenhof 1", teamB: "Dagbreek 2", scoreA: 15, scoreB: 1 },
      { teamA: "Metanoia", teamB: "Eendrag 3", scoreA: 15, scoreB: 2 },
      { teamA: "Barbarians", teamB: "Huis Visser", scoreA: 13, scoreB: 7 },
      { teamA: "Molle", teamB: "Helshoogte", scoreA: 10, scoreB: 9 },
      { teamA: "Simonsberg", teamB: "Majuba", scoreA: 11, scoreB: 8 },
      { teamA: "Eendrag 2", teamB: "Dagbreek 1", scoreA: 9, scoreB: 6 },
    ],
  },
  {
    label: "W2",
    matches: [
      { teamA: "Eendrag 1", teamB: "Wilgenhof 1", scoreA: 13, scoreB: 11 },
      { teamA: "Metanoia", teamB: "Barbarians", scoreA: 15, scoreB: 13 },
      { teamA: "Simonsberg", teamB: "Molle", scoreA: 13, scoreB: 12 },
      { teamA: "Eendrag 2", teamB: "Majuba", scoreA: 12, scoreB: 9 },
      { teamA: "Dagbreek 1", teamB: "Helshoogte", scoreA: 11, scoreB: 10 },
      { teamA: "Wilgenhof 2", teamB: "Dagbreek 2", scoreA: 10, scoreB: 7 },
      { teamA: "Huis Visser", teamB: "Eendrag 3", scoreA: 12, scoreB: 6 },
    ],
  },
  {
    label: "W3",
    matches: [
      { teamA: "Eendrag 1", teamB: "Metanoia", scoreA: 13, scoreB: 12 },
      { teamA: "Wilgenhof 1", teamB: "Barbarians", scoreA: 12, scoreB: 10 },
      { teamA: "Simonsberg", teamB: "Eendrag 2", scoreA: 15, scoreB: 13 },
      { teamA: "Molle", teamB: "Dagbreek 1", scoreA: 11, scoreB: 7 },
      { teamA: "Majuba", teamB: "Dagbreek 2", scoreA: 12, scoreB: 6 },
      { teamA: "Helshoogte", teamB: "Wilgenhof 2", scoreA: 13, scoreB: 8 },
      { teamA: "Huis Visser", teamB: "Eendrag 3", scoreA: 10, scoreB: 9 },
    ],
  },
  {
    label: "W4",
    matches: [
      { teamA: "Eendrag 1", teamB: "Simonsberg", scoreA: 14, scoreB: 12 },
      { teamA: "Metanoia", teamB: "Wilgenhof 1", scoreA: 11, scoreB: 13 },
      { teamA: "Barbarians", teamB: "Molle", scoreA: 15, scoreB: 10 },
      { teamA: "Eendrag 2", teamB: "Majuba", scoreA: 12, scoreB: 8 },
      { teamA: "Dagbreek 1", teamB: "Helshoogte", scoreA: 10, scoreB: 11 },
      { teamA: "Dagbreek 2", teamB: "Huis Visser", scoreA: 9, scoreB: 11 },
      { teamA: "Wilgenhof 2", teamB: "Eendrag 3", scoreA: 8, scoreB: 11 },
    ],
  },
  {
    label: "W5",
    matches: [
      { teamA: "Eendrag 1", teamB: "Barbarians", scoreA: 15, scoreB: 11 },
      { teamA: "Wilgenhof 1", teamB: "Simonsberg", scoreA: 12, scoreB: 13 },
      { teamA: "Metanoia", teamB: "Eendrag 2", scoreA: 14, scoreB: 12 },
      { teamA: "Molle", teamB: "Majuba", scoreA: 10, scoreB: 8 },
      { teamA: "Helshoogte", teamB: "Dagbreek 2", scoreA: 10, scoreB: 10 },
      { teamA: "Huis Visser", teamB: "Wilgenhof 2", scoreA: 11, scoreB: 7 },
      { teamA: "Dagbreek 1", teamB: "Eendrag 3", scoreA: 10, scoreB: 9 },
    ],
  },
  {
    label: "W6",
    matches: [
      { teamA: "Eendrag 1", teamB: "Metanoia", scoreA: 15, scoreB: 9 },
      { teamA: "Barbarians", teamB: "Simonsberg", scoreA: 13, scoreB: 15 },
      { teamA: "Wilgenhof 1", teamB: "Eendrag 2", scoreA: 14, scoreB: 12 },
      { teamA: "Majuba", teamB: "Dagbreek 1", scoreA: 11, scoreB: 10 },
      { teamA: "Molle", teamB: "Huis Visser", scoreA: 12, scoreB: 9 },
      { teamA: "Helshoogte", teamB: "Eendrag 3", scoreA: 13, scoreB: 7 },
      { teamA: "Dagbreek 2", teamB: "Wilgenhof 2", scoreA: 10, scoreB: 8 },
    ],
  },
  {
    label: "W7",
    matches: [
      { teamA: "Eendrag 1", teamB: "Wilgenhof 1", scoreA: 15, scoreB: 12 },
      { teamA: "Metanoia", teamB: "Simonsberg", scoreA: 13, scoreB: 14 },
      { teamA: "Barbarians", teamB: "Eendrag 2", scoreA: 11, scoreB: 12 },
      { teamA: "Molle", teamB: "Dagbreek 1", scoreA: 10, scoreB: 9 },
      { teamA: "Huis Visser", teamB: "Majuba", scoreA: 9, scoreB: 12 },
      { teamA: "Helshoogte", teamB: "Dagbreek 2", scoreA: 12, scoreB: 8 },
      { teamA: "Wilgenhof 2", teamB: "Eendrag 3", scoreA: 9, scoreB: 11 },
    ],
  },
  {
    label: "W8",
    matches: [
      { teamA: "Eendrag 1", teamB: "Molle", scoreA: 15, scoreB: 7 },
      { teamA: "Wilgenhof 1", teamB: "Metanoia", scoreA: 12, scoreB: 11 },
      { teamA: "Barbarians", teamB: "Dagbreek 1", scoreA: 12, scoreB: 9 },
      { teamA: "Majuba", teamB: "Simonsberg", scoreA: 10, scoreB: 13 },
      { teamA: "Helshoogte", teamB: "Huis Visser", scoreA: 11, scoreB: 10 },
      { teamA: "Eendrag 2", teamB: "Dagbreek 2", scoreA: 13, scoreB: 8 },
      { teamA: "Wilgenhof 2", teamB: "Eendrag 3", scoreA: 10, scoreB: 12 },
    ],
  },
  {
    label: "W9",
    matches: [
      { teamA: "Eendrag 1", teamB: "Metanoia", scoreA: 15, scoreB: 13 },
      { teamA: "Wilgenhof 1", teamB: "Eendrag 2", scoreA: 14, scoreB: 11 },
      { teamA: "Barbarians", teamB: "Wilgenhof 2", scoreA: 12, scoreB: 12 },
      { teamA: "Molle", teamB: "Helshoogte", scoreA: 11, scoreB: 10 },
      { teamA: "Dagbreek 1", teamB: "Huis Visser", scoreA: 0, scoreB: 0 },
      { teamA: "Simonsberg", teamB: "Dagbreek 2", scoreA: 15, scoreB: 12 },
      { teamA: "Majuba", teamB: "Eendrag 3", scoreA: 12, scoreB: 9 },
    ],
  },
];

const residenceSeeds = [
  { seed: 1, team: "Eendrag 1" },
  { seed: 2, team: "Wilgenhof 1" },
  { seed: 3, team: "Metanoia" },
  { seed: 4, team: "Barbarians" },
  { seed: 5, team: "Molle" },
  { seed: 6, team: "Simonsberg" },
  { seed: 7, team: "Eendrag 2" },
  { seed: 8, team: "Dagbreek 1" },
  { seed: 9, team: "Majuba" },
  { seed: 10, team: "Helshoogte" },
  { seed: 11, team: "Huis Visser" },
  { seed: 12, team: "Eendrag 3" },
  { seed: 13, team: "Dagbreek 2" },
  { seed: 14, team: "Wilgenhof 2" },
];

const residenceResults = [
  { place: "Champion", team: "Eendrag 1" },
  { place: "Runner-up", team: "Wilgenhof 1" },
  { place: "3rd", team: "Simonsberg" },
  { place: "4th", team: "Barbarians" },
  { place: "5th", team: "Molle" },
  { place: "6th", team: "Eendrag 2" },
  { place: "7th", team: "Metanoia" },
  { place: "8th", team: "Dagbreek 1" },
  { place: "9th", team: "Majuba" },
  { place: "10th", team: "Helshoogte" },
  { place: "11th", team: "Huis Visser" },
  { place: "12th", team: "Eendrag 3" },
  { place: "13th", team: "Dagbreek 2" },
  { place: "14th", team: "Wilgenhof 2" },
];

const playoffParticipants = residenceSeeds.map((seedRow) => {
  const result = residenceResults.find((res) => res.team === seedRow.team);
  return {
    team: seedRow.team,
    seed: seedRow.seed,
    place: result?.place || null,
  };
});

const residencePlayoffUpperColumns = [
  {
    label: "W10",
    sections: [
      {
        title: "QF - Upper",
        matches: [
          { teamA: "Eendrag 1", teamB: "Dagbreek 2", scoreA: 15, scoreB: 3, seedA: 1, seedB: 13 },
          { teamA: "Dagbreek 1", teamB: "Simonsberg", scoreA: 10, scoreB: 15, seedA: 8, seedB: 6 },
          { teamA: "Barbarians", teamB: "Molle", scoreA: 12, scoreB: 11, seedA: 4, seedB: 5 },
          { teamA: "Wilgenhof 1", teamB: "Metanoia", scoreA: 15, scoreB: 8, seedA: 2, seedB: 3 },
        ],
      },
      {
        title: "QF - Lower",
        matches: [
          { teamA: "Majuba", teamB: "Helshoogte", scoreA: 13, scoreB: 10, seedA: 9, seedB: 10 },
          { teamA: "Huis Visser", teamB: "Dagbreek 2", scoreA: 12, scoreB: 8, seedA: 11, seedB: 13 },
          { teamA: "Wilgenhof 2", teamB: "Eendrag 3", scoreA: 8, scoreB: 12, seedA: 14, seedB: 12 },
        ],
      },
    ],
  },
  {
    label: "W11",
    sections: [
      {
        title: "SF - Upper",
        matches: [
          { teamA: "Eendrag 1", teamB: "Barbarians", scoreA: 13, scoreB: 5 },
          { teamA: "Wilgenhof 1", teamB: "Simonsberg", scoreA: 11, scoreB: 9 },
        ],
      },
      {
        title: "SF - Lower",
        matches: [
          { teamA: "Molle", teamB: "Dagbreek 1", scoreA: 15, scoreB: 4 },
          { teamA: "Metanoia", teamB: "Eendrag 2", scoreA: 13, scoreB: 8 },
        ],
      },
      {
        title: "Lower redemption",
        matches: [
          { teamA: "Helshoogte", teamB: "Dagbreek 2", scoreA: 10, scoreB: 8, seedA: 10, seedB: 13 },
          { teamA: "Huis Visser", teamB: "Wilgenhof 2", scoreA: 12, scoreB: 9, seedA: 11, seedB: 14 },
        ],
      }
    ],
  },
  {
    label: "W12",
    sections: [
      {
        title: "Finals",
        matches: [{ teamA: "Eendrag 1", teamB: "Wilgenhof 1", scoreA: 15, scoreB: 11 }],
      },
      {
        title: "3rd/4th",
        matches: [{ teamA: "Simonsberg", teamB: "Barbarians", scoreA: 13, scoreB: 10 }],
      },
      {
        title: "5th/6th, 7th/8th",
        matches: [
          { teamA: "Molle", teamB: "Metanoia", scoreA: 12, scoreB: 10 },
          { teamA: "Dagbreek 1", teamB: "Eendrag 2", scoreA: 11, scoreB: 9 },
          { teamA: "Majuba", teamB: "Helshoogte", scoreA: 15, scoreB: 13 },
        ],
      },
    ],
  },
];

const deriveMatchDisplay = (match) => {
  const isTie = match.scoreA === match.scoreB;
  const teamATop = match.scoreA >= match.scoreB;
  const top = teamATop
    ? { name: match.teamA, score: match.scoreA, seed: match.seedA ?? null }
    : { name: match.teamB, score: match.scoreB, seed: match.seedB ?? null };
  const bottom = teamATop
    ? { name: match.teamB, score: match.scoreB, seed: match.seedB ?? null }
    : { name: match.teamA, score: match.scoreA, seed: match.seedA ?? null };
  return { top, bottom, isTie };
};

function MatchEntryCard({ match }) {
  const { top, bottom, isTie } = deriveMatchDisplay(match);
  const isZeroZero = match.scoreA === 0 && match.scoreB === 0;
  const cardClasses = ["dr-match-card"];
  if (isZeroZero) {
    cardClasses.push("dr-match-card--zero");
  } else if (isTie) {
    cardClasses.push("dr-match-card--tie");
  }
  const topScoreClass = ["dr-match-score"];
  const bottomScoreClass = ["dr-match-score", "dr-match-score--secondary"];
  if (isZeroZero) {
    topScoreClass.push("dr-match-score--zero");
    bottomScoreClass.push("dr-match-score--zero");
  } else if (isTie) {
    topScoreClass.push("dr-match-score--tie");
    bottomScoreClass.push("dr-match-score--tie");
  } else {
    topScoreClass.push("dr-match-score--lead");
  }
  return (
    <div className={cardClasses.join(" ")}>
      <div className="dr-match-row">
        <div className="dr-match-team">
          {top.seed ? `(${top.seed}) ` : ""}
          {top.name}
        </div>
        <span className={topScoreClass.join(" ")}>{top.score}</span>
      </div>
      <div className="dr-match-row">
        <div className="dr-match-team dr-match-team--secondary">
          {bottom.seed ? `(${bottom.seed}) ` : ""}
          {bottom.name}
        </div>
        <span className={bottomScoreClass.join(" ")}>{bottom.score}</span>
      </div>
    </div>
  );
}

function PoolRoundCard({ round }) {
  return (
    <div className="dr-pool-card">
      <div className="dr-card-header">
        <p className="dr-card-title">{round.label}</p>
        <span className="dr-badge">Pool play</span>
      </div>
      <div className="dr-match-list">
        <p className="dr-match-label">Match</p>
        {round.matches.map((match, idx) => (
          <MatchEntryCard key={`${round.label}-${idx}`} match={match} />
        ))}
      </div>
    </div>
  );
}

function PlayoffTeamsColumn({ rows }) {
  return (
    <div className="dr-teams-column">
      <div className="dr-teams-column__header">
        <p className="dr-card-title">Team &amp; seed</p>
        <span className="dr-badge">Bracket</span>
      </div>
      <div className="dr-teams-list">
        {rows.map((row) => (
          <div key={row.team} className="dr-team-row">
            <div className="dr-team-row__info">
              <p className="dr-match-team">{row.team}</p>
              {row.place && <p className="dr-team-row__seed">{row.place}</p>}
            </div>
            <span className="dr-team-row__badge">Seed {row.seed}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayoffColumn({ column }) {
  return (
    <div className="dr-playoff-column">
      <div className="dr-card-header">
        <p className="dr-card-title">{column.label}</p>
        <span className="dr-badge">Playoffs</span>
      </div>
      <div className="dr-match-list">
        {column.sections.map((section, idx) => (
          <div key={`${column.label}-${idx}`} className="dr-playoff-section">
            {section.title ? <p className="dr-playoff-section__title">{section.title}</p> : null}
            <div className="dr-playoff-section__matches">
              {section.matches.map((match, matchIdx) => (
                <MatchEntryCard key={`${column.label}-${idx}-${matchIdx}`} match={match} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinalResultsColumn({ rows }) {
  return (
    <div className="dr-final-column">
      <div className="dr-final-column__header">
        <p className="dr-card-title">Final results</p>
        <span className="dr-badge">Placements</span>
      </div>
      <div className="dr-final-list">
        {rows.map((row, idx) => {
          let modifier = "dr-final-row--bottom";
          if (idx === 0) modifier = "dr-final-row--gold";
          else if (idx === 1) modifier = "dr-final-row--silver";
          else if (idx === 2) modifier = "dr-final-row--bronze";
          else if (idx >= 3 && idx <= 7) modifier = "dr-final-row--top-eight";
          return (
            <div key={row.team} className={`dr-final-row ${modifier}`}>
              <span className="dr-final-row__place">{row.place}</span>
              <span className="dr-final-row__team">{row.team}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DivisionResultsPage() {
  return (
    <div className="division-results-page">
      <header className="sc-shell dr-shell-full dr-shell-padding">
        <div className="sc-card-base dr-header-card">
          <div className="dr-chip-row">
            <span className="sc-chip">Division results</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Residence league · Pool play & playoffs
            </span>
          </div>
          <h1 className="text-3xl font-semibold">Residence league results, pool table view.</h1>
          <p className="text-sm text-ink-muted max-w-3xl">
            Weeks 1-9 are pool play. Each line uses the short-name format "Team 15 - 10 Team". Scroll sideways to follow
            weekly matchups, and see outcome, seeding, and bracket details below.
          </p>
          <div className="dr-chip-row">
            <Link to="/divisions" className="sc-button is-ghost">
              Back to divisions
            </Link>
            <Link to="/matches" className="sc-button">
              View all matches
            </Link>
          </div>
        </div>
      </header>

      <main className="sc-shell dr-shell-full dr-main-stack">
        <section className="sc-card-base dr-section-card">
          <div className="dr-section-header">
            <div className="space-y-1">
              <p className="sc-chip">Residence league</p>
              <h2 className="text-xl font-semibold text-ink">Pool play (Weeks 1-9)</h2>
              <p className="text-sm text-ink-muted">
                Side-scroll to view all pool weeks. Scores are shown as "Team 15 - 0 Team" for quick scanning.
              </p>
            </div>
            <div className="dr-section-meta">
              <p>14 teams ? pool play into playoffs</p>
              <p>Numbers mirrored from the provided example.</p>
            </div>
          </div>

          <div className="dr-scroll-wrapper">
          <div className="dr-pool-row">
              {residencePoolRounds.map((round) => (
                <PoolRoundCard key={round.label} round={round} />
              ))}
            </div>
          </div>
        </section>

        <section className="dr-playoff-stack">
          <div className="dr-section-header">
            <div>
              <p className="sc-chip">Playoffs board</p>
              <h2 className="text-lg font-semibold text-ink">Seeds, quarters, semis, and placements</h2>
              <p className="text-sm text-ink-muted">Structured like the shared sheet ? scroll sideways.</p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Team column + rounds W10-W12
            </span>
          </div>
          <div className="dr-scroll-wrapper">
            <div className="dr-playoff-row dr-playoff-row--primary">
              <PlayoffTeamsColumn rows={playoffParticipants} />
              {residencePlayoffUpperColumns.map((column) => (
                <PlayoffColumn key={column.label} column={column} />
              ))}
              <FinalResultsColumn rows={residenceResults} />
            </div>
          </div>
          <div className="dr-scroll-wrapper">
          </div>
        </section>
      </main>
    </div>
  );
}
