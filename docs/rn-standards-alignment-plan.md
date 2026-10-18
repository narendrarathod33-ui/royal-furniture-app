# React-Native Standards Alignment Plan

Status: **P0 complete** (Playwright smoke + bundle baseline, see §2 Phase 0).

> P0 outcome: `e2e/smoke.spec.ts` 7/7 green against the live preview;
> baseline 10.92 MB raw / 1.64 MB gzip (`docs/perf/bundle-baseline.json`).
> Sandbox browser: no system browser / apt / Playwright CDN — Chromium is
> provisioned from the npm-hosted `@sparticuz/chromium` tarball (see
> `e2e/helpers/chromium.cjs`, which also drops its Lambda-only
> `--single-process` flag) with its bundled NSS libs on `LD_LIBRARY_PATH`.
Standards source: the RN/Expo standards brief (New Architecture, Expo SDK 50+,
Reanimated/Gesture, Zustand+MMKV, TanStack Query, FlashList, Jest+RNTL+Maestro).

## 0. Where the repo already complies

| Standard | Evidence |
|---|---|
| New Architecture | `newArchEnabled: true` (RN 0.81, Expo 54) — JSI/Fabric/TurboModules path |
| Expo SDK 50+ / Expo Router | SDK 54, file-based routes in `app/`, config plugins in `app.json` |
| Typed routes | `experiments.typedRoutes: true` (already on) |
| Animations | `react-native-reanimated` ~4.1.1 (≥3), `react-native-gesture-handler` ~2.28 |
| Hermes | RN default; web bundles already build with `transform.engine=hermes` |
| No NgModules-style baggage | n/a — already component-based, no legacy bridge code |

Non-goals (explicit): the catalog pipeline (`data/tools/catalog_xlsx.py`,
`drive_receiver.mjs`, `live_catalog_bridge.mjs`, Apps Script) is **out of scope** —
it is verified end-to-end and unrelated to UI standards.

## 1. Hard constraints the plan must respect

1. **15 `node:test` suites / 100 tests exercise the real source via TS-AST
   extraction.** They select *function declarations by name* from source files
   and run them in a VM harness (`cart-navigation`, `price-sorting`,
   `product-images`, `category-navigation`, `adaptive-layout`,
   `glass-consistency`, `home-promotions`, and 8 more). Consequences:
   - Components must stay `function` declarations until the suite that extracts
     them is ported — no `React.memo(const …)` / `forwardRef` rewrites earlier.
   - Moving state into Zustand changes `AppSession`'s signature → its suite must
     be ported first (or in the same change).
2. **Web-first consumption.** The primary surface is the web preview
   (`:4000`). Every phase gates on the web bundle + a browser smoke, not just
   native typecheck. Some standard choices (MMKV, FlashList) are native-first
   and need web fallbacks verified.
3. **No device/simulator in this sandbox.** Maestro flows can be *authored*
   here but only *run* on a real build (your machine or EAS). Playwright against
   the web preview is the in-sandbox E2E substitute.
4. **The app must stay shippable at every phase boundary** — one phase per
   commit series, all gates green before the next starts.

### Suite → component coupling (port order driver)

| Suite extracts | Blocks refactors of |
|---|---|
| `cart-navigation` → AppSession, CartContent, AccountContent, Header | state migration, any signature change |
| `price-sorting` → ShopContent | memoization, list swap in shop grid |
| `product-images` → ProductCard (+ kit styles) | `React.memo(ProductCard)` |
| `category-navigation` → SearchContent | search screen rewrite |
| `adaptive-layout` / `glass-consistency` → BottomNav, floatingNavStyles | nav refactor |
| `home-promotions` → HomeContent (+ kit) | home section rework |
| `production`, `payments` | server-side — stay node scripts |

## 2. Staged plan

### Phase 0 — Guardrails before anything moves (S, low risk)
- **Playwright smoke E2E against the web preview** (their standards list
  Playwright for E2E; it runs in this sandbox): home → search → PDP size
  select → cart → sandbox checkout → account. This is the safety net that
  makes later phases reversible. ~6–8 specs.
- Snapshot the Metro web bundle as a size baseline (currently ~10.9 MB dev
  bundle) to prove FlashList/code-splitting effects later.
- **Gate:** smoke green on `:4000`; all 100 node tests green; committed as its
  own commit so every later phase diffs against a behavior baseline.

### Phase 1 — Jest + RNTL foundation, port suites incrementally (M, medium risk)
- Add `jest`, `jest-expo` preset, `@testing-library/react-native`; keep the
  `node:test` suites running in parallel (`npm run test:legacy`).
- Port order = coupling risk order: `product-images` → `price-sorting` →
  `category-navigation` → `home-promotions` → `adaptive-layout` +
  `glass-consistency` → `cart-navigation` last (it's the state-migration gate).
  Each port: one PR-sized commit, old suite deleted **only after** the RNTL
  version asserts the same behaviors (checklist per suite).
- What RNTL gives that the VM harness can't: real render tree, accessibility
  queries, user-event, Reanimated-aware mocking.
- `production` / `payments` suites stay as node scripts (server logic).
- **Gate:** 100% behavioral parity checklist per ported suite; full run green.

### Phase 2 — State → Zustand + MMKV (M, medium risk; requires cart-navigation ported)
- `stores/session.ts`: `useSessionStore` — tab, notice (+ its timer logic),
  orders. `stores/cart.ts`: `useCartStore` — cart, saved, with the **10-cap
  invariant as a store action** (`addToCart`, `inc` capped in one place,
  replacing the two UI-level caps added in `60f5c63`).
- Persistence: `zustand/middleware` `persist` + MMKV adapter on native;
  **web fallback = localStorage adapter** (verified in preview: cart survives
  reload). `react-native-mmkv` itself only lands if/when a native build exists.
- `AppSession` shrinks to composition + effects; selectors keep re-renders
  scoped (a cart change no longer re-renders the account screen).
- Derived data (`savedProducts` dedupe, totals) → `computed`-style selectors.
- **Explicitly deferred:** TanStack Query — server state is one sandbox
  payments endpoint; revisit if real API surfaces (rule: adopt when ≥3 async
  sources or cache invalidation pain appears).
- **Gate:** ported RNTL suite green against store-backed components; web smoke
  incl. reload-persistence; bundle size delta noted.

### Phase 3 — Rendering performance (M, low risk once Phase 1 done)
- `@shopify/flash-list` v2 **only inside `AdaptiveProductList`** (the 1,360-row
  catalog grid). Rails (5–10 items) stay FlatList. `estimatedItemSize`,
  typed `renderItem`, key by product id (never index).
- `React.memo(ProductCard)` + `useCallback` handlers at list sites — now legal
  because `product-images`/`price-sorting` suites are RNTL-native by then.
- Inline-style cleanup: repeated inline objects (cart adaptive layout, filter
  rows) move to `kit.ts`; one-off layout props stay inline (deliberate style).
- **Web caveat:** FlashList web is functional but less battle-tested; the
  Playwright smoke + a scroll-perf eyeball check on the preview gate this.
  Fallback documented: revert is one-file.
- **Gate:** suites green, smoke green, bundle delta recorded.

### Phase 4 — E2E maturity (S in-sandbox; M with device)
- Playwright specs expand to the money paths (Drive-push → catalog updates →
  size dropdown → price-order persistence).
- **Maestro flows authored now** (`native-flows/*.yaml`: login-less smoke, cart
  flow, search flow), executed against an EAS dev build when available — not
  runnable in this sandbox, stated openly.

### Phase 5 — Delivery & offline (on demand)
- **EAS Build/Submit**: `eas.json` profiles (development, preview, production);
  OTA updates channel. Requires an Expo account + `eas init` — needs your
  credentials/decision, nothing happens in-sandbox.
- **Offline (NetInfo + persisted query cache)**: deferred until there is a
  real offline requirement; the app is online-only today.
- RAM bundles / module splitting: not needed at current size; revisit if the
  bundle baseline from Phase 0 grows >2×.

## 3. Sequencing & stop points

```
P0 smoke/baseline ─→ P1 Jest+RNTL ports ─→ P2 Zustand+MMKV ─→ P3 FlashList/memo
        (any phase may stop here — app fully shippable at each boundary)
                                              └→ P4 Maestro/E2E ─→ P5 EAS/offline (on demand)
```

Each phase = separate commit series on this branch, gates listed above, no
phase starts while the previous gate is red. P2–P3 ordering is fixed by the
suite-coupling table (P2 needs cart-navigation ported; P3 needs ProductCard
free of AST extraction).

## 4. Effort & risk summary

| Phase | Size | Risk | Reversibility |
|---|---|---|---|
| P0 smoke + baseline | S | low | trivial (additive) |
| P1 test port | M | medium (parity discipline) | old suites kept until parity |
| P2 Zustand+MMKV | M | medium (state semantics) | store layer isolated in `stores/` |
| P3 FlashList+memo | M | low-med (web caveat) | one-file revert |
| P4 Maestro authoring | S | none in-sandbox | additive YAML |
| P5 EAS/offline | M | needs your accounts | on-demand |
