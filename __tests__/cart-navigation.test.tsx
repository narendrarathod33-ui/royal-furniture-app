import { fireEvent, render } from '@testing-library/react-native';

import HomeScreen from '../app/(tabs)/index';
import { useCartStore } from '../stores/cart';
import { useSessionStore } from '../stores/session';
import { byProps, byType, flattenText } from './test-utils';

// Stores are module-level singletons; without a reset one test's cart would
// leak into the next (they used to be component state, remounted per test).
beforeEach(() => {
  useCartStore.getState().resetUserData();
  useSessionStore.getState().resetUserData();
});

// The entire app shell (HomeScreen → AppSession) runs for real: real tabs,
// cart state, PDP with the offline details path, and SandboxCheckout imports.
// Only the network is stubbed (jest.setup.js): official details 404, so the
// PDP shows its saved-catalog fallback — exactly the offline path.

jest.setTimeout(60_000);

const texts = (root: any) => flattenText(root);

async function boot() {
  const screen = await render(<HomeScreen />);
  const tab = (name: string) => screen.root.queryAll((node: any) => node.props.accessibilityRole === 'tab' && node.props.accessibilityLabel === name, {})[0];
  const openTab = async (name: string) => {
    await fireEvent(tab(name), 'press');
  };
  const selectedTab = () =>
    screen.root.queryAll((node: any) => node.props.accessibilityRole === 'tab' && node.props.accessibilityState?.selected, {}).map((node: any) => node.props.accessibilityLabel)[0];
  const press = async (label: string | RegExp, occurrence = 0) => {
    const source = typeof label === 'string' ? null : label.source.replace(/^\^/, '');
    const matcher = source ? new RegExp(source) : label;
    const hits = screen.root.queryAll(
      (node: any) => typeof node.props.accessibilityLabel === 'string' && (typeof matcher === 'string' ? node.props.accessibilityLabel === matcher : (matcher as RegExp).test(node.props.accessibilityLabel)),
      {}
    );
    expect(hits.length).toBeGreaterThan(occurrence);
    await fireEvent(hits[occurrence], 'press');
  };
  const has = (text: string) => texts(screen.root).includes(text);
  const hasLabel = (label: string) =>
    screen.root.queryAll((node: any) => node.props.accessibilityLabel === label, {}).length > 0;
  const hasLabelStarting = (prefix: string) =>
    screen.root.queryAll((node: any) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(prefix), {}).length > 0;
  /** Presses the closest pressable ancestor of a visible text label. */
  const pressText = async (text: string) => {
    const textNode = screen.root.queryAll((node: any) => String(node.type) === 'Text' && flattenText(node) === text, {})[0];
    expect(textNode).toBeTruthy();
    let current: any = textNode;
    while (current && typeof current.props.onStartShouldSetResponder !== 'function') current = current.parent;
    expect(current).toBeTruthy();
    await fireEvent(current, 'press');
  };
  return { screen, tab, openTab, selectedTab, press, has, hasLabel, hasLabelStarting, pressText };
}

/** Opens the first product card visible on the current tab; returns its name. */
async function openFirstProduct(h: Awaited<ReturnType<typeof boot>>) {
  const card = h.screen.root.queryAll(
    (node: any) => typeof node.props.accessibilityLabel === 'string' && /, AED /.test(node.props.accessibilityLabel),
    {}
  )[0];
  expect(card).toBeTruthy();
  const name = card.props.accessibilityLabel.split(', AED')[0];
  await fireEvent(card, 'press');
  return name;
}

async function addToBag(h: Awaited<ReturnType<typeof boot>>) {
  // Multi-size products require picking a size; the picker closes on selection.
  const sizeTrigger = h.screen.root.queryAll(
    (node: any) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('Tap to change size'),
    {}
  )[0];
  if (sizeTrigger) {
    await fireEvent(sizeTrigger, 'press');
    const radios = h.screen.root.queryAll((node: any) => node.props.accessibilityRole === 'radio', {});
    expect(radios.length).toBeGreaterThan(0);
    await fireEvent(radios[0], 'press');
  }
  const add = h.screen.root.queryAll(
    (node: any) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Add to bag'),
    {}
  )[0];
  expect(add).toBeTruthy();
  await fireEvent(add, 'press');
}

const badge = (h: Awaited<ReturnType<typeof boot>>) => {
  const hit = h.screen.root.queryAll((node: any) => typeof node.props.accessibilityLabel === 'string' && /^Cart, \d+ items$/.test(node.props.accessibilityLabel), {});
  expect(hit.length).toBeGreaterThan(0);
  return Number(hit[0].props.accessibilityLabel.match(/\d+/)[0]);
};

test('add stays on product details; existing Back returns to home with the item bagged', async () => {
  const h = await boot();
  const name = await openFirstProduct(h);
  await addToBag(h);
  // Stays on details: the PDP is still up (no checkout), the badge incremented.
  // (The toast itself auto-clears after 2.2s and is covered by the badge.)
  expect(badge(h)).toBe(1);
  expect(h.has('Local demo checkout')).toBe(false);
  await h.press('Go back');
  expect(h.selectedTab()).toBe('Home');
  await h.press(/Cart, 1 items/);
  expect(h.has('Your bag')).toBe(true);
  expect(h.has(name.split(' - ')[0])).toBe(true);
  expect(h.hasLabelStarting('Increase quantity of ')).toBe(true);
});

test('add stays on details; Back returns to Browse with the item bagged', async () => {
  const h = await boot();
  await h.openTab('Browse');
  const name = await openFirstProduct(h);
  await addToBag(h);
  await h.press('Go back');
  expect(h.selectedTab()).toBe('Browse');
  await h.openTab('Home');
  await h.press(/Cart, 1 items/);
  expect(h.has(name.split(' - ')[0])).toBe(true);
});

test('add stays on details; Back returns to Search with the item bagged', async () => {
  const h = await boot();
  await h.openTab('Search');
  const field = byProps(h.screen.root, { testID: 'product-search-field' })[0];
  await fireEvent(field, 'press'); // focuses the input via the outer bar
  const input = byType(field, 'TextInput')[0] ?? field;
  await fireEvent(input, 'changeText', 'Nimbus');
  const name = await openFirstProduct(h);
  await addToBag(h);
  await h.press('Go back');
  expect(h.selectedTab()).toBe('Search');
  await h.openTab('Home');
  await h.press(/Cart, 1 items/);
  expect(h.has(name.split(' - ')[0])).toBe(true);
});

test('add from the cart line stays on details; Back returns to the unchanged cart', async () => {
  const h = await boot();
  const name = await openFirstProduct(h);
  await addToBag(h);
  await h.press('Go back');
  await h.press(/Cart, 1 items/);
  // Cart line exposes two View links (image + name); use the first.
  await h.press(new RegExp(`^View ${name.split(' - ')[0]}`), 0);
  await addToBag(h); // same product → increments the same cart item
  await h.press('Go back');
  await h.press(/Cart, 2 items/);
  expect(h.hasLabelStarting(`Increase quantity of ${name.split(' - ')[0]}`)).toBe(true);
  expect(badge(h)).toBe(2);
});

test('repeat adds keep details open and increment the same cart item', async () => {
  const h = await boot();
  const name = await openFirstProduct(h);
  await addToBag(h);
  await addToBag(h);
  expect(badge(h)).toBe(2);
  await h.press('Go back');
  await h.press(/Cart, 2 items/);
  expect(h.hasLabelStarting(`Increase quantity of ${name.split(' - ')[0]}`)).toBe(true);
  expect(h.hasLabelStarting(`Decrease quantity of ${name.split(' - ')[0]}`)).toBe(true);
  expect(h.hasLabelStarting(`Remove ${name.split(' - ')[0]}`)).toBe(true);
});

test('existing Back works without adding, and explicit Start shopping still works', async () => {
  const h = await boot();
  await h.openTab('Browse');
  await openFirstProduct(h);
  await h.press('Go back');
  expect(h.selectedTab()).toBe('Browse');
  await h.openTab('Home'); // the bag is reachable from the home header
  await h.press(/Cart, 0 items/);
  expect(h.has('Your bag is empty')).toBe(true);
  await h.pressText('Start shopping');
  expect(h.selectedTab()).toBe('Deals'); // cart's Start shopping routes to the deals surface
});

test('cart item image and name open that product; Back returns to the unchanged cart', async () => {
  const h = await boot();
  const name = await openFirstProduct(h);
  await addToBag(h);
  await h.press('Go back');
  await h.press(/Cart, 1 items/);
  for (const occurrence of [0, 1]) {
    await h.press(new RegExp(`^View ${name.split(' - ')[0]}`), occurrence);
    await h.press('Go back');
  }
  expect(h.hasLabelStarting(`Increase quantity of ${name.split(' - ')[0]}`)).toBe(true);
  expect(badge(h)).toBe(1);
});

test('cart quantity and remove controls update the cart without opening product details', async () => {
  const h = await boot();
  const name = await openFirstProduct(h);
  await addToBag(h);
  await h.press('Go back');
  await h.press(/Cart, 1 items/);
  expect(h.has('Choose size')).toBe(false); // guard: still on the cart, not the PDP
  await h.press(new RegExp('^Increase quantity of ' + name.split(' - ')[0]));
  expect(badge(h)).toBe(2);
  await h.press(new RegExp('^Decrease quantity of ' + name.split(' - ')[0]));
  expect(badge(h)).toBe(1);
  await h.press(new RegExp('^Remove ' + name.split(' - ')[0]));
  expect(badge(h)).toBe(0);
  expect(h.has('Your bag is empty')).toBe(true);
});

for (const [label, destination] of [['Cart', 'bag'], ['Account', 'account']] as const) {
  test(`product details header ${label} opens ${destination} and clears the product overlay`, async () => {
    const h = await boot();
    await openFirstProduct(h);
    await addToBag(h);
    // The PDP's own header renders the bag/account buttons.
    await h.press(new RegExp(`^${label === 'Cart' ? 'Cart, 1 items' : 'Account'}$`), 0);
    if (destination === 'bag') {
      expect(h.has('Your bag')).toBe(true);
      expect(h.has('Choose size')).toBe(false); // overlay cleared
    } else {
      expect(h.has('Manage your profile, orders, and Royal Furniture support.')).toBe(true);
    }
  });
}
