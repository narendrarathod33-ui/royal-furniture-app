#!/usr/bin/env node
/**
 * Extracts secondary catalog datasets from app/data/*.ts into compact JSON
 * shards in public/data/ so the initial web bundle stays small and fast while
 * native iOS/Android, Jest, and Node scripts keep importing the .ts files.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function evalTsData(filePath, extraFooter = '') {
  const src = readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(src + '\n' + extraFooter, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      removeComments: true,
    },
  }).outputText;

  const mod = { exports: {} };
  const stubRequire = (id) => {
    if (id === './officialSizes') return { slugFromProductId: (s) => s };
    if (id === './catalogOverrides') return { catalogOverrides: {} };
    if (id === '../../utils/colorVariants') return {};
    return {};
  };
  vm.runInNewContext(transpiled, {
    exports: mod.exports,
    module: mod,
    require: stubRequire,
  });
  return mod.exports;
}

export function buildWebData(root = process.cwd()) {
  const outDir = resolve(root, 'public/data');
  mkdirSync(outDir, { recursive: true });

  const pd = evalTsData(
    resolve(root, 'app/data/productDetails.ts'),
    'exports.__WEB_T = T; exports.__WEB_RAW = RAW;',
  );
  const cm = evalTsData(resolve(root, 'app/data/colorVariantManifest.ts'));
  const cs = evalTsData(
    resolve(root, 'app/data/colorSwatches.ts'),
    'exports.__WEB_T = T; exports.__WEB_S = SWATCHES;',
  );
  const ar = evalTsData(resolve(root, 'app/data/catalogNamesAr.ts'));

  const files = [
    ['product-details.json', { t: pd.__WEB_T, r: pd.__WEB_RAW }],
    ['color-manifest.json', cm.COLOR_VARIANT_MANIFEST || {}],
    ['color-swatches.json', { t: cs.__WEB_T, s: cs.__WEB_S }],
    ['catalog-names-ar.json', { names: ar.NAMES_AR || {}, scn: ar.SCN_AR || {} }],
  ];

  const summary = [];
  for (const [name, payload] of files) {
    const dest = resolve(outDir, name);
    mkdirSync(dirname(dest), { recursive: true });
    const json = JSON.stringify(payload);
    writeFileSync(dest, json);
    summary.push({ name, bytes: Buffer.byteLength(json) });
  }
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = buildWebData(process.cwd());
  for (const item of summary) {
    console.log(`public/data/${item.name}: ${(item.bytes / 1024).toFixed(1)} KB`);
  }
}
