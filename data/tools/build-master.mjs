#!/usr/bin/env node
/**
 * Builds data/master.json — the single editable master data file for the app.
 *
 * It harvests the app's own data modules plus the committed harvest artifacts
 * (the site's product pages) and writes one JSON document with a documented
 * section for each kind of editable content.
 *
 *   node data/tools/build-master.mjs
 *
 * ⚠ Re-running this OVERWRITES data/master.json. If you have hand-edits, make a
 * copy first (the generator does not merge). See data/README.md.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const REPLACE = 'REPLACE_ME';

/** Pulls the first JSON array/object literal out of a generated TS module. */
function literal(source, startChar) {
  const from = source.indexOf(startChar);
  const body = source.slice(from).replace(/\bas const\s*;?\s*$/, '').replace(/;\s*$/, '');
  return JSON.parse(body);
}

// ----------------------------------------------------------------- sources
const catalog = literal(read('app/data/catalogData.ts'), '[');
const deals = literal(read('app/data/dealsCatalog.ts'), '[');
const royal = literal(read('app/data/royalFurnitureData.ts'), '{');
const leaves = literal(read('app/data/catalogLeaves.ts'), '[');
const harvest = json('harvest/product-details.json');
const galleries = json('harvest/product-images.json');
const pricedSizes = json('harvest/sizes-priced.json').sizes || {};

const slugOf = (id) => String(id).replace(/^\d+-/, '');
const pricingOf = (row) => {
  const price = Number(row.o) || 0;
  const listPrice = Number(row.l) || 0;
  const percent = Number(row.pc) || (listPrice > price ? Math.round((1 - price / listPrice) * 100) : 0);
  return { price, listPrice, discountPercent: percent };
};
const S3 = 'https://royal-furniture-515966538173-ap-south-1-an.s3.ap-south-1.amazonaws.com/';
const relativePath = (url) => (typeof url === 'string' ? url.replace(S3, '') : url);

/** Sections of the product page that the site publishes, per product. */
function specsOf(detail) {
  const sections = detail?.sections || {};
  const out = {};
  for (const [name, rows] of Object.entries(sections)) {
    const pairs = (rows || [])
      .filter((row) => Array.isArray(row) && (row[0] || row[1]))
      .map((row) => [row[0] ?? '', row[1] ?? '']);
    if (pairs.length) out[name] = pairs;
  }
  return out;
}

// Rows that are byte-identical to an earlier row (same category, name and
// price) are flagged so duplicate listing cards can be hidden while testing.
const duplicates = new Map();
{
  const seen = new Map();
  for (const row of catalog) {
    const key = [row.c, row.sc || '', row.n, row.o, row.l].join('|');
    if (seen.has(key)) duplicates.set(row.id, seen.get(key));
    else seen.set(key, row.id);
  }
}

/** One catalogue product, merged with everything the site shows for it. */
function productRecord(row, options = {}) {
  const slug = slugOf(row.id);
  const detail = harvest.details[slug] || {};
  const listing = harvest.listing[slug] || {};
  const { price, listPrice, discountPercent } = pricingOf(row);
  const badges = [...new Set([...(row.lb || []), ...(listing.labels || [])])].filter(Boolean);
  const gallery = (galleries[slug] || detail.images || []).map(relativePath).filter(Boolean);

  const priced = pricedSizes[slug];
  const siteSizes = Array.isArray(priced) ? priced : [];
  const labelSizes = (detail.sizes || []).filter(Boolean);

  let sizes = [];
  let sizesFrom;
  if (siteSizes.length) {
    sizes = siteSizes.map(([label, sizePrice, sizeList]) => ({
      label,
      price: Number(sizePrice) || price,
      listPrice: Number(sizeList) || listPrice,
    }));
    sizesFrom = 'site-prices';
  } else if (labelSizes.length) {
    sizes = labelSizes.map((label) => ({ label, price, listPrice }));
    sizesFrom = 'site-labels';
  }

  const colors = (detail.colors || [])
    .map((color) => {
      const entry = { name: color.n };
      if (color.hex) entry.hex = color.hex;
      if (color.img) entry.image = relativePath(color.img);
      return entry;
    })
    .filter((color) => color.name);
  const specs = specsOf(detail);
  const description = (row.d || '').replace(/\r\n?/g, '\n').trim();

  const record = {
    id: row.id,
    sku: listing.sku || null,
    name: row.n,
    category: row.c,
    subcategory: row.sc || null,
    subcategoryName: row.scn || null,
    ...pricingOf({ o: price, l: listPrice, pc: discountPercent }),
    badges,
    stockStatus: listing.stock || row.st || null,
    stockCap: typeof listing.stock_count === 'number' ? listing.stock_count : null,
    deliveryDays: Number(row.dl) || null,
    deliveryEstimate: detail.pi?.delivery_estimate_days || detail.di?.estimated_delivery || null,
    freeDelivery: row.fd === 1,
    freeAssembly: row.fa === 1,
    madeToOrder: /\bmade[\s-]+to[\s-]+order\b/i.test(description),
    description,
    image: row.remoteImage || (detail.images?.[0] ? S3 + detail.images[0] : null),
    gallery,
    enabled: true,
  };
  if (sizes.length > 1) {
    record.sizesFrom = sizesFrom;
    record.sizes = sizes;
  } else if (sizes.length === 1) {
    // A single "### Size" step on the site ("Single", "Standard", "6 seater"):
    // there is no size choice, so it is one short string rather than an array.
    record.sizeLabel = sizes[0].label;
  }
  if (detail.fabrics?.length) record.fabrics = detail.fabrics.filter(Boolean);
  if (colors.length) record.colors = colors;
  if (Object.keys(specs).length) record.specs = specs;
  if (options.keepViews && listing.views) record.views = listing.views;
  if (options.keepViews && listing.rating) record.rating = listing.rating;
  if (duplicates.has(row.id)) record.duplicateOf = duplicates.get(row.id);
  return record;
}

const products = catalog.map((row) => productRecord(row, { keepViews: true }));
const dealProducts = deals.map((row) => {
  const record = productRecord(row, { keepViews: false });
  delete record.specs;
  delete record.gallery;
  delete record.colors;
  return record;
});

// ------------------------------------------------------------------ documents
const featured = (category, subcategory) =>
  catalog.find((row) => row.c === category && (!subcategory || row.sc === subcategory) && row.remoteImage)?.id || null;

const doc = {
  _meta: {
    _comment: 'Read me first. Everything else in this file is app content you can edit.',
    name: 'Royal Furniture — master data',
    purpose: 'Single editable source for items, prices, categories, copy, labels, settings and test data.',
    version: '1.0.0',
    generatedAt: new Date('2026-10-17T00:00:00Z').toISOString(),
    harvestSource: `app catalogue (${catalog.length} rows) + committed site harvest (${Object.keys(harvest.details).length} product pages, captured 2026-10-16)`,
    placeholderMarker: REPLACE,
    placeholderRule: `Any value that starts with "${REPLACE}" is a placeholder — search the file for it, replace the value (the hint in brackets tells you what to put there) and drop the marker.`,
    sampleRule: 'Records containing "_sample": true are invented examples for testing (orders, accounts). Delete or replace them.',
    conventions: {
      ids: 'product ids are "<sku-number>-<slug>" from the feed; deal ids reuse the same scheme; store/section ids are lowercase slugs',
      money: 'integer AED amounts, rendered as "AED 1,234". All prices are what the app displays (tax-inclusive by convention).',
      booleans: 'true/false (never 1/0)',
      nulls: 'null means "the app should not show this field"; omitted keys mean the same and keep the file small',
      dates: 'ISO "YYYY-MM-DD"; deliveryEstimate is a quoted date and goes stale — prefer deliveryDays',
      specs: 'specs[section] is a list of [label, value] pairs, section names match the website (material, dimensions, specs, warranty, assembly, size_comfort_guide)',
      gallery: 'gallery entries are paths relative to settings.images.baseUrl; image/gallery[0] is absolute',
    },
    howToEdit: [
      'Edit any value, save, and the app reloads (Metro watches JSON imports).',
      'Hide a product from the app during testing: set its "enabled": false.',
      'Change a price: edit "price", and "listPrice" if the item has a strike-through price. Keep "discountPercent" consistent with them — that is the % OFF pill.',
      'Add a product: copy an existing record, give it a unique "id", then add it to a category that exists in "categories".',
      'Per-size prices live in the product\'s "sizes" array — the size dropdown uses these.',
      'Unknown values are marked "REPLACE_ME" — replace them or the app shows nothing for that field.',
    ],
    sectionGuide: [
      { section: 'settings', controls: 'brand, locale, currency, contact details, delivery/returns rules, image base URL, live API endpoint' },
      { section: 'featureFlags', controls: 'switches that turn app behaviour on/off (wire-up required — see README)' },
      { section: 'theme', controls: 'brand colours, category colours, glass surface values, radii, font stack' },
      { section: 'launch', controls: 'launch screen: logo asset, timing of each animation phase, skip label' },
      { section: 'labels', controls: 'every short UI string: nav items, buttons, field labels, placeholders, badges, empty-state text' },
      { section: 'copy', controls: 'longer screen copy: hero slides, feature blocks, section headings, notes, error text' },
      { section: 'categories', controls: 'the catalogue categories (6 from the website + amazing-deal), their tile art, colours and subcategories' },
      { section: 'leaves', controls: 'leaf filter chips (e.g. "4 Seater") and the category/subcategory they belong to' },
      { section: 'filters', controls: 'deals filter options: minimum discount bands, price bands, sort options' },
      { section: 'policies', controls: 'delivery, returns and warranty text; warranty wording is per category' },
      { section: 'payments', controls: 'payment methods, flexi-payment split rules and the notes shown at checkout' },
      { section: 'checkout', controls: 'fulfilment options (home delivery / click & collect), form fields, confirmation copy' },
      { section: 'stores', controls: 'showroom list used by checkout and the store screen' },
      { section: 'orders', controls: 'sample order records for testing the order-history and warranty UI' },
      { section: 'accounts', controls: 'sample customer profiles for testing the account screen' },
      { section: 'products', controls: `the catalogue: ${products.length} items with prices, badges, stock, delivery, images, sizes, fabrics, colours and specs` },
      { section: 'deals', controls: `the curated deals list: ${dealProducts.length} items with their own prices/discounts` },
    ],
    assumptions: [
      'products comes from the app catalogue feed; 4 live-site slugs that are not in the feed (nice-bookcase, nice-coffee-table, nice-end-table, nice-tv-unit) are excluded.',
      'deals is an independent curated list — an item can appear in both sections with different prices on purpose (the deals screen reads deals).',
      'sizes[].price is the per-size price from the site (authoritative) when sizesFrom is "site-prices"; "site-labels" means the site lists size names only, so every size inherits the product price. A product with a single size step ("Single", "Standard", "6 seater") gets sizeLabel instead of an array — that means there is no size choice to make.',
      'stockCap is the raw stock number the site reports; the "up to N per order" cap shown to customers is settings.commerce.maxPerOrder.',
      'madeToOrder is derived from the description text (that is what the app does today). Once the app reads this file, edit the flag directly.',
      'Some catalogue rows are duplicates or size-sibling rows of each other (11 rows are byte-identical duplicates and are flagged with duplicateOf; a handful more are separate rows that the app folds into one listing card via sizeVariants.ts). The feed is the right place to reconcile those; this file keeps every row so nothing is hidden from you.',
      'Bundled local images (assets/images/**) stay in code because they are module requires, not data; this file carries the remote URLs and relative gallery paths.',
      'Warranty wording is per category today (a hardcoded function in the app) — it now lives in policies.warranty.byCategory.',
    ],
  },

  settings: {
    _comment: 'Global values the whole app reads. Money amounts are integers in the currency below.',
    brand: {
      name: 'Royal Furniture',
      legalName: `${REPLACE} (registered company name)`,
      tagline: `${REPLACE} (one-line brand promise)`,
      logoAsset: 'assets/images/royal-logo.png',
      website: 'https://www.royalfurniture.ae',
      arabicName: 'رويال للأثاث',
    },
    locale: {
      language: 'en',
      country: 'AE',
      currency: 'AED',
      moneyFormat: 'AED {amount}',
      thousandsSeparator: ',',
      timezone: 'Asia/Dubai',
    },
    contact: {
      supportPhone: '+971 80 076 925',
      callBackLabel: 'Request a call back',
      whatsapp: REPLACE,
      supportEmail: REPLACE,
      supportHours: `${REPLACE} (e.g. 9:00–21:00 daily)`,
    },
    commerce: {
      freeDeliveryThreshold: 500,
      deliveryCharge: 0,
      deliveryChargeNote: 'Confirmed at checkout',
      defaultDeliveryDays: 7,
      clickAndCollectDays: 5,
      maxPerOrder: 5,
      vatPercent: 5,
      pricesIncludeVat: true,
      returnWindowDays: 7,
      madeToOrderReturnable: false,
    },
    images: { baseUrl: S3, productImageNote: 'Product images include props used for illustrative purposes. Colour may vary slightly due to photographic lighting or your screen settings.' },
    api: {
      liveProductDetail: 'https://rylqus.ae/api/products/product-detail/{slug}/',
      liveProductDetailHeaders: { locale: 'en', country: 'ae' },
      productsListing: 'https://rylqus.ae/api/products/listing/?category={category}&page={page}',
    },
  },

  featureFlags: {
    _comment: 'Switches for testing. These are read by the app once wired (see README); flip them to compare behaviours.',
    useLiveProductApi: true,
    enableLaunchScreen: true,
    enableGlassSurfaces: true,
    enableSizeDropdown: true,
    catalogOnlyMode: false,
    showRatings: true,
    showStockBadges: true,
  },

  theme: {
    _comment: 'Brand colours and glass-surface values. Hex strings; glass alphas are 0-1.',
    colors: {
      red: '#DA1921',
      redDeep: '#B61117',
      maroon: '#830406',
      navy: '#282984',
      ink: '#050000',
      gold: '#B45309',
      muted: '#444444',
      line: '#E3E3E5',
      cream: '#F6F6F7',
      white: '#FFFFFF',
      success: '#127A44',
      sage: '#DCE4D7',
    },
    categoryColors: { furniture: '#D7C2AD', sofas: '#C7D4C9', bedroom: '#D8C7D2', household: '#E5D6B8', 'cooltech-mattress': '#C8DCE2', 'kids-and-teens': '#E5C8B4' },
    glass: {
      backdropBase: '#EFEAF0',
      backdropBlobs: [
        { color: 'rgba(255,255,255,0.85)', size: 460, blur: 60, position: 'top-right' },
        { color: 'rgba(218,25,33,0.22)', size: 320, blur: 72, position: 'top-left' },
        { color: 'rgba(40,41,132,0.2)', size: 420, blur: 88, position: 'middle-right' },
        { color: 'rgba(180,83,9,0.16)', size: 300, blur: 80, position: 'bottom-left' },
        { color: 'rgba(131,4,6,0.14)', size: 240, blur: 78, position: 'bottom-right' },
      ],
      panelTint: 0.52,
      panelStrongTint: 0.68,
      chipTint: 0.46,
      inputTint: 0.62,
      blurPanel: 18,
      blurChip: 12,
      blurBar: 20,
      blurSheet: 26,
      saturate: 150,
      bevelTop: 0.86,
      bevelSide: 0.6,
      tiltDegrees: { rotateX: 1.4, rotateY: -1.6, perspective: 1000 },
    },
    radii: { card: 18, panel: 20, chip: 12, bar: 24, pill: 999 },
    font: { family: 'Montserrat', fallback: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  },

  launch: {
    _comment: 'Launch screen. logoAsset is the image shown; the timings are milliseconds for each phase of the animation.',
    logoAsset: 'assets/images/royal-logo.png',
    logoWidth: 2160,
    logoHeight: 594, // logoWidth/logoHeight = 3.636; this is the 2160x594 asset the launch screen scales
    timing: { logoIn: 620, glow: 900, sweep: 620, hold: 280, out: 420, reducedMotion: 700 },
    skipLabel: 'Tap to skip',
    accessibilityLabel: 'Royal Furniture is loading',
    respectReducedMotion: true,
  },

  labels: {
    _comment: 'Short UI strings. Keep them short — these sit in chips, buttons and nav.',
    nav: { home: 'Home', browse: 'Browse', search: 'Search', deals: 'Deals', arrivals: 'New in', bag: 'Bag', account: 'Account' },
    buttons: {
      addToBag: 'Add to bag',
      continueToCheckout: 'Continue to checkout',
      placeOrder: 'Place order request',
      continueShopping: 'Continue shopping',
      startShopping: 'Start shopping',
      showDeals: 'Show deals',
      filterDeals: 'Filter deals',
      retry: 'Retry',
      claimWarranty: 'Claim warranty',
      createAccount: 'Create account',
      openBag: 'Open my bag',
      backToCollection: 'Back to collection',
      shopAll: 'Shop all',
      viewAll: 'View all',
      remove: 'Remove',
      save: 'Save',
    },
    fieldLabels: {
      fullName: 'Full name',
      email: 'Email address',
      mobile: 'Mobile number',
      address: 'Delivery address',
      chooseShowroom: 'Choose a showroom',
      selected: 'Selected',
      chooseSize: 'Choose size',
      quantity: 'Quantity',
    },
    placeholders: {
      search: 'Search sofas, beds, coffee tables...',
      fullName: 'Full name',
      mobile: '05X XXX XXXX',
      address: 'Building, street, area, emirate',
      email: 'Email address',
    },
    states: {
      loadingDetail: 'Checking official product details…',
      loadingDetailShort: 'Loading official product details…',
      detailError: 'Official details couldn’t be loaded. Showing saved catalog information where available.',
      detailErrorShort: 'Some live specifications could not be loaded. Showing catalog details.',
      detailLoaded: 'Official product options checked',
      noProducts: 'No products found',
      noProductsHint: 'Try another product, room, or category.',
      noDeals: 'No deals match these filters',
      noDealsHint: 'Try lowering the discount or changing the price range.',
      emptyBag: 'Your bag is empty',
      emptyBagHint: 'Find something beautiful for your home.',
      emptySaved: 'Your saved list is empty',
      emptySavedHint: 'Tap the heart on anything you love.',
      emptyOrders: 'Your completed purchases will appear here with delivery and warranty information.',
      addToBagNotice: 'Added to your bag',
      savedNotice: 'Saved for later',
      removedNotice: 'Removed from saved items',
      orderReceived: 'Order request received',
      orderReceivedHint: 'Royal Furniture will contact you to confirm delivery, stock, and payment.',
    },
    badges: {
      _comment: 'Merchandising labels shown on cards and product pages (matched against products[].badges). `color` styles the pill.',
      'Best Seller': { color: '#DA1921' },
      'Online Only': { color: '#282984' },
      'Hot seller': { color: '#830406' },
      Trending: { color: '#B45309' },
      New: { color: '#127A44' },
      'Made to order': { color: '#DA1921' },
    },
    productFacts: {
      madeToOrder: 'Made to order',
      customization: 'Customization',
      customizationAny: 'Available — any colour, any size',
      customizationColour: 'Available — any colour',
      customizationSize: 'Available — custom sizes',
      customizationNotAvailable: 'Not available',
      customizationListed: 'Described in the product listing',
      customizationUnspecified: 'Not specified',
      sizeOptions: 'Size options',
      fabrics: 'Fabrics',
      colors: 'Colors',
      availability: 'Availability',
      delivery: 'Delivery',
      deliveryDate: 'Delivery date',
      assembly: 'Assembly',
      assemblyFree: 'Free assembly included',
      deliveryCharges: 'Delivery charges',
      deliveryFree: 'Free on orders above AED 500',
      sku: 'SKU',
      flexiPayment: 'Flexi payment',
    },
  },

  copy: {
    _comment: 'Longer screen copy, grouped by screen. "assets" values are local bundle paths used by the app.',
    home: {
      heroSlides: [
        { label: 'Sale 30–75%', category: 'all', asset: 'assets/images/hero-sale-mobile.webp' },
        { label: 'Payday sale', category: 'all', asset: 'assets/images/hero-payday-mobile.webp' },
        { label: 'Kids bedroom', category: 'kids-and-teens', asset: 'assets/images/hero-kids-mobile.webp' },
      ],
      dealTiles: [
        { label: 'Corner sofas', category: 'sofas:corner-sofas', asset: 'assets/images/deal-sofas.webp' },
        { label: 'Recliners', category: 'sofas:recliner', asset: 'assets/images/deal-recliners.webp' },
        { label: 'Coffee tables', category: 'furniture:living-room:coffee-table', asset: 'assets/images/deal-coffee-tables.webp' },
        { label: 'Home decor', category: 'household:decor-items', asset: 'assets/images/deal-decor.webp' },
      ],
      sectionTitles: { deals: 'Amazing deals', rooms: 'Shop by room', bestSellers: 'Best sellers' },
      paymentStripAsset: 'assets/images/home-deals-strip.webp',
      featureBlock: {
        title: `${REPLACE} (feature block headline)`,
        body: `${REPLACE} (feature block sentence)`,
        productIds: { bedroom: featured('bedroom'), dining: featured('furniture', 'dining-room'), mattress: featured('cooltech-mattress') },
      },
      trust: [
        { label: 'Free assembly', body: 'On eligible furniture' },
        { label: 'Selected items', body: 'Made to order' },
        { label: '12 showrooms', body: 'Across the UAE' },
        { label: 'Pay your way', body: 'Tabby & Tamara' },
      ],
      bestSellersTitle: 'Best sellers',
      newInTitle: 'New in',
    },
    deals: {
      title: 'Amazing deals',
      subtitle: 'Save more on Royal Furniture favourites. Showing products discounted by more than 40%.',
      heroKicker: 'ROYAL DEALS',
      heroTitle: 'More style. Less spend.',
      heroBody: 'Every item here is more than 40% off.',
      filterSheetTitle: 'Filter deals',
      filterHeadings: { category: 'Category', discount: 'Minimum discount', price: 'Price' },
    },
    catalog: {
      title: 'Browse furniture',
      emptyHint: 'Try another product, room, or category.',
    },
    search: { title: 'Search Royal Furniture', subtitle: 'Find products, rooms, categories, and subcategories.' },
    arrivals: { title: 'New arrivals', subtitle: 'The latest pieces added to the Royal Furniture collection, sourced from the official UAE catalog.', justIn: 'Just in', justInBody: 'Fresh furniture, bedroom pieces and home accents.' },
    saved: { title: 'Saved pieces', subtitle: 'Keep your favourites close while you decide.' },
    cart: { title: 'Your bag', savedForLater: 'Saved for later', deliveryLabel: 'Delivery', totalLabel: 'Total', subtotalLabel: 'Subtotal' },
    checkout: {
      title: 'Secure checkout',
      subtitle: 'Delivery and payment are confirmed with Royal Furniture before fulfilment.',
      orderReceivedTitle: 'Order request received',
      orderReceivedBody: 'Royal Furniture will contact you to confirm delivery, stock, and payment.',
    },
    account: {
      title: 'Account',
      subtitle: 'Manage your profile, orders, and Royal Furniture support.',
      cardTitle: 'Your Royal account',
      cardBody: 'Save your details, track orders, and keep your Royal Furniture journey together.',
      detailsSaved: 'Your details are saved for a faster checkout.',
      prototypeNote: 'Prototype profile only. No password or payment details are stored.',
      orderHistoryTitle: 'Order history',
      supportTitle: 'Shopping support',
      supportRows: [
        { title: 'Delivery & Click & Collect', body: 'Choose home delivery or any Royal Furniture showroom at checkout.' },
        { title: 'Returns & exchanges', body: 'Made-to-order items cannot be cancelled or returned. Terms apply to other items.' },
        { title: 'Warranty', body: 'Coverage varies by product type, including sofas, mattresses, imported items, and household products.' },
        { title: 'Need help?', body: 'Contact Royal Furniture customer care for order and product support.' },
      ],
    },
    productDetail: {
      sectionTitles: { options: 'Product options', availability: 'Availability & delivery', payment: 'Payment', generalInformation: 'General information', dimensions: 'Dimensions & specifications', about: 'About this piece' },
      sizeHintDetailed: 'Official sizes for this piece. Prices for each size are confirmed by Royal Furniture on order.',
      sizeHintPriced: 'Price updates with your selected size. Custom sizing is also available.',
      colourSelectable: 'Selectable — available shades aren’t listed',
      colourNotListed: 'Not listed',
      colourFromName: '(from product name)',
      paymentNote: 'Flexi payment available — pay 20% upfront to confirm your booking, the balance before delivery.',
      installmentPrefix: 'Split in 4 of',
      viewCounterSuffix: 'views in 24 hrs',
      retryLabel: 'Retry',
      errors: { network: 'Official details couldn’t be loaded. Showing saved catalog information where available.' },
    },
    categories: { title: 'Categories', subtitle: 'Shop the full Royal Furniture range by room.' },
  },

  categories: {
    _comment: 'The catalogue categories. `id` is the value stored on products (products[].category), so adding one here without a matching product does nothing.',
    items: [...royal.cats.map((cat) => {
      const specs = {
        id: cat.s,
        name: cat.n,
        nameAr: cat.ar,
        color: { furniture: '#D7C2AD', sofas: '#C7D4C9', bedroom: '#D8C7D2', household: '#E5D6B8', 'cooltech-mattress': '#C8DCE2', 'kids-and-teens': '#E5C8B4' }[cat.s] || null,
        tileAsset: `assets/images/home-${({ furniture: 'furniture', sofas: 'sofas', bedroom: 'bedroom', household: 'household', 'cooltech-mattress': 'mattress', 'kids-and-teens': 'kids' })[cat.s]}.webp`,
        subcategories: cat.subs.map((sub) => ({ id: sub.s, name: sub.n })),
        productCount: catalog.filter((row) => row.c === cat.s).length,
        enabled: true,
      };
      return specs;
    }),
    // The feed carries one product under this category even though the website
    // navigation does not list it, so it is included to keep product.category valid.
    { id: 'amazing-deal', name: 'Amazing Deal', nameAr: null, color: null, tileAsset: null, subcategories: [], productCount: catalog.filter((row) => row.c === 'amazing-deal').length, enabled: true },
  ],
  },

  leaves: { _comment: 'Leaf filter chips shown under a subcategory, with the ids of the products in each.', items: leaves.map((leaf) => ({ id: leaf.slug, name: leaf.name, category: leaf.category, subcategory: leaf.subcategory })) },

  filters: {
    _comment: 'Options offered by the deals filter sheet and the catalogue sort.',
    deals: {
      defaultMinDiscount: 41,
      minDiscount: [
        { id: '41', label: 'Over 40% off', value: 41 },
        { id: '50', label: '50%+ off', value: 50 },
        { id: '60', label: '60%+ off', value: 60 },
        { id: '70', label: '70%+ off', value: 70 },
      ],
      priceBands: [
        { id: 'all', label: 'Any price', min: null, max: null },
        { id: 'under500', label: 'Under AED 500', min: 0, max: 500 },
        { id: '500to1500', label: 'AED 500–1,500', min: 500, max: 1500 },
        { id: 'over1500', label: 'Over AED 1,500', min: 1500, max: null },
      ],
      sortOptions: [
        { id: 'priceLow', label: 'Price: low to high' },
        { id: 'priceHigh', label: 'Price: high to low' },
        { id: 'discount', label: 'Biggest discount' },
        { id: 'name', label: 'Name (A–Z)' },
      ],
      defaultSort: 'priceLow',
    },
    catalog: {
      allLabel: 'All',
      allInCategoryLabel: 'All in {category}',
      allCategoriesLabel: 'All categories',
    },
  },

  policies: {
    _comment: 'Customer-facing policy text. Delivery/return numbers also live in settings.commerce.',
    delivery: {
      title: 'Delivery',
      freeOverText: 'Free Delivery Available on AED 500+',
      paidDeliveryText: `${REPLACE} (e.g. "Delivery charge of AED {charge} applies")`,
      homeDeliveryLabel: 'Home delivery',
      clickAndCollectLabel: 'Click & Collect',
      leadTimeText: 'Delivery in about {days} days',
      assemblyText: 'Free assembly on eligible furniture.',
      notes: ['Delivery dates the site quotes are confirmed by the store after order placement.'],
    },
    returns: {
      title: 'Returns & exchanges',
      windowDays: 7,
      madeToOrderText: 'Made-to-order items cannot be cancelled or returned.',
      otherItemsText: `${REPLACE} (e.g. "Other items can be returned within {days} days")`,
      contactInstruction: 'Contact customer care with your order number to start a return.',
    },
    warranty: {
      title: 'Warranty',
      defaultText: '1-year warranty or see product terms',
      byCategory: {
        household: 'Not covered under the household warranty policy',
        'cooltech-mattress': 'Cooltech mattress warranty: up to 25 years, terms apply',
        sofas: 'Sofa warranty: 5 years on frame and springs',
        bedroom: 'Headboard and divan warranty: 5 years on frame',
      },
      claimLabel: 'Claim warranty',
      storedLocallyNote: 'Warranty claims are recorded on the device for this prototype (no server call).',
    },
  },

  payments: {
    _comment: 'Payment options and the flexi-payment split. Method ids are what the app stores on an order.',
    methods: [
      { id: 'card', label: 'Credit / debit card', enabled: true, note: `${REPLACE} (confirm gateway)` },
      { id: 'cod', label: 'Cash on delivery', enabled: true, note: 'Paid to the delivery team' },
      { id: 'tabby', label: 'Tabby — pay in 4', enabled: true, note: `${REPLACE} (confirm merchant code)` },
      { id: 'tamara', label: 'Tamara — pay in 4', enabled: true, note: `${REPLACE} (confirm merchant code)` },
    ],
    flexi: { splitIn: 4, upfrontPercent: 20, note: 'Flexi payment available — pay 20% upfront to confirm your booking, the balance before delivery.' },
    notes: { payLater: 'Delivery and payment are confirmed with Royal Furniture before fulfilment.' },
  },

  checkout: {
    _comment: 'Checkout flow content: how the order can be received, the fields to fill, and the confirmation copy.',
    fulfilmentOptions: [
      { id: 'home', label: 'Home delivery', days: 7, enabled: true },
      { id: 'collect', label: 'Click & Collect', days: 5, enabled: true },
    ],
    defaultFulfilment: 'home',
    fields: [
      { id: 'name', label: 'Your name', placeholder: 'Full name', required: true, type: 'text' },
      { id: 'phone', label: 'Mobile number', placeholder: '05X XXX XXXX', required: true, type: 'tel' },
      { id: 'address', label: 'Delivery address', placeholder: 'Building, street, area, emirate', required: true, when: 'home', type: 'text' },
      { id: 'showroom', label: 'Choose a showroom', required: true, when: 'collect', type: 'store' },
    ],
    storeSelectionNote: 'Pick the showroom that should hold your order.',
    confirmation: {
      title: 'Order request received',
      body: 'Royal Furniture will contact you to confirm delivery, stock, and payment.',
      orderIdPrefix: 'RF-',
    },
    orderStatuses: [
      { id: 'requested', label: 'Request received', color: '#B45309' },
      { id: 'confirmed', label: 'Confirmed', color: '#127A44' },
      { id: 'delivered', label: 'Delivered', color: '#444444' },
      { id: 'cancelled', label: 'Cancelled', color: '#DA1921' },
    ],
  },

  stores: {
    _comment: 'Showrooms offered for Click & Collect and shown on the store screen. closingTime is unknown for all of them — fill it in from the store signage.',
    items: royal.stores.map((store, index) => ({
      id: `${store.city}-${index + 1}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      city: store.city,
      address: store.addr,
      openingTime: store.open,
      closingTime: REPLACE,
      phone: store.tel,
      clickAndCollect: true,
      enabled: true,
    })),
  },

  orders: {
    _comment: 'Sample orders so you can test the order-history and warranty screens without placing an order. Flagged _sample: true — delete them for a clean run.',
    items: [
      {
        _sample: true,
        id: 'RF-100001',
        purchasedAt: '2026-09-28',
        deliveryDate: '2026-10-05',
        status: 'delivered',
        fulfilment: 'home',
        total: 2953,
        items: [
          { productId: '5003-azilea-smart-pro-grid-mattress', name: 'Azilea Smart Pro Grid Mattress', category: 'cooltech-mattress', quantity: 1, price: 2888, size: 'Queen - 200x160 cm' },
          { productId: '7057-elm-set-of-2-framed-canvas-wall-art-4038x50cm', name: 'Elm Set of 2 Framed Canvas Wall Art – 40×3.8x50cm', category: 'household', quantity: 1, price: 65, size: null },
        ],
        customer: { name: `${REPLACE} (customer name)`, phone: `${REPLACE} (phone)`, address: `${REPLACE} (delivery address)` },
        warrantyClaimed: false,
      },
      {
        _sample: true,
        id: 'RF-100002',
        purchasedAt: '2026-10-12',
        deliveryDate: '2026-10-27',
        status: 'confirmed',
        fulfilment: 'collect',
        storeId: 'dubai-1',
        total: 3000,
        items: [{ productId: '7072-serafina-corner-sofa', name: 'Serafina Corner Sofa', category: 'sofas', quantity: 1, price: 3000, size: '4-Seater' }],
        customer: { name: `${REPLACE} (customer name)`, phone: `${REPLACE} (phone)`, address: null },
        warrantyClaimed: false,
      },
    ],
  },

  accounts: {
    _comment: 'Sample customer profiles for the account screen. Flagged _sample: true — replace or delete.',
    items: [
      { _sample: true, id: 'test-customer-1', name: `${REPLACE} (test name)`, email: `${REPLACE} (test email)`, phone: `${REPLACE} (test mobile)`, savedProductIds: [], preferredStoreId: 'dubai-1' },
    ],
  },

  products: {
    _comment: 'The catalogue. One line per product (see _fields for each key). Set enabled:false to hide an item while testing.',
    _fields: {
      id: 'unique id, "<sku-number>-<slug>" — referenced by orders and cart lines',
      sku: 'the storefront SKU, shown on the product page',
      name: 'display name',
      category: 'must match categories.items[].id',
      subcategory: 'must match a subcategory id inside that category',
      subcategoryName: 'display name for the subcategory (used in filter chips)',
      price: 'current selling price, integer AED',
      listPrice: 'original price for the strike-through; equal to price when there is no discount',
      discountPercent: 'whole percent, used by the "% OFF" pill',
      badges: 'merchandising labels; colours come from labels.badges',
      stockStatus: 'in_stock / out_of_stock / made_to_order (free text as the feed reports it)',
      stockCap: 'raw stock number the feed reports (null when unknown)',
      deliveryDays: 'lead time in days, used by "Delivery in about N days"',
      deliveryEstimate: 'date the site quoted at harvest time (goes stale) or estimated days',
      freeDelivery: 'free delivery applies to this item',
      freeAssembly: 'free assembly applies to this item',
      madeToOrder: 'shows the MADE TO ORDER tag (derived from description today)',
      description: 'paragraph shown under "About this piece"',
      image: 'absolute main image URL',
      gallery: 'up to 8 image paths relative to settings.images.baseUrl',
      sizeLabel: 'the single size the item comes in ("Single", "Standard", "6 seater") — no choice to make',
      sizes: 'size choices when the item has more than one — each {label, price, listPrice}',
      sizesFrom: 'where sizes came from: "site-prices" (prices per size) or "site-labels" (labels only)',
      fabrics: 'fabric options shown on the product page',
      colors: 'colour swatches: {name, hex?, image?}',
      specs: 'General Information blocks: {section: [[label, value], ...]}',
      views: 'views in the last 24 hrs as the site reported them',
      rating: 'average rating (null when the site has none)',
      duplicateOf: 'id of an identical row — the listing folds these; hide one if you want',
      enabled: 'false hides the item everywhere',
    },
    count: products.length,
    items: '__PRODUCTS__',
  },

  deals: {
    _comment: 'Curated deals list with its own prices — the deals screen reads this section, the catalogue reads products. Same record shape as products (minus specs/gallery/colours).',
    count: dealProducts.length,
    items: '__DEALS__',
  },
};

// ------------------------------------------------------------- serialisation
const block = (items, indent) => items.map((item) => `${indent}${JSON.stringify(item)}`).join(',\n');

let text = JSON.stringify(doc, (_k, v) => v, 2)
  .replace('"__PRODUCTS__"', `[\n${block(products, '      ')}\n    ]`)
  .replace('"__DEALS__"', `[\n${block(dealProducts, '      ')}\n    ]`);

// sanity: the file must parse back to the same counts
const parsed = JSON.parse(text);
if (parsed.products.items.length !== products.length) throw new Error('products round-trip failed');
if (parsed.deals.items.length !== dealProducts.length) throw new Error('deals round-trip failed');

mkdirSync(resolve(ROOT, 'data'), { recursive: true });
writeFileSync(resolve(ROOT, 'data/master.json'), text + '\n');

const placeholders = (text.match(new RegExp(REPLACE, 'g')) || []).length;
const sizes = products.filter((p) => p.sizes).length;
const withSpecs = products.filter((p) => p.specs).length;
console.log(`data/master.json: ${products.length} products, ${dealProducts.length} deals, ${royal.stores.length} stores, ${royal.cats.length} categories`);
console.log(`  sizes: ${sizes} products · specs: ${withSpecs} products · galleries: ${products.filter((p) => p.gallery?.length).length}`);
console.log(`  size: ${(text.length / 1024 / 1024).toFixed(2)} MB · placeholder markers: ${placeholders}`);
