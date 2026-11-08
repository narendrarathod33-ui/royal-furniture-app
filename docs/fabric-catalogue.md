# Official fabric and colour catalogue

The storefront fabric selector is generated from the current public Royal Furniture variant tree, not from demo names, historical colour summaries, or `customization_options`. Live product previews additionally require a verified white-background product image. A lifestyle photograph is never substituted or recoloured.

## Runtime data and images

- `app/data/fabricManifest.json` is the reviewed product → fabric type → colour record. It includes official names/codes, valid hex when published, per-size SKU/stock/pricing, local assets, white-base status and mask confidence.
- `data/fabric-product-map.json` maps every app product to its official slug and lists unmatched products.
- `app/data/fabricCatalog.ts` is the shared read path for product details, customization and design tooling. `getFabricProduct(id)` returns the same immutable options to every surface.
- `assets/base/{productId}.jpg` is the untouched front source selected from the website gallery. Extra accepted views use `{productId}-angle-N.jpg`. JPEG sources retain their exact downloaded bytes; another container format is explicitly reported when converted to the required JPEG hand-off path. Rendering never writes to these files.
- `assets/variants/{productId}/current[-angle-N].webp` contains the derived Current Fabric image: the source product and soft contact shadow over pure white. The original JPEG remains separate.
- `assets/masks/{productId}[-angle-N].png` is the aligned, transparent upholstery-only mask. Contrasting pillows, legs, wood/metal, background and contact shadow are excluded.
- `assets/fabrics/` contains official type/colour close-ups and small thumbnails. `app/data/fabricAssets.ts` is generated with static Metro `require` calls; do not edit it manually.
- `docs/fabric-qa/` contains the extraction/validation reports, the full product/base/mask table, colour-match and pixel checks, and one contact sheet per option product. Pages publishes it at `/royal-furniture-app/fabric-qa/contact-sheet-index.html`.

“Current Fabric” and every named colour use the same accepted white base and angle. Named variants are rendered on-device from the cleaned Current image, its aligned mask and the official close-up’s measured median RGB. This avoids storing and downloading a full-resolution file for every colour × product × angle. The QA renderer independently renders every combination for validation and contact sheets.

A product without an accepted white front image/mask is explicitly flagged. Its customizer contains only official close-ups and swatches—no product image and no live recolour. A colour whose own render fails QA is also close-up-only. Generic `Selectable` is never a named colour.

## PDP and customizer behavior

1. Swatch/type taps update only the draft in **Select colours and fabrics**. The white product preview and official close-up crossfade together.
2. Cancel/Close discards the draft. **Continue** commits and persists the selection, price/SKU metadata and cart identity.
3. After Continue, accepted white front/angle previews are inserted before the existing gallery. Further changes replace those preview slides, not the lifestyle photographs.
4. Every retained lifestyle slide displays **“Lifestyle photos show the original fabric.”** after customization. The original lifestyle gallery and its zoom viewer remain available.
5. With no accepted white front base, no white preview slides are inserted. The PDP keeps its original lifestyle gallery and the customizer remains close-up/swatch-only.

## Refresh without repeating work

Run the stages separately. Rendering/contact sheets do **not** repeat API availability requests.

### 1. Harvest options and inspect every gallery image

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

Only a commit whose message contains `[harvest-fabrics]` starts this job. Ordinary pushes do not contact the API. The job uses `locale: en`, `country: ae`, sequential requests, a 250 ms minimum gap, retries/backoff, raw-response caching and close-up deduplication. It stops on authentication/access blocks.

For **every product with genuine named options**, the harvester inspects the primary and every additional gallery angle. Acceptance requires:

- more than 90% near-white pixels in the outer 2% border;
- one confident main object (minimum confidence 0.80), rather than multiple separated objects;
- successful image decoding and no duplicate angle.

Rejected candidates are measured and reported but not retained as bases. Download `official-fabric-catalogue-<run-id>`, then validate and install it:

```sh
gh run download <run-id> -n official-fabric-catalogue-<run-id> --dir /tmp/rf-fabric-harvest
python3 -m pip install -r scripts/fabrics/requirements.txt
python3 scripts/fabrics/validate.py --input /tmp/rf-fabric-harvest
python3 scripts/fabrics/install.py /tmp/rf-fabric-harvest
```

Review the mapping, extraction report, white-base candidate report and source omissions before committing. The installer preserves original base JPEGs, normalizes one Current Fabric entry, prunes unreferenced runtime images, and shares byte-identical close-ups through canonical paths without dropping official IDs. Original source JPEGs are kept in Git but are not bundled into the app’s runtime asset registry.

### 2. Build masks, render every combination and generate contact sheets

Commit the reviewed harvest/install, then use the separate QA gate:

```sh
git commit --allow-empty -m "[fabric-qa] Render and audit white-base fabrics"
git push origin arena/7580beb8-royal-furniture-app
```

`[fabric-qa]` skips Pages deployment for that staging commit. Its validated generated catalogue is pushed as `[catalogue-staging]`, which also skips deployment so the complete real-data browser suite can run before a normal release commit. `QA_HARVEST_RUN_ID` can bootstrap an explicit new harvest inside Actions when a schema update must replace the installed manifest; `QA_CHECKPOINT_RUN_ID` resumes a rendered checkpoint. Ordinary installed-data QA leaves both blank.

The renderer:

- cuts the product from the white background while retaining its soft contact shadow;
- clusters product colours against the genuine Current close-up to separate upholstery from contrasting pillows and non-upholstery parts;
- assigns a 0–1 mask confidence and requires at least 0.70, adequate coverage and an accepted front view;
- cleans the derived Current base to pure white without modifying the original JPEG;
- renders every named colour for every accepted angle for QA, including optional side/back views;
- rejects failed colours/angles instead of shipping them;
- generates all contact sheets and `base-image-report.md` / `.json`.

The full report table covers every app product, including no-option and unmatched rows. For option products it lists the white base or flagged state, mask confidence, successful QA variant-frame count and attention required. “No white image” and “white image found but mask rejected” are different states.

### 3. Validate and deploy

```sh
python3 scripts/fabrics/validate.py --input fabric-output
python3 scripts/fabrics/install.py fabric-output
python3 scripts/fabrics/verify_encoded.py
```

Validation checks original-JPEG hashes, threshold compliance, required front/mask/base assets, close-ups, stock/price structure and the rule that no flagged product/colour exposes a live preview. `verify_encoded.py` reproduces the masks from the untouched sources, re-renders the dynamic combinations, encodes them in memory, and checks the decoded results. Current bases ship as lossless WebP; generated web frames use lossless PNG so compression cannot introduce off-white pixels or contact-shadow changes. It writes `docs/fabric-qa/encoded-quality-report.json` without adding thousands of redundant app assets.

Make a normal commit without either bracketed gate to deploy the app and QA links.

### Local equivalent (network permitting)

```sh
python3 scripts/fabrics/extract.py --delay 0.25 --output fabric-output
python3 scripts/fabrics/render.py --input fabric-output --delay 0.15
python3 scripts/fabrics/validate.py --input fabric-output
python3 scripts/fabrics/install.py fabric-output
```

Local raw API responses are cached under `.cache/fabric-harvest/`; existing close-ups are reused. `fabric-output/` and the cache are ignored by Git.

## Rendering and QA rules

1. Lifestyle and official colour-specific gallery photos are not used as live-recolour substitutes. Every live named variant uses the accepted white base and aligned upholstery mask.
2. Swatch median RGB, not hex, is the render reference. Real close-up high-frequency detail adds subtle weave; the swatch photograph is not projected onto the product.
3. The complete unmasked image is protected. QA checks CIE76 colour difference, mask leakage, blown highlights, pure-white background, exact contact-shadow preservation and coloured/white edge halos.
4. Failed renders become close-up-only. Failed optional angles are removed; a failed front mask disables live recolour for that product.
5. Material/hex mismatches are reported separately. Hex is not silently substituted for the photographed material.
6. Validation rejects generic named colours, invalid hex, duplicate combinations, missing published downloads, modified original JPEGs and flagged options with a live preview.

## Scope and review limits

Detection and upholstery segmentation are automatic and deliberately conservative. Confidence scores and flagged reasons are published rather than hidden. Contrasting components are excluded by product-colour clusters; unusual same-colour mixed materials or ambiguous geometry can require human mask review. No full-catalogue lifestyle segmentation is attempted, no missing white image is invented, and rejected previews never install. There is no separate AI Designer module in this checkout; the shared `getFabricProduct` manifest API remains the integration point for that surface.
