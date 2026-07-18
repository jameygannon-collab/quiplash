// ============================================================================
//  THEME  —  the look of the game
// ============================================================================
//  These values are sent to the browser and applied as CSS variables, so
//  changing a color here changes it everywhere (host screen + phones) with
//  no CSS editing. For deeper changes, the variables are used in
//  public/app.css — search for `var(--brand)` etc.
//
//  `logoText` shows big on the lobby screen. Swap it for your event/brand.
// ============================================================================

export const theme = {
  // --- Identity ------------------------------------------------------------
  logoText: 'QUIPLASH',        // big wordmark on the host lobby screen
  tagline: 'answer. vote. win.', // small line under the logo

  // --- Colors --------------------------------------------------------------
  brand: '#EB1000',            // primary accent — buttons, highlights, timer
  brandInk: '#ffffff',         // text/icon color that sits ON the brand color
  bg: '#0b0b12',               // page background (deep near-black)
  bgPanel: '#16161f',          // cards / panels sitting on the background
  ink: '#f4f4f8',              // main text color
  inkMuted: '#9a9ab0',         // secondary/label text
  good: '#33d17a',             // "you're in" / success states
  warn: '#ffb000',             // low-timer / caution states

  // A pool of colors auto-assigned to players (one each, in order).
  // Add more if you raise rules.maxPlayers past this list's length —
  // it wraps around safely, but unique colors read best.
  playerColors: [
    '#EB1000', '#2d7dff', '#33d17a', '#ffb000',
    '#a15bff', '#ff5ba1', '#00c2c7', '#ff7a29',
  ],

  // --- Type ----------------------------------------------------------------
  // Any font stack you like. To use a hosted webfont, add its <link> in
  // public/host.html + public/player.html and name it here.
  fontDisplay: '"Georgia", "Times New Roman", serif',   // big headings / logo
  fontBody: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',

  // --- Shape ---------------------------------------------------------------
  radius: '16px',              // corner rounding on cards + buttons
};
