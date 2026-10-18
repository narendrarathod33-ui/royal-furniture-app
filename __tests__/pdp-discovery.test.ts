import { relatedProducts, recentProducts } from '../app/data/discovery';
import { catalogData } from '../app/data/catalogData';
import { collapseSizeFamilies, getSizeVariants } from '../app/data/sizeVariants';
import { RECENT_LIMIT, sanitizeRecentIds, useRecentlyViewedStore } from '../stores/recentlyViewed';
import type { ListedProduct, Product } from '../components/catalog/kit';

const catalog = catalogData as unknown as Product[];
const reps = collapseSizeFamilies([...catalog]) as unknown as ListedProduct[];

beforeEach(() => {
  useRecentlyViewedStore.getState().clear();
});

test('related picks same-subcategory pieces first and never the product itself', () => {
  const p = reps.find((r) => (r.sc ? reps.filter((x) => x.sc === r.sc).length > 4 : false))!;
  const rel = relatedProducts(p, catalog);
  expect(rel).toHaveLength(4);
  expect(rel.map((r) => r.id)).not.toContain(p.id);
  // Every suggestion comes from the same subcategory (there are enough).
  for (const r of rel) expect(r.sc).toBe(p.sc);
});

test('related falls back to the category when the subcategory is thin', () => {
  // A product in a subcategory with a single piece still gets suggestions.
  const lonely = reps.find((r) => r.sc && reps.filter((x) => x.sc === r.sc).length === 1)!;
  const rel = relatedProducts(lonely, catalog);
  expect(rel.length).toBeGreaterThan(0);
  expect(rel.map((r) => r.id)).not.toContain(lonely.id);
  for (const r of rel) expect(r.c).toBe(lonely.c);
});

test('rail products are family reps: multi-size entries carry sizeCount', () => {
  const family = reps.find((r) => (r.sizeCount || 0) > 1)!;
  for (const r of relatedProducts(family, catalog)) {
    expect(r.sizeCount || 1).toBe(Math.max(1, getSizeVariants(r.id).length));
  }
});

test('recently viewed is most-recent first, excludes the current piece and drops unknown ids', () => {
  const [a, b, c] = reps;
  useRecentlyViewedStore.getState().record(a.id);
  useRecentlyViewedStore.getState().record(b.id);
  useRecentlyViewedStore.getState().record(a.id); // revisit moves it back to front
  expect(useRecentlyViewedStore.getState().ids).toEqual([a.id, b.id]);
  useRecentlyViewedStore.getState().record('no-such-product');
  const list = recentProducts([...useRecentlyViewedStore.getState().ids, 'ghost-id'], a.id, catalog);
  expect(list.map((r) => r.id)).toEqual([b.id]);
});

test('record caps history and recent rail shows at most four', () => {
  for (const r of reps.slice(0, 12)) useRecentlyViewedStore.getState().record(r.id);
  expect(useRecentlyViewedStore.getState().ids).toHaveLength(RECENT_LIMIT);
  const list = recentProducts(useRecentlyViewedStore.getState().ids, undefined, catalog);
  expect(list).toHaveLength(4);
});

test('corrupt saved history sanitizes to plain string ids (bad data never blanks the page)', () => {
  expect(sanitizeRecentIds(undefined)).toEqual([]);
  expect(sanitizeRecentIds({ ids: 'x' })).toEqual([]);
  expect(sanitizeRecentIds([42, null, 'ok-id', '', { id: 'obj' }, 'ok-id'])).toEqual(['ok-id']);
  expect(sanitizeRecentIds(Array.from({ length: 20 }, (_, i) => `id-${i}`)).length).toBe(RECENT_LIMIT);
});
