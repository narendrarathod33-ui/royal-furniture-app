import { fireEvent } from '@testing-library/react-native';

// Pure layout math: imported directly (the old suite vm-loaded the module).
import { gridMetrics, layoutMode, usableSegment } from '../utils/adaptiveLayout';
import { readDisplaySegments } from '../utils/webDisplaySegments';

// ---- Window breakpoints, grid metrics, fold geometry ----

test('window breakpoints use exact boundaries, not device or orientation labels', () => {
  for (const [width, expected] of [[320, 'compact'], [599, 'compact'], [600, 'medium'], [839, 'medium'], [840, 'expanded'], [1199, 'expanded'], [1200, 'wide']] as const) {
    expect(layoutMode(width)).toBe(expected);
  }
});

test('cards and gaps fit at phone, tablet, split-window and wide widths', () => {
  for (const width of [240, 288, 358, 568, 600, 736, 808, 992, 1248, 1328]) {
    const { columns, gap, cardWidth } = gridMetrics(width);
    expect(columns).toBeGreaterThanOrEqual(1);
    expect(columns).toBeLessThanOrEqual(5);
    expect(Math.abs(columns * cardWidth + (columns - 1) * gap - width)).toBeLessThan(0.001);
    expect(cardWidth).toBeGreaterThanOrEqual(0);
  }
  expect(gridMetrics(288).columns).toBe(1);
  expect(gridMetrics(358).columns).toBe(2);
  expect(gridMetrics(736).columns).toBe(3);
  expect(gridMetrics(1328).columns).toBe(5);
});

test('large text reduces columns instead of compressing card copy', () => {
  for (const width of [358, 736, 992, 1328]) {
    expect(gridMetrics(width, 1.8).columns).toBeLessThan(gridMetrics(width).columns);
  }
});

test('separating book and tabletop displays choose a complete usable region', () => {
  expect(usableSegment([{ left: 0, top: 0, width: 530, height: 800 }, { left: 550, top: 0, width: 530, height: 800 }], 1080, 800).left).toBe(0);
  expect(usableSegment([{ left: 0, top: 0, width: 900, height: 350 }, { left: 0, top: 370, width: 900, height: 430 }], 900, 800).top).toBe(370);
});

test('unsupported, continuous and malformed segment data use the ordinary responsive fallback', () => {
  for (const segments of [[], [{ left: 0, top: 0, width: 900, height: 800 }], [{ left: -1, top: 0, width: 500, height: 800 }, { left: 510, top: 0, width: 500, height: 800 }], [{ left: 0, top: 0, width: NaN, height: 800 }]]) {
    expect(usableSegment(segments as any, 900, 800)).toBeUndefined();
  }
});

test('CSS-only fold implementations read env segments and remove measuring probes', () => {
  let created = 0;
  let removed = 0;
  const fake: any = {
    matchMedia: (q: string) => ({ matches: q === '(horizontal-viewport-segments: 2)' }),
    document: {
      body: { appendChild() {} },
      createElement() {
        const i = created++;
        return { setAttribute() {}, style: {}, getBoundingClientRect: () => ({ left: i * 550, top: 0, width: 530, height: 800 }), remove() { removed++; } };
      },
    },
  };
  const result = readDisplaySegments(fake);
  expect(result.length).toBe(2);
  expect(result[1].left).toBe(550);
  expect(removed).toBe(2);
});

// The FlatList remount/column contract ("the real adaptive list measures its
// pane...") intentionally stays on the legacy node harness: RNTL v14 renders a
// host-only tree, so FlatList internal props (numColumns/initialScrollIndex)
// are unobservable, and partial-mocking react-native breaks the RN jest
// preset (TurboModule invariant). See scripts/adaptive-layout.test.mjs.

test('resize does not reset the active product photo, route, or selected size', () => {
  const { readFileSync } = require('node:fs');
  const details = readFileSync('app/ProductDetails.tsx', 'utf8');
  expect(details).toMatch(/\[sourceId, galleryKey, slides\.length, webGalleryOffset\]/);
  expect(details).not.toMatch(/\[sourceId, galleryKey, slides\.length, slideBox\.width/);
  expect(details).toMatch(/activeSlideRef\.current \+ 1/);
  expect(readFileSync('app/_layout.tsx', 'utf8')).toMatch(/<AdaptiveFrame><Stack(?:\s[^>]+)?>/);
  expect(readFileSync('hooks/useAdaptiveLayout.tsx', 'utf8')).not.toMatch(/key=\{/);
  expect(readFileSync('components/catalog/BottomNav.tsx', 'utf8')).toMatch(/navigation-rail/);
});
