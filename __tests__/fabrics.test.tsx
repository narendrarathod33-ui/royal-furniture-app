import { fireEvent, render } from '@testing-library/react-native';
import ProductDetails from '../app/ProductDetails';
import { FABRIC_CROSSFADE_MS } from '../components/FabricPreview';
import { catalogData } from '../app/data/catalogData';
import { productWithFabric, toFabricSelection } from '../app/data/fabrics';
import { cartLineId, useCartStore } from '../stores/cart';
import { loadJSON } from '../stores/appStorage';
import { orderItemsText } from '../utils/orders';
import type { OrderRecord, Product } from '../components/catalog/kit';
import { byProps, firstByProps, flattenText } from './test-utils';

const serafina = catalogData.find((product) => product.id === '7072-serafina-corner-sofa') as unknown as Product;
const plainProduct = catalogData.find((product) => product.id === '7070-the-sibby-6-seater-sofa') as unknown as Product;
const swatch = (root: any, id: string) => firstByProps(root, { testID: `fabric-swatch-${id}` });

beforeEach(() => {
  useCartStore.getState().resetUserData();
});

test('demo fabrics select instantly, crossfade for 180ms, reject unavailable stock, and update the bag price', async () => {
  expect(FABRIC_CROSSFADE_MS).toBeGreaterThanOrEqual(150);
  expect(FABRIC_CROSSFADE_MS).toBeLessThanOrEqual(200);
  const onAdd = jest.fn();
  const screen = await render(<ProductDetails product={serafina} onBack={() => {}} onSave={() => {}} onAdd={onAdd} isSaved={false} />);

  expect(byProps(screen.root, { testID: 'fabric-selector' })).toHaveLength(1);
  expect(swatch(screen.root, 'charcoal').props.accessibilityState.selected).toBe(true);
  expect(flattenText(screen.root)).toContain('AED 3,000');

  await fireEvent(swatch(screen.root, 'navy'), 'press');
  expect(swatch(screen.root, 'navy').props.accessibilityState.selected).toBe(true);
  expect(byProps(screen.root, { testID: 'fabric-preview-navy' }).length).toBeGreaterThan(0);
  expect(flattenText(screen.root)).toContain('AED 3,250');

  await fireEvent(swatch(screen.root, 'rust'), 'press');
  expect(swatch(screen.root, 'rust').props.accessibilityState.disabled).toBe(true);
  expect(swatch(screen.root, 'navy').props.accessibilityState.selected).toBe(true);
  expect(flattenText(screen.root)).toContain('AED 3,250');

  const add = screen.root.queryAll((node: any) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Add to bag'), {})[0];
  await fireEvent(add, 'press');
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
    price: 3250,
    fabric: expect.objectContaining({ id: 'navy', name: 'Navy', priceDelta: 250 }),
  }));
});

test('products without a fabrics array keep the original detail UI', async () => {
  const screen = await render(<ProductDetails product={plainProduct} onBack={() => {}} onSave={() => {}} onAdd={() => {}} isSaved={false} />);
  expect(byProps(screen.root, { testID: 'fabric-selector' })).toHaveLength(0);
  expect(byProps(screen.root, { testID: 'fabric-preview-charcoal' })).toHaveLength(0);
});

test('same product with different fabrics stays on separate quantity-controlled cart lines', () => {
  const charcoal = toFabricSelection(serafina.fabrics!.find((fabric) => fabric.id === 'charcoal')!);
  const navy = toFabricSelection(serafina.fabrics!.find((fabric) => fabric.id === 'navy')!);
  const charcoalProduct = productWithFabric(serafina, charcoal) as Product;
  const navyProduct = productWithFabric(serafina, navy) as Product;
  const store = useCartStore.getState();

  store.addToCart(charcoalProduct);
  store.addToCart(navyProduct);
  store.addToCart(navyProduct);
  let cart = useCartStore.getState().cart;
  expect(cart).toHaveLength(2);
  expect(cart.map((item) => item.product.o)).toEqual([3000, 3250]);
  expect(cart.find((item) => item.product.selectedFabric?.id === 'navy')?.quantity).toBe(2);
  expect(new Set(cart.map(cartLineId)).size).toBe(2);

  const navyLine = cart.find((item) => item.product.selectedFabric?.id === 'navy')!;
  store.decrease(cartLineId(navyLine));
  cart = useCartStore.getState().cart;
  expect(cart.find((item) => item.product.selectedFabric?.id === 'navy')?.quantity).toBe(1);
  expect(cart.find((item) => item.product.selectedFabric?.id === 'charcoal')?.quantity).toBe(1);

  const persisted = loadJSON<{ cart: typeof cart }>('rf-cart-v1');
  expect(persisted?.cart.map((item) => item.product.selectedFabric?.id)).toEqual(['charcoal', 'navy']);
});

test('wishlist fabric id/name/price persist with the saved product metadata', () => {
  const navy = toFabricSelection(serafina.fabrics!.find((fabric) => fabric.id === 'navy')!);
  useCartStore.getState().toggleSaved(serafina.id, navy);
  expect(useCartStore.getState().savedFabrics[serafina.id]).toEqual(navy);
  const persisted = loadJSON<{ savedFabrics: Record<string, typeof navy> }>('rf-cart-v1');
  expect(persisted?.savedFabrics[serafina.id]).toMatchObject({ id: 'navy', name: 'Navy', priceDelta: 250 });
});

test('order and WhatsApp item text includes the chosen fabric', () => {
  const order: OrderRecord = {
    id: 'RF-FABRIC', purchasedAt: '7 Nov 2026', deliveryDate: '14 Nov 2026', status: 'Order received', total: 3250,
    items: [{ name: 'Serafina Corner Sofa', category: 'sofas', qty: 1, price: 3250, fabric: toFabricSelection(serafina.fabrics![2]) }],
  };
  expect(orderItemsText(order)).toBe('Serafina Corner Sofa · Fabric: Navy — AED 3,250');
});
