#!/usr/bin/env node
/**
 * Google Drive / Sheets receiver for the live catalog bridge.
 *
 * Google's servers cannot be reached from this sandbox (network allowlist),
 * so instead of polling Drive, the sheet pushes to us: a Google Apps Script
 * bound to the catalog spreadsheet POSTs the workbook to /upload on every
 * sync (manual menu item or a timed trigger). This receiver:
 *   1. checks the shared secret (x-bridge-token header),
 *   2. validates the payload is a real .xlsx,
 *   3. saves it to the workspace for reference,
 *   4. runs data/tools/catalog_xlsx.py import synchronously and returns the
 *      importer's output in the HTTP response — so the Apps Script execution
 *      log shows exactly what changed (or why the import was rejected).
 *
 * The dev server (Metro, watch mode) rebuilds as soon as the import rewrites
 * app/data/catalogData.ts and the open browser page updates itself.
 *
 * The token lives in /home/user/.catalog-bridge/receiver-token (never
 * committed). Run:  node data/tools/drive_receiver.mjs
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';

const HOME = '/home/user';
const REPO = path.join(HOME, 'royal-furniture-app');
const IMPORTER = 'data/tools/catalog_xlsx.py';
const OUT = path.join(HOME, 'google-drive-catalog.xlsx');
// Secret is read from the RECEIVER_TOKEN environment variable, falling back to
// the private state file (outside the repository, mode 600). Never hardcoded.
const TOKEN_FILE = path.join(HOME, '.catalog-bridge', 'receiver-token');
const TOKEN = process.env.RECEIVER_TOKEN || (existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : '');
const PORT = Number(process.env.RECEIVER_PORT || 8081);
const MAX_BYTES = 30 * 1024 * 1024;

if (!TOKEN) {
  console.error('No RECEIVER_TOKEN env var and no token file — refusing to start.');
  process.exit(1);
}

const log = (...args) => console.log(new Date().toISOString(), ...args);

function runImport(file) {
  return new Promise((resolve) => {
    const child = spawn('python3', [IMPORTER, 'import', file], { cwd: REPO });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (err) => resolve({ code: -1, output: `importer failed to start: ${err.message}` }));
    child.on('close', (code) => resolve({ code, output: out.trim() }));
  });
}

const server = createServer((req, res) => {
  const send = (status, payload) => {
    const body = JSON.stringify(payload, null, 1);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
    res.end(body);
  };

  if (req.method === 'GET') {
    return send(200, { service: 'royal-furniture drive receiver', status: 'ready', usage: 'POST /upload with x-bridge-token header and raw .xlsx body' });
  }

  if (req.method !== 'POST' || req.url !== '/upload') {
    return send(404, { ok: false, error: 'post the workbook to /upload' });
  }

  if ((req.headers['x-bridge-token'] || '') !== TOKEN) {
    log('⛔ rejected upload: bad or missing token from', req.socket.remoteAddress);
    return send(401, { ok: false, error: 'bad or missing x-bridge-token header' });
  }

  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BYTES) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', async () => {
    const body = Buffer.concat(chunks);
    if (size > MAX_BYTES) return send(413, { ok: false, error: `payload larger than ${MAX_BYTES} bytes` });
    if (body.length < 4 || body[0] !== 0x50 || body[1] !== 0x4b) {
      log('⛔ rejected upload: body is not an .xlsx (zip) file');
      return send(400, { ok: false, error: 'body does not look like an .xlsx file (zip magic missing)' });
    }

    const tmp = `${OUT}.tmp`;
    writeFileSync(tmp, body);
    renameSync(tmp, OUT);
    log(`📥 received ${(body.length / 1024).toFixed(0)} KB workbook — importing…`);

    const started = Date.now();
    const { code, output } = await runImport(OUT);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (code === 0) {
      log(`✅ drive sync applied in ${seconds}s — Metro is rebuilding; the open page updates itself.`);
      return send(200, { ok: true, seconds, importer: output });
    }
    log(`❌ drive sync rejected (exit ${code}) — the app is unchanged.`);
    return send(422, { ok: false, seconds, importer: output });
  });

  req.on('error', () => send(400, { ok: false, error: 'upload aborted' }));
});

server.listen(PORT, '0.0.0.0', () => {
  log(`🔌 Drive receiver listening on 0.0.0.0:${PORT} (public: https://${PORT}-${process.env.SANDBOX_ID || '<sandbox-id>'}.e2b.app/upload)`);
});
