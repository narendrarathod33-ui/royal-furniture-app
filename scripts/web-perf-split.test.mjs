import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { buildWebData } from './build-web-data.mjs';

const require = createRequire(import.meta.url);
const root = process.cwd();

function loadWebLoaderModule(relPath, mocks) {
  const src = readFileSync(resolve(root, relPath), 'utf8');
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const mod = { exports: {} };
  const fakeRequire = (id) => {
    if (id in mocks) return mocks[id];
    return require(id);
  };
  vm.runInNewContext(transpiled, {
    exports: mod.exports,
    module: mod,
    require: fakeRequire,
    Promise,
    Object,
    Array,
    Map,
    Set,
    URL,
  });
  return mod.exports;
}

test('buildWebData shards decode identically through *.web.ts loaders', async () => {
  const summary = buildWebData(root);
  assert.equal(summary.length, 4);
  for (const item of summary) {
    assert.ok(item.bytes > 1000, `${item.name} should be non-empty`);
  }

  const readJson = (name) => JSON.parse(readFileSync(resolve(root, 'public/data', name), 'utf8'));
  const detailsJson = readJson('product-details.json');
  const manifestJson = readJson('color-manifest.json');
  const swatchesJson = readJson('color-swatches.json');
  const arJson = readJson('catalog-names-ar.json');

  const fetchCalls = [];
  const preloaders = [];
  const arabicPreloaders = [];
  const fakeLoader = {
    loadWebJson: async (name, onLoaded) => {
      fetchCalls.push(name);
      const map = {
        'product-details.json': detailsJson,
        'color-manifest.json': manifestJson,
        'color-swatches.json': swatchesJson,
        'catalog-names-ar.json': arJson,
      };
      const data = map[name];
      onLoaded?.(data);
      return data;
    },
    registerWebDataPreloader: (fn) => preloaders.push(fn),
    registerArabicDataPreloader: (fn) => arabicPreloaders.push(fn),
  };

  const officialSizes = loadWebLoaderModule('app/data/officialSizes.ts', {});
  const overrides = { catalogOverrides: {} };

  const pdWeb = loadWebLoaderModule('app/data/productDetails.web.ts', {
    './officialSizes': officialSizes,
    './catalogOverrides': overrides,
    './webDataLoader': fakeLoader,
  });
  const cmWeb = loadWebLoaderModule('app/data/colorVariantManifest.web.ts', {
    './officialSizes': officialSizes,
    './webDataLoader': fakeLoader,
  });
  const csWeb = loadWebLoaderModule('app/data/colorSwatches.web.ts', {
    './officialSizes': officialSizes,
    './webDataLoader': fakeLoader,
  });
  const arWeb = loadWebLoaderModule('app/data/catalogNamesAr.web.ts', {
    './webDataLoader': fakeLoader,
  });

  // Before loading: English boot does not preload Arabic names, and no shards
  // have been fetched synchronously at import time.
  assert.equal(preloaders.length, 3);
  assert.equal(arabicPreloaders.length, 1);
  assert.equal(fetchCalls.length, 0);

  await Promise.all(preloaders.map((fn) => fn()));
  assert.deepEqual(fetchCalls.sort(), [
    'color-manifest.json',
    'color-swatches.json',
    'product-details.json',
  ]);

  // Compare decoded record from productDetails.web.ts vs authoritative productDetails.ts.
  const pdSrc = loadWebLoaderModule('app/data/productDetails.ts', {
    './officialSizes': officialSizes,
    './catalogOverrides': overrides,
  });
  const sampleId = '7072-serafina-corner-sofa';
  const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  assert.deepEqual(plain(pdWeb.getProductDetails(sampleId)), plain(pdSrc.getProductDetails(sampleId)));

  // Compare swatches & manifest variants against real entries in each shard.
  const csSrc = loadWebLoaderModule('app/data/colorSwatches.ts', {
    './officialSizes': officialSizes,
  });
  assert.deepEqual(plain(csWeb.getColorSwatches(sampleId)), plain(csSrc.getColorSwatches(sampleId)));

  const cmSrc = loadWebLoaderModule('app/data/colorVariantManifest.ts', {
    './officialSizes': officialSizes,
  });
  const manifestSlug = Object.keys(manifestJson)[0];
  assert.ok(manifestSlug, 'color-manifest.json has entries');
  assert.deepEqual(plain(cmWeb.getManifestVariants(manifestSlug)), plain(cmSrc.getManifestVariants(manifestSlug)));
  assert.equal(cmWeb.getManifestVariants(sampleId), cmSrc.getManifestVariants(sampleId));

  // Arabic names remain empty until Arabic preloader is invoked.
  assert.equal(Object.keys(arWeb.NAMES_AR).length, 0);
  await arabicPreloaders[0]();
  assert.ok(Object.keys(arWeb.NAMES_AR).length > 100);
  assert.ok(Object.keys(arWeb.SCN_AR).length > 10);
});

test('babel config tree-shakes lucide-react-native (including aliases) in app builds and stays inactive in Jest', () => {
  const babel = require('@babel/core');
  const sample = `
    import { Grid2X2, Search, ShoppingBag } from 'lucide-react-native';
    export const icons = [Grid2X2, Search, ShoppingBag];
  `;

  const prevJest = process.env.JEST_WORKER_ID;
  const prevEnv = process.env.NODE_ENV;
  try {
    delete process.env.JEST_WORKER_ID;
    process.env.NODE_ENV = 'production';
    const prodOut = babel.transformSync(sample, {
      filename: resolve(root, 'components/Sample.tsx'),
      configFile: resolve(root, 'babel.config.js'),
    });
    assert.ok(prodOut.code.includes('lucide-react-native/dist/esm/icons/grid-2x2'));
    assert.ok(prodOut.code.includes('lucide-react-native/dist/esm/icons/search'));
    assert.ok(!prodOut.code.includes("'lucide-react-native'") && !prodOut.code.includes('"lucide-react-native"'));

    process.env.NODE_ENV = 'test';
    const testOut = babel.transformSync(sample, {
      filename: resolve(root, 'components/Sample.tsx'),
      configFile: resolve(root, 'babel.config.js'),
    });
    assert.ok(testOut.code.includes('lucide-react-native'));
  } finally {
    if (prevJest !== undefined) process.env.JEST_WORKER_ID = prevJest;
    if (prevEnv !== undefined) process.env.NODE_ENV = prevEnv;
    else delete process.env.NODE_ENV;
  }
});

test('expoRouterCtx.web.js filter excludes app/data while keeping actual routes', () => {
  const ctxSrc = readFileSync(resolve(root, 'utils/expoRouterCtx.web.js'), 'utf8');
  const match = ctxSrc.match(/\/(\^.*)\/,/);
  assert.ok(match, 'context regex present');
  const regex = new RegExp(match[1]);

  assert.equal(regex.test('./_layout.tsx'), true);
  assert.equal(regex.test('./(tabs)/_layout.tsx'), true);
  assert.equal(regex.test('./(tabs)/index.tsx'), true);
  assert.equal(regex.test('./+not-found.tsx'), true);
  assert.equal(regex.test('./data/productDetails.ts'), false);
  assert.equal(regex.test('./data/productDetails.web.ts'), false);
  assert.equal(regex.test('./data/colorVariantManifest.ts'), false);
  assert.equal(regex.test('./privacy/productResponse.ts'), false);
  assert.equal(regex.test('./ui/glass.tsx'), false);
});

test('inject-web-splash idempotently injects preconnect hints and boot splash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rf-splash-'));
  try {
    const htmlPath = join(dir, 'index.html');
    writeFileSync(htmlPath, '<!DOCTYPE html><html><head><title>RF</title></head><body><div id="root"></div></body></html>');
    execFileSync('node', [resolve(root, 'scripts/inject-web-splash.mjs'), dir]);
    execFileSync('node', [resolve(root, 'scripts/inject-web-splash.mjs'), dir]);
    const out = readFileSync(htmlPath, 'utf8');
    assert.equal((out.match(/id="rf-boot"/g) || []).length, 1);
    assert.equal((out.match(/fonts\.googleapis\.com/g) || []).length, 2); // preconnect + stylesheet
    assert.equal((out.match(/s3\.ap-south-1\.amazonaws\.com/g) || []).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
