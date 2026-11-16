# Color & Fabric Variant Pipeline ("Generate Once, Cache Forever")

`royal-furniture-app` ships an offline/batch color-variant pipeline with two engines sharing the same forever-cache ledger (`harvest/ai-color-variants.json`) and manifest (`app/data/colorVariantManifest.ts`), so every shopper browses cached `.webp` previews at **$0 marginal runtime cost** across static Web (GitHub Pages), Node production (`npm start`), iOS, and Android:

1. **`--engine free-lab` ($0 Forever, Default in GitHub Actions):** Uses open-weights **`facebook/mask2former-swin-base-IN21k-ade-semantic`** on CPU to isolate furniture pieces (excluding walls, floors, rugs, tables, and plants), clusters primary upholstery in CIELAB (`L*a*b*`) space to protect contrasting wood/metal legs, dark throw pillows, and patterned bed duvets, refines edges with a Guided Filter, and renders swatch hex colors & fabric weave sheen (`scripts/recolor_color_variants.py`).
2. **`--engine openai` (Optional Paid Tier):** Uses OpenAI **`gpt-image-2.6-sunburst`** (`POST /v1/images/edits`) when `OPENAI_API_KEY` has billing credits.

---

## 1. Inspect Catalog Swatches (No API Key or Python Deps Required)

```bash
# Preview $0 free-lab counts for all 527 unphotographed swatch products / 2,955 swatches
npm run generate:colors:free -- --dry-run

# Preview a single hero sofa (11 swatches)
npm run generate:colors:free -- --dry-run --slugs serafina-corner-sofa

# Preview only in-stock Made-to-Order swatches (396 products / 1,872 swatches)
npm run generate:colors:free -- --dry-run --made-to-order --in-stock-only
```

*(Pass `--include-existing` to include the 41 swatches that already carry studio photos; pass `--engine openai` to preview paid `gpt-image-2.6-sunburst` spend estimates.)*

---

## 2. Generate & Cache Color Variants Locally

### Option 1: `$0` Neural Segmentation + CIELAB (`free-lab`)

```bash
python3 -m venv .venv
.venv/bin/pip install --extra-index-url https://download.pytorch.org/whl/cpu -r scripts/requirements-recolor.txt

# Generate all 11 swatches for one sofa at $0
npm run generate:colors:free -- --slugs serafina-corner-sofa
```

### Option 2: OpenAI `gpt-image-2.6-sunburst` (`openai`, requires funded `OPENAI_API_KEY`)

```bash
OPENAI_API_KEY=sk-... npm run generate:colors -- --slugs serafina-corner-sofa
```

- **Idempotent forever cache:** Already-generated variants (matching `promptHash` and present on disk) are skipped automatically.
- **Static local vs. S3 hosting:**
  - By default (`--public-prefix /ai-color-variants`), paths start with `/` and serve directly from `public/ai-color-variants/` (prefixed by `PAGES_BASE_PATH` on GitHub Pages).
  - If you upload generated `.webp` files to `royal-furniture-515966538173-ap-south-1-an.s3.ap-south-1.amazonaws.com/images/ai-variants/`, pass a prefix **without** a leading slash (`--public-prefix images/ai-variants`) so `resolveColorVariantImageUrl()` resolves them against `S3_PRODUCT_IMAGE_BASE` without bloating static bundles.

---

## 3. Running in GitHub Actions ($0 Default, No API Key Required)

This repository includes `.github/workflows/generate-color-variants.yml` configured with `engine: free-lab` by default:

1. **Ensure workflow write permissions:** Under **Settings → Actions → General → Workflow permissions**, select **Read and write permissions**.
2. **Trigger a batch from the Actions tab:**
   - Open **Actions → Generate AI Color Variants → Run workflow**
   - Keep `engine: free-lab` (**$0**, no secrets required)
   - Fill in inputs (for example `slugs: serafina-corner-sofa`, `limit: 11`, or leave `slugs` blank with `limit: 50` to batch across Made-to-Order items)
   - When the run finishes, the workflow uploads an artifact archive and commits `public/ai-color-variants/`, `harvest/ai-color-variants.json`, and `app/data/colorVariantManifest.ts` back to the branch.

*(If you ever fund `OPENAI_API_KEY` and add it under **Settings → Secrets and variables → Actions**, you can switch the workflow `engine` dropdown to `openai`.)*

---

## 4. Refreshing Swatch Data After a Catalog Harvest

Whenever `harvest/product-details.json` is updated, regenerate `app/data/colorSwatches.ts`:

```bash
npm run generate:swatches
```

