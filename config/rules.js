// ============================================================================
//  RULES  —  the knobs that change how the game plays
// ============================================================================
//  Edit these numbers and restart the server. Nothing else needs to change.
//  Every value has a comment telling you exactly what it controls.
// ============================================================================

export const rules = {
  // --- Player counts -------------------------------------------------------
  minPlayers: 3,          // game can't start until this many have joined
  maxPlayers: 8,          // extra people become spectators (they can still watch)

  // --- Rounds --------------------------------------------------------------
  // One entry per round. `multiplier` scales the points that round is worth,
  // so later rounds matter more (classic Quiplash doubles round 2).
  // Add or remove entries to add or remove rounds.
  rounds: [
    { name: 'Round 1', multiplier: 1 },
    { name: 'Round 2', multiplier: 2 },
  ],

  // --- Timers (seconds) ----------------------------------------------------
  answerSeconds: 60,      // how long players get to write their answers
  voteSeconds: 15,        // how long to vote on each head-to-head matchup
  resultSeconds: 6,       // how long the result of each matchup stays on screen
  // If everyone submits / votes early, the game advances immediately —
  // it never waits out the full timer once all input is in.

  // --- Scoring -------------------------------------------------------------
  pointsPerPrompt: 1000,  // base points a single prompt matchup is worth
  // Points are split between the two answers in proportion to their votes.
  // (Get 3 of 4 votes → you earn 3/4 of the pot.)
  quiplashBonus: 500,     // extra points for winning a matchup UNANIMOUSLY
  // ("QUIPLASH!" — you took every available vote.)

  // --- Answering behaviour -------------------------------------------------
  // If a player runs out of time, they're auto-given a random "safety quip"
  // from config/copy.js so voting still has two answers. Set to false to
  // instead show a blank "(no answer)" — a blank answer can still be voted on
  // but never earns points.
  useSafetyQuips: true,

  // --- Room lifecycle ------------------------------------------------------
  roomIdleMinutes: 30,    // an empty/abandoned room is cleaned up after this
  roomCodeLength: 4,      // length of the join code shown on the host screen
};

// Convenience: total number of rounds, derived from the array above.
export const roundCount = rules.rounds.length;
