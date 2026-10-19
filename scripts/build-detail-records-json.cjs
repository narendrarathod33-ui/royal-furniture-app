#!/usr/bin/env node
/**
 * Regenerates `public/data/product-detail-records.json` from the native
 * records module (`app/data/productDetailRecords.ts`), which stays the source
 * of truth for the harvested payload. Web fetches this JSON at runtime (see
 * `app/data/productDetailSource.web.ts`) so the app-shell JS bundle does not
 * carry the ~1.3 MB payload.
 *
 * Usage: node scripts/build-detail-records-json.cjs
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'data/productDetailRecords.ts');

// The records module exports only the wired store, so compile a temporary
// copy with the raw payload exported, require it, and write the JSON.
const srcTmp = src.replace(/\.ts$/, '.__payload.ts');
fs.writeFileSync(srcTmp, source());
function source() {
  return fs.readFileSync(src, 'utf8') + '\nexport const __payload = { T, RAW };\n';
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdr-'));
try {
  execFileSync(
    path.join(root, 'node_modules/.bin/tsc'),
    [srcTmp, '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { stdio: 'inherit' },
  );
  // tsc preserves the common root of the input's import tree, so require the
  // compiled file at its root-relative location.
  // eslint-disable-next-line security/detect-non-literal-require
  const compiled = require(
    path.join(outDir, path.relative(root, srcTmp).replace(/\.ts$/, '.js')),
  );
  const { T, RAW } = compiled.__payload;

  const outDirPublic = path.join(root, 'public/data');
  fs.mkdirSync(outDirPublic, { recursive: true });
  const outFile = path.join(outDirPublic, 'product-detail-records.json');
  fs.writeFileSync(outFile, JSON.stringify({ t: T, raw: RAW }));
  const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
  console.log(
    `Wrote ${path.relative(root, outFile)} (${kb} KB, ${T.length} interned strings, ${Object.keys(RAW).length} records)`,
  );
} finally {
  fs.rmSync(srcTmp, { force: true });
  fs.rmSync(outDir, { recursive: true, force: true });
}
