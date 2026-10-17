# Royal Furniture — master data file

`data/master.json` is **the one file to edit while testing**. It holds everything the
app displays or calculates that a normal test run might want to change: items, prices,
categories, sizes, deals, showrooms, policies, payment options, delivery rules, labels
and copy. Nothing that is pure logic lives here.

- **File:** `data/master.json` (JSON, ~2.9 MB)
- **Products:** 1360 · **Deals:** 346 · **Stores:** 12 · **Categories:** 7
- **Placeholders:** search the file for `REPLACE_ME` — every hit must be replaced.
  Values that already say `REPLACE_ME (…hint…)` include the hint inside the marker.

> Re-running the generator **overwrites** `data/master.json`, so keep hand-edits in
> `master.json` and don't re-run the build after editing, or copy edited values back.

## How to edit it

Open `data/master.json` in any editor, change a value, save, reload the app.

- One line per product/deal, so a diff shows exactly what changed.
- Keys never move position: every product has the same key order and the same types.
- Integers only for money (`3000`, never `"3,000"`, never `3000.00`).
- `enabled: false` hides an item everywhere instead of deleting it — the fastest way to
  test the app with a short catalogue.
- Adding a product: copy any line in `products.items`, give it a fresh `id` and `sku`,
  point `image` at an absolute URL, renumber `count`, and keep `category` /
  `subcategory` values equal to ids that already exist in `categories.items`.
- Section descriptions live **in the file**: `_meta.sectionGuide` says what each section
  controls, `_meta.conventions` the data rules, `_meta.howToEdit` the editing rules,
  `_meta.assumptions` every non-obvious relationship (with the reason), and
  `products._fields` documents all 30-odd product keys.

## What each section controls

| Section | Controls |
| --- | --- |
| `settings` | Brand name/logo/website, locale (language, country, currency, money format), support phone + WhatsApp + email, commerce rules (VAT, free-delivery threshold, stock cap, lead times), image base URL + the colour-variance note, API host/path/headers |
| `featureFlags` | Switches to hide a feature while testing: live API, launch screen, glass surfaces, size dropdown, catalogue-only mode, ratings, stock badges |
| `theme` | Colours (`theme.colors`), the tint behind each category, radii, glass blur strengths/tints/tilt, font stack |
| `launch` | Launch-screen logo, aspect ratio, every timing in ms, skip label |
| `labels` | Short UI words: nav tabs, buttons, field labels, input placeholders, empty/loading states, stock + merchandising badges and their colours, product fact labels |
| `copy` | Sentences and paragraphs: home hero/tiles/trust rows, deals, catalogue, search, new-in, saved, cart, checkout, account, product page, category sheet |
| `categories` | The 6 website categories + `amazing-deal`: names (EN/AR), tint colour, tile art, subcategories, and a `productCount` that must match `products` |
| `leaves` | The subcategory tiles (35) and which category each belongs to |
| `filters` | Discount bands, price bands and sort options offered on listing screens |
| `policies` | Delivery promise, damage/returns rules and the per-category warranty wording (`warrantyFor()`) |
| `payments` | Card, cash on delivery, Tabby and Tamara terms + the "pay 20% upfront" flexi wording |
| `checkout` | Fulfilment options (home delivery 7 days, click & collect 5 days), form requirements, order confirmation text, the 4 order statuses |
| `stores` | 12 showrooms: city, address, hours, phone, click & collect |
| `orders` | 2 sample orders (test data) |
| `accounts` | 1 sample account (test data) |
| `products` | The catalogue — prices, discounts, images, sizes, colours, specs, delivery per item |
| `deals` | The deals tab — its own list and its own prices |

## How the app should read it

`app/data/master.ts` is the typed accessor already in the repo:

```ts
import { products, productById, money, text, warrantyFor } from './data/master';

const item = productById('7072-serafina-corner-sofa');
item?.sizes;              // [{ label: '4-Seater', price: 3000, listPrice: 4000 }]
money(item!.price);       // 'AED 3,000'
text('labels.nav.shop');  // 'Deals'
warrantyFor('sofas');     // 'Sofa warranty: 5 years on frame and springs'
```

JSON imports already work in this project (`expo/tsconfig.base.json` turns on
`resolveJsonModule`), so no config change is needed.

Suggested order of work, one screen at a time, checking the app after each step:

1. `app/(tabs)/index.tsx` — `COLORS` ← `theme.colors`, `categoryColors` ←
   `theme.categoryColors`, `homeHeroSlides` / `homeDealTiles` ← `copy.home`,
   `homeCategoryImages` ← `categories[].tileAsset`, `BottomNav` ← `labels.nav`,
   `money()` and `warrantyFor()` ← `settings.locale` / `policies.warranty`.
2. Product cards and filters ← `products.items` (respect `enabled`).
3. `app/ProductDetails.tsx` ← `products.items` for price/specs, `payments`,
   `policies`, `labels.productFacts`.
4. Cart/checkout/account ← `checkout`, `payments`, `stores`, `orders`, `accounts`.

Two caveats when you swap a screen over:

- Importing `data/master.json` pulls the whole {2.9 MB} into the web bundle. It is fine
  for testing; for production, split `products`/`deals` into their own file and import
  them lazily.
- With `featureFlags.useLiveProductApi: true` the product page still prefers live API
  values over the file, exactly as it does today.

## Rebuilding the file (only if the source data changed)

```bash
node data/tools/build-master.mjs     # rewrites data/master.json
```

The generator (`data/tools/build-master.mjs`, no dependencies) merges the code-side data
modules (`app/data/*.ts`) with the committed harvest artifacts (`harvest/*.json`) and
prints a coverage summary. It is a build tool, not a source of truth: **your edits to
`master.json` are the truth from now on.** The `_meta` block inside the file documents
the data conventions and every assumption the generator made.
