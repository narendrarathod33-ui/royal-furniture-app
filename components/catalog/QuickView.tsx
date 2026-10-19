import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Modal, Platform, SafeAreaView } from 'react-native';
import { Bell, Check, Eye, Truck, X } from 'lucide-react-native';
import { COLORS, money, photoFor, styles, type ListedProduct, pname } from './kit';
import { t } from '../../app/i18n';
import { GLASS } from '../../app/ui/glass';
import { useQuickViewStore } from '../../stores/quickView';

/**
 * Quick View bottom sheet: photo, price, delivery, short description, and the
 * right action per product — add to cart for single-option items, "view full
 * details" when sizes/fabrics multiply the choice, "notify me" when the item
 * is out of stock. Purely a shortcut to decisions the PDP owns: it never
 * invents prices or options, it reads the same catalog entry the card shows.
 */
export function QuickViewSheet({ onAdd, onOpenProduct }: { onAdd: (product: ListedProduct) => void; onOpenProduct: (product: ListedProduct) => void }) {
  const product = useQuickViewStore((state) => state.product);
  const close = useQuickViewStore((state) => state.close);
  const open = !!product;
  return (
    <Modal transparent visible={open} animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={close}>
      <View style={s.scrim}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('qv.close')} onPress={close} style={StyleSheet.absoluteFill} />
        <SafeAreaView testID="quick-view-sheet" accessibilityViewIsModal accessibilityLabel={t('qv.quickViewLabel')} style={s.sheet}>
          {product && <QuickViewBody product={product} onAdd={onAdd} onOpenProduct={onOpenProduct} onClose={close} />}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** Sheet content, Modal-free so tests can render it directly (RN jest stubs Modal). */
export function QuickViewBody({ product, onAdd, onOpenProduct, onClose }: { product: ListedProduct; onAdd: (product: ListedProduct) => void; onOpenProduct: (product: ListedProduct) => void; onClose: () => void }) {

  const discount = product.l > product.o ? Math.round((1 - product.o / product.l) * 100) : 0;
  const inStock = product.st !== 'out_of_stock';
  const deliveryDays = typeof product.dl === 'number' && product.dl > 0 ? product.dl : undefined;
  const freeDelivery = product.fd === 1;
  const multiOption = (product.sizeCount ?? 0) > 1;
  const source = photoFor(product);
  const close = onClose;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.pad}>
            <View style={s.grab} />
            <View style={s.head}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('qv.close')} onPress={close} hitSlop={8} style={s.close}>
                <X size={20} color="#33242C" />
              </Pressable>
            </View>
            <View style={s.body}>
              <View style={s.photo}>{source
                ? <Image source={source} accessibilityLabel={pname(product)} resizeMode="contain" style={styles.productPhoto} />
                : <Text style={s.photoNote}>{t('card.photoUnavailable')}</Text>}</View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.name}>{pname(product)}</Text>
                <Text style={s.priceRow}>
                  <Text style={s.price}>{money(product.o)}</Text>
                  {product.l > product.o && <Text style={s.was}>{money(product.l)}</Text>}
                </Text>
                {discount > 0 && <Text style={s.pill}>{discount}% OFF</Text>}
                <View style={s.metaRow}>
                  <Truck size={13} color={COLORS.muted} />
                  <Text style={s.meta}>{deliveryDays ? t('qv.deliveryAbout', { n: deliveryDays }) : t('qv.deliveryRange')}{freeDelivery ? t('qv.freeDelivery') : ''}</Text>
                </View>
                <View style={s.metaRow}>
                  {inStock ? <Check size={13} color="#127A44" /> : <Bell size={13} color={COLORS.red} />}
                  <Text style={[s.meta, !inStock && { color: COLORS.red }]}>{inStock ? t('pdp.inStock') : t('pdp.outOfStock')}</Text>
                </View>
              </View>
            </View>
            {!!product.d && <Text style={s.desc}>{product.d}</Text>}
            {!inStock ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('qv.notifyA11y', { n: pname(product) })} onPress={() => { close(); }} style={[s.cta, s.ctaGhost]}>
                <Bell size={15} color={COLORS.red} />
                <Text style={[s.ctaText, { color: COLORS.red }]}>{t('qv.notify')}</Text>
              </Pressable>
            ) : multiOption ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('qv.viewDetailsA11y', { n: pname(product) })} onPress={() => { close(); onOpenProduct(product); }} style={s.cta}>
                <Eye size={15} color="#fff" />
                <Text style={s.ctaText}>{t('qv.viewFullDetails')}</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={t('qv.addToCartA11y', { n: pname(product), p: money(product.o) })} onPress={() => { onAdd(product); close(); }} style={s.cta}>
                <Text style={s.ctaText}>{t('qv.addToCart', { p: money(product.o) })}</Text>
              </Pressable>
            )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#211B2866' },
  sheet: { width: '100%', maxWidth: 640, alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden', backgroundColor: '#FAF8F5', ...GLASS.sheet },
  pad: { padding: 16, paddingBottom: 26 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(51,36,44,.2)', marginBottom: 10 },
  head: { flexDirection: 'row', justifyContent: 'flex-end' },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EAE2DD', backgroundColor: '#FFFCF9' },
  body: { flexDirection: 'row', gap: 12 },
  photo: { width: 116, height: 116, borderRadius: 14, backgroundColor: '#F2F1EE', alignItems: 'center', justifyContent: 'center', padding: 10 },
  photoNote: { fontSize: 10, color: '#817B72', textAlign: 'center', fontWeight: '600' },
  name: { color: COLORS.ink, fontSize: 15, fontWeight: '800', lineHeight: 20 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 6 },
  price: { color: COLORS.ink, fontSize: 18, fontWeight: '800' },
  was: { color: COLORS.muted, fontSize: 12, textDecorationLine: 'line-through' },
  pill: { alignSelf: 'flex-start', marginTop: 5, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: COLORS.red, color: '#fff', fontSize: 10, fontWeight: '800', overflow: 'hidden' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  meta: { color: COLORS.muted, fontSize: 11.5, fontWeight: '700', flexShrink: 1 },
  desc: { color: '#5C5560', fontSize: 12, lineHeight: 18, marginTop: 12 },
  cta: { marginTop: 14, minHeight: 48, borderRadius: 14, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...GLASS.accent },
  ctaGhost: { backgroundColor: '#FDE8E9', borderWidth: 1, borderColor: COLORS.red },
  ctaText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
