import { useEffect, useRef, type RefObject } from 'react';
import {
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

export type ScrollMemoryEntry = {
  signature?: string;
  offset: number;
  anchorId?: string;
};

const scrollMemoryMap = new Map<string, ScrollMemoryEntry>();

export function getScrollMemory(key: string, signature?: string): ScrollMemoryEntry | undefined {
  const entry = scrollMemoryMap.get(key);
  if (!entry) return undefined;
  if (signature !== undefined && entry.signature !== signature) return undefined;
  return entry;
}

export function saveScrollMemory(
  key: string,
  signature: string | undefined,
  offset: number,
  anchorId?: string,
): void {
  const safeOffset = Math.max(0, offset);
  const prev = scrollMemoryMap.get(key);
  scrollMemoryMap.set(key, {
    signature,
    offset: safeOffset,
    anchorId: anchorId ?? (prev && prev.signature === signature ? prev.anchorId : undefined),
  });
}

export function clearScrollMemory(): void {
  scrollMemoryMap.clear();
}

export function useSavedScrollViewProps(
  key: string,
  signature?: string,
  externalRef?: RefObject<ScrollView | null>,
) {
  const internalRef = useRef<ScrollView>(null);
  const scrollRef = externalRef ?? internalRef;
  const saved = getScrollMemory(key, signature);
  const pendingRestore = useRef<number | null>(
    saved && saved.offset > 0 ? saved.offset : null,
  );
  const restoreStartedAt = useRef<number>(Date.now());
  const lastSignature = useRef<string | undefined>(signature);

  if (lastSignature.current !== signature) {
    lastSignature.current = signature;
    const nextSaved = getScrollMemory(key, signature);
    pendingRestore.current = nextSaved && nextSaved.offset > 0 ? nextSaved.offset : null;
    restoreStartedAt.current = Date.now();
  }

  useEffect(() => {
    const target = pendingRestore.current;
    if (target === null || target <= 0) return;
    let active = true;
    const restore = () => {
      if (!active || pendingRestore.current === null) return;
      scrollRef.current?.scrollTo({ y: target, animated: false });
    };
    restore();
    const raf =
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(restore) : undefined;
    const done = setTimeout(() => {
      if (!active) return;
      restore();
      pendingRestore.current = null;
    }, 360);
    return () => {
      active = false;
      if (raf !== undefined && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(raf);
      }
      clearTimeout(done);
    };
  }, [key, signature, scrollRef]);

  return {
    ref: scrollRef,
    scrollEventThrottle: 32,
    contentOffset:
      Platform.OS === 'ios' && saved && saved.offset > 0 ? { x: 0, y: saved.offset } : undefined,
    onContentSizeChange: (_w: number, h: number) => {
      const target = pendingRestore.current;
      if (target === null || target <= 0) return;
      scrollRef.current?.scrollTo({ y: target, animated: false });
      if (h >= target + 1) pendingRestore.current = null;
    },
    onScrollBeginDrag: () => {
      pendingRestore.current = null;
    },
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      const target = pendingRestore.current;
      if (target !== null) {
        if (Math.abs(y - target) <= 40 || (y > 4 && Date.now() - restoreStartedAt.current > 120)) {
          pendingRestore.current = null;
        } else {
          return;
        }
      }
      saveScrollMemory(key, signature, y);
    },
  };
}
