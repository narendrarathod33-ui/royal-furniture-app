import { Image, StyleSheet, View } from 'react-native';

/** The supplied banner is informational only; preserve its artwork and proportions. */
export function HomePaymentCard() {
  return <View testID="home-payment-card" style={s.card}>
    <View testID="home-payment-artwork" style={s.frame}><Image
      source={require('../assets/images/home-deals-strip.webp')}
      accessibilityLabel="Shop now. Pay later with Tabby and Tamara."
      resizeMode="contain"
      style={s.banner}
    /></View>
  </View>;
}
const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 10, alignItems: 'center' },
  frame: { width: '100%', maxWidth: 624, aspectRatio: 1920 / 197, borderRadius: 8, overflow: 'hidden' },
  banner: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
});
