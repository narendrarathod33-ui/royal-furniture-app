import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BedDouble, Baby, Flower2, LayoutGrid, Sofa, UtensilsCrossed } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { royalFurnitureData } from '../../app/data/royalFurnitureData';
import { catalogData } from '../../app/data/catalogData';
import { collapseSizeFamilies } from '../../app/data/sizeVariants';
import { APP_SKIN } from '../../app/skin';
import { t } from '../../app/i18n';
import { Header, SectionTitle } from './ProductCard';
import { COLORS, money, pname, styles as kitStyles, type Product } from './kit';
import { GLASS } from '../../app/ui/glass';

/**
 * Version 2 home — the pitched prototype look: pastel gradient category tiles
 * with bold outline icons, then icon-first product cards. Same engine, same
 * catalog, same honest prices as Version 1; only the presentation differs.
 */

const INK = '#3F3F46';

declare const process: { env: Record<string, string | undefined> };

/** Category slug -> pastel gradient pair (the prototype's palette). */
const TILE_TINTS: Record<string, [string, string]> = {
  all: ['#F7D6CE', '#F2B8AC'],
  sofas: ['#F8CBB8', '#F3AE92'],
  'furniture:dining-room': ['#F4DCA6', '#EDC878'],
  bedroom: ['#F6CFDC', '#EFAEC8'],
  'kids-and-teens': ['#FBD9C8', '#F5BC9E'],
  'household:decor-items': ['#E9D3EF', '#D9B4E4'],
  furniture: ['#F4DCA6', '#EDC878'],
  household: ['#E9D3EF', '#D9B4E4'],
  'cooltech-mattress': ['#C7DFF2', '#A9CBE8'],
};

const CATEGORY_TILES = [
  { key: 'all', labelEn: 'All', tint: TILE_TINTS.all, Icon: Sofa },
  { key: 'sofas', labelEn: 'Sofas', tint: TILE_TINTS.sofas, Icon: Sofa },
  { key: 'furniture:dining-room', labelEn: 'Dining', tint: TILE_TINTS['furniture:dining-room'], Icon: UtensilsCrossed },
  { key: 'bedroom', labelEn: 'Bedroom', tint: TILE_TINTS.bedroom, Icon: BedDouble },
  { key: 'kids-and-teens', labelEn: 'Kids', tint: TILE_TINTS['kids-and-teens'], Icon: Baby },
  { key: 'household:decor-items', labelEn: 'Décor', tint: TILE_TINTS['household:decor-items'], Icon: Flower2 },
];

const CATEGORY_ICONS: Record<string, typeof Sofa> = {
  sofas: Sofa, bedroom: BedDouble, furniture: UtensilsCrossed,
  household: Flower2, 'kids-and-teens': Baby, 'cooltech-mattress': BedDouble,
};

const s = StyleSheet.create({
  tileGrid: { marginHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  tile: { width: '31.5%', height: 116, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)', ...GLASS.chipNoBlur },
  tileIconWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tilePill: { alignSelf: 'center', marginBottom: 9, minHeight: 26, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.78)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  tilePillText: { color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  cardGrid: { marginHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  card: { width: '48.5%', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)', ...GLASS.chipNoBlur, paddingBottom: 12 },
  cardIconWrap: { height: 104, alignItems: 'center', justifyContent: 'center' },
  cardBody: { paddingHorizontal: 11 },
  cardCategory: { color: COLORS.red, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  cardName: { color: COLORS.ink, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  cardPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 5 },
  cardPrice: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  cardWas: { color: COLORS.muted, fontSize: 11, textDecorationLine: 'line-through' },
  cardSizes: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.75)', color: COLORS.red, fontSize: 9, fontWeight: '800', overflow: 'hidden' },
});

function CategoryTileV2({ tile, onPress }: { tile: (typeof CATEGORY_TILES)[number]; onPress: (key: string) => void }) {
  const { Icon } = tile;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={tile.labelEn} onPress={() => onPress(tile.key)} style={s.tile}>
      <LinearGradient colors={tile.tint} style={StyleSheet.absoluteFill} />
      <View style={s.tileIconWrap}><Icon color={INK} size={46} strokeWidth={1.7} /></View>
      <View style={s.tilePill}><Text style={s.tilePillText}>{tile.labelEn}</Text></View>
    </Pressable>
  );
}

/** Icon-first product card: pastel gradient by category, real name and price. */
export function ProductCardV2({ product, onPress }: { product: Product; onPress: (product: Product) => void }) {
  const Icon = CATEGORY_ICONS[product.c] || Sofa;
  const tint = TILE_TINTS[product.c] || TILE_TINTS.all;
  const name = pname(product as { id: string; n: string });
  const hasSizes = (product as { sizeCount?: number }).sizeCount && (product as { sizeCount?: number }).sizeCount! > 1;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${money(product.o)}`} onPress={() => onPress(product)} style={s.card}>
      <LinearGradient colors={tint} style={s.cardIconWrap}><Icon color={INK} size={54} strokeWidth={1.6} /></LinearGradient>
      <View style={s.cardBody}>
        <Text style={s.cardCategory}>{product.scn}</Text>
        <Text style={s.cardName} numberOfLines={2}>{name}</Text>
        <View style={s.cardPriceRow}>
          <Text style={s.cardPrice}>{hasSizes ? `From ${money(product.o)}` : money(product.o)}</Text>
          {!!product.l && product.l > product.o && <Text style={s.cardWas}>{money(product.l)}</Text>}
        </View>
        {!!hasSizes && <Text style={s.cardSizes}>{(product as { sizeCount?: number }).sizeCount} sizes</Text>}
      </View>
    </Pressable>
  );
}

export function HomeContentV2({ onCategory, onProduct, onShop, onBestSellers, cartCount, onCart, onAccount }: { onCategory: (value: string) => void; onProduct: (product: Product) => void; onShop: () => void; onBestSellers: () => void; cartCount: number; onCart: () => void; onAccount: () => void }) {
  void APP_SKIN; // this component only mounts when the build is Version 2
  // Same automated data as V1: biggest actual AED savings first (percentage
  // leaders are usually AED-3 trinkets; savings leaders are real furniture),
  // one card per size family, in-stock only. No hand-picking.
  const deals = collapseSizeFamilies([...(catalogData as unknown as Product[])])
    .filter((product) => product.st !== 'out_of_stock' && product.l > product.o)
    .sort((a, b) => b.l - b.o - (a.l - a.o))
    .slice(0, 6);
  const best = collapseSizeFamilies(royalFurnitureData.products.slice(0, 6) as unknown as Product[]);
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={kitStyles.scrollContent}>
      <Header count={cartCount} onCart={onCart} onAccount={onAccount} />
      <SectionTitle compact title={t('home.shopByCategory')} action={t('home.viewAll')} onPress={() => onCategory('all')} />
      <View style={s.tileGrid}>{CATEGORY_TILES.map((tile) => <CategoryTileV2 key={tile.key} tile={tile} onPress={onCategory} />)}</View>
      <SectionTitle compact title={t('home.amazingDeals')} action={t('home.allDeals')} onPress={onShop} />
      <View style={s.cardGrid}>{deals.map((product) => <ProductCardV2 key={product.id} product={product} onPress={onProduct} />)}</View>
      <SectionTitle compact title={t('home.bestSellers')} action={t('home.viewAll')} onPress={onBestSellers} />
      <View style={s.cardGrid}>{best.map((product) => <ProductCardV2 key={product.id} product={product} onPress={onProduct} />)}</View>
      {/* Keep the prototype's editorial artwork reachable: the pay-later strip. */}
      <Pressable accessibilityRole="button" onPress={onShop} style={[kitStyles.dealsStrip, { marginTop: 18 }]}>
        <Image source={require('../../assets/images/home-deals-strip.webp')} style={kitStyles.dealsStripImage} resizeMode="cover" />
      </Pressable>
    </ScrollView>
  );
}
