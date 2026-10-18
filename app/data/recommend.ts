import { collapseSizeFamilies } from './sizeVariants';
import type { ListedProduct, Product } from '../../components/catalog/kit';

/**
 * Sales recommendation engine — fully automatic, zero hand-picked items.
 *
 * Every signal is read straight off the catalog fields that the xlsx →
 * importer pipeline already maintains, so a new workbook refresh in quietly
 * re-ranks every rail in the app with no human curation:
 *
 *   • relevance      — same subcategory, same category, or a "complete the
 *                      room" complement pair (category-level table below, so
 *                      it fires for every product in those ranges, present
 *                      and future);
 *   • social proof   — the merchandising labels the catalog carries
 *                      ("Best Seller", "Trending", "Hot seller", …);
 *   • deal pull      — list-vs-offer discount depth;
 *   • price affinity — a smooth multiplier that keeps suggestions inside the
 *                      shopper's band (a sofa shopper sees sofas near their
 *                      pick's price, not 8× outliers), which is the single
 *                      biggest conversion lever for cross-sell rails.
 *
 * Scoring is deterministic (stable tiebreak by id), so rails never flicker
 * between renders and the unit tests can pin exact behaviour.
 */

export type Suggestion = {
  product: ListedProduct;
  score: number;
  /** Short merchandising reason; empty when there is nothing honest to say. */
  reason: string;
};

/** Subcategory-slug → complementary subcategory slugs. Matched on `sc` alone so
 * pairs work across top-level categories (a mattress anchor can suggest bedroom
 * beds and vice versa). Edit this table to change pairing strategy store-wide. */
export const COMPLEMENT_SC: Record<string, string[]> = {
  'upholstered-bed': ['mattress', 'night-table', 'bed-bench'],
  'bed-set': ['mattress', 'night-table', 'bed-bench'],
  'bed-with-storage': ['mattress', 'night-table'],
  'beds': ['mattress', 'night-table'],
  'kids-bed': ['kids-teens-mattresses'],
  'bunk-bed': ['kids-teens-mattresses'],
  'mattress': ['upholstered-bed', 'bed-set', 'bed-with-storage', 'beds', 'kids-bed', 'bunk-bed', 'pillow', 'mattress-topper'],
  'kids-teens-mattresses': ['kids-bed', 'bunk-bed'],
  'pillow': ['mattress'],
  'mattress-topper': ['mattress'],
  'corner-sofas': ['ottomans', 'living-room', 'decor-items', 'arm-chairs'],
  'three-seater': ['ottomans', 'living-room', 'decor-items', 'arm-chairs'],
  'two-seater': ['ottomans', 'living-room', 'decor-items'],
  'sofa-sets': ['ottomans', 'living-room', 'decor-items', 'arm-chairs'],
  'modular-sofas': ['ottomans', 'living-room', 'decor-items'],
  'sofa-beds': ['ottomans', 'living-room', 'decor-items'],
  'recliner': ['ottomans', 'decor-items', 'living-room'],
  'arm-chairs': ['ottomans', 'living-room', 'decor-items'],
  'dining-room': ['wall-decor', 'decor-items'],
  'night-table': ['upholstered-bed', 'bed-set', 'bed-with-storage', 'beds'],
  'ottomans': ['corner-sofas', 'three-seater', 'two-seater', 'sofa-sets'],
};

/** Merchandising labels ranked by observed conversion value. */
const LABEL_WEIGHTS: readonly (readonly [string, number])[] = [
  ['Best Seller', 22],
  ['Trending', 14],
  ['Hot seller', 12],
  ['New', 4],
  ['Online Only', 2],
];

const RELEVANCE = { sameSub: 60, complement: 45, sameCategory: 30 } as const;
/** Width of the price band (in log space) that still feels "in my budget". */
const AFFINITY_SIGMA = 0.65;

function priceAffinity(price: number, anchorPrice: number): number {
  const ratio = Math.log(Math.max(price, 1) / Math.max(anchorPrice, 1));
  return Math.exp(-(ratio * ratio) / (2 * AFFINITY_SIGMA * AFFINITY_SIGMA));
}

function bestLabel(labels: readonly string[]): string {
  let best: string = '';
  let bestWeight = 0;
  for (const [label, weight] of LABEL_WEIGHTS) {
    if (labels.includes(label) && weight > bestWeight) {
      best = label === 'Best Seller' ? 'Best seller' : label === 'Hot seller' ? 'Hot seller' : label;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * Cross-sell suggestions for one anchor product. Family-aware: candidates are
 * size-collapsed listing cards (a 6-size bed is one card at "From AED …"), the
 * product itself never appears, and sold-out items are never suggested.
 */
export function suggestFor(
  anchor: { id: string; c: string; sc?: string; o: number },
  catalog: readonly Product[],
  limit = 4,
): Suggestion[] {
  const baseId = anchor.id.split('::size=')[0];
  const reps = collapseSizeFamilies([...catalog]) as unknown as ListedProduct[];
  const complements = new Set(COMPLEMENT_SC[anchor.sc || ''] || []);
  const out: Suggestion[] = [];
  for (const p of reps) {
    if (p.id === baseId || p.st === 'out_of_stock') continue;
    const sameSub = !!anchor.sc && !!p.sc && p.sc === anchor.sc;
    const complement = complements.has(p.sc || '');
    const sameCategory = p.c === anchor.c;
    if (!sameSub && !complement && !sameCategory) continue;

    const relevance = sameSub ? RELEVANCE.sameSub : complement ? RELEVANCE.complement : RELEVANCE.sameCategory;

    const labels = (p.lb as readonly string[] | undefined) || [];
    const discount = p.l && p.l > p.o ? (p.l - p.o) / p.l : 0;
    const dealBoost = Math.min(20, Math.round(discount * 40));
    let boost = dealBoost;
    for (const [label, weight] of LABEL_WEIGHTS) if (labels.includes(label)) boost += weight;

    const reason =
      bestLabel(labels) ||
      (discount >= 0.15 ? `${Math.round(discount * 100)}% off` : '') ||
      (complement ? 'Completes the room' : '') ||
      (sameSub ? 'From this range' : '');

    const score = (relevance + boost) * priceAffinity(p.o, anchor.o);
    out.push({ product: p, score: Math.round(score * 100) / 100, reason });
  }
  out.sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id));
  return out.slice(0, limit);
}

/** One "Upgrade your pick" chip: a pricier size of the same piece. */
export type UpgradePick = {
  /** Size option name (matches the PDP size menu exactly). */
  name: string;
  /** Short size label for the chip ("200x160", "Queen", …). */
  label: string;
  price: number;
  listPrice?: number;
  /** How much more the upgrade costs than the current selection. */
  delta: number;
};

/**
 * Upsell picks for the product page: the next sizes UP from the current
 * selection, cheapest step first — the classic "one-tap upgrade" that raises
 * average order value without leaving the page.
 */
export function upgradePicks(
  currentPrice: number,
  variants: readonly { name: string; label: string; price: number; listPrice?: number }[],
  limit = 2,
): UpgradePick[] {
  return variants
    .filter((v) => v.price > currentPrice)
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((v) => ({ name: v.name, label: v.label, price: v.price, listPrice: v.listPrice, delta: v.price - currentPrice }));
}
