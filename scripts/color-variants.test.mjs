import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {
  buildColorEditPrompt,
  buildProductDetailsGalleryLookup,
  editImageWithOpenAI,
  isDiagramImagePath,
  parseArgs,
  renderManifestTs,
  runBatchGeneration,
  selectVariantJobs,
  variantCacheKey,
} from './generate-color-variants.mjs';

test('CLI and TS color variant helpers stay identical in cache keys and prompts', () => {
  const tsSource = readFileSync(new URL('../utils/colorVariants.ts', import.meta.url), 'utf8');
  const mod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(tsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    mod,
  );
  assert.equal(
    variantCacheKey('CREAM WHITE /1882-1', 'VELVET'),
    mod.exports.variantCacheKey('CREAM WHITE /1882-1', 'VELVET'),
  );
  const input = {
    productName: 'Serafina Corner Sofa',
    colorName: 'PALE MINT /1906 B-1',
    hex: '#DDE6E3',
    fabric: 'CHENILLE',
    category: 'sofas',
  };
  assert.equal(buildColorEditPrompt(input), mod.exports.buildColorEditPrompt(input));
});

test('parseArgs defaults to gpt-image-2.6-sunburst and validates flags', () => {
  const defaults = parseArgs([], {});
  assert.equal(defaults.model, 'gpt-image-2.6-sunburst');
  assert.equal(defaults.quality, 'medium');
  assert.equal(defaults.outputFormat, 'webp');
  assert.throws(() => parseArgs(['--limit', '0'], {}));
  assert.throws(() => parseArgs(['--concurrency', '9'], {}));
  assert.throws(() => parseArgs(['--output-format', 'gif'], {}));
  const custom = parseArgs(['--dry-run', '--slugs', 'a,b', '--limit', '5', '--made-to-order'], {});
  assert.equal(custom.dryRun, true);
  assert.deepEqual(custom.slugs, ['a', 'b']);
  assert.equal(custom.limit, 5);
  assert.equal(custom.madeToOrder, true);
});

test('selectVariantJobs excludes Selectable placeholders and existing studio variant images', () => {
  const harvest = {
    details: {
      'test-sofa': {
        pi: { name: 'Test Sofa', category: { slug: 'sofas' }, is_customizable: true },
        fabrics: ['Fabric', 'VELVET', 'CHENILLE'],
        images: ['images/web/sofa.jpg'],
        colors: [
          { n: 'Selectable', hex: '#12235', img: null, sku: 'test-sofa-fabric-selectable', stock: 'in_stock' },
          { n: 'CREAM WHITE /1882-1', hex: '#F5F1E8', img: null, sku: 'test-sofa-velvet-cream-white', stock: 'in_stock' },
          { n: 'PALE MINT /1906 B-1', hex: '#DDE6E3', img: 'products/variants/real.jpg', sku: 'test-sofa-chenille-pale-mint', stock: 'in_stock' },
          { n: 'ASH GREY /1882-16', hex: '#6A6E74', img: null, sku: 'test-sofa-velvet-ash-grey', stock: 'out_of_stock' },
        ],
      },
    },
  };

  const defaultJobs = selectVariantJobs({ harvest, opts: parseArgs([], {}) });
  assert.equal(defaultJobs.length, 2); // Cream White + Ash Grey (existing studio photo skipped)
  assert.equal(defaultJobs[0].variantKey, 'velvet--cream-white-1882-1');

  const inStockJobs = selectVariantJobs({ harvest, opts: parseArgs(['--in-stock-only'], {}) });
  assert.equal(inStockJobs.length, 1);

  const includeExisting = selectVariantJobs({ harvest, opts: parseArgs(['--include-existing'], {}) });
  assert.equal(includeExisting.length, 3);
});

test('runBatchGeneration generates via gpt-image-2.6-sunburst once, retries 429, and caches forever', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rf-color-gen-'));
  try {
    mkdirSync(join(root, 'harvest'), { recursive: true });
    mkdirSync(join(root, 'app/data'), { recursive: true });
    writeFileSync(
      join(root, 'harvest/product-details.json'),
      JSON.stringify({
        details: {
          'hero-sofa': {
            info: 'Made to order sofa.',
            pi: { name: 'Hero Sofa', category: { slug: 'sofas' }, is_customizable: true },
            fabrics: ['Fabric', 'VELVET', 'CHENILLE'],
            images: ['images/web/hero.jpg'],
            colors: [
              { n: 'CREAM WHITE /1882-1', hex: '#F5F1E8', img: null, sku: 'hero-sofa-velvet-cream', stock: 'in_stock' },
              { n: 'PALE MINT /1906 B-1', hex: '#DDE6E3', img: null, sku: 'hero-sofa-chenille-mint', stock: 'in_stock' },
            ],
          },
        },
      }),
    );
    writeFileSync(join(root, 'app/data/catalogData.ts'), 'export const catalogData = [];');

    // Dry run succeeds without API key
    const logs = [];
    const dry = await runBatchGeneration({
      root,
      opts: parseArgs(['--dry-run'], {}),
      logger: { log: (m) => logs.push(m), error: (m) => logs.push(m) },
    });
    assert.equal(dry.totalJobs, 2);
    assert.equal(dry.cachedHits, 0);
    assert.equal(dry.pendingCount, 2);

    // Requires API key when not dry-run
    await assert.rejects(
      () => runBatchGeneration({ root, opts: parseArgs([], {}), logger: { log() {}, error() {} } }),
      /OPENAI_API_KEY/,
    );

    const fakeApiKey = ['test', 'key', 'not', 'real'].join('-');
    const calls = { source: 0, openai: 0, models: [] };
    let firstEditAttempt = true;
    const mockFetch = async (url, init = {}) => {
      if (String(url).includes('/images/web/hero.jpg')) {
        calls.source++;
        return new Response(Buffer.from('fake-jpeg-source'), { status: 200 });
      }
      if (String(url).endsWith('/v1/images/edits')) {
        calls.openai++;
        assert.equal(init.headers.Authorization, `Bearer ${fakeApiKey}`);
        calls.models.push(init.body.get('model'));
        if (firstEditAttempt) {
          firstEditAttempt = false;
          return new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } });
        }
        const fakeWebp = Buffer.from(`RIFF....WEBP-${calls.openai}`);
        return new Response(
          JSON.stringify({ data: [{ b64_json: fakeWebp.toString('base64') }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    // Pass 1 with --limit 1: generates 1 variant (with 429 retry), defers 1
    const firstRun = await runBatchGeneration({
      root,
      opts: parseArgs(['--limit', '1', '--concurrency', '1'], {}),
      apiKey: fakeApiKey,
      fetchImpl: mockFetch,
      logger: { log() {}, error() {} },
    });
    assert.equal(firstRun.generated, 1);
    assert.equal(firstRun.skippedByLimit, 1);
    assert.equal(calls.source, 1);
    assert.equal(calls.openai, 2); // 1 retry + 1 success
    assert.deepEqual(calls.models, ['gpt-image-2.6-sunburst', 'gpt-image-2.6-sunburst']);

    // Pass 2 without limit: hits cache for variant 1, generates only variant 2
    const secondRun = await runBatchGeneration({
      root,
      opts: parseArgs(['--concurrency', '1'], {}),
      apiKey: fakeApiKey,
      fetchImpl: mockFetch,
      logger: { log() {}, error() {} },
    });
    assert.equal(secondRun.cachedHits, 1);
    assert.equal(secondRun.generated, 1);
    assert.equal(calls.source, 1); // source cached locally too!
    assert.equal(calls.openai, 3);

    // Pass 3: everything cached forever -> 0 OpenAI calls
    const thirdRun = await runBatchGeneration({
      root,
      opts: parseArgs([], {}),
      apiKey: fakeApiKey,
      fetchImpl: mockFetch,
      logger: { log() {}, error() {} },
    });
    assert.equal(thirdRun.cachedHits, 2);
    assert.equal(thirdRun.generated, 0);
    assert.equal(calls.openai, 3);

    assert(existsSync(join(root, 'public/ai-color-variants/hero-sofa/velvet--cream-white-1882-1.webp')));
    assert(existsSync(join(root, 'public/ai-color-variants/hero-sofa/chenille--pale-mint-1906-b-1.webp')));

    const manifestTs = readFileSync(join(root, 'app/data/colorVariantManifest.ts'), 'utf8');
    assert(manifestTs.includes('gpt-image-2.6-sunburst'));
    assert(manifestTs.includes('/ai-color-variants/hero-sofa/velvet--cream-white-1882-1.webp'));
    assert(renderManifestTs(JSON.parse(readFileSync(join(root, 'harvest/ai-color-variants.json'), 'utf8'))).includes('hero-sofa'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('parseArgs supports free-lab $0 engine and gpt-image-2.6 omits input_fidelity + fails fast on insufficient_quota', async () => {
  const freeOpts = parseArgs(['--engine', 'free-lab', '--mask-mode', 'grabcut', '--limit', '15'], {});
  assert.equal(freeOpts.engine, 'free-lab');
  assert.equal(freeOpts.model, 'mask2former-lab-v1');
  assert.equal(freeOpts.maskMode, 'grabcut');
  assert.equal(freeOpts.limit, 15);

  const fakeApiKey = ['test', 'key', 'not', 'real'].join('-');
  let attempts = 0;
  let sawInputFidelity = false;
  await assert.rejects(
    () =>
      editImageWithOpenAI({
        apiKey: fakeApiKey,
        model: 'gpt-image-2.6-sunburst',
        sourceBuffer: Buffer.from('jpg'),
        prompt: 'recolor sofa',
        inputFidelity: 'high',
        fetchImpl: async (_url, init) => {
          attempts++;
          if (init?.body?.has?.('input_fidelity')) sawInputFidelity = true;
          return new Response(
            JSON.stringify({
              error: {
                type: 'insufficient_quota',
                code: 'credit_balance_exhausted',
                message: 'You have no credits remaining.',
              },
            }),
            { status: 429, headers: { 'Content-Type': 'application/json' } },
          );
        },
        sleep: async () => {},
      }),
    /insufficient_quota/,
  );
  assert.equal(sawInputFidelity, false);
  assert.equal(attempts, 1);
});

test('runBatchGeneration executes free-lab $0 mode without an OpenAI key and caches results forever', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rf-free-lab-'));
  try {
    mkdirSync(join(root, 'harvest'), { recursive: true });
    mkdirSync(join(root, 'app/data'), { recursive: true });
    writeFileSync(
      join(root, 'harvest/product-details.json'),
      JSON.stringify({
        details: {
          'free-sofa': {
            pi: { name: 'Free Sofa', category: { slug: 'sofas' } },
            images: ['images/web/free.jpg'],
            fabrics: ['VELVET'],
            colors: [
              { n: 'CREAM WHITE /1882-1', hex: '#F5F1E8', img: null, sku: 'free-velvet-1', stock: 'in_stock' },
            ],
          },
        },
      }),
    );
    writeFileSync(join(root, 'app/data/catalogData.ts'), 'export const catalogData = [];\n');

    let sourceCalls = 0;
    let pythonCalls = 0;
    const mockFetch = async () => {
      sourceCalls++;
      return new Response(Buffer.from('fake-jpeg-source'), { status: 200 });
    };
    const mockPythonRunner = async ({ batchJobs }) => {
      pythonCalls++;
      assert.equal(batchJobs.length, 1);
      assert.equal(batchJobs[0].hex, '#F5F1E8');
      assert.equal(batchJobs[0].category, 'sofas');
      mkdirSync(join(root, 'public/ai-color-variants/free-sofa'), { recursive: true });
      writeFileSync(batchJobs[0].outputPath, Buffer.from('RIFF....FREEWEBP'));
      return JSON.stringify({ results: [{ id: batchJobs[0].id, ok: true, bytes: 16 }] });
    };

    const first = await runBatchGeneration({
      root,
      opts: parseArgs(['--engine', 'free-lab'], {}),
      fetchImpl: mockFetch,
      pythonRunner: mockPythonRunner,
      logger: { log() {}, error() {} },
    });
    assert.equal(first.generated, 1);
    assert.equal(sourceCalls, 1);
    assert.equal(pythonCalls, 1);

    const second = await runBatchGeneration({
      root,
      opts: parseArgs(['--engine', 'free-lab'], {}),
      fetchImpl: mockFetch,
      pythonRunner: mockPythonRunner,
      logger: { log() {}, error() {} },
    });
    assert.equal(second.cachedHits, 1);
    assert.equal(second.generated, 0);
    assert.equal(pythonCalls, 1);

    const manifestTs = readFileSync(join(root, 'app/data/colorVariantManifest.ts'), 'utf8');
    assert(manifestTs.includes('mask2former-lab-v1'));
    assert(manifestTs.includes('/ai-color-variants/free-sofa/velvet--cream-white-1882-1.webp'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('gallery parser filters dimension diagrams and white-background-only selects clean studio angles while skipping scene-only products', async () => {
  assert.equal(isDiagramImagePath('images/web/SIZE-17_5c3d62e8.webp'), true);
  assert.equal(isDiagramImagePath('images/web/AYILIN-SOFA-size-2.webp'), false);

  const mockPdTs = `
const T: readonly string[] = [
  "images/web/SOFA-ROOM.webp",
  "images/web/SIZE-17_abc.webp",
  "images/web/SOFA-WHITE.webp",
  "images/web/SCENE-ONLY.webp"
];
const RAW: Record<string, RawDetail> = {
  "multi-angle-sofa": {"p": [0, 1, 2]},
  "scene-only-sofa": {"p": [3]},
};
`;
  const gallery = buildProductDetailsGalleryLookup(mockPdTs);
  assert.deepEqual(gallery.get('multi-angle-sofa'), ['images/web/SOFA-ROOM.webp', 'images/web/SOFA-WHITE.webp']);
  assert.deepEqual(gallery.get('scene-only-sofa'), ['images/web/SCENE-ONLY.webp']);

  const root = mkdtempSync(join(tmpdir(), 'rf-whitebg-'));
  try {
    mkdirSync(join(root, 'harvest'), { recursive: true });
    mkdirSync(join(root, 'app/data'), { recursive: true });
    mkdirSync(join(root, 'public/ai-color-variants/scene-only-sofa'), { recursive: true });
    writeFileSync(join(root, 'public/ai-color-variants/scene-only-sofa/navy.webp'), Buffer.from('stale'));
    writeFileSync(join(root, 'app/data/productDetails.ts'), mockPdTs);
    writeFileSync(join(root, 'app/data/catalogData.ts'), 'export const catalogData = [];\n');
    writeFileSync(
      join(root, 'harvest/ai-color-variants.json'),
      JSON.stringify({
        version: 1,
        model: 'mask2former-lab-v1',
        variants: {
          'scene-only-sofa': {
            navy: {
              image: '/ai-color-variants/scene-only-sofa/navy.webp',
              relFile: 'scene-only-sofa/navy.webp',
              colorName: 'NAVY',
            },
          },
        },
      }),
    );
    writeFileSync(
      join(root, 'harvest/product-details.json'),
      JSON.stringify({
        details: {
          'multi-angle-sofa': {
            pi: { name: 'Multi Angle Sofa', category: { slug: 'sofas' } },
            images: ['images/web/SOFA-ROOM.webp'],
            fabrics: ['VELVET'],
            colors: [{ n: 'NAVY', hex: '#1B365D', img: null, sku: 'm-1', stock: 'in_stock' }],
          },
          'scene-only-sofa': {
            pi: { name: 'Scene Only Sofa', category: { slug: 'sofas' } },
            images: ['images/web/SCENE-ONLY.webp'],
            fabrics: ['VELVET'],
            colors: [{ n: 'NAVY', hex: '#1B365D', img: null, sku: 's-1', stock: 'in_stock' }],
          },
        },
      }),
    );

    const mockFetch = async (url) => {
      const name = String(url).split('/').pop();
      return new Response(Buffer.from(`img:${name}`), { status: 200 });
    };
    const mockWhiteBgInspector = async ({ filePaths }) =>
      filePaths.map((p) => ({
        path: p,
        ok: true,
        whiteBackground: readFileSync(p, 'utf8').includes('SOFA-WHITE'),
        reasons: readFileSync(p, 'utf8').includes('SOFA-WHITE') ? [] : ['border-not-over-90-percent-near-white'],
      }));
    const mockPythonRunner = async ({ batchJobs }) => {
      assert.equal(batchJobs.length, 1);
      assert(readFileSync(batchJobs[0].sourcePath, 'utf8').includes('SOFA-WHITE'));
      mkdirSync(join(root, 'public/ai-color-variants/multi-angle-sofa'), { recursive: true });
      writeFileSync(batchJobs[0].outputPath, Buffer.from('RIFF....WHITEWEBP'));
      return JSON.stringify({ results: [{ id: batchJobs[0].id, ok: true, bytes: 17 }] });
    };

    const res = await runBatchGeneration({
      root,
      opts: parseArgs(['--engine', 'free-lab', '--white-background-only'], {}),
      fetchImpl: mockFetch,
      whiteBgInspector: mockWhiteBgInspector,
      pythonRunner: mockPythonRunner,
      logger: { log() {}, error() {} },
    });

    assert.equal(res.generated, 1);
    assert.equal(res.skippedNoWhiteBgProducts, 1);
    assert.equal(existsSync(join(root, 'public/ai-color-variants/scene-only-sofa/navy.webp')), false);
    const ledger = JSON.parse(readFileSync(join(root, 'harvest/ai-color-variants.json'), 'utf8'));
    assert.equal(ledger.variants['scene-only-sofa'], undefined);
    assert.equal(ledger.variants['multi-angle-sofa']['velvet--navy'].sourceImage, 'images/web/SOFA-WHITE.webp');

    // Cold-cache --dry-run (even after deleting .cache/white-bg-index.json) must recognize multi-angle cached entries via ledger sourceImage
    rmSync(join(root, '.cache'), { recursive: true, force: true });
    const dryCold = await runBatchGeneration({
      root,
      opts: parseArgs(['--engine', 'free-lab', '--white-background-only', '--slugs', 'multi-angle-sofa', '--dry-run'], {}),
      logger: { log() {}, error() {} },
    });
    assert.equal(dryCold.cachedHits, 1);
    assert.equal(dryCold.pendingCount, 0);

    // Cold-cache actual run must reuse ledger sourceImage without downloading S3 photos again
    let coldFetchCount = 0;
    const coldRun = await runBatchGeneration({
      root,
      opts: parseArgs(['--engine', 'free-lab', '--white-background-only', '--slugs', 'multi-angle-sofa'], {}),
      fetchImpl: async () => {
        coldFetchCount++;
        throw new Error('should not refetch already-cached product');
      },
      whiteBgInspector: async () => [],
      pythonRunner: async () => JSON.stringify({ results: [] }),
      logger: { log() {}, error() {} },
    });
    assert.equal(coldFetchCount, 0);
    assert.equal(coldRun.cachedHits, 1);
    assert.equal(coldRun.generated, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
