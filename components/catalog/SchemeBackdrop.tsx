import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Scheme 8 — "Burgundy & Cream" (the published background-schemes preview the
 * user picked): warm cream base with a soft rose wash at the top and a gold
 * glow at the bottom, so every glass surface has light to refract.
 *
 * Mount once per screen root, behind the content; it never intercepts touches
 * and slides keep their own artwork, so the home hero tile is untouched.
 */

const Blob = ({ color, size, opacity, style }: { color: string; size: number; opacity: number; style: StyleProp<ViewStyle> }) => (
  <View style={[{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
    {[1, 0.84, 0.68].map((scale, layer) => (
      <View
        key={scale}
        style={{ position: 'absolute', width: size * scale, height: size * scale, borderRadius: (size * scale) / 2, backgroundColor: color, opacity: opacity * (0.5 + 0.5 * layer) }}
      />
    ))}
  </View>
);

export function SchemeBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={['#F8DFD3', '#FBF5EE', '#F6E3C6']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <Blob color="#E9B7B7" size={560} opacity={0.32} style={{ top: -210, end: -190 }} />
      <Blob color="#E3BC6A" size={520} opacity={0.3} style={{ bottom: -220, start: -190 }} />
    </View>
  );
}
