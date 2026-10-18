import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, SafeAreaView, Text, View } from 'react-native';
import { royalFurnitureData } from '../data/royalFurnitureData';
import { catalogData } from '../data/catalogData';
import { getSizeVariants } from '../data/sizeVariants';
import ProductDetails from '../ProductDetails';
import { CustomizationPage } from '../../components/CustomizationPage';
import type { CustomizationFilters } from '../../utils/madeToOrder';
import { AdaptiveRegion, useAdaptiveLayout } from '../../hooks/useAdaptiveLayout';
import { SandboxCheckout, SandboxPaymentReturn } from '../../components/SandboxCheckout';
import { BottomNav } from '../../components/catalog/BottomNav';
import { HomeContent } from '../../components/catalog/HomeContent';
import { ShopContent } from '../../components/catalog/ShopContent';
import { CartContent } from '../../components/catalog/CartContent';
import { AccountContent } from '../../components/catalog/AccountContent';
import { SearchContent, NewArrivalsContent, BestSellersContent } from '../../components/catalog/Screens';
import { Header, ProductCard } from '../../components/catalog/ProductCard';
import { photoFor, photoForCatalogId, styles, type OrderRecord, type Product, type Tab } from '../../components/catalog/kit';

export default function HomeScreen() {
  const [session, setSession] = useState(0);
  useEffect(() => {
    // Purge the standalone prototype's old history on this origin, if present.
    try { if (typeof window !== 'undefined') window.localStorage?.removeItem('rf'); } catch { /* Storage may be blocked. */ }
  }, []);
  return <AppSession key={session} onDeleteData={async () => {
    if (Platform.OS === 'web') {
      const configResponse = await fetch('/api/payments/config');
      const config = configResponse.ok && configResponse.headers.get('content-type')?.includes('application/json') ? await configResponse.json() : null;
      if (config?.enabled) {
        const response = await fetch('/api/payments/local-session', { method: 'DELETE', credentials: 'same-origin' });
        if (!response.ok) throw new Error('Deletion unavailable');
      }
    }
    setSession((value) => value + 1);
  }} />;
}

function AppSession({ onDeleteData }: { onDeleteData: () => Promise<void> }) {
  const adaptive = useAdaptiveLayout();
  const rail = adaptive.twoPane && !adaptive.compactHeight;
  const [tab, setTab] = useState<Tab>('home');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [catalogSort, setCatalogSort] = useState('trending');
  const [selected, setSelected] = useState<Product | null>(null);
  const pageMotion = useRef(new Animated.Value(1)).current;
  const [saved, setSaved] = useState<string[]>([]);
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [notice, setNotice] = useState('');
  const [customizationFilters, setCustomizationFilters] = useState<CustomizationFilters>({ category: 'all', query: '', sort: 'featured' });

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 2200);
  };

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const toggleSaved = (product: Product) => {
    setSaved((items) => items.includes(product.id) ? items.filter((id) => id !== product.id) : [...items, product.id]);
    showNotice(saved.includes(product.id) ? 'Removed from saved items' : 'Saved for later');
  };

  const addToCart = (product: Product) => {
    setCart((items) => {
      const existing = items.find((item) => item.product.id === product.id);
      return existing ? items.map((item) => item.product.id === product.id ? { ...item, quantity: Math.min(10, item.quantity + 1) } : item) : [...items, { product, quantity: 1 }];
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
    return <><ProductDetails header={<Header count={cartCount} onCart={() => { setSelected(null); setTab('cart'); }} onAccount={() => { setSelected(null); setTab('account'); }} />} key={selected.id} product={selected} photoSource={photoFor(selected)} sizeVariants={sizeOptions} onBack={() => setSelected(null)} onSave={() => toggleSaved({ ...selected, id: sourceId })} onAdd={(variant) => { const sibling = getSizeVariants(sourceId).find((item) => [item.label, item.sizeType].filter(Boolean).join(' · ') === variant.size); const cartProduct = { ...selected, paymentProductId: sibling?.id || (variant.size ? `${sourceId}::size=${encodeURIComponent(variant.size)}` : sourceId), id: variant.size ? `${sourceId}::size=${encodeURIComponent(variant.size)}` : sourceId, n: variant.size ? `${name} — Size: ${variant.size}` : name, o: variant.price, l: variant.listPrice ?? selected.l }; addToCart(cartProduct); }} isSaved={saved.includes(sourceId)} />{!!notice && <View style={styles.toast}><Text style={styles.toastText}>{notice}</Text></View>}</>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <SandboxPaymentReturn />
        <Animated.View style={[styles.pageTransition, { marginLeft: rail ? 96 : 0, opacity: pageMotion, transform: [{ translateY: pageMotion.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }, { scale: pageMotion.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }] }]}>
        <AdaptiveRegion inset={rail ? 96 : 0}>
        {tab === 'customization' && <CustomizationPage products={catalogData as unknown as readonly Product[]} categories={royalFurnitureData.cats} filters={customizationFilters} onFiltersChange={setCustomizationFilters} onBack={() => setTab('home')} header={<Header count={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />} renderCard={(item) => <ProductCard product={item} onPress={() => setSelected(item)} saved={saved.includes(item.id)} onSave={() => toggleSaved(item)} wide />} />}
        {tab === 'home' && <HomeContent onCustomize={() => setTab('customization')} onCategory={(value) => { setCategory(value); setTab('categories'); }} onProduct={setSelected} onShop={() => setTab('shop')} onBestSellers={() => setTab('bestSellers')} cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'shop' && <ShopContent products={royalFurnitureData.products} query={query} setQuery={setQuery} category={category} setCategory={setCategory} onProduct={setSelected} saved={saved} onSave={toggleSaved} cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'categories' && <ShopContent catalogSort={catalogSort} onCatalogSortChange={setCatalogSort} products={royalFurnitureData.products} query={query} setQuery={setQuery} category={category} setCategory={setCategory} onProduct={setSelected} saved={saved} onSave={toggleSaved} catalogOnly cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'search' && <SearchContent onProduct={setSelected} cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'arrivals' && <NewArrivalsContent onProduct={setSelected} cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'bestSellers' && <BestSellersContent onProduct={setSelected} cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'account' && <AccountContent onDeleteData={onDeleteData} orders={orders} onBag={() => setTab('cart')} cartCount={cartCount} onCart={() => setTab('cart')} onAccount={() => setTab('account')} />}
        {tab === 'cart' && <CartContent onCart={() => setTab('cart')} onAccount={() => setTab('account')} cart={cart} setCart={setCart} saved={saved} onSave={toggleSaved} onProduct={setSelected} onOrderCreated={(order) => setOrders((items) => [order, ...items])} onShop={() => setTab('shop')} />}
        </AdaptiveRegion></Animated.View>
        <BottomNav tab={tab} setTab={setTab} count={cartCount} />
        {!!notice && <View style={styles.toast}><Text style={styles.toastText}>{notice}</Text></View>}
      </View>
    </SafeAreaView>
  );
}
