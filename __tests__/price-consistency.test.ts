import { getSizeVariants, collapseSizeFamilies } from '../app/data/sizeVariants';
import { officialSizeFloor } from '../app/data/officialSizes';
import { catalogData } from '../app/data/catalogData';
import { youMayAlsoLike, recentProducts } from '../app/data/discovery';
import { suggestForCart } from '../app/data/recommend';
import { upgradePicks } from '../app/data/recommend';
import type { ListedProduct, Product } from '../components/catalog/kit';

/**
 * Price-consistency contract (the "random prices" guard): whatever a card or
 * rail shows must be the price of a real size. A family card's "From" price is
 * the CHEAPEST size's price, and it must equal what the product page charges
 * for that same cheapest size — if the workbook ever drifts from the official
 * size list, this fails loudly instead of showing shoppers invented prices.
 */
const catalog = catalogData as unknown as Product[];

function cheapestVariantPrice(id: string): number | undefined {
  const variants = getSizeVariants(id).map((v) => v.price);
  const floor = officialSizeFloor(id);
  const prices = [...variants, ...(floor ? [floor.price] : [])];
  return prices.length ? Math.min(...prices) : undefined;
}

test('every family card price equals its cheapest real size', () => {
  const reps = collapseSizeFamilies([...catalog]) as unknown as ListedProduct[];
  const families = reps.filter((r) => (r.sizeCount || 0) > 1);
  expect(families.length).toBeGreaterThan(0);
  for (const family of families) {
    const minVariant = cheapestVariantPrice(family.id);
    expect(minVariant).toBeDefined();
    expect(family.o).toBe(minVariant);
  }
});

test('single-size products carry their one real price', () => {
  const reps = collapseSizeFamilies([...catalog]) as unknown as ListedProduct[];
  for (const rep of reps) {
    if ((rep.sizeCount || 0) > 1) continue;
    const single = cheapestVariantPrice(rep.id);
    if (single !== undefined) expect(rep.o).toBe(single);
  }
});

test('suggestion rails only ever show the same honest prices', () => {
  const reps = collapseSizeFamilies([...catalog]) as unknown as ListedProduct[];
  const anchor = reps[0];
  const suggestions = [
    ...youMayAlsoLike(anchor, catalog),
    ...recentProducts(reps.slice(1, 6).map((r) => r.id), anchor.id, catalog),
    ...suggestForCart([{ id: anchor.id, c: anchor.c, sc: anchor.sc, o: anchor.o }], catalog).map((s) => s.product),
  ];
  expect(suggestions.length).toBeGreaterThan(0);
  for (const product of suggestions) {
    const minVariant = cheapestVariantPrice(product.id);
    if (minVariant !== undefined) expect(product.o).toBe(minVariant);
  }
});

test('upgrade chips: cheapest step up first, delta from the displayed price', () => {
  const variants = [
    { name: '190x90 · Single', label: '190x90', price: 1309 },
    { name: '200x100 · Single', label: '200x100', price: 1386 },
    { name: '200x120 · Double', label: '200x120', price: 1595 },
    { name: '200x140 · Double', label: '200x140', price: 1862 },
  ];
  const displayed = 1309;
  const picks = upgradePicks(displayed, variants, 2);
  expect(picks.map((p) => p.label)).toEqual(['200x100', '200x120']);
  expect(picks[0].delta).toBe(1386 - 1309);
  expect(picks[1].delta).toBe(1595 - 1309);
});

test('no card sits above the official size floor (feed base-row arithmetic)', () => {
  // Feed rows like "The Wire Bed @ AED 1,505" carry flat-discount arithmetic,
  // not a real size price — the site charges AED 1,092 for the cheapest size.
  // Every collapsed card must show the official floor when it is lower.
  const reps = collapseSizeFamilies([...catalog]) as unknown as ListedProduct[];
  let floored = 0;
  for (const rep of reps) {
    const floor = officialSizeFloor(rep.id);
    if (!floor || floor.price >= rep.o) continue;
    // (unreachable when the fix holds — the collapse itself floors the card)
    expect(rep.o).toBe(floor.price);
  }
  for (const entry of catalog) {
    const floor = officialSizeFloor(entry.id);
    if (floor && floor.price < entry.o) floored += 1;
  }
  expect(floored).toBeGreaterThan(50); // the dataset still has this class of rows
});

test('regression: the wire-bed rail chip shows the real from-price (AED 1,092)', () => {
  const suggestions = suggestForCart(
    [{ id: 'tulip-7-zone-pocket-spring-mattress::size=Queen%20-%20200x160', c: 'bedroom', sc: 'mattress', o: 1435 }],
    catalog,
  );
  expect(suggestions.length).toBeGreaterThan(0);
  for (const suggestion of suggestions) {
    const floor = officialSizeFloor(suggestion.product.id);
    if (floor) expect(suggestion.product.o).toBeLessThanOrEqual(floor.price);
  }
  const wire = suggestions.find((s) => /wire-bed/.test(s.product.id));
  if (wire) expect(wire.product.o).toBe(1092);
});

