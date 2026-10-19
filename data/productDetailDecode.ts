/**
 * Decoding for the harvested product-page records (payload lives in
 * `productDetailRecords.ts` / `public/data/product-detail-records.json`).
 * Kept small so it stays in the app-shell bundle; the heavy interned-string
 * table and slug map do not.
 */
import { slugFromProductId } from '../app/data/officialSizes';
import { catalogOverrides, type CatalogOverride } from '../app/data/catalogOverrides';

/** Bucket every gallery / swatch image path is relative to. */
export const PRODUCT_IMAGE_BASE = 'https://royal-furniture-515966538173-ap-south-1-an.s3.ap-south-1.amazonaws.com/';

export type SpecSection = { name: string; rows: { label: string; value: string }[] };
export type DetailColor = { name: string; hex?: string; image?: string };
export type ProductDetailRecord = {
  /** General Information copy from the product page. */
  info?: string;
  /** Schema.org-style SKU shown on the page. */
  sku?: string;
  /** Merchandising labels, e.g. "Best Seller", "Online Only". */
  labels: string[];
  /** Availability line: status plus per-order cap when the page shows one. */
  stock?: { status?: string; count?: number };
  /** "N views in 24 hrs" counter, when the page shows one. */
  views?: number;
  /** Average customer rating, when the page shows one. */
  rating?: number;
  /** General Information blocks, in the order the page lists them. */
  sections: SpecSection[];
  colors: DetailColor[];
  fabrics: string[];
  /** Gallery paths, relative to PRODUCT_IMAGE_BASE. */
  gallery: string[];
  /** Delivery estimate text, e.g. "7" days. */
  deliveryEstimate?: string;
  /** The page's delivery date, e.g. "2026-10-27". */
  deliveryDate?: string;
  freeAssembly: boolean;
  customizable: boolean;
  sizeCustomizable: boolean;
};

export type RawSection = [nameIndex: number, pairs: number[]];
export type RawColor = [nameIndex: number, hexIndex: number, imageIndex: number];
export type RawDetail = {
  i?: number;   // general_information
  k?: number;   // sku
  l?: number[]; // labels
  s?: [number, number]; // stock status index, per-order cap
  v?: number;   // views
  r?: number;   // rating
  g?: RawSection[];
  o?: RawColor[];
  f?: number[]; // fabrics
  t?: number; // delivery date
  p?: number[]; // gallery paths
  e?: number;   // delivery estimate
  q?: number[]; // flags: c customizable, z size-customizable, a free assembly
};


/** Everything the product page needs from the harvested records. */
export type DetailStore = {
  getProductDetails: (productId: string) => ProductDetailRecord | undefined;
  productImageUrl: (path: string) => string;
};

/** Wire a decoded {T, RAW} payload into the detail-store API. */
export function makeDetailStore(T: readonly string[], RAW: Record<string, RawDetail>): DetailStore {
  const decodeSection = (section: RawSection): SpecSection => {
    const [nameIndex, pairs] = section;
    const rows: { label: string; value: string }[] = [];
    for (let index = 0; index + 1 < pairs.length; index += 2) {
      const label = pairs[index] >= 0 ? T[pairs[index]] : '';
      const value = pairs[index + 1] >= 0 ? T[pairs[index + 1]] : '';
      if (label || value) rows.push({ label, value });
    }
    return { name: nameIndex >= 0 ? T[nameIndex] : 'Details', rows };
  };

  const decode = (raw: RawDetail): ProductDetailRecord => {
    // Flags are interned single letters: a = free assembly, c = customizable,
    // z = size customizable.
    const flags = (raw.q || []).map((index) => T[index]);
    return {
    info: raw.i !== undefined ? T[raw.i] : undefined,
    sku: raw.k !== undefined ? T[raw.k] : undefined,
    labels: (raw.l || []).map((index) => T[index]).filter(Boolean),
    stock: raw.s
      ? { status: raw.s[0] >= 0 ? T[raw.s[0]] : undefined, count: raw.s[1] > 0 ? raw.s[1] : undefined }
      : undefined,
    views: raw.v,
    rating: raw.r,
    sections: (raw.g || []).map(decodeSection),
    colors: (raw.o || []).map(([nameIndex, hexIndex, imageIndex]) => ({
      name: nameIndex >= 0 ? T[nameIndex] : 'Colour',
      hex: hexIndex >= 0 ? T[hexIndex] : undefined,
      image: imageIndex >= 0 ? T[imageIndex] : undefined,
    })),
    fabrics: (raw.f || []).map((index) => T[index]).filter(Boolean),
    gallery: (raw.p || []).map((index) => T[index]).filter(Boolean),
    deliveryEstimate: raw.e !== undefined ? T[raw.e] : undefined,
    deliveryDate: raw.t !== undefined ? T[raw.t] : undefined,
    freeAssembly: flags.includes('a'),
    customizable: flags.includes('c'),
      sizeCustomizable: flags.includes('z'),
    };
  };

  /** Merge sheet-driven overrides on top of a decoded record (override wins per label/name). */
  const mergeOverride = (record: ProductDetailRecord, override: CatalogOverride): ProductDetailRecord => {
    const gallery = [...record.gallery];
    for (const path of override.gallery || []) if (!gallery.includes(path)) gallery.push(path);
    const colors = record.colors.map((color) => ({ ...color }));
    for (const color of override.colors || []) {
      const existing = colors.find((c) => c.name.toLowerCase() === color.name.toLowerCase());
      if (existing) {
        existing.name = color.name;
        if (color.hex) existing.hex = color.hex;
        if (color.image) existing.image = color.image;
      } else {
        colors.push({ ...color });
      }
    }
    const fabrics = [...record.fabrics];
    for (const fabric of override.fabrics || []) {
      if (!fabrics.some((f) => f.toLowerCase() === fabric.toLowerCase())) fabrics.push(fabric);
    }
    const sections = record.sections.map((section) => ({ name: section.name, rows: section.rows.map((row) => ({ ...row })) }));
    for (const section of override.sections || []) {
      const target = sections.find((s) => s.name.toLowerCase() === section.name.toLowerCase());
      if (!target) {
        sections.push({ name: section.name, rows: section.rows.map((row) => ({ ...row })) });
        continue;
      }
      for (const row of section.rows) {
        const existing = target.rows.find((r) => r.label.toLowerCase() === row.label.toLowerCase());
        if (existing) existing.value = row.value;
        else target.rows.push({ ...row });
      }
    }
    return {
      ...record,
      gallery,
      colors,
      fabrics,
      sections,
      info: override.info ?? record.info,
      sku: override.sku ?? record.sku,
      rating: override.rating ?? record.rating,
      views: override.views ?? record.views,
      stock: override.stock ? { ...record.stock, ...override.stock } : record.stock,
      deliveryEstimate: override.deliveryEstimate ?? record.deliveryEstimate,
      deliveryDate: override.deliveryDate ?? record.deliveryDate,
      customizable: override.customizable ?? record.customizable,
      sizeCustomizable: override.sizeCustomizable ?? record.sizeCustomizable,
    };
  };

  /** Build a record purely from overrides (new products the harvest never covered). */
  const overrideOnly = (override: CatalogOverride): ProductDetailRecord => ({
    labels: [],
    sections: (override.sections || []).map((section) => ({ name: section.name, rows: section.rows.map((row) => ({ ...row })) })),
    colors: (override.colors || []).map((color) => ({ ...color })),
    fabrics: [...(override.fabrics || [])],
    gallery: [...(override.gallery || [])],
    info: override.info,
    sku: override.sku,
    rating: override.rating,
    views: override.views,
    stock: override.stock,
    deliveryEstimate: override.deliveryEstimate,
    deliveryDate: override.deliveryDate,
    freeAssembly: false,
    customizable: override.customizable === true,
    sizeCustomizable: override.sizeCustomizable === true,
  });

  /** Full product-page details for a catalogue id, or undefined when not harvested. */
  function getProductDetails(productId: string): ProductDetailRecord | undefined {
    const slug = slugFromProductId(productId);
    const raw = RAW[slug] || RAW[slug.replace(/-[0-9a-f]{6}$/, '')];
    const decoded = raw ? decode(raw) : undefined;
    const override = catalogOverrides[productId];
    if (decoded && override) return mergeOverride(decoded, override);
    if (!decoded && override) return overrideOnly(override);
    return decoded;
  }

  /** Absolute URL for a harvested image path. */
  function productImageUrl(path: string): string {
    return path.startsWith('http') ? path : `${PRODUCT_IMAGE_BASE}${path}`;
  }

  return { getProductDetails, productImageUrl };
}
