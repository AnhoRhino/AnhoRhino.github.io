/* =============================================================================
 * theme.js — dark / light switching
 * =============================================================================
 *
 * The actual colours live in assets/css/tokens.css. This file only decides
 * WHICH set is active by setting  <html data-theme="dark|light"> .
 *
 * The very first paint is handled by a tiny inline script in each page's
 * <head> (see any index.html) so the page never flashes the wrong theme.
 * This module takes over afterwards.
 * ---------------------------------------------------------------------------*/

import { CONFIG } from './config.js';

const STORAGE_KEY = 'ah.theme';
const listeners = new Set();

function readInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* private mode */ }
  // No explicit choice yet -> the house default from config.js, which is dark.
  // We deliberately do NOT follow the operating system here: the site is
  // designed dark-first and that is what a first-time visitor should see.
  // Anyone who prefers light only has to press the toggle once; the choice is
  // then remembered.
  return CONFIG.defaults.theme;
}

let current = document.documentElement.getAttribute('data-theme') || readInitialTheme();

export function getTheme() { return current; }

export function setTheme(theme) {
  if (theme !== 'dark' && theme !== 'light') return;
  current = theme;
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  applyThemeToDocument();
  listeners.forEach((fn) => { try { fn(theme); } catch (e) { console.error(e); } });
}

export function toggleTheme() { setTheme(current === 'dark' ? 'light' : 'dark'); }

/** Register a callback fired whenever the theme changes. Returns an unsubscribe fn. */
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyThemeToDocument() {
  const root = document.documentElement;
  root.setAttribute('data-theme', current);
  // Tells the browser to draw native form controls and scrollbars to match.
  root.style.colorScheme = current;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content',
      getComputedStyle(root).getPropertyValue('--bg-0').trim() || (current === 'dark' ? '#16191f' : '#ffffff'));
  }
  document.querySelectorAll('[data-theme-toggle]').forEach((el) => {
    el.setAttribute('aria-pressed', String(current === 'light'));
  });
}

/** Wires up every [data-theme-toggle] button on the page. Safe to call repeatedly. */
export function initThemeToggles(root = document) {
  root.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    if (btn.dataset.themeBound) return;
    btn.dataset.themeBound = '1';
    btn.addEventListener('click', toggleTheme);
  });
  applyThemeToDocument();
}
