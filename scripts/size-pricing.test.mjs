import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../utils/sizePricing.ts', import.meta.url), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { sortSizesByPrice, selectSizeOption } = context.exports;

for (const type of ['catalog siblings', 'official sizes', 'live API sizes', 'local sizes']) {
  test(`${type}: sort by price, show cheapest by default, allow a more expensive choice`, () => {
    const input = [{ key: 'king', label: 'King', price: 1500, listPrice: 2000, photo: 'king.jpg' }, { key: 'single', label: 'Single', price: 500, listPrice: 700, photo: 'single.jpg' }, { key: 'queen', label: 'Queen', price: 1000 }];
    const sorted = sortSizesByPrice(input);
    assert.deepEqual(Array.from(sorted, (option) => option.price), [500, 1000, 1500]);
    assert.equal(input[0].key, 'king', 'Source data is not mutated');
    const cheapest = selectSizeOption(sorted, '');
    assert.equal(cheapest.price, 500);
    assert.equal(cheapest.listPrice, 700);
    assert.equal(cheapest.photo, 'single.jpg');
    assert.equal(selectSizeOption(sorted, 'king').price, 1500);
    assert.equal(selectSizeOption(sorted, '', 'Queen').price, 1000, 'Reopened cart size is preserved');
    assert.equal(selectSizeOption(sorted, 'king', 'Queen').price, 1500, 'Customer choice wins over cart default');
  });
}

test('unknown prices are last; equal prices remain stable; empty options are safe', () => {
  const sorted = sortSizesByPrice([{ key: 'unknown' }, { key: 'a', price: 100 }, { key: 'b', price: 100 }, { key: 'invalid', price: NaN }]);
  assert.deepEqual(Array.from(sorted, (option) => option.key), ['a', 'b', 'unknown', 'invalid']);
  assert.equal(selectSizeOption([], ''), undefined);
});

test('asynchronous prices update the cheapest default but do not overwrite a customer choice', () => {
  const initial = sortSizesByPrice([{ key: 'large', label: 'Large' }, { key: 'small', label: 'Small' }]);
  assert.equal(selectSizeOption(initial, '').key, 'large');
  const loaded = sortSizesByPrice([{ key: 'large', label: 'Large', price: 200 }, { key: 'small', label: 'Small', price: 100 }]);
  assert.equal(selectSizeOption(loaded, '').key, 'small');
  assert.equal(selectSizeOption(loaded, 'large').key, 'large');
});

const details = readFileSync(new URL('../app/ProductDetails.tsx', import.meta.url), 'utf8');
const selectionCode = details.slice(details.indexOf('  const local = useMemo'), details.indexOf('\n  useEffect(() => {', details.indexOf('  const local = useMemo')));
function productSelection({ siblings = [], official = [], api = [], local = [], selectedKey = '', cartSize } = {}) {
  let hook = 0;
  const runtime = {
    exports: {}, sortSizesByPrice, selectSizeOption,
    product: { id: 'bed', n: 'Bed', o: 999, l: 1200 }, detail: null, sizeVariants: siblings, photoSource: 'listing.jpg',
    sizeFromProductId: () => cartSize,
    getLocalOptions: () => ({ sizePrices: local }), extractApiOptions: () => ({}),
    getOfficialSizes: () => official, extractApiSizeOptions: () => api,
    useMemo: (callback) => callback(),
    useState: (initial) => [hook++ === 1 ? selectedKey : initial, () => {}],
  };
  vm.runInNewContext(ts.transpileModule(selectionCode + '\nexports.selection = { sizeOptions, activeSize, displayPrice, displayListPrice, displayPhoto, selectedPrice, localSizePrices };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, runtime);
  return runtime.exports.selection;
}

test('actual product-page selection uses the cheapest sibling price and matching photo', () => {
  const siblings = [{ id: 'bed', label: 'King', sizeType: '', price: 900, photo: 'king.jpg' }, { id: 'single', label: 'Single', sizeType: '', price: 300, listPrice: 500, photo: 'single.jpg' }];
  const result = productSelection({ siblings });
  assert.equal(result.displayPrice, 300);
  assert.equal(result.displayListPrice, 500);
  assert.equal(result.displayPhoto, 'single.jpg');
  assert.equal(productSelection({ siblings, selectedKey: 'bed' }).displayPrice, 900);
});

test('actual official/API menus and local fallback start at their lowest prices', () => {
  const options = [{ label: 'King', price: 900 }, { label: 'Single', price: 300 }];
  assert.equal(productSelection({ official: options }).displayPrice, 300);
  assert.equal(productSelection({ api: options }).displayPrice, 300);
  assert.equal(productSelection({ official: options, cartSize: 'King' }).displayPrice, 900);
  const local = [{ name: 'King', price: 900 }, { name: 'Single', price: 300 }];
  assert.equal(productSelection({ local }).displayPrice, 300);
});
