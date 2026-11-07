import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import ProductDetails from '../app/ProductDetails';
import { FabricPreview, FABRIC_CROSSFADE_MS } from '../components/FabricPreview';
import { FabricCustomizer } from '../components/FabricCustomizer';
import { catalogData } from '../app/data/catalogData';
import { fabricForSize, fabricSelectionLabel, initialFabric, productWithFabric, toFabricSelection, type Fabric } from '../app/data/fabrics';
import { getFabricProduct } from '../app/data/fabricCatalog';
import { cartLineId, useCartStore } from '../stores/cart';
import { useFabricChoiceStore } from '../stores/fabricChoices';
import { loadJSON } from '../stores/appStorage';
import { orderItemsText } from '../utils/orders';
import type { OrderRecord, Product } from '../components/catalog/kit';
import { byProps, firstByProps, flattenText } from './test-utils';

const serafinaBase = catalogData.find((product) => product.id === '7072-serafina-corner-sofa') as unknown as Product;
const trentoBase = catalogData.find((product) => product.id === '6219-trento-single-seater-sofa') as unknown as Product;
const serafina = { ...serafinaBase, ...getFabricProduct(serafinaBase.id) } as Product;
const trento = { ...trentoBase, ...getFabricProduct(trentoBase.id) } as Product;
const serafinaChoices = serafina.fabrics!.filter((fabric) => fabric.inStock && !fabric.isCurrent);
const enabledChoices = serafinaChoices.length >= 3 ? serafinaChoices : serafina.fabrics!.filter((fabric) => fabric.inStock);
const lightGrey = enabledChoices[0].id;
const pebble = enabledChoices[1].id;
const paleMint = enabledChoices[2].id;
const pebbleOption = serafina.fabrics!.find((fabric) => fabric.id === pebble)!;
const unavailableYellow = trento.fabrics!.find((fabric) => !fabric.inStock)!.id;
const swatch = (root: any, id: string) => firstByProps(root, { testID: `fabric-swatch-${id}` });

beforeEach(() => {
  useCartStore.getState().resetUserData();
  useFabricChoiceStore.getState().resetUserData();
});

async function openCustomizer(root: any) {
  await fireEvent(firstByProps(root, { testID: 'fabric-selector' }), 'press');
}

test('official fabrics select instantly, crossfade for 180ms, and retain the verified catalogue price', async () => {
  expect(FABRIC_CROSSFADE_MS).toBeGreaterThanOrEqual(150);
  expect(FABRIC_CROSSFADE_MS).toBeLessThanOrEqual(200);
  const onAdd = jest.fn();
  const screen = await render(<ProductDetails product={serafina} onBack={() => {}} onSave={() => {}} onAdd={onAdd} isSaved={false} />);

  expect(byProps(screen.root, { testID: 'fabric-selector' })).toHaveLength(1);
  await openCustomizer(screen.root);
  expect(byProps(screen.root, { testID: 'fabric-customizer' })).toHaveLength(1);
  const initial = initialFabric(serafina)!;
  if (initial.fabricTypeId) await fireEvent(screen.root.queryAll((node: any) => node.props.accessibilityLabel === `Show ${initial.fabricTypeName} colours`, {})[0], 'press');
  expect(swatch(screen.root, initial.id).props.accessibilityState.selected).toBe(true);
  expect(flattenText(screen.root)).toContain('AED 3,000');
  if (pebbleOption.fabricTypeId) await fireEvent(screen.root.queryAll((node: any) => node.props.accessibilityLabel === `Show ${pebbleOption.fabricTypeName} colours`, {})[0], 'press');

  await fireEvent(swatch(screen.root, pebble), 'press');
  expect(swatch(screen.root, pebble).props.accessibilityState.selected).toBe(true);
  expect(byProps(screen.root, { testID: `fabric-preview-${pebble}` }).length).toBeGreaterThan(0);
  expect(flattenText(screen.root)).toContain(pebbleOption.name);
  expect(flattenText(screen.root)).toContain(`AED ${(serafinaBase.o + (pebbleOption.priceDelta || 0)).toLocaleString('en-US')}`);

  const add = screen.root.queryAll((node: any) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Add to bag'), {})[0];
  await fireEvent(add, 'press');
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
    price: serafinaBase.o + (pebbleOption.priceDelta || 0),
    fabric: expect.objectContaining({ id: pebble, name: pebbleOption.name, priceDelta: pebbleOption.priceDelta || 0 }),
  }));
  await screen.unmount();
  const restored = await render(<ProductDetails product={serafina} onBack={() => {}} onSave={() => {}} onAdd={() => {}} isSaved={false} />);
  await openCustomizer(restored.root);
  if (pebbleOption.fabricTypeId) await fireEvent(restored.root.queryAll((node: any) => node.props.accessibilityLabel === `Show ${pebbleOption.fabricTypeName} colours`, {})[0], 'press');
  expect(swatch(restored.root, pebble).props.accessibilityState.selected).toBe(true);
  await restored.unmount();
});

test('an officially out-of-stock colour cannot replace the available selection', async () => {
  const screen = await render(<ProductDetails product={trento} onBack={() => {}} onSave={() => {}} onAdd={() => {}} isSaved={false} />);
  await openCustomizer(screen.root);
  const initialOption = initialFabric(trento)!;
  const initial = initialOption.id;
  if (initialOption.fabricTypeId) await fireEvent(screen.root.queryAll((node: any) => node.props.accessibilityLabel === `Show ${initialOption.fabricTypeName} colours`, {})[0], 'press');
  expect(swatch(screen.root, initial).props.accessibilityState.selected).toBe(true);
  const unavailable = trento.fabrics!.find((fabric) => fabric.id === unavailableYellow)!;
  if (unavailable.fabricTypeId) await fireEvent(screen.root.queryAll((node: any) => node.props.accessibilityLabel === `Show ${unavailable.fabricTypeName} colours`, {})[0], 'press');
  await fireEvent(swatch(screen.root, unavailableYellow), 'press');
  expect(swatch(screen.root, unavailableYellow).props.accessibilityState.disabled).toBe(true);
  expect(flattenText(screen.root)).toContain(initialOption.name);
  expect(flattenText(screen.root)).toContain(`AED ${(trentoBase.o + (initialOption.priceDelta || 0)).toLocaleString('en-US')}`);
});

test('products without named official colours keep the original detail UI', async () => {
  const base = catalogData.find((product) => !(product as unknown as Product).fabrics && !getFabricProduct(product.id)) || catalogData[0];
  const product = { ...base, id: 'fixture-without-official-options', fabrics: undefined, fabricTypes: undefined } as Product;
  const screen = await render(<ProductDetails product={product} onBack={() => {}} onSave={() => {}} onAdd={() => {}} isSaved={false} />);
  expect(byProps(screen.root, { testID: 'fabric-selector' })).toHaveLength(0);
  expect(byProps(screen.root, { testID: `fabric-preview-${lightGrey}` })).toHaveLength(0);
  await screen.unmount();
});

test('an unmasked fabric leaves the original photograph untouched', async () => {
  const fabric: Fabric = { id: 'test-black', name: 'Test black', hex: '#101215', inStock: true };
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const screen = await render(<FabricPreview product={{ id: 'unmasked-test-product', fabrics: [fabric] }} fabric={fabric} source={{ uri: 'https://example.invalid/sofa.jpg' }} />);
  // In particular, no full-frame backgroundColor/tint fallback may reappear.
  const colouredLayers = screen.root.queryAll((node: any) => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.backgroundColor === fabric.hex || style?.tintColor === fabric.hex;
  }, {});
  expect(colouredLayers).toHaveLength(0);
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('keeping the original photograph unchanged'));
  warning.mockRestore();
});

test('same product with different official fabrics stays on separate quantity-controlled cart lines', () => {
  const light = toFabricSelection(serafina.fabrics!.find((fabric) => fabric.id === lightGrey)!);
  const mint = toFabricSelection(serafina.fabrics!.find((fabric) => fabric.id === paleMint)!);
  const lightProduct = productWithFabric(serafina, light) as Product;
  const mintProduct = productWithFabric(serafina, mint) as Product;
  const store = useCartStore.getState();

  store.addToCart(lightProduct);
  store.addToCart(mintProduct);
  store.addToCart(mintProduct);
  let cart = useCartStore.getState().cart;
  expect(cart).toHaveLength(2);
  expect(cart.map((item) => item.product.o)).toEqual([serafinaBase.o + (serafina.fabrics!.find((fabric) => fabric.id === lightGrey)?.priceDelta || 0), serafinaBase.o + (serafina.fabrics!.find((fabric) => fabric.id === paleMint)?.priceDelta || 0)]);
  expect(cart.find((item) => item.product.selectedFabric?.id === paleMint)?.quantity).toBe(2);
  expect(new Set(cart.map(cartLineId)).size).toBe(2);

  const mintLine = cart.find((item) => item.product.selectedFabric?.id === paleMint)!;
  store.decrease(cartLineId(mintLine));
  cart = useCartStore.getState().cart;
  expect(cart.find((item) => item.product.selectedFabric?.id === paleMint)?.quantity).toBe(1);
  expect(cart.find((item) => item.product.selectedFabric?.id === lightGrey)?.quantity).toBe(1);

  const persisted = loadJSON<{ cart: typeof cart }>('rf-cart-v1');
  expect(persisted?.cart.map((item) => item.product.selectedFabric?.id)).toEqual([lightGrey, paleMint]);
});

test('wishlist fabric id/name/price persist with the saved product metadata', () => {
  const selected = toFabricSelection(serafina.fabrics!.find((fabric) => fabric.id === pebble)!);
  useCartStore.getState().toggleSaved(serafina.id, selected);
  expect(useCartStore.getState().savedFabrics[serafina.id]).toEqual(selected);
  const persisted = loadJSON<{ savedFabrics: Record<string, typeof selected> }>('rf-cart-v1');
  expect(persisted?.savedFabrics[serafina.id]).toMatchObject({ id: pebble, name: pebbleOption.name, priceDelta: pebbleOption.priceDelta || 0 });
});

test('order and WhatsApp item text includes the official colour name and code', () => {
  const order: OrderRecord = {
    id: 'RF-FABRIC', purchasedAt: '7 Nov 2026', deliveryDate: '14 Nov 2026', status: 'Order received', total: 3000,
    items: [{ name: 'Serafina Corner Sofa', category: 'sofas', qty: 1, price: 3000, fabric: toFabricSelection(serafina.fabrics!.find((fabric) => fabric.id === pebble)!) }],
  };
  expect(orderItemsText(order)).toBe(`Serafina Corner Sofa · Fabric: ${fabricSelectionLabel(toFabricSelection(pebbleOption))} — AED 3,000`);
});

test('a non-zero delta remains supported by an isolated test fixture, not invented storefront pricing', () => {
  const fixture = { id: 'test-premium', name: 'Test premium', hex: '#123456', priceDelta: 250 };
  const selected = productWithFabric(serafina, fixture);
  expect(selected.o).toBe(3250);
  expect(selected.l).toBe(4250);
  expect(selected.selectedFabric).toEqual(fixture);
});

test('per-size metadata and summary labels retain only official values', () => {
  const fabric: Fabric = {
    id: 'velvet::fc-test', fabricTypeName: 'VELVET', name: 'TEST BLUE', code: '#123456', hex: '#123456', inStock: true,
    sizeVariants: [{ size: 'King', sku: 'OFFICIAL-SKU', available: false, priceDelta: 75 }],
  };
  const sized = fabricForSize(fabric, 'King');
  expect(sized.inStock).toBe(false);
  expect(sized.priceDelta).toBe(75);
  expect(fabricSelectionLabel(toFabricSelection(sized))).toBe('VELVET — TEST BLUE (#123456) · SKU OFFICIAL-SKU');
  expect(fabricForSize(fabric, 'Queen')).toBe(fabric);
});

test('mobile customizer keeps product and close-up visible, supports zoom and Continue', async () => {
  const current: Fabric = { id: 'fabric::current', fabricTypeId: 'fabric', fabricTypeName: 'Fabric', name: 'Current Fabric', hex: '', inStock: true, isCurrent: true, closeupImage: 'https://example.invalid/current.jpg' };
  const named: Fabric = { id: 'velvet::fc-test', colourId: 'fc-test', fabricTypeId: 'velvet', fabricTypeName: 'VELVET', name: 'TEST BLUE', code: '#123456', hex: '#123456', inStock: true, closeupImage: 'https://example.invalid/blue.jpg', previewUnavailable: true };
  const product = { id: 'fixture-only', n: 'Fixture Sofa', fabricTypes: [{ id: 'fabric', name: 'Fabric', colours: [current] }, { id: 'velvet', name: 'VELVET', colours: [named] }], fabrics: [current, named] };
  const onSelect = jest.fn(); const onContinue = jest.fn();
  const screen = await render(<FabricCustomizer visible product={product} selectedFabric={current} onSelect={onSelect} onClose={() => {}} onContinue={onContinue} />);
  expect(flattenText(screen.root)).toContain('PRODUCT PREVIEW');
  expect(flattenText(screen.root)).toContain('FABRIC CLOSE-UP');
  const velvetTab = screen.root.queryAll((node: any) => node.props.accessibilityLabel === 'Show VELVET colours', {})[0];
  await fireEvent(velvetTab, 'press');
  const button = swatch(screen.root, named.id);
  expect(StyleSheet.flatten(button.props.style).width).toBeGreaterThanOrEqual(44);
  expect(StyleSheet.flatten(button.props.style).height).toBeGreaterThanOrEqual(44);
  await fireEvent(button, 'press');
  expect(onSelect).toHaveBeenCalledWith(named);
  const zoom = screen.root.queryAll((node: any) => node.props.accessibilityLabel === 'Zoom official close-up of Current Fabric', {})[0];
  await fireEvent(zoom, 'press');
  expect(flattenText(screen.root)).toContain('100%');
  const continueButton = screen.root.queryAll((node: any) => node.props.accessibilityLabel === 'Continue with Current Fabric', {})[0];
  await fireEvent(continueButton, 'press');
  expect(onContinue).toHaveBeenCalled();
});

test('a flagged masked fabric never tints the product or background', async () => {
  const fabric: Fabric = { id: 'flagged', name: 'Flagged test colour', hex: '#101215', inStock: true, previewUnavailable: true };
  const screen = await render(<FabricPreview product={{ id: '7072-serafina-corner-sofa', maskImage: 'serafina-corner-sofa.png', fabrics: [fabric] }} fabric={fabric} source={{ uri: 'https://example.invalid/sofa.jpg' }} />);
  const tinted = screen.root.queryAll((node: any) => StyleSheet.flatten(node.props.style)?.tintColor === fabric.hex, {});
  expect(tinted).toHaveLength(0);
});
