// ============================================================================
//  PLAYER CONTROLLER  —  the phone
// ============================================================================
//  Shows a join form, then whatever the current phase asks this player to do:
//  write answers, vote, or watch the big screen. Only ever sees its OWN
//  prompts and choices — the server keeps everyone else's hidden.
//
//  Reconnect: we stash {code, playerId} in sessionStorage so a refresh or a
//  dropped connection silently rejoins the same seat.
// ============================================================================

import { loadConfig, applyTheme, Net, fill, line, esc, secondsLeft } from '/client.js';

const app = document.getElementById('app');
const statusEl = document.getElementById('status');

const cfg = await loadConfig();
applyTheme(cfg.theme);
document.title = `${cfg.theme.logoText} — Play`;

const SS = window.sessionStorage;
let creds = readCreds();            // { code, playerId } or null
let joined = false;
let state = null;
let lastError = '';
let tickHandle = null;
let localAnswers = {};              // promptId → text typed but not yet sent

const params = new URLSearchParams(location.search);
const prefillCode = (params.get('code') || (creds && creds.code) || '').toUpperCase();

const net = new Net(onMessage, onStatus);
net.connect();

function onStatus(s) {
  if (s === 'open') {
    statusEl.classList.remove('show');
    // Auto-rejoin if we have a saved seat.
    if (creds) net.send({ t: 'rejoin', code: creds.code, playerId: creds.playerId });
    else if (!joined) renderJoin();
  } else {
    statusEl.textContent = cfg.copy.system[s === 'reconnecting' ? 'reconnecting' : 'connecting'];
    statusEl.classList.add('show');
  }
}

function onMessage(msg) {
  switch (msg.t) {
    case 'joined':
      joined = true;
      creds = { code: msg.code, playerId: msg.playerId };
      saveCreds(creds);
      lastError = '';
      break;
    case 'state':
      state = msg;
      render();
      break;
    case 'error':
      // A failed rejoin means our saved seat is gone — clear and show join.
      if (!joined) { clearCreds(); creds = null; }
      lastError = msg.message || cfg.copy.system.error;
      if (!joined) renderJoin();
      break;
    case 'ended':
      clearCreds(); creds = null; joined = false; state = null;
      renderEnded(msg.reason);
      break;
  }
}

// ---------------------------------------------------------------------------
//  Screens
// ---------------------------------------------------------------------------
function renderJoin() {
  stopTick();
  const c = cfg.copy.join;
  app.innerHTML = `
    <div class="stack" style="width:min(360px,92vw)">
      <div class="logo" style="font-size:clamp(36px,14vw,72px)">${esc(cfg.theme.logoText)}</div>
      <div class="pill">${esc(c.title)}</div>
      <input id="code" class="field code" maxlength="6" placeholder="${esc(c.codePlaceholder)}" value="${esc(prefillCode)}" />
      <input id="name" class="field" maxlength="20" placeholder="${esc(c.namePlaceholder)}" />
      <button id="join" class="btn big block">${esc(c.joinButton)}</button>
      ${lastError ? `<div style="color:var(--warn)">${esc(lastError)}</div>` : ''}
    </div>
  `;
  const codeEl = document.getElementById('code');
  const nameEl = document.getElementById('name');
  document.getElementById('join').onclick = doJoin;
  nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
  (prefillCode ? nameEl : codeEl).focus();

  function doJoin() {
    const code = codeEl.value.trim().toUpperCase();
    const name = nameEl.value.trim();
    if (!code || !name) return;
    net.send({ t: 'join', code, name });
  }
}

function render() {
  if (!state) return;
  stopTick();
  switch (state.phase) {
    case 'lobby': return renderWaiting(cfg.copy.join.joined);
    case 'writing': return renderWriting();
    case 'voting': return renderVoting();
    case 'result': return renderWaiting(cfg.copy.writing.allDone, true);
    case 'scoreboard': return renderStanding(cfg.copy.scoreboard.header);
    case 'final': return renderStanding(cfg.copy.final.thanks);
  }
}

function youBadge() {
  const y = state.you;
  if (!y) return '';
  return `<div class="chip"><span class="dot" style="background:${y.color}"></span>${esc(y.name)}
    <span class="muted" style="margin-left:6px">${y.score} pts</span></div>`;
}

function renderWaiting(text, watch = false) {
  app.innerHTML = `
    <div class="stack">
      ${youBadge()}
      <div class="h2 display">${esc(line(text))}</div>
      ${watch ? `<div class="muted">${esc(cfg.copy.voting.waitingToVote)}</div>` : ''}
    </div>`;
}

function renderWriting() {
  const c = cfg.copy.writing;
  // Find the first prompt this player hasn't answered yet.
  const prompts = state.prompts || [];
  const pending = prompts.find((p) => !p.answered);

  if (!pending) { return renderWaiting(c.submitted, true); }

  const idx = prompts.indexOf(pending);
  const label = idx === 0 ? c.prompt1Of2 : c.prompt2Of2;
  const draft = localAnswers[pending.id] || '';
  app.innerHTML = `
    <div class="stack" style="width:min(460px,94vw)">
      ${youBadge()}
      <div class="pill">${esc(label)}</div>
      <div class="prompt-text display" style="font-size:clamp(22px,7vw,34px)">${esc(pending.text)}</div>
      ${timerHtml()}
      <input id="ans" class="field" maxlength="120" placeholder="${esc(c.answerPlaceholder)}" value="${esc(draft)}" />
      <button id="submit" class="btn big block">${esc(c.submitButton)}</button>
    </div>`;
  const ansEl = document.getElementById('ans');
  ansEl.addEventListener('input', () => { localAnswers[pending.id] = ansEl.value; });
  ansEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  document.getElementById('submit').onclick = submit;
  ansEl.focus();
  startTick();

  function submit() {
    const text = ansEl.value.trim();
    if (!text) return;
    net.send({ t: 'answer', promptId: pending.id, text });
    delete localAnswers[pending.id];
    // Optimistically move on; server STATE will confirm.
    document.getElementById('submit').disabled = true;
  }
}

function renderVoting() {
  const c = cfg.copy.voting;
  const v = state.vote;
  if (v.isAuthor) return renderWaiting(c.cantVoteOwn, true);
  if (v.voted) return renderWaiting(c.voted, true);

  app.innerHTML = `
    <div class="stack" style="width:min(460px,94vw)">
      ${youBadge()}
      <div class="pill">${esc(c.voteInstruction)}</div>
      <div class="prompt-text display" style="font-size:clamp(20px,6vw,30px)">${esc(v.promptText)}</div>
      ${timerHtml()}
      <div class="stack" style="width:100%">
        ${v.options.map((o) => `<button class="option" data-choice="${o.choice}">${esc(o.text)}</button>`).join('')}
      </div>
    </div>`;
  app.querySelectorAll('.option').forEach((btn) => {
    btn.onclick = () => {
      app.querySelectorAll('.option').forEach((b) => b.classList.remove('chosen'));
      btn.classList.add('chosen');
      net.send({ t: 'vote', promptId: v.promptId, choice: btn.dataset.choice });
    };
  });
  startTick();
}

function renderStanding(footer) {
  const me = state.me;
  app.innerHTML = `
    <div class="stack">
      ${youBadge()}
      ${me ? `<div class="h1 display">#${me.rank}</div><div class="muted">${me.score} pts</div>` : ''}
      <div class="muted" style="margin-top:10px">${esc(line(footer))}</div>
    </div>`;
}

function renderEnded(reason) {
  stopTick();
  const msg = reason === 'host-left' ? cfg.copy.system.hostLeft : cfg.copy.system.error;
  app.innerHTML = `<div class="stack"><div class="h2 display">${esc(msg)}</div>
    <a class="btn" href="/play">Rejoin</a></div>`;
}

// ---------------------------------------------------------------------------
//  Timer (mirrors host) + creds persistence
// ---------------------------------------------------------------------------
function timerHtml() {
  return `<div class="timer" id="timer">
    <span id="timer-num">–</span>
    <span class="bar"><i id="timer-bar" style="width:100%"></i></span>
  </div>`;
}
function startTick() {
  stopTick();
  const total = phaseTotal();
  const paint = () => {
    const el = document.getElementById('timer');
    if (!el) return;
    const left = secondsLeft(state.timing);
    if (left == null) return;
    document.getElementById('timer-num').textContent = left;
    document.getElementById('timer-bar').style.width = `${Math.max(0, (left / total) * 100)}%`;
    el.classList.toggle('low', left <= 5);
  };
  paint();
  tickHandle = setInterval(paint, 250);
}
function stopTick() { if (tickHandle) clearInterval(tickHandle); tickHandle = null; }
function phaseTotal() {
  if (state.phase === 'writing') return cfg.rules.answerSeconds;
  if (state.phase === 'voting') return cfg.rules.voteSeconds;
  return 1;
}

function readCreds() { try { return JSON.parse(SS.getItem('quiplash') || 'null'); } catch { return null; } }
function saveCreds(c) { SS.setItem('quiplash', JSON.stringify(c)); }
function clearCreds() { SS.removeItem('quiplash'); }
