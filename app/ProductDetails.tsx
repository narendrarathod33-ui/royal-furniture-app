import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronRight, Heart, RefreshCw, ShoppingBag } from 'lucide-react-native';

type ProductDetailsProduct = {
  id: string;
  n: string;
  c: string;
  scn?: string;
  d?: string;
  o: number;
  z?: unknown;
  sp?: unknown;
};

type DetailRow = { label?: string; value?: string };
type ApiColor = {
  name?: string;
  hex?: string;
  fabric_color_info?: { color_name?: string; color_hex?: string; fabric_name?: string };
  info_section?: {
    material?: DetailRow[];
    dimensions?: DetailRow[];
    specs?: DetailRow[];
    warranty?: DetailRow[];
    assembly?: DetailRow[];
  };
};
type ApiProductDetail = {
  general_information?: string;
  product_info?: {
    is_customizable?: boolean;
    is_size_customizable?: boolean;
    delivery_estimate_days?: string;
  };
  primary_images?: { fabric_color_info?: { color_name?: string; color_hex?: string } };
  variants?: Array<{
    name?: string;
    fabricsList?: Array<{ name?: string; colorsList?: ApiColor[] }>;
  }>;
};
type SizePriceOption = { name: string; price: number; listPrice?: number; optionKey: string };
type ProductOptionData = {
  sizes: string[];
  fabrics: string[];
  colors: { name: string; hex?: string }[];
  sizePrices: SizePriceOption[];
  rows: DetailRow[];
};

const COLORS = {
  ink: '#101828',
  red: '#C0392B',
  cream: '#F3F4F6',
  line: '#E5E7EB',
  muted: '#4A5565',
  white: '#FFFFFF',
  green: '#24734A',
};

const money = (value: number) => `AED ${value.toLocaleString('en-US')}`;
const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

export const isMadeToOrderText = (value?: string) => /\bmade[\s-]+to[\s-]+order\b/i.test(value || '');

function addColor(colors: Map<string, { name: string; hex?: string }>, name?: string, hex?: string) {
  const cleanName = name?.trim();
  if (!cleanName) return;
  const key = cleanName.toLocaleLowerCase();
  const existing = colors.get(key);
  const validHex = hex && /^#[\da-f]{6}$/i.test(hex) ? hex : undefined;
  colors.set(key, { name: cleanName, hex: existing?.hex || validHex });
}

function getLocalOptions(product: ProductDetailsProduct): ProductOptionData {
  const sizes: string[] = [];
  const fabrics: string[] = [];
  const colors = new Map<string, { name: string; hex?: string }>();
  const sizeGroups: { name: string; options: SizePriceOption[] }[] = [];
  const rows: DetailRow[] = [];

  if (Array.isArray(product.z)) {
    for (const rawVariant of product.z) {
      if (!Array.isArray(rawVariant)) continue;
      const sizeName = typeof rawVariant[0] === 'string' ? rawVariant[0] : '';
      if (sizeName) sizes.push(sizeName);
      if (!Array.isArray(rawVariant[1])) continue;
      const sizeOptions: SizePriceOption[] = [];
      for (const rawFabric of rawVariant[1]) {
        if (!Array.isArray(rawFabric)) continue;
        const fabricName = typeof rawFabric[0] === 'string' ? rawFabric[0] : '';
        if (fabricName) fabrics.push(fabricName);
        if (!Array.isArray(rawFabric[2])) continue;
        for (const rawColor of rawFabric[2]) {
          if (Array.isArray(rawColor)) addColor(colors, typeof rawColor[0] === 'string' ? rawColor[0] : undefined, typeof rawColor[1] === 'string' ? rawColor[1] : undefined);
          if (!sizeName || !Array.isArray(rawColor)) continue;
          const price = Number(rawColor[2]);
          if (!Number.isFinite(price) || price <= 0) continue;
          const colorName = typeof rawColor[0] === 'string' ? rawColor[0] : '';
          const listPrice = Number(rawColor[3]);
          sizeOptions.push({
            name: sizeName,
            price,
            listPrice: Number.isFinite(listPrice) && listPrice > 0 ? listPrice : undefined,
            optionKey: `${fabricName.toLocaleLowerCase()}|${colorName.toLocaleLowerCase()}`,
          });
        }
      }
      if (sizeOptions.length) sizeGroups.push({ name: sizeName, options: sizeOptions });
    }
  }

  if (product.sp && typeof product.sp === 'object') {
    for (const [section, rawRows] of Object.entries(product.sp)) {
      if (!Array.isArray(rawRows)) continue;
      for (const rawRow of rawRows) {
        if (Array.isArray(rawRow) && typeof rawRow[0] === 'string' && typeof rawRow[1] === 'string') {
          rows.push({ label: `${section}: ${rawRow[0]}`, value: rawRow[1] });
        }
      }
    }
  }

  const allSizeOptions = sizeGroups.flatMap((group) => group.options);
  const defaultOption = allSizeOptions.find((option) => option.price === product.o) || allSizeOptions[0];
  const sizePrices = sizeGroups.map((group) => group.options.find((option) => option.optionKey === defaultOption?.optionKey) || group.options[0]);
  return { sizes: unique(sizes), fabrics: unique(fabrics), colors: [...colors.values()], sizePrices, rows };
}

function extractApiOptions(detail: ApiProductDetail | null): ProductOptionData {
  const sizes: string[] = [];
  const fabrics: string[] = [];
  const colors = new Map<string, { name: string; hex?: string }>();
  const rows: DetailRow[] = [];

  for (const variant of detail?.variants || []) {
    if (variant.name) sizes.push(variant.name);
    for (const fabric of variant.fabricsList || []) {
      if (fabric.name) fabrics.push(fabric.name);
      for (const color of fabric.colorsList || []) {
        const infoName = color.fabric_color_info?.color_name;
        const colorName = infoName && !/^selectable$/i.test(infoName) ? infoName : color.name || infoName;
        addColor(
          colors,
          colorName,
          color.fabric_color_info?.color_hex || color.hex,
        );
        const info = color.info_section;
        rows.push(...(info?.material || []), ...(info?.dimensions || []), ...(info?.specs || []), ...(info?.warranty || []), ...(info?.assembly || []));
      }
    }
  }

  const primaryColor = detail?.primary_images?.fabric_color_info;
  addColor(colors, primaryColor?.color_name, primaryColor?.color_hex);
  return { sizes: unique(sizes), fabrics: unique(fabrics), colors: [...colors.values()], sizePrices: [], rows };
}

function sizeFromProductId(id: string) {
  const encodedSize = id.split('::size=')[1];
  if (!encodedSize) return '';
  try {
    return decodeURIComponent(encodedSize);
  } catch {
    return '';
  }
}

function extractTitleColors(title: string) {
  const colorNames = ['off-white', 'dark grey', 'light grey', 'navy blue', 'dark walnut', 'multicolor', 'multi-colour', 'beige', 'brown', 'walnut', 'black', 'white', 'grey', 'gray', 'cream', 'ivory', 'gold', 'silver', 'blue', 'pink', 'green', 'red', 'yellow', 'orange', 'oak', 'teak'];
  const matches = colorNames.filter((color) => new RegExp(`\\b${color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(title));
  return unique(matches.map((color) => color.replace(/\b\w/g, (letter) => letter.toUpperCase())));
}

function extractTextSizes(text: string) {
  const sizes = text.match(/\b\d{2,3}\s*(?:×|x|\*)\s*\d{2,3}(?:\s*(?:×|x|\*)\s*\d{1,3})?\s*(?:cm)?\b/gi) || [];
  return unique(sizes.map((size) => size.replace(/\s+/g, ' ').trim()));
}

function dedupeRows(rows: DetailRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.label || !row.value) return false;
    const key = `${row.label.toLowerCase()}|${row.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function ProductDetails({
  product,
  photoSource,
  onBack,
  onSave,
  onAdd,
  isSaved,
}: {
  product: ProductDetailsProduct;
  photoSource?: ImageSourcePropType;
  onBack: () => void;
  onSave: () => void;
  onAdd: (variant: { size?: string; price: number; listPrice?: number }) => void;
  isSaved: boolean;
}) {
  const sourceId = product.id.split('::size=')[0];
  const slug = sourceId.replace(/^\d+-/, '');
  const [detail, setDetail] = useState<ApiProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const local = useMemo(() => getLocalOptions(product), [product]);
  const live = useMemo(() => extractApiOptions(detail), [detail]);
  const cartSize = sizeFromProductId(product.id);
  const defaultSizeOption = local.sizePrices.find((option) => option.name === cartSize)
    || local.sizePrices.find((option) => option.price === product.o)
    || local.sizePrices[0];
  const hasDifferentSizePrices = new Set(local.sizePrices.map((option) => option.price)).size > 1;
  const [selectedSize, setSelectedSize] = useState(defaultSizeOption?.name || '');
  const selectedSizeOption = local.sizePrices.find((option) => option.name === selectedSize) || defaultSizeOption;
  const selectedPrice = hasDifferentSizePrices ? selectedSizeOption?.price ?? product.o : product.o;
  const selectedListPrice = hasDifferentSizePrices ? selectedSizeOption?.listPrice : undefined;
  const productName = product.n.replace(/\s+—\s+Size:\s+.*$/, '');

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(false);
    setLoading(true);

    fetch(`https://rylqus.ae/api/products/product-detail/${encodeURIComponent(slug)}/`, {
      headers: { locale: 'en', country: 'ae' },
    })
      .then((response) => {
        if (!response.ok) throw new Error('Product details unavailable');
        return response.json();
      })
      .then((payload: { data?: ApiProductDetail }) => {
        if (!payload.data) throw new Error('Product details unavailable');
        if (active) setDetail(payload.data);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [slug, reload]);

  const description = [product.d, detail?.general_information].filter(Boolean).join('\n\n');
  const sizes = unique([...live.sizes, ...local.sizes]);
  const textSizes = extractTextSizes(`${productName} ${description}`);
  const displaySizes = sizes.length ? sizes : textSizes;
  const fabrics = unique([...live.fabrics, ...local.fabrics]);
  const colorMap = new Map<string, { name: string; hex?: string }>();
  [...local.colors, ...live.colors].forEach((color) => addColor(colorMap, color.name, color.hex));
  const displayColors = [...colorMap.values()];
  const titleColors = displayColors.length ? [] : extractTitleColors(productName);
  const detailRows = dedupeRows([...live.rows, ...local.rows]).slice(0, 10);
  const madeToOrder = isMadeToOrderText(description);
  const isCustomizable = detail?.product_info?.is_customizable;
  const isSizeCustomizable = detail?.product_info?.is_size_customizable;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to collection" onPress={onBack} style={styles.back}>
          <ChevronRight color={COLORS.ink} size={20} style={styles.backIcon} />
          <Text style={styles.backText}>Back to collection</Text>
        </Pressable>

        <View style={styles.imageWrap}>
          {photoSource ? <Image source={photoSource} style={styles.image} resizeMode="cover" /> : <Text style={styles.imageFallback}>{productName.slice(0, 1)}</Text>}
        </View>

        <View style={styles.productIntro}>
          {!!product.scn && <Text style={styles.category}>{product.scn}</Text>}
          <Text style={styles.name}>{productName}</Text>
          <Text style={styles.price}>{money(selectedPrice)}</Text>
          {!!selectedListPrice && selectedListPrice > selectedPrice && <Text style={styles.oldPrice}>{money(selectedListPrice)}</Text>}
        </View>

        <View style={styles.sourceStatus} accessibilityLiveRegion="polite">
          {loading ? (
            <>
              <ActivityIndicator size="small" color={COLORS.red} />
              <Text style={styles.statusLoading}>Checking official product details…</Text>
            </>
          ) : error ? (
            <>
              <Text style={styles.statusError}>Official details couldn’t be loaded. Showing saved catalog information where available.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Retry loading official product details" onPress={() => setReload((value) => value + 1)} style={styles.retry}>
                <RefreshCw color={COLORS.ink} size={15} />
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.statusSuccess}>Official product options checked</Text>
          )}
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Product options</Text>
          <FactRow label="Made to order" value={madeToOrder ? 'Yes — stated in the product description' : 'Not stated in the available listing'} />
          <FactRow
            label="Customization"
            value={isCustomizable === true ? 'Available' : isCustomizable === false ? 'Not available' : /\b(select|choose|customi[sz])\w*/i.test(description) ? 'Described in the product listing' : 'Not specified'}
          />
          {hasDifferentSizePrices ? (
            <View style={styles.sizeSelection}>
              <Text style={styles.sizeLabel}>Choose size</Text>
              <View style={styles.sizeOptions}>
                {local.sizePrices.map((option) => {
                  const selectedOption = selectedSize === option.name;
                  return (
                    <Pressable
                      key={option.name}
                      accessibilityRole="radio"
                      accessibilityLabel={`${option.name}, ${money(option.price)}`}
                      accessibilityState={{ selected: selectedOption }}
                      onPress={() => setSelectedSize(option.name)}
                      style={[styles.sizeOption, selectedOption && styles.sizeOptionSelected]}
                    >
                      <Text style={[styles.sizeOptionName, selectedOption && styles.sizeOptionNameSelected]}>{option.name}</Text>
                      <Text style={[styles.sizeOptionPrice, selectedOption && styles.sizeOptionNameSelected]}>{money(option.price)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.sizeHint}>Price updates with your selected size.</Text>
              {isSizeCustomizable === true && <Text style={styles.sizeHint}>Custom sizing is also available.</Text>}
            </View>
          ) : (
            <FactRow
              label="Size options"
              value={displaySizes.length ? displaySizes.join(' · ') : 'Not listed'}
              note={isSizeCustomizable === true ? 'Custom sizing is available.' : undefined}
            />
          )}
          <FactRow label="Fabrics" value={fabrics.length ? fabrics.join(' · ') : 'Not listed'} />
          <View style={styles.colorFact}>
            <Text style={styles.factLabel}>Colors</Text>
            {displayColors.length ? (
              <View style={styles.colorList}>
                {displayColors.map((color) => (
                  <View key={color.name} style={styles.colorPill}>
                    {color.hex ? <View style={[styles.swatch, { backgroundColor: color.hex }]} /> : null}
                    <Text style={styles.colorName}>{color.name}</Text>
                  </View>
                ))}
              </View>
            ) : titleColors.length ? (
              <Text style={styles.factValue}>{titleColors.join(' · ')} <Text style={styles.mutedNote}>(from product name)</Text></Text>
            ) : /\b(select|choose)\w*\s+(?:the\s+)?(?:fabric\s+and\s+)?colou?r/i.test(description) ? (
              <Text style={styles.factValue}>Selectable — available shades aren’t listed</Text>
            ) : (
              <Text style={styles.factValue}>Not listed</Text>
            )}
          </View>
        </View>

        {!!detailRows.length && (
          <View style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>Dimensions & specifications</Text>
            {detailRows.map((row, index) => <FactRow key={`${row.label}-${index}`} label={row.label || ''} value={row.value || ''} />)}
          </View>
        )}

        {!!description && (
          <View style={styles.descriptionCard}>
            <Text style={styles.sectionTitle}>About this piece</Text>
            <Text style={styles.description}>{description}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.actionBar}>
        <Pressable accessibilityRole="button" accessibilityLabel={isSaved ? 'Remove from saved items' : 'Save product'} onPress={onSave} style={styles.saveButton}>
          <Heart size={20} color={isSaved ? COLORS.red : COLORS.ink} fill={isSaved ? COLORS.red : 'transparent'} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => onAdd({ size: hasDifferentSizePrices ? selectedSizeOption?.name : undefined, price: selectedPrice, listPrice: selectedListPrice })} style={styles.addButton}>
          <ShoppingBag color={COLORS.white} size={18} />
          <Text style={styles.addButtonText}>Add to bag · {money(selectedPrice)}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function FactRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <View style={styles.factTextGroup}>
        <Text style={styles.factValue}>{value}</Text>
        {!!note && <Text style={styles.mutedNote}>{note}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cream },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 12 },
  backIcon: { transform: [{ rotate: '180deg' }], marginRight: 4 },
  backText: { color: COLORS.ink, fontSize: 14, fontWeight: '600' },
  imageWrap: { minHeight: 250, aspectRatio: 1, borderRadius: 18, backgroundColor: '#E6E0D9', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  imageFallback: { color: COLORS.ink, fontSize: 64, fontWeight: '700' },
  productIntro: { paddingTop: 18, paddingBottom: 16 },
  category: { color: COLORS.red, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  name: { color: COLORS.ink, fontSize: 25, lineHeight: 31, fontWeight: '800', marginTop: 5 },
  price: { color: COLORS.ink, fontSize: 21, fontWeight: '800', marginTop: 8 },
  oldPrice: { color: COLORS.muted, fontSize: 13, textDecorationLine: 'line-through', marginTop: 3 },
  sourceStatus: { minHeight: 42, borderRadius: 12, backgroundColor: COLORS.white, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  statusLoading: { color: COLORS.muted, fontSize: 12, flex: 1 },
  statusError: { color: COLORS.muted, fontSize: 12, lineHeight: 17, flex: 1 },
  statusSuccess: { color: COLORS.green, fontSize: 12, fontWeight: '700' },
  retry: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  retryText: { color: COLORS.ink, fontSize: 12, fontWeight: '700' },
  detailsCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 14 },
  sectionTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  factRow: { minHeight: 50, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  factLabel: { color: COLORS.muted, fontSize: 13, lineHeight: 19, flex: 0.8 },
  factTextGroup: { flex: 1.2, alignItems: 'flex-end' },
  factValue: { color: COLORS.ink, fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'right' },
  mutedNote: { color: COLORS.muted, fontSize: 11, lineHeight: 16, textAlign: 'right' },
  sizeSelection: { paddingTop: 12, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line, gap: 8 },
  sizeLabel: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  sizeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeOption: { width: '48%', minHeight: 58, justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: COLORS.white },
  sizeOptionSelected: { borderColor: COLORS.red, backgroundColor: '#FEF3F2' },
  sizeOptionName: { color: COLORS.ink, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  sizeOptionPrice: { color: COLORS.muted, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  sizeOptionNameSelected: { color: COLORS.red },
  sizeHint: { color: COLORS.muted, fontSize: 11, lineHeight: 15 },
  colorFact: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line },
  colorList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  colorPill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 9, paddingVertical: 5 },
  swatch: { width: 15, height: 15, borderRadius: 8, borderWidth: 1, borderColor: '#D0D5DD' },
  colorName: { color: COLORS.ink, fontSize: 11, fontWeight: '600' },
  descriptionCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 12 },
  description: { color: COLORS.muted, fontSize: 14, lineHeight: 22 },
  actionBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: COLORS.line, backgroundColor: COLORS.white },
  saveButton: { minWidth: 50, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: COLORS.line },
  addButton: { minHeight: 50, flex: 1, borderRadius: 14, backgroundColor: COLORS.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 12 },
  addButtonText: { color: COLORS.white, fontSize: 14, fontWeight: '800' },
});
