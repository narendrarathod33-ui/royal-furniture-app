import { render } from '@testing-library/react-native';
import { NewArrivalsContent } from '../components/catalog/Screens';
import { MoreContent } from '../components/catalog/MoreContent';
import { byProps } from './test-utils';

test('new arrivals page lists catalog pieces with their count', async () => {
  const screen = await render(<NewArrivalsContent onProduct={() => {}} cartCount={0} onCart={() => {}} onAccount={() => {}} />);
  const text = JSON.stringify(toJSONDeep(screen.root));
  expect(text).toContain('New arrivals');
  expect(text).toContain('Just in');
  expect(text).toContain('The Rainbow Bed'); // first catalog piece renders
});

test('more hub exposes saved, orders, account and the language switch — no arrivals or stores rows', async () => {
  const routes: string[] = [];
  const screen = await render(
    <MoreContent onCart={() => routes.push('cart')} onAccount={() => routes.push('account')} cartCount={0} />,
  );
  const { fireEvent } = require('@testing-library/react-native');
  const press = (label: string) => {
    const hits = byProps(screen.root as any, { accessibilityLabel: label });
    expect(hits.length).toBeGreaterThan(0);
    fireEvent(hits[0], 'press');
  };
  press('Saved items');
  press('My orders');
  expect(routes).toEqual(['cart', 'account']);
  expect(byProps(screen.root as any, { accessibilityLabel: 'New arrivals' }).length).toBe(0);
  expect(byProps(screen.root as any, { accessibilityLabel: 'Stores' }).length).toBe(0);
  expect(byProps(screen.root as any, { accessibilityLabel: 'English' }).length).toBeGreaterThan(0);
  expect(byProps(screen.root as any, { accessibilityLabel: 'العربية' }).length).toBeGreaterThan(0);
});

function toJSONDeep(node: any): unknown {
  const out: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (typeof n.props?.children === 'string') out.push(n.props.children);
    (n.children || []).forEach((c: any) => typeof c === 'object' && walk(c));
  };
  walk(node);
  return out;
}
