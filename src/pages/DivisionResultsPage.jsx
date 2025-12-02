import { Link } from "react-router-dom";

const residenceSwissRounds = [
  {
    label: "W1",
    matches: [
      { teams: ["Eendrag 1", "Wilgenhof 2"], score: "15-0" },
      { teams: ["Wilgenhof 1", "Dagbreek 2"], score: "15-1" },
      { teams: ["Metanoia", "Eendrag 3"], score: "15-2" },
      { teams: ["Barbarians", "Huis Visser"], score: "13-7" },
      { teams: ["Molle", "Helshoogte"], score: "10-9" },
      { teams: ["Simonsberg", "Majuba"], score: "11-8" },
      { teams: ["Eendrag 2", "Dagbreek 1"], score: "9-6" },
    ],
  },
  {
    label: "W2",
    matches: [
      { teams: ["Eendrag 1", "Wilgenhof 1"], score: "13-11" },
      { teams: ["Metanoia", "Barbarians"], score: "15-13" },
      { teams: ["Simonsberg", "Molle"], score: "13-12" },
      { teams: ["Eendrag 2", "Majuba"], score: "12-9" },
      { teams: ["Dagbreek 1", "Helshoogte"], score: "11-10" },
      { teams: ["Wilgenhof 2", "Dagbreek 2"], score: "10-7" },
      { teams: ["Huis Visser", "Eendrag 3"], score: "12-6" },
    ],
  },
  {
    label: "W3",
    matches: [
      { teams: ["Eendrag 1", "Metanoia"], score: "13-12" },
      { teams: ["Wilgenhof 1", "Barbarians"], score: "12-10" },
      { teams: ["Simonsberg", "Eendrag 2"], score: "15-13" },
      { teams: ["Molle", "Dagbreek 1"], score: "11-7" },
      { teams: ["Majuba", "Dagbreek 2"], score: "12-6" },
      { teams: ["Helshoogte", "Wilgenhof 2"], score: "13-8" },
      { teams: ["Huis Visser", "Eendrag 3"], score: "10-9" },
    ],
  },
  {
    label: "W4",
    matches: [
      { teams: ["Eendrag 1", "Simonsberg"], score: "14-12" },
      { teams: ["Metanoia", "Wilgenhof 1"], score: "11-13" },
      { teams: ["Barbarians", "Molle"], score: "15-10" },
      { teams: ["Eendrag 2", "Majuba"], score: "12-8" },
      { teams: ["Dagbreek 1", "Helshoogte"], score: "10-11" },
      { teams: ["Dagbreek 2", "Huis Visser"], score: "9-11" },
      { teams: ["Wilgenhof 2", "Eendrag 3"], score: "8-11" },
    ],
  },
  {
    label: "W5",
    matches: [
      { teams: ["Eendrag 1", "Barbarians"], score: "15-11" },
      { teams: ["Wilgenhof 1", "Simonsberg"], score: "12-13" },
      { teams: ["Metanoia", "Eendrag 2"], score: "14-12" },
      { teams: ["Molle", "Majuba"], score: "10-8" },
      { teams: ["Helshoogte", "Dagbreek 2"], score: "12-6" },
      { teams: ["Huis Visser", "Wilgenhof 2"], score: "11-7" },
      { teams: ["Dagbreek 1", "Eendrag 3"], score: "10-9" },
    ],
  },
  {
    label: "W6",
    matches: [
      { teams: ["Eendrag 1", "Metanoia"], score: "15-9" },
      { teams: ["Barbarians", "Simonsberg"], score: "13-15" },
      { teams: ["Wilgenhof 1", "Eendrag 2"], score: "14-12" },
      { teams: ["Majuba", "Dagbreek 1"], score: "11-10" },
      { teams: ["Molle", "Huis Visser"], score: "12-9" },
      { teams: ["Helshoogte", "Eendrag 3"], score: "13-7" },
      { teams: ["Dagbreek 2", "Wilgenhof 2"], score: "10-8" },
    ],
  },
  {
    label: "W7",
    matches: [
      { teams: ["Eendrag 1", "Wilgenhof 1"], score: "15-12" },
      { teams: ["Metanoia", "Simonsberg"], score: "13-14" },
      { teams: ["Barbarians", "Eendrag 2"], score: "11-12" },
      { teams: ["Molle", "Dagbreek 1"], score: "10-9" },
      { teams: ["Huis Visser", "Majuba"], score: "9-12" },
      { teams: ["Helshoogte", "Dagbreek 2"], score: "12-8" },
      { teams: ["Wilgenhof 2", "Eendrag 3"], score: "9-11" },
    ],
  },
  {
    label: "W8",
    matches: [
      { teams: ["Eendrag 1", "Molle"], score: "15-7" },
      { teams: ["Wilgenhof 1", "Metanoia"], score: "12-11" },
      { teams: ["Barbarians", "Dagbreek 1"], score: "12-9" },
      { teams: ["Majuba", "Simonsberg"], score: "10-13" },
      { teams: ["Helshoogte", "Huis Visser"], score: "11-10" },
      { teams: ["Eendrag 2", "Dagbreek 2"], score: "13-8" },
      { teams: ["Wilgenhof 2", "Eendrag 3"], score: "10-12" },
    ],
  },
  {
    label: "W9",
    matches: [
      { teams: ["Eendrag 1", "Metanoia"], score: "15-13" },
      { teams: ["Wilgenhof 1", "Eendrag 2"], score: "14-11" },
      { teams: ["Barbarians", "Wilgenhof 2"], score: "12-8" },
      { teams: ["Molle", "Helshoogte"], score: "11-10" },
      { teams: ["Dagbreek 1", "Huis Visser"], score: "10-9" },
      { teams: ["Simonsberg", "Dagbreek 2"], score: "15-12" },
      { teams: ["Majuba", "Eendrag 3"], score: "12-9" },
    ],
  },
];

const residenceSwissOutcomes = [
  { label: "Champion", team: "Eendrag 1" },
  { label: "Runner-up", team: "Wilgenhof 1" },
  { label: "3rd place", team: "Simonsberg" },
  { label: "4th place", team: "Barbarians" },
  { label: "5th place", team: "Molle" },
  { label: "6th place", team: "Eendrag 2" },
  { label: "7th place", team: "Metanoia" },
  { label: "8th place", team: "Dagbreek 1" },
  { label: "9th place", team: "Majuba" },
];

const residenceSwissSeeds = [
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

const residenceSwissPlayoffs = {
  upper: [
    { round: "QF Upper", match: "Eendrag 1 vs Dagbreek 2", score: "15-3" },
    { round: "QF Upper", match: "Dagbreek 1 vs Simonsberg", score: "10-15" },
    { round: "QF Upper", match: "Barbarians vs Molle", score: "12-11" },
    { round: "QF Upper", match: "Wilgenhof 1 vs Metanoia", score: "15-8" },
    { round: "SF Upper", match: "Eendrag 1 vs Barbarians", score: "15-7" },
    { round: "SF Upper", match: "Wilgenhof 1 vs Simonsberg", score: "11-15" },
    { round: "Finals", match: "Eendrag 1 vs Wilgenhof 1", score: "15-11" },
    { round: "3rd place", match: "Barbarians vs Simonsberg", score: "10-13" },
  ],
  lower: [
    { round: "QF Lower", match: "Majuba vs Helshoogte", score: "13-10" },
    { round: "QF Lower", match: "Huis Visser vs Dagbreek 2", score: "12-8" },
    { round: "QF Lower", match: "Wilgenhof 2 vs Eendrag 3", score: "8-12" },
    { round: "Lower redemption", match: "Helshoogte vs Dagbreek 2", score: "10-8" },
    { round: "Lower redemption", match: "Huis Visser vs Wilgenhof 2", score: "12-9" },
  ],
  placements: [
    { round: "5th/6th", match: "Molle vs Metanoia", score: "12-10" },
    { round: "7th/8th", match: "Dagbreek 1 vs Eendrag 2", score: "11-9" },
    { round: "9th", match: "Majuba vs Helshoogte", score: "15-13" },
  ],
};

function SwissRoundCard({ round }) {
  return (
    <div className="min-w-[210px] flex-1 rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-surface-muted)]/60 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-b border-[var(--sc-border)]/80 px-4 py-2">
        <p className="text-sm font-semibold text-[var(--sc-ink)]">{round.label}</p>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
          Swiss
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-4 py-3 text-sm">
        <p className="text-[11px] uppercase tracking-wide text-[var(--sc-ink-muted)]">Match</p>
        <p className="text-right text-[11px] uppercase tracking-wide text-[var(--sc-ink-muted)]">Result</p>
        {round.matches.map((item, idx) => (
          <div key={`${round.label}-${idx}`} className="contents">
            <p className="truncate text-[var(--sc-ink)]">
              {item.teams[0]} vs {item.teams[1]}
            </p>
            <p className="text-right font-semibold text-[var(--sc-ink)]">{item.score}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutcomeCard({ title, rows, highlight }) {
  return (
    <div className="rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-surface-muted)]/60 p-4 shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">{title}</p>
        {highlight ? <span className="sc-chip">Final</span> : null}
      </div>
      <div className="divide-y divide-[var(--sc-border)]/80">
        {rows.map((row) => (
          <div key={`${title}-${row.label}-${row.team}`} className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-[var(--sc-ink-muted)]">{row.label}</span>
            <span className="font-semibold text-[var(--sc-ink)]">{row.team}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketCard({ title, matches }) {
  return (
    <div className="rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-surface-muted)]/60 p-4 shadow-lg backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">{title}</p>
      <div className="mt-2 space-y-1">
        {matches.map((match) => (
          <div
            key={`${title}-${match.round}-${match.match}`}
            className="rounded-xl border border-[var(--sc-border)]/70 bg-white/5 px-3 py-2"
          >
            <p className="text-[11px] uppercase tracking-wide text-[var(--sc-ink-muted)]">{match.round}</p>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-[var(--sc-ink)]">{match.match}</span>
              <span className="font-semibold text-[var(--sc-ink)]">{match.score}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DivisionResultsPage() {
  return (
    <div className="pb-16 text-[var(--sc-ink)]">
      <header className="sc-shell py-6">
        <div className="sc-card-base p-6 sm:p-8 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sc-chip">Division results</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
              Residence league · Swiss draw
            </span>
          </div>
          <h1 className="text-3xl font-semibold">Residence league results, Swiss-style board.</h1>
          <p className="text-sm text-[var(--sc-ink-muted)] max-w-3xl">
            A quick-glance table of every swiss round plus the playoff crossover. Scroll sideways to follow the weekly
            matchups and tap through to Divisions to pick a different event.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/divisions" className="sc-button is-ghost">
              Back to divisions
            </Link>
            <Link to="/matches" className="sc-button">
              View all matches
            </Link>
          </div>
        </div>
      </header>

      <main className="sc-shell space-y-6 sm:space-y-8">
        <section className="sc-card-base p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="sc-chip">Residence league</p>
              <h2 className="text-xl font-semibold text-[var(--sc-ink)]">Swiss rounds & playoffs</h2>
              <p className="text-sm text-[var(--sc-ink-muted)]">
                Horizontal table mirrors the shared sheet: weekly swiss pairings on the left, elimination steps on the
                right. Use the scroll bar to move between weeks.
              </p>
            </div>
            <div className="text-right text-xs text-[var(--sc-ink-muted)]">
              <p>Swiss draw · 14 teams · 9 rounds</p>
              <p>Numbers seeded from the shared example; adjust the data block if anything changes.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="flex min-w-[1200px] gap-3">
              {residenceSwissRounds.map((round) => (
                <SwissRoundCard key={round.label} round={round} />
              ))}

              <div className="grid min-w-[320px] max-w-[360px] flex-shrink-0 gap-3">
                <OutcomeCard title="Outcome" rows={residenceSwissOutcomes} highlight />
                <OutcomeCard
                  title="Seeding"
                  rows={residenceSwissSeeds.map((item) => ({
                    label: `Seed ${item.seed}`,
                    team: item.team,
                  }))}
                />
              </div>

              <div className="grid min-w-[320px] max-w-[360px] flex-shrink-0 gap-3">
                <BracketCard title="Upper bracket" matches={residenceSwissPlayoffs.upper} />
                <BracketCard title="Lower bracket" matches={residenceSwissPlayoffs.lower} />
                <BracketCard title="Placement games" matches={residenceSwissPlayoffs.placements} />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
