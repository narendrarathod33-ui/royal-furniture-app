import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { ChevronRight, Heart, RefreshCw, ShoppingBag, Star } from 'lucide-react-native';
import { getOfficialSizes } from './data/officialSizes';
import { PRODUCT_IMAGE_NOTE, PRODUCT_PAYMENT_NOTE, getProductDetails, productImageUrl } from './data/productDetails';
import { GLASS, glassTilt } from './ui/glass';

/** A selectable size of the same product, sourced from the official catalogue. */
export type SizeVariantOption = {
  id: string;
  label: string;
  sizeType: string;
  name: string;
  price: number;
  listPrice: number;
  discount: number;
  photo?: ImageSourcePropType;
};

type ProductDetailsProduct = {
  id: string;
  n: string;
  c: string;
  scn?: string;
  d?: string;
  o: number;
  /** Original/list price from the catalogue, shown struck through. */
  l?: number;
  z?: unknown;
  sp?: unknown;
};

type DetailRow = { label?: string; value?: string };
type ApiColor = {
  name?: string;
  hex?: string;
  info_image?: unknown;
  stock?: number;
  sku?: string;
  stock_status?: { status?: string; stock_count?: number; message?: string };
  variant_image?: string;
  responsive_images?: Record<string, { url?: string }>;
  region_prices?: Record<string, unknown>;
  fabric_color_info?: { color_name?: string; color_hex?: string; fabric_name?: string };
  // The page's General Information blocks: Material, Dimensions, Specs,
  // Warranty, Assembly and any other section the API carries (e.g. care).
  info_section?: { [section: string]: DetailRow[] | undefined };
  // Regional pricing is returned as additional numeric fields; the exact key
  // varies, so the whole object is searched for a price (see priceFromEntry).
  [key: string]: unknown;
};
type ApiFabric = { name?: string; colorsList?: ApiColor[]; [key: string]: unknown };
type ApiVariant = { name?: string; fabricsList?: ApiFabric[]; [key: string]: unknown };
type ApiProductDetail = {
  general_information?: string;
  product_info?: {
    is_customizable?: boolean;
    is_size_customizable?: boolean;
    delivery_estimate_days?: string;
    [key: string]: unknown;
  };
  delivery_info?: { supports_free_assembly?: boolean; estimated_delivery?: string; [key: string]: unknown };
  primary_images?: {
    fabric_color_info?: { color_name?: string; color_hex?: string };
    responsive_images?: Record<string, { url?: string }>;
    image?: string;
  }[];
  variant_images?: { responsive_images?: Record<string, { url?: string }>; image?: string }[];
  /** The product gallery: the page shows primary_images first, then these. */
  additional_images?: { responsive_images?: Record<string, { url?: string }>; image?: string }[];
  product_sku?: string;
  stock_status?: { status?: string; stock_count?: number; message?: string };
  view_count?: number;
  average_rating?: number;
  labels?: { name?: string }[];
  // Each variant is one entry of the official "### Size" dropdown.
  variants?: ApiVariant[];
};
type SizePriceOption = { name: string; price: number; listPrice?: number; optionKey: string };
type SpecSection = { name: string; rows: DetailRow[] };
type ProductOptionData = {
  sizes: string[];
  fabrics: string[];
  colors: { name: string; hex?: string; image?: string }[];
  sizePrices: SizePriceOption[];
  /** Every General Information row, flattened (kept for older catalogues). */
  rows: DetailRow[];
  /** The same rows grouped the way the product page groups them. */
  sections: SpecSection[];
  /** Gallery images, in page order. */
  images: string[];
  sku?: string;
  stock?: { status?: string; count?: number };
  views?: number;
  rating?: number;
  deliveryEstimate?: string;
  freeAssembly?: boolean;
  customizable?: boolean;
  sizeCustomizable?: boolean;
};

/** Bare responsive-image URL from any API image node. */
function imageFromNode(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const record = node as Record<string, unknown>;
  const responsive = (record.responsive_images || record.images) as Record<string, { url?: string }> | undefined;
  if (responsive && typeof responsive === 'object') {
    for (const size of ['web', 'ipad', 'mobile']) {
      const found = responsive[size]?.url;
      if (typeof found === 'string' && found.startsWith('http')) return found;
    }
  }
  for (const key of ['image', 'variant_image', 'url']) {
    const found = record[key];
    if (typeof found === 'string' && found.startsWith('http')) return found;
  }
  return undefined;
}

const COLORS = {
  ink: '#050000',
  red: '#DA1921',
  redDeep: '#B61117',
  navy: '#282984',
  cream: '#F6F6F7',
  line: '#E3E3E5',
  muted: '#444444',
  white: '#FFFFFF',
  green: '#127A44',
  gold: '#B45309',
};

const money = (value: number) => `AED ${value.toLocaleString('en-US')}`;
/** "2026-10-27" -> "27 Oct 2026"; anything unparseable is passed through. */
const formatDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Joins non-empty texts, dropping repeats that differ only in whitespace. */
const dedupeText = (values: Array<string | undefined>) => {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    const text = (value || '').replace(/\r\n?/g, '\n').trim();
    if (!text) continue;
    const key = text.replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(text);
  }
  return kept;
};

/** "in_stock" / "care_instructions" -> "In stock" / "Care instructions". */
const humanize = (value: string) => {
  const text = String(value || '').replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : '';
};
const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

export const isMadeToOrderText = (value?: string) => /\bmade[\s-]+to[\s-]+order\b/i.test(value || '');

function addColor(
  colors: Map<string, { name: string; hex?: string; image?: string }>,
  name?: string,
  hex?: string,
  image?: string,
) {
  const cleanName = name?.trim();
  if (!cleanName) return;
  const key = cleanName.toLocaleLowerCase();
  const existing = colors.get(key);
  const validHex = hex && /^#[\da-f]{6}$/i.test(hex) ? hex : undefined;
  colors.set(key, { name: cleanName, hex: existing?.hex || validHex, image: existing?.image || image });
}

function getLocalOptions(product: ProductDetailsProduct): ProductOptionData {
  const sizes: string[] = [];
  const fabrics: string[] = [];
  const colors = new Map<string, { name: string; hex?: string; image?: string }>();
  const sizeGroups: { name: string; options: SizePriceOption[] }[] = [];
  const rows: DetailRow[] = [];

  if (Array.isArray(product.z)) {
    for (const rawVariant of product.z) {
      if (!Array.isArray(rawVariant)) continue;
      const sizeName = typeof rawVariant[0] === 'string' ? rawVariant[0] : '';
      if (sizeName) sizes.push(sizeName);
      if (!Array.isArray(rawVariant[1])) continue;
      const sizeOptions: SizePriceOption[] = [];
      for (const rawFabric of rawVariant[1]) {
        if (!Array.isArray(rawFabric)) continue;
        const fabricName = typeof rawFabric[0] === 'string' ? rawFabric[0] : '';
        if (fabricName) fabrics.push(fabricName);
        if (!Array.isArray(rawFabric[2])) continue;
        for (const rawColor of rawFabric[2]) {
          if (Array.isArray(rawColor)) addColor(colors, typeof rawColor[0] === 'string' ? rawColor[0] : undefined, typeof rawColor[1] === 'string' ? rawColor[1] : undefined);
          if (!sizeName || !Array.isArray(rawColor)) continue;
          const price = Number(rawColor[2]);
          if (!Number.isFinite(price) || price <= 0) continue;
          const colorName = typeof rawColor[0] === 'string' ? rawColor[0] : '';
          const listPrice = Number(rawColor[3]);
          sizeOptions.push({
            name: sizeName,
            price,
            listPrice: Number.isFinite(listPrice) && listPrice > 0 ? listPrice : undefined,
            optionKey: `${fabricName.toLocaleLowerCase()}|${colorName.toLocaleLowerCase()}`,
          });
        }
      }
      if (sizeOptions.length) sizeGroups.push({ name: sizeName, options: sizeOptions });
    }
  }

  if (product.sp && typeof product.sp === 'object') {
    for (const [section, rawRows] of Object.entries(product.sp)) {
      if (!Array.isArray(rawRows)) continue;
      for (const rawRow of rawRows) {
        if (Array.isArray(rawRow) && typeof rawRow[0] === 'string' && typeof rawRow[1] === 'string') {
          rows.push({ label: `${section}: ${rawRow[0]}`, value: rawRow[1] });
        }
      }
    }
  }

  const allSizeOptions = sizeGroups.flatMap((group) => group.options);
  const defaultOption = allSizeOptions.find((option) => option.price === product.o) || allSizeOptions[0];
  const sizePrices = sizeGroups.map((group) => group.options.find((option) => option.optionKey === defaultOption?.optionKey) || group.options[0]);
  return { sizes: unique(sizes), fabrics: unique(fabrics), colors: [...colors.values()], sizePrices, rows, sections: [], images: [] };
}

function extractApiOptions(detail: ApiProductDetail | null): ProductOptionData {
  const sizes: string[] = [];
  const fabrics: string[] = [];
  const colors = new Map<string, { name: string; hex?: string; image?: string }>();
  const rows: DetailRow[] = [];
  const sections = new Map<string, DetailRow[]>();
  const images: string[] = [];

  const pushSection = (name: string, found?: DetailRow[]) => {
    if (!found?.length) return;
    const bucket = sections.get(name) || [];
    for (const row of found) {
      if (!row || (!row.label && !row.value)) continue;
      if (bucket.some((existing) => existing.label === row.label && existing.value === row.value)) continue;
      bucket.push(row);
    }
    if (bucket.length) sections.set(name, bucket);
  };

  for (const node of detail?.primary_images || []) {
    const found = imageFromNode(node);
    if (found && !images.includes(found)) images.push(found);
  }

  for (const variant of detail?.variants || []) {
    if (variant.name) sizes.push(variant.name);
    for (const fabric of variant.fabricsList || []) {
      if (fabric.name) fabrics.push(fabric.name);
      for (const color of fabric.colorsList || []) {
        const infoName = color.fabric_color_info?.color_name;
        const colorName = infoName && !/^selectable$/i.test(infoName) ? infoName : color.name || infoName;
        addColor(
          colors,
          colorName,
          color.fabric_color_info?.color_hex || color.hex,
          imageFromNode(color),
        );
        for (const node of (color.images as { responsive_images?: Record<string, { url?: string }>; image?: string }[] | undefined) || []) {
          const found = imageFromNode(node);
          if (found && !images.includes(found)) images.push(found);
        }
        const info = color.info_section || {};
        for (const [section, sectionRows] of Object.entries(info)) {
          pushSection(section, sectionRows);
          if (Array.isArray(sectionRows)) rows.push(...sectionRows);
        }
      }
    }
  }

  for (const node of [...(detail?.additional_images || []), ...(detail?.variant_images || [])]) {
    const found = imageFromNode(node);
    if (found && !images.includes(found)) images.push(found);
  }

  const primaryColor = detail?.primary_images?.[0]?.fabric_color_info;
  addColor(colors, primaryColor?.color_name, primaryColor?.color_hex);

  const productInfo = detail?.product_info || {};
  const deliveryInfo = detail?.delivery_info || {};
  const estimate = productInfo.delivery_estimate_days || deliveryInfo.estimated_delivery;
  return {
    sizes: unique(sizes),
    fabrics: unique(fabrics),
    colors: [...colors.values()],
    sizePrices: [],
    rows: dedupeRows(rows),
    sections: [...sections.entries()].map(([name, sectionRows]) => ({ name, rows: sectionRows })),
    images,
    sku: detail?.product_sku || detail?.variants?.[0]?.fabricsList?.[0]?.colorsList?.[0]?.sku,
    stock: detail?.stock_status
      ? { status: detail.stock_status.status, count: detail.stock_status.stock_count }
      : undefined,
    views: detail?.view_count,
    rating: detail?.average_rating,
    deliveryEstimate: estimate !== undefined && estimate !== null && estimate !== '' ? String(estimate) : undefined,
    freeAssembly: deliveryInfo.supports_free_assembly === true,
    customizable: productInfo.is_customizable === true,
    sizeCustomizable: productInfo.is_size_customizable === true,
  };
}

// Field names verified against the live API: a colour carries
// `region_prices: { total_price, total_base_price, base_price, variant_price }`
// (flat, not nested per country) once the locale/country headers are sent.
const PRICE_KEYS = ['total_price', 'variant_price', 'price', 'selling_price', 'sale_price', 'offer_price', 'final_price', 'discounted_price', 'current_price', 'unit_price', 'amount', 'value'];
const LIST_PRICE_KEYS = ['total_base_price', 'base_price', 'list_price', 'original_price', 'mrp', 'strike_price', 'compare_at_price', 'regular_price', 'was_price', 'max_price'];

function numberFrom(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

/**
 * Reads a price off an API node (colour / fabric / variant). Regional pricing
 * arrives as extra numeric fields whose names differ between payloads, so every
 * plausible key is probed, and a nested `region_prices` block is checked first.
 */
function priceFromEntry(entry: unknown, country: string): { price?: number; listPrice?: number } {
  if (!entry || typeof entry !== 'object') return {};
  const node = entry as Record<string, unknown>;

  const read = (source: Record<string, unknown>) => ({
    price: PRICE_KEYS.map((key) => numberFrom(source[key])).find((found) => found !== undefined),
    listPrice: LIST_PRICE_KEYS.map((key) => numberFrom(source[key])).find((found) => found !== undefined),
  });

  const regions = node.region_prices || node.regional_prices || node.region_pricing;
  if (regions && typeof regions === 'object') {
    const map = regions as Record<string, unknown>;
    // Either nested per country (`{ ae: { total_price } }`) or flat
    // (`{ total_price }`) — the live payload uses the flat form.
    const scoped = map[country] || map[country.toUpperCase()] || map.default;
    if (scoped && typeof scoped === 'object') {
      const nested = read(scoped as Record<string, unknown>);
      if (nested.price !== undefined || nested.listPrice !== undefined) return nested;
    }
    const flat = read(map);
    if (flat.price !== undefined || flat.listPrice !== undefined) return flat;
  }

  return read(node);
}

type ApiSizeOption = { label: string; price?: number; listPrice?: number };

/**
 * The official "### Size" dropdown: every `variants[].name` is one size, and the
 * cheapest colour offering inside that variant supplies its price. This is how
 * the site sells mattresses, adjustable beds and made-to-order pieces whose
 * sizes are not separate catalog entries.
 */
function extractApiSizeOptions(detail: ApiProductDetail | null, country = 'ae'): ApiSizeOption[] {
  const options: ApiSizeOption[] = [];
  const seen = new Set<string>();

  for (const variant of detail?.variants || []) {
    const label = variant.name?.trim();
    if (!label || seen.has(label.toLocaleLowerCase())) continue;
    seen.add(label.toLocaleLowerCase());

    let price: number | undefined;
    let listPrice: number | undefined;
    const consider = (found: { price?: number; listPrice?: number }) => {
      if (found.price !== undefined && (price === undefined || found.price < price)) price = found.price;
      if (found.listPrice !== undefined && (listPrice === undefined || found.listPrice > listPrice)) listPrice = found.listPrice;
    };

    consider(priceFromEntry(variant, country));
    for (const fabric of variant.fabricsList || []) {
      consider(priceFromEntry(fabric, country));
      for (const color of fabric.colorsList || []) consider(priceFromEntry(color, country));
    }
    options.push({ label, price, listPrice: listPrice && price && listPrice > price ? listPrice : undefined });
  }
  return options;
}

function sizeFromProductId(id: string) {  const encodedSize = id.split('::size=')[1];
  if (!encodedSize) return '';
  try {
    return decodeURIComponent(encodedSize);
  } catch {
    return '';
  }
}

function extractTitleColors(title: string) {
  const colorNames = ['off-white', 'dark grey', 'light grey', 'navy blue', 'dark walnut', 'multicolor', 'multi-colour', 'beige', 'brown', 'walnut', 'black', 'white', 'grey', 'gray', 'cream', 'ivory', 'gold', 'silver', 'blue', 'pink', 'green', 'red', 'yellow', 'orange', 'oak', 'teak'];
  const matches = colorNames.filter((color) => new RegExp(`\\b${color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(title));
  return unique(matches.map((color) => color.replace(/\b\w/g, (letter) => letter.toUpperCase())));
}

function extractTextSizes(text: string) {
  const sizes = text.match(/\b\d{2,3}\s*(?:×|x|\*)\s*\d{2,3}(?:\s*(?:×|x|\*)\s*\d{1,3})?\s*(?:cm)?\b/gi) || [];
  return unique(sizes.map((size) => size.replace(/\s+/g, ' ').trim()));
}

function dedupeRows(rows: DetailRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.label || !row.value) return false;
    const key = `${row.label.toLowerCase()}|${row.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function ProductDetails({
  product,
  photoSource,
  sizeVariants,
  onBack,
  onSave,
  onAdd,
  isSaved,
}: {
  product: ProductDetailsProduct;
  photoSource?: ImageSourcePropType;
  sizeVariants?: SizeVariantOption[];
  onBack: () => void;
  onSave: () => void;
  onAdd: (variant: { size?: string; price: number; listPrice?: number }) => void;
  isSaved: boolean;
}) {
  const sourceId = product.id.split('::size=')[0];
  // The API slug is the catalogue id minus its leading number. A trailing hash is
  // part of the slug on some rows (e.g. `azilea-smart-pro-grid-mattress-56bb1d`) and
  // absent on others, so both forms are tried.
  const slugBase = sourceId.replace(/^\d+-/, '');
  const slugHashless = slugBase.replace(/-[0-9a-f]{6}$/, '');
  const [detail, setDetail] = useState<ApiProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const local = useMemo(() => getLocalOptions(product), [product]);
  const live = useMemo(() => extractApiOptions(detail), [detail]);
  const cartSize = sizeFromProductId(product.id);
  const defaultSizeOption = local.sizePrices.find((option) => option.name === cartSize)
    || local.sizePrices.find((option) => option.price === product.o)
    || local.sizePrices[0];
  const hasDifferentSizePrices = new Set(local.sizePrices.map((option) => option.price)).size > 1;
  const [selectedSize, setSelectedSize] = useState(defaultSizeOption?.name || '');
  const selectedSizeOption = local.sizePrices.find((option) => option.name === selectedSize) || defaultSizeOption;
  const selectedPrice = hasDifferentSizePrices ? selectedSizeOption?.price ?? product.o : product.o;
  const selectedListPrice = hasDifferentSizePrices ? selectedSizeOption?.listPrice ?? product.l : product.l;
  const productName = product.n.replace(/\s+—\s+Size:\s+.*$/, '');

  // Official size dropdown, in priority order:
  //   1. sibling catalog entries (exact per-size prices + photos) — local families;
  //   2. the harvested official size lists for this catalog (mattresses, beds and
  //      other pieces the site keeps at one default size with a Size selector);
  //   3. the live API's `variants` as a fallback when the browser can reach it.
  // Either way, picking a size swaps the price, the struck-through original price
  // and the photo together.
  const variants = sizeVariants && sizeVariants.length > 1 ? sizeVariants : [];
  const officialSizes = useMemo(() => getOfficialSizes(product.id), [product.id]);
  const apiSizes = useMemo(() => extractApiSizeOptions(detail), [detail]);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [sizeOpen, setSizeOpen] = useState(false);
  const sourceVariant = variants.find((variant) => variant.id === sourceId);
  const activeVariant = variants.find((variant) => variant.id === selectedVariantId) || sourceVariant || variants[0];
  const usingSizeVariants = variants.length > 1 && !!activeVariant;
  const usingOfficialSizes = !usingSizeVariants && officialSizes.length > 1;
  const usingApiSizes = !usingSizeVariants && !usingOfficialSizes && apiSizes.length > 1;

  type SizeOption = { key: string; label: string; price?: number; listPrice?: number; discount?: number; photo?: ImageSourcePropType };
  const sizeOptions: SizeOption[] = usingSizeVariants
    ? variants.map((variant) => ({
        key: variant.id,
        label: [variant.label, variant.sizeType].filter(Boolean).join(' · '),
        price: variant.price,
        listPrice: variant.listPrice,
        discount: variant.discount,
        photo: variant.photo,
      }))
    : usingOfficialSizes
      ? officialSizes.map((option) => ({ key: option.label, label: option.label, price: option.price, listPrice: option.listPrice,
          discount: option.price && option.listPrice && option.listPrice > option.price ? Math.round((1 - option.price / option.listPrice) * 100) : undefined }))
      : usingApiSizes
        ? apiSizes.map((option) => ({ key: option.label, label: option.label, price: option.price, listPrice: option.listPrice,
            discount: option.price && option.listPrice && option.listPrice > option.price ? Math.round((1 - option.price / option.listPrice) * 100) : undefined }))
        : [];
  const activeSize = sizeOptions.find((option) => option.key === selectedVariantId)
    || sizeOptions.find((option) => option.key === sourceId);
  const hasSizeMenu = sizeOptions.length > 1;
  const hasPricedSizes = sizeOptions.some((option) => option.price !== undefined);
  // Until a size is chosen the catalog price stands, so opening the menu never
  // silently changes what the customer is looking at.
  const displayPrice = activeSize?.price !== undefined ? activeSize.price : selectedPrice;
  // A chosen size keeps its own original price; while the chosen size is unpriced
  // the catalogue's original price stands.
  const displayListPrice = activeSize?.price !== undefined
    ? (activeSize.listPrice && activeSize.listPrice > activeSize.price ? activeSize.listPrice : undefined)
    : selectedListPrice;
  const displayPhoto = (usingSizeVariants && activeVariant?.photo) || photoSource;
  const selectedSizeText = activeSize?.label || (usingOfficialSizes || usingApiSizes ? 'Select size' : '');
  const savedAmount = displayListPrice && displayListPrice > displayPrice ? displayListPrice - displayPrice : 0;

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(false);
    setLoading(true);

    const urls = [slugBase, slugHashless]
      .filter((value, index, all) => !!value && all.indexOf(value) === index)
      .map((value) => `https://rylqus.ae/api/products/product-detail/${encodeURIComponent(value)}/`);

    // The locale/country headers are what make the API return prices, so they are
    // tried first; the plain request is the fallback for when the CORS preflight
    // they trigger is rejected.
    const load = async () => {
      for (const url of urls) {
        for (const headers of [{ locale: 'en', country: 'ae' }, undefined]) {
          try {
            const response = await fetch(url, headers ? { headers } : undefined);
            if (!response.ok) continue;
            const payload = (await response.json()) as { data?: ApiProductDetail };
            if (!payload.data) continue;
            return payload.data;
          } catch {
            // try the next combination
          }
        }
      }
      return null;
    };

    load()
      .then((data) => {
        if (!active) return;
        if (data) setDetail(data);
        else setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [slugBase, slugHashless, reload]);

  // Everything the product page shows is read from the baked harvest first, with
  // the live API as a fallback, and the catalogue itself as the last resort.
  const baked = useMemo(() => getProductDetails(product.id), [product.id]);
  const catalogue = product as ProductDetailsProduct & { lb?: unknown; st?: unknown; dl?: unknown; fd?: unknown; fa?: unknown };
  // The API repeats its description in `general_information`, so equal texts are
  // collapsed after normalising line endings and whitespace.
  const description = dedupeText([product.d, baked?.info, detail?.general_information])
    .join('\n\n');
  const sizes = unique([...live.sizes, ...local.sizes]);
  const textSizes = extractTextSizes(`${productName} ${description}`);
  const displaySizes = sizes.length ? sizes : textSizes;
  const fabrics = unique([...local.fabrics, ...live.fabrics, ...(baked?.fabrics || [])]);
  const colorMap = new Map<string, { name: string; hex?: string; image?: string }>();
  [...local.colors, ...live.colors, ...(baked?.colors || [])].forEach((color) => addColor(colorMap, color.name, color.hex, color.image));
  const displayColors = [...colorMap.values()];
  const titleColors = displayColors.length ? [] : extractTitleColors(productName);
  const detailRows = dedupeRows([...live.rows, ...local.rows]).slice(0, 10);

  // General Information, grouped the way the product page groups it.
  const specSections = baked?.sections?.length
    ? baked.sections
    : live.sections;
  const galleryPaths = baked?.gallery?.length ? baked.gallery : live.images;
  const gallery = galleryPaths.map((path) => (path.startsWith('http') ? path : productImageUrl(path)));
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryPicked, setGalleryPicked] = useState(false);
  const chosenImage = gallery.length ? gallery[Math.min(galleryIndex, gallery.length - 1)] : undefined;
  // A tapped gallery image wins; otherwise the bundled photo stays the default, so
  // nothing regresses offline and a product without a bundled photo still gets the
  // site's own image.
  const galleryHero = chosenImage ? { uri: chosenImage } : undefined;

  const catalogueLabels = Array.isArray(catalogue.lb) ? (catalogue.lb as string[]).filter(Boolean) : [];
  const labels = unique([...(baked?.labels || []), ...catalogueLabels]);
  const stockStatus = baked?.stock?.status || live.stock?.status || (typeof catalogue.st === 'string' ? catalogue.st : undefined);
  const stockCount = baked?.stock?.count ?? live.stock?.count;
  const sku = baked?.sku || live.sku;
  const views = baked?.views ?? live.views;
  const rating = baked?.rating ?? live.rating;
  const deliveryDays = typeof catalogue.dl === 'number' && catalogue.dl > 0 ? catalogue.dl : undefined;
  // The API sends either a day count ("9") or an ISO date ("2026-10-27").
  const rawEstimate = baked?.deliveryEstimate || live.deliveryEstimate;
  const estimateIsDate = !!rawEstimate && /^\d{4}-\d{2}-\d{2}$/.test(rawEstimate);
  const deliveryEstimate = deliveryDays
    ? `About ${deliveryDays} days`
    : estimateIsDate
      ? formatDate(rawEstimate as string)
      : rawEstimate;
  const deliveryLabel = !deliveryDays && estimateIsDate ? 'Delivery date' : 'Delivery';
  const rawDeliveryDate = baked?.deliveryDate;
  const deliveryDate = rawDeliveryDate ? formatDate(rawDeliveryDate) : undefined;
  const freeDelivery = catalogue.fd === 1;
  const freeAssembly = baked?.freeAssembly ?? live.freeAssembly ?? catalogue.fa === 1;
  const madeToOrder = isMadeToOrderText(description);
  const isCustomizable = baked?.customizable ?? detail?.product_info?.is_customizable;
  const isSizeCustomizable = baked?.sizeCustomizable ?? detail?.product_info?.is_size_customizable;
  const installment = Math.round(displayPrice / 4);
  const hasAvailability = !!stockStatus || !!sku || !!deliveryEstimate || !!deliveryDate || freeDelivery || freeAssembly;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to collection" onPress={onBack} style={styles.back}>
          <ChevronRight color={COLORS.ink} size={20} style={styles.backIcon} />
          <Text style={styles.backText}>Back to collection</Text>
        </Pressable>

        <View style={styles.imageWrap}>
          {displayPhoto || galleryHero ? (
            <Image source={galleryPicked && galleryHero ? galleryHero : displayPhoto || galleryHero} style={styles.image} resizeMode="cover" />
          ) : (
            <Text style={styles.imageFallback}>{productName.slice(0, 1)}</Text>
          )}
        </View>

        {gallery.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll} contentContainerStyle={styles.galleryStrip}>
            {gallery.map((uri, index) => (
              <Pressable
                key={`${uri}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Product image ${index + 1} of ${gallery.length}`}
                accessibilityState={{ selected: galleryPicked && index === galleryIndex }}
                onPress={() => {
                  setGalleryIndex(index);
                  setGalleryPicked(true);
                }}
                style={[styles.galleryThumb, index === galleryIndex && styles.galleryThumbActive]}
              >
                <Image source={{ uri }} style={styles.galleryThumbImage} resizeMode="cover" />
              </Pressable>
            ))}
          </ScrollView>
        )}

        {gallery.length > 0 && <Text style={styles.imageNote}>{PRODUCT_IMAGE_NOTE}</Text>}

        <View style={styles.productIntro}>
          {!!product.scn && <Text style={styles.category}>{product.scn}</Text>}
          {labels.length > 0 && (
            <View style={styles.labelRow}>
              {labels.slice(0, 4).map((label) => <Text key={label} style={styles.labelPill}>{label}</Text>)}
            </View>
          )}
          <Text style={styles.name}>{productName}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{money(displayPrice)}</Text>
            {!!displayListPrice && displayListPrice > displayPrice && <Text style={styles.oldPrice}>{money(displayListPrice)}</Text>}
          </View>
          {savedAmount > 0 && <Text style={styles.savePill}>You save {money(savedAmount)}</Text>}
          {(!!rating || !!views) && (
            <View style={styles.metaRow}>
              {!!rating && (
                <View style={styles.metaItem}>
                  <Star color={COLORS.gold} size={13} fill={COLORS.gold} />
                  <Text style={styles.metaText}>{rating.toFixed(1)}</Text>
                </View>
              )}
              {!!views && <Text style={styles.metaText}>{views} views in 24 hrs</Text>}
            </View>
          )}
        </View>

        {hasSizeMenu && (
          <View style={styles.glassCard}>
            <BlurView pointerEvents="none" intensity={42} tint="light" style={styles.glassBlur} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Size, ${selectedSizeText}${activeSize?.price !== undefined ? `, ${money(activeSize.price)}` : ''}. Tap to change size`}
              accessibilityState={{ expanded: sizeOpen }}
              onPress={() => setSizeOpen((open) => !open)}
              style={styles.glassTrigger}
            >
              <View style={styles.glassTriggerCopy}>
                <Text style={styles.glassEyebrow}>Size</Text>
                <Text style={styles.glassValue}>{selectedSizeText}</Text>
              </View>
              <View style={styles.glassTriggerPrice}>
                {activeSize?.price !== undefined ? (
                  <>
                    <Text style={styles.glassTriggerAmount}>{money(activeSize.price)}</Text>
                    {!!activeSize.discount && <Text style={styles.glassTriggerSave}>{activeSize.discount}% off</Text>}
                  </>
                ) : (
                  <Text style={styles.glassTriggerSave}>{sizeOptions.length} sizes</Text>
                )}
              </View>
              <View style={styles.glassChevronWrap}>
                <ChevronRight color={COLORS.ink} size={18} style={{ transform: [{ rotate: sizeOpen ? '90deg' : '0deg' }] }} />
              </View>
            </Pressable>
            {sizeOpen && (
              <View style={styles.glassList}>
                {sizeOptions.map((option) => {
                  const isActive = option.key === activeSize?.key;
                  return (
                    <Pressable
                      key={option.key}
                      accessibilityRole="radio"
                      accessibilityLabel={option.price !== undefined ? `${option.label}, ${money(option.price)}` : option.label}
                      accessibilityState={{ selected: isActive }}
                      onPress={() => { setSelectedVariantId(option.key); setSizeOpen(false); }}
                      style={[styles.glassOption, isActive && styles.glassOptionActive]}
                    >
                      <View style={[styles.glassRadio, isActive && styles.glassRadioOn]}>{isActive && <View style={styles.glassRadioDot} />}</View>
                      <View style={styles.glassOptionCopy}>
                        <Text style={styles.glassOptionLabel}>{option.label}</Text>
                        {!!option.discount && option.listPrice !== undefined && option.price !== undefined && (
                          <Text style={styles.glassOptionMeta}>{option.discount}% off · was {money(option.listPrice)}</Text>
                        )}
                      </View>
                      {option.price !== undefined ? (
                        <Text style={styles.glassOptionPrice}>{money(option.price)}</Text>
                      ) : hasPricedSizes ? (
                        <Text style={styles.glassOptionPrice}>Ask</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {!hasPricedSizes && <Text style={styles.glassNote}>Official sizes for this piece. Prices for each size are confirmed by Royal Furniture on order.</Text>}
          </View>
        )}

        <View style={styles.sourceStatus} accessibilityLiveRegion="polite">
          {loading ? (
            <>
              <ActivityIndicator size="small" color={COLORS.red} />
              <Text style={styles.statusLoading}>Checking official product details…</Text>
            </>
          ) : error ? (
            <>
              <Text style={styles.statusError}>Official details couldn’t be loaded. Showing saved catalog information where available.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Retry loading official product details" onPress={() => setReload((value) => value + 1)} style={styles.retry}>
                <RefreshCw color={COLORS.ink} size={15} />
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.statusSuccess}>Official product options checked</Text>
          )}
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Product options</Text>
          <FactRow label="Made to order" value={madeToOrder ? 'Yes — stated in the product description' : 'Not stated in the available listing'} />
          <FactRow
            label="Customization"
            value={
              isCustomizable === true && isSizeCustomizable === true
                ? 'Available — any colour, any size'
                : isCustomizable === true
                  ? 'Available — any colour'
                  : isSizeCustomizable === true
                    ? 'Available — custom sizes'
                    : isCustomizable === false
                      ? 'Not available'
                      : /\b(select|choose|customi[sz])\w*/i.test(description) ? 'Described in the product listing' : 'Not specified'
            }
          />
          {hasDifferentSizePrices && !hasSizeMenu ? (
            <View style={styles.sizeSelection}>
              <Text style={styles.sizeLabel}>Choose size</Text>
              <View style={styles.sizeOptions}>
                {local.sizePrices.map((option) => {
                  const selectedOption = selectedSize === option.name;
                  return (
                    <Pressable
                      key={option.name}
                      accessibilityRole="radio"
                      accessibilityLabel={`${option.name}, ${money(option.price)}`}
                      accessibilityState={{ selected: selectedOption }}
                      onPress={() => setSelectedSize(option.name)}
                      style={[styles.sizeOption, selectedOption && styles.sizeOptionSelected]}
                    >
                      <Text style={[styles.sizeOptionName, selectedOption && styles.sizeOptionNameSelected]}>{option.name}</Text>
                      <Text style={[styles.sizeOptionPrice, selectedOption && styles.sizeOptionNameSelected]}>{money(option.price)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.sizeHint}>Price updates with your selected size.</Text>
              {isSizeCustomizable === true && <Text style={styles.sizeHint}>Custom sizing is also available.</Text>}
            </View>
          ) : (
            <FactRow
              label="Size options"
              value={displaySizes.length ? displaySizes.join(' · ') : 'Not listed'}
              note={isSizeCustomizable === true ? 'Custom sizing is available.' : undefined}
            />
          )}
          <FactRow label="Fabrics" value={fabrics.length ? fabrics.join(' · ') : 'Not listed'} />
          <View style={styles.colorFact}>
            <Text style={styles.factLabel}>Colors</Text>
            {displayColors.length ? (
              <View style={styles.colorList}>
                {displayColors.map((color) => (
                  <View key={color.name} style={styles.colorPill}>
                    {color.image ? (
                      <Image source={{ uri: productImageUrl(color.image) }} style={styles.swatchImage} resizeMode="cover" />
                    ) : color.hex ? (
                      <View style={[styles.swatch, { backgroundColor: color.hex }]} />
                    ) : null}
                    <Text style={styles.colorName}>{color.name}</Text>
                  </View>
                ))}
              </View>
            ) : titleColors.length ? (
              <Text style={styles.factValue}>{titleColors.join(' · ')} <Text style={styles.mutedNote}>(from product name)</Text></Text>
            ) : /\b(select|choose)\w*\s+(?:the\s+)?(?:fabric\s+and\s+)?colou?r/i.test(description) ? (
              <Text style={styles.factValue}>Selectable — available shades aren’t listed</Text>
            ) : (
              <Text style={styles.factValue}>Not listed</Text>
            )}
          </View>
        </View>

        {hasAvailability && (
          <View style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>Availability & delivery</Text>
            {!!stockStatus && (
              <FactRow
                label="Availability"
                value={stockCount ? `${humanize(stockStatus)} · up to ${stockCount} per order` : humanize(stockStatus)}
              />
            )}
            {!!deliveryEstimate && <FactRow label={deliveryLabel} value={deliveryEstimate} />}
            {!!deliveryDate && <FactRow label="Delivery date" value={deliveryDate} />}
            {freeAssembly && <FactRow label="Assembly" value="Free assembly included" />}
            {freeDelivery && <FactRow label="Delivery charges" value="Free on orders above AED 500" />}
            {!!sku && <FactRow label="SKU" value={sku} />}
          </View>
        )}

        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <FactRow label="Flexi payment" value={`Split in 4 of ${money(installment)}`} note={PRODUCT_PAYMENT_NOTE} />
        </View>

        {!!specSections.length && (
          <View style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>General information</Text>
            {specSections.map((section) => (
              <View key={section.name} style={styles.specSection}>
                <Text style={styles.specHeading}>{humanize(section.name)}</Text>
                {section.rows.map((row, index) => (
                  <FactRow key={`${section.name}-${row.label}-${index}`} label={row.label || ''} value={row.value || ''} />
                ))}
              </View>
            ))}
          </View>
        )}

        {!specSections.length && !!detailRows.length && (
          <View style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>Dimensions & specifications</Text>
            {detailRows.map((row, index) => <FactRow key={`${row.label}-${index}`} label={row.label || ''} value={row.value || ''} />)}
          </View>
        )}

        {!!description && (
          <View style={styles.descriptionCard}>
            <Text style={styles.sectionTitle}>About this piece</Text>
            <Text style={styles.description}>{description}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.actionBar}>
        <Pressable accessibilityRole="button" accessibilityLabel={isSaved ? 'Remove from saved items' : 'Save product'} onPress={onSave} style={styles.saveButton}>
          <Heart size={20} color={isSaved ? COLORS.red : COLORS.ink} fill={isSaved ? COLORS.red : 'transparent'} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Add to bag, ${activeSize ? selectedSizeText : 'one size'}, ${money(displayPrice)}`} onPress={() => onAdd({ size: hasSizeMenu && activeSize ? selectedSizeText : hasDifferentSizePrices ? selectedSizeOption?.name : undefined, price: displayPrice, listPrice: displayListPrice })} style={styles.addButton}>
          <ShoppingBag color={COLORS.white} size={18} />
          <Text style={styles.addButtonText}>Add to bag · {money(displayPrice)}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function FactRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <View style={styles.factTextGroup}>
        <Text style={styles.factValue}>{value}</Text>
        {!!note && <Text style={styles.mutedNote}>{note}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cream , ...GLASS.transparent },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 12 },
  backIcon: { transform: [{ rotate: '180deg' }], marginRight: 4 },
  backText: { color: COLORS.ink, fontSize: 14, fontWeight: '600' },
  imageWrap: { minHeight: 250, aspectRatio: 1, borderRadius: 18, backgroundColor: '#E6E0D9', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' , ...GLASS.hero, ...glassTilt(1.5, -1.4) },
  image: { width: '100%', height: '100%' },
  imageFallback: { color: COLORS.ink, fontSize: 64, fontWeight: '700' },
  productIntro: { paddingTop: 18, paddingBottom: 16 },
  category: { color: COLORS.red, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  name: { color: COLORS.ink, fontSize: 25, lineHeight: 31, fontWeight: '800', marginTop: 5 },
  price: { color: COLORS.ink, fontSize: 21, fontWeight: '800', marginTop: 8 },
  oldPrice: { color: COLORS.muted, fontSize: 13, textDecorationLine: 'line-through', marginTop: 3 },
  sourceStatus: { minHeight: 42, borderRadius: 12, backgroundColor: COLORS.white, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 , ...GLASS.chip },
  statusLoading: { color: COLORS.muted, fontSize: 12, flex: 1 },
  statusError: { color: COLORS.muted, fontSize: 12, lineHeight: 17, flex: 1 },
  statusSuccess: { color: COLORS.green, fontSize: 12, fontWeight: '700' },
  retry: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  retryText: { color: COLORS.ink, fontSize: 12, fontWeight: '700' },
  detailsCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 14 , ...GLASS.panelStrong },
  sectionTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  factRow: { minHeight: 50, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  factLabel: { color: COLORS.muted, fontSize: 13, lineHeight: 19, flex: 0.8 },
  factTextGroup: { flex: 1.2, alignItems: 'flex-end' },
  factValue: { color: COLORS.ink, fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'right' },
  mutedNote: { color: COLORS.muted, fontSize: 11, lineHeight: 16, textAlign: 'right' },
  sizeSelection: { paddingTop: 12, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line, gap: 8 , ...GLASS.chip },
  sizeLabel: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  sizeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeOption: { width: '48%', minHeight: 58, justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: COLORS.white , ...GLASS.chip },
  sizeOptionSelected: { borderColor: COLORS.red, backgroundColor: '#FEF3F2' , ...GLASS.chipActive },
  sizeOptionName: { color: COLORS.ink, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  sizeOptionPrice: { color: COLORS.muted, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  sizeOptionNameSelected: { color: COLORS.red },
  sizeHint: { color: COLORS.muted, fontSize: 11, lineHeight: 15 },
  colorFact: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line },
  colorList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  colorPill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 9, paddingVertical: 5 , ...GLASS.chip },
  swatch: { width: 15, height: 15, borderRadius: 8, borderWidth: 1, borderColor: '#D0D5DD' },
  colorName: { color: COLORS.ink, fontSize: 11, fontWeight: '600' },
  descriptionCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 12 , ...GLASS.panelStrong },
  description: { color: COLORS.muted, fontSize: 14, lineHeight: 22 },
  actionBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: COLORS.line, backgroundColor: COLORS.white , ...GLASS.barTop },
  saveButton: { minWidth: 50, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: COLORS.line , ...GLASS.chip },
  addButton: { minHeight: 50, flex: 1, borderRadius: 14, backgroundColor: COLORS.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 12 , ...GLASS.buttonPrimary },
  addButtonText: { color: COLORS.white, fontSize: 14, fontWeight: '800' },

  // Glass size dropdown — frosted panel with a translucent blur backdrop.
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  savePill: { color: COLORS.red, fontSize: 12, fontWeight: '800', marginTop: 6 },
  glassCard: { marginBottom: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.78)', backgroundColor: 'rgba(255,255,255,0.38)', overflow: 'hidden', shadowColor: '#050000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 , ...GLASS.chrome },
  glassBlur: { ...StyleSheet.absoluteFillObject },
  glassTrigger: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  glassTriggerCopy: { flex: 1, minWidth: 0 },
  glassEyebrow: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  glassValue: { color: COLORS.ink, fontSize: 15, fontWeight: '800', marginTop: 3 },
  glassTriggerPrice: { alignItems: 'flex-end' },
  glassTriggerAmount: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  glassTriggerSave: { color: COLORS.red, fontSize: 10, fontWeight: '800', marginTop: 2 },
  glassChevronWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)' , ...GLASS.chip },
  glassList: { backgroundColor: 'rgba(255,255,255,0.3)' },
  glassOption: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.8)' },
  glassOptionActive: { backgroundColor: 'rgba(255,255,255,0.66)' },
  glassRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: 'rgba(16,24,40,0.3)', alignItems: 'center', justifyContent: 'center' },
  glassRadioOn: { borderColor: COLORS.ink },
  glassRadioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.ink },
  glassOptionCopy: { flex: 1, minWidth: 0 },
  glassOptionLabel: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  glassOptionMeta: { color: COLORS.red, fontSize: 10, marginTop: 3 },
  glassOptionPrice: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  glassNote: { color: COLORS.muted, fontSize: 10, lineHeight: 14, paddingHorizontal: 14, paddingBottom: 12 },
  galleryScroll: { marginTop: 10, flexGrow: 0 },
  galleryStrip: { gap: 8, paddingRight: 4 },
  galleryThumb: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', backgroundColor: '#E6E0D9' , ...GLASS.chip },
  galleryThumbActive: { borderColor: COLORS.red },
  galleryThumbImage: { width: '100%', height: '100%' },
  imageNote: { color: COLORS.muted, fontSize: 10, lineHeight: 14, marginTop: 8 },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  labelPill: { color: COLORS.red, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', backgroundColor: '#FDE8E9', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  specSection: { marginTop: 12 },
  specHeading: { color: COLORS.ink, fontSize: 12, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 2 },
  swatchImage: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: '#D0D5DD' },
});
