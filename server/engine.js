// ============================================================================
//  ENGINE  —  the pure game math
// ============================================================================
//  No sockets, no timers, no state stored here. Just functions that take
//  inputs and return results, so the tricky bits (who answers what, who won)
//  are easy to reason about and test on their own.
// ============================================================================

// --- Randomness helpers ------------------------------------------------------

/** Return a shuffled copy of an array (Fisher–Yates). */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick one random element. */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- Prompt assignment -------------------------------------------------------

/**
 * Build this round's prompts and decide who answers each.
 *
 * The classic Quiplash guarantee: every player writes exactly TWO answers,
 * and every prompt receives exactly TWO answers, written by two DIFFERENT
 * players. We get that with a circular pairing:
 *
 *   player[k] is assigned prompt[k] and prompt[(k+1) % N]
 *
 * so prompt[k] ends up answered by player[k] and player[k-1]. Works for any
 * player count >= 2 (odd counts included).
 *
 * @param {string[]} playerIds   ids of the active players, any order
 * @param {string[]} promptTexts a pool of prompt strings (>= playerIds.length)
 * @returns {Array<{id, text, answerers: [id, id]}>}
 */
export function assignPrompts(playerIds, promptTexts) {
  const n = playerIds.length;
  const ids = shuffle(playerIds);
  const texts = shuffle(promptTexts).slice(0, n); // one prompt per player

  return texts.map((text, k) => ({
    id: `p${k}`,
    text,
    // the two players responsible for this prompt
    answerers: [ids[k], ids[(k - 1 + n) % n]],
  }));
}

// --- Scoring -----------------------------------------------------------------

/**
 * Score a single prompt matchup once voting is done.
 *
 * Points ( rules.pointsPerPrompt * roundMultiplier ) are split between the two
 * answers in proportion to the votes they received. A unanimous win — every
 * available vote — earns an extra `quiplashBonus`. Blank answers never score.
 *
 * @param {object} prompt   { answerers:[a,b], answers:{id:text}, votes:{voterId:choiceId} }
 * @param {object} rules    the rules config
 * @param {number} roundMultiplier
 * @returns {{ awards: Object<playerId, number>, tally: Object<playerId, number>,
 *            quiplashWinner: string|null, totalVotes: number, tie: boolean }}
 */
export function scorePrompt(prompt, rules, roundMultiplier) {
  const [a, b] = prompt.answerers;
  const votes = prompt.votes || {};

  // Count votes per answer.
  const tally = { [a]: 0, [b]: 0 };
  for (const choice of Object.values(votes)) {
    if (choice === a || choice === b) tally[choice] += 1;
  }
  const totalVotes = tally[a] + tally[b];

  const pot = rules.pointsPerPrompt * roundMultiplier;
  const awards = { [a]: 0, [b]: 0 };

  if (totalVotes > 0) {
    // Proportional split. A blank/"no answer" answer is disqualified from
    // earning even if it somehow drew a vote.
    for (const id of [a, b]) {
      const answered = hasRealAnswer(prompt.answers?.[id]);
      if (answered) awards[id] = Math.round(pot * (tally[id] / totalVotes));
    }
  }

  // Unanimous? (all votes to one side, and there was real competition)
  let quiplashWinner = null;
  if (totalVotes > 0 && (tally[a] === 0 || tally[b] === 0)) {
    const winner = tally[a] === 0 ? b : a;
    if (hasRealAnswer(prompt.answers?.[winner])) {
      awards[winner] += rules.quiplashBonus;
      quiplashWinner = winner;
    }
  }

  const tie = totalVotes > 0 && tally[a] === tally[b];

  return { awards, tally, quiplashWinner, totalVotes, tie };
}

/** A "real" answer is a non-empty, non-placeholder string. */
export function hasRealAnswer(text) {
  return typeof text === 'string' && text.trim().length > 0;
}

// --- Standings ---------------------------------------------------------------

/**
 * Sort players into ranked standings.
 * @param {Array<{id, name, score}>} players
 * @returns {Array<{id, name, score, rank}>} highest score first, rank is 1-based
 *          with ties sharing a rank.
 */
export function standings(players) {
  const sorted = players.slice().sort((x, y) => y.score - x.score);
  let lastScore = null;
  let lastRank = 0;
  return sorted.map((p, i) => {
    const rank = p.score === lastScore ? lastRank : i + 1;
    lastScore = p.score;
    lastRank = rank;
    return { ...p, rank };
  });
}

/** The winner(s): everyone tied at rank 1. */
export function winners(players) {
  const ranked = standings(players);
  return ranked.filter((p) => p.rank === 1);
}
