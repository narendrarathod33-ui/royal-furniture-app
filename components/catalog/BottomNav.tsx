import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BadgePercent, Search, ShoppingBag, Star, UserRound } from 'lucide-react-native';
import { useAdaptiveLayout } from '../../hooks/useAdaptiveLayout';
import { COLORS, styles } from './kit';
import { GLASS } from '../../app/ui/glass';
import type { Tab } from './kit';

export const floatingNavStyles = StyleSheet.create({
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
  glyph: { color: '#504C54', fontSize: 21, lineHeight: 22, fontWeight: '600' },
  label: { color: '#504C54', fontSize: 9, lineHeight: 12, fontWeight: '600' },
  labelActive: { color: COLORS.red, fontWeight: '800' },
});

export function BottomNav({ tab, setTab, count }: { tab: Tab; setTab: (tab: Tab) => void; count: number }) {
  const adaptive = useAdaptiveLayout();
  const rail = adaptive.twoPane && !adaptive.compactHeight;
  const items: [Tab, string][] = [['home', 'Home'], ['categories', 'Browse'], ['search', 'Search'], ['shop', 'Deals'], ['arrivals', 'New in']];
  return (
    <View testID={rail ? 'navigation-rail' : 'bottom-navigation'} style={[floatingNavStyles.shadow, rail && { top: 16, left: 8, right: undefined, bottom: undefined, width: 80, height: 400 }]}>
      <View style={[floatingNavStyles.surface, rail && { flexDirection: 'column', paddingVertical: 10 }]}>
        <BlurView pointerEvents="none" intensity={52} tint="light" experimentalBlurMethod="dimezisBlurView" style={floatingNavStyles.blur} />
        <View pointerEvents="none" style={floatingNavStyles.highlight} />
        {items.map(([key, label]) => {
          const selected = tab === key || (tab === 'customization' && key === 'home');
          const iconColor = selected ? COLORS.red : '#504C54';
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              style={[floatingNavStyles.item, rail && { width: '100%' }, selected && floatingNavStyles.itemActive]}
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
