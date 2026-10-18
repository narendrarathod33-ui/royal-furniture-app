import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const runtime = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../utils/photoZoom.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, runtime);
const { INITIAL_ZOOM, clampPhotoZoom, movePhotoZoom } = runtime.exports;
const plain = (object) => JSON.parse(JSON.stringify(object));

test('pinching enlarges around the finger midpoint and shrinks back to original', () => {
  const before = [{ x: 100, y: 150 }, { x: 200, y: 150 }];
  const after = [{ x: 50, y: 150 }, { x: 250, y: 150 }];
  const enlarged = movePhotoZoom(INITIAL_ZOOM, before, after, 300, 300);
  assert.deepEqual(plain(enlarged), { scale: 2, x: 0, y: 0 });
  assert.deepEqual(plain(movePhotoZoom(enlarged, after, before, 300, 300)), { scale: 1, x: 0, y: 0 });
});

test('drag pans only while enlarged and clamps to the photo bounds', () => {
  const before = [{ x: 100, y: 100 }], after = [{ x: 200, y: 200 }];
  assert.deepEqual(plain(movePhotoZoom(INITIAL_ZOOM, before, after, 300, 300)), plain(INITIAL_ZOOM));
  assert.deepEqual(plain(movePhotoZoom({ scale: 2, x: 0, y: 0 }, before, after, 300, 300)), { scale: 2, x: 100, y: 100 });
  assert.deepEqual(plain(clampPhotoZoom({ scale: 2, x: 1000, y: -1000 }, 300, 300)), { scale: 2, x: 150, y: -150 });
});

test('zoom controls never exceed 4x or shrink below original size', () => {
  assert.equal(clampPhotoZoom({ scale: 10, x: 0, y: 0 }, 300, 300).scale, 4);
  assert.deepEqual(plain(clampPhotoZoom({ scale: 0.5, x: 100, y: 100 }, 300, 300)), plain(INITIAL_ZOOM));
});

test('finger count changes and zero-distance gestures do not jump', () => {
  assert.equal(movePhotoZoom(INITIAL_ZOOM, [{ x: 10, y: 10 }], [], 300, 300), INITIAL_ZOOM);
  assert.equal(movePhotoZoom(INITIAL_ZOOM, [{ x: 10, y: 10 }, { x: 10, y: 10 }], [{ x: 10, y: 10 }, { x: 100, y: 100 }], 300, 300), INITIAL_ZOOM);
});

test('gesture interception is restricted to the modal viewer', () => {
  const source = readFileSync(new URL('../components/ProductPhotoViewer.tsx', import.meta.url), 'utf8');
  assert(source.includes('touchAction: \'none\''));
  assert(source.includes('onRequestClose={onClose}'));
  for (const label of ['Close photo zoom', 'Zoom in', 'Zoom out', 'Reset photo zoom']) assert(source.includes(label));
  const product = readFileSync(new URL('../app/ProductDetails.tsx', import.meta.url), 'utf8');
  assert(product.includes("touchAction: 'pan-y pinch-zoom'"));
  assert(product.includes('accessibilityLabel="Open photo zoom"'));
});

const { photoSwipeDirection } = runtime.exports;
test('swipes select a direction only for deliberate horizontal drags at normal zoom', () => {
  const origin = { x: 150, y: 150 };
  assert.equal(photoSwipeDirection(1, false, origin, { x: 40, y: 155 }), 1);
  assert.equal(photoSwipeDirection(1, false, origin, { x: 250, y: 155 }), -1);
  for (const end of [{ x: 140, y: 155 }, { x: 140, y: 250 }, { x: 250, y: 250 }]) assert.equal(photoSwipeDirection(1, false, origin, end), 0);
  assert.equal(photoSwipeDirection(2, false, origin, { x: 40, y: 155 }), 0);
  assert.equal(photoSwipeDirection(1, true, origin, { x: 40, y: 155 }), 0);
});

function viewerHarness(initialIndex = 0) {
  const gallery = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../utils/gallery.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, gallery);
  const slots = [], effects = [];
  let cursor = 0, index = initialIndex;
  const changes = [];
  const jsx = (type, props) => ({ type, props: props || {} });
  const hooks = {
    useState: (initial) => { const key = cursor++; if (!(key in slots)) slots[key] = initial; return [slots[key], (next) => { slots[key] = typeof next === 'function' ? next(slots[key]) : next; }]; },
    useRef: (initial) => { const key = cursor++; if (!(key in slots)) slots[key] = { current: initial }; return slots[key]; },
    useEffect: (fn, deps) => { const key = cursor++; if (!slots[key] || deps.some((value, n) => value !== slots[key][n])) { slots[key] = deps; effects.push(fn); } },
  };
  const native = new Proxy({ Platform: { OS: 'ios' }, StyleSheet: { create: (value) => value, absoluteFillObject: {} } }, { get: (object, key) => object[key] || key });
  const module = { exports: {}, require: (name) => name === 'react' ? hooks : name === 'react-native' ? native : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : name === 'lucide-react-native' ? new Proxy({}, { get: (_, key) => key }) : name.includes('/glass') ? { GLASS: {} } : name.includes('gallery') ? gallery.exports : runtime.exports };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/ProductPhotoViewer.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, module);
  const photos = [1, 2, 3].map((n) => ({ key: String(n), source: { uri: `photo-${n}.jpg` } }));
  const render = () => {
    cursor = 0;
    const tree = module.exports.ProductPhotoViewer({ visible: true, photos, index, name: 'Chair', onClose: () => {}, onIndexChange: (next) => { changes.push(next); index = next; } });
    effects.splice(0).forEach((fn) => fn());
    return tree;
  };
  const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
  const surface = () => nodes(render()).find((node) => node.props?.testID === 'photo-zoom-surface');
  const button = (label) => nodes(render()).find((node) => node.props?.accessibilityLabel === label);
  const touch = (...coords) => ({ nativeEvent: { touches: coords.map(([x, y]) => ({ pageX: x, pageY: y, locationX: x, locationY: y })) } });
  render();
  surface().props.onLayout({ nativeEvent: { layout: { width: 300, height: 300 } } });
  render();
  return { changes, render, surface, button, touch, nodes };
}

test('enlarged viewer swipes through photos, wraps, and updates its counter', () => {
  const h = viewerHarness(1);
  const swipe = (from, to) => { const surface = h.surface(); surface.props.onResponderGrant(h.touch(from)); surface.props.onResponderMove(h.touch(to)); surface.props.onResponderRelease(); };
  swipe([220, 150], [80, 150]);
  assert.equal(h.changes.at(-1), 2);
  assert(h.nodes(h.render()).some((node) => node.props?.children === '3 of 3'));
  swipe([220, 150], [80, 150]); assert.equal(h.changes.at(-1), 0);
  swipe([80, 150], [220, 150]); assert.equal(h.changes.at(-1), 2);
});

test('pinches and zoomed drags never switch photos; arrows reset zoom', () => {
  const h = viewerHarness();
  h.button('Zoom in').props.onPress();
  let surface = h.surface();
  surface.props.onResponderGrant(h.touch([220, 150]));
  surface.props.onResponderMove(h.touch([80, 150]));
  surface.props.onResponderRelease();
  assert.equal(h.changes.length, 0);
  h.button('Next photo').props.onPress();
  assert.equal(h.changes.at(-1), 1);
  assert.equal(h.button('Zoom out').props.disabled, true);
  surface = h.surface();
  surface.props.onResponderGrant(h.touch([100, 150]));
  surface.props.onResponderStart(h.touch([100, 150], [200, 150]));
  surface.props.onResponderMove(h.touch([50, 150], [250, 150]));
  surface.props.onResponderMove(h.touch([0, 150]));
  surface.props.onResponderMove(h.touch([-100, 150]));
  surface.props.onResponderRelease();
  assert.equal(h.changes.length, 1, 'Finishing a pinch with one finger cannot trigger a swipe');
});
