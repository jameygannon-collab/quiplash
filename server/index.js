// ============================================================================
//  SERVER  —  wires the browser to the game
// ============================================================================
//  Express serves the three pages (landing / host / player) plus a /config
//  endpoint that hands your theme + copy to the browser. The websocket server
//  turns each incoming message into a call on the right Room. That's it —
//  all the game rules live in rooms.js and engine.js, all the words and looks
//  live in config/. You rarely need to touch this file.
// ============================================================================

import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

import { RoomManager } from './rooms.js';
import { C2S, S2C } from './protocol.js';
import { metrics } from './metrics.js';
import { getPacksDocument, writePacksDocument } from '../config/prompts.js';
import { commitPacksToGitHub } from './github.js';
import { theme } from '../config/theme.js';
import { copy } from '../config/copy.js';
import { rules } from '../config/rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

// Where phones should point their browser. On a real deploy, set BASE_URL to
// your public https URL. For local play over wifi, we guess your Mac's LAN IP
// so the QR code actually resolves from a phone on the same network.
const BASE_URL = process.env.BASE_URL || `http://${lanIp()}:${PORT}`;

// Feature flags / secrets (all optional; set as env vars).
//  ENABLE_BOTS=1   → show the host lobby "Add bot" button (solo testing)
//  ADMIN_PASSWORD  → password for the /admin console (unset = admin disabled)
//  GITHUB_TOKEN    → lets the admin console commit pack edits back to the repo
const ENABLE_BOTS = process.env.ENABLE_BOTS === '1';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
// Secret used to sign admin session cookies. Derived from the password so it's
// stable across restarts (admin stays logged in through a redeploy).
const ADMIN_SECRET = crypto.createHash('sha256').update('quiplash:' + ADMIN_PASSWORD).digest();

function lanIp() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const net of iface || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

// ---------------------------------------------------------------------------
//  HTTP
// ---------------------------------------------------------------------------
const app = express();
app.use(express.static(PUBLIC));

app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.get('/host', (_req, res) => res.sendFile(path.join(PUBLIC, 'host.html')));
app.get('/play', (_req, res) => res.sendFile(path.join(PUBLIC, 'player.html')));

// The browser pulls its look + words from here, so config/ is the one source
// of truth for both server and client.
app.get('/config', (_req, res) => {
  res.json({
    theme,
    copy,
    enableBots: ENABLE_BOTS,
    rules: {
      minPlayers: rules.minPlayers,
      maxPlayers: rules.maxPlayers,
      rounds: rules.rounds,
      answerSeconds: rules.answerSeconds,
      voteSeconds: rules.voteSeconds,
      resultSeconds: rules.resultSeconds,
    },
  });
});

// ---------------------------------------------------------------------------
//  ADMIN CONSOLE  —  password-gated stats + pack editor
// ---------------------------------------------------------------------------
//  Auth model: POST the ADMIN_PASSWORD to /admin/login → get a signed, httpOnly
//  session cookie (HMAC over an expiry, keyed by ADMIN_SECRET). /admin/api/*
//  routes require a valid cookie. No new dependencies — just node:crypto.

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (!h) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function passwordOk(input) {
  if (!ADMIN_PASSWORD) return false;
  const a = Buffer.from(String(input || ''));
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  if (verifyToken(parseCookies(req).admin)) return next();
  res.status(401).json({ error: 'unauthorized' });
}

// Serve the console shell (login is handled client-side against the API).
app.get('/admin', (_req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).send('Admin console is disabled. Set ADMIN_PASSWORD to enable it.');
  }
  res.sendFile(path.join(PUBLIC, 'admin.html'));
});

// JSON body parsing for admin routes only (keeps the game paths untouched).
app.use('/admin', express.json({ limit: '1mb' }));

// Small in-memory login rate limit (per IP, resets after 15 min).
const loginAttempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { count: 0, ts: now };
  if (now - rec.ts > 15 * 60 * 1000) { rec.count = 0; rec.ts = now; }
  rec.count += 1;
  loginAttempts.set(ip, rec);
  return rec.count > 10;
}

app.post('/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'admin disabled' });
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many attempts. Wait a few minutes.' });
  if (!passwordOk(req.body && req.body.password)) {
    return res.status(401).json({ error: 'Wrong password.' });
  }
  const token = signToken({ iat: Date.now(), exp: Date.now() + 8 * 60 * 60 * 1000 });
  const secure = BASE_URL.startsWith('https');
  res.setHeader(
    'Set-Cookie',
    `admin=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${8 * 60 * 60}${secure ? '; Secure' : ''}`,
  );
  res.json({ ok: true });
});

app.post('/admin/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'admin=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// Live snapshot: active rooms + since-restart counters.
app.get('/admin/api/state', requireAdmin, (_req, res) => {
  const roomList = [...rooms.rooms.values()].map((r) => ({
    code: r.code,
    phase: r.phase,
    packId: r.packId,
    playerCount: r.players.size,
    players: r.publicPlayers().map((p) => ({ name: p.name, score: p.score, isBot: p.isBot })),
    round: r.game ? r.game.roundIndex + 1 : null,
  }));
  res.json({ rooms: roomList, roomCount: roomList.length, metrics, enableBots: ENABLE_BOTS });
});

// Read the current packs document for the editor.
app.get('/admin/api/packs', requireAdmin, (_req, res) => {
  res.json(getPacksDocument());
});

// Validate + save a new packs document, then try to commit it back to GitHub.
app.put('/admin/api/packs', requireAdmin, async (req, res) => {
  const doc = req.body;
  const err = validatePacksDoc(doc);
  if (err) return res.status(400).json({ error: err });

  // Sanitize into a clean, minimal document.
  const clean = {
    defaultPackId: doc.defaultPackId || doc.packs[0].id,
    packs: doc.packs.map((pk) => ({
      id: String(pk.id).trim(),
      name: String(pk.name).trim(),
      description: typeof pk.description === 'string' ? pk.description.trim() : '',
      prompts: pk.prompts
        .filter((s) => typeof s === 'string' && s.trim())
        .map((s) => s.trim()),
    })),
  };

  try {
    writePacksDocument(clean); // local write + reload → live for the next round
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save on the server: ' + e.message });
  }

  const { committed, warning } = await commitPacksToGitHub(JSON.stringify(clean, null, 2) + '\n');
  res.json({ ok: true, committed, warning });
});

function validatePacksDoc(doc) {
  if (!doc || !Array.isArray(doc.packs)) return 'packs must be an array';
  if (doc.packs.length === 0) return 'You need at least one pack.';
  const ids = new Set();
  for (const pk of doc.packs) {
    if (!pk || typeof pk.id !== 'string' || !pk.id.trim()) return 'Every pack needs an id.';
    const id = pk.id.trim();
    if (ids.has(id)) return `Duplicate pack id: "${id}".`;
    ids.add(id);
    if (typeof pk.name !== 'string' || !pk.name.trim()) return `Pack "${id}" needs a name.`;
    if (!Array.isArray(pk.prompts)) return `Pack "${id}" prompts must be a list.`;
    const real = pk.prompts.filter((s) => typeof s === 'string' && s.trim());
    if (real.length < rules.maxPlayers) {
      return `Pack "${pk.name || id}" needs at least ${rules.maxPlayers} prompts (has ${real.length}).`;
    }
  }
  if (doc.defaultPackId && !ids.has(String(doc.defaultPackId).trim())) {
    return 'The default pack must be one of the packs.';
  }
  return null;
}

const server = http.createServer(app);

// ---------------------------------------------------------------------------
//  WebSockets
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server });
const rooms = new RoomManager();

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    try { await handle(ws, msg); } catch (err) {
      console.error('message error:', err);
      send(ws, { t: S2C.ERROR, code: 'error', message: copy.system.error });
    }
  });

  ws.on('close', () => {
    const room = ws.roomCode && rooms.get(ws.roomCode);
    if (room) room.connectionClosed(ws);
  });
});

async function handle(ws, msg) {
  switch (msg.t) {
    // ---- create a room (a host screen) ----
    case C2S.HOST_CREATE: {
      const room = rooms.create(BASE_URL);
      if (msg.packId) room.setPack(msg.packId);
      room.qr = await QRCode.toDataURL(room.joinUrl, { margin: 1, width: 320 });
      ws.roomCode = room.code;
      ws.role = 'host';
      room.setHost(ws);
      send(ws, { t: S2C.HOSTED, code: room.code, joinUrl: room.joinUrl });
      break;
    }

    // ---- join a room (a phone) ----
    case C2S.JOIN: {
      const room = rooms.get(msg.code);
      if (!room) return send(ws, { t: S2C.ERROR, code: 'roomNotFound', message: copy.join.roomNotFound });
      const result = room.addPlayer(msg.name, ws);
      if (result.error) return send(ws, { t: S2C.ERROR, code: result.error, message: result.message });
      ws.roomCode = room.code;
      ws.role = 'player';
      ws.playerId = result.playerId;
      send(ws, { t: S2C.JOINED, code: room.code, playerId: result.playerId, name: result.name });
      break;
    }

    // ---- reconnect after a drop ----
    case C2S.REJOIN: {
      const room = rooms.get(msg.code);
      if (!room) return send(ws, { t: S2C.ERROR, code: 'roomNotFound', message: copy.join.roomNotFound });
      const result = room.rejoin(msg.playerId, ws);
      if (result.error) return send(ws, { t: S2C.ERROR, code: result.error, message: result.message });
      ws.roomCode = room.code;
      ws.role = 'player';
      ws.playerId = result.playerId;
      send(ws, { t: S2C.JOINED, code: room.code, playerId: result.playerId, name: result.name });
      break;
    }

    // ---- everything else acts on the room this ws already belongs to ----
    default: {
      const room = ws.roomCode && rooms.get(ws.roomCode);
      if (!room) return;
      routeGameMessage(room, ws, msg);
    }
  }
}

function routeGameMessage(room, ws, msg) {
  switch (msg.t) {
    case C2S.SET_PACK:
      if (ws.role === 'host') room.setPack(msg.packId);
      break;
    case C2S.ADD_BOT:
      if (ws.role === 'host' && ENABLE_BOTS) room.addBot();
      break;
    case C2S.REMOVE_BOT:
      if (ws.role === 'host' && ENABLE_BOTS) room.removeBot(msg.playerId);
      break;
    case C2S.START:
      if (ws.role === 'host') room.start();
      break;
    case C2S.ADVANCE:
      if (ws.role === 'host') room.advance();
      break;
    case C2S.PLAY_AGAIN:
      if (ws.role === 'host') room.playAgain();
      break;
    case C2S.ANSWER:
      if (ws.role === 'player') room.submitAnswer(ws.playerId, msg.promptId, msg.text);
      break;
    case C2S.VOTE:
      if (ws.role === 'player') room.vote(ws.playerId, msg.promptId, msg.choice);
      break;
    default:
      break;
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// Drop dead connections so rooms clean up. Ping every 30s.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`\n  Quiplash server running`);
  console.log(`  Host screen:  http://localhost:${PORT}/host`);
  console.log(`  Phones join:  ${BASE_URL}/play`);
  console.log(`  Admin:        ${ADMIN_PASSWORD ? `http://localhost:${PORT}/admin` : 'disabled (set ADMIN_PASSWORD)'}`);
  console.log(`  Test bots:    ${ENABLE_BOTS ? 'on (Add bot button in lobby)' : 'off (set ENABLE_BOTS=1)'}`);
  console.log(`  (set BASE_URL env var when you deploy)\n`);
});
