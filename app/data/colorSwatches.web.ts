import { slugFromProductId } from './officialSizes';
import type { RawSwatchInput } from '../../utils/colorVariants';
import { loadWebJson, registerWebDataPreloader } from './webDataLoader';

type RawSwatchTuple = readonly [number, number, number, number, number];
type SwatchPayload = { t: readonly string[]; s: Record<string, readonly RawSwatchTuple[]> };

let store: SwatchPayload | undefined;

export function ensureColorSwatchesLoaded(): Promise<SwatchPayload | undefined> {
  if (store) return Promise.resolve(store);
  return loadWebJson<SwatchPayload>('color-swatches.json', (data) => {
    store = data;
  });
}

registerWebDataPreloader(ensureColorSwatchesLoaded);

export function getColorSwatches(productId: string): RawSwatchInput[] {
  if (!store) {
    void ensureColorSwatchesLoaded();
    return [];
  }
  const slug = slugFromProductId(productId);
  const rows = store.s[slug] || store.s[slug.replace(/-[0-9a-f]{6}$/, '')];
  if (!rows) return [];
  return rows.map(([nameIdx, hexIdx, fabricIdx, imageIdx, stockIdx]) => ({
    name: store!.t[nameIdx],
    hex: hexIdx >= 0 ? store!.t[hexIdx] : undefined,
    fabric: fabricIdx >= 0 ? store!.t[fabricIdx] : undefined,
    image: imageIdx >= 0 ? store!.t[imageIdx] : undefined,
    stock: stockIdx >= 0 ? store!.t[stockIdx] : undefined,
  }));
}

export const SWATCH_PRODUCT_COUNT = 569;
