/* =============================================================================
 * home.js — the hero at the top of the front page
 * =============================================================================
 *
 * Renders name, tagline, the short intro, the photo, the social links and the
 * skills block from data/site.json. Everything is bilingual through t().
 * The CV timeline below it is rendered separately by timeline.js.
 * ---------------------------------------------------------------------------*/

import { asset, safeUrl } from './base.js';
import { t, ui, onLangChange } from './i18n.js';

const ICONS = {
  linkedin: 'M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.5 4.78 5.76V21h-4v-5.6c0-1.34-.03-3.07-1.95-3.07-1.96 0-2.26 1.46-2.26 2.97V21h-4z',
  github:   'M12 2a10 10 0 00-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 015 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0012 2z',
  mail:     'M3 5h18a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1zm1.4 2L12 12.3 19.6 7H4.4zM20 8.9l-7.4 5.2a1 1 0 01-1.2 0L4 8.9V17h16z',
  link:     'M10.6 13.4a1 1 0 011.4 0 3 3 0 004.3 0l2.8-2.9a3 3 0 00-4.3-4.2l-1.3 1.3a1 1 0 11-1.4-1.4l1.3-1.4a5 5 0 017.1 7.1l-2.8 2.9a5 5 0 01-7.1 0 1 1 0 010-1.4zm2.8-2.8a1 1 0 010 1.4 3 3 0 000 4.2 1 1 0 01-1.4 1.4 5 5 0 010-7.1 1 1 0 011.4 0z',
};

let unsubLang = null;

export function renderHome(root, site) {
  if (!root) return;
  paint();
  // One subscription per module, replaced on each render — see projects.js.
  unsubLang?.();
  unsubLang = onLangChange(paint);

  function paint() {
    root.innerHTML = '';

    /* --- text column --------------------------------------------------- */
    const text = el('div', 'hero__text');

    const eyebrow = el('p', 'hero__eyebrow reveal');
    eyebrow.textContent = t(site.tagline);
    text.append(eyebrow);

    const h1 = el('h1', 'hero__name reveal');
    h1.textContent = site.name || '';
    text.append(h1);

    const intro = el('p', 'hero__intro reveal');
    intro.textContent = t(site.intro);
    text.append(intro);

    const links = (site.links || []).filter((l) => l?.url);
    if (links.length) {
      const nav = el('ul', 'hero__links reveal');
      links.forEach((l) => {
        const li = el('li');
        const a = el('a', 'iconlink');
        a.href = safeUrl(l.url);
        a.target = '_blank';
        a.rel = 'me noopener noreferrer';
        a.append(icon(l.icon), document.createTextNode(l.label || ''));
        li.append(a);
        nav.append(li);
      });
      text.append(nav);
    }

    /* --- portrait ------------------------------------------------------- */
    const figure = el('figure', 'hero__portrait reveal');
    if (site.photo) {
      const pic = el('picture');
      /* We ship @450.webp / .webp next to the default profile .jpg only. For
         any other photo (a .png uploaded through the admin, say) advertising a
         .webp that does not exist would point <source> at the wrong file — so
         we simply do not add the source and let the <img> do the work. */
      if (/\.jpe?g$/i.test(site.photo)) {
        const webp = document.createElement('source');
        webp.type = 'image/webp';
        webp.srcset = `${asset(site.photo.replace(/\.jpe?g$/i, '@450.webp'))} 450w, `
                    + `${asset(site.photo.replace(/\.jpe?g$/i, '.webp'))} 900w`;
        webp.sizes = '(max-width: 720px) 200px, 320px';
        pic.append(webp);
      }
      const img = el('img');
      img.src = asset(site.photo);
      img.alt = site.name ? `${site.name}` : '';
      img.width = 900; img.height = 900;
      img.loading = 'eager';
      img.decoding = 'async';
      img.addEventListener('error', () => figure.remove(), { once: true });
      pic.append(img);
      figure.append(pic);
    }
    const ring = el('span', 'hero__ring');
    ring.setAttribute('aria-hidden', 'true');
    figure.append(ring);

    /* --- skills --------------------------------------------------------- */
    const skills = (site.skills || []).filter((g) => g && (g.items || []).length);
    const skillsEl = el('section', 'hero__skills reveal');
    if (skills.length) {
      const sh = el('h2', 'hero__skills-head');
      sh.textContent = ui('home.skills');
      skillsEl.append(sh);
      const dl = el('dl', 'skillgrid');
      skills.forEach((g) => {
        const dt = el('dt');
        dt.textContent = t(g.group);
        const dd = el('dd');
        const ul = el('ul', 'chiplist');
        (g.items || []).forEach((item) => {
          const li = el('li');
          li.textContent = item;
          ul.append(li);
        });
        dd.append(ul);
        dl.append(dt, dd);
      });
      skillsEl.append(dl);
    }

    const top = el('div', 'hero__top');
    top.append(text, figure);
    root.append(top);
    if (skills.length) root.append(skillsEl);

    /* --- "scroll for more" --------------------------------------------- */
    const cue = el('a', 'scrollcue');
    cue.href = '#cv';
    cue.setAttribute('data-scrollcue', '');
    const cueText = el('span');
    cueText.textContent = ui('home.scroll');
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.setAttribute('class', 'scrollcue__arrow');
    const path = document.createElementNS(arrow.namespaceURI, 'path');
    path.setAttribute('d', 'M12 4v14m0 0l-6-6m6 6l6-6');
    arrow.append(path);
    cue.append(cueText, arrow);
    root.append(cue);
  }
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'icon');
  const p = document.createElementNS(svg.namespaceURI, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.link);
  p.setAttribute('fill', 'currentColor');
  svg.append(p);
  return svg;
}

function el(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}
