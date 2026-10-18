# Glass consistency review

## Scope

Reviewed the active Expo routes, shared glass tokens/backdrop, adaptive frame, Home and payment banner, Browse and category explorer, Deals and its filter sheet, customization, product cards/details/size controls/gallery/zoom, saved items and Cart, local checkout/confirmation, sandbox payment panels/return, Account/order/support sections, Search, New in, navigation/rail, splash and not-found route. Kept the existing architecture, layout breakpoints, spacing, brand palette, imagery, callbacks, gestures, filter semantics, and payment/data handling. No new dependency or component abstraction.

## Targeted corrections

- Made Stack content, tab scenes and the adaptive wrapper transparent so they no longer obscure the existing ambient backdrop. Modal frames also no longer place an opaque grey layer behind their own scrims. Fold/segment positioning, workspace bounds and keys are untouched.
- Reused `GLASS.sheet` for the category explorer and Deals filter sheet, and established presets for their search/close/reset/apply/footer controls. Existing dimensions, safe areas, scrolling and dismissal/apply/reset behavior remain unchanged. Browse's selected controls still use the established dark/red state variants; destination/layout hierarchy is unchanged.
- Reused the existing chip/selected/accent presets for customization sorting/reset and chrome-only for its cream editorial hero (preserving the hero's colour).
- Matched sandbox checkout/return panels and CTA to the existing panelStrong/accent treatments; no fetch, redirect or payment logic changes.
- Applied the existing dark glass control treatment to photo-viewer buttons, keeping white icons, the dark stage, disabled state and gestures unchanged. Corrected the selected gallery thumbnail's top border so the luminous bevel no longer overrides the red selection rim.
- Strengthened floating navigation tint and inactive ink for readability over product imagery. A regression test calculates at least 4.5:1 contrast for the normal inactive label ink over the tint's darkest theoretical background, without relying on blur. This is a targeted check, not an app-wide WCAG conformance claim.
- Extended the existing keyboard focus-ring treatment to buttons, tabs, radios and links throughout adaptive workspaces, including modal workspaces; existing scoped search-input focus/caret treatment is preserved. Styled the not-found action with the existing primary treatment and brand ink.

Deliberately did not blur product photographs, add glass to every decorative element, restyle marketing art, change the kids promotion, or alter the supplied non-interactive pay-later banner. Those are intentional opaque image surfaces, not inconsistent glass panels. No Home spacing changes in this review.

## Validation

- `npm run typecheck` — passed.
- `node --test scripts/*.test.mjs` — **98/98 passed** (92 existing plus 6 glass regressions).
- `npm run test:glass` — repeatable token, material composition, route transparency, geometry and navigation contrast checks. Native iOS/Android token branches are included, but this is not device rendering validation.
- `npm run build:web` — passed.
- `git diff --check` — passed.
- Chromium: Home banner bounds/spacing, Deals filtering/search/reset/short-window scrolling, customization eligibility/count/sort/search/product-Back persistence at 320/390/768/1280px. Dedicated glass smoke test at 390/1280px checked computed sheet/control materials, keyboard focus ring, category search/close, product zoom open/close, add-to-bag without forced navigation, populated Cart/sandbox panel, Account, Search, New in, Home and fallback-route return. No runtime page errors.

## Limitations / follow-up

- Real iOS/Android hardware and physical fold/hinge transitions are unavailable here. Existing native tint/border/shadow fallback is retained; web-only backdrop filtering is still omitted on native. Did not add a blur-view refactor across all native surfaces.
- Browser remote product-photo requests are unavailable in the restricted sandbox. Some checks use deterministic placeholder images; local Home artwork loads. Live external photo rendering and varying real-photo contrast should be spot-checked on deployment.
- Stripe is not enabled in the preview; the disabled sandbox panel was verified. Hosted checkout, enabled-payment states and actual payment-return transitions were reviewed in source/test coverage, not executed against Stripe.
- No claim of full accessibility certification, exhaustive browser-engine parity, or performance testing on low-end devices. Existing low-emphasis copy and intentional editorial fills were not globally recoloured or redesigned.
