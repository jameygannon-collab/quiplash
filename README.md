# Quiplash

A customizable, Jackbox-style party game. One shared **host screen**, everyone
else joins from their **phone** with a room code. Get prompts, write funny
answers, vote head-to-head, rack up points across rounds.

Built to be **reskinned**: the words, the look, the questions, and the rules
all live in plain config files — no game logic to untangle.

---

## Run it locally

```bash
cd quiplash
npm install
npm start
```

Then:

- **Host screen** → open `http://localhost:3000/host` on your laptop/TV
- **Phones** → the host screen shows a QR + code. Phones on the **same wifi**
  scan it (it points at your Mac's LAN IP, not localhost, so phones can reach it).

Need at least **3 players** to start (change in `config/rules.js`).

---

## Customize (the whole point)

Everything you'd want to change lives in `config/`. Edit, restart, done.

| File | Change this to… | Examples |
|------|-----------------|----------|
| **`config/prompts.js`** | swap the questions | make a themed pack (cohort, brand, spicy). Copy a pack, rename its `id`, replace the lines. |
| **`config/rules.js`** | change how it plays | number of rounds, timers, min/max players, points, scoring bonus. |
| **`config/theme.js`** | change the look | brand color, fonts, logo text, player colors. Colors flow to every screen automatically. |
| **`config/copy.js`** | change every word | the host's personality, all button text, safety quips. Some lines are arrays → picked at random. |

You do **not** need to touch anything in `server/` or `public/` for any of the
above. Those are the engine and the screens.

### Add a prompt pack (most common)

Open `config/prompts.js`, copy a `{ id, name, prompts: [...] }` block, give it a
new `id`, and write your lines. It shows up in the host's pack dropdown
automatically. Keep at least `maxPlayers` prompts per pack.

---

## Deploy

This needs a host that keeps **websocket connections open** — so **Render /
Railway / Fly**, *not* Vercel (Vercel's serverless functions drop long-lived
sockets).

**Render (easiest):** push this folder to a Git repo, "New → Web Service", point
it at the repo. `render.yaml` is already set up. After it's live, set the
`BASE_URL` env var to your live URL (e.g. `https://quiplash.onrender.com`) so the
join QR points to the right place.

**Anywhere with Docker:** a `Dockerfile` is included. `docker build -t quiplash .`
then run it with `PORT` and `BASE_URL` set.

---

## How it's built

```
config/          ← everything you customize (prompts, rules, theme, copy)
server/
  index.js       ← Express serves the pages + a /config endpoint; ws wiring
  rooms.js       ← the game state machine (one Room = one game)
  engine.js      ← pure game math (matchups, scoring) — no I/O
  protocol.js    ← the message names client + server agree on
public/
  index.html     ← landing (Host / Join)
  host.html/.js  ← the shared "TV" screen
  player.html/.js← the phone controller
  client.js      ← shared browser helpers (config, theme, socket, timers)
  app.css        ← styles, driven by theme variables
```

**The server is the referee.** It decides matchups, tallies votes, and keeps the
score — clients just draw the latest state it sends. Players only ever receive
their *own* prompts and choices, and answer authors stay hidden until the reveal.

**Game flow:** `LOBBY → (per round: WRITING → [VOTING → RESULT]×N) → SCOREBOARD →
… → FINAL`.

---

## Gotchas

- **Phones can't reach the room?** They must be on the same wifi as the host
  machine for local play. For remote play, deploy it (above) and share the URL.
- **Changed a config file but nothing changed?** Restart the server (`npm start`).
  Config is read at startup.
- **Odd player counts** work fine — the circular matchup pairing handles them.
- **Someone dropped?** Their phone auto-rejoins the same seat on reconnect.
