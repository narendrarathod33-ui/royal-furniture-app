# Web scroll-performance audit — backdrop blur on list cells (2026-10-18)

Symptom class addressed: **choppy scrolling** on the catalog grid (web build, the
surface testers use). Method: production `expo export` build served locally,
measured headless Chromium (SwiftShader GPU — a stress proxy for low-end
devices; absolute numbers there are worse than real phones, relative deltas are
the signal). Harness: `/tmp/perf-measure.cjs` protocol — cold load → interactive,
then 9 fling gestures over the Search "Browse all products" grid while sampling
`requestAnimationFrame` deltas + `longtask` entries; then tap→PDP ×3.
Raw runs: `perf-baseline.json`, `perf-after.json`, `perf-final.json`.

## Root cause (evidence)

Every `ProductCard` carried `GLASS.panel` → `backdrop-filter: blur(18px)
saturate(150%)`, plus a blur(12) glass heart chip, per card — **30 live
backdrop-filter surfaces on screen** during grid scroll. Zero `longtask`
entries during scrolling → main thread idle → the stall is compositor/GPU
backdrop sampling, not JavaScript.

## Change (smallest safe fix)

`app/ui/glass.tsx`: added `panelNoBlur` / `chipNoBlur` — byte-identical to
`panel` / `chip` minus the `backdropFilter` layer.
`components/catalog/kit.ts`: `productCard` → `panelNoBlur`, `heart` →
`chipNoBlur` (list cells only). Rationale: over the flat page backdrop a
backdrop blur is a visual no-op (blurring a flat color changes nothing), so the
pixels are unchanged while the per-card GPU sample disappears. Chrome surfaces
(nav, header, sheets — where content genuinely scrolls underneath) keep their
blur. A second candidate (search filter chips) was tested and **reverted**:
3 runs showed no improvement beyond noise (13.1/10.8/12.5 vs 8.1) — bounded
count, not per-row, so not part of the leading cause.

## Results (same protocol, same build pipeline)

| Metric | Baseline | Final | Δ |
|---|---|---|---|
| Dropped frames (>32 ms) during grid scroll | 21.1% | **7.9%** (8.1% on 2nd run → median ≈ 8.0) | **−62%** |
| p95 frame interval | 150 ms | **50 ms** | −67% |
| Worst frame interval | 333 ms | **267 ms** | −20% |
| Backdrop-filter surfaces on screen | 30 | 8 (header/nav/input/chips — static, not per-row) | −73% |
| Long tasks during scroll | 0 | 0 | unchanged |
| Cold load → interactive (local) | 725 ms | 756 ms | noise |
| Tap → PDP median | 1758 ms | 1860 ms | noise (reps 723–2113 across runs; virtualized-list remount dominates) |

Baseline is a single run; identical-config repeat runs vary ±3 pp in this
environment — the 21→8 improvement exceeds that band; the run JSONs are checked
in above.

## Appearance verification

Pixel diff of the grid screen before vs after (same viewport, settled):
**0.001% of pixels differ** (4 px of 329 k — antialiasing noise). Screenshots:
`scroll-before.png` / `scroll-after.png`.

## Round 2 — list batching (worst-frame spike) + bundle quantification

**V1 batching change (`components/AdaptiveProductList.tsx`):** `windowSize 7→5`,
`maxToRenderPerBatch 8→4`, `updateCellsBatchingPeriod 50→40`. Same rendering,
different batching rhythm — work per frame-boundary is halved. Measured same
session, 3 runs per config (sandbox noise drifts between sessions; medians):

| Metric (3-run median) | Committed config | V1 | Δ |
|---|---|---|---|
| Dropped frames | 13.3% | **6.5%** | ~2× |
| p95 frame interval | 150 ms | **83 ms** | −45% |
| Worst frame | 433 ms | 400 ms | mild |

Raw runs: `perf-cur{a,b,c}.json` vs `perf-v1{a,b,c}.json` (written by the same
harness). Gates after V1: tsc, jest 45/45, legacy 57/57, Playwright 10/10.

**Bundle quantification (bottleneck #2):** prod entry is 5.6 MB raw / 1.05 MB
gzip; the two catalog data sources alone are 2.3 MB of TS source
(`catalogData.ts` 964 KB + `productDetails.ts` 1.38 MB). Throttled cold load
(CDP Fast-3G emulation, 1.6 Mbps/150 ms): **28.6 s to interactive on a
non-compressing server** — arithmetic matches raw-byte transfer; GitHub Pages
serves gzip, so production first load is ~5–6 s transfer + parse on the same
link. Route-level splitting (`asyncRoutes`) is a **dead end here**: the app is
a single route with in-app tab state — there is nothing to split. The real
lever would be moving the catalog data out of the critical chunk
(fetch-after-interactive), which changes behavior (search empty until loaded)
and is therefore **recommended, not implemented**.

## Remaining bottlenecks (ranked)

1. **Worst-frame spike (~270–450 ms) on list-window mounts** — new card batch
   render + photo decode. In production this is image decode of real photos;
   not reproducible with sandbox fallback tiles. Candidate: `recyclingKey`/
   `getItemLayout` + precomputed heights, or FlashList (P3 plan option).
2. **Cold parse of the 5.6 MB (1.05 MB gzip) single entry chunk** — first load
   on slow networks; local-interactive 725 ms is parse-bound. Candidate:
   route-based async chunks (`experiments.asyncRoutes`) — needs a real-network
   measurement before touching.
3. **Remaining 8 blur surfaces** (header, nav, search input, filter chips) —
   static chrome; keeping them is a deliberate trade (they carry the visible
   glass-over-content look). No scroll-path cost measured from them.
4. Native side untested in this round — the same presets no-op on native
   (blurLayer drops the key off-web), so no native change shipped.

## Round 3 — Deals page, memory soak, data-split verdict (2026-10-18)

**Harness correction (two earlier numbers retracted).** This app scrolls inside
a div scroller — the list's own ScrollView (`[data-testid=deals-results]`,
`overflow-y: auto`), never `window`; `window.scrollY` is 0 at every scroll
position by construction. The round-3 attempts that reported "Deals never
scrolled / 35.9% dropped" and "51.1% dropped" read the wrong metric and/or
fired the wheel inside tab-mount work. Both are retracted. Structure verified:
after 9 × 1,400 px flings the scroller moved 0 → 12,127 px with content growing
3,262 → 14,907 px (virtualized window mounting as it goes). Raw:
`deals-r3.json`.

**Corrected Deals scroll health (V1 tuning, mount settled before sampling).**
Wheel over the list center, 3 rounds × 3 flings: dropped 6.7% (worst 550 ms)
→ 4.2% (worst 100 ms) → 1.1% (worst 83 ms). That is the same band as the
Search grid under V1 — the shared `AdaptiveProductList` batching is healthy on
Deals too (Deals and Customization both render through it, so V1 propagates
automatically). The one-off first-fling hitch (550 ms worst frame) is the first
virtualization wave: ranked bottleneck #1 below, not a Deals-specific defect.

**Memory soak: no leak.** 40 flings across tabs: JS heap flat at ~36 MB
start-to-finish, zero drift. The "slows down over time" class is not
reproducible in this build.

**Data-split verdict (bottleneck #2 refined).** `productDetails.ts`
(1.38 MB) import fan-out is exactly 1 (only the PDP imports it) — the ideal
split candidate — but its data is read synchronously in a `useMemo` that feeds
the description, fabrics, colors and the size list driving the add-to-bag
label. A lazy boundary would transiently alter PDP CTA labels/sizes on slow
networks, which crosses the no-behavior-change line: **recommended, not
implemented.**

**Live blur census (computed styles, production build, 390×844).** Home 8 /
Deals 31 / Browse 32 `backdrop-filter` surfaces. Deals' single opaque-with-blur
surface is the selected category chip (`#40201B`-family maroon + blur(12) —
provably invisible work). The Deals header chips sit over the flat page
backdrop, where blur is a visual no-op by the Round-1 rationale; however the
Round-1 chip-swap experiment measured no gain beyond noise for exactly this
class of change, so the header NoBlur swap stays a **documented candidate,
not implemented** (no speculative changes without expected-gain evidence).

**Remaining bottlenecks (re-ranked).**

1. **First-window mount hitch (~270–550 ms worst frame)** — now observed on
   both grids (Search worst 400–433 ms, Deals first fling 550 ms): new card
   batch render + photo decode; production photos will decode slower still.
   Candidate: `recyclingKey`/`getItemLayout` + precomputed heights, or
   FlashList (P3 plan option).
2. **Cold parse/transfer of the 5.6 MB (1.05 MB gzip) entry chunk** — lever =
   move `productDetails.ts` out of the critical chunk (fan-out 1, but
   behavior-changing; see verdict above). Needs a real-network measurement
   before touching.
3. **Deals tab-mount cost** — 31 glass surfaces over a flat backdrop plus the
   initial card wave; candidate = header NoBlur swap, counter-evidenced by the
   Round-1 chip test (expected gain ≈ noise), so parked.
4. Native side untested in this round — blur layers and batching presets are
   web-only or no-op on native; no native change shipped.

*Operational note:* headless Chromium in this sandbox segfaults at launch after
a re-provision; recovery is `rm -rf /tmp/chromium /tmp/al2 /tmp/fonts` and let
`e2e/helpers/chromium.cjs` re-extract.

## Round 4 — warm reload + the deploy defect (2026-10-18)

**Trigger:** "still slow on reload in the browser." Two stacked causes found.

**Cause 1 — the live site could not boot at all (deploy defect).** Expo's SPA
export wrote **absolute** asset URLs (`src="/_expo/..."`). On GitHub Pages the
site lives at `/royal-furniture-app/`, so the browser requested
`user.github.io/_expo/...` → 404 → `#root` stays empty forever: an Endless
"loading" that looks like slowness. Both live gh-pages commits are affected
(`9f4a829` perf-r2, `88d2a80` shop-redesign); the repo's own
`build:web:pages` script existed with the right flag (`PAGES_BASE_PATH`) but
deploys were made from unprefixed exports. **Fix:** deploys now use
`npm run build:web:pages` (prefixed entry verified in the export, then
boot-verified under a locally prefix-mounted server, 0 page errors).
Evidence: `warm-reload-r4.json`.

**Cause 2 — warm reload cost is CPU, not network.** With the cache fully warm
(every resource `transferSize: 0`), reload to interactive is **2.2–2.6s at 4×
CPU throttle** (phone-class), 0.6–2.0s on desktop: one **0.7–1.1s long task**
parse+execute of the 5.8 MB chunk, then `SplashGate` replayed its scripted
**~1.3s intro on every load** (no session gating). Two behavior-safe fixes:

1. **Boot splash in `index.html`** — `scripts/inject-web-splash.mjs`
   (idempotent, wired into `build:web:pages`) injects a ~1 KB brand mark +
   indeterminate bar that fills the white gap during boot and removes itself
   the moment React mounts anything (MutationObserver, 8s failsafe). No
   libraries, no app code touched.
2. **Intro once per session** — `SplashGate` marks
   `sessionStorage['rf-splash-seen']` (web only); warm reloads skip straight
   to content; a fresh tab still plays it. Measured: cold plays, warm reload
   interactive in **469 ms** (desktop CPU) with no intro, 0 page errors,
   Playwright 10/10, jest 45/45, tsc clean.

Cold-load unaffected beyond Cause-1's fix: transfer numbers from Round 2
stand. The remaining structural lever (splitting `productDetails.ts`, −24%
of boot parse) stays recommended-not-implemented per Round 3's verdict.

---

---

---

## CORRECTION (2026-10-19) — the live-site outage was a missing `.nojekyll`, not app code

After the revert round kept failing live while the sandbox preview worked, the
live host was finally probed for the actual bundle file: GitHub Pages returned
its 404 page for **every** `entry-*.js`. Root cause: the r3.7 wipe deploy
(978bc84) deleted `.nojekyll` (and the published companions) and 5a34837
restored only the entry files. Without `.nojekyll`, Pages runs Jekyll, which
excludes the `_expo/` directory — so from r3.7 through r3.5.1 every deploy
published an index.html whose app bundle 404ed. All "still not working"
reports in that window were this, not bundle size or connection speed; the
r3.9 records-split conclusion stands as measured locally, but it did not —
and could not — fix the live site. Fixed in gh-pages 7885a10 (`.nojekyll` +
companions restored from 636ae7a); `deploy-pages.sh` now self-heals the
marker on every deploy. Lesson: post-deploy verification must fetch the
**entry bundle from the CDN** (this file), not just version.json / git
contents.
