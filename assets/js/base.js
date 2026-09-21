/* =============================================================================
 * base.js — works out where the site lives, at runtime
 * =============================================================================
 *
 * This is why you can move the site to any address without editing anything.
 *
 * This file is always at  <site root>/assets/js/base.js , so the site root is
 * simply two directories up from this file's own URL. `import.meta.url` gives
 * us that URL no matter which page imported us, so a page at /projects/ and a
 * page at / both resolve assets to exactly the same place.
 * ---------------------------------------------------------------------------*/

/** Absolute URL of the site root, always with a trailing slash. */
export const BASE = new URL('../../', import.meta.url).href;

/**
 * Turn a site-root-relative path into a full URL.
 *   asset('assets/img/profile.jpg')  ->  'https://.../assets/img/profile.jpg'
 * Absolute URLs and data: URIs are passed through untouched, so project images
 * can point at an external host if you ever want them to.
 */
export function asset(path) {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  return new URL(String(path).replace(/^\/+/, ''), BASE).href;
}

/**
 * The current page's path relative to the site root, e.g. '' , 'projects/' .
 * Used to highlight the active nav tab.
 */
export function currentPath() {
  const here = new URL(window.location.href);
  const root = new URL(BASE);
  let rel = here.pathname.slice(root.pathname.length);
  rel = rel.replace(/index\.html$/, '');
  if (rel && !rel.endsWith('/')) rel += '';
  return rel;
}

/**
 * Make a URL from content safe to put in an href.
 *
 * Every link on this site comes out of data/*.json, which is edited through
 * /backend. If that ever contained `javascript:doSomething()` the browser
 * would run it on this origin when the link was clicked. Only schemes that
 * navigate are allowed through; anything else becomes '#'.
 */
const SAFE_SCHEMES = /^(https?:|mailto:|tel:|\/|\.|#|\?)/i;

export function safeUrl(url) {
  const u = String(url ?? '').trim();
  if (!u) return '';
  // Strip control characters first: "java\tscript:" is still javascript: to a browser.
  const bare = u.replace(/[\u0000-\u001F\u007F-\u009F\s]/g, '');
  if (/^(javascript|data|vbscript|file|blob):/i.test(bare)) return '#';
  if (SAFE_SCHEMES.test(bare)) return u;
  // A bare "example.com/x" — treat it as https rather than a relative path.
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(bare)) return `https://${u}`;
  return '#';
}

/** True when running from the filesystem (file://) — fetch() is blocked there. */
export const IS_FILE_PROTOCOL = window.location.protocol === 'file:';
