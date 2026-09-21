/* =============================================================================
 * contact.js — the contact form
 * =============================================================================
 *
 * Your email address appears NOWHERE in this file, in the HTML, or in any
 * network request the browser makes. The form posts to a relay service which
 * knows the address; the page only knows an access key.
 *
 * The provider and access key come from data/site.json (so they are editable
 * from /backend without touching code), falling back to config.js. Adding a
 * new relay is a matter of adding one entry to PROVIDERS below.
 * ---------------------------------------------------------------------------*/

import { CONFIG } from './config.js';
import { ui, onLangChange } from './i18n.js';

/* --- provider adapters ---------------------------------------------------
 * Each returns { url, body, headers } for a given { name, email, message }. */
const PROVIDERS = {
  web3forms: {
    isConfigured: (key) => !!key && !/^PASTE-/i.test(key),
    build(key, fields, extra) {
      return {
        url: 'https://api.web3forms.com/submit',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: key,
          subject: CONFIG.contact.subject,
          from_name: fields.name,
          name: fields.name,
          email: fields.email,
          message: fields.message,
          botcheck: extra.honeypot || '',
        }),
      };
    },
    // Web3Forms answers 200 with { success: true } — a 200 alone is not enough.
    async ok(response) {
      try {
        const j = await response.json();
        return response.ok && j && j.success === true;
      } catch { return response.ok; }
    },
  },

  formspree: {
    isConfigured: (key) => !!key && !/^PASTE-/i.test(key),
    build(key, fields) {
      return {
        url: `https://formspree.io/f/${encodeURIComponent(key)}`,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: fields.name,
          email: fields.email,
          message: fields.message,
          _subject: CONFIG.contact.subject,
        }),
      };
    },
    async ok(response) { return response.ok; },
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

let unsubLang = null;

/**
 * Wire up a contact <form>. The form must contain inputs named
 * name / email / message, a [data-status] region and a submit button.
 */
export function initContactForm(form, site = null) {
  if (!form || form.dataset.contactBound) return;
  form.dataset.contactBound = '1';

  /* site.json wins so the key can be changed from the admin panel; config.js
     is the fallback for anyone who would rather keep it in code. */
  const providerName = site?.contact?.provider || CONFIG.contact.provider;
  const provider = PROVIDERS[providerName];
  const key = (site?.contact?.accessKey || '').trim() || CONFIG.contact.accessKey;
  const status = form.querySelector('[data-status]');
  const button = form.querySelector('button[type="submit"]');
  const honeypot = form.querySelector('input[name="_gotcha"]');

  const fieldEls = {
    name:    form.elements.namedItem('name'),
    email:   form.elements.namedItem('email'),
    message: form.elements.namedItem('message'),
  };

  /* If the site owner has not pasted their access key yet, say so plainly
   * rather than letting visitors send messages into the void.              */
  const configured = provider && provider.isConfigured(key);
  if (!configured) {
    form.dataset.unconfigured = '1';
    setStatus('warn', ui('contact.unconfigured'));
    if (button) button.disabled = true;
  }

  /* Re-render the status message if the language changes mid-visit. One
     subscription per module — the soft router gives us a new form each visit. */
  unsubLang?.();
  unsubLang = onLangChange(() => {
    if (!configured) setStatus('warn', ui('contact.unconfigured'));
    Object.keys(fieldEls).forEach((k) => {
      const err = form.querySelector(`[data-error-for="${k}"]`);
      if (err && err.textContent) err.textContent = ui(`contact.err.${k}`);
    });
    if (button && !button.disabled) button.textContent = ui('contact.send');
  });

  /* Clear a field's error as soon as the visitor starts fixing it. */
  Object.entries(fieldEls).forEach(([k, el]) => {
    if (!el) return;
    el.addEventListener('input', () => showFieldError(k, null));
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!configured || form.dataset.busy) return;

    const fields = {
      name:    (fieldEls.name?.value    || '').trim(),
      email:   (fieldEls.email?.value   || '').trim(),
      message: (fieldEls.message?.value || '').trim(),
    };

    /* --- validation ----------------------------------------------------- */
    let firstBad = null;
    const bad = {
      name:    fields.name.length === 0,
      email:   !EMAIL_RE.test(fields.email),
      message: fields.message.length === 0,
    };
    for (const k of ['name', 'email', 'message']) {
      showFieldError(k, bad[k] ? ui(`contact.err.${k}`) : null);
      if (bad[k] && !firstBad) firstBad = fieldEls[k];
    }
    if (firstBad) { setStatus('', ''); firstBad.focus(); return; }

    /* --- send ------------------------------------------------------------ */
    form.dataset.busy = '1';
    if (button) { button.disabled = true; button.textContent = ui('contact.sending'); }
    setStatus('busy', ui('contact.sending'));

    try {
      const req = provider.build(key, fields, { honeypot: honeypot?.value });
      const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body });
      if (!(await provider.ok(res))) throw new Error(`relay responded ${res.status}`);

      form.reset();
      setStatus('ok', ui('contact.sent'));
      if (button) button.textContent = ui('contact.send');
    } catch (err) {
      console.error('[contact]', err);
      setStatus('error', ui('contact.error'));
      if (button) button.textContent = ui('contact.send');
    } finally {
      delete form.dataset.busy;
      if (button) button.disabled = false;
    }
  });

  /* --- helpers ---------------------------------------------------------- */
  function setStatus(kind, text) {
    if (!status) return;
    status.textContent = text;
    status.dataset.kind = kind;
    status.hidden = !text;
  }

  function showFieldError(key2, text) {
    const el = form.querySelector(`[data-error-for="${key2}"]`);
    const input = fieldEls[key2];
    if (el) { el.textContent = text || ''; el.hidden = !text; }
    if (input) {
      input.setAttribute('aria-invalid', text ? 'true' : 'false');
      if (text) input.setAttribute('aria-describedby', `err-${key2}`);
    }
  }
}
