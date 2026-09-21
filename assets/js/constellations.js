/* =============================================================================
 * constellations.js — the star field behind every page
 * =============================================================================
 *
 * WHAT IT DOES
 *   Draws real constellations on a canvas behind the content. Move the cursor
 *   near a star and it is pushed away; let go and it springs back into place
 *   with one small overshoot, the way a real thing on a spring would.
 *   As you scroll down, the whole field drifts gently DOWNWARD — the opposite
 *   of the content — so the page reads as content rising rather than you
 *   sliding down it.
 *
 * WHY IT DOES NOT EAT YOUR BATTERY
 *   The animation loop stops completely once every star is home and the
 *   pointer is still. It wakes on pointer movement, scroll, resize, a theme
 *   change, or the tab becoming visible again. Idle cost is zero.
 *
 * TUNING
 *   The knobs you are likely to want are in config.js under `constellations`.
 *   The physics constants are in TUNING below, with an explanation of why
 *   those numbers and not others.
 * ---------------------------------------------------------------------------*/

/* -------------------------------------------------------------------------
 * Physics constants
 * ------------------------------------------------------------------------
 * The motion is a damped harmonic oscillator:   x'' + c·x' + k·x = 0
 *
 *   k (SPRING) = 26      natural frequency  ωn = √k ≈ 5.1 rad/s
 *   c (DAMPING) = 5.2    damping ratio      ζ  = c / (2√k) ≈ 0.51
 *
 * ζ ≈ 0.5 is deliberately just under critical (ζ = 1): the star overshoots
 * home once by a few percent and settles, which reads as "springs back" rather
 * than "slides back". Settling takes about 1.5 s.
 *
 * Explicit Euler integration is stable while dt < 2/ωn ≈ 0.39 s. We clamp dt
 * to 1/30 s, so even a hard frame-rate drop — or the tab being backgrounded
 * for a minute and then refocused, which would otherwise hand us a dt of 60 —
 * cannot make it explode.
 * ---------------------------------------------------------------------------*/
const TUNING = {
  SPRING: 26,
  DAMPING: 5.2,
  MAX_DT: 1 / 30,
  PUSH: 2400,           // peak repulsion acceleration, px/s², scaled by config
  SLEEP_SPEED: 1.2,     // px/s   — below this on every star, and…
  SLEEP_OFFSET: 0.35,   // px     — …below this displacement, we stop the loop
  POINTER_IDLE_MS: 140, // pointer counts as "still" after this long
  POINTER_HOLD_MS: 900, // a parked cursor keeps pushing for this long, then lets go
  PARALLAX_MAX: 150,    // px the nearest layer travels over the whole page
};

/* -------------------------------------------------------------------------
 * The constellations themselves
 * ------------------------------------------------------------------------
 * GENERATED — do not hand-edit the numbers. They come from real star
 * positions (RA / declination / apparent magnitude), stereographically
 * projected about each constellation's own centroid so nothing is distorted,
 * then normalised into a 0..1 box with y increasing downward.
 *
 * TO ADD OR CHANGE ONE: edit the catalogue in tools/gen_constellations.py and
 * run it — it prints the replacement for this array. Doing it by hand is how
 * you end up with a Plough that looks like a saucepan someone sat on.
 *
 * `m` is apparent magnitude, written the way astronomers write it: LOWER is
 * brighter (Sirius is -1.46). It drives both the dot size and the opacity.
 * ---------------------------------------------------------------------------*/
const CONSTELLATIONS = [
  {
    name: 'Ursa Major',
    stars: [[0.0,0.581,1.79],[0.028,0.373,2.37],[0.335,0.351,2.44],[0.392,0.517,3.31],
            [0.592,0.583,1.76],[0.748,0.649,2.23],[1.0,0.581,1.85]],
    lines: [[0,1],[1,2],[2,3],[3,0],[3,4],[4,5],[5,6]],
  },
  {
    name: 'Orion',
    stars: [[0.243,0.129,0.5],[0.624,0.183,1.64],[0.497,0.0,3.39],[0.536,0.522,2.23],
            [0.482,0.568,1.69],[0.425,0.605,1.77],[0.337,1.0,2.09],[0.757,0.925,0.13]],
    lines: [[2,0],[2,1],[0,5],[1,3],[3,4],[4,5],[5,6],[3,7]],
  },
  {
    name: 'Cassiopeia',
    stars: [[0.0,0.66,2.27],[0.188,0.34,2.23],[0.455,0.571,2.15],[0.701,0.455,2.68],
            [1.0,0.66,3.35]],
    lines: [[0,1],[1,2],[2,3],[3,4]],
  },
  {
    name: 'Cygnus',
    stars: [[0.526,0.0,1.25],[0.487,0.272,2.23],[0.526,1.0,3.05],[0.138,0.329,2.48],
            [0.862,0.293,2.87]],
    lines: [[0,1],[1,2],[1,3],[1,4]],
  },
  {
    name: 'Lyra',
    stars: [[0.821,0.123,0.03],[0.611,0.0,4.59],[0.602,0.297,4.34],[0.346,0.398,4.22],
            [0.179,1.0,3.24],[0.449,0.907,3.52]],
    lines: [[0,1],[0,2],[2,5],[5,4],[4,3],[3,2]],
  },
  {
    name: 'Scorpius',
    stars: [[0.947,0.0,2.62],[0.987,0.128,2.29],[0.984,0.281,2.89],[0.769,0.239,2.9],
            [0.687,0.27,1.06],[0.622,0.345,2.82],[0.486,0.603,2.29],[0.471,0.764,3.0],
            [0.449,0.95,3.62],[0.312,0.992,3.33],[0.113,1.0,1.86],[0.013,0.888,3.03],
            [0.049,0.835,2.39],[0.114,0.743,1.62],[0.139,0.749,2.69]],
    lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],
            [11,12],[12,13],[13,14]],
  },
  {
    name: 'Draco',
    stars: [[0.075,0.934,2.24],[0.207,0.935,2.79],[0.132,0.771,3.75],
            [0.212,0.843,4.88],[0.0,0.343,3.07],[0.345,0.525,3.17],[0.503,0.656,2.73],
            [0.745,0.687,3.29],[0.937,0.395,3.65],[1.0,0.065,3.87]],
    lines: [[0,1],[1,3],[3,2],[2,0],[2,4],[4,5],[5,6],[6,7],[7,8],[8,9]],
  },
  {
    name: 'Perseus',
    stars: [[0.535,0.263,1.79],[0.662,0.629,2.12],[0.655,0.107,2.93],
            [0.406,0.346,3.01],[0.27,0.659,2.89],[0.271,1.0,2.85],[0.691,0.715,3.32],
            [0.73,0.0,3.76]],
    lines: [[7,2],[2,0],[0,3],[3,4],[4,5],[0,1],[1,6]],
  },
  {
    name: 'Taurus',
    stars: [[0.625,0.689,0.87],[0.14,0.146,1.65],[0.0,0.463,3.0],[0.794,0.725,3.65],
            [0.759,0.643,3.77],[0.699,0.573,3.53],[0.701,0.716,3.4],[1.0,0.854,3.47]],
    lines: [[1,5],[5,4],[4,3],[3,7],[3,6],[6,0],[0,2]],
  },
  {
    name: 'Gemini',
    stars: [[0.149,0.106,1.58],[0.026,0.277,1.14],[0.738,0.834,1.93],
            [0.274,0.575,3.53],[0.659,0.431,3.06],[0.446,0.644,3.79],
            [0.974,0.537,3.28],[0.887,0.542,2.87],[0.378,0.194,4.41],[0.657,1.0,3.36],
            [0.956,0.0,3.6],[0.12,0.338,4.06],[0.287,0.828,3.58]],
    lines: [[10,0],[0,8],[8,4],[4,7],[7,6],[0,1],[1,11],[11,3],[3,5],[5,2],[3,12],
            [12,9]],
  },
  {
    name: 'Ursa Minor',
    stars: [[0.443,0.0,1.98],[0.374,0.201,4.36],[0.346,0.448,4.23],[0.46,0.688,4.29],
            [0.352,0.789,4.95],[0.654,0.858,2.08],[0.56,1.0,3.0]],
    lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]],
  },
  {
    name: 'Corona Borealis',
    stars: [[0.832,0.138,4.14],[1.0,0.441,3.68],[0.8,0.773,2.22],[0.554,0.832,3.84],
            [0.344,0.862,4.63],[0.102,0.747,4.15],[0.0,0.337,4.99]],
    lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]],
  },
  {
    name: 'Cepheus',
    stars: [[0.758,0.756,2.45],[0.639,0.379,3.23],[0.242,0.0,3.21],[0.275,0.59,3.52],
            [0.463,1.0,3.35]],
    lines: [[0,1],[1,2],[2,3],[3,4],[4,0]],
  },
  {
    name: 'Canis Major',
    stars: [[0.614,0.073,-1.46],[0.979,0.168,1.98],[0.305,0.0,4.11],[0.25,0.738,1.83],
            [0.402,0.911,1.5],[0.021,0.949,2.45],[0.972,1.0,3.02]],
    lines: [[1,0],[0,2],[0,3],[3,4],[4,6],[3,5]],
  },
  {
    name: 'Leo',
    stars: [[0.109,0.239,1.4],[0.13,0.411,3.52],[0.254,0.502,2.08],[0.248,0.633,3.44],
            [0.072,0.761,3.88],[0.0,0.694,2.98],[0.71,0.473,2.56],[0.696,0.29,3.33],
            [1.0,0.239,2.14]],
    lines: [[5,4],[4,3],[3,2],[2,1],[1,0],[0,7],[7,8],[8,6],[6,2]],
  },
];

/* -------------------------------------------------------------------------
 * Layers: how far away each band of constellations is.
 * Nearer layers are bigger, brighter and move more with the scroll.
 * ---------------------------------------------------------------------- */
const LAYERS = [
  { scale: 0.62, alpha: 0.42, parallax: 0.30, push: 0.55 },  // far
  { scale: 0.86, alpha: 0.70, parallax: 0.62, push: 0.80 },  // mid
  { scale: 1.12, alpha: 1.00, parallax: 1.00, push: 1.00 },  // near
];

/* =============================================================================
 * The engine
 * ===========================================================================*/

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts  CONFIG.constellations
 * @returns {{refreshColors():void, destroy():void, wake():void}}
 */
export function initConstellations(canvas, opts = {}) {
  const cfg = {
    density: 1,
    opacity: 1,
    pointerRadius: 170,
    pointerForce: 1,
    parallax: true,
    ...opts,
  };

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('2d canvas context unavailable');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let dpr = 1, W = 0, H = 0;
  let stars = [];        // flat list of every star, constellation and dust alike
  let links = [];        // [indexA, indexB, layerIndex] into `stars`
  let colors = readColors();

  let pointer = { x: -9999, y: -9999, active: false, lastMove: -1e9 };
  let scrollProgress = 0;
  let running = false, rafId = 0, lastT = 0;
  let destroyed = false;

  /* A fixed seed means the layout is identical on every load and every
     resize — the sky does not reshuffle itself when you rotate your phone. */
  const SEED = 0x5EED5747;

  /* NOTE: start-up happens at the BOTTOM of this function, not here. The
     event handlers below are `const` arrow functions, and a `const` is not
     usable before the line that defines it — calling attach() up here would
     throw. */

  /* ---------------------------------------------------------------------
   * Build: size the canvas, then place and populate the field
   * ------------------------------------------------------------------ */
  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);   // 2 is plenty; 3 is waste
    W = canvas.clientWidth  || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width  = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    place();
  }

  function place() {
    const rnd = mulberry32(SEED);
    stars = [];
    links = [];

    /* How many constellations fit comfortably? Roughly one per 210 000 px²
       of viewport, clamped so a phone gets a few and a 4K monitor is not
       wallpapered with them. */
    const area = W * H;
    const want = clamp(Math.round((area / 210000) * cfg.density), 3, CONSTELLATIONS.length);

    /* Lay a grid over a field slightly larger than the viewport so shapes run
       off the edges instead of all sitting politely inside it. */
    const padX = W * 0.10, padY = H * 0.12;
    const fieldW = W + padX * 2, fieldH = H + padY * 2;
    const cols = Math.max(1, Math.round(Math.sqrt(want * (fieldW / fieldH))));
    const rows = Math.max(1, Math.ceil(want / cols));

    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
    shuffle(cells, rnd);

    /* Pick `want` constellations, spread across the catalogue rather than
       always the first N, so the sky differs by screen size. */
    const picked = [];
    const stride = Math.max(1, Math.floor(CONSTELLATIONS.length / want));
    for (let i = 0, k = Math.floor(rnd() * CONSTELLATIONS.length); picked.length < want; i++) {
      picked.push(CONSTELLATIONS[(k + i * stride) % CONSTELLATIONS.length]);
      if (i > CONSTELLATIONS.length * 2) break;
    }

    const cellW = fieldW / cols, cellH = fieldH / rows;
    const baseSize = Math.min(cellW, cellH) * 1.18;

    picked.forEach((con, i) => {
      const [cx, cy] = cells[i % cells.length];
      const layerIdx = i % LAYERS.length;
      const layer = LAYERS[layerIdx];

      const size = baseSize * layer.scale * (0.86 + rnd() * 0.28);
      /* Constellation boxes are not square; keep the aspect and centre it. */
      const ox = -padX + cx * cellW + (cellW - size) * (0.15 + rnd() * 0.7);
      const oy = -padY + cy * cellH + (cellH - size) * (0.15 + rnd() * 0.7);
      const flip = rnd() < 0.5 ? 1 : -1;      // mirror some for variety
      const rot = (rnd() - 0.5) * 0.34;       // ±10° so they are not all upright
      const cos = Math.cos(rot), sin = Math.sin(rot);

      const first = stars.length;
      con.stars.forEach(([sx, sy, mag]) => {
        // normalise around the centre so rotation pivots sensibly
        const nx = (sx - 0.5) * flip, ny = sy - 0.5;
        const rx = nx * cos - ny * sin, ry = nx * sin + ny * cos;
        const hx = ox + (rx + 0.5) * size;
        const hy = oy + (ry + 0.5) * size;
        // magnitude -1.5 (Sirius) .. 5 (faint) -> brightness 1 .. 0.28
        const b = clamp(1 - (mag + 1.5) / 7.2, 0.28, 1);
        stars.push({
          hx, hy, x: hx, y: hy, vx: 0, vy: 0,
          r: (0.9 + b * 2.1) * layer.scale,
          b: b * layer.alpha,
          layer: layerIdx,
          dust: false,
        });
      });
      con.lines.forEach(([a, b]) => links.push([first + a, first + b, layerIdx]));
    });

    /* A scatter of faint field stars so the gaps are not empty. */
    const dustCount = Math.round(clamp(area / 16000, 24, 150) * cfg.density);
    for (let i = 0; i < dustCount; i++) {
      const hx = -padX + rnd() * fieldW;
      const hy = -padY + rnd() * fieldH;
      const layerIdx = i % LAYERS.length;
      const b = 0.14 + rnd() * 0.3;
      stars.push({
        hx, hy, x: hx, y: hy, vx: 0, vy: 0,
        r: 0.5 + rnd() * 0.9,
        b: b * LAYERS[layerIdx].alpha,
        layer: layerIdx,
        dust: true,
      });
    }
  }

  /* ---------------------------------------------------------------------
   * Colours — read straight from the CSS custom properties so the canvas
   * always matches the active theme.
   * ------------------------------------------------------------------ */
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const pick = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
    return {
      star: pick('--star', 'rgba(203,219,240,0.62)'),
      dim: pick('--star-dim', 'rgba(180,199,225,0.30)'),
      line: pick('--star-line', 'rgba(150,178,215,0.17)'),
      glow: pick('--star-glow', 'rgba(143,184,232,0.16)'),
    };
  }

  /* ---------------------------------------------------------------------
   * Events
   * ------------------------------------------------------------------ */
  const onPointerMove = (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    pointer.lastMove = now();
    wake();
  };
  const onPointerLeave = () => { pointer.active = false; wake(); };

  const onScroll = () => {
    // With reduced motion there is no parallax, so scrolling changes nothing
    // on the canvas and there is nothing to redraw.
    if (reduced) return;
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const next = clamp(window.scrollY / max, 0, 1);
    if (Math.abs(next - scrollProgress) > 0.0004) { scrollProgress = next; wake(); }
  };

  const onResize = debounce(() => { if (!destroyed) { build(); wake(); } }, 140);

  const onVisibility = () => {
    if (document.hidden) stop();
    else { lastT = now(); wake(); }
  };

  function attach() {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('blur', onPointerLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    onScroll();
  }

  /* ---------------------------------------------------------------------
   * The loop. Starts on demand, stops as soon as the sky is still again.
   * ------------------------------------------------------------------ */
  function wake() {
    if (destroyed) return;
    /* A hidden tab gets one synchronous frame and no loop. requestAnimationFrame
       does not fire while hidden anyway, and painting once means the canvas is
       already correct the instant the tab is shown — no blank flash. */
    if (document.hidden) { draw(); return; }
    if (reduced) { draw(); return; }        // static render, no physics
    if (running) return;
    running = true;
    lastT = now();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function tick(t) {
    if (!running || destroyed) return;
    // Clamped at BOTH ends: a backgrounded tab hands back a huge delta, and a
    // clock adjustment can hand back a negative one, which would run the
    // integrator backwards and pump energy into the springs.
    const dt = Math.max(0, Math.min((t - lastT) / 1000, TUNING.MAX_DT));
    lastT = t;

    const settled = step(dt);
    draw();

    /* Sleep only when nothing is moving AND the pointer has been still for a
       moment — otherwise a slow drag across the page would keep re-waking us. */
    const pointerStill = !pointer.active || (now() - pointer.lastMove) > TUNING.POINTER_IDLE_MS;
    if (settled && pointerStill) { stop(); return; }

    rafId = requestAnimationFrame(tick);
  }

  /** Advances the physics. Returns true when every star is home and still. */
  function step(dt) {
    const k = TUNING.SPRING;
    const damp = Math.exp(-TUNING.DAMPING * dt);
    const R = cfg.pointerRadius;
    const R2 = R * R;
    const pushBase = TUNING.PUSH * cfg.pointerForce;

    const px = pointer.x;
    /* The pointer arrives in SCREEN coordinates, but stars are simulated in
       field coordinates and only offset by the parallax at draw time. Without
       converting here, scrolling would make the stars flee from a point some
       distance above the actual cursor. Layer 2 is the reference layer
       (parallax 1.0); the small per-layer discrepancy is imperceptible next to
       getting the gross offset right. */
    const shiftNow = cfg.parallax ? scrollProgress * TUNING.PARALLAX_MAX : 0;
    const py = pointer.y - shiftNow;
    const pointerOn = pointer.active && (now() - pointer.lastMove) < TUNING.POINTER_HOLD_MS;

    let quiet = true;

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const offX = s.hx - s.x, offY = s.hy - s.y;

      /* Cheap early out: a star that is home, still, and nowhere near the
         pointer needs no integration at all. This is what keeps the cost
         proportional to the disturbed region rather than the whole sky. */
      if (!pointerOn || outsideRadius(s, px, py, R)) {
        if (Math.abs(offX) < TUNING.SLEEP_OFFSET && Math.abs(offY) < TUNING.SLEEP_OFFSET &&
            Math.abs(s.vx) < TUNING.SLEEP_SPEED && Math.abs(s.vy) < TUNING.SLEEP_SPEED) {
          s.x = s.hx; s.y = s.hy; s.vx = 0; s.vy = 0;
          continue;
        }
      }

      let ax = offX * k;
      let ay = offY * k;

      if (pointerOn) {
        const dx = s.x - px, dy = s.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 0.0001;
          /* Squared linear falloff: full strength at the cursor, exactly zero
             at the radius, and smooth at the boundary so stars do not jolt as
             the cursor sweeps past. */
          const f = 1 - d / R;
          const mag = pushBase * f * f * LAYERS[s.layer].push;
          ax += (dx / d) * mag;
          ay += (dy / d) * mag;
        }
      }

      s.vx = (s.vx + ax * dt) * damp;
      s.vy = (s.vy + ay * dt) * damp;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      if (Math.abs(s.x - s.hx) > TUNING.SLEEP_OFFSET ||
          Math.abs(s.y - s.hy) > TUNING.SLEEP_OFFSET ||
          Math.abs(s.vx) > TUNING.SLEEP_SPEED ||
          Math.abs(s.vy) > TUNING.SLEEP_SPEED) {
        quiet = false;
      }
    }
    return quiet;
  }

  function outsideRadius(s, px, py, R) {
    return Math.abs(s.x - px) > R || Math.abs(s.y - py) > R;
  }

  /* ---------------------------------------------------------------------
   * Draw
   * ------------------------------------------------------------------ */
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const globalA = clamp(cfg.opacity, 0, 1);
    if (globalA <= 0) return;

    /* Parallax: as scrollProgress goes 0 -> 1 the field slides DOWN, so the
       content appears to rise past it. Each layer moves by a different amount,
       which is what gives the sky depth. */
    const shift = (cfg.parallax && !reduced) ? scrollProgress * TUNING.PARALLAX_MAX : 0;

    /* Constellations should sit in the quiet margins rather than fighting the
       text column, so we fade them where the content actually is. */
    const colHalf = Math.min(W * 0.5, 620) * 0.5;
    const centre = W / 2;

    ctx.lineCap = 'round';

    /* --- lines first, so stars sit on top of them --- */
    ctx.strokeStyle = colors.line;
    for (let li = 0; li < links.length; li++) {
      const [ia, ib, layerIdx] = links[li];
      const a = stars[ia], b = stars[ib];
      const dy = shift * LAYERS[layerIdx].parallax;
      const ay = a.y + dy, by = b.y + dy;
      if ((ay < -40 && by < -40) || (ay > H + 40 && by > H + 40)) continue;

      const fade = LAYERS[layerIdx].alpha *
                   columnFade((a.x + b.x) / 2, centre, colHalf) * globalA;
      if (fade < 0.012) continue;

      ctx.globalAlpha = fade;
      ctx.lineWidth = 0.55 + LAYERS[layerIdx].scale * 0.35;
      ctx.beginPath();
      ctx.moveTo(a.x, ay);
      ctx.lineTo(b.x, by);
      ctx.stroke();
    }

    /* --- stars --- */
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const y = s.y + shift * LAYERS[s.layer].parallax;
      if (y < -20 || y > H + 20 || s.x < -20 || s.x > W + 20) continue;

      const fade = s.b * columnFade(s.x, centre, colHalf) * globalA;
      if (fade < 0.012) continue;

      /* A soft halo on the brighter stars only — a radial gradient per star
         would be far too expensive, so we fake it with one extra faint disc. */
      if (!s.dust && s.r > 2.1) {
        ctx.globalAlpha = fade * 0.30;
        ctx.fillStyle = colors.glow;
        ctx.beginPath();
        ctx.arc(s.x, y, s.r * 3.1, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = fade;
      ctx.fillStyle = s.dust ? colors.dim : colors.star;
      ctx.beginPath();
      ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  /** 1 at the edges of the viewport, ~0.45 behind the central text column. */
  function columnFade(x, centre, halfWidth) {
    const d = Math.abs(x - centre);
    if (d >= halfWidth * 2) return 1;
    const tt = clamp(d / (halfWidth * 2), 0, 1);
    return 0.45 + 0.55 * tt * tt;
  }

  /* ---------------------------------------------------------------------
   * Start. Everything above is definitions; this is the only place with
   * side effects, and it runs once all of them exist.
   * ------------------------------------------------------------------ */
  build();
  attach();
  wake();

  /* ---------------------------------------------------------------------
   * Public handle
   * ------------------------------------------------------------------ */
  return {
    /** Call after the theme changes so the canvas picks up the new colours. */
    refreshColors() {
      colors = readColors();
      if (reduced) draw(); else wake();
    },
    wake,
    /** Force one frame right now. Used by the test page in tools/. */
    redraw: draw,
    destroy() {
      destroyed = true;
      stop();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      ctx.clearRect(0, 0, W, H);
    },
  };
}

/* -------------------------------------------------------------------------
 * Small helpers
 * ---------------------------------------------------------------------- */
function now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function debounce(fn, ms) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

/** Small, fast, seedable PRNG — deterministic layout across loads. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
