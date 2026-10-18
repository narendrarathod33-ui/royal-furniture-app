import { collapseSizeFamilies } from './sizeVariants';
import { suggestFor } from './recommend';
import type { ListedProduct, Product } from '../../components/catalog/kit';

/**
 * Discovery rails for the product page: "You may also like" and
 * "Recently viewed". Both work on the family-collapsed catalog — one card per
 * size family — so a six-size bed never shows up here as a single-price card.
 * Cross-sell ranking comes from the recommend engine (catalog-driven, no
 * hand-picked items); both caps match the prototype (four visible pieces per
 * rail, six remembered views).
 */
const RAIL_SIZE = 4;

function collapsedReps(catalog: readonly Product[]): ListedProduct[] {
  return collapseSizeFamilies([...catalog]) as unknown as ListedProduct[];
}

/**
 * Cross-sell rail: ranked by the recommend engine (same subcategory first,
 * "complete the room" complements next, social-proof and deal boosts, price
 * affinity); never the product itself, never sold-out items.
 */
export function youMayAlsoLike(
  anchor: { id: string; c: string; sc?: string; o: number },
  catalog: readonly Product[],
): ListedProduct[] {
  return suggestFor(anchor, catalog, RAIL_SIZE).map((suggestion) => suggestion.product);
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
