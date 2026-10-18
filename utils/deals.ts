import { collapseSizeFamilies } from '../app/data/sizeVariants';

export type DealProduct = { id: string; n: string; c: string; o: number; l: number; pc?: number };
export type DealFilters = { category: string; discount: number; price: string; sort: string };
export const DEFAULT_DEAL_FILTERS: DealFilters = { category: 'all', discount: 41, price: 'all', sort: 'priceLow' };
export const DEAL_DISCOUNTS = [[41, 'Over 40%'], [50, '50% or more'], [60, '60% or more'], [70, '70% or more']] as const;
export const DEAL_PRICES = [['all', 'Any price'], ['under500', 'Under AED 500'], ['500to1500', 'AED 500–1,500'], ['over1500', 'Over AED 1,500']] as const;
export const DEAL_SORTS = [['priceLow', 'Price: low to high'], ['priceHigh', 'Price: high to low'], ['discount', 'Biggest discount'], ['name', 'Name: A to Z']] as const;
const discountOf = (p: DealProduct) => p.pc || (p.l > p.o ? Math.round((1 - p.o / p.l) * 100) : 0);

/** Keep the existing deal eligibility, price boundaries and size-family behavior. */
export function selectDeals<T extends DealProduct>(products: readonly T[], filters: DealFilters, query = '') {
  return collapseSizeFamilies(products.filter(p => discountOf(p) >= filters.discount
    && (filters.category === 'all' || p.c === filters.category)
    && p.n.toLowerCase().includes(query.toLowerCase())
    && (filters.price === 'all' || (filters.price === 'under500' && p.o < 500)
      || (filters.price === '500to1500' && p.o >= 500 && p.o <= 1500)
      || (filters.price === 'over1500' && p.o > 1500)))
    .sort((a, b) => filters.sort === 'priceLow' ? a.o - b.o : filters.sort === 'priceHigh' ? b.o - a.o
      : filters.sort === 'name' ? a.n.localeCompare(b.n) : discountOf(b) - discountOf(a)));
}
export function activeDealFilterCount(filters: DealFilters) {
  return Number(filters.category !== 'all') + Number(filters.discount !== 41) + Number(filters.price !== 'all');
}
