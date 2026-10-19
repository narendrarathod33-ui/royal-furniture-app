import { readDisplaySegments } from '../utils/webDisplaySegments';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { layoutMode, MAX_WORKSPACE, usableSegment, type DisplaySegment } from '../utils/adaptiveLayout';

const WindowContext = createContext<{ width: number; height: number; fontScale: number } | null>(null);
export function useAdaptiveLayout() {
  const window = useWindowDimensions();
  const frame = use(WindowContext) || window;
  const width = Math.min(frame.width, MAX_WORKSPACE);
  return { ...frame, width, mode: layoutMode(width), compactHeight: frame.height < 480,
    sidebar: width >= 1040 && frame.height >= 480,
    twoPane: width >= 840 && frame.fontScale <= 1.3 };
}

/** Pass the remaining content width to descendants after reserving a navigation rail. */
export function AdaptiveRegion({ inset, children }: { inset: number; children: ReactNode }) {
  const layout = useAdaptiveLayout();
  return <WindowContext.Provider value={{ width: Math.max(0, layout.width - inset), height: layout.height, fontScale: layout.fontScale }}>{children}</WindowContext.Provider>;
}

/** A stable frame: resizing/folding changes geometry, never the routed component key. */
export function AdaptiveFrame({ children }: { children: ReactNode }) {
  const window = useWindowDimensions();
  const [segment, setSegment] = useState<DisplaySegment | undefined>();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof globalThis.window === 'undefined') return;
    const browser = globalThis.window;
    const update = () => {
      setSegment(usableSegment(readDisplaySegments(browser), browser.innerWidth, browser.innerHeight));
    };
    update();
    browser.addEventListener('resize', update);
    browser.visualViewport?.addEventListener('resize', update);
    const queries = ['(horizontal-viewport-segments: 2)', '(vertical-viewport-segments: 2)', '(horizontal-viewport-segments: 3)', '(vertical-viewport-segments: 3)'].map(q => browser.matchMedia(q));
    queries.forEach(q => q.addEventListener?.('change', update));
    return () => {
      browser.removeEventListener('resize', update);
      browser.visualViewport?.removeEventListener('resize', update);
      queries.forEach(q => q.removeEventListener?.('change', update));
    };
  }, [window.width, window.height]);
  const width = Math.min(segment?.width ?? window.width, MAX_WORKSPACE);
  const height = segment?.height ?? window.height;
  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <WindowContext.Provider value={{ width, height, fontScale: window.fontScale }}>
      <View testID="adaptive-workspace" style={{ width, flex: segment ? undefined : 1, height: segment ? height : undefined,
        alignSelf: segment ? 'flex-start' : 'center', marginLeft: segment ? segment.left + (segment.width - width) / 2 : 0,
        marginTop: segment?.top ?? 0, overflow: 'hidden' }}>{children}</View>
    </WindowContext.Provider>
  </View>;
}
