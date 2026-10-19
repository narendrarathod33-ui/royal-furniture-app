import { useMemo, useRef, useState, type ReactNode } from 'react';
import { catName } from './catalog/kit';
import { Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, type ImageSourcePropType } from 'react-native';
import { ArrowRight, BadgePercent, Check, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { AdaptiveFrame, useAdaptiveLayout } from '../hooks/useAdaptiveLayout';
import { AdaptiveProductList } from './AdaptiveProductList';
import { GLASS } from '../app/ui/glass';
import { activeDealFilterCount, DEAL_DISCOUNTS, DEAL_PRICES, DEAL_SORTS, DEFAULT_DEAL_FILTERS, selectDeals, type DealFilters, type DealProduct } from '../utils/deals';

type Category = { s: string; n: string };
type Props<T extends DealProduct> = {
  products: readonly T[]; categories: readonly Category[]; header: ReactNode;
  photo: (category: string) => ImageSourcePropType | undefined;
  renderCard: (item: T & { sizeCount?: number; baseName?: string }) => ReactNode;
};
const RED = '#DA1921';
export function DealsPage<T extends DealProduct>({ products, categories, header, photo, renderCard }: Props<T>) {
  const adaptive = useAdaptiveLayout();
  const [filters, setFilters] = useState<DealFilters>({ ...DEFAULT_DEAL_FILTERS });
  const [draft, setDraft] = useState<DealFilters>({ ...DEFAULT_DEAL_FILTERS });
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const input = useRef<TextInput>(null);
  const trigger = useRef<View>(null);
  const results = useMemo(() => selectDeals(products, filters, query), [products, filters, query]);
  const preview = useMemo(() => selectDeals(products, draft, query), [products, draft, query]);
  const activeCount = activeDealFilterCount(filters);
  const reset = () => { setFilters({ ...DEFAULT_DEAL_FILTERS }); setQuery(''); };
  const close = () => { setOpen(false); if (Platform.OS === 'web') trigger.current?.focus(); };
  const change = (key: keyof DealFilters, value: string | number) => setDraft(current => ({ ...current, [key]: value }));
  const remove = (key: keyof DealFilters) => setFilters(current => ({ ...current, [key]: DEFAULT_DEAL_FILTERS[key] }));
  const categoryName = categories.find(c => c.s === filters.category)?.n || 'All categories';
  const summary = DEAL_SORTS.find(([key]) => key === filters.sort)?.[1];
  const choice = (key: keyof DealFilters, value: string | number, label: string, detail?: string) => {
    const selected = draft[key] === value;
    return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }}
      onPress={() => change(key, value)} style={[s.choice, selected && s.choiceSelected]}>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={[s.choiceText, selected && s.red]}>{label}</Text>{detail && <Text style={s.choiceDetail}>{detail}</Text>}</View>
      <View style={[s.radio, selected && s.radioSelected]}>{selected && <Check size={13} color="#FFF" />}</View>
    </Pressable>;
  };
  const pill = (key: keyof DealFilters | 'query', label: string) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Remove ${label} filter`}
    onPress={() => key === 'query' ? setQuery('') : remove(key)} style={s.activePill}><Text style={s.activePillText}>{label}</Text><X size={13} color="#A5272C" /></Pressable>;
  const listHeader = <View>
    <View style={[s.hero, adaptive.width >= 600 && s.heroWide]}>
      <View style={s.heroCopy}><View style={s.offer}><BadgePercent size={14} color="#F8D4AE" /><Text style={s.offerText}>OVER 40% OFF</Text></View>
        <Text accessibilityRole="header" style={[s.heroTitle, adaptive.width >= 600 && { fontSize: 32, lineHeight: 37 }]}>Good design.{`\n`}Even better prices.</Text>
        <Text style={s.heroBody}>Considered pieces. Unexpected savings.{`\n`}Find something you’ll love coming home to.</Text>
      </View>
      {adaptive.width >= 600 && <View style={[s.heroPhotoWrap, adaptive.width >= 840 ? { width: 264, height: 192 } : { width: 208, height: 174 }]}><Image source={require('../assets/images/home-sofas.webp')} style={s.heroPhoto} resizeMode="cover" /><View style={s.photoLabel}><Text style={s.photoLabelText}>A little more home.</Text></View></View>}
    </View>
    <Pressable testID="deals-search-field" style={s.search} accessible={false} focusable={false} onPress={() => input.current?.focus()}>
      <Search size={19} color="#80767A" /><TextInput ref={input} accessibilityLabel="Search deals" placeholder="Find your next favourite piece" placeholderTextColor="#80767A"
        value={query} onChangeText={setQuery} caretHidden={false} selectionColor={RED} cursorColor={RED} style={s.searchInput} />
      {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear deals search" onPress={() => setQuery('')} style={s.iconButton}><X size={17} color="#70666B" /></Pressable>}
    </Pressable>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categories}>
      {[{ s: 'all', n: 'All deals' }, ...categories].map(c => <Pressable key={c.s} accessibilityRole="button" accessibilityState={{ selected: filters.category === c.s }}
        onPress={() => setFilters(current => ({ ...current, category: c.s }))} style={[s.category, filters.category === c.s && s.categorySelected]}>
        <Text style={[s.categoryText, filters.category === c.s && { color: '#FFF' }]}>{catName(c)}</Text>
      </Pressable>)}
    </ScrollView>
    <View style={s.toolbar}><View style={{ flex: 1, minWidth: 0 }}><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.resultTitle}>{results.length} {results.length === 1 ? 'deal' : 'deals'} to discover</Text><Text style={s.resultSubtitle}>{summary}</Text></View>
      <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`Filter and sort deals${activeCount ? `, ${activeCount} active filters` : ''}`} accessibilityState={{ expanded: open }}
        onPress={() => { setDraft({ ...filters }); setOpen(true); }} style={s.filterButton}><SlidersHorizontal size={17} color={RED} /><Text style={s.filterButtonText}>Filter & sort</Text>
        {!!activeCount && <View style={s.count}><Text style={s.countText}>{activeCount}</Text></View>}
      </Pressable>
    </View>
    {(!!activeCount || !!query) && <View testID="active-deal-filters" style={s.activeRow}>
      {filters.category !== 'all' && pill('category', categoryName)}
      {filters.discount !== 41 && pill('discount', `${filters.discount}%+ off`)}
      {filters.price !== 'all' && pill('price', DEAL_PRICES.find(([key]) => key === filters.price)?.[1] || filters.price)}
      {!!query && pill('query', `“${query}”`)}
      <Pressable accessibilityRole="button" accessibilityLabel="Clear all deal filters" onPress={reset} style={s.clearButton}><Text style={s.clearText}>Clear all</Text></Pressable>
    </View>}
  </View>;
  return <View style={{ flex: 1 }}>
    {header}
    <AdaptiveProductList key={JSON.stringify(filters)} testID="deals-results" data={results} keyExtractor={item => item.id}
      contentContainerStyle={s.grid} ListHeaderComponent={listHeader} renderItem={({ item }) => <>{renderCard(item)}</>}
      ListEmptyComponent={<View testID="deals-empty-state" style={s.empty}><View style={s.emptyIcon}><Search size={26} color={RED} /></View><Text style={s.emptyTitle}>A different find awaits.</Text><Text style={s.emptyBody}>No deals match this combination. Try another category or give your budget a little more room.</Text><Pressable accessibilityRole="button" onPress={reset} style={s.primary}><Text style={s.primaryText}>Explore all deals</Text><ArrowRight size={17} color="#FFF" /></Pressable></View>} />
    <Modal transparent visible={open} animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={close} onDismiss={() => trigger.current?.focus()}>
      <AdaptiveFrame><View style={[s.scrim, adaptive.width >= 600 && !adaptive.compactHeight && { justifyContent: 'center', padding: 24 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss deal filters" onPress={close} style={StyleSheet.absoluteFill} />
        <SafeAreaView testID="deals-filter-sheet" accessibilityViewIsModal accessibilityLabel="Filter and sort deals" style={[s.sheet, adaptive.width < 600 ? { maxHeight: '100%', borderRadius: 0 } : { maxHeight: '92%' }]}>
          <View style={s.sheetHeader}><View style={{ flex: 1 }}><Text style={s.eyebrow}>MAKE IT YOURS</Text><Text accessibilityRole="header" style={s.sheetTitle}>Filter & sort</Text><Text style={s.sheetHint}>Your next find, on your terms.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close deal filters" onPress={close} style={s.iconButton}><X size={22} color="#33242C" /></Pressable></View>
          <ScrollView testID="deals-filter-body" keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetBody}>
            <Text accessibilityRole="header" style={s.sectionTitle}>Category</Text><Text style={s.sectionHint}>Choose a room or a little finishing touch.</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Deal category" style={s.categoryGrid}>
              {[{ s: 'all', n: 'All categories' }, ...categories].map(c => <Pressable key={c.s} accessibilityRole="radio" accessibilityLabel={c.n} accessibilityState={{ checked: draft.category === c.s }} onPress={() => change('category', c.s)}
                style={[s.categoryTile, { width: adaptive.width < 350 ? '100%' : '48.5%' }, draft.category === c.s && s.choiceSelected]}>
                {c.s === 'all' ? <View style={s.tileIcon}><BadgePercent size={20} color={RED} /></View> : <Image source={photo(c.s)} resizeMode="cover" style={s.tileImage} />}
                <Text style={[s.tileText, draft.category === c.s && s.red]}>{catName(c)}</Text>{draft.category === c.s && <Check size={14} color={RED} />}
              </Pressable>)}
            </View>
            <View style={s.rule} /><Text accessibilityRole="header" style={s.sectionTitle}>Minimum saving</Text><Text style={s.sectionHint}>Every deal starts at more than 40% off.</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Minimum saving" style={s.options}>{DEAL_DISCOUNTS.map(([value, label]) => choice('discount', value, label, value === 41 ? 'All Royal deals' : undefined))}</View>
            <View style={s.rule} /><Text accessibilityRole="header" style={s.sectionTitle}>Your budget</Text><Text style={s.sectionHint}>Prices in AED, before any delivery charges.</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Deal price" style={s.options}>{DEAL_PRICES.map(([value, label]) => choice('price', value, label))}</View>
            <View style={s.rule} /><Text accessibilityRole="header" style={s.sectionTitle}>Sort your finds</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Deal sort order" style={s.options}>{DEAL_SORTS.map(([value, label]) => choice('sort', value, label))}</View>
          </ScrollView>
          <View style={s.sheetFooter}><View style={s.footerMeta}><Text accessibilityLiveRegion="polite" style={s.previewText}>{preview.length} matching {preview.length === 1 ? 'deal' : 'deals'}</Text><Text style={s.footerHint}>Changes apply when you’re ready.</Text></View>
            <View style={s.footerActions}><Pressable accessibilityRole="button" accessibilityLabel="Reset deal filter choices" onPress={() => setDraft({ ...DEFAULT_DEAL_FILTERS })} style={s.resetButton}><Text style={s.resetText}>Reset</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Show ${preview.length} deals`} onPress={() => { setFilters({ ...draft }); close(); }} style={[s.primary, { flex: 1 }]}><Text style={s.primaryText}>Show {preview.length} deals</Text><ArrowRight size={17} color="#FFF" /></Pressable></View>
          </View>
        </SafeAreaView>
      </View></AdaptiveFrame>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  grid: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 110 },
  hero: { borderRadius: 22, backgroundColor: '#40202B', padding: 24, overflow: 'hidden', flexDirection: 'row', gap: 24, marginBottom: 20 },
  heroWide: { padding: 28, alignItems: 'center' }, heroCopy: { flex: 1, minWidth: 0 }, offer: { flexDirection: 'row', alignItems: 'center', gap: 7 }, offerText: { color: '#F8D4AE', fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  heroTitle: { color: '#FFF8F2', fontSize: 28, lineHeight: 33, fontWeight: '800', letterSpacing: -0.8, marginTop: 14 }, heroBody: { color: '#E5CFD5', fontSize: 12, lineHeight: 19, marginTop: 12 },
  heroPhotoWrap: { width: 180, height: 174, borderRadius: 18, overflow: 'hidden' }, heroPhoto: { width: '100%', height: '100%' }, photoLabel: { position: 'absolute', bottom: 10, left: 10, right: 10, borderRadius: 8, padding: 9, backgroundColor: '#FFF8F2E8' }, photoLabelText: { color: '#40202B', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  search: { ...GLASS.panelStrong, minHeight: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 6, marginBottom: 16 }, searchInput: { flex: 1, minWidth: 0, minHeight: 50, paddingVertical: 13, fontSize: 13, color: '#33242C' },
  categories: { gap: 8, paddingBottom: 18 }, category: { ...GLASS.chip, minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, justifyContent: 'center' }, categorySelected: { backgroundColor: '#40202B', borderColor: '#40202B' }, categoryText: { color: '#62565B', fontSize: 12, fontWeight: '600' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, marginBottom: 10 }, resultTitle: { color: '#33242C', fontSize: 17, fontWeight: '800' }, resultSubtitle: { color: '#776A70', fontSize: 11, marginTop: 5 },
  filterButton: { ...GLASS.chip, borderRadius: 14, paddingHorizontal: 12, minHeight: 46, flexDirection: 'row', gap: 7, alignItems: 'center' }, filterButtonText: { color: '#A3232B', fontSize: 12, fontWeight: '700' }, count: { width: 20, height: 20, borderRadius: 10, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' }, countText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  activeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 18 }, activePill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FAE7E4', borderRadius: 12, minHeight: 44, paddingHorizontal: 12, paddingVertical: 9, maxWidth: '100%' }, activePillText: { color: '#A5272C', fontSize: 11, fontWeight: '600', flexShrink: 1 }, clearButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, clearText: { color: '#71656B', textDecorationLine: 'underline', fontSize: 11, fontWeight: '600' },
  scrim: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: '#211B2866' }, sheet: { width: '100%', maxWidth: 640, flex: 1, minHeight: 0, borderRadius: 26, overflow: 'hidden', backgroundColor: '#FAF8F5', ...GLASS.sheet },
  sheetHeader: { padding: 22, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderBottomWidth: 1, borderColor: '#EAE2DD' }, eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.8, color: '#9B5A4D', marginBottom: 7 }, sheetTitle: { color: '#33242C', fontSize: 26, fontWeight: '800', letterSpacing: -0.7 }, sheetHint: { color: '#81737A', fontSize: 12, marginTop: 6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, ...GLASS.chip }, sheetBody: { padding: 20, paddingBottom: 28 }, sectionTitle: { color: '#33242C', fontSize: 17, fontWeight: '800', marginBottom: 5 }, sectionHint: { color: '#81737A', fontSize: 11, lineHeight: 17, marginBottom: 14 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 9 }, categoryTile: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, minHeight: 62, borderWidth: 1, borderColor: '#E7DFDA', borderRadius: 14, backgroundColor: '#FFF' }, tileImage: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F1ECE7' }, tileIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F9EAE4', alignItems: 'center', justifyContent: 'center' }, tileText: { color: '#62565B', fontSize: 12, fontWeight: '600', flex: 1 },
  options: { gap: 8, marginTop: 8 }, choice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#E7DFDA', backgroundColor: '#FFF', borderRadius: 14, minHeight: 52, padding: 14 }, choiceSelected: { borderColor: '#BD6F63', backgroundColor: '#FBEFEA' }, choiceText: { color: '#62565B', fontSize: 13, fontWeight: '600' }, choiceDetail: { color: '#9A7E76', fontSize: 11, marginTop: 4 }, red: { color: '#AC332E' }, radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: '#D1C7C1', alignItems: 'center', justifyContent: 'center' }, radioSelected: { backgroundColor: '#AC332E', borderColor: '#AC332E' }, rule: { height: 1, backgroundColor: '#EAE2DD', marginVertical: 24 },
  sheetFooter: { padding: 18, borderTopWidth: 1, borderColor: '#EAE2DD', backgroundColor: '#FFFCF9', ...GLASS.barTop }, footerMeta: { marginBottom: 12 }, previewText: { color: '#33242C', fontSize: 12, fontWeight: '700' }, footerHint: { color: '#81737A', fontSize: 10, marginTop: 3 }, footerActions: { flexDirection: 'row', gap: 12 }, resetButton: { minWidth: 80, minHeight: 48, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0D4CC', borderRadius: 14, ...GLASS.buttonGhost }, resetText: { color: '#706168', fontSize: 13, fontWeight: '700' }, primary: { backgroundColor: RED, borderRadius: 14, minHeight: 48, paddingHorizontal: 18, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, ...GLASS.accent }, primaryText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, maxWidth: 460, alignSelf: 'center' }, emptyIcon: { width: 60, height: 60, backgroundColor: '#FAE7E4', borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, emptyTitle: { color: '#33242C', fontSize: 22, fontWeight: '800', textAlign: 'center' }, emptyBody: { color: '#81737A', fontSize: 13, lineHeight: 20, textAlign: 'center', marginVertical: 14 },
});
