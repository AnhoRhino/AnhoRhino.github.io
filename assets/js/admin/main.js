/* =============================================================================
 * admin/main.js — the /backend application
 * =============================================================================
 *
 * Three screens, in order:
 *
 *   SETUP   no token stored in this browser yet. Paste a GitHub token and
 *           choose a password to lock it with.
 *   LOGIN   a token is stored. Type the password to decrypt it.
 *   EDITOR  Home / CV / Projects / Settings, with a Publish button.
 *
 * Data flow: everything is read STRAIGHT FROM GITHUB, not from the live site,
 * so you are always editing the true current state even if GitHub Pages has
 * not finished rebuilding. Publishing writes each changed file back with the
 * sha it was read at, so a conflicting edit fails loudly instead of silently
 * overwriting.
 * ---------------------------------------------------------------------------*/

import { CONFIG } from '../config.js';
import { BASE } from '../base.js';
import { initThemeToggles } from '../theme.js';
import { hasVault, createVault, unlockVault, changePassword, destroyVault, isSupported, VaultError } from '../vault.js';
import { createClient, tokenSetupURL } from '../github.js';
import { el, panel, field, input, toast, confirmDialog, restoreFocus } from './ui.js';
import { renderSiteEditor, renderCVEditor, renderProjectsEditor } from './forms.js';

const FILES = [
  { key: 'site',     label: 'Home',     path: `${CONFIG.github.dataDir}/site.json` },
  { key: 'cv',       label: 'CV',       path: `${CONFIG.github.dataDir}/cv.json` },
  { key: 'projects', label: 'Projects', path: `${CONFIG.github.dataDir}/projects.json` },
];

const IDLE_LOCK_MS = 30 * 60 * 1000;   // auto-lock after half an hour untouched

const session = {
  token: null,
  gh: null,
  files: {},          // key -> { data, sha, original, path }
  tab: 'site',
  idleTimer: 0,
};

const app = document.getElementById('admin');

boot();

function boot() {
  initThemeToggles();
  if (!isSupported()) {
    app.replaceChildren(fatal('This browser is missing the Web Crypto API, so the token cannot be stored safely. Use a current Firefox, Chrome or Safari.'));
    return;
  }
  if (!window.isSecureContext) {
    app.replaceChildren(fatal('The admin panel needs a secure context (https:// or localhost). Web Crypto is unavailable over plain http.'));
    return;
  }
  showAuth();
}

/* =============================================================================
 * Screen 1 & 2 — setup and login
 * ===========================================================================*/
function showAuth() {
  hasVault() ? showLogin() : showSetup();
}

function showSetup() {
  const token = el('input.input', {
    type: 'password', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'github_pat_…',
  });
  const pw1 = el('input.input', { type: 'password', autocomplete: 'new-password', placeholder: 'at least 10 characters' });
  const pw2 = el('input.input', { type: 'password', autocomplete: 'new-password' });
  const err = el('p.field__error', { hidden: true });
  const go = el('button.btn', { type: 'submit' }, 'Encrypt and sign in');

  const form = el('form.acard', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.hidden = true;
      if (pw1.value !== pw2.value) return fail('The two passwords do not match.');
      go.disabled = true; go.textContent = 'Checking the token…';
      try {
        const gh = createClient(token.value.trim());
        const info = await gh.verify();
        if (!info.canWrite) {
          return fail(`That token can read ${info.repo} but not write to it. Give it "Contents: Read and write".`);
        }
        await createVault(pw1.value, token.value.trim());
        toast(`Connected to ${info.repo}`, 'ok');
        await openEditor(token.value.trim());
      } catch (ex) {
        fail(ex.message || String(ex));
      } finally {
        go.disabled = false; go.textContent = 'Encrypt and sign in';
      }
    },
  },
    el('h1.acard__title', 'Set up the editor'),
    el('p.acard__lead',
      'This browser does not have a GitHub token yet. Create one, paste it below, ',
      'and pick a password — the token is then stored encrypted and you only ever ',
      'type the password again.'),

    el('ol.asteps',
      el('li',
        el('a.btn.btn--ghost', { href: tokenSetupURL(), target: '_blank', rel: 'noopener' },
          'Open GitHub token settings ↗'),
        el('p', 'Choose ', el('strong', 'Fine-grained token'), '.')),
      el('li', el('p', 'Repository access → ', el('strong', 'Only select repositories'), ' → ',
        el('code', `${CONFIG.github.owner}/${CONFIG.github.repo}`))),
      el('li', el('p', 'Permissions → Repository permissions → ', el('strong', 'Contents'),
        ' → ', el('strong', 'Read and write'), '. Nothing else is needed.')),
      el('li', el('p', 'Set an expiry you are comfortable with, generate it, and copy the token.')),
    ),

    field('GitHub token', token, 'Stored encrypted in this browser only. Never committed anywhere.'),
    field('New password', pw1),
    field('Repeat password', pw2),
    err,
    el('div.acard__actions', go),
  );

  app.replaceChildren(form);
  token.focus();

  function fail(msg) { err.textContent = msg; err.hidden = false; go.disabled = false; go.textContent = 'Encrypt and sign in'; }
}

function showLogin() {
  const pw = el('input.input', { type: 'password', autocomplete: 'current-password', autofocus: true });
  const err = el('p.field__error', { hidden: true });
  const go = el('button.btn', { type: 'submit' }, 'Unlock');

  const form = el('form.acard.acard--narrow', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.hidden = true;
      go.disabled = true; go.textContent = 'Unlocking…';
      try {
        const token = await unlockVault(pw.value);
        await openEditor(token);
      } catch (ex) {
        err.textContent = ex instanceof VaultError ? ex.message : (ex.message || String(ex));
        err.hidden = false;
      } finally {
        go.disabled = false; go.textContent = 'Unlock';
        pw.select();
      }
    },
  },
    el('h1.acard__title', 'Editor'),
    el('p.acard__lead', 'Enter your password to unlock the GitHub token stored in this browser.'),
    field('Password', pw),
    err,
    el('div.acard__actions',
      go,
      el('button.btn.btn--quiet', {
        type: 'button',
        onclick: async () => {
          if (await confirmDialog('Forget the stored token?',
            'You will need to paste a new GitHub token next time. The website itself is not affected.')) {
            destroyVault();
            showSetup();
          }
        },
      }, 'Forgotten it? Start over'),
    ),
  );

  app.replaceChildren(form);
  pw.focus();
}

/* =============================================================================
 * Screen 3 — the editor
 * ===========================================================================*/
async function openEditor(token) {
  session.token = token;
  session.gh = createClient(token);

  app.replaceChildren(el('div.aloading', el('span.spinner'), 'Loading content from GitHub…'));

  try {
    const loaded = await Promise.all(FILES.map(async (f) => {
      const { json, sha } = await session.gh.getJSON(f.path);
      return [f.key, { data: json ?? emptyFor(f.key), sha, path: f.path, original: stringify(json ?? emptyFor(f.key)) }];
    }));
    session.files = Object.fromEntries(loaded);
  } catch (err) {
    app.replaceChildren(fatal(err.message || String(err),
      el('button.btn', { type: 'button', onclick: () => openEditor(token) }, 'Try again'),
      el('button.btn.btn--quiet', { type: 'button', onclick: lock }, 'Lock')));
    return;
  }

  paintEditor();
  armIdleLock();
  window.addEventListener('beforeunload', guardUnload);
}

function emptyFor(key) {
  if (key === 'cv') return { entries: [] };
  if (key === 'projects') return { projects: [] };
  return { name: '', tagline: { en: '', no: '' }, intro: { en: '', no: '' }, links: [], skills: [] };
}

function paintEditor() {
  const tabs = el('nav.atabs', { 'aria-label': 'Editor sections' });
  const body = el('div.abody');

  const TABS = [
    ...FILES.map((f) => ({ key: f.key, label: f.label })),
    { key: 'settings', label: 'Settings' },
  ];

  TABS.forEach((t) => {
    tabs.append(el('button.atab', {
      type: 'button',
      dataset: { tab: t.key },
      'aria-current': session.tab === t.key ? 'true' : null,
      class: session.tab === t.key ? 'is-active' : '',
      onclick: () => { session.tab = t.key; paintEditor(); },
    }, t.label, dirtyDot(t.key)));
  });

  const publish = el('button.btn', {
    type: 'button',
    id: 'publishBtn',
    onclick: doPublish,
  }, 'Publish');

  const bar = el('div.abar',
    el('div.abar__left',
      el('span.abar__repo', `${session.gh.owner}/${session.gh.repo}`),
      el('span.abar__branch', session.gh.branch)),
    el('div.abar__right',
      el('span.abar__dirty', { id: 'dirtyLabel' }, dirtySummary()),
      el('a.btn.btn--quiet', { href: BASE, target: '_blank', rel: 'noopener' }, 'View site ↗'),
      publish),
  );

  app.replaceChildren(el('div.ashell', bar, tabs, body));

  const ctx = {
    gh: session.gh,
    touch: () => { markDirty(); },
    refresh: () => { paintEditor(); },
  };

  switch (session.tab) {
    case 'site':     renderSiteEditor(body, session.files.site.data, ctx); break;
    case 'cv':       renderCVEditor(body, session.files.cv.data, ctx); break;
    case 'projects': renderProjectsEditor(body, session.files.projects.data, ctx); break;
    case 'settings': renderSettings(body); break;
  }

  markDirty();
  // Put the keyboard back where it was before the rebuild.
  restoreFocus(app);
}

function dirtyDot(key) {
  if (!session.files[key]) return null;
  return isDirty(key) ? el('span.atab__dot', { title: 'Unpublished changes' }) : null;
}

/* -------------------------------------------------------------------------
 * Dirty tracking
 * ---------------------------------------------------------------------- */
function stringify(obj) { return JSON.stringify(obj, null, 2) + '\n'; }

function isDirty(key) {
  const f = session.files[key];
  return !!f && stringify(f.data) !== f.original;
}

function dirtyKeys() { return Object.keys(session.files).filter(isDirty); }

function dirtySummary() {
  const n = dirtyKeys().length;
  if (!n) return 'No unpublished changes';
  return `${n} file${n > 1 ? 's' : ''} changed`;
}

function markDirty() {
  const label = document.getElementById('dirtyLabel');
  const btn = document.getElementById('publishBtn');
  const n = dirtyKeys().length;
  if (label) { label.textContent = dirtySummary(); label.classList.toggle('is-dirty', n > 0); }
  if (btn) { btn.disabled = n === 0; btn.textContent = n ? `Publish ${n} file${n > 1 ? 's' : ''}` : 'Publish'; }
  document.querySelectorAll('.atab').forEach((tab) => {
    const key = tab.dataset.tab;
    const has = session.files[key] && isDirty(key);
    let dot = tab.querySelector('.atab__dot');
    if (has && !dot) tab.append(el('span.atab__dot', { title: 'Unpublished changes' }));
    if (!has && dot) dot.remove();
  });
  bumpIdle();
}

/* -------------------------------------------------------------------------
 * Publish
 * ---------------------------------------------------------------------- */
async function doPublish() {
  const keys = dirtyKeys();
  if (!keys.length) return;

  const problems = keys.flatMap((k) => validate(k, session.files[k].data));
  if (problems.length) {
    await confirmDialog('Fix these first',
      problems.slice(0, 6).join('\n'), { confirmText: 'OK', danger: false });
    return;
  }

  const btn = document.getElementById('publishBtn');
  btn.disabled = true;
  const original = btn.textContent;

  let done = 0;
  for (const key of keys) {
    const f = session.files[key];
    btn.textContent = `Publishing ${key}…`;
    try {
      const text = stringify(f.data);
      const res = await session.gh.putText(f.path, text, f.sha, `Update ${f.path} from the site editor`);
      f.sha = res.sha;
      f.original = text;
      done++;
    } catch (err) {
      console.error(err);
      btn.disabled = false; btn.textContent = original;
      await confirmDialog('Publish failed', err.message || String(err),
        { confirmText: 'OK', danger: false });
      markDirty();
      return;
    }
  }

  btn.textContent = original;
  markDirty();
  toast(`Published ${done} file${done > 1 ? 's' : ''}. GitHub Pages usually updates within a minute.`, 'ok', 7000);
}

/** Cheap schema checks so a typo cannot break the live site. */
function validate(key, data) {
  const out = [];
  if (key === 'cv') {
    (data.entries || []).forEach((e, i) => {
      const where = `CV entry ${i + 1}${e.org ? ` (${e.org})` : ''}`;
      if (!e.org?.trim()) out.push(`• ${where}: company is empty.`);
      if (!/^\d{4}-\d{2}$/.test(e.start || '')) out.push(`• ${where}: start date is missing or malformed.`);
      if (e.end && !/^\d{4}-\d{2}$/.test(e.end)) out.push(`• ${where}: end date is malformed.`);
      if (e.end && e.start && e.end < e.start) out.push(`• ${where}: ends before it starts.`);
    });
    const ids = (data.entries || []).map((e) => e.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) out.push('• Two CV entries share the same id.');
  }
  if (key === 'projects') {
    (data.projects || []).forEach((p, i) => {
      const name = p.title?.en || p.title?.no || `project ${i + 1}`;
      if (!p.id?.trim()) out.push(`• ${name}: missing id.`);
      if (!p.title?.en?.trim() && !p.title?.no?.trim()) out.push(`• Project ${i + 1}: needs a title in at least one language.`);
      (p.links || []).forEach((l) => {
        if (l.url && !/^https?:\/\//i.test(l.url)) out.push(`• ${name}: link "${l.label || l.url}" should start with http:// or https://`);
      });
    });
    const ids = (data.projects || []).map((p) => p.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) out.push('• Two projects share the same id.');
  }
  if (key === 'site') {
    if (!data.name?.trim()) out.push('• Home: your name is empty.');
    (data.links || []).forEach((l, i) => {
      if (l?.url && !/^https?:\/\//i.test(l.url)) {
        out.push(`• Home link ${i + 1} ("${l.label || l.url}") should start with http:// or https://`);
      }
    });
  }
  return out;
}

/* -------------------------------------------------------------------------
 * Settings
 * ---------------------------------------------------------------------- */
function renderSettings(body) {
  const status = el('p.field__hint', 'Checking…');
  session.gh.verify().then((info) => {
    status.replaceChildren(
      `Connected to ${info.repo} on branch ${info.branch}. `,
      info.canWrite ? 'Write access confirmed.' : 'WARNING: this token cannot write.',
      info.login ? ` Signed in as ${info.login}.` : '',
    );
  }).catch((e) => { status.textContent = e.message; });

  const oldPw = el('input.input', { type: 'password', autocomplete: 'current-password' });
  const newPw = el('input.input', { type: 'password', autocomplete: 'new-password' });
  const pwErr = el('p.field__error', { hidden: true });

  body.replaceChildren(
    panel('GitHub connection', status),

    panel('Change password',
      field('Current password', oldPw),
      field('New password', newPw, 'At least 10 characters.'),
      pwErr,
      el('button.btn.btn--ghost', {
        type: 'button',
        onclick: async () => {
          pwErr.hidden = true;
          try {
            await changePassword(oldPw.value, newPw.value);
            oldPw.value = newPw.value = '';
            toast('Password changed.', 'ok');
          } catch (e) { pwErr.textContent = e.message; pwErr.hidden = false; }
        },
      }, 'Change password'),
    ),

    panel('Backup',
      el('p.field__hint',
        'Downloads the three JSON files exactly as they would be published. Useful ',
        'before a big edit — you can always paste one back into GitHub by hand.'),
      el('div.arow',
        ...FILES.map((f) => el('button.btn.btn--ghost', {
          type: 'button',
          onclick: () => download(`${f.key}.json`, stringify(session.files[f.key].data)),
        }, `Download ${f.key}.json`)),
      ),
    ),

    panel('Session',
      el('div.arow',
        el('button.btn.btn--ghost', { type: 'button', onclick: lock }, 'Lock now'),
        el('button.btn.btn--ghost', {
          type: 'button',
          onclick: async () => {
            if (dirtyKeys().length && !(await confirmDialog('Discard unpublished changes?',
              'They have not been committed to GitHub.'))) return;
            location.reload();
          },
        }, 'Reload from GitHub'),
        el('button.btn.btn--danger', {
          type: 'button',
          onclick: async () => {
            if (!(await confirmDialog('Forget the stored token?',
              'The encrypted token is deleted from this browser. You will need a new one to edit again. Your website is untouched.'))) return;
            destroyVault();
            location.reload();
          },
        }, 'Forget token on this device'),
      ),
    ),

    panel('How this works',
      el('p.field__hint',
        'The three JSON files under data/ are the entire content of the site. This ',
        'panel edits them and commits them straight to GitHub with your token; ',
        'GitHub Pages rebuilds and the change is live, usually within a minute. ',
        'Nothing is stored on any other server.'),
      el('p.field__hint',
        'This page is public — it is simply not linked from the site. The password ',
        'protects the token stored in this browser, not the page. Keep the token ',
        'fine-grained and scoped to this one repository so a leak cannot do more ',
        'than edit this website, and give it an expiry date.'),
    ),
  );
}

function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* -------------------------------------------------------------------------
 * Locking
 * ---------------------------------------------------------------------- */
function lock() {
  session.token = null;
  session.gh = null;
  session.files = {};
  window.removeEventListener('beforeunload', guardUnload);
  disarmIdleLock();
  clearTimeout(session.idleTimer);
  showAuth();
}

function guardUnload(e) {
  if (!dirtyKeys().length) return;
  e.preventDefault();
  e.returnValue = '';
}

const IDLE_EVENTS = ['pointerdown', 'keydown', 'input'];

function armIdleLock() {
  disarmIdleLock();     // never stack a second set
  IDLE_EVENTS.forEach((ev) => document.addEventListener(ev, bumpIdle, { passive: true }));
  bumpIdle();
}

function disarmIdleLock() {
  IDLE_EVENTS.forEach((ev) => document.removeEventListener(ev, bumpIdle));
}

function bumpIdle() {
  clearTimeout(session.idleTimer);
  if (!session.token) return;
  session.idleTimer = setTimeout(() => {
    /* Locking would throw away unpublished edits, which is worse than staying
       unlocked — so we defer. But deferring silently means a machine left
       alone stays unlocked indefinitely with a decrypted token in memory and
       nothing on screen saying so. Say it out loud instead, every time the
       timer comes round, and keep saying it. */
    if (dirtyKeys().length) {
      toast('Still unlocked — you have unpublished changes. Publish or reload to lock.', 'warn', 9000);
      bumpIdle();
      return;
    }
    toast('Locked after 30 minutes idle.', 'info');
    lock();
  }, IDLE_LOCK_MS);
}

/* -------------------------------------------------------------------------
 * Misc
 * ---------------------------------------------------------------------- */
function fatal(message, ...actions) {
  return el('div.acard.acard--narrow',
    el('h1.acard__title', 'Cannot continue'),
    el('p.acard__lead', message),
    actions.length ? el('div.acard__actions', ...actions) : null,
  );
}
