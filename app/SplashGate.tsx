import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassBackdrop, useGlassPageBackground, useReducedMotion } from './ui/glass';

/**
 * Launch screen: the logo emerges from depth inside a pane of glass, light
 * sweeps across the surface, then the whole thing dissolves into the app.
 *
 * Tune the pacing here — every animation window below is derived from these
 * numbers, and the sequence only touches transform/opacity (GPU friendly).
 * With `prefers-reduced-motion: reduce` the 3D lean and the sweep are dropped
 * for a plain fade, and a tap anywhere skips the sequence early.
 */
export const SPLASH_TIMING = {
  /** How long the logo takes to rotate up into place. */
  logoIn: 620,
  /** How long the brand glow takes to pulse across the glass. */
  glow: 900,
  /** Duration of the light sweep. */
  sweep: 620,
  /** Logo settled before the hand-off (after `logoIn`). */
  hold: 280,
  /** Crossfade into the app. */
  out: 420,
  /** Whole sequence when motion is reduced to a fade. */
  reduced: 700,
};

/** Intro length before the crossfade starts. */
const INTRO_MS = SPLASH_TIMING.logoIn + SPLASH_TIMING.hold;
/** Longest the launch screen can ever stay on screen (~1.3s). */
export const SPLASH_TOTAL_MS = INTRO_MS + SPLASH_TIMING.out;

/** Phase timing inside the sequence, as a 0-1 fraction of the intro. */
const PHASE = {
  start: SPLASH_TIMING.logoIn * 0.12,
  plate: SPLASH_TIMING.logoIn * 0.28,
  lift: SPLASH_TIMING.logoIn * 0.7,
  sweepStart: SPLASH_TIMING.logoIn * 0.3,
  hint: INTRO_MS * 0.5,
};
/** Clamped to just below 1 so every interpolation stays ascending. */
const at = (ms: number) => Math.min(Math.max(ms / INTRO_MS, 0), 0.98);

/** Swap the logo here (any PNG with a transparent background works). */
const LOGO = require('../assets/images/royal-logo.png');

export default function SplashGate({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [done, setDone] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;
  const leaving = useRef(false);

  useGlassPageBackground();

  const logoWidth = Math.min(Math.max(width * 0.56, 190), 330);
  const logoHeight = logoWidth * (594 / 2160);
  const travel = logoWidth / 2 + 60;

  /** Fade the launch screen away and unmount it. */
  const leave = useCallback(
    (fast = false) => {
      if (leaving.current) return;
      leaving.current = true;
      Animated.timing(exit, {
        toValue: 1,
        duration: fast ? 180 : reduced ? 200 : SPLASH_TIMING.out,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => setDone(true));
    },
    [exit, reduced],
  );

  useEffect(() => {
    if (reduced) {
      // Reduced motion: one soft fade, no movement.
      Animated.timing(progress, { toValue: 1, duration: SPLASH_TIMING.reduced, useNativeDriver: true }).start(({ finished }) => {
        if (finished) leave();
      });
    } else {
      Animated.timing(progress, {
        toValue: 1,
        duration: INTRO_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) leave();
      });
    }
    // Safety net: the launch screen can never outstay its welcome.
    const guard = setTimeout(() => leave(true), SPLASH_TOTAL_MS + 500);
    return () => clearTimeout(guard);
  }, [leave, progress, reduced]);

  const skip = useCallback(() => {
    progress.stopAnimation();
    leave(true);
  }, [leave, progress]);

  // --- animations (all transform / opacity) ---
  const overlayOpacity = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const plateOpacity = reduced
    ? progress
    : progress.interpolate({ inputRange: [0, at(PHASE.plate)], outputRange: [0, 1], extrapolate: 'clamp' });
  const plateScale = reduced
    ? 1
    : progress.interpolate({ inputRange: [0, at(PHASE.lift)], outputRange: [1.06, 1], extrapolate: 'clamp' });
  const plateLift = reduced ? 0 : progress.interpolate({ inputRange: [0, at(PHASE.lift)], outputRange: [18, 0], extrapolate: 'clamp' });
  const plateExit = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });

  const logoOpacity = reduced
    ? progress
    : progress.interpolate({ inputRange: [at(PHASE.start), at(PHASE.start + SPLASH_TIMING.logoIn * 0.4)], outputRange: [0, 1], extrapolate: 'clamp' });
  const logoScale = reduced ? 1 : progress.interpolate({ inputRange: [0, at(PHASE.lift)], outputRange: [0.74, 1], extrapolate: 'clamp' });
  const logoRotate = reduced
    ? '0deg'
    : progress.interpolate({ inputRange: [0, at(PHASE.lift)], outputRange: ['34deg', '0deg'], extrapolate: 'clamp' });
  const logoLift = reduced ? 0 : progress.interpolate({ inputRange: [0, at(PHASE.lift)], outputRange: [26, 0], extrapolate: 'clamp' });

  const glowOpacity = reduced
    ? 0.5
    : progress.interpolate({
        inputRange: [0, at(SPLASH_TIMING.glow * 0.2), at(SPLASH_TIMING.glow * 0.45), at(SPLASH_TIMING.glow * 0.7), at(SPLASH_TIMING.glow * 0.9), 1],
        outputRange: [0, 0.85, 0.4, 0.9, 0.35, 0.6],
      });
  const glowScale = reduced ? 1 : progress.interpolate({ inputRange: [0, at(PHASE.lift), 1], outputRange: [0.86, 1.12, 0.98] });

  const sweepOpacity = reduced
    ? 0
    : progress.interpolate({ inputRange: [at(PHASE.sweepStart), at(PHASE.sweepStart + SPLASH_TIMING.sweep * 0.3), at(PHASE.sweepStart + SPLASH_TIMING.sweep * 0.9), at(PHASE.sweepStart + SPLASH_TIMING.sweep)], outputRange: [0, 0.9, 0.7, 0], extrapolate: 'clamp' });
  const sweepX = reduced
    ? 0
    : progress.interpolate({ inputRange: [at(PHASE.sweepStart), at(PHASE.sweepStart + SPLASH_TIMING.sweep)], outputRange: [-travel, travel], extrapolate: 'clamp' });
  const hintOpacity = reduced ? 0 : progress.interpolate({ inputRange: [at(PHASE.hint), at(INTRO_MS * 0.9)], outputRange: [0, 0.45], extrapolate: 'clamp' });

  return (
    <View style={styles.root}>
      <GlassBackdrop />
      {children}
      {!done && (
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          {/* Frosted pane over the app: kept outside the animated plate so the
              backdrop filter samples the app behind it. */}
          <BlurView pointerEvents="none" intensity={55} tint="light" style={styles.frost} />
          <Pressable
            style={styles.pressArea}
            onPress={skip}
            accessibilityRole="button"
            accessibilityLabel="Skip intro"
            accessibilityHint="Dismisses the launch screen"
          >
            <Animated.View
              style={[
                styles.plate,
                {
                  width: logoWidth + 88,
                  height: logoHeight + 76,
                  opacity: plateOpacity,
                  transform: [{ translateY: plateLift }, { scale: plateScale }, { scale: plateExit }],
                },
              ]}
            >
              <Animated.View pointerEvents="none" style={[styles.sweep, { opacity: sweepOpacity, transform: [{ translateX: sweepX }, { rotate: '18deg' }] }]} />
              <Animated.View
                pointerEvents="none"
                style={[styles.glow, { width: logoWidth * 1.5, height: logoHeight * 3, opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
              />
              <Animated.View
                style={[
                  styles.logoWrap,
                  { opacity: logoOpacity, transform: [{ perspective: 900 }, { translateY: logoLift }, { rotateX: logoRotate }, { scale: logoScale }] },
                ]}
              >
                <Image source={LOGO} style={{ width: logoWidth, height: logoHeight }} resizeMode="contain" accessibilityLabel="Royal Furniture" />
              </Animated.View>
            </Animated.View>
            <Animated.Text style={[styles.hint, { opacity: hintOpacity }]}>Tap to skip</Animated.Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 999, alignItems: 'center', justifyContent: 'center' },
  pressArea: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 26 },
  plate: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.66)',
    borderTopColor: 'rgba(255,255,255,0.92)',
    boxShadow: '0 26px 60px rgba(31,16,40,0.24), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -20px 40px rgba(255,255,255,0.28)',
  },
  frost: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(247,244,249,0.42)' },
  sweep: { position: 'absolute', top: -60, bottom: -60, width: 54, backgroundColor: 'rgba(255,255,255,0.55)', filter: 'blur(10px)' },
  glow: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(218,25,33,0.34)', filter: 'blur(46px)' },
  logoWrap: { alignItems: 'center', justifyContent: 'center' },
  hint: { color: '#444444', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
});
