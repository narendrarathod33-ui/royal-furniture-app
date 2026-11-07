import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { Check, ChevronRight, X, ZoomIn } from 'lucide-react-native';
import { FabricPreview } from './FabricPreview';
import { ProductPhotoViewer } from './ProductPhotoViewer';
import {
  fabricForSize,
  fabricPriceDelta,
  fabricSelectionLabel,
  fabricGroupsForProduct,
  resolveFabricImage,
  toFabricSelection,
  type Fabric,
  type FabricProduct,
  type FabricType,
} from '../app/data/fabrics';

const INK = '#291F24';
const MUTED = '#74676D';
const RED = '#A3272E';
const LINE = '#E6DDE0';
const money = (value: number) => `AED ${Math.abs(value).toLocaleString('en-US')}`;

type Product = FabricProduct & { n: string };
type Props = {
  visible: boolean;
  product: Product;
  source?: ImageSourcePropType;
  selectedFabric?: Fabric;
  selectedSize?: string;
  onSelect: (fabric: Fabric) => void;
  onClose: () => void;
  onContinue: () => void;
};

function OfficialImage({ source, style, label, cover = false }: { source?: string; style: object; label: string; cover?: boolean }) {
  const resolved = resolveFabricImage(source);
  if (resolved) return <Image source={resolved} style={style} resizeMode={cover ? 'cover' : 'contain'} accessibilityLabel={label} />;
  return <View style={[style, styles.imageMissing]} accessible accessibilityLabel={`${label}, image unavailable`}><X size={16} color={MUTED} /></View>;
}

/** Official fabric/customization popup: mobile sheet, desktop modal. */
export function FabricCustomizer({ visible, product, source, selectedFabric, selectedSize, onSelect, onClose, onContinue }: Props) {
  const window = useWindowDimensions();
  const desktop = window.width >= 840;
  const groups = useMemo(() => fabricGroupsForProduct(product), [product.fabricTypes, product.fabrics]);
  const [typeId, setTypeId] = useState(selectedFabric?.fabricTypeId || groups[0]?.id || '');
  const [zoomOpen, setZoomOpen] = useState(false);
  useEffect(() => {
    if (visible) setTypeId(selectedFabric?.fabricTypeId || groups[0]?.id || '');
    if (!visible) setZoomOpen(false);
  }, [visible, selectedFabric?.fabricTypeId, groups]);
  const activeType = groups.find((type) => type.id === typeId) || groups[0];
  const colours = activeType?.colours.map((fabric) => fabricForSize(fabric, selectedSize)) || [];
  const closeup = resolveFabricImage(selectedFabric?.closeupImage || selectedFabric?.textureImage);
  const zoomPhotos = closeup ? [{ key: 'official-closeup', source: closeup }] : [];
  const delta = fabricPriceDelta(selectedFabric);
  const hasWhitePreview = product.previewBaseStatus === 'white-background' && !!product.baseImage && !!product.maskImage;
  const previewNote = !hasWhitePreview
    ? 'No accepted white-background front image · close-up and swatch only'
    : selectedFabric?.previewUnavailable
      ? 'This colour is close-up only; its white-base render did not pass QA.'
      : selectedFabric?.isCurrent
        ? 'Current Fabric · pure white-background base'
        : selectedFabric?.variantKind === 'white-mask'
          ? 'White-background upholstery preview · official close-up is the colour reference'
          : 'White-base preview unavailable';
  const selectType = (type: FabricType) => {
    setTypeId(type.id);
    if (type.id === selectedFabric?.fabricTypeId) return;
    const firstAvailable = type.colours.map((fabric) => fabricForSize(fabric, selectedSize)).find((fabric) => fabric.inStock);
    if (firstAvailable) onSelect(firstAvailable);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.shade, desktop && styles.desktopShade]}>
        <View
          accessibilityViewIsModal
          accessibilityLabel={`Choose fabric and colour for ${product.n}`}
          testID="fabric-customizer"
          style={[styles.sheet, desktop ? [styles.desktopSheet, { maxHeight: Math.max(480, window.height * 0.92) }] : styles.mobileSheet]}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>CUSTOMIZE YOURS</Text>
              <Text accessibilityRole="header" style={styles.title}>Fabric & colour</Text>
              <Text numberOfLines={1} style={styles.productName}>{product.n}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close fabric customizer" onPress={onClose} style={styles.close}><X size={22} color={INK} /></Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, desktop && styles.desktopContent]}>
            <View style={[styles.previews, desktop && styles.desktopPreviews, !hasWhitePreview && styles.allCloseupPreviews, desktop && !hasWhitePreview && styles.desktopCloseupOnlyPreviews]}>
              {hasWhitePreview && <View style={[styles.previewCard, desktop && styles.desktopProductPreview]}>
                <View style={styles.previewHeading}><Text style={styles.previewLabel}>WHITE-BACKGROUND PREVIEW</Text>{selectedFabric?.previewUnavailable && <Text style={styles.flag}>Close-up only</Text>}</View>
                <View style={[styles.productPreview, desktop && { height: 310 }]}>
                  <FabricPreview product={product} fabric={selectedFabric} source={source} style={styles.fill} />
                </View>
                <Text style={styles.previewNote}>{previewNote}</Text>
              </View>}
              <View style={[styles.previewCard, desktop && styles.desktopCloseupPreview]}>
                <View style={styles.previewHeading}><Text style={styles.previewLabel}>FABRIC CLOSE-UP</Text><ZoomIn size={15} color={MUTED} /></View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={closeup ? `Zoom official close-up of ${selectedFabric?.name || 'fabric'}` : 'Fabric close-up unavailable'}
                  disabled={!closeup}
                  onPress={() => setZoomOpen(true)}
                  style={[styles.closeupButton, desktop && { height: 310 }]}
                >
                  {closeup ? <Image source={closeup} style={styles.closeup} resizeMode="cover" accessibilityLabel={`Official close-up of ${selectedFabric?.name || 'fabric'}`} /> : <Text style={styles.noCloseup}>Close-up unavailable</Text>}
                  {!!closeup && <View style={styles.zoomBadge}><ZoomIn size={17} color="#FFF" /></View>}
                </Pressable>
                <Text numberOfLines={2} style={styles.previewNote}>{selectedFabric?.officialName || selectedFabric?.name || 'Select a colour'}{selectedFabric?.code ? ` · ${selectedFabric.code}` : ''}</Text>
              </View>
            </View>

            <View style={[styles.controls, desktop && styles.desktopControls]}>
              {!hasWhitePreview && <Text style={styles.baseFlagNote}>A product-only front image on a plain white background is required. No lifestyle photo has been recoloured; only the official close-up and swatches are shown.</Text>}
              <Text style={styles.sectionLabel}>Fabric type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow} accessibilityRole="radiogroup" accessibilityLabel="Fabric types">
                {groups.map((type) => {
                  const active = type.id === activeType?.id;
                  return (
                    <Pressable
                      key={type.id}
                      accessibilityRole="radio"
                      accessibilityLabel={`Show ${type.name} colours`}
                      accessibilityState={{ selected: active, checked: active }}
                      aria-checked={active}
                      onPress={() => selectType(type)}
                      style={[styles.typeButton, active && styles.typeButtonActive]}
                    >
                      <OfficialImage source={type.swatchImage} style={styles.typeSwatch} label={`${type.name} material`} cover />
                      <Text style={[styles.typeText, active && styles.typeTextActive]}>{type.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.colourHeading}>
                <Text style={styles.sectionLabel}>Colour · {activeType?.name || ''}</Text>
                <Text style={styles.colourCount}>{colours.length} {colours.length === 1 ? 'option' : 'options'}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colourRow} accessibilityRole="radiogroup" accessibilityLabel={`${activeType?.name || 'Fabric'} colours`}>
                {colours.map((fabric) => {
                  const selected = selectedFabric?.id === fabric.id;
                  const optionDelta = fabricPriceDelta(fabric);
                  const stock = !fabric.inStock ? ', out of stock' : '';
                  const price = optionDelta ? `, ${optionDelta > 0 ? 'plus' : 'minus'} ${money(optionDelta)}` : '';
                  return (
                    <View key={fabric.id} style={styles.colourOption}>
                      <Pressable
                        testID={`fabric-swatch-${fabric.id}`}
                        accessibilityRole="radio"
                        accessibilityLabel={`${fabric.fabricTypeName ? `${fabric.fabricTypeName}, ` : ''}${fabric.name}${fabric.code ? `, ${fabric.code}` : ''}${stock}${price}${fabric.previewUnavailable ? ', preview unavailable, official close-up shown' : ''}`}
                        accessibilityState={{ selected, checked: selected, disabled: !fabric.inStock }}
                        aria-checked={selected}
                        aria-disabled={!fabric.inStock}
                        disabled={!fabric.inStock}
                        onPress={() => onSelect(fabric)}
                        style={[styles.colourButton, selected && styles.colourButtonSelected, !fabric.inStock && styles.colourButtonDisabled]}
                      >
                        <OfficialImage source={fabric.swatchImage || fabric.closeupImage} style={styles.colourImage} label={`${fabric.name} swatch`} cover />
                        {selected && <View style={styles.selectedTick}><Check size={16} color={INK} strokeWidth={3} /></View>}
                        {!fabric.inStock && <View style={styles.outOfStock}><X size={23} color={INK} strokeWidth={2.5} /></View>}
                      </Pressable>
                      <Text numberOfLines={2} style={styles.colourName}>{fabric.name}</Text>
                      <Text numberOfLines={1} style={styles.colourCode}>{fabric.code || 'Code not listed'}</Text>
                      {!fabric.inStock ? <Text style={styles.stockText}>Out of stock</Text> : optionDelta !== 0 ? <Text style={styles.deltaText}>{optionDelta > 0 ? '+' : '−'}{money(optionDelta)}</Text> : null}
                    </View>
                  );
                })}
              </ScrollView>
              <Text style={styles.disclaimer}>Close-up photographs are the material reference. Screen colour can vary; unavailable previews never recolour the product.</Text>
            </View>
          </ScrollView>

          <View style={[styles.footer, desktop && styles.desktopFooter]}>
            <View style={styles.selectionCopy}>
              <Text style={styles.selectionLabel}>SELECTED</Text>
              <Text numberOfLines={2} style={styles.selectionText}>{selectedFabric ? fabricSelectionLabel(toFabricSelection(selectedFabric)) : 'Choose a colour'}</Text>
              {delta !== 0 && <Text style={styles.deltaText}>{delta > 0 ? '+' : '−'}{money(delta)}</Text>}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Continue with ${selectedFabric?.name || 'selected fabric'}`} onPress={onContinue} disabled={!selectedFabric?.inStock} style={[styles.continue, !selectedFabric?.inStock && styles.continueDisabled]}>
              <Text style={styles.continueText}>Continue</Text><ChevronRight size={19} color="#FFF" />
            </Pressable>
          </View>
          <ProductPhotoViewer visible={zoomOpen} photos={zoomPhotos} index={0} onIndexChange={() => {}} name={`${selectedFabric?.name || 'Fabric'} official close-up`} onClose={() => setZoomOpen(false)} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shade: { flex: 1, backgroundColor: '#1D11198C', justifyContent: 'flex-end' },
  desktopShade: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { backgroundColor: '#FCFAFA', overflow: 'hidden', borderColor: '#FFFFFFCC', borderWidth: 1 },
  mobileSheet: { width: '100%', maxHeight: '95%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  desktopSheet: { width: '100%', maxWidth: 1100, height: '92%', borderRadius: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: LINE },
  headerCopy: { flex: 1, minWidth: 0 }, eyebrow: { color: RED, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 }, title: { color: INK, fontSize: 23, fontWeight: '800', marginTop: 3 }, productName: { color: MUTED, fontSize: 12, marginTop: 3 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#F0E9EB' },
  content: { padding: 12, gap: 18 }, desktopContent: { padding: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  previews: { flexDirection: 'row', gap: 8 }, desktopPreviews: { width: '53%', gap: 12 }, allCloseupPreviews: { width: '100%' }, desktopCloseupOnlyPreviews: { width: '38%' }, baseFlagNote: { color: RED, fontSize: 10, lineHeight: 15, backgroundColor: '#F9ECEB', borderRadius: 10, padding: 10, marginBottom: 14 },
  previewCard: { flex: 1, minWidth: 0, backgroundColor: '#F3ECEE', borderRadius: 14, padding: 8, borderWidth: 1, borderColor: LINE }, desktopProductPreview: { flex: 1.25 }, desktopCloseupPreview: { flex: 1 },
  previewHeading: { minHeight: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }, previewLabel: { color: MUTED, fontSize: 8, letterSpacing: 0.6, fontWeight: '800', flexShrink: 1 }, flag: { color: RED, fontSize: 8, fontWeight: '700' },
  productPreview: { height: 145, width: '100%' }, fill: { width: '100%', height: '100%' },
  closeupButton: { height: 145, width: '100%', borderRadius: 9, overflow: 'hidden', backgroundColor: '#E7DFE1', alignItems: 'center', justifyContent: 'center' }, closeup: { width: '100%', height: '100%' }, noCloseup: { color: MUTED, fontSize: 11 }, zoomBadge: { position: 'absolute', right: 7, bottom: 7, width: 32, height: 32, borderRadius: 16, backgroundColor: '#291F24B8', alignItems: 'center', justifyContent: 'center' },
  previewNote: { color: MUTED, fontSize: 9, lineHeight: 13, marginTop: 7, minHeight: 26 },
  controls: { minWidth: 0 }, desktopControls: { flex: 1 },
  sectionLabel: { color: INK, fontSize: 13, fontWeight: '800', marginBottom: 9 }, typeRow: { gap: 8, paddingBottom: 4 },
  typeButton: { minHeight: 48, maxWidth: 170, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFF' }, typeButtonActive: { borderColor: RED, borderWidth: 2, backgroundColor: '#F9ECEB' },
  typeSwatch: { width: 28, height: 28, borderRadius: 14 }, typeText: { color: INK, fontSize: 10, fontWeight: '700', flexShrink: 1 }, typeTextActive: { color: RED },
  colourHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 20 }, colourCount: { color: MUTED, fontSize: 10, marginBottom: 9 },
  colourRow: { gap: 10, paddingVertical: 3, paddingRight: 10 }, colourOption: { width: 76, minHeight: 124 },
  colourButton: { width: 52, height: 52, borderRadius: 26, padding: 3, borderWidth: 2, borderColor: 'transparent', alignSelf: 'center', backgroundColor: '#FFF' }, colourButtonSelected: { borderColor: RED }, colourButtonDisabled: { opacity: 0.48 }, colourImage: { width: '100%', height: '100%', borderRadius: 24, overflow: 'hidden', backgroundColor: '#EEE7E9' },
  selectedTick: { position: 'absolute', right: -3, bottom: -3, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF', borderWidth: 1, borderColor: RED, alignItems: 'center', justifyContent: 'center' }, outOfStock: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  colourName: { color: INK, fontSize: 9, lineHeight: 12, fontWeight: '700', textAlign: 'center', marginTop: 7, minHeight: 24 }, colourCode: { color: MUTED, fontSize: 8, textAlign: 'center', marginTop: 3 }, stockText: { color: RED, fontSize: 8, textAlign: 'center', marginTop: 3 }, deltaText: { color: RED, fontSize: 10, fontWeight: '700', marginTop: 3 },
  disclaimer: { color: MUTED, fontSize: 10, lineHeight: 15, marginTop: 16, maxWidth: 480 }, imageMissing: { backgroundColor: '#E9E2E4', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: LINE, backgroundColor: '#FFF' }, desktopFooter: { paddingHorizontal: 20 },
  selectionCopy: { flex: 1, minWidth: 0 }, selectionLabel: { color: MUTED, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 }, selectionText: { color: INK, fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 3 },
  continue: { minHeight: 48, minWidth: 126, paddingHorizontal: 18, borderRadius: 14, backgroundColor: RED, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, continueDisabled: { opacity: 0.45 }, continueText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
});
