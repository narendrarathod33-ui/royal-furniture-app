import { GLASS } from '../app/ui/glass';
import { AdaptiveFrame } from '../hooks/useAdaptiveLayout';
import { useMemo, useRef, useState } from 'react';
import { Platform, Image, type ImageSourcePropType, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Check, ChevronDown, ChevronRight, Grid2X2, Search, X } from 'lucide-react-native';
import { categoryDestinations, searchCategories, type Category, type CategoryDestination, type CategoryLeaf, type CategoryProduct } from '../utils/categoryNavigation';

type Props = {
  sidebar?: boolean;
  categories: readonly Category[];
  products: readonly CategoryProduct[];
  leaves: readonly CategoryLeaf[];
  category: string;
  subcategory: string;
  leaf: string;
  onChange: (category: string, subcategory: string, leaf: string) => void;
  photo: (category: string) => ImageSourcePropType | undefined;
};
const RED = '#DA1921';
const ALL = { category: 'all', subcategory: 'all', leaf: 'all', label: 'All furniture', path: 'All furniture' };
export function BrowseNavigation({ categories, products, leaves, category, subcategory, leaf, onChange, photo, sidebar = false }: Props) {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const trigger = useRef<View>(null);
  const searchInput = useRef<TextInput>(null);
  const destinations = useMemo(() => categoryDestinations(categories, products, leaves), [categories, products, leaves]);
  const matches = useMemo(() => searchCategories(destinations, query), [destinations, query]);
  const parentName = categories.find((item) => item.s === category)?.n;
  const active = destinations.find((item) => item.category === category && item.subcategory === subcategory && item.leaf === leaf);
  const children = destinations.filter((item) => item.category === category && item.subcategory !== 'all' && item.leaf === 'all');
  const close = () => { setOpen(false); setQuery(''); };
  const choose = (destination: CategoryDestination) => { onChange(destination.category, destination.subcategory, destination.leaf); close(); };
  const showExplorer = () => { setExpanded(category === 'all' ? null : category); setQuery(''); setOpen(true); };
  const shortcut = (id: string, label: string) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: category === id }} onPress={() => onChange(id, 'all', 'all')} style={[s.shortcut, category === id && s.shortcutSelected]}>
    {id === 'all' ? <Grid2X2 size={17} color={category === id ? '#fff' : '#62616B'} /> : <Image source={photo(id)} style={s.shortcutPhoto} />}
    <Text style={[s.shortcutLabel, category === id && s.shortcutLabelSelected]}>{label}</Text>
    {category === id && <Check size={13} color="#fff" />}
  </Pressable>;
  const shortcuts = [shortcut('all', 'All'), ...categories.map((item) => shortcut(item.s, item.n))];
  const destinationRow = (destination: CategoryDestination, nested = false) => {
    const selected = destination.category === category && destination.subcategory === subcategory && destination.leaf === leaf;
    return <Pressable key={`${destination.category}:${destination.subcategory}:${destination.leaf}`} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => choose(destination)} style={[s.destination, nested && s.nested, selected && s.destinationSelected]}>
      <View style={s.destinationCopy}><Text style={[s.destinationLabel, selected && s.red]}>{destination.label}</Text>{!!query.trim() && <Text style={s.destinationPath}>{destination.path}</Text>}</View>
      {selected ? <Check size={17} color={RED} /> : <ChevronRight size={15} color="#85838C" />}
    </Pressable>;
  };
  if (sidebar) return <ScrollView testID="browse-sidebar" style={{ width: 260, flexGrow: 0, borderRightWidth: 1, borderColor: '#E4DCD9' }} contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
    <Text accessibilityRole="header" style={[s.title, { fontSize: 22, marginBottom: 18 }]}>Browse furniture</Text>
    {destinationRow(ALL)}
    {categories.map(item => <View key={item.s} style={s.group}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Shop all ${item.n}`} accessibilityState={{ selected: category === item.s }}
        onPress={() => onChange(item.s, 'all', 'all')} style={[s.destination, category === item.s && s.destinationSelected]}>
        <Image source={photo(item.s)} style={s.groupPhoto} /><Text style={[s.destinationLabel, { flex: 1 }, category === item.s && s.red]}>{item.n}</Text>
      </Pressable>
      {category === item.s && <>{destinationRow({ category: item.s, subcategory: 'all', leaf: 'all', label: `Shop all ${item.n}`, path: item.n })}
        {destinations.filter(entry => entry.category === item.s && entry.subcategory !== 'all').map(entry => destinationRow(entry, entry.leaf !== 'all'))}</>}
    </View>)}
  </ScrollView>;
  return <View testID="browse-navigation" style={s.navigation}>
    <View style={s.heading}>
      <View style={s.titleCopy}><Text style={s.eyebrow}>THE ROYAL EDIT</Text><Text accessibilityRole="header" style={s.title}>{parentName || 'Find your kind of home.'}</Text><Text style={s.subtitle}>{parentName ? 'Considered pieces. Made for your everyday.' : 'Good spaces start with something you love.'}</Text></View>
      <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel="All categories" accessibilityState={{ expanded: open }} onPress={showExplorer} style={s.explore}><Grid2X2 size={17} color={RED} /><Text style={s.exploreText}>All categories</Text></Pressable>
    </View>
    {width >= 768 ? <View style={s.desktopShortcuts}>{shortcuts}</View> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shortcutRow} style={s.shortcutScroll}>{shortcuts}</ScrollView>}
    {!!parentName && <View style={s.context}>
      <Pressable accessibilityRole="button" accessibilityLabel="Show all furniture" onPress={() => onChange('all', 'all', 'all')} style={s.breadcrumbButton}><Text style={s.breadcrumb}>Browse</Text></Pressable><ChevronRight size={12} color="#96939D" />
      <Pressable accessibilityRole="button" accessibilityLabel={`Choose a type in ${parentName}`} onPress={showExplorer} style={s.contextChoice}><Text numberOfLines={1} style={s.contextLabel}>{active?.label || `All ${parentName.toLocaleLowerCase()}`}</Text><ChevronDown size={14} color={RED} /></Pressable>
    </View>}
    {!!parentName && children.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.contextScroll} contentContainerStyle={s.contextRow}>
      {[{ category, subcategory: 'all', leaf: 'all', label: `All ${parentName.toLocaleLowerCase()}`, path: parentName }, ...children].map((item) => <Pressable key={item.subcategory} accessibilityRole="button" accessibilityState={{ selected: subcategory === item.subcategory }} onPress={() => onChange(category, item.subcategory, 'all')} style={[s.contextChip, subcategory === item.subcategory && s.contextChipSelected]}><Text style={[s.contextChipText, subcategory === item.subcategory && s.red]}>{item.label}</Text></Pressable>)}
    </ScrollView>}
    <Modal transparent visible={open} animationType={Platform.OS === 'web' ? 'none' : 'slide'} onRequestClose={close} onDismiss={() => trigger.current?.focus()}>
      <AdaptiveFrame><View style={s.scrim}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close category explorer" style={StyleSheet.absoluteFill} onPress={close} />
        <View testID="category-explorer" accessibilityViewIsModal accessibilityLabel="Explore categories" style={s.sheet}>
          <View style={s.sheetHeading}><View><Text style={s.eyebrow}>A PLACE FOR EVERYTHING</Text><Text accessibilityRole="header" style={s.sheetTitle}>Explore categories</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close category explorer" onPress={close} style={s.close}><X size={21} color="#28252C" /></Pressable></View>
          <Pressable testID="category-search-field" style={s.search} accessible={false} focusable={false} onPress={() => searchInput.current?.focus()}><Search size={18} color="#726E78" /><TextInput ref={searchInput} autoFocus caretHidden={false} cursorColor={RED} selectionColor={RED} accessibilityLabel="Find a category" placeholder="Find a category, e.g. corner sofas" placeholderTextColor="#726E78" value={query} onChangeText={setQuery} style={s.searchInput} />{!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear category search" onPress={() => setQuery('')} style={s.close}><X size={17} color="#726E78" /></Pressable>}</Pressable>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetContent}>
            {query.trim() ? <>
              <Text accessibilityLiveRegion="polite" style={s.results}>{matches.length} matching categories</Text>
              {matches.map((item) => destinationRow(item))}
              {!matches.length && <View style={s.noResults}><Text style={s.destinationLabel}>No categories found</Text><Text style={s.subtitle}>Try “sofa”, “bed” or “dining”.</Text><Pressable accessibilityRole="button" style={s.reset} onPress={() => setQuery('')}><Text style={s.exploreText}>Show all categories</Text></Pressable></View>}
            </> : <>
              {destinationRow(ALL)}
              {categories.map((item) => <View key={item.s} style={s.group}>
                <View style={s.groupHeading}><Pressable accessibilityRole="button" accessibilityLabel={`Shop all ${item.n}`} onPress={() => choose({ category: item.s, subcategory: 'all', leaf: 'all', label: item.n, path: item.n })} style={s.groupLink}><Image source={photo(item.s)} style={s.groupPhoto} /><View style={s.destinationCopy}><Text style={s.groupName}>{item.n}</Text><Text style={s.groupHint}>Shop all</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${expanded === item.s ? 'Collapse' : 'Expand'} ${item.n}`} accessibilityState={{ expanded: expanded === item.s }} onPress={() => setExpanded(expanded === item.s ? null : item.s)} style={s.close}><ChevronDown size={18} color="#726E78" style={{ transform: [{ rotate: expanded === item.s ? '180deg' : '0deg' }] }} /></Pressable></View>
                {expanded === item.s && <View testID="category-group-options">{destinations.filter((entry) => entry.category === item.s && entry.subcategory !== 'all').map((entry) => destinationRow(entry, entry.leaf !== 'all'))}</View>}
              </View>)}
            </>}
          </ScrollView>
          <View style={s.sheetFooter}><Text style={s.footerText}>Thoughtfully chosen. Beautifully yours.</Text></View>
        </View>
      </View></AdaptiveFrame>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  navigation: { paddingTop: 12, backgroundColor: '#F6F6F7', ...GLASS.transparent }, heading: { paddingHorizontal: 18, flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 15 }, titleCopy: { flex: 1, minWidth: 0 }, eyebrow: { color: '#8D4F46', fontSize: 9, fontWeight: '800', letterSpacing: 1.6, marginBottom: 7 }, title: { color: '#28252C', fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.7 }, subtitle: { color: '#726E78', fontSize: 11, lineHeight: 17, marginTop: 5 }, explore: { minHeight: 44, borderWidth: 1, borderColor: '#E4DCD9', backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 10, flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 10, ...GLASS.chip }, exploreText: { color: '#B61117', fontSize: 11, fontWeight: '700' },
  shortcutScroll: { flexGrow: 0, height: 54 }, shortcutRow: { paddingHorizontal: 18, gap: 8, alignItems: 'flex-start', paddingBottom: 6 }, desktopShortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 18, paddingBottom: 8 }, shortcut: { minHeight: 46, borderRadius: 15, paddingLeft: 6, paddingRight: 12, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E6E2DF', ...GLASS.chip }, shortcutSelected: { backgroundColor: '#28252C', borderColor: '#28252C', ...GLASS.chipDarkActive }, shortcutPhoto: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EEE9E4' }, shortcutLabel: { color: '#504C54', fontSize: 12, fontWeight: '600' }, shortcutLabelSelected: { color: '#FFF' },
  context: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 5 }, breadcrumbButton: { minHeight: 44, justifyContent: 'center' }, breadcrumb: { color: '#726E78', fontSize: 11 }, contextChoice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 }, contextLabel: { color: '#28252C', fontSize: 11, fontWeight: '700', flexShrink: 1 }, contextScroll: { height: 48, flexGrow: 0 }, contextRow: { paddingHorizontal: 18, gap: 7 }, contextChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: '#E6E2DF', backgroundColor: '#FFF', ...GLASS.chip }, contextChipSelected: { borderColor: '#D8A6A0', backgroundColor: '#F8EEEC', ...GLASS.chipActive }, contextChipText: { color: '#625D66', fontSize: 11, fontWeight: '600' }, red: { color: '#B61117' },
  scrim: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: '#211B2866' }, sheet: { width: '100%', maxWidth: 640, maxHeight: '88%', backgroundColor: '#FAF8F5', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 24, flexShrink: 1, ...GLASS.sheet }, sheetHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, gap: 10 }, sheetTitle: { color: '#28252C', fontWeight: '800', fontSize: 25, letterSpacing: -0.6 }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 16, ...GLASS.chip }, search: { margin: 20, borderWidth: 1, borderColor: '#E3DDD7', borderRadius: 15, minHeight: 50, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', paddingLeft: 14, gap: 9, ...GLASS.input }, searchInput: { flex: 1, minWidth: 0, minHeight: 48, color: '#28252C', fontSize: 13, paddingVertical: 12 }, sheetContent: { paddingHorizontal: 20, paddingBottom: 16 }, destination: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 }, destinationSelected: { backgroundColor: '#F5E8E4' }, destinationCopy: { flex: 1, minWidth: 0 }, destinationLabel: { color: '#504C54', fontSize: 13, fontWeight: '600' }, destinationPath: { color: '#726E78', fontSize: 11, lineHeight: 16, marginTop: 4 }, nested: { paddingLeft: 30 }, results: { color: '#726E78', fontSize: 11, marginBottom: 8 }, noResults: { padding: 20, alignItems: 'center' }, reset: { minHeight: 44, justifyContent: 'center', marginTop: 10 }, group: { borderTopWidth: 1, borderColor: '#E8E2DC', marginTop: 8, paddingTop: 8 }, groupHeading: { flexDirection: 'row', alignItems: 'center' }, groupLink: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 64, paddingVertical: 8, paddingLeft: 8 }, groupPhoto: { width: 45, height: 45, borderRadius: 13, backgroundColor: '#EEE9E4' }, groupName: { color: '#28252C', fontSize: 15, fontWeight: '700' }, groupHint: { color: '#8D4F46', fontSize: 10, marginTop: 4 }, sheetFooter: { borderTopWidth: 1, borderColor: '#E8E2DC', padding: 16 }, footerText: { color: '#82746E', textAlign: 'center', fontSize: 10, letterSpacing: 0.5 },
});
