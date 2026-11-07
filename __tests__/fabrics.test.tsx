import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import ProductDetails from '../app/ProductDetails';
import { FabricPreview, FABRIC_CROSSFADE_MS } from '../components/FabricPreview';
import { catalogData } from '../app/data/catalogData';
import { productWithFabric, toFabricSelection, type Fabric } from '../app/data/fabrics';
import { cartLineId, useCartStore } from '../stores/cart';
import { loadJSON } from '../stores/appStorage';
import { orderItemsText } from '../utils/orders';
import type { OrderRecord, Product } from '../components/catalog/kit';
import { byProps, firstByProps, flattenText } from './test-utils';

const serafina = catalogData.find((product) => product.id === '7072-serafina-corner-sofa') as unknown as Product;
const trento = catalogData.find((product) => product.id === '6219-trento-single-seater-sofa') as unknown as Product;
const rainbow = catalogData.find((product) => product.id === '6880-the-rainbow-bed') as unknown as Product;
const plainProduct = catalogData.find((product) => product.id === '7070-the-sibby-6-seater-sofa') as unknown as Product;
const lightGrey = 'velvet-light-warm-grey-beige-1882-4';
const pebble = 'chenille-pebble-beige-1906-b-3';
const paleMint = 'chenille-pale-mint-1906-b-1';
const unavailableYellow = 'velvet-warm-cream-yellow-1882-5';
const swatch = (root: any, id: string) => firstByProps(root, { testID: `fabric-swatch-${id}` });

beforeEach(() => {
  useCartStore.getState().resetUserData();
});

test('official fabrics select instantly, crossfade for 180ms, and retain the verified catalogue price', async () => {
  expect(FABRIC_CROSSFADE_MS).toBeGreaterThanOrEqual(150);
  expect(FABRIC_CROSSFADE_MS).toBeLessThanOrEqual(200);
  const onAdd = jest.fn();
  const screen = await render(<ProductDetails product={serafina} onBack={() => {}} onSave={() => {}} onAdd={onAdd} isSaved={false} />);

  expect(byProps(screen.root, { testID: 'fabric-selector' })).toHaveLength(1);
  expect(swatch(screen.root, lightGrey).props.accessibilityState.selected).toBe(true);
  expect(flattenText(screen.root)).toContain('AED 3,000');

  await fireEvent(swatch(screen.root, pebble), 'press');
  expect(swatch(screen.root, pebble).props.accessibilityState.selected).toBe(true);
  expect(byProps(screen.root, { testID: `fabric-preview-${pebble}` }).length).toBeGreaterThan(0);
  expect(flattenText(screen.root)).toContain('PEBBLE BEIGE /1906 B-3');
  expect(flattenText(screen.root)).toContain('AED 3,000');

  const add = screen.root.queryAll((node: any) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Add to bag'), {})[0];
  await fireEvent(add, 'press');
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
    price: 3000,
    fabric: expect.objectContaining({ id: pebble, name: 'PEBBLE BEIGE /1906 B-3', priceDelta: 0 }),
  }));
});

test('an officially out-of-stock colour cannot replace the available selection', async () => {
  const screen = await render(<ProductDetails product={trento} onBack={() => {}} onSave={() => {}} onAdd={() => {}} isSaved={false} />);
  const initial = 'feather-cream-white-1941-1';
  expect(swatch(screen.root, initial).props.accessibilityState.selected).toBe(true);
  await fireEvent(swatch(screen.root, unavailableYellow), 'press');
  expect(swatch(screen.root, unavailableYellow).props.accessibilityState.disabled).toBe(true);
  expect(swatch(screen.root, initial).props.accessibilityState.selected).toBe(true);
  expect(flattenText(screen.root)).toContain('AED 1,261');
});

test('products without named official colours keep the original detail UI', async () => {
  for (const product of [plainProduct, rainbow]) {
    const screen = await render(<ProductDetails product={product} onBack={() => {}} onSave={() => {}} onAdd={() => {}} isSaved={false} />);
    expect(byProps(screen.root, { testID: 'fabric-selector' })).toHaveLength(0);
    expect(byProps(screen.root, { testID: `fabric-preview-${lightGrey}` })).toHaveLength(0);
    await screen.unmount();
  }
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
  expect(cart.map((item) => item.product.o)).toEqual([3000, 3000]);
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
  expect(persisted?.savedFabrics[serafina.id]).toMatchObject({ id: pebble, name: 'PEBBLE BEIGE /1906 B-3', priceDelta: 0 });
});

test('order and WhatsApp item text includes the official colour name and code', () => {
  const order: OrderRecord = {
    id: 'RF-FABRIC', purchasedAt: '7 Nov 2026', deliveryDate: '14 Nov 2026', status: 'Order received', total: 3000,
    items: [{ name: 'Serafina Corner Sofa', category: 'sofas', qty: 1, price: 3000, fabric: toFabricSelection(serafina.fabrics!.find((fabric) => fabric.id === pebble)!) }],
  };
  expect(orderItemsText(order)).toBe('Serafina Corner Sofa · Fabric: PEBBLE BEIGE /1906 B-3 — AED 3,000');
});

test('a non-zero delta remains supported by an isolated test fixture, not invented storefront pricing', () => {
  const fixture = { id: 'test-premium', name: 'Test premium', hex: '#123456', priceDelta: 250 };
  const selected = productWithFabric(serafina, fixture);
  expect(selected.o).toBe(3250);
  expect(selected.l).toBe(4250);
  expect(selected.selectedFabric).toEqual(fixture);
});
