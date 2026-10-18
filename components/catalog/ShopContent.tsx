import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BadgePercent, Check, ChevronDown, ChevronRight, CircleAlert, FileQuestion, Hourglass, Minus, Plus, RotateCcw, Search, SlidersHorizontal, Star, TrendingUp, X } from 'lucide-react-native';
import { catalogData } from '../../app/data/catalogData';
import { dealsCatalog } from '../../app/data/dealsCatalog';
import { catalogLeaves } from '../../app/data/catalogLeaves';
import { leafProducts } from '../../app/data/leafProducts';
import { collapseSizeFamilies } from '../../app/data/sizeVariants';
import { BrowseNavigation } from '../BrowseNavigation';
import { AdaptiveProductList } from '../AdaptiveProductList';
import { DealsPage } from '../DealsPage';
import { COLORS, styles, categoryColors, categoryThumbnail, money, photoFor, shortName, isTrending, photoForCatalogId } from './kit';
import { useAdaptiveLayout, AdaptiveFrame } from '../../hooks/useAdaptiveLayout';
import { Header, ProductCard, SectionTitle } from './ProductCard';
import { royalFurnitureData } from '../../app/data/royalFurnitureData';
import type { Product } from './kit';

export function ShopContent({ products, query, setQuery, category, setCategory, onProduct, saved, onSave, catalogOnly, cartCount, onCart, onAccount, catalogSort = 'trending', onCatalogSortChange }: { products: readonly Product[]; query: string; setQuery: (value: string) => void; category: string; setCategory: (value: string) => void; onProduct: (product: Product) => void; saved: string[]; onSave: (product: Product) => void; catalogOnly?: boolean; catalogSort?: string; onCatalogSortChange?: (sort: string) => void; cartCount: number; onCart: () => void; onAccount: () => void }) { const adaptive = useAdaptiveLayout(); const dealProducts = dealsCatalog as unknown as readonly Product[]; const catalogProducts = catalogData as unknown as readonly Product[]; const initialCategoryParts = category.split(':'); const [catalogMode, setCatalogMode] = useState(!!catalogOnly); const [dealCategory, setDealCategory] = useState(catalogOnly ? initialCategoryParts[0] : 'all'); const [dealSubCategory, setDealSubCategory] = useState(catalogOnly ? (initialCategoryParts[1] || 'all') : 'all'); const [dealLeaf, setDealLeaf] = useState(catalogOnly ? (initialCategoryParts[2] || 'all') : 'all'); const [browseFilterOpen, setBrowseFilterOpen] = useState(false); const [browseSort, setBrowseSort] = useState(catalogSort); const browseSortOptions = [['priceLow', 'Price low to high'], ['priceHigh', 'Price high to low'], ['discount', 'Biggest discount'], ['trending', 'Trending']] as const; const catalogList = useMemo(() => collapseSizeFamilies(catalogProducts.filter((product) => (dealCategory === 'all' || product.c === dealCategory) && (dealSubCategory === 'all' || product.sc === dealSubCategory) && (dealLeaf === 'all' || (leafProducts[dealLeaf as keyof typeof leafProducts] as readonly string[] | undefined)?.includes(product.id)))).sort((a, b) => browseSort === 'priceLow' ? a.o - b.o : browseSort === 'priceHigh' ? b.o - a.o : browseSort === 'discount' ? ((b.l - b.o) / (b.l || 1)) - ((a.l - a.o) / (a.l || 1)) : Number(isTrending(b)) - Number(isTrending(a))), [catalogProducts, dealCategory, dealSubCategory, dealLeaf, browseSort]); if (catalogMode) return <View style={styles.flex}>
  <Header count={cartCount} onCart={onCart} onAccount={onAccount} />
  <View style={{ flex: 1, minHeight: 0, flexDirection: adaptive.sidebar ? 'row' : 'column' }}>
  <BrowseNavigation sidebar={adaptive.sidebar} compact={!adaptive.sidebar} categories={royalFurnitureData.cats} products={catalogProducts} leaves={catalogLeaves} category={dealCategory} subcategory={dealSubCategory} leaf={dealLeaf} photo={categoryThumbnail} onChange={(nextCategory, nextSubcategory, nextLeaf) => {
    setDealCategory(nextCategory); setDealSubCategory(nextSubcategory); setDealLeaf(nextLeaf);
    setCategory([nextCategory, nextSubcategory, nextLeaf].join(':'));
  }} />
<View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{/* A new sort invalidates cached row geometry and the previous product anchor.
    Keep filter state in ShopContent; only the virtualized results list restarts.
    The compact toolbar rides in the list as a sticky header, so sort/categories
    stay reachable while the grid scrolls. */}
<AdaptiveProductList key={browseSort} style={styles.flex} data={catalogList} keyExtractor={(item) => item.id} contentContainerStyle={styles.grid}
  stickyHeaderIndices={[0]}
  ListHeaderComponent={<View style={styles.browseFilterArea}>
    <View style={styles.browseToolbar}>
      <Text accessibilityLiveRegion="polite" style={styles.browseResultCount}>{catalogList.length} pieces</Text>
      <Pressable testID="liquid-control" hitSlop={8} accessibilityRole="button" accessibilityLabel={`Sort products, ${browseSortOptions.find(([value]) => value === browseSort)?.[1]}`} accessibilityState={{ expanded: browseFilterOpen }} onPress={() => setBrowseFilterOpen((open) => !open)} style={styles.browseFilterTrigger}>
        <SlidersHorizontal color={COLORS.red} size={15} />
        <Text style={styles.browseFilterTriggerText}>{browseSort === 'trending' ? 'Trending' : browseSort === 'priceLow' ? 'Price: low to high' : browseSort === 'discount' ? 'Biggest discount' : 'Price: high to low'}</Text>
        <ChevronDown color={COLORS.muted} size={15} style={{ transform: [{ rotate: browseFilterOpen ? '180deg' : '0deg' }] }} />
      </Pressable>
    </View>
    {browseFilterOpen && <View testID="browse-sort-options" accessibilityRole="radiogroup" accessibilityLabel="Sort products" style={styles.browseFilterOptions}>
      {browseSortOptions.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: browseSort === value }} onPress={() => { setBrowseSort(value); onCatalogSortChange?.(value); setBrowseFilterOpen(false); }} style={[styles.subFilter, styles.browseFilterOption, browseSort === value && styles.subFilterActive]}>
        <Text style={[styles.subFilterText, browseSort === value && styles.subFilterTextActive]}>{label}</Text>
        {browseSort === value && <Check color={COLORS.red} size={13} />}
      </Pressable>)}
    </View>}
  </View>}
  renderItem={({ item }) => <ProductCard product={item} onPress={onProduct} saved={saved.includes(item.id)} onSave={onSave} wide />} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No products match these filters</Text><Text style={styles.pageSub}>Try a different category.</Text></View>} /></View></View></View>;
  return <DealsPage products={dealProducts} categories={royalFurnitureData.cats} photo={categoryThumbnail}
    header={<Header count={cartCount} onCart={onCart} onAccount={onAccount} />}
    renderCard={(item) => <ProductCard product={item} onPress={onProduct} saved={saved.includes(item.id)} onSave={onSave} wide />} />;
}
