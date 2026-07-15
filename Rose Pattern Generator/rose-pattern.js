/**
 * rose-pattern.js — headless runtime for the Rose Pattern Generator.
 *
 * Zero dependencies, no UI, no globals. Renders an inline SVG with a transparent
 * background into any container element and exposes a scrub-friendly timeline.
 *
 * The whole animation is a PURE FUNCTION of progress t in [0,1] — `seek(t)` is
 * stateless and idempotent, so it maps directly onto scroll position, plays
 * backwards, and can be called at any rate without drift. That is what makes this
 * suitable for scrollytelling.
 *
 *   import { createRosePattern } from './rose-pattern.js';
 *   const rose = createRosePattern(el, { design: {...}, animation: {...} });
 *   rose.seek(0.5);   // scrub
 *   rose.play();      // timed playback
 *   rose.destroy();
 *
 * Design/animation config objects are exactly what the generator's "Copy design"
 * and "Copy animation" buttons emit.
 */

const NS = 'http://www.w3.org/2000/svg';
const BASE = 833;   // viewBox user units — NOT pixels. On-screen size is pure CSS.

export const DESIGN_DEFAULTS = {
  dots: 144, radius: 270, size: 2.5, rot: 0, twist: 0,
  scatter: 0, var: 70, fall: 55, sym: 4, mirror: true, seed: 1,
  shape: 'circle'   // 'circle' | 'square' — squares stay axis-aligned, never rotate
};

export const ANIM_DEFAULTS = {
  ease: 'expo-out', bezier: [0.16, 1, 0.3, 1], dur: 2200,
  iRadius: 30, iTwist: 40, iRot: -50, iOpacity: 0, iDots: 0
};

export const EASINGS = {
  'linear': [0, 0, 1, 1],
  'ease': [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  'expo-out': [0.16, 1, 0.3, 1],
  'expo-in-out': [0.87, 0, 0.13, 1],
  'back-out': [0.34, 1.56, 0.64, 1],
  'spring': [0.17, 0.89, 0.32, 1.28]
};

/* ---------- math ---------- */
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bisection rather than Newton: overshoot curves have near-zero-slope regions where
// Newton stalls. 24 halvings is exact enough at any frame rate.
export function cubicBezier(x1, y1, x2, y2) {
  const curve = (t, a, b) => {
    const A = 1 - 3 * b + 3 * a, B = 3 * b - 6 * a, C = 3 * a;
    return ((A * t + B) * t + C) * t;
  };
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) {
      const cx = curve(t, x1, x2);
      if (Math.abs(cx - x) < 1e-5) break;
      if (cx < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return curve(t, y1, y2);
  };
}

export function parseBezier(str) {
  const n = String(str).split(',').map(s => parseFloat(s.trim()));
  if (n.length !== 4 || n.some(v => !Number.isFinite(v))) return null;
  return [clamp(n[0], 0, 1), n[1], clamp(n[2], 0, 1), n[3]];   // x must stay in 0–1; y need not
}

/* ---------- geometry ----------
   The skeleton (ring count, dot counts, offsets, jitter) stays FIXED while animating.
   Radius, rotation and twist are pure transforms of it, so they interpolate cleanly.  */
function buildSkeleton(p) {
  const rng = mulberry32(p.seed);
  const sym = p.sym;

  let ringCount = Math.round(Math.sqrt(p.dots * 0.9));
  ringCount = Math.max(2, Math.min(40, ringCount, Math.floor(p.dots / sym)));

  const falloff = p.fall / 100;
  const variation = p.var / 100;

  const rings = [];
  for (let n = 1; n <= ringCount; n++) {
    // Isotropic capacity: the count at which arc spacing equals ring spacing. Rings are
    // thinned from this packing limit, never crammed past it — that ceiling is what keeps
    // a dense core from fusing into a solid disc.
    const ideal = 2 * Math.PI * n;
    rings.push({
      n,
      w: Math.max(0.05, ideal * Math.pow(n, -2 * falloff) * Math.pow(3, (rng() * 2 - 1) * variation)),
      cap: Math.max(sym, Math.floor(ideal * 1.35)),
      offset: rng(),
      jitterSeed: (rng() * 1e9) | 0
    });
  }

  const counts = fitCounts(rings, sym, p.dots);
  return { rings, counts, sym, ringCount, total: counts.reduce((a, b) => a + b, 0) };
}

function fitCounts(rings, sym, target) {
  const snap = (scale) => rings.map(rg => {
    const ceil = Math.max(sym, Math.floor(rg.cap / sym) * sym);
    return Math.min(ceil, Math.max(sym, Math.round((rg.w * scale) / sym) * sym));
  });
  const sum = (cs) => cs.reduce((a, b) => a + b, 0);

  let lo = 0.0001, hi = 1000, best = snap(lo);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const cs = snap(mid);
    const s = sum(cs);
    if (Math.abs(s - target) < Math.abs(sum(best) - target)) best = cs;
    if (s === target) return cs;
    if (s < target) lo = mid; else hi = mid;
  }
  return best;
}

/* Writes positions into `out` (preallocated) to avoid per-frame allocation.
   Each dot carries its symmetry-orbit index so reveals stay symmetric. */
function layoutDots(sk, o, out) {
  const { rings, counts, sym } = sk;
  const spacing = o.radius / rings.length;
  const scatter = o.scatter / 100;
  const globalRot = (o.rot * Math.PI) / 180;
  const twist = (o.twist * Math.PI) / 180;

  let i = 0, orbitBase = 0;
  for (let ri = 0; ri < rings.length; ri++) {
    const ring = rings[ri];
    const count = counts[ri];
    const step = (Math.PI * 2) / count;
    const ringR = ring.n * spacing;
    const ringRot = ring.offset * step + globalRot + twist * ring.n;

    const wedge = Math.max(1, Math.round(count / sym));
    const m = o.mirror ? wedge : count;
    const jrng = mulberry32(ring.jitterSeed);
    const jr = [], ja = [];
    for (let k = 0; k < m; k++) { jr.push(jrng() - 0.5); ja.push(jrng() - 0.5); }

    for (let j = 0; j < count; j++) {
      const k = j % m;
      const a = ringRot + j * step + ja[k] * step * scatter * 1.6;
      const r = Math.max(0, ringR + jr[k] * spacing * scatter * 1.6);
      const slot = out[i] || (out[i] = { x: 0, y: 0, orbit: 0 });
      slot.x = Math.cos(a) * r;
      slot.y = Math.sin(a) * r;
      slot.orbit = orbitBase + (j % wedge);
      i++;
    }
    orbitBase += wedge;
  }
  out.length = i;
  return out;
}

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================================================
   Factory — one instance per container, no shared state.
   ============================================================ */
export function createRosePattern(container, opts = {}) {
  if (!container) throw new Error('createRosePattern: container element required');

  let design = { ...DESIGN_DEFAULTS, ...(opts.design || {}) };
  let anim = { ...ANIM_DEFAULTS, ...(opts.animation || {}) };
  if (typeof anim.bezier === 'string') anim.bezier = parseBezier(anim.bezier) || [...ANIM_DEFAULTS.bezier];
  if (!Array.isArray(anim.bezier)) anim.bezier = [...(EASINGS[anim.ease] || ANIM_DEFAULTS.bezier)];

  const color = opts.color || 'currentColor';
  const fit = opts.fit || 'xMidYMid meet';

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('preserveAspectRatio', fit);
  svg.setAttribute('aria-hidden', 'true');           // decorative; hidden from AT
  // No overflow override: the SVG spec default (hidden) is what makes `slice` crop to the
  // element instead of spilling over neighbours. To let the form bleed past the host,
  // enlarge the container (negative insets) rather than changing overflow.
  svg.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none';
  if (opts.pointerEvents) svg.style.pointerEvents = opts.pointerEvents;
  container.appendChild(svg);

  let sk = null, canvasSize = BASE, circles = [], buf = [], lastOp = [], rafId = null, ease = null;
  let builtShape = null, lastT = opts.start ?? 1;

  const easeFn = () => cubicBezier(...anim.bezier);

  // Overshoot curves (back-out, spring) exceed 1, driving radius PAST its final value
  // mid-flight. Sizing for [0,1] alone lets those frames clip, so sample the real range.
  function easeRange() {
    const f = easeFn();
    let mn = 0, mx = 1;
    for (let i = 0; i <= 64; i++) { const y = f(i / 64); if (y < mn) mn = y; if (y > mx) mx = y; }
    return [mn, mx];
  }

  function build() {
    sk = buildSkeleton(design);
    ease = easeFn();

    const probe = layoutDots(sk, design, []);
    const maxDist = probe.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.y)), 0);
    const [e0, e1] = easeRange();
    const rMax = Math.max(
      design.radius, anim.iRadius,
      lerp(anim.iRadius, design.radius, e0),
      lerp(anim.iRadius, design.radius, e1)
    );
    const reach = maxDist * (rMax / Math.max(1, design.radius)) + design.size;
    canvasSize = Math.max(BASE, Math.ceil((reach + 8) * 2));
    svg.setAttribute('viewBox', `0 0 ${canvasSize} ${canvasSize}`);

    // Switching shape means a different element type, so start the pool over.
    const shape = design.shape === 'square' ? 'square' : 'circle';
    if (shape !== builtShape) {
      for (const c of circles) c.remove();
      circles = [];
      builtShape = shape;
    }

    // Reuse nodes across frames — recreating 144 elements per frame is pure GC churn.
    const tag = shape === 'square' ? 'rect' : 'circle';
    while (circles.length > sk.total) svg.removeChild(circles.pop());
    while (circles.length < sk.total) {
      const c = document.createElementNS(NS, tag);
      c.setAttribute('fill', color);
      svg.appendChild(c);
      circles.push(c);
    }
    lastOp = new Array(circles.length).fill(null);
    // Squares match the circles' radius: side = 2r, centered on the dot. No transform is
    // ever applied, so they stay axis-aligned however far the form rotates or twists.
    for (const c of circles) {
      if (shape === 'square') {
        c.setAttribute('width', design.size * 2);
        c.setAttribute('height', design.size * 2);
      } else {
        c.setAttribute('r', design.size);
      }
    }
    buf = [];
  }

  function paint(e) {
    const radius = lerp(anim.iRadius, design.radius, e);
    const rot = lerp(anim.iRot, design.rot, e);
    const twist = lerp(anim.iTwist, design.twist, e);
    const opacity = clamp(lerp(anim.iOpacity / 100, 1, e), 0, 1);   // overshoot exceeds 1
    const reveal = lerp(Math.min(anim.iDots, sk.total), sk.total, e);
    const sym = design.sym;
    const c = canvasSize / 2;

    const dots = layoutDots(sk, {
      radius, rot, twist, scatter: design.scatter, mirror: design.mirror, sym
    }, buf);

    const square = builtShape === 'square';
    const half = design.size;

    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      const el = circles[i];
      // Orbits hold `sym` dots and fade as a unit, so the form is symmetric every frame
      // rather than lopsided while dots stream in.
      const a = opacity * clamp((reveal - d.orbit * sym) / sym, 0, 1);
      if (a <= 0.002) {
        if (lastOp[i] !== 'hidden') { el.style.display = 'none'; lastOp[i] = 'hidden'; }
        continue;
      }
      if (lastOp[i] === 'hidden') el.style.display = '';

      if (square) {
        el.setAttribute('x', (c + d.x - half).toFixed(2));
        el.setAttribute('y', (c + d.y - half).toFixed(2));
      } else {
        el.setAttribute('cx', (c + d.x).toFixed(2));
        el.setAttribute('cy', (c + d.y).toFixed(2));
      }
      // Compare the rounded string, not a tolerance: a tolerance would make the painted
      // value depend on scrub history, so seek(t) would stop being a pure function of t.
      const op = a.toFixed(3);
      if (lastOp[i] !== op) { el.setAttribute('fill-opacity', op); lastOp[i] = op; }
    }
  }

  function stop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    return api;
  }

  const api = {
    /** Scrub to raw progress t in [0,1]. Easing is applied internally. Pure in t. */
    seek(t) {
      lastT = clamp(t, 0, 1);
      paint(ease(lastT));
      return api;
    },
    /** Timed playback. Honors prefers-reduced-motion by jumping to the end. */
    play({ from = 0, to = 1, duration = anim.dur, onDone, respectReducedMotion = true } = {}) {
      stop();
      if (respectReducedMotion && prefersReducedMotion()) {
        api.seek(to); onDone?.(); return api;
      }
      const t0 = performance.now();
      const dur = Math.max(1, duration);
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        paint(ease(lerp(from, to, p)));
        if (p < 1) rafId = requestAnimationFrame(step);
        else { rafId = null; onDone?.(); }
      };
      rafId = requestAnimationFrame(step);
      return api;
    },
    stop,
    // Rebuild, then repaint at the current position — otherwise the new geometry sits
    // invisible behind the previous frame's stale coordinates.
    setDesign(next) { stop(); design = { ...design, ...next }; build(); return api.seek(lastT); },
    setAnimation(next) {
      stop();
      anim = { ...anim, ...next };
      if (typeof anim.bezier === 'string') anim.bezier = parseBezier(anim.bezier) || anim.bezier;
      build();
      return api.seek(lastT);
    },
    /** Regenerate with a new random seed. */
    shuffle(seed = (Math.random() * 1e9) | 0) { return api.setDesign({ seed }); },
    destroy() { stop(); svg.remove(); circles = []; buf = []; },
    get element() { return svg; },
    get total() { return sk.total; },
    get design() { return { ...design }; },
    get animation() { return { ...anim, bezier: [...anim.bezier] }; }
  };

  build();
  api.seek(lastT);   // defaults to the resolved final form
  return api;
}
