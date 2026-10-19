import { render } from '@testing-library/react-native';
import { StoresContent } from '../components/catalog/StoresContent';
import { MoreContent } from '../components/catalog/MoreContent';
import { royalFurnitureData } from '../app/data/royalFurnitureData';
import { byProps } from './test-utils';

test('stores screen lists every showroom with call and directions', async () => {
  const screen = await render(<StoresContent cartCount={0} onCart={() => {}} onAccount={() => {}} />);
  const text = JSON.stringify(toJSONDeep(screen.root));
  for (const store of royalFurnitureData.stores) {
    expect(text).toContain(store.city);
  }
  expect(byProps(screen.root as any, { accessibilityLabel: 'Call the Dubai store' }).length).toBeGreaterThan(0);
  expect(byProps(screen.root as any, { accessibilityLabel: 'Directions to the Abu Dhabi store' }).length).toBeGreaterThan(0);
});

test('more hub exposes arrivals, saved, orders, stores and the language switch', async () => {
  const routes: string[] = [];
  const screen = await render(
    <MoreContent
      onArrivals={() => routes.push('arrivals')}
      onStores={() => routes.push('stores')}
      onCart={() => routes.push('cart')}
      onAccount={() => routes.push('account')}
      cartCount={0}
    />,
  );
  const { fireEvent } = require('@testing-library/react-native');
  const press = (label: string) => {
    const hits = byProps(screen.root as any, { accessibilityLabel: label });
    expect(hits.length).toBeGreaterThan(0);
    fireEvent(hits[0], 'press');
  };
  press('New arrivals');
  press('Saved items');
  press('My orders');
  press('Stores');
  expect(routes).toEqual(['arrivals', 'cart', 'account', 'stores']);
  expect(byProps(screen.root as any, { accessibilityLabel: 'English' }).length).toBeGreaterThan(0);
  expect(byProps(screen.root as any, { accessibilityLabel: 'العربية' }).length).toBeGreaterThan(0);
});

function toJSONDeep(node: any): unknown {
  // flatten all text content without relying on toJSON (RNTL v14)
  const out: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (typeof n.props?.children === 'string') out.push(n.props.children);
    (n.children || []).forEach((c: any) => typeof c === 'object' && walk(c));
  };
  walk(node);
  return out;
}
