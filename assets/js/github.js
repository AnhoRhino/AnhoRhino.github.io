/* =============================================================================
 * github.js — reads and writes files in your repository
 * =============================================================================
 *
 * Used only by /backend. When you press Publish, this commits the changed
 * JSON straight to the repo; GitHub Pages then rebuilds and the live site
 * updates, usually within a minute.
 *
 * A NOTE ON base64
 *   The GitHub Contents API takes file bodies base64-encoded. The obvious
 *   `btoa(text)` is WRONG here: btoa only handles code points 0-255, so the
 *   first "ø" in "Kretskortdesigner ... lagringssystemet på" throws
 *   InvalidCharacterError. Everything goes through TextEncoder first so the
 *   bytes are real UTF-8 before they are encoded.
 * ---------------------------------------------------------------------------*/

import { CONFIG } from './config.js';
import { toB64, fromB64 } from './vault.js';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Create a client bound to one token.
 *   const gh = createClient(token);
 *   const { json, sha } = await gh.getJSON('data/cv.json');
 */
export function createClient(token, overrides = {}) {
  const { owner, repo, branch } = { ...CONFIG.github, ...overrides };
  const base = `${API}/repos/${owner}/${repo}`;

  async function call(path, init = {}) {
    let res;
    try {
      res = await fetch(path.startsWith('http') ? path : base + path, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });
    } catch (netErr) {
      throw new GitHubError('Could not reach GitHub. Check your connection.', 0, netErr);
    }

    if (res.status === 204) return null;

    let body = null;
    try { body = await res.json(); } catch { /* some errors have no body */ }

    if (!res.ok) throw new GitHubError(explain(res, body), res.status, body);
    return body;
  }

  function explain(res, body) {
    const msg = body?.message || res.statusText || 'Unknown error';
    switch (res.status) {
      case 401:
        return 'GitHub rejected the token (401). It may have expired or been revoked — create a new one and run setup again.';
      case 403:
        if (res.headers.get('x-ratelimit-remaining') === '0') {
          const when = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000;
          return `GitHub rate limit reached. Try again after ${when ? new Date(when).toLocaleTimeString() : 'a few minutes'}.`;
        }
        return `GitHub refused the request (403). The token probably lacks "Contents: Read and write" on ${owner}/${repo}.`;
      case 404:
        return `Not found (404). Either ${owner}/${repo} is wrong, the branch "${branch}" does not exist, or the token cannot see this repository.`;
      case 409:
        return 'Conflict (409) — the file changed on GitHub since you loaded it. Reload the admin page and redo this edit.';
      case 422:
        return `GitHub rejected the content (422): ${msg}`;
      default:
        return `GitHub error ${res.status}: ${msg}`;
    }
  }

  const enc = (p) => String(p).split('/').map(encodeURIComponent).join('/');

  /* ---------------------------------------------------------------------
   * Reading
   * ------------------------------------------------------------------ */

  /** Raw file. Returns { text, sha } — or { text: null, sha: null } if absent. */
  async function getFile(path) {
    try {
      const r = await call(`/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`);
      if (Array.isArray(r)) throw new GitHubError(`${path} is a directory, not a file.`, 400);
      const text = r.encoding === 'base64'
        ? new TextDecoder().decode(fromB64(r.content))
        : (r.content ?? '');
      return { text, sha: r.sha, size: r.size };
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return { text: null, sha: null };
      throw err;
    }
  }

  /** Same, already parsed. A missing file yields { json: null, sha: null }. */
  async function getJSON(path) {
    const { text, sha } = await getFile(path);
    if (text == null) return { json: null, sha: null };
    try {
      return { json: JSON.parse(text), sha };
    } catch (e) {
      throw new GitHubError(`${path} on GitHub is not valid JSON — fix it there before editing here.`, 200, e);
    }
  }

  async function listDir(path) {
    const r = await call(`/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`);
    return Array.isArray(r) ? r : [];
  }

  /* ---------------------------------------------------------------------
   * Writing
   * ------------------------------------------------------------------ */

  /**
   * Commit a text file. Pass the `sha` you read earlier so GitHub can reject
   * the write if someone else changed the file in the meantime — that is what
   * turns a silent overwrite into a visible 409.
   * Omit `sha` to create a new file.
   */
  async function putText(path, content, sha, message) {
    const body = {
      message: message || `Update ${path}`,
      content: toB64(new TextEncoder().encode(content)),
      branch,
    };
    if (sha) body.sha = sha;
    const r = await call(`/contents/${enc(path)}`, { method: 'PUT', body: JSON.stringify(body) });
    return { sha: r.content.sha, commit: r.commit.sha, path: r.content.path };
  }

  /** Same, for already-base64 binary data (images). */
  async function putBinary(path, base64, sha, message) {
    const body = { message: message || `Add ${path}`, content: base64, branch };
    if (sha) body.sha = sha;
    const r = await call(`/contents/${enc(path)}`, { method: 'PUT', body: JSON.stringify(body) });
    return { sha: r.content.sha, commit: r.commit.sha, path: r.content.path };
  }

  async function deleteFile(path, sha, message) {
    return call(`/contents/${enc(path)}`, {
      method: 'DELETE',
      body: JSON.stringify({ message: message || `Delete ${path}`, sha, branch }),
    });
  }

  /* ---------------------------------------------------------------------
   * Checks
   * ------------------------------------------------------------------ */

  /**
   * Confirm the token works AND can write here, before the owner discovers
   * otherwise halfway through an edit.
   */
  async function verify() {
    const repoInfo = await call('');
    const user = await call(`${API}/user`).catch(() => null);   // fine-grained tokens may not allow /user
    return {
      repo: repoInfo.full_name,
      branch,
      canWrite: !!repoInfo.permissions?.push,
      login: user?.login ?? null,
      defaultBranch: repoInfo.default_branch,
    };
  }

  return { getFile, getJSON, listDir, putText, putBinary, deleteFile, verify, owner, repo, branch };
}

/**
 * URL of the GitHub page for creating exactly the right kind of token.
 * Shown in the setup screen so it is one click, not a treasure hunt.
 */
export function tokenSetupURL() {
  return 'https://github.com/settings/personal-access-tokens/new';
}
