import type { CachedColorVariant } from '../../utils/colorVariants';
import { slugFromProductId } from './officialSizes';
import { loadWebJson, registerWebDataPreloader } from './webDataLoader';

type ManifestMap = Record<string, Record<string, CachedColorVariant>>;

export let COLOR_VARIANT_MANIFEST: Readonly<Record<string, Readonly<Record<string, CachedColorVariant>>>> = {};

let loaded = false;

export function ensureColorManifestLoaded(): Promise<ManifestMap | undefined> {
  if (loaded) return Promise.resolve(COLOR_VARIANT_MANIFEST as ManifestMap);
  return loadWebJson<ManifestMap>('color-manifest.json', (data) => {
    COLOR_VARIANT_MANIFEST = data;
    loaded = true;
  });
}

registerWebDataPreloader(ensureColorManifestLoaded);

export function getManifestVariants(
  productId: string,
): Readonly<Record<string, CachedColorVariant>> | undefined {
  if (!loaded) {
    void ensureColorManifestLoaded();
    return undefined;
  }
  const slug = slugFromProductId(productId);
  return COLOR_VARIANT_MANIFEST[slug] || COLOR_VARIANT_MANIFEST[slug.replace(/-[0-9a-f]{6}$/, '')];
}
