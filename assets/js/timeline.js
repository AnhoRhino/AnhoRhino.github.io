/* =============================================================================
 * timeline.js — the CV timeline
 * =============================================================================
 *
 * A continuous axis runs down the middle with the years marked on it. Every
 * entry sits beside the axis at its true position in time, joined to the line
 * by a curly brace whose height IS the length of that job or degree. Entries
 * alternate right and left going back in time; when several overlap and both
 * inner columns are taken, the next one steps outward instead of colliding.
 *
 * Everything is derived from data/cv.json. Add an entry in the admin panel and
 * the layout re-solves itself — there are no hand-placed positions anywhere.
 *
 * HOW IT WORKS, IN ORDER
 *   1. TIME SCALE   months -> pixels, with long empty stretches compressed
 *                   (see buildScale)
 *   2. MEASURE      cards are rendered and their real heights read; Norwegian
 *                   text is longer than English so this cannot be guessed
 *   3. PACK         greedy interval partitioning into columns (see packLanes)
 *   4. PLACE        cards positioned absolutely; container height set
 *   5. DRAW         one SVG holds the axis, the year ticks and every brace
 *
 * Narrow screens drop the two-sided layout for a single column — see
 * layoutStack. The axis, the years and the braces all survive; only the
 * strict time-proportional positioning is traded away for legibility.
 * ---------------------------------------------------------------------------*/

import { CONFIG } from './config.js';
import { t, ui, formatMonth, formatDuration, onLangChange, getLang } from './i18n.js';
import { observeReveals, unobserveWithin } from './reveal.js';

/* --- geometry, in CSS pixels ---------------------------------------------
 * AXIS_HALF ─┤        ├─ BRACE_D ─┤ CARD_GAP ├───── card ─────
 *            │   ⟨ spike ⟩        ╲__ arms meet the card here
 *          axis
 * ---------------------------------------------------------------------- */
const GEO = {
  AXIS_HALF: 24,      // clear space either side of the centre line (year chips live here)
  BRACE_D: 30,        // how far a brace reaches out from the axis
  CARD_GAP: 6,        // brace tips to card — small, so the brace visibly grips it
  COL_GAP: 22,        // between stacked columns on the same side
  V_GAP: 30,          // minimum vertical breathing room between cards in a column
  MIN_COL: 232,       // a column narrower than this is unreadable -> go single-column
  MAX_COL: 400,
  MAX_RINGS: 3,       // at most 3 columns per side (so 6 concurrent entries)
  PAD_TOP: 26,
  PAD_BOTTOM: 40,
  BREAKPOINT: 860,    // below this width, single-column mode
  GAP_MIN_MONTHS: 14, // an empty stretch longer than this gets compressed…
  GAP_PX: 74,         // …down to this many pixels
  TICK_MIN_GAP: 44,   // minimum pixels between two year labels
};

const state = { container: null, data: null, bound: false, unsubLang: null };

/* =============================================================================
 * Entry point
 * ===========================================================================*/
export function renderTimeline(container, cvData) {
  if (!container) return;
  state.container = container;
  state.data = cvData;

  build();

  /* One language subscription for the module, not one per render. The soft
     router replaces <main>, so re-subscribing here would pile up listeners
     that each keep a detached container alive. */
  state.unsubLang?.();
  state.unsubLang = onLangChange(() => requestAnimationFrame(build));

  if (!state.bound) {
    state.bound = true;
    window.addEventListener('resize', debounce(build, 150));
    // Web fonts land after first paint and change every text height.
    if (document.fonts?.ready) document.fonts.ready.then(() => requestAnimationFrame(build));
  }
}

/* =============================================================================
 * 1. Time scale
 * ============================================================================
 * Months are numbered absolutely: year * 12 + (month - 1).
 *
 * A purely linear scale wastes enormous vertical space on any gap between
 * jobs, and a CV with a five-year gap would be mostly empty line. So the scale
 * is piecewise linear: stretches of time where something is happening run at
 * the full rate, and empty stretches longer than GAP_MIN_MONTHS collapse to a
 * fixed GAP_PX with a break marker drawn on the axis. Within any one entry the
 * scale is exactly linear, so brace heights remain honest and comparable.
 * ---------------------------------------------------------------------------*/
function parseYM(s) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return Number(m[1]) * 12 + (month - 1);
}

function todayM() {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
}

/** Normalises the raw JSON into { a, b, months, ongoing, … }. */
function prepare(entries) {
  const today = todayM();
  return (entries || [])
    .map((e, i) => {
      const a = parseYM(e.start) ?? today;
      if (e.start && parseYM(e.start) === null) {
        console.warn(`[timeline] "${e.org || e.id}" has an unreadable start date `
                   + `(${JSON.stringify(e.start)}); expected "YYYY-MM". Using today.`);
      }
      const ongoing = e.end == null || e.end === '';
      let bEnd = ongoing ? today : (parseYM(e.end) ?? today);
      if (bEnd < a) bEnd = a;                 // a typo should not invert the brace
      return {
        raw: e,
        index: i,
        a,                                    // first month, inclusive
        b: bEnd + 1,                          // one past the last month
        months: bEnd - a + 1,
        ongoing,
      };
    })
    // Newest first. Ties broken by the longer engagement, then by input order,
    // so the result is stable and does not jitter between renders.
    .sort((x, y) => (y.b - x.b) || (y.months - x.months) || (x.index - y.index));
}

function buildScale(items, pxPerMonth, collapseGaps) {
  const minA = Math.min(...items.map((e) => e.a));
  const maxB = Math.max(...items.map((e) => e.b));

  // Merge every entry's span so we know which months are "busy".
  const spans = items.map((e) => [e.a, e.b]).sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const [a, b] of spans) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }

  // Walk minA -> maxB emitting busy segments and the gaps between them.
  const segs = [];
  let cursor = minA;
  for (const [a, b] of merged) {
    if (a > cursor) segs.push({ from: cursor, to: a, gap: true });
    segs.push({ from: Math.max(a, cursor), to: b, gap: false });
    cursor = Math.max(cursor, b);
  }
  if (cursor < maxB) segs.push({ from: cursor, to: maxB, gap: true });

  let total = 0;
  for (const s of segs) {
    const months = s.to - s.from;
    s.h = (s.gap && collapseGaps && months > GEO.GAP_MIN_MONTHS)
      ? GEO.GAP_PX
      : months * pxPerMonth;
    s.compressed = s.h < months * pxPerMonth - 1;
    total += s.h;
  }
  if (total <= 0) total = pxPerMonth * 12;    // one entry, one month: give it room

  /** Pixels from the OLDEST edge up to month m. */
  function distFromMin(m) {
    let acc = 0;
    for (const s of segs) {
      if (m >= s.to) { acc += s.h; continue; }
      if (m > s.from) {
        const span = s.to - s.from;
        if (span > 0) acc += s.h * ((m - s.from) / span);
      }
      break;
    }
    return acc;
  }

  return {
    total,
    segs,
    minA,
    maxB,
    /** y in pixels from the top of the timeline (newest = 0). */
    y: (m) => total - distFromMin(clampNum(m, minA, maxB)),
  };
}

/* =============================================================================
 * 2. The curly brace
 * ============================================================================
 * A `{` that is simply scaled to height looks wrong — the curls stretch into
 * sausages. So the path is built from FIXED-radius corner curves at the two
 * ends and a FIXED-size spike in the middle, with two straight segments taking
 * up whatever length is left over. A three-month brace and a ten-year brace
 * therefore have identical curl geometry and only differ in the length of
 * their straight runs.
 *
 *   x = 0  is the spike, pointing at the axis
 *   x = d  is where the two arms meet the card
 *
 *          (d,0) ──╮
 *                  │ stem at x = d*0.46
 *          (0,h/2) ◄  spike
 *                  │
 *          (d,h) ──╯
 *
 * `side` is +1 for a card on the right of the axis (a normal `{`) and -1 for a
 * card on the left (mirrored into a `}`).
 */
function bracePath(h, d, side = 1) {
  const H = Math.max(h, 8);
  /* The stem sits halfway out, so the spike protrudes as far inward as the
     arms reach outward. That symmetry is what makes the eye read "{" rather
     than "[". */
  const stem = d * 0.5;
  // The curl radius must never exceed a quarter of the height or the two ends
  // would meet in the middle and the straight segments would go negative.
  const r = Math.min(stem, H / 4, 14);
  const m = H / 2;
  const sx = (x) => (x * side).toFixed(2);   // mirror by negating x

  return [
    `M${sx(d)},0`,
    `Q${sx(stem)},0 ${sx(stem)},${r.toFixed(2)}`,
    `L${sx(stem)},${(m - r).toFixed(2)}`,
    `Q${sx(stem)},${m.toFixed(2)} 0,${m.toFixed(2)}`,
    `Q${sx(stem)},${m.toFixed(2)} ${sx(stem)},${(m + r).toFixed(2)}`,
    `L${sx(stem)},${(H - r).toFixed(2)}`,
    `Q${sx(stem)},${H.toFixed(2)} ${sx(d)},${H.toFixed(2)}`,
  ].join(' ');
}

/* =============================================================================
 * 3. Lane packing
 * ============================================================================
 * Classic greedy interval partitioning, with a twist for the alternation.
 *
 * Lanes are numbered outward from the axis: 0 = right inner, 1 = left inner,
 * 2 = right second, 3 = left second, and so on. For each entry (already
 * sorted top to bottom) we try lanes in this order:
 *
 *      preferred side ring 0, other side ring 0,
 *      preferred side ring 1, other side ring 1, …
 *
 * and take the first whose last occupant has already finished. After placing
 * one we flip the preferred side, which produces strict left/right alternation
 * whenever nothing overlaps, and steps outward only when it must.
 *
 * `maxRings` is how many columns per side actually FIT in the available width
 * — computed by the caller, never assumed. If more entries overlap than there
 * are columns, the surplus is pushed downward rather than allowed to collide,
 * and a faint leader line is drawn back to its true place on the axis.
 *
 * O(n · rings) — with a realistic CV that is a few dozen comparisons.
 * ---------------------------------------------------------------------------*/
function packLanes(placed, maxRings = GEO.MAX_RINGS) {
  const lanes = [];                 // laneIndex -> bottom of the last card in it
  let preferRight = true;
  let maxRing = 0;
  const ringCap = Math.max(1, Math.min(maxRings, GEO.MAX_RINGS));

  for (const p of placed) {
    const order = [];
    for (let ring = 0; ring < ringCap; ring++) {
      const near = ring * 2 + (preferRight ? 0 : 1);
      const far = ring * 2 + (preferRight ? 1 : 0);
      order.push(near, far);
    }

    let chosen = -1;
    for (const lane of order) {
      const bottom = lanes[lane];
      if (bottom === undefined || bottom <= p.top - GEO.V_GAP) { chosen = lane; break; }
    }

    if (chosen === -1) {
      /* Everything is full. Rather than overlap, drop into the least-occupied
         lane and push the card down below whatever is already there. The brace
         still points at the true dates, so the timing stays readable even
         though the card has slipped. */
      let best = 0;
      for (let i = 1; i < order.length; i++) {
        if ((lanes[order[i]] ?? -Infinity) < (lanes[order[best]] ?? -Infinity)) best = i;
      }
      chosen = order[best];
      const shift = (lanes[chosen] + GEO.V_GAP) - p.top;
      if (shift > 0) { p.top += shift; p.shifted = true; }
    }

    p.lane = chosen;
    p.side = chosen % 2 === 0 ? 1 : -1;      // +1 right, -1 left
    p.ring = Math.floor(chosen / 2);
    maxRing = Math.max(maxRing, p.ring);
    lanes[chosen] = p.top + p.height;
    preferRight = p.side !== 1;
  }

  return maxRing + 1;                         // rings actually used, per side
}

/* =============================================================================
 * 4. Build
 * ===========================================================================*/
function build() {
  const container = state.container;
  // Detached? Then this page is no longer on screen — nothing to lay out.
  if (!container || !document.body.contains(container)) return;

  const entries = prepare(state.data?.entries);
  // Stop watching the cards we are about to destroy, or the observer keeps a
  // reference to every card from every previous rebuild.
  unobserveWithin(container);
  container.innerHTML = '';
  container.classList.add('tl');
  container.style.removeProperty('height');

  if (!entries.length) {
    const p = document.createElement('p');
    p.className = 'tl__empty';
    p.textContent = ui('cv.empty');
    container.append(p);
    return;
  }

  const width = container.clientWidth || container.getBoundingClientRect().width || 900;
  const narrow = width < GEO.BREAKPOINT;
  container.classList.toggle('tl--narrow', narrow);

  /* Cards go into the DOM first so we can measure them, invisible until the
     layout has decided where they belong. */
  const cards = entries.map((e) => buildCard(e, narrow));
  const frag = document.createDocumentFragment();
  cards.forEach((c) => frag.append(c.el));
  container.append(frag);

  const layout = narrow
    ? layoutStack(cards, width)
    : layoutTimeline(cards, entries, width);

  container.style.height = `${layout.height}px`;
  container.prepend(layout.svg);
  layout.chips.forEach((chip) => container.append(chip));

  cards.forEach((c, i) => { c.el.style.setProperty('--i', String(Math.min(i, 8))); });
  wireHoverLink(container);
  observeReveals(container);
}

/* --- the two-sided, time-proportional layout ----------------------------- */
function layoutTimeline(cards, entries, width) {
  const pxPerMonth = Math.max(4, (CONFIG.timeline?.pxPerYear ?? 260) / 12);
  const minBrace = CONFIG.timeline?.minBraceHeight ?? 44;
  const scale = buildScale(entries, pxPerMonth, CONFIG.timeline?.collapseGaps !== false);

  const axisX = width / 2;
  const innerEdge = GEO.AXIS_HALF + GEO.BRACE_D + GEO.CARD_GAP;

  /* How many columns per side can actually fit at a readable width? This is a
     hard ceiling — exceeding it would push cards off the side of the page. */
  const halfWidth = width / 2 - innerEdge;
  const ringCap = clampNum(
    Math.floor((halfWidth + GEO.COL_GAP) / (GEO.MIN_COL + GEO.COL_GAP)),
    1, GEO.MAX_RINGS,
  );

  /* Column width depends on how many columns we end up needing, but that
     depends on card heights, which depend on column width. So we solve it by
     iteration — it converges in one or two passes for any real CV. */
  let rings = 1;
  let colW = colWidthFor(rings);
  let placed = [];

  for (let pass = 0; pass < 4; pass++) {
    cards.forEach((c) => { c.el.style.width = `${colW}px`; });
    // One forced reflow, then all the reads together: no thrash.
    void cards[0].el.offsetHeight;
    placed = cards.map((c, i) => {
      const e = entries[i];
      const braceH = Math.max(scale.y(e.a) - scale.y(e.b), minBrace);
      const braceTop = scale.y(e.b);
      const height = c.el.offsetHeight;
      return {
        card: c, entry: e, height, braceH, braceTop,
        top: braceTop + (braceH - height) / 2,   // card centred on its brace
      };
    });

    const needed = packLanes(placed, ringCap);
    if (needed === rings) break;
    rings = needed;
    const next = colWidthFor(rings);
    if (Math.abs(next - colW) < 1) break;
    colW = next;
  }

  function colWidthFor(r) {
    const avail = halfWidth - (r - 1) * GEO.COL_GAP;
    return clampNum(avail / r, GEO.MIN_COL, GEO.MAX_COL);
  }

  /* --- place the cards -------------------------------------------------- */
  let minTop = Infinity, maxBottom = -Infinity;
  placed.forEach((p, i) => { p.uid = String(i); p.card.el.dataset.tlId = p.uid; });

  for (const p of placed) {
    const offset = innerEdge + p.ring * (colW + GEO.COL_GAP);
    const left = p.side === 1 ? axisX + offset : axisX - offset - colW;
    p.left = left;
    p.card.el.style.left = `${left}px`;
    p.card.el.style.top = `${p.top + GEO.PAD_TOP}px`;
    p.card.el.classList.add(p.side === 1 ? 'tl__item--right' : 'tl__item--left');
    if (p.ring > 0) p.card.el.classList.add('tl__item--outer');
    minTop = Math.min(minTop, p.top, p.braceTop);
    maxBottom = Math.max(maxBottom, p.top + p.height, p.braceTop + p.braceH);
  }

  /* A card taller than its own brace sticks out above the brace's top. For
     the newest entry that can put it above y=0 and clip it against the top of
     the container, so shift everything down by however much overhangs. */
  const overhang = Math.max(0, -minTop);
  if (overhang > 0) {
    for (const p of placed) {
      p.top += overhang;
      p.braceTop += overhang;
      p.card.el.style.top = `${p.top + GEO.PAD_TOP}px`;
    }
    maxBottom += overhang;
  }

  const height = Math.max(scale.total + overhang, maxBottom) + GEO.PAD_TOP + GEO.PAD_BOTTOM;

  /* --- the axis, the ticks and the braces ------------------------------- */
  const svg = makeSVG(width, height);
  const axisTop = GEO.PAD_TOP - 8;
  const axisBottom = Math.max(scale.total + overhang, maxBottom) + GEO.PAD_TOP + 8;

  svg.append(
    svgEl('line', {
      class: 'tl__axisline', stroke: 'url(#tlAxisFade)',
      x1: axisX, y1: axisTop, x2: axisX, y2: axisBottom,
    }),
  );

  /* Compression markers: a little break in the line where years were skipped. */
  let acc = 0;
  for (let i = scale.segs.length - 1; i >= 0; i--) {
    const s = scale.segs[i];
    if (s.compressed) {
      const y = GEO.PAD_TOP + overhang + acc + s.h / 2;
      for (const dy of [-5, 0, 5]) {
        svg.append(svgEl('line', {
          class: 'tl__break', x1: axisX - 6, y1: y + dy, x2: axisX + 6, y2: y + dy - 3,
        }));
      }
    }
    acc += s.h;
  }

  /* Braces + the dot where each brace touches the axis. */
  for (const p of placed) {
    const y = p.braceTop + GEO.PAD_TOP;
    const x = p.side === 1 ? axisX + GEO.AXIS_HALF : axisX - GEO.AXIS_HALF;
    const g = svgEl('g', {
      class: `tl__brace tl__brace--${p.side === 1 ? 'r' : 'l'}`,
      'data-tl-id': p.uid,
      transform: `translate(${x.toFixed(1)}, ${y.toFixed(1)})`,
    });
    g.append(svgEl('path', { class: 'tl__bracepath', d: bracePath(p.braceH, GEO.BRACE_D, p.side) }));
    svg.append(g);

    svg.append(svgEl('circle', {
      class: 'tl__node', 'data-tl-id': p.uid, cx: axisX, cy: y + p.braceH / 2, r: 3.2,
    }));

    /* When a card had to slip away from its true dates, a faint guide line
       shows where it really belongs. */
    if (p.shifted) {
      const braceMidY = y + p.braceH / 2;
      const cardMidY = p.top + GEO.PAD_TOP + p.height / 2;
      svg.append(svgEl('line', {
        class: 'tl__leader',
        x1: p.side === 1 ? x + GEO.BRACE_D : x - GEO.BRACE_D, y1: braceMidY,
        x2: p.side === 1 ? p.left : p.left + colW, y2: cardMidY,
      }));
    }
  }

  /* --- year chips ------------------------------------------------------- */
  const chips = [];
  const firstYear = Math.floor(scale.minA / 12);
  const lastYear = Math.floor((scale.maxB - 1) / 12);
  const years = [];
  for (let yr = lastYear; yr >= firstYear; yr--) years.push(yr);

  let lastY = -Infinity;
  for (const yr of years) {
    const monthIndex = clampNum(yr * 12, scale.minA, scale.maxB);
    const y = scale.y(monthIndex) + GEO.PAD_TOP + overhang;
    if (Math.abs(y - lastY) < GEO.TICK_MIN_GAP) continue;
    lastY = y;

    svg.append(svgEl('line', {
      class: 'tl__tick', x1: axisX - 7, y1: y, x2: axisX + 7, y2: y,
    }));

    const chip = document.createElement('span');
    chip.className = 'tl__year tnum';
    chip.textContent = String(yr);
    chip.style.top = `${y}px`;
    chip.style.left = `${axisX}px`;
    chips.push(chip);
  }

  return { svg, chips, height };
}

/* --- the single-column layout for narrow screens ------------------------- *
 * The axis, the years and the duration-proportional braces all survive; what
 * is traded away is exact vertical time-proportionality, because on a 380px
 * screen cards are tall and would collide constantly. Cards simply stack, and
 * each one still carries its exact dates in its own header.
 * ---------------------------------------------------------------------------*/
function layoutStack(cards, width) {
  const axisX = 16 + GEO.AXIS_HALF;
  const left = axisX + GEO.BRACE_D + GEO.CARD_GAP;
  const colW = Math.max(180, width - left - 4);
  const minBrace = CONFIG.timeline?.minBraceHeight ?? 44;
  const pxPerMonth = Math.max(3, (CONFIG.timeline?.pxPerYear ?? 260) / 12 * 0.42);

  cards.forEach((c) => { c.el.style.width = `${colW}px`; });
  void cards[0].el.offsetHeight;

  const chips = [];
  let y = GEO.PAD_TOP;
  let lastChipYear = null;
  const braces = [];

  cards.forEach((c) => {
    const h = c.el.offsetHeight;
    c.el.style.left = `${left}px`;
    c.el.style.top = `${y}px`;
    c.el.classList.add('tl__item--right');

    const braceH = clampNum(c.entry.months * pxPerMonth, minBrace, h);
    braces.push({ y: y + (h - braceH) / 2, h: braceH });

    const yr = Math.floor((c.entry.b - 1) / 12);
    if (yr !== lastChipYear) {
      lastChipYear = yr;
      const chip = document.createElement('span');
      chip.className = 'tl__year tnum';
      chip.textContent = String(yr);
      chip.style.top = `${y + 14}px`;
      chip.style.left = `${axisX}px`;
      chips.push(chip);
    }

    y += h + GEO.V_GAP;
  });

  const height = y + GEO.PAD_BOTTOM;
  const svg = makeSVG(width, height);
  svg.append(svgEl('line', {
    class: 'tl__axisline', stroke: 'url(#tlAxisFade)',
    x1: axisX, y1: GEO.PAD_TOP - 8, x2: axisX, y2: height - GEO.PAD_BOTTOM + 8,
  }));
  braces.forEach((b) => {
    const g = svgEl('g', {
      class: 'tl__brace tl__brace--r',
      transform: `translate(${axisX + GEO.AXIS_HALF}, ${b.y.toFixed(1)})`,
    });
    g.append(svgEl('path', { class: 'tl__bracepath', d: bracePath(b.h, GEO.BRACE_D, 1) }));
    svg.append(g);
    svg.append(svgEl('circle', { class: 'tl__node', cx: axisX, cy: b.y + b.h / 2, r: 3 }));
  });

  return { svg, chips, height };
}

/* Hovering or focusing a card highlights its brace, so it is always obvious
 * which stretch of the axis a card refers to — especially in the outer
 * columns where the card sits some distance from the line. */
function wireHoverLink(container) {
  if (container.dataset.hoverBound) return;
  container.dataset.hoverBound = '1';

  const setActive = (id, on) => {
    container.querySelectorAll(`[data-tl-id="${id}"]`).forEach((n) => {
      n.classList.toggle('is-linked', on);
    });
  };
  const from = (ev) => ev.target.closest?.('.tl__item')?.dataset.tlId;

  container.addEventListener('pointerover', (ev) => { const id = from(ev); if (id) setActive(id, true); });
  container.addEventListener('pointerout',  (ev) => { const id = from(ev); if (id) setActive(id, false); });
  container.addEventListener('focusin',     (ev) => { const id = from(ev); if (id) setActive(id, true); });
  container.addEventListener('focusout',    (ev) => { const id = from(ev); if (id) setActive(id, false); });
}

/* =============================================================================
 * 5. One card
 * ===========================================================================*/
function buildCard(entry, narrow) {
  const e = entry.raw;
  const el = document.createElement('article');
  el.className = `tl__item reveal tl__item--${e.kind || 'work'}`;
  el.lang = getLang();

  const card = document.createElement('div');
  card.className = 'tl__card';

  const head = document.createElement('header');
  head.className = 'tl__head';

  const kind = document.createElement('span');
  kind.className = 'tl__kind';
  kind.textContent = ui(`cv.${e.kind === 'education' ? 'education' : e.kind === 'other' ? 'other' : 'work'}`);
  head.append(kind);

  const org = document.createElement('h3');
  org.className = 'tl__org';
  org.textContent = e.org || '';
  head.append(org);

  const role = document.createElement('p');
  role.className = 'tl__role';
  role.textContent = t(e.title);
  if (role.textContent) head.append(role);

  const meta = document.createElement('p');
  meta.className = 'tl__meta tnum';
  const range = `${formatMonth(e.start)} — ${entry.ongoing ? ui('home.present') : formatMonth(e.end)}`;
  const dur = formatDuration(entry.months);
  meta.textContent = e.location ? `${range} · ${dur} · ${e.location}` : `${range} · ${dur}`;
  head.append(meta);

  card.append(head);

  const bullets = (e.bullets || []).map((b) => t(b)).filter(Boolean);
  if (bullets.length) {
    const ul = document.createElement('ul');
    ul.className = 'tl__bullets';
    bullets.forEach((b) => {
      const li = document.createElement('li');
      li.textContent = b;
      ul.append(li);
    });
    card.append(ul);
  }

  if (Array.isArray(e.tags) && e.tags.length) {
    const ul = document.createElement('ul');
    ul.className = 'chiplist tl__tags';
    e.tags.forEach((tg) => {
      const li = document.createElement('li');
      li.textContent = tg;
      ul.append(li);
    });
    card.append(ul);
  }

  el.append(card);
  return { el, entry, narrow };
}

/* =============================================================================
 * Helpers
 * ===========================================================================*/
const SVG_NS = 'http://www.w3.org/2000/svg';

function makeSVG(w, h) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'tl__svg');
  svg.setAttribute('width', String(Math.round(w)));
  svg.setAttribute('height', String(Math.round(h)));
  svg.setAttribute('viewBox', `0 0 ${Math.round(w)} ${Math.round(h)}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  /* The axis fades out at both ends rather than stopping dead. There is only
     ever one timeline on a page, so a fixed gradient id is safe. */
  const defs = document.createElementNS(SVG_NS, 'defs');
  const grad = svgEl('linearGradient', { id: 'tlAxisFade', x1: 0, y1: 0, x2: 0, y2: 1 });
  [[0, 0], [0.045, 1], [0.955, 1], [1, 0]].forEach(([offset, opacity]) => {
    grad.append(svgEl('stop', { offset, 'stop-color': 'currentColor', 'stop-opacity': opacity }));
  });
  defs.append(grad);
  svg.append(defs);
  return svg;
}

function svgEl(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

function clampNum(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function debounce(fn, ms) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

/* Exported for the test page in tools/ — not used by the site itself. */
export const __internals = { parseYM, buildScale, bracePath, packLanes, prepare, GEO };
