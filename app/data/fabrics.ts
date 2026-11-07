import type { ImageSourcePropType } from 'react-native';
import { generatedFabricImageAssets } from './fabricAssets';

export type FabricSizeVariant = {
  size: string;
  sku?: string;
  available: boolean | null;
  stock?: number | null;
  price?: number | null;
  listPrice?: number | null;
  /** Null means the website did not expose both values needed for a comparison. */
  priceDelta?: number | null;
};

/** One real fabric-type/colour combination from the official variant tree. */
export type Fabric = {
  /** Stable combination id, unique within a product and safe for cart identity. */
  id: string;
  colourId?: string;
  fabricTypeId?: string;
  fabricTypeName?: string;
  name: string;
  officialName?: string;
  /** Official site code, retained even when it is not a six-digit CSS colour. */
  code?: string;
  /** Empty when the official value is missing/malformed; never invented. */
  hex: string;
  fabricColorId?: number;
  textureImage?: string;
  swatchImage?: string;
  closeupImage?: string;
  variantImage?: string;
  variantKind?: 'official' | 'rendered' | 'unavailable';
  previewUnavailable?: boolean;
  isCurrent?: boolean;
  /** Backwards-compatible stock flag; unknown availability remains selectable. */
  inStock: boolean;
  availability?: boolean | null;
  /** Added to the selected size's current/list prices. Omit when unknown/zero. */
  priceDelta?: number;
  sizeVariants?: readonly FabricSizeVariant[];
  sku?: string;
  sourceUrl?: string;
};

export type FabricType = {
  id: string;
  name: string;
  swatchImage?: string;
  sourceUrl?: string;
  colours: readonly Fabric[];
};

/** Small serialisable snapshot persisted in choices, carts, wishlists and orders. */
export type FabricSelection = {
  id: string;
  colourId?: string;
  fabricTypeId?: string;
  fabricTypeName?: string;
  name: string;
  officialName?: string;
  code?: string;
  hex: string;
  priceDelta: number;
  swatchImage?: string;
  closeupImage?: string;
  variantImage?: string;
  previewUnavailable?: boolean;
  isCurrent?: boolean;
  sku?: string;
};

export type FabricProduct = {
  id: string;
  /** Generated official groups. Products without them keep their original UI. */
  fabricTypes?: readonly FabricType[];
  /** Flat compatibility list, also used by the pre-manifest saved data. */
  fabrics?: readonly Fabric[];
  /** Transparent PNG aligned with the primary product photo; upholstery is white. */
  maskImage?: string;
  selectedFabric?: FabricSelection;
};

const legacyImageAssets: Record<string, ImageSourcePropType> = {
  'serafina-corner-sofa.png': require('../../assets/images/fabric-masks/serafina-corner-sofa.png'),
  'trento-single-seater-sofa.png': require('../../assets/images/fabric-masks/trento-single-seater-sofa.png'),
};

export function resolveFabricImage(source?: string | ImageSourcePropType): ImageSourcePropType | undefined {
  if (!source) return undefined;
  if (typeof source !== 'string') return source;
  const local = generatedFabricImageAssets[source] || legacyImageAssets[source];
  if (local) return local;
  if (/^(?:https?:|data:|blob:|file:)/i.test(source)) return { uri: source };
  return undefined;
}

export function fabricPriceDelta(fabric?: Pick<Fabric, 'priceDelta'> | FabricSelection): number {
  const value = fabric?.priceDelta;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function toFabricSelection(fabric: Fabric): FabricSelection {
  return {
    id: fabric.id,
    colourId: fabric.colourId,
    fabricTypeId: fabric.fabricTypeId,
    fabricTypeName: fabric.fabricTypeName,
    name: fabric.name,
    officialName: fabric.officialName,
    code: fabric.code,
    hex: fabric.hex,
    priceDelta: fabricPriceDelta(fabric),
    swatchImage: fabric.swatchImage,
    closeupImage: fabric.closeupImage,
    variantImage: fabric.variantImage,
    previewUnavailable: fabric.previewUnavailable,
    isCurrent: fabric.isCurrent,
    sku: fabric.sku,
  };
}

export function fabricsForProduct(product: Pick<FabricProduct, 'fabricTypes' | 'fabrics'>): readonly Fabric[] {
  if (product.fabricTypes?.length) return product.fabricTypes.flatMap((type) => type.colours);
  return product.fabrics || [];
}

export function fabricGroupsForProduct(product: Pick<FabricProduct, 'fabricTypes' | 'fabrics'>): readonly FabricType[] {
  if (product.fabricTypes?.length) return product.fabricTypes;
  const fabrics = product.fabrics || [];
  return fabrics.length ? [{ id: 'fabric', name: 'Fabric', colours: fabrics }] : [];
}

const normalSize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Apply only the website's exact per-size stock/price/SKU, never an estimate. */
export function fabricForSize(fabric: Fabric, size?: string): Fabric {
  if (!size || !fabric.sizeVariants?.length) return fabric;
  const wanted = normalSize(size);
  const match = fabric.sizeVariants.find((variant) => normalSize(variant.size) === wanted)
    || fabric.sizeVariants.find((variant) => {
      const candidate = normalSize(variant.size);
      return wanted.length >= 5 && (candidate.includes(wanted) || wanted.includes(candidate));
    });
  if (!match) return fabric;
  return {
    ...fabric,
    inStock: match.available !== false,
    availability: match.available,
    priceDelta: typeof match.priceDelta === 'number' ? match.priceDelta : undefined,
    sku: match.sku,
  };
}

/** Restore a valid available selection; otherwise prefer Current Fabric. */
export function initialFabric(product: Pick<FabricProduct, 'fabricTypes' | 'fabrics' | 'selectedFabric'>, size?: string): Fabric | undefined {
  const options = fabricsForProduct(product).map((fabric) => fabricForSize(fabric, size));
  if (!options.length) return undefined;
  const saved = product.selectedFabric;
  return options.find((fabric) => fabric.inStock && fabric.id === saved?.id)
    || options.find((fabric) => fabric.inStock && fabric.isCurrent)
    || options.find((fabric) => fabric.inStock);
}

/** Fabric identity is separate from product/size identity in the cart. */
export function fabricCartLineId(product: Pick<FabricProduct, 'id' | 'selectedFabric'>): string {
  const fabricId = product.selectedFabric?.id;
  return fabricId ? `${product.id}::fabric=${encodeURIComponent(fabricId)}` : product.id;
}

/** Adds a saved fabric to a base catalogue product exactly once. */
export function productWithFabric<T extends { o: number; l?: number }>(product: T, fabric?: FabricSelection): T & { selectedFabric?: FabricSelection } {
  if (!fabric) return product;
  const delta = fabricPriceDelta(fabric);
  return {
    ...product,
    o: Math.max(0, product.o + delta),
    ...(typeof product.l === 'number' && product.l > 0 ? { l: Math.max(0, product.l + delta) } : {}),
    selectedFabric: { ...fabric, priceDelta: delta },
  };
}

/** Shared wording for cart, checkout, WhatsApp and enquiry summaries. */
export function fabricSelectionLabel(fabric: FabricSelection): string {
  const type = fabric.fabricTypeName && !fabric.isCurrent ? `${fabric.fabricTypeName} — ` : '';
  const code = fabric.code ? ` (${fabric.code})` : '';
  const sku = fabric.sku ? ` · SKU ${fabric.sku}` : '';
  return `${type}${fabric.name}${code}${sku}`;
}
