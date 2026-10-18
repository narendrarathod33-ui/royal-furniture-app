import { collapseSizeFamilies } from './sizeVariants';
import type { ListedProduct, Product } from '../../components/catalog/kit';

/**
 * Discovery rails for the product page: "You may also like" and
 * "Recently viewed". Both work on the family-collapsed catalog — one card per
 * size family — so a six-size bed never shows up here as a single-price card,
 * and both caps match the prototype (four visible pieces per rail).
 */
const RAIL_SIZE = 4;

function collapsedReps(catalog: readonly Product[]): ListedProduct[] {
  return collapseSizeFamilies([...catalog]) as unknown as ListedProduct[];
}

/** Same subcategory first, then same category; never the product itself. */
export function relatedProducts(product: { id: string; c: string; sc?: string }, catalog: readonly Product[]): ListedProduct[] {
  const reps = collapsedReps(catalog);
  const sameSub = product.sc ? reps.filter((p) => p.id !== product.id && p.sc === product.sc) : [];
  const sameCat = reps.filter((p) => p.id !== product.id && p.c === product.c);
  const seen = new Set<string>();
  const out: ListedProduct[] = [];
  for (const p of [...sameSub, ...sameCat]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length === RAIL_SIZE) break;
  }
  return out;
}

/** Recorded ids, most-recent first; unknown ids and dropped size siblings fall away. */
export function recentProducts(ids: readonly string[], currentId: string | undefined, catalog: readonly Product[]): ListedProduct[] {
  const reps = collapsedReps(catalog);
  const byId = new Map(reps.map((p) => [p.id, p] as const));
  const seen = new Set<string>();
  const out: ListedProduct[] = [];
  for (const id of ids) {
    if (id === currentId) continue;
    const rep = byId.get(id);
    if (!rep || seen.has(rep.id)) continue;
    seen.add(rep.id);
    out.push(rep);
    if (out.length === RAIL_SIZE) break;
  }
  return out;
}
