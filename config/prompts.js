// ============================================================================
//  PROMPTS  —  the questions players answer
// ============================================================================
//  A "pack" is a named set of prompts. The host picks a pack in the lobby
//  (or you set a default). The actual pack DATA now lives in data/packs.json
//  so the admin console can edit it at runtime — this file is just the loader.
//
//  Because packs are read from disk (not baked into this module), edits made
//  through the admin console take effect on the very next round with no server
//  restart: getPack() below is called fresh each round in server/rooms.js.
//
//  Writing good prompts:
//   • Leave room for a funny answer — open-ended beats yes/no.
//   • Keep them short enough to read on a phone in 2 seconds.
//
//  You need at least `rules.maxPlayers` prompts in a pack so a full room never
//  runs out. The engine picks a fresh random subset each round.
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DATA_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'data', 'packs.json',
);

// In-memory cache of the packs document. Swapped wholesale by reloadPacks().
let state = load();

function load() {
  const doc = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  const packs = Array.isArray(doc.packs) ? doc.packs : [];
  const defaultPackId = doc.defaultPackId || (packs[0] && packs[0].id) || null;
  return { packs, defaultPackId };
}

// Re-read data/packs.json from disk. Call after a save so edits go live.
export function reloadPacks() {
  state = load();
  return state;
}

// Current packs array (live — reflects the latest saved edits).
export function getPacks() {
  return state.packs;
}

// The pack the game defaults to if the host doesn't choose one.
export function getDefaultPackId() {
  return state.defaultPackId;
}

// Fetch a pack by id (falls back to the default, then the first pack).
export function getPack(id) {
  return (
    state.packs.find((p) => p.id === id) ||
    state.packs.find((p) => p.id === state.defaultPackId) ||
    state.packs[0]
  );
}

// The whole document, for the admin editor to read.
export function getPacksDocument() {
  return { defaultPackId: state.defaultPackId, packs: state.packs };
}

// Persist a new document to disk and reload it live. Callers should validate
// first (see server/index.js). Does NOT commit to git — that's the caller's job.
export function writePacksDocument(doc) {
  writeFileSync(DATA_FILE, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return reloadPacks();
}
