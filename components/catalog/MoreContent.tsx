import type { ReactElement } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Bell, Bookmark, ChevronRight, MapPin, Package, UserRound } from 'lucide-react-native';
import { Header } from './ProductCard';
import { COLORS, styles } from './kit';
import { t, switchLang, reloadForLang, useLangStore } from '../../app/i18n';

/**
 * The More hub: the destinations that don't need a tab of their own — new
 * arrivals, saved items, order history, profile/support — plus the language
 * switch, mirroring the prototype's hub. Every row routes through the same
 * navigation callbacks the rest of the app uses; nothing duplicates screens.
 */
export function MoreContent({ onArrivals, onStores, onCart, onAccount, cartCount }: { onArrivals: () => void; onStores: () => void; onCart: () => void; onAccount: () => void; cartCount: number }) {
  const lang = useLangStore.getState().lang;
  const rows: { key: string; label: string; icon: ReactElement; onPress: () => void }[] = [
    { key: 'arrivals', label: t('more.newIn'), icon: <Bell color={COLORS.ink} size={18} />, onPress: onArrivals },
    { key: 'saved', label: t('more.saved'), icon: <Bookmark color={COLORS.ink} size={18} />, onPress: onCart },
    { key: 'orders', label: t('more.orders'), icon: <Package color={COLORS.ink} size={18} />, onPress: onAccount },
    { key: 'account', label: t('more.account'), icon: <UserRound color={COLORS.ink} size={18} />, onPress: onAccount },
    { key: 'stores', label: t('nav.stores'), icon: <MapPin color={COLORS.ink} size={18} />, onPress: onStores },
  ];
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
    <Header count={cartCount} onCart={onCart} onAccount={onAccount} />
    <View style={styles.shopHead}>
      <Text style={styles.pageTitle}>{t('more.title')}</Text>
      <Text style={styles.pageSub}>{t('more.sub')}</Text>
    </View>
    <View style={styles.policyCard}>
      {rows.map((row) => (
        <Pressable
          key={row.key}
          accessibilityRole="button"
          accessibilityLabel={row.label}
          onPress={row.onPress}
          style={[styles.policyRow, { alignItems: 'center' }]}
        >
          {row.icon}
          <Text style={[styles.policyRowTitle, { flex: 1 }]}>{row.label}</Text>
          <ChevronRight color={COLORS.muted} size={16} />
        </Pressable>
      ))}
    </View>
    <View style={styles.policyCard}>
      <Text style={[styles.policyRowTitle, { marginBottom: 8 }]}>{t('account.language')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="English"
          onPress={() => { if (switchLang('en')) reloadForLang(); }}
          style={[styles.claimButton, lang === 'en' && { backgroundColor: COLORS.red }]}
        >
          <Text style={[styles.claimButtonText, lang === 'en' && { color: '#fff' }]}>English</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="العربية"
          onPress={() => { if (switchLang('ar')) reloadForLang(); }}
          style={[styles.claimButton, lang === 'ar' && { backgroundColor: COLORS.red }]}
        >
          <Text style={[styles.claimButtonText, lang === 'ar' && { color: '#fff' }]}>العربية</Text>
        </Pressable>
      </View>
    </View>
  </ScrollView>;
}
