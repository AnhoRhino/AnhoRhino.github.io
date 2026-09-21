/* =============================================================================
 * admin/forms.js — the Home, CV, Projects and Settings editors
 * =============================================================================
 *
 * Each editor is a function that paints itself into a container and mutates
 * the loaded data in place. Two callbacks come in through `ctx`:
 *
 *   ctx.touch()    something changed — recompute the dirty state
 *   ctx.refresh()  the SHAPE changed (added / removed / reordered) — repaint
 *
 * Text edits only call touch(), so typing never re-creates the input you are
 * typing into and never steals the caret.
 * ---------------------------------------------------------------------------*/

import { asset } from '../base.js';
import {
  el, field, input, textarea, select, checkbox, bilingual, tagsInput,
  repeatable, moveItem, panel, row, toast, confirmDialog, slugify,
  trackOpen, isOpen,
} from './ui.js';
import { prepareImage, uploadImage, fmtBytes } from './images.js';

const KINDS = [['work', 'Work'], ['education', 'Education'], ['other', 'Other']];

/* =============================================================================
 * HOME  (data/site.json)
 * ===========================================================================*/
export function renderSiteEditor(root, site, ctx) {
  root.replaceChildren(
    panel('Who you are',
      field('Name', input(site.name, (v) => { site.name = v; ctx.touch(); })),
      bilingual('Tagline — the small line above your name', site.tagline,
        () => ctx.touch()),
      bilingual('Introduction — the short paragraph on the front page', site.intro,
        () => ctx.touch(), { multiline: true, rows: 6 }),
      field('Location', input(site.location, (v) => { site.location = v; ctx.touch(); }),
        'Optional. Shown nowhere by default — handy to have in the data.'),
    ),

    panel('Photo',
      imagePicker({
        value: site.photo,
        ctx,
        nameHint: 'profile',
        onChange: (path) => { site.photo = path; ctx.refresh(); },
        hint: 'Square works best. It is resized to 1600px and re-compressed automatically.',
      }),
    ),

    panel('Links',
      repeatable(site.links ||= [], {
        key: 'site-links',
        addLabel: 'Add link',
        empty: 'No links yet.',
        onAdd: () => { site.links.push({ label: '', url: '', icon: 'link' }); ctx.refresh(); },
        onRemove: (i) => { site.links.splice(i, 1); ctx.refresh(); },
        onMove: (a, b) => { moveItem(site.links, a, b); ctx.refresh(); },
        render: (link) => row(
          field('Label', input(link.label, (v) => { link.label = v; ctx.touch(); })),
          field('URL', input(link.url, (v) => { link.url = v; ctx.touch(); }, { type: 'url', placeholder: 'https://…' })),
          field('Icon', select(link.icon || 'link',
            [['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['mail', 'Mail'], ['link', 'Generic link']],
            (v) => { link.icon = v; ctx.touch(); })),
        ),
      }),
    ),

    panel('Skills',
      repeatable(site.skills ||= [], {
        key: 'site-skills',
        addLabel: 'Add skill group',
        empty: 'No skill groups yet.',
        onAdd: () => { site.skills.push({ group: { en: '', no: '' }, items: [] }); ctx.refresh(); },
        onRemove: (i) => { site.skills.splice(i, 1); ctx.refresh(); },
        onMove: (a, b) => { moveItem(site.skills, a, b); ctx.refresh(); },
        render: (g) => el('div',
          bilingual('Group name', g.group ||= { en: '', no: '' }, () => ctx.touch()),
          tagsInput('Skills in this group', g.items, (v) => { g.items = v; ctx.touch(); }),
        ),
      }),
    ),

    panel('Contact form',
      field('Web3Forms access key',
        input(site.contact?.accessKey ?? '', (v) => {
          site.contact ||= { provider: 'web3forms', accessKey: '' };
          site.contact.accessKey = v.trim();
          ctx.touch();
        }, { placeholder: 'paste your key here', spellcheck: 'false' }),
        el('span', 'Get a free key at ',
          el('a', { href: 'https://web3forms.com', target: '_blank', rel: 'noopener' }, 'web3forms.com'),
          ' — enter the address you want messages delivered to, and they email you a key. ',
          'Your address is never stored in this site.'),
      ),
      field('Provider',
        select(site.contact?.provider || 'web3forms',
          [['web3forms', 'Web3Forms'], ['formspree', 'Formspree']],
          (v) => {
            site.contact ||= { provider: 'web3forms', accessKey: '' };
            site.contact.provider = v;
            ctx.touch();
          }),
        'For Formspree, paste the form id (the part after /f/) as the key.'),
    ),
  );
}

/* =============================================================================
 * CV  (data/cv.json)
 * ===========================================================================*/
export function renderCVEditor(root, cv, ctx) {
  cv.entries ||= [];

  /* The timeline places entries by DATE, not by their order in the file, so a
     drag handle here would be a lie. We sort the list the same way the site
     does and say so. */
  const order = cv.entries
    .map((e, i) => ({ e, i, key: sortKey(e) }))
    .sort((a, b) => b.key - a.key || a.i - b.i);

  root.replaceChildren(
    el('p.ahint',
      'Entries appear on the timeline in date order — newest at the top — so this list ',
      'is sorted the same way. Two entries that overlap in time are placed on opposite ',
      'sides of the line automatically.'),

    el('div.rblock',
      el('div.rlist',
        order.length ? order.map(({ e, i }) => entryRow(e, i, cv, ctx))
                     : el('p.rlist__empty', 'No CV entries yet.')),
      el('button.btn.btn--ghost.rblock__add', {
        type: 'button',
        onclick: () => {
          const now = new Date();
          cv.entries.unshift({
            id: `entry-${Math.random().toString(36).slice(2, 8)}`,
            kind: 'work',
            org: '',
            title: { en: '', no: '' },
            location: '',
            start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
            end: null,
            bullets: [{ en: '', no: '' }],
            tags: [],
          });
          ctx.refresh();
        },
      }, '+ Add experience'),
    ),
  );
}

function sortKey(e) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(e.end || e.start || ''));
  if (e.end == null || e.end === '') return 9e9;          // ongoing sorts first
  return m ? Number(m[1]) * 12 + Number(m[2]) : 0;
}

function entryRow(e, index, cv, ctx) {
  const ongoing = e.end == null || e.end === '';
  const heading = [e.org || '(no company yet)', e.title?.en || e.title?.no].filter(Boolean).join(' — ');

  const details = el('div.aentry__body',
    row(
      field('Kind', select(e.kind || 'work', KINDS, (v) => { e.kind = v; ctx.touch(); })),
      field('Company / institution', input(e.org, (v) => { e.org = v; ctx.touch(); })),
      field('Location', input(e.location, (v) => { e.location = v; ctx.touch(); })),
    ),

    bilingual('Title / role', e.title ||= { en: '', no: '' }, () => ctx.touch()),

    row(
      field('Start', monthInput(e.start, (v) => { e.start = v; ctx.touch(); }),
        'Month and year. This sets where the brace starts.'),
      field('End', monthInput(e.end, (v) => { e.end = v; ctx.touch(); }, ongoing),
        'Leave blank and tick "still here" for an ongoing role.'),
      el('div.field',
        el('span.field__label', ' '),
        checkbox('Still here', ongoing, (on) => {
          e.end = on ? null : todayMonth();
          ctx.refresh();
        })),
    ),

    el('div.bifield',
      el('p.field__label', 'Bullet points'),
      repeatable(e.bullets ||= [], {
        key: `bullets:${e.id || index}`,
        addLabel: 'Add bullet',
        empty: 'No bullet points.',
        onAdd: () => { e.bullets.push({ en: '', no: '' }); ctx.refresh(); },
        onRemove: (i) => { e.bullets.splice(i, 1); ctx.refresh(); },
        onMove: (a, b) => { moveItem(e.bullets, a, b); ctx.refresh(); },
        render: (b) => bilingual('', b, () => ctx.touch(), { multiline: true, rows: 2 }),
      }),
    ),

    tagsInput('Tags', e.tags, (v) => { e.tags = v; ctx.touch(); }),

    el('div.aentry__foot',
      el('span.aentry__id', `id: ${e.id || '(none)'}`),
      el('button.btn.btn--quiet', {
        type: 'button',
        onclick: () => {
          const copy = structuredClone(e);
          copy.id = `${slugify(copy.org, 'entry')}-${Math.random().toString(36).slice(2, 6)}`;
          cv.entries.splice(index + 1, 0, copy);
          ctx.refresh();
        },
      }, 'Duplicate'),
      el('button.btn.btn--danger', {
        type: 'button',
        onclick: async () => {
          if (!(await confirmDialog(`Delete "${e.org || 'this entry'}"?`,
            'It disappears from the timeline as soon as you publish.'))) return;
          cv.entries.splice(index, 1);
          ctx.refresh();
        },
      }, 'Delete'),
    ),
  );

  const key = `cv:${e.id || index}`;
  return trackOpen(el('details.aentry', { open: isOpen(key, !e.org) },
    el('summary.aentry__summary',
      el('span.aentry__kind', (e.kind || 'work').slice(0, 4)),
      el('span.aentry__title', heading),
      el('span.aentry__dates', `${e.start || '?'} → ${ongoing ? 'now' : (e.end || '?')}`),
    ),
    details,
  ), key);
}

function monthInput(value, onChange, disabled = false) {
  return el('input.input', {
    type: 'month',
    value: value || '',
    disabled,
    oninput: (ev) => onChange(ev.target.value || null),
  });
}

function todayMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* =============================================================================
 * PROJECTS  (data/projects.json)
 * ===========================================================================*/
export function renderProjectsEditor(root, data, ctx) {
  data.projects ||= [];

  root.replaceChildren(
    el('p.ahint',
      'Projects appear on the page in exactly this order. Drag a card by its handle, ',
      'or use the arrows, to change it.'),

    repeatable(data.projects, {
      key: 'projects',
      addLabel: 'Add project',
      empty: 'No projects yet.',
      rowClass: 'rrow--project',
      onAdd: () => {
        data.projects.unshift({
          id: `project-${Math.random().toString(36).slice(2, 8)}`,
          title: { en: '', no: '' },
          summary: { en: '', no: '' },
          description: { en: '', no: '' },
          year: String(new Date().getFullYear()),
          tags: [], cover: '', images: [], links: [],
        });
        ctx.refresh();
      },
      onRemove: (i) => { data.projects.splice(i, 1); ctx.refresh(); },
      onMove: (a, b) => { moveItem(data.projects, a, b); ctx.refresh(); },
      confirmRemove: true,
      removeLabel: 'Delete project',
      render: (p) => projectForm(p, ctx),
    }),
  );
}

function projectForm(p, ctx) {
  const heading = p.title?.en || p.title?.no || '(untitled project)';

  const key = `proj:${p.id}`;
  return trackOpen(el('details.aentry', { open: isOpen(key, !p.title?.en && !p.title?.no) },
    el('summary.aentry__summary',
      p.cover
        ? el('img.aentry__thumb', { src: asset(p.cover), alt: '', loading: 'lazy' })
        : el('span.aentry__thumb.aentry__thumb--empty', { 'aria-hidden': 'true' }),
      el('span.aentry__title', heading),
      el('span.aentry__dates', p.year || ''),
    ),

    el('div.aentry__body',
      bilingual('Title', p.title ||= { en: '', no: '' }, () => ctx.touch()),
      bilingual('One-line summary (shown on the card)', p.summary ||= { en: '', no: '' },
        () => ctx.touch()),
      bilingual('Full description (shown when the card is opened)',
        p.description ||= { en: '', no: '' }, () => ctx.touch(),
        { multiline: true, rows: 8 }),

      row(
        field('Year', input(p.year, (v) => { p.year = v; ctx.touch(); }, { inputMode: 'numeric' })),
        tagsInput('Tags', p.tags, (v) => { p.tags = v; ctx.touch(); }),
      ),

      el('p.field__label', 'Cover image'),
      imagePicker({
        value: p.cover,
        ctx,
        nameHint: p.title?.en || p.id,
        onChange: (path) => { p.cover = path; ctx.refresh(); },
        hint: 'Shown on the card and at the top of the opened project. Leave empty for a generated star pattern.',
      }),

      el('p.field__label', 'Gallery'),
      repeatable(p.images ||= [], {
        key: `gallery:${p.id}`,
        addLabel: 'Add gallery image',
        empty: 'No extra images.',
        onAdd: () => { p.images.push({ src: '', caption: { en: '', no: '' } }); ctx.refresh(); },
        onRemove: (i) => { p.images.splice(i, 1); ctx.refresh(); },
        onMove: (a, b) => { moveItem(p.images, a, b); ctx.refresh(); },
        render: (im) => el('div',
          imagePicker({
            value: im.src,
            ctx,
            nameHint: p.title?.en || p.id,
            onChange: (path) => { im.src = path; ctx.refresh(); },
          }),
          bilingual('Caption', im.caption ||= { en: '', no: '' }, () => ctx.touch()),
        ),
      }),

      el('p.field__label', 'Links'),
      repeatable(p.links ||= [], {
        key: `plinks:${p.id}`,
        addLabel: 'Add link',
        empty: 'No links.',
        onAdd: () => { p.links.push({ label: '', url: '' }); ctx.refresh(); },
        onRemove: (i) => { p.links.splice(i, 1); ctx.refresh(); },
        onMove: (a, b) => { moveItem(p.links, a, b); ctx.refresh(); },
        render: (l) => row(
          field('Label', input(l.label, (v) => { l.label = v; ctx.touch(); })),
          field('URL', input(l.url, (v) => { l.url = v; ctx.touch(); }, { type: 'url', placeholder: 'https://…' })),
        ),
      }),

      el('p.aentry__id', `id: ${p.id}`),
    ),
  ), key);
}

/* =============================================================================
 * Shared: pick / upload / clear an image
 * ===========================================================================*/
function imagePicker({ value, ctx, onChange, nameHint, hint }) {
  const preview = value
    ? el('img.ipick__img', { src: asset(value), alt: '', loading: 'lazy' })
    : el('div.ipick__img.ipick__img--empty', 'no image');

  const status = el('p.field__hint', value ? value : (hint || ''));

  /* Visually hidden but still in the tab order would be a focus stop with no
     visible label; the "Choose image…" button is the real control. */
  const file = el('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif',
    class: 'visually-hidden',
    tabIndex: -1,
    'aria-hidden': 'true',
    onchange: async (ev) => {
      const f = ev.target.files?.[0];
      ev.target.value = '';
      if (!f) return;
      try {
        status.textContent = `Shrinking ${f.name}…`;
        const prepared = await prepareImage(f);
        status.textContent = `Uploading… ${fmtBytes(prepared.originalBytes)} → ${fmtBytes(prepared.bytes)}`;
        const { path, reused } = await uploadImage(ctx.gh, prepared, nameHint);
        toast(reused
          ? 'That image was already in the repository — reused it.'
          : `Uploaded ${path} (${fmtBytes(prepared.bytes)})`, 'ok');
        onChange(path);
      } catch (err) {
        console.error(err);
        status.textContent = '';
        toast(err.message || 'Upload failed.', 'error', 8000);
      }
    },
  });

  return el('div.ipick',
    preview,
    el('div.ipick__side',
      el('div.ipick__actions',
        el('button.btn.btn--ghost', { type: 'button', onclick: () => file.click() },
          value ? 'Replace…' : 'Choose image…'),
        value ? el('button.btn.btn--quiet', {
          type: 'button',
          onclick: () => onChange(''),
        }, 'Remove') : null,
      ),
      status,
      file,
    ),
  );
}
