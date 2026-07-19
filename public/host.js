// ============================================================================
//  HOST SCREEN  —  the shared "TV"
// ============================================================================
//  Creates a room, shows the join code + QR, then renders whatever phase the
//  server says the game is in. It never decides game logic — it just draws the
//  latest STATE the server sends. All words come from config/copy.js (via cfg).
// ============================================================================

import { loadConfig, applyTheme, Net, fill, line, esc, secondsLeft } from '/client.js';

const app = document.getElementById('app');
const statusEl = document.getElementById('status');

const cfg = await loadConfig();
applyTheme(cfg.theme);
document.title = `${cfg.theme.logoText} — Host`;

let state = null;
let tickHandle = null;

const net = new Net(onMessage, onStatus);
net.connect();

function onStatus(s) {
  if (s === 'open') { statusEl.classList.remove('show'); net.send({ t: 'host_create' }); }
  else { statusEl.textContent = cfg.copy.system[s === 'reconnecting' ? 'reconnecting' : 'connecting']; statusEl.classList.add('show'); }
}

function onMessage(msg) {
  if (msg.t === 'state') { state = msg; render(); }
  else if (msg.t === 'ended') { renderEnded(msg.reason); }
}

// ---------------------------------------------------------------------------
//  Render — one function per phase
// ---------------------------------------------------------------------------
function render() {
  if (!state) return;
  stopTick();
  switch (state.phase) {
    case 'lobby': return renderLobby();
    case 'writing': return renderWriting();
    case 'voting': return renderVoting();
    case 'result': return renderResult();
    case 'scoreboard': return renderScoreboard();
    case 'final': return renderFinal();
  }
}

function renderLobby() {
  const c = cfg.copy.lobby;
  const players = state.players;
  const needMore = players.length < state.minPlayers;
  app.innerHTML = `
    <div class="stack">
      <div class="logo">${esc(cfg.theme.logoText)}</div>
      <div class="tagline">${esc(cfg.theme.tagline)}</div>
      <div class="muted" style="font-size:13px;letter-spacing:.04em">▶ this is the big screen — keep it up where everyone can see</div>
    </div>
    <div class="panel stack" style="margin-top:8px">
      <div class="pill">${esc(c.joinInstruction)}</div>
      <div class="joinurl">${esc(state.joinUrl)}</div>
      ${state.qr ? `<img class="qr" alt="Scan to join" src="${state.qr}" />` : ''}
      <div class="codebox">
        <div class="pill">${esc(c.codeLabel)}</div>
        <div class="code">${esc(state.code)}</div>
      </div>
    </div>

    <div class="chips">
      ${players.map((p) => chip(p, cfg.enableBots && p.isBot)).join('') || `<span class="muted">${esc(c.waitingForPlayers)}</span>`}
    </div>

    <div class="stack" style="margin-top:6px">
      <select id="pack" class="field" style="max-width:340px">
        ${state.packs.map((p) => `<option value="${p.id}" ${p.id === state.activePackId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
      <button id="start" class="btn big" ${state.canStart ? '' : 'disabled'}>${esc(c.startButton)}</button>
      ${cfg.enableBots ? `<button id="addbot" class="btn ghost">+ add CPU player</button>` : ''}
      <div class="muted">${needMore ? esc(fill(c.needMore, { n: state.minPlayers })) : esc(c.readyToStart)}</div>
    </div>
  `;
  document.getElementById('start').onclick = () => net.send({ t: 'start' });
  document.getElementById('pack').onchange = (e) => net.send({ t: 'set_pack', packId: e.target.value });
  const addbot = document.getElementById('addbot');
  if (addbot) addbot.onclick = () => net.send({ t: 'add_bot' });
  app.querySelectorAll('.chipx').forEach((b) => {
    b.onclick = () => net.send({ t: 'remove_bot', playerId: b.dataset.id });
  });
}

function chip(p, removable = false) {
  const tag = p.isBot ? `<span class="botflag">CPU</span>` : '';
  const x = removable ? `<button class="chipx" data-id="${esc(p.id)}" title="remove bot">✕</button>` : '';
  return `<span class="chip ${p.connected ? '' : 'off'}">
    <span class="dot" style="background:${p.color}"></span>${esc(p.name)}${tag}${x}</span>`;
}

function renderWriting() {
  const c = cfg.copy.writing;
  app.innerHTML = `
    <div class="pill">${esc(state.round.name)} · ${esc(state.packName)}</div>
    <div class="h1 display">${esc(c.hostHeader)}</div>
    <div class="muted">${esc(c.hostSub)}</div>
    ${timerHtml(cfg.rules.answerSeconds)}
    <div class="h2" style="margin-top:16px">${state.progress.done} / ${state.progress.total} done</div>
    <div class="chips">${state.players.map(chip).join('')}</div>
  `;
  startTick();
}

function renderVoting() {
  const c = cfg.copy.voting;
  const m = state.matchup;
  app.innerHTML = `
    <div class="pill">${esc(c.hostHeader)} · ${m.index + 1}/${m.total}</div>
    <div class="prompt-text display">${esc(m.promptText)}</div>
    <div class="answers vs-row">
      <div class="answer">${esc(m.options[0]?.text || '')}</div>
      <div class="vs-badge">${esc(c.vs)}</div>
      <div class="answer">${esc(m.options[1]?.text || '')}</div>
    </div>
    ${timerHtml(cfg.rules.voteSeconds)}
    <div class="muted">${m.votesIn} / ${m.votesNeeded} voted</div>
  `;
  startTick();
}

function renderResult() {
  const c = cfg.copy.results;
  const r = state.reveal;
  const [a, b] = r.options;
  const winA = (a.votes > b.votes);
  const winB = (b.votes > a.votes);
  const badge = r.quiplashWinner
    ? `<div class="badge">${esc(c.quiplash)}</div>`
    : (r.tie ? `<div class="badge">${esc(c.tie)}</div>`
      : (r.totalVotes === 0 ? `<div class="muted">${esc(c.noVotes)}</div>` : ''));
  app.innerHTML = `
    <div class="pill">${r.index + 1}/${r.total}</div>
    <div class="prompt-text display">${esc(r.promptText)}</div>
    ${badge}
    <div class="answers vs-row">
      ${answerReveal(a, winA, c)}
      <div class="vs-badge">${esc(cfg.copy.voting.vs)}</div>
      ${answerReveal(b, winB, c)}
    </div>
    ${timerHtml(cfg.rules.resultSeconds)}
  `;
  startTick();
}

function answerReveal(o, win, c) {
  return `<div class="answer ${win ? 'win' : ''}">
    <div>${esc(o.text)}
      <span class="author" style="color:${o.color}">— ${esc(o.name)}</span>
      <span class="votes">${o.votes} ${o.votes === 1 ? 'vote' : 'votes'} · +${o.points} ${esc(c.pointsSuffix)}</span>
    </div></div>`;
}

function renderScoreboard() {
  const c = cfg.copy.scoreboard;
  app.innerHTML = `
    <div class="h1 display">${esc(fill(c.roundOverHeader, { round: state.round.name }))}</div>
    ${rowsHtml(state.standings)}
    <button id="next" class="btn big" style="margin-top:14px">${esc(c.nextRoundButton)}</button>
  `;
  document.getElementById('next').onclick = () => net.send({ t: 'advance' });
}

function renderFinal() {
  const c = cfg.copy.final;
  const w = state.winners || [];
  const names = w.map((p) => p.name).join(' & ');
  const headline = w.length > 1
    ? fill(c.winnerTie, { name: names })
    : fill(c.winner, { name: names || '—' });
  app.innerHTML = `
    <div class="pill">${esc(c.header)}</div>
    <div class="logo" style="font-size:clamp(26px,6vw,72px)">${esc(headline)}</div>
    ${rowsHtml(state.standings)}
    <button id="again" class="btn big" style="margin-top:14px">${esc(c.playAgainButton)}</button>
    <div class="muted">${esc(c.thanks)}</div>
  `;
  document.getElementById('again').onclick = () => net.send({ t: 'play_again' });
}

function rowsHtml(rows) {
  return `<div class="rows">${rows.map((p) => `
    <div class="row ${p.rank === 1 ? 'leader' : ''}">
      <span class="rank">${p.rank}</span>
      <span class="dot" style="background:${p.color}"></span>
      <span class="name">${esc(p.name)}</span>
      <span class="score">${p.score}</span>
    </div>`).join('')}</div>`;
}

function renderEnded(reason) {
  stopTick();
  const msg = reason === 'host-left' ? cfg.copy.system.hostLeft : cfg.copy.system.disconnected;
  app.innerHTML = `<div class="stack"><div class="h2 display">${esc(msg)}</div>
    <a class="btn" href="/host">New game</a></div>`;
}

// ---------------------------------------------------------------------------
//  Timer rendering — a shrinking bar + seconds, ticked locally
// ---------------------------------------------------------------------------
function timerHtml(totalSeconds) {
  return `<div class="timer" id="timer" data-total="${totalSeconds}">
    <span id="timer-num">–</span>
    <span class="bar"><i id="timer-bar" style="width:100%"></i></span>
  </div>`;
}

function startTick() {
  stopTick();
  const paint = () => {
    const el = document.getElementById('timer');
    if (!el) return;
    const left = secondsLeft(state.timing);
    if (left == null) return;
    const total = Number(el.dataset.total) || 1;
    document.getElementById('timer-num').textContent = left;
    document.getElementById('timer-bar').style.width = `${Math.max(0, (left / total) * 100)}%`;
    el.classList.toggle('low', left <= 5);
  };
  paint();
  tickHandle = setInterval(paint, 250);
}
function stopTick() { if (tickHandle) clearInterval(tickHandle); tickHandle = null; }
