#!/usr/bin/env node
// Runs jest with --experimental-vm-modules on any OS. The native detail-records
// loader (data/loadDetailStore.native.ts) uses a dynamic import(), which jest's
// VM only executes with that flag; a `VAR=value` script prefix would break on
// Windows, so the flag is set here instead.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const bin = path.join(__dirname, '..', 'node_modules', 'jest', 'bin', 'jest.js');
const env = { ...process.env };
env.NODE_OPTIONS = [env.NODE_OPTIONS, '--experimental-vm-modules'].filter(Boolean).join(' ');
const res = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit', env });
process.exit(res.status == null ? 1 : res.status);
