// ============================================================================
//  COPY  —  every word the game says
// ============================================================================
//  All on-screen text lives here so you can rewrite the game's personality
//  without touching logic. Change the host's tone, translate it, brand it.
//
//  Some lines are arrays — the game picks one at random each time, which is
//  how the "host" feels alive. Add or remove lines freely.
//
//  {tokens} in a string get filled in by the game:
//    {name}   a player's name        {code} the room join code
//    {round}  the round's name        {n}   a number (e.g. players needed)
// ============================================================================

export const copy = {
  // --- Lobby ---------------------------------------------------------------
  lobby: {
    joinInstruction: 'Grab your phone and go to',
    codeLabel: 'Room code',
    waitingForPlayers: 'Waiting for players…',
    needMore: 'Need at least {n} players to start',
    readyToStart: 'Ready when you are',
    startButton: 'Start game',
    playerJoined: ['{name} is in', '{name} joined', 'welcome, {name}'],
  },

  // --- Player: joining -----------------------------------------------------
  join: {
    title: 'Join the game',
    codePlaceholder: 'ROOM CODE',
    namePlaceholder: 'Your name',
    joinButton: 'Join',
    joined: "You're in! Look at the big screen.",
    roomNotFound: "Can't find that room. Check the code.",
    nameTaken: 'Someone already took that name.',
    roomFull: 'That room is full.',
    gameStarted: 'That game already started.',
  },

  // --- Writing phase -------------------------------------------------------
  writing: {
    hostHeader: 'Answer your prompts!',
    hostSub: 'Check your phone',
    prompt1Of2: 'Prompt 1 of 2',
    prompt2Of2: 'Prompt 2 of 2',
    answerPlaceholder: 'Type something funny…',
    submitButton: 'Submit',
    submitted: 'Got it! Waiting for everyone else…',
    allDone: 'Nice. Sit tight.',
    timeLabel: 'Time left',
  },

  // --- Voting phase --------------------------------------------------------
  voting: {
    hostHeader: 'Vote for your favorite!',
    hostSub: 'Which answer is better?',
    yourAnswerHost: 'This one\'s yours — sit this vote out',
    voteInstruction: 'Tap the funnier answer',
    voted: 'Voted! Watch the screen.',
    cantVoteOwn: "You wrote one of these — you can't vote.",
    waitingToVote: 'Waiting for the votes…',
    vs: 'VS',
  },

  // --- Results -------------------------------------------------------------
  results: {
    quiplash: 'QUIPLASH!',        // shown on a unanimous win
    tie: "It's a tie!",
    noVotes: 'Nobody voted… awkward.',
    pointsSuffix: 'pts',
  },

  // --- Scoreboard ----------------------------------------------------------
  scoreboard: {
    header: 'Scoreboard',
    roundOverHeader: '{round} over',
    nextRoundButton: 'Next round',
    leader: 'in the lead',
  },

  // --- Final ---------------------------------------------------------------
  final: {
    header: 'And the winner is…',
    winner: '{name} wins!',
    winnerTie: "It's a tie — {name} share the crown!",
    playAgainButton: 'Play again',
    thanks: 'gg. thanks for playing.',
  },

  // --- Safety quips --------------------------------------------------------
  // Auto-filled for players who run out of time (if rules.useSafetyQuips).
  // Keep them generically funny so they fit almost any prompt.
  safetyQuips: [
    'my phone died, use your imagination',
    'this, but funnier',
    'honestly? no comment',
    'a wizard did it',
    'the answer was inside you all along',
    "[dramatic silence]",
    'ask my lawyer',
  ],

  // --- Bot answers ---------------------------------------------------------
  // What test "bot" players submit when ENABLE_BOTS is on. Kept generically
  // funny so they read fine against any prompt while you're testing solo.
  botAnswers: [
    'trust me, i went to clown college',
    'the government does not want you to know this',
    'a horse. the answer is always a horse',
    'i plead the fifth',
    'my therapist and i are still working on it',
    'ethically? no. legally? also no',
    'depends who is asking',
    'this is why i was banned from the group chat',
    'my mother warned me about days like this',
    'ah yes, the forbidden option',
    'i have a PowerPoint prepared for exactly this',
    'live, laugh, commit crimes',
    'the vibes were simply off',
    'i learned this on the streets. of minecraft',
    'no notes. perfect. flawless. chaos',
    'somewhere, a pigeon is very proud of me',
    'i regret nothing and everything',
    'this incident will not be added to my permanent record',
  ],

  // --- Generic / system ----------------------------------------------------
  system: {
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    disconnected: 'Lost connection. Trying to get back in…',
    hostLeft: 'The host left. Game over.',
    error: 'Something went wrong.',
  },
};
