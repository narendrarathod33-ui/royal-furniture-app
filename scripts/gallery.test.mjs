import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../utils/gallery.ts', import.meta.url), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { wrapSlideIndex, loopSlidePosition, settledSlidePosition } = context.exports;

test('next after last and previous before first wrap to the correct image', () => {
  assert.equal(wrapSlideIndex(4, 4), 0);
  assert.equal(wrapSlideIndex(-1, 4), 3);
  assert.equal(wrapSlideIndex(9, 4), 1);
});

test('arrows animate into matching clones and settle to identical real images', () => {
  assert.equal(loopSlidePosition(-1, 4), 0);
  assert.equal(settledSlidePosition(0, 4), 4);
  assert.equal(loopSlidePosition(4, 4), 5);
  assert.equal(settledSlidePosition(5, 4), 1);
  assert.equal(wrapSlideIndex(settledSlidePosition(5, 4) - 1, 4), 0);
  assert.equal(wrapSlideIndex(settledSlidePosition(0, 4) - 1, 4), 3);
});

test('every thumbnail targets its own real image', () => {
  for (let index = 0; index < 4; index++) {
    const position = loopSlidePosition(index, 4);
    assert.equal(position, index + 1);
    assert.equal(settledSlidePosition(position, 4), position);
    assert.equal(wrapSlideIndex(position - 1, 4), index);
  }
});

test('empty and single-image galleries do not produce invalid positions', () => {
  for (const count of [0, 1]) for (const index of [-1, 0, 1, 4]) {
    assert.equal(wrapSlideIndex(index, count), 0);
    assert.equal(loopSlidePosition(index, count), 0);
    assert.equal(settledSlidePosition(index, count), 0);
  }
});

const detailsSource = readFileSync(new URL('../app/ProductDetails.tsx', import.meta.url), 'utf8');
const detailsAst = ts.createSourceFile('ProductDetails.tsx', detailsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
test('web touch surface uses a non-scrollable View and lets the browser pan vertically', () => {
  let surface;
  const visit = (node) => {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(detailsAst) === 'testID' && attribute.initializer?.text === 'product-gallery-touch-surface')) surface = node;
    ts.forEachChild(node, visit);
  };
  visit(detailsAst);
  assert(surface);
  assert.equal(surface.openingElement.tagName.getText(detailsAst), 'View');
  // The touch-action value lives in the shared WEB_TOUCH_ACTION constant
  // (typed through a cast for TS; react-native-web passes it to the DOM).
  assert.match(surface.getText(detailsAst), /WEB_TOUCH_ACTION/);
  assert.match(detailsSource, /const WEB_TOUCH_ACTION = \{ touchAction: 'pan-y pinch-zoom' \} as unknown as ViewStyle;/);
  assert(!surface.getText(detailsAst).includes('<ScrollView'));
  assert(!surface.getText(detailsAst).includes('preventDefault'));
});

const pointerModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../utils/galleryPointer.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, pointerModule);
function pointerHarness() {
  const listeners = new Map();
  const directions = []; let opened = 0;
  const node = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name), setPointerCapture: () => {} };
  const cleanup = pointerModule.exports.attachGalleryPointerNavigation(node, (direction) => directions.push(direction), () => opened++);
  const send = (type, x, y, extras = {}) => listeners.get(type)?.({ pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, ...extras, preventDefault: () => assert.fail('Page scrolling must not be prevented') });
  return { directions, get opened() { return opened; }, send, cleanup, listeners };
}

test('real pointer coordinates enable touch swipes and mouse dragging in both directions', () => {
  const h = pointerHarness();
  for (const pointerType of ['touch', 'mouse', 'pen']) {
    h.send('pointerdown', 150, 100, { pointerType }); h.send('pointerup', 50, 105, { pointerType });
    h.send('pointerdown', 50, 100, { pointerType }); h.send('pointerup', 150, 105, { pointerType });
  }
  assert.deepEqual(h.directions, [1, -1, 1, -1, 1, -1]);
  assert.equal(h.opened, 0);
});

test('vertical drags, diagonal drags and cancelled scrolling never change photos or open zoom', () => {
  const h = pointerHarness();
  h.send('pointerdown', 100, 100); h.send('pointerup', 105, 200);
  h.send('pointerdown', 100, 100); h.send('pointerup', 200, 200);
  h.send('pointerdown', 100, 100); h.send('pointercancel', 100, 150); h.send('pointerup', 10, 150);
  assert.deepEqual(h.directions, []); assert.equal(h.opened, 0);
});

test('taps open photo zoom but a moved drag returning to its start does not', () => {
  const h = pointerHarness();
  h.send('pointerdown', 100, 100); h.send('pointerup', 101, 101);
  assert.equal(h.opened, 1);
  h.send('pointerdown', 100, 100); h.send('pointermove', 100, 180); h.send('pointerup', 101, 101);
  assert.equal(h.opened, 1);
});

test('multi-touch cannot also navigate or accidentally open a photo', () => {
  const h = pointerHarness();
  h.send('pointerdown', 100, 100);
  h.send('pointerdown', 200, 100, { pointerId: 2, isPrimary: false });
  h.send('pointerup', 250, 100, { pointerId: 2, isPrimary: false });
  h.send('pointerup', 10, 100);
  assert.deepEqual(h.directions, []); assert.equal(h.opened, 0);
  h.cleanup(); assert.equal(h.listeners.size, 0);
});

test('main product photos have no overlaid arrow buttons and retain swipe, indicators, thumbnails and zoom', () => {
  const product = readFileSync(new URL('../app/ProductDetails.tsx', import.meta.url), 'utf8');
  assert(!product.includes('accessibilityLabel="Previous slide"'));
  assert(!product.includes('accessibilityLabel="Next slide"'));
  assert(!product.includes('styles.sliderArrow'));
  assert(product.includes('styles.sliderDots'));
  assert(product.includes('accessibilityLabel="Open photo zoom"'));
  assert(product.includes('accessibilityLabel={`Product image ${index + 1} of ${slides.length}`}'));
  assert(product.includes('goToSlide(index)'));
  assert(product.includes('product-gallery-touch-surface'));
});
