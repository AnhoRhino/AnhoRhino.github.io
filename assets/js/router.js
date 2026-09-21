/* =============================================================================
 * router.js — soft page transitions between the four tabs
 * =============================================================================
 *
 * Every page is a real HTML file at a real URL. This file is only an
 * enhancement on top of that: when you click a tab it fetches the target page,
 * swaps out <main>, and updates the address bar — instead of a full browser
 * navigation.
 *
 * WHY BOTHER: a full navigation would tear down and rebuild the constellation
 * canvas on every tab change, so the stars would jump back to their home
 * positions and the page would flash. Swapping only <main> keeps the sky alive
 * and continuous across the whole site.
 *
 * IT ALWAYS FAILS SAFE. Anything unexpected — a fetch error, a page whose
 * shape we do not recognise, a browser without History API — and we simply let
 * the browser navigate normally. The site works perfectly with this file
 * deleted; you just lose the crossfade.
 * ---------------------------------------------------------------------------*/

import { BASE } from './base.js';
import { resetReveals } from './reveal.js';

const SUPPORTED = typeof window.history?.pushState === 'function' && typeof window.fetch === 'function';

let onPageReady = () => {};
let onHashOnly = () => {};
let navigating = false;
let pendingPop = null;
const pageCache = new Map();     // url -> parsed Document, so going back is instant

export function initRouter(opts = {}) {
  if (!SUPPORTED) return;
  onPageReady = opts.onPageReady || onPageReady;
  onHashOnly = opts.onHashOnly || onHashOnly;

  document.addEventListener('click', handleClick);
  window.addEventListener('popstate', handlePop);
}

/* -------------------------------------------------------------------------
 * Click interception
 * ---------------------------------------------------------------------- */
function handleClick(ev) {
  // Let the browser handle anything that is not a plain left click.
  if (ev.defaultPrevented || ev.button !== 0 ||
      ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

  const a = ev.target.closest && ev.target.closest('a[href]');
  if (!a) return;
  if (a.target && a.target !== '_self') return;
  if (a.hasAttribute('download') || a.getAttribute('rel')?.includes('external')) return;
  if (a.dataset.noRouter !== undefined) return;

  let url;
  try { url = new URL(a.href, window.location.href); } catch { return; }

  if (url.origin !== window.location.origin) return;         // external
  if (!url.pathname.startsWith(new URL(BASE).pathname)) return;
  if (/\/backend\/?$/.test(url.pathname)) return;            // admin is its own app
  if (!/(\/|\.html)$/.test(url.pathname)) return;            // a real file download

  const samePage = url.pathname === window.location.pathname;

  // Same page, different hash: just scroll. No fetch, no swap, and crucially
  // no re-initialisation — re-running the page builder here would blank the
  // hero and re-animate the whole timeline just because you clicked "CV".
  if (samePage && url.hash) {
    ev.preventDefault();
    history.pushState({}, '', url.href);
    scrollToTarget(url.hash);
    onHashOnly();
    return;
  }
  if (samePage && !url.hash) {
    ev.preventDefault();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    return;
  }

  ev.preventDefault();
  navigate(url.href, { push: true });
}

let lastPath = window.location.pathname;

function handlePop() {
  const path = window.location.pathname;

  // Back/forward between #cv and the top of the same page: no refetch needed.
  if (path === lastPath) {
    if (window.location.hash) scrollToTarget(window.location.hash);
    else window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    onHashOnly();
    return;
  }

  // A navigation is already running; remember this one and run it afterwards
  // rather than dropping it and leaving the URL out of step with the content.
  if (navigating) { pendingPop = window.location.href; return; }
  lastPath = path;
  navigate(window.location.href, { push: false });
}

/* -------------------------------------------------------------------------
 * The swap
 * ---------------------------------------------------------------------- */
async function navigate(href, { push }) {
  if (navigating) return;
  navigating = true;
  const root = document.documentElement;

  try {
    const doc = await fetchPage(href);
    const cachedMain = doc.querySelector('main');
    const currentMain = document.querySelector('main');
    if (!cachedMain || !currentMain) throw new Error('page has no <main>');

    /* IMPORTANT: import a COPY. Inserting the cached document's own <main>
       would move that node out of the cache, so the second visit to the same
       page would find no <main> and silently fall back to a full reload. */
    const nextMain = document.importNode(cachedMain, true);

    // Fade the old content out, but never wait longer than the transition.
    root.classList.add('is-navigating');
    await wait(prefersReducedMotion() ? 0 : 150);

    /* Any modal opened by the old page (the project dialog lives on <body>,
       not inside <main>) would otherwise still be sitting there afterwards,
       with the page scroll locked behind it. */
    closeAnyOpenDialog();

    resetReveals();
    currentMain.replaceWith(nextMain);

    document.title = doc.title || document.title;
    syncMeta(doc, 'description');

    if (push) history.pushState({}, '', href);
    lastPath = new URL(href).pathname;

    window.scrollTo(0, 0);
    root.classList.remove('is-navigating');

    // Build the page BEFORE honouring a #hash: the CV section is empty until
    // the timeline has rendered, so scrolling first lands you at the top.
    await onPageReady(nextMain);

    // Move focus into the new page, otherwise a screen reader or keyboard user
    // is left wherever the old page had them, unaware anything changed.
    focusMain(nextMain);

    const url = new URL(href);
    if (url.hash) scrollToTarget(url.hash, true);
  } catch (err) {
    console.warn('[router] falling back to a normal navigation:', err);
    root.classList.remove('is-navigating');
    window.location.href = href;    // the site still works, just without the fade
  } finally {
    navigating = false;
    if (pendingPop) {
      const next = pendingPop;
      pendingPop = null;
      lastPath = new URL(next).pathname;
      navigate(next, { push: false });
    }
  }
}

function closeAnyOpenDialog() {
  document.querySelectorAll('dialog[open]').forEach((d) => { try { d.close(); } catch { /* ignore */ } });
  document.documentElement.classList.remove('is-dialog-open');
}

function focusMain(main) {
  if (!main) return;
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  // preventScroll: we have already decided where the page should be.
  try { main.focus({ preventScroll: true }); } catch { main.focus(); }
}

async function fetchPage(href) {
  const key = href.split('#')[0];
  if (pageCache.has(key)) return pageCache.get(key);

  const res = await fetch(key, { headers: { 'X-Requested-With': 'router' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  pageCache.set(key, doc);
  return doc;
}

function syncMeta(doc, name) {
  const from = doc.querySelector(`meta[name="${name}"]`);
  const to = document.querySelector(`meta[name="${name}"]`);
  if (from && to) to.setAttribute('content', from.getAttribute('content') || '');
}

function scrollToTarget(hash, instant = false) {
  const id = decodeURIComponent(hash.slice(1));
  const el = document.getElementById(id);
  if (!el) { window.scrollTo(0, 0); return; }
  const behavior = (instant || prefersReducedMotion()) ? 'auto' : 'smooth';

  // Scroll now…
  el.scrollIntoView({ behavior, block: 'start' });

  /* …then correct once the page has finished growing. The timeline measures
     its cards, packs them into columns and only then sets the container
     height, so the target can still move after the first scroll.
     Deliberately a plain setTimeout and not requestAnimationFrame: rAF does
     not fire in a backgrounded tab, which would mean a link opened in a
     background tab never scrolled at all. */
  setTimeout(() => {
    const drift = el.getBoundingClientRect().top - scrollPadding();
    if (Math.abs(drift) > 8) el.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, 600);
}

/** How far scrollIntoView leaves an element below the top (the sticky nav). */
function scrollPadding() {
  const v = getComputedStyle(document.documentElement).scrollPaddingTop;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
