import { createContext, use, useEffect, useRef, useState } from 'react';
import { FlatList, Platform, View, type FlatListProps, type ViewToken } from 'react-native';
import { useAdaptiveLayout } from '../hooks/useAdaptiveLayout';
import { gridMetrics } from '../utils/adaptiveLayout';

const CardWidth = createContext<number | null>(null);
export function useGridCardWidth() {
  const layout = useAdaptiveLayout();
  return use(CardWidth) ?? gridMetrics(layout.width - 32, layout.fontScale).cardWidth;
}

/** Preserve the first visible product when a column-count change remounts FlatList. */
export function AdaptiveProductList<T extends { id: string }>(props: Omit<FlatListProps<T>, 'numColumns' | 'columnWrapperStyle'>) {
  const layout = useAdaptiveLayout();
  const [measured, setMeasured] = useState<number | null>(null);
  const { columns, gap, cardWidth } = gridMetrics(Math.max(0, (measured ?? layout.width) - 32), layout.fontScale);
  const list = useRef<FlatList<T>>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  useEffect(() => () => { if (retry.current) clearTimeout(retry.current); }, []);
  const anchor = useRef<string | null>(null);
  const tracking = useRef(({ viewableItems }: { viewableItems: ViewToken<T>[] }) => {
    if (viewableItems[0]) anchor.current = viewableItems[0].item.id;
  }).current;
  const data = props.data ? Array.from(props.data as ArrayLike<T>) : [];
  const index = Math.max(0, data.findIndex(item => item.id === anchor.current));
  useEffect(() => { attempts.current = 0; }, [columns]);
  return <View style={{ flex: 1, minWidth: 0 }} onLayout={e => setMeasured(e.nativeEvent.layout.width)}>
    <CardWidth.Provider value={cardWidth}>
      <FlatList {...props} ref={list} key={`columns-${columns}`} numColumns={columns}
        // Catalog-sized lists: keep memory bounded and batches small so
        // scrolling never queues a long JS render ahead of the next frame.
        windowSize={5}
        initialNumToRender={8}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={40}
        removeClippedSubviews={Platform.OS !== 'web'}
        initialScrollIndex={index ? Math.floor(index / columns) : undefined}
        onScrollToIndexFailed={({ index: row, averageItemLength }) => {
          if (attempts.current++ >= 3) return;
          list.current?.scrollToOffset({ offset: Math.max(1, averageItemLength) * row, animated: false });
          if (retry.current) clearTimeout(retry.current);
          retry.current = setTimeout(() => list.current?.scrollToIndex({ index: row, animated: false }), 120);
        }}
        onViewableItemsChanged={tracking} viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
        columnWrapperStyle={columns > 1 ? { gap, marginBottom: 18 } : undefined}
        contentContainerStyle={[props.contentContainerStyle, columns === 1 && { gap: 18 }]} />
    </CardWidth.Provider>
  </View>;
}
