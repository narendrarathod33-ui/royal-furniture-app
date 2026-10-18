import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = (source) => ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const utility = { exports: {} };
vm.runInNewContext(compile(readFileSync(new URL('../utils/categoryNavigation.ts', import.meta.url), 'utf8')), utility);
const { categoryDestinations, searchCategories } = utility.exports;
const categories = [{ s: 'sofas', n: 'Sofas' }, { s: 'bedroom', n: 'Bedroom' }];
const products = [{ c: 'sofas', sc: 'corner', scn: 'Corner sofas' }, { c: 'sofas', sc: 'corner', scn: 'Corner sofas' }, { c: 'bedroom', sc: 'beds', scn: 'Beds' }];
const leaves = [{ category: 'sofas', subcategory: 'corner', slug: 'modular', name: 'Modular' }];

test('category destinations retain hierarchy and avoid duplicate product-derived categories', () => {
  const entries = categoryDestinations(categories, products, leaves);
  assert.equal(entries.length, 5);
  assert.equal(entries.find((entry) => entry.leaf === 'modular').path, 'Sofas / Corner sofas / Modular');
  assert.equal(entries.filter((entry) => entry.subcategory === 'corner' && entry.leaf === 'all').length, 1);
});

test('category search matches names and parent context, including empty results', () => {
  const entries = categoryDestinations(categories, products, leaves);
  assert.equal(searchCategories(entries, '  SOFAS modular ').length, 1);
  assert.equal(searchCategories(entries, 'unknown').length, 0);
  assert.equal(searchCategories(entries, '').length, entries.length);
});

function harness(initial = {}) {
  const state = []; let cursor = 0;
  const changes = [];
  const jsx = (type, props) => ({ type, props: props || {} });
  const native = new Proxy({ StyleSheet: { create: (styles) => styles, absoluteFill: {} }, useWindowDimensions: () => ({ width: 390 }) }, { get: (target, key) => target[key] || key });
  const hooks = { useMemo: (fn) => fn(), useRef: () => ({ current: null }), useState: (value) => { const key = cursor++; if (!(key in state)) state[key] = value; return [state[key], (next) => { state[key] = next; }]; } };
  const context = { exports: {}, require: (name) => name === 'react' ? hooks : name === 'react-native' ? native : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : name === 'lucide-react-native' ? new Proxy({}, { get: (_, key) => key }) : name.includes('/glass') ? { GLASS: {} } : utility.exports };
  vm.runInNewContext(compile(readFileSync(new URL('../components/BrowseNavigation.tsx', import.meta.url), 'utf8')), context);
  const props = { categories, products, leaves, category: 'all', subcategory: 'all', leaf: 'all', photo: () => undefined, onChange: (...args) => changes.push(args), ...initial };
  return { changes, render: () => { cursor = 0; return context.exports.BrowseNavigation(props); } };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object' || !tree.props) return [];
  if (tree.type === 'Modal' && !tree.props.visible) return [tree];
  return [tree, ...nodes(tree.props.children)];
}
const byLabel = (tree, label) => { const node = nodes(tree).find((node) => node.props.accessibilityLabel === label); assert(node, label); return node; };

test('All categories explorer searches deep categories, selects their full path and closes', () => {
  const h = harness();
  byLabel(h.render(), 'All categories').props.onPress();
  byLabel(h.render(), 'Find a category').props.onChangeText('modular');
  const row = nodes(h.render()).find((node) => node.type === 'Pressable' && nodes(node.props.children).some((child) => child.type === 'Text' && child.props.children === 'Modular'));
  assert(row); row.props.onPress();
  assert.deepEqual(h.changes[0], ['sofas', 'corner', 'modular']);
  assert.equal(nodes(h.render()).find((node) => node.type === 'Modal').props.visible, false);
});

test('switching main categories resets descendants and contextual chips clear a leaf', () => {
  const h = harness({ category: 'sofas', subcategory: 'corner', leaf: 'modular' });
  const shortcut = nodes(h.render()).find((node) => node.type === 'Pressable' && nodes(node.props.children).some((child) => child.type === 'Text' && child.props.children === 'Bedroom'));
  shortcut.props.onPress(); assert.deepEqual(h.changes[0], ['bedroom', 'all', 'all']);
  const child = nodes(h.render()).find((node) => node.type === 'Pressable' && nodes(node.props.children).some((entry) => entry.type === 'Text' && entry.props.children === 'Corner sofas'));
  child.props.onPress(); assert.deepEqual(h.changes[1], ['sofas', 'corner', 'all']);
});

test('closing explorer does not change selection and search has a resettable empty state', () => {
  const h = harness();
  byLabel(h.render(), 'All categories').props.onPress();
  byLabel(h.render(), 'Find a category').props.onChangeText('no such category');
  assert(nodes(h.render()).some((node) => node.type === 'Text' && node.props.children === 'No categories found'));
  byLabel(h.render(), 'Clear category search').props.onPress();
  assert.equal(byLabel(h.render(), 'Find a category').props.value, '');
  nodes(h.render()).find((node) => node.type === 'Modal').props.onRequestClose();
  assert.equal(h.changes.length, 0);
});


test('category search uses its rounded field as focus indicator, without an inner rectangular outline', () => {
  const layout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
  const navigation = readFileSync(new URL('../components/BrowseNavigation.tsx', import.meta.url), 'utf8');
  assert.match(navigation, /testID="category-search-field" style=\{s.search\}/);
  assert.match(layout, /\[data-testid="category-explorer"\] input:focus \{ outline: none; box-shadow: none; \}/);
  assert.match(layout, /\[data-testid="category-search-field"\]:focus-within \{ border-color:/);
  assert.doesNotMatch(layout, /input:focus-visible \{ outline: 2px/);
});

test('both search fields focus their input from the outer bar and keep the native caret visible', () => {
  const layout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
  const navigation = readFileSync(new URL('../components/BrowseNavigation.tsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  for (const [source, id] of [[navigation, 'category-search-field'], [main, 'product-search-field']]) {
    assert.match(source, new RegExp(`testID="${id}"[^>]*onPress=\\{\\(\\) => searchInput.current\\?\\.focus\\(\\)\\}`));
    assert.match(source, /ref=\{searchInput\}[^>]*caretHidden=\{false\}/);
  }
  assert.match(layout, /\[data-testid="product-search-field"\] input:focus \{ outline: none; box-shadow: none; \}/);
  assert.match(layout, /caret-color: #DA1921; cursor: text;/);
});
