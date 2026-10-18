import { useCallback, useEffect, useRef, useState } from 'react';
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
import { ToastHost, showToast } from '../../components/catalog/Toast';

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
  const [customizationFilters, setCustomizationFilters] = useState<CustomizationFilters>({ category: 'all', query: '', sort: 'featured' });

  // Toasts render through the isolated ToastHost: notice updates never touch
  // this component's state, so they cannot re-render the screen tree.
  const toggleSaved = useCallback((product: Product) => {
    setSaved((items) => items.includes(product.id) ? items.filter((id) => id !== product.id) : [...items, product.id]);
    showToast(saved.includes(product.id) ? 'Removed from saved items' : 'Saved for later');
  }, [saved]);

  const addToCart = useCallback((product: Product) => {
    setCart((items) => {
      const existing = items.find((item) => item.product.id === product.id);
      return existing ? items.map((item) => item.product.id === product.id ? { ...item, quantity: Math.min(10, item.quantity + 1) } : item) : [...items, { product, quantity: 1 }];
    });
    showToast('Added to your bag');
  }, []);

  // Stable navigation and list callbacks: memoized cards and lists downstream
  // keep their prop identity across session re-renders.
  const openHome = useCallback(() => setTab('home'), []);
  const openCart = useCallback(() => setTab('cart'), []);
  const openAccount = useCallback(() => setTab('account'), []);
  const openShop = useCallback(() => setTab('shop'), []);
  const openCustomize = useCallback(() => setTab('customization'), []);
  const openBestSellers = useCallback(() => setTab('bestSellers'), []);
  const openCategories = useCallback((value: string) => { setCategory(value); setTab('categories'); }, []);
  const handleOrderCreated = useCallback((order: OrderRecord) => setOrders((items) => [order, ...items]), []);
  const renderCatalogCard = useCallback((item: Product) => <ProductCard product={item} onPress={setSelected} saved={saved.includes(item.id)} onSave={toggleSaved} wide />, [saved, toggleSaved]);

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  useEffect(() => {
    pageMotion.setValue(0);
    Animated.spring(pageMotion, { toValue: 1, tension: 72, friction: 11, useNativeDriver: true }).start();
  }, [tab, selected?.id, pageMotion]);

  if (selected) {
    const sourceId = selected.id.split('::size=')[0];
    const name = selected.n.replace(/\s+—\s+Size:\s+.*$/, '');
    const sizeOptions = getSizeVariants(sourceId).map((variant) => ({ ...variant, photo: photoForCatalogId(variant.id) }));
    return <><ProductDetails header={<Header count={cartCount} onCart={() => { setSelected(null); setTab('cart'); }} onAccount={() => { setSelected(null); setTab('account'); }} />} key={selected.id} product={selected} photoSource={photoFor(selected)} sizeVariants={sizeOptions} onBack={() => setSelected(null)} onSave={() => toggleSaved({ ...selected, id: sourceId })} onAdd={(variant) => { const sibling = getSizeVariants(sourceId).find((item) => [item.label, item.sizeType].filter(Boolean).join(' · ') === variant.size); const cartProduct = { ...selected, paymentProductId: sibling?.id || (variant.size ? `${sourceId}::size=${encodeURIComponent(variant.size)}` : sourceId), id: variant.size ? `${sourceId}::size=${encodeURIComponent(variant.size)}` : sourceId, n: variant.size ? `${name} — Size: ${variant.size}` : name, o: variant.price, l: variant.listPrice ?? selected.l }; addToCart(cartProduct); }} isSaved={saved.includes(sourceId)} /><ToastHost /></>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <SandboxPaymentReturn />
        <Animated.View style={[styles.pageTransition, { marginLeft: rail ? 96 : 0, opacity: pageMotion, transform: [{ translateY: pageMotion.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }, { scale: pageMotion.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }] }]}>
        <AdaptiveRegion inset={rail ? 96 : 0}>
        {tab === 'customization' && <CustomizationPage products={catalogData as unknown as readonly Product[]} categories={royalFurnitureData.cats} filters={customizationFilters} onFiltersChange={setCustomizationFilters} onBack={openHome} header={<Header count={cartCount} onCart={openCart} onAccount={openAccount} />} renderCard={renderCatalogCard} />}
        {tab === 'home' && <HomeContent onCustomize={openCustomize} onCategory={openCategories} onProduct={setSelected} onShop={openShop} onBestSellers={openBestSellers} cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'shop' && <ShopContent products={royalFurnitureData.products} query={query} setQuery={setQuery} category={category} setCategory={setCategory} onProduct={setSelected} saved={saved} onSave={toggleSaved} cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'categories' && <ShopContent catalogSort={catalogSort} onCatalogSortChange={setCatalogSort} products={royalFurnitureData.products} query={query} setQuery={setQuery} category={category} setCategory={setCategory} onProduct={setSelected} saved={saved} onSave={toggleSaved} catalogOnly cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'search' && <SearchContent onProduct={setSelected} cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'arrivals' && <NewArrivalsContent onProduct={setSelected} cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'bestSellers' && <BestSellersContent onProduct={setSelected} cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'account' && <AccountContent onDeleteData={onDeleteData} orders={orders} onBag={openCart} cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'cart' && <CartContent onCart={openCart} onAccount={openAccount} cart={cart} setCart={setCart} saved={saved} onSave={toggleSaved} onProduct={setSelected} onOrderCreated={handleOrderCreated} onShop={openShop} />}
        </AdaptiveRegion></Animated.View>
        <BottomNav tab={tab} setTab={setTab} count={cartCount} />
        <ToastHost />
      </View>
    </SafeAreaView>
  );
}
