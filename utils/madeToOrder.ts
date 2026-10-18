export type MadeToOrderProduct = { id: string; n: string; c: string; scn?: string; d?: string; lb?: readonly string[]; o: number };
export type CustomizationFilters = { category: string; query: string; sort: string };
export const DEFAULT_CUSTOMIZATION_FILTERS: CustomizationFilters = { category: 'all', query: '', sort: 'featured' };

/** Eligibility comes only from an explicit marker in the existing product list.
 * Size/color selectors or a customizable flag alone do not qualify a product. */
export function isExplicitlyMadeToOrder(product: MadeToOrderProduct) {
  const marker = /\bmade[\s-]+to[\s-]+order\b/i;
  return (product.lb || []).some(label => /^made[\s-]+to[\s-]+order$/i.test(label.trim()))
    || marker.test(product.d || '');
}
export function selectMadeToOrder<T extends MadeToOrderProduct>(products: readonly T[], filters: CustomizationFilters) {
  return products.filter(isExplicitlyMadeToOrder)
    .filter(p => (filters.category === 'all' || p.c === filters.category)
      && `${p.n} ${p.scn || ''}`.toLowerCase().includes(filters.query.trim().toLowerCase()))
    .sort((a, b) => filters.sort === 'priceLow' ? a.o - b.o : filters.sort === 'priceHigh' ? b.o - a.o : 0);
}
