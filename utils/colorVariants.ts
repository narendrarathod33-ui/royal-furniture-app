/**
 * Option 2 ("Generate Once, Cache Forever" with OpenAI `gpt-image-2.6-sunburst`):
 * shared normalization, cache-keying, prompt engineering, and variant resolution
 * for Royal Furniture color & fabric swatches.
 *
 * Pure module (zero React Native runtime dependency) so CLI generators,
 * Node/Jest tests, and the Expo ProductDetails screen use identical keys.
 */

export const S3_PRODUCT_IMAGE_BASE =
  'https://royal-furniture-515966538173-ap-south-1-an.s3.ap-south-1.amazonaws.com/';

export type RawSwatchInput = {
  name: string;
  hex?: string;
  fabric?: string;
  image?: string;
  stock?: string;
};

export type CachedColorVariant = {
  /** Path relative to public/ CDN or S3, or an absolute https:// image URL. */
  image: string;
  /** Canonical swatch color name as harvested. */
  colorName: string;
  hex?: string;
  fabric?: string;
  /** Model used to generate this cached preview (e.g. gpt-image-2.6-sunburst). */
  model?: string;
  /** Short SHA-256 prefix of the generation prompt + source image for cache invalidation. */
  promptHash?: string;
};

export type ResolvedSwatch = {
  key: string;
  name: string;
  displayName: string;
  code?: string;
  hex?: string;
  fabric?: string;
  stock?: string;
  /** Resolved image URL/path when a variant image or AI preview exists. */
  previewImage?: string;
  /** True when `previewImage` comes from the cached AI color-variant manifest. */
  isAiPreview: boolean;
  isOutOfStock: boolean;
};

/** Placeholder entries like "Selectable" carry broken hexes and are not real finishes. */
export function isSelectablePlaceholder(name?: string): boolean {
  const clean = (name || '').trim();
  return !clean || /^selectable$/i.test(clean);
}

/** Validates 6-digit hex color strings (#RRGGBB), returning uppercase or undefined. */
export function normalizeHex(hex?: string): string | undefined {
  const clean = (hex || '').trim();
  return /^#[0-9a-f]{6}$/i.test(clean) ? clean.toUpperCase() : undefined;
}

const SLASH_CODE = /\s*\/\s*([0-9]{3,5}(?:\s*[A-Z]?-?\d+)?)\s*$/i;

function titleCaseSegment(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

/**
 * Turns raw factory swatch strings like `"CREAM WHITE /1882-1"` or
 * `"LIGHT GREIGE/PEARL GREY /1882-2"` into clean UI copy while keeping the
 * shade code for showroom / made-to-order confirmation.
 */
export function parseSwatchName(rawName: string): {
  displayName: string;
  code?: string;
  fullName: string;
} {
  const fullName = rawName.trim();
  const codeMatch = fullName.match(SLASH_CODE);
  const code = codeMatch ? codeMatch[1].replace(/\s+/g, ' ').trim().toUpperCase() : undefined;
  const base = codeMatch ? fullName.slice(0, codeMatch.index).trim() : fullName;
  const parts = base
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(titleCaseSegment);
  const displayName = parts.length ? parts.join(' / ') : titleCaseSegment(fullName);
  return { displayName, code, fullName };
}

/** Cleans fabric list: drops generic `"Fabric"` when named fabrics exist, title-cases consistently. */
export function normalizeFabrics(fabrics: readonly string[]): string[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of fabrics) {
    const trimmed = (raw || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }
  const specific = cleaned.filter((item) => item.toLowerCase() !== 'fabric');
  return specific.length ? specific : cleaned;
}

export function formatFabricLabel(fabric: string): string {
  const clean = fabric.trim();
  if (!clean) return '';
  if (/^[A-Z0-9\s-]+$/.test(clean)) return titleCaseSegment(clean);
  return clean;
}

/** Strips `::size=...` and `::color=...` synthetic cart suffixes back to the catalog id. */
export function stripProductVariantSuffixes(productId: string): string {
  return productId.split(/::(?:size|color)=/)[0];
}

export function colorFromProductId(productId: string): { color?: string; fabric?: string } {
  const part = productId.split('::color=')[1];
  if (!part) return {};
  const raw = part.split('::size=')[0];
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { c?: string; f?: string };
    return { color: parsed.c || undefined, fabric: parsed.f || undefined };
  } catch {
    return {};
  }
}

export function encodeColorVariantSuffix(color?: string, fabric?: string): string {
  if (!color && !fabric) return '';
  const payload: { c?: string; f?: string } = {};
  if (color) payload.c = color;
  if (fabric) payload.f = fabric;
  return `::color=${encodeURIComponent(JSON.stringify(payload))}`;
}

function slugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Deterministic URL/filename-safe cache key for a color + optional fabric.
 * Example: `("CREAM WHITE /1882-1", "VELVET")` -> `"velvet--cream-white-1882-1"`.
 */
export function variantCacheKey(colorName: string, fabric?: string): string {
  const colorSlug = slugPart(colorName) || 'default';
  const cleanFabric = (fabric || '').trim();
  if (!cleanFabric || cleanFabric.toLowerCase() === 'fabric') return colorSlug;
  return `${slugPart(cleanFabric)}--${colorSlug}`;
}

/** Resolves an S3-relative path, local `/ai-color-variants/...` path, or absolute https URL. */
export function resolveColorVariantImageUrl(pathOrUrl: string, webBasePath = ''): string {
  const clean = pathOrUrl.trim();
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean) || clean.startsWith('data:')) return clean;
  if (clean.startsWith('/')) {
    const prefix = webBasePath.replace(/\/+$/, '');
    return prefix && !clean.startsWith(`${prefix}/`) ? `${prefix}${clean}` : clean;
  }
  return `${S3_PRODUCT_IMAGE_BASE}${clean.replace(/^\/+/, '')}`;
}

/**
 * Merges swatch sources (complete harvested swatch table, local/live API colors,
 * overrides, and forever-cached AI preview entries) into a clean, deduplicated
 * swatch list without `"Selectable"` placeholders.
 */
export function buildProductSwatches(params: {
  slug?: string;
  harvestSwatches?: readonly RawSwatchInput[];
  fallbackColors?: readonly { name: string; hex?: string; image?: string }[];
  manifestVariants?: Readonly<Record<string, CachedColorVariant>>;
  webBasePath?: string;
}): ResolvedSwatch[] {
  const {
    harvestSwatches = [],
    fallbackColors = [],
    manifestVariants = {},
    webBasePath = '',
  } = params;

  const byKey = new Map<string, ResolvedSwatch>();

  const upsert = (input: RawSwatchInput) => {
    if (isSelectablePlaceholder(input.name)) return;
    const parsed = parseSwatchName(input.name);
    const hex = normalizeHex(input.hex);
    const fabric = input.fabric?.trim() && input.fabric.trim().toLowerCase() !== 'fabric'
      ? input.fabric.trim()
      : undefined;

    // Deduplicate primarily by full color name + fabric (if two fabrics share a shade code,
    // keep distinct entries; if same color arrives once with fabric and once without, enrich).
    const dedupeKey = `${(fabric || '').toLowerCase()}|${parsed.fullName.toLowerCase()}`;
    const existingByColorOnly = !fabric
      ? [...byKey.values()].find((item) => item.name.toLowerCase() === parsed.fullName.toLowerCase())
      : undefined;

    const exactCacheKey = variantCacheKey(parsed.fullName, fabric);
    const colorOnlyCacheKey = variantCacheKey(parsed.fullName);
    const cached = manifestVariants[exactCacheKey] || manifestVariants[colorOnlyCacheKey];

    const overrideImg = input.image ? resolveColorVariantImageUrl(input.image, webBasePath) : undefined;
    const cachedImg = cached?.image ? resolveColorVariantImageUrl(cached.image, webBasePath) : undefined;
    const previewImage = cachedImg || overrideImg;
    const isAiPreview = !!cachedImg;

    if (existingByColorOnly) {
      if (!existingByColorOnly.hex && hex) existingByColorOnly.hex = hex;
      if (!existingByColorOnly.previewImage && previewImage) {
        existingByColorOnly.previewImage = previewImage;
        existingByColorOnly.isAiPreview = isAiPreview;
      }
      return;
    }

    const existing = byKey.get(dedupeKey);
    if (existing) {
      if (!existing.hex && hex) existing.hex = hex;
      if (!existing.stock && input.stock) existing.stock = input.stock;
      if (!existing.previewImage && previewImage) {
        existing.previewImage = previewImage;
        existing.isAiPreview = isAiPreview;
      }
      return;
    }

    byKey.set(dedupeKey, {
      key: exactCacheKey,
      name: parsed.fullName,
      displayName: parsed.displayName,
      code: parsed.code,
      hex,
      fabric,
      stock: input.stock,
      previewImage,
      isAiPreview,
      isOutOfStock: input.stock === 'out_of_stock',
    });
  };

  for (const swatch of harvestSwatches) upsert(swatch);
  for (const color of fallbackColors) {
    upsert({ name: color.name, hex: color.hex, image: color.image });
  }

  return [...byKey.values()];
}

/**
 * Looks up a cached AI preview image even when a user pairs any fabric option
 * (e.g. Boucle) with a shade originally listed under Velvet.
 */
export function findCachedVariantForSelection(
  manifestVariants: Readonly<Record<string, CachedColorVariant>> | undefined,
  colorName?: string,
  fabric?: string,
  webBasePath = '',
): { image: string; exactFabricMatch: boolean; variant: CachedColorVariant } | undefined {
  if (!manifestVariants || !colorName) return undefined;
  const exact = manifestVariants[variantCacheKey(colorName, fabric)];
  if (exact?.image) {
    return {
      image: resolveColorVariantImageUrl(exact.image, webBasePath),
      exactFabricMatch: true,
      variant: exact,
    };
  }
  const colorOnly = manifestVariants[variantCacheKey(colorName)];
  if (colorOnly?.image) {
    return {
      image: resolveColorVariantImageUrl(colorOnly.image, webBasePath),
      exactFabricMatch: !fabric,
      variant: colorOnly,
    };
  }
  // If a color was cached under another fabric (e.g. Velvet) for the same shade, expose it as fallback.
  const suffix = `--${variantCacheKey(colorName)}`;
  const sibling = Object.entries(manifestVariants).find(
    ([key, entry]) => key.endsWith(suffix) && !!entry.image,
  );
  if (sibling) {
    return {
      image: resolveColorVariantImageUrl(sibling[1].image, webBasePath),
      exactFabricMatch: false,
      variant: sibling[1],
    };
  }
  return undefined;
}

/**
 * Builds the photorealistic product-recoloring prompt for OpenAI `gpt-image-2.6-sunburst`
 * (`/v1/images/edits`). Preserves studio lighting, framing, shadows, wooden/metal trim,
 * and room props while accurately recoloring upholstery/finish to the target swatch.
 */
export function buildColorEditPrompt(params: {
  productName: string;
  colorName: string;
  hex?: string;
  fabric?: string;
  category?: string;
}): string {
  const parsed = parseSwatchName(params.colorName);
  const cleanHex = normalizeHex(params.hex);
  const fabric = params.fabric && params.fabric.toLowerCase() !== 'fabric'
    ? formatFabricLabel(params.fabric).toLowerCase()
    : 'upholstery fabric';
  const colorDesc = cleanHex
    ? `${parsed.displayName} (exact color swatch ${cleanHex})`
    : parsed.displayName;
  const piece = params.productName.trim() || 'furniture piece';
  const categoryHint = params.category ? ` (${params.category.replace(/-/g, ' ')})` : '';

  return [
    `Edit this studio catalog photograph of the "${piece}"${categoryHint}.`,
    `Change ONLY the main upholstered fabric / finish color and surface weave texture of the furniture piece to ${colorDesc} in ${fabric}.`,
    `Render natural tactile ${fabric} weave, realistic fold shading, highlights, and soft shadows matching the original studio lighting.`,
    `Keep the exact furniture silhouette, dimensions, cushion count, stitching seams, legs, throw pillows if un-upholstered trim, decorative props, floor, wall, and background completely unchanged.`,
    `No text, no watermarks, no extra objects, photorealistic e-commerce studio quality.`,
  ].join(' ');
}
