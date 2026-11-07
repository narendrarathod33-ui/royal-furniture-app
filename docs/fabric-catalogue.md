# Official fabric and colour catalogue

The storefront fabric selector is generated from the current public Royal Furniture variant tree, not from demo names, historical colour summaries, or `customization_options`.

## Runtime data and images

- `app/data/fabricManifest.json` is the reviewed product → fabric type → colour record. It includes official names/codes, valid hex when published, per-size SKU/stock/pricing and local assets.
- `data/fabric-product-map.json` maps every app product to its official slug and lists unmatched products.
- `app/data/fabricCatalog.ts` is the shared read path for product details, customization and design tooling. `getFabricProduct(id)` returns the same immutable options to every surface.
- `assets/fabrics/` contains full-resolution official type/colour close-ups and small thumbnails. `assets/variants/` contains only official colour-specific photos or approved offline renders.
- `app/data/fabricAssets.ts` is generated with static Metro `require` calls. Do not edit it manually.
- `docs/fabric-qa/` contains the extraction/validation reports, material-versus-hex mismatches, pixel checks and one contact sheet per product with options. The Pages build publishes this directory at `/royal-furniture-app/fabric-qa/contact-sheet-index.html`.

“Current Fabric” always uses the original product photograph. A colour with no genuine variant photo and no reviewed aligned mask remains unchanged and is labelled **Preview unavailable**; its official close-up is the material reference. Generic `Selectable` is never a named colour.

## Refresh without repeating work

Run the stages separately. Rendering/contact sheets do **not** repeat API availability requests.

### 1. Harvest current options and official images

With Actions dispatch permission:

```sh
gh workflow run deploy-pages.yml \
  --ref arena/7580beb8-royal-furniture-app \
  -F harvest_fabrics=true -f harvest_delay=0.25
```

If the sandbox integration cannot dispatch workflows (HTTP 403), use the explicit commit gate on this session branch:

```sh
git commit --allow-empty -m "[harvest-fabrics] Refresh official fabric catalogue"
git push origin arena/7580beb8-royal-furniture-app
```

Only a commit whose message contains `[harvest-fabrics]` starts this job. Ordinary pushes do not contact the API. The job uses `locale: en`, `country: ae`, sequential requests, a 250 ms minimum gap, retries/backoff, raw-response caching and image deduplication. It stops on authentication/access blocks.

Download `official-fabric-catalogue-<run-id>` from the completed run, then validate and install it:

```sh
gh run download <run-id> -n official-fabric-catalogue-<run-id> --dir /tmp/rf-fabric-harvest
python3 -m pip install -r scripts/fabrics/requirements.txt
python3 scripts/fabrics/validate.py --input /tmp/rf-fabric-harvest
python3 scripts/fabrics/install.py /tmp/rf-fabric-harvest
```

Review the mapping, extraction report and source omissions before committing. The installer minifies the app manifest, generates static asset requires, normalizes one unchanged Current Fabric entry, and prunes unreferenced images.

### 2. Render approved masks and generate every contact sheet

Commit the reviewed harvest/install, then use the separate QA gate:

```sh
git commit --allow-empty -m "[fabric-qa] Render and audit official fabrics"
git push origin arena/7580beb8-royal-furniture-app
```

`[fabric-qa]` skips Pages deployment for that staging commit. It repairs collision-free Current Fabric close-up paths from their existing image URLs, downloads/cache originals for contact sheets, renders only reviewed aligned masks, checks every unmasked pixel and protected region, and audits the resulting manifest.

Download and install `fabric-qa-<run-id>`:

```sh
gh run download <run-id> -n fabric-qa-<run-id> --dir /tmp/rf-fabric-qa
python3 scripts/fabrics/validate.py --input /tmp/rf-fabric-qa
python3 scripts/fabrics/install.py /tmp/rf-fabric-qa
```

Review contact sheets and rejected images, then make a normal commit (without either bracketed gate) to deploy the final app and QA links.

### Local equivalent (network permitting)

```sh
python3 scripts/fabrics/extract.py --delay 0.25 --output fabric-output
python3 scripts/fabrics/render.py --input fabric-output --delay 0.15
python3 scripts/fabrics/validate.py --input fabric-output
python3 scripts/fabrics/install.py fabric-output
```

Local raw API responses are cached under `.cache/fabric-harvest/`; existing images are reused. `fabric-output/` and the cache are ignored by Git.

## Rendering and QA rules

1. Prefer an explicit, non-repeated official `variant_image`. Generic gallery images are not colour photography.
2. Otherwise only a reviewed mask/photo pair listed in `scripts/fabrics/render.py` may be recoloured. Output is 1200 px WebP.
3. Swatch median colour, not hex, is the render reference. Real close-up high-frequency detail adds subtle weave; the swatch photograph is not projected onto the product.
4. Protected rectangles are hard-zeroed. QA checks the complete unmasked background, every protected region, CIE76 colour difference and blown highlights. Thresholds are recorded in `quality-report.json`.
5. Failed renders move to `qa-rejected/`; their manifest `variantPath` is cleared and `previewUnavailable` is true. They are never shipped as approved variants.
6. Material/hex mismatches are reported separately. Hex is not silently substituted for the photographed material.
7. Validation rejects generic named colours, invalid hex, duplicate combinations, missing published downloads, missing Current Fabric, and flagged options with a shippable variant.

## Known scope limits

Only Serafina Corner Sofa and Trento Single-Seater Sofa currently have reviewed upholstery masks. No full-catalogue automatic segmentation is attempted. Other colours use genuine variant photography when published or an explicit unavailable-preview state. There is no separate AI Designer module in this checkout; the shared `getFabricProduct` manifest API is the integration point for that surface, and the existing customization flow opens the same product customizer.
