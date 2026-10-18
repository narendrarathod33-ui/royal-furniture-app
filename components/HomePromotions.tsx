import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useAdaptiveLayout } from '../hooks/useAdaptiveLayout';
import { GLASS } from '../app/ui/glass';
import { COLORS } from './catalog/kit';
import { wrapSlideIndex } from '../utils/gallery';

const promotions = [
  { key: 'deals', eyebrow: 'THE ROYAL EDIT', title: 'More home.\nLess spend.', support: 'Upto 50% off across the collection.', action: 'Explore deals', category: 'all', image: require('../assets/images/catalog-live/dayana-corner-sofa-f8ea56.webp') },
  { key: 'customization', eyebrow: 'MADE TO ORDER', title: 'Your home.\nYour way.', support: 'Made-to-order pieces in your fabric and size.', action: 'Customize your space', category: 'customization', image: require('../assets/images/catalog-live/the-rainbow-bed.webp') },
  { key: 'kids', eyebrow: 'LITTLE SPACES, BIG IDEAS', title: 'Room for little\ndreamers.', support: 'Playful, sturdy furniture for growing rooms.', action: 'Explore kids’ rooms', category: 'kids-and-teens', image: require('../assets/images/catalog-live/bunny-kids-bed-200x140-single-size.webp') },
] as const;

const AUTOPLAY_MS = 6000;
const AUTOPLAY_PAUSE_MS = 10000;

/** Full-bleed editorial hero: the photograph leads, text rides a warm scrim,
 * one red CTA per slide. Swipe/paging/labels preserved; autoplay pauses after
 * manual navigation and never runs the overlay into an error state (each
 * slide degrades to its own fallback while the CTA keeps working). */
export function HomePromotions({ onShop, onCategory, onCustomize }: { onCustomize: () => void; onShop: () => void; onCategory: (category: string) => void }) {
  const { width, height, fontScale } = useAdaptiveLayout();
  const [measured, setMeasured] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  /** Photo lifecycle per slide: loading → loaded | error (fallback panel). */
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const carousel = useRef<ScrollView>(null);
  const lastManual = useRef(0);
  const pageWidth = Math.max(1, measured ?? width - 32);
  const cardHeight = (height < 480 ? 148 : width < 600 ? 196 : width < 840 ? 238 : 264) * Math.max(1, fontScale);
  const go = (index: number, manual = false) => {
    if (manual) lastManual.current = Date.now();
    const next = wrapSlideIndex(index, promotions.length);
    setActive(next);
    carousel.current?.scrollTo({ x: next * pageWidth, animated: true });
  };
  useEffect(() => {
    // Keep the same promotion, aligned to its new full-width page after resizing.
    carousel.current?.scrollTo({ x: active * pageWidth, animated: false });
  }, [pageWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Gentle autoplay everywhere; pauses after any manual navigation.
    const timer = setInterval(() => {
      if (Date.now() - lastManual.current < AUTOPLAY_PAUSE_MS) return;
      go(active + 1);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [active, pageWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  const onPress = (promotion: (typeof promotions)[number]) => () => {
    lastManual.current = Date.now();
    if (promotion.category === 'customization') onCustomize();
    else if (promotion.category === 'all') onShop();
    else onCategory(promotion.category);
  };
  return <View testID="home-promotions" style={s.panel}>
    <ScrollView ref={carousel} onLayout={event => setMeasured(event.nativeEvent.layout.width)} horizontal pagingEnabled snapToInterval={pageWidth} decelerationRate="fast" showsHorizontalScrollIndicator={false}
      style={{ height: cardHeight, flexGrow: 0 }} scrollEventThrottle={32}
      onScroll={Platform.OS === 'web' ? event => setActive(Math.max(0, Math.min(promotions.length - 1, Math.round(event.nativeEvent.contentOffset.x / pageWidth)))) : undefined}
      onMomentumScrollEnd={event => setActive(Math.max(0, Math.min(promotions.length - 1, Math.round(event.nativeEvent.contentOffset.x / pageWidth))))}>
      {promotions.map(promotion => {
        const slideFailed = failed[promotion.key];
        return <View key={promotion.key} testID="home-promotion-slide" style={{ width: pageWidth, height: cardHeight, backgroundColor: '#F3E9DD' }}>
          {!slideFailed && <Image source={promotion.image} accessibilityLabel={promotion.key === 'kids' ? 'Children’s room inspiration' : 'Furniture inspiration'}
            style={[StyleSheet.absoluteFillObject, { opacity: loaded[promotion.key] ? 1 : 0 }]} resizeMode="cover"
            onLoad={() => setLoaded((state) => ({ ...state, [promotion.key]: true }))}
            onError={() => setFailed((state) => ({ ...state, [promotion.key]: true }))} />}
          {/* Warm editorial scrim: solid enough for contrast at the copy edge,
              transparent over the furniture so the photo stays the focus. */}
          <LinearGradient pointerEvents="none" style={StyleSheet.absoluteFillObject} colors={['rgba(250,246,239,0.96)', 'rgba(250,246,239,0.82)', 'rgba(250,246,239,0)']} locations={[0, 0.42, 0.78]} />
          <View style={s.copy}>
            <Text style={s.eyebrow}>{promotion.eyebrow}</Text>
            <Text accessibilityRole="header" style={[s.title, width >= 600 && { fontSize: 30, lineHeight: 34 }]}>{promotion.title}</Text>
            <Text style={[s.support, width >= 600 && { fontSize: 13, lineHeight: 18 }]}>{promotion.support}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={promotion.action} onPress={onPress(promotion)} style={s.action}>
              <Text style={s.actionText}>{promotion.action}</Text>
              <ArrowRight size={15} color="#FFF" />
            </Pressable>
          </View>
          {slideFailed && <View pointerEvents="none" style={s.fallback}><Text style={s.fallbackInitial}>{promotion.title.slice(0, 1)}</Text><Text style={s.fallbackText}>Photo unavailable</Text></View>}
          {!loaded[promotion.key] && !slideFailed && <ActivityIndicator style={s.spinner} color={COLORS.red} />}
        </View>;
      })}
    </ScrollView>
    <View pointerEvents="box-none" style={s.overlay}>
      <View style={s.dots}>{promotions.map((p, index) => <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={`Show promotion ${index + 1}`} accessibilityState={{ selected: active === index }} onPress={() => go(index, true)} style={s.control}><View style={[s.dot, active === index && s.dotActive]} /></Pressable>)}</View>
      <View style={s.arrowsPill}>
        <Text accessibilityLiveRegion="polite" style={s.counter}>{active + 1} / {promotions.length}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous promotion" onPress={() => go(active - 1, true)} style={s.control}><ChevronLeft size={16} color={COLORS.ink} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next promotion" onPress={() => go(active + 1, true)} style={s.control}><ChevronRight size={16} color={COLORS.ink} /></Pressable>
      </View>
    </View>
  </View>;
}
const s = StyleSheet.create({
  panel: { marginHorizontal: 16, borderRadius: 22, overflow: 'hidden', backgroundColor: '#F3E9DD' },
  copy: { position: 'absolute', left: 0, bottom: 0, top: 0, width: '72%', maxWidth: 430, paddingHorizontal: 20, paddingBottom: 54, justifyContent: 'flex-end' },
  eyebrow: { color: COLORS.red, fontSize: 9, letterSpacing: 1.6, fontWeight: '800' },
  title: { color: '#40202B', fontSize: 25, lineHeight: 29, fontWeight: '800', letterSpacing: -0.6, marginTop: 7 },
  support: { color: '#6D5A55', fontSize: 11, lineHeight: 15, marginTop: 6, maxWidth: 260 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 38, paddingHorizontal: 15, borderRadius: 19, backgroundColor: COLORS.red, alignSelf: 'flex-start', marginTop: 10, ...GLASS.accent },
  actionText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  fallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 4 },
  fallbackInitial: { fontSize: 56, fontWeight: '800', color: '#D8C4B2' },
  fallbackText: { color: COLORS.muted, fontSize: 11 },
  spinner: { position: 'absolute', right: 14, bottom: 14 },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  dots: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.72)', paddingHorizontal: 4, ...GLASS.chip },
  arrowsPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.78)', ...GLASS.chip },
  counter: { fontSize: 10, fontWeight: '700', color: '#6D5A55', minWidth: 34, paddingHorizontal: 4 },
  control: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#CBBFB9' }, dotActive: { width: 16, backgroundColor: COLORS.red },
});
