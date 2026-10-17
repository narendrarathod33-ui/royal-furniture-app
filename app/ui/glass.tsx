import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Glassmorphism 3D design tokens.
 *
 * Everything here is built from props React Native Web already forwards to CSS:
 * `backdropFilter`, `boxShadow` (multi-layer, inset included), `filter` and 3D
 * `transform` entries. On native those either degrade to a translucent tint
 * (backdrop blur has no equivalent) or render natively (shadows, transforms),
 * so the surfaces never break — they just get softer.
 *
 * The look has three ingredients:
 *   1. a translucent surface + backdrop blur (the glass itself)
 *   2. a luminous bevel — a brighter 1px top border over dimmer sides
 *   3. layered depth — an outer shadow plus inset highlight/glow
 * Add `glassTilt()` to key surfaces for the slight perspective lean.
 */

/** Soft luminous wash the whole app sits on, so the glass has light to refract. */
export const GLASS_BG_BASE = '#EFEAF0';

type GlassStyle = ViewStyle & { backdropFilter?: string };

/** RNW emits `backdropFilter` (and its -webkit- prefix); RN's types omit it. */
const glass = (style: GlassStyle): ViewStyle => style as ViewStyle;

/**
 * A glass preset used on a `<TextInput>`/`<Text>` needs a text style type, even
 * though the values are identical.
 */
export const asTextStyle = (style: ViewStyle): TextStyle => style as TextStyle;

const WHITE = (alpha: number) => `rgba(255,255,255,${alpha})`;
const INK = (alpha: number) => `rgba(31,16,40,${alpha})`;
const BLUR = (px: number, saturate = 150) => `blur(${px}px) saturate(${saturate}%)`;
/**
 * Backdrop blur is a web/RNW capability — on native the key is dropped so an
 * unsupported style never reaches the platform, and the panels simply stay
 * translucent (the rest of the treatment is platform-neutral).
 */
const blurLayer = (value: string): GlassStyle => (Platform.OS === 'web' ? { backdropFilter: value } : {});

/** Brighter top edge + dimmer sides = the lit rim of a glass panel. */
const BEVEL_TOP = WHITE(0.86);
const BEVEL_SIDE = WHITE(0.6);
const TOP_LIGHT = 'inset 0 1px 0 rgba(255,255,255,0.92)';
const BOTTOM_GLOW = 'inset 0 -14px 26px rgba(255,255,255,0.2)';
const DEPTH = (y: number, blur: number, alpha: number) => `0 ${y}px ${blur}px ${INK(alpha)}`;

export const GLASS = {
  /** Page backdrop layer. */
  background: glass({ backgroundColor: GLASS_BG_BASE }),

  /** Screens sit on the shared backdrop, so their own background is see-through. */
  transparent: glass({ backgroundColor: 'transparent' }),

  /** Crisp web depth for the floating nav (its RN shadow props are native-only). */
  floatShadow: glass({ boxShadow: '0 20px 44px rgba(31,16,40,0.26)' }),

  /** Default translucent card / panel. */
  panel: glass({
    backgroundColor: WHITE(0.52),
    ...blurLayer(BLUR(18)),
    borderWidth: 1,
    borderColor: BEVEL_SIDE,
    borderTopColor: BEVEL_TOP,
    boxShadow: `${DEPTH(14, 30, 0.13)}, ${TOP_LIGHT}, ${BOTTOM_GLOW}`,
  }),

  /** Panels that carry a lot of text: more opaque so contrast stays high. */
  panelStrong: glass({
    backgroundColor: WHITE(0.68),
    ...blurLayer(BLUR(20)),
    borderWidth: 1,
    borderColor: BEVEL_SIDE,
    borderTopColor: BEVEL_TOP,
    boxShadow: `${DEPTH(14, 30, 0.12)}, ${TOP_LIGHT}, ${BOTTOM_GLOW}`,
  }),

  /** Pills, chips, filters, small round icon buttons. */
  chip: glass({
    backgroundColor: WHITE(0.46),
    ...blurLayer(BLUR(12)),
    borderWidth: 1,
    borderColor: BEVEL_SIDE,
    borderTopColor: BEVEL_TOP,
    boxShadow: `${DEPTH(6, 14, 0.08)}, ${TOP_LIGHT}`,
  }),

  /** Selected state for the chips (brand red showing through the glass). */
  chipActive: glass({
    backgroundColor: 'rgba(218,25,33,0.14)',
    ...blurLayer(BLUR(12)),
    borderWidth: 1,
    borderColor: 'rgba(218,25,33,0.45)',
    borderTopColor: WHITE(0.7),
    boxShadow: `${DEPTH(6, 14, 0.1)}, ${TOP_LIGHT}`,
  }),

  /** Selected state for chips that were dark to begin with. */
  chipDarkActive: glass({
    backgroundColor: 'rgba(5,0,0,0.82)',
    ...blurLayer(BLUR(12)),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderTopColor: 'rgba(255,255,255,0.42)',
    boxShadow: `${DEPTH(6, 14, 0.12)}, inset 0 1px 0 rgba(255,255,255,0.28)`,
  }),

  /** Text fields: recessed glass, so they read as carved into the surface. */
  input: glass({
    backgroundColor: WHITE(0.62),
    ...blurLayer(BLUR(14)),
    borderWidth: 1,
    borderColor: WHITE(0.7),
    borderTopColor: WHITE(0.55),
    boxShadow: `inset 0 2px 8px ${INK(0.07)}, ${TOP_LIGHT}`,
  }),

  /** Primary dark button. */
  buttonPrimary: glass({
    backgroundColor: 'rgba(12,4,14,0.86)',
    ...blurLayer(BLUR(16)),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderTopColor: 'rgba(255,255,255,0.32)',
    boxShadow: `0 14px 28px rgba(9,3,10,0.34), inset 0 1px 0 rgba(255,255,255,0.26)`,
  }),

  /** Secondary (light) button. */
  buttonGhost: glass({
    backgroundColor: WHITE(0.68),
    ...blurLayer(BLUR(14)),
    borderWidth: 1,
    borderColor: WHITE(0.75),
    borderTopColor: WHITE(0.94),
    boxShadow: `${DEPTH(8, 18, 0.1)}, ${TOP_LIGHT}`,
  }),

  /** Brand red button / banner. */
  accent: glass({
    backgroundColor: 'rgba(218,25,33,0.9)',
    ...blurLayer(BLUR(16)),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderTopColor: 'rgba(255,255,255,0.5)',
    boxShadow: `0 16px 32px rgba(150,6,14,0.32), inset 0 1px 0 rgba(255,255,255,0.42)`,
  }),

  /** Glass chrome only (blur + bevel + depth) — keeps an existing background. */
  chrome: glass({
    ...blurLayer(BLUR(16)),
    borderWidth: 1,
    borderColor: BEVEL_SIDE,
    borderTopColor: BEVEL_TOP,
    boxShadow: `${DEPTH(12, 26, 0.12)}, ${TOP_LIGHT}`,
  }),

  /** Chunky dark glass (banners, toasts). */
  dark: glass({
    backgroundColor: 'rgba(10,4,12,0.78)',
    ...blurLayer(BLUR(16)),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderTopColor: 'rgba(255,255,255,0.26)',
    boxShadow: `0 16px 32px rgba(5,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)`,
  }),

  /** Image surfaces: no blur needed (the photo is opaque) — rim + depth only. */
  hero: glass({
    borderWidth: 1,
    borderColor: WHITE(0.62),
    borderTopColor: WHITE(0.9),
    boxShadow: `0 18px 36px ${INK(0.22)}, inset 0 1px 0 rgba(255,255,255,0.45)`,
  }),

  /** Top bars (header). */
  bar: glass({
    backgroundColor: WHITE(0.44),
    ...blurLayer(BLUR(20)),
    borderBottomWidth: 1,
    borderBottomColor: WHITE(0.7),
    boxShadow: `${DEPTH(10, 26, 0.1)}, ${TOP_LIGHT}`,
  }),

  /** Bottom action bars. */
  barTop: glass({
    backgroundColor: WHITE(0.44),
    ...blurLayer(BLUR(20)),
    borderTopWidth: 1,
    borderTopColor: WHITE(0.75),
    boxShadow: `0 -12px 30px ${INK(0.12)}, inset 0 1px 0 rgba(255,255,255,0.85)`,
  }),

  /** Floating navigation. */
  nav: glass({
    backgroundColor: WHITE(0.5),
    ...blurLayer(BLUR(22, 160)),
    borderWidth: 1,
    borderColor: WHITE(0.7),
    borderTopColor: WHITE(0.9),
    boxShadow: `0 18px 40px ${INK(0.22)}, ${TOP_LIGHT}`,
  }),

  /** Bottom sheets / modals. */
  sheet: glass({
    backgroundColor: 'rgba(252,251,253,0.86)',
    ...blurLayer(BLUR(26, 160)),
    borderTopWidth: 1,
    borderTopColor: WHITE(0.9),
    boxShadow: `0 -18px 40px ${INK(0.22)}, inset 0 1px 0 rgba(255,255,255,0.95)`,
  }),
} as const;

/**
 * Slight perspective lean for key surfaces (cards, product photos).
 * Keep the angles small — 1-2 degrees reads as depth, more reads as a bug.
 */
export const glassTilt = (rotateX = 1.4, rotateY = -1.6, perspective = 1000): ViewStyle => ({
  transform: [{ perspective }, { rotateX: `${rotateX}deg` }, { rotateY: `${rotateY}deg` }],
  transformOrigin: 'center',
});

/** Static 3D lift used by the launch screen plate. */
export const glassFloat: ViewStyle = { transformOrigin: 'center' };

/** Ambient backdrop: a light wash plus blurred colour blobs for the glass to refract. */
export function GlassBackdrop() {
  return (
    <View pointerEvents="none" style={styles.backdrop} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={[styles.blob, styles.blobSheen]} />
      <View style={[styles.blob, styles.blobRed]} />
      <View style={[styles.blob, styles.blobIndigo]} />
      <View style={[styles.blob, styles.blobGold]} />
      <View style={[styles.blob, styles.blobMaroon]} />
    </View>
  );
}

/**
 * Web-only extra: the page behind the app matches the backdrop, so overscroll
 * and letterboxing don't flash white.
 */
export function useGlassPageBackground() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.style.backgroundColor = GLASS_BG_BASE;
    if (document.body) document.body.style.backgroundColor = GLASS_BG_BASE;
  }, []);
}

/** True when the user asked the OS to reduce motion (web `prefers-reduced-motion`). */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', backgroundColor: GLASS_BG_BASE },
  blob: { position: 'absolute', borderRadius: 999 },
  blobSheen: { width: 460, height: 320, top: -70, right: -80, backgroundColor: 'rgba(255,255,255,0.85)', filter: 'blur(60px)' },
  blobRed: { width: 320, height: 320, top: -60, left: -90, backgroundColor: 'rgba(218,25,33,0.22)', filter: 'blur(72px)' },
  blobIndigo: { width: 420, height: 420, top: 130, right: -150, backgroundColor: 'rgba(40,41,132,0.2)', filter: 'blur(88px)' },
  blobGold: { width: 300, height: 300, bottom: -110, left: 30, backgroundColor: 'rgba(180,83,9,0.16)', filter: 'blur(80px)' },
  blobMaroon: { width: 240, height: 240, bottom: 40, right: -70, backgroundColor: 'rgba(131,4,6,0.14)', filter: 'blur(78px)' },
});
