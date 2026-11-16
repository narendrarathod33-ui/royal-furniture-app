import { fireEvent, render } from '@testing-library/react-native';
import { catalogData } from '../app/data/catalogData';
import { getColorSwatches } from '../app/data/colorSwatches';
import * as colorManifest from '../app/data/colorVariantManifest';
import ProductDetails from '../app/ProductDetails';
import type { ListedProduct } from '../components/catalog/kit';
import {
  buildColorEditPrompt,
  buildProductSwatches,
  colorFromProductId,
  encodeColorVariantSuffix,
  findCachedVariantForSelection,
  normalizeFabrics,
  parseSwatchName,
  resolveColorVariantImageUrl,
  stripProductVariantSuffixes,
  variantCacheKey,
} from '../utils/colorVariants';
import { byProps, byType, flattenText } from './test-utils';

const serafina = catalogData[0] as unknown as ListedProduct;

describe('colorVariants utilities', () => {
  test('parses factory swatch names and normalizes fabrics', () => {
    expect(parseSwatchName('CREAM WHITE /1882-1')).toEqual({
      displayName: 'Cream White',
      code: '1882-1',
      fullName: 'CREAM WHITE /1882-1',
    });
    expect(parseSwatchName('PALE MINT /1906 B-1')).toEqual({
      displayName: 'Pale Mint',
      code: '1906 B-1',
      fullName: 'PALE MINT /1906 B-1',
    });
    expect(normalizeFabrics(['Fabric', 'VELVET', 'velvet', 'CHENILLE', 'SUEDE'])).toEqual([
      'VELVET',
      'CHENILLE',
      'SUEDE',
    ]);
    expect(normalizeFabrics(['Fabric'])).toEqual(['Fabric']);
  });

  test('generates deterministic cache keys, URLs, cart suffixes, and gpt-image-2.6-sunburst prompts', () => {
    expect(variantCacheKey('CREAM WHITE /1882-1', 'VELVET')).toBe('velvet--cream-white-1882-1');
    expect(variantCacheKey('Oak')).toBe('oak');

    expect(resolveColorVariantImageUrl('/ai-color-variants/sofa/a.webp', '/royal-furniture-app')).toBe(
      '/royal-furniture-app/ai-color-variants/sofa/a.webp',
    );
    expect(resolveColorVariantImageUrl('images/web/a.webp')).toBe(
      'https://royal-furniture-515966538173-ap-south-1-an.s3.ap-south-1.amazonaws.com/images/web/a.webp',
    );
    expect(resolveColorVariantImageUrl('https://cdn.example.com/a.webp')).toBe('https://cdn.example.com/a.webp');

    const suffix = encodeColorVariantSuffix('CREAM WHITE /1882-1', 'VELVET');
    const cartId = `7072-serafina-corner-sofa::size=${encodeURIComponent('4-Seater')}${suffix}`;
    expect(stripProductVariantSuffixes(cartId)).toBe('7072-serafina-corner-sofa');
    expect(colorFromProductId(cartId)).toEqual({ color: 'CREAM WHITE /1882-1', fabric: 'VELVET' });

    const prompt = buildColorEditPrompt({
      productName: 'Serafina Corner Sofa',
      colorName: 'CREAM WHITE /1882-1',
      hex: '#F5F1E8',
      fabric: 'VELVET',
      category: 'sofas',
    });
    expect(prompt).toContain('Serafina Corner Sofa');
    expect(prompt).toContain('Cream White (exact color swatch #F5F1E8)');
    expect(prompt).toContain('velvet');
    expect(prompt).toContain('completely unchanged');
  });

  test('filters Selectable placeholders and resolves cached AI previews', () => {
    const swatches = buildProductSwatches({
      slug: 'serafina-corner-sofa',
      harvestSwatches: [
        { name: 'CREAM WHITE /1882-1', hex: '#F5F1E8', fabric: 'VELVET' },
      ],
      fallbackColors: [{ name: 'Selectable', hex: '#12235' }],
      manifestVariants: {
        'velvet--cream-white-1882-1': {
          image: '/ai-color-variants/serafina-corner-sofa/velvet--cream-white-1882-1.webp',
          colorName: 'CREAM WHITE /1882-1',
          hex: '#F5F1E8',
          fabric: 'VELVET',
          model: 'gpt-image-2.6-sunburst',
        },
      },
      webBasePath: '/royal-furniture-app',
    });

    expect(swatches).toHaveLength(1);
    expect(swatches[0].isAiPreview).toBe(true);
    expect(swatches[0].previewImage).toBe(
      '/royal-furniture-app/ai-color-variants/serafina-corner-sofa/velvet--cream-white-1882-1.webp',
    );
    expect(
      findCachedVariantForSelection(
        {
          'velvet--cream-white-1882-1': {
            image: '/ai-color-variants/serafina-corner-sofa/velvet--cream-white-1882-1.webp',
            colorName: 'CREAM WHITE /1882-1',
          },
        },
        'CREAM WHITE /1882-1',
        'BOUCLE',
      )?.exactFabricMatch,
    ).toBe(false);
  });

  test('colorSwatches catalog keeps all 11 real swatches for Serafina without Selectable', () => {
    const swatches = getColorSwatches('7072-serafina-corner-sofa');
    expect(swatches).toHaveLength(11);
    expect(swatches.some((s) => /selectable/i.test(s.name))).toBe(false);
    expect(swatches.filter((s) => s.fabric === 'CHENILLE')).toHaveLength(3);
    expect(swatches.filter((s) => s.fabric === 'SUEDE')).toHaveLength(4);
  });
});

describe('ProductDetails interactive color & fabric previewer', () => {
  test('filters swatches by fabric, updates finish banner, and sends selection on Add to bag', async () => {
    const onAdd = jest.fn();
    const screen = await render(
      <ProductDetails product={serafina} onBack={() => {}} onSave={() => {}} onAdd={onAdd} isSaved={false} />,
    );

    expect(byProps(screen.root, { testID: 'color-fabric-picker' })).toHaveLength(1);
    expect(flattenText(screen.root)).toContain('Colour (11)');

    // Filter to Chenille fabric -> 3 Chenille swatches
    const chenilleBtn = byProps(screen.root, { accessibilityLabel: 'Fabric: Chenille' })[0];
    await fireEvent(chenilleBtn, 'press');
    expect(flattenText(screen.root)).toContain('Colour (3)');

    // Select Pale Mint Chenille swatch
    const mintBtn = screen.root.queryAll(
      (node: any) =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Pale Mint 1906 B-1'),
      {},
    )[0];
    expect(mintBtn).toBeTruthy();
    await fireEvent(mintBtn, 'press');
    expect(flattenText(screen.root)).toContain('Selected: Pale Mint');

    // Add to bag transmits chosen color & fabric
    const addBtn = screen.root.queryAll(
      (node: any) =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Add to bag'),
      {},
    )[0];
    await fireEvent(addBtn, 'press');
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        price: serafina.o,
        color: 'PALE MINT /1906 B-1',
        fabric: 'CHENILLE',
      }),
    );

    // Reset restores clean studio view
    const resetBtn = byProps(screen.root, { accessibilityLabel: 'Original photo' })[0];
    await fireEvent(resetBtn, 'press');
    expect(flattenText(screen.root)).toContain('Colour (11)');
  });

  test('switches hero gallery image to cached gpt-image-2.6-sunburst preview on swatch tap', async () => {
    const spy = jest.spyOn(colorManifest, 'getManifestVariants').mockReturnValue({
      'velvet--cream-white-1882-1': {
        image: '/ai-color-variants/serafina-corner-sofa/velvet--cream-white-1882-1.webp',
        colorName: 'CREAM WHITE /1882-1',
        hex: '#F5F1E8',
        fabric: 'VELVET',
        model: 'gpt-image-2.6-sunburst',
      },
    });
    const onAdd = jest.fn();
    try {
      const screen = await render(
        <ProductDetails product={serafina} onBack={() => {}} onSave={() => {}} onAdd={onAdd} isSaved={false} />,
      );
      const creamBtn = screen.root.queryAll(
        (node: any) =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.startsWith('Cream White 1882-1'),
        {},
      )[0];
      expect(creamBtn).toBeTruthy();
      await fireEvent(creamBtn, 'press');

      expect(flattenText(screen.root)).toContain('Previewing: Cream White');
      expect(flattenText(screen.root)).toContain('AI preview');
      const images = byType(screen.root, 'Image');
      expect(
        images.some(
          (img: any) =>
            img.props.source?.uri === '/ai-color-variants/serafina-corner-sofa/velvet--cream-white-1882-1.webp' &&
            img.props.resizeMode === 'contain',
        ),
      ).toBe(true);

      const addBtn = screen.root.queryAll(
        (node: any) =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.startsWith('Add to bag'),
        {},
      )[0];
      await fireEvent(addBtn, 'press');
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'CREAM WHITE /1882-1',
          fabric: 'VELVET',
          previewImage: '/ai-color-variants/serafina-corner-sofa/velvet--cream-white-1882-1.webp',
        }),
      );
    } finally {
      spy.mockRestore();
    }
  });
});
