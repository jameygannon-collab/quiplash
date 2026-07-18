# Quiplash — deployment context

This file records how this project was deployed, so a future session has the
full picture. It's a Node + `ws` real-time party game (Jackbox-style). It is
deployed and live.

## Live service

- **Live URL:** https://quiplash-c4ii.onrender.com
  - Host screen: `/host`  •  Player join: `/play`
- **Host:** Render (render.com), Web Service, **Free** plan, region Oregon (US West).
- **Render service name:** `quiplash`  •  **Service ID:** `srv-d9du5dj7uimc73c7lu0g`
- **Build:** Render auto-detected the `Dockerfile` and builds via Docker. The
  container's `CMD` runs `node server/index.js` (same as `render.yaml`'s
  `startCommand`). Render injects `PORT`; the server reads `process.env.PORT`.

> Note: because Render used the Dockerfile, the deploy is a **Docker** service,
> not the `runtime: node` path described in `render.yaml`. `render.yaml` is not
> read by the standard Web Service flow (only the Blueprint flow reads it). Both
> produce the same running app.

## Source

- **GitHub repo:** https://github.com/jameygannon-collab/quiplash (private)
- **Branch deployed:** `main`
- `node_modules/` is gitignored. There's a stray untracked `package-lock 2.json`
  (a macOS duplicate) that is not committed and can be deleted.

## The one critical env var

- **`BASE_URL` = `https://quiplash-c4ii.onrender.com`** (no trailing slash),
  set in Render → service → **Environment**.
- Why it matters: the server builds the phone join URL / QR from `BASE_URL`.
  Without it, `server/index.js` falls back to a private LAN IP
  (`http://<lanIp>:PORT`) and the join links/QR break for remote players.
- If the service URL ever changes, update `BASE_URL` to match and redeploy.

## How to ship changes

Render auto-deploys on push to `main`:

```bash
cd ~/Desktop/quiplash
git add -A
git commit -m "…"
git push
```

Render sees the push and redeploys in ~1–2 min. No database, nothing to migrate.

## Auth setup (already done)

- **Local git push** uses a **classic** GitHub Personal Access Token (scope:
  `repo`, named "quiplash deploy") embedded in the `origin` remote URL in
  `.git/config`. Keep that token alive or pushes will fail. Token expires
  **2026-08-17** — regenerate before then and update the remote URL.
- **Render → GitHub** uses the **Render GitHub App**, installed and scoped to
  only the `quiplash` repo. This is what lets Render pull code and auto-deploy.

## Behavior / gotchas

- **Free tier sleeps** after ~15 min idle; first request then takes ~40–50s
  (cold start). Open `/host` a minute before players arrive to warm it.
- **Each load of `/host` creates a NEW room** with a new 4-letter code. Open the
  host screen once and leave it up; reloading changes the code.
- **Minimum 3 players** to start a game.
- Verified end-to-end on 2026-07-18: host QR/room code render, `BASE_URL` join
  link is correct (public URL, not LAN IP), and a player successfully joined
  over the websocket ("You're in!").

## Not done / optional follow-ups

- To remove cold starts, upgrade the Render service to **Starter ($7/mo)**
  (Settings → Instance Type).
- Could add a scheduled ping to keep the free instance warm before game nights.
