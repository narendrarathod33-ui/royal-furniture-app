import raw from '../../data/master.json';

/**
 * Typed accessors for `data/master.json` — the editable master data file.
 *
 * The app currently keeps its content in the generated modules next to this one
 * (`catalogData.ts`, `productDetails.ts`, `royalFurnitureData.ts`, …). This
 * module is the bridge to the hand-editable file: screens can read the same
 * content from here instead, so testing changes need no code edits.
 *
 * Nothing imports this file yet, so behaviour and bundle size are unchanged.
 * To switch a screen over, see `data/README.md` → "How the app should read it".
 * Note: importing this module pulls the whole JSON into the web bundle
 * (~2.9 MB); split `products`/`deals` out first if that matters to you.
 */

export type Money = number;
const PLACEHOLDER = 'REPLACE_ME';

export type Placeholder = typeof PLACEHOLDER;

export type PriceFields = {
  price: Money;
  listPrice: Money;
  discountPercent: number;
};

export type SizeOption = {
  /** Catalogue id of the sibling row for this size, when the site stores one per size. */
  id?: string;
  label: string;
  price: Money;
  listPrice: Money;
};

export type ColourOption = { name: string; hex?: string; image?: string };

/** General Information blocks as the site publishes them: section -> [label, value] pairs. */
export type SpecBlock = Record<string, [string, string][]>;

export type ProductRecord = PriceFields & {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  subcategory: string | null;
  subcategoryName: string | null;
  badges: string[];
  stockStatus: string | null;
  stockCap: number | null;
  deliveryDays: number | null;
  deliveryEstimate: string | null;
  freeDelivery: boolean;
  freeAssembly: boolean;
  madeToOrder: boolean;
  description: string;
  image: string | null;
  gallery: string[];
  /** Present when the item has >1 size: the dropdown options and their prices. */
  sizes?: SizeOption[];
  sizesFrom?: 'site-prices' | 'site-labels';
  /** Present when the item has exactly one size — there is no choice to make. */
  sizeLabel?: string;
  fabrics?: string[];
  colors?: ColourOption[];
  specs?: SpecBlock;
  views?: number;
  rating?: number | null;
  /** Set when an identical catalogue row exists; listings fold these. */
  duplicateOf?: string;
  enabled: boolean;
};

export type CategoryRecord = {
  id: string;
  name: string;
  nameAr: string | null;
  color: string | null;
  tileAsset: string | null;
  subcategories: { id: string; name: string }[];
  productCount: number;
  enabled: boolean;
};

export type LeafRecord = { id: string; name: string; category: string; subcategory: string };

export type StoreRecord = {
  id: string;
  city: string;
  address: string;
  openingTime: string;
  closingTime: string;
  phone: string;
  clickAndCollect: boolean;
  enabled: boolean;
};

export type OrderLineRecord = { productId: string; name: string; category: string; quantity: number; price: Money; size: string | null };

export type OrderRecord = {
  _sample?: boolean;
  id: string;
  purchasedAt: string;
  deliveryDate: string;
  status: string;
  fulfilment: string;
  storeId?: string;
  total: Money;
  items: OrderLineRecord[];
  customer: { name: string; phone: string; email?: string; address: string | null };
  warrantyClaimed: boolean;
};

export type AccountRecord = {
  _sample?: boolean;
  id: string;
  name: string;
  email: string;
  phone: string;
  savedProductIds: string[];
  preferredStoreId: string;
};

export type FeatureFlags = {
  useLiveProductApi: boolean;
  enableLaunchScreen: boolean;
  enableGlassSurfaces: boolean;
  enableSizeDropdown: boolean;
  catalogOnlyMode: boolean;
  showRatings: boolean;
  showStockBadges: boolean;
};

/** Sections kept loose on purpose: you can add keys while testing without a type error. */
type Section<T> = T & { _comment?: string; _fields?: Record<string, string> };
type ItemsSection<T> = Section<{ count?: number; items: T[] }>;

export type MasterFile = {
  _meta: Record<string, unknown>;
  settings: Section<Record<string, any>> & {
    brand: { name: string; logoAsset: string; website: string };
    locale: { language: string; country: string; currency: string; moneyFormat: string };
    contact: { supportPhone: string; whatsapp: string; supportEmail: string };
    commerce: Record<string, any>;
    images: { baseUrl: string; productImageNote: string };
    api: Record<string, any>;
  };
  featureFlags: FeatureFlags & { _comment?: string };
  theme: Section<Record<string, any>>;
  launch: Section<Record<string, any>> & { logoAsset: string; timing: Record<string, number>; skipLabel: string };
  labels: Section<Record<string, any>>;
  copy: Section<Record<string, any>>;
  categories: ItemsSection<CategoryRecord>;
  leaves: ItemsSection<LeafRecord>;
  filters: Section<Record<string, any>>;
  policies: Section<Record<string, any>>;
  payments: Section<Record<string, any>>;
  checkout: Section<Record<string, any>>;
  stores: ItemsSection<StoreRecord>;
  orders: ItemsSection<OrderRecord>;
  accounts: ItemsSection<AccountRecord>;
  products: ItemsSection<ProductRecord>;
  deals: ItemsSection<ProductRecord>;
};

/** The whole file. Read through it, or use the named exports below. */
export const master = raw as unknown as MasterFile;

export const settings = master.settings;
export const theme = master.theme;
export const launch = master.launch;
export const labels = master.labels;
export const copy = master.copy;
export const filters = master.filters;
export const policies = master.policies;
export const payments = master.payments;
export const checkout = master.checkout;
export const categories = master.categories.items;
export const leaves = master.leaves.items;
export const stores = master.stores.items;
export const orders = master.orders.items;
export const accounts = master.accounts.items;
export const products = master.products.items;
export const deals = master.deals.items;

/** True for any value still waiting to be filled in (see _meta.placeholderRule). */
export const isPlaceholder = (value: unknown): boolean => typeof value === 'string' && value.startsWith(PLACEHOLDER);

/** "AED 3,000" — driven by settings.locale.moneyFormat. */
export const money = (amount: number): string =>
  settings.locale.moneyFormat.replace('{amount}', amount.toLocaleString('en-US'));

export const productById = (id: string): ProductRecord | undefined => products.find((row) => row.id === id);

/** Matches either the full id or its trailing slug ("7072-serafina-corner-sofa" / "serafina-corner-sofa"). */
export const productBySlug = (slug: string): ProductRecord | undefined =>
  products.find((row) => row.id === slug || row.id.endsWith(`-${slug}`));

export const dealById = (id: string): ProductRecord | undefined => deals.find((row) => row.id === id);
export const categoryById = (id: string): CategoryRecord | undefined => categories.find((row) => row.id === id);
export const storeById = (id: string): StoreRecord | undefined => stores.find((row) => row.id === id);

/** Only the rows you can actually see in the app (enabled !== false). */
export const visibleProducts = (): ProductRecord[] => products.filter((row) => row.enabled !== false);
export const productsInCategory = (categoryId: string): ProductRecord[] =>
  visibleProducts().filter((row) => row.category === categoryId);

/** Warranty wording for a product category, falling back to the generic text. */
export const warrantyFor = (categoryId: string): string =>
  policies.warranty.byCategory[categoryId] ?? policies.warranty.defaultText;

/** Dot-path lookup, e.g. `text('labels.states.noProducts')` or `text('copy.cart.title')`. */
export const text = (path: string, fallback = ''): string => {
  const found = path.split('.').reduce<any>((node, key) => (node == null ? undefined : node[key]), master);
  return typeof found === 'string' ? found : fallback;
};

export const flagOn = (name: keyof FeatureFlags): boolean => master.featureFlags[name] !== false;
