// Records the dev web-bundle size as the P0 performance baseline.
// Later phases (FlashList, memoization, code splitting) diff against
// docs/perf/bundle-baseline.json. Run: npm run baseline:bundle
import { gzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const URL =
  'http://localhost:4000/node_modules/expo-router/entry.bundle?platform=web&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=app&unstable_transformProfile=hermes-stable';

const response = await fetch(URL);
if (!response.ok) {
  console.error(`bundle request failed: HTTP ${response.status}`);
  process.exit(1);
}
const raw = Buffer.from(await response.arrayBuffer());
const gzip = gzipSync(raw);

const record = {
  timestamp: new Date().toISOString(),
  gitSha: execSync('git rev-parse --short HEAD').toString().trim(),
  platform: 'web (Metro dev bundle, hermes-stable)',
  rawBytes: raw.length,
  gzipBytes: gzip.length,
  url: URL,
};

mkdirSync('docs/perf', { recursive: true });
writeFileSync('docs/perf/bundle-baseline.json', JSON.stringify(record, null, 2) + '\n');
console.log(`baseline: ${(raw.length / 1e6).toFixed(2)} MB raw, ${(gzip.length / 1e6).toFixed(2)} MB gzip -> docs/perf/bundle-baseline.json`);
