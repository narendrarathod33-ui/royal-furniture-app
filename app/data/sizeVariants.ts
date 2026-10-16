import { catalogData } from './catalogData';
import { dealsCatalog } from './dealsCatalog';
import { royalFurnitureData } from './royalFurnitureData';

/**
 * Size variants for products that the official Royal Furniture site sells in
 * several sizes ("### Size" step on the product page), but which the catalog
 * feed stores as one entry per size — e.g. "Nimbus Bed - 200x160 - Queen Size"
 * or "Sofable Sofa Ottoman Medium".
 *
 * Two things are provided here:
 *   1. getSizeVariants()      — every size of one product, for the detail
 *                               screen's size dropdown (price changes on pick).
 *   2. collapseSizeFamilies() — the reverse for listings: collapses sibling
 *                               size entries into ONE card per product, and
 *                               folds exact duplicate catalog entries.
 *
 * A family only ever groups entries that share a category AND subcategory, so
 * two differently-placed products can never be merged into one listing.
 */

type CatalogEntry = { id: string; n: string; c: string; sc?: string; o: number; l: number; pc?: number };

export type SizeVariant = {
  /** Catalog id of the sibling entry for this size. */
  id: string;
  /** Normalised size, e.g. "200x160" or "Large". */
  label: string;
  /** Size class, e.g. "Queen" (empty when the label is the size class itself). */
  sizeType: string;
  /** Full official product name for this size. */
  name: string;
  price: number;
  listPrice: number;
  discount: number;
};

/** Listing products gain the number of selectable sizes and the family name. */
export type WithSizeCount<T> = T & { sizeCount?: number; baseName?: string };

const DIMENSIONS =
  /[\s\-–—,]*\b(\d{2,3})\s*[x×*]\s*(\d{2,3})(?:\s*[x×*]\s*(\d{1,3}))?\s*(?:cm)?\b[\s\-–—,]*(super\s*king|king|queen|double|single|small|medium|large)?\s*(?:size)?\s*$/i;

const SIZE_WORD =
  /[\s\-–—,]+\b(super\s*king|king|queen|double|single|small|medium|large)\b\s*(?:size)?\s*$/i;

const titleCase = (value: string) => value.replace(/\b\w/g, (letter) => letter.toUpperCase());

const cleanBase = (value: string) =>
  value
    .replace(/-[0-9a-f]{6}$/i, '')
    .replace(/[\s\-–—,]*\bcm\b/i, '')
    .replace(/[\s\-–—,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

type ParsedSize = { base: string; label: string; sizeType: string };

/** Splits a catalog name into the product family name plus its size. */
function parseSizeName(name: string): ParsedSize | null {
  const dimensions = DIMENSIONS.exec(name);
  if (dimensions) {
    const label = [dimensions[1], dimensions[2], dimensions[3]].filter(Boolean).join('x');
    const sizeType = dimensions[4] ? titleCase(dimensions[4].replace(/\s+/g, ' ').trim()) : '';
    const base = cleanBase(name.slice(0, dimensions.index));
    if (!base) return null;
    return { base, label, sizeType };
  }

  const word = SIZE_WORD.exec(name);
  if (word) {
    const sizeType = titleCase(word[1].replace(/\s+/g, ' ').trim());
    const base = cleanBase(name.slice(0, word.index));
    if (!base) return null;
    return { base, label: sizeType, sizeType: '' };
  }

  return null;
}

/**
 * Family identity: the same product name inside the same category. The
 * subcategory is deliberately left out — a single product is often filed under
 * two of them (e.g. "Faye Lounge Large" under sofa beds and "Faye Lounge Small"
 * under corner sofas), and those are sizes of one product, not two products.
 */
const familyKey = (size: ParsedSize, entry: { c: string; sc?: string }) =>
  `${size.base.toLocaleLowerCase()}|${entry.c}`;

/** Normalised product name for spotting exact duplicate catalog entries. */
const nameKey = (name: string) =>
  name
    .replace(/-[0-9a-f]{6}$/i, '')
    .replace(/[\s\-–—,_]+/g, ' ')
    .trim()
    .toLocaleLowerCase();

function toVariant(entry: CatalogEntry, size: ParsedSize): SizeVariant {
  const listPrice = Number.isFinite(entry.l) && entry.l > entry.o ? entry.l : entry.o;
  return {
    id: entry.id,
    label: size.label,
    sizeType: size.sizeType,
    name: entry.n,
    price: entry.o,
    listPrice,
    discount: listPrice > entry.o ? Math.round((1 - entry.o / listPrice) * 100) : 0,
  };
}

/** Indexes one catalog: family key -> the sizes of that product. */
function buildDataset(entries: readonly CatalogEntry[]) {
  const grouped = new Map<string, { entry: CatalogEntry; size: ParsedSize }[]>();

  for (const entry of entries) {
    const size = parseSizeName(entry.n);
    if (!size) continue;
    const key = familyKey(size, entry);
    const bucket = grouped.get(key);
    if (bucket) bucket.push({ entry, size });
    else grouped.set(key, [{ entry, size }]);
  }

  const familyOfId = new Map<string, SizeVariant[]>();
  for (const members of grouped.values()) {
    const distinct = new Set(members.map((member) => member.size.label));
    if (members.length < 2 || distinct.size < 2) continue;

    const seen = new Set<string>();
    const variants: SizeVariant[] = [];
    for (const member of members) {
      const variant = toVariant(member.entry, member.size);
      const pair = `${variant.label}|${variant.price}`;
      if (seen.has(pair)) continue; // same size listed twice at the same price
      seen.add(pair);
      variants.push(variant);
    }
    if (variants.length < 2) continue;
    variants.sort((a, b) => a.price - b.price || a.label.localeCompare(b.label));
    for (const variant of variants) familyOfId.set(variant.id, variants);
  }
  return familyOfId;
}

// Each catalog is indexed on its own so a product never borrows the prices of a
// same-named product from a different catalog.
const datasets = [
  buildDataset(catalogData as unknown as readonly CatalogEntry[]),
  buildDataset(dealsCatalog as unknown as readonly CatalogEntry[]),
  buildDataset(royalFurnitureData.products as unknown as readonly CatalogEntry[]),
];

const stripVariantSuffix = (id: string) => id.replace(/::size=.*$/, '');

/** Every size of the product, cheapest first — empty when it has a single size. */
export function getSizeVariants(productId: string): SizeVariant[] {
  const id = stripVariantSuffix(productId);
  for (const dataset of datasets) {
    const variants = dataset.get(id);
    if (variants) return variants;
  }
  return [];
}

/** True when this product is sold in more than one selectable size. */
export function hasSizeDropdown(productId: string): boolean {
  return getSizeVariants(productId).length > 1;
}

/**
 * Collapses a listing so each product appears exactly once:
 *   - sibling size entries become one card (cheapest size, "From AED …"),
 *     carrying `sizeCount` for the "n sizes available" badge;
 *   - identical catalog entries (same name and price, hash-suffixed copies)
 *     are folded into a single card.
 * Order, categories and everything else are preserved.
 */
export function collapseSizeFamilies<T extends { id: string; n: string; c: string; sc?: string; o: number }>(
  products: readonly T[],
): WithSizeCount<T>[] {
  const parsed = products.map((product) => ({ product, size: parseSizeName(product.n) }));

  // Which families are genuine multi-size families inside this list?
  const labelsByFamily = new Map<string, Set<string>>();
  for (const { product, size } of parsed) {
    if (!size) continue;
    const key = familyKey(size, product);
    const labels = labelsByFamily.get(key) || new Set<string>();
    labels.add(size.label);
    labelsByFamily.set(key, labels);
  }
  const familyKeys = new Set<string>();
  for (const [key, labels] of labelsByFamily) {
    if (labels.size > 1) familyKeys.add(key);
  }

  // Cheapest size of each family becomes the single listing card.
  const representative = new Map<string, T>();
  for (const { product, size } of parsed) {
    if (!size || !familyKeys.has(familyKey(size, product))) continue;
    const key = familyKey(size, product);
    const current = representative.get(key);
    if (!current || product.o < current.o) representative.set(key, product);
  }

  const emittedFamilies = new Set<string>();
  const emittedDuplicates = new Set<string>();
  const collapsed: WithSizeCount<T>[] = [];
  for (const { product, size } of parsed) {
    const duplicateKey = `${nameKey(product.n)}|${product.o}`;
    if (emittedDuplicates.has(duplicateKey)) continue; // exact duplicate entry
    emittedDuplicates.add(duplicateKey);

    if (!size) {
      collapsed.push(product);
      continue;
    }
    const key = familyKey(size, product);
    if (!familyKeys.has(key)) {
      collapsed.push(product);
      continue;
    }
    const rep = representative.get(key);
    if (!rep || rep.id !== product.id) continue; // drop the sibling sizes
    if (emittedFamilies.has(key)) continue;
    emittedFamilies.add(key);
    collapsed.push({
      ...product,
      sizeCount: labelsByFamily.get(key)?.size || 1,
      baseName: size.base,
    });
  }
  return collapsed;
}
