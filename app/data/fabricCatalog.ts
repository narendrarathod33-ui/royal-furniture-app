import rawManifest from './fabricManifest.json';
import type { Fabric, FabricProduct, FabricType } from './fabrics';

type RawSizeVariant = {
  size: string;
  sku?: string | null;
  available: boolean | null;
  stock?: number | null;
  price?: number | null;
  listPrice?: number | null;
  priceDelta?: number | null;
};
type RawColour = {
  id: string;
  name: string;
  officialName?: string;
  code?: string | null;
  hex?: string | null;
  fabricColorId?: number | null;
  closeupSourceUrl?: string | null;
  closeupPath?: string | null;
  swatchPath?: string | null;
  variantPath?: string | null;
  variantKind?: string;
  current?: boolean;
  available?: boolean | null;
  priceDelta?: number | null;
  previewUnavailable?: boolean;
  sizeVariants?: RawSizeVariant[];
};
type RawType = {
  id: string;
  name: string;
  swatchPath?: string;
  swatchThumbPath?: string;
  colours: RawColour[];
};
type RawProduct = {
  id: string;
  name: string;
  slug: string;
  sourceUrl: string;
  productPageUrl: string;
  baseImageSourceUrl?: string | null;
  hasOptions: boolean;
  fabricTypes: RawType[];
};
type Manifest = { version: number; harvestedAt: string; products: Record<string, RawProduct> };

const manifest = rawManifest as Manifest;
const cache = new Map<string, FabricProduct>();

function convert(product: RawProduct): FabricProduct {
  const fabricTypes: FabricType[] = product.fabricTypes.map((type) => ({
    id: type.id,
    name: type.name,
    swatchImage: type.swatchThumbPath || type.swatchPath,
    sourceUrl: product.sourceUrl,
    colours: type.colours.map((colour): Fabric => ({
      id: `${type.id}::${colour.id}`,
      colourId: colour.id,
      fabricTypeId: type.id,
      fabricTypeName: type.name,
      name: colour.name,
      officialName: colour.officialName,
      code: colour.code || undefined,
      hex: colour.hex || '',
      fabricColorId: colour.fabricColorId ?? undefined,
      textureImage: colour.closeupPath || undefined,
      closeupImage: colour.closeupPath || undefined,
      swatchImage: colour.swatchPath || colour.closeupPath || undefined,
      variantImage: colour.variantPath || undefined,
      variantKind: colour.variantKind === 'official' || colour.variantKind === 'rendered' ? colour.variantKind : 'unavailable',
      previewUnavailable: !!colour.previewUnavailable,
      isCurrent: !!colour.current,
      inStock: colour.available !== false,
      availability: colour.available ?? null,
      priceDelta: typeof colour.priceDelta === 'number' ? colour.priceDelta : undefined,
      sizeVariants: colour.sizeVariants?.map((variant) => ({ ...variant, sku: variant.sku ?? undefined })),
      sourceUrl: product.sourceUrl,
    })),
  }));
  return {
    id: product.id,
    fabricTypes,
    fabrics: fabricTypes.flatMap((type) => type.colours),
  };
}

/** Same immutable official manifest used by PDP, customization and design tools. */
export function getFabricProduct(productId: string): FabricProduct | undefined {
  const id = productId.split('::size=')[0];
  if (cache.has(id)) return cache.get(id);
  const raw = manifest.products[id];
  if (!raw?.hasOptions) return undefined;
  const converted = convert(raw);
  cache.set(id, converted);
  return converted;
}

export function hasFabricManifestRecord(productId: string): boolean {
  return !!manifest.products[productId.split('::size=')[0]];
}

export const fabricManifestMetadata = Object.freeze({
  version: manifest.version,
  harvestedAt: manifest.harvestedAt,
  matchedProducts: Object.keys(manifest.products).length,
});
