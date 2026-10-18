import { fireEvent, render } from '@testing-library/react-native';

// The shop grid virtualizer is replaced by a props-capturing double: the suite
// tests ShopContent's ordering contract (the same seam the source suite used),
// while BrowseNavigation and all data modules stay real.
const captured = { current: [] as any[] };
jest.mock('../components/AdaptiveProductList', () => {
  const { useEffect } = require('react');
  // A sort change re-keys the list, which REMOUNTS it (fresh anchor/scroll).
  // React strips `key` from props, so remounts are counted with an effect.
  let mounts = 0;
  return {
    AdaptiveProductList: (props: any) => {
      useEffect(() => { mounts += 1; }, []);
      captured.current.push({ ...props, __mount: mounts + 1 });
      // The compact toolbar rides in the list header (sticky on device/web);
      // render it so the suite can drive the real controls.
      return props.ListHeaderComponent ?? null;
    },
    useGridCardWidth: () => 240,
  };
});

import { ShopContent } from '../components/catalog/ShopContent';
import { flattenText } from './test-utils';
import { catalogData } from '../app/data/catalogData';
import { catalogLeaves } from '../app/data/catalogLeaves';
import { leafProducts } from '../app/data/leafProducts';
import { getSizeVariants } from '../app/data/sizeVariants';

const catalogSort = (value: string) => value;
type Props = Record<string, unknown>;

async function harness({ category = 'all', sort = 'priceLow' }: { category?: string; sort?: string } = {}) {
  const sortChanges: string[] = [];
  const categories: string[] = [];
  const base: Props = {
    category,
    catalogSort: sort,
    catalogOnly: true,
    saved: [],
    setCategory: (value: string) => categories.push(value),
    onCatalogSortChange: (value: string) => sortChanges.push(value),
    onProduct: () => {},
    onCart: () => {},
    onAccount: () => {},
    cartCount: 0,
    query: '',
    onQuery: () => {},
  };
  captured.current = [];
  const screen = await render(<ShopContent {...(base as any)} />);
  const last = () => captured.current[captured.current.length - 1];
  return { screen, last, sortChanges, categories };
}

const ids = (data: any[]) => data.map((p) => p.id);


function ordered(data: any[], descending: boolean) {
  expect(data.length).toBeGreaterThan(1);
  for (let i = 1; i < data.length; i++) {
    expect(Number.isFinite(data[i].o)).toBe(true);
    if (descending) expect(data[i - 1].o).toBeGreaterThanOrEqual(data[i].o);
    else expect(data[i - 1].o).toBeLessThanOrEqual(data[i].o);
  }
}

async function selectSort(screen: { root: any }, option: string) {
  const trigger = screen.root.queryAll(
    (node: any) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Sort products,'),
    {}
  )[0];
  expect(trigger).toBeTruthy();
  await fireEvent(trigger, 'press');
  const radio = screen.root.queryAll(
    (node: any) =>
      node.props.accessibilityRole === 'radio' && flattenText(node).includes(option),
    {}
  )[0];
  expect(radio).toBeTruthy();
  await fireEvent(radio, 'press');
}

test('actual Browse controls switch low/high/low repeatedly using displayed selling price, not list price', async () => {
  const h = await harness();
  const initial = h.last().data;
  ordered(initial, false);
  for (let i = 0; i < 3; i++) {
    await selectSort(h.screen, 'Price high to low');
    ordered(h.last().data, true);
    expect(h.last().data[0].o).toBe(Math.max(...initial.map((p: any) => p.o)));
    await selectSort(h.screen, 'Price low to high');
    ordered(h.last().data, false);
    expect(ids(h.last().data)).toEqual(ids(initial));
  }
  expect(h.sortChanges.length).toBe(6);
});

test('changing sort invalidates the virtualized list anchor/layout cache instead of reusing an old product position', async () => {
  const h = await harness();
  const lowMount = h.last().__mount;
  await selectSort(h.screen, 'Price high to low');
  const highMount = h.last().__mount;
  expect(highMount).toBeGreaterThan(lowMount); // a new ordering remounts the list: fresh anchor and scroll position
  await selectSort(h.screen, 'Price low to high');
  expect(h.last().__mount).toBeGreaterThan(highMount);
});

test('category, subcategory and leaf filters survive both price sort directions', async () => {
  const leaf = catalogLeaves.find((entry: any) => (leafProducts as any)[entry.slug]?.length > 2);
  expect(leaf).toBeTruthy();
  const h = await harness({ category: leaf.category });
  // Drive the real BrowseNavigation: open the explorer, search the leaf, select it.
  const opener = h.screen.root.queryAll((node: any) => node.props.accessibilityLabel === 'All categories', {})[0];
  expect(opener).toBeTruthy();
  await fireEvent(opener, 'press');
  const search = h.screen.root.queryAll((node: any) => node.props.accessibilityLabel === 'Find a category', {})[0];
  await fireEvent.changeText(search, leaf.name);
  const row = h.screen.root.queryAll(
    (node: any) => typeof node.props.onStartShouldSetResponder === 'function' && flattenText(node).includes(leaf.name),
    {}
  )[0];
  await fireEvent(row, 'press');
  const before = ids(h.last().data).sort();
  expect(before.length).toBeGreaterThan(1);
  for (const option of ['Price high to low', 'Price low to high']) {
    await selectSort(h.screen, option);
    const data = h.last().data;
    ordered(data, option === 'Price high to low');
    expect(ids(data).sort()).toEqual(before);
    expect(data.every((p: any) => p.c === leaf.category && p.sc === leaf.subcategory)).toBe(true);
    expect(h.categories.length).toBe(1); // sorting must not reset category filters
  }
  void catalogData;
});

test('sorting never mutates the original catalog and family cards use the cheapest visible size price', async () => {
  const before = JSON.stringify(catalogData);
  const h = await harness();
  await selectSort(h.screen, 'Price high to low');
  await selectSort(h.screen, 'Price low to high');
  expect(JSON.stringify(catalogData)).toBe(before);
  const familyCards = h.last().data.filter((p: any) => p.sizeCount > 1);
  expect(familyCards.length).toBeGreaterThan(0);
  for (const card of familyCards) {
    const variants = getSizeVariants(card.id);
    expect(card.o).toBe(Math.min(...variants.map((v: any) => v.price)));
  }
});
