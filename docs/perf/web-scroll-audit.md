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
