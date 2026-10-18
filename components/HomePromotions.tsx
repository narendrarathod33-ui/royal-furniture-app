import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { useAdaptiveLayout } from '../hooks/useAdaptiveLayout';
import { GLASS, useReducedMotion } from '../app/ui/glass';
import { wrapSlideIndex } from '../utils/gallery';

const promotions = [
  { key: 'deals', eyebrow: 'THE ROYAL EDIT', title: 'More home.\nLess spend.', action: 'Explore deals', category: 'all', image: require('../assets/images/catalog-live/bogota-7-seater-sofa-set.webp') },
  { key: 'customization', eyebrow: 'MADE TO ORDER', title: 'Your home.\nYour way.', action: 'Customize your space', category: 'customization', image: require('../assets/images/catalog-live/broadway-dining-set-4-seater-antique-oak.webp') },
  { key: 'kids', eyebrow: 'LITTLE SPACES, BIG IDEAS', title: 'Room for little\ndreamers.', action: 'Explore kids’ rooms', category: 'kids-and-teens', image: require('../assets/images/catalog-live/the-shannon-kids-bed.webp') },
] as const;

const AUTOPLAY_MS = 5000;

/** Compact editorial cards, rather than square posters with baked-in text. */
export function HomePromotions({ onShop, onCategory, onCustomize }: { onCustomize: () => void; onShop: () => void; onCategory: (category: string) => void }) {
  const { width, height, fontScale } = useAdaptiveLayout();
  const reduced = useReducedMotion();
  const [measured, setMeasured] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const carousel = useRef<ScrollView>(null);
  const activeRef = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pageWidth = Math.max(1, measured ?? width - 34);
  const cardHeight = (height < 480 ? 148 : width < 600 ? 176 : 204) * Math.max(1, fontScale);
  const apply = useCallback((index: number, animated = true) => {
    const next = wrapSlideIndex(index, promotions.length);
    activeRef.current = next;
    setActive(next);
    carousel.current?.scrollTo({ x: next * pageWidth, animated });
  }, [pageWidth]);
  const go = (index: number) => {
    apply(index);
    restart();
  };
  const restart = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    // Gentle autoplay keeps all three promotions visible without chrome;
    // honour reduced-motion and skip it for a single slide.
    if (reduced || promotions.length < 2) return;
    timer.current = setInterval(() => apply(activeRef.current + 1), AUTOPLAY_MS);
  }, [apply, reduced]);
  useEffect(() => {
    restart();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [restart]);
  useEffect(() => {
    // Keep the same promotion, aligned to its new full-width page after resizing.
    carousel.current?.scrollTo({ x: active * pageWidth, animated: false });
  }, [pageWidth]);
  const sync = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const next = Math.max(0, Math.min(promotions.length - 1, Math.round(event.nativeEvent.contentOffset.x / pageWidth)));
    activeRef.current = next;
    setActive(next);
  };
  return <View testID="home-promotions" style={s.panel}>
    <ScrollView ref={carousel} onLayout={event => setMeasured(event.nativeEvent.layout.width)} horizontal pagingEnabled snapToInterval={pageWidth} decelerationRate="fast" showsHorizontalScrollIndicator={false}
      style={{ height: cardHeight, flexGrow: 0 }} scrollEventThrottle={32}
      onScroll={Platform.OS === 'web' ? sync : undefined}
      onMomentumScrollEnd={sync}>
      {promotions.map(promotion => <View key={promotion.key} testID="home-promotion-slide" style={{ width: pageWidth, height: cardHeight, flexDirection: 'row' }}>
        <View style={s.copy}><Text style={s.eyebrow}>{promotion.eyebrow}</Text><Text accessibilityRole="header" style={[s.title, width >= 600 && { fontSize: 27, lineHeight: 31 }]}>{promotion.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={promotion.action} onPress={() => promotion.category === 'customization' ? onCustomize() : promotion.category === 'all' ? onShop() : onCategory(promotion.category)} style={s.action}><Text style={s.actionText}>{promotion.action}</Text><ArrowRight size={15} color="#A3272C" /></Pressable>
        </View>
        <Image source={promotion.image} accessibilityLabel={promotion.key === 'kids' ? 'Children’s room inspiration' : 'Furniture inspiration'} style={s.photo} resizeMode="cover" />
      </View>)}
    </ScrollView>
    <View style={s.controls}><Text accessibilityLiveRegion="polite" style={s.counter}>{active + 1} / {promotions.length}</Text>
      <View style={s.dots}>{promotions.map((p, index) => <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={`Show promotion ${index + 1}`} accessibilityState={{ selected: active === index }} onPress={() => go(index)} style={s.control}><View style={[s.dot, active === index && s.dotActive]} /></Pressable>)}</View>
      <View style={s.spacer} />
    </View>
  </View>;
}
const s = StyleSheet.create({
  panel: { ...GLASS.panelStrong, marginHorizontal: 16, borderRadius: 20, overflow: 'hidden' },
  copy: { width: '58%', paddingHorizontal: 18, paddingTop: 17, justifyContent: 'center', backgroundColor: '#F8F0EA' },
  eyebrow: { color: '#9B5A4D', fontSize: 9, letterSpacing: 1.2, fontWeight: '800' },
  title: { color: '#40202B', fontSize: 22, lineHeight: 26, fontWeight: '800', letterSpacing: -0.6, marginTop: 9 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, marginTop: 3 }, actionText: { color: '#A3272E', fontSize: 11, fontWeight: '700', flexShrink: 1 },
  photo: { width: '45%', height: '100%', backgroundColor: '#F8F0EA' }, controls: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  counter: { fontSize: 10, fontWeight: '600', color: '#81737A', minWidth: 38 }, dots: { flexDirection: 'row' }, spacer: { width: 38 }, control: { width: 44, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#CBBFB9' }, dotActive: { width: 18, backgroundColor: '#A3272E' },
});
