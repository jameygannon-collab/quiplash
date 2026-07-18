// ============================================================================
//  PROMPTS  —  the questions players answer
// ============================================================================
//  A "pack" is a named set of prompts. The host picks a pack in the lobby
//  (or you set a default below). To make your own themed game, copy a pack,
//  rename it, and swap the lines.
//
//  Writing good prompts:
//   • Leave room for a funny answer — open-ended beats yes/no.
//   • Use "_____" where you want the blank to sit (optional, purely visual).
//   • Keep them short enough to read on a phone in 2 seconds.
//
//  You need at least `rules.maxPlayers` prompts in a pack so a full room
//  never runs out. The engine picks a fresh random subset each round.
// ============================================================================

export const packs = [
  {
    id: 'party',
    name: 'Party Pack',
    description: 'Classic, all-audiences party prompts.',
    prompts: [
      'The worst possible thing to say during a job interview',
      'A terrible name for a boat',
      'The real reason the dinosaurs went extinct',
      'A rejected slogan for a brand of toothpaste',
      "What aliens will be most confused about when they find Earth",
      'The worst superpower to have',
      'A bad thing to shout in a quiet library',
      'The title of the worst self-help book ever written',
      "A weird thing to be afraid of",
      'The most useless invention of all time',
      'What your pet is really thinking about you',
      'A terrible theme for a wedding',
      'The wrong way to answer the phone',
      'An unusual talent to list on your résumé',
      'The last thing you want to hear from your pilot',
      "A bad name for a superhero",
    ],
  },

  {
    id: 'work',
    name: 'Office Pack',
    description: 'For teams, offsites, and meetings that need saving.',
    prompts: [
      'The real subtext of "let\'s take this offline"',
      'A meeting that could have been an email — about what?',
      'The worst possible name for a company all-hands',
      'A corporate buzzword that should be banned forever',
      'What the "reply all" button was actually invented for',
      'The one perk that would make you never quit',
      'A terrible icebreaker question',
      'What your out-of-office reply really means',
      'The worst thing to say in a performance review',
      'A startup idea that absolutely should not get funded',
      'The true purpose of the office kitchen',
      'What Slack status you wish you could set',
      'A red flag in a job description',
      'The worst way to announce a company reorg',
      'A skill everyone lies about on LinkedIn',
      'The real reason the printer is jammed',
    ],
  },

  {
    id: 'spicy',
    name: 'Late Night Pack',
    description: 'A little bolder. Read the room before you pick this one.',
    prompts: [
      'The worst possible thing to whisper on a first date',
      'A confession that would end a friendship',
      'The real reason you left your last group chat',
      'A bad excuse for being three hours late',
      'The most embarrassing thing to have in your search history',
      'A terrible pickup line, but make it worse',
      'The one lie everyone tells at parties',
      'A secret you\'d take to the grave (make one up)',
      'The worst gift to give your in-laws',
      'What you\'d never admit to your therapist',
      'A rejected reality TV show concept',
      'The pettiest reason to end a relationship',
      'A very bad time to laugh',
      'The worst possible group Halloween costume',
      'Something you should never Google at 3am',
      'A truly cursed pizza topping',
    ],
  },
];

// Which pack the game defaults to if the host doesn't choose one.
export const defaultPackId = 'party';

// Helper: fetch a pack by id (falls back to the default).
export function getPack(id) {
  return packs.find((p) => p.id === id) || packs.find((p) => p.id === defaultPackId) || packs[0];
}
