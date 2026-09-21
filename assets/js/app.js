/* =============================================================================
 * app.js — the single entry point every page loads
 * =============================================================================
 *
 * Each page has exactly one script tag:
 *     <script type="module" src="assets/js/app.js"></script>
 * and a <main data-page="home|projects|contact"> that tells this file which
 * page-specific code to run.
 *
 * ADDING A NEW PAGE
 *   1. copy an existing folder (e.g. contact/) and change data-page="mypage"
 *   2. add an entry to NAV in config.js
 *   3. add a case to PAGES below
 * That is the whole job — nav, theme, language, constellations and the soft
 * page transitions all come for free.
 * ---------------------------------------------------------------------------*/

import { CONFIG, NAV } from './config.js';
import { BASE, asset, safeUrl, currentPath } from './base.js';
import { loadJSON } from './data.js';
import { initThemeToggles, onThemeChange } from './theme.js';
import { getLang, toggleLang, applyLangToDocument, onLangChange, ui, t } from './i18n.js';
import { initConstellations } from './constellations.js';
import { observeReveals, refreshReveals } from './reveal.js';
import { initRouter } from './router.js';

/* Module-level mutable state. */
let scrollSpyBound = false;

/* -------------------------------------------------------------------------
 * Page initialisers. Each gets the <main> element and must be idempotent —
 * the soft router may call it again after swapping content in.
 * ---------------------------------------------------------------------- */
const PAGES = {

  async home(main) {
    const heroRoot = main.querySelector('[data-hero]');
    const cvRoot   = main.querySelector('[data-timeline]');

    const [{ renderHome }, { renderTimeline }] = await Promise.all([
      import('./home.js'),
      import('./timeline.js'),
    ]);

    const [site, cv] = await Promise.all([
      loadJSON('site').catch(errCard(heroRoot)),
      loadJSON('cv').catch(errCard(cvRoot)),
    ]);

    if (site && heroRoot) renderHome(heroRoot, site);
    if (cv && cvRoot)     renderTimeline(cvRoot, cv);
  },

  async projects(main) {
    const root = main.querySelector('[data-projects]');
    const { renderProjects } = await import('./projects.js');
    const data = await loadJSON('projects').catch(errCard(root));
    if (data && root) renderProjects(root, data);
  },

  async contact(main) {
    const form  = main.querySelector('[data-contact-form]');
    const links = main.querySelector('[data-contact-links]');

    const [{ initContactForm }, site] = await Promise.all([
      import('./contact.js'),
      loadJSON('site').catch(() => null),
    ]);

    // site.json carries the relay access key, so the form waits for it.
    if (form) initContactForm(form, site);
    // The "or find me elsewhere" links mirror the ones on the front page.
    if (links && site) paintContactLinks(links, site);
  },
};

/* -------------------------------------------------------------------------
 * Boot
 * ------------------------------------------------------------------------
 * The call to boot() is at the very BOTTOM of this file, deliberately.
 * Function declarations hoist, but `const` and `let` do not: starting up from
 * the middle of the module means any module-level binding declared below the
 * call is still in its temporal dead zone, and touching one throws. Booting
 * last makes that impossible by construction.
 * ---------------------------------------------------------------------- */
function boot() {
  /* The inline script in each page's <head> starts a timer; if this flag is
     not set before it fires, it assumes the JavaScript failed and forces all
     content visible. Set it first, before anything that could throw. */
  window.__appReady = true;
  document.documentElement.classList.add('js-ready');

  buildNav();
  initThemeToggles();
  initLangToggles();
  applyLangToDocument();
  startConstellations();
  initPage(document.querySelector('main'));
  initRouter({ onPageReady: initPage, onHashOnly: markActiveTab });
  wireScrollCue();
}

/**
 * Runs the right page initialiser, then starts the reveal choreography.
 * Called on first load and again after every soft page transition.
 */
export async function initPage(main) {
  if (!main) return;
  markActiveTab();
  /* The swapped-in <main> is raw HTML straight from the file, so its
     [data-i18n] elements still hold their English defaults. Re-apply the
     active language before anything is visible. */
  applyLangToDocument();
  const name = main.dataset.page;
  try {
    if (PAGES[name]) await PAGES[name](main);
  } catch (err) {
    console.error(`[app] page "${name}" failed to initialise:`, err);
  }
  // Content is in the DOM now — start watching it for the rise-and-fade.
  observeReveals(main);
  wireScrollCue();
}

/* -------------------------------------------------------------------------
 * Navigation
 * ---------------------------------------------------------------------- */
function buildNav() {
  document.querySelectorAll('[data-nav]').forEach((nav) => {
    nav.innerHTML = '';
    NAV.forEach((item) => {
      const a = document.createElement('a');
      a.className = 'nav__link';
      a.dataset.navId = item.id;
      a.href = new URL(item.path + (item.scrollTo ? `#${item.scrollTo}` : ''), BASE).href;
      a.textContent = item.labels[getLang()] || item.labels.en;
      nav.append(a);
    });
    const ind = document.createElement('span');
    ind.className = 'nav__indicator';
    ind.setAttribute('aria-hidden', 'true');
    nav.append(ind);
  });
  markActiveTab();

  onLangChange(() => {
    document.querySelectorAll('[data-nav] .nav__link').forEach((a) => {
      const item = NAV.find((n) => n.id === a.dataset.navId);
      if (item) a.textContent = item.labels[getLang()] || item.labels.en;
    });
    requestAnimationFrame(moveIndicator);
  });

  window.addEventListener('resize', debounce(moveIndicator, 120));
}

/**
 * Highlights whichever tab matches the current URL. On the front page both
 * Home and CV point at the same document, so we let the scroll position pick
 * between them (see wireScrollSpy below).
 */
export function markActiveTab() {
  const path = currentPath();
  const hash = window.location.hash;
  let activeId = NAV.find((n) => n.path === path && n.scrollTo && `#${n.scrollTo}` === hash)?.id
              || NAV.find((n) => n.path === path && !n.scrollTo)?.id
              || NAV.find((n) => n.path === path)?.id;

  document.querySelectorAll('[data-nav] .nav__link').forEach((a) => {
    const on = a.dataset.navId === activeId;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  requestAnimationFrame(moveIndicator);
  wireScrollSpy();
}

/** Slides the little underline to sit under the active tab. */
function moveIndicator() {
  document.querySelectorAll('[data-nav]').forEach((nav) => {
    const active = nav.querySelector('.nav__link.is-active');
    const ind = nav.querySelector('.nav__indicator');
    if (!ind) return;
    if (!active) { ind.style.opacity = '0'; return; }
    const nr = nav.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    ind.style.opacity = '1';
    ind.style.transform = `translateX(${ar.left - nr.left}px)`;
    ind.style.width = `${ar.width}px`;
  });
}

/* On the front page, swap the highlight between Home and CV as you scroll. */
function wireScrollSpy() {
  const main = document.querySelector('main');
  if (!main || main.dataset.page !== 'home') return;
  if (scrollSpyBound) return;
  scrollSpyBound = true;

  const onScroll = throttleRAF(() => {
    const m = document.querySelector('main');
    if (!m || m.dataset.page !== 'home') return;
    const cv = document.getElementById('cv');
    if (!cv) return;
    const inCv = cv.getBoundingClientRect().top <= window.innerHeight * 0.35;
    document.querySelectorAll('[data-nav] .nav__link').forEach((a) => {
      const want = inCv ? 'cv' : 'home';
      const on = a.dataset.navId === want;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    moveIndicator();
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* -------------------------------------------------------------------------
 * Language toggle
 * ---------------------------------------------------------------------- */
function initLangToggles() {
  document.querySelectorAll('[data-lang-toggle]').forEach((btn) => {
    if (btn.dataset.langBound) return;
    btn.dataset.langBound = '1';
    btn.addEventListener('click', toggleLang);
  });
  // Re-running the reveal measurements matters here: Norwegian is longer than
  // English and the timeline has to re-pack around the new text heights.
  onLangChange(() => requestAnimationFrame(refreshReveals));
}

/* -------------------------------------------------------------------------
 * Background constellations
 * ---------------------------------------------------------------------- */
function startConstellations() {
  const canvas = document.getElementById('sky');
  if (!canvas || !CONFIG.constellations.enabled) return;
  try {
    const sky = initConstellations(canvas, CONFIG.constellations);
    onThemeChange(() => sky.refreshColors());
  } catch (err) {
    console.error('[app] constellations failed to start:', err);
    canvas.remove();   // never let a decorative layer break the page
  }
}

/* -------------------------------------------------------------------------
 * Bits and pieces
 * ---------------------------------------------------------------------- */

/**
 * Fades out the "scroll for more" cue once the visitor has scrolled.
 * home.js rebuilds the cue on every language change, so we keep ONE scroll
 * listener for the lifetime of the page and let it look the cue up each time,
 * rather than adding a listener per rendered cue.
 */
let cueBound = false;
function wireScrollCue() {
  if (cueBound) return;
  cueBound = true;
  const onScroll = throttleRAF(() => {
    const cue = document.querySelector('[data-scrollcue]');
    if (!cue) return;
    const p = Math.min(1, window.scrollY / Math.max(1, window.innerHeight * 0.4));
    cue.style.opacity = String(1 - p);
    const gone = p > 0.6;
    cue.style.pointerEvents = gone ? 'none' : '';
    // An invisible link you can still Tab to is a trap for keyboard users.
    if (gone) cue.setAttribute('tabindex', '-1'); else cue.removeAttribute('tabindex');
    cue.setAttribute('aria-hidden', gone ? 'true' : 'false');
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function paintContactLinks(root, site) {
  root.innerHTML = '';
  const h = document.createElement('h2');
  h.className = 'contact__elsewhere-head';
  h.textContent = ui('contact.elsewhere');
  root.append(h);
  const ul = document.createElement('ul');
  ul.className = 'hero__links';
  (site.links || []).filter((l) => l?.url).forEach((l) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'iconlink';
    a.href = safeUrl(l.url);
    a.target = '_blank';
    a.rel = 'me noopener noreferrer';
    a.textContent = l.label || l.url;
    li.append(a);
    ul.append(li);
  });
  root.append(ul);
}

/** Replaces a region with a small "could not load" card plus a retry button. */
function errCard(root) {
  return (err) => {
    console.error('[app] data load failed:', err);
    if (!root) return null;
    root.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'errcard';
    const p = document.createElement('p');
    p.textContent = ui('err.load');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = ui('err.retry');
    b.addEventListener('click', () => window.location.reload());
    box.append(p, b);
    root.append(box);
    return null;
  };
}

function debounce(fn, ms) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

function throttleRAF(fn) {
  let queued = false;
  return (...a) => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...a); });
  };
}

/* Re-export a couple of things the admin preview and the router want. */
export { asset, t };

/* -------------------------------------------------------------------------
 * Start. Everything above is declarations; this is the only statement with
 * side effects, and it runs once they all exist.
 * ---------------------------------------------------------------------- */
boot();
