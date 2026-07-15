# Parker Model Page — Prototype Notes

A single-file WebGL scrollytelling prototype: a 3D "ripple/pond" model of the Parker
ecosystem that animates through a scroll narrative (hero + chapters). Everything lives
in **`index.html`** (Three.js from CDN, inline CSS/JS). Open the file directly in a
browser; no build step.

> Status: **Part 1 complete** — hero + Chapters 1–4. **Chapter 5 (the "vibe shift") in.**
> Next: Chapter 6.

---

## The model

Three **main layers**, stacked on a vertical axis (`stackY`), each built from three
shared concentric **sub-layers** (discs), culminating in a **patient point** at the top.

- Main layers (`LAYERS`, index order): **Institutes (0)**, **Innovations (1)**, **Bioventures (2)**
  - `stackY`: 0, 2.15, 3.75 · geometry built at uniform `scale:1` (real size is runtime, see below)
  - `sideY`: 0, 0.85, 1.71 — the **side view's own** band spacing (+ `SIDE_PATIENT_Y 2.48`,
    `SIDE_DY 0.18`). Even and compressed. `updateLayout` mixes `stackY→sideY` by `st.side`,
    so Top/Tilted are untouched. **Why two:** a base bar is 3.0 world units and the `stackY`
    tower is 4.9 tall — fit that tower in a 900px viewport and the bars cap at ~4.3 columns.
    The cross-section comp wants ~7, which only works on a shorter stack.
- Sub-layers (`SUBS`, inner→outer): **Parker**, **Network**, **Impact**
  - `Impact` = outermost = the "base" disc; `rf` radii 0.30 / 0.60 / 1.00 × `BASE_R (1.5)`
  - `y` = the stepped **dome height** (1.00 / 0.50 / 0.00). Only visible where `spread < 1` —
    the expanded chapters flatten it to 0 and the side view hides the discs, so it's effectively
    a **Tilted-view knob**. Size it against the layer gaps (`stackY`, 2.15 / 1.60): ~half a gap
    is what reads as dimensional rather than a stack of flat rings. `PATIENT_Y` has to clear the
    top dome (Bioventures 3.75 + 1.00 = 4.75), hence **5.3** — 4.9 would sit right on it.
- Each disc = a **fill** (Mesh) + a **stroke** (randomly-dashed `LineSegments`).
- Center **dot** per layer + **patient** sphere at `PATIENT_Y (4.9)`.

### Randomized dashes
All strokes are hand-built `LineSegments` with per-dash random lengths (native dashed
materials can't randomize). `DASH_MIN/MAX = 50/200`, `GAP_MIN/MAX = 5/50`, scaled by
`DASH_UNIT = 0.006`.

### Ripple motion
- **Hero (dark):** the three sub-layer strokes themselves ripple outward (pond effect),
  staggered. Driven by `outlineF` + `rippleSpeed`.
- **Chapters (white):** separate `rippleRings` animate outward from the Impact edge.
  Count = `rippleCount` (**default 2**), `rippleSpeed` slider default **9**, easing **sine**.

---

## Views / layouts

**Views** (`STATES`, camera keyframes): `Top`, `Expanded`, `Side`, `Tilted`.

`up` is a **state param, not derived from phi** — this matters. The camera blends its up-vector
toward −Z near-overhead so looking straight down doesn't go degenerate. That used to be
`k = min(1, phi/0.35)`, but phi crosses 0.35 only **26% into** an Expanded→Side morph, so the
entire roll finished while the orbit was 16% done — the move read as *a rotation, then a separate
perspective change*. As an interpolated param it travels 0.286 → 1 across the full morph, in
unison with phi/radius/spread: one gesture. The values match what the old formula produced, so
the static views are unchanged. `updateCamera` still derives it while drag-orbiting, since
`st.up` can't know about `userPhi`.
Chapters 1–4 use **Expanded**; Chapter 5 uses **Side**. A scene picks its view with an
optional `view:` key (defaults to `Expanded`).

**Layouts** (`LAYOUTS`, where the model renders within the 12-col / 1440 / 40-margin /
12-gutter grid, via a WebGL sub-viewport):
- `immersive` — full bleed
- `hero` — model right 7 cols (text left 5)
- `editorial` — model right 8 cols (text left 4) — used by chapters 1–4
- `ch5edit` — right 8 cols, `zoom:1.0` — chapter 5 beats **1–2** (photo sits in the left channel)
- `ch5full` — full bleed, `zoom:1.0` — chapter 5 beats **3–5** (opens out)

Both ch5 layouts sit at `zoom:1`, so **`refreshSideRadius()` alone controls the bar width**.
Because the fov is *vertical*, px-per-world-unit depends only on camera distance — so sharing a
zoom means the bars **don't resize** when it opens out to full bleed; the model just slides from
right-of-centre to centre.

### Sizing the base bar in columns (`refreshSideRadius`)
`CH5_BAR_COLS` (**6**) sets the base bar's width in grid columns. A column is a fraction of window
*width*, but the model scales with window *height* — so a hardcoded radius only hits N columns at
one window size. Instead `STATES.Side.radius` is **solved at runtime** and refreshed on resize:

```
px/world = viewportH / (2*d*tan(fov/2))   ->   d = viewportH / (2 * px/world * tan(fov/2))
```

Holds at any viewport (674px = 6 cols at 1440×900, 1484×861, 1920×1080, 1440×700; the model
takes 52–80% of the frame height across that range). The `radius: 5.8` in `STATES` is just a
placeholder — boot overwrites it.

The model region maps inside a centered 1440 content box so it lines up with the DOM grid.
`regionDY` offsets that region **vertically** (px) — 0 everywhere except Chapter 5.

### Dark ⇄ light crossfade
`lightFactor` (0 = dark `#654CFF`, 1 = white). Palette is interpolated continuously
(`PAL.dark`/`PAL.light`, `lerpHex`). The bg is the WebGL clear color. Nav text/bg + labels
follow it.

**Nothing paints its own background.** The whole page crossfades on the scene trigger:
purple→white at hero→ch1, and **white→purple at ch4→ch5** — one mechanism, both directions.
Chapter 5 is transparent; it just sets `light:0`.

Anything **dark-on-white** must fade out with it. `.chapters-col` (chapters 1–4, dark copy)
rides `opacity = lightFactor` so it's gone by the time the bg is purple. Chapter 5's copy is
white and lives **outside** that column, so it stays at full opacity.

### Outline mode
- **Global `outlineF`** (scene: hero 1, chapters 0): hero look — no fills, pure white
  strokes, disc-stroke ripple motion.
- **Per-layer `out`** (in `ARRANGE`, 0 = filled, 1 = outline): controls fills only.
  Filled = Impact `#D8D2FF` @80% + inner purple fills. Outline = base white @60%, no inner
  fills. Eased per layer via `o.curOut`.

---

## Narrative engine (scroll → scene)

- **`SCENES`** = `[hero, chap1, chap2, chap3, chap4, chap5]`; each has `layout`, `light`,
  `outline`, `layers` (→ an `ARRANGE` entry), and optionally `view`.
- **`activeSceneIndex()`** = deepest chapter whose top has passed `SCENE_TRIGGER (0.25)`
  of the viewport. Scene changes are **discrete** (in sync with the rail number).
- Each frame the model moves toward the active scene. Time-based, not scroll-scrubbed, so the
  model holds within a chapter and transitions when the active chapter flips. Two mechanisms:
  - **Per-layer `pos`/`size`/`out`** — a real **`ARRANGE_DUR` (0.7s) tween on `EASE_MOVE`**
    (`cubicBezier(0.51, 0, 0.37, 1)`). Re-seeded from wherever the layers *are* when the scene
    flips (`fromPos`/`fromSize`/`fromOut`), so an interrupted move continues from its current
    spot rather than snapping back.
  - **Everything else** (layout region, light, outline, rail) still uses the exponential
    `SCENE_EASE = 0.11`.
- **Why not `SCENE_EASE` for the arrangement:** it's exponential — no ease-IN at all, ~11% of the
  move on the first frame. On a chap2→chap3 Innovations move it covered **57% in the first
  0.12s** and then crawled. `EASE_MOVE` does 4.5% in the same window. Same reason chapter 5's
  flatten uses it (`CH5_VIEW_DUR`, 1.0s).
- Dev-panel overrides (`viewOverride`, `layoutOverride`, `lightOverride`, `outlineOverride`)
  are cleared on scroll.

### `ARRANGE` (per-chapter layer state: pos `[x,z]`, size, out)
- `hero` (= chapter 1): all `out:1` (outlined)
- `chap2` "An Unparalleled Network": Institutes fills in (`out:0`), others outlined
- `chap3` "From IP to Patients": Innovations also fills in
- `chap4` "Investing in the Best": Bioventures fills in (all filled)
- `chap5` "Vital Connections": all `size:1.00` — side view has `spread:0`, so `pos` is
  inert there and `size` only sets bar width. `out` is inert too (fills are hidden in side view).
- Chapter 1 **inherits hero pos/size** (same `ARRANGE.hero`), just white/filled-layout.

### Pinned chapters (5, 6, …) — `pinnedChapter` / `updatePinned`
Chapters 5 and 6 share one mechanic: the previous model **scrolls up and out**, a **new instance
rises** from below and pins, then **beats** run. `PIN = [ch5, ch6]`; add another by pushing a
`pinnedChapter(id, sceneIdx, beats)`. Everything hangs off one anchor per chapter — its top edge.

| | `top > 0` — **EXIT** | `top <= 0` — **ENTER** |
|---|---|---|
| model | previous instance scrolls up and out, 1:1 | this chapter's instance rises, then pins |
| `modelDY` | `min(0, top - vh)` | `mix(vh, rest*vh, smooth(riseP))` |

**Two owners, and they diverge.** This is the whole trick:
- `pinTravel` = deepest chapter whose top has entered the viewport → owns `regionDY`.
- `pinOwner` = deepest chapter whose top has **passed** the viewport top → owns the *look*
  (view / layout / arrangement / beats). `-1` = none, i.e. chapters 1–4.

During a handoff they split: while `ch6.top` runs 900→0, **ch6 owns the travel** (it's dragging
ch5's model out) but **ch5 still owns the look** (that model is still ch5's instance and must
keep ch5's final beat all the way off the top). `effSi = OWN ? OWN.sceneIdx : min(si, 4)`.

The handoff at `top = 0` works because the outgoing model is at `-vh` (exactly off the top) and
the incoming one at `+vh` (exactly off the bottom) **at the same instant**. Nothing is on screen,
so `snapLook()` swaps view/layout/arrangement with **no easing**. Symmetric on scroll-up.

**`snapLook(sceneIdx, beatIdx)` — the `beatIdx` is load-bearing.** A pinned chapter's *scene*
`view`/`layout` is its **arrival** state, but scrolling back UP into one from below has to land
on its **last** beat: ch5 arrives Expanded/editorial and ends Side/full-bleed, so snapping to the
scene would un-flatten it and then morph it back. It deliberately does **not** touch
`lightFactor` — the background crossfade is global and eased, and mustn't be yanked by the swap.
`lightFactor` follows the **real** `si`, not `effSi`, so the bg still fades on the trigger.

Knobs (per chapter, via `opts`): `rest` (**0** = pins dead centre; the copy has scrolled away by
then so it doesn't need to duck anything) · `enter` (1.0 — rise distance, × vh).

### Arrive-then-move (`arrive` / `arrived`)
Both pinned chapters rise in one view and move to another once they land. It's chapter config,
not a special case:

| | `arrive` (rises in) | beat 0 `view` (destination) | `arrived()` fires the move |
|---|---|---|---|
| ch5 | `Expanded` | `Side` | photo card fully in frame (~`riseP 0.71`) |
| ch6 | `Side` | `Tilted` | the pin (`riseP >= 1`) — default; no photo to key off |

`ownedViewKey()` applies this, and **`snapLook()` goes through the same helper** — they have to
agree or the handoff lands on a view the next frame immediately tweens away from. That was a real
bug: beat 0 declares its *destination*, so snapping to it made ch5 visibly morph Side→Expanded on
the way up and then Expanded→Side again.

### Chapter 6 — "Delivering / Outcomes to Patients"
Same opener treatment as ch5 (`.chapter-wide` + `.opener-copy`, 6 cols centred, 82px head,
**90% leading**, 36px gap). **Stays purple** — `light:0` like ch5, so there's no crossfade; only
the model and copy move.

Rises as the cross-section and **tilts up into the stacked model** once it pins. That move is
bigger than ch5's — `side: 1 → 0` doesn't just swap bars for discs, it swaps the whole vertical
stack back (`sideY → stackY`, so the bands spread 0/0.85/1.71 → 0/2.15/3.75), floats the patient
2.48 → 4.90 and scales its sphere back up (`PATIENT_SIDE_SCALE`), while the camera pulls 5.82 →
10.6. The model goes 674px wide → 370px. It's the model's "true" 3D form arriving.

`vh:1.2` on beat 0: the trigger is the pin, so unlike ch5 there's no ~260px head start and the
1.0s tween needs the full width.

Then it walks the three **sub-layers** (`SUBS`: Parker / Network / Impact), lighting them
**cumulatively** so each card lands on its own ring plus the ones before it. Titles are bolded
inline at the head of the copy. **Frosted** cards at 4 cols (`cardVariant: ''`), not ch5's solid
purple.

| beat | len | view | Parker | Network | Impact | card |
|---|---|---|---|---|---|---|
| 0 | 1.2vh | Side→**Tilted** | **0.25** | — | — | — |
| 1 | 0.8vh | Tilted | **0.25** | — | — | **Parker** … |
| 2 | 0.8vh | Tilted | **0.25** | **0.25** | — | **Network** … |
| 3 | 0.8vh | Tilted | **0.25** | **0.25** | **0.25** | **Impact** … |
| 4 | 1.2vh | Tilted→**Top** | **0.25** | **0.25** | **0.25** | — |
| 5 | 0.8vh | Top | **0.25** | **0.25** | **0.25** | **Patients are the point** |

**Beats 0 and 4 are view moves with no card** — the 1.0s tween needs ~1000px, so at the default
`cardIn` (0.10 = 72px) a 1.0vh beat would fire the next card mid-move. Hence **1.2vh**: the tween
lands at 1000px and the card follows at 1152px. Nothing changes state at those boundaries (same
`subs`), so each reads as one continuous gesture. Beat 0 lights Parker **during** the tilt — no
wireframe state first; it lands on beat 1's look.

ch6 uses the default `cardIn` (0.10). It briefly had `0.35` to hold each lit ring alone before its
card, which needed 1.2vh card beats to keep the hold from collapsing — both reverted for pace.

**The close** rises to the `Top` view, looking straight down the axis, so the patient point ends up
dead centre under the card. The headline uses `.callout .card-head` — X-Condensed Extrabold 36,
purple, over the frosted card's black 16px body.

**`labels: false`** — the tilted view drops the model labels entirely. They ease out as ch6 takes
over; the ease starts at the handoff, where the instance is still below the fold, so they're gone
before the rising model is really visible. (This also sidesteps the fact that `labelOffsets` are
tuned for the *expanded* view and would scatter in Tilted.)

**Card timing.** `cardIn: 0.35` on a 1.2vh beat spends the first **378px** on the newly-lit ring
alone before the card fades in, leaving ~356px of hold. The two are coupled: at the default 0.8vh
beat that delay would squeeze the hold to ~130px, so the beats grew with it. The drift pivot is
derived from `(cardIn + CH5_CARD_OUT)/2`, so it follows automatically. ch5 keeps the 0.10 default.

**The reveal is a FILL, not a dim** (`subFill: 0.25` on the chapter). Lit rings get a flat white
fill; un-lit ones are **truly outlined** — no fill at all, not a faded one — and **every stroke
stays at full weight** (0.9). `subFill` is an absolute opacity: it bypasses `fillBg`/`baseBg` and
the whole `#D8D2FF` base-disc treatment, since in this look the outermost ring has no fill either.
`subs:[]` on beat 0 means it tilts up as a pure wireframe and the fills **build** from there.

`subs` drives `subOn[]` (eased). Omit it — as every ch1–5 beat does — and all three stay lit, so
it's inert elsewhere; `subFill: null` leaves those chapters' fill logic completely untouched.
Not to be confused with the dev panel's **`hlSubs`**, which is a harder isolate (0.12) for
inspection; this is the narrative reveal.

### The close (outro → footer)
"CANCER ENDS HERE" (`.ch6-outro`) — X-Condensed Extrabold 160 uppercase, white. **Absolutely
placed**, not in the grid flow: it has to enter the viewport exactly where the beats end, and row-2
auto-placement would sit it directly under the opener.

Three numbers are derived from the beat total (1.0 rise + 5.6 beats = **660vh**) — **keep them in
step if any beat is retimed**:

| | | |
|---|---|---|
| `.ch6-outro { top }` | **760vh** | `660 + 100` → enters at y 100vh exactly as beat 5 ends |
| `#chapter-6 { min-height }` | **820vh** | footer's top edge reaches y 100vh as the outro centres |
| `#footer { height }` | 100vh | fills the frame at the page bottom |

| ch6.top | outro y | model | footer top | |
|---|---|---|---|---|
| −660vh | 100vh | 1.00 | 160vh | beats end, outro enters |
| −690vh | 70vh | 0.50 | 130vh | |
| **−720vh** | **40vh** | **0.00** | **100vh** | outro centred, model gone, footer arrives |
| −820vh | −60vh | 0.00 | 0 | page bottom, footer fills the frame |

- **The model fades by fading the canvas** (`stage.style.opacity`). That works only because the
  canvas is opaque with a purple clear colour and `body` is the *same* purple — so it dissolves
  into the background rather than revealing anything behind it.
- **The footer's top edge drags the model up**, using the same `min(0, top - vh)` exit a pinned
  chapter uses. Additive — the pinned chapters' own `modelDY` is 0 by then.
- **The rail leaves on its own.** `.rail` is sticky within `#chapters`, so it releases on that
  element's bottom edge — which, with `#chapters`' bottom padding removed, **is** the footer's top
  edge. Rail, model and outro therefore leave together with nothing coupling them in code. (That
  padding is why it was removed: 20vh there would desync the rail from the footer.)

⚠️ `STATES.Top` has **`ripple: 1`** — the animated ripple rings fire in the closing beat. That's the
original "pond" gesture and may well be the right ending, but it's inherited, not chosen. Set the
state's `ripple` to 0 if it distracts (it's a dev-only view otherwise, so it's safe to change).

### Chapter 5 beats (`CH5_BEATS`)
Sub-scenes **within** chapter 5, starting once the model pins. Discrete index; everything eases
toward it. `CH5_BEAT_VH` (0.80) = scroll length of one beat. During the rise the index floors at
0, so the model arrives already in beat 1 rather than popping into it.

| idx | len | layout | lit (`on`) | connections | card |
|---|---|---|---|---|---|
| 0 | **0.9vh** | `ch5edit` | Institutes | — | **— arrives expanded, then flattens** |
| 1 | 0.8vh | `ch5edit` | + Innovations | Inst→Inno | Co-Director / Gladstone |
| 2 | 0.8vh | `ch5full` | (same) | (same) | **— transition, see below** |
| 3 | 0.8vh | `ch5full` | + Bioventures | + Inst→Bio | Dispatch Bio / Penn, Stanford, MSK |
| 4 | 0.8vh | `ch5full` | (same) | (same) | $216M Series A |
| 5 | 0.8vh | `ch5full` | + Patients | + Bio→Patients | Phase 1 / CARsgen |

Five content beats; idx 2 is a transition beat with no card. Beats are **not uniform** — each
can set `vh` (default `CH5_BEAT_VH` 0.8). `CH5_EDGES` holds the cumulative boundaries in
viewport-heights past the pin, and `CH5_PHOTO_HOLD_BEATS` indexes into it, so re-timing or
re-ordering beats can't silently desync the photo.

- **`on`** drives `o.curOn` (eased); un-lit layers' bars *and* labels drop to `CH5_DIM` (0.45).
  It's 1 outside chapter 5, so it's inert everywhere else.
- **View and layout both come from the beat, not the scene** — ch5 is the only chapter that
  changes either mid-chapter. `SCENES.chap5.view` is the **arrival** state (what `snapToScene`
  sets at the handoff), not the destination.

#### The arrival + flatten (beat 0)
The model rises **expanded** — reading as the chapters 1–4 look — and the flatten fires the moment
the photo + caption are **fully in the viewport** (`ch5.photoIn`), ~260px before the pin at
1440×900. The rise itself stays purely vertical: morphing *during* the rise doesn't work, because
at `riseP 0.5` the model is still half below the fold, so the move happens off-screen and is missed.

**`photoIn` is computed, not an IntersectionObserver.** We position that element ourselves every
frame (`position:fixed` + `ch5.photoY`), so its box is already known exactly and synchronously —
IO would re-derive it a frame late. More importantly `threshold: 1` **silently never fires** when
the element is taller than the viewport: at 480px tall the ~507px card is never fully visible, and
the model would sit expanded forever. Hence `|| ch5.riseP >= 1`, which covers that *and* does
double duty — once pinned it stays true, so the flatten doesn't reverse when the photo scrolls
away in the transition beat.

**It's a real timed tween, not `easeStateTo`.** `ch5ViewT` runs 0→1 over `CH5_VIEW_DUR` (**1.0s**)
in real seconds (`dt`, clamped so a backgrounded tab can't jump it), shaped by the shared
`EASE_MOVE`. `easeStateTo` is exponential: no ease-in at all, **44% of the move in the first 5
frames**, which is what reads as "not smooth". Slowing that down only stretches the tail and makes
the lurch more obvious.

`cubicBezier()` matches CSS's timing function of the same name, so values lift straight from a
design tool. Bezier x is a function of the curve parameter, not of time, so it solves `Bx(s)=t`
by Newton-Raphson and returns `By(s)`. Safe here: for these control points the x-curve has no
turning point (discriminant −10.86), so it's monotonic and converges — residual ~1e-16.

**Beat 0's `vh` is sized to `CH5_VIEW_DUR`** — keep them in step. At a typical ~1000px/s scroll the
1.0s tween eats ~1000px, and it starts ~260px *before* the pin, so it ends ~740px after. `0.9vh`
(810px) + the card's 72px fade-in delay leaves ~140px of settle. Lengthen the tween and beat 0 has
to grow with it or the card fades in mid-morph; shorten it (or trigger earlier) and beat 0 becomes
dead scroll. It's been re-tuned twice for exactly this: 1.7 → 1.2 when the morph went 1.5s → 1.0s,
and 1.2 → 0.9 when the trigger moved from the pin to `photoIn`.

Still time-based, so a fast scroll can outrun it — as with every ease in this file.

Note the model spends the top of beat 0 as **filled discs on purple**, a combination that occurs
nowhere else (ch1–4 are filled-on-white, hero is outline-on-purple). `ARRANGE.chap5`'s `pos` is
**not** inert any more — it's what you see on arrival. Sizes must stay `1.0`, though: `size`
scales the side bars too, and 1.0 is what puts them on `CH5_BAR_COLS`.

#### The transition beat (idx 2)
The photo pins at 213px and is ~450px tall, so it needs **~660px** to clear — which doesn't fit
inside a beat (720px) that also has to fade a card in. So the exit and the move to full bleed
get a **beat of their own, with no card**. Two things enforce the ordering:

1. `CH5_PHOTO_EXIT` (0.60 × vh) — the photo exits over a **fixed scroll distance regardless of
   its height**, so `photoGone` lands at a predictable point rather than drifting with the caption.
2. A **gate in `frame()`**: `layoutKey === 'ch5full' && !ch5.photoGone → 'ch5edit'`. The beat
   *declares* full bleed at idx 2, but it's held until the photo has actually left the viewport.

At 1440×900 that sequences as: `-2340` photo releases → `-2880` photo clear, gate opens, model
opens out → `-3060` beat 3 starts, settled → `-3132` its card fades in. 180px of slack for the
layout ease to land before beat 3.
- **Card**: one element, reused by every pinned chapter; the look comes from the owner's
  **`cardVariant`**:
  - `'solid'` (**ch5**) — `.callout.solid`: outlined, white text, **solid `#654CFF` fill**. The
    fill is load-bearing, not cosmetic: it matches the bg exactly (`PAL.dark.bg`, and ch5 is
    always `light:0`) while masking the bars/arcs that would otherwise read straight through.
  - `''` (**ch6**, chapters 1–4) — the plain frosted `.callout`: 80% white, blur 20, black text.

  `cardCols` sets the width, centred in the model region — **ch5 = 3** (331px), **ch6 = 4**
  (445px, matching the ch1–4 frosted callouts). Fades
  in/hold/out per beat (`CH5_CARD_IN/OUT/RAMP`) and **drifts up** across the window
  (`CH5_CARD_DRIFT` 100 → ±41px, pivoting at `CH5_CARD_MID`) — same gesture as the ch1–4 callouts.

### Chapter 5 connection arcs (`CH5_ARCS`)
Dashed white beziers hopping bar→bar. **SVG**, not scene geometry — chunky dashes plus a clean
draw-in are far easier there — but control points are projected from 3D so they track the model
as it rises and opens out. `trimQuad` (de Casteljau) trims the curve to `progress`, so it draws
in from the source bar and retracts when a beat drops it. Faded by `curSide` (they only mean
anything on the cross-section).

Per-arc knobs: `z0`/`z1` (where it leaves/lands along the bar; bar spans ±1.5, **screen-left is
+Z**) and `bow` (peak above the higher node). Per-arc so the two Institutes arcs don't launch
from the same point at beat 3.

**Current vs settled.** Only the connection the current beat *introduces* is dashed
(`CH5_ARC_W_CUR` 5px); ones carried over settle to solid (`CH5_ARC_W_PAST` 2px). `ch5ArcIsCurrent`
= in this beat's links **and not** the previous beat's — so beat 4, which introduces nothing,
shows both arcs settled. `A.cur` eases between the two states so it doesn't pop:

| beat | Inst→Inno | Inst→Bio | Bio→Patients |
|---|---|---|---|
| 1 | — | — | — |
| 2 | **dashed 5px** | — | — |
| 3 | solid 2px | **dashed 5px** | — |
| 4 | solid 2px | solid 2px | — |
| 5 | solid 2px | solid 2px | **dashed 5px** |

The dashed→solid morph keeps the dash **length** fixed and scales the **gap** by `cur`:
`dasharray: 11 0` renders solid, so one eased value drives both the weight and the dashing.
Caps are `butt` — round caps would also make the solid state impossible to fake this way.

---

## Content (DOM)

- **Nav** (fixed): logo `PARKER` + faded `Cancer Ends Here` (X-Condensed); links Franklin
  Medium 16, 24px apart; search icon. Hides on scroll-down, shows on scroll-up; text +
  solid bg color follow `lightFactor`.
- **Scroll tracker** (`#scrolltrack`): 2px hairline at the very top, shown **only while the nav
  is hidden** — it stands in for the nav rather than competing with it. Rule at 10% / fill at 45%
  of the nav's own text colour, so it crossfades white-on-purple → black-on-white for free.
  Fill is a `scaleX` of document progress. `_docH` is cached and refreshed in `resize()` —
  `scrollHeight` forces a reflow and this runs every frame (ch5 is sized in `vh`, so the
  document height does change with the window).
- **Hero**: eyebrow "Our Model" (Franklin Bold 24) → headline "NO BRAKES. ONLY
  BREAKTHROUGHS" (X-Condensed Extrabold 160 / 78%) → Caslon body (24 / 135%), "Here's how." bold.
- **Chapters 1–4** (`#chapters`, left 4 cols, inset 60px for the rail):
  - Headlines: X-Condensed Extrabold 64 / 78% uppercase. Body: Caslon 20 / 140%.
  - Chapters with a **callout** get `.has-callout`: taller (`min-height:200vh`, `padding-top:45vh`
    lead-in), copy **pins** at `calc(37.5vh − 125px)` ("pinned height", raised 25% from center).
- **Chapter 5** breaks the pattern: its own full 12-col grid row (`grid-row: 2`), so the copy
  can centre on the page instead of living in the left channel. `min-height:250vh`,
  `padding-top:45vh`. Copy = **6 cols centered** (`grid-column: 4 / span 6`, 674px at 1440),
  headline **82px**, **36px** to the body, all white.
  - **The ch5 copy never pins** — it scrolls straight through and off while the model rises
    underneath it. Only the model pins. (Chapters 1–4 do the opposite: copy pins, model fixed.)
  - Photo card + caption = **cols 1–4**, 60px inset → 385px, which is exactly `.chapters-col`'s
    content width, so the caption sets to the same measure as the chapter body above (both
    Caslon 20/140%). Duotone (`mix-blend-mode: luminosity` over purple).
    **`position:fixed`, driven entirely from `updateCh5Photo`** — left/width are mapped onto
    the grid in JS since it's out of flow.
  - Photo asset: drop **`ch5-portrait.jpg`** in this folder. Until then a dashed placeholder shows.

#### Why the photo isn't sticky
It has three phases, and `position:sticky` can only do the first two — sticky releases when its
**container** ends, not when a beat does:

| ch5.top | `photoY` | phase |
|---|---|---|
| `> hold0` | `PIN + modelDY` | **rides the model's rise** — locked to `modelDY`, so they arrive together |
| `hold0 … hold1` | `PIN` | **pinned** at `CH5_PHOTO_PIN` = `0.375*vh - 125` — the same height chapters 1–4 pin their copy |
| `< hold1` | `PIN - eP*(PIN + h)` | **releases**, clears over `CH5_PHOTO_EXIT` (0.6 × vh) |

`hold0 = -CH5_ENTER*vh` (where the model pins) · `hold1 = hold0 - 2*CH5_BEAT_VH*vh` (end of
beat 2 — the same instant the layout goes `ch5full`). Continuous at both handoffs: `modelDY` is
0 at `hold0`, and `top - hold1` is 0 at `hold1`. Phase 1 rides the *eased* `modelDY` rather than
scrolling linearly, so the photo and the model don't drift apart on the way up.

### Sticky chapter index rail
- Centered vertical dots (1–6), line spans full viewport, active circle scales up smoothly,
  hover = full saturation. Spans `grid-row: 1 / -1` so it covers chapter 5 too.
- Visibility is `railF` (eased on `si>=1`), **not** `lightFactor` — chapter 5 is purple and
  the rail still has to be there. Colors are CSS vars (`--rail-dot/-active/-num/-line`)
  lerped from JS so it reads on white *and* purple.
- **Chapter-1 entrance only:** the rail is nudged **down** (`railOffset`, self-correcting
  from measured dot vs. headline positions, clamped downward-only) so "1" rides up
  side-by-side with the headline, settling centered at the pin and staying fixed after.
  A `railBase = −12.5vh` keeps the rail's resting spot aligned with the raised pin.

### Context callouts (`CALLOUTS`, chapter# → HTML)
Frosted cards (80% white, blur 20, 24px pad, Hex Regular 16/140, 4 cols wide, centered
over the model). Fade **up and out** over the pinned chapter scroll (`cp` window ≈
0.40→0.94, full-opacity hold ≈ 0.52→0.82). Numbers wrapped in `<strong>` = bold black.
- 1: "We built an all-in ecosystem… discovery, IP development, and clinical trials."
- 2: "**140** Researchers across **19** institutions"
- 3: "**56** Licensed technologies and growing"
- 4: "Revenue from licensing and acquisitions then goes back into research."

### Connection lines (`LINKS`, SVG overlay)
Purple `#654CFF`, 3px, dash 6/6, trim-path draw-in from center dot to center dot:
- ch3: Institutes → Innovations
- ch4 (trigger): Innovations → Bioventures
- ch4 (`card:true`, when the callout appears ~cp 0.42): Bioventures → Institutes

Faded out by `(1 - curSide)`: in side view every center collapses onto the vertical axis,
so the links would otherwise pile up on top of it.

---

## Rose-pattern overlays (chapters 2 & 3)
Dot fields on a layer's surface that visualise the quantity named in that chapter's card.
`ROSE_LAYERS` maps layer index → `{chapter, design}`: Institutes/ch2 = **140**,
Innovations/ch3 = **56**, each holding its own generator "Copy design" JSON.

**`sym` must divide `dots`, or the count silently drifts.** `fitCounts` snaps every ring to a
multiple of `sym`, so the total is always a multiple of `sym` — an exact count is only
reachable when it divides cleanly. Ch3 was authored at sym 6 and rendered **54** against a
card reading 56; no seed can fix it (swept 400), because no multiple of 6 is 56. Dropped to
sym 4 (56 = 4×14), which also matches ch2 so the two fields read as a set. Both now verify
exact. The builder `console.warn`s if a design ever misses its own `dots`.

**Ported, not imported — deliberately.** `Rose Pattern Generator/EMBEDDING.md` says to import
`rose-pattern.js` and never re-implement the geometry. We do neither *and* both: the geometry
(`_roseSkeleton` / `_roseFitCounts` / `_roseLayout` / `_roseRand` / `_roseBezier`) is lifted
**verbatim**, only the paint loop is swapped for WebGL Points. Two reasons the SVG renderer
can't work here:
1. **Z-order.** The brief is *above the layer discs, below the centre dots*. Both are WebGL
   meshes in `#stage` (z-index 0). A DOM overlay can only sit above or below the whole canvas.
2. **Perspective.** In WebGL the field foreshortens onto the layer's plane — the same reason
   the centre dot became a flat disc rather than a sphere.

The doc explicitly allows this ("the geometry functions are renderer-agnostic; only the paint
loop would change"). Verified in node against the real module: identical ring counts, orbits,
and dot positions to **0.0** error across seeds/sym/scatter. **If the generator's geometry
changes, this port must be re-synced.**

- **Layering** is by `renderOrder` alone, with `depthTest:false` on the field: discs (−1/0)
  < field (1) < centre dot (2). Depth testing would let the Parker/Network sub-discs (which
  sit *above* the field's plane at y `ROSE_Y` 0.02) punch holes in it.
- **Per-dot alpha needs the custom shader** — `PointsMaterial` has one global opacity, but the
  bloom reveals dots orbit-by-orbit. No texture map: an unmapped point is already a **square**.
- **Sizing.** `gl_PointSize` is in *device* px, so `uK = (regionH·dpr/2) / _FOV_TAN`. `uDiam`
  folds in `group.scale.x` each frame so dots scale with the layer. This sidesteps
  EMBEDDING.md's "dot-size trap" (which is about SVG viewBox fit) — but it means the tool's
  `size` is only a starting point; **`ROSE_DOT_WORLD` is the real knob**.
- **Triggering rides `effSi`** — the same scene index the model's `ARRANGE` tween keys off — so
  the field starts opening on the exact frame the layers start moving into place, well ahead
  of the card. `updateRoses(effSi)` takes it as an **argument** rather than recomputing, so it
  can't disagree with the model on a boundary frame. (It was originally gated on
  `calloutOpacity`; that made it bloom at `cp` 0.40, which read as late.)
- **The bloom PLAYS, it doesn't scrub.** `t` runs on `performance.now()` over `ROSE_ANIM.dur`
  (2200ms), so it always reads at its designed pace regardless of scroll speed. `rose.t0`
  re-arms to `null` on exit, so it replays on re-entry. Because it's timed rather than
  user-driven, it honours `prefers-reduced-motion` (jumps to the final form) — EMBEDDING.md
  note 3, which a scroll-scrub would have sidestepped.
- **Entrance vs exit are different mechanisms.** The entrance is the bloom's own
  (`ROSE_ANIM.iOpacity` 0→100 inside `paintRose`). `rose.vis` only handles the **exit**, eased
  on `SCENE_EASE` — the rate the model rearranges at — so the field dissolves as the layers
  move on rather than cutting out.
- `ROSE_ANIM` / each layer's `design` take the generator's "Copy animation" / "Copy design"
  JSON verbatim. **`seed` is load-bearing** — same seed, same pattern as the tool.

Knobs: `ROSE_DOT_WORLD` (dot size) · `ROSE_FILL` (0.92 — outer ring as a fraction of the disc
radius) · `ROSE_COLOR` · `ROSE_ANIM.dur` (bloom length) · `ROSE_Y`.

Unrelated legacy: the older `qtyPts` ring-of-dots (`updateQuantity`, `ACCENT` orange) is still
in the layer builder but inert — `qtyCount` defaults to 0 and only the dev panel set it.

---

## Dev control panel (draggable, collapsible)
Gated by `DEV_UI` (currently **off**) and `DEV_PIPS` (the 4 view dots — **retired**), just
above the boot block. Flip `DEV_UI` to `true` to tune labels/layers, then off again. Hidden rather than deleted: the panel's inputs write
`viewOverride` / `layoutOverride` / `lightOverride` / `outlineOverride`, which the render loop
reads every frame, so removing the markup would mean unpicking that from the loop.


Layout / View / Dark-Light + Outline / Highlight layer / Highlight sub-layer / Connections
(arcs) / Ripple (pace, rings, easing) / **Layer handles** (drag to set expanded `pos`, size
sliders — read values from the on-screen readout + console) / **Label handles** (drag model
labels, screen-px offsets) / Quantity dots. Overrides clear on scroll.

**Workflow for tuning a chapter:** scroll to it → toggle **Layer handles** (seeds from the
current arrangement) → drag / adjust sizes → read values → paste back to bake into `ARRANGE`.

---

## Fonts (in folder, wired via `@font-face`)
- `HEX Franklin v0.3 - Bold.otf` → `Hex Franklin` (700)
- `HEX Franklin v0.3 - Medium.otf` → `Hex Franklin Medium`
- `HEX Franklin v0.3 - Regular.otf` → `Hex Franklin Regular`
- `HEX Franklin v0.3 Condensed - Extrabold.otf` → `Hex Franklin Condensed`
- `HEX Franklin v0.3 X Condensed - Extrabold.otf` → `Hex Franklin X Condensed` (`--xcond`, headlines/logo)
- `Caslon Ionic-Regular/Bold.otf` → `Caslon Ionic` (`--serif`, body copy)

## Colors
- Purple `#654CFF` · base disc `#D8D2FF` · accent (quantity dots) `#FF5A00`
- Dark: white 50%-ish fills, dashed purple strokes · Light: `#654CFF` fills 25%, purple strokes

## Model labels
**Colour, chapters 1–4 (white bg):** each scene carries `labelK` = `[Institutes, Innovations,
Bioventures]` where `0` = `#A294FF` (`LABEL_LILAC`) and `1` = black. Only two colours are ever
used, so one eased scalar per layer covers it. ch1 `[0,0,0]` → ch2 `[1,0,0]` (Institutes
lands) → ch3 `[0,1,0]` (hands off to Innovations) → ch4 `[1,1,1]`. Eased off the *real* scene
`si` like `lightFactor`, so colour crosses with the background. On purple every label is
white, so hero mirrors ch1 and ch5/ch6 mirror ch4 — otherwise colour would shift mid-crossfade
under the fade to white. The **Patients** label is not per-scene and still just goes black.

**Position, chapters 1–4:** offsets are **per chapter** (`LABEL_OFF`, keyed by scene key) and
ease between scenes on `SCENE_EASE`, riding `effSi` so they move *with* the layers — a label
usually wants a new spot once its layer has moved. `_LOFF_BASE` holds the shared starting
point and each scene lists only its overrides, so the diffs are the readable part. `_loff()`
deep-copies per scene: shallow-sharing those objects would alias every chapter to one value
and make panel drags mutate all four at once.

`labelOffsets` is now the **live, eased** value (what `updateLabels` reads and a drag writes),
*not* the source of truth. A panel drag bakes into `LABEL_OFF[curSceneKey]` on release —
otherwise the ease yanks the label back the instant you let go — and `_labelDragging`
suspends the ease mid-drag so the two can't fight. The console logs `chapN · Name: {x, y}`,
so it tells you which chapter you just tuned.

Screen-projected DOM. In **side view** they pin flush with the left edge of that layer's base
bar (the side camera looks down −X, so screen-left is +Z; `+offsetWidth/2` compensates for the
centering transform), `SIDE_LABEL_DY` (50px) **under** it. The offsets are tuned for the
**expanded** view, so they fade out by `(1 - curSide)` or they'd drag labels off the bar.

Layer labels are Franklin Bold 24. **Patients** is the exception (`.patient-label`): X-Condensed
Extrabold 36, uppercase — the display face, per the ch5 comp.

The patient sphere is a fixed `0.11` world units, which reads ~2× too big once `sideY` squashes
the stack (4.9 → 2.48). `PATIENT_SIDE_SCALE` (1/3) scales it back **in side view only** — Top and
Tilted still show the full-height stack where 0.11 is correct.

## Handy tuning knobs
`SCENE_TRIGGER` (when a chapter activates) · `SCENE_EASE` (transition speed) · pinned height
`calc(37.5vh − 125px)` + matching `railBase −0.125*vh` · callout `cp` window in `updateCallouts`
· `LINKS` list · `rippleCount` / `rippleSpeed` defaults · `ARRANGE` (per-chapter pos/size/out)
· **ch5**: `CH5_BAR_COLS` (bar width in columns) · `CH5_REST_DY` / `CH5_ENTER` (rise + pin)
· `CH5_BEAT_VH` (beat length) · `CH5_DIM` (how far un-lit layers drop) · `CH5_CARD_COLS`
· `CH5_ARCS[].z0/z1/bow` (arc shapes) · `SIDE_LABEL_DY` (label gap under the bar)
· side bar weights in the `sideBars` builder (bold `*0.25`, thin `0.02`)
· **rose overlays**: `ROSE_DOT_WORLD` · `ROSE_FILL` · `ROSE_SPAN` · `ROSE_DESIGN.seed`.

## Known deltas from the ch5 comps
- Comp styles the patient label as uppercase condensed "PATIENTS"; it currently uses the
  same Franklin Bold treatment as the other layer labels.
- Arc shapes (`z0`/`z1`/`bow`) and `CH5_CARD_COLS` were set by eye off the comp — the comp is
  ~2332px wide and doesn't sit in the 1440 max-width box, so its pixel measurements don't map
  cleanly. Expect to tune.
- Band spacing / bar width: **resolved** via `sideY` (see The model).
