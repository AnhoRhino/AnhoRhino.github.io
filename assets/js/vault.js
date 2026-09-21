/* =============================================================================
 * vault.js — keeps your GitHub token encrypted behind a password
 * =============================================================================
 *
 * WHAT THIS IS FOR
 *   GitHub Pages is static hosting: there is no server to log in to. So the
 *   admin panel talks to GitHub directly using a Personal Access Token. That
 *   token has to live somewhere, and the only place available is this
 *   browser's localStorage — which is plain text and readable by anything
 *   that can run script on this origin.
 *
 *   So we never store it in the clear. The token is encrypted with a key
 *   derived from a password you choose, and only ever decrypted in memory
 *   for as long as the admin page is open.
 *
 * HOW
 *   password --PBKDF2-SHA256, 310 000 rounds, random 16-byte salt--> AES-256 key
 *   token    --AES-GCM, random 12-byte IV--------------------------> ciphertext
 *
 *   AES-GCM is authenticated: a wrong password fails the integrity tag and
 *   decryption throws. There is no way to "half" decrypt, and no oracle that
 *   tells an attacker they are getting closer.
 *
 * WHAT THIS PROTECTS AGAINST, HONESTLY
 *   ✓ Someone who gets a copy of your localStorage (a backup, a synced
 *     profile, a shared machine) cannot read the token without the password.
 *   ✓ The token never appears in the page source or in any file in the repo.
 *   ✗ It does NOT protect against someone using your unlocked browser while
 *     the admin page is open.
 *   ✗ It does NOT make /backend private — that page is public, it is just not
 *     linked from anywhere. Anyone who guesses the URL sees a password box.
 *
 *   The real backstop is the token itself: make it a FINE-GRAINED token,
 *   scoped to this one repository, with only "Contents: Read and write", and
 *   give it an expiry date. Then the worst case is someone editing this one
 *   website, and you can revoke it from GitHub in ten seconds.
 * ---------------------------------------------------------------------------*/

const STORAGE_KEY = 'ah.vault';
const VERSION = 1;
const ITERATIONS = 310000;   // OWASP's 2023 floor for PBKDF2-HMAC-SHA256
const SALT_BYTES = 16;
const IV_BYTES = 12;         // 96 bits, the size AES-GCM is specified for

/* -------------------------------------------------------------------------
 * Public API
 * ---------------------------------------------------------------------- */

/** Has a token ever been stored in this browser? */
export function hasVault() {
  return readRaw() !== null;
}

/** First-time setup: encrypt `token` under `password` and save it. */
export async function createVault(password, token) {
  assertStrongEnough(password);
  if (!token || typeof token !== 'string' || token.trim().length < 20) {
    throw new VaultError('That does not look like a GitHub token.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(token.trim()),
  );
  writeRaw({
    v: VERSION,
    iter: ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ct)),
  });
}

/**
 * Decrypt and return the token. Throws VaultError on a wrong password.
 * Deliberately slow — the PBKDF2 work factor is the whole point.
 */
export async function unlockVault(password) {
  const raw = readRaw();
  if (!raw) throw new VaultError('No token is stored in this browser yet.');
  if (raw.v !== VERSION) throw new VaultError('Stored token is in an older format. Re-run setup.');

  const key = await deriveKey(password, fromB64(raw.salt), raw.iter || ITERATIONS);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(raw.iv) },
      key,
      fromB64(raw.ct),
    );
    return new TextDecoder().decode(plain);
  } catch {
    // AES-GCM's authentication tag failed. Either the password is wrong or the
    // stored blob was tampered with; we cannot tell which, and neither can an
    // attacker, which is the point.
    throw new VaultError('Wrong password.');
  }
}

/** Re-encrypt the same token under a new password. */
export async function changePassword(oldPassword, newPassword) {
  const token = await unlockVault(oldPassword);
  assertStrongEnough(newPassword);
  await createVault(newPassword, token);
}

/** Forget the token entirely. The site itself is unaffected. */
export function destroyVault() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export class VaultError extends Error {
  constructor(message) { super(message); this.name = 'VaultError'; }
}

/** True when the browser can do what this module needs. */
export function isSupported() {
  return typeof crypto !== 'undefined'
      && typeof crypto.subtle !== 'undefined'
      && typeof TextEncoder !== 'undefined';
}

/* -------------------------------------------------------------------------
 * Internals
 * ---------------------------------------------------------------------- */

async function deriveKey(password, salt, iterations = ITERATIONS) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function assertStrongEnough(password) {
  if (typeof password !== 'string' || password.length < 10) {
    throw new VaultError('Use a password of at least 10 characters.');
  }
}

function readRaw() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const o = JSON.parse(s);
    return (o && o.salt && o.iv && o.ct) ? o : null;
  } catch { return null; }
}

function writeRaw(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

/* Chunked so a large input cannot blow the argument limit of apply/spread. */
export function toB64(bytes) {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

export function fromB64(b64) {
  const bin = atob(String(b64).replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
