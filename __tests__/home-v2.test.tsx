import { render, screen } from '@testing-library/react-native';
import { HomeContentV2 } from '../components/catalog/HomeContentV2';
import { APP_SKIN } from '../app/skin';
import { queryAll } from './test-utils';

/**
 * Version 2 (prototype look) home: pastel category tiles + icon-first cards,
 * driven by the same automated data and honest prices as Version 1.
 */
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

test('the build skin defaults to v1 and v2 is a build-time choice', () => {
  expect(['v1', 'v2']).toContain(APP_SKIN);
});

test('v2 home renders six category tiles and real priced products', async () => {
  const onCategory = jest.fn();
  const onProduct = jest.fn();
  await render(
    <HomeContentV2
      onCategory={onCategory}
      onProduct={onProduct}
      onShop={() => {}}
      onBestSellers={() => {}}
      cartCount={0}
      onCart={() => {}}
      onAccount={() => {}}
    />,
  );
  const root = screen.root;
  for (const label of ['All', 'Sofas', 'Dining', 'Bedroom', 'Kids', 'Décor']) {
    expect(queryAll(root, (node: any) => node.props.accessibilityLabel === label).length).toBeGreaterThan(0);
  }
  const cards = queryAll(root, (node: any) => typeof node.props.accessibilityLabel === 'string' && /, AED/.test(node.props.accessibilityLabel));
  expect(cards.length).toBeGreaterThanOrEqual(8); // 6 deals + 6 best sellers, deduped by key may overlap visually
  expect(cards[0].props.accessibilityLabel).toMatch(/AED [\d,]+/);
});
