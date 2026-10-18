import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const compile = code => ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modules = {};
for (const name of ['catalogData', 'dealsCatalog', 'royalFurnitureData', 'leafProducts', 'catalogLeaves', 'sizeVariants']) {
  const module = { exports: {}, require: path => modules[path.replace('./', '')] };
  vm.runInNewContext(compile(read(`app/data/${name}.ts`)), module);
  modules[name] = module.exports;
}
const catalog = modules.catalogData.catalogData;
const source = read('app/(tabs)/index.tsx');
const ast = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'ShopContent');
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree?.props ? [tree, ...nodes(tree.props.children)] : [];
}
function harness(category = 'all', catalogSort = 'priceLow') {
  const slots = []; let cursor = 0; const sortChanges = []; const categories = [];
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const context = { exports: {}, require: () => ({ jsx, jsxs: jsx }) };
  const visit = node => { if (ts.isIdentifier(node) && /^[A-Z]/.test(node.text)) context[node.text] = node.text; ts.forEachChild(node, visit); };
  visit(screen);
  Object.assign(context, ...Object.values(modules), {
    Number, styles: new Proxy({}, { get: () => ({}) }), COLORS: {}, categoryThumbnail: () => undefined,
    isTrending: p => p.lb?.some(label => label.toLowerCase() === 'trending'),
    useAdaptiveLayout: () => ({ sidebar: false }),
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    // Cache using real dependencies so missing memo dependencies fail this test.
    useMemo: (fn, deps) => { const i = cursor++; const old = slots[i]; if (!old || deps.some((dep, j) => !Object.is(dep, old.deps[j]))) slots[i] = { deps, value: fn() }; return slots[i].value; },
  });
  vm.runInNewContext(compile(screen.getText(ast)) + '\nexports.screen = ShopContent;', context);
  const render = () => { cursor = 0; return context.exports.screen({ category, catalogSort, catalogOnly: true, saved: [], setCategory: value => categories.push(value), onCatalogSortChange: value => sortChanges.push(value) }); };
  const list = () => nodes(render()).find(n => n.type === 'AdaptiveProductList');
  return { render, list, sortChanges, categories,
    select(sort) { nodes(render()).find(n => n.props.accessibilityLabel?.startsWith('Sort products,')).props.onPress(); const option = nodes(render()).find(n => n.props.accessibilityRole === 'radio' && n.props.children[0].props.children === sort); assert(option); option.props.onPress(); },
    category(...args) { nodes(render()).find(n => n.type === 'BrowseNavigation').props.onChange(...args); },
  };
}
function ordered(data, descending) {
  assert(data.length > 1);
  for (let i = 1; i < data.length; i++) {
    assert(Number.isFinite(data[i].o));
    assert(descending ? data[i - 1].o >= data[i].o : data[i - 1].o <= data[i].o, `${data[i - 1].n}: ${data[i - 1].o} then ${data[i].n}: ${data[i].o}`);
  }
}
test('actual Browse controls switch low/high/low repeatedly using displayed selling price, not list price', () => {
  const h = harness(); const initial = h.list().props.data;
  ordered(initial, false);
  for (let i = 0; i < 3; i++) {
    h.select('Price high to low'); ordered(h.list().props.data, true);
    assert.equal(h.list().props.data[0].o, Math.max(...initial.map(p => p.o)));
    h.select('Price low to high'); ordered(h.list().props.data, false);
    assert.deepEqual(Array.from(h.list().props.data, p => p.id), Array.from(initial, p => p.id));
  }
  assert.equal(h.sortChanges.length, 6);
});
test('changing sort invalidates the virtualized list anchor/layout cache instead of reusing an old product position', () => {
  const h = harness(); const low = h.list();
  h.select('Price high to low'); const high = h.list();
  assert.notEqual(low.key, high.key, 'a new ordering must start with a fresh list and scroll position');
  h.select('Price low to high'); assert.equal(h.list().key, low.key);
});
test('category, subcategory and leaf filters survive both price sort directions', () => {
  const leaf = modules.catalogLeaves.catalogLeaves.find(entry => modules.leafProducts.leafProducts[entry.slug]?.length > 2);
  assert(leaf);
  const h = harness(); h.category(leaf.category, leaf.subcategory, leaf.slug);
  const before = Array.from(h.list().props.data, p => p.id).sort();
  assert(before.length > 1);
  for (const [label, desc] of [['Price high to low', true], ['Price low to high', false]]) {
    h.select(label); const data = h.list().props.data; ordered(data, desc);
    assert.deepEqual(Array.from(data, p => p.id).sort(), before);
    assert(data.every(p => p.c === leaf.category && p.sc === leaf.subcategory));
    assert.equal(h.categories.length, 1, 'sorting must not reset category filters');
  }
});
test('sorting never mutates the original catalog and family cards use the cheapest visible size price', () => {
  const before = JSON.stringify(catalog);
  const h = harness(); h.select('Price high to low'); h.select('Price low to high');
  assert.equal(JSON.stringify(catalog), before);
  const familyCards = h.list().props.data.filter(p => p.sizeCount > 1);
  assert(familyCards.length > 0);
  for (const card of familyCards) {
    const variants = modules.sizeVariants.getSizeVariants(card.id);
    assert.equal(card.o, Math.min(...variants.map(v => v.price)));
  }
});
