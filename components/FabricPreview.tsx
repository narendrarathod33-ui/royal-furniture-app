import { useEffect, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, G, Image as SvgImage, Mask } from 'react-native-svg';
import {
  resolveFabricImage,
  type Fabric,
  type FabricProduct,
} from '../app/data/fabrics';

export const FABRIC_CROSSFADE_MS = 180;
const MAX_CACHE_ENTRIES = 40;
const recolourCache = new Map<string, string>();
const recolourPending = new Map<string, Promise<string | null>>();
const missingMaskWarnings = new Set<string>();

function uriFor(source?: ImageSourcePropType): string | undefined {
  if (!source) return undefined;
  if (typeof source === 'object' && !Array.isArray(source) && 'uri' in source) return source.uri || undefined;
  // Expo resolves bundled numeric assets on both web and native; RN Web does
  // not implement Image.resolveAssetSource.
  return Asset.fromModule(source as number).uri || undefined;
}

function cacheKey(productId: string, source: string, mask: string, fabric: Fabric) {
  return [productId, source, mask, fabric.id, fabric.hex, fabric.textureImage || ''].join('|');
}

/** Synchronous cache read used on every swatch press — no canvas work in the tap path. */
export function cachedFabricRecolour(productId: string, source: string, mask: string, fabric: Fabric) {
  return recolourCache.get(cacheKey(productId, source, mask, fabric));
}

function loadWebImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Fabric image could not be loaded'));
    image.src = uri;
  });
}

function brightness(hex: string) {
  const match = /^#([\da-f]{6})$/i.exec(hex);
  if (!match) return 0.5;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// A pure colour blend keeps the source luminance, which can make navy look
// powder-blue on a pale sofa. This shared depth pass preserves the same folds
// while bringing dark fabrics much closer to their advertised colour.
function multiplyOpacity(hex: string) {
  const value = brightness(hex);
  return value < 0.3 ? 0.72 : value < 0.55 ? 0.48 : 0.14;
}

/**
 * Pre-renders one web variant. The masked colour blend retains the photograph's
 * luminance (folds/highlights), and a restrained multiply pass gives darker
 * fabrics their true depth. Texture is soft-light blended inside the same mask.
 */
async function renderWebRecolour(productId: string, source: string, mask: string, fabric: Fabric): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    const [base, maskImage, texture] = await Promise.all([
      loadWebImage(source),
      loadWebImage(mask),
      fabric.textureImage ? loadWebImage(fabric.textureImage) : Promise.resolve(null),
    ]);
    const scale = Math.min(1, 1200 / base.naturalWidth);
    const width = Math.max(1, Math.round(base.naturalWidth * scale));
    const height = Math.max(1, Math.round(base.naturalHeight * scale));
    const layer = document.createElement('canvas');
    layer.width = width;
    layer.height = height;
    const layerContext = layer.getContext('2d');
    if (!layerContext) return null;
    layerContext.fillStyle = fabric.hex;
    layerContext.fillRect(0, 0, width, height);
    if (texture) {
      const pattern = layerContext.createPattern(texture, 'repeat');
      if (pattern) {
        layerContext.globalCompositeOperation = 'soft-light';
        layerContext.globalAlpha = 0.34;
        layerContext.fillStyle = pattern;
        layerContext.fillRect(0, 0, width, height);
      }
    }
    layerContext.globalCompositeOperation = 'destination-in';
    layerContext.globalAlpha = 1;
    layerContext.drawImage(maskImage, 0, 0, width, height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(base, 0, 0, width, height);
    context.globalCompositeOperation = 'color';
    context.globalAlpha = 0.9;
    context.drawImage(layer, 0, 0);
    context.globalCompositeOperation = 'multiply';
    context.globalAlpha = multiplyOpacity(fabric.hex);
    context.drawImage(layer, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    return canvas.toDataURL('image/webp', 0.92);
  } catch {
    // CORS or decode failure: the live GPU/CSS mask remains available.
    return null;
  }
}

function precomputeWebRecolour(productId: string, source: string, mask: string, fabric: Fabric): Promise<string | null> {
  const key = cacheKey(productId, source, mask, fabric);
  const cached = recolourCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = recolourPending.get(key);
  if (pending) return pending;
  const request = renderWebRecolour(productId, source, mask, fabric).then((result) => {
    recolourPending.delete(key);
    if (result) {
      recolourCache.set(key, result);
      while (recolourCache.size > MAX_CACHE_ENTRIES) {
        const oldest = recolourCache.keys().next().value;
        if (oldest) recolourCache.delete(oldest);
      }
    }
    return result;
  });
  recolourPending.set(key, request);
  return request;
}

type PreviewProduct = FabricProduct & { n?: string };
type VisualProps = {
  product: PreviewProduct;
  fabric?: Fabric;
  source?: ImageSourcePropType;
  cachedSource?: ImageSourcePropType;
};

function MaskedTexture({ product, fabric, mask }: { product: PreviewProduct; fabric: Fabric; mask: ImageSourcePropType }) {
  const texture = resolveFabricImage(fabric.textureImage);
  if (!texture) return null;
  const maskId = `fabric-${product.id}-${fabric.id}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  return (
    <View pointerEvents="none" style={[styles.fill, styles.textureBlend]} accessible={false}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" accessible={false}>
        <Defs>
          <Mask id={maskId} x="0" y="0" width="100" height="100" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" maskType="alpha">
            <SvgImage href={mask} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet" />
          </Mask>
        </Defs>
        <G mask={`url(#${maskId})`}>
          <SvgImage href={texture} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" opacity={0.34} />
        </G>
      </Svg>
    </View>
  );
}

function FabricVisual({ product, fabric, source, cachedSource }: VisualProps) {
  const variant = resolveFabricImage(fabric?.variantImage);
  const direct = variant || cachedSource;
  const name = product.n || product.id;
  if (direct) {
    return <Image source={direct} style={styles.image} resizeMode="contain" accessibilityLabel={`${name}${fabric ? ` in ${fabric.name} fabric` : ''}`} />;
  }

  const mask = resolveFabricImage(product.maskImage);
  const supportsBlend = Platform.OS !== 'android' || Number(Platform.Version) >= 29;
  return (
    <View style={styles.fill} pointerEvents="none">
      <Image source={source} style={styles.image} resizeMode="contain" accessibilityLabel={`${name}${fabric ? ` in ${fabric.name} fabric` : ''}`} />
      {fabric && mask ? (
        <>
          <View accessible={false} style={[styles.fill, styles.colourBlend, { opacity: supportsBlend ? 0.9 : 0.22 }]}>
            <Image source={mask} resizeMode="contain" accessible={false} style={[styles.image, { tintColor: fabric.hex }]} />
          </View>
          {supportsBlend && <View accessible={false} style={[styles.fill, styles.multiplyBlend, { opacity: multiplyOpacity(fabric.hex) }]}>
            <Image source={mask} resizeMode="contain" accessible={false} style={[styles.image, { tintColor: fabric.hex }]} />
          </View>}
          <MaskedTexture product={product} fabric={fabric} mask={mask} />
        </>
      ) : null}
    </View>
  );
}

/** One reusable fabric image for web and native product galleries. */
export function FabricPreview({
  product,
  fabric,
  source,
  style,
}: {
  product: PreviewProduct;
  fabric?: Fabric;
  source?: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
}) {
  const [previous, setPrevious] = useState<Fabric>();
  const [cacheVersion, setCacheVersion] = useState(0);
  const lastFabric = useRef(fabric);
  const fade = useRef(new Animated.Value(1)).current;
  const sourceUri = uriFor(source);
  const maskUri = uriFor(resolveFabricImage(product.maskImage));

  useEffect(() => {
    if (!__DEV__ || !fabric || fabric.variantImage || product.maskImage) return;
    if (missingMaskWarnings.has(product.id)) return;
    missingMaskWarnings.add(product.id);
    console.warn(`FabricPreview: product "${product.id}" needs a maskImage aligned to its primary product image; keeping the original photograph unchanged.`);
  }, [fabric, product.id, product.maskImage]);

  useEffect(() => {
    if (lastFabric.current?.id === fabric?.id) return;
    fade.stopAnimation();
    setPrevious(lastFabric.current);
    lastFabric.current = fabric;
    fade.setValue(0);
    // Keep the previous layer underneath after the fade; it is fully covered,
    // and retaining it avoids an extra render/timer on every swatch press.
    Animated.timing(fade, { toValue: 1, duration: FABRIC_CROSSFADE_MS, useNativeDriver: true }).start();
  }, [fabric?.id, fade]);

  useEffect(() => () => fade.stopAnimation(), [fade]);

  useEffect(() => {
    let active = true;
    const options = product.fabrics?.filter((option) => option.inStock) || [];
    // Warm variant-image caches as well as the recoloured canvas results.
    for (const option of options) {
      const variantUri = uriFor(resolveFabricImage(option.variantImage));
      if (variantUri && typeof Image.prefetch === 'function') void Image.prefetch(variantUri).catch(() => false);
    }
    if (Platform.OS !== 'web' || !sourceUri || !maskUri) return () => { active = false; };
    const jobs = options.filter((option) => !option.variantImage).map((option) =>
      precomputeWebRecolour(product.id, sourceUri, maskUri!, option),
    );
    void Promise.all(jobs).then(() => { if (active) setCacheVersion((value) => value + 1); });
    return () => { active = false; };
  }, [product.id, product.fabrics, sourceUri, maskUri]);

  // cacheVersion is intentionally read: completed pre-renders replace fallback layers.
  void cacheVersion;
  const cachedUri = fabric && sourceUri && maskUri && !fabric.variantImage
    ? cachedFabricRecolour(product.id, sourceUri, maskUri, fabric)
    : undefined;
  const cachedSource = cachedUri ? { uri: cachedUri } : undefined;

  return (
    <View style={[styles.root, style]} testID={`fabric-preview-${fabric?.id || 'base'}`}>
      {previous && <View pointerEvents="none" style={styles.fill}><FabricVisual product={product} fabric={previous} source={source} /></View>}
      <Animated.View style={[styles.fill, { opacity: fade }]}>
        <FabricVisual product={product} fabric={fabric} source={source} cachedSource={cachedSource} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', isolation: 'isolate' },
  fill: { ...StyleSheet.absoluteFillObject },
  image: { width: '100%', height: '100%', position: 'absolute', inset: 0 },
  colourBlend: { mixBlendMode: 'color' },
  multiplyBlend: { mixBlendMode: 'multiply' },
  textureBlend: { mixBlendMode: 'soft-light' },
});
