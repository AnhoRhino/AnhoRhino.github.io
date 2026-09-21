/* =============================================================================
 * reveal.js — "content rising from the bottom"
 * =============================================================================
 *
 * Two separate effects, deliberately kept apart:
 *
 *   ARRIVING  Anything with class .reveal starts 22px low and transparent.
 *             When it crosses into the lower part of the viewport it gets
 *             .is-in and glides up into place. Because the constellation
 *             background is simultaneously drifting DOWN (see constellations.js),
 *             the combined impression is of content rising rather than the
 *             page sliding beneath you.
 *
 *   LEAVING   As an element's bottom edge approaches the top of the screen it
 *             dims, via the --fade custom property. This is keyed to the
 *             BOTTOM edge on purpose: a tall card only starts to fade once it
 *             is nearly gone, so nothing you are still reading ever dims.
 *
 * FAIL OPEN. If IntersectionObserver is missing, or anything in here throws,
 * every .reveal is forced visible. Content must never be hidden by a
 * decorative effect that did not run.
 * ---------------------------------------------------------------------------*/

const TUNING = {
  ENTER_MARGIN: '0px 0px -12% 0px',  // fire when 12% into the viewport
  EXIT_BAND: 0.22,                   // fraction of viewport height for the top fade
  MIN_FADE: 0.18,                    // never fully invisible — just faint
};

let observer = null;
const watched = new Set();     // elements currently on screen, needing --fade
let scrollBound = false;
let ticking = false;
let ioFired = false;           // has the observer ever actually called us back?
let watchdog = 0;

/**
 * Start watching every .reveal inside `root`. Safe to call repeatedly — the
 * soft router calls it again after each page swap, and the language toggle
 * calls it after re-rendering.
 */
export function observeReveals(root = document) {
  try {
    const nodes = root.querySelectorAll('.reveal');
    if (!nodes.length) return;

    if (!('IntersectionObserver' in window)) { forceVisible(nodes); return; }
    if (prefersReducedMotion()) { forceVisible(nodes); return; }

    if (!observer) observer = new IntersectionObserver(onIntersect, {
      rootMargin: TUNING.ENTER_MARGIN,
      threshold: 0,
    });

    nodes.forEach((el) => {
      if (el.dataset.revealBound) return;
      el.dataset.revealBound = '1';
      observer.observe(el);
    });

    /* Anything already on screen is revealed straight away rather than waiting
       for the observer's first callback — above-the-fold content should not
       wait a frame to become visible. */
    revealWhatIsAlreadyVisible(nodes);

    bindScroll();
    armWatchdog();
    schedule();
  } catch (err) {
    console.error('[reveal] failed, showing everything:', err);
    forceVisible(root.querySelectorAll('.reveal'));
  }
}

/**
 * Recompute after content changed size — a language switch makes every string
 * a different length, and the timeline re-packs around it.
 */
export function refreshReveals() {
  observeReveals(document);
  schedule();
}

/**
 * Stop watching everything inside `root` — call this immediately before you
 * throw those elements away, or the observer and the `watched` set go on
 * holding references to detached nodes.
 */
export function unobserveWithin(root) {
  if (!root) return;
  root.querySelectorAll('.reveal').forEach((el) => {
    if (observer) observer.unobserve(el);
    watched.delete(el);
    delete el.dataset.revealBound;
  });
}

/** Drop everything (used before a page swap). */
export function resetReveals() {
  if (observer) { observer.disconnect(); observer = null; }
  if (watchdog) { clearTimeout(watchdog); watchdog = 0; }
  /* `watched` holds element references. The soft router throws the old <main>
     away, so without this the set would leak a whole page's worth of detached
     nodes on every tab change. */
  watched.clear();
  document.querySelectorAll('[data-reveal-bound]').forEach((el) => {
    delete el.dataset.revealBound;
  });
}

/* -------------------------------------------------------------------------
 * Internals
 * ---------------------------------------------------------------------- */

function revealWhatIsAlreadyVisible(nodes) {
  const vh = window.innerHeight || document.documentElement.clientHeight;
  requestAnimationFrame(() => {
    nodes.forEach((el) => {
      if (el.classList.contains('is-in')) return;
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) {
        el.classList.add('is-in');
        watched.add(el);
      }
    });
    schedule();
  });
}

/**
 * Last line of defence. IntersectionObserver can exist and still never call
 * back — a tab that is never composited, a browser quirk, an exception
 * somewhere upstream. If we have heard nothing at all after a couple of
 * seconds we give up on it and show everything, because invisible content is
 * far worse than a missing animation.
 */
function armWatchdog() {
  if (watchdog || ioFired) return;
  watchdog = window.setTimeout(() => {
    watchdog = 0;
    if (ioFired) return;
    console.warn('[reveal] IntersectionObserver never fired — showing all content.');
    if (observer) observer.disconnect();
    forceVisible(document.querySelectorAll('.reveal'));
  }, 2500);
}

function onIntersect(entries) {
  ioFired = true;
  if (watchdog) { clearTimeout(watchdog); watchdog = 0; }
  entries.forEach((entry) => {
    const el = entry.target;
    if (entry.isIntersecting) {
      el.classList.add('is-in');
      watched.add(el);
      // Once it has arrived, stop promoting it to its own compositor layer.
      window.setTimeout(() => el.classList.add('is-settled'), 900);
    } else {
      watched.delete(el);
      // Reset --fade so an element scrolled back into view starts clean.
      el.style.removeProperty('--fade');
    }
  });
  schedule();
}

function bindScroll() {
  if (scrollBound) return;
  scrollBound = true;
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => { navHeightCache = null; schedule(); }, { passive: true });
}

function schedule() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(update);
}

function update() {
  ticking = false;
  if (!watched.size) return;

  const vh = window.innerHeight || document.documentElement.clientHeight;
  const navH = readNavHeight();
  const exitStart = navH + vh * TUNING.EXIT_BAND;   // start dimming here
  const exitEnd = navH * 0.25;                      // fully dim here

  /* Read every rect first, then write every style. Interleaving the two is
     what causes layout thrash on long pages. */
  const reads = [];
  watched.forEach((el) => reads.push([el, el.getBoundingClientRect()]));

  for (let i = 0; i < reads.length; i++) {
    const [el, r] = reads[i];
    let fade = 1;
    if (r.bottom < exitStart) {
      const span = Math.max(1, exitStart - exitEnd);
      const p = (r.bottom - exitEnd) / span;
      fade = TUNING.MIN_FADE + (1 - TUNING.MIN_FADE) * clamp(p, 0, 1);
    }
    // Only touch the DOM when the value actually moved — this runs on scroll.
    const rounded = Math.round(fade * 100) / 100;
    if (el.__fade !== rounded) {
      el.__fade = rounded;
      if (rounded >= 0.999) el.style.removeProperty('--fade');
      else el.style.setProperty('--fade', String(rounded));
    }
  }
}

/* getComputedStyle forces a style resolve, and update() runs on every scroll
   frame. The nav height only changes with the stylesheet, so read it once and
   again on resize. */
let navHeightCache = null;
function readNavHeight() {
  if (navHeightCache != null) return navHeightCache;
  const v = getComputedStyle(document.documentElement).getPropertyValue('--nav-h');
  const n = parseFloat(v);
  navHeightCache = Number.isFinite(n) ? n : 60;
  return navHeightCache;
}

function forceVisible(nodes) {
  nodes.forEach((el) => el.classList.add('is-forced'));
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
