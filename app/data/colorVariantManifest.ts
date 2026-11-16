/**
 * Forever-cache manifest of AI-edited color & fabric variant images generated via
 * OpenAI `gpt-image-2.6-sunburst` (`npm run generate:colors`).
 *
 * Each entry maps `slug -> variantCacheKey -> CachedColorVariant`.
 * When `scripts/generate-color-variants.mjs` writes or updates variants (either
 * under `public/ai-color-variants/` or uploaded to S3), it regenerates this file
 * so every web, GitHub Pages, iOS, and Android client serves cached variants with $0 marginal AI cost.
 */
import type { CachedColorVariant } from '../../utils/colorVariants';
import { slugFromProductId } from './officialSizes';

export const COLOR_VARIANT_MANIFEST: Readonly<
  Record<string, Readonly<Record<string, CachedColorVariant>>>
> = {};

export function getManifestVariants(
  productId: string,
): Readonly<Record<string, CachedColorVariant>> | undefined {
  const slug = slugFromProductId(productId);
  return COLOR_VARIANT_MANIFEST[slug] || COLOR_VARIANT_MANIFEST[slug.replace(/-[0-9a-f]{6}$/, '')];
}
