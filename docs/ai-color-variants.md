# AI Color-Variant Preview Pipeline ("Generate Once, Cache Forever")

`royal-furniture-app` ships an offline/batch AI color-variant pipeline powered by OpenAI's **`gpt-image-2.6-sunburst`** image editing model (`POST /v1/images/edits`).

Instead of calling an AI model on every shopper tap, each `(product, fabric, color)` swatch is generated **once**, cached as static `.webp` files + recorded in `harvest/ai-color-variants.json` and `app/data/colorVariantManifest.ts`, and served at **$0 marginal AI cost** across static Web (GitHub Pages), Node production (`npm start`), iOS, and Android.

---

## 1. Inspect Catalog Swatches (No API Key Required)

```bash
# Preview all 527 unphotographed swatch products / 2,955 swatches and estimated one-time spend
# (skips 41 variants that already have studio photos; add --include-existing to include all 569/2,997)
npm run generate:colors -- --dry-run

# Preview a single hero sofa (11 swatches)
npm run generate:colors -- --dry-run --slugs serafina-corner-sofa

# Preview only in-stock Made-to-Order swatches (396 products / 1,872 swatches)
npm run generate:colors -- --dry-run --made-to-order --in-stock-only
```

---

## 2. Generate & Cache Color Variants

Set `OPENAI_API_KEY` only in your local shell or CI environment (never commit it or put it in `EXPO_PUBLIC_*`):

```bash
# Generate all 11 swatches for one hero sofa first (~$0.22 - $0.55 one-time)
OPENAI_API_KEY=sk-... npm run generate:colors -- --slugs serafina-corner-sofa

# Gradually expand to top Made-to-Order sofas in batches of 50
OPENAI_API_KEY=sk-... npm run generate:colors -- --made-to-order --category sofas --in-stock-only --limit 50
```

- **Idempotent forever cache:** Already-generated variants (matching `promptHash` and present on disk) are skipped automatically at `$0`.
- **Safe interruption:** Progress is saved incrementally to `harvest/ai-color-variants.json` after each image.
- **Static local vs. S3 hosting:**
  - By default (`--public-prefix /ai-color-variants`), paths start with `/` and serve directly from `public/ai-color-variants/` (prefixed by `PAGES_BASE_PATH` on GitHub Pages).
  - If you upload generated `.webp` files to `royal-furniture-515966538173-ap-south-1-an.s3.ap-south-1.amazonaws.com/images/ai-variants/`, pass a prefix **without** a leading slash (`--public-prefix images/ai-variants`) so `resolveColorVariantImageUrl()` resolves them against `S3_PRODUCT_IMAGE_BASE` without bloating static bundles.

---

## 3. Running in GitHub Actions (Recommended if You Don't Want to Run Locally)

This repository includes a manual workflow at `.github/workflows/generate-color-variants.yml`:

1. **Ensure the workflow is on your default branch:** GitHub's *Run workflow* button in the **Actions** tab only appears for workflows committed on the repository's default branch (so merge this branch / PR first).
2. **Add your rotated API key as a repository secret:**
   - Open **GitHub → Settings → Secrets and variables → Actions → New repository secret**
   - Name: `OPENAI_API_KEY`
   - Secret: your rotated `sk-...` OpenAI key
3. **Trigger a batch from the Actions tab:**
   - Open **Actions → Generate AI Color Variants → Run workflow**
   - Pick your target branch and fill in inputs (start small, e.g. `slugs: serafina-corner-sofa`, `limit: 11`, or tick `dry_run: true` first to verify cost without spending credits).
   - When the run finishes, the workflow automatically uploads the artifacts and commits `public/ai-color-variants/`, `harvest/ai-color-variants.json`, and `app/data/colorVariantManifest.ts` back to the branch.

*(Tip: Under **Settings → Actions → General → Workflow permissions**, ensure **Read and write permissions** is enabled so `GITHUB_TOKEN` can push the committed renders back to the branch.)*

---

## 4. Refreshing Swatch Data After a Catalog Harvest

Whenever `harvest/product-details.json` is updated, regenerate `app/data/colorSwatches.ts`:

```bash
npm run generate:swatches
```

