import { fireEvent, render } from '@testing-library/react-native';

import { categoryDestinations, searchCategories } from '../utils/categoryNavigation';
import { BrowseNavigation } from '../components/BrowseNavigation';
import { flattenText } from './test-utils';

// ---- Utility contract (direct import; the old suite vm-loaded the module) ----

const categories = [{ s: 'sofas', n: 'Sofas' }, { s: 'bedroom', n: 'Bedroom' }];
const products = [{ c: 'sofas', sc: 'corner', scn: 'Corner sofas' }, { c: 'sofas', sc: 'corner', scn: 'Corner sofas' }, { c: 'bedroom', sc: 'beds', scn: 'Beds' }];
const leaves = [{ category: 'sofas', subcategory: 'corner', slug: 'modular', name: 'Modular' }];

test('category destinations retain hierarchy and avoid duplicate product-derived categories', () => {
  const entries = categoryDestinations(categories, products, leaves);
  expect(entries.length).toBe(5);
  expect(entries.find((entry: any) => entry.leaf === 'modular').path).toBe('Sofas / Corner sofas / Modular');
  expect(entries.filter((entry: any) => entry.subcategory === 'corner' && entry.leaf === 'all').length).toBe(1);
});

test('category search matches names and parent context, including empty results', () => {
  const entries = categoryDestinations(categories, products, leaves);
  expect(searchCategories(entries, '  SOFAS modular ').length).toBe(1);
  expect(searchCategories(entries, 'unknown').length).toBe(0);
  expect(searchCategories(entries, '').length).toBe(entries.length);
});

// ---- The real explorer component driven through its UI ----

const baseProps = {
  categories,
  products,
  leaves,
  category: 'all',
  subcategory: 'all',
  leaf: 'all',
  photo: () => undefined,
};

async function harness(initial: Record<string, unknown> = {}) {
  const changes: string[][] = [];
  const screen = await render(<BrowseNavigation {...baseProps} {...initial} onChange={(...args: string[]) => changes.push(args)} />);
  const byLabel = (label: string) => {
    const hit = screen.root.queryAll((node: any) => node.props.accessibilityLabel === label, {})[0];
    expect(hit).toBeTruthy();
    return hit;
  };
  return { screen, changes, byLabel };
}

test('All categories explorer searches deep categories, selects their full path and closes', async () => {
  const h = await harness();
  await fireEvent(h.byLabel('All categories'), 'press');
  await fireEvent.changeText(h.byLabel('Find a category'), 'modular');
  const modal = h.screen.root.queryAll((node: any) => String(node.type) === 'Modal', {})[0];
  expect(modal.props.visible).toBe(true);
  const row = h.screen.root.queryAll(
    (node: any) => typeof node.props.onStartShouldSetResponder === 'function' && flattenText(node).includes('Modular'),
    {}
  )[0];
  expect(row).toBeTruthy();
  await fireEvent(row, 'press');
  expect(h.changes[0]).toEqual(['sofas', 'corner', 'modular']);
  // Selecting closes the explorer: no open Modal may remain (it unmounts).
  expect(h.screen.root.queryAll((node: any) => String(node.type) === 'Modal' && node.props.visible === true, {}).length).toBe(0);
});

test('switching main categories resets descendants and contextual chips clear a leaf', async () => {
  const h = await harness({ category: 'sofas', subcategory: 'corner', leaf: 'modular' });
  const shortcut = h.screen.root.queryAll(
    (node: any) => typeof node.props.onStartShouldSetResponder === 'function' && flattenText(node) === 'Bedroom',
    {}
  )[0];
  expect(shortcut).toBeTruthy();
  await fireEvent(shortcut, 'press');
  expect(h.changes[0]).toEqual(['bedroom', 'all', 'all']);
  const child = h.screen.root.queryAll(
    (node: any) => typeof node.props.onStartShouldSetResponder === 'function' && flattenText(node) === 'Corner sofas',
    {}
  )[0];
  expect(child).toBeTruthy();
  await fireEvent(child, 'press');
  expect(h.changes[1]).toEqual(['sofas', 'corner', 'all']);
});

test('closing explorer does not change selection and search has a resettable empty state', async () => {
  const h = await harness();
  await fireEvent(h.byLabel('All categories'), 'press');
  await fireEvent.changeText(h.byLabel('Find a category'), 'no such category');
  expect(h.screen.root.queryAll((node: any) => String(node.type) === 'Text' && node.props.children === 'No categories found', {}).length).toBe(1);
  await fireEvent(h.byLabel('Clear category search'), 'press');
  expect(h.byLabel('Find a category').props.value).toBe('');
  h.screen.root.queryAll((node: any) => String(node.type) === 'Modal', {})[0].props.onRequestClose();
  expect(h.changes.length).toBe(0);
});

// ---- Static focus/caret contract (kept source-level: these are CSS/token facts) ----

test('category search uses its rounded field as focus indicator, without an inner rectangular outline', () => {
  const { readFileSync } = require('node:fs');
  const layout = readFileSync('app/_layout.tsx', 'utf8');
  const navigation = readFileSync('components/BrowseNavigation.tsx', 'utf8');
  expect(navigation).toMatch(/testID="category-search-field" style=\{s\.search\}/);
  expect(layout).toMatch(/\[data-testid="category-explorer"\] input:focus \{ outline: none; box-shadow: none; \}/);
  expect(layout).toMatch(/\[data-testid="category-search-field"\]:focus-within \{ border-color:/);
  expect(layout).not.toMatch(/input:focus-visible \{ outline: 2px/);
});

test('both search fields focus their input from the outer bar and keep the native caret visible', () => {
  const { readFileSync } = require('node:fs');
  const layout = readFileSync('app/_layout.tsx', 'utf8');
  const navigation = readFileSync('components/BrowseNavigation.tsx', 'utf8');
  const main = readFileSync('components/catalog/Screens.tsx', 'utf8');
  for (const [source, id] of [[navigation, 'category-search-field'], [main, 'product-search-field']] as const) {
    expect(source).toMatch(new RegExp(`testID="${id}"[^>]*onPress=\\{\\(\\) => searchInput.current\\?\\.focus\\(\\)\\}`));
    expect(source).toMatch(/ref=\{searchInput\}[^>]*caretHidden=\{false\}/);
  }
  expect(layout).toMatch(/\[data-testid="product-search-field"\] input:focus \{ outline: none; box-shadow: none; \}/);
  expect(layout).toMatch(/caret-color: #DA1921; cursor: text;/);
});
