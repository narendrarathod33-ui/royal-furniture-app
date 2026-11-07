import type { ImageSourcePropType } from 'react-native';

/** A customer-selectable fabric. Images can be remote URLs or keys in the asset map below. */
export type Fabric = {
  id: string;
  name: string;
  hex: string;
  textureImage?: string;
  variantImage?: string;
  inStock: boolean;
  /** Added to the selected size's current and list prices. Omit for zero. */
  priceDelta?: number;
};

/** The small, serialisable fabric snapshot persisted with carts and wishlists. */
export type FabricSelection = {
  id: string;
  name: string;
  hex: string;
  priceDelta: number;
};

export type FabricProduct = {
  id: string;
  /** Optional: products without this field keep their original UI and behaviour. */
  fabrics?: readonly Fabric[];
  /** Transparent PNG aligned with the primary product photo; upholstery is white. */
  maskImage?: string;
  /** Present on cart lines and on saved products that restore a fabric choice. */
  selectedFabric?: FabricSelection;
};

/**
 * Static image registry: Metro/Android requires every local asset path to be known
 * at bundle time. Remote URLs need no registry entry. Add new local masks/textures
 * here after copying them into assets/images/fabric-masks (or another asset folder).
 */
const fabricImageAssets: Record<string, ImageSourcePropType> = {
  'trento-single-seater-sofa.png': require('../../assets/images/fabric-masks/trento-single-seater-sofa.png'),
  'the-rainbow-bed.png': require('../../assets/images/fabric-masks/the-rainbow-bed.png'),
};

export function resolveFabricImage(source?: string | ImageSourcePropType): ImageSourcePropType | undefined {
  if (!source) return undefined;
  if (typeof source !== 'string') return source;
  const local = fabricImageAssets[source];
  if (local) return local;
  if (/^(?:https?:|data:|blob:|file:)/i.test(source)) return { uri: source };
  return undefined;
}

export function fabricPriceDelta(fabric?: Pick<Fabric, 'priceDelta'> | FabricSelection): number {
  const value = fabric?.priceDelta;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function toFabricSelection(fabric: Fabric): FabricSelection {
  return { id: fabric.id, name: fabric.name, hex: fabric.hex, priceDelta: fabricPriceDelta(fabric) };
}

/** Restore a valid available selection, otherwise use the first available fabric. */
export function initialFabric(product: Pick<FabricProduct, 'fabrics' | 'selectedFabric'>): Fabric | undefined {
  const options = product.fabrics;
  if (!options?.length) return undefined;
  const saved = product.selectedFabric;
  return options.find((fabric) => fabric.inStock && fabric.id === saved?.id)
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
