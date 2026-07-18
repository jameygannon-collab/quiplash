// ============================================================================
//  PROTOCOL  —  the shared vocabulary between browser and server
// ============================================================================
//  Both the client and the server import these constants so a typo can't
//  silently break a message. Client → Server and Server → Client message
//  types are listed separately for clarity.
// ============================================================================

// ---- Client → Server --------------------------------------------------------
export const C2S = {
  HOST_CREATE: 'host_create', // a screen wants to host a new room  { packId? }
  JOIN: 'join',               // a phone joins a room               { code, name }
  REJOIN: 'rejoin',           // reconnect after a drop             { code, playerId }
  SET_PACK: 'set_pack',       // host changes the prompt pack       { packId }
  ADD_BOT: 'add_bot',         // host adds a test bot player (needs ENABLE_BOTS)
  REMOVE_BOT: 'remove_bot',   // host removes a test bot            { playerId }
  START: 'start',             // host starts the game
  ANSWER: 'answer',           // player submits an answer           { promptId, text }
  VOTE: 'vote',               // player votes in a matchup          { promptId, choice }
  ADVANCE: 'advance',         // host clicks "next" on a scoreboard
  PLAY_AGAIN: 'play_again',   // host restarts back to the lobby
};

// ---- Server → Client --------------------------------------------------------
export const S2C = {
  HOSTED: 'hosted',     // room created; here's your code + QR   { code, joinUrl, qr, ... }
  JOINED: 'joined',     // you (a player) are in                 { playerId, ... }
  STATE: 'state',       // a fresh view of the game (tailored per recipient)
  ERROR: 'error',       // something you tried didn't work       { code, message }
  ENDED: 'ended',       // the room closed                       { reason }
};

// ---- Game phases (also used as the `phase` field in STATE) ------------------
export const PHASE = {
  LOBBY: 'lobby',
  WRITING: 'writing',
  VOTING: 'voting',
  RESULT: 'result',         // showing the outcome of one matchup
  SCOREBOARD: 'scoreboard', // between rounds
  FINAL: 'final',
};

// ---- Who a connection is ----------------------------------------------------
export const ROLE = {
  HOST: 'host',
  PLAYER: 'player',
};
