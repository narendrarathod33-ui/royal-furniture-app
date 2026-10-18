import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real screen/component callbacks with a minimal hook/JSX harness.
// No native renderer or new dependency is needed for these state/prop regressions.
const names = ['AppSession', 'CartContent', 'AccountContent', 'Header'];
const screens = { AppSession: 'app/(tabs)/index.tsx', CartContent: 'components/catalog/CartContent.tsx', AccountContent: 'components/catalog/AccountContent.tsx', Header: 'components/catalog/ProductCard.tsx' };
const functions = [];
for (const [name, path] of Object.entries(screens)) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(found.length, 1, `${path} must export ${name}`);
  functions.push(found[0]);
}
assert.equal(functions.length, names.length);
const javascript = ts.transpileModule(functions.map((node) => node.getText(node.getSourceFile())).join('\n'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const product = { id: 'chair', n: 'Chair', o: 100, l: 150, c: 'furniture', scn: 'Chairs', z: [], sp: {} };

function harness() {
  let current;
  let adaptive = { width: 390, height: 844, fontScale: 1, twoPane: false, compactHeight: false };
  const jsx = (type, props) => ({ type, props: props || {} });
  const context = { exports: {}, require: () => ({ jsx, jsxs: jsx, Fragment: 'Fragment' }) };
  // UI-only dependencies remain inert JSX nodes; the screen functions above are real.
  const visit = (node) => {
    if (ts.isIdentifier(node) && /^[A-Z]/.test(node.text)) context[node.text] = node.text;
    ts.forEachChild(node, visit);
  };
  functions.forEach(visit);
  Object.assign(context, {
    Math, Date, Set,
    useAdaptiveLayout: () => adaptive,
    styles: new Proxy({}, { get: () => ({}) }), COLORS: {}, categoryColors: {}, shortName: (name) => name,
    royalFurnitureData: { products: [product], stores: [] }, catalogData: [product],
    money: (value) => `AED ${value}`,
    photoFor: () => undefined, photoForCatalogId: () => undefined, getSizeVariants: () => [],
    Animated: { Value: class { interpolate() { return 1; } }, View: 'Animated.View' },
    setTimeout: () => 0, clearTimeout: () => {},
    useMemo: (callback) => callback(), useEffect: () => {}, useRef: (value) => ({ current: value }),
    useState: (initial) => {
      const instance = current;
      const index = instance.cursor++;
      if (!(index in instance.slots)) instance.slots[index] = initial;
      return [instance.slots[index], (next) => {
        instance.slots[index] = typeof next === 'function' ? next(instance.slots[index]) : next;
      }];
    },
  });
  vm.createContext(context);
  vm.runInContext(javascript + '\nexports.screens = { AppSession, CartContent, AccountContent, Header };', context);
  const screens = context.exports.screens;
  function instance(component, props) {
    const state = { slots: [], cursor: 0 };
    return { render() { current = state; state.cursor = 0; return component(props); } };
  }
  return { screens, instance, resize: (width, height = 900) => { adaptive = { width, height, fontScale: 1, twoPane: width >= 840, compactHeight: height < 480 }; }, app: instance(screens.AppSession, { onDeleteData: async () => {} }) };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object' || !tree.props) return [];
  return [tree, ...nodes(tree.props.children)];
}
function find(tree, name) {
  const node = nodes(tree).find(({ type }) => (typeof type === 'function' ? type.name : type) === name);
  assert(node, `Expected ${name}`);
  return node;
}

test('cart Header forwards Account press to the existing Account screen', () => {
  const h = harness();
  find(h.app.render(), 'HomeContent').props.onCart();
  const cart = find(h.app.render(), 'CartContent');
  const cartTree = h.instance(h.screens.CartContent, cart.props).render();
  const header = find(cartTree, 'Header');
  const headerTree = h.instance(h.screens.Header, header.props).render();
  const accountButton = nodes(headerTree).find((node) => node.type === 'Pressable');
  assert.equal(typeof accountButton.props.onPress, 'function');
  accountButton.props.onPress();
  find(h.app.render(), 'AccountContent');
});

// Resolve the real ProductDetails Back control rather than inventing a test button.
const detailsSource = readFileSync(new URL('../app/ProductDetails.tsx', import.meta.url), 'utf8');
const detailsAst = ts.createSourceFile('ProductDetails.tsx', detailsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let backButton;
const visitDetails = (node) => {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(detailsAst) === 'Pressable' && node.openingElement.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(detailsAst) === 'accessibilityLabel' && attribute.initializer?.text === 'Go back')) backButton = node;
  ts.forEachChild(node, visitDetails);
};
visitDetails(detailsAst);
assert(backButton, 'Product details must expose its existing Back control');
function pressBack(details) {
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports: {}, require: () => ({ jsx, jsxs: jsx }),
    onBack: details.props.onBack, Pressable: 'Pressable', ChevronLeft: 'ChevronLeft', ChevronRight: 'ChevronRight', Text: 'Text', COLORS: {}, styles: {},
  };
  const code = ts.transpileModule(`exports.button = (${backButton.getText(detailsAst)});`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, context);
  assert.equal(typeof context.exports.button.props.onPress, 'function');
  assert(!nodes(context.exports.button).some((node) => node.type === 'Text'), 'Back is icon-only');
  assert(nodes(context.exports.button).some((node) => node.type === 'ChevronLeft'));
  context.exports.button.props.onPress();
}

for (const [tab, screen] of [['home', 'HomeContent'], ['categories', 'ShopContent'], ['search', 'SearchContent'], ['cart', 'CartContent']]) {
  test(`add stays on product details; existing Back returns to ${tab}`, () => {
    const h = harness();
    if (tab !== 'home') find(h.app.render(), 'BottomNav').props.setTab(tab);
    find(h.app.render(), screen).props.onProduct(product);
    const detailsBefore = find(h.app.render(), 'ProductDetails');
    detailsBefore.props.onAdd({ price: 100 });
    const tree = h.app.render();
    const detailsAfter = find(tree, 'ProductDetails');
    assert.equal(detailsAfter.props.product.id, detailsBefore.props.product.id);
    assert(!nodes(tree).some((node) => node.type === h.screens.CartContent), 'Add must not open the cart or checkout');
    const toast = nodes(tree).find((node) => node.type === 'Text' && node.props.children === 'Added to your bag');
    assert(toast, 'Keep the existing add confirmation visible without leaving details');
    pressBack(detailsAfter);
    find(h.app.render(), screen);
    assert.equal(find(h.app.render(), 'BottomNav').props.tab, tab);
    if (tab !== 'cart') find(h.app.render(), 'BottomNav').props.setTab('cart');
    const cart = find(h.app.render(), 'CartContent');
    assert.equal(cart.props.cart.length, 1);
    assert.equal(cart.props.cart[0].product.id, product.id);
    assert.equal(cart.props.cart[0].quantity, 1);
  });
}

test('repeat adds keep details open and increment the same cart item', () => {
  const h = harness();
  find(h.app.render(), 'HomeContent').props.onProduct(product);
  find(h.app.render(), 'ProductDetails').props.onAdd({ price: 100 });
  find(h.app.render(), 'ProductDetails').props.onAdd({ price: 100 });
  pressBack(find(h.app.render(), 'ProductDetails'));
  find(h.app.render(), 'HomeContent').props.onCart();
  const cart = find(h.app.render(), 'CartContent');
  assert.equal(cart.props.cart.length, 1);
  assert.equal(cart.props.cart[0].quantity, 2);
});

test('existing Back works without adding, and explicit Start shopping still works', () => {
  const h = harness();
  find(h.app.render(), 'BottomNav').props.setTab('categories');
  find(h.app.render(), 'ShopContent').props.onProduct(product);
  pressBack(find(h.app.render(), 'ProductDetails'));
  find(h.app.render(), 'ShopContent');
  find(h.app.render(), 'BottomNav').props.setTab('cart');
  assert.equal(find(h.app.render(), 'CartContent').props.cart.length, 0);
  find(h.app.render(), 'CartContent').props.onShop();
  find(h.app.render(), 'ShopContent');
});

for (const target of ['image', 'name']) {
  test(`cart item ${target} opens that product; Back returns to the unchanged cart`, () => {
    const h = harness();
    find(h.app.render(), 'HomeContent').props.onProduct(product);
    find(h.app.render(), 'ProductDetails').props.onAdd({ size: 'Large', price: 120 });
    pressBack(find(h.app.render(), 'ProductDetails'));
    find(h.app.render(), 'HomeContent').props.onCart();
    const cart = find(h.app.render(), 'CartContent');
    const tree = h.instance(h.screens.CartContent, cart.props).render();
    const links = nodes(tree).filter((node) => node.type === 'Pressable' && node.props.accessibilityLabel?.startsWith('View '));
    assert.equal(links.length, 2);
    links[target === 'image' ? 0 : 1].props.onPress();
    const details = find(h.app.render(), 'ProductDetails');
    assert.equal(details.props.product.id, 'chair::size=Large');
    assert.equal(details.props.product.o, 120);
    pressBack(details);
    const returned = find(h.app.render(), 'CartContent');
    assert.equal(returned.props.cart[0].product.id, 'chair::size=Large');
    assert.equal(returned.props.cart[0].quantity, 1);
  });
}

test('cart quantity and remove controls update the cart without opening product details', () => {
  const h = harness();
  find(h.app.render(), 'HomeContent').props.onProduct(product);
  find(h.app.render(), 'ProductDetails').props.onAdd({ price: 100 });
  pressBack(find(h.app.render(), 'ProductDetails'));
  find(h.app.render(), 'HomeContent').props.onCart();
  const button = (icon) => {
    const cart = find(h.app.render(), 'CartContent');
    const tree = h.instance(h.screens.CartContent, cart.props).render();
    return nodes(tree).find((node) => node.type === 'Pressable' && nodes(node.props.children).some((child) => child.type === icon));
  };
  button('Plus').props.onPress();
  assert.equal(find(h.app.render(), 'CartContent').props.cart[0].quantity, 2);
  button('Minus').props.onPress();
  assert.equal(find(h.app.render(), 'CartContent').props.cart[0].quantity, 1);
  button('X').props.onPress();
  assert.equal(find(h.app.render(), 'CartContent').props.cart.length, 0);
});

for (const [action, destination] of [['onCart', 'CartContent'], ['onAccount', 'AccountContent']]) {
  test(`product details header ${action} opens ${destination} and clears the product overlay`, () => {
    const h = harness();
    find(h.app.render(), 'HomeContent').props.onProduct(product);
    const details = find(h.app.render(), 'ProductDetails');
    details.props.onAdd({ price: 100 });
    const header = find(h.app.render(), 'ProductDetails').props.header;
    assert.equal(header.props.count, 1);
    const tree = h.instance(h.screens.Header, header.props).render();
    const label = action === 'onCart' ? 'Cart, 1 items' : 'Account';
    const control = nodes(tree).find((node) => node.props.accessibilityLabel === label);
    assert(control);
    control.props.onPress();
    find(h.app.render(), destination);
    assert(!nodes(h.app.render()).some((node) => node.type === 'ProductDetails'));
  });
}

test('cart header Cart button is wired and stays on cart', () => {
  const h = harness();
  find(h.app.render(), 'HomeContent').props.onCart();
  const cart = find(h.app.render(), 'CartContent');
  const header = find(h.instance(h.screens.CartContent, cart.props).render(), 'Header');
  assert.equal(typeof header.props.onCart, 'function');
  header.props.onCart();
  find(h.app.render(), 'CartContent');
});

test('Account page keeps both header navigation callbacks', () => {
  const h = harness();
  find(h.app.render(), 'HomeContent').props.onAccount();
  const account = find(h.app.render(), 'AccountContent');
  const header = find(h.instance(h.screens.AccountContent, account.props).render(), 'Header');
  assert.equal(typeof header.props.onAccount, 'function');
  assert.equal(typeof header.props.onCart, 'function');
  header.props.onAccount();
  find(h.app.render(), 'AccountContent');
  header.props.onCart();
  find(h.app.render(), 'CartContent');
});

test('Browse keeps the category path and sort when returning from product details', () => {
  const h = harness();
  find(h.app.render(), 'BottomNav').props.setTab('categories');
  let browse = find(h.app.render(), 'ShopContent');
  browse.props.setCategory('sofas:corner:modular');
  browse.props.onCatalogSortChange('priceHigh');
  browse = find(h.app.render(), 'ShopContent');
  browse.props.onProduct(product);
  pressBack(find(h.app.render(), 'ProductDetails'));
  const returned = find(h.app.render(), 'ShopContent');
  assert.equal(returned.props.category, 'sofas:corner:modular');
  assert.equal(returned.props.catalogSort, 'priceHigh');
});


test('cart switches between stacked and side-by-side layouts without changing its items', () => {
  const h = harness();
  const cart = [{ product, quantity: 2 }];
  const component = h.instance(h.screens.CartContent, { cart, setCart() {}, saved: [], onSave() {}, onProduct() {}, onOrderCreated() {}, onShop() {}, onAccount() {}, onCart() {} });
  const direction = () => nodes(component.render()).find(n => n.props.testID === 'adaptive-cart').props.style.flexDirection;
  assert.equal(direction(), 'column');
  h.resize(1280); assert.equal(direction(), 'row');
  h.resize(390); assert.equal(direction(), 'column');
  assert.equal(cart[0].quantity, 2);
});

test('account draft remains intact while the same form reflows on a tablet', () => {
  const h = harness();
  const component = h.instance(h.screens.AccountContent, { orders: [], onDeleteData: async () => {}, onBag() {}, onCart() {}, onAccount() {}, cartCount: 0 });
  const field = tree => nodes(tree).find(n => n.type === 'TextInput' && n.props.placeholder === 'Full name');
  field(component.render()).props.onChangeText('Layout test');
  h.resize(1280);
  let tree = component.render();
  assert.equal(field(tree).props.value, 'Layout test');
  assert.equal(nodes(tree).find(n => n.props.testID === 'adaptive-account').props.style.flexDirection, 'row');
  h.resize(390);
  tree = component.render();
  assert.equal(field(tree).props.value, 'Layout test');
  assert.equal(nodes(tree).find(n => n.props.testID === 'adaptive-account').props.style.flexDirection, 'column');
});

test('customization replaces the Everyday destination and preserves filters when returning from product details', () => {
  const h = harness();find(h.app.render(), 'HomeContent').props.onCustomize();
  let page = find(h.app.render(), 'CustomizationPage');
  page.props.onFiltersChange({category:'sofas',query:'sofa',sort:'priceHigh'});
  page = find(h.app.render(), 'CustomizationPage');
  page.props.renderCard(product).props.onPress();
  find(h.app.render(), 'ProductDetails').props.onBack();
  page = find(h.app.render(), 'CustomizationPage');
  assert.equal(page.props.filters.category,'sofas');assert.equal(page.props.filters.query,'sofa');assert.equal(page.props.filters.sort,'priceHigh');
  page.props.onBack();find(h.app.render(), 'HomeContent');
});
