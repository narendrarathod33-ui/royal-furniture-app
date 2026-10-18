import { fireEvent, render } from '@testing-library/react-native';

// Adaptive dimensions are mocked so the height-bound table can be exercised;
// everything else (ScrollView math, wrap logic, routes) runs for real.
const dims = { current: { width: 390, height: 844, fontScale: 1 } };
jest.mock('../hooks/useAdaptiveLayout', () => ({
  useAdaptiveLayout: () => dims.current,
  AdaptiveFrame: ({ children }: any) => children ?? null,
}));

import { HomePromotions } from '../components/HomePromotions';
import { HomePaymentCard } from '../components/HomePaymentCard';
import { byProps, byType, flattenText } from './test-utils';

const scrollViews = (root: any) => byType(root, 'RCTScrollView');

test('promotions are height-bounded rather than square posters and adapt to short windows and enlarged text', async () => {
  for (const [width, height, max] of [[320, 844, 176], [390, 844, 176], [768, 1000, 204], [1280, 900, 204], [700, 360, 148]] as const) {
    dims.current = { width, height, fontScale: 1 };
    const screen = await render(<HomePromotions onShop={() => {}} onCategory={() => {}} onCustomize={() => {}} />);
    const scroll = scrollViews(screen.root)[0];
    const style = Array.isArray(scroll.props.style) ? Object.assign({}, ...scroll.props.style) : scroll.props.style;
    expect(style.height).toBe(max);
    await screen.unmount();
  }
  dims.current = { width: 390, height: 844, fontScale: 1.5 };
  const screen = await render(<HomePromotions onShop={() => {}} onCategory={() => {}} onCustomize={() => {}} />);
  const scroll = scrollViews(screen.root)[0];
  const style = Array.isArray(scroll.props.style) ? Object.assign({}, ...scroll.props.style) : scroll.props.style;
  expect(style.height).toBe(264);
});

test('actual viewport measurement controls every slide and snapping, not a capped partial slide', async () => {
  dims.current = { width: 390, height: 844, fontScale: 1 };
  const screen = await render(<HomePromotions onShop={() => {}} onCategory={() => {}} onCustomize={() => {}} />);
  const scroll = scrollViews(screen.root)[0];
  await fireEvent(scroll, 'layout', { nativeEvent: { layout: { width: 700 } } });
  expect(scroll.props.snapToInterval).toBe(700);
  const slides = byProps(screen.root, { testID: 'home-promotion-slide' });
  expect(slides.length).toBeGreaterThan(0);
  for (const slide of slides) {
    const style = Array.isArray(slide.props.style) ? Object.assign({}, ...slide.props.style) : slide.props.style;
    expect(style.width).toBe(700);
  }
});

test('dots navigate, swipe updates the counter, and no arrow buttons render', async () => {
  dims.current = { width: 390, height: 844, fontScale: 1 };
  const screen = await render(<HomePromotions onShop={() => {}} onCategory={() => {}} onCustomize={() => {}} />);
  const byLabel = (label: string) => byProps(screen.root, { accessibilityLabel: label })[0];
  // Arrow chrome was removed: dots, swipe and autoplay are the controls.
  expect(byProps(screen.root, { accessibilityLabel: 'Previous promotion' })).toHaveLength(0);
  expect(byProps(screen.root, { accessibilityLabel: 'Next promotion' })).toHaveLength(0);
  await fireEvent(byLabel('Show promotion 3'), 'press');
  expect(flattenText(screen.root)).toContain('3 / 3');
  await fireEvent(byLabel('Show promotion 1'), 'press');
  expect(flattenText(screen.root)).toContain('1 / 3');
  // A swipe settles through momentum end on the native scroll container.
  const scroll = scrollViews(screen.root)[0];
  await fireEvent(scroll, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 712 } } });
  expect(flattenText(screen.root)).toContain('3 / 3');
});

test('promotions preserve Deals and kids-category destinations', async () => {
  dims.current = { width: 390, height: 844, fontScale: 1 };
  const routes: string[] = [];
  const screen = await render(
    <HomePromotions
      onShop={() => routes.push('deals')}
      onCategory={(c: string) => routes.push(c)}
      onCustomize={() => routes.push('customization')}
    />
  );
  const byLabel = (label: string) => byProps(screen.root, { accessibilityLabel: label })[0];
  await fireEvent(byLabel('Explore deals'), 'press');
  await fireEvent(byLabel('Customize your space'), 'press');
  await fireEvent(byLabel('Explore kids’ rooms'), 'press');
  expect(routes).toEqual(['deals', 'customization', 'kids-and-teens']);
});

test('slide photos fill their frame with cover (never stretched) and use the current campaign set', async () => {
  dims.current = { width: 390, height: 844, fontScale: 1 };
  const screen = await render(<HomePromotions onShop={() => {}} onCategory={() => {}} onCustomize={() => {}} />);
  const images = byType(screen.root, 'Image');
  expect(images.length).toBe(3);
  expect(images.every((node) => node.props.resizeMode === 'cover')).toBe(true);
  expect(images.every((node) => node.props.resizeMode !== 'fill' && node.props.resizeMode !== 'stretch')).toBe(true);
  const { readFileSync } = require('node:fs');
  const source = readFileSync('components/HomePromotions.tsx', 'utf8');
  expect(source.includes('bogota-7-seater-sofa-set.webp')).toBe(true);
  expect(source.includes('broadway-dining-set-4-seater-antique-oak.webp')).toBe(true);
  expect(source.includes('the-shannon-kids-bed.webp')).toBe(true);
  expect(source.includes('dayana-corner-sofa')).toBe(false);
  expect(source.includes('the-rainbow-bed')).toBe(false);
  expect(source.includes('bunny-kids-bed')).toBe(false);
  expect(source.includes('home-kids.webp')).toBe(false);
  expect(source.includes('home-furniture.webp')).toBe(false);
});

test('pay-later banner uses the supplied artwork without cropping, stretching or tap actions', async () => {
  const screen = await render(<HomePaymentCard />);
  const root = screen.root;
  expect(root.props.onPress).toBeUndefined();
  const images = byType(root, 'Image');
  expect(images.length).toBe(1);
  const image = images[0];
  expect(image.props.resizeMode).toBe('contain');
  const imageStyle = Object.assign({}, ...(Array.isArray(image.props.style) ? image.props.style : [image.props.style]));
  expect(imageStyle.width).toBe('100%');
  expect(imageStyle.height).toBe('100%'); // Prevent RN Web from reserving the intrinsic 197px height.
  expect(image.props.accessibilityLabel).toBe('Shop now. Pay later with Tabby and Tamara.');
  const frame = byProps(root, { testID: 'home-payment-artwork' })[0];
  const frameStyle = Object.assign({}, ...(Array.isArray(frame.props.style) ? frame.props.style : [frame.props.style]));
  expect(frameStyle.aspectRatio).toBeCloseTo(1920 / 197);
  expect(frameStyle.maxWidth).toBe(624);
  expect(frameStyle.borderRadius).toBe(8);
  expect(frameStyle.maxWidth / frameStyle.aspectRatio).toBeLessThanOrEqual(65);
  expect(byType(root, 'Pressable').length).toBe(0);
  const { readFileSync } = require('node:fs');
  const code = readFileSync('components/HomePaymentCard.tsx', 'utf8');
  expect(code.includes("require('../assets/images/home-deals-strip.webp')")).toBe(true);
});

test('compact section spacing is limited to Home and does not shrink the kids carousel', () => {
  const { readFileSync } = require('node:fs');
  const home = readFileSync('components/catalog/HomeContent.tsx', 'utf8');
  const kit = readFileSync('components/catalog/kit.ts', 'utf8');
  const chrome = readFileSync('components/catalog/ProductCard.tsx', 'utf8');
  expect((home.match(/<SectionTitle compact title=/g) || []).length).toBe(3);
  expect(kit.includes('homeSectionTitle: { paddingTop: 14, paddingBottom: 8 }')).toBe(true);
  expect(chrome.includes('compact = false')).toBe(true);
  expect(kit.includes('officialFeature: { marginHorizontal: 20, marginTop: 12,')).toBe(true);
  expect(kit.includes('collectionStories: { marginTop: 12, gap: 10 }')).toBe(true);
});

test('Shop by room keeps its photos and category actions without decorative icon badges', () => {
  const { readFileSync } = require('node:fs');
  const home = readFileSync('components/catalog/HomeContent.tsx', 'utf8');
  expect(home.includes('styles.roomIcon')).toBe(false);
  expect(home.includes("'◒'")).toBe(false);
  expect(home.includes('onPress={() => onCategory(cat.s)}')).toBe(true);
  expect(home.includes('source={categoryThumbnail(cat.s)}')).toBe(true);
  expect(home.includes('<Text style={styles.roomLabel}>{cat.n}</Text>')).toBe(true);
});
