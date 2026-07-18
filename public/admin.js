// ============================================================================
//  ADMIN CONSOLE  —  password-gated stats + pack editor
// ============================================================================
//  Logs in against /admin/login (sets an httpOnly cookie), then talks to the
//  /admin/api/* endpoints. Two panels: live stats (auto-refreshing) and a pack
//  editor that saves back to the server AND commits to GitHub so edits survive
//  redeploys. Inherits the game's theme so it matches the reskin automatically.
// ============================================================================

import { loadConfig, applyTheme, esc } from '/client.js';

const app = document.getElementById('app');

const cfg = await loadConfig();
applyTheme(cfg.theme);
document.title = `${cfg.theme.logoText} — Admin`;

let packsDoc = null;        // the editable packs document
let statsTimer = null;      // auto-refresh handle
let lastRoomCount = 0;      // for the "live games" save warning

boot();

async function boot() {
  const res = await fetch('/admin/api/state');
  if (res.status === 401) return renderLogin();
  if (!res.ok) return renderLogin('Something went wrong. Try logging in again.');
  renderConsole(await res.json());
}

// ---------------------------------------------------------------------------
//  Login
// ---------------------------------------------------------------------------
function renderLogin(errMsg = '') {
  stopStatsPolling();
  app.classList.add('screen');
  app.innerHTML = `
    <div class="stack" style="width:min(360px,92vw)">
      <div class="logo" style="font-size:clamp(22px,7vw,40px)">${esc(cfg.theme.logoText)}</div>
      <div class="pill">restricted · admin</div>
      <input id="pw" class="field" type="password" placeholder="password" autocomplete="current-password" />
      <button id="go" class="btn big block">enter</button>
      <div id="err" style="color:var(--warn)">${esc(errMsg)}</div>
    </div>`;
  const pw = document.getElementById('pw');
  const err = document.getElementById('err');
  document.getElementById('go').onclick = login;
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  pw.focus();

  async function login() {
    err.textContent = '';
    const r = await fetch('/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: pw.value }),
    });
    if (r.ok) { boot(); return; }
    const j = await r.json().catch(() => ({}));
    err.textContent = j.error || 'Login failed.';
  }
}

// ---------------------------------------------------------------------------
//  Console shell
// ---------------------------------------------------------------------------
async function renderConsole(state) {
  if (!packsDoc) {
    const pr = await fetch('/admin/api/packs');
    if (pr.status === 401) return renderLogin();
    packsDoc = await pr.json();
  }
  app.classList.remove('screen');
  app.innerHTML = `
    <div class="admin-wrap">
      <div class="admin-head">
        <div class="logo" style="font-size:clamp(18px,5vw,30px)">${esc(cfg.theme.logoText)} · admin</div>
        <button id="logout" class="btn ghost">log out</button>
      </div>
      <div id="stats" class="card"></div>
      <div id="editor"></div>
    </div>`;
  document.getElementById('logout').onclick = async () => {
    await fetch('/admin/logout', { method: 'POST' });
    packsDoc = null;
    renderLogin();
  };
  drawStats(state);
  drawEditor();
  startStatsPolling();
}

// ---------------------------------------------------------------------------
//  Stats panel (auto-refreshed; never clobbers the editor)
// ---------------------------------------------------------------------------
function drawStats(state) {
  const el = document.getElementById('stats');
  if (!el) return;
  lastRoomCount = state.roomCount || 0;
  const m = state.metrics || {};
  const rooms = state.rooms || [];
  el.innerHTML = `
    <div class="admin-h">live</div>
    <div class="statgrid">
      ${statTile('active rooms', state.roomCount)}
      ${statTile('rooms created', m.roomsCreated)}
      ${statTile('games started', m.gamesStarted)}
      ${statTile('answers', m.answersSubmitted)}
      ${statTile('votes', m.votesCast)}
    </div>
    ${rooms.length ? `
      <table class="rtable">
        <thead><tr><th>room</th><th>phase</th><th>pack</th><th>players</th></tr></thead>
        <tbody>${rooms.map((r) => `
          <tr>
            <td>${esc(r.code)}</td>
            <td>${esc(r.phase)}</td>
            <td>${esc(r.packId)}</td>
            <td>${esc(r.players.map((p) => p.name + (p.isBot ? ' *' : '')).join(', ')) || '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : `<div class="muted" style="margin-top:10px">no active rooms right now</div>`}
    <div class="muted" style="margin-top:8px;font-size:12px">
      counters are since last restart · auto-refresh 5s · bots marked *
    </div>`;
}

function statTile(label, n) {
  return `<div class="stat"><div class="statn">${Number(n || 0)}</div><div class="statl">${esc(label)}</div></div>`;
}

// ---------------------------------------------------------------------------
//  Pack editor
// ---------------------------------------------------------------------------
function drawEditor() {
  const el = document.getElementById('editor');
  if (!el) return;
  el.innerHTML = `
    <div class="admin-h" style="margin-top:24px">prompt packs</div>
    <div class="muted" style="font-size:13px;margin-bottom:12px">
      one prompt per line. saving writes to the server and commits to github —
      which triggers a ~1–2 min redeploy that ends any game in progress, so edit between games.
    </div>
    <div class="row2" style="margin-bottom:6px">
      <label class="pill" for="defpack">default pack</label>
      <select id="defpack" class="field" style="max-width:300px">
        ${packsDoc.packs.map((p) => `<option value="${esc(p.id)}" ${p.id === packsDoc.defaultPackId ? 'selected' : ''}>${esc(p.name)} (${esc(p.id)})</option>`).join('')}
      </select>
    </div>
    <div id="packs">${packsDoc.packs.map((p, i) => packCard(p, i)).join('')}</div>
    <div class="stack" style="margin-top:16px;align-items:stretch;max-width:420px">
      <button id="addpack" class="btn ghost">+ add pack</button>
      <button id="save" class="btn big">save + commit</button>
      <div id="savemsg" style="min-height:20px"></div>
    </div>`;

  document.getElementById('addpack').onclick = () => {
    collect();
    const n = packsDoc.packs.length + 1;
    packsDoc.packs.push({ id: `pack${n}`, name: 'New Pack', description: '', prompts: [] });
    drawEditor();
  };
  document.getElementById('save').onclick = save;
  el.querySelectorAll('.p-del').forEach((btn) => {
    btn.onclick = () => {
      collect();
      const i = Number(btn.dataset.i);
      packsDoc.packs.splice(i, 1);
      if (packsDoc.packs.length && !packsDoc.packs.some((p) => p.id === packsDoc.defaultPackId)) {
        packsDoc.defaultPackId = packsDoc.packs[0].id;
      }
      drawEditor();
    };
  });
  el.querySelectorAll('.p-prompts').forEach((ta) => {
    ta.addEventListener('input', () => {
      const card = ta.closest('.packcard');
      const count = ta.value.split('\n').map((s) => s.trim()).filter(Boolean).length;
      card.querySelector('.pcount').textContent = count;
    });
  });
}

function packCard(p, i) {
  return `<div class="card packcard" data-i="${i}">
    <div class="row2">
      <input class="field p-name" value="${esc(p.name)}" placeholder="pack name" style="flex:1;min-width:160px" />
      <input class="field p-id" value="${esc(p.id)}" placeholder="id" style="max-width:130px" />
      <button class="btn ghost p-del" data-i="${i}" title="delete pack">delete</button>
    </div>
    <input class="field p-desc" value="${esc(p.description || '')}" placeholder="short description" style="margin-top:8px" />
    <textarea class="field p-prompts" rows="10" style="margin-top:8px" placeholder="one prompt per line">${esc(p.prompts.join('\n'))}</textarea>
    <div class="muted" style="font-size:12px;margin-top:4px">
      <span class="pcount">${p.prompts.length}</span> prompts · need at least ${cfg.rules.maxPlayers}
    </div>
  </div>`;
}

// Read the DOM back into packsDoc (before add/delete/redraw/save).
function collect() {
  const cards = [...document.querySelectorAll('.packcard')];
  const packs = cards.map((card) => ({
    id: card.querySelector('.p-id').value.trim(),
    name: card.querySelector('.p-name').value.trim(),
    description: card.querySelector('.p-desc').value.trim(),
    prompts: card.querySelector('.p-prompts').value.split('\n').map((s) => s.trim()).filter(Boolean),
  }));
  const def = document.getElementById('defpack');
  packsDoc = { defaultPackId: def ? def.value : (packs[0] && packs[0].id), packs };
  return packsDoc;
}

async function save() {
  collect();
  const msg = document.getElementById('savemsg');
  const liveWarn = lastRoomCount > 0
    ? `\n\n⚠ ${lastRoomCount} game(s) are live right now — saving restarts the server and ends them.`
    : '';
  if (!confirm(`Save packs?\n\nThis commits to GitHub and triggers a ~1–2 minute redeploy.${liveWarn}`)) return;

  msg.textContent = 'saving…';
  msg.style.color = 'var(--ink-muted)';
  let r;
  try {
    r = await fetch('/admin/api/packs', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(packsDoc),
    });
  } catch (e) {
    msg.textContent = '✕ network error: ' + e.message;
    msg.style.color = 'var(--warn)';
    return;
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) return renderLogin();
  if (!r.ok) {
    msg.textContent = '✕ ' + (j.error || 'save failed');
    msg.style.color = 'var(--warn)';
    return;
  }
  if (j.committed) {
    msg.textContent = '✓ saved + committed to GitHub. Redeploy incoming (~1–2 min).';
    msg.style.color = 'var(--good)';
  } else {
    msg.textContent = '✓ saved on this server. ' + (j.warning || '');
    msg.style.color = 'var(--warn)';
  }
}

// ---------------------------------------------------------------------------
//  Stats polling
// ---------------------------------------------------------------------------
function startStatsPolling() {
  stopStatsPolling();
  statsTimer = setInterval(refreshStats, 5000);
}
function stopStatsPolling() {
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = null;
}
async function refreshStats() {
  let res;
  try { res = await fetch('/admin/api/state'); } catch { return; }
  if (res.status === 401) { packsDoc = null; return renderLogin(); }
  if (!res.ok) return;
  drawStats(await res.json());
}
