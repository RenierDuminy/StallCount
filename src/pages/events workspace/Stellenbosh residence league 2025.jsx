import { Card, Chip, MatchCard, Panel, SectionHeader, SectionShell } from "../../components/ui/primitives";
import { StandardStandingsLegend, StandardStandingsTable } from "../../components/StandardStandingsTable";
import { FORM_OUTCOME_LABELS } from "../../utils/standings";

export const EVENT_ID = "b0598bc7-fdd2-498c-ab8c-e5f4904ed03d";
export const EVENT_SLUG = "stellenbosch-residence-league-2025";

/*
 * Stellenbosch Residence League 2025 — a static archive page.
 *
 * The 2025 season was scored on a spreadsheet, not in StallCount, so nothing
 * here is read from the database. Every result is transcribed from the two
 * "League_summary_extra" sheets (Men's and Women's). A 0-0 line is a fixture
 * the sheet records with no score; it renders as a canceled match card.
 * Where the sheet's points show who was at fault (0 points), `guilty` names
 * that team and the card renders as a forfeit; in the Swiss draw the guilty
 * team was dropped one level for the next round's pairing.
 */

const m = (teamA, scoreA, teamB, scoreB, extra = {}) => ({ teamA, scoreA, teamB, scoreB, ...extra });

// ---------------------------------------------------------------------------
// Men's division
// ---------------------------------------------------------------------------

const MENS_POOL_ROUNDS = [
  {
    label: "Seeding round (friendlies)",
    matches: [
      m("Molle", 0, "Eendrag 1", 0),
      m("Wilgenhof 1", 0, "Eendrag 2", 0),
      m("Dagbreek 1", 6, "Wilgenhof 2", 12),
      m("Metanoia", 15, "Eendrag 3", 3),
      m("Dagbreek 2", 0, "Helderberg", 0),
      m("Huis Visser", 1, "Helshoogte", 9),
      m("Majuba", 7, "Simonsberg", 10),
    ],
  },
  {
    label: "Swiss round 1",
    matches: [
      m("Eendrag 3", 1, "Huis Visser", 15),
      m("Wilgenhof 2", 0, "Helshoogte", 0, { guilty: ["Wilgenhof 2"] }),
      m("Dagbreek 2", 3, "Majuba", 15),
      m("Metanoia", 15, "Simonsberg", 5),
      m("Barbarians", 12, "Dagbreek 1", 4),
      m("Eendrag 2", 7, "Wilgenhof 1", 13),
      m("Eendrag 1", 11, "Molle", 9),
    ],
  },
  {
    label: "Swiss round 2",
    matches: [
      m("Huis Visser", 6, "Helshoogte", 5),
      m("Eendrag 3", 12, "Majuba", 3),
      m("Wilgenhof 2", 5, "Metanoia", 15),
      m("Dagbreek 2", 3, "Barbarians", 15),
      m("Simonsberg", 4, "Wilgenhof 1", 10),
      m("Dagbreek 1", 4, "Eendrag 1", 12),
      m("Eendrag 2", 2, "Molle", 6),
    ],
  },
  {
    label: "Swiss round 3",
    matches: [
      m("Huis Visser", 5, "Eendrag 3", 7),
      m("Helshoogte", 0, "Metanoia", 0, { guilty: ["Helshoogte"] }),
      m("Majuba", 5, "Barbarians", 8),
      m("Wilgenhof 2", 1, "Wilgenhof 1", 7),
      m("Dagbreek 2", 2, "Eendrag 1", 15),
      m("Simonsberg", 13, "Molle", 14),
      m("Dagbreek 1", 11, "Eendrag 2", 6),
    ],
  },
  {
    label: "Swiss round 4",
    matches: [
      m("Eendrag 3", 4, "Metanoia", 15),
      m("Huis Visser", 0, "Barbarians", 0, { guilty: ["Huis Visser"] }),
      m("Helshoogte", 10, "Wilgenhof 1", 10),
      m("Majuba", 4, "Eendrag 1", 15),
      m("Wilgenhof 2", 0, "Molle", 0, { guilty: ["Wilgenhof 2"] }),
      m("Dagbreek 2", 9, "Dagbreek 1", 15),
      m("Simonsberg", 10, "Eendrag 2", 12),
    ],
  },
  {
    label: "Swiss round 5",
    matches: [
      m("Metanoia", 14, "Barbarians", 12),
      m("Eendrag 3", 5, "Wilgenhof 1", 15),
      m("Huis Visser", 4, "Eendrag 1", 15),
      m("Helshoogte", 8, "Molle", 10),
      m("Majuba", 12, "Dagbreek 1", 7),
      m("Wilgenhof 2", 6, "Eendrag 2", 15),
      m("Dagbreek 2", 1, "Simonsberg", 15),
    ],
  },
  {
    label: "Swiss round 6",
    matches: [
      m("Metanoia", 8, "Wilgenhof 1", 12),
      m("Barbarians", 9, "Eendrag 1", 15),
      m("Eendrag 3", 0, "Molle", 0, { guilty: ["Eendrag 3"] }),
      m("Huis Visser", 7, "Majuba", 9),
      m("Helshoogte", 12, "Eendrag 2", 9),
      m("Dagbreek 1", 7, "Simonsberg", 13),
      m("Wilgenhof 2", 0, "Dagbreek 2", 0, { guilty: ["Wilgenhof 2"] }),
    ],
  },
  {
    label: "Swiss round 7",
    matches: [
      m("Wilgenhof 1", 12, "Eendrag 1", 13),
      m("Metanoia", 10, "Molle", 9),
      m("Barbarians", 10, "Majuba", 6),
      m("Eendrag 3", 7, "Helshoogte", 11),
      m("Huis Visser", 4, "Simonsberg", 12),
      m("Eendrag 2", 15, "Dagbreek 2", 2),
      m("Dagbreek 1", 13, "Wilgenhof 2", 4),
    ],
  },
  {
    label: "Swiss round 8",
    matches: [
      m("Eendrag 1", 15, "Metanoia", 6),
      m("Wilgenhof 1", 12, "Barbarians", 12),
      m("Molle", 14, "Helshoogte", 4),
      m("Majuba", 8, "Simonsberg", 10),
      m("Eendrag 3", 7, "Eendrag 2", 11),
      m("Huis Visser", 4, "Dagbreek 1", 15),
      m("Dagbreek 2", 0, "Wilgenhof 2", 0, { guilty: ["Wilgenhof 2"] }),
    ],
  },
];

// Ranking after Swiss round 8 (league points: win 3, draw 2, loss 1), as the sheet records it.
const MENS_SWISS_RANKING = [
  ["Eendrag 1", 24],
  ["Wilgenhof 1", 20],
  ["Metanoia", 18],
  ["Barbarians", 17],
  ["Molle", 17],
  ["Simonsberg", 16],
  ["Eendrag 2", 16],
  ["Dagbreek 1", 16],
  ["Majuba", 14],
  ["Helshoogte", 12],
  ["Huis Visser", 11],
  ["Eendrag 3", 11],
  ["Dagbreek 2", 7],
  ["Wilgenhof 2", 4],
];
const MENS_SEED = Object.fromEntries(MENS_SWISS_RANKING.map(([team], i) => [team, i + 1]));
const s = (team) => MENS_SEED[team];
const pm = (teamA, scoreA, teamB, scoreB, guilty) =>
  m(teamA, scoreA, teamB, scoreB, { seedA: s(teamA), seedB: s(teamB), guilty });

const MENS_PLAYOFF_ROUNDS = [
  {
    label: "Quarterfinals",
    sections: [
      {
        title: "Upper bracket (seeds 1-8)",
        matches: [
          pm("Eendrag 1", 15, "Dagbreek 1", 4),
          pm("Barbarians", 12, "Molle", 8),
          pm("Wilgenhof 1", 15, "Eendrag 2", 4),
          pm("Metanoia", 8, "Simonsberg", 10),
        ],
      },
      {
        title: "Lower bracket (seeds 9-14)",
        matches: [
          pm("Majuba", 7, "Helshoogte", 13),
          pm("Huis Visser", 5, "Eendrag 3", 11),
          pm("Dagbreek 2", 0, "Wilgenhof 2", 0, ["Wilgenhof 2"]),
        ],
      },
    ],
  },
  {
    label: "Semifinals",
    sections: [
      {
        title: "Upper semifinals",
        matches: [pm("Eendrag 1", 13, "Barbarians", 5), pm("Wilgenhof 1", 11, "Simonsberg", 9)],
      },
      {
        title: "Lower semifinals (5th-8th)",
        matches: [pm("Dagbreek 1", 4, "Molle", 15), pm("Eendrag 2", 0, "Metanoia", 0, ["Eendrag 2"])],
      },
      {
        title: "Lower redemption",
        matches: [
          pm("Helshoogte", 0, "Eendrag 3", 0, ["Eendrag 3"]),
          pm("Majuba", 15, "Dagbreek 2", 3),
          pm("Huis Visser", 0, "Wilgenhof 2", 0, ["Wilgenhof 2"]),
        ],
      },
    ],
  },
  {
    label: "Finals",
    sections: [
      { title: "Final", matches: [pm("Eendrag 1", 15, "Wilgenhof 1", 4)] },
      { title: "3rd place", matches: [pm("Barbarians", 10, "Simonsberg", 11)] },
      {
        title: "5th-8th place",
        matches: [pm("Molle", 15, "Metanoia", 8), pm("Dagbreek 1", 0, "Eendrag 2", 0, ["Eendrag 2"])],
      },
    ],
  },
];

const MENS_FINAL_PLACEMENTS = [
  "Eendrag 1",
  "Wilgenhof 1",
  "Simonsberg",
  "Barbarians",
  "Molle",
  "Dagbreek 1",
  "Metanoia",
  "Eendrag 2",
  "Eendrag 3",
  "Helshoogte",
  "Majuba",
  "Dagbreek 2",
  "Huis Visser",
  "Wilgenhof 2",
];

const MENS_SCORERS = [
  ["Gean van Wyk", "Eendrag", 46],
  ["Petrus Bakkes", "Wilgenhof", 29],
  ["Liam Hart", "Molle", 27],
  ["Nicolas Oudtshoorn", "Eendrag", 22],
  ["Seth Ravat", "Metanoia", 20],
  ["Christiaan Mostert", "Barbarians", 20],
  ["Nicholas Duk", "Eendrag", 18],
  ["Chris Laubscher", "Eendrag", 17],
  ["Ryan Silberbauer", "Metanoia", 17],
  ["Michael Hale", "Barbarians", 17],
  ["Hugo Bruwer", "Eendrag", 17],
  ["Charl van Wyk", "Simonsberg", 16],
  ["Pieter Conradie", "Wilgenhof", 15],
  ["Anru Cronje", "Wilgenhof", 15],
  ["Dylan Munro", "Metanoia", 15],
  ["Luca Prins", "Molle", 13],
  ["Aron Bodington", "Barbarians", 13],
  ["Christian Kotze", "Majuba", 12],
  ["Renier Duminy", "Simonsberg", 12],
  ["Joseph Mudge", "Simonsberg", 12],
];

const MENS_ASSISTS = [
  ["Breyten van der Merwe", "Barbarians", 34],
  ["Conrad Kriel", "Eendrag", 32],
  ["Pieter Conradie", "Wilgenhof", 29],
  ["Anru Cronje", "Wilgenhof", 29],
  ["Wernus Barnard", "Simonsberg", 27],
  ["Henru Hugo", "Metanoia", 25],
  ["Nicolas Oudtshoorn", "Eendrag", 23],
  ["Christian Kotze", "Majuba", 23],
  ["Ian Mouton", "Metanoia", 22],
  ["Cam Garde", "Eendrag", 21],
  ["Renier Duminy", "Simonsberg", 19],
  ["Nathan Misdorp", "Molle", 19],
  ["Ryan Silberbauer", "Metanoia", 19],
  ["Nicholas Duk", "Eendrag", 18],
  ["Petrus Bakkes", "Wilgenhof", 16],
  ["Christiaan Mostert", "Barbarians", 16],
  ["Joseph Mudge", "Simonsberg", 16],
  ["Jayden Elliott", "Molle", 15],
  ["Harshul Ranchhod", "Metanoia", 13],
  ["Oli Strauss", "Eendrag", 13],
];

// ---------------------------------------------------------------------------
// Women's division
// ---------------------------------------------------------------------------

const WOMENS_ROUNDS = [
  { label: "22 July", matches: [m("Harmonica", 6, "Equidia", 3), m("Nerina", 2, "Huis Vendetta", 12)] },
  { label: "29 July", matches: [m("Harmonica", 5, "Nerina", 2), m("Equidia", 3, "Huis Vendetta", 11)] },
  { label: "Round 3", matches: [m("Harmonica", 10, "Huis Vendetta", 5), m("Nerina", 7, "Equidia", 2)] },
  {
    label: "Round 4",
    matches: [
      m("Harmonica", 10, "Equidia", 1),
      m("Nerina", 4, "Huis Vendetta", null, { note: "Huis Vendetta forfeited; Nerina credited with a draw" }),
    ],
  },
  { label: "Round 5", matches: [m("Harmonica", 13, "Nerina", 2), m("Equidia", 11, "Huis Vendetta", 6)] },
];

const WOMENS_LEAGUE_POINTS = { Harmonica: 15, Nerina: 8, "Huis Vendetta": 8, Equidia: 7 };
const WOMENS_FINAL_PLACEMENTS = ["Harmonica", "Nerina", "Huis Vendetta", "Equidia"];

const WOMENS_SCORERS = [
  ["Anna Grace De Wet", "Harmonica", 12],
  ["Anna Lumby", "Harmonica", 8],
  ["Saskia Prevost", "Harmonica", 7],
  ["Ruby Kurgan", "Huis Vendetta", 7],
  ["Aloise Wepener", "Harmonica", 6],
  ["Jani Kotze", "Harmonica", 6],
  ["Christine Terblanche", "Harmonica", 4],
  ["Wafa Rizvi", "Huis Vendetta", 3],
  ["Ella Beattie", "Nerina", 3],
  ["Elza De Kock", "Nerina", 3],
  ["Thea-Mari Roos", "Nerina", 3],
  ["Judhi Rens", "Equidia", 3],
  ["Juryna Fourie", "Equidia", 3],
  ["Victoria West-Russell", "Huis Vendetta", 2],
  ["Skyla", "Equidia", 2],
  ["Nanette Malan", "Harmonica", 1],
  ["Chenike Rossouw", "Nerina", 1],
  ["Ella Vorster", "Nerina", 1],
  ["Izelna Venter", "Nerina", 1],
  ["Kate Ferguson", "Nerina", 1],
];

const WOMENS_ASSISTS = [
  ["Saskia Prevost", "Harmonica", 19],
  ["Aloise Wepener", "Harmonica", 10],
  ["Wafa Rizvi", "Huis Vendetta", 10],
  ["Judhi Rens", "Equidia", 9],
  ["Anna Grace De Wet", "Harmonica", 8],
  ["Ruby Kurgan", "Huis Vendetta", 4],
  ["Petra Crafford", "Nerina", 4],
  ["Chenike Rossouw", "Nerina", 3],
  ["Ella Beattie", "Nerina", 3],
  ["Mareli Jordaan", "Equidia", 3],
  ["Anna Lumby", "Harmonica", 2],
  ["Cara Strauss", "Nerina", 2],
  ["Ella Vorster", "Nerina", 2],
  ["Juryna Fourie", "Equidia", 2],
  ["Adriana Wepener", "Harmonica", 1],
  ["Christine Terblanche", "Harmonica", 1],
  ["Jani Kotze", "Harmonica", 1],
  ["Nanette Malan", "Harmonica", 1],
  ["Elza De Kock", "Nerina", 1],
  ["Izelna Venter", "Nerina", 1],
];

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

const isUnplayed = (match) => match.scoreB === null || (match.scoreA === 0 && match.scoreB === 0);

const outcomeFor = (match, team) => {
  if (match.scoreB === null) return team === match.teamA ? "forfeit_innocent" : "forfeit_guilty";
  if (isUnplayed(match)) {
    if (!match.guilty?.length) return "canceled";
    return match.guilty.includes(team) ? "forfeit_guilty" : "forfeit_innocent";
  }
  const own = team === match.teamA ? match.scoreA : match.scoreB;
  const other = team === match.teamA ? match.scoreB : match.scoreA;
  if (own === other) return "draw";
  return own > other ? "win" : "loss";
};

/** Standings rows in the given team order, with W-L, +/- and form from the matches. */
function buildRows(order, matches, points = {}) {
  return order.map((team, index) => {
    const row = { id: null, name: team, rank: index + 1, wins: 0, losses: 0, scoreDiff: 0, points: points[team], form: [] };
    matches.forEach((match) => {
      if (match.teamA !== team && match.teamB !== team) return;
      const outcome = outcomeFor(match, team);
      const opponent = team === match.teamA ? match.teamB : match.teamA;
      row.form.push({ outcome, title: `${FORM_OUTCOME_LABELS[outcome]} vs ${opponent}` });
      if (outcome === "win") row.wins += 1;
      if (outcome === "loss") row.losses += 1;
      if (!isUnplayed(match)) {
        const own = team === match.teamA ? match.scoreA : match.scoreB;
        const other = team === match.teamA ? match.scoreB : match.scoreA;
        row.scoreDiff += own - other;
      }
    });
    return row;
  });
}

const mensPoolMatches = MENS_POOL_ROUNDS.flatMap((round) => round.matches);
const mensPlayoffMatches = MENS_PLAYOFF_ROUNDS.flatMap((round) => round.sections.flatMap((sec) => sec.matches));
const womensMatches = WOMENS_ROUNDS.flatMap((round) => round.matches);

const MENS_SWISS_ROWS = buildRows(
  MENS_SWISS_RANKING.map(([team]) => team),
  mensPoolMatches,
  Object.fromEntries(MENS_SWISS_RANKING),
);
const MENS_FINAL_ROWS = buildRows(MENS_FINAL_PLACEMENTS, [...mensPoolMatches, ...mensPlayoffMatches]);
const WOMENS_ROWS = buildRows(WOMENS_FINAL_PLACEMENTS, womensMatches, WOMENS_LEAGUE_POINTS);

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ResultCard({ match }) {
  const unplayed = isUnplayed(match);
  if (unplayed && match.scoreB !== null) {
    const seedLabel = (seed) => (seed ? `(${seed}) ` : "");
    return (
      <MatchCard
        compact
        eyebrow=""
        title={`${seedLabel(match.seedA)}${match.teamA} vs ${seedLabel(match.seedB)}${match.teamB}`}
        status={match.guilty?.length ? `${match.guilty.join(" and ")} forfeited` : "Canceled"}
        phase={match.guilty?.length ? "forfeit" : "canceled"}
      />
    );
  }
  const forfeit = match.scoreB === null;
  const sides = [
    { name: match.teamA, score: match.scoreA, seed: match.seedA },
    { name: match.teamB, score: match.scoreB, seed: match.seedB },
  ];
  const winner = unplayed || match.scoreA === match.scoreB ? null : match.scoreA > match.scoreB ? 0 : 1;
  const status = forfeit ? "Forfeit" : match.scoreA === match.scoreB ? "Draw" : null;
  return (
    <Panel variant="muted" className="space-y-1 border border-white/40 p-2" title={match.note}>
      {sides.map((side, index) => (
        <div key={index} className="flex items-center justify-between gap-2 text-sm">
          <span className={`min-w-0 truncate ${winner === index ? "font-semibold text-ink" : "text-ink-muted"}`}>
            {side.seed ? <span className="mr-1 text-xs tabular-nums text-ink-muted">({side.seed})</span> : null}
            {side.name}
          </span>
          <span
            className={`shrink-0 tabular-nums ${winner === index ? "font-bold text-accent" : "text-ink-muted"}`}
          >
            {side.score ?? "–"}
          </span>
        </div>
      ))}
      {status ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          {status}
          {match.note ? ` · ${match.note}` : ""}
        </p>
      ) : null}
    </Panel>
  );
}

function RoundColumn({ label, children, className = "space-y-2" }) {
  return (
    <div className={`w-60 shrink-0 sm:w-64 ${className}`}>
      <p className="border-b border-white/30 pb-1 text-xs font-semibold uppercase tracking-wide text-ink">{label}</p>
      {children}
    </div>
  );
}

function ScrollRow({ children }) {
  return (
    <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-2">
      <div className="flex w-max items-start gap-3">{children}</div>
    </div>
  );
}

function LeaderTable({ title, rows, unit }) {
  return (
    <Panel variant="muted" className="min-w-0 space-y-1.5 border border-white/50 p-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink">{title}</p>
      <div className="overflow-hidden rounded border border-border bg-surface">
        <table className="w-full table-fixed text-xs">
          <thead className="bg-surface-muted uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="w-8 px-0.5 py-1 text-center font-semibold">#</th>
              <th className="px-1 py-1 text-left font-semibold">Player</th>
              <th className="w-24 px-1 py-1 text-left font-semibold">Team</th>
              <th className="w-10 px-0.5 py-1 text-center font-semibold">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, team, value], index) => (
              <tr
                key={name}
                style={{ background: index % 2 === 0 ? "var(--sc-surface)" : "var(--sc-surface-muted)" }}
              >
                <td className="px-0.5 py-1 text-center tabular-nums text-ink-muted">{index + 1}</td>
                <td className="truncate px-1 py-1" title={name}>{name}</td>
                <td className="truncate px-1 py-1 text-ink-muted" title={team}>{team}</td>
                <td className="px-0.5 py-1 text-center font-semibold tabular-nums">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function FormatNote({ children }) {
  return <div className="space-y-1 text-sm text-ink-muted">{children}</div>;
}

const CARD = "min-w-0 space-y-3 border border-white/70 p-3 sm:p-4";
const PANEL = "min-w-0 space-y-1.5 border border-white/50 p-2";

/** A division block inside a grouped section card. */
function DivisionBlock({ label, children }) {
  return (
    <div className="space-y-3 border-t border-white/30 pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-lg font-semibold text-ink">{label}</h3>
      {children}
    </div>
  );
}

function PoolRounds({ rounds }) {
  return (
    <ScrollRow>
      {rounds.map((round) => (
        <RoundColumn key={round.label} label={round.label}>
          {round.matches.map((match, index) => (
            <ResultCard key={index} match={match} />
          ))}
        </RoundColumn>
      ))}
    </ScrollRow>
  );
}

function StandingsSection() {
  return (
    <Card className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader title="Team standings" />
        <StandardStandingsLegend />
      </div>
      <div className="grid items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
        <Panel variant="muted" className={PANEL}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink">Men's · Final placements</p>
          <StandardStandingsTable rows={MENS_FINAL_ROWS} showRank showScoreDiff={false} />
        </Panel>
        <Panel variant="muted" className={PANEL}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink">Men's · Swiss draw after round 8 (playoff seeding)</p>
          <StandardStandingsTable rows={MENS_SWISS_ROWS} showRank showPoints />
        </Panel>
        <Panel variant="muted" className={PANEL}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink">Women's · Final standings</p>
          <StandardStandingsTable rows={WOMENS_ROWS} showRank showPoints />
        </Panel>
      </div>
    </Card>
  );
}

function PoolPlaySection() {
  return (
    <Card className={CARD}>
      <SectionHeader title="Pool play" />
      <DivisionBlock label="Men's division">
        <FormatNote>
          <p>
            The first week was a <strong className="text-ink">seeding round</strong> of friendlies, used to set
            the starting order for the draw (Helderberg played this week only). Games not played that week are simply
            canceled. Fourteen residence teams then played eight rounds of a{" "}
            <strong className="text-ink">Swiss draw</strong>: after every round, teams were re-paired against opponents
            on a similar record, so the strong teams met each other more as the weeks went on instead of playing a
            fixed round robin. A team that forfeited a Swiss game scored no points and was dropped one level for the
            next round's pairing.
          </p>
          <p>
            A win earned 3 league points, a draw 2 and a loss 1. The ranking after Swiss round 8 set the playoff seeds.
            Scroll sideways to see every round.
          </p>
        </FormatNote>
        <PoolRounds rounds={MENS_POOL_ROUNDS} />
      </DivisionBlock>
      <DivisionBlock label="Women's division">
        <FormatNote>
          <p>
            The women's division started in the second half of the season with four teams: Harmonica, Nerina, Huis
            Vendetta and Equidia (Siristea entered but withdrew). Teams played each other in rotation, and the final
            standings are the league table: 3 points for a win, 2 for a draw, 1 for a loss and none for a forfeit.
            There were no playoffs.
          </p>
        </FormatNote>
        <PoolRounds rounds={WOMENS_ROUNDS} />
      </DivisionBlock>
    </Card>
  );
}

function PlayoffsSection() {
  return (
    <Card className={CARD}>
      <SectionHeader title="Playoffs" />
      <DivisionBlock label="Men's division">
        <FormatNote>
          <p>
            Seeds 1-8 entered the <strong className="text-ink">upper bracket</strong> (1 v 8, 4 v 5, 2 v 7, 3 v 6).
            Quarterfinal winners played for the title and 3rd place; quarterfinal losers dropped into the 5th-8th
            semifinals.
          </p>
          <p>
            Seeds 9-14 played a <strong className="text-ink">lower bracket</strong> for 9th-14th, with a redemption
            round. Numbers in brackets are Swiss seeds.
          </p>
        </FormatNote>
        <ScrollRow>
          {MENS_PLAYOFF_ROUNDS.map((round) => (
            <RoundColumn key={round.label} label={round.label} className="space-y-5">
              {round.sections.map((section) => (
                <div key={section.title} className="space-y-2 border-t border-white/20 pt-3 first:border-t-0 first:pt-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{section.title}</p>
                  <div className="space-y-3">
                    {section.matches.map((match, index) => (
                      <ResultCard key={index} match={match} />
                    ))}
                  </div>
                </div>
              ))}
            </RoundColumn>
          ))}
        </ScrollRow>
      </DivisionBlock>
    </Card>
  );
}

function LeadersSection() {
  return (
    <Card className={CARD}>
      <SectionHeader title="Player leaders" description="Season totals, pool play and playoffs." />
      <div className="grid items-start gap-2 md:grid-cols-2 xl:grid-cols-4">
        <LeaderTable title="Men's · Top 20 scorers" rows={MENS_SCORERS} unit="G" />
        <LeaderTable title="Men's · Top 20 assists" rows={MENS_ASSISTS} unit="A" />
        <LeaderTable title="Women's · Top 20 scorers" rows={WOMENS_SCORERS} unit="G" />
        <LeaderTable title="Women's · Top 20 assists" rows={WOMENS_ASSISTS} unit="A" />
      </div>
    </Card>
  );
}

export default function StellenboschResidenceLeague2025Page() {
  return (
    <div className="pb-16 text-ink">
      <SectionShell as="main" className="w-full max-w-none space-y-4 py-4 sm:py-5">
        <Card className={CARD}>
          <SectionHeader
            title="Stellenbosch Residence League 2025"
            description="Disclaimer: all 2025 results were tracked on the legacy system, so only the final results are visible here. Individual matches have no live match pages or point-by-point logs."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Chip>Completed</Chip>
            <Chip>2 divisions</Chip>
          </div>
        </Card>
        <StandingsSection />
        <PoolPlaySection />
        <PlayoffsSection />
        <LeadersSection />
      </SectionShell>
    </div>
  );
}
