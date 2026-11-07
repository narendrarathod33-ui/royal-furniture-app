# Fabric selector

The product detail page supports an optional structured `fabrics` array. Products without named, verified options keep their original UI, photograph, pricing, and cart behaviour.

## Current catalogue data

Names, colour codes, hex values, and stock states were checked against Royal Furniture's live product-detail APIs on **7 November 2026**:

- [Serafina Corner Sofa](https://rylqus.ae/api/products/product-detail/serafina-corner-sofa/) — five verified options and an aligned 1080×1080 upholstery mask.
- [Trento Single Seater Sofa](https://rylqus.ae/api/products/product-detail/trento-single-seater-sofa/) — four available options, one currently unavailable option, and an aligned 1080×1080 upholstery mask.
- [The Rainbow Bed](https://rylqus.ae/api/products/product-detail/the-rainbow-bed/) — the current API exposes only the generic `Selectable` placeholder and explicitly reports `customization_options.fabrics: []`, `total_fabric_options: 0`, and `total_color_options: 0`. It therefore has **no colour selector** and keeps its original photograph. Do not turn that placeholder or a stale harvest into invented swatches.

The API reuses the same gallery for these colour variants (`variant_image` is null); it does not supply genuine per-colour photographs. No colour-specific price delta was established, so the real product entries have no surcharge. Size pricing, fabric-aware cart/order behaviour, and server validation remain intact. Non-zero deltas are exercised only by explicitly labelled test fixtures.

## Add or edit fabrics

First verify the option in the current official API. Use `fabric_color_info.color_name`, `color_hex`, and `stock_status`; omit generic values such as `Selectable`. Then edit the product in `app/data/catalogData.ts`:

```ts
"maskImage": "my-sofa-mask.png", // Required unless every option has a real variant photo.
"fabrics": [
  {
    "id": "feather-black-1941-9",
    "name": "BLACK /1941-9",
    "hex": "#101215",
    "inStock": true
  }
]
```

- `id` must be stable and unique within the product. It forms part of the cart line identity. Prefixing it with the official fabric family avoids collisions between families.
- Preserve the official colour name/code in `name`; it is shown in the PDP, cart, wishlist metadata, orders, and enquiry text.
- `priceDelta` is optional and defaults to zero. Add one only when official pricing establishes that delta. Negative deltas are supported by the shared helper.
- The first `inStock` fabric is selected by default. Unavailable fabrics render with a cross, disabled semantics, and translated “Not available” text; they cannot be selected.
- New customer-facing UI strings belong in `app/i18n.ts` with English and Arabic values. Fabric names themselves are catalogue data.
- Do not add an empty `fabrics` array merely to enable the section; omit it for products without named structured options.
- Optional `textureImage` and genuine `variantImage` fields are supported. A real variant photograph has the highest rendering priority.

### Local images

Metro/Android local assets must be statically registered. Copy the file into `assets/images/fabric-masks/` (or another appropriate asset folder), then add its catalogue key to `fabricImageAssets` in `app/data/fabrics.ts`:

```ts
const fabricImageAssets = {
  'my-sofa-mask.png': require('../../assets/images/fabric-masks/my-sofa-mask.png'),
  'boucle.png': require('../../assets/images/fabric-textures/boucle.png'),
  'sofa-boucle.jpg': require('../../assets/images/fabric-variants/sofa-boucle.jpg'),
};
```

Remote `https:`, `data:`, `blob:`, and native `file:` URLs do not need registry entries. A remote web image must permit CORS canvas reads; otherwise the preview retains its live masked-layer renderer.

The primary Serafina photo is bundled as `assets/images/catalog-live/serafina-corner-sofa.webp` and registered in `app/data/liveCatalogImages.ts`, ensuring it exactly matches its mask even when remote images are unavailable.

## Create an upholstery mask

1. Start from the **exact primary PDP photo**, not a cropped listing thumbnail or a different gallery angle.
2. Export a transparent PNG at the **same pixel dimensions and aspect ratio** as that photo. Serafina and Trento sources/masks are 1080×1080.
3. Fill only recolourable upholstery with white. Keep every other pixel transparent: legs/base rails, wood, flooring, walls, bedding, loose cushions that should not change, foreground plants, and props.
4. Preserve antialiased edges. Do not include shadows cast onto the room. Folds and highlights should remain in the base photograph, not be painted into the mask.
5. Register the mask as above and set the product's `maskImage` to its registry key.
6. Check every enabled swatch at 360 px and desktop, especially arm edges, piping, front rails, feet, and gaps between cushions. A mask that is even a few pixels misaligned needs correction.
7. Compare the top, sides, and floor against the original photo. The Playwright fabric suite performs this check numerically and attaches a screenshot for every enabled official option.

`FabricPreview` uses `variantImage` first, then an aligned `maskImage`. If neither exists, it keeps the original photograph and emits a development warning. **There is no whole-frame tint/filter fallback.**

## Rendering and platform differences

- **Both platforms:** fabric selection is local React state, so the swatch, accessible name, price, and cart payload update immediately. A 180 ms opacity crossfade covers the visual transition. Optional texture is clipped to the same mask.
- **Web:** the primary photo and mask are pre-rendered on canvas for every available fabric (capped at 1200 px wide). Results use a bounded 40-entry cache. Canvas colour blending retains photograph luminance; a shared multiply-depth pass keeps dark fabrics close to their advertised colour. While a result is loading—or if CORS prevents canvas export—the same masked layers use CSS/native-web blend modes. Variant images are prefetched.
- **iOS / Android:** there is no canvas pre-render. React Native composites the base image with tinted transparent masks using `color` and `multiply` blend modes, avoiding data-URI memory spikes. Texture uses an SVG alpha mask.
- **Android API 29+:** native view blend modes are available. Older Android versions use a restrained **masked** tint because blend support is inconsistent; it is still clipped to upholstery and never covers the room. Swatches, prices, accessibility, cart, and orders still work. A physical Android device was not part of the web acceptance run.

Only the primary gallery image is fabric-aware. Other angles and the original zoom photo remain unchanged until matching masks/variant photography are supplied.

## Cart, wishlist, orders, and payments

- The persisted cart line id is `product/size id + encoded fabric id`; quantity actions use that line id, so two fabrics never merge.
- A small serialisable `{ id, name, hex, priceDelta }` snapshot travels with cart products. Wishlist ids remain backward-compatible, with snapshots stored separately in `savedFabrics` under the existing `rf-cart-v1` key.
- Reopening a saved product removes the restored delta before size pricing and reapplies the active delta once.
- Cart lines show the fabric name/swatch. Order history, order-request JSON, enquiry text, and WhatsApp include fabric conditionally, leaving fabricless formatting unchanged.
- The optional Stripe sandbox accepts `fabricId`, looks up availability and any verified surcharge from server catalogue data, and prices different fabrics as separate lines. It never trusts a browser-submitted price.

## Validation and limitations

- Focused browser coverage: `npx playwright test e2e/fabrics.spec.ts`.
- Unit and payment coverage: `npx jest __tests__/fabrics.test.tsx --runInBand` and `npm run test:payments`.
- Generated masks are angle-specific and do not recolour the remaining gallery or zoom photos.
- Web acceptance is automated in Chromium, including background-region comparisons and warm-cache timing. Native rendering paths are implemented and type-checked, but still require device visual/performance validation before a production native release.
