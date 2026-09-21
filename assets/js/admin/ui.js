/* =============================================================================
 * admin/ui.js — the building blocks every admin form is made of
 * =============================================================================
 *
 * Small, boring helpers. The point is that forms.js reads like a description
 * of the data rather than a pile of document.createElement calls.
 *
 *   field('Company', input(entry.org, v => entry.org = v))
 *   bilingual('Job title', entry.title, onChange)
 *   repeatable(list, { render, onAdd, onRemove, onMove })
 * ---------------------------------------------------------------------------*/

/* -------------------------------------------------------------------------
 * Hyperscript
 * ------------------------------------------------------------------------
 *   el('div.card', { onclick: fn }, 'text', otherNode)
 * The tag may carry classes:  'button.btn.btn--ghost'
 * ---------------------------------------------------------------------- */
export function el(spec, props = null, ...children) {
  const [tag, ...classes] = String(spec).split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');

  if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = [node.className, v].filter(Boolean).join(' ');
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'html') node.innerHTML = v;
      else if (k in node && k !== 'list') node[k] = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
  } else if (props != null) {
    children.unshift(props);
  }

  append(node, children);
  return node;
}

function append(node, kids) {
  for (const c of kids.flat(4)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/* -------------------------------------------------------------------------
 * Inputs
 * ---------------------------------------------------------------------- */

let uid = 0;
const nextId = () => `f${++uid}`;

/** A labelled control. `hint` appears underneath in small grey text. */
export function field(label, control, hint) {
  const id = control.id || (control.id = nextId());
  return el('div.field',
    el('label.field__label', { htmlFor: id }, label),
    control,
    hint ? el('p.field__hint', hint) : null,
  );
}

export function input(value, onChange, props = {}) {
  return el('input.input', {
    type: 'text',
    value: value ?? '',
    oninput: (e) => onChange(e.target.value),
    ...props,
  });
}

export function textarea(value, onChange, props = {}) {
  return el('textarea.textarea', {
    value: value ?? '',
    oninput: (e) => onChange(e.target.value),
    rows: 5,
    ...props,
  });
}

export function select(value, options, onChange) {
  const s = el('select.select', { onchange: (e) => onChange(e.target.value) });
  options.forEach(([val, text]) => {
    s.append(el('option', { value: val, selected: val === value }, text));
  });
  return s;
}

export function checkbox(label, checked, onChange) {
  const box = el('input', {
    type: 'checkbox',
    checked: !!checked,
    onchange: (e) => onChange(e.target.checked),
  });
  const id = box.id = nextId();
  return el('label.checkline', { htmlFor: id }, box, el('span', label));
}

/**
 * A pair of inputs for a { en, no } value. This is how every piece of visible
 * text on the site is edited — leaving one side blank is allowed, the site
 * falls back to the other language.
 */
export function bilingual(label, value, onChange, { multiline = false, rows = 4 } = {}) {
  const v = (value && typeof value === 'object') ? value : { en: value ?? '', no: '' };
  const make = (lang) => {
    const set = (s) => { v[lang] = s; onChange(v); };
    return multiline
      ? textarea(v[lang], set, { rows })
      : input(v[lang], set);
  };
  const en = make('en');
  const no = make('no');
  en.id = nextId(); no.id = nextId();

  return el('div.bifield',
    el('p.field__label', label),
    el('div.bifield__grid',
      el('div.bifield__cell',
        el('label.bifield__tag', { htmlFor: en.id }, 'EN'), en),
      el('div.bifield__cell',
        el('label.bifield__tag', { htmlFor: no.id }, 'NO'), no),
    ),
  );
}

/** A comma-separated tag editor backed by a string array. */
export function tagsInput(label, arr, onChange) {
  return field(
    label,
    input((arr || []).join(', '), (s) => {
      onChange(s.split(',').map((x) => x.trim()).filter(Boolean));
    }),
    'Separate with commas.',
  );
}

/* -------------------------------------------------------------------------
 * Repeatable lists (bullet points, links, gallery images, entries, projects)
 * ------------------------------------------------------------------------
 * Every list gets BOTH drag-to-reorder and up/down buttons. The buttons are
 * not a fallback — they are the accessible, reliable path, and on a trackpad
 * they are frankly easier.
 * ---------------------------------------------------------------------- */
export function repeatable(items, opts) {
  const {
    render,                 // (item, index) -> Node for the row body
    onAdd,                  // () -> void
    onRemove,               // (index) -> void
    onMove,                 // (from, to) -> void
    addLabel = 'Add',
    empty = 'Nothing here yet.',
    rowClass = '',
    confirmRemove = false,
    removeLabel = 'Delete',
    key = 'list',           // stable name for this list, for focus restoration
  } = opts;

  const list = el('div.rlist');

  if (!items.length) {
    list.append(el('p.rlist__empty', empty));
  }

  items.forEach((item, i) => {
    const row = el(`div.rrow${rowClass ? '.' + rowClass : ''}`, { draggable: true, dataset: { index: String(i) } });

    const handle = el('button.rrow__handle', {
      type: 'button',
      title: 'Drag to reorder',
      'aria-label': `Reorder item ${i + 1}`,
      tabIndex: -1,
    }, el('span', { 'aria-hidden': 'true', html: '&#8942;&#8942;' }));

    const controls = el('div.rrow__controls',
      el('button.iconbtn.iconbtn--sm', {
        type: 'button', title: 'Move up', 'aria-label': `Move item ${i + 1} up`,
        disabled: i === 0,
        /* The list re-renders after a move, so this very button is destroyed.
           data-fk lets the editor put focus back on the equivalent button in
           the rebuilt list — otherwise every arrow press dumps a keyboard user
           back at the top of the document. */
        'data-fk': `${key}:${i - 1}:up`,
        onclick: () => { rememberFocus(`${key}:${i - 1}:up`); onMove(i, i - 1); },
      }, '↑'),
      el('button.iconbtn.iconbtn--sm', {
        type: 'button', title: 'Move down', 'aria-label': `Move item ${i + 1} down`,
        disabled: i === items.length - 1,
        'data-fk': `${key}:${i + 1}:down`,
        onclick: () => { rememberFocus(`${key}:${i + 1}:down`); onMove(i, i + 1); },
      }, '↓'),
      el('button.iconbtn.iconbtn--sm.iconbtn--danger', {
        type: 'button', title: removeLabel, 'aria-label': `${removeLabel} item ${i + 1}`,
        onclick: async () => {
          if (confirmRemove && !(await confirmDialog(`${removeLabel}?`, 'This cannot be undone once you publish.'))) return;
          onRemove(i);
        },
      }, '✕'),
    );

    row.append(handle, el('div.rrow__body', render(item, i)), controls);
    list.append(row);
  });

  wireDragReorder(list, onMove);

  return el('div.rblock',
    list,
    el('button.btn.btn--ghost.rblock__add', {
      type: 'button',
      'data-fk': `${key}:add`,
      onclick: () => { rememberFocus(`${key}:add`); onAdd(); },
    }, `+ ${addLabel}`),
  );
}

/* -------------------------------------------------------------------------
 * Keeping your place across a re-render
 * ------------------------------------------------------------------------
 * The editor rebuilds its whole panel whenever the shape of the data changes
 * (add / delete / reorder). Without these two, every such action would close
 * all your open sections and throw focus back to <body>.
 * ---------------------------------------------------------------------- */
let pendingFocus = null;

export function rememberFocus(fk) { pendingFocus = fk; }

export function restoreFocus(root = document) {
  if (!pendingFocus) return;
  const target = root.querySelector(`[data-fk="${CSS.escape(pendingFocus)}"]`);
  pendingFocus = null;
  if (target && !target.disabled) target.focus();
}

/**
 * Which <details> the user has open, keyed by entry or project id.
 *
 * A Map rather than a Set, so "never seen this section" (use the caller's
 * default) is distinguishable from "the user deliberately closed it" (keep it
 * closed). With a Set the two look identical, and a freshly-added entry would
 * spring back open every time the panel rebuilt.
 */
const sectionState = new Map();

export function isOpen(key, fallback = false) {
  return sectionState.has(key) ? sectionState.get(key) : fallback;
}

export function trackOpen(detailsEl, key) {
  sectionState.set(key, detailsEl.open);
  detailsEl.addEventListener('toggle', () => sectionState.set(key, detailsEl.open));
  return detailsEl;
}

function wireDragReorder(list, onMove) {
  let fromIndex = -1;

  list.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.rrow');
    if (!row) return;
    fromIndex = Number(row.dataset.index);
    row.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    // Firefox refuses to start a drag unless some data is set.
    try { e.dataTransfer.setData('text/plain', String(fromIndex)); } catch { /* ignore */ }
  });

  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest?.('.rrow');
    list.querySelectorAll('.is-over').forEach((n) => n.classList.remove('is-over'));
    if (row && Number(row.dataset.index) !== fromIndex) row.classList.add('is-over');
  });

  list.addEventListener('dragleave', (e) => {
    e.target.closest?.('.rrow')?.classList.remove('is-over');
  });

  list.addEventListener('drop', (e) => {
    e.preventDefault();
    const row = e.target.closest?.('.rrow');
    list.querySelectorAll('.is-over, .is-dragging').forEach((n) => n.classList.remove('is-over', 'is-dragging'));
    if (!row || fromIndex < 0) return;
    const to = Number(row.dataset.index);
    if (to !== fromIndex) onMove(fromIndex, to);
    fromIndex = -1;
  });

  list.addEventListener('dragend', () => {
    list.querySelectorAll('.is-over, .is-dragging').forEach((n) => n.classList.remove('is-over', 'is-dragging'));
    fromIndex = -1;
  });
}

/** Move an item inside an array, in place. Returns the array. */
export function moveItem(arr, from, to) {
  if (to < 0 || to >= arr.length || from === to) return arr;
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
  return arr;
}

/* -------------------------------------------------------------------------
 * Panels and headings
 * ---------------------------------------------------------------------- */
export function panel(title, ...children) {
  return el('section.apanel',
    title ? el('h3.apanel__title', title) : null,
    el('div.apanel__body', ...children),
  );
}

export function row(...children) {
  return el('div.arow', ...children);
}

/* -------------------------------------------------------------------------
 * Feedback
 * ---------------------------------------------------------------------- */

let toastHost = null;

/* Created eagerly at module load. A live region that is inserted into the DOM
   already containing its message is not announced — the screen reader has to
   be watching the region before the text arrives. */
function ensureToastHost() {
  if (toastHost && document.body.contains(toastHost)) return toastHost;
  toastHost = el('div.toasts', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' });
  document.body.append(toastHost);
  return toastHost;
}
if (typeof document !== 'undefined' && document.body) ensureToastHost();
else if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', ensureToastHost, { once: true });
}

export function toast(message, kind = 'info', ms = 4200) {
  const host = ensureToastHost();
  const t = el(`div.toast.toast--${kind}`, message);
  host.append(t);
  requestAnimationFrame(() => t.classList.add('is-in'));
  setTimeout(() => {
    t.classList.remove('is-in');
    setTimeout(() => t.remove(), 300);
  }, ms);
  return t;
}

/** A promise-returning confirm dialog, styled like the rest of the site. */
export function confirmDialog(title, body, { confirmText = 'Yes, do it', danger = true } = {}) {
  return new Promise((resolve) => {
    const dlg = el('dialog.adlg');
    const done = (v) => { resolve(v); dlg.close(); dlg.remove(); };
    dlg.append(el('div.adlg__inner',
      el('h3', title),
      body ? el('p', body) : null,
      el('div.adlg__actions',
        el('button.btn.btn--ghost', { type: 'button', onclick: () => done(false) }, 'Cancel'),
        el(`button.btn${danger ? '.btn--danger' : ''}`, { type: 'button', onclick: () => done(true) }, confirmText),
      ),
    ));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('.btn--ghost').focus();
  });
}

/** Tiny helper: a short unique-ish slug from a title. */
export function slugify(s, fallback = 'item') {
  const base = String(s || '')
    .toLowerCase()
    .replace(/[æä]/g, 'ae').replace(/[øö]/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || `${fallback}-${Math.random().toString(36).slice(2, 7)}`;
}
