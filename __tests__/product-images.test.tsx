import { fireEvent, render } from '@testing-library/react-native';
import { Image } from 'react-native';

// Contract doubles: the card's grid width is context-supplied and the PDP
// module is only pulled in for `isMadeToOrderText`; kit stays real except
// photoFor, which is fed a controllable source (same trick as the source
// suite it replaces). Factory references must use `mock*` names.
const mockGridWidth = { current: 240 };
const mockPhoto = { current: undefined as any };
jest.mock('../components/AdaptiveProductList', () => ({
  AdaptiveProductList: () => null,
  useGridCardWidth: () => mockGridWidth.current,
}));
jest.mock('../app/ProductDetails', () => ({
  __esModule: true,
  default: () => null,
  isMadeToOrderText: () => false,
}));
jest.mock('../components/catalog/kit', () => ({
  ...jest.requireActual('../components/catalog/kit'),
  photoFor: () => mockPhoto.current,
}));

import { ProductCard } from '../components/catalog/ProductCard';
import { byProps, byType, firstByProps } from './test-utils';
import { styles, type ListedProduct } from '../components/catalog/kit';
import { CartContent } from '../components/catalog/CartContent';
import { useCartStore } from '../stores/cart';
import { catalogData } from '../app/data/catalogData';

const RealProductDetails = jest.requireActual('../app/ProductDetails').default;

const fakeProduct = { id: 'sofa', n: 'Sofa', o: 100, l: 100, c: 'sofas' } as unknown as ListedProduct;
const realProduct = catalogData[0] as unknown as ListedProduct;
const source = (uri?: string) => (uri ? { uri } : undefined);

const card = async (wide = false) =>
  (await render(<ProductCard product={fakeProduct} onPress={() => {}} wide={wide} />)).root;

test('grid and rail cards fill their square frame with cover and never stretch (no fill/stretch modes)', async () => {
  mockPhoto.current = source('wide-photo.webp');
  mockGridWidth.current = 240;
  const screen = await render(<ProductCard product={fakeProduct} onPress={() => {}} />);
  expect(firstByProps(screen.root, { resizeMode: 'cover' }).props.accessibilityLabel).toBe('Sofa');
  // Cover crops inside the overflow-hidden square frame; fill/stretch would distort.
  expect(byProps(screen.root, { resizeMode: 'fill' })).toHaveLength(0);
  expect(byProps(screen.root, { resizeMode: 'stretch' })).toHaveLength(0);
  await screen.rerender(<ProductCard product={fakeProduct} onPress={() => {}} wide />);
  expect(firstByProps(screen.root, { resizeMode: 'cover' }).props.accessibilityLabel).toBe('Sofa');
  mockGridWidth.current = 320;
  await screen.rerender(<ProductCard product={fakeProduct} onPress={() => {}} wide />);
  // The card is the tree root; queryAll walks descendants only, so read the
  // root's own style array for the reserved grid width.
  const rootStyle = screen.root.props.style;
  expect(Array.isArray(rootStyle) ? rootStyle.some((s: any) => s?.width === 320) : rootStyle?.width === 320).toBe(true);
});

test('failed or missing photos use an accessible fallback without removing the image frame', async () => {
  mockPhoto.current = source('wide-photo.webp');
  const screen = await render(<ProductCard product={fakeProduct} onPress={() => {}} />);
  await fireEvent(firstByProps(screen.root, { resizeMode: 'cover' }), 'error');
  await screen.rerender(<ProductCard product={fakeProduct} onPress={() => {}} />);
  expect(byType(screen.root, 'Image')).toHaveLength(0);
  expect(byProps(screen.root, { accessibilityLabel: 'Photo unavailable for Sofa' })).toHaveLength(1);
  expect(byProps(screen.root, { testID: 'product-thumbnail-frame' })).toHaveLength(1);

  mockPhoto.current = undefined;
  await screen.rerender(<ProductCard product={fakeProduct} onPress={() => {}} />);
  expect(byType(screen.root, 'Image')).toHaveLength(0);
  expect(byProps(screen.root, { testID: 'product-thumbnail-frame' })).toHaveLength(1);
});

test('a changed source retries normally, while a recreated failed source does not loop', async () => {
  mockPhoto.current = source('wide-photo.webp');
  const screen = await render(<ProductCard product={fakeProduct} onPress={() => {}} />);
  await fireEvent(firstByProps(screen.root, { resizeMode: 'cover' }), 'error');
  mockPhoto.current = source('portrait-photo.webp');
  await screen.rerender(<ProductCard product={fakeProduct} onPress={() => {}} />);
  expect(byType(screen.root, 'Image')).toHaveLength(1);
  // Re-failing on the new source must not loop the retry for the same photo.
  await fireEvent(firstByProps(screen.root, { resizeMode: 'cover' }), 'error');
  mockPhoto.current = source('portrait-photo.webp');
  await screen.rerender(<ProductCard product={fakeProduct} onPress={() => {}} />);
  expect(byType(screen.root, 'Image')).toHaveLength(0);
});

test('thumbnail styles reserve a square for both rail and grid, without a fixed height', () => {
  expect(styles.productImage.aspectRatio).toBe(1);
  expect(styles.productImage.width).toBe('100%');
  expect(styles.productImage.height).toBeUndefined();
  expect(styles.productImage.overflow).toBe('hidden');
});

test('detail gallery and cart photos contain products; editorial and swatches still cover', async () => {
  // Cart line photos keep the full product visible. The cart is seeded
  // through the real store action (the props moved into the store in P2).
  mockPhoto.current = source('cart-photo.webp');
  useCartStore.getState().addToCart(fakeProduct);
  const cart = await render(
    <CartContent onProduct={() => {}} onShop={() => {}} onAccount={() => {}} onCart={() => {}} />
  );
  const cartPhoto = byProps(cart.root, {}).filter((node) => node.props.style === styles.cartPhoto);
  expect(cartPhoto).toHaveLength(1);
  expect(cartPhoto[0].props.resizeMode).toBe('contain');

  // The PDP gallery renders its main slide and thumbnails with contain. Its
  // style objects are module-private, so the behavior is asserted directly:
  // the gallery surface exists and every rendered photo keeps contain.
  mockPhoto.current = undefined; // PDP builds its own gallery sources.
  const details = await render(
    <RealProductDetails product={realProduct} onBack={() => {}} onAdd={() => {}} isSaved={false} />
  );
  const photos = byType(details.root, 'Image');
  expect(photos.length).toBeGreaterThan(0);
  expect(photos.every((node) => node.props.resizeMode === 'contain')).toBe(true);

  // Editorial banners and color swatches stay cover; static source contract.
  const fs = require('node:fs');
  const detailsSource = fs.readFileSync('app/ProductDetails.tsx', 'utf8');
  expect(detailsSource).toMatch(/style=\{styles\.swatchImage\} resizeMode="cover"/);
  const promosSource = fs.readFileSync('components/HomePromotions.tsx', 'utf8');
  // Promo slides cover their frame (cropping is intentional there; stretch stays banned).
  expect(promosSource).toMatch(/style=\{s\.photo\} resizeMode="cover"/);
});
