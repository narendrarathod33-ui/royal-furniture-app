// Sync Chromium provisioning for Playwright in this sandbox.
//
// The sandbox has no system browser, no apt network access and no access to the
// Playwright browser CDN. @sparticuz/chromium ships a headless Chromium plus the
// shared libraries it needs (NSS/NSPR) inside its npm tarball, and npm IS
// reachable — so we mirror the package's own extraction (binary -> /tmp/chromium,
// libs -> /tmp/al2/lib, fonts + swiftshader -> /tmp) synchronously and point
// LD_LIBRARY_PATH at the bundled libs. Everything is idempotent: after the first
// run this is a few existsSync checks.
const { brotliDecompressSync } = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const CHROMIUM = '/tmp/chromium';
const LIB_DIR = '/tmp/al2/lib';

/** Minimal ustar extractor — enough for @sparticuz/chromium's plain lib tarball. */
function untar(buffer, dest) {
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0/g, '').trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 0);
    const name = header.subarray(0, 100).toString().replace(/\0/g, '');
    offset += 512;
    if (type === '0' || type === '\0') {
      const target = path.join(dest, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buffer.subarray(offset, offset + size));
    }
    offset += Math.ceil(size / 512) * 512;
  }
}

function extract(asset, dest, { executable = false, flat = false } = {}) {
  if (fs.existsSync(dest)) return;
  // The package "exports" map only exposes the main entry, so resolve the bin
  // dir relative to the built main file instead of a direct subpath.
  const mainDir = path.dirname(require.resolve('@sparticuz/chromium'));
  const bytes = brotliDecompressSync(fs.readFileSync(path.join(mainDir, '..', 'bin', asset)));
  if (executable) {
    fs.writeFileSync(dest, bytes);
    fs.chmodSync(dest, 0o755);
    return;
  }
  if (flat) {
    // swiftshader tarball holds its files at the top level (matches the package's own layout)
    untarFlat(bytes, path.dirname(dest));
    return;
  }
  untar(bytes, dest);
}

function untarFlat(buffer, dest) {
  let offset = 0;
  fs.mkdirSync(dest, { recursive: true });
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0/g, '').trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 0);
    const name = header.subarray(0, 100).toString().replace(/\0/g, '');
    offset += 512;
    if ((type === '0' || type === '\0') && name) {
      fs.writeFileSync(path.join(dest, name), buffer.subarray(offset, offset + size));
    }
    offset += Math.ceil(size / 512) * 512;
  }
}

function chromiumLaunchOptions() {
  extract('chromium.br', CHROMIUM, { executable: true });
  extract('al2023.tar.br', LIB_DIR);
  extract('fonts.tar.br', '/tmp/fonts');
  extract('swiftshader.tar.br', '/tmp/swiftshader.marker', { flat: true });
  const existing = process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : '';
  // al2023.tar unpacks with a leading lib/ component (/tmp/al2/lib/lib/*.so).
  process.env.LD_LIBRARY_PATH = `${LIB_DIR}/lib:${LIB_DIR}${existing}`;
  const chromium = require('@sparticuz/chromium');
  const mod = chromium.default ?? chromium;
  // --single-process/--no-zygote are Lambda memory constraints; outside Lambda
  // they make any renderer crash take the whole browser down (observed), so run
  // multi-process like a normal headless Chromium.
  const args = mod.args.filter((arg) => arg !== '--single-process' && arg !== '--no-zygote');
  return { executablePath: CHROMIUM, args, headless: true };
}

module.exports = { chromiumLaunchOptions };
