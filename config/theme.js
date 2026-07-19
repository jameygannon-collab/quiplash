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
  //  "Redacted file at 3am": near-black paper, typewriter ink, highlighter yellow.
  brand: '#FFD400',            // primary accent — highlighter yellow (the highlight)
  brandInk: '#010101',         // near-black text that sits ON the yellow
  bg: '#010101',               // page background (near-pure black)
  bgPanel: '#141414',          // cards / panels — a hair lighter than the bg
  ink: '#f2f0e6',              // main text color (warm off-white typewriter ink)
  inkMuted: '#8f8a7a',         // secondary/label text (faded pencil)
  good: '#3ad07a',             // "you're in" / success (green that reads on black)
  warn: '#ff8c1a',             // low-timer / caution (orange, distinct from the yellow brand)

  // A pool of colors auto-assigned to players (one each, in order).
  // Bright tones so chips read on the near-black background.
  playerColors: [
    '#FFD400', '#3d9bff', '#3ad07a', '#ff8c1a',
    '#b06bff', '#ff6ba1', '#25d0d6', '#ff7a4d',
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
