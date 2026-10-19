import { Pressable, ScrollView, Text, View } from 'react-native';
import { Link, MapPin, Phone } from 'lucide-react-native';
import { royalFurnitureData } from '../../app/data/royalFurnitureData';
import { Header } from './ProductCard';
import { COLORS, styles } from './kit';
import { t } from '../../app/i18n';

/**
 * Royal Furniture showrooms: the same source the checkout's Click & Collect
 * picker reads, presented for browsing — with one-tap Call (tel:) and
 * Directions (maps search on the store address). Purely informational, so no
 * state is kept here.
 */
export function StoresContent({ cartCount, onCart, onAccount }: { cartCount: number; onCart: () => void; onAccount: () => void }) {
  const stores = royalFurnitureData.stores;
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
    <Header count={cartCount} onCart={onCart} onAccount={onAccount} />
    <View style={styles.shopHead}>
      <Text style={styles.pageTitle}>{t('stores.title')}</Text>
      <Text style={styles.pageSub}>{t('stores.sub')}</Text>
    </View>
    {stores.map((store) => (
      <View key={store.city + store.addr} style={styles.checkoutStore}>
        <MapPin color={COLORS.red} size={17} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.checkoutStoreCity}>{store.city}</Text>
          <Text style={styles.checkoutStoreAddress}>{store.addr}</Text>
          <Text style={styles.checkoutStoreHours}>{t('cart.open', { h: store.open })}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('stores.callA11y', { c: store.city })}
              onPress={() => {
                const url = `tel:${store.tel}`;
                if (typeof window !== 'undefined' && window.open) window.open(url, '_self');
              }}
              style={styles.claimButton}
            >
              <Phone color={COLORS.red} size={13} />
              <Text style={styles.claimButtonText}>{t('stores.call')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('stores.directionsA11y', { c: store.city })}
              onPress={() => {
                const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.addr}, ${store.city}`)}`;
                if (typeof window !== 'undefined' && window.open) window.open(url, '_blank');
              }}
              style={styles.claimButton}
            >
              <Link color={COLORS.red} size={13} />
              <Text style={styles.claimButtonText}>{t('stores.directions')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    ))}
  </ScrollView>;
}
