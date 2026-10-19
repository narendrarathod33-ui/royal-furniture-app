#!/usr/bin/env node
/**
 * Post-export step for the web build: inject a zero-dependency brand splash
 * into dist/index.html.
 *
 * Why: the whole app is one JS chunk, so between HTML-first-paint and bundle
 * execute+boot the page is blank (0.7–1.1s of main-thread work on phone-class
 * CPUs, measured warm in docs/perf/web-scroll-audit.md Round 4). This splash
 * fills that window with the brand mark + progress bar, then removes itself
 * the moment React renders anything into #root (MutationObserver). The bundle
 * is large and mobile connections can be slow, so the splash NEVER abandons
 * the user: past ~10s it says so honestly ("Slow connection — still
 * loading…"), and past ~25s it offers a Retry. It only ever leaves the screen
 * when the app is really up (or the user taps Retry).
 *
 * Usage: node scripts/inject-web-splash.mjs [distDir]   (default: dist)
 * Idempotent: re-running replaces the previous injection.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const distDir = process.argv[2] || 'dist';
const file = join(distDir, 'index.html');

const START = '<!--rf-boot-splash-->';
const END = '<!--/rf-boot-splash-->';

const SPLASH = `${START}<div id="rf-boot" style="position:fixed;inset:0;z-index:9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#FBF5EE;transition:opacity .22s ease;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"><div style="display:flex;flex-direction:column;align-items:center;gap:7px"><span style="color:#DA1921;font-size:30px;font-weight:800;letter-spacing:3px;line-height:1">ROYAL</span><span style="color:#3F3A46;font-size:12px;font-weight:600;letter-spacing:7px;text-indent:7px;line-height:1">FURNITURE</span></div><div style="width:84px;height:3px;border-radius:2px;overflow:hidden;background:#DDD6E0"><div style="width:36%;height:100%;border-radius:2px;background:#DA1921;animation:rf-boot-bar 1.1s ease-in-out infinite alternate"></div></div><div id="rf-boot-msg" style="color:#8A7F72;font-size:12px;min-height:16px;opacity:0;transition:opacity .3s ease">Loading…</div></div><style>@keyframes rf-boot-bar{from{transform:translateX(-8px)}to{transform:translateX(56px)}}</style><script>(function(){var s=document.getElementById('rf-boot');if(!s)return;var g=!1,k=function(){if(g)return;g=!0;s.style.opacity='0';setTimeout(function(){s&&s.parentNode&&s.parentNode.removeChild(s)},240)};try{var r=document.getElementById('root');if('MutationObserver' in window){new MutationObserver(function(o,t){for(var i=0;i<o.length;i++){if(o[i].addedNodes.length){t.disconnect();k();break}}}).observe(r,{childList:!0})}}catch(e){}var m=document.getElementById('rf-boot-msg');setTimeout(function(){if(g)return;m&&(m.style.opacity='1',m.textContent='Slow connection \u2014 still loading\u2026 Check your signal or switch to Wi-Fi.')},1e4);setTimeout(function(){if(g)return;m&&(m.innerHTML='Still loading on a slow connection. <button onclick="location.reload()" style="font:inherit;border:1px solid #DA1921;color:#DA1921;background:#fff;border-radius:12px;padding:4px 14px;cursor:pointer">Retry</button>')},25e3)})();</script>${END}`;

let html;
try {
  html = readFileSync(file, 'utf8');
} catch {
  console.error(`inject-web-splash: ${file} not found — run "expo export --platform web" first.`);
  process.exit(1);
}

// Replace any previous injection, then insert fresh (idempotent).
html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), '');
const anchor = '<div id="root"></div>';
if (!html.includes(anchor)) {
  console.error('inject-web-splash: <div id="root"></div> anchor missing — Expo template changed?');
  process.exit(1);
}
html = html.replace(anchor, `${anchor}${SPLASH}`);
writeFileSync(file, html);
console.log(`inject-web-splash: injected into ${file}`);
