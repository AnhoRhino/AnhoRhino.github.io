/* =============================================================================
 * i18n.js — the Norwegian / English switch
 * =============================================================================
 *
 * Two kinds of text on this site:
 *
 *  1. YOUR CONTENT  — lives in data/*.json as  { "en": "...", "no": "..." }
 *                     and is read with  t(obj)
 *  2. UI CHROME     — button labels, headings, form errors. Lives in the
 *                     STRINGS table below and is read with  ui('key')
 *
 * To add a new UI string: add one line to STRINGS with both languages, then
 * use  ui('your.key')  wherever you need it. To translate the whole site into
 * a third language you would add a third key to every entry and to LANGS.
 * ---------------------------------------------------------------------------*/

import { CONFIG } from './config.js';

export const LANGS = ['en', 'no'];
const STORAGE_KEY = 'ah.lang';

/* --- the UI dictionary --------------------------------------------------- */
const STRINGS = {
  'nav.skip':            { en: 'Skip to content',            no: 'Hopp til innhold' },
  'nav.menu':            { en: 'Menu',                       no: 'Meny' },
  'nav.theme':           { en: 'Toggle light / dark theme',  no: 'Bytt lyst / mørkt tema' },
  'nav.lang':            { en: 'Switch language',            no: 'Bytt språk' },

  'home.scroll':         { en: 'Scroll for more',            no: 'Bla for mer' },
  'home.skills':         { en: 'Skills',                     no: 'Ferdigheter' },
  'home.present':        { en: 'Present',                    no: 'Nå' },

  'cv.title':            { en: 'Curriculum Vitae',           no: 'CV' },
  'cv.lead':             { en: 'Where I have been, most recent first.',
                           no: 'Hvor jeg har vært, nyeste først.' },
  'cv.work':             { en: 'Work',                       no: 'Arbeid' },
  'cv.education':        { en: 'Education',                  no: 'Utdanning' },
  'cv.other':            { en: 'Other',                      no: 'Annet' },
  'cv.print':            { en: 'Print CV',                   no: 'Skriv ut CV' },
  'cv.empty':            { en: 'No CV entries yet.',         no: 'Ingen CV-oppføringer ennå.' },
  'cv.months':           { en: 'mo',                         no: 'mnd' },
  'cv.years':            { en: 'yr',                         no: 'år' },

  'projects.title':      { en: 'Projects',                   no: 'Prosjekter' },
  'projects.lead':       { en: 'Things I have built. Click one to read more.',
                           no: 'Ting jeg har bygget. Klikk på ett for å lese mer.' },
  'projects.empty':      { en: 'No projects yet — check back soon.',
                           no: 'Ingen prosjekter ennå — kom tilbake snart.' },
  'projects.close':      { en: 'Close',                      no: 'Lukk' },
  'projects.open':       { en: 'Open project',               no: 'Åpne prosjekt' },
  'projects.gallery':    { en: 'Gallery',                    no: 'Galleri' },
  'projects.links':      { en: 'Links',                      no: 'Lenker' },
  'projects.prev':       { en: 'Previous project',           no: 'Forrige prosjekt' },
  'projects.next':       { en: 'Next project',               no: 'Neste prosjekt' },

  'contact.title':       { en: 'Contact',                    no: 'Kontakt' },
  'contact.lead':        { en: 'Send me a message and it lands straight in my inbox.',
                           no: 'Send meg en melding, så havner den rett i innboksen min.' },
  'contact.name':        { en: 'Name',                       no: 'Navn' },
  'contact.email':       { en: 'Email',                      no: 'E-post' },
  'contact.message':     { en: 'Message',                    no: 'Melding' },
  'contact.send':        { en: 'Send message',               no: 'Send melding' },
  'contact.sending':     { en: 'Sending…',                   no: 'Sender…' },
  'contact.sent':        { en: 'Thank you — your message is on its way.',
                           no: 'Takk — meldingen din er på vei.' },
  'contact.error':       { en: 'Something went wrong. Please try again, or reach me on LinkedIn.',
                           no: 'Noe gikk galt. Prøv igjen, eller ta kontakt via LinkedIn.' },
  'contact.unconfigured':{ en: 'The contact form is not connected yet. Please use the links below.',
                           no: 'Kontaktskjemaet er ikke koblet til ennå. Bruk lenkene nedenfor.' },
  'contact.err.name':    { en: 'Please enter your name.',    no: 'Vennligst skriv inn navnet ditt.' },
  'contact.err.email':   { en: 'Please enter a valid email address.',
                           no: 'Vennligst skriv inn en gyldig e-postadresse.' },
  'contact.err.message': { en: 'Please write a message.',    no: 'Vennligst skriv en melding.' },
  'contact.elsewhere':   { en: 'Or find me elsewhere',       no: 'Eller finn meg andre steder' },

  'err.load':            { en: 'Could not load content.',    no: 'Kunne ikke laste innhold.' },
  'err.retry':           { en: 'Retry',                      no: 'Prøv igjen' },

  'month.1':  { en: 'Jan', no: 'jan' },  'month.2':  { en: 'Feb', no: 'feb' },
  'month.3':  { en: 'Mar', no: 'mar' },  'month.4':  { en: 'Apr', no: 'apr' },
  'month.5':  { en: 'May', no: 'mai' },  'month.6':  { en: 'Jun', no: 'jun' },
  'month.7':  { en: 'Jul', no: 'jul' },  'month.8':  { en: 'Aug', no: 'aug' },
  'month.9':  { en: 'Sep', no: 'sep' },  'month.10': { en: 'Oct', no: 'okt' },
  'month.11': { en: 'Nov', no: 'nov' },  'month.12': { en: 'Dec', no: 'des' },
};

/* --- state --------------------------------------------------------------- */
let current = readInitialLang();
const listeners = new Set();

function readInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGS.includes(saved)) return saved;
  } catch { /* private mode — fall through */ }
  // Respect the browser's preference if it is Norwegian (nb/nn/no).
  const nav = (navigator.languages || [navigator.language || '']).join(',').toLowerCase();
  if (/\b(no|nb|nn)\b/.test(nav)) return 'no';
  return CONFIG.defaults.lang;
}

/* --- public API ---------------------------------------------------------- */

export function getLang() {
  return current;
}

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === current) return;
  current = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  applyLangToDocument();
  listeners.forEach((fn) => { try { fn(lang); } catch (e) { console.error(e); } });
}

export function toggleLang() {
  setLang(current === 'en' ? 'no' : 'en');
}

/** Register a callback fired whenever the language changes. Returns an unsubscribe fn. */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Read a bilingual content value.
 *   t({en:'Hello', no:'Hei'})  ->  'Hello'
 *   t('Plain string')          ->  'Plain string'   (pass-through)
 * Falls back to the other language if one side is empty, so a half-translated
 * entry still shows something rather than a blank.
 */
export function t(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);
  const primary = value[current];
  if (primary != null && String(primary).trim() !== '') return String(primary);
  for (const l of LANGS) {
    const alt = value[l];
    if (alt != null && String(alt).trim() !== '') return String(alt);
  }
  return '';
}

/** Read a UI chrome string by key. Unknown keys return the key itself (visible bug). */
export function ui(key) {
  const entry = STRINGS[key];
  if (!entry) return key;
  return entry[current] ?? entry.en ?? key;
}

/** Sets <html lang> and the label on the language toggle. */
export function applyLangToDocument() {
  document.documentElement.setAttribute('lang', current === 'no' ? 'no' : 'en');
  document.querySelectorAll('[data-lang-toggle]').forEach((el) => {
    el.setAttribute('aria-label', ui('nav.lang'));
    const out = el.querySelector('[data-lang-current]');
    if (out) out.textContent = current.toUpperCase();
  });
  // Any element with data-i18n="some.key" gets its text set automatically.
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = ui(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', ui(el.getAttribute('data-i18n-aria')));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', ui(el.getAttribute('data-i18n-placeholder')));
  });
}

/**
 * Format a "YYYY-MM" string as e.g. "Sep 2023". `null` means "present".
 */
export function formatMonth(ym) {
  if (!ym) return ui('home.present');
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(ym).trim());
  if (!m) return String(ym);
  return `${ui('month.' + Number(m[2]))} ${m[1]}`;
}

/** Human duration: "1 yr 4 mo". */
export function formatDuration(months) {
  const y = Math.floor(months / 12);
  const mo = months % 12;
  const parts = [];
  if (y) parts.push(`${y} ${ui('cv.years')}`);
  if (mo || !y) parts.push(`${mo} ${ui('cv.months')}`);
  return parts.join(' ');
}
