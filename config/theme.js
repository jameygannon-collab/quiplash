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
  logoText: 'QUIPLASH',            // big wordmark on the host lobby screen
  tagline: 'the truth is in the votes', // small line under the logo

  // --- Colors --------------------------------------------------------------
  //  "Conspiracy corkboard": manila paper, typewriter ink, dried-red stamp.
  brand: '#B0160B',            // primary accent — stamped red (dial to #EB1000 for hotter)
  brandInk: '#f4ecd8',         // paper color that sits ON the red
  bg: '#e4dcc4',               // page background (manila / aged paper)
  bgPanel: '#efe8d4',          // cards / panels — a slightly lighter paper
  ink: '#1c1710',              // main text color (near-black typewriter ink)
  inkMuted: '#726a54',         // secondary/label text (faded pencil)
  good: '#3f6b34',             // "you're in" / success (stamp green)
  warn: '#9a5a00',             // low-timer / caution (aged amber)

  // A pool of colors auto-assigned to players (one each, in order).
  // Muted ink/stamp tones so chips read on the light paper background.
  playerColors: [
    '#B0160B', '#2f4a6b', '#3f6b34', '#9a5a00',
    '#5a3a6b', '#8a3a5a', '#2a5f62', '#a5502a',
  ],

  // --- Type ----------------------------------------------------------------
  // Typewriter / redacted-document feel. The woff2 files are self-hosted in
  // public/fonts and declared via @font-face at the top of public/app.css —
  // no external font request. Name the families here; the stacks fall back to
  // the system monospace if a file ever fails to load.
  fontDisplay: '"Special Elite", "Courier New", ui-monospace, monospace', // headings / logo
  fontBody: '"Courier Prime", ui-monospace, "Courier New", monospace',    // everything else

  // --- Shape ---------------------------------------------------------------
  radius: '2px',               // near-sharp corners — paper edges, not glossy pills
};
