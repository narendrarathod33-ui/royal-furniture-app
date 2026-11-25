import { slugFromProductId } from './officialSizes';
import { catalogOverrides, type CatalogOverride } from './catalogOverrides';
import { loadWebJson, registerWebDataPreloader } from './webDataLoader';

export const PRODUCT_IMAGE_BASE = 'https://royal-furniture-515966538173-ap-south-1-an.s3.ap-south-1.amazonaws.com/';

export const PRODUCT_IMAGE_NOTE =
  'Product images include props used for illustrative purposes. Colour may vary slightly due to photographic lighting or your screen settings.';

export const PRODUCT_PAYMENT_NOTE =
  'Flexi payment available — pay 20% upfront to confirm your booking, the balance before delivery.';

export type SpecSection = { name: string; rows: { label: string; value: string }[] };
export type DetailColor = { name: string; hex?: string; image?: string };
export type ProductDetailRecord = {
  info?: string;
  sku?: string;
  labels: string[];
  stock?: { status?: string; count?: number };
  views?: number;
  rating?: number;
  sections: SpecSection[];
  colors: DetailColor[];
  fabrics: string[];
  gallery: string[];
  deliveryEstimate?: string;
  deliveryDate?: string;
  freeAssembly: boolean;
  customizable: boolean;
  sizeCustomizable: boolean;
};

type RawSection = [nameIndex: number, pairs: number[]];
type RawColor = [nameIndex: number, hexIndex: number, imageIndex: number];
type RawDetail = {
  i?: number;
  k?: number;
  l?: number[];
  s?: [number, number];
  v?: number;
  r?: number;
  g?: RawSection[];
  o?: RawColor[];
  f?: number[];
  p?: number[];
  e?: number;
  t?: number;
  q?: number[];
};

type Payload = { t: readonly string[]; r: Record<string, RawDetail> };

let store: Payload | undefined;

export function ensureProductDetailsLoaded(): Promise<Payload | undefined> {
  if (store) return Promise.resolve(store);
  return loadWebJson<Payload>('product-details.json', (data) => {
    store = data;
  });
}

registerWebDataPreloader(ensureProductDetailsLoaded);

const decodeSection = (T: readonly string[], [nameIndex, pairs]: RawSection): SpecSection => {
  const rows: { label: string; value: string }[] = [];
  for (let i = 0; i < pairs.length; i += 2) {
    rows.push({ label: T[pairs[i]] || '', value: T[pairs[i + 1]] || '' });
  }
  return { name: T[nameIndex] || '', rows };
};

const decode = (T: readonly string[], raw: RawDetail): ProductDetailRecord => {
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
    sections: (raw.g || []).map((s) => decodeSection(T, s)),
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

export function getProductDetails(productId: string): ProductDetailRecord | undefined {
  if (!store) {
    void ensureProductDetailsLoaded();
    const override = catalogOverrides[productId];
    return override ? overrideOnly(override) : undefined;
  }
  const slug = slugFromProductId(productId);
  const raw = store.r[slug] || store.r[slug.replace(/-[0-9a-f]{6}$/, '')];
  const decoded = raw ? decode(store.t, raw) : undefined;
  const override = catalogOverrides[productId];
  if (decoded && override) return mergeOverride(decoded, override);
  if (!decoded && override) return overrideOnly(override);
  return decoded;
}

export function productImageUrl(path: string): string {
  return path.startsWith('http') ? path : `${PRODUCT_IMAGE_BASE}${path}`;
}
