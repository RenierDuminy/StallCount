// Standard playoff bracket templates.
//
// A template is an abstract, event-agnostic topology. It is instantiated against
// a real event by:
//   - mapping each abstract SEED (1..seedCount) to a concrete pool_rank source
//     (e.g. Seed 1 = Pool A #1), and
//   - wiring winner/loser SOURCES and advancement between nodes by their stable
//     within-template `key` (resolved to real bracket_node ids at apply time).
//
// Shapes (documented, plain JS — no TS in this module):
//
//   TemplateSource:
//     { kind: "seed",   seed: number }   -> becomes a pool_rank source
//     { kind: "winner", node: string }   -> winner of another template node (key)
//     { kind: "loser",  node: string }   -> loser of another template node (key)
//
//   TemplateNode:
//     { key, round, position, name,
//       sourceA: TemplateSource, sourceB: TemplateSource,
//       advanceWinnerTo?: string, advanceWinnerSide?: "A"|"B",
//       advanceLoserTo?:  string, advanceLoserSide?:  "A"|"B" }
//
//   BracketTemplate:
//     { id, label, description, bracketType, seedCount, nodes: TemplateNode[] }
//
// `bracketType` must be one of the existing BRACKET_TYPES values used across the
// app: "single_elim" | "double_elim" | "placement" | "play_in".

const seed = (n) => ({ kind: "seed", seed: n });
const winner = (node) => ({ kind: "winner", node });
const loser = (node) => ({ kind: "loser", node });

// --- Single elimination, 4 teams ------------------------------------------
// SF1: 1v4, SF2: 2v3, Final: winner SF1 v winner SF2.
const SINGLE_ELIM_4_NODES = [
  {
    key: "SF1",
    round: 1,
    position: 1,
    name: "Semifinal 1",
    sourceA: seed(1),
    sourceB: seed(4),
    advanceWinnerTo: "F",
    advanceWinnerSide: "A",
  },
  {
    key: "SF2",
    round: 1,
    position: 2,
    name: "Semifinal 2",
    sourceA: seed(2),
    sourceB: seed(3),
    advanceWinnerTo: "F",
    advanceWinnerSide: "B",
  },
  {
    key: "F",
    round: 2,
    position: 1,
    name: "Final",
    sourceA: winner("SF1"),
    sourceB: winner("SF2"),
  },
];

// Single elim 4 + 3rd place (losers of the semis play off).
const SINGLE_ELIM_4_3P_NODES = [
  ...SINGLE_ELIM_4_NODES.map((node) =>
    node.key === "SF1"
      ? { ...node, advanceLoserTo: "P3", advanceLoserSide: "A" }
      : node.key === "SF2"
        ? { ...node, advanceLoserTo: "P3", advanceLoserSide: "B" }
        : node,
  ),
  {
    key: "P3",
    round: 2,
    position: 2,
    name: "3rd place",
    sourceA: loser("SF1"),
    sourceB: loser("SF2"),
  },
];

// --- Single elimination, 8 teams ------------------------------------------
// Standard cross seeding: QF1 1v8, QF2 4v5, QF3 3v6, QF4 2v7.
const SINGLE_ELIM_8_QUARTERS = [
  { key: "QF1", round: 1, position: 1, name: "Quarterfinal 1", sourceA: seed(1), sourceB: seed(8) },
  { key: "QF2", round: 1, position: 2, name: "Quarterfinal 2", sourceA: seed(4), sourceB: seed(5) },
  { key: "QF3", round: 1, position: 3, name: "Quarterfinal 3", sourceA: seed(3), sourceB: seed(6) },
  { key: "QF4", round: 1, position: 4, name: "Quarterfinal 4", sourceA: seed(2), sourceB: seed(7) },
];

const SINGLE_ELIM_8_NODES = [
  { ...SINGLE_ELIM_8_QUARTERS[0], advanceWinnerTo: "SF1", advanceWinnerSide: "A" },
  { ...SINGLE_ELIM_8_QUARTERS[1], advanceWinnerTo: "SF1", advanceWinnerSide: "B" },
  { ...SINGLE_ELIM_8_QUARTERS[2], advanceWinnerTo: "SF2", advanceWinnerSide: "A" },
  { ...SINGLE_ELIM_8_QUARTERS[3], advanceWinnerTo: "SF2", advanceWinnerSide: "B" },
  {
    key: "SF1",
    round: 2,
    position: 1,
    name: "Semifinal 1",
    sourceA: winner("QF1"),
    sourceB: winner("QF2"),
    advanceWinnerTo: "F",
    advanceWinnerSide: "A",
  },
  {
    key: "SF2",
    round: 2,
    position: 2,
    name: "Semifinal 2",
    sourceA: winner("QF3"),
    sourceB: winner("QF4"),
    advanceWinnerTo: "F",
    advanceWinnerSide: "B",
  },
  {
    key: "F",
    round: 3,
    position: 1,
    name: "Final",
    sourceA: winner("SF1"),
    sourceB: winner("SF2"),
  },
];

// --- Full placement, 8 teams ----------------------------------------------
// Every team plays on to a final 1st-8th ranking: championship half plus a
// consolation half fed by the quarterfinal losers.
const FULL_PLACEMENT_8_NODES = [
  // Quarterfinals: winners advance up (semis), losers advance down (5-8 semis).
  {
    key: "QF1", round: 1, position: 1, name: "Quarterfinal 1",
    sourceA: seed(1), sourceB: seed(8),
    advanceWinnerTo: "SF1", advanceWinnerSide: "A",
    advanceLoserTo: "C1", advanceLoserSide: "A",
  },
  {
    key: "QF2", round: 1, position: 2, name: "Quarterfinal 2",
    sourceA: seed(4), sourceB: seed(5),
    advanceWinnerTo: "SF1", advanceWinnerSide: "B",
    advanceLoserTo: "C1", advanceLoserSide: "B",
  },
  {
    key: "QF3", round: 1, position: 3, name: "Quarterfinal 3",
    sourceA: seed(3), sourceB: seed(6),
    advanceWinnerTo: "SF2", advanceWinnerSide: "A",
    advanceLoserTo: "C2", advanceLoserSide: "A",
  },
  {
    key: "QF4", round: 1, position: 4, name: "Quarterfinal 4",
    sourceA: seed(2), sourceB: seed(7),
    advanceWinnerTo: "SF2", advanceWinnerSide: "B",
    advanceLoserTo: "C2", advanceLoserSide: "B",
  },
  // Championship semis.
  {
    key: "SF1", round: 2, position: 1, name: "Semifinal 1",
    sourceA: winner("QF1"), sourceB: winner("QF2"),
    advanceWinnerTo: "F", advanceWinnerSide: "A",
    advanceLoserTo: "P3", advanceLoserSide: "A",
  },
  {
    key: "SF2", round: 2, position: 2, name: "Semifinal 2",
    sourceA: winner("QF3"), sourceB: winner("QF4"),
    advanceWinnerTo: "F", advanceWinnerSide: "B",
    advanceLoserTo: "P3", advanceLoserSide: "B",
  },
  // Consolation semis (5th-8th bracket).
  {
    key: "C1", round: 2, position: 3, name: "5th-8th Semifinal 1",
    sourceA: loser("QF1"), sourceB: loser("QF2"),
    advanceWinnerTo: "P5", advanceWinnerSide: "A",
    advanceLoserTo: "P7", advanceLoserSide: "A",
  },
  {
    key: "C2", round: 2, position: 4, name: "5th-8th Semifinal 2",
    sourceA: loser("QF3"), sourceB: loser("QF4"),
    advanceWinnerTo: "P5", advanceWinnerSide: "B",
    advanceLoserTo: "P7", advanceLoserSide: "B",
  },
  // Placement finals.
  { key: "F", round: 3, position: 1, name: "Final (1st/2nd)", sourceA: winner("SF1"), sourceB: winner("SF2") },
  { key: "P3", round: 3, position: 2, name: "3rd place", sourceA: loser("SF1"), sourceB: loser("SF2") },
  { key: "P5", round: 3, position: 3, name: "5th place", sourceA: winner("C1"), sourceB: winner("C2") },
  { key: "P7", round: 3, position: 4, name: "7th place", sourceA: loser("C1"), sourceB: loser("C2") },
];

// --- Play-in / pre-quarters -----------------------------------------------
// Two play-in games decide the last two quarterfinal spots (seeds 5-8 play in;
// their winners meet seeds ranked above). Kept compact and self-contained.
const PLAY_IN_PREQUARTERS_NODES = [
  {
    key: "PI1", round: 1, position: 1, name: "Play-in 1",
    sourceA: seed(5), sourceB: seed(8),
    advanceWinnerTo: "QF1", advanceWinnerSide: "B",
  },
  {
    key: "PI2", round: 1, position: 2, name: "Play-in 2",
    sourceA: seed(6), sourceB: seed(7),
    advanceWinnerTo: "QF2", advanceWinnerSide: "B",
  },
  {
    key: "QF1", round: 2, position: 1, name: "Quarterfinal 1",
    sourceA: seed(1), sourceB: winner("PI1"),
  },
  {
    key: "QF2", round: 2, position: 2, name: "Quarterfinal 2",
    sourceA: seed(2), sourceB: winner("PI2"),
  },
];

// --- Double elimination, 4 teams ------------------------------------------
// Winners bracket + losers bracket + a single grand final (no bracket reset).
const DOUBLE_ELIM_4_NODES = [
  {
    key: "WSF1", round: 1, position: 1, name: "Winners Semifinal 1",
    sourceA: seed(1), sourceB: seed(4),
    advanceWinnerTo: "WF", advanceWinnerSide: "A",
    advanceLoserTo: "LR1", advanceLoserSide: "A",
  },
  {
    key: "WSF2", round: 1, position: 2, name: "Winners Semifinal 2",
    sourceA: seed(2), sourceB: seed(3),
    advanceWinnerTo: "WF", advanceWinnerSide: "B",
    advanceLoserTo: "LR1", advanceLoserSide: "B",
  },
  {
    key: "WF", round: 2, position: 1, name: "Winners Final",
    sourceA: winner("WSF1"), sourceB: winner("WSF2"),
    advanceWinnerTo: "GF", advanceWinnerSide: "A",
    advanceLoserTo: "LF", advanceLoserSide: "A",
  },
  {
    key: "LR1", round: 2, position: 2, name: "Losers Round 1",
    sourceA: loser("WSF1"), sourceB: loser("WSF2"),
    advanceWinnerTo: "LF", advanceWinnerSide: "B",
  },
  {
    key: "LF", round: 3, position: 1, name: "Losers Final",
    sourceA: loser("WF"), sourceB: winner("LR1"),
    advanceWinnerTo: "GF", advanceWinnerSide: "B",
  },
  {
    key: "GF", round: 4, position: 1, name: "Grand Final",
    sourceA: winner("WF"), sourceB: winner("LF"),
  },
];

export const BRACKET_TEMPLATES = [
  {
    id: "single_elim_4",
    label: "Single elimination — 4 teams",
    description: "Two semifinals into a final. Seeds 1v4 and 2v3.",
    bracketType: "single_elim",
    seedCount: 4,
    nodes: SINGLE_ELIM_4_NODES,
  },
  {
    id: "single_elim_4_3p",
    label: "Single elimination — 4 teams + 3rd place",
    description: "Semis into a final, plus a 3rd-place game for the semifinal losers.",
    bracketType: "single_elim",
    seedCount: 4,
    nodes: SINGLE_ELIM_4_3P_NODES,
  },
  {
    id: "single_elim_8",
    label: "Single elimination — 8 teams",
    description: "Quarterfinals (1v8, 4v5, 3v6, 2v7) into semis into a final.",
    bracketType: "single_elim",
    seedCount: 8,
    nodes: SINGLE_ELIM_8_NODES,
  },
  {
    id: "full_placement_8",
    label: "Full placement — 8 teams",
    description: "Every team plays on to a final 1st-8th ranking (championship + consolation halves).",
    bracketType: "placement",
    seedCount: 8,
    nodes: FULL_PLACEMENT_8_NODES,
  },
  {
    id: "play_in_prequarters",
    label: "Play-in / pre-quarters",
    description: "Two play-in games feed the last two quarterfinal spots.",
    bracketType: "play_in",
    seedCount: 8,
    nodes: PLAY_IN_PREQUARTERS_NODES,
  },
  {
    id: "double_elim_4",
    label: "Double elimination — 4 teams",
    description: "Winners bracket + losers bracket into a single grand final.",
    bracketType: "double_elim",
    seedCount: 4,
    nodes: DOUBLE_ELIM_4_NODES,
  },
];

export function listTemplates() {
  return BRACKET_TEMPLATES;
}

export function getTemplateById(id) {
  return BRACKET_TEMPLATES.find((template) => template.id === id) || null;
}

// True when every source of a node is a plain seed — i.e. the node is fully
// expressible in the wizard's pool_rank-only sketch model.
export function isSeedOnlyNode(node) {
  return (
    node?.sourceA?.kind === "seed" && node?.sourceB?.kind === "seed"
  );
}

// Default seed -> pool mapping using standard cross-pool seeding. `pools` is an
// ordered list of the event's pools; each entry needs at least an identity the
// caller understands (id or name) plus optional division info. Returns an object
// keyed by seed number: { [seed]: { poolIndex, rank } }. Callers turn poolIndex
// into a concrete pool_rank source (by id on the page, by name in the wizard).
//
// With P pools: Seed k -> pool[(k-1) % P] at rank 1 + floor((k-1)/P).
// (2 pools, 4 seeds -> S1=P0#1, S2=P1#1, S3=P0#2, S4=P1#2.)
// With no pools, everything maps to poolIndex 0 at rank = seed.
export function defaultSeedMap(seedCount, pools = []) {
  const poolCount = Array.isArray(pools) ? pools.length : 0;
  const map = {};
  for (let s = 1; s <= seedCount; s += 1) {
    if (poolCount <= 0) {
      map[s] = { poolIndex: 0, rank: s };
    } else {
      map[s] = {
        poolIndex: (s - 1) % poolCount,
        rank: 1 + Math.floor((s - 1) / poolCount),
      };
    }
  }
  return map;
}
