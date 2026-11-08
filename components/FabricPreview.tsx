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
  fabricRenderColor,
  resolveFabricImage,
  type Fabric,
  type FabricPreviewAngle,
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
  return [productId, source, mask, fabric.id, fabricRenderColor(fabric) || '', fabric.textureImage || ''].join('|');
}

/** Synchronous cache read used on every swatch press — no canvas work in the tap path. */
export function cachedFabricRecolour(productId: string, source: string, mask: string, fabric: Fabric) {
  const key = cacheKey(productId, source, mask, fabric);
  const cached = recolourCache.get(key);
  // Map preserves insertion order: touching a hit makes the bounded cache LRU,
  // rather than evicting a frequently used selected colour behind a large type.
  if (cached) {
    recolourCache.delete(key);
    recolourCache.set(key, cached);
  }
  return cached;
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

function brightness(colour: string) {
  const match = /^#([\da-f]{6})$/i.exec(colour);
  const rgb = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(colour);
  if (!match && !rgb) return 0.5;
  const value = match ? parseInt(match[1], 16) : 0;
  const r = rgb ? Number(rgb[1]) : (value >> 16) & 255;
  const g = rgb ? Number(rgb[2]) : (value >> 8) & 255;
  const b = rgb ? Number(rgb[3]) : value & 255;
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
    // Manifest paths are logical asset keys, not browser URLs. Resolve the
    // close-up through Expo just like the base and mask before decoding it.
    const textureUri = uriFor(resolveFabricImage(fabric.textureImage));
    const [base, maskImage, texture] = await Promise.all([
      loadWebImage(source),
      loadWebImage(mask),
      textureUri ? loadWebImage(textureUri) : Promise.resolve(null),
    ]);
    const scale = Math.min(1, 1200 / base.naturalWidth);
    const width = Math.max(1, Math.round(base.naturalWidth * scale));
    const height = Math.max(1, Math.round(base.naturalHeight * scale));
    const layer = document.createElement('canvas');
    layer.width = width;
    layer.height = height;
    const layerContext = layer.getContext('2d');
    if (!layerContext) return null;
    const renderColor = fabricRenderColor(fabric);
    if (!renderColor) return null;
    layerContext.fillStyle = renderColor;
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
    context.globalAlpha = multiplyOpacity(renderColor);
    context.drawImage(layer, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    // Lossless pixels are required here: lossy WebP introduced isolated
    // off-white background pixels and a measurable contact-shadow difference.
    // The bounded LRU keeps these larger data URLs from growing without limit.
    return canvas.toDataURL('image/png');
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
  angle?: FabricPreviewAngle;
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

function FabricVisual({ product, fabric, source, cachedSource, angle }: VisualProps) {
  const whiteBase = resolveFabricImage(angle?.baseImage || product.baseImage);
  const variant = resolveFabricImage(fabric?.variantImage);
  // Current Fabric uses the angle's cleaned white base. Named colours use the
  // same base plus its aligned mask; a lifestyle source is never a substitute.
  const direct = (fabric?.isCurrent && whiteBase) || variant || cachedSource;
  const name = product.n || product.id;
  if (direct) {
    return <Image source={direct} style={styles.image} resizeMode="contain" accessibilityLabel={`${name}${fabric ? ` in ${fabric.name} fabric` : ''}`} />;
  }

  const mask = resolveFabricImage(angle?.maskImage || product.maskImage);
  const renderColor = fabricRenderColor(fabric);
  const canRecolour = !!fabric && !fabric.previewUnavailable && !fabric.isCurrent && !!renderColor;
  const supportsBlend = Platform.OS !== 'android' || Number(Platform.Version) >= 29;
  return (
    <View style={styles.fill} pointerEvents="none">
      <Image source={whiteBase || source} style={styles.image} resizeMode="contain" accessibilityLabel={`${name}${fabric ? ` in ${fabric.name} fabric` : ''}`} />
      {fabric && canRecolour && mask ? (
        <>
          <View accessible={false} style={[styles.fill, styles.colourBlend, { opacity: supportsBlend ? 0.9 : 0.22 }]}>
            <Image source={mask} resizeMode="contain" accessible={false} style={[styles.image, { tintColor: renderColor }]} />
          </View>
          {supportsBlend && <View accessible={false} style={[styles.fill, styles.multiplyBlend, { opacity: multiplyOpacity(renderColor!) }]}>
            <Image source={mask} resizeMode="contain" accessible={false} style={[styles.image, { tintColor: renderColor }]} />
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
  angle,
  prewarm = true,
}: {
  product: PreviewProduct;
  fabric?: Fabric;
  source?: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
  angle?: FabricPreviewAngle;
  prewarm?: boolean;
}) {
  const [previous, setPrevious] = useState<Fabric>();
  const [cacheVersion, setCacheVersion] = useState(0);
  const lastFabric = useRef(fabric);
  const fade = useRef(new Animated.Value(1)).current;
  const sourceUri = uriFor(resolveFabricImage(angle?.baseImage || product.baseImage) || source);
  const maskUri = uriFor(resolveFabricImage(angle?.maskImage || product.maskImage));
  const cachedUri = fabric && sourceUri && maskUri && !fabric.variantImage && !fabric.previewUnavailable && !fabric.isCurrent
    ? cachedFabricRecolour(product.id, sourceUri, maskUri, fabric)
    : undefined;
  const cachedSource = cachedUri ? { uri: cachedUri } : undefined;

  useEffect(() => {
    if (!__DEV__ || !fabric || fabric.variantImage || fabric.previewUnavailable || fabric.isCurrent || product.maskImage || angle?.maskImage) return;
    if (missingMaskWarnings.has(product.id)) return;
    missingMaskWarnings.add(product.id);
    console.warn(`FabricPreview: product "${product.id}" needs a maskImage aligned to its primary product image; keeping the original photograph unchanged.`);
  }, [fabric, product.id, product.maskImage, angle?.maskImage]);

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
    if (!prewarm) return;
    let active = true;
    const options = product.fabrics?.filter((option) => option.inStock) || [];
    // Warm direct variants and real close-ups before the customizer opens.
    for (const option of options) {
      for (const source of [option.variantImage, option.closeupImage, option.swatchImage]) {
        const uri = uriFor(resolveFabricImage(source));
        if (uri && typeof Image.prefetch === 'function') void Promise.resolve(Image.prefetch(uri)).catch(() => false);
      }
    }
    if (Platform.OS !== 'web' || !sourceUri || !maskUri) return () => { active = false; };
    const queue = options.filter((option) => !option.variantImage && !option.previewUnavailable && !option.isCurrent);
    // Warm one background render at a time. The selected colour has its own
    // deduplicated on-demand job below, so a large catalogue cannot monopolize
    // the main thread or allocate every full-resolution canvas simultaneously.
    void (async () => {
      for (const option of queue) {
        if (!active) return;
        await precomputeWebRecolour(product.id, sourceUri, maskUri!, option);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (active) setCacheVersion((value) => value + 1);
    })();
    return () => { active = false; };
  }, [product.id, product.fabrics, sourceUri, maskUri, prewarm]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !fabric || cachedUri || fabric.variantImage || fabric.previewUnavailable || fabric.isCurrent || !sourceUri || !maskUri) return;
    let active = true;
    void precomputeWebRecolour(product.id, sourceUri, maskUri, fabric).then((result) => {
      if (active && result) setCacheVersion((value) => value + 1);
    });
    return () => { active = false; };
  }, [product.id, fabric?.id, cachedUri, sourceUri, maskUri]);

  // cacheVersion is intentionally read: completed pre-renders replace fallback layers.
  void cacheVersion;

  return (
    <View style={[styles.root, style]} testID={`fabric-preview-${fabric?.id || 'base'}${angle ? `-${angle.angleId}` : ''}`}>
      {previous && <View pointerEvents="none" style={styles.fill}><FabricVisual product={product} fabric={previous} source={source} angle={angle} /></View>}
      <Animated.View style={[styles.fill, { opacity: fade }]}>
        <FabricVisual product={product} fabric={fabric} source={source} cachedSource={cachedSource} angle={angle} />
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
