import { createContext, use, useEffect, useRef, useState } from 'react';
import { FlatList, Platform, View, type FlatListProps, type ViewToken } from 'react-native';
import { useAdaptiveLayout } from '../hooks/useAdaptiveLayout';
import { gridMetrics } from '../utils/adaptiveLayout';

const CardWidth = createContext<number | null>(null);
export function useGridCardWidth() {
  const layout = useAdaptiveLayout();
  return use(CardWidth) ?? gridMetrics(layout.width - 32, layout.fontScale).cardWidth;
}

export type AdaptiveListScrollProps<T> = Omit<FlatListProps<T>, 'numColumns' | 'columnWrapperStyle'> & {
  restoreScrollOffset?: number;
  restoreAnchorId?: string;
  onSaveScroll?: (offset: number, anchorId?: string) => void;
};

/** Preserve the first visible product when a column-count change remounts FlatList. */
export function AdaptiveProductList<T extends { id: string }>(props: AdaptiveListScrollProps<T>) {
  const { restoreScrollOffset, restoreAnchorId, onSaveScroll, ...flatProps } = props;
  const layout = useAdaptiveLayout();
  const [measured, setMeasured] = useState<number | null>(null);
  const { columns, gap, cardWidth } = gridMetrics(Math.max(0, (measured ?? layout.width) - 32), layout.fontScale);
  const list = useRef<FlatList<T>>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  useEffect(() => () => { if (retry.current) clearTimeout(retry.current); }, []);
  const anchor = useRef<string | null>(restoreAnchorId ?? null);
  const pendingRestore = useRef<number | null>(
    restoreScrollOffset && restoreScrollOffset > 0 ? restoreScrollOffset : null,
  );
  const restoreStartedAt = useRef<number>(Date.now());
  const lastOffset = useRef(restoreScrollOffset || 0);
  const tracking = useRef(({ viewableItems }: { viewableItems: ViewToken<T>[] }) => {
    if (viewableItems[0]) {
      anchor.current = viewableItems[0].item.id;
      if (pendingRestore.current === null && lastOffset.current > 0) {
        onSaveScroll?.(lastOffset.current, anchor.current);
      }
    }
  }).current;
  const data = flatProps.data ? Array.from(flatProps.data as ArrayLike<T>) : [];
  const index = Math.max(0, data.findIndex(item => item.id === anchor.current));
  useEffect(() => { attempts.current = 0; }, [columns]);
  useEffect(() => {
    const target = pendingRestore.current;
    if (target === null || target <= 0) return;
    let active = true;
    const apply = () => {
      if (active && pendingRestore.current !== null) {
        list.current?.scrollToOffset({ offset: target, animated: false });
      }
    };
    apply();
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(apply) : undefined;
    const timer = setTimeout(() => {
      if (!active) return;
      apply();
      pendingRestore.current = null;
    }, 420);
    return () => {
      active = false;
      if (raf !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, []);
  const initialRenderCount =
    pendingRestore.current !== null
      ? index > 0 && index < 60
        ? Math.min(data.length, Math.max(8, index + columns * 3))
        : pendingRestore.current < 7000
          ? Math.min(data.length, Math.max(12, Math.ceil(pendingRestore.current / 220) * columns + columns * 2))
          : 8
      : 8;
  return <View style={{ flex: 1, minWidth: 0 }} onLayout={e => setMeasured(e.nativeEvent.layout.width)}>
    <CardWidth.Provider value={cardWidth}>
      <FlatList {...flatProps} ref={list} key={`columns-${columns}`} numColumns={columns}
        // Catalog-sized lists: keep memory bounded and batches small so
        // scrolling never queues a long JS render ahead of the next frame.
        windowSize={5}
        initialNumToRender={initialRenderCount}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={40}
        removeClippedSubviews={Platform.OS !== 'web'}
        contentOffset={Platform.OS === 'ios' && restoreScrollOffset && restoreScrollOffset > 0 ? { x: 0, y: restoreScrollOffset } : undefined}
        initialScrollIndex={index ? Math.floor(index / columns) : undefined}
        scrollEventThrottle={flatProps.scrollEventThrottle ?? 32}
        onScroll={(e) => {
          flatProps.onScroll?.(e);
          const y = e.nativeEvent.contentOffset.y;
          if (pendingRestore.current !== null) {
            if (
              Math.abs(y - pendingRestore.current) <= 40 ||
              (y > 4 && Date.now() - restoreStartedAt.current > 120)
            ) {
              pendingRestore.current = null;
            } else {
              return;
            }
          }
          lastOffset.current = y;
          onSaveScroll?.(y, anchor.current ?? undefined);
        }}
        onScrollBeginDrag={(e) => {
          flatProps.onScrollBeginDrag?.(e);
          pendingRestore.current = null;
        }}
        onContentSizeChange={(w, h) => {
          flatProps.onContentSizeChange?.(w, h);
          const target = pendingRestore.current;
          if (target !== null && target > 0) {
            list.current?.scrollToOffset({ offset: target, animated: false });
            if (h >= target + 1) pendingRestore.current = null;
          }
        }}
        onScrollToIndexFailed={({ index: row, averageItemLength }) => {
          if (attempts.current++ >= 3) return;
          const fallbackOffset = pendingRestore.current ?? Math.max(1, averageItemLength) * row;
          list.current?.scrollToOffset({ offset: fallbackOffset, animated: false });
          if (retry.current) clearTimeout(retry.current);
          retry.current = setTimeout(() => list.current?.scrollToIndex({ index: row, animated: false }), 120);
        }}
        onViewableItemsChanged={tracking} viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
        columnWrapperStyle={columns > 1 ? { gap, marginBottom: 18 } : undefined}
        contentContainerStyle={[flatProps.contentContainerStyle, columns === 1 && { gap: 18 }]} />
    </CardWidth.Provider>
  </View>;
}
