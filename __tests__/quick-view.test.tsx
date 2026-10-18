import { fireEvent, render } from '@testing-library/react-native';

// Same contract-double style as the product-image suite: kit stays real except
// photoFor, which is fed a controllable source.
const mockPhoto = { current: undefined as any };
jest.mock('../components/catalog/kit', () => ({
  ...jest.requireActual('../components/catalog/kit'),
  photoFor: () => mockPhoto.current,
}));

import { QuickViewBody } from '../components/catalog/QuickView';
import { useQuickViewStore } from '../stores/quickView';
import { useCartStore } from '../stores/cart';
import { catalogData } from '../app/data/catalogData';
import { byProps, flattenText } from './test-utils';
import type { ListedProduct } from '../components/catalog/kit';

const realProduct = catalogData[0] as unknown as ListedProduct;

// RN's jest preset stubs Modal, so tests render the Modal-free body directly
// with a product — the same tree the sheet shows.
const sheet = async (product: ListedProduct, props: { onAdd?: (p: ListedProduct) => void; onOpenProduct?: (p: ListedProduct) => void } = {}) =>
  await render(
    <QuickViewBody
      product={product}
      onClose={() => useQuickViewStore.getState().close()}
      onAdd={props.onAdd ?? (() => {})}
      onOpenProduct={props.onOpenProduct ?? (() => {})}
    />,
  );

beforeEach(() => {
  useQuickViewStore.getState().close();
  useCartStore.getState().clearCart();
});

test('quick view store starts closed and keeps the listed product', () => {
  expect(useQuickViewStore.getState().product).toBeNull();
  useQuickViewStore.getState().open(realProduct);
  expect(useQuickViewStore.getState().product).toBe(realProduct);
  useQuickViewStore.getState().close();
  expect(useQuickViewStore.getState().product).toBeNull();
});

test('shows name, price, discount and delivery for a catalog product', async () => {
  const screen = await sheet(realProduct);
  const text = flattenText(screen.root);
  expect(text).toContain(realProduct.n);
  expect(text).toContain('AED');
  expect(text).toMatch(/Delivery: about 7 days|Delivery: 2–7 days/);
});

test('out-of-stock products offer Notify me, never Add to cart', async () => {
  const oos = { ...realProduct, id: 'oos-1', st: 'out_of_stock' } as unknown as ListedProduct;
  const at = (catalogData as unknown as ListedProduct[]).findIndex((p) => p.id === realProduct.id);
  (catalogData as unknown as ListedProduct[])[at] = oos;
  try {
    const screen = await sheet(oos);
    expect(flattenText(screen.root)).toContain('Notify me');
    expect(byProps(screen.root, { accessibilityLabel: `Add to cart, ${oos.n}, AED ${oos.o.toLocaleString('en-US')}` })).toHaveLength(0);
    expect(useCartStore.getState().cart).toHaveLength(0);
  } finally {
    (catalogData as unknown as ListedProduct[])[at] = realProduct;
  }
});

test('single-option products add to the cart through the shared store', async () => {
  const added: ListedProduct[] = [];
  const single = { ...realProduct, id: 'single-1', sizeCount: undefined } as unknown as ListedProduct;
  (catalogData as unknown as ListedProduct[]).unshift(single);
  try {
    let closed = false;
    const screen = await render(
      <QuickViewBody
        product={single}
        onClose={() => { closed = true; useQuickViewStore.getState().close(); }}
        onAdd={(p) => { added.push(p); useCartStore.getState().addToCart(p); }}
        onOpenProduct={() => {}}
      />,
    );
    fireEvent(byProps(screen.root, { accessibilityLabel: `Add to cart, ${single.n}, AED ${single.o.toLocaleString('en-US')}` })[0], 'press');
    expect(added.map((p) => p.id)).toEqual(['single-1']);
    expect(useCartStore.getState().cart).toHaveLength(1);
    expect(closed).toBe(true);
  } finally {
    (catalogData as unknown as ListedProduct[]).shift();
  }
});

test('multi-option products route to full details instead of adding blind', async () => {
  const routed: ListedProduct[] = [];
  const multi = { ...realProduct, id: 'multi-1', sizeCount: 3 } as unknown as ListedProduct;
  (catalogData as unknown as ListedProduct[]).unshift(multi);
  try {
    const screen = await sheet(multi, { onOpenProduct: (p) => routed.push(p) });
    expect(flattenText(screen.root)).toContain('View full details');
    fireEvent(byProps(screen.root, { accessibilityLabel: `View full details for ${multi.n}` })[0], 'press');
    expect(routed.map((p) => p.id)).toEqual(['multi-1']);
    expect(useCartStore.getState().cart).toHaveLength(0);
  } finally {
    (catalogData as unknown as ListedProduct[]).shift();
  }
});
