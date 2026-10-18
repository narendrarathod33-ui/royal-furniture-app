import { memo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { Eye, Heart, ShoppingBag, UserRound } from 'lucide-react-native';
import { COLORS, money, photoFor, shortName, styles } from './kit';
import { useGridCardWidth } from '../AdaptiveProductList';
import { useAdaptiveLayout } from '../../hooks/useAdaptiveLayout';
import { useQuickViewStore } from '../../stores/quickView';
import { isMadeToOrderText } from '../../app/ProductDetails';
import type { ListedProduct, Product } from './kit';

export function Header({ onCart, onAccount, count = 0 }: { onCart?: () => void; onAccount?: () => void; count?: number }) {
  return <View style={styles.header}><Image source={require('../../assets/images/royal-logo.png')} style={styles.logo} resizeMode="contain" /><View style={styles.headerActions}><Pressable testID="liquid-control" accessibilityRole="button" accessibilityLabel="Account" onPress={onAccount} style={styles.headerAccount}><UserRound color={COLORS.ink} size={19} /></Pressable><Pressable testID="liquid-control" accessibilityRole="button" accessibilityLabel={`Cart, ${count} items`} onPress={onCart} style={styles.headerBag}><ShoppingBag color={COLORS.ink} size={21} />{count > 0 && <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{count}</Text></View>}</Pressable></View></View>;
}

export function SectionTitle({ title, action, onPress, compact = false }: { title: string; action: string; onPress: () => void; compact?: boolean }) { return <View style={[styles.sectionTitle, compact && styles.homeSectionTitle]}><Text style={styles.sectionHeading}>{title}</Text><Pressable onPress={onPress}><Text style={styles.sectionAction}>{action}</Text></Pressable></View>; }
export function ProductRail({ products, onProduct }: { products: readonly Product[]; onProduct: (product: Product) => void }) { return <FlatList horizontal data={products} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalPad} renderItem={({ item }) => <ProductCard product={item} onPress={onProduct} />} />; }

/** Memoized: catalog grids render hundreds of these; unrelated parent state
 * (toasts, tab state) no longer re-renders cards whose props are stable. */
export const ProductCard = memo(function ProductCard({ product, onPress, saved, onSave, wide }: { product: ListedProduct; onPress: (product: ListedProduct) => void; saved?: boolean; onSave?: (product: ListedProduct) => void; wide?: boolean }) {
  const cardWidth = useGridCardWidth();
  // Home rails keep a phone-fixed 160px card on every screen; scale the card
  // (and its photo) with the viewport so tablets/desktops don't show phone-
  // sized tiles. Grid cards already size from measured width (AdaptiveProductList).
  const layoutWidth = useAdaptiveLayout().width;
  const railWidth = layoutWidth < 600 ? 160 : layoutWidth < 1040 ? 200 : 232;
  const source = photoFor(product);
  // Stringifying a full source object per render is wasteful on card-heavy
  // screens; the uri identifies the source in practice, stringify only if ever
  // a non-uri source appears.
  const photoKey = typeof source === 'object' && !Array.isArray(source) && source.uri ? source.uri : JSON.stringify(source);
  const [failedPhoto, setFailedPhoto] = useState<string | undefined>();
  const showPhoto = !!source && failedPhoto !== photoKey;
  const discount = product.l > product.o ? Math.round((1 - product.o / product.l) * 100) : 0;
  const sizeCount = product.sizeCount || 0;
  return <Pressable testID={wide ? "grid-product-card" : "rail-product-card"} accessibilityRole="button" accessibilityLabel={`${product.n}, ${money(product.o)}`} style={[styles.productCard, wide ? { width: cardWidth } : railWidth ? { width: railWidth } : null]} onPress={() => onPress(product)}><View testID="product-thumbnail-frame" style={styles.productImage}>{showPhoto ? <Image source={source} accessibilityLabel={product.n} style={styles.productPhoto} resizeMode="cover" onError={() => setFailedPhoto(photoKey)} /> : <View accessibilityLabel={`Photo unavailable for ${product.n}`} style={{ alignItems: 'center', padding: 12 }}><Text style={styles.productInitial}>{shortName(product.n).slice(0, 1)}</Text><Text style={{ color: COLORS.muted, fontSize: 11, textAlign: 'center' }}>Photo unavailable</Text></View>}{discount > 0 && <Text style={styles.salePill}>{discount}% OFF</Text>}{onSave && <Pressable style={styles.heart} onPress={() => onSave(product)}><Heart size={17} color={saved ? COLORS.red : COLORS.ink} fill={saved ? COLORS.red : 'transparent'} /></Pressable>}{<Pressable testID="quick-view" accessibilityRole="button" accessibilityLabel={`Quick view ${product.n}`} onPress={() => useQuickViewStore.getState().open(product)} hitSlop={6} style={styles.eye}><Eye size={16} color={COLORS.ink} /></Pressable>}</View><Text style={styles.productCategory}>{product.scn}</Text>{Array.isArray(product.lb) && product.lb.length > 0 && <Text style={styles.catalogBadge}>{product.lb[0]}</Text>}{isMadeToOrderText(product.d) && <Text style={{ color: COLORS.red, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, marginTop: 3 }}>MADE TO ORDER</Text>}<Text style={styles.productName} numberOfLines={2}>{sizeCount > 1 ? product.baseName || shortName(product.n) : product.n}</Text><View style={styles.priceLine}><Text style={styles.productPrice}>{sizeCount > 1 ? `From ${money(product.o)}` : money(product.o)}</Text>{product.l > product.o && <Text style={styles.productWas}>{money(product.l)}</Text>}</View>{sizeCount > 1 && <Text style={styles.sizeCountBadge}>{sizeCount} sizes available</Text>}</Pressable>;
});
