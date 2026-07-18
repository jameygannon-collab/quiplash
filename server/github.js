// ============================================================================
//  GITHUB  —  commit pack edits back to the repo so they survive redeploys
// ============================================================================
//  Render's filesystem is ephemeral: anything the running server writes is lost
//  on the next redeploy. To make admin pack-edits durable, we commit the new
//  data/packs.json straight back to GitHub via the REST API. The repo is the
//  source of truth, so the edit is permanent and the next deploy ships it.
//
//  Requires a GITHUB_TOKEN env var — a fine-grained PAT with Contents:read+write
//  on this ONE repo. Never commit that token or expose it to the browser.
//
//  Note: committing to `main` triggers a Render auto-redeploy (~1-2 min) which
//  restarts the server and drops in-progress games. Edit packs between games.
// ============================================================================

const REPO = process.env.GITHUB_REPO || 'jameygannon-collab/quiplash';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const FILE_PATH = 'data/packs.json';

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'quiplash-admin',
    'Content-Type': 'application/json',
  };
}

async function currentSha(h) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
    { headers: h },
  );
  if (res.status === 200) return (await res.json()).sha;
  if (res.status === 404) return null; // file not in repo yet → create
  throw new Error(`GitHub read failed (${res.status})`);
}

/**
 * Commit `content` (a string) to data/packs.json on the repo's main branch.
 * Best-effort: returns { committed, warning } rather than throwing, so a save
 * still succeeds locally even when the commit can't happen.
 */
export async function commitPacksToGitHub(content) {
  const token = process.env.GITHUB_TOKEN || '';
  if (!token) {
    return {
      committed: false,
      warning:
        'Saved to this server only. Set GITHUB_TOKEN in Render to make pack edits permanent across redeploys.',
    };
  }

  const h = headers(token);
  const api = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
  const body = {
    message: 'admin: update prompt packs',
    content: Buffer.from(content).toString('base64'),
    branch: BRANCH,
  };

  try {
    let sha = await currentSha(h);
    if (sha) body.sha = sha;

    let res = await fetch(api, { method: 'PUT', headers: h, body: JSON.stringify(body) });

    // Someone else changed the file between our read and write → refetch + retry once.
    if (res.status === 409) {
      sha = await currentSha(h);
      if (sha) body.sha = sha;
      res = await fetch(api, { method: 'PUT', headers: h, body: JSON.stringify(body) });
    }

    if (res.status === 200 || res.status === 201) {
      return { committed: true, warning: null };
    }
    const text = await res.text().catch(() => '');
    return {
      committed: false,
      warning: `Saved locally, but the GitHub commit failed (${res.status}). Check GITHUB_TOKEN. ${text.slice(0, 120)}`,
    };
  } catch (err) {
    return {
      committed: false,
      warning: `Saved locally, but couldn't reach GitHub: ${err.message}. The edit will be lost on the next redeploy.`,
    };
  }
}
