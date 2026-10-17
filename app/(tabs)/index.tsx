import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Modal,
  useWindowDimensions,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BadgePercent, ChevronRight, CircleAlert, FileQuestion, Heart, Hourglass, MapPin, Minus, Navigation, Phone, Plus, Receipt, RotateCcw, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Star, Store, TrendingUp, Truck, UserRound, Wallet, X } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { royalFurnitureData } from '../data/royalFurnitureData';
import { catalogImages } from '../data/catalogImages';
import { liveCatalogImages } from '../data/liveCatalogImages';
import { dealsCatalog } from '../data/dealsCatalog';
import { catalogData } from '../data/catalogData';
import { catalogLeaves } from '../data/catalogLeaves';
import { leafProducts } from '../data/leafProducts';
import { collapseSizeFamilies, getSizeVariants } from '../data/sizeVariants';
import ProductDetails, { isMadeToOrderText } from '../ProductDetails';
import { GLASS, asTextStyle, glassTilt } from '../ui/glass';

type WidenProduct<T> = T extends { id: string; n: string; o: number; l: number }
  ? Omit<T, 'id' | 'n' | 'o' | 'l'> & { id: string; n: string; o: number; l: number }
  : never;
type Product = WidenProduct<(typeof royalFurnitureData.products)[number]>;
/** A listing product: one card per product, with the number of selectable sizes. */
type ListedProduct = Product & { sizeCount?: number; baseName?: string };
type Tab = 'home' | 'shop' | 'arrivals' | 'bestSellers' | 'categories' | 'search' | 'cart' | 'account';
type OfficialDetailRow = { label?: string; value?: string };
type OrderRecord = { id: string; purchasedAt: string; deliveryDate: string; status: string; total: number; items: { name: string; category: string }[] };
type OfficialDetail = { general_information?: string; product_info?: { delivery_estimate_days?: string }; delivery_info?: { estimated_delivery?: string; free_delivery?: boolean }; free_assembly?: { is_assemble?: boolean; description?: string }; variants?: Array<{ name?: string; fabricsList?: Array<{ name?: string; colorsList?: Array<{ name?: string; fabric_color_info?: { fabric_name?: string; color_name?: string; color_hex?: string }; info_section?: { material?: OfficialDetailRow[]; dimensions?: OfficialDetailRow[]; specs?: OfficialDetailRow[]; warranty?: OfficialDetailRow[]; assembly?: OfficialDetailRow[] } }> }> }> };

const COLORS = { ink: '#050000', red: '#DA1921', redDeep: '#B61117', maroon: '#830406', navy: '#282984', gold: '#B45309', cream: '#F6F6F7', line: '#E3E3E5', muted: '#444444', sage: '#DCE4D7' };
const categoryColors: Record<string, string> = { furniture: '#D7C2AD', sofas: '#C7D4C9', bedroom: '#D8C7D2', household: '#E5D6B8', 'cooltech-mattress': '#C8DCE2', 'kids-and-teens': '#E5C8B4' };
const homeCategoryImages: Record<string, number> = {
  furniture: require('../../assets/images/home-furniture.webp'),
  sofas: require('../../assets/images/home-sofas.webp'),
  bedroom: require('../../assets/images/home-bedroom.webp'),
  household: require('../../assets/images/home-household.webp'),
  'cooltech-mattress': require('../../assets/images/home-mattress.webp'),
  'kids-and-teens': require('../../assets/images/home-kids.webp'),
};
const homeDealTiles = [
  { label: 'Corner sofas', category: 'sofas:corner-sofas', image: require('../../assets/images/deal-sofas.webp') },
  { label: 'Recliners', category: 'sofas:recliner', image: require('../../assets/images/deal-recliners.webp') },
  { label: 'End tables', category: 'furniture:end-table', image: require('../../assets/images/deal-tables.webp') },
  { label: 'Home decor', category: 'household:decor-items', image: require('../../assets/images/deal-decor.webp') },
] as const;
const homeHeroSlides = [
  { image: require('../../assets/images/hero-sale-mobile.webp'), label: 'Sale 30–75%', category: 'all' },
  { image: require('../../assets/images/hero-payday-mobile.webp'), label: 'Payday sale', category: 'all' },
  { image: require('../../assets/images/hero-kids-mobile.webp'), label: 'Kids bedroom', category: 'kids-and-teens' },
] as const;
const bedroomFeatureProduct = catalogData.find((product) => product.c === 'bedroom' && product.remoteImage) as { remoteImage?: string } | undefined;
const diningFeatureProduct = catalogData.find((product) => product.c === 'furniture' && product.sc === 'dining-room' && product.remoteImage) as { remoteImage?: string } | undefined;
const mattressFeatureProduct = catalogData.find((product) => product.c === 'cooltech-mattress' && product.remoteImage) as { remoteImage?: string } | undefined;
const photoByProductId: Record<string, number> = {
  'kelly-bed-200x160-queen-size': require('../../assets/images/product-kelly-bed-200x160-queen-size.jpg'),
  'bunny-kids-bed-200x140-single-size': require('../../assets/images/product-bunny-kids-bed-200x140-single-size.jpg'),
  'kelly-bed-200x150-queen-size': require('../../assets/images/product-kelly-bed-200x150-queen-size.jpg'),
  'ava-kids-pocket-spring-mattress': require('../../assets/images/product-ava-kids-pocket-spring-mattress.jpg'),
  'freya-kids-foam-mattress': require('../../assets/images/product-freya-kids-foam-mattress.jpg'),
  'serenya-trinket-jar-large-gold-038-bronze-16x16x29': require('../../assets/images/product-serenya-trinket-jar-large-gold-038-bronze-16x16x29.jpg'),
  'sierra-metal-wall-mirror-black-5021525x50cm': require('../../assets/images/product-sierra-metal-wall-mirror-black-5021525x50cm.jpg'),
  'blenka-ceramic-beige-vase-175x12x25cm': require('../../assets/images/product-blenka-ceramic-beige-vase-175x12x25cm.jpg'),
};
const officialPhotos = [
  require('../../assets/images/official-product-01.webp'),
  require('../../assets/images/official-product-02.webp'),
  require('../../assets/images/official-product-03.webp'),
  require('../../assets/images/official-product-04.webp'),
  require('../../assets/images/official-product-05.webp'),
  require('../../assets/images/official-product-06.webp'),
  require('../../assets/images/official-product-07.webp'),
  require('../../assets/images/official-product-08.webp'),
  require('../../assets/images/official-product-09.webp'),
  require('../../assets/images/official-product-10.png'),
  require('../../assets/images/official-product-11.png'),
  require('../../assets/images/official-product-12.webp'),
  require('../../assets/images/official-product-13.webp'),
  require('../../assets/images/official-product-14.webp'),
  require('../../assets/images/official-product-15.webp'),
  require('../../assets/images/official-product-16.webp'),
  require('../../assets/images/official-product-17.webp'),
  require('../../assets/images/official-product-18.webp'),
];

const money = (value: number) => `AED ${value.toLocaleString('en-US')}`;
const categoryThumbnail = (category: string) => { const product = catalogData.find((item) => item.c === category); return product?.remoteImage ? { uri: product.remoteImage } : homeCategoryImages[category]; };

const shortName = (name: string) => name.replace(/\s*-\s*\d+x\d+.*$/i, '');
const photoFor = (product: Product) => { const sourceId = product.id.split('::size=')[0]; return liveCatalogImages[sourceId] || catalogImages[sourceId] || photoByProductId[sourceId] || ((product as Product & { remoteImage?: string }).remoteImage ? { uri: (product as Product & { remoteImage?: string }).remoteImage } : undefined); };

/** Photo for a catalogue entry id — used by the official size dropdown. */
const catalogEntryById: Map<string, { remoteImage?: string }> = new Map(catalogData.map((product) => [product.id, product]));
/** Merchandising flags the catalogue carries (the same ones drawn as badges on the cards). */
const hasLabel = (product: Product, label: string) => ((product.lb as readonly string[] | undefined) || []).includes(label);
/** Trending — the catalogue's own "Trending" flag, so the filter matches the badge on the card. */
const isTrending = (product: Product) => hasLabel(product, 'Trending');
/**
 * Best sellers — the Home rail draws the leading items of the same royal catalogue
 * list, and those items carry the section's two merchandising flags: "Best Seller"
 * or "Trending". The section page uses that same flag, nothing new is invented.
 */
const isBestSeller = (product: Product) => hasLabel(product, 'Best Seller') || isTrending(product);
/** Price bands — the ids and wording are the ones the deals filter sheet already uses. */
const PRICE_BANDS: readonly (readonly [string, string])[] = [['all', 'Any price'], ['under500', 'Under AED 500'], ['500to1500', 'AED 500–1,500'], ['over1500', 'Over AED 1,500']];
const inPriceBand = (amount: number, band: string) => band === 'all' || (band === 'under500' && amount < 500) || (band === '500to1500' && amount >= 500 && amount <= 1500) || (band === 'over1500' && amount > 1500);
const photoForCatalogId = (id: string) => liveCatalogImages[id] || catalogImages[id] || photoByProductId[id] || (() => { const entry = catalogEntryById.get(id); return entry?.remoteImage ? { uri: entry.remoteImage } : undefined; })();

export default function HomeScreen() {
  const [tab, setTab] = useState<Tab>('home');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<Product | null>(null);
  const pageMotion = useRef(new Animated.Value(1)).current;
  const [saved, setSaved] = useState<string[]>([]);
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [notice, setNotice] = useState('');

  const filtered = useMemo(() => royalFurnitureData.products.filter((product) => {
    const matchesCategory = category === 'all' || product.c === category;
    const matchesQuery = product.n.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  }), [category, query]);

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 2200);
  };

  const toggleSaved = (product: Product) => {
    setSaved((items) => items.includes(product.id) ? items.filter((id) => id !== product.id) : [...items, product.id]);
    showNotice(saved.includes(product.id) ? 'Removed from saved items' : 'Saved for later');
  };

  const addToCart = (product: Product) => {
    setCart((items) => {
      const existing = items.find((item) => item.product.id === product.id);
      return existing ? items.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...items, { product, quantity: 1 }];
    });
    showNotice('Added to your bag');
  };

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  useEffect(() => {
    pageMotion.setValue(0);
    Animated.spring(pageMotion, { toValue: 1, tension: 72, friction: 11, useNativeDriver: true }).start();
  }, [tab, selected?.id, pageMotion]);

  if (selected) {
    const sourceId = selected.id.split('::size=')[0];
    const name = selected.n.replace(/\s+—\s+Size:\s+.*$/, '');
    const sizeOptions = getSizeVariants(sourceId).map((variant) => ({ ...variant, photo: photoForCatalogId(variant.id) }));
    return <ProductDetails key={selected.id} product={selected} photoSource={photoFor(selected)} sizeVariants={sizeOptions} onBack={() => setSelected(null)} onSave={() => toggleSaved({ ...selected, id: sourceId })} onAdd={(variant) => { const cartProduct = { ...selected, id: variant.size ? `${sourceId}::size=${encodeURIComponent(variant.size)}` : sourceId, n: variant.size ? `${name} — Size: ${variant.size}` : name, o: variant.price, l: variant.listPrice ?? selected.l }; addToCart(cartProduct); setSelected(null); }} isSaved={saved.includes(sourceId)} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <Animated.View style={[styles.pageTransition, { opacity: pageMotion, transform: [{ translateY: pageMotion.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }, { scale: pageMotion.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }] }]}>
        {tab === 'home' && <HomeContent onCategory={(value) => { setCategory(value); setTab('categories'); }} onProduct={setSelected} onShop={() => setTab('shop')} onBestSellers={() => setTab('bestSellers')} cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'shop' && <ShopContent products={royalFurnitureData.products} query={query} setQuery={setQuery} category={category} setCategory={setCategory} onProduct={setSelected} saved={saved} onSave={toggleSaved} cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'categories' && <ShopContent products={royalFurnitureData.products} query={query} setQuery={setQuery} category={category} setCategory={setCategory} onProduct={setSelected} saved={saved} onSave={toggleSaved} catalogOnly cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'search' && <SearchContent onProduct={setSelected} cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'arrivals' && <NewArrivalsContent onProduct={setSelected} cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'bestSellers' && <BestSellersContent onProduct={setSelected} cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'account' && <AccountContent orders={orders} onBag={() => setTab('cart')} cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'cart' && <CartContent cart={cart} setCart={setCart} saved={saved} onSave={toggleSaved} onProduct={setSelected} onOrderCreated={(order) => setOrders((items) => [order, ...items])} onShop={() => setTab('shop')} />}
        </Animated.View>
        <BottomNav tab={tab} setTab={setTab} count={cartCount} />
        {!!notice && <View style={styles.toast}><Text style={styles.toastText}>{notice}</Text></View>}
      </View>
    </SafeAreaView>
  );
}

function Header({ onCart, onAccount, count = 0 }: { onCart?: () => void; onAccount?: () => void; count?: number }) {
  return <View style={styles.header}><Image source={require('../../assets/images/royal-logo.png')} style={styles.logo} resizeMode="contain" /><View style={styles.headerActions}><Pressable onPress={onAccount} style={styles.headerAccount}><UserRound color={COLORS.ink} size={19} /></Pressable><Pressable onPress={onCart} style={styles.headerBag}><ShoppingBag color={COLORS.ink} size={21} />{count > 0 && <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{count}</Text></View>}</Pressable></View></View>;
}

function HomeContent({ onCategory, onProduct, onShop, onBestSellers, cartCount, onCart, onAccount }: { onCategory: (value: string) => void; onProduct: (product: Product) => void; onShop: () => void; onBestSellers: () => void; cartCount: number; onCart: () => void; onAccount: () => void }) { const { width } = useWindowDimensions(); const [activeSlide, setActiveSlide] = useState(0); const entrance = useRef(new Animated.Value(0)).current; useEffect(() => { Animated.timing(entrance, { toValue: 1, duration: 650, useNativeDriver: true }).start(); }, [entrance]); const slideWidth = Math.min(width - 32, 430); const best = collapseSizeFamilies(royalFurnitureData.products.slice(0, 6)); return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}><Header count={cartCount} onCart={onCart} onAccount={onAccount} /><Animated.View style={{ opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}><View style={styles.heroCarousel}><ScrollView horizontal pagingEnabled snapToInterval={slideWidth} decelerationRate="fast" showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(event) => setActiveSlide(Math.round(event.nativeEvent.contentOffset.x / slideWidth))} contentContainerStyle={styles.heroTrack}>{homeHeroSlides.map((slide) => <Pressable key={slide.label} style={[styles.heroSlide, { width: slideWidth }]} onPress={() => slide.category === 'all' ? onShop() : onCategory(slide.category)}><Image source={slide.image} style={styles.heroSlideImage} resizeMode="cover" /></Pressable>)}</ScrollView><View style={styles.heroDots}>{homeHeroSlides.map((slide, index) => <View key={slide.label} style={[styles.heroDot, index === activeSlide && styles.heroDotActive]} />)}</View></View></Animated.View><Pressable style={styles.paymentStrip} onPress={onShop}><Image source={require('../../assets/images/home-deals-strip.webp')} style={styles.paymentStripImage} resizeMode="contain" /></Pressable><SectionTitle title="Amazing deals" action="Shop all" onPress={onShop} /><View style={styles.dealTiles}>{homeDealTiles.map((tile) => <Pressable key={tile.label} style={styles.dealTile} onPress={() => onCategory(tile.category)}><Image source={tile.image} style={styles.dealTileImage} resizeMode="cover" /><View style={styles.dealTileShade} /><Text style={styles.dealTileLabel}>{tile.label}</Text></Pressable>)}</View><SectionTitle title="Shop by room" action="View all" onPress={() => onCategory('all')} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalPad}>{royalFurnitureData.cats.map((cat) => <Pressable key={cat.s} style={[styles.roomCard, { backgroundColor: categoryColors[cat.s] || '#ddd' }]} onPress={() => onCategory(cat.s)}><Image source={categoryThumbnail(cat.s)} style={styles.roomPhoto} resizeMode="cover" /><View style={styles.roomShade} /><Text style={styles.roomLabel}>{cat.n}</Text><View style={styles.roomIcon}><Text>{cat.s === 'sofas' ? '◒' : cat.s === 'bedroom' ? '⌂' : cat.s === 'household' ? '✦' : '◌'}</Text></View></Pressable>)}</ScrollView><Pressable style={styles.officialFeature} onPress={() => onCategory('bedroom')}><Image source={require('../../assets/images/home-bedroom-feature-mobile.webp')} style={styles.officialFeatureImage} resizeMode="cover" /></Pressable><View style={styles.collectionStories}><Pressable style={styles.storyCard} onPress={() => onCategory('furniture:dining-room')}><Image source={require('../../assets/images/home-dining-feature-mobile.webp')} style={styles.storyImage} resizeMode="cover" /></Pressable><Pressable style={styles.storyCard} onPress={() => onCategory('cooltech-mattress')}><Image source={require('../../assets/images/home-mattress-feature-mobile.webp')} style={styles.storyImage} resizeMode="cover" /></Pressable></View><SectionTitle title="Best sellers" action="View all" onPress={onBestSellers} /><ProductRail products={best} onProduct={onProduct} /></ScrollView>; }

function TrustRow() { return <View style={styles.trustRow}><View><Truck color={COLORS.red} size={19} /><Text style={styles.trustTitle}>Free assembly</Text><Text style={styles.trustBody}>Selected items</Text></View><View><MapPin color={COLORS.red} size={19} /><Text style={styles.trustTitle}>12 showrooms</Text><Text style={styles.trustBody}>Across the UAE</Text></View><View><Text style={styles.trustIcon}>4×</Text><Text style={styles.trustTitle}>Pay your way</Text><Text style={styles.trustBody}>Tabby & Tamara</Text></View></View>; }
function SectionTitle({ title, action, onPress }: { title: string; action: string; onPress: () => void }) { return <View style={styles.sectionTitle}><Text style={styles.sectionHeading}>{title}</Text><Pressable onPress={onPress}><Text style={styles.sectionAction}>{action}</Text></Pressable></View>; }
function ProductRail({ products, onProduct }: { products: readonly Product[]; onProduct: (product: Product) => void }) { return <FlatList horizontal data={products} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalPad} renderItem={({ item }) => <ProductCard product={item} onPress={() => onProduct(item)} />} />; }

function ProductCard({ product, onPress, saved, onSave, wide }: { product: ListedProduct; onPress: () => void; saved?: boolean; onSave?: () => void; wide?: boolean }) {
  const discount = product.l > product.o ? Math.round((1 - product.o / product.l) * 100) : 0;
  const sizeCount = product.sizeCount || 0;
  return <Pressable style={[styles.productCard, wide && styles.gridProductCard]} onPress={onPress}><View style={[styles.productImage, { backgroundColor: categoryColors[product.c] || '#ddd' }]}>{photoFor(product) ? <Image source={photoFor(product)} style={styles.productPhoto} resizeMode="cover" /> : <Text style={styles.productInitial}>{shortName(product.n).slice(0, 1)}</Text>}{discount > 0 && <Text style={styles.salePill}>{discount}% OFF</Text>}{onSave && <Pressable style={styles.heart} onPress={onSave}><Heart size={17} color={saved ? COLORS.red : COLORS.ink} fill={saved ? COLORS.red : 'transparent'} /></Pressable>}</View><Text style={styles.productCategory}>{product.scn}</Text>{Array.isArray(product.lb) && product.lb.length > 0 && <Text style={styles.catalogBadge}>{product.lb[0]}</Text>}{isMadeToOrderText(product.d) && <Text style={{ color: COLORS.red, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, marginTop: 3 }}>MADE TO ORDER</Text>}<Text style={styles.productName} numberOfLines={2}>{sizeCount > 1 ? product.baseName || shortName(product.n) : product.n}</Text><View style={styles.priceLine}><Text style={styles.productPrice}>{sizeCount > 1 ? `From ${money(product.o)}` : money(product.o)}</Text>{product.l > product.o && <Text style={styles.productWas}>{money(product.l)}</Text>}</View>{sizeCount > 1 && <Text style={styles.sizeCountBadge}>{sizeCount} sizes available</Text>}</Pressable>;
}

function ShopContent({ products, query, setQuery, category, setCategory, onProduct, saved, onSave, catalogOnly, cartCount, onCart, onAccount }: { products: readonly Product[]; query: string; setQuery: (value: string) => void; category: string; setCategory: (value: string) => void; onProduct: (product: Product) => void; saved: string[]; onSave: (product: Product) => void; catalogOnly?: boolean; cartCount: number; onCart: () => void; onAccount: () => void }) { const dealProducts = dealsCatalog as unknown as readonly Product[]; const catalogProducts = catalogData as unknown as readonly Product[]; const [dealQuery, setDealQuery] = useState(''); const [filterOpen, setFilterOpen] = useState(false); const initialCategoryParts = category.split(':'); const [catalogMode, setCatalogMode] = useState(!!catalogOnly); const [dealCategory, setDealCategory] = useState(catalogOnly ? initialCategoryParts[0] : 'all'); const [dealSubCategory, setDealSubCategory] = useState(catalogOnly ? (initialCategoryParts[1] || 'all') : 'all'); const [dealLeaf, setDealLeaf] = useState('all'); const [discount, setDiscount] = useState(41); const [price, setPrice] = useState('all'); const [sort, setSort] = useState('priceLow'); const [browsePrice, setBrowsePrice] = useState('all'); const [browseTrending, setBrowseTrending] = useState(false); const deals = useMemo(() => collapseSizeFamilies(dealProducts.filter((product) => { const percent = product.pc || (product.l > product.o ? Math.round((1 - product.o / product.l) * 100) : 0); const categoryMatch = dealCategory === 'all' || product.c === dealCategory; const queryMatch = product.n.toLowerCase().includes(dealQuery.toLowerCase()); const priceMatch = price === 'all' || (price === 'under500' && product.o < 500) || (price === '500to1500' && product.o >= 500 && product.o <= 1500) || (price === 'over1500' && product.o > 1500); return percent >= discount && categoryMatch && queryMatch && priceMatch; }).sort((a, b) => { const discountA = a.pc || (a.l > a.o ? Math.round((1 - a.o / a.l) * 100) : 0); const discountB = b.pc || (b.l > b.o ? Math.round((1 - b.o / b.l) * 100) : 0); if (sort === 'priceLow') return a.o - b.o; if (sort === 'priceHigh') return b.o - a.o; if (sort === 'name') return a.n.localeCompare(b.n); return discountB - discountA; })), [dealProducts, dealQuery, dealCategory, discount, price, sort]); const catalogList = useMemo(() => collapseSizeFamilies(catalogProducts.filter((product) => (dealCategory === 'all' || product.c === dealCategory) && (dealSubCategory === 'all' || product.sc === dealSubCategory) && (dealLeaf === 'all' || (leafProducts[dealLeaf as keyof typeof leafProducts] as readonly string[] | undefined)?.includes(product.id)) && inPriceBand(product.o, browsePrice) && (!browseTrending || isTrending(product)))), [catalogProducts, dealCategory, dealSubCategory, dealLeaf, browsePrice, browseTrending]); const leafOptions = useMemo(() => catalogLeaves.filter((leaf) => leaf.category === dealCategory && leaf.subcategory === dealSubCategory), [dealCategory, dealSubCategory]); const subcategoryOptions = useMemo(() => [...new Map(catalogProducts.filter((product) => product.c === dealCategory && product.sc).map((product) => [product.sc, product.scn])).entries()], [catalogProducts, dealCategory]); const catalogChips = (items: readonly (readonly [string, string])[], active: string, onChange: (value: string) => void) => <ScrollView horizontal style={styles.catalogFilterScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catalogFilterBar}>{items.map(([value, label]) => <Pressable key={value} accessibilityRole="button" aria-pressed={active === value} onPress={() => onChange(value)} style={[styles.subFilter, active === value && styles.subFilterActive]}><Text style={[styles.subFilterText, active === value && styles.subFilterTextActive]}>{label}</Text></Pressable>)}</ScrollView>; if (catalogMode) return <View style={styles.flex}><View style={styles.catalogTopbar}><Image source={require('../../assets/images/royal-logo.png')} style={styles.catalogLogo} resizeMode="contain" /><View style={styles.catalogTitleWrap}><Text style={styles.catalogTitle}>{dealSubCategory !== 'all' ? catalogProducts.find((product) => product.sc === dealSubCategory)?.scn : dealCategory === 'all' ? 'Browse furniture' : royalFurnitureData.cats.find((cat) => cat.s === dealCategory)?.n}</Text><Text style={styles.catalogMeta}>{catalogList.length} products</Text></View><Pressable style={styles.catalogDealsLink} onPress={() => setCatalogMode(false)}><Text style={styles.backToDealsText}>Deals</Text><ChevronRight color={COLORS.red} size={15} /></Pressable></View><ScrollView horizontal style={styles.catalogCategoryScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catalogCategoryBar}>{[['all', 'All'], ...royalFurnitureData.cats.map((cat) => [cat.s, cat.n] as const)].map(([value, label]) => <Pressable key={value} onPress={() => { setDealCategory(value); setDealSubCategory('all'); }} style={[styles.filter, dealCategory === value && styles.filterActive]}><Text style={[styles.filterText, dealCategory === value && styles.filterTextActive]}>{label}</Text></Pressable>)}</ScrollView>{dealCategory !== 'all' && <ScrollView horizontal style={styles.catalogSubScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catalogSubBar}><Pressable onPress={() => { setDealSubCategory('all'); setDealLeaf('all'); }} style={[styles.subFilter, dealSubCategory === 'all' && styles.subFilterActive]}><Text style={[styles.subFilterText, dealSubCategory === 'all' && styles.subFilterTextActive]}>All in {royalFurnitureData.cats.find((cat) => cat.s === dealCategory)?.n}</Text></Pressable>{subcategoryOptions.map(([value, label]) => <Pressable key={value} onPress={() => { setDealSubCategory(value); setDealLeaf('all'); }} style={[styles.subFilter, dealSubCategory === value && styles.subFilterActive]}><Text style={[styles.subFilterText, dealSubCategory === value && styles.subFilterTextActive]}>{label}</Text></Pressable>)}</ScrollView>}{dealSubCategory !== 'all' && leafOptions.length > 0 && <ScrollView horizontal style={styles.catalogLeafScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catalogLeafBar}><Pressable onPress={() => setDealLeaf('all')} style={[styles.leafFilter, dealLeaf === 'all' && styles.leafFilterActive]}><Text style={[styles.leafFilterText, dealLeaf === 'all' && styles.leafFilterTextActive]}>All</Text></Pressable>{leafOptions.map((leaf) => <Pressable key={leaf.slug} onPress={() => setDealLeaf(leaf.slug)} style={[styles.leafFilter, dealLeaf === leaf.slug && styles.leafFilterActive]}><Text style={[styles.leafFilterText, dealLeaf === leaf.slug && styles.leafFilterTextActive]}>{leaf.name}</Text></Pressable>)}</ScrollView>}<Text style={styles.catalogFilterHeading}>Price</Text>{catalogChips(PRICE_BANDS, browsePrice, setBrowsePrice)}<Text style={styles.catalogFilterHeading}>Trending</Text>{catalogChips([['all', 'All items'], ['trending', 'Trending']], browseTrending ? 'trending' : 'all', (value) => setBrowseTrending(value === 'trending'))}<FlatList style={styles.flex} data={catalogList} numColumns={2} keyExtractor={(item) => item.id} contentContainerStyle={styles.grid} columnWrapperStyle={styles.gridRow} renderItem={({ item }) => <ProductCard product={item} onPress={() => onProduct(item)} saved={saved.includes(item.id)} onSave={() => onSave(item)} wide />} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No products match these filters</Text><Text style={styles.pageSub}>Try a different price range or turn off the trending filter.</Text></View>} /></View>; const chips = (items: readonly (readonly [string, string])[], active: string, onChange: (value: string) => void) => <ScrollView horizontal style={styles.compactFilterScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compactFilterRow}>{items.map(([value, label]) => <Pressable key={value} onPress={() => onChange(value)} style={[styles.filter, active === value && styles.filterActive]}><Text style={[styles.filterText, active === value && styles.filterTextActive]}>{label}</Text></Pressable>)}</ScrollView>; return <View style={styles.flex}><Header count={cartCount} onCart={onCart} onAccount={onAccount} /><ScrollView style={styles.flex} contentContainerStyle={styles.dealPage}><View style={styles.shopHead}><Text style={styles.pageTitle}>Amazing deals</Text><Text style={styles.pageSub}>Save more on Royal Furniture favourites. Showing products discounted by more than 40%.</Text></View><View style={styles.dealHero}><View style={styles.dealGlowOne} /><View style={styles.dealGlowTwo} /><View style={styles.dealLogo}><BadgePercent color="#fff" size={30} strokeWidth={1.8} /></View><View style={styles.dealHeroCopy}><Text style={styles.dealHeroKicker}>ROYAL DEALS</Text><Text style={styles.dealHeroTitle}>More style. Less spend.</Text><Text style={styles.dealHeroBody}>Every item here is more than 40% off.</Text></View></View><Pressable style={styles.filterBar} onPress={() => setFilterOpen(true)}><View style={styles.filterBarIcon}><SlidersHorizontal color={COLORS.red} size={17} /></View><View style={{ flex: 1 }}><Text style={styles.filterBarText}>Filter deals</Text><Text style={styles.filterSummary}>{dealCategory === 'all' ? 'All categories' : dealCategory} · {discount}%+ off · {price === 'all' ? 'Any price' : price}</Text></View><ChevronRight color={COLORS.muted} size={18} /></Pressable><Modal transparent animationType="slide" visible={filterOpen} onRequestClose={() => setFilterOpen(false)}><View style={styles.modalShade}><View style={styles.filterSheet}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Filter deals</Text><Pressable onPress={() => setFilterOpen(false)}><X color={COLORS.ink} size={20} /></Pressable></View><Text style={styles.filterHeading}>Category</Text>{chips([['all', 'All'], ...royalFurnitureData.cats.map((cat) => [cat.s, cat.n] as const)], dealCategory, setDealCategory)}<Text style={styles.filterHeading}>Minimum discount</Text>{chips([['41', 'Over 40% off'], ['50', '50%+ off'], ['60', '60%+ off'], ['70', '70%+ off']], String(discount), (value) => setDiscount(Number(value)))}<Text style={styles.filterHeading}>Price</Text>{chips([['all', 'Any price'], ['under500', 'Under AED 500'], ['500to1500', 'AED 500–1,500'], ['over1500', 'Over AED 1,500']], price, setPrice)}<Pressable style={styles.doneButton} onPress={() => setFilterOpen(false)}><Text style={styles.doneButtonText}>Show deals</Text></Pressable></View></View></Modal><View style={styles.resultsRow}><Text style={styles.resultCount}>{deals.length} deals</Text></View><View style={styles.dealGrid}>{deals.length ? deals.map((item) => <ProductCard key={item.id} product={item} onPress={() => onProduct(item)} saved={saved.includes(item.id)} onSave={() => onSave(item)} wide />) : <View style={styles.empty}><Text style={styles.emptyTitle}>No deals match these filters</Text><Text style={styles.pageSub}>Try lowering the discount or changing the price range.</Text></View>}</View></ScrollView></View>; }

function extractLiveDetails(detail: OfficialDetail | null) { const variants = detail?.variants || []; const sizes: string[] = []; const fabrics: string[] = []; const colors: string[] = []; const rows: OfficialDetailRow[] = []; for (const variant of variants) { if (variant.name) sizes.push(variant.name); for (const fabric of variant.fabricsList || []) { if (fabric.name) fabrics.push(fabric.name); for (const color of fabric.colorsList || []) { const colorName = color.fabric_color_info?.color_name || color.name; if (colorName) colors.push(colorName); const info = color.info_section; rows.push(...(info?.material || []), ...(info?.dimensions || []), ...(info?.specs || []), ...(info?.warranty || []), ...(info?.assembly || [])); } } } const uniqueRows = rows.filter((row) => row.label && row.value).filter((row, index, list) => list.findIndex((item) => item.label === row.label && item.value === row.value) === index); return { sizes: [...new Set(sizes)], fabrics: [...new Set(fabrics)], colors: [...new Set(colors)], rows: uniqueRows }; }

function ProductDetail({ product, onBack, onSave, onAdd, isSaved }: { product: Product; onBack: () => void; onSave: () => void; onAdd: () => void; isSaved: boolean }) { const [liveDetail, setLiveDetail] = useState<OfficialDetail | null>(null); const [detailLoading, setDetailLoading] = useState(false); const [detailError, setDetailError] = useState(false); const remoteSlug = product.id.match(/^\d+-(.+)$/)?.[1]; useEffect(() => { if (!remoteSlug) return; let active = true; setDetailLoading(true); fetch(`https://rylqus.ae/api/products/product-detail/${remoteSlug}/`, { headers: { locale: 'en', country: 'ae' } }).then((response) => { if (!response.ok) throw new Error('detail'); return response.json(); }).then((payload: { data?: OfficialDetail }) => { if (active) setLiveDetail(payload.data || null); }).catch(() => { if (active) setDetailError(true); }).finally(() => { if (active) setDetailLoading(false); }); return () => { active = false; }; }, [remoteSlug]); const live = extractLiveDetails(liveDetail); const sizes = live.sizes.length ? live.sizes : [...new Set(product.z.map((item) => item[0]))]; const fabrics = live.fabrics.length ? live.fabrics : [...new Set(product.z.flatMap((item) => item[1].map((fabric) => fabric[0])))]; const specs = Object.entries(product.sp).flatMap(([section, rows]) => (rows as readonly (readonly [string, string])[]).slice(0, 3).map((row) => `${section}: ${row[0]} - ${row[1]}`)).slice(0, 8); return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.detail}><Pressable onPress={onBack} style={styles.back}><ChevronRight color={COLORS.ink} size={20} style={{ transform: [{ rotate: '180deg' }] }} /><Text style={styles.backText}>Back to collection</Text></Pressable><View style={[styles.detailImage, { backgroundColor: categoryColors[product.c] || '#ddd' }]}>{photoFor(product) ? <Image source={photoFor(product)} style={styles.detailPhoto} resizeMode="cover" /> : <Text style={styles.detailInitial}>{shortName(product.n).slice(0, 1)}</Text>}<Pressable style={styles.detailHeart} onPress={onSave}><Heart size={21} color={isSaved ? COLORS.red : COLORS.ink} fill={isSaved ? COLORS.red : 'transparent'} /></Pressable></View><Text style={styles.detailCategory}>{product.scn}</Text><Text style={styles.detailTitle}>{product.n}</Text><View style={styles.rating}><Star color={COLORS.gold} size={15} fill={COLORS.gold} /><Star color={COLORS.gold} size={15} fill={COLORS.gold} /><Star color={COLORS.gold} size={15} fill={COLORS.gold} /><Star color={COLORS.gold} size={15} fill={COLORS.gold} /><Star color={COLORS.gold} size={15} fill={COLORS.gold} /><Text style={styles.ratingText}> Loved by Royal customers</Text></View><Text style={styles.detailPrice}>{money(product.o)}</Text>{product.l > product.o && <Text style={styles.detailWas}>{money(product.l)}  <Text style={styles.saveText}>You save {money(product.l - product.o)}</Text></Text>}<View style={styles.detailLine} /><Text style={styles.detailHeading}>Why you’ll love it</Text><Text style={styles.detailDescription}>{liveDetail?.general_information || product.d}</Text>{detailLoading && <Text style={styles.detailLoading}>Loading official product details…</Text>}{detailError && <Text style={styles.detailError}>Some live specifications could not be loaded. Showing catalog details.</Text>}<View style={styles.detailFeature}><Truck color={COLORS.red} size={18} /><Text style={styles.featureText}><Text style={styles.bold}>Delivery in about {product.dl} days</Text>{`\n`}Free assembly on eligible furniture.</Text></View><View style={styles.detailSpecs}><Text style={styles.detailHeading}>Product details</Text>{live.fabrics.length > 0 && <><Text style={styles.specLabel}>Fabric</Text><Text style={styles.specValue}>{[...new Set(live.fabrics)].join(' • ')}</Text></>}{live.colors.length > 0 && <><Text style={styles.specLabel}>Available colours</Text><Text style={styles.specValue}>{live.colors.join(' • ')}</Text></>}{live.rows.map((row) => <View key={`${row.label}-${row.value}`}><Text style={styles.specLabel}>{row.label}</Text><Text style={styles.specValue}>{row.value}</Text></View>)}<Text style={styles.specLabel}>Available sizes</Text><Text style={styles.specValue}>{sizes.join(' • ') || 'See options in showroom'}</Text><Text style={styles.specLabel}>Fabric and finish</Text><Text style={styles.specValue}>{fabrics.join(' • ') || 'As shown'}</Text>{specs.map((spec) => <Text key={spec} style={styles.specValue}>{spec}</Text>)}</View><Pressable style={styles.addButton} onPress={onAdd}><Text style={styles.addButtonText}>Add to bag</Text><Text style={styles.addButtonPrice}>{money(product.o)}</Text></Pressable></ScrollView></SafeAreaView>; }

function SearchContent({ onProduct, cartCount, onCart, onAccount }: { onProduct: (product: Product) => void; cartCount: number; onCart: () => void; onAccount: () => void }) { const products = catalogData as unknown as readonly Product[]; const [query, setQuery] = useState(''); const [category, setCategory] = useState('all'); const [subcategory, setSubcategory] = useState('all'); const subcategories = [...new Map(products.filter((product) => category !== 'all' && product.c === category && product.sc).map((product) => [product.sc, product.scn])).entries()]; const results = collapseSizeFamilies(products.filter((product) => (category === 'all' || product.c === category) && (subcategory === 'all' || product.sc === subcategory) && (!query.trim() || `${product.n} ${product.scn} ${product.d}`.toLowerCase().includes(query.toLowerCase())))); return <View style={styles.flex}><Header count={cartCount} onCart={onCart} onAccount={onAccount} /><View style={styles.searchPage}><Text style={styles.pageTitle}>Search Royal Furniture</Text><Text style={styles.pageSub}>Find products, rooms, categories, and subcategories.</Text><View style={styles.searchBox}><Search color={COLORS.muted} size={19} /><TextInput autoFocus placeholder="Search sofas, beds, coffee tables..." placeholderTextColor={COLORS.muted} value={query} onChangeText={setQuery} style={styles.searchInput} selectionColor={COLORS.red} cursorColor={COLORS.red} /></View></View><Text style={styles.searchLabel}>Categories</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.searchChipScroll} contentContainerStyle={styles.compactFilterRow}><Pressable onPress={() => { setCategory('all'); setSubcategory('all'); }} style={[styles.filter, category === 'all' && styles.filterActive]}><Text style={[styles.filterText, category === 'all' && styles.filterTextActive]}>All</Text></Pressable>{royalFurnitureData.cats.map((cat) => <Pressable key={cat.s} onPress={() => { setCategory(cat.s); setSubcategory('all'); }} style={[styles.filter, category === cat.s && styles.filterActive]}><Text style={[styles.filterText, category === cat.s && styles.filterTextActive]}>{cat.n}</Text></Pressable>)}</ScrollView>{subcategory !== 'all' && subcategories.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.searchChipScroll} contentContainerStyle={styles.compactFilterRow}>{[['all', 'All in category'], ...subcategories].map(([value, label]) => <Pressable key={value} onPress={() => setSubcategory(value)} style={[styles.subFilter, subcategory === value && styles.subFilterActive]}><Text style={[styles.subFilterText, subcategory === value && styles.subFilterTextActive]}>{label}</Text></Pressable>)}</ScrollView>}<View style={styles.searchResultsHeader}><Text style={styles.resultCount}>{query || category !== 'all' ? `${results.length} results` : 'Browse all products'}</Text></View><FlatList style={styles.flex} data={results} numColumns={2} keyExtractor={(item) => item.id} contentContainerStyle={styles.grid} columnWrapperStyle={styles.gridRow} renderItem={({ item }) => <ProductCard product={item} wide onPress={() => onProduct(item)} />} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No products found</Text><Text style={styles.pageSub}>Try another product, room, or category.</Text></View>} /></View>; }

function NewArrivalsContent({ onProduct, cartCount, onCart, onAccount }: { onProduct: (product: Product) => void; cartCount: number; onCart: () => void; onAccount: () => void }) { const products = collapseSizeFamilies(royalFurnitureData.products.slice(0, 24)); return <View style={styles.flex}><Header count={cartCount} onCart={onCart} onAccount={onAccount} /><View style={styles.shopHead}><Text style={styles.pageTitle}>New arrivals</Text><Text style={styles.pageSub}>The latest pieces added to the Royal Furniture collection, sourced from the official UAE catalog.</Text></View><View style={styles.arrivalsHero}><Star color={COLORS.gold} size={24} fill={COLORS.gold} /><View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.arrivalsHeroTitle}>Just in</Text><Text style={styles.arrivalsHeroBody}>Fresh furniture, bedroom pieces and home accents.</Text></View></View><View style={styles.resultsRow}><Text style={styles.resultCount}>{products.length} new pieces</Text><Text style={styles.arrivalsDate}>Official catalog · {royalFurnitureData.captured}</Text></View><FlatList data={products} numColumns={2} keyExtractor={(item) => item.id} contentContainerStyle={styles.grid} columnWrapperStyle={styles.gridRow} renderItem={({ item }) => <ProductCard product={item} onPress={() => onProduct(item)} wide />} /></View>; }

/** The Best sellers section's own page — only the items flagged for the section. */
function BestSellersContent({ onProduct, cartCount, onCart, onAccount }: { onProduct: (product: Product) => void; cartCount: number; onCart: () => void; onAccount: () => void }) { const products = collapseSizeFamilies(royalFurnitureData.products.filter(isBestSeller)); return <View style={styles.flex}><Header count={cartCount} onCart={onCart} onAccount={onAccount} /><View style={styles.shopHead}><Text style={styles.pageTitle}>Best sellers</Text><Text style={styles.pageSub}>The pieces shoppers reach for most — every item the Royal catalogue flags as a Best Seller or Trending piece.</Text></View><View style={styles.arrivalsHero}><TrendingUp color={COLORS.red} size={24} /><View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.arrivalsHeroTitle}>Most loved pieces</Text><Text style={styles.arrivalsHeroBody}>Best sellers and trending items, straight from the official catalog.</Text></View></View><View style={styles.resultsRow}><Text style={styles.resultCount}>{products.length} best sellers</Text><Text style={styles.arrivalsDate}>Official catalog · {royalFurnitureData.captured}</Text></View><FlatList data={products} numColumns={2} keyExtractor={(item) => item.id} contentContainerStyle={styles.grid} columnWrapperStyle={styles.gridRow} renderItem={({ item }) => <ProductCard product={item} onPress={() => onProduct(item)} wide />} /></View>; }

function SavedContent({ products, onProduct, onShop }: { products: readonly Product[]; onProduct: (product: Product) => void; onShop: () => void }) { return <View style={styles.flex}><Header /><View style={styles.shopHead}><Text style={styles.pageTitle}>Saved pieces</Text><Text style={styles.pageSub}>Keep your favourites close while you decide.</Text></View>{products.length ? <FlatList data={products} numColumns={2} keyExtractor={(item) => item.id} contentContainerStyle={styles.grid} columnWrapperStyle={styles.gridRow} renderItem={({ item }) => <ProductCard product={item} onPress={() => onProduct(item)} wide />} /> : <View style={styles.empty}><Heart color={COLORS.red} size={30} /><Text style={styles.emptyTitle}>Your saved list is empty</Text><Text style={styles.pageSub}>Tap the heart on anything you love.</Text><Pressable style={styles.darkButton} onPress={onShop}><Text style={styles.darkButtonText}>Browse furniture</Text></Pressable></View>}</View>; }

function CartContent({ cart, setCart, saved, onSave, onProduct, onOrderCreated, onShop }: { cart: { product: Product; quantity: number }[]; setCart: (items: { product: Product; quantity: number }[]) => void; saved: string[]; onSave: (product: Product) => void; onProduct: (product: Product) => void; onOrderCreated: (order: OrderRecord) => void; onShop: () => void }) { const [checkoutOpen, setCheckoutOpen] = useState(false); const [selectedStore, setSelectedStore] = useState(0); const [orderPlaced, setOrderPlaced] = useState(false); const [customer, setCustomer] = useState({ name: '', phone: '', address: '' }); const [checkoutError, setCheckoutError] = useState(''); const [delivery, setDelivery] = useState('home'); const savedProducts = [...(catalogData as unknown as readonly Product[]), ...royalFurnitureData.products].filter((product, index, list) => saved.includes(product.id) && list.findIndex((item) => item.id === product.id) === index); const total = cart.reduce((sum, item) => sum + item.product.o * item.quantity, 0); return <><ScrollView contentContainerStyle={styles.scrollContent}><Header count={cart.reduce((sum, item) => sum + item.quantity, 0)} /><View style={styles.shopHead}><Text style={styles.pageTitle}>Your bag</Text><Text style={styles.pageSub}>{cart.length ? `${cart.length} items ready for your home` : 'Your next favourite piece belongs here.'}</Text></View>{savedProducts.length > 0 && <View style={styles.savedSection}><View style={styles.savedSectionHeader}><Text style={styles.savedSectionTitle}>Saved for later</Text><Text style={styles.savedSectionCount}>{savedProducts.length}</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalPad}>{savedProducts.map((product) => <ProductCard key={product.id} product={product} onPress={() => onProduct(product)} saved onSave={() => onSave(product)} />)}</ScrollView></View>}{cart.length ? <><View>{cart.map(({ product, quantity }) => <View style={styles.cartLine} key={product.id}><View style={[styles.cartImage, { backgroundColor: categoryColors[product.c] || '#ddd' }]}>{photoFor(product) ? <Image source={photoFor(product)} style={styles.cartPhoto} resizeMode="cover" /> : <Text style={styles.cartInitial}>{shortName(product.n).slice(0, 1)}</Text>}</View><View style={{ flex: 1 }}><Text style={styles.productName}>{product.n}</Text><Text style={styles.productPrice}>{money(product.o)}</Text><View style={styles.quantity}><Pressable onPress={() => setCart(cart.map((item) => item.product.id === product.id ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))}><Minus color={COLORS.ink} size={14} /></Pressable><Text style={styles.quantityText}>{quantity}</Text><Pressable onPress={() => setCart(cart.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))}><Plus color={COLORS.ink} size={14} /></Pressable></View></View><Pressable onPress={() => setCart(cart.filter((item) => item.product.id !== product.id))}><X color={COLORS.muted} size={18} /></Pressable></View>)}</View><View style={styles.totalBox}><View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>{money(total)}</Text></View><View style={styles.totalRow}><Text style={styles.totalLabel}>Delivery</Text><Text style={styles.free}>Confirmed at checkout</Text></View><View style={styles.totalRule} /><View style={styles.totalRow}><Text style={styles.totalBig}>Total</Text><Text style={styles.totalBig}>{money(total)}</Text></View><Pressable style={styles.addButton} onPress={() => setCheckoutOpen(true)}><Text style={styles.addButtonText}>Continue to checkout</Text></Pressable></View></> : <View style={styles.empty}><ShoppingBag color={COLORS.red} size={31} /><Text style={styles.emptyTitle}>Your bag is empty</Text><Text style={styles.pageSub}>Find something beautiful for your home.</Text><Pressable style={styles.darkButton} onPress={onShop}><Text style={styles.darkButtonText}>Start shopping</Text></Pressable></View>}</ScrollView><Modal transparent animationType="slide" visible={checkoutOpen} onRequestClose={() => setCheckoutOpen(false)}><View style={styles.modalShade}><View style={styles.checkoutSheet}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Secure checkout</Text><Pressable onPress={() => setCheckoutOpen(false)}><X color={COLORS.ink} size={20} /></Pressable></View><Text style={styles.checkoutNote}>Delivery and payment are confirmed with Royal Furniture before fulfilment.</Text><Text style={styles.checkoutLabel}>Your name</Text><TextInput style={styles.checkoutInput} placeholder="Full name" value={customer.name} onChangeText={(name) => setCustomer({ ...customer, name })} /><Text style={styles.checkoutLabel}>Mobile number</Text><TextInput style={styles.checkoutInput} placeholder="05X XXX XXXX" keyboardType="phone-pad" value={customer.phone} onChangeText={(phone) => setCustomer({ ...customer, phone })} /><Text style={styles.checkoutLabel}>Receive your order</Text><View style={styles.checkoutChoices}><Pressable onPress={() => setDelivery('home')} style={[styles.checkoutChoice, delivery === 'home' && styles.checkoutChoiceActive]}><Text style={styles.checkoutChoiceText}>Home delivery</Text></Pressable><Pressable onPress={() => setDelivery('collect')} style={[styles.checkoutChoice, delivery === 'collect' && styles.checkoutChoiceActive]}><Text style={styles.checkoutChoiceText}>Click & Collect</Text></Pressable></View>{delivery === 'home' ? <><Text style={styles.checkoutLabel}>Delivery address</Text><TextInput style={styles.checkoutInput} placeholder="Building, street, area, emirate" value={customer.address} onChangeText={(address) => setCustomer({ ...customer, address })} /></> : <><Text style={styles.checkoutLabel}>Choose a showroom</Text><ScrollView style={styles.checkoutStoreList} showsVerticalScrollIndicator={false}>{royalFurnitureData.stores.map((store, index) => <Pressable key={store.city + store.addr} onPress={() => setSelectedStore(index)} style={[styles.checkoutStore, selectedStore === index && styles.checkoutStoreActive]}><MapPin color={selectedStore === index ? COLORS.red : COLORS.muted} size={16} /><View style={{ flex: 1 }}><Text style={styles.checkoutStoreCity}>{store.city}</Text><Text style={styles.checkoutStoreAddress}>{store.addr}</Text><Text style={styles.checkoutStoreHours}>Open {store.open}</Text></View>{selectedStore === index && <Text style={styles.storeSelected}>Selected</Text>}</Pressable>)}</ScrollView></>}{!!checkoutError && <Text style={styles.checkoutError}>{checkoutError}</Text>}<Pressable style={styles.addButton} onPress={() => { if (!customer.name.trim() || customer.phone.trim().length < 7 || (delivery === 'home' && !customer.address.trim())) { setCheckoutError('Enter your name, mobile number, and address.'); return; } setCheckoutError(''); const now = new Date(); const deliveryDate = new Date(now); deliveryDate.setDate(deliveryDate.getDate() + (delivery === 'collect' ? 5 : 7)); onOrderCreated({ id: `RF-${Date.now().toString().slice(-6)}`, purchasedAt: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), deliveryDate: deliveryDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), status: delivery === 'collect' ? `Ready for collection at ${royalFurnitureData.stores[selectedStore].city}` : 'Delivery scheduled', total, items: cart.map((item) => ({ name: item.product.n, category: item.product.c })) }); setCheckoutOpen(false); setOrderPlaced(true); setCart([]); }}><Text style={styles.addButtonText}>Place order request</Text><Text style={styles.addButtonPrice}>{money(total)}</Text></Pressable></View></View></Modal><Modal transparent animationType="fade" visible={orderPlaced} onRequestClose={() => setOrderPlaced(false)}><View style={styles.modalShade}><View style={styles.confirmationCard}><View style={styles.confirmationTick}>✓</View><Text style={styles.sheetTitle}>Order request received</Text><Text style={styles.checkoutNote}>Royal Furniture will contact you to confirm delivery, stock, and payment.</Text><Pressable style={styles.addButton} onPress={() => setOrderPlaced(false)}><Text style={styles.addButtonText}>Continue shopping</Text></Pressable></View></View></Modal></>; }

function AccountContent({ orders, onBag, cartCount, onCart, onAccount }: { orders: OrderRecord[]; onBag: () => void; cartCount: number; onCart: () => void; onAccount: () => void }) { const [profile, setProfile] = useState({ name: '', email: '', phone: '' }); const [claimed, setClaimed] = useState<string[]>([]); const warrantyFor = (category: string) => category === 'household' ? 'Not covered under the household warranty policy' : category === 'cooltech-mattress' ? 'Cooltech mattress warranty: up to 25 years, terms apply' : category === 'sofas' ? 'Sofa warranty: 5 years on frame and springs' : category === 'bedroom' ? 'Headboard and divan warranty: 5 years on frame' : '1-year warranty or see product terms'; const [registered, setRegistered] = useState(false); return <ScrollView contentContainerStyle={styles.scrollContent}><Header count={cartCount} onCart={onCart} /><View style={styles.accountIntro}><Text style={styles.pageTitle}>Account</Text><Text style={styles.pageSub}>Manage your profile, orders, and Royal Furniture support.</Text></View><View style={styles.accountHero}><View style={styles.accountIcon}><UserRound color={COLORS.red} size={25} /></View><Text style={styles.accountTitle}>{registered ? `Welcome, ${profile.name}` : 'Your Royal account'}</Text><Text style={styles.accountBody}>{registered ? 'Your details are saved for a faster checkout.' : 'Save your details, track orders, and keep your Royal Furniture journey together.'}</Text>{registered ? <Pressable style={styles.accountButton} onPress={onBag}><ShoppingBag color={COLORS.ink} size={17} /><Text style={styles.accountButtonText}>Open my bag</Text></Pressable> : <><Text style={styles.accountFieldLabel}>Full name</Text><TextInput style={styles.accountInput} placeholder="Full name" value={profile.name} onChangeText={(name) => setProfile({ ...profile, name })} /><Text style={styles.accountFieldLabel}>Email address</Text><TextInput style={styles.accountInput} placeholder="Email address" keyboardType="email-address" autoCapitalize="none" value={profile.email} onChangeText={(email) => setProfile({ ...profile, email })} /><Text style={styles.accountFieldLabel}>Mobile number</Text><TextInput style={styles.accountInput} placeholder="Mobile number" keyboardType="phone-pad" value={profile.phone} onChangeText={(phone) => setProfile({ ...profile, phone })} /><Pressable style={styles.addButton} onPress={() => profile.name.trim() && profile.email.includes('@') && profile.phone.length >= 7 && setRegistered(true)}><Text style={styles.addButtonText}>Create account</Text></Pressable><Text style={styles.accountNote}>Prototype profile only. No password or payment details are stored.</Text></>}</View><View style={styles.orderSection}><View style={styles.orderSectionHeader}><Text style={styles.policyTitle}>Order history</Text><Text style={styles.savedSectionCount}>{orders.length}</Text></View>{orders.length === 0 ? <Text style={styles.orderEmpty}>Your completed purchases will appear here with delivery and warranty information.</Text> : orders.map((order) => <View style={styles.orderCard} key={order.id}><View style={styles.orderCardTop}><Text style={styles.orderId}>{order.id}</Text><Text style={styles.orderStatus}>{order.status}</Text></View><Text style={styles.orderMeta}>Purchased {order.purchasedAt} · Expected {order.deliveryDate}</Text><Text style={styles.orderItems}>{order.items.map((item) => item.name).join(' · ')}</Text>{order.items.map((item) => <View style={styles.warrantyRow} key={item.name}><View style={{ flex: 1 }}><Text style={styles.policyRowTitle}>{item.name}</Text><Text style={styles.policyRowBody}>{warrantyFor(item.category)}</Text></View>{item.category !== 'household' && <Pressable style={styles.claimButton} onPress={() => setClaimed((items) => items.includes(order.id + item.name) ? items : [...items, order.id + item.name])}><Text style={styles.claimButtonText}>{claimed.includes(order.id + item.name) ? 'Requested' : 'Claim warranty'}</Text></Pressable>}</View>)}</View>)}</View><ShoppingSupport /></ScrollView>; }

/**
 * Shopping support content.
 *
 * Every answer below is taken from a page published on royalfurniture.ae (Help
 * Center, Terms & Conditions, Return Policy, Warranty, Cooltech warranty,
 * Click & Collect, Store Locator, Contact Us and the product pages), checked on
 * 17 October 2026. Nothing is invented: where the site publishes two different
 * versions of a fact the row carries a `conflict` flag with both versions, and
 * where the site publishes nothing the row carries a `pending` flag with a
 * REPLACE_ME placeholder for the site owner and a note on what is missing.
 */
type SupportFlag = { kind: 'conflict' | 'pending'; label: string; detail: string; replace?: string };
type SupportRow = { q: string; a: string; points?: readonly string[]; note?: string; flag?: SupportFlag };
type SupportSection = { id: string; title: string; lead: string; icon: typeof Truck; rows: readonly SupportRow[]; stores?: boolean };

const SUPPORT_CHECKED = 'Checked against royalfurniture.ae on 17 October 2026';

const supportSections: readonly SupportSection[] = [
  {
    id: 'delivery',
    title: 'Delivery & charges',
    lead: 'Free delivery and installation on furniture orders of AED 500 or more. Below that, home delivery costs AED 50.',
    icon: Truck,
    rows: [
      {
        q: 'How much does delivery cost?',
        a: 'Free on furniture orders of AED 500 or more (VAT inclusive), and assembly is free on all furniture. Orders below AED 500 pay AED 50 for home delivery.',
        points: [
          'Western regions of Abu Dhabi: an additional AED 600 applies.',
          'Staircase delivery is free up to the 5th floor and AED 200 for floors 6 to 15.',
          'Above the 15th floor the delivery reaches the ground floor only. You arrange the rest, and any damage during that move is not covered and voids the warranty.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The delivery policy in the terms and the product pages both say free delivery and installation above AED 500 (VAT inclusive). A second delivery section further down the same terms page says free delivery and installation above AED 1,000 (VAT inclusive). Confirm which threshold applies before publishing a single number.',
          replace: 'REPLACE_ME (free delivery threshold: AED 500 or AED 1,000)',
        },
      },
      {
        q: 'When will my order arrive?',
        a: 'Every product page shows its own estimated delivery date, for example "Delivery on Oct 28, 2026", and you can update it for your area.',
        points: [
          'The date is confirmed with you after the order is placed.',
          'Full payment is required 3 business days before the agreed delivery date. If it is late, the delivery moves to the next available slot.',
        ],
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'There is no standard lead time on the website. The terms ask customers to WhatsApp +971 58 880 0318 or email webstore@royalgroup.ae for the lead time on made-to-order and imported in-stock items, so those timeframes are not documented anywhere public.',
          replace: 'REPLACE_ME (typical lead time for made-to-order items, and for imported in-stock items)',
        },
      },
      {
        q: 'What do I need to do on delivery day?',
        a: 'Be there, and check the item before the delivery team leaves.',
        points: [
          'You or your representative must be present during delivery.',
          'Prepare the delivery area in advance to avoid delays.',
          'Inspect fragile items such as marble and glass at the time of delivery and report any visible defect within 24 hours.',
          'Report any damage in transit immediately, with photos or a report as evidence.',
          'Check that the piece fits through your lifts, corridors and staircases soon after ordering, and tell Royal Furniture straight away so the delivery is not delayed or charged extra.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The customer responsibility section of the terms gives 48 hours from placing the order to confirm the piece fits through all access points. The delivery section of the same page gives 24 hours. Confirm which window applies.',
          replace: 'REPLACE_ME (access check window: 24 or 48 hours after ordering)',
        },
      },
      {
        q: 'What happens if a delivery is missed?',
        a: 'After two missed deliveries, every rescheduling costs AED 100 + VAT per attempt.',
        points: ['A redelivery charge also applies to items that need redelivering because you asked for it.'],
      },
      {
        q: 'Can you hold my order if I am not ready?',
        a: 'Yes. Fully paid items are stored free for 30 days.',
        points: [
          'After 30 days a monthly storage fee applies.',
          'Storage for partially paid items beyond the agreed delivery date cannot be guaranteed.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The storage policy in the terms says a 5% monthly storage fee applies beyond 30 days. The delivery section of the same page says a 10% monthly storage fee applies beyond 30 days. Confirm the rate.',
          replace: 'REPLACE_ME (monthly storage fee after 30 days: 5% or 10%)',
        },
      },
      {
        q: 'Where do you deliver?',
        a: 'Across the UAE. No products or services are provided to OFAC sanction countries.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The website does not say whether delivery outside the UAE is offered, or what it would cost. Emirate-level coverage and any excluded areas are not listed either.',
          replace: 'REPLACE_ME (delivery coverage: emirates served, excluded areas, and whether international delivery is offered)',
        },
      },
    ],
  },
  {
    id: 'collect',
    title: 'Click & Collect',
    lead: 'Order online and collect from any Royal Furniture showroom. It is always free, whatever the order value.',
    icon: Store,
    rows: [
      {
        q: 'How does it work?',
        a: 'Four steps, and no delivery charge at any order value.',
        points: [
          'Choose Click & Collect at checkout.',
          'Choose the showroom you want.',
          'Wait for the ready-for-collection notification, sent by SMS and email.',
          'Visit the showroom with your order confirmation.',
        ],
      },
      {
        q: 'Which showroom gets my order?',
        a: 'The showroom you choose at checkout.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The Click & Collect page lists the questions "Which store will my order go to?", "Can I choose any store?" and "Can I change my chosen store after I placed an order?" but does not publish the answers.',
          replace: 'REPLACE_ME (whether the showroom can be changed after ordering, and how)',
        },
      },
      {
        q: 'When can I collect?',
        a: 'During showroom opening hours, 7 days a week. Showrooms open at 10:00.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'Only the opening time (10:00) is published for each showroom. Closing times, Friday and public-holiday hours are not listed, so the 7-day claim cannot be verified from the site.',
          replace: 'REPLACE_ME (showroom closing time and any day-specific hours, per showroom)',
        },
      },
      {
        q: 'Can I track a collect order?',
        a: 'Yes. Preparation, dispatch and delivery milestones are tracked in real time, and you get an SMS and an email when the order is ready.',
      },
      {
        q: 'What do I bring, and can someone else collect?',
        a: 'Bring your order confirmation. The rest is not published.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The Click & Collect page lists "What do I need to bring to collect my order?", "Can someone else collect on my behalf?", "Where do I pick up my order in store?", "How long will you hold my order?" and "How can I pay for my Click & Collect order?" without publishing the answers.',
          replace: 'REPLACE_ME (what to bring, whether a third party can collect with ID, the in-store pickup point, how long orders are held, and payment options for collect orders)',
        },
      },
    ],
  },
  {
    id: 'returns',
    title: 'Returns, exchanges & cancellations',
    lead: 'Most furniture cannot be returned once it is delivered. Imported furniture and accessories have 7 days, and Cooltech mattresses a 90-day exchange.',
    icon: RotateCcw,
    rows: [
      {
        q: 'Can I return furniture?',
        a: 'No. Furniture cannot be returned or exchanged after delivery.',
        points: [
          'Exception: imported furniture can be returned or exchanged within 7 days of delivery.',
          'Damaged or defective items are exchanged or refunded only when repair is not possible, at the discretion of Royal Furniture.',
          'No exchange or refund is accepted for customer fault, a change of mind, or disliking the product after delivery.',
          'Returns can be refused if the item is found misused or damaged after delivery.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The terms say furniture cannot be returned or exchanged after delivery, and in the next bullet that imported furniture can be returned or exchanged within 7 days. The Cooltech warranty page adds that returns and exchanges are not accepted during a sale or promotion, which would override the 7-day windows for discounted items. Confirm the order of these rules.',
          replace: 'REPLACE_ME (which rule wins: no returns on furniture, 7 days on imported furniture, or no returns during promotions)',
        },
      },
      {
        q: 'Can I return accessories?',
        a: 'Yes, within 7 days, if they are unused and undamaged and come back with the original receipt and packaging.',
        points: ['Return delivery charges apply.'],
      },
      {
        q: 'Can I exchange a mattress?',
        a: 'Yes, once, within 90 days, for a different model in the same size you ordered.',
        points: [
          'Standard sizes only: 120x200, 160x200, 180x200 and 200x200.',
          'A delivery charge of AED 100 + VAT applies.',
          'The mattress must be clean and in good condition. A stained or damaged mattress is not eligible.',
          'Changing the mattress size after order confirmation costs 30% of the original order value, deducted from the refund or adjusted against the new order.',
          'Exchanging for a different size is not accommodated.',
        ],
      },
      {
        q: 'What can never be returned?',
        a: 'These items are final.',
        points: [
          'Made-to-order products: they cannot be cancelled, returned or exchanged.',
          'Third-party deliveries.',
          '"As-Is" products, showroom pieces, open mattresses and unwrapped linen.',
          'Products bought during a sale or promotion, per the Cooltech policy page.',
        ],
      },
      {
        q: 'Can I cancel my order?',
        a: 'Yes, up to 3 days before delivery, and you receive a credit note. Made-to-order items cannot be cancelled.',
        points: [
          'Cancelling within 24 hours of the scheduled delivery time costs 10% of the order, inclusive of VAT.',
          'Store credits are valid for 12 months.',
          'A non-refundable deposit is required for made-to-order items.',
        ],
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The amount or percentage of the non-refundable deposit on made-to-order items is not stated anywhere on the website, and neither is how long a credit note takes to be issued.',
          replace: 'REPLACE_ME (made-to-order deposit amount or percentage, and credit note issue time)',
        },
      },
      {
        q: 'How long does a refund take?',
        a: 'Card refunds take about 2 to 3 weeks to reach your account, subject to bank processing times.',
        points: [
          'A 3% service charge applies to refunds made to credit and debit cards.',
          'Delivery charges are non-refundable. If delivery was attempted or completed, the delivery cost is deducted from any eligible refund.',
          'Cancellations are settled as a credit note, valid for 12 months.',
        ],
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'Refund timing and fees are published for card payments only. Timing for any other method, and how a pricing-error refund is processed, is not documented beyond "through the original payment method".',
          replace: 'REPLACE_ME (refund timing for non-card payments)',
        },
      },
      {
        q: 'What else should I know about returns?',
        a: 'Packaging and evidence matter.',
        points: [
          'Return packaging requirements must be followed, including the original packaging and labelling.',
          'Any mattress sent back for return, exchange or a warranty claim must be clean, hygienic and free of stains, odours and damage.',
          'Product colours, textures and finishes may vary slightly because of screen settings or production batches, which is not a defect.',
          'A temporary scent from manufacturing and packaging is normal and fades on its own.',
        ],
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The Return Policy page lists these question titles with no published answers: Purchases, Customer service, Delivery, Mattress exchange policy, Cancellation of off-the-shelf furniture, Cancellation by seller, Special offers promotions and guarantees, and Change of address or change of heart. Only the titles render on the page.',
          replace: 'REPLACE_ME (the answer text behind each Return Policy accordion, especially off-the-shelf cancellation and cancellation by seller)',
        },
      },
    ],
  },
  {
    id: 'warranty',
    title: 'Warranty',
    lead: '5 years on the frame and springs of UAE-made sofas and headboards, 1 year on imported items, and up to 25 years on Cooltech spring mattresses.',
    icon: ShieldCheck,
    rows: [
      {
        q: 'What is covered, and for how long?',
        a: 'Coverage depends on the type of product.',
        points: [
          'Sofas made in the UAE: 5 years on frame and spring, 6 months on foam and fabric, 6 months on mechanisms and electricals.',
          'Headboards and divan bases: 5 years on frame, 6 months on foam and fabric, 6 months on mechanisms and electricals.',
          'Imported and metal furniture: 1 year on general repairs, 6 months on mechanical and electrical components.',
          'Cooltech spring mattresses: 25 years from the date of purchase, for the original purchaser. Cooltech foam and medical mattresses: 5 years.',
          'Household items: no warranty. Report a defective item within 7 days.',
        ],
        note: 'The 5-year cover applies to sofas and headboard or divan bases bought on or after 1 January 2023. The warranty is for domestic use only, and it applies to the original purchaser.',
      },
      {
        q: 'Is the fabric covered?',
        a: 'The two published pages disagree.',
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The warranty page says fabric, including leather, PU and PVC, is not covered by the warranty. The terms say fabric, leather, PU and PVC quality is covered where the issue is due to a manufacturing defect, while wear and tear, staining, misuse, liquid damage and damage from use are not. Confirm which wording is current.',
          replace: 'REPLACE_ME (fabric cover: excluded entirely, or covered for manufacturing defects only)',
        },
      },
      {
        q: 'What voids the warranty?',
        a: 'Any of these will void it.',
        points: [
          'Improper use, excessive soiling or staining.',
          'Water, alcohol or other liquid damage, and improper cleaning methods.',
          'Incorrect assembly or installation by third-party suppliers, or alteration, misuse or repair by unauthorised people.',
          'Placing the item outdoors or in a humid environment.',
          'Moving the product from the original delivery location.',
          'Mattresses: an incorrect or old foundation, insufficient support, a bent or misshapen chassis, or failing to flip and rotate it regularly.',
          'Normal sagging, softening or compression of sofas from regular use is not treated as a manufacturing defect.',
        ],
      },
      {
        q: 'What happens when I make a claim?',
        a: 'The product is examined, then repaired or replaced.',
        points: [
          'Items are repaired or replaced in line with UAE Customer Protection Act No. 24 of 2006.',
          'If the same model is no longer manufactured, an appropriate replacement is provided at the discretion of Royal Furniture.',
          'A repaired or replaced mattress does not renew or extend the warranty.',
          'For mattresses, compression or sagging claims are accepted only above the published depth threshold.',
          'A size variation of +/- 2 cm on mattresses and toppers is within acceptable manufacturing tolerance.',
          'Warranty claims do not cover damages from improper storage or incorrect installation, such as a size mismatch between the mattress and the bed base.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Same rule, two units',
          detail: 'The Cooltech warranty page covers body impressions greater than 2 inches. The terms accept compression or sagging claims only where the indentation exceeds 5 cm. Two inches is about 5.08 cm, so these look like the same rule written in different units, but they are not identical. Confirm the threshold and publish it once.',
          replace: 'REPLACE_ME (single sagging threshold, in cm or inches)',
        },
      },
      {
        q: 'Cooltech mattress: what counts as a defect?',
        a: 'Covered: body impressions deeper than 2 inches, coils or wires that are loose, broken or protruding through the fabric, and bunching or shifting of the raw materials.',
        points: [
          'Not covered: impressions up to 2 inches, cover fabrics, handles and corner guards, and discolouration from washing or normal wear.',
          'Not covered: odours or smells from hair, body oil or pets, and damage from delivery, handling, set-up or assembly by you or an outside contractor.',
          'Not covered: comfort preference, bed height, abuse, misuse or neglect, and normal softening of the pressure-relieving foams.',
          'The warranty covers the components beneath the outer covering, not the covering and stitching.',
          'The mattress must be clean and tidy at the time of a claim.',
        ],
      },
      {
        q: 'How do I look after a mattress so the warranty stays valid?',
        a: 'Rotate it every 2 weeks for the first 3 months, then every 2 months. This matters most in the first 5 years, and pillow-top mattresses may need rotating more often.',
        points: [
          'Air a new mattress in a well-ventilated room, use a supportive bed frame, and consider replacing an old foundation.',
          'Keep it dry and clean with a mattress pad, and vacuum it regularly.',
          'Transport it upright on its side, and never bend it: bending can damage the innerspring unit.',
          'Do not carry it by the handles, jump on it, use dry-cleaning products, or place it near an open flame, fire or space heater.',
        ],
      },
      {
        q: 'How do I start a warranty claim?',
        a: 'Contact customer care with your order number: 800 76925, or customercare@royalgroup.ae.',
        points: [
          'For household items, raise the request within 7 days of finding the defect.',
          'In this app, Order history has a Claim warranty button on each delivered item. It records the request on your device only and does not send it anywhere.',
        ],
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'No claim procedure is published: which channel to use, what proof is needed (receipt, photos, purchase date), whether an inspection visit happens, and how long a claim takes. The Cooltech maker is named as Royal Palace Foam Factory LLC, but there is no separate claim contact.',
          replace: 'REPLACE_ME (warranty claim steps, required proof, and target response time)',
        },
      },
    ],
  },
  {
    id: 'payment',
    title: 'Payment & prices',
    lead: 'Visa and MasterCard in AED online, plus Tamara split in 4 and a flexi payment of 20% upfront on product pages.',
    icon: Wallet,
    rows: [
      {
        q: 'Which payment methods can I use?',
        a: 'Online, the terms accept Visa and MasterCard credit and debit cards, charged in AED.',
        points: [
          'Product pages also show Tamara: "Split in 4 of 750" on a AED 3,000 sofa.',
          'Flexi payment is offered on many items: pay 20% upfront to confirm the booking, and the remaining amount before delivery.',
          'Coupon codes do not apply to special deal items.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The terms list Visa and MasterCard only, while every product page advertises Tamara and flexi payment. This app also lists cash on delivery and Tabby in its own data, and neither appears anywhere on the website. Confirm the full list of methods a shopper can actually use.',
          replace: 'REPLACE_ME (confirmed payment methods, including whether cash on delivery and Tabby are offered)',
        },
      },
      {
        q: 'Are my card details safe?',
        a: 'Card details are not stored, sold, shared, rented or leased to any third party.',
        points: [
          'Personally identifiable customer information is treated the same way.',
          'Customer information is protected and kept confidential.',
          'A login and password are for your personal use only. Tell Royal Furniture immediately if they are compromised.',
        ],
      },
      {
        q: 'Do prices include VAT?',
        a: 'The website does not say.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'Delivery thresholds are quoted "VAT inclusive" and some charges are quoted "+ VAT", but no page states whether the product prices shown include VAT. This app assumes prices include VAT at 5%, which is not sourced from the website.',
          replace: 'REPLACE_ME (whether displayed prices include VAT, and at what rate)',
        },
      },
      {
        q: 'What if a price was wrong?',
        a: 'Royal Furniture can correct pricing errors and cancel or amend the order, even after it is confirmed or paid.',
        points: [
          'Errors can come from website maintenance, technical issues, system errors or data synchronisation.',
          'If you already paid for an affected order, the amount is refunded through the original payment method.',
          'All products are subject to availability, and quantity limits can be imposed. An order can be rejected in whole or in part, and products can be discontinued without notice.',
        ],
      },
      {
        q: 'Is a deposit required?',
        a: 'Yes, on made-to-order items, and it is non-refundable.',
        note: 'Made-to-order products are made on request, and the displayed colours are subject to availability. Ask on WhatsApp +971 58 880 0318 for colour options and the delivery lead time.',
      },
    ],
  },
  {
    id: 'product',
    title: 'Product information',
    lead: 'Each product page shows the price, sizes, colours, fabrics, stock and an estimated delivery date. Photos are illustrative and colours can vary.',
    icon: Receipt,
    rows: [
      {
        q: 'What does a product page tell me?',
        a: 'The price with any discount, the size options, the colour and fabric choices, the stock status, and an estimated delivery date.',
        points: [
          'Size, colour and fabric are chosen on the product page. Made-to-order pieces advertise "Customize Yours - Any Color, Any Size!".',
          'Stock is shown per item, for example "In stock (max 5)", and the quantity per order is capped.',
          'The same page confirms free assembly and free delivery on furniture orders of AED 500 or more.',
          'A "Try in store!" link points the piece to the showrooms.',
        ],
      },
      {
        q: 'Will the colour match my screen?',
        a: 'Not exactly. Product colours, textures and finishes may vary slightly because of screen settings or production batches.',
        points: [
          'Product photos use props for illustrative purposes.',
          'Product colour may vary slightly because of photographic lighting or your screen settings.',
          'This is not treated as a defect, so it is not a ground for return.',
        ],
      },
      {
        q: 'How many can I order at once?',
        a: 'Quantity limits can be applied to any order, and the product page shows the maximum, for example "max 5".',
        points: [
          'All products are subject to availability.',
          'Royal Furniture can reject all or part of an order and can discontinue products without notice, even after an order has been placed.',
          'An order is not accepted until Royal Furniture accepts it, and more information can be requested first.',
        ],
      },
      {
        q: 'Where are the materials, dimensions and specs?',
        a: 'They are not published.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'Product pages carry a General Information block with Material, Dimensions, Specs, Warranty and Assembly headings, but on the pages checked those headings have no values behind them (for example Serafina Corner Sofa and Kaspar 6 Door Wardrobe). There is no separate specification page or downloadable spec sheet.',
          replace: 'REPLACE_ME (material, dimensions and specification values per product, or a link to a spec sheet)',
        },
      },
      {
        q: 'Can I get an alert when an item is back in stock?',
        a: 'Not published.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'Stock status is shown per item, but no page tells customers whether a restock alert exists or how to sign up for one. The store backend exposes a stock notification endpoint, which is not documented for shoppers.',
          replace: 'REPLACE_ME (whether restock alerts are offered, and how a customer signs up)',
        },
      },
    ],
  },
  {
    id: 'tracking',
    title: 'Order tracking',
    lead: 'Your order status and expected delivery date are in Account, under Order history. Click & Collect orders track preparation, dispatch and delivery.',
    icon: Navigation,
    rows: [
      {
        q: 'How do I track my order?',
        a: 'In this app, open Account and read Order history: each order shows its status, the purchase date, the expected delivery date, and the warranty that applies to every item.',
        points: [
          'The website header also has a Track Order link.',
          'Click & Collect orders show preparation, dispatch and delivery milestones in real time, and send an SMS and email when the order is ready.',
        ],
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The Track Order link in the website header has no public page behind it: royalfurniture.ae/ae/en/track-order/ returns 404, and no page documents what the tracker asks for (order number, email, phone) or what it shows.',
          replace: 'REPLACE_ME (Track Order destination and the details a customer needs to enter)',
        },
      },
      {
        q: 'What do the order statuses mean?',
        a: 'Request received: the order is with Royal Furniture and not yet confirmed. Confirmed: stock, delivery and payment are agreed. Delivered: complete. Cancelled: closed without delivery.',
        points: ['Orders placed in this app are requests. Royal Furniture contacts you to confirm delivery, stock and payment before fulfilment.'],
      },
      {
        q: 'How do I find my delivery date?',
        a: 'The product page shows an estimated delivery date that you can update for your area, and the date is confirmed with you after ordering.',
        points: ['Full payment is needed 3 business days before that date, or the delivery is rescheduled to the next available slot.'],
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & privacy',
    lead: 'Sign in or sign up at the top of every page on the website. In this app your profile stays on your device.',
    icon: UserRound,
    rows: [
      {
        q: 'What does this app store about me?',
        a: 'Your name, email address and mobile number, saved on your device only.',
        points: [
          'No password and no payment details are stored.',
          'Orders and warranty requests made in the app are recorded on the device, with no server call.',
        ],
      },
      {
        q: 'Do I need an account to order?',
        a: 'The website does not say.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'Every page shows a "Sign in or sign up" link, but no page states whether an account is required to place an order, or what an account gives you beyond faster checkout.',
          replace: 'REPLACE_ME (whether an account is required to order, and the benefits of having one)',
        },
      },
      {
        q: 'How do I reset my password?',
        a: 'Not published.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The terms explain that a login and password are personal and that Royal Furniture must be told about a breach, but there is no password reset or account recovery flow documented, and no account page is linked from the help centre.',
          replace: 'REPLACE_ME (password reset steps, and how to close or correct an account)',
        },
      },
      {
        q: 'Is my data shared with anyone?',
        a: 'No. Card details and personally identifiable information are not stored, sold, shared, rented or leased to third parties.',
        points: [
          'The Privacy Policy is published on the website under Help, and explains how personal data is collected, used and protected.',
          'Website policies and terms can change. Customers are notified of changes, as is the payment gateway provider.',
        ],
      },
    ],
  },
  {
    id: 'stores',
    title: 'Showrooms',
    lead: '12 showrooms across Dubai, Abu Dhabi, Al Ain, Sharjah, Ras Al Khaimah and Ajman, all opening at 10:00.',
    icon: MapPin,
    stores: true,
    rows: [
      {
        q: 'What can I do in a showroom?',
        a: 'Try the furniture in person and get free advice from the in-store design consultants.',
        points: [
          'Test comfort and materials across the full catalogue.',
          'Some promotions are available in store only.',
          'Product pages have a "Try in store!" link for the piece you are viewing.',
        ],
      },
      {
        q: 'Where is the head office?',
        a: 'Royal Furniture Group, Ajman Industrial Area, next to Sharjah Power Station, P.O. Box 2327, Ajman, UAE.',
        note: 'Closing times are not published for any showroom, so call the store before travelling.',
      },
    ],
  },
  {
    id: 'contact',
    title: 'Contact us',
    lead: 'Call 800 76925 (800 ROYAL), Monday to Saturday, 8 AM to 7 PM GST.',
    icon: Phone,
    rows: [
      {
        q: 'Which number do I call?',
        a: 'The customer care hotline is 800 76925, also written as 800ROYAL and +971 80 076 925. It is open Monday to Saturday, 8 AM to 7 PM GST.',
        points: ['Product pages have a "Request a call back" link that dials the same number.'],
      },
      {
        q: 'Can I chat instead of calling?',
        a: 'Yes, on WhatsApp. Two different numbers are published.',
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The terms list "Chat with us: 058-8800-318" and use +971 58 880 0318 for custom colours, sizes and lead times, and the floating call button on every page dials +971 58 880 0318. The store locator lists WhatsApp support as +971 55 979 3675, which the contact page calls e-commerce support. Confirm which number shoppers should message.',
          replace: 'REPLACE_ME (the single WhatsApp or chat number for shoppers)',
        },
      },
      {
        q: 'Which email address should I use?',
        a: 'Three addresses are published for three different purposes.',
        points: [
          'customercare@royalgroup.ae: customer service, on the contact page and in the terms.',
          'Customercare@royalfurniture.ae: email support on the store locator, which promises a reply within 24 hours.',
          'webstore@royalgroup.ae: labelled Help Center in the footer, press and global marketing on the contact page, and the address the terms give for custom-made and imported item queries.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The customer care email appears on two different domains: royalgroup.ae on the contact page and in the terms, and royalfurniture.ae on the store locator. Confirm which inbox is monitored before publishing one address.',
          replace: 'REPLACE_ME (the single customer care email address)',
        },
      },
      {
        q: 'How fast is email support?',
        a: 'The store locator says email queries are answered within 24 hours.',
      },
      {
        q: 'I want a custom colour or size. Who do I ask?',
        a: 'WhatsApp +971 58 880 0318, or email webstore@royalgroup.ae.',
        points: [
          'Product pages advertise "Customize Yours - Any Color, Any Size!".',
          'All custom-made products are made on order, and displayed colours are subject to availability.',
          'Use the same channels for delivery lead times and product queries on imported in-stock items.',
        ],
      },
      {
        q: 'Is there a Royal Furniture app?',
        a: 'Yes. The website footer links to Google Play and the App Store.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The footer shows Instagram, Facebook, X and YouTube icons, but every one of them links to "#" with no profile behind it, so no social channel can be given to customers.',
          replace: 'REPLACE_ME (social media profile URLs, or remove the icons)',
        },
      },
    ],
  },
  {
    id: 'gaps',
    title: 'Not covered on the website',
    lead: 'These are real shopper questions the site does not answer. Nothing here has been guessed.',
    icon: FileQuestion,
    rows: [
      {
        q: 'What is still missing?',
        a: 'Every item below is a question a customer would reasonably ask, with no answer published on royalfurniture.ae.',
        points: [
          'Order tracking: the Track Order flow, its destination, and the details it asks for.',
          'Delivery: a standard lead time, made-to-order lead times, coverage outside the UAE, and any excluded areas.',
          'Showrooms: closing times and day-specific or public-holiday hours.',
          'Payment: any method beyond Visa and MasterCard, including cash on delivery and Tabby.',
          'Prices: whether the displayed prices include VAT.',
          'Made-to-order: the deposit amount or percentage.',
          'Returns: the answers behind the Return Policy accordions, including off-the-shelf cancellation and cancellation by seller.',
          'Warranty: the claim procedure, the proof required, and the response time.',
          'Account: password reset, account recovery, and whether an account is needed to order.',
          'Contact: social media profiles.',
        ],
      },
      {
        q: 'Where do I go next if my question is not here?',
        a: 'Call 800 76925 (Monday to Saturday, 8 AM to 7 PM GST) or email customercare@royalgroup.ae with your order number.',
        points: [
          'The Help Center on the website groups the same topics: Cooltech warranty, Warranty, Return Policy, Terms & Conditions, Privacy Policy, Click & Collect, Store Locator and Contact Us.',
          'For custom colours, sizes or lead times, WhatsApp +971 58 880 0318.',
          'For a specific showroom, call that store directly: every showroom number is listed in the Showrooms section.',
        ],
      },
    ],
  },
];

/** One support topic card: the answer first, then the conditions that matter. */
function SupportCard({ section }: { section: SupportSection }) {
  const Icon = section.icon;
  return (
    <View style={styles.supportCard}>
      <View style={styles.supportCardHead}>
        <View style={styles.supportCardIcon}><Icon color={COLORS.red} size={17} /></View>
        <Text style={styles.supportCardTitle}>{section.title}</Text>
      </View>
      <Text style={styles.supportLead}>{section.lead}</Text>
      {section.rows.map((row) => (
        <View key={row.q} style={styles.supportRow}>
          <Text style={styles.supportQuestion}>{row.q}</Text>
          <Text style={styles.supportAnswer}>{row.a}</Text>
          {!!row.points?.length && row.points.map((point) => <Text key={point} style={styles.supportPoint}>{`·  ${point}`}</Text>)}
          {!!row.note && <Text style={styles.supportNote}>{row.note}</Text>}
          {!!row.flag && (
            <View style={[styles.supportFlag, row.flag.kind === 'conflict' ? styles.supportFlagConflict : styles.supportFlagPending]}>
              <View style={styles.supportFlagHead}>
                {row.flag.kind === 'conflict' ? <CircleAlert color="#8A4B08" size={13} /> : <Hourglass color={COLORS.muted} size={13} />}
                <Text style={[styles.supportFlagLabel, row.flag.kind === 'conflict' ? styles.supportFlagLabelConflict : styles.supportFlagLabelPending]}>
                  {row.flag.kind === 'conflict' ? 'CONFLICT' : 'PENDING'} · {row.flag.label}
                </Text>
              </View>
              <Text style={styles.supportFlagDetail}>{row.flag.detail}</Text>
              {!!row.flag.replace && <Text style={styles.supportFlagReplace}>{row.flag.replace}</Text>}
            </View>
          )}
        </View>
      ))}
      {section.stores && royalFurnitureData.stores.map((store) => (
        <View key={store.city + store.addr} style={styles.policyRow}>
          <MapPin color={COLORS.muted} size={15} />
          <View style={styles.policyCopy}>
            <Text style={styles.policyRowTitle}>{store.city}</Text>
            <Text style={styles.policyRowBody}>{store.addr}</Text>
            <Text style={styles.policyRowBody}>{`Open ${store.open} · ${store.tel}`}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Rough reading weight of a topic, so the two desktop columns stay even. */
const sectionWeight = (section: SupportSection) => section.rows.reduce((total, row) => total + row.a.length + (row.points || []).reduce((sum, point) => sum + point.length, 0) + (row.flag ? row.flag.detail.length : 0), 0) + (section.stores ? royalFurnitureData.stores.length * 130 : 0);

/** A dropdown of support topics, ordered the way a shopper meets them. */
type SupportCategory = { id: string; title: string; blurb: string; icon: typeof Truck; topics: readonly string[] };
type SupportGroup = { category: SupportCategory; topics: readonly SupportSection[] };

const supportCategories: readonly SupportCategory[] = [
  { id: 'buying', title: 'Product info & payment', blurb: 'What a product page tells you, colours and stock limits, prices and VAT, cards, Tamara and flexi payment.', icon: Wallet, topics: ['product', 'payment'] },
  { id: 'orders', title: 'Orders & delivery', blurb: 'Delivery charges and timeframes, what to do on delivery day, Click & Collect, and tracking an order.', icon: Truck, topics: ['delivery', 'collect', 'tracking'] },
  { id: 'aftercare', title: 'Returns & warranty', blurb: 'What can be returned or exchanged, cancellations and refunds, and the warranty on each product type.', icon: RotateCcw, topics: ['returns', 'warranty'] },
  { id: 'account', title: 'Account & privacy', blurb: 'What this app stores about you, signing in, passwords, and how your details are treated.', icon: UserRound, topics: ['account'] },
  { id: 'places', title: 'Stores & contact', blurb: 'The 12 showrooms and their numbers, who to call, WhatsApp, email and opening hours.', icon: MapPin, topics: ['stores', 'contact'] },
  { id: 'gaps', title: 'Not covered on the website', blurb: 'The questions the site does not answer yet, each marked pending, and where to go next.', icon: FileQuestion, topics: ['gaps'] },
];

const supportSectionById = new Map(supportSections.map((section) => [section.id, section]));
const supportGroups: readonly SupportGroup[] = supportCategories.map((category) => ({
  category,
  topics: category.topics.flatMap((id) => { const found = supportSectionById.get(id); return found ? [found] : []; }),
}));

/** Rough reading weight of a whole dropdown, so the desktop columns stay even. */
const groupWeight = (group: SupportGroup) => group.topics.reduce((total, section) => total + sectionWeight(section), 0);

/** Deal items into two columns, shortest column first, keeping page order. */
function balanceColumns<T>(items: readonly T[], weightOf: (item: T) => number): readonly (readonly T[])[] {
  const columns: T[][] = [[], []];
  const loads = [0, 0];
  for (const item of items) {
    const target = loads[0] <= loads[1] ? 0 : 1;
    columns[target].push(item);
    loads[target] += weightOf(item);
  }
  return columns;
}

/**
 * One category dropdown. Same accordion as the product page: the title row is
 * the button, the symbol shows the state, and the topics mount only when open.
 */
function SupportCategoryCard({ group, open, onToggle }: { group: SupportGroup; open: boolean; onToggle: () => void }) {
  const Icon = group.category.icon;
  const count = group.topics.length;
  const topicWord = count === 1 ? 'topic' : 'topics';
  return (
    <View style={styles.supportCategory}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${group.category.title}. ${open ? 'Hide' : 'Show'} ${count} ${topicWord}`}
        aria-expanded={open}
        onPress={onToggle}
        style={styles.supportCategoryTrigger}
      >
        <View style={styles.supportCategoryIcon}><Icon color={COLORS.red} size={17} /></View>
        <View style={styles.supportCategoryCopy}>
          <View style={styles.orderSectionHeader}>
            <Text style={styles.supportCategoryTitle}>{group.category.title}</Text>
            <Text style={styles.savedSectionCount}>{count} {topicWord}</Text>
          </View>
          <Text style={styles.supportCategoryBlurb}>{group.category.blurb}</Text>
        </View>
        <View style={styles.supportChevron}>
          <Text style={styles.supportSymbol}>{open ? '▲' : '▼'}</Text>
        </View>
      </Pressable>
      {open && <View style={styles.supportCategoryBody}>{group.topics.map((section) => <SupportCard key={section.id} section={section} />)}</View>}
    </View>
  );
}

/**
 * The Shopping support area of the Account page: the topics grouped into six
 * category dropdowns, closed until the shopper opens one. Two columns on wide
 * screens, one column on phones.
 */
function ShoppingSupport() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [openCategories, setOpenCategories] = useState<readonly string[]>([]);
  const toggleCategory = (id: string) => setOpenCategories((open) => open.includes(id) ? open.filter((item) => item !== id) : [...open, id]);
  const columns = wide ? balanceColumns(supportGroups, groupWeight) : [supportGroups];
  return (
    <View style={styles.policyCard}>
      <View style={styles.orderSectionHeader}>
        <Text style={styles.policyTitle}>Shopping support</Text>
        <Text style={styles.savedSectionCount}>{supportCategories.length} categories</Text>
      </View>
      <Text style={styles.supportIntro}>
        {`Open a category to read its answers. ${SUPPORT_CHECKED}. Where the site publishes two versions of a fact the row is marked CONFLICT, and where it publishes nothing the row is marked PENDING with what is missing.`}
      </Text>
      <View style={wide ? styles.supportColumns : styles.supportColumnStack}>
        {columns.map((column, index) => (
          <View key={index} style={styles.supportColumn}>
            {column.map((group) => <SupportCategoryCard key={group.category.id} group={group} open={openCategories.includes(group.category.id)} onToggle={() => toggleCategory(group.category.id)} />)}
          </View>
        ))}
      </View>
    </View>
  );
}

const floatingNavStyles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    height: 72,
    borderRadius: 28,
    zIndex: 20,
    elevation: 14,
    shadowColor: '#344054',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
   ...GLASS.floatShadow },
  surface: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.88)',
    backgroundColor: 'rgba(255,255,255,0.58)',
    overflow: 'hidden',
   ...GLASS.nav },
  blur: { ...StyleSheet.absoluteFillObject, borderRadius: 28 },
  highlight: { position: 'absolute', top: 0, left: 30, right: 30, height: 1, backgroundColor: 'rgba(255,255,255,0.9)' },
  item: { flex: 1, minWidth: 0, height: 58, marginHorizontal: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 3 },
  itemActive: { backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' , ...GLASS.chip },
  iconWrap: { minHeight: 22, alignItems: 'center', justifyContent: 'center' },
  glyph: { color: COLORS.muted, fontSize: 21, lineHeight: 22, fontWeight: '600' },
  label: { color: COLORS.muted, fontSize: 9, lineHeight: 12, fontWeight: '600' },
  labelActive: { color: COLORS.red, fontWeight: '800' },
});

function BottomNav({ tab, setTab, count }: { tab: Tab; setTab: (tab: Tab) => void; count: number }) {
  const items: [Tab, string][] = [['home', 'Home'], ['categories', 'Browse'], ['search', 'Search'], ['shop', 'Deals'], ['arrivals', 'New in']];
  return (
    <View style={floatingNavStyles.shadow}>
      <View style={floatingNavStyles.surface}>
        <BlurView pointerEvents="none" intensity={52} tint="light" experimentalBlurMethod="dimezisBlurView" style={floatingNavStyles.blur} />
        <View pointerEvents="none" style={floatingNavStyles.highlight} />
        {items.map(([key, label]) => {
          const selected = tab === key;
          const iconColor = selected ? COLORS.red : COLORS.muted;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              style={[floatingNavStyles.item, selected && floatingNavStyles.itemActive]}
              onPress={() => setTab(key)}
            >
              <View style={floatingNavStyles.iconWrap}>
                {key === 'home' ? <Text style={[floatingNavStyles.glyph, selected && floatingNavStyles.labelActive]}>⌂</Text>
                  : key === 'shop' ? <BadgePercent color={iconColor} size={20} />
                    : key === 'arrivals' ? <Star color={iconColor} size={20} fill={selected ? iconColor : 'transparent'} />
                      : key === 'categories' ? <Text style={[floatingNavStyles.glyph, selected && floatingNavStyles.labelActive]}>▦</Text>
                        : key === 'search' ? <Search color={iconColor} size={20} />
                          : <ShoppingBag color={iconColor} size={20} />}
                {key === 'cart' && count > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{count}</Text></View>}
              </View>
              <Text style={[floatingNavStyles.label, selected && floatingNavStyles.labelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: COLORS.cream , ...GLASS.transparent }, pageTransition: { flex: 1 }, page: { flex: 1, backgroundColor: COLORS.cream , ...GLASS.transparent }, flex: { flex: 1 }, scrollContent: { paddingBottom: 100 }, header: { backgroundColor: COLORS.cream, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' , ...GLASS.bar }, logo: { width: 132, height: 36, alignSelf: 'flex-start' }, eyebrow: { color: COLORS.red, fontSize: 10, fontWeight: '800', letterSpacing: 2.2 }, brand: { color: COLORS.navy, fontSize: 17, fontWeight: '700', marginTop: 3 }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, headerAccount: { width: 38, height: 38, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' , ...GLASS.chip }, headerBadge: { position: 'absolute', right: -5, top: -5, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' }, headerBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' }, headerBag: { position: 'relative', width: 38, height: 38, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' , ...GLASS.chip }, promo: { marginHorizontal: 16, borderRadius: 22, overflow: 'hidden', backgroundColor: '#D8BFA5', minHeight: 300, flexDirection: 'row' }, promoCopy: { padding: 23, width: '62%', zIndex: 2 }, promoKicker: { color: COLORS.red, fontWeight: '800', fontSize: 9, letterSpacing: 1.5 }, promoTitle: { color: COLORS.ink, fontSize: 30, lineHeight: 33, fontWeight: '800', marginTop: 14 }, promoBody: { color: '#685C51', fontSize: 12, lineHeight: 18, marginTop: 11 }, darkButton: { backgroundColor: COLORS.ink, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 18 , ...GLASS.buttonPrimary }, darkButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' }, promoShape: { flex: 1, position: 'relative' }, shapeCircle: { width: 170, height: 170, borderRadius: 85, backgroundColor: '#E7D9C8', position: 'absolute', right: -42, top: 35 }, shapeSofa: { position: 'absolute', bottom: 55, right: 5, width: 130, height: 85 }, sofaBack: { backgroundColor: '#8B6F5D', height: 39, borderRadius: 15, width: 112, marginLeft: 9 }, sofaSeat: { backgroundColor: '#A88770', height: 28, borderRadius: 8, width: 130, marginTop: -2 }, sofaArm: { backgroundColor: '#765B4E', height: 55, width: 16, borderRadius: 9, position: 'absolute', left: 0, top: 23 }, heroCarousel: { marginHorizontal: 16, borderRadius: 22, overflow: 'hidden', backgroundColor: COLORS.ink , ...GLASS.hero }, heroTrack: { alignItems: 'stretch' }, heroSlide: { aspectRatio: 1 }, heroSlideImage: { width: '100%', height: '100%' }, heroDots: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: '#05000099' }, heroDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ffffff88' }, heroDotActive: { width: 18, backgroundColor: '#fff' }, accountIntro: { paddingHorizontal: 20, paddingTop: 7, paddingBottom: 12 }, accountFieldLabel: { color: COLORS.ink, fontSize: 11, fontWeight: '800', marginTop: 11, marginBottom: 4 }, accountHero: { marginHorizontal: 20, padding: 18, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line , ...GLASS.panelStrong }, accountIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FDE8E9', alignItems: 'center', justifyContent: 'center' , ...GLASS.chip }, accountTitle: { color: COLORS.ink, fontSize: 22, fontWeight: '800', marginTop: 13 }, accountBody: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }, accountInput: { height: 44, marginTop: 0, paddingHorizontal: 12, borderRadius: 10, backgroundColor: COLORS.cream, borderWidth: 1, borderColor: COLORS.line, color: COLORS.ink, fontSize: 13 , ...asTextStyle(GLASS.input) }, accountButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 15, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 20, backgroundColor: '#FDE8E9' , ...GLASS.chip }, accountButtonText: { color: COLORS.ink, fontSize: 12, fontWeight: '800' }, accountNote: { color: COLORS.muted, fontSize: 10, lineHeight: 14, marginTop: 10 }, orderSection: { margin: 20, padding: 16, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line , ...GLASS.panelStrong }, orderSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 }, orderEmpty: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, orderCard: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.line }, orderCardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, orderId: { color: COLORS.ink, fontSize: 12, fontWeight: '800' }, orderStatus: { color: '#127A44', fontSize: 10, fontWeight: '800', flexShrink: 1, textAlign: 'right' }, orderMeta: { color: COLORS.muted, fontSize: 10, marginTop: 5 }, orderItems: { color: COLORS.ink, fontSize: 11, lineHeight: 16, marginTop: 6 }, warrantyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: COLORS.line }, claimButton: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, backgroundColor: '#FDE8E9' , ...GLASS.chip }, claimButtonText: { color: COLORS.red, fontSize: 9, fontWeight: '800' }, policyCard: { margin: 20, padding: 16, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line , ...GLASS.panelStrong }, policyTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800', marginBottom: 10 }, policyRow: { flexDirection: 'row', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: COLORS.line }, policyCopy: { flex: 1, minWidth: 0 }, policyRowTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '800' }, policyRowBody: { color: COLORS.muted, fontSize: 10, lineHeight: 14, marginTop: 3 }, officialHero: { marginHorizontal: 16, height: 286, borderRadius: 22, overflow: 'hidden', backgroundColor: COLORS.ink , ...GLASS.hero }, officialHeroImage: { width: '100%', height: '100%' }, paymentStrip: { marginHorizontal: 20, marginTop: 14, height: 64, borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' , ...GLASS.hero }, paymentStripImage: { width: '100%', height: '100%' }, dealTiles: { marginHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }, dealTile: { width: '48.5%', height: 126, borderRadius: 15, overflow: 'hidden', backgroundColor: COLORS.line , ...GLASS.hero }, dealTileImage: { width: '100%', height: '100%' }, dealTileShade: { ...StyleSheet.absoluteFillObject, backgroundColor: '#05000033' }, dealTileLabel: { position: 'absolute', left: 11, bottom: 10, color: '#fff', fontSize: 12, fontWeight: '800' }, homeHero: { marginHorizontal: 16, height: 352, borderRadius: 24, overflow: 'hidden', backgroundColor: COLORS.ink }, homeHeroImage: { ...StyleSheet.absoluteFillObject }, homeHeroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: '#05000088' }, homeHeroContent: { flex: 1, justifyContent: 'flex-end', padding: 22 }, homeHeroKicker: { color: '#F5D9B5', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }, homeHeroTitle: { color: '#fff', fontSize: 35, lineHeight: 38, fontWeight: '900', marginTop: 9 }, homeHeroBody: { color: '#E6E8E8', fontSize: 13, lineHeight: 19, marginTop: 8, maxWidth: 245 }, heroButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 15, paddingVertical: 11, marginTop: 17 , ...GLASS.buttonGhost }, heroButtonText: { color: COLORS.ink, fontSize: 12, fontWeight: '800' }, quickActions: { marginHorizontal: 20, marginTop: 15, paddingVertical: 13, paddingHorizontal: 7, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, flexDirection: 'row', justifyContent: 'space-between' }, quickAction: { flex: 1, alignItems: 'center', gap: 5 }, quickActionText: { color: COLORS.ink, fontSize: 10, lineHeight: 13, fontWeight: '800', textAlign: 'center' }, dealsStrip: { marginHorizontal: 20, marginTop: 20, height: 72, borderRadius: 16, overflow: 'hidden', backgroundColor: COLORS.red , ...GLASS.hero }, dealsStripImage: { width: '100%', height: '100%' }, editorial: { marginHorizontal: 20, marginTop: 26, height: 220, borderRadius: 20, overflow: 'hidden', backgroundColor: COLORS.ink , ...GLASS.hero }, collectionStories: { marginTop: 24, gap: 12 }, storyCard: { marginHorizontal: 20, height: 334, alignSelf: 'stretch', borderRadius: 20, overflow: 'hidden', backgroundColor: '#EDE7DF' , ...GLASS.hero }, storyImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }, storyShade: { ...StyleSheet.absoluteFillObject, backgroundColor: '#05000066' }, storyCopy: { flex: 1, justifyContent: 'flex-end', padding: 18 }, storyKicker: { color: '#F5D9B5', fontSize: 9, letterSpacing: 1.4, fontWeight: '800' }, storyTitle: { color: '#fff', fontSize: 23, lineHeight: 26, fontWeight: '900', marginTop: 6 }, storyLink: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 9 }, officialFeature: { marginHorizontal: 20, marginTop: 22, height: 334, alignSelf: 'stretch', borderRadius: 20, overflow: 'hidden', backgroundColor: '#EDE7DF' , ...GLASS.hero }, officialFeatureImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }, officialFeatureShade: { ...StyleSheet.absoluteFillObject, backgroundColor: '#05000066' }, officialFeatureCopy: { flex: 1, justifyContent: 'center', padding: 20 }, editorialImage: { ...StyleSheet.absoluteFillObject }, editorialShade: { ...StyleSheet.absoluteFillObject, backgroundColor: '#05000077' }, editorialCopy: { flex: 1, justifyContent: 'center', padding: 20 }, editorialKicker: { color: '#F5D9B5', fontSize: 9, letterSpacing: 1.5, fontWeight: '800' }, editorialTitle: { color: '#fff', fontSize: 24, lineHeight: 27, fontWeight: '900', marginTop: 8 }, editorialButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9, marginTop: 14 , ...GLASS.buttonGhost }, editorialButtonText: { color: COLORS.ink, fontSize: 11, fontWeight: '800' }, trustRow: { marginTop: 17, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: COLORS.line }, trustTitle: { fontSize: 10, fontWeight: '800', color: COLORS.ink, marginTop: 6 }, trustBody: { fontSize: 9, color: COLORS.muted, marginTop: 2 }, trustIcon: { color: COLORS.red, fontSize: 19, fontWeight: '800', height: 20 }, sectionTitle: { paddingHorizontal: 20, paddingTop: 25, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionHeading: { color: COLORS.navy, fontSize: 20, fontWeight: '800' }, sectionAction: { color: COLORS.red, fontSize: 12, fontWeight: '700' }, horizontalPad: { paddingHorizontal: 20, gap: 11 }, roomCard: { width: 126, height: 116, borderRadius: 16, padding: 13, justifyContent: 'space-between', overflow: 'hidden' , ...GLASS.hero }, roomPhoto: { ...StyleSheet.absoluteFillObject }, roomShade: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000042' }, roomLabel: { color: '#fff', fontWeight: '800', fontSize: 13, maxWidth: 90, zIndex: 1 }, roomIcon: { alignSelf: 'flex-end', width: 40, zIndex: 1, height: 40, borderRadius: 20, backgroundColor: '#ffffff77', alignItems: 'center', justifyContent: 'center' , ...GLASS.chip }, dealGlowOne: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: '#B02E25', right: -70, top: -90 }, dealGlowTwo: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 18, borderColor: '#D77742', right: -35, bottom: -55 }, dealLogo: { width: 44, height: 44, borderRadius: 26, backgroundColor: '#C9974D', alignItems: 'center', justifyContent: 'center', zIndex: 1 , ...GLASS.chip }, dealHeroCopy: { flex: 1, marginLeft: 11, zIndex: 1 }, dealStat: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#C9974D', alignItems: 'center', justifyContent: 'center', zIndex: 1, transform: [{ rotate: '8deg' }] , ...GLASS.chip }, dealStatNumber: { color: COLORS.maroon, fontSize: 17, fontWeight: '900' }, dealStatLabel: { color: COLORS.maroon, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, dealHero: { marginHorizontal: 20, marginBottom: 10, padding: 13, minHeight: 104, borderRadius: 20, backgroundColor: COLORS.maroon, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' , ...GLASS.chrome }, categoryPanel: { marginHorizontal: 20, marginBottom: 3, paddingTop: 10, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.line , ...GLASS.panel }, categoryPanelHeader: { paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }, categoryPanelTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800' }, categoryPanelCount: { color: COLORS.red, fontSize: 10, fontWeight: '800' }, dealHeroKicker: { color: '#FBD5D7', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 }, dealHeroTitle: { color: '#fff', fontSize: 18, lineHeight: 22, fontWeight: '800', marginTop: 6 }, dealHeroBody: { color: '#FBD5D7', fontSize: 10, lineHeight: 14, marginTop: 5 }, dealPage: { paddingBottom: 100 }, compactFilterScroll: { height: 40, flexGrow: 0 }, compactFilterRow: { gap: 7, paddingHorizontal: 20, paddingBottom: 5, alignItems: 'center' }, dealGrid: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 18 }, catalogTopbar: { height: 50, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' , ...GLASS.bar }, catalogLogo: { width: 100, height: 27 }, catalogTitleWrap: { flex: 1, marginLeft: 8 }, catalogDealsLink: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 7 }, catalogHeader: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 3 }, catalogHeaderRow: { flexDirection: 'row', alignItems: 'center' }, catalogTitle: { color: COLORS.navy, fontSize: 16, fontWeight: '800' }, catalogMeta: { color: COLORS.muted, fontSize: 9, marginTop: 1 }, catalogLeafScroll: { height: 34, flexGrow: 0 }, catalogLeafBar: { gap: 6, paddingHorizontal: 16, alignItems: 'center' }, catalogFilterScroll: { height: 34, flexGrow: 0 }, catalogFilterBar: { gap: 6, paddingHorizontal: 16, alignItems: 'center' }, catalogFilterHeading: { color: COLORS.muted, fontSize: 10, fontWeight: '800', paddingHorizontal: 16, paddingTop: 7, paddingBottom: 3, textTransform: 'uppercase', letterSpacing: 0.7 }, leafFilter: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 13, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: COLORS.line , ...GLASS.chip }, leafFilterActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink , ...GLASS.chipDarkActive }, leafFilterText: { color: COLORS.muted, fontSize: 10, fontWeight: '700' }, leafFilterTextActive: { color: '#fff' }, catalogSubScroll: { height: 38, flexGrow: 0 }, catalogSubBar: { gap: 6, paddingHorizontal: 16, alignItems: 'center' }, subFilter: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 15, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line , ...GLASS.chip }, subFilterActive: { backgroundColor: '#FDE8E9', borderColor: COLORS.red , ...GLASS.chipActive }, subFilterText: { color: COLORS.muted, fontSize: 10, fontWeight: '700' }, subFilterTextActive: { color: COLORS.red }, catalogCategoryScroll: { height: 43, flexGrow: 0 }, catalogCategoryBar: { gap: 7, paddingHorizontal: 16, paddingBottom: 4, alignItems: 'center' }, catalogSwitch: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 }, catalogSwitchText: { color: COLORS.red, fontSize: 12, fontWeight: '800' }, backToDeals: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 14 }, backToDealsText: { color: COLORS.red, fontSize: 12, fontWeight: '800' }, filterBar: { marginHorizontal: 20, marginTop: 8, marginBottom: 10, padding: 11, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, flexDirection: 'row', alignItems: 'center', gap: 10 , ...GLASS.panel }, filterBarIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FDE8E9', alignItems: 'center', justifyContent: 'center' , ...GLASS.chip }, filterBarText: { color: COLORS.ink, fontSize: 13, fontWeight: '800' }, filterSummary: { color: COLORS.muted, fontSize: 10, marginTop: 2, textTransform: 'capitalize' }, modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }, filterSheet: { backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 18, paddingBottom: 28 , ...GLASS.sheet }, sheetHeader: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetTitle: { color: COLORS.navy, fontSize: 20, fontWeight: '800' }, checkoutNote: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginHorizontal: 20, marginTop: 4 }, checkoutLabel: { color: COLORS.ink, fontSize: 11, fontWeight: '800', marginHorizontal: 20, marginTop: 12, marginBottom: 5 }, checkoutInput: { marginHorizontal: 20, height: 43, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, color: COLORS.ink, fontSize: 13 , ...asTextStyle(GLASS.input) }, checkoutStoreList: { maxHeight: 190, paddingHorizontal: 20 }, checkoutStore: { minHeight: 78, padding: 11, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line , ...GLASS.chip }, checkoutStoreActive: { borderColor: COLORS.red, backgroundColor: '#FDE8E9' , ...GLASS.chipActive }, storeSelected: { color: COLORS.red, fontSize: 10, fontWeight: '800' }, checkoutStoreCity: { color: COLORS.ink, fontSize: 12, fontWeight: '800', marginTop: 5 }, checkoutStoreAddress: { color: COLORS.muted, fontSize: 10, lineHeight: 14, marginTop: 3 }, checkoutStoreHours: { color: '#127A44', fontSize: 10, fontWeight: '700', marginTop: 5 }, checkoutChoices: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 }, checkoutChoice: { flex: 1, padding: 11, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, alignItems: 'center' , ...GLASS.chip }, checkoutChoiceActive: { borderColor: COLORS.red, backgroundColor: '#FDE8E9' , ...GLASS.chipActive }, checkoutChoiceText: { color: COLORS.ink, fontSize: 11, fontWeight: '700' }, checkoutError: { color: COLORS.red, fontSize: 11, marginHorizontal: 20, marginTop: 10 }, checkoutSheet: { maxHeight: '90%', backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 18, paddingBottom: 28 , ...GLASS.sheet }, confirmationCard: { margin: 20, padding: 22, backgroundColor: COLORS.cream, borderRadius: 20, alignItems: 'center' , ...GLASS.panelStrong }, confirmationTick: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#127A44', color: '#fff', fontSize: 30, textAlign: 'center', paddingTop: 7, marginBottom: 12 }, doneButton: { marginHorizontal: 20, marginTop: 18, padding: 14, borderRadius: 12, backgroundColor: COLORS.red, alignItems: 'center' , ...GLASS.accent }, doneButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' }, filterHeading: { color: COLORS.muted, fontSize: 10, fontWeight: '800', paddingHorizontal: 20, paddingTop: 7, paddingBottom: 3, textTransform: 'uppercase', letterSpacing: 0.7 }, arrivalsHero: { marginHorizontal: 20, padding: 15, backgroundColor: '#F3E7D5', borderRadius: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10 , ...GLASS.panelStrong }, arrivalsHeroTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '800' }, arrivalsHeroBody: { color: COLORS.muted, fontSize: 11, marginTop: 3 }, arrivalsDate: { color: COLORS.muted, fontSize: 10 }, banner: { marginHorizontal: 20, marginTop: 28, padding: 20, borderRadius: 18, backgroundColor: COLORS.ink, flexDirection: 'row', alignItems: 'center' , ...GLASS.dark }, bannerKicker: { color: '#C7D4C9', fontSize: 9, letterSpacing: 1.3, fontWeight: '800' }, bannerTitle: { color: '#fff', fontSize: 21, fontWeight: '800', marginTop: 8 }, bannerBody: { color: '#BBC4C2', fontSize: 11, lineHeight: 16, marginTop: 7, paddingRight: 12 }, productCard: { width: 160, marginRight: 0 , ...GLASS.panel, padding: 8, borderRadius: 20 }, gridProductCard: { width: '48%' }, productImage: { height: 164, borderRadius: 15, alignItems: 'center', justifyContent: 'center', position: 'relative' , ...GLASS.hero, ...glassTilt(1.1, -2) }, productPhoto: { width: '100%', height: '100%', borderRadius: 15 }, productInitial: { fontSize: 73, fontWeight: '800', color: '#ffffff66' }, salePill: { position: 'absolute', top: 10, left: 10, backgroundColor: COLORS.red, color: '#fff', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4, fontSize: 9, fontWeight: '800' }, heart: { position: 'absolute', right: 9, top: 9, width: 30, height: 30, borderRadius: 15, backgroundColor: '#ffffffcc', alignItems: 'center', justifyContent: 'center' , ...GLASS.chip }, productCategory: { color: COLORS.red, fontSize: 9, fontWeight: '800', marginTop: 10, textTransform: 'uppercase' }, productName: { color: COLORS.ink, fontSize: 13, lineHeight: 18, minHeight: 36, fontWeight: '700', marginTop: 5 }, productPrice: { color: COLORS.ink, fontSize: 14, fontWeight: '800' }, productWas: { color: COLORS.muted, textDecorationLine: 'line-through', fontSize: 11 }, priceLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 7, marginTop: 7 }, sizeCountBadge: { alignSelf: 'flex-start', color: COLORS.red, fontSize: 9, fontWeight: '800', marginTop: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#FDE8E9', overflow: 'hidden' },
  supportIntro: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 2, marginBottom: 12 },
  supportColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  supportColumnStack: { gap: 0 },
  supportColumn: { flex: 1, minWidth: 0 },
  supportCategory: { marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: COLORS.cream, borderWidth: 1, borderColor: COLORS.line , ...GLASS.panel },
  supportCategoryTrigger: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  supportCategoryIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FDE8E9', alignItems: 'center', justifyContent: 'center' , ...GLASS.chip },
  supportCategoryCopy: { flex: 1, minWidth: 0 },
  supportCategoryTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '800' },
  supportCategoryBlurb: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  supportChevron: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)' , ...GLASS.chip },
  supportSymbol: { color: COLORS.ink, fontSize: 11, lineHeight: 14, fontWeight: '800' },
  supportCategoryBody: { paddingTop: 12 },
  supportCard: { marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line , ...GLASS.panel },
  supportCardHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  supportCardIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FDE8E9', alignItems: 'center', justifyContent: 'center' , ...GLASS.chip },
  supportCardTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '800', flex: 1, minWidth: 0 },
  supportLead: { color: COLORS.navy, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 8 },
  supportRow: { marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.line },
  supportQuestion: { color: COLORS.ink, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  supportAnswer: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  supportPoint: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 5, paddingLeft: 2 },
  supportNote: { color: COLORS.ink, fontSize: 11, lineHeight: 16, marginTop: 7, fontStyle: 'italic' },
  supportFlag: { marginTop: 8, padding: 9, borderRadius: 10, borderWidth: 1 },
  supportFlagConflict: { backgroundColor: '#FFF6E9', borderColor: '#E8C08A' },
  supportFlagPending: { backgroundColor: '#fff', borderColor: COLORS.line },
  supportFlagHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  supportFlagLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  supportFlagLabelConflict: { color: '#8A4B08' },
  supportFlagLabelPending: { color: COLORS.muted },
  supportFlagDetail: { color: COLORS.ink, fontSize: 11, lineHeight: 16, marginTop: 5 },
  supportFlagReplace: { color: COLORS.red, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 5 },
  catalogBadge: { alignSelf: 'flex-start', color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.4, marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: COLORS.ink, overflow: 'hidden' }, searchPage: { paddingHorizontal: 20, paddingTop: 7, paddingBottom: 8 }, searchLabel: { color: COLORS.ink, fontSize: 12, fontWeight: '800', paddingHorizontal: 20, paddingTop: 5, paddingBottom: 3 }, searchChipScroll: { height: 40, flexGrow: 0 }, searchResultsHeader: { paddingHorizontal: 20, paddingVertical: 9 }, shopHead: { paddingHorizontal: 20, paddingTop: 7, paddingBottom: 10 }, pageTitle: { color: COLORS.navy, fontSize: 23, fontWeight: '800' }, pageSub: { color: COLORS.muted, fontSize: 12, lineHeight: 16, marginTop: 6 }, searchBox: { height: 48, backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginTop: 18, borderWidth: 0 , ...GLASS.input }, searchInput: { flex: 1, marginLeft: 9, color: COLORS.ink, fontSize: 13 }, filterRow: { gap: 8, paddingHorizontal: 20, paddingBottom: 14, alignItems: 'center', minHeight: 48 }, filter: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, minHeight: 32, alignItems: 'center', justifyContent: 'center' , ...GLASS.chip }, filterActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy , ...GLASS.accent }, filterText: { color: COLORS.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' }, filterTextActive: { color: '#fff' }, resultsRow: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, resultCount: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },   grid: { paddingHorizontal: 16, paddingBottom: 100 },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
 detail: { paddingBottom: 35 }, back: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 5 }, backText: { color: COLORS.ink, fontSize: 12, fontWeight: '700' }, detailImage: { marginHorizontal: 16, height: 320, borderRadius: 22, alignItems: 'center', justifyContent: 'center', position: 'relative' , ...GLASS.hero, ...glassTilt(1.2, -1.6) }, detailPhoto: { width: '100%', height: '100%', borderRadius: 22 }, detailInitial: { fontSize: 150, fontWeight: '800', color: '#ffffff66' }, detailHeart: { position: 'absolute', right: 15, top: 15, width: 42, height: 42, borderRadius: 21, backgroundColor: '#ffffffcc', alignItems: 'center', justifyContent: 'center' , ...GLASS.chip }, detailCategory: { color: COLORS.red, fontWeight: '800', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginHorizontal: 20, marginTop: 20 }, detailTitle: { color: COLORS.ink, fontSize: 27, fontWeight: '800', marginHorizontal: 20, marginTop: 7 }, rating: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 10 }, ratingText: { color: COLORS.muted, fontSize: 11, marginLeft: 4 }, detailPrice: { color: COLORS.ink, fontSize: 22, fontWeight: '800', marginHorizontal: 20, marginTop: 17 }, detailWas: { color: COLORS.muted, fontSize: 12, textDecorationLine: 'line-through', marginHorizontal: 20, marginTop: 5 }, saveText: { color: COLORS.red, textDecorationLine: 'none' }, detailLine: { height: 1, backgroundColor: COLORS.line, marginHorizontal: 20, marginVertical: 19 }, detailHeading: { color: COLORS.ink, fontSize: 15, fontWeight: '800', marginHorizontal: 20 }, detailDescription: { color: COLORS.muted, fontSize: 13, lineHeight: 21, marginHorizontal: 20, marginTop: 8 }, detailLoading: { color: COLORS.muted, fontSize: 11, marginHorizontal: 20, marginTop: 12 }, detailError: { color: COLORS.red, fontSize: 11, marginHorizontal: 20, marginTop: 12 }, detailSpecs: { marginHorizontal: 20, marginTop: 18, padding: 15, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.line , ...GLASS.panelStrong }, specLabel: { color: COLORS.red, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginTop: 13 }, specValue: { color: COLORS.ink, fontSize: 12, lineHeight: 18, marginTop: 3 }, detailFeature: { marginHorizontal: 20, marginTop: 18, padding: 13, backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', gap: 10 , ...GLASS.panelStrong }, featureText: { color: COLORS.muted, fontSize: 11, lineHeight: 17 }, bold: { color: COLORS.ink, fontWeight: '800' }, addButton: { marginHorizontal: 20, marginTop: 18, backgroundColor: COLORS.red, borderRadius: 13, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' , ...GLASS.accent }, addButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' }, addButtonPrice: { color: '#fff', fontSize: 13, fontWeight: '700' }, storeHero: { marginHorizontal: 20, marginTop: 4, padding: 22, minHeight: 160, borderRadius: 18, backgroundColor: COLORS.red , ...GLASS.accent }, storeHeroTitle: { color: '#fff', fontSize: 25, lineHeight: 29, fontWeight: '800', marginTop: 12 }, storeHeroBody: { color: '#FBD5D7', fontSize: 12, marginTop: 8 }, sectionHeadingStandalone: { color: COLORS.navy, fontSize: 20, fontWeight: '800', marginHorizontal: 20, marginTop: 28, marginBottom: 12 }, storeCard: { marginHorizontal: 20, marginBottom: 10, padding: 15, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, flexDirection: 'row', alignItems: 'flex-start', gap: 12 , ...GLASS.panelStrong }, storePin: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#FDE8E9', alignItems: 'center', justifyContent: 'center' , ...GLASS.chip }, storeCity: { color: COLORS.ink, fontSize: 14, fontWeight: '800' }, storeAddress: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, storeHours: { color: '#127A44', fontSize: 10, fontWeight: '700', marginTop: 6 }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, minHeight: 350 }, emptyTitle: { color: COLORS.ink, fontSize: 20, fontWeight: '800', marginTop: 14 }, savedSection: { marginTop: 2, marginBottom: 8 }, savedSectionHeader: { paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }, savedSectionTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800' }, savedSectionCount: { color: COLORS.red, fontSize: 11, fontWeight: '800' }, cartLine: { marginHorizontal: 20, marginBottom: 12, padding: 11, borderRadius: 14, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 12 , ...GLASS.panelStrong }, cartImage: { width: 78, height: 78, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, cartPhoto: { width: '100%', height: '100%', borderRadius: 10 }, cartInitial: { color: '#ffffff88', fontSize: 36, fontWeight: '800' }, quantity: { flexDirection: 'row', gap: 15, alignItems: 'center', marginTop: 10 }, quantityText: { color: COLORS.ink, fontWeight: '800' }, totalBox: { margin: 20, padding: 17, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: COLORS.line , ...GLASS.panelStrong }, totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 5 }, totalLabel: { color: COLORS.muted, fontSize: 12 }, totalValue: { color: COLORS.ink, fontWeight: '700', fontSize: 12 }, free: { color: '#127A44', fontSize: 11, fontWeight: '700' }, totalRule: { height: 1, backgroundColor: COLORS.line, marginVertical: 9 }, totalBig: { color: COLORS.ink, fontSize: 17, fontWeight: '800' }, nav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 72, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.line, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 , ...GLASS.nav }, navItem: { alignItems: 'center', width: '20%' }, navGlyph: { color: COLORS.muted, fontSize: 21, height: 21 }, navActive: { color: COLORS.red }, navLabel: { color: COLORS.muted, fontSize: 10, marginTop: 4, fontWeight: '600' }, badge: { position: 'absolute', right: -8, top: -5, backgroundColor: COLORS.red, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' }, toast: { position: 'absolute', bottom: 84, left: 20, right: 20, backgroundColor: COLORS.ink, padding: 13, borderRadius: 12, alignItems: 'center' , ...GLASS.dark }, toastText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
