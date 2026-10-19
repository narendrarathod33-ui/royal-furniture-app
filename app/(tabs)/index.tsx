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
import { StoresContent } from '../../components/catalog/StoresContent';
import { MoreContent } from '../../components/catalog/MoreContent';
import { Header, ProductCard } from '../../components/catalog/ProductCard';
import { photoFor, photoForCatalogId, styles, type Product } from '../../components/catalog/kit';
import { ToastHost, showToast } from '../../components/catalog/Toast';
import { SchemeBackdrop } from '../../components/catalog/SchemeBackdrop';
import { useCartStore, useToggleSavedWithToast } from '../../stores/cart';
import { QuickViewSheet } from '../../components/catalog/QuickView';
import { useSessionStore } from '../../stores/session';
import { useLangStore } from '../../app/i18n';

export default function HomeScreen() {
  const [session, setSession] = useState(0);
  // Language changes remount the whole session instantly: every label reads
  // the dictionary at render, and stores (cart/session) survive untouched.
  const lang = useLangStore((state) => state.lang);
  useEffect(() => {
    // Purge the standalone prototype's old history on this origin, if present.
    try { if (typeof window !== 'undefined') window.localStorage?.removeItem('rf'); } catch { /* Storage may be blocked. */ }
  }, []);
  return <AppSession key={`${session}:${lang}`} onDeleteData={async () => {
    if (Platform.OS === 'web') {
      const configResponse = await fetch('/api/payments/config');
      const config = configResponse.ok && configResponse.headers.get('content-type')?.includes('application/json') ? await configResponse.json() : null;
      if (config?.enabled) {
        const response = await fetch('/api/payments/local-session', { method: 'DELETE', credentials: 'same-origin' });
        if (!response.ok) throw new Error('Deletion unavailable');
      }
    }
    useCartStore.getState().resetUserData();
    useSessionStore.getState().resetUserData();
    setSession((value) => value + 1);
  }} />;
}

function AppSession({ onDeleteData }: { onDeleteData: () => Promise<void> }) {
  const adaptive = useAdaptiveLayout();
  const rail = adaptive.twoPane && !adaptive.compactHeight;
  // Shared user state lives in stores: tab/overlay/order history in the
  // session store, cart/saved in the cart store (persisted). This component
  // only subscribes to the slices it renders.
  const tab = useSessionStore((state) => state.tab);
  const setTab = useSessionStore((state) => state.setTab);
  const selected = useSessionStore((state) => state.selected);
  const openProduct = useSessionStore((state) => state.openProduct);
  const closeProduct = useSessionStore((state) => state.closeProduct);
  const orders = useSessionStore((state) => state.orders);
  const cart = useCartStore((state) => state.cart);
  const saved = useCartStore((state) => state.saved);
  // Ephemeral search/filter state stays component-local on purpose: it is not
  // user data, does not need to survive reloads, and keeps store churn low.
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [catalogSort, setCatalogSort] = useState('trending');
  const [customizationFilters, setCustomizationFilters] = useState<CustomizationFilters>({ category: 'all', query: '', sort: 'featured' });
  const pageMotion = useRef(new Animated.Value(1)).current;

  // Toasts render through the isolated ToastHost: notice updates never touch
  // this component's state, so they cannot re-render the screen tree.
  const toggleSaved = useToggleSavedWithToast();

  const handleAddToCart = useCallback((product: Product) => {
    useCartStore.getState().addToCart(product);
    showToast('Added to your bag');
  }, []);

  // Stable navigation and list callbacks: memoized cards and lists downstream
  // keep their prop identity across session re-renders.
  const openHome = useCallback(() => setTab('home'), [setTab]);
  const openCart = useCallback(() => setTab('cart'), [setTab]);
  const openAccount = useCallback(() => setTab('account'), [setTab]);
  const openShop = useCallback(() => setTab('shop'), [setTab]);
  const openCustomize = useCallback(() => setTab('customization'), [setTab]);
  const openBestSellers = useCallback(() => setTab('bestSellers'), [setTab]);
  const openCategories = useCallback((value: string) => { setCategory(value); setTab('categories'); }, [setTab]);
  const renderCatalogCard = useCallback((item: Product) => <ProductCard product={item} onPress={openProduct} saved={saved.includes(item.id)} onSave={toggleSaved} wide />, [openProduct, saved, toggleSaved]);

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  useEffect(() => {
    pageMotion.setValue(0);
    Animated.spring(pageMotion, { toValue: 1, tension: 72, friction: 11, useNativeDriver: true }).start();
  }, [tab, selected?.id, pageMotion]);

  if (selected) {
    const sourceId = selected.id.split('::size=')[0];
    const name = selected.n.replace(/\s+—\s+Size:\s+.*$/, '');
    const sizeOptions = getSizeVariants(sourceId).map((variant) => ({ ...variant, photo: photoForCatalogId(variant.id) }));
    return <><ProductDetails header={<Header count={cartCount} onCart={() => { closeProduct(); openCart(); }} onAccount={() => { closeProduct(); openAccount(); }} />} key={selected.id} product={selected} photoSource={photoFor(selected)} sizeVariants={sizeOptions} onBack={closeProduct} onSave={() => toggleSaved({ ...selected, id: sourceId })} onAdd={(variant) => { const sibling = getSizeVariants(sourceId).find((item) => [item.label, item.sizeType].filter(Boolean).join(' · ') === variant.size); const cartProduct = { ...selected, paymentProductId: sibling?.id || (variant.size ? `${sourceId}::size=${encodeURIComponent(variant.size)}` : sourceId), id: variant.size ? `${sourceId}::size=${encodeURIComponent(variant.size)}` : sourceId, n: variant.size ? `${name} — Size: ${variant.size}` : name, o: variant.price, l: variant.listPrice ?? selected.l }; handleAddToCart(cartProduct); }} isSaved={saved.includes(sourceId)} onOpenProduct={openProduct} /><ToastHost /></>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <SchemeBackdrop />
        <SandboxPaymentReturn />
        <Animated.View style={[styles.pageTransition, { marginLeft: rail ? 96 : 0, opacity: pageMotion, transform: [{ translateY: pageMotion.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }, { scale: pageMotion.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }] }]}>
        <AdaptiveRegion inset={rail ? 96 : 0}>
        {tab === 'customization' && <CustomizationPage products={catalogData as unknown as readonly Product[]} categories={royalFurnitureData.cats} filters={customizationFilters} onFiltersChange={setCustomizationFilters} onBack={openHome} header={<Header count={cartCount} onCart={openCart} onAccount={openAccount} />} renderCard={renderCatalogCard} />}
        {tab === 'home' && <HomeContent onCustomize={openCustomize} onCategory={openCategories} onProduct={openProduct} onShop={openShop} onBestSellers={openBestSellers} cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'shop' && <ShopContent products={royalFurnitureData.products} query={query} setQuery={setQuery} category={category} setCategory={setCategory} onProduct={openProduct} saved={saved} onSave={toggleSaved} cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'categories' && <ShopContent catalogSort={catalogSort} onCatalogSortChange={setCatalogSort} products={royalFurnitureData.products} query={query} setQuery={setQuery} category={category} setCategory={setCategory} onProduct={openProduct} saved={saved} onSave={toggleSaved} catalogOnly cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'search' && <SearchContent onProduct={openProduct} cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'arrivals' && <NewArrivalsContent onProduct={openProduct} cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'stores' && <StoresContent cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'more' && <MoreContent onArrivals={() => setTab('arrivals')} onStores={() => setTab('stores')} onCart={openCart} onAccount={openAccount} cartCount={cartCount} />}
        {tab === 'bestSellers' && <BestSellersContent onProduct={openProduct} cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'account' && <AccountContent onDeleteData={onDeleteData} orders={orders} onBag={openCart} cartCount={cartCount} onCart={openCart} onAccount={openAccount} />}
        {tab === 'cart' && <CartContent onCart={openCart} onAccount={openAccount} onProduct={openProduct} onShop={openShop} />}
        </AdaptiveRegion></Animated.View>
        <BottomNav tab={tab} setTab={setTab} count={cartCount} />
        <QuickViewSheet onAdd={handleAddToCart} onOpenProduct={openProduct} />
        <ToastHost />
      </View>
    </SafeAreaView>
  );
}
