import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const load = { timeout: 180_000 };
type Region = { x: number; y: number; width: number; height: number };
const region = (x: number, y: number, width: number, height: number): Region => ({ x, y, width, height });
const officialProducts = [
  {
    query: 'Serafina Corner Sofa',
    slug: 'serafina',
    fabrics: [
      'velvet-light-warm-grey-beige-1882-4',
      'chenille-pale-mint-1906-b-1',
      'chenille-ivory-white-1906-b-2',
      'chenille-pebble-beige-1906-b-3',
      'suede-pearl-white-2962-1',
    ],
    maskFile: 'serafina-corner-sofa.png',
    subject: region(0.38, 0.39, 0.2, 0.15),
    protected: {
      wall: region(0.5, 0.02, 0.45, 0.28),
      artwork: region(0.25, 0.08, 0.21, 0.17),
      plantTop: region(0.01, 0.2, 0.045, 0.05),
      plantMiddle: region(0.02, 0.29, 0.06, 0.04),
      leftBrownPillow: region(0.205, 0.46, 0.035, 0.04),
      leftWhitePillow: region(0.3, 0.44, 0.04, 0.05),
      rightLightPillow: region(0.61, 0.42, 0.05, 0.04),
      rightDarkPillow: region(0.705, 0.415, 0.03, 0.035),
      leftFoot: region(0.19, 0.724, 0.04, 0.007),
      chaiseFoot: region(0.82, 0.681, 0.06, 0.012),
      rug: region(0, 0.8, 1, 0.2),
    },
  },
  {
    query: 'Trento Single Seater Sofa',
    slug: 'trento',
    fabrics: [
      'feather-cream-white-1941-1',
      'feather-cream-beige-1941-2',
      'velvet-light-warm-grey-beige-1882-4',
      'feather-black-1941-9',
    ],
    maskFile: 'trento-single-seater-sofa.png',
    subject: region(0.37, 0.34, 0.23, 0.18),
    protected: {
      lamp: region(0, 0, 0.16, 0.85),
      wallArt: region(0.36, 0, 0.54, 0.23),
      leftWall: region(0, 0.25, 0.16, 0.55),
      sideTable: region(0.84, 0.46, 0.16, 0.42),
      rug: region(0, 0.92, 1, 0.08),
    },
  },
] as const;

test.beforeEach(async ({ page }) => {
  // Local photos and masks are the assets under test; block remote API/image noise.
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
});

async function openProduct(page: Page, query: string) {
  await page.goto('/', load);
  await page.getByRole('tab', { name: 'Search' }).click();
  const field = page.getByTestId('product-search-field');
  await field.locator('input').fill(query);
  await page.getByRole('button', { name: new RegExp(`^${query}, AED`) }).first().click();
  await expect(page.getByRole('button', { name: /Add to bag/ })).toBeVisible();
}

async function measureFabricCommit(page: Page, fabricId: string) {
  return page.evaluate(async (id) => {
    const button = document.querySelector(`[data-testid="fabric-swatch-${id}"]`) as HTMLElement;
    const start = performance.now();
    return new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Fabric preview did not update')); }, 2000);
      const observer = new MutationObserver(() => {
        if (!document.querySelector(`[data-testid="fabric-preview-${id}"]`)) return;
        clearTimeout(timeout);
        observer.disconnect();
        resolve(performance.now() - start);
      });
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-testid'] });
      button.click();
    });
  }, fabricId);
}

async function originalPhotoSource(page: Page) {
  const image = page.getByRole('button', { name: /^Product image 1 of/ }).locator('img').first();
  await expect(image).toBeVisible();
  const source = await image.getAttribute('src');
  expect(source).toBeTruthy();
  return source!;
}

/** Compare every real canvas pixel outside the mask, plus explicit protected props. */
async function compareWithOriginal(page: Page, originalSource: string, variantSource: string, maskSource: string, subject: Region, protectedRegions: Record<string, Region>) {
  return page.evaluate(async ({ original, variant, mask, region, protected: protectedInput }) => {
    const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not decode comparison image'));
      image.src = src;
    });
    const [base, changed, alpha] = await Promise.all([loadImage(original), loadImage(variant), loadImage(mask)]);
    const width = base.naturalWidth;
    const height = base.naturalHeight;
    const read = (image: HTMLImageElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    };
    const a = read(base); const b = read(changed); const m = read(alpha);
    const protectedEntries = Object.entries(protectedInput);
    const protectedStats = Object.fromEntries(protectedEntries.map(([name]) => [name, { sum: 0, count: 0, over12: 0, maskMax: 0 }]));
    let backgroundSum = 0; let backgroundCount = 0; let backgroundOver12 = 0;
    let subjectSum = 0; let subjectCount = 0;
    for (let y = 0; y < height; y++) {
      const activeProtected = protectedEntries.filter(([, item]) => y >= height * item.y && y < height * (item.y + item.height));
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const difference = (Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2])) / 3;
        if (m[index + 3] === 0) {
          backgroundSum += difference; backgroundCount++;
          if (difference > 12) backgroundOver12++;
        }
        if (x >= width * region.x && x < width * (region.x + region.width) && y >= height * region.y && y < height * (region.y + region.height)) {
          subjectSum += difference; subjectCount++;
        }
        for (const [name, item] of activeProtected) {
          if (x < width * item.x || x >= width * (item.x + item.width)) continue;
          const stat = protectedStats[name];
          stat.sum += difference; stat.count++;
          if (difference > 12) stat.over12++;
          stat.maskMax = Math.max(stat.maskMax, m[index + 3]);
        }
      }
    }
    return {
      backgroundMean: backgroundSum / backgroundCount,
      backgroundOver12: backgroundOver12 / backgroundCount,
      backgroundSamples: backgroundCount,
      subjectMean: subjectSum / subjectCount,
      protected: Object.fromEntries(Object.entries(protectedStats).map(([name, stat]) => [name, {
        mean: stat.sum / stat.count,
        over12: stat.over12 / stat.count,
        maskMax: stat.maskMax,
        samples: stat.count,
      }])),
    };
  }, { original: originalSource, variant: variantSource, mask: maskSource, region: subject, protected: protectedRegions });
}

test('every enabled official swatch recolours the subject without shifting the photographed room', async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync('/tmp/rf-fabric-visuals', { recursive: true });
  for (const viewport of [{ name: 'phone', width: 360, height: 800 }, { name: 'desktop', width: 1280, height: 900 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const product of officialProducts) {
      await openProduct(page, product.query);
      const original = await originalPhotoSource(page);
      const mask = `data:image/png;base64,${readFileSync(`assets/images/fabric-masks/${product.maskFile}`).toString('base64')}`;
      const screenshots: Buffer[] = [];
      const timings: Record<string, number> = {};
      for (const fabric of product.fabrics) {
        await page.getByTestId(`fabric-swatch-${fabric}`).click();
        const preview = page.getByTestId(`fabric-preview-${fabric}`).first();
        await expect(preview).toBeVisible();
        // The outgoing visual is retained under the incoming one during the crossfade.
        const renderedImage = preview.locator('img').last();
        await expect(renderedImage).toHaveAttribute('src', /^data:image\/webp/, { timeout: 30_000 });
        await page.waitForTimeout(220);
        const comparison = await compareWithOriginal(page, original, (await renderedImage.getAttribute('src'))!, mask, product.subject, product.protected);
        const worstProtected = Object.entries(comparison.protected).sort(([, a], [, b]) => b.mean - a.mean)[0];
        console.log(`${viewport.name}/${product.slug}/${fabric}: unmasked mean ${comparison.backgroundMean.toFixed(3)}, >12 ${(comparison.backgroundOver12 * 100).toFixed(3)}%, subject ${comparison.subjectMean.toFixed(3)}, worst protected ${worstProtected[0]} ${worstProtected[1].mean.toFixed(3)}`);
        // WebP re-encoding can cause tiny losses; a colour/filter layer causes a much larger shift.
        expect(comparison.backgroundMean).toBeLessThan(4);
        expect(comparison.backgroundOver12).toBeLessThan(0.02);
        expect(comparison.backgroundSamples).toBeGreaterThan(400_000);
        expect(comparison.subjectMean).toBeGreaterThan(0.05);
        for (const [name, metric] of Object.entries(comparison.protected)) {
          expect(metric.samples, `${viewport.name}/${product.slug}/${name} sample count`).toBeGreaterThan(0);
          expect(metric.maskMax, `${viewport.name}/${product.slug}/${name} must not be included in the upholstery mask`).toBe(0);
          expect(metric.mean, `${viewport.name}/${product.slug}/${name} changed`).toBeLessThan(4);
          expect(metric.over12, `${viewport.name}/${product.slug}/${name} has shifted pixels`).toBeLessThan(0.02);
        }
        const screenshot = await preview.screenshot();
        screenshots.push(screenshot);
        const path = `/tmp/rf-fabric-visuals/${viewport.name}-${product.slug}-${fabric}.png`;
        writeFileSync(path, screenshot);
        await test.info().attach(`${viewport.name}-${product.slug}-${fabric}`, { path, contentType: 'image/png' });
      }
      expect(new Set(screenshots.map((image) => image.toString('base64'))).size).toBe(product.fabrics.length);

      if (viewport.name === 'phone') {
        for (const fabric of product.fabrics) {
          timings[fabric] = await measureFabricCommit(page, fabric);
          expect(timings[fabric]).toBeLessThan(100);
          await page.waitForTimeout(200);
        }
        console.log(`${product.slug} warm-cache commits (ms):`, Object.fromEntries(Object.entries(timings).map(([id, ms]) => [id, Math.round(ms * 10) / 10])));
      }
    }
  }
});

test('official masked swatches respect stock, fit phone/desktop, and persist separate cart lines', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openProduct(page, 'Trento Single Seater Sofa');
  const creamWhite = 'feather-cream-white-1941-1';
  const creamBeige = 'feather-cream-beige-1941-2';
  const black = 'feather-black-1941-9';
  const yellow = 'velvet-warm-cream-yellow-1882-5';
  const selector = page.getByTestId('fabric-selector');
  await expect(selector).toBeVisible();
  await expect(page.getByTestId(`fabric-swatch-${creamWhite}`)).toHaveAttribute('aria-checked', 'true');

  const target = await page.getByTestId(`fabric-swatch-${black}`).boundingBox();
  expect(target?.width).toBeGreaterThanOrEqual(44);
  expect(target?.height).toBeGreaterThanOrEqual(44);
  const before = await page.getByTestId(`fabric-preview-${creamWhite}`).first().screenshot();
  await page.getByTestId(`fabric-swatch-${black}`).click();
  await expect(page.getByTestId(`fabric-preview-${black}`).first()).toBeVisible();
  await expect(page.getByText('AED 1,261', { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(220);
  const after = await page.getByTestId(`fabric-preview-${black}`).first().screenshot();
  expect(before.equals(after)).toBe(false);

  await page.getByTestId(`fabric-swatch-${creamBeige}`).click();
  await page.waitForTimeout(220);
  await page.getByTestId(`fabric-swatch-${black}`).click();
  await page.waitForTimeout(220);
  const elapsed = await measureFabricCommit(page, creamBeige);
  expect(elapsed).toBeLessThan(100);

  await page.getByTestId(`fabric-swatch-${yellow}`).dispatchEvent('click');
  await expect(page.getByTestId(`fabric-swatch-${yellow}`)).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId(`fabric-swatch-${creamBeige}`)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Not available', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Add to bag/ }).click();
  await page.getByTestId(`fabric-swatch-${creamWhite}`).click();
  await page.getByRole('button', { name: /Add to bag/ }).click();
  await page.getByRole('button', { name: 'Cart, 2 items' }).click();
  await expect(page.getByText('Fabric: CREAM BEIGE /1941-2', { exact: true })).toBeVisible();
  await expect(page.getByText('Fabric: CREAM WHITE /1941-1', { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rf-cart-v1') || '{}'));
  expect(stored.cart.map((item: any) => item.product.selectedFabric?.id)).toEqual([creamBeige, creamWhite]);

  await page.reload(load);
  await page.getByRole('button', { name: 'Cart, 2 items' }).click();
  await expect(page.getByText('Fabric: CREAM BEIGE /1941-2', { exact: true })).toBeVisible();
  await expect(page.getByText('Fabric: CREAM WHITE /1941-1', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await openProduct(page, 'Trento Single Seater Sofa');
  await expect(selector).toBeVisible();
  // The native-style screen transition can briefly place the incoming pane offscreen.
  await expect.poll(async () => (await selector.boundingBox())?.x ?? -1000).toBeGreaterThanOrEqual(0);
  const desktopBox = await selector.boundingBox();
  expect(desktopBox).toBeTruthy();
  expect(desktopBox!.x + desktopBox!.width).toBeLessThanOrEqual(1280);
});

test('wishlist persists an official fabric snapshot without an invented surcharge', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openProduct(page, 'Serafina Corner Sofa');
  const pebble = 'chenille-pebble-beige-1906-b-3';
  await page.getByTestId(`fabric-swatch-${pebble}`).click();
  await page.getByRole('button', { name: 'Save product' }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rf-cart-v1') || '{}'));
  expect(stored.savedFabrics['7072-serafina-corner-sofa']).toMatchObject({ id: pebble, name: 'PEBBLE BEIGE /1906 B-3', priceDelta: 0 });
});

test('products without named official colours have no selector or fabricated preview', async ({ page }) => {
  for (const query of ['The Sibby 6-Seater Sofa', 'The Rainbow Bed']) {
    await openProduct(page, query);
    await expect(page.getByTestId('fabric-selector')).toHaveCount(0);
    await expect(page.getByTestId('fabric-preview-velvet-light-warm-grey-beige-1882-4')).toHaveCount(0);
  }
});
