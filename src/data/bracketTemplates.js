// Standard playoff bracket templates.
//
// A template is an abstract, event-agnostic topology. It is instantiated against
// a real event by:
//   - mapping each abstract SEED (1..seedCount) to a concrete source (a pool
//     finishing position, or a chosen team), and
//   - wiring winner/loser SOURCES and advancement between nodes by their stable
//     within-template `key` (resolved to real bracket_node ids at apply time).
//
// Shapes (documented, plain JS — no TS in this module):
//
//   TemplateSource:
//     { kind: "seed",   seed: number }   -> becomes the caller's seed payload
//     { kind: "winner", node: string }   -> winner of another template node (key)
//     { kind: "loser",  node: string }   -> loser of another template node (key)
//     { kind: "swiss",  game: number, side: "A"|"B" }
//                                        -> Swiss pairing worked out from the
//                                           earlier rounds' results (see
//                                           buildSwissTemplate below)
//     { kind: "swiss_bye" } / { kind: "bye" }
//                                        -> the two sides of a Swiss bye slot
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
// Templates only declare SOURCES. The advance* fields — which the bracket views
// draw their connectors from — are derived from those sources by
// defineTemplate, so a connector can never disagree with where a team actually
// comes from. defineTemplate also refuses a template that skips a seed, uses a
// result twice, or feeds a game in the same or an earlier round, so a broken
// template fails at load rather than on an operator's event.
//
// `bracketType` must be one of the existing BRACKET_TYPES values used across the
// app: "single_elim" | "double_elim" | "placement" | "play_in" | "swiss".

const seed = (n) => ({ kind: "seed", seed: n });
const winner = (node) => ({ kind: "winner", node });
const loser = (node) => ({ kind: "loser", node });
const swiss = (game, side) => ({ kind: "swiss", game, side });
// A Swiss bye slot: one side is the team sitting out (a seed in round 1, the
// engine's choice after that), the other is the bye itself.
const swissBye = () => ({ kind: "swiss_bye" });
const bye = () => ({ kind: "bye" });
const game = (key, round, position, name, sourceA, sourceB) => ({
  key,
  round,
  position,
  name,
  sourceA,
  sourceB,
});

const ADVANCE_FIELDS = {
  winner: { to: "advanceWinnerTo", side: "advanceWinnerSide" },
  loser: { to: "advanceLoserTo", side: "advanceLoserSide" },
};

function defineTemplate(template) {
  const label = template.id || template.label || "template";
  const nodes = template.nodes.map((node) => ({ ...node }));
  const byKey = new Map();
  nodes.forEach((node) => {
    if (byKey.has(node.key)) {
      throw new Error(`Template ${label}: duplicate node key "${node.key}".`);
    }
    byKey.set(node.key, node);
  });

  const seedUses = new Map();
  nodes.forEach((node) => {
    [
      ["A", node.sourceA],
      ["B", node.sourceB],
    ].forEach(([side, source]) => {
      if (source?.kind === "seed") {
        seedUses.set(source.seed, (seedUses.get(source.seed) || 0) + 1);
        return;
      }
      const fields = ADVANCE_FIELDS[source?.kind];
      if (!fields) return;

      const upstream = byKey.get(source.node);
      if (!upstream) {
        throw new Error(`Template ${label}: ${node.key} reads unknown node "${source.node}".`);
      }
      if (upstream.round >= node.round) {
        throw new Error(`Template ${label}: ${upstream.key} must feed a later round than ${node.key}.`);
      }
      if (upstream[fields.to]) {
        throw new Error(`Template ${label}: the ${source.kind} of ${upstream.key} is used twice.`);
      }
      upstream[fields.to] = node.key;
      upstream[fields.side] = side;
    });
  });

  for (let s = 1; s <= template.seedCount; s += 1) {
    if (seedUses.get(s) !== 1) {
      throw new Error(`Template ${label}: seed ${s} must appear exactly once.`);
    }
  }
  if (seedUses.size !== template.seedCount) {
    throw new Error(`Template ${label}: uses seeds beyond its seed count.`);
  }

  return { ...template, nodes };
}

// --- Swiss draw -------------------------------------------------------------
// Unlike the fixed templates below, a Swiss draw is generated from its size and
// format, laid out as one column per round and one row per game.
//
// Round 1 is seeded (the usual seed mapping). Every later game is a "swiss"
// source, filled by the server's Swiss engine (api/_lib/swissDraw.js) from the
// results so far: game 1 is the top pairing; side A is the higher ranked.
// There are no winner/loser links, so a Swiss draw has no connectors: who
// meets whom is decided by the standings, not by a fixed path.
//
// Formats:
//   fixed   — every team plays `roundCount` rounds.
//   advance — teams play until `winsToAdvance` wins (advance) or
//             `lossesToExit` losses (out), at most wins + losses - 1 rounds.
//             The field shrinks, so later rounds carry games marked
//             "Not needed this round" when fewer teams are left.
//
// An odd team count gets a bye slot every round; advance-or-out also gets one
// from round 2 (the teams still in can be an odd number). A bye counts as a
// win with no points. The draw's options travel as the bracket's settings
// (brackets.settings.swiss), which the engine reads.
export const SWISS_TEMPLATE_ID = "swiss";
export const SWISS_MIN_TEAMS = 4;
export const SWISS_MAX_TEAMS = 64;
export const SWISS_MIN_ROUNDS = 2;
export const SWISS_MAX_WINS_OR_LOSSES = 10;
export const SWISS_MAX_MARGIN_CAP = 99;

export const SWISS_FORMATS = [
  { value: "fixed", label: "Fixed number of rounds" },
  { value: "advance", label: "Advance or out (play to a number of wins or losses)" },
];

export const SWISS_FIRST_ROUND_PAIRINGS = [
  {
    value: "split",
    label: "Top half vs bottom half (1 v 5, 2 v 6, ...)",
  },
  {
    value: "fold",
    label: "Highest vs lowest (1 v 8, 2 v 7, ...)",
  },
  {
    value: "adjacent",
    label: "Neighbouring seeds (1 v 2, 3 v 4, ...)",
  },
];

export const SWISS_TIEBREAK_OPTIONS = [
  { value: "point_difference", label: "Point difference" },
  { value: "strength_of_schedule", label: "Strength of schedule, then point difference" },
];

export const SWISS_PAIRING_TIMING_OPTIONS = [
  { value: "0", label: "After each round (most accurate)" },
  { value: "1", label: "One round behind (for back-to-back rounds)" },
];

// Keep in step with DEFAULT_SWISS_SETTINGS in api/_lib/swissDraw.js.
export const DEFAULT_SWISS_OPTIONS = {
  teamCount: 8,
  format: "fixed",
  roundCount: 3,
  winsToAdvance: 3,
  lossesToExit: 3,
  firstRoundPairing: "split",
  tiebreak: "point_difference",
  marginCap: "",
  pairingLag: "0",
};

const toNumber = (value) => (value === "" || value == null ? Number.NaN : Number(value));

// Most rounds before a rematch is forced: a full round robin. With an odd count
// every team also sits out once, which takes one extra round.
function maxSwissRounds(teamCount) {
  return teamCount % 2 === 0 ? teamCount - 1 : teamCount;
}

export function swissRoundCount(options = {}) {
  const merged = { ...DEFAULT_SWISS_OPTIONS, ...options };
  return merged.format === "advance"
    ? toNumber(merged.winsToAdvance) + toNumber(merged.lossesToExit) - 1
    : toNumber(merged.roundCount);
}

// Returns an error message, or "" when the options can build a draw.
export function validateSwissOptions(options = {}) {
  const merged = { ...DEFAULT_SWISS_OPTIONS, ...options };
  const teamCount = toNumber(merged.teamCount);

  if (!Number.isInteger(teamCount) || teamCount < SWISS_MIN_TEAMS || teamCount > SWISS_MAX_TEAMS) {
    return `Teams must be a whole number from ${SWISS_MIN_TEAMS} to ${SWISS_MAX_TEAMS}.`;
  }
  if (!SWISS_FORMATS.some((option) => option.value === merged.format)) {
    return "Choose a format.";
  }

  const maxRounds = maxSwissRounds(teamCount);
  if (merged.format === "advance") {
    const wins = toNumber(merged.winsToAdvance);
    const losses = toNumber(merged.lossesToExit);
    if (!Number.isInteger(wins) || wins < 1 || wins > SWISS_MAX_WINS_OR_LOSSES) {
      return `Wins to advance must be a whole number from 1 to ${SWISS_MAX_WINS_OR_LOSSES}.`;
    }
    if (!Number.isInteger(losses) || losses < 1 || losses > SWISS_MAX_WINS_OR_LOSSES) {
      return `Losses to be out must be a whole number from 1 to ${SWISS_MAX_WINS_OR_LOSSES}.`;
    }
    const rounds = wins + losses - 1;
    if (rounds < SWISS_MIN_ROUNDS) {
      return "Wins to advance plus losses to be out must be at least 3.";
    }
    if (rounds > maxRounds) {
      return `${teamCount} teams can play at most ${maxRounds} rounds without rematches; this needs up to ${rounds}.`;
    }
    if (String(merged.pairingLag) === "1") {
      return "Pairing one round behind needs a fixed number of rounds: with advance or out, who is still in depends on the round in play.";
    }
  } else {
    const rounds = toNumber(merged.roundCount);
    if (!Number.isInteger(rounds) || rounds < SWISS_MIN_ROUNDS) {
      return `Rounds must be a whole number of at least ${SWISS_MIN_ROUNDS}.`;
    }
    if (rounds > maxRounds) {
      return `${teamCount} teams can play at most ${maxRounds} rounds without rematches.`;
    }
  }

  if (!SWISS_FIRST_ROUND_PAIRINGS.some((option) => option.value === merged.firstRoundPairing)) {
    return "Choose a round 1 pairing.";
  }
  if (!SWISS_TIEBREAK_OPTIONS.some((option) => option.value === merged.tiebreak)) {
    return "Choose a ranking tie-break.";
  }
  if (merged.marginCap !== "" && merged.marginCap != null) {
    const cap = toNumber(merged.marginCap);
    if (!Number.isInteger(cap) || cap < 1 || cap > SWISS_MAX_MARGIN_CAP) {
      return `Margin cap must be blank (no cap) or a whole number from 1 to ${SWISS_MAX_MARGIN_CAP}.`;
    }
  }
  if (!SWISS_PAIRING_TIMING_OPTIONS.some((option) => option.value === String(merged.pairingLag))) {
    return "Choose when rounds are paired.";
  }
  return "";
}

function firstRoundSeeds(playingCount, pairing, gameNumber) {
  const half = playingCount / 2;
  if (pairing === "fold") return [gameNumber, playingCount + 1 - gameNumber];
  if (pairing === "adjacent") return [gameNumber * 2 - 1, gameNumber * 2];
  return [gameNumber, gameNumber + half];
}

/** The bracket settings a set of Swiss options produces. */
export function buildSwissSettings(options = {}) {
  const merged = { ...DEFAULT_SWISS_OPTIONS, ...options };
  const cap = toNumber(merged.marginCap);
  return {
    swiss: {
      mode: merged.format === "advance" ? "advance" : "fixed",
      winsToAdvance: toNumber(merged.winsToAdvance),
      lossesToExit: toNumber(merged.lossesToExit),
      tiebreak: merged.tiebreak,
      marginCap: Number.isInteger(cap) && cap > 0 ? cap : null,
      pairingLag: merged.format === "fixed" && String(merged.pairingLag) === "1" ? 1 : 0,
    },
  };
}

export function buildSwissTemplate(options = DEFAULT_SWISS_OPTIONS) {
  const merged = { ...DEFAULT_SWISS_OPTIONS, ...options };
  const error = validateSwissOptions(merged);
  if (error) {
    throw new Error(error);
  }

  const teamCount = toNumber(merged.teamCount);
  const isOdd = teamCount % 2 === 1;
  const playingCount = isOdd ? teamCount - 1 : teamCount;
  const gamesPerRound = playingCount / 2;
  const roundCount = swissRoundCount(merged);
  const isAdvance = merged.format === "advance";
  const nodes = [];

  for (let round = 1; round <= roundCount; round += 1) {
    const isFirstRound = round === 1;
    for (let gameNumber = 1; gameNumber <= gamesPerRound; gameNumber += 1) {
      const [seedA, seedB] = isFirstRound
        ? firstRoundSeeds(playingCount, merged.firstRoundPairing, gameNumber)
        : [null, null];
      nodes.push(
        game(
          `R${round}G${gameNumber}`,
          round,
          gameNumber,
          `Round ${round} game ${gameNumber}`,
          isFirstRound ? seed(seedA) : swiss(gameNumber, "A"),
          isFirstRound ? seed(seedB) : swiss(gameNumber, "B"),
        ),
      );
    }
    // Round 1's bye goes to the lowest seed; later byes are chosen by the
    // engine (lowest-ranked team without one).
    const needsByeSlot = isFirstRound ? isOdd : isOdd || isAdvance;
    if (needsByeSlot) {
      nodes.push(
        game(
          `R${round}BYE`,
          round,
          gamesPerRound + 1,
          `Round ${round} bye`,
          isFirstRound ? seed(teamCount) : swissBye(),
          bye(),
        ),
      );
    }
  }

  const wins = toNumber(merged.winsToAdvance);
  const losses = toNumber(merged.lossesToExit);
  const formatText = isAdvance
    ? `Teams play until ${wins} win${wins === 1 ? "" : "s"} (advance) or ${losses} loss${losses === 1 ? "" : "es"} (out), at most ${roundCount} rounds; games a round does not need are marked "Not needed".`
    : `${roundCount} rounds of ${gamesPerRound} games.`;
  const byeText = isOdd ? " Odd team count: one team sits out each round, and a bye counts as a win." : "";

  return defineTemplate({
    id: SWISS_TEMPLATE_ID,
    label: isAdvance
      ? `Swiss draw — ${teamCount} teams, ${wins} wins advance, ${losses} losses out`
      : `Swiss draw — ${teamCount} teams, ${roundCount} rounds`,
    description:
      `${formatText} Round 1 is seeded; each later round pairs teams on the same record ` +
      `once the results it depends on are in, avoiding rematches.${byeText}`,
    bracketType: "swiss",
    seedCount: teamCount,
    nodes,
    settings: buildSwissSettings(merged),
    configurable: true,
  });
}

// --- Single elimination ------------------------------------------------------
// Seeds sit in bracket order so the top two can only meet in the final, the
// top four only in the semis, and so on.

const SEMIS_AND_FINAL_4 = [
  game("SF1", 1, 1, "Semifinal 1", seed(1), seed(4)),
  game("SF2", 1, 2, "Semifinal 2", seed(2), seed(3)),
  game("F", 2, 1, "Final", winner("SF1"), winner("SF2")),
];
const THIRD_PLACE_AFTER_SEMIS = (round, position) =>
  game("P3", round, position, "3rd place", loser("SF1"), loser("SF2"));

// QF1 1v8, QF2 4v5, QF3 3v6, QF4 2v7 — QF1/QF2 make the top half.
const QUARTERS_TO_FINAL_8 = [
  game("QF1", 1, 1, "Quarterfinal 1", seed(1), seed(8)),
  game("QF2", 1, 2, "Quarterfinal 2", seed(4), seed(5)),
  game("QF3", 1, 3, "Quarterfinal 3", seed(3), seed(6)),
  game("QF4", 1, 4, "Quarterfinal 4", seed(2), seed(7)),
  game("SF1", 2, 1, "Semifinal 1", winner("QF1"), winner("QF2")),
  game("SF2", 2, 2, "Semifinal 2", winner("QF3"), winner("QF4")),
  game("F", 3, 1, "Final", winner("SF1"), winner("SF2")),
];

// 1v16, 8v9, 5v12, 4v13 | 3v14, 6v11, 7v10, 2v15.
const ROUND_OF_16_PAIRS = [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [3, 14],
  [6, 11],
  [7, 10],
  [2, 15],
];
const SINGLE_ELIM_16_3P_NODES = [
  ...ROUND_OF_16_PAIRS.map(([a, b], index) =>
    game(`R16_${index + 1}`, 1, index + 1, `Round of 16 game ${index + 1}`, seed(a), seed(b)),
  ),
  ...[1, 2, 3, 4].map((n) =>
    game(`QF${n}`, 2, n, `Quarterfinal ${n}`, winner(`R16_${n * 2 - 1}`), winner(`R16_${n * 2}`)),
  ),
  game("SF1", 3, 1, "Semifinal 1", winner("QF1"), winner("QF2")),
  game("SF2", 3, 2, "Semifinal 2", winner("QF3"), winner("QF4")),
  game("F", 4, 1, "Final", winner("SF1"), winner("SF2")),
  THIRD_PLACE_AFTER_SEMIS(4, 2),
];

// --- Full placement, 8 teams ------------------------------------------------
// Every team plays on to a final 1st-8th ranking: championship half plus a
// consolation half fed by the quarterfinal losers.
const FULL_PLACEMENT_8_NODES = [
  ...QUARTERS_TO_FINAL_8.filter((node) => node.round < 3),
  game("C1", 2, 3, "5th-8th semifinal 1", loser("QF1"), loser("QF2")),
  game("C2", 2, 4, "5th-8th semifinal 2", loser("QF3"), loser("QF4")),
  game("F", 3, 1, "Final", winner("SF1"), winner("SF2")),
  THIRD_PLACE_AFTER_SEMIS(3, 2),
  game("P5", 3, 3, "5th place", winner("C1"), winner("C2")),
  game("P7", 3, 4, "7th place", loser("C1"), loser("C2")),
];

// --- Play-ins -----------------------------------------------------------------
// 6 teams, top two seeds bye into the semis. The play-in losers play for 5th,
// so every team gets a final placing.
const PLAY_IN_6_NODES = [
  game("PI1", 1, 1, "Play-in 1", seed(4), seed(5)),
  game("PI2", 1, 2, "Play-in 2", seed(3), seed(6)),
  game("SF1", 2, 1, "Semifinal 1", seed(1), winner("PI1")),
  game("SF2", 2, 2, "Semifinal 2", seed(2), winner("PI2")),
  game("P5", 2, 3, "5th place", loser("PI1"), loser("PI2")),
  game("F", 3, 1, "Final", winner("SF1"), winner("SF2")),
  THIRD_PLACE_AFTER_SEMIS(3, 2),
];

// 12 teams, top four seeds bye into the quarters; seeds 5-12 play
// pre-quarters, ordered so each winner meets the seed a full 16 bracket would
// give it (8/9 winner plays 1, 5/12 plays 4, 6/11 plays 3, 7/10 plays 2).
const PRE_QUARTERS_12_NODES = [
  game("PQ1", 1, 1, "Pre-quarterfinal 1", seed(8), seed(9)),
  game("PQ2", 1, 2, "Pre-quarterfinal 2", seed(5), seed(12)),
  game("PQ3", 1, 3, "Pre-quarterfinal 3", seed(6), seed(11)),
  game("PQ4", 1, 4, "Pre-quarterfinal 4", seed(7), seed(10)),
  game("QF1", 2, 1, "Quarterfinal 1", seed(1), winner("PQ1")),
  game("QF2", 2, 2, "Quarterfinal 2", seed(4), winner("PQ2")),
  game("QF3", 2, 3, "Quarterfinal 3", seed(3), winner("PQ3")),
  game("QF4", 2, 4, "Quarterfinal 4", seed(2), winner("PQ4")),
  game("SF1", 3, 1, "Semifinal 1", winner("QF1"), winner("QF2")),
  game("SF2", 3, 2, "Semifinal 2", winner("QF3"), winner("QF4")),
  game("F", 4, 1, "Final", winner("SF1"), winner("SF2")),
  THIRD_PLACE_AFTER_SEMIS(4, 2),
];

// --- Double elimination -------------------------------------------------------
// Winners bracket + losers bracket into a single grand final (no bracket reset:
// a conditional "if needed" game cannot be expressed as a fixed node).

const DOUBLE_ELIM_4_NODES = [
  game("WSF1", 1, 1, "Winners semifinal 1", seed(1), seed(4)),
  game("WSF2", 1, 2, "Winners semifinal 2", seed(2), seed(3)),
  game("WF", 2, 1, "Winners final", winner("WSF1"), winner("WSF2")),
  game("LR1", 2, 2, "Losers round 1", loser("WSF1"), loser("WSF2")),
  game("LF", 3, 1, "Losers final", loser("WF"), winner("LR1")),
  game("GF", 4, 1, "Grand final", winner("WF"), winner("LF")),
];

// Winners semifinal losers cross over into the losers bracket (WSF1's loser
// meets the bottom half's survivor and vice versa), so nobody replays the team
// that just knocked them down.
const DOUBLE_ELIM_8_NODES = [
  game("WR1_1", 1, 1, "Winners round 1 game 1", seed(1), seed(8)),
  game("WR1_2", 1, 2, "Winners round 1 game 2", seed(4), seed(5)),
  game("WR1_3", 1, 3, "Winners round 1 game 3", seed(3), seed(6)),
  game("WR1_4", 1, 4, "Winners round 1 game 4", seed(2), seed(7)),
  game("WSF1", 2, 1, "Winners semifinal 1", winner("WR1_1"), winner("WR1_2")),
  game("WSF2", 2, 2, "Winners semifinal 2", winner("WR1_3"), winner("WR1_4")),
  game("LR1_1", 2, 3, "Losers round 1 game 1", loser("WR1_1"), loser("WR1_2")),
  game("LR1_2", 2, 4, "Losers round 1 game 2", loser("WR1_3"), loser("WR1_4")),
  game("WF", 3, 1, "Winners final", winner("WSF1"), winner("WSF2")),
  game("LR2_1", 3, 2, "Losers round 2 game 1", winner("LR1_1"), loser("WSF2")),
  game("LR2_2", 3, 3, "Losers round 2 game 2", winner("LR1_2"), loser("WSF1")),
  game("LSF", 4, 1, "Losers semifinal", winner("LR2_1"), winner("LR2_2")),
  game("LF", 5, 1, "Losers final", loser("WF"), winner("LSF")),
  game("GF", 6, 1, "Grand final", winner("WF"), winner("LF")),
];

export const BRACKET_TEMPLATES = [
  {
    id: "single_elim_4",
    label: "Single elimination — 4 teams",
    description: "Two semifinals into a final. Seeds 1v4 and 2v3.",
    bracketType: "single_elim",
    seedCount: 4,
    nodes: SEMIS_AND_FINAL_4,
  },
  {
    id: "single_elim_4_3p",
    label: "Single elimination — 4 teams + 3rd place",
    description: "Semis into a final, plus a 3rd-place game for the semifinal losers. Places 1st-4th.",
    bracketType: "single_elim",
    seedCount: 4,
    nodes: [...SEMIS_AND_FINAL_4, THIRD_PLACE_AFTER_SEMIS(2, 2)],
  },
  {
    id: "single_elim_8",
    label: "Single elimination — 8 teams",
    description: "Quarterfinals (1v8, 4v5, 3v6, 2v7) into semis into a final.",
    bracketType: "single_elim",
    seedCount: 8,
    nodes: QUARTERS_TO_FINAL_8,
  },
  {
    id: "single_elim_8_3p",
    label: "Single elimination — 8 teams + 3rd place",
    description: "Quarterfinals into semis into a final, plus a 3rd-place game. Places 1st-4th.",
    bracketType: "single_elim",
    seedCount: 8,
    nodes: [...QUARTERS_TO_FINAL_8, THIRD_PLACE_AFTER_SEMIS(3, 2)],
  },
  {
    id: "single_elim_16_3p",
    label: "Single elimination — 16 teams + 3rd place",
    description: "Round of 16 into quarters, semis and a final, plus a 3rd-place game. Places 1st-4th.",
    bracketType: "single_elim",
    seedCount: 16,
    nodes: SINGLE_ELIM_16_3P_NODES,
  },
  {
    id: "full_placement_8",
    label: "Full placement — 8 teams",
    description:
      "Every team plays on to a final 1st-8th ranking: quarterfinal losers play a 5th-8th bracket.",
    bracketType: "placement",
    seedCount: 8,
    nodes: FULL_PLACEMENT_8_NODES,
  },
  {
    id: "play_in_6",
    label: "Play-in — 6 teams, top 2 byes",
    description:
      "Seeds 3-6 play in for the two semifinal spots against seeds 1 and 2. Play-in losers play for 5th. Places 1st-6th.",
    bracketType: "play_in",
    seedCount: 6,
    nodes: PLAY_IN_6_NODES,
  },
  {
    id: "pre_quarters_12",
    label: "Pre-quarters — 12 teams, top 4 byes",
    description:
      "Seeds 5-12 play pre-quarters; winners meet seeds 1-4 in the quarterfinals. Semis, final and 3rd place. Places 1st-4th.",
    bracketType: "play_in",
    seedCount: 12,
    nodes: PRE_QUARTERS_12_NODES,
  },
  {
    id: "double_elim_4",
    label: "Double elimination — 4 teams",
    description: "Winners bracket + losers bracket into a single grand final (no bracket reset).",
    bracketType: "double_elim",
    seedCount: 4,
    nodes: DOUBLE_ELIM_4_NODES,
  },
  {
    id: "double_elim_8",
    label: "Double elimination — 8 teams",
    description:
      "Winners bracket + losers bracket into a single grand final (no bracket reset). A team is out after two losses.",
    bracketType: "double_elim",
    seedCount: 8,
    nodes: DOUBLE_ELIM_8_NODES,
  },
].map(defineTemplate);

// The Swiss entry is listed with its default size; pass `swissOptions` to
// getTemplateById to build the size the operator actually chose.
export function listTemplates() {
  return [...BRACKET_TEMPLATES, { ...buildSwissTemplate(DEFAULT_SWISS_OPTIONS), label: "Swiss draw" }];
}

export function getTemplateById(id, swissOptions = DEFAULT_SWISS_OPTIONS) {
  if (id === SWISS_TEMPLATE_ID) {
    return validateSwissOptions({ ...DEFAULT_SWISS_OPTIONS, ...swissOptions })
      ? null
      : buildSwissTemplate(swissOptions);
  }
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
