/* =============================================================================
 * admin/images.js — picking, shrinking and committing images
 * =============================================================================
 *
 * Photos straight off a phone are 3-6 MB. Committing those to the repo makes
 * the site slow and the repository fat, and git never forgets a large file.
 * So every upload is resized and re-encoded in the browser before it is sent:
 * a 4 MB JPEG typically lands at 120-250 KB with no visible difference at the
 * sizes this site displays.
 * ---------------------------------------------------------------------------*/

import { CONFIG } from '../config.js';
import { toB64 } from '../vault.js';
import { slugify } from './ui.js';

export const LIMITS = {
  MAX_EDGE: 1600,          // longest side, in pixels, after resizing
  QUALITY: 0.82,
  MAX_SOURCE_BYTES: 25 * 1024 * 1024,   // refuse anything sillier than this
  MAX_RESULT_BYTES: 3 * 1024 * 1024,    // GitHub's API is fine well past this,
                                        // but a 3 MB image on a CV site is not
};

/**
 * Read a File, downscale it, and return everything needed to commit it.
 * @returns {Promise<{base64:string, bytes:number, width:number, height:number,
 *                    type:string, ext:string, originalBytes:number}>}
 */
export async function prepareImage(file) {
  if (!file) throw new Error('No file chosen.');
  if (!/^image\//.test(file.type)) throw new Error(`"${file.name}" is not an image.`);
  if (file.size > LIMITS.MAX_SOURCE_BYTES) {
    throw new Error(`"${file.name}" is ${fmtBytes(file.size)} — too large. Please pick something under ${fmtBytes(LIMITS.MAX_SOURCE_BYTES)}.`);
  }

  /* SVG is markup, not pixels: it can carry <script> and external references,
     and committing it unread would publish whatever it contains. There is
     nothing on this site that needs vector images, so it is simply refused
     rather than half-sanitised. */
  if (file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name)) {
    throw new Error('SVG files are not accepted — please use PNG, JPEG or WebP.');
  }

  const bitmap = await decode(file);
  const scale = Math.min(1, LIMITS.MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // PNGs with transparency must not pick up a black background when we
  // re-encode as JPEG, so transparent sources stay PNG/WebP.
  const keepAlpha = /png|webp|gif/.test(file.type);
  if (!keepAlpha) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  const outType = keepAlpha && (await supportsWebP()) ? 'image/webp'
                : keepAlpha ? 'image/png'
                : 'image/jpeg';

  const blob = await new Promise((res) => canvas.toBlob(res, outType, LIMITS.QUALITY));
  if (!blob) throw new Error('The browser could not re-encode that image.');
  if (blob.size > LIMITS.MAX_RESULT_BYTES) {
    throw new Error(`Even after resizing that is ${fmtBytes(blob.size)}. Try a smaller or simpler image.`);
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    base64: toB64(bytes),
    bytes: bytes.length,
    width: w, height: h,
    type: outType,
    ext: outType === 'image/webp' ? 'webp' : outType === 'image/png' ? 'png' : 'jpg',
    originalBytes: file.size,
  };
}

/**
 * Commit a prepared image and return the repo-relative path to store in JSON.
 * Names collide-proof: <slug>-<short hash of the bytes>.<ext>, so re-uploading
 * the same picture reuses the same file instead of piling up copies.
 */
export async function uploadImage(gh, prepared, nameHint) {
  const dir = CONFIG.github.imageDir.replace(/^\/+|\/+$/g, '');
  const stamp = shortHash(prepared.base64);
  const name = `${slugify(nameHint, 'image')}-${stamp}.${prepared.ext}`;
  const path = `${dir}/${name}`;

  // If a file with this exact name exists it is byte-identical, so skip the commit.
  const existing = await gh.getFile(path).catch(() => ({ sha: null }));
  if (existing.sha) return { path, reused: true };

  await gh.putBinary(path, prepared.base64, null, `Add image ${name}`);
  return { path, reused: false };
}

/* -------------------------------------------------------------------------
 * Internals
 * ---------------------------------------------------------------------- */

async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch { /* fall through */ }
  }
  // Safari < 17 and friends
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image file.')); };
    img.src = url;
  });
}

let webpSupport = null;
async function supportsWebP() {
  if (webpSupport !== null) return webpSupport;
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const blob = await new Promise((r) => c.toBlob(r, 'image/webp'));
  webpSupport = !!blob && blob.type === 'image/webp';
  return webpSupport;
}

function shortHash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).padStart(7, '0').slice(0, 7);
}

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
