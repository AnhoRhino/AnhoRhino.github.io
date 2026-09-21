/* =============================================================================
 * projects.js — the Projects grid and the detail dialog
 * =============================================================================
 *
 * Reads data/projects.json and renders one card per project, in array order.
 * (The admin panel reorders that array by drag and drop — order in the file is
 * order on the page, so there is no separate "position" field to keep in sync.)
 *
 * Clicking a card opens a native <dialog> with the long description, the image
 * gallery and any links, with an X in the top right to close it again.
 * The dialog is deep-linkable: opening it puts #project-<id> in the address
 * bar, so you can send someone a link straight to one project.
 * ---------------------------------------------------------------------------*/

import { asset, safeUrl } from './base.js';
import { t, ui, onLangChange } from './i18n.js';

let state = { projects: [], openIndex: -1, container: null, dialog: null, unsubLang: null };

/* -------------------------------------------------------------------------
 * Public entry point
 * ---------------------------------------------------------------------- */
export function renderProjects(container, data) {
  state.container = container;
  state.projects = Array.isArray(data?.projects) ? data.projects : [];

  paintGrid();
  ensureDialog();

  /* Re-paint (not re-create) when the visitor switches language. Exactly one
     subscription for the module: the soft router hands us a brand-new
     container on every visit, so a per-container guard would leak a listener
     (and the detached container it closes over) on each navigation. */
  state.unsubLang?.();
  state.unsubLang = onLangChange(() => {
    paintGrid();
    if (state.openIndex >= 0) paintDialog(state.openIndex);
  });

  // Honour #project-<id> on first load and on back/forward.
  openFromHash();
  if (!window.__projHashBound) {
    window.__projHashBound = true;
    window.addEventListener('hashchange', openFromHash);
  }
}

/* -------------------------------------------------------------------------
 * The grid
 * ---------------------------------------------------------------------- */
function paintGrid() {
  const c = state.container;
  if (!c) return;
  c.innerHTML = '';

  if (state.projects.length === 0) {
    const empty = el('p', 'projects__empty');
    empty.textContent = ui('projects.empty');
    c.append(empty);
    return;
  }

  state.projects.forEach((p, i) => c.append(buildCard(p, i)));
}

function buildCard(p, index) {
  const card = el('article', 'pcard reveal');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${t(p.title)} — ${ui('projects.open')}`);
  // Stagger the reveal, but cap it: with 30 projects an uncapped index would
  // make the last card wait nearly two seconds to appear.
  card.style.setProperty('--i', String(Math.min(index, 8)));

  /* --- media ------------------------------------------------------------ */
  const media = el('div', 'pcard__media');
  const cover = p.cover ? asset(p.cover) : '';
  if (cover) {
    const img = el('img', 'pcard__img');
    img.src = cover;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    // If the file is missing, silently fall back to the generated pattern.
    img.addEventListener('error', () => {
      img.remove();
      media.append(placeholderArt(p.id || String(index)));
    }, { once: true });
    media.append(img);
  } else {
    media.append(placeholderArt(p.id || String(index)));
  }
  if (p.year) {
    const year = el('span', 'pcard__year');
    year.textContent = p.year;
    media.append(year);
  }

  /* --- body ------------------------------------------------------------- */
  const body = el('div', 'pcard__body');
  const h = el('h3', 'pcard__title');
  h.textContent = t(p.title);
  body.append(h);

  const sum = t(p.summary);
  if (sum) {
    const s = el('p', 'pcard__summary');
    s.textContent = sum;
    body.append(s);
  }

  if (Array.isArray(p.tags) && p.tags.length) {
    body.append(tagList(p.tags, 'pcard__tags'));
  }

  card.append(media, body);

  const open = () => openProject(index);
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });

  return card;
}

/* A deterministic little star pattern for projects with no cover image, so an
 * image-less project still looks intentional rather than broken.            */
function placeholderArt(seed) {
  const rnd = mulberry32(hashString(seed));
  const W = 400, H = 260, N = 7;
  const pts = [];
  for (let i = 0; i < N; i++) {
    pts.push([
      40 + rnd() * (W - 80),
      35 + rnd() * (H - 70),
      1.1 + rnd() * 2.2,
    ]);
  }
  // Connect each star to its nearest not-yet-connected neighbour: a plausible
  // constellation rather than random spaghetti.
  const lines = [];
  for (let i = 1; i < N; i++) {
    let best = 0, bestD = Infinity;
    for (let j = 0; j < i; j++) {
      const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
      if (d < bestD) { bestD = d; best = j; }
    }
    lines.push([i, best]);
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'pcard__art');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('aria-hidden', 'true');

  lines.forEach(([a, b]) => {
    const l = document.createElementNS(svg.namespaceURI, 'line');
    l.setAttribute('x1', pts[a][0].toFixed(1)); l.setAttribute('y1', pts[a][1].toFixed(1));
    l.setAttribute('x2', pts[b][0].toFixed(1)); l.setAttribute('y2', pts[b][1].toFixed(1));
    svg.append(l);
  });
  pts.forEach(([x, y, r]) => {
    const c = document.createElementNS(svg.namespaceURI, 'circle');
    c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1));
    c.setAttribute('r', r.toFixed(2));
    svg.append(c);
  });
  return svg;
}

/* -------------------------------------------------------------------------
 * The detail dialog
 * ---------------------------------------------------------------------- */
function ensureDialog() {
  if (state.dialog && document.body.contains(state.dialog)) return state.dialog;

  const dlg = el('dialog', 'pdlg');
  dlg.innerHTML = `
    <div class="pdlg__chrome">
      <button class="pdlg__nav pdlg__nav--prev" type="button" data-prev></button>
      <button class="pdlg__nav pdlg__nav--next" type="button" data-next></button>
      <button class="pdlg__close" type="button" data-close>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
    <div class="pdlg__scroll"><div class="pdlg__inner" data-body></div></div>`;

  dlg.querySelector('[data-close]').addEventListener('click', closeProject);
  dlg.querySelector('[data-prev]').addEventListener('click', () => step(-1));
  dlg.querySelector('[data-next]').addEventListener('click', () => step(1));

  // Click on the backdrop (i.e. on the dialog element itself, outside the
  // content box) closes — a convention people expect.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeProject(); });

  // Esc fires 'cancel' on a native dialog; keep our state in step.
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeProject(); });

  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  document.body.append(dlg);
  state.dialog = dlg;
  return dlg;
}

export function openProject(index) {
  if (index < 0 || index >= state.projects.length) return;
  const dlg = ensureDialog();
  state.openIndex = index;
  paintDialog(index);

  if (!dlg.open) {
    dlg.showModal();
    document.documentElement.classList.add('is-dialog-open');
  }
  dlg.querySelector('.pdlg__scroll').scrollTop = 0;
  dlg.querySelector('[data-close]')?.focus();

  const id = state.projects[index].id;
  if (id) history.replaceState(null, '', `#project-${encodeURIComponent(id)}`);
}

export function closeProject() {
  const dlg = state.dialog;
  state.openIndex = -1;
  if (dlg?.open) dlg.close();
  document.documentElement.classList.remove('is-dialog-open');
  if (window.location.hash.startsWith('#project-')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

function step(delta) {
  if (state.openIndex < 0 || state.projects.length < 2) return;
  const n = state.projects.length;
  openProject((state.openIndex + delta + n) % n);
}

function paintDialog(index) {
  const p = state.projects[index];
  const dlg = state.dialog;
  const body = dlg.querySelector('[data-body]');
  body.innerHTML = '';

  dlg.setAttribute('aria-label', t(p.title));
  dlg.querySelector('[data-close]').setAttribute('aria-label', ui('projects.close'));
  const prev = dlg.querySelector('[data-prev]');
  const next = dlg.querySelector('[data-next]');
  prev.setAttribute('aria-label', ui('projects.prev'));
  next.setAttribute('aria-label', ui('projects.next'));
  const multi = state.projects.length > 1;
  prev.hidden = !multi;
  next.hidden = !multi;

  /* --- header ----------------------------------------------------------- */
  const head = el('header', 'pdlg__head');
  const h = el('h2', 'pdlg__title');
  h.textContent = t(p.title);
  head.append(h);

  const meta = el('p', 'pdlg__meta');
  const bits = [];
  if (p.year) bits.push(p.year);
  const sum = t(p.summary);
  if (sum) bits.push(sum);
  meta.textContent = bits.join(' · ');
  if (bits.length) head.append(meta);

  if (Array.isArray(p.tags) && p.tags.length) head.append(tagList(p.tags, 'pdlg__tags'));
  body.append(head);

  /* --- lead image ------------------------------------------------------- */
  const leadSrc = p.cover || p.images?.[0]?.src || '';
  if (leadSrc) {
    const fig = el('figure', 'pdlg__lead');
    const img = el('img');
    img.src = asset(leadSrc);
    img.alt = t(p.images?.[0]?.caption) || t(p.title);
    img.loading = 'eager';
    img.addEventListener('error', () => fig.remove(), { once: true });
    fig.append(img);
    body.append(fig);
  }

  /* --- description: blank lines become paragraphs ----------------------- */
  const desc = t(p.description);
  if (desc) {
    const wrap = el('div', 'pdlg__prose');
    desc.split(/\n\s*\n/).forEach((para) => {
      const para2 = para.trim();
      if (!para2) return;
      const el2 = el('p');
      // Single newlines inside a paragraph become <br>, not new paragraphs.
      para2.split('\n').forEach((line, i) => {
        if (i) el2.append(document.createElement('br'));
        el2.append(document.createTextNode(line));
      });
      wrap.append(el2);
    });
    body.append(wrap);
  }

  /* --- gallery (everything after the lead image) ------------------------ */
  const gallery = (p.images || []).filter((im) => im?.src && im.src !== leadSrc);
  if (gallery.length) {
    const sec = el('section', 'pdlg__gallery');
    const gh = el('h3', 'pdlg__subhead');
    gh.textContent = ui('projects.gallery');
    sec.append(gh);
    const grid = el('div', 'pdlg__grid');
    gallery.forEach((im) => {
      const fig = el('figure');
      const img = el('img');
      img.src = asset(im.src);
      img.alt = t(im.caption) || '';
      img.loading = 'lazy';
      img.addEventListener('error', () => fig.remove(), { once: true });
      fig.append(img);
      const cap = t(im.caption);
      if (cap) {
        const fc = el('figcaption');
        fc.textContent = cap;
        fig.append(fc);
      }
      grid.append(fig);
    });
    sec.append(grid);
    body.append(sec);
  }

  /* --- links ------------------------------------------------------------ */
  const links = (p.links || []).filter((l) => l?.url);
  if (links.length) {
    const sec = el('section', 'pdlg__links');
    const lh = el('h3', 'pdlg__subhead');
    lh.textContent = ui('projects.links');
    sec.append(lh);
    const ul = el('ul');
    links.forEach((l) => {
      const li = el('li');
      const a = el('a', 'btn btn--ghost');
      a.href = safeUrl(l.url);
      a.textContent = l.label || l.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.append(a);
      ul.append(li);
    });
    sec.append(ul);
    body.append(sec);
  }
}

function openFromHash() {
  const m = /^#project-(.+)$/.exec(window.location.hash);
  if (!m) return;
  const id = decodeURIComponent(m[1]);
  const i = state.projects.findIndex((p) => p.id === id);
  if (i >= 0) openProject(i);
}

/* -------------------------------------------------------------------------
 * Small helpers
 * ---------------------------------------------------------------------- */
function el(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

function tagList(tags, cls) {
  const ul = el('ul', cls);
  tags.forEach((tg) => {
    const li = el('li');
    li.textContent = tg;
    ul.append(li);
  });
  return ul;
}

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let tt = Math.imul(a ^ (a >>> 15), 1 | a);
    tt = (tt + Math.imul(tt ^ (tt >>> 7), 61 | tt)) ^ tt;
    return ((tt ^ (tt >>> 14)) >>> 0) / 4294967296;
  };
}
