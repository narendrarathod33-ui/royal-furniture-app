#!/usr/bin/env python3
"""Build app/data/productDetails.ts from harvest/product-details.json.

The harvested payloads are large (every product carries a General Information
block, colour swatches with images, fabric options and a gallery), so the module
is emitted with a single interned string table: every distinct string is stored
once and referenced by index, which keeps the bundled asset small without losing
a single field. This script is the pipeline step between the harvest workflow
(``.github/workflows/harvest-details.yml``) and the app.

Usage:  python3 harvest/build-product-details.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'harvest' / 'product-details.json'
# Full gallery per slug (primary + additional images), captured separately.
IMAGE_SOURCE = ROOT / 'harvest' / 'product-images.json'
TARGET = ROOT / 'app' / 'data' / 'productDetails.ts'

# The S3 bucket every harvested image lives in; only bucket-relative paths are
# stored so the module stays small.
IMAGE_BASE = 'https://royal-furniture-515966538173-ap-south-1-an.s3.ap-south-1.amazonaws.com/'

MAX_IMAGES = 8
MAX_COLORS = 8
MAX_SECTION_ROWS = 14

# Site copy that belongs to the product page itself rather than to one product.
NOTE = ('Product images include props used for illustrative purposes. '
        'Colour may vary slightly due to photographic lighting or your screen settings.')
FLEXI = 'Flexi payment available — pay 20% upfront to confirm your booking, the balance before delivery.'


class Strings:
    """Interns every distinct string so it is stored once."""

    def __init__(self):
        self.values = []
        self.index = {}

    def add(self, value):
        if value is None:
            return -1
        text = str(value).strip()
        if not text:
            return -1
        found = self.index.get(text)
        if found is None:
            found = len(self.values)
            self.values.append(text)
            self.index[text] = found
        return found

    def add_all(self, values):
        return [self.add(value) for value in values or []]


def load():
    if not SOURCE.exists():
        return {}, {}, {}
    raw = json.loads(SOURCE.read_text())
    images = json.loads(IMAGE_SOURCE.read_text()) if IMAGE_SOURCE.exists() else {}
    return raw.get('listing') or {}, raw.get('details') or {}, images


def build():
    listing, details, gallery_by_slug = load()
    strings = Strings()
    records = {}

    for slug, detail in details.items():
        if not isinstance(detail, dict) or detail.get('error'):
            continue
        list_row = listing.get(slug) or {}
        record = {}

        info = strings.add(detail.get('info'))
        if info >= 0:
            record['i'] = info

        sku = strings.add(list_row.get('sku'))
        if sku >= 0:
            record['k'] = sku

        labels = [value for value in strings.add_all(list_row.get('labels')) if value >= 0]
        if labels:
            record['l'] = labels

        stock_status = strings.add(list_row.get('stock'))
        stock_count = list_row.get('stock_count')
        if stock_status >= 0 or stock_count:
            record['s'] = [stock_status, stock_count or -1]

        views = list_row.get('views')
        rating = list_row.get('rating')
        if views:
            record['v'] = views
        if rating:
            record['r'] = round(float(rating), 1)

        # General Information blocks: Material / Dimensions / Specs / Warranty / Assembly …
        sections = []
        for name, rows in (detail.get('sections') or {}).items():
            name_index = strings.add(name)
            pairs = []
            for row in rows[:MAX_SECTION_ROWS]:
                label = strings.add(row[0] if len(row) > 0 else None)
                value = strings.add(row[1] if len(row) > 1 else None)
                if label >= 0 or value >= 0:
                    pairs.extend([label, value])
            if pairs:
                sections.append([name_index, pairs])
        if sections:
            record['g'] = sections

        colors = []
        for color in (detail.get('colors') or [])[:MAX_COLORS]:
            name_index = strings.add(color.get('n'))
            if name_index < 0:
                continue
            colors.append([name_index, strings.add(color.get('hex')), strings.add(color.get('img'))])
        if colors:
            record['o'] = colors

        fabrics = [value for value in strings.add_all(detail.get('fabrics')) if value >= 0]
        if fabrics:
            record['f'] = fabrics

        gallery = gallery_by_slug.get(slug) or detail.get('images') or []
        images = [value for value in strings.add_all(gallery) if value >= 0][:MAX_IMAGES]
        if images:
            record['p'] = images

        product_info = detail.get('pi') or {}
        delivery_info = detail.get('di') or {}
        flags = []
        if product_info.get('is_customizable') is True:
            flags.append('c')
        if product_info.get('is_size_customizable') is True:
            flags.append('z')
        estimate = product_info.get('delivery_estimate_days') or delivery_info.get('estimated_delivery')
        estimate_index = strings.add(estimate)
        if estimate_index >= 0:
            record['e'] = estimate_index
        delivery_date = delivery_info.get('estimated_delivery')
        if delivery_date and delivery_date != estimate:
            date_index = strings.add(delivery_date)
            if date_index >= 0:
                record['t'] = date_index
        if delivery_info.get('supports_free_assembly') is True:
            flags.append('a')
        if flags:
            record['q'] = strings.add_all(flags)

        if len(record) > 1 or record.get('g') or record.get('o'):
            records[slug] = record

    return strings.values, records


SHELL_HEAD = '''/**
 * Product-page details for the whole catalogue, harvested from the store's
 * product pages (see `harvest/product-details.json` and
 * `harvest/build-product-details.py`, which generated this file).
 *
 * The website shows each product's General Information blocks (Material,
 * Dimensions, Specs, Warranty, Assembly), its colour and fabric options with
 * images, a photo gallery, availability, delivery and payment notes, and the
 * SKU. This module carries those fields into the app for every product, so the
 * product page shows them without depending on a live fetch from the browser.
 *
 * Storage: every distinct string lives once in `T` (an interned table) and the
 * per-product records hold indices into it, which keeps the payload small.
 * `getProductDetails()` decodes them back into the typed shape below — read
 * through that function rather than touching `RAW`.
 */
import { slugFromProductId } from './officialSizes';

/** Bucket every gallery / swatch image path is relative to. */
export const PRODUCT_IMAGE_BASE = '__IMAGE_BASE__';

/** Site copy shown under the product gallery on every product page. */
export const PRODUCT_IMAGE_NOTE =
  '__NOTE__';

/** Payment note the product page shows beside the price. */
export const PRODUCT_PAYMENT_NOTE =
  '__FLEXI__';

export type SpecSection = { name: string; rows: { label: string; value: string }[] };
export type DetailColor = { name: string; hex?: string; image?: string };
export type ProductDetailRecord = {{
  /** General Information copy from the product page. */
  info?: string;
  /** Schema.org-style SKU shown on the page. */
  sku?: string;
  /** Merchandising labels, e.g. "Best Seller", "Online Only". */
  labels: string[];
  /** Availability line: status plus per-order cap when the page shows one. */
  stock?: {{ status?: string; count?: number }};
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
}};

type RawSection = [nameIndex: number, pairs: number[]];
type RawColor = [nameIndex: number, hexIndex: number, imageIndex: number];
type RawDetail = {{
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
}};

/** Interned strings — every text value in the catalogue, stored once. */
const T: readonly string[] = ''' + '\n'

SHELL_MID = ''';

/** slug -> record. Generated; use getProductDetails() instead of reading this. */
const RAW: Record<string, RawDetail> = ''' + '\n'

SHELL_TAIL = ''';

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

/** Full product-page details for a catalogue id, or undefined when not harvested. */
export function getProductDetails(productId: string): ProductDetailRecord | undefined {
  const slug = slugFromProductId(productId);
  const raw = RAW[slug] || RAW[slug.replace(/-[0-9a-f]{6}$/, '')];
  return raw ? decode(raw) : undefined;
}

/** Absolute URL for a harvested image path. */
export function productImageUrl(path: string): string {
  return path.startsWith('http') ? path : `${PRODUCT_IMAGE_BASE}${path}`;
}
'''


def emit(strings, records):
    table = '[\n' + '\n'.join('  ' + json.dumps(value, ensure_ascii=False) + ',' for value in strings) + '\n]'
    body = '{\n' + '\n'.join(
        '  ' + json.dumps(slug) + ': ' + json.dumps(record, separators=(',', ':'), ensure_ascii=False) + ','
        for slug, record in sorted(records.items())
    ) + '\n}'
    unescape = lambda text: text.replace('{{', '{').replace('}}', '}')
    head = unescape(SHELL_HEAD
                    .replace('__IMAGE_BASE__', IMAGE_BASE)
                    .replace('__NOTE__', NOTE.replace("'", "\\'"))
                    .replace('__FLEXI__', FLEXI.replace("'", "\\'")))
    # The interned table is inserted after unescaping, so a string that happens
    # to contain doubled braces is never rewritten.
    text = head + table + unescape(SHELL_MID) + body + unescape(SHELL_TAIL)
    TARGET.write_text(text)


if __name__ == '__main__':
    strings, records = build()
    emit(strings, records)
    size = TARGET.stat().st_size
    print(f'{TARGET.name}: {len(records)} products, {len(strings)} interned strings, {size / 1024:.0f} KB')
