import { GLASS } from '../app/ui/glass';
import { AdaptiveFrame } from '../hooks/useAdaptiveLayout';
import { wrapSlideIndex } from '../utils/gallery';
import { useEffect, useRef, useState } from 'react';
import { Image, type ImageSourcePropType, type GestureResponderEvent, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from 'lucide-react-native';
import { clampPhotoZoom, INITIAL_ZOOM, movePhotoZoom, photoSwipeDirection, type PhotoZoom, type ZoomPoint } from '../utils/photoZoom';

type Props = { visible: boolean; photos: readonly { key: string; source: ImageSourcePropType }[]; index: number; onIndexChange: (index: number) => void; name: string; onClose: () => void };
export function ProductPhotoViewer({ visible, photos, index, onIndexChange, name, onClose }: Props) {
  const activeIndex = wrapSlideIndex(index, photos.length);
  const source = photos[activeIndex]?.source;
  const [zoom, setZoom] = useState<PhotoZoom>(INITIAL_ZOOM);
  const [box, setBox] = useState({ width: 1, height: 1 });
  const surface = useRef<View>(null);
  const current = useRef<PhotoZoom>(INITIAL_ZOOM);
  const gesture = useRef<{ zoom: PhotoZoom; points: ZoomPoint[] } | null>(null);
  const swipe = useRef<{ start: ZoomPoint; last: ZoomPoint; scale: number; pinched: boolean } | null>(null);
  const changePhoto = (delta: number) => {
    if (photos.length < 2) return;
    gesture.current = null; swipe.current = null;
    update(INITIAL_ZOOM);
    onIndexChange(wrapSlideIndex(activeIndex + delta, photos.length));
  };
  const update = (next: PhotoZoom) => { current.current = next; setZoom(next); };
  useEffect(() => { update(INITIAL_ZOOM); gesture.current = null; swipe.current = null; }, [visible, source, activeIndex]);
  useEffect(() => { update(clampPhotoZoom(current.current, box.width, box.height)); gesture.current = null; }, [box.width, box.height]);
  const points = (event: GestureResponderEvent): ZoomPoint[] => {
    const touches = Array.from(event.nativeEvent.touches || []).slice(0, 2);
    if (Platform.OS === 'web') {
      const node = surface.current as unknown as HTMLElement;
      const rect = node?.getBoundingClientRect?.();
      if (rect) return touches.map((touch) => ({ x: touch.pageX - (rect.left + window.scrollX), y: touch.pageY - (rect.top + window.scrollY) }));
    }
    // Native viewport origin is captured from each touch's local coordinates.
    const first = touches[0];
    const left = first ? first.pageX - first.locationX : 0;
    const top = first ? first.pageY - first.locationY : 0;
    return touches.map((touch) => ({ x: touch.pageX - left, y: touch.pageY - top }));
  };
  const start = (event: GestureResponderEvent) => {
    const initial = points(event);
    gesture.current = { zoom: current.current, points: initial };
    swipe.current = initial[0] ? { start: initial[0], last: initial[0], scale: current.current.scale, pinched: initial.length > 1 } : null;
  };
  const move = (event: GestureResponderEvent) => {
    const next = points(event);
    if (swipe.current) {
      if (next.length > 1) swipe.current.pinched = true;
      if (next[0]) swipe.current.last = next[0];
    }
    if (!gesture.current || next.length !== gesture.current.points.length) { gesture.current = { zoom: current.current, points: next }; return; }
    update(movePhotoZoom(gesture.current.zoom, gesture.current.points, next, box.width, box.height));
  };
  const finish = () => {
    const completed = swipe.current;
    gesture.current = null; swipe.current = null;
    if (!completed) return;
    const direction = photoSwipeDirection(completed.scale, completed.pinched, completed.start, completed.last);
    if (direction) changePhoto(direction);
  };
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const key = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); changePhoto(event.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [visible, activeIndex, photos.length, onIndexChange]);
  const step = (delta: number) => { gesture.current = null; swipe.current = null; update(clampPhotoZoom({ ...current.current, scale: current.current.scale + delta }, box.width, box.height)); };
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <AdaptiveFrame><View accessibilityViewIsModal accessibilityLabel={`Zoomed photo of ${name}`} style={s.viewer}>
      <View style={s.toolbar}><Text numberOfLines={2} style={s.name}>{name}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close photo zoom" onPress={onClose} style={s.button}><X size={23} color="#FFF" /></Pressable></View>
      <View style={s.stage}>
      <View ref={surface} testID="photo-zoom-surface" style={[s.surface, Platform.OS === 'web' && { touchAction: 'none' }]} onLayout={(event) => setBox(event.nativeEvent.layout)}
        onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
        onResponderGrant={start} onResponderStart={(event) => { if (swipe.current && event.nativeEvent.touches.length > 1) swipe.current.pinched = true; }} onResponderMove={move} onResponderRelease={finish} onResponderTerminate={() => { gesture.current = null; swipe.current = null; }}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: zoom.x }, { translateY: zoom.y }, { scale: zoom.scale }] }]}>
          {!!source && <Image source={source} accessibilityLabel={name} resizeMode="contain" style={s.photo} />}
        </View>
      </View>
      {photos.length > 1 && <View pointerEvents="box-none" style={s.arrows}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous photo" onPress={() => changePhoto(-1)} style={s.button}><ChevronLeft color="#FFF" size={24} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next photo" onPress={() => changePhoto(1)} style={s.button}><ChevronRight color="#FFF" size={24} /></Pressable>
      </View>}
      </View>
      <View style={s.footer}><Text accessibilityLiveRegion="polite" style={s.counter}>{photos.length ? `${activeIndex + 1} of ${photos.length}` : 'No photos'}</Text><Text style={s.hint}>{zoom.scale > 1.01 ? 'Drag to explore · Reset zoom to swipe photos' : photos.length > 1 ? 'Swipe for photos · Pinch to zoom' : 'Pinch to zoom · Drag to explore'}</Text><View style={s.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" accessibilityState={{ disabled: zoom.scale <= 1 }} disabled={zoom.scale <= 1} onPress={() => step(-0.5)} style={[s.button, zoom.scale <= 1 && s.disabled]}><Minus color="#FFF" size={21} /></Pressable>
        <Text accessibilityLiveRegion="polite" style={s.percent}>{Math.round(zoom.scale * 100)}%</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" accessibilityState={{ disabled: zoom.scale >= 4 }} disabled={zoom.scale >= 4} onPress={() => step(0.5)} style={[s.button, zoom.scale >= 4 && s.disabled]}><Plus color="#FFF" size={21} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Reset photo zoom" onPress={() => { gesture.current = null; update(INITIAL_ZOOM); }} style={s.button}><RotateCcw color="#FFF" size={20} /></Pressable>
      </View></View>
    </View></AdaptiveFrame>
  </Modal>;
}
const s = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: '#19161DF5', paddingTop: 12, paddingBottom: 24 }, toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 }, name: { color: '#FFF', fontSize: 15, fontWeight: '600', flex: 1 }, button: { minWidth: 48, minHeight: 48, borderRadius: 24, backgroundColor: '#FFFFFF14', alignItems: 'center', justifyContent: 'center', ...GLASS.dark }, stage: { flex: 1, marginVertical: 12 }, surface: { flex: 1, overflow: 'hidden' }, arrows: { position: 'absolute', top: '50%', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' }, counter: { color: '#FFF', fontSize: 13, fontWeight: '600' }, photo: { width: '100%', height: '100%' }, footer: { alignItems: 'center', gap: 12 }, hint: { color: '#D5CFDB', fontSize: 12, textAlign: 'center', paddingHorizontal: 16, flexShrink: 1 }, controls: { flexDirection: 'row', gap: 12, alignItems: 'center' }, percent: { color: '#FFF', minWidth: 45, textAlign: 'center', fontSize: 13 }, disabled: { opacity: 0.35 },
});
