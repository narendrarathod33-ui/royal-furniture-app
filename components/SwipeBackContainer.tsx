import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { isRTL } from '../app/i18n';

const EDGE_HIT_WIDTH = 52;

type Props = {
  enabled: boolean;
  onBack: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SwipeBackContainer({ enabled, onBack, children, style }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const containerRef = useRef<View>(null);
  const boxRef = useRef({ left: 0, width: windowWidth });
  const enabledRef = useRef(enabled);
  const onBackRef = useRef(onBack);
  const dismissingRef = useRef(false);

  enabledRef.current = enabled;
  onBackRef.current = onBack;

  useEffect(() => {
    dismissingRef.current = false;
    translateX.stopAnimation();
    translateX.setValue(0);
  }, [enabled, translateX]);

  const measureBox = () => {
    const node = containerRef.current as unknown as {
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    } | null;
    node?.measureInWindow?.((x, _y, w) => {
      if (w > 0) boxRef.current = { left: x, width: w };
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_evt, gesture) => {
          if (!enabledRef.current || dismissingRef.current) return false;
          if (gesture.numberActiveTouches > 1) return false;
          const rtl = isRTL();
          const boxWidth = boxRef.current.width || windowWidth;
          const leadingEdgeOffset = rtl
            ? boxRef.current.left + boxWidth - gesture.x0
            : gesture.x0 - boxRef.current.left;
          if (leadingEdgeOffset < -8 || leadingEdgeOffset > EDGE_HIT_WIDTH) return false;

          const directionalDx = rtl ? -gesture.dx : gesture.dx;
          return directionalDx > 10 && directionalDx > Math.abs(gesture.dy) * 1.35;
        },
        onPanResponderGrant: () => {
          measureBox();
          translateX.stopAnimation();
        },
        onPanResponderMove: (_evt, gesture) => {
          const rtl = isRTL();
          const boxWidth = boxRef.current.width || windowWidth;
          const clamped = rtl
            ? Math.max(-boxWidth, Math.min(0, gesture.dx))
            : Math.min(boxWidth, Math.max(0, gesture.dx));
          translateX.setValue(clamped);
        },
        onPanResponderRelease: (_evt, gesture) => {
          const rtl = isRTL();
          const boxWidth = boxRef.current.width || windowWidth;
          const progress = rtl ? -gesture.dx : gesture.dx;
          const rawVelocity = rtl ? -gesture.vx : gesture.vx;
          const velocity = Number.isFinite(rawVelocity) ? rawVelocity : 0;
          const shouldGoBack =
            progress >= Math.min(96, boxWidth * 0.25) || (progress > 24 && velocity >= 0.45);

          if (shouldGoBack) {
            dismissingRef.current = true;
            Animated.timing(translateX, {
              toValue: rtl ? -boxWidth : boxWidth,
              duration: 140,
              useNativeDriver: true,
            }).start(() => {
              onBackRef.current();
              dismissingRef.current = false;
              translateX.setValue(0);
            });
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              tension: 120,
              friction: 16,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            tension: 120,
            friction: 16,
            useNativeDriver: true,
          }).start();
        },
      }),
    [translateX, windowWidth],
  );

  const width = Math.max(1, boxRef.current.width || windowWidth);
  const opacity = translateX.interpolate({
    inputRange: [-width, 0, width],
    outputRange: [0.85, 1, 0.85],
    extrapolate: 'clamp',
  });

  return (
    <View
      testID="swipe-back-container"
      ref={containerRef}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0) boxRef.current.width = w;
        measureBox();
      }}
      style={[s.root, style]}
      {...panResponder.panHandlers}
    >
      <Animated.View style={[s.inner, { opacity, transform: [{ translateX }] }]}>
        {children}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, minHeight: 0, minWidth: 0 },
  inner: { flex: 1, minHeight: 0, minWidth: 0 },
});
