# Embedding a Rose Pattern animation in a scrollytelling page

Instructions for an agent integrating one or more of these dot-field animations into an
existing website, overlaid on a flat element and driven by scroll.

## Files

| File | Role |
| --- | --- |
| `rose-pattern.js` | **The thing you embed.** Zero-dependency ES module, no UI, no globals. Copy it into the site. |
| `index.html` | Design tool. Not for embedding — use it to author a look, then export the config. |
| `Symmetry pattern_1.svg` | The original reference artwork the generator was derived from. |

Do not re-implement the geometry. Import `rose-pattern.js` and pass it config.

## Getting the config

Open `index.html`, tune the look, then click **Copy design** and **Copy animation**. Each
emits one line of JSON that `createRosePattern` accepts verbatim:

```json
{"kind":"design","dots":144,"radius":270,"size":2.5,"rot":0,"twist":0,"scatter":0,"var":70,"fall":55,"sym":4,"mirror":true,"shape":"circle","seed":1}
{"kind":"animation","ease":"expo-out","bezier":[0.16,1,0.3,1],"dur":2200,"iRadius":30,"iTwist":40,"iRot":-50,"iOpacity":0,"iDots":0}
```

The `seed` is load-bearing. Same seed → byte-identical pattern. Drop it and you get a
similar-looking but *different* arrangement. The `kind` field is ignored by the runtime.

---

## The one idea that matters

**`seek(t)` is a pure function of `t` in `[0,1]`.** There is no internal timeline, no
accumulated state. The same `t` always renders the same thing, it runs backwards, and it can
be called at any rate without drift.

That means scroll progress maps *directly* onto the animation:

```js
rose.seek(scrollProgress);   // that's the whole integration
```

You do not need GSAP, ScrollTrigger, or a tweening library. Use `play()` only when you want
a self-running, time-based animation rather than a scroll-linked one.

---

## Quick start — scrub on scroll

The container must be `position: relative`. The overlay layer needs **`pointer-events:none`
on the wrapper div** — the runtime sets it on the `<svg>`, but the div you supply is your
own, and without it the layer sits on top and silently swallows every click on the element
underneath.

```html
<div class="flat-element" style="position:relative">
  <!-- existing flat content -->
  <div class="rose-layer"
       style="position:absolute;inset:0;pointer-events:none;color:#1d3557"></div>
</div>
```

```js
import { createRosePattern } from './rose-pattern.js';

const host = document.querySelector('.rose-layer');
const rose = createRosePattern(host, {
  design:    { /* paste "Copy design" JSON */ },
  animation: { /* paste "Copy animation" JSON */ },
  start: 0,                 // mount in the initial state, not the final one
});

// Coalesce scroll into one rAF tick — scroll fires far more often than you can paint.
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const r = host.getBoundingClientRect();
    // 0 when the element's top hits the bottom of the viewport, 1 when it reaches the top.
    const p = 1 - (r.top + r.height) / (window.innerHeight + r.height);
    rose.seek(Math.min(1, Math.max(0, p)));
    ticking = false;
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();
```

Swap in whatever progress source the site already uses (Scrollama, Lenis, IntersectionObserver
ratios, GSAP ScrollTrigger's `onUpdate` → `self.progress`). All that matters is a 0→1 number.

## Alternative — play once on enter

```js
const rose = createRosePattern(host, { design, animation, start: 0 });

new IntersectionObserver(([e], obs) => {
  if (!e.isIntersecting) return;
  rose.play();          // honors prefers-reduced-motion automatically
  obs.disconnect();     // drop this line to replay on every re-entry
}, { threshold: 0.35 }).observe(host);
```

---

## Sizing and responsiveness

**Resizing needs no JavaScript.** The `viewBox` is in abstract user units (~833), *not*
pixels. The SVG is `width:100%; height:100%`, so the browser scales it to whatever the host
div is. Reflow, resize, orientation change, container queries — all handled by the browser
for free. **Do not** add a `ResizeObserver` that regenerates the pattern.

**The pattern is square; your flat element probably isn't.** Control the fit with the `fit`
option (an SVG `preserveAspectRatio` value):

| `fit` | Behavior | Use when |
| --- | --- | --- |
| `xMidYMid meet` *(default)* | Fits entirely inside, centered. Letterboxed on wide hosts. | You want the whole rose visible. |
| `xMidYMid slice` | Fills the host, crops the overflow. | You want an edge-to-edge texture. |
| `xMidYMin meet`, `xMinYMid meet`, … | Fit, but anchored to an edge. | Aligning to a headline or image. |
| `none` | **Never use.** Distorts dots into ellipses. | — |

### The dot-size trap

Scaling the viewBox scales the dots with it. On a wide, short element the fit ratio gets
small and dots become sub-pixel and faint. Measured, at default `size: 2.5`:

| Host box | Scale | Rendered dot |
| --- | --- | --- |
| 1600 × 240 | 0.288 | **1.44px** — faint |
| 900 × 300 | 0.360 | 1.80px |
| 1200 × 400 | 0.480 | 2.40px |
| 600 × 600 | 0.720 | 3.60px |
| 1440 × 900 | 1.080 | 5.40px |

If the dots look wrong, this is why. Either author `size` in the tool at the aspect ratio you
will actually ship, or compute it from the measured host:

```js
// Pin dots to a real pixel size regardless of container shape.
function fitDotSize(rose, host, targetPx = 3) {
  const vb = +rose.element.getAttribute('viewBox').split(' ')[2];
  const r = host.getBoundingClientRect();
  rose.setDesign({ size: (targetPx / 2) * vb / Math.min(r.width, r.height) });
}
new ResizeObserver(() => fitDotSize(rose, host, 3)).observe(host);
```

(Verified: targeting 3px computes `size ≈ 5.21` on a 1600×240 host and measures 3.00px.)
This is the *only* legitimate reason to observe resize. Debounce it — `setDesign` rebuilds
the skeleton and is not free.

**To bleed past the host**, enlarge the layer rather than touching `overflow`:
`position:absolute; inset:-20% -10%;`. The SVG deliberately keeps the spec-default
`overflow:hidden` so that `slice` crops instead of spilling over neighbors.

## Transparent background and color

Already transparent — no background rect is emitted and no background style is set. Nothing
to strip.

Dots default to `fill="currentColor"`, so they inherit the host's CSS `color`. This is
usually what you want: it means dark mode, hover states, and section themes work through
plain CSS with no JS.

```css
.rose-layer { color: #1d3557; }
@media (prefers-color-scheme: dark) { .rose-layer { color: #a8dadc; } }
```

Override with `{ color: '#ff0000' }` if you need a fixed color. Any CSS color works,
including `rgb(... / 0.4)` — but prefer opacity on the layer for fades.

---

## Other considerations

Things that will bite you, roughly in order of likelihood.

1. **Pointer events — the wrapper div is the trap.** The runtime sets `pointer-events:none`
   on the `<svg>`, but *your* absolutely-positioned layer div defaults to `auto`. It then
   covers the flat element and swallows every click and hover underneath, silently. Verified:
   without it, a heading under the overlay is completely unclickable. Always put
   `pointer-events:none` on the layer div itself. (Only omit it if the rose is interactive.)
2. **Stacking.** The host needs `position:relative` or the absolute layer escapes to the
   nearest positioned ancestor. Watch for `overflow:hidden` and `transform` on ancestors
   creating containing blocks.
3. **Reduced motion.** `play()` respects `prefers-reduced-motion` by jumping to the final
   state. **Scroll scrubbing bypasses this** — it's user-driven, which is usually considered
   acceptable, but if the site is strict, gate it: `if (prefersReducedMotion()) rose.seek(1);`
   and skip the listener. `prefersReducedMotion` is exported.
4. **Client-only.** The module touches `document` at construction. Under Next/Nuxt/Astro,
   mount it in `useEffect` / `onMounted`, or `dynamic(..., { ssr: false })`. Output is
   deterministic from the seed, so there's no hydration mismatch risk once mounted.
5. **Don't animate `dots`.** Changing the dot count rebuilds the ring structure and every
   dot jumps to a new position. That's exactly why `iDots` exists: it reveals a *fixed*
   layout progressively. Never call `setDesign({dots})` per frame.
6. **Reveal is quantized by symmetry.** Dots appear in orbits of `sym` at a time (4 by
   default) to keep the form symmetric mid-bloom. With `sym: 12` and a low dot count the
   staging looks chunky — lower `sym` or raise `dots`.
7. **Overshoot easings.** `back-out` and `spring` exceed 1 (peak ≈ 1.10), pushing radius
   *past* its final value mid-flight. The runtime already sizes the canvas for the curve's
   true range, so nothing clips — but if you port this logic, that's a real bug waiting to
   happen. Opacity is clamped for the same reason.
8. **One instance per container.** No shared state. Give each a different `seed` for variety;
   identical seeds render identically, which is useful for deliberate echoes across sections.
9. **`play()` and `seek()` fight.** `play()` cancels on `stop()`/`destroy()`, but a scroll
   handler calling `seek()` during playback will fight the rAF loop. Pick one per instance.
10. **Clean up.** Call `destroy()` on unmount (removes the SVG, cancels rAF) and disconnect
    your own observers. Leaked rAF loops on a long scrollytelling page add up.
11. **Squares don't rotate.** With `shape: 'square'`, dots are axis-aligned `<rect>`s with no
    transform and stay upright no matter how far the form rotates or twists. Side = 2 × `size`,
    matching the circles' radius — so squares read visually heavier at the same `size`.
12. **A static hero doesn't need JS.** If it isn't animated, use **Save SVG** from the tool
    and inline the markup. Delete the white `<rect>` for transparency and swap `fill="black"`
    for `fill="currentColor"`.

## Performance

Each instance is one SVG with `dots` child nodes (144 by default). Nodes are created once
and mutated per frame — no innerHTML churn, no per-frame allocation.

- 144 dots × a handful of instances is unremarkable; a scroll-linked rose costs ~0.2ms/frame.
- Past **~600 dots** or **~6 simultaneously animating instances**, consider a `<canvas>`
  renderer instead — SVG attribute writes become the bottleneck. The geometry functions are
  renderer-agnostic; only the paint loop would change.
- Only animate what's on screen. Pair with an IntersectionObserver and stop scrubbing
  offscreen instances.
- Don't add `will-change` — attribute updates aren't GPU-compositable and the layer promotion
  just costs memory.

## Accessibility

The SVG is marked `aria-hidden="true"` as decorative. If a pattern is meaningful, add a
labelled wrapper. It contains no text and no focusable nodes.

---

## API reference

```js
import {
  createRosePattern, prefersReducedMotion, cubicBezier, parseBezier,
  EASINGS, DESIGN_DEFAULTS, ANIM_DEFAULTS
} from './rose-pattern.js';

const rose = createRosePattern(container, options);
```

### Options

| Option | Default | Notes |
| --- | --- | --- |
| `design` | `DESIGN_DEFAULTS` | "Copy design" JSON. |
| `animation` | `ANIM_DEFAULTS` | "Copy animation" JSON. `bezier` accepts an array or `"0.4, 0, 0.2, 1"`. |
| `color` | `'currentColor'` | Any CSS color. |
| `fit` | `'xMidYMid meet'` | Any `preserveAspectRatio` value. |
| `start` | `1` | Initial `t`. Use `0` for scroll-driven mounts. |
| `pointerEvents` | `'none'` | Only override if the rose must be interactive. |

### Methods

| Method | Notes |
| --- | --- |
| `seek(t)` | Render at raw progress `0..1`. Easing applied internally. Pure, idempotent, reversible. |
| `play({from, to, duration, onDone, respectReducedMotion})` | Timed playback. All optional. |
| `stop()` | Cancel playback; leaves the current frame. |
| `setDesign(partial)` | Merge + rebuild + repaint at the current `t`. Not per-frame cheap. |
| `setAnimation(partial)` | Same, for animation config. |
| `shuffle(seed?)` | New random seed (or a specific one). |
| `destroy()` | Remove the SVG and cancel playback. |
| `.element` | The `<svg>` node. |
| `.total` | Actual dot count (may differ slightly from `dots` — see below). |
| `.design` / `.animation` | Current config, cloned. |

### Design config

| Key | Range | Meaning |
| --- | --- | --- |
| `dots` | 12–900 | Target total. Counts snap to multiples of `sym`, so `.total` may differ by a few. |
| `radius` | 40–400 | Outer ring radius, in viewBox units. |
| `size` | 0.4–12 | Dot radius, viewBox units. See the dot-size trap. |
| `rot` | 0–360 | Whole-form rotation. |
| `twist` | -45–45 | Degrees added per ring — swirls it. |
| `scatter` | 0–100 | Jitter. `0` matches the reference artwork. |
| `mirror` | bool | Mirror scatter across symmetry axes — keeps it balanced. `false` = true noise. |
| `var` | 0–100 | Ring-to-ring count variation. The main "organic" knob. |
| `fall` | 0–100 | Center density. Higher = denser core, sparser rim. |
| `sym` | 1,2,3,4,5,6,8,10,12 | Rotational symmetry order. |
| `shape` | `'circle'` \| `'square'` | Squares are axis-aligned and never rotate. |
| `seed` | int | Pins the exact arrangement. |

### Animation config

| Key | Range | Meaning |
| --- | --- | --- |
| `ease` | see `EASINGS` | Name only; `bezier` is what actually runs. |
| `bezier` | `[x1,y1,x2,y2]` | CSS cubic-bezier. X clamped 0–1; Y free (overshoot allowed). |
| `dur` | ms | Only used by `play()`. Irrelevant when scrubbing. |
| `iRadius` | 0–400 | Starting radius — how close in the rings begin. |
| `iTwist` | -90–90 | Starting twist; unwinds to `design.twist`. |
| `iRot` | -360–360 | Starting rotation. |
| `iOpacity` | 0–100 | Starting opacity, → 100. |
| `iDots` | 0–900 | Starting visible count, → `.total`. Clamped to `.total`. |

Presets: `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, `expo-out`, `expo-in-out`,
`back-out`, `spring`.

---

## How the pattern works

Useful if you need to modify the geometry. It is not random scatter.

Dots sit on **concentric rings at even radial spacing**. Each ring carries its own dot count
and rotation offset, and the counts vary a lot ring to ring — the reference SVG runs
`4, 16, 8, 28, 20, 4, 32, 8, 8, 4, 12` across 11 rings. That variation, not jitter, is what
makes it read as organic; the reference has **zero** jitter and is perfectly symmetric.

The constraint that makes it work: each ring has an **isotropic capacity** — the count at
which arc spacing equals ring spacing. In the reference, no ring exceeds ~1.3× that, and
outer rings are thinned well below it. Rings are *thinned from a packing limit*, never
crammed past it. Remove that ceiling and the dense core fuses into a solid disc.

Reveals go by symmetry orbit — dot `j` and dot `j + count/sym` are rotational partners and
always appear together, which is what keeps the bloom symmetric rather than lopsided.
