#!/usr/bin/env node
/**
 * Option 2 ("Generate Once, Cache Forever"):
 * Pre-generates photorealistic color & fabric product photos using OpenAI
 * `gpt-image-2.6-sunburst` via POST https://api.openai.com/v1/images/edits,
 * caches every output locally (or under your S3 path prefix), and emits
 * `app/data/colorVariantManifest.ts` so every shopper browses cached variants
 * at $0 marginal AI cost.
 *
 * Security:
 *   Reads OPENAI_API_KEY strictly from `process.env.OPENAI_API_KEY` (never from
 *   client code or EXPO_PUBLIC_*).
 *
 * Usage:
 *   node scripts/generate-color-variants.mjs --dry-run
 *   node scripts/generate-color-variants.mjs --dry-run --slugs serafina-corner-sofa
 *   OPENAI_API_KEY=... node scripts/generate-color-variants.mjs --slugs serafina-corner-sofa --limit 11
 *   OPENAI_API_KEY=... node scripts/generate-color-variants.mjs --made-to-order --in-stock-only --limit 50
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const S3_PRODUCT_IMAGE_BASE =
  'https://royal-furniture-515966538173-ap-south-1-an.s3.ap-south-1.amazonaws.com/';
export const DEFAULT_MODEL = 'gpt-image-2.6-sunburst';
export const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/images/edits';

const SLASH_CODE = /\s*\/\s*([0-9]{3,5}(?:\s*[A-Z]?-?\d+)?)\s*$/i;
const MADE_TO_ORDER_RE = /\bmade[\s-]+to[\s-]+order\b/i;

function titleCaseSegment(segment) {
  return segment.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

export function isSelectablePlaceholder(name) {
  const clean = String(name || '').trim();
  return !clean || /^selectable$/i.test(clean);
}

export function normalizeHex(hex) {
  const clean = String(hex || '').trim();
  return /^#[0-9a-f]{6}$/i.test(clean) ? clean.toUpperCase() : undefined;
}

export function parseSwatchName(rawName) {
  const fullName = String(rawName || '').trim();
  const codeMatch = fullName.match(SLASH_CODE);
  const code = codeMatch ? codeMatch[1].replace(/\s+/g, ' ').trim().toUpperCase() : undefined;
  const base = codeMatch ? fullName.slice(0, codeMatch.index).trim() : fullName;
  const parts = base
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(titleCaseSegment);
  const displayName = parts.length ? parts.join(' / ') : titleCaseSegment(fullName);
  return { displayName, code, fullName };
}

export function formatFabricLabel(fabric) {
  const clean = String(fabric || '').trim();
  if (!clean) return '';
  if (/^[A-Z0-9\s-]+$/.test(clean)) return titleCaseSegment(clean);
  return clean;
}

function slugPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function variantCacheKey(colorName, fabric) {
  const colorSlug = slugPart(colorName) || 'default';
  const cleanFabric = String(fabric || '').trim();
  if (!cleanFabric || cleanFabric.toLowerCase() === 'fabric') return colorSlug;
  return `${slugPart(cleanFabric)}--${colorSlug}`;
}

export function buildColorEditPrompt({ productName, colorName, hex, fabric, category }) {
  const parsed = parseSwatchName(colorName);
  const cleanHex = normalizeHex(hex);
  const fabricText =
    fabric && fabric.toLowerCase() !== 'fabric'
      ? formatFabricLabel(fabric).toLowerCase()
      : 'upholstery fabric';
  const colorDesc = cleanHex
    ? `${parsed.displayName} (exact color swatch ${cleanHex})`
    : parsed.displayName;
  const piece = String(productName || '').trim() || 'furniture piece';
  const categoryHint = category ? ` (${String(category).replace(/-/g, ' ')})` : '';

  return [
    `Edit this studio catalog photograph of the "${piece}"${categoryHint}.`,
    `Change ONLY the main upholstered fabric / finish color and surface weave texture of the furniture piece to ${colorDesc} in ${fabricText}.`,
    `Render natural tactile ${fabricText} weave, realistic fold shading, highlights, and soft shadows matching the original studio lighting.`,
    `Keep the exact furniture silhouette, dimensions, cushion count, stitching seams, legs, throw pillows if un-upholstered trim, decorative props, floor, wall, and background completely unchanged.`,
    `No text, no watermarks, no extra objects, photorealistic e-commerce studio quality.`,
  ].join(' ');
}

function inferFabricFromSku(sku, fabrics) {
  const lowerSku = String(sku || '').toLowerCase();
  if (!lowerSku) return undefined;
  for (const raw of fabrics || []) {
    const clean = String(raw || '').trim();
    if (!clean || clean.toLowerCase() === 'fabric') continue;
    if (lowerSku.includes(`-${clean.toLowerCase().replace(/\s+/g, '-')}-`)) return clean;
  }
  return undefined;
}

export function computePromptHash({ model, quality, size, sourceImage, prompt }) {
  return createHash('sha256')
    .update(`${model}|${quality}|${size}|${sourceImage}|${prompt}`)
    .digest('hex')
    .slice(0, 16);
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const opts = {
    dryRun: false,
    rebuildManifestOnly: false,
    force: false,
    includeExisting: false,
    madeToOrder: false,
    inStockOnly: false,
    crossFabrics: false,
    slugs: [],
    category: '',
    limit: Infinity,
    concurrency: 2,
    model: env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL,
    size: '1024x1024',
    quality: 'medium',
    outputFormat: 'webp',
    inputFidelity: 'high',
    outDir: 'public/ai-color-variants',
    publicPrefix: '/ai-color-variants',
    sourceDir: '',
    help: false,
  };

  const nextVal = (i, flag) => {
    if (i + 1 >= argv.length) throw new Error(`Missing value for ${flag}`);
    return argv[i + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--rebuild-manifest-only') opts.rebuildManifestOnly = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--include-existing') opts.includeExisting = true;
    else if (arg === '--made-to-order') opts.madeToOrder = true;
    else if (arg === '--in-stock-only') opts.inStockOnly = true;
    else if (arg === '--cross-fabrics') opts.crossFabrics = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--slugs') {
      opts.slugs = nextVal(i++, arg).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--category') {
      opts.category = nextVal(i++, arg).trim().toLowerCase();
    } else if (arg === '--limit') {
      const n = Number(nextVal(i++, arg));
      if (!Number.isInteger(n) || n < 1) throw new Error('--limit must be a positive integer');
      opts.limit = n;
    } else if (arg === '--concurrency') {
      const n = Number(nextVal(i++, arg));
      if (!Number.isInteger(n) || n < 1 || n > 6) throw new Error('--concurrency must be 1..6');
      opts.concurrency = n;
    } else if (arg === '--model') opts.model = nextVal(i++, arg).trim();
    else if (arg === '--size') opts.size = nextVal(i++, arg).trim();
    else if (arg === '--quality') opts.quality = nextVal(i++, arg).trim();
    else if (arg === '--output-format') opts.outputFormat = nextVal(i++, arg).trim().toLowerCase();
    else if (arg === '--input-fidelity') opts.inputFidelity = nextVal(i++, arg).trim().toLowerCase();
    else if (arg === '--out-dir') opts.outDir = nextVal(i++, arg).trim();
    else if (arg === '--public-prefix') opts.publicPrefix = nextVal(i++, arg).trim();
    else if (arg === '--source-dir') opts.sourceDir = nextVal(i++, arg).trim();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!['webp', 'png', 'jpeg'].includes(opts.outputFormat)) {
    throw new Error('--output-format must be webp, png, or jpeg');
  }
  if (!['low', 'medium', 'high', 'auto'].includes(opts.quality)) {
    throw new Error('--quality must be low, medium, high, or auto');
  }
  if (!['high', 'low', 'none'].includes(opts.inputFidelity)) {
    throw new Error('--input-fidelity must be high, low, or none');
  }
  return opts;
}

export function buildCatalogLookup(catalogSource) {
  const bySlug = new Map();
  if (!catalogSource) return bySlug;
  const start = catalogSource.indexOf('[');
  const end = catalogSource.lastIndexOf(']');
  if (start < 0 || end <= start) return bySlug;
  const items = JSON.parse(catalogSource.slice(start, end + 1));
  for (const item of items) {
    const slug = String(item.id || '').replace(/^\d+-/, '');
    const madeToOrder =
      MADE_TO_ORDER_RE.test(item.d || '') ||
      (Array.isArray(item.lb) && item.lb.some((l) => /^made[\s-]+to[\s-]+order$/i.test(String(l).trim())));
    bySlug.set(slug, { ...item, slug, madeToOrder });
  }
  return bySlug;
}

export function selectVariantJobs({ harvest, catalogBySlug = new Map(), opts }) {
  const details = harvest?.details || {};
  const slugFilter = opts.slugs?.length ? new Set(opts.slugs) : null;
  const jobs = [];
  const prefix = opts.publicPrefix.replace(/\/+$/, '');

  for (const slug of Object.keys(details).sort()) {
    if (slugFilter && !slugFilter.has(slug)) continue;
    const det = details[slug];
    if (!det || typeof det !== 'object' || det.error) continue;

    const pi = det.pi || {};
    const catSlug = String(pi.category?.slug || catalogBySlug.get(slug)?.c || '').toLowerCase();
    if (opts.category && catSlug !== opts.category) continue;

    const catalogEntry = catalogBySlug.get(slug);
    const isMadeToOrder =
      catalogEntry?.madeToOrder ||
      pi.is_customizable === true ||
      MADE_TO_ORDER_RE.test(det.info || '');
    if (opts.madeToOrder && !isMadeToOrder) continue;

    const sourceImage =
      (Array.isArray(det.images) && det.images[0]) ||
      pi.thumbnail_image ||
      catalogEntry?.remoteImage ||
      '';
    if (!sourceImage) continue;

    const fabrics = Array.isArray(det.fabrics) ? det.fabrics : [];
    const namedFabrics = [...new Set(fabrics.map((f) => String(f || '').trim()).filter((f) => f && f.toLowerCase() !== 'fabric'))];
    const rawColors = Array.isArray(det.colors) ? det.colors : [];
    const realColors = rawColors.filter((c) => !isSelectablePlaceholder(c?.n));
    if (!realColors.length) continue;

    const seenKeys = new Set();
    const expandCandidates = [];

    for (const color of realColors) {
      if (opts.inStockOnly && color.stock === 'out_of_stock') continue;
      if (!opts.includeExisting && !opts.force && color.img) continue;
      const colorName = String(color.n || '').trim();
      const hex = normalizeHex(color.hex);
      const skuFabric = inferFabricFromSku(color.sku, fabrics);
      const targetFabrics =
        opts.crossFabrics && namedFabrics.length
          ? namedFabrics
          : [skuFabric || (namedFabrics.length === 1 ? namedFabrics[0] : undefined)];

      for (const fabric of targetFabrics) {
        const key = variantCacheKey(colorName, fabric);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        expandCandidates.push({
          colorName,
          hex,
          fabric,
          sku: color.sku || undefined,
          stock: color.stock || undefined,
          variantKey: key,
        });
      }
    }

    const productName = pi.name || catalogEntry?.n || slug;
    for (const cand of expandCandidates) {
      const prompt = buildColorEditPrompt({
        productName,
        colorName: cand.colorName,
        hex: cand.hex,
        fabric: cand.fabric,
        category: catSlug,
      });
      const promptHash = computePromptHash({
        model: opts.model,
        quality: opts.quality,
        size: opts.size,
        sourceImage,
        prompt,
      });
      const relFile = `${slug}/${cand.variantKey}.${opts.outputFormat}`;
      const imageUrl = prefix ? `${prefix}/${relFile}` : relFile;
      jobs.push({
        slug,
        productName,
        category: catSlug,
        sourceImage,
        ...cand,
        prompt,
        promptHash,
        relFile,
        imageUrl,
      });
    }
  }
  return jobs;
}

async function writeAtomic(targetPath, data) {
  await mkdir(dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmpPath, data);
  await rename(tmpPath, targetPath);
}

function mimeTypeForPath(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export async function loadSourceImage({
  sourceImage,
  sourceDir,
  cacheDir,
  fetchImpl = fetch,
}) {
  const clean = String(sourceImage || '').trim();
  const isHttp = /^https?:\/\//i.test(clean);
  if (sourceDir && !isHttp) {
    const localPath = resolve(sourceDir, clean.replace(/^\/+/, ''));
    if (existsSync(localPath)) {
      return { buffer: await readFile(localPath), filename: clean.split('/').pop() || 'source.jpg', mimeType: mimeTypeForPath(localPath) };
    }
  }
  const url = isHttp ? clean : `${S3_PRODUCT_IMAGE_BASE}${clean.replace(/^\/+/, '')}`;
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  const ext = extname(new URL(url).pathname) || '.jpg';
  const cachedPath = resolve(cacheDir, `${hash}${ext}`);
  if (existsSync(cachedPath)) {
    return {
      buffer: await readFile(cachedPath),
      filename: new URL(url).pathname.split('/').pop() || `source${ext}`,
      mimeType: mimeTypeForPath(cachedPath),
    };
  }
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch source image (${response.status}): ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeAtomic(cachedPath, buffer);
  return {
    buffer,
    filename: new URL(url).pathname.split('/').pop() || `source${ext}`,
    mimeType: mimeTypeForPath(cachedPath),
  };
}

export async function editImageWithOpenAI({
  apiKey,
  endpoint = DEFAULT_ENDPOINT,
  model = DEFAULT_MODEL,
  sourceBuffer,
  sourceFilename = 'product.jpg',
  sourceMimeType = 'image/jpeg',
  prompt,
  size = '1024x1024',
  quality = 'medium',
  outputFormat = 'webp',
  inputFidelity = 'high',
  fetchImpl = fetch,
  maxRetries = 4,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  let attempt = 0;
  while (true) {
    attempt++;
    const form = new FormData();
    form.set('model', model);
    form.set('prompt', prompt);
    form.set('size', size);
    form.set('quality', quality);
    form.set('output_format', outputFormat);
    if (inputFidelity && inputFidelity !== 'none') {
      form.set('input_fidelity', inputFidelity);
    }
    form.append('image', new Blob([sourceBuffer], { type: sourceMimeType }), sourceFilename);

    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (response.ok) {
      const payload = await response.json();
      const first = payload?.data?.[0];
      if (first?.b64_json) {
        return {
          buffer: Buffer.from(first.b64_json, 'base64'),
          usage: payload.usage || null,
        };
      }
      if (first?.url) {
        const dl = await fetchImpl(first.url);
        if (!dl.ok) throw new Error(`Failed to download generated image URL: HTTP ${dl.status}`);
        return {
          buffer: Buffer.from(await dl.arrayBuffer()),
          usage: payload.usage || null,
        };
      }
      throw new Error('OpenAI image edit response contained neither data[0].b64_json nor data[0].url');
    }

    const errText = await response.text().catch(() => '');
    const retryable = [429, 500, 502, 503, 504].includes(response.status);
    if (!retryable || attempt > maxRetries) {
      throw new Error(`OpenAI /v1/images/edits failed (${response.status}): ${errText.slice(0, 400)}`);
    }
    const retryAfterSec = Number(response.headers?.get?.('retry-after'));
    const delayMs =
      Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? retryAfterSec * 1000
        : Math.min(30000, 1000 * 2 ** (attempt - 1));
    await sleep(delayMs);
  }
}

export function renderManifestTs(ledger) {
  const variants = ledger?.variants || {};
  const manifest = {};
  for (const slug of Object.keys(variants).sort()) {
    const entries = variants[slug];
    if (!entries || typeof entries !== 'object') continue;
    const sortedEntries = {};
    for (const key of Object.keys(entries).sort()) {
      const item = entries[key];
      if (!item?.image) continue;
      sortedEntries[key] = {
        image: item.image,
        colorName: item.colorName,
        ...(item.hex ? { hex: item.hex } : {}),
        ...(item.fabric ? { fabric: item.fabric } : {}),
        ...(item.model ? { model: item.model } : {}),
        ...(item.promptHash ? { promptHash: item.promptHash } : {}),
      };
    }
    if (Object.keys(sortedEntries).length) manifest[slug] = sortedEntries;
  }

  return `/**
 * Forever-cache manifest of AI-edited color & fabric variant images generated via
 * OpenAI \`gpt-image-2.6-sunburst\` (\`npm run generate:colors\`).
 *
 * Each entry maps \`slug -> variantCacheKey -> CachedColorVariant\`.
 * Generated by \`scripts/generate-color-variants.mjs\` — do not hand-edit.
 */
import type { CachedColorVariant } from '../../utils/colorVariants';
import { slugFromProductId } from './officialSizes';

export const COLOR_VARIANT_MANIFEST: Readonly<
  Record<string, Readonly<Record<string, CachedColorVariant>>>
> = ${JSON.stringify(manifest, null, 2)};

export function getManifestVariants(
  productId: string,
): Readonly<Record<string, CachedColorVariant>> | undefined {
  const slug = slugFromProductId(productId);
  return COLOR_VARIANT_MANIFEST[slug] || COLOR_VARIANT_MANIFEST[slug.replace(/-[0-9a-f]{6}$/, '')];
}
`;
}

export async function isVariantCached({ ledger, job, outDir, force }) {
  if (force) return false;
  const existing = ledger?.variants?.[job.slug]?.[job.variantKey];
  if (!existing || existing.promptHash !== job.promptHash) return false;
  const diskPath = resolve(outDir, job.relFile);
  try {
    const info = await stat(diskPath);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

export async function runBatchGeneration({
  root = resolve(import.meta.dirname, '..'),
  opts,
  apiKey,
  fetchImpl = fetch,
  logger = console,
}) {
  const harvestPath = resolve(root, 'harvest/product-details.json');
  const catalogPath = resolve(root, 'app/data/catalogData.ts');
  const ledgerPath = resolve(root, 'harvest/ai-color-variants.json');
  const manifestTsPath = resolve(root, 'app/data/colorVariantManifest.ts');
  const outDir = resolve(root, opts.outDir);
  const cacheDir = resolve(root, '.cache/color-variant-sources');

  let ledger = { version: 1, model: opts.model, variants: {} };
  if (existsSync(ledgerPath)) {
    ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.variants ||= {};
  }

  if (opts.rebuildManifestOnly) {
    await writeAtomic(manifestTsPath, renderManifestTs(ledger));
    return { totalJobs: 0, cachedHits: 0, generated: 0, skippedByLimit: 0, failed: 0 };
  }

  const harvest = JSON.parse(await readFile(harvestPath, 'utf8'));
  const catalogSource = existsSync(catalogPath) ? await readFile(catalogPath, 'utf8') : '';
  const catalogBySlug = buildCatalogLookup(catalogSource);
  const allJobs = selectVariantJobs({ harvest, catalogBySlug, opts });

  const pending = [];
  let cachedHits = 0;
  for (const job of allJobs) {
    if (await isVariantCached({ ledger, job, outDir, force: opts.force })) cachedHits++;
    else pending.push(job);
  }

  const limited = Number.isFinite(opts.limit) ? pending.slice(0, opts.limit) : pending;
  const skippedByLimit = Math.max(0, pending.length - limited.length);

  if (opts.dryRun) {
    const uniqueProducts = new Set(allJobs.map((j) => j.slug)).size;
    // Rough ballpark estimate for gpt-image-2.6-sunburst ($30 / 1M output image tokens,
    // ~1,000-4,000 image tokens per 1024x1024 image depending on quality tier).
    const perImageLow = opts.quality === 'low' ? 0.01 : opts.quality === 'high' ? 0.04 : 0.02;
    const perImageHigh = opts.quality === 'low' ? 0.02 : opts.quality === 'high' ? 0.08 : 0.05;
    logger.log(`Option 2 ("Generate Once, Cache Forever") Dry Run`);
    logger.log(`  Model:              ${opts.model} (quality=${opts.quality}, size=${opts.size}, format=${opts.outputFormat})`);
    logger.log(`  Products matched:   ${uniqueProducts}`);
    logger.log(`  Total swatches:     ${allJobs.length}`);
    logger.log(`  Already cached:     ${cachedHits} (skipped at $0)`);
    logger.log(`  To generate now:    ${limited.length}${skippedByLimit ? ` (${skippedByLimit} deferred by --limit ${opts.limit})` : ''}`);
    logger.log(`  Est. batch spend:   ~$${(limited.length * perImageLow).toFixed(2)} - $${(limited.length * perImageHigh).toFixed(2)} one-time`);
    if (limited[0]) {
      logger.log(`  Sample prompt (${limited[0].slug} / ${limited[0].variantKey}):`);
      logger.log(`    ${limited[0].prompt}`);
    }
    return {
      totalJobs: allJobs.length,
      cachedHits,
      generated: 0,
      pendingCount: limited.length,
      skippedByLimit,
      failed: 0,
    };
  }

  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable is required to generate new color variants (or pass --dry-run / --rebuild-manifest-only).',
    );
  }

  let writeChain = Promise.resolve();
  const persistLedger = (fn) => {
    writeChain = writeChain.then(async () => {
      fn();
      ledger.model = opts.model;
      ledger.updatedAt = new Date().toISOString();
      await writeAtomic(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
    });
    return writeChain;
  };

  let cursor = 0;
  let generated = 0;
  let failed = 0;

  const sourcePromiseCache = new Map();
  const getSource = (sourceImage) => {
    if (!sourcePromiseCache.has(sourceImage)) {
      sourcePromiseCache.set(
        sourceImage,
        loadSourceImage({ sourceImage, sourceDir: opts.sourceDir, cacheDir, fetchImpl }),
      );
    }
    return sourcePromiseCache.get(sourceImage);
  };

  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= limited.length) return;
      const job = limited[idx];
      try {
        const src = await getSource(job.sourceImage);
        const edited = await editImageWithOpenAI({
          apiKey,
          model: opts.model,
          sourceBuffer: src.buffer,
          sourceFilename: src.filename,
          sourceMimeType: src.mimeType,
          prompt: job.prompt,
          size: opts.size,
          quality: opts.quality,
          outputFormat: opts.outputFormat,
          inputFidelity: opts.inputFidelity,
          fetchImpl,
        });
        const targetFile = resolve(outDir, job.relFile);
        await writeAtomic(targetFile, edited.buffer);
        await persistLedger(() => {
          ledger.variants[job.slug] ||= {};
          ledger.variants[job.slug][job.variantKey] = {
            image: job.imageUrl,
            relFile: job.relFile,
            colorName: job.colorName,
            ...(job.hex ? { hex: job.hex } : {}),
            ...(job.fabric ? { fabric: job.fabric } : {}),
            ...(job.sku ? { sku: job.sku } : {}),
            model: opts.model,
            quality: opts.quality,
            size: opts.size,
            sourceImage: job.sourceImage,
            promptHash: job.promptHash,
            bytes: edited.buffer.length,
            generatedAt: new Date().toISOString(),
          };
        });
        generated++;
        logger.log(`[${generated + failed}/${limited.length}] cached ${job.slug} -> ${job.variantKey} (${(edited.buffer.length / 1024).toFixed(1)} KB)`);
      } catch (err) {
        failed++;
        logger.error(`[error] ${job.slug} (${job.variantKey}): ${err.message}`);
      }
    }
  };

  const workerCount = Math.min(opts.concurrency, Math.max(1, limited.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  await writeChain;
  await writeAtomic(manifestTsPath, renderManifestTs(ledger));

  logger.log(`Done: ${generated} generated, ${cachedHits} reused from cache, ${failed} failed.`);
  return { totalJobs: allJobs.length, cachedHits, generated, skippedByLimit, failed };
}

function printHelp() {
  console.log(`Usage: node scripts/generate-color-variants.mjs [options]

Options:
  --dry-run                Preview matched SKUs, cache hits, and estimated cost without calling OpenAI
  --rebuild-manifest-only  Regenerate app/data/colorVariantManifest.ts from harvest/ai-color-variants.json
  --slugs a,b,c            Only process listed product slugs (e.g. serafina-corner-sofa)
  --category <slug>        Filter by category slug (sofas, bedroom, furniture, ...)
  --made-to-order          Only process explicit Made-to-Order / customizable products
  --in-stock-only          Skip swatches marked out_of_stock
  --cross-fabrics          Multiply all named fabrics x all colors (default uses each swatch's SKU fabric)
  --limit <n>              Max number of NEW images to generate in this run
  --concurrency <1..6>     Parallel OpenAI edit requests (default: 2)
  --model <id>             Image edit model (default: gpt-image-2.6-sunburst)
  --size <WxH>             1024x1024 (default), 1536x1024, 1024x1536, or auto
  --quality <tier>         low | medium (default) | high | auto
  --output-format <fmt>    webp (default) | png | jpeg
  --input-fidelity <mode>  high (default) | low | none
  --out-dir <dir>          Output directory (default: public/ai-color-variants)
  --public-prefix <prefix> URL/path prefix written to manifest (default: /ai-color-variants)
  --source-dir <dir>       Optional local mirror of S3 source product photos
  --include-existing       Also regenerate swatches that already carry a studio variant photo
  --force                  Regenerate even if already cached
`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const opts = parseArgs(process.argv.slice(2), process.env);
    if (opts.help) {
      printHelp();
      process.exit(0);
    }
    const result = await runBatchGeneration({
      opts,
      apiKey: process.env.OPENAI_API_KEY,
    });
    if (result.failed > 0) process.exitCode = 1;
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
