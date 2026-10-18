# Adaptive layouts

## Implemented in the existing Expo app

- `AdaptiveFrame` caps the workspace at 1360 layout units and centers it on wide windows. No route or screen is keyed by window size.
- `useAdaptiveLayout` uses current window/pane dimensions, not device names. Compact <600, medium 600–839, expanded 840–1199, wide >=1200. Heights <480 use compact-height behavior.
- Expanded windows use a navigation rail when there is enough height. `AdaptiveRegion` subtracts its 96-unit reservation before children decide their layouts.
- Browse promotes its existing taxonomy to a 260-unit sidebar at **1040 units of content width** (after navigation), with active category descendants and explicit Shop all choices. Smaller windows keep the searchable explorer and contextual chips.
- Browse, Search, New in, Best sellers and Saved use measured, virtualized adaptive lists. Cards fit complete columns with 12/20-unit gaps. Font scaling reduces column count rather than shrinking text. At very narrow widths, one column is intentional.
- FlatList reflows restore the first viewable product's row on a best-effort basis; exact pixel offsets can differ because card heights change. Lists are not remounted for every pixel of width change, only column-count changes.
- Deals' existing wrapped grid uses the same card-width calculation. Filter controls and sorting are preserved.
- Product details use a gallery beside details at >=840 usable units with normal text scale, and stack below that. Gallery max width 560; detail max width 680; 28-unit gap. A single vertical scroller avoids scroll traps. The current photo, variant and purchase state survive resizing. The bottom purchase bar remains explicit and bounded.
- Cart items and a 350-unit summary form two panes when eligible. Account places bounded profile/privacy beside orders/support. Existing actions, prototype status, Stripe configuration, and data policies are unchanged.
- Quantity/removal, save and gallery arrow controls have 44–48-unit hit targets. Dialogs are bounded to 560 units, with scrollable Filter/checkout bodies for short windows.

## Foldable support and limits

The browser adapter reads `window.viewport.segments` when available, with a CSS `env(viewport-segment-*)`/media-query fallback. Invalid, missing, or single-region data falls back to normal responsive behavior. It listens for window, visual viewport and segment media-query changes, and cleans up listeners/probes.

For **separating displays**, this implementation conservatively confines the app and its existing modals to the largest complete usable segment (top/left on equal sizes). It does **not** span controls across the hinge and does **not yet** introduce independent book/tabletop panes across both segments. A continuous unfolded display uses its full width, bounded by the normal workspace cap.

Precise Android native fold/occlusion/posture support is **not implemented**: Expo Go does not provide an assumed WindowManager bridge. A future native adapter needs a native module and custom development build, tested on actual hardware. Compose/Flutter replacements were not introduced into this React Native project.

## Verification

Run `npm run test:adaptive`, plus the existing navigation, category, photo zoom, gallery, size, motion, payment and production tests (63 tests passed in this change); run `npm run typecheck` and `npm run build:web`.

Browser checks in this workspace exercised widths 320/390/600/768/840/1024/1280/1440, Browse sidebar/rail and card bounds, product/cart reflow, Add to bag staying on details, account draft continuity, gallery selection through resize, short-window Filter scrolling, and simulated book-style viewport segments with draft continuity. External image/API requests were unavailable/blocked during browser layout checks, so these are not evidence of live remote image delivery. Local screenshots are review artifacts, not repository assets.

Manual device follow-up: native font scaling, iPad/Android split-screen, keyboard opening, touch swipes/pinch while resizing, real separating hinges and tabletop posture. Browser segment emulation is not a substitute for physical foldable testing.

## Product image fitting

Product card media uses `width: '100%'` and `aspectRatio: 1` without a fixed height, for both the measured grid and the 160-unit horizontal rail. The image fills this reserved frame with React Native `resizeMode="contain"` (React Native Web emits proportional `background-size: contain`). Product-detail slides, gallery thumbnails, and cart photos also contain rather than crop their sources. Lifestyle/category imagery and texture swatches intentionally retain `cover`.

Product cards use a neutral media background. Missing/failed photos show an accessible fallback inside the same square frame. Error state is keyed by image source: unrelated renders do not retry a failing URL, while changing the product's source permits a new image load. No new image-size variants or CDN URLs are fabricated; existing assets and source selection are retained.

Run `npm run test:images` for image-policy and fallback regressions. Browser checks used a deterministic wide SVG fixture to validate square frames and contain fitting at 320/390/600/768/840/1024/1280/1440 widths, plus detail-gallery contain fitting and viewer open/close. Native hardware still needs visual testing, including tall products, device font scaling, and real fold/unfold transitions.
