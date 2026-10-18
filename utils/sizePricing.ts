/** Keep unknown prices last and preserve source order for equal prices. */
export function sortSizesByPrice<T extends { price?: number }>(options: readonly T[]): T[] {
  const price = (option: T) => typeof option.price === 'number' && Number.isFinite(option.price) && option.price > 0 ? option.price : Infinity;
  return [...options].sort((a, b) => price(a) - price(b));
}

/** Explicit customer/cart selections win; otherwise use the cheapest known size. */
export function selectSizeOption<T extends { key: string; label: string; price?: number }>(
  sortedOptions: readonly T[], selectedKey: string, cartSize?: string,
): T | undefined {
  return sortedOptions.find((option) => option.key === selectedKey)
    || (cartSize ? sortedOptions.find((option) => option.label === cartSize) : undefined)
    || sortedOptions[0];
}
