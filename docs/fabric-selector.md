# Fabric selector

The product detail page supports an optional structured `fabrics` array. Products without that array keep their original UI, image, pricing, and cart behaviour.

## Demo data

Five clearly marked demo fabrics are seeded on:

- `7072-serafina-corner-sofa` — swatches plus the no-mask tint fallback.
- `6219-trento-single-seater-sofa` — aligned upholstery mask.
- `6880-the-rainbow-bed` — aligned upholstery mask.

Charcoal, Beige, Navy, Olive, and Rust are prototype options, not approved live inventory. Rust is deliberately unavailable to demonstrate the disabled state. Demo surcharges are applied to the selected size's current/list prices and are validated again by the sandbox payment server.

## Add or edit fabrics

Edit the product in `app/data/catalogData.ts`:

```ts
"maskImage": "my-sofa-mask.png", // Omit only when using variant photos/fallback.
"fabrics": [
  { "id": "navy", "name": "Navy", "hex": "#263B5A", "inStock": true, "priceDelta": 250 },
  { "id": "linen", "name": "Linen", "hex": "#C8B8A6", "inStock": true },
  {
    "id": "studio-boucle",
    "name": "Studio Boucle",
    "hex": "#687055",
    "textureImage": "boucle.png",       // Optional repeating texture.
    "variantImage": "sofa-boucle.jpg", // Optional; highest-priority preview.
    "inStock": true,
    "priceDelta": 400
  },
  { "id": "rust", "name": "Rust", "hex": "#A5533C", "inStock": false, "priceDelta": 0 }
]
```

- `id` must be stable and unique within the product. It forms part of the cart line identity.
- `priceDelta` is optional and defaults to zero; negative deltas are supported by the shared price helper.
- The first `inStock` fabric is selected by default. Unavailable fabrics render with a cross, disabled semantics, and translated “Not available” text; they cannot be selected.
- New customer-facing UI strings belong in `app/i18n.ts` with English and Arabic values. Fabric names themselves are catalog/inventory data.
- Do not add an empty `fabrics` array merely to enable the section; omit it for products without structured options.

### Local images

Metro/Android local assets must be statically registered. Copy the file into `assets/images/fabric-masks/` (or another appropriate asset folder), then add its catalog key to `fabricImageAssets` in `app/data/fabrics.ts`:

```ts
const fabricImageAssets = {
  'my-sofa-mask.png': require('../../assets/images/fabric-masks/my-sofa-mask.png'),
  'boucle.png': require('../../assets/images/fabric-textures/boucle.png'),
  'sofa-boucle.jpg': require('../../assets/images/fabric-variants/sofa-boucle.jpg'),
};
```

Remote `https:`, `data:`, `blob:`, and native `file:` URLs do not need registry entries. A remote web image must permit CORS canvas reads; otherwise the preview retains its live CSS-mask fallback.

## Create an upholstery mask

1. Start from the **exact primary PDP photo**, not a cropped listing thumbnail or a different gallery angle.
2. Export a transparent PNG at the **same pixel dimensions and aspect ratio** as that photo. Existing Trento/Rainbow sources and masks are 1080×1080.
3. Fill only recolourable upholstery with white. Keep every other pixel transparent: legs, wood, flooring, walls, bedding, cushions that should not change, and props.
4. Preserve antialiased edges. Do not include shadows cast onto the room. Folds and highlights should remain in the base photograph, not be painted into the mask.
5. Register the mask as above and set the product's `maskImage` to its registry key.
6. Check every swatch at 360 px and desktop, especially arm edges, piping, front rails, and gaps between cushions. A mask that is even a few pixels misaligned needs correction.

`FabricPreview` uses `variantImage` first, then the aligned `maskImage`, then a subtle whole-image tint with a product-specific development warning. It never applies whole-image hue rotation or a flat upholstery-colour rectangle.

## Rendering and platform differences

- **Both platforms:** fabric selection is local React state, so the swatch, accessible name, price, and cart payload update immediately. A 180 ms opacity crossfade covers the visual transition. Optional texture is clipped to the same mask.
- **Web:** the primary photo and mask are pre-rendered on canvas for every available fabric (capped at 1200 px wide). Results use a bounded 40-entry cache. Canvas colour blending retains photograph luminance; a shared multiply-depth pass keeps dark fabrics from looking washed out. While a result is loading—or if CORS prevents canvas export—the same masked layers use CSS/native-web blend modes. Variant images are prefetched.
- **iOS / Android:** there is no canvas pre-render. React Native composits the base image with tinted transparent masks using `color` and `multiply` blend modes, avoiding data-URI memory spikes. Texture uses an SVG alpha mask.
- **Android API 29+:** native view blend modes are available. Older Android versions use the restrained tint fallback because blend support is inconsistent; swatches, prices, accessibility, cart, and orders still work. A physical Android device was not part of the web acceptance run.

Only the primary gallery image is fabric-aware. Other angles and the original zoom photo remain unchanged until matching masks/variant photography are supplied.

## Cart, wishlist, and orders

- The persisted cart line id is `product/size id + encoded fabric id`; quantity actions use that line id, so two fabrics never merge.
- A small serialisable `{ id, name, hex, priceDelta }` snapshot travels with cart products. Wishlist ids remain backward-compatible, with snapshots stored separately in `savedFabrics` under the existing `rf-cart-v1` key.
- Reopening a saved product removes the restored delta before size pricing and reapplies the active delta once.
- Cart lines show the fabric name/swatch. Order history, order-request JSON, enquiry text, and WhatsApp include fabric conditionally, leaving fabricless formatting unchanged.
- The optional Stripe sandbox accepts `fabricId`, looks up availability and surcharge from server catalog data, and prices different fabrics as separate lines. It never trusts a browser-submitted price.

## Current limitations

- Serafina intentionally demonstrates the no-mask fallback; its tint is less realistic than Trento/Rainbow. Add an aligned mask or real variant photos before using those options as production photography.
- Rainbow's hand-authored mask leaves a narrow original-pink trim area near the front rail. This avoids bleeding colour into the adjacent blanket/bedding; refine it with a production mask if that trim should also change.
- Generated masks are angle-specific and do not recolour the remaining gallery or zoom photos.
- Demo stock and surcharges are local fixtures. A production catalog/API should supply approved fabric inventory, photography, and pricing.
- Web acceptance was automated in Chromium. Native rendering paths are implemented and type-checked, but still require device visual/performance validation before a production native release.
