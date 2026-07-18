# Deploying Quiplash to Render (free)

You do these steps once. After that, your game lives at a public URL forever and
you only touch it when you want to change something.

**Why Render and not Vercel:** this game keeps a live connection open to every
phone for the whole session (a websocket). Vercel's serverless functions can't
hold those open; Render runs a real always-on server that can.

---

## Step 1 — Put the code on GitHub (one time)

The repo is already committed locally. You just need to push it up.

1. Go to **github.com → New repository**. Name it `quiplash`. **Private is fine.**
   Do **not** add a README/.gitignore (this folder already has them).
2. Copy the repo URL GitHub shows you, then in Terminal:

   ```bash
   cd ~/Desktop/quiplash
   git remote add origin https://github.com/<your-username>/quiplash.git
   git branch -M main
   git push -u origin main
   ```

   If it asks you to sign in to GitHub, do that (it's your account — that part
   can't be automated for you). Once pushed, refresh the GitHub page to confirm
   the files are there.

---

## Step 2 — Create the Render service

1. Go to **render.com** and sign up — the easiest is **"Sign in with GitHub"**
   (it links your repos automatically). Free, no card required for the free tier.
2. Click **New +  →  Web Service**.
3. Connect / pick your **`quiplash`** repo.
4. Render reads `render.yaml` automatically. If it instead asks you to fill
   fields manually, use:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `node server/index.js`
   - **Instance type / Plan:** **Free**
5. Click **Create Web Service** and wait ~2 minutes for the first build. When
   it's done you'll see a live URL like `https://quiplash-xxxx.onrender.com`.

---

## Step 3 — Set BASE_URL (don't skip — the QR breaks without it)

The join QR/links need to know the public address. Right after the first deploy:

1. Copy your live URL from the top of the Render service page
   (e.g. `https://quiplash-xxxx.onrender.com` — **no trailing slash**).
2. In the service, open **Environment** (left sidebar) → **Add Environment
   Variable**:
   - **Key:** `BASE_URL`
   - **Value:** your live URL
3. **Save Changes.** Render redeploys automatically (~1 min). Done.

---

## Step 4 — Play

- **Host screen:** open `https://your-url.onrender.com/host` on a laptop/TV.
- **Friends:** they scan the QR, or go to `https://your-url.onrender.com/play`.

**Free-tier note:** if nobody's used it for 15 minutes, the first load takes
~40 seconds while the server wakes up. Just open the host screen a minute before
friends arrive and it'll be warm and instant for everyone. To remove that wait
entirely, upgrade the service to the **Starter** plan ($7/mo) — Settings →
Instance Type.

---

## Changing the game later

Edit any file in `config/` on your Mac, then:

```bash
cd ~/Desktop/quiplash
git add -A
git commit -m "new prompt pack"   # or whatever you changed
git push
```

Render sees the push and redeploys itself in ~1–2 minutes. That's the whole
maintenance loop — there's no database, nothing to back up, nothing that rots.
