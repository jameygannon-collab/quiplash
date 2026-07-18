// ============================================================================
//  CLIENT  —  shared browser helpers (loaded by both host + player pages)
// ============================================================================
//  Small, dependency-free utilities: pull config, apply the theme, open the
//  websocket (with auto-reconnect), and fill {tokens} in copy strings.
// ============================================================================

// Loaded once, then cached on window so every module shares it.
export async function loadConfig() {
  if (window.__CFG) return window.__CFG;
  const res = await fetch('/config');
  window.__CFG = await res.json();
  return window.__CFG;
}

// Turn the theme object into CSS variables on :root. Change a color in
// config/theme.js and it lands everywhere with no CSS edits.
export function applyTheme(theme) {
  const r = document.documentElement.style;
  r.setProperty('--brand', theme.brand);
  r.setProperty('--brand-ink', theme.brandInk);
  r.setProperty('--bg', theme.bg);
  r.setProperty('--bg-panel', theme.bgPanel);
  r.setProperty('--ink', theme.ink);
  r.setProperty('--ink-muted', theme.inkMuted);
  r.setProperty('--good', theme.good);
  r.setProperty('--warn', theme.warn);
  r.setProperty('--font-display', theme.fontDisplay);
  r.setProperty('--font-body', theme.fontBody);
  r.setProperty('--radius', theme.radius);
}

// Replace {name}, {code}, {n}, {round} … in a copy string.
export function fill(str, tokens = {}) {
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (k in tokens ? tokens[k] : m));
}

// Pick a random line from an array of copy (falls back to a plain string).
export function line(value, tokens = {}) {
  const s = Array.isArray(value) ? value[Math.floor(Math.random() * value.length)] : value;
  return fill(s, tokens);
}

// escape user text before putting it in innerHTML
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------------------------------------------------------------------------
//  Net — a resilient websocket wrapper
// ---------------------------------------------------------------------------
export class Net {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus || (() => {});
    this.ws = null;
    this.queue = [];
    this.closedByUs = false;
    this.reconnectDelay = 500;
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);

    this.ws.onopen = () => {
      this.onStatus('open');
      this.reconnectDelay = 500;
      for (const m of this.queue) this.ws.send(JSON.stringify(m));
      this.queue = [];
    };
    this.ws.onmessage = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      this.onMessage(msg);
    };
    this.ws.onclose = () => {
      if (this.closedByUs) return;
      this.onStatus('reconnecting');
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.6, 5000);
    };
    this.ws.onerror = () => this.ws && this.ws.close();
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else this.queue.push(msg); // buffered until (re)connected
  }

  close() { this.closedByUs = true; this.ws && this.ws.close(); }
}

// ---------------------------------------------------------------------------
//  Countdown — smooth local ticking off a server deadline
// ---------------------------------------------------------------------------
//  The server sends { deadline, now }. We reconcile clocks once, then tick
//  locally so the ring/number moves smoothly without spamming the network.
export function secondsLeft(timing) {
  if (!timing) return null;
  const skew = Date.now() - timing.now;               // client vs server offset
  return Math.max(0, Math.ceil((timing.deadline + skew - Date.now()) / 1000));
}
