import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../ui/liquidMotion.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, module);
const css = module.exports.LIQUID_MOTION_CSS;

test('motion is scoped, finite and opt-in to normal motion preferences', () => {
  assert(css.includes('@media (prefers-reduced-motion: no-preference)'));
  assert(css.includes('[data-testid="category-explorer"]'));
  assert(css.includes('[data-testid="browse-sort-options"]'));
  assert(!/\binfinite\b|filter\s*:|touch-action\s*:|pointer-events\s*:/.test(css));
  assert(!css.includes('product-gallery'));
});

test('reduced motion disables transitions and animations; hover stays pointer-only', () => {
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*transition: none !important/);
  assert(css.includes('(hover: hover) and (pointer: fine)'));
});
