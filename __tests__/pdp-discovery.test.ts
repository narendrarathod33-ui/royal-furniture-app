import { youMayAlsoLike, recentProducts } from '../app/data/discovery';
import { suggestFor, suggestForCart, upgradePicks, COMPLEMENT_SC } from '../app/data/recommend';
import { catalogData } from '../app/data/catalogData';
import { collapseSizeFamilies, getSizeVariants } from '../app/data/sizeVariants';
import { RECENT_LIMIT, sanitizeRecentIds, useRecentlyViewedStore } from '../stores/recentlyViewed';
import type { ListedProduct, Product } from '../components/catalog/kit';

const catalog = catalogData as unknown as Product[];
const reps = collapseSizeFamilies([...catalog]) as unknown as ListedProduct[];

beforeEach(() => {
  useRecentlyViewedStore.getState().clear();
});

test('cross-sell is relevant, in-stock, self-free and deterministic', () => {
  const p = reps.find((r) => r.sc && reps.filter((x) => x.sc === r.sc).length > 6)!;
  const run = () => youMayAlsoLike(p, catalog);
  const first = run();
  expect(first).toHaveLength(4);
  expect(first.map((r) => r.id)).not.toContain(p.id);
  expect(run()).toEqual(first); // deterministic: rails never flicker
  const suggestions = suggestFor(p, catalog, 24);
  const allowed = new Set([p.sc, p.c, ...(COMPLEMENT_SC[p.sc!] || [])]);
  for (const s of suggestions) {
    expect(s.product.st).not.toBe('out_of_stock');
    expect(allowed.has(s.product.sc) || allowed.has(s.product.c)).toBe(true);
  }
});

test('social proof lifts: a Best Seller outranks an equal-priced peer without labels', () => {
  const anchor = { id: 'anchor', c: 'sofas', sc: 'ottomans', o: 1000 };
  const pool = [
    { id: 'a-best', n: 'A', c: 'sofas', sc: 'ottomans', o: 900, l: 900, st: 'in_stock', lb: ['Best Seller'] },
    { id: 'b-plain', n: 'B', c: 'sofas', sc: 'ottomans', o: 900, l: 900, st: 'in_stock', lb: [] },
  ] as unknown as Product[];
  const ranked = suggestFor(anchor, pool, 2);
  expect(ranked.map((s) => s.product.id)).toEqual(['a-best', 'b-plain']);
  expect(ranked[0].reason).toBe('Best seller');
});

test('price affinity: an 8x pricier same-range item loses to one in the budget band', () => {
  const anchor = { id: 'anchor', c: 'sofas', sc: 'ottomans', o: 1000 };
  const pool = [
    { id: 'near', n: 'Near', c: 'sofas', sc: 'ottomans', o: 1100, l: 1100, st: 'in_stock', lb: [] },
    { id: 'far', n: 'Far', c: 'sofas', sc: 'ottomans', o: 8000, l: 8000, st: 'in_stock', lb: [] },
  ] as unknown as Product[];
  expect(suggestFor(anchor, pool, 2).map((s) => s.product.id)).toEqual(['near', 'far']);
});

test('complete-the-room: a mattress anchor suggests beds across categories', () => {
  const anchor = { id: 'mat-1', c: 'cooltech-mattress', sc: 'mattress', o: 1500 };
  const pool = [
    { id: 'bed-1', n: 'Bed', c: 'bedroom', sc: 'upholstered-bed', o: 1600, l: 1800, st: 'in_stock', lb: [] },
    { id: 'sofa-1', n: 'Sofa', c: 'sofas', sc: 'corner-sofas', o: 1600, l: 1800, st: 'in_stock', lb: [] },
  ] as unknown as Product[];
  const ranked = suggestFor(anchor, pool, 2);
  expect(ranked[0].product.id).toBe('bed-1');
  expect(ranked[0].reason).toBe('Completes the room');
  expect(ranked.map((s) => s.product.id)).not.toContain('sofa-1');
});

test('rail cards stay family reps with honest size counts', () => {
  const family = reps.find((r) => (r.sizeCount || 0) > 1)!;
  for (const r of youMayAlsoLike(family, catalog)) {
    expect(r.sizeCount || 1).toBe(Math.max(1, getSizeVariants(r.id).length));
  }
});

test('upsell chips: only pricier sizes, cheapest step first, exact deltas, capped at two', () => {
  const variants = [
    { name: 'Small', label: '90x200', price: 800, listPrice: 1000 },
    { name: 'Medium', label: '120x200', price: 1000, listPrice: 1300 },
    { name: 'Large', label: '160x200', price: 1300, listPrice: 1700 },
    { name: 'King', label: '180x200', price: 1600, listPrice: 2100 },
  ];
  const picks = upgradePicks(1000, variants);
  expect(picks.map((p) => p.label)).toEqual(['160x200', '180x200']);
  expect(picks[0].delta).toBe(300);
  expect(picks[1].delta).toBe(600);
  expect(upgradePicks(1600, variants)).toEqual([]); // top size: nothing to upsell
});

test('cart cross-sell: empty-safe, complements first, cart items never re-suggested', () => {
  expect(suggestForCart([], catalog)).toEqual([]);

  // A mattress in the bag: the engine should pull beds ("complete the room"),
  // never the mattress itself and never another mattress first.
  const mattress = reps.find((r) => r.sc === 'mattress')!;
  const picks = suggestForCart([{ id: mattress.id, c: mattress.c, sc: mattress.sc, o: mattress.o }], catalog);
  expect(picks.length).toBeGreaterThan(0);
  expect(picks.length).toBeLessThanOrEqual(4);
  expect(picks.map((s) => s.product.id)).not.toContain(mattress.id);
  const bedSlugs = ['upholstered-bed', 'bed-set', 'bed-with-storage', 'beds', 'kids-bed', 'bunk-bed'];
  expect(bedSlugs.includes(picks[0].product.sc || '')).toBe(true);

  // A size-variant cart line (::size= id) still excludes the whole family.
  const variantPicks = suggestForCart([{ id: `${mattress.id}::size=${encodeURIComponent('180x200')}`, c: mattress.c, sc: mattress.sc, o: mattress.o }], catalog);
  expect(variantPicks.map((s) => s.product.id)).not.toContain(mattress.id);
  expect(variantPicks.map((s) => s.product.id)).toEqual(picks.map((s) => s.product.id)); // deterministic

  // Synthetic pool: bed in the bag pulls its complements, not another bed.
  const pool = [
    { id: 'cart-bed', n: 'Cart Bed', c: 'bedroom', sc: 'upholstered-bed', o: 2000, l: 2000, st: 'in_stock', lb: [] },
    { id: 'mat-2', n: 'Mattress', c: 'cooltech-mattress', sc: 'mattress', o: 1500, l: 1800, st: 'in_stock', lb: [] },
    { id: 'bed-9', n: 'Other Bed', c: 'bedroom', sc: 'beds', o: 1900, l: 1900, st: 'in_stock', lb: [] },
  ] as unknown as Product[];
  const ranked = suggestForCart([{ id: 'cart-bed', c: 'bedroom', sc: 'upholstered-bed', o: 2000 }], pool);
  expect(ranked.map((s) => s.product.id)).not.toContain('cart-bed');
  expect(ranked.map((s) => s.product.id).slice(0, 2)).toEqual(['mat-2', 'bed-9']); // complement outranks same-category
});

test('recently viewed is most-recent first, excludes the current piece and drops unknown ids', () => {
  const [a, b] = reps;
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
