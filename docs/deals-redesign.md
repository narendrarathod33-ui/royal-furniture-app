# Deals and filter redesign

## Scope

Only Deals now renders `components/DealsPage.tsx` from the existing ShopContent branch. Browse and its price-sort list identity remain unchanged. Header Account/Cart callbacks, the shared ProductCard, save/open-product behavior, adaptive navigation and the existing glass, warm-neutral and Royal-red design language are retained.

## Experience

- Responsive offer header with existing local lifestyle photography on larger panes; no invented countdowns or stock claims.
- Search with a visible native caret, outer-bar focus behavior and no inner browser focus rectangle.
- Category shortcuts, a numeric result count, current sort summary and Filter & sort action.
- Removable active-filter chips and Clear all. The permanent over-40% eligibility rule is described, not counted as an optional active filter.
- Full-height compact filter sheet; bounded, centered tablet dialog. Scrollable body, safe-area-aware sheet and always-visible result count/Reset/Show actions.
- Category, minimum-saving, budget and sort radio groups, including both numeric price directions, biggest discount and name.
- Draft choices preview the matching count. Show applies; close/back/backdrop discards unapplied changes. Reset resets the draft; Clear all on the page resets applied filters and search.
- Helpful empty state with an Explore all deals recovery action.

## Data and state

`utils/deals.ts` extracts the previous Deals selection pipeline without changing eligibility, discount fallback, price boundaries, family collapsing or numeric selling-price comparisons. Tests compare it against the old algorithm across 192 combinations. The eligibility is >=41% as before, using catalog `pc` or the existing rounded list-price calculation.

Results now use the existing measured, virtualized AdaptiveProductList instead of an eager wrapped product map. Changing applied filters/sort resets its layout/anchor cache. Search typing does not remount the header input. Draft state stays separate from applied state. No product data, new dependency, checkout behavior or persistent storage was introduced.

## Verification

- `npm run test:deals`: eligibility parity, immutable source data, numeric sort switching, active counts, draft cancel/apply/reset, chip removal, clear all, empty searches and stable input identity.
- Existing suites, TypeScript and the production web export are also checked.
- Browser checks at 320, 390, 768 and 1280px: card and sheet bounds, footer visibility, apply/remove/reset, uninterrupted typing, empty recovery and a 700x360 short-window scroll check. No runtime errors. Remote product/category image delivery was unavailable in the sandbox; local hero imagery loaded and product fallbacks were exercised.
- Follow-up on real devices: keyboard and native screen-reader interaction, safe areas, physical fold postures and touch gestures.
