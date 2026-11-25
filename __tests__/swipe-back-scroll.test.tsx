import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, BackHandler, PanResponder, Text } from 'react-native';
import HomeScreen from '../app/(tabs)/index';
import { royalFurnitureData } from '../app/data/royalFurnitureData';
import { useSessionStore } from '../stores/session';
import { clearScrollMemory, getScrollMemory, saveScrollMemory } from '../utils/scrollMemory';
import * as i18n from '../app/i18n';
import { SearchContent } from '../components/catalog/Screens';
import { SwipeBackContainer } from '../components/SwipeBackContainer';
import { byProps, byType } from './test-utils';

beforeEach(() => {
  useSessionStore.getState().resetUserData();
  clearScrollMemory();
});

test('session store tracks tabHistory, nested productStack, and steps back cleanly', () => {
  const store = useSessionStore.getState();
  expect(store.goBack()).toBe(false);

  store.setTab('categories');
  store.setTab('cart');
  expect(useSessionStore.getState().tab).toBe('cart');
  expect(useSessionStore.getState().tabHistory).toEqual(['home', 'categories']);

  const [p1, p2] = royalFurnitureData.products;
  store.openProduct(p1 as any);
  store.openProduct(p2 as any);
  expect(useSessionStore.getState().selected?.id).toBe(p2.id);
  expect(useSessionStore.getState().productStack.map((p) => p.id)).toEqual([p1.id]);

  expect(store.goBack()).toBe(true);
  expect(useSessionStore.getState().selected?.id).toBe(p1.id);

  expect(store.goBack()).toBe(true);
  expect(useSessionStore.getState().selected).toBeNull();
  expect(useSessionStore.getState().tab).toBe('cart');

  expect(store.goBack()).toBe(true);
  expect(useSessionStore.getState().tab).toBe('categories');

  expect(store.goBack()).toBe(true);
  expect(useSessionStore.getState().tab).toBe('home');
  expect(store.goBack()).toBe(false);

  store.openProduct(p1 as any);
  store.openProduct(p2 as any);
  store.closeProduct();
  expect(useSessionStore.getState().selected).toBeNull();
  expect(useSessionStore.getState().productStack).toEqual([]);
});

test('scrollMemory stores, matches by signature, preserves anchorId, and clears', () => {
  saveScrollMemory('browse', 'all:all:all:trending', 940, 'item-12');
  expect(getScrollMemory('browse', 'all:all:all:trending')).toEqual({
    signature: 'all:all:all:trending',
    offset: 940,
    anchorId: 'item-12',
  });

  saveScrollMemory('browse', 'all:all:all:trending', 1020);
  expect(getScrollMemory('browse', 'all:all:all:trending')).toEqual({
    signature: 'all:all:all:trending',
    offset: 1020,
    anchorId: 'item-12',
  });

  expect(getScrollMemory('browse', 'all:all:all:priceLow')).toBeUndefined();

  clearScrollMemory();
  expect(getScrollMemory('browse', 'all:all:all:trending')).toBeUndefined();
});

test('SwipeBackContainer captures only leading-edge horizontal swipes (LTR and RTL)', async () => {
  let capturedHandlers: any = null;
  const origCreate = PanResponder.create;
  const panSpy = jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
    capturedHandlers = config;
    return origCreate(config);
  });
  const animSpy = jest.spyOn(Animated, 'timing').mockImplementation((_val, _cfg) => ({
    start: (cb?: (res: { finished: boolean }) => void) => cb?.({ finished: true }),
    stop: () => {},
    reset: () => {},
  }) as any);
  const rtlSpy = jest.spyOn(i18n, 'isRTL');

  try {
    const onBack = jest.fn();
    const screen = await render(
      <SwipeBackContainer enabled onBack={onBack}>
        <Text>Detail screen</Text>
      </SwipeBackContainer>,
    );

    expect(screen.getByTestId('swipe-back-container')).toBeTruthy();
    expect(capturedHandlers).toBeTruthy();
    await act(async () => {
      screen.getByTestId('swipe-back-container').props.onLayout?.({
        nativeEvent: { layout: { width: 390, height: 844 } },
      });
    });

    // Center-screen swipe must not capture.
    expect(
      capturedHandlers.onMoveShouldSetPanResponderCapture({}, { x0: 190, dx: 120, dy: 4, numberActiveTouches: 1 }),
    ).toBe(false);
    // Vertical scroll from edge must not capture.
    expect(
      capturedHandlers.onMoveShouldSetPanResponderCapture({}, { x0: 16, dx: 5, dy: 110, numberActiveTouches: 1 }),
    ).toBe(false);
    // Multi-touch must not capture.
    expect(
      capturedHandlers.onMoveShouldSetPanResponderCapture({}, { x0: 16, dx: 90, dy: 2, numberActiveTouches: 2 }),
    ).toBe(false);

    // LTR leading edge swipe captures and triggers onBack.
    rtlSpy.mockReturnValue(false);
    expect(
      capturedHandlers.onMoveShouldSetPanResponderCapture({}, { x0: 18, dx: 32, dy: 4, numberActiveTouches: 1 }),
    ).toBe(true);
    await act(async () => {
      capturedHandlers.onPanResponderGrant({}, {});
      capturedHandlers.onPanResponderMove({}, { dx: 130 });
      capturedHandlers.onPanResponderRelease({}, { dx: 130, vx: 0.2 });
    });
    expect(onBack).toHaveBeenCalledTimes(1);

    // RTL leading edge (right edge of 390px) swiping left triggers onBack; left edge does not.
    rtlSpy.mockReturnValue(true);
    expect(
      capturedHandlers.onMoveShouldSetPanResponderCapture({}, { x0: 18, dx: -32, dy: 4, numberActiveTouches: 1 }),
    ).toBe(false);
    expect(
      capturedHandlers.onMoveShouldSetPanResponderCapture({}, { x0: 372, dx: -32, dy: 4, numberActiveTouches: 1 }),
    ).toBe(true);
    await act(async () => {
      capturedHandlers.onPanResponderRelease({}, { dx: -130, vx: -0.2 });
    });
    expect(onBack).toHaveBeenCalledTimes(2);
  } finally {
    panSpy.mockRestore();
    animSpy.mockRestore();
    rtlSpy.mockRestore();
  }
});

test('opening a product and going back preserves list scroll offset and search filters', async () => {
  const screen = await render(<HomeScreen />);

  // Navigate to Best sellers from Home.
  await act(async () => {
    useSessionStore.getState().setTab('bestSellers');
  });

  // Scroll down the Best sellers FlatList.
  const scrollViewsBefore = byType(screen.root, 'RCTScrollView');
  expect(scrollViewsBefore.length).toBeGreaterThan(0);
  await act(async () => {
    await fireEvent.scroll(scrollViewsBefore[0], {
      nativeEvent: {
        contentOffset: { x: 0, y: 1280 },
        contentSize: { width: 390, height: 3200 },
        layoutMeasurement: { width: 390, height: 800 },
      },
    });
  });
  expect(getScrollMemory('bestSellers', 'bestSellers')?.offset).toBe(1280);

  // Open a product, verify SwipeBackContainer wraps PDP, then go back via goBack().
  const target = royalFurnitureData.products[0] as any;
  await act(async () => {
    useSessionStore.getState().openProduct(target);
  });
  expect(byProps(screen.root, { accessibilityLabel: 'Go back' }).length).toBeGreaterThan(0);
  expect(screen.getByTestId('swipe-back-container')).toBeTruthy();

  await act(async () => {
    useSessionStore.getState().goBack();
  });

  // Best sellers remounts with restored offset instead of resetting to 0.
  const scrollViewsAfter = byType(screen.root, 'RCTScrollView');
  expect(scrollViewsAfter.length).toBeGreaterThan(0);
  expect(scrollViewsAfter[0].props.contentOffset).toEqual({ x: 0, y: 1280 });
  expect(scrollViewsAfter[0].props.initialNumToRender).toBeGreaterThan(8);

  // SearchContent disables autoFocus when restoring non-zero scroll so focus does not jump to top.
  saveScrollMemory('search', 'all:all:sofa', 640);
  const searchScreen = await render(
    <SearchContent
      searchState={{ query: 'sofa', category: 'all', subcategory: 'all' }}
      onSearchStateChange={() => {}}
      onProduct={() => {}}
      cartCount={0}
      onCart={() => {}}
      onAccount={() => {}}
    />,
  );
  const input = searchScreen.getByPlaceholderText(/Search/i);
  expect(input.props.value).toBe('sofa');
  expect(input.props.autoFocus).toBe(false);

  expect(BackHandler.addEventListener).toBeDefined();
});

test('PDP scroll memory and Deals filter/query state survive open -> back navigation', async () => {
  const screen = await render(<HomeScreen />);
  await act(async () => {
    useSessionStore.getState().setTab('shop');
  });

  // Type a search query in Deals, scroll down, open product, go back -> query & scroll survive.
  const searchInput = screen.getByLabelText('Search deals');
  await act(async () => {
    fireEvent.changeText(searchInput, 'bed');
  });

  const dealsList = byType(screen.root, 'RCTScrollView')[0];
  await act(async () => {
    await fireEvent.scroll(dealsList, {
      nativeEvent: {
        contentOffset: { x: 0, y: 840 },
        contentSize: { width: 390, height: 2400 },
        layoutMeasurement: { width: 390, height: 800 },
      },
    });
  });

  const [p1, p2] = royalFurnitureData.products;
  await act(async () => {
    useSessionStore.getState().openProduct(p1 as any);
  });

  // Scroll PDP down, open another product (nested PDP), go back -> PDP scroll restored.
  const pdpScroll = byType(screen.root, 'RCTScrollView').find((n: any) => !n.props.horizontal);
  expect(pdpScroll).toBeTruthy();
  await act(async () => {
    await fireEvent.scroll(pdpScroll!, {
      nativeEvent: {
        contentOffset: { x: 0, y: 520 },
        contentSize: { width: 390, height: 1800 },
        layoutMeasurement: { width: 390, height: 800 },
      },
    });
    useSessionStore.getState().openProduct(p2 as any);
  });
  expect(useSessionStore.getState().selected?.id).toBe(p2.id);

  await act(async () => {
    useSessionStore.getState().goBack();
  });
  expect(useSessionStore.getState().selected?.id).toBe(p1.id);
  const pdpScrollAfter = byType(screen.root, 'RCTScrollView').find((n: any) => !n.props.horizontal);
  expect(pdpScrollAfter?.props.contentOffset).toEqual({ x: 0, y: 520 });

  // Go back from PDP to Deals -> query "bed" and offset 840 are still there!
  await act(async () => {
    useSessionStore.getState().goBack();
  });
  expect(screen.getByLabelText('Search deals').props.value).toBe('bed');
  expect(byType(screen.root, 'RCTScrollView')[0].props.contentOffset).toEqual({ x: 0, y: 840 });
});
