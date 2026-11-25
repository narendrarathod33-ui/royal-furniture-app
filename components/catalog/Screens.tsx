import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, TextInput, View, Text, FlatList } from 'react-native';
import { Heart, Search, Star, TrendingUp } from 'lucide-react-native';
import { catalogData } from '../../app/data/catalogData';
import { royalFurnitureData } from '../../app/data/royalFurnitureData';
import { collapseSizeFamilies } from '../../app/data/sizeVariants';
import { AdaptiveProductList } from '../AdaptiveProductList';
import { Header, ProductCard } from './ProductCard';
import { COLORS, money, photoFor, shortName, styles, isBestSeller, categoryColors, catName, pscn } from './kit';
import { t } from '../../app/i18n';
import type { Product } from './kit';
import { getScrollMemory, saveScrollMemory } from '../../utils/scrollMemory';

export type SearchFilterState = { query: string; category: string; subcategory: string };

export function SearchContent({ onProduct, cartCount, onCart, onAccount, searchState, onSearchStateChange }: { onProduct: (product: Product) => void; cartCount: number; onCart: () => void; onAccount: () => void; searchState?: SearchFilterState; onSearchStateChange?: (next: SearchFilterState) => void }) {
  const searchInput = useRef<TextInput>(null);
  const products = catalogData as unknown as readonly Product[];
  const [localState, setLocalState] = useState<SearchFilterState>({ query: '', category: 'all', subcategory: 'all' });
  const state = searchState ?? localState;
  const setState = (patch: Partial<SearchFilterState>) => {
    const next = { ...state, ...patch };
    if (onSearchStateChange) onSearchStateChange(next);
    else setLocalState(next);
  };
  const { query, category, subcategory } = state;
  const subcategories = useMemo(() => [...new Map(products.filter((product) => category !== 'all' && product.c === category && product.sc).map((product) => [product.sc, product.scn])).entries()], [products, category]);
  const allCollapsed = useMemo(() => collapseSizeFamilies(products), [products]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (category === 'all' && subcategory === 'all' && !q) return allCollapsed;
    return collapseSizeFamilies(products.filter((product) => (category === 'all' || product.c === category) && (subcategory === 'all' || product.sc === subcategory) && (!q || `${product.n} ${product.scn} ${product.d}`.toLowerCase().includes(q))));
  }, [products, allCollapsed, category, subcategory, query]);
  const searchSig = `${category}:${subcategory}:${query}`;
  const savedSearchScroll = getScrollMemory('search', searchSig);
  return <View style={styles.flex}><Header count={cartCount} onCart={onCart} onAccount={onAccount} /><View style={styles.searchPage}><Text style={styles.searchTitle}>{t('search.title')}</Text><Text style={styles.searchSub}>{t('search.sub')}</Text><Pressable testID="product-search-field" style={styles.searchBox} accessible={false} focusable={false} onPress={() => searchInput.current?.focus()}><Search color={COLORS.muted} size={19} /><TextInput ref={searchInput} accessibilityLabel={t('search.fieldLabel')} caretHidden={false} autoFocus={!savedSearchScroll?.offset} placeholder={t('search.placeholder')} placeholderTextColor={COLORS.muted} value={query} onChangeText={(nextQuery) => setState({ query: nextQuery })} style={styles.searchInput} selectionColor={COLORS.red} cursorColor={COLORS.red} /></Pressable></View><Text style={styles.searchLabel}>{t('search.categories')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.searchChipScroll} contentContainerStyle={styles.compactFilterRow}><Pressable onPress={() => setState({ category: 'all', subcategory: 'all' })} hitSlop={8} style={[styles.filter, category === 'all' && styles.filterActive]}><Text style={[styles.filterText, category === 'all' && styles.filterTextActive]}>{t('search.all')}</Text></Pressable>{royalFurnitureData.cats.map((cat) => <Pressable key={cat.s} onPress={() => setState({ category: cat.s, subcategory: 'all' })} hitSlop={8} style={[styles.filter, category === cat.s && styles.filterActive]}><Text style={[styles.filterText, category === cat.s && styles.filterTextActive]}>{catName(cat)}</Text></Pressable>)}</ScrollView>{subcategory !== 'all' && subcategories.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.searchChipScroll} contentContainerStyle={styles.compactFilterRow}>{[['all', t('search.allInCategory')], ...subcategories].map(([value, label]) => <Pressable key={value} onPress={() => setState({ subcategory: value })} hitSlop={8} style={[styles.subFilter, subcategory === value && styles.subFilterActive]}><Text style={[styles.subFilterText, subcategory === value && styles.subFilterTextActive]}>{pscn(label)}</Text></Pressable>)}</ScrollView>}<View style={styles.searchResultsHeader}><Text style={styles.resultCount}>{query || category !== 'all' ? `${t('shop.results', { n: results.length })}` : t('shop.browseAll')}</Text></View><AdaptiveProductList key={searchSig} style={styles.flex} data={results} keyExtractor={(item) => item.id} restoreScrollOffset={savedSearchScroll?.offset} restoreAnchorId={savedSearchScroll?.anchorId} onSaveScroll={(offset, anchorId) => saveScrollMemory('search', searchSig, offset, anchorId)} contentContainerStyle={styles.grid} renderItem={({ item }) => <ProductCard product={item} wide onPress={onProduct} />} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>{t('shop.noProducts')}</Text><Text style={styles.pageSub}>{t('shop.tryAnother')}</Text></View>} /></View>;
}

export function NewArrivalsContent({ onProduct, cartCount, onCart, onAccount }: { onProduct: (product: Product) => void; cartCount: number; onCart: () => void; onAccount: () => void }) {
  const products = useMemo(() => collapseSizeFamilies(royalFurnitureData.products.slice(0, 24)), []);
  const savedScroll = getScrollMemory('arrivals', 'arrivals');
  return <View style={styles.flex}><Header count={cartCount} onCart={onCart} onAccount={onAccount} /><View style={styles.shopHead}><Text style={styles.pageTitle}>New arrivals</Text><Text style={styles.pageSub}>The latest pieces added to the Royal Furniture collection, sourced from the official UAE catalog.</Text></View><View style={styles.arrivalsHero}><Star color={COLORS.gold} size={24} fill={COLORS.gold} /><View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.arrivalsHeroTitle}>Just in</Text><Text style={styles.arrivalsHeroBody}>Fresh furniture, bedroom pieces and home accents.</Text></View></View><View style={styles.resultsRow}><Text style={styles.resultCount}>{products.length} new pieces</Text><Text style={styles.arrivalsDate}>Official catalog · {royalFurnitureData.captured}</Text></View><AdaptiveProductList data={products} keyExtractor={(item) => item.id} restoreScrollOffset={savedScroll?.offset} restoreAnchorId={savedScroll?.anchorId} onSaveScroll={(offset, anchorId) => saveScrollMemory('arrivals', 'arrivals', offset, anchorId)} contentContainerStyle={styles.grid} renderItem={({ item }) => <ProductCard product={item} onPress={onProduct} wide />} /></View>;
}

/** The Best sellers section's own page — only the items flagged for the section. */
export function BestSellersContent({ onProduct, cartCount, onCart, onAccount }: { onProduct: (product: Product) => void; cartCount: number; onCart: () => void; onAccount: () => void }) {
  const products = useMemo(() => collapseSizeFamilies(royalFurnitureData.products.filter(isBestSeller)), []);
  const savedScroll = getScrollMemory('bestSellers', 'bestSellers');
  return <View style={styles.flex}><Header count={cartCount} onCart={onCart} onAccount={onAccount} /><View style={styles.shopHead}><Text style={styles.pageTitle}>Best sellers</Text><Text style={styles.pageSub}>The pieces shoppers reach for most — every item the Royal catalogue flags as a Best Seller or Trending piece.</Text></View><View style={styles.arrivalsHero}><TrendingUp color={COLORS.red} size={24} /><View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.arrivalsHeroTitle}>Most loved pieces</Text><Text style={styles.arrivalsHeroBody}>Best sellers and trending items, straight from the official catalog.</Text></View></View><View style={styles.resultsRow}><Text style={styles.resultCount}>{products.length} best sellers</Text><Text style={styles.arrivalsDate}>Official catalog · {royalFurnitureData.captured}</Text></View><AdaptiveProductList data={products} keyExtractor={(item) => item.id} restoreScrollOffset={savedScroll?.offset} restoreAnchorId={savedScroll?.anchorId} onSaveScroll={(offset, anchorId) => saveScrollMemory('bestSellers', 'bestSellers', offset, anchorId)} contentContainerStyle={styles.grid} renderItem={({ item }) => <ProductCard product={item} onPress={onProduct} wide />} /></View>;
}
