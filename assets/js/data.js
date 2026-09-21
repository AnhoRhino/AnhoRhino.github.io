/* =============================================================================
 * data.js — loads the three JSON content files
 * =============================================================================
 *
 * loadJSON('cv') fetches <site root>/data/cv.json .
 *
 * Results are cached in memory for the lifetime of the page so that moving
 * between tabs (which keeps the page alive — see router.js) does not refetch.
 * The admin panel bypasses this cache entirely; it talks to GitHub directly.
 * ---------------------------------------------------------------------------*/

import { BASE } from './base.js';

const cache = new Map();

/**
 * @param {'site'|'cv'|'projects'} name
 * @param {{fresh?: boolean}} [opts] pass {fresh:true} to skip the cache
 * @returns {Promise<object>}
 */
export function loadJSON(name, opts = {}) {
  if (!opts.fresh && cache.has(name)) return cache.get(name);

  const url = new URL(`data/${name}.json`, BASE);
  // Cache-bust so a freshly published edit shows up without a hard refresh.
  // GitHub Pages serves JSON with a 10-minute cache by default.
  url.searchParams.set('v', String(Math.floor(Date.now() / 30000)));

  const p = fetch(url.href, { cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error(`${name}.json — HTTP ${r.status}`);
      return r.json();
    })
    .catch((err) => {
      cache.delete(name);       // let a retry actually retry
      throw err;
    });

  cache.set(name, p);
  return p;
}

/** Drop everything from the cache (used after the admin publishes). */
export function clearDataCache() { cache.clear(); }
