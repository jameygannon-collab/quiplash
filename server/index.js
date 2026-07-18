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
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

import { RoomManager } from './rooms.js';
import { C2S, S2C } from './protocol.js';
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
  console.log(`  (set BASE_URL env var when you deploy)\n`);
});
