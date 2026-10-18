import { useMemo, useRef, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronLeft, Palette, Ruler, Search, Sparkles, X } from 'lucide-react-native';
import { AdaptiveProductList } from './AdaptiveProductList';
import { GLASS } from '../app/ui/glass';
import { useAdaptiveLayout } from '../hooks/useAdaptiveLayout';
import { DEFAULT_CUSTOMIZATION_FILTERS, isExplicitlyMadeToOrder, selectMadeToOrder, type CustomizationFilters, type MadeToOrderProduct } from '../utils/madeToOrder';

type Props<T extends MadeToOrderProduct> = {
  products: readonly T[]; categories: readonly {s: string; n: string}[]; header: ReactNode;
  filters: CustomizationFilters; onFiltersChange: (filters: CustomizationFilters) => void;
  onBack: () => void; renderCard: (item: T) => ReactNode;
};
export function CustomizationPage<T extends MadeToOrderProduct>({ products, categories, header, filters, onFiltersChange, onBack, renderCard }: Props<T>) {
  const { width } = useAdaptiveLayout();
  const input = useRef<TextInput>(null);
  const eligible = useMemo(() => products.filter(isExplicitlyMadeToOrder), [products]);
  const results = useMemo(() => selectMadeToOrder(products, filters), [products, filters]);
  const availableCategories = categories.filter(c => eligible.some(p => p.c === c.s));
  const update = (changes: Partial<CustomizationFilters>) => onFiltersChange({ ...filters, ...changes });
  const reset = () => onFiltersChange({ ...DEFAULT_CUSTOMIZATION_FILTERS });
  const intro = <View>
    <View style={[s.hero, width >= 700 && { flexDirection: 'row', alignItems: 'center' }]}>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={s.eyebrow}>CUSTOMIZATION · MADE TO ORDER</Text><Text accessibilityRole="header" style={s.title}>Your home.{`\n`}Your way.</Text><Text style={s.body}>Not every home is the same. Your furniture shouldn’t be either.</Text><Text style={s.note}>Explore pieces explicitly marked Made to Order in our collection. Available sizes, fabrics and colours vary by product.</Text></View>
      {width >= 700 && <Image source={require('../assets/images/catalog-live/the-rainbow-bed.webp')} resizeMode="contain" style={s.heroImage} accessibilityLabel="The Rainbow Bed, made-to-order furniture inspiration" />}
    </View>
    <View style={s.benefits}><View style={s.benefit}><Palette size={18} color="#A3272E" /><Text style={s.benefitText}>Colour & fabric</Text></View><View style={s.benefit}><Ruler size={18} color="#A3272E" /><Text style={s.benefitText}>Size possibilities</Text></View><View style={s.benefit}><Sparkles size={18} color="#A3272E" /><Text style={s.benefitText}>A personal touch</Text></View></View>
    <Text style={s.guidance}>Choose a piece to see its listed options. Confirm custom requirements, availability and lead times with the Royal Furniture team before ordering.</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categories}>
      {[{ s: 'all', n: 'All made to order' }, ...availableCategories].map(c => <Pressable key={c.s} accessibilityRole="button" accessibilityLabel={`Show ${c.n}`} accessibilityState={{ selected: filters.category === c.s }} onPress={() => update({ category: c.s })} style={[s.chip, filters.category === c.s && s.selected]}><Text style={[s.chipText, filters.category === c.s && s.selectedText]}>{c.n}</Text></Pressable>)}
    </ScrollView>
    <View style={s.results}><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.resultTitle}>{results.length} made-to-order {results.length === 1 ? 'piece' : 'pieces'}</Text>
      {(filters.category !== 'all' || filters.query || filters.sort !== 'featured') && <Pressable accessibilityRole="button" accessibilityLabel="Clear customization filters" onPress={reset} style={s.clear}><Text style={s.clearText}>Clear filters</Text></Pressable>}
    </View>
    <View accessibilityRole="radiogroup" accessibilityLabel="Sort made-to-order products" style={s.sorts}>{[['featured','Catalog order'],['priceLow','Price: low to high'],['priceHigh','Price: high to low']].map(([value,label]) => <Pressable key={value} accessibilityRole="radio" aria-checked={filters.sort === value} accessibilityLabel={label} accessibilityState={{ checked: filters.sort === value }} onPress={() => update({ sort: value })} style={[s.sort, filters.sort === value && s.sortSelected]}><Text style={[s.sortText, filters.sort === value && { color: '#A3272E' }]}>{label}</Text></Pressable>)}</View>
  </View>;
  return <View style={{ flex: 1 }}>
    {header}
    <View style={s.topbar}><Pressable accessibilityRole="button" accessibilityLabel="Back to home" onPress={onBack} style={s.back}><ChevronLeft size={22} color="#40202B" /></Pressable>
      <Pressable testID="customization-search-field" accessible={false} focusable={false} style={s.search} onPress={() => input.current?.focus()}><Search size={18} color="#81737A" /><TextInput ref={input} accessibilityLabel="Search made-to-order products" placeholder="Find your made-to-order piece" placeholderTextColor="#81737A" value={filters.query} onChangeText={query => update({ query })} caretHidden={false} cursorColor="#DA1921" selectionColor="#DA1921" style={s.input} />{!!filters.query && <Pressable accessibilityRole="button" accessibilityLabel="Clear customization search" onPress={() => update({ query: '' })} style={s.back}><X size={17} color="#81737A" /></Pressable>}</Pressable>
    </View>
    <AdaptiveProductList key={`${filters.category}:${filters.sort}`} testID="customization-results" data={results} keyExtractor={p => p.id} contentContainerStyle={s.grid} ListHeaderComponent={intro} renderItem={({item}) => <>{renderCard(item)}</>} ListEmptyComponent={<View testID="customization-empty" style={s.empty}><Text style={s.emptyTitle}>Let’s find your kind of piece.</Text><Text style={s.body}>No made-to-order products match these filters. Try another category or search.</Text><Pressable accessibilityRole="button" accessibilityLabel="Reset customization filters" onPress={reset} style={s.reset}><Text style={s.selectedText}>Show all made to order</Text></Pressable></View>} />
  </View>;
}
const s = StyleSheet.create({
  grid: { paddingHorizontal: 16, paddingBottom: 110 }, topbar: { paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', gap: 4, alignItems: 'center' }, back: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, search: { ...GLASS.chip, flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, borderRadius: 14 }, input: { flex: 1, minWidth: 0, minHeight: 46, paddingVertical: 12, fontSize: 12, color: '#40202B' },
  hero: { backgroundColor: '#F8F0EA', borderRadius: 22, padding: 24, marginTop: 4, gap: 20, ...GLASS.chrome }, eyebrow: { color: '#9B5A4D', fontSize: 9, letterSpacing: 1.3, fontWeight: '800' }, title: { color: '#40202B', fontSize: 30, lineHeight: 35, fontWeight: '800', letterSpacing: -1, marginTop: 12 }, body: { color: '#706168', fontSize: 13, lineHeight: 20, marginTop: 12 }, note: { color: '#81737A', fontSize: 11, lineHeight: 18, marginTop: 10 }, heroImage: { width: '32%', maxWidth: 300, aspectRatio: 260 / 210 },
  benefits: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20 }, benefit: { flexDirection: 'row', gap: 7, alignItems: 'center', paddingVertical: 5 }, benefitText: { color: '#706168', fontSize: 11, fontWeight: '700' }, guidance: { color: '#81737A', fontSize: 11, lineHeight: 18, marginTop: 10, marginBottom: 18 }, categories: { gap: 8, paddingBottom: 14 }, chip: { ...GLASS.chip, borderRadius: 22, minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center' }, chipText: { color: '#706168', fontSize: 12, fontWeight: '600' }, selected: { backgroundColor: '#40202B', borderColor: '#40202B' }, selectedText: { color: '#FFF', fontSize: 12, fontWeight: '700' }, results: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }, resultTitle: { color: '#40202B', fontSize: 17, fontWeight: '800' }, clear: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }, clearText: { color: '#A3272E', fontSize: 11, fontWeight: '700' }, sorts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 18 }, sort: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FFF', ...GLASS.chip }, sortSelected: { backgroundColor: '#FAE7E4', ...GLASS.chipActive }, sortText: { color: '#62565B', fontSize: 11, fontWeight: '600' },
  empty: { padding: 24, alignItems: 'center' }, emptyTitle: { color: '#40202B', fontSize: 20, fontWeight: '800', textAlign: 'center' }, reset: { marginTop: 20, borderRadius: 14, backgroundColor: '#DA1921', minHeight: 48, padding: 16, justifyContent: 'center', ...GLASS.accent },
});
