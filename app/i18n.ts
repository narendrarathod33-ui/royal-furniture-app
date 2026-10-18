import { create } from 'zustand';
import { I18nManager, Platform } from 'react-native';
import { loadJSON, removeSaved, saveJSON } from '../stores/appStorage';

/**
 * English / Arabic UI layer. Catalog data (product names, categories, the
 * harvest) comes from the English workbook pipeline and stays English; every
 * piece of interface chrome around it is translated here.
 *
 * Switching language saves the choice and reloads the app, so components can
 * read `t()` at render time without subscriptions — and the RTL layout
 * direction is applied exactly once, at boot, the way React Native expects.
 */
export type Lang = 'en' | 'ar';

type LangState = { lang: Lang; setLang: (lang: Lang) => void };
const LANG_STORAGE_KEY = 'rf-lang-v1';

export const useLangStore = create<LangState>()((set) => ({
  lang: 'en',
  setLang: (lang) => set({ lang }),
}));

/** Only well-formed saved languages are honored; anything else falls back to English. */
export function sanitizeLang(value: unknown): Lang {
  return value === 'ar' ? 'ar' : 'en';
}

const restoredLang = sanitizeLang(loadJSON<unknown>(LANG_STORAGE_KEY));
useLangStore.setState({ lang: restoredLang });
useLangStore.subscribe((state) => {
  saveJSON(LANG_STORAGE_KEY, state.lang);
});

/** Privacy delete resets the app language too. */
export function forgetLang() {
  useLangStore.getState().setLang('en');
  removeSaved(LANG_STORAGE_KEY);
}

/** Reloads so a language switch takes effect everywhere (web relaunches the SPA;
 * on native the direction applies at next launch — never crash on missing window). */
export function reloadForLang() {
  if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
    window.location.reload();
  }
}

/** True when the running layout is right-to-left (Arabic). */
export const isRTL = () => useLangStore.getState().lang === 'ar';

/**
 * Boot-time direction: called once at module scope before the first render.
 * allowRTL/forceRTL must happen before React renders — on native this is the
 * only moment they can safely change, on web it seeds every style resolution.
 */
export function bootDirection() {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(isRTL());
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.lang = isRTL() ? 'ar' : 'en';
    document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
  }
}

/**
 * Applies the direction for `lang` and tells the caller whether a reload is
 * needed to make it stick (always on web — the DOM direction and the mirrored
 * stylesheets are computed at boot; on native the OS reload applies it).
 */
export function switchLang(lang: Lang): boolean {
  const changed = useLangStore.getState().lang !== lang;
  useLangStore.getState().setLang(lang);
  return changed;
}

type Vars = Record<string, string | number>;

/** The UI dictionary. Both languages must define the same keys (parity-tested). */
const STRINGS: Record<string, { en: string; ar: string }> = {
  // Bottom navigation
  'nav.home': { en: 'Home', ar: 'الرئيسية' },
  'nav.browse': { en: 'Browse', ar: 'تصفح' },
  'nav.search': { en: 'Search', ar: 'بحث' },
  'nav.deals': { en: 'Deals', ar: 'العروض' },
  'nav.new': { en: 'New in', ar: 'وصل حديثاً' },
  'nav.stores': { en: 'Stores', ar: 'الفروع' },
  'nav.more': { en: 'More', ar: 'المزيد' },

  // Header
  'header.cartBadge': { en: 'Cart, {count} items', ar: 'السلة، {count} منتج' },
  'header.account': { en: 'Account', ar: 'الحساب' },

  // Home
  'home.exploreDeals': { en: 'Explore deals', ar: 'استكشف العروض' },
  'home.moreHome': { en: 'More home.\nLess spend.', ar: 'بيت أوسع.\nبتكلفة أقل.' },
  'home.madeToOrder': { en: 'MADE TO ORDER', ar: 'مصنوع حسب الطلب' },
  'home.yourHomeYourWay': { en: 'Your home.\nYour way.', ar: 'منزلك،\nبطريقتك.' },
  'home.customize': { en: 'Customize your space', ar: 'صمّم مساحتك' },
  'home.littleSpaces': { en: 'LITTLE SPACES, BIG IDEAS', ar: 'مساحات صغيرة، أحلام كبيرة' },
  'home.littleDreamers': { en: 'Room for little\ndreamers.', ar: 'مساحة\nلأحلام الصغار.' },
  'home.exploreKids': { en: 'Explore kids’ rooms', ar: 'استكشف غرف الأطفال' },
  'home.amazingDeals': { en: 'Amazing deals', ar: 'عروض مذهلة' },
  'home.shopAll': { en: 'Shop all', ar: 'تسوق الكل' },
  'home.shopByRoom': { en: 'Shop by room', ar: 'تسوق حسب الغرفة' },
  'home.viewAll': { en: 'View all', ar: 'عرض الكل' },
  'home.bestSellers': { en: 'Best sellers', ar: 'الأكثر مبيعاً' },

  // Cards
  'card.from': { en: 'From {p}', ar: 'يبدأ من {p}' },
  'card.sizesAvailable': { en: '{n} sizes available', ar: '{n} مقاسات متوفرة' },
  'card.photoUnavailable': { en: 'Photo unavailable', ar: 'الصورة غير متوفرة' },
  'card.photoUnavailableFor': { en: 'Photo unavailable for {n}', ar: 'الصورة غير متوفرة لـ {n}' },
  'card.madeToOrder': { en: 'MADE TO ORDER', ar: 'مصنوع حسب الطلب' },
  'card.quickView': { en: 'Quick view {n}', ar: 'عرض سريع: {n}' },

  // Shop / browse
  'shop.sortTrigger': { en: 'Sort products, {s}', ar: 'ترتيب المنتجات، {s}' },
  'shop.sortPriceLow': { en: 'Price low to high', ar: 'السعر: من الأقل إلى الأعلى' },
  'shop.sortPriceHigh': { en: 'Price high to low', ar: 'السعر: من الأعلى إلى الأقل' },
  'shop.sortDiscount': { en: 'Biggest discount', ar: 'أكبر خصم' },
  'shop.sortTrending': { en: 'Trending', ar: 'الأكثر رواجاً' },
  'shop.results': { en: '{n} results', ar: '{n} نتيجة' },
  'shop.browseAll': { en: 'Browse all products', ar: 'تصفح كل المنتجات' },
  'shop.noProducts': { en: 'No products found', ar: 'لا توجد منتجات' },
  'shop.tryAnother': { en: 'Try another product, room, or category.', ar: 'جرّب منتجاً أو غرفة أو فئة أخرى.' },
  'shop.dealsTitle': { en: 'Amazing Deals', ar: 'عروض مذهلة' },

  // Search screen
  'search.title': { en: 'Search Royal Furniture', ar: 'ابحث في رويال فيرنيتشر' },
  'search.sub': { en: 'Find products, rooms, categories, and subcategories.', ar: 'ابحث عن منتجات وغرف وفئات وأقسام.' },
  'search.placeholder': { en: 'Search sofas, beds, coffee tables...', ar: 'ابحث عن أرائك، أسرّة، طاولات...' },
  'search.fieldLabel': { en: 'Search products', ar: 'ابحث عن منتجات' },
  'search.categories': { en: 'Categories', ar: 'الفئات' },
  'search.all': { en: 'All', ar: 'الكل' },
  'search.allInCategory': { en: 'All in category', ar: 'كل القسم' },

  // Product page
  'pdp.addToBag': { en: 'Add to bag · {p}', ar: 'أضف إلى السلة · {p}' },
  'pdp.addToBagA11y': { en: 'Add to bag, {size}, {p}', ar: 'أضف إلى السلة، {size}، {p}' },
  'pdp.save': { en: 'Save product', ar: 'حفظ المنتج' },
  'pdp.removeSaved': { en: 'Remove from saved items', ar: 'إزالة من المحفوظات' },
  'pdp.aboutThisPiece': { en: 'About this piece', ar: 'عن القطعة' },
  'pdp.youMayAlsoLike': { en: 'You may also like', ar: 'قد يعجبك أيضاً' },
  'pdp.recentlyViewed': { en: 'Recently viewed', ar: 'شوهدت مؤخراً' },
  'pdp.upgradeYourPick': { en: 'Upgrade your pick', ar: 'طوّر اختيارك' },
  'pdp.upgradeSub': { en: 'Bigger sizes of this piece — one tap to switch', ar: 'مقاسات أكبر من القطعة — بلمسة واحدة' },
  'pdp.upgradeA11y': { en: 'Upgrade to {n}, {p}, {d} more', ar: 'الترقية إلى {n}، {p}، بزيادة {d}' },
  'pdp.more': { en: '+{d} more', ar: '+{d} زيادة' },
  'pdp.size': { en: 'Size', ar: 'المقاس' },
  'pdp.selectSize': { en: 'Select size', ar: 'اختر المقاس' },
  'pdp.chooseSize': { en: 'Choose size', ar: 'اختر المقاس' },
  'pdp.tapToChangeSize': { en: 'Size, {s}. Tap to change size', ar: 'المقاس، {s}. انقر لتغيير المقاس' },
  'pdp.inStock': { en: 'In stock', ar: 'متوفر' },
  'pdp.outOfStock': { en: 'Out of stock', ar: 'غير متوفر' },
  'pdp.aboutDays': { en: 'About {n} days', ar: 'خلال {n} أيام' },
  'pdp.delivery': { en: 'Delivery', ar: 'التوصيل' },
  'pdp.deliveryDate': { en: 'Delivery date', ar: 'تاريخ التوصيل' },
  'pdp.assembly': { en: 'Assembly', ar: 'التركيب' },
  'pdp.freeAssembly': { en: 'Free assembly included', ar: 'التركيب مجاني' },
  'pdp.deliveryCharges': { en: 'Delivery charges', ar: 'رسوم التوصيل' },
  'pdp.freeAbove': { en: 'Free on orders above AED 500', ar: 'مجاني للطلبات فوق 500 درهم' },
  'pdp.generalInfo': { en: 'General information', ar: 'معلومات عامة' },
  'pdp.dimensionsSpecs': { en: 'Dimensions & specifications', ar: 'الأبعاد والمواصفات' },
  'pdp.productOptions': { en: 'Product options', ar: 'خيارات المنتج' },
  'pdp.madeToOrderRow': { en: 'Made to order', ar: 'مصنوع حسب الطلب' },
  'pdp.customization': { en: 'Customization', ar: 'التخصيص' },
  'pdp.officialSizesNote': { en: 'Official sizes for this piece. Prices for each size are confirmed by Royal Furniture on order.', ar: 'المقاسات الرسمية لهذه القطعة. يتم تأكيد سعر كل مقاس من رويال فيرنيتشر عند الطلب.' },
  'pdp.back': { en: 'Back', ar: 'رجوع' },
  'pdp.viewsIn24': { en: '{n} views in 24 hrs', ar: '{n} مشاهدة في 24 ساعة' },
  'pdp.checkingOfficial': { en: 'Checking official product details…', ar: 'جارٍ التحقق من التفاصيل الرسمية…' },
  'pdp.officialChecked': { en: 'Official product options checked', ar: 'تم التحقق من الخيارات الرسمية' },
  'pdp.officialFailed': { en: 'Official details couldn’t be loaded. Showing saved catalog information where available.', ar: 'تعذّر تحميل التفاصيل الرسمية. تُعرض بيانات الكتالوج المحفوظة حيثما توفرت.' },
  'pdp.retry': { en: 'Retry', ar: 'إعادة المحاولة' },
  'pdp.retryA11y': { en: 'Retry loading official product details', ar: 'إعادة تحميل التفاصيل الرسمية للمنتج' },

  // Quick view
  'qv.close': { en: 'Close quick view', ar: 'إغلاق العرض السريع' },
  'qv.deliveryAbout': { en: 'Delivery: about {n} days', ar: 'التوصيل: خلال {n} أيام' },
  'qv.deliveryRange': { en: 'Delivery: 2–7 days', ar: 'التوصيل: 2–7 أيام' },
  'qv.freeDelivery': { en: ' · Free delivery', ar: ' · توصيل مجاني' },
  'qv.notify': { en: "Notify me when it's back", ar: 'أبلغني عند التوفر' },
  'qv.notifyA11y': { en: 'Notify me when {n} is back', ar: 'أبلغني عند توفر {n}' },
  'qv.viewFullDetails': { en: 'View full details', ar: 'التفاصيل الكاملة' },
  'qv.viewDetailsA11y': { en: 'View full details for {n}', ar: 'عرض التفاصيل الكاملة لـ {n}' },
  'qv.addToCart': { en: 'Add to cart · {p}', ar: 'أضف إلى السلة · {p}' },
  'qv.addToCartA11y': { en: 'Add to cart, {n}, {p}', ar: 'أضف إلى السلة، {n}، {p}' },
  'qv.quickViewLabel': { en: 'Quick view', ar: 'عرض سريع' },

  // Cart & checkout
  'cart.title': { en: 'Your bag', ar: 'سلتك' },
  'cart.itemsReady': { en: '{n} items ready for your home', ar: '{n} منتج جاهز لمنزلك' },
  'cart.nextFavourite': { en: 'Your next favourite piece belongs here.', ar: 'قطعتك المفضلة القادمة مكانها هنا.' },
  'cart.savedForLater': { en: 'Saved for later', ar: 'محفوظات لاحقاً' },
  'cart.completeOrder': { en: 'Complete your order', ar: 'أكمل طلبك' },
  'cart.subtotal': { en: 'Subtotal', ar: 'المجموع الفرعي' },
  'cart.delivery': { en: 'Delivery', ar: 'التوصيل' },
  'cart.confirmedAtCheckout': { en: 'Confirmed at checkout', ar: 'يُحدد عند الدفع' },
  'cart.total': { en: 'Total', ar: 'المجموع' },
  'cart.checkoutBtn': { en: 'Local demo checkout', ar: 'إتمام طلب تجريبي' },
  'cart.empty': { en: 'Your bag is empty', ar: 'سلتك فارغة' },
  'cart.emptySub': { en: 'Find something beautiful for your home.', ar: 'اكتشف شيئاً جميلاً لمنزلك.' },
  'cart.startShopping': { en: 'Start shopping', ar: 'ابدأ التسوق' },
  'cart.view': { en: 'View {n}', ar: 'عرض {n}' },
  'cart.increase': { en: 'Increase quantity of {n}', ar: 'زيادة كمية {n}' },
  'cart.decrease': { en: 'Decrease quantity of {n}', ar: 'تقليل كمية {n}' },
  'cart.remove': { en: 'Remove {n} from bag', ar: 'إزالة {n} من السلة' },
  'cart.demoNote': { en: 'Local demo only. Contact details are not sent to Royal Furniture; do not enter real personal data.', ar: 'طلب تجريبي محلي فقط. لا تُرسل بياناتك إلى رويال فيرنيتشر؛ لا تُدخل بيانات شخصية حقيقية.' },
  'cart.yourName': { en: 'Your name', ar: 'الاسم' },
  'cart.namePlaceholder': { en: 'Full name', ar: 'الاسم الكامل' },
  'cart.mobile': { en: 'Mobile number', ar: 'رقم الجوال' },
  'cart.phonePlaceholder': { en: '05X XXX XXXX', ar: '05X XXX XXXX' },
  'cart.receiveOrder': { en: 'Receive your order', ar: 'استلام الطلب' },
  'cart.homeDelivery': { en: 'Home delivery', ar: 'توصيل للمنزل' },
  'cart.clickCollect': { en: 'Click & Collect', ar: 'استلام من المعرض' },
  'cart.address': { en: 'Delivery address', ar: 'عنوان التوصيل' },
  'cart.addressPlaceholder': { en: 'Building, street, area, emirate', ar: 'المبنى، الشارع، المنطقة، الإمارة' },
  'cart.chooseShowroom': { en: 'Choose a showroom', ar: 'اختر المعرض' },
  'cart.selected': { en: 'Selected', ar: 'مختار' },
  'cart.open': { en: 'Open {h}', ar: 'يفتح {h}' },
  'cart.placeOrder': { en: 'Place order request', ar: 'إرسال الطلب' },
  'cart.errorFields': { en: 'Enter your name, mobile number, and address.', ar: 'أدخل الاسم ورقم الجوال والعنوان.' },
  'cart.orderSaved': { en: 'Demo order saved locally', ar: 'تم حفظ الطلب التجريبي محلياً' },
  'cart.orderPrivacyNote': { en: 'No order or contact details were sent. Contact Royal Furniture directly to arrange a real purchase.', ar: 'لم تُرسل أي بيانات طلب أو اتصال. تواصل مع رويال فيرنيتشر مباشرة لإتمام شراء حقيقي.' },
  'cart.continueShopping': { en: 'Continue shopping', ar: 'مواصلة التسوق' },
  'cart.readyCollect': { en: 'Ready for collection at {c}', ar: 'جاهز للاستلام من {c}' },
  'cart.schedDelivery': { en: 'Delivery scheduled', ar: 'التوصيل مجدول' },

  // Toasts
  'toast.saved': { en: 'Saved for later', ar: 'حُفظت لاحقاً' },
  'toast.unsaved': { en: 'Removed from saved items', ar: 'أُزيلت من المحفوظات' },
  'toast.cap': { en: 'Maximum 10 per item', ar: 'الحد الأقصى 10 لكل منتج' },

  // Account
  'account.title': { en: 'Your Royal account', ar: 'حسابك في رويال' },
  'account.sub': { en: 'Manage your profile, orders, and Royal Furniture support.', ar: 'إدارة ملفك وطلباتك ودعم رويال فيرنيتشر.' },
  'account.email': { en: 'Email address', ar: 'البريد الإلكتروني' },
  'account.mobile': { en: 'Mobile number', ar: 'رقم الجوال' },
  'account.language': { en: 'Language', ar: 'اللغة' },
  'stores.title': { en: 'Royal Furniture stores', ar: 'فروع رويال فيرنيتشر' },
  'stores.sub': { en: 'Visit us across the UAE.', ar: 'زورونا في جميع أنحاء الإمارات.' },
  'stores.call': { en: 'Call', ar: 'اتصال' },
  'stores.directions': { en: 'Directions', ar: 'الاتجاهات' },
  'stores.callA11y': { en: 'Call the {c} store', ar: 'اتصل بفرع {c}' },
  'stores.directionsA11y': { en: 'Directions to the {c} store', ar: 'الاتجاهات إلى فرع {c}' },
  'more.title': { en: 'More', ar: 'المزيد' },
  'more.sub': { en: 'Everything else in one place.', ar: 'كل شيء آخر في مكان واحد.' },
  'more.newIn': { en: 'New arrivals', ar: 'وصل حديثاً' },
  'more.saved': { en: 'Saved items', ar: 'المحفوظات' },
  'more.orders': { en: 'My orders', ar: 'طلباتي' },
  'more.account': { en: 'Profile & support', ar: 'الملف الشخصي والدعم' },
};

/** Translates one key, filling `{placeholder}` vars. Unknown keys return the key (never crash). */
export function t(key: string, vars?: Vars): string {
  const entry = STRINGS[key];
  const out = entry ? entry[useLangStore.getState().lang] : key;
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (match, name: string) => (vars[name] !== undefined ? String(vars[name]) : match));
}

/** Dictionary key parity: every key exists in both languages (unit-tested). */
export function dictionaryKeys(): string[] {
  return Object.keys(STRINGS).sort();
}
