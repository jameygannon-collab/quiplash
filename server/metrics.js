// ============================================================================
//  METRICS  —  lightweight in-memory counters for the admin console
// ============================================================================
//  There is no database by design, so these are "since last restart" totals.
//  rooms.js bumps them; the admin /admin/api/state route reads them. They reset
//  to zero whenever the server restarts (including every Render redeploy).
// ============================================================================

export const metrics = {
  roomsCreated: 0,
  gamesStarted: 0,
  answersSubmitted: 0,
  votesCast: 0,
};
