#!/usr/bin/env node
/**
 * Live catalog bridge.
 *
 * Watches the workspace for uploaded Excel catalogs (any *.xlsx) and applies
 * them to the app automatically by running data/tools/catalog_xlsx.py import.
 * The dev server (Metro, watch mode) then rebuilds and the open browser page
 * updates itself — no manual step.
 *
 * Run:  node data/tools/live_catalog_bridge.mjs
 */
import { stat } from 'node:fs/promises';
import { watch as fsWatch } from 'node:fs';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const HOME = '/home/user';
const REPO = path.join(HOME, 'royal-furniture-app');
const IMPORTER = 'data/tools/catalog_xlsx.py';
const STATE_DIR = path.join(HOME, '.catalog-bridge');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const IGNORE = ['/node_modules/', '/dist/', '/.git/', '/.arena/', '/.cache/', '/.local/', '/.npm/', '/.catalog-bridge/', '/google-drive-catalog.xlsx'];
const SETTLE_MS = 1500; // let uploads finish writing before importing

const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
const pending = new Map();
let busy = false;
const queue = [];

const log = (...args) => console.log(new Date().toISOString(), ...args);
const saveState = () => { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify(state, null, 1)); };
const fingerprint = async (file) => { try { const s = await stat(file); return `${Math.round(s.mtimeMs)}:${s.size}`; } catch { return null; } };

function runImport(file) {
  return new Promise((resolve) => {
    const child = spawn('python3', [IMPORTER, 'import', file], { cwd: REPO });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (err) => { log('❌ could not run importer:', err.message); resolve(false); });
    child.on('close', (code) => {
      if (out.trim()) log(out.trim());
      if (code === 0) {
        log('✅ Excel applied — the app is rebuilding; the open page updates itself (or just refresh the browser).');
        resolve(true);
      } else {
        log(`❌ import rejected (exit ${code}) — the app is unchanged. Fix the sheet and upload again.`);
        resolve(false);
      }
    });
  });
}

async function processFile(file) {
  const base = path.basename(file);
  if (!base.toLowerCase().endsWith('.xlsx') || base.startsWith('~$')) return;
  if (IGNORE.some((part) => file.includes(part))) return;
  if (busy) { if (!queue.includes(file)) queue.push(file); return; }
  busy = true;
  try {
    const fp = await fingerprint(file);
    if (!fp || state[file] === fp) return;
    log('📥 catalog upload detected:', file);
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    if ((await fingerprint(file)) !== fp) { log('…file still being written; will use the finished copy'); return; }
    const ok = await runImport(file);
    if (ok || /no changes detected/.test('')) state[file] = fp;
    else delete state[file];
    saveState();
  } catch (err) {
    log('error:', err.message);
  } finally {
    busy = false;
    const next = queue.shift();
    if (next) setTimeout(() => processFile(next).catch(() => {}), 200);
  }
}

async function markExisting() {
  // Remember files that already exist so a bridge restart does not re-import old uploads.
  const pending = [];
  const scan = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      log('…could not scan', dir, '-', err.message);
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (IGNORE.some((part) => full.includes(part))) continue;
      if (entry.isDirectory()) scan(full);
      else if (entry.name.toLowerCase().endsWith('.xlsx') && !entry.name.startsWith('~$')) {
        pending.push(
          fingerprint(full)
            .then((fp) => { if (fp && !state[full]) { state[full] = fp; } })
            .catch((err) => log('…could not fingerprint', full, '-', err.message))
        );
      }
    }
  };
  scan(HOME);
  // Every pre-existing file is fingerprinted before the first state write, so
  // a bridge restart cannot forget (and later re-import) an old upload.
  await Promise.all(pending);
  saveState();
}

const watcher = fsWatch(HOME, { recursive: true, persistent: true }, (_event, filename) => {
  if (!filename) return;
  const file = filename.startsWith('/') ? filename : path.join(HOME, filename);
  if (pending.has(file)) clearTimeout(pending.get(file));
  pending.set(file, setTimeout(() => { pending.delete(file); processFile(file).catch(() => {}); }, 400));
});
setInterval(() => {}, 1 << 30); // keep the event loop alive even if the watcher unrefs

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { watcher.close(); process.exit(0); });

await markExisting();
log('🔌 Live catalog bridge running — watching for Excel uploads.');
log('   Upload an edited catalog into the chat and the app updates itself.');
