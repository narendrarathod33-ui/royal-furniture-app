import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const load = { timeout: 180_000 };
type Region = { x: number; y: number; width: number; height: number };
const region = (x: number, y: number, width: number, height: number): Region => ({ x, y, width, height });
type Colour = { id: string; name: string; code?: string; current?: boolean; available?: boolean | null; priceDelta?: number | null; previewUnavailable?: boolean; variantKind?: string; variantPath?: string; closeupPath?: string; fabricId: string; fabricName: string };
const manifest = JSON.parse(readFileSync('app/data/fabricManifest.json', 'utf8'));
const products = Object.values(manifest.products) as any[];
function colours(id: string): Colour[] {
  const product = (manifest.products as any)[id];
  if (!product) return [];
  return product.fabricTypes.flatMap((fabric: any) => fabric.colours.map((colour: any) => ({ ...colour, fabricId: fabric.id, fabricName: fabric.name })));
}
const comboId = (colour: Colour) => `${colour.fabricId}::${colour.id}`;
const availableNamed = (colour: Colour) => !colour.current && colour.available !== false;
const escapeText = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const officialProducts = [
  {
    id: '7072-serafina-corner-sofa', query: 'Serafina Corner Sofa', slug: 'serafina', maskFile: 'serafina-corner-sofa.png',
    subject: region(0.38, 0.39, 0.2, 0.15),
    protected: {
      wall: region(0.5, 0.02, 0.45, 0.28), artwork: region(0.25, 0.08, 0.21, 0.17), plantTop: region(0.01, 0.2, 0.045, 0.05), plantMiddle: region(0.02, 0.29, 0.06, 0.04),
      leftBrownPillow: region(0.205, 0.46, 0.035, 0.04), leftWhitePillow: region(0.3, 0.44, 0.04, 0.05), rightLightPillow: region(0.61, 0.42, 0.05, 0.04), rightDarkPillow: region(0.705, 0.415, 0.03, 0.035),
      leftFoot: region(0.19, 0.724, 0.04, 0.007), chaiseFoot: region(0.82, 0.681, 0.06, 0.012), rug: region(0, 0.8, 1, 0.2),
    },
  },
  {
    id: '6219-trento-single-seater-sofa', query: 'Trento Single Seater Sofa', slug: 'trento', maskFile: 'trento-single-seater-sofa.png',
    subject: region(0.37, 0.34, 0.23, 0.18),
    protected: { lamp: region(0, 0, 0.16, 0.85), wallArt: region(0.36, 0, 0.54, 0.23), leftWall: region(0, 0.25, 0.16, 0.55), sideTable: region(0.84, 0.46, 0.16, 0.42), rug: region(0, 0.92, 1, 0.08) },
  },
] as const;

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
});

async function openProduct(page: Page, query: string) {
  await page.goto('/', load);
  await page.getByRole('tab', { name: 'Search' }).click();
  const field = page.getByTestId('product-search-field');
  await field.locator('input').fill(query);
  await page.getByRole('button', { name: new RegExp(`^${escapeText(query)}, AED`) }).first().click();
  await expect(page.getByRole('button', { name: /Add to bag/ })).toBeVisible();
}

async function openCustomizer(page: Page) {
  await page.getByTestId('fabric-selector').click();
  await expect(page.getByTestId('fabric-customizer')).toBeVisible();
}

async function showColourType(page: Page, colour: Colour) {
  await page.getByRole('radio', { name: `Show ${colour.fabricName} colours`, exact: true }).click();
}

async function chooseColour(page: Page, colour: Colour) {
  await showColourType(page, colour);
  const id = comboId(colour);
  await page.getByTestId(`fabric-swatch-${id}`).click();
  await expect(page.getByTestId(`fabric-preview-${id}`).first()).toBeVisible();
  return id;
}

async function continueCustomizer(page: Page) {
  await page.getByRole('button', { name: /Continue with/ }).click();
  await expect(page.getByTestId('fabric-customizer')).toHaveCount(0);
}

async function measureFabricCommit(page: Page, fabricId: string) {
  return page.evaluate(async (id) => {
    const button = document.querySelector(`[data-testid="fabric-swatch-${id}"]`) as HTMLElement;
    const start = performance.now();
    return new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Fabric preview did not update')); }, 2000);
      const observer = new MutationObserver(() => {
        if (!document.querySelector(`[data-testid="fabric-preview-${id}"]`)) return;
        clearTimeout(timeout); observer.disconnect(); resolve(performance.now() - start);
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

async function compareWithOriginal(page: Page, originalSource: string, variantSource: string, maskSource: string, subject: Region, protectedRegions: Record<string, Region>) {
  return page.evaluate(async ({ original, variant, mask, region: subjectRegion, protected: protectedInput }) => {
    const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Could not decode comparison image')); image.src = src; });
    const [base, changed, alpha] = await Promise.all([loadImage(original), loadImage(variant), loadImage(mask)]);
    const width = base.naturalWidth; const height = base.naturalHeight;
    const read = (image: HTMLImageElement) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, width, height); return context.getImageData(0, 0, width, height).data; };
    const a = read(base); const b = read(changed); const m = read(alpha);
    const protectedEntries = Object.entries(protectedInput);
    const protectedStats = Object.fromEntries(protectedEntries.map(([name]) => [name, { sum: 0, count: 0, over12: 0, maskMax: 0 }]));
    let backgroundSum = 0; let backgroundCount = 0; let backgroundOver12 = 0; let subjectSum = 0; let subjectCount = 0;
    for (let y = 0; y < height; y++) {
      const activeProtected = protectedEntries.filter(([, item]) => y >= height * item.y && y < height * (item.y + item.height));
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const difference = (Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2])) / 3;
        if (m[index + 3] === 0) { backgroundSum += difference; backgroundCount++; if (difference > 12) backgroundOver12++; }
        if (x >= width * subjectRegion.x && x < width * (subjectRegion.x + subjectRegion.width) && y >= height * subjectRegion.y && y < height * (subjectRegion.y + subjectRegion.height)) { subjectSum += difference; subjectCount++; }
        for (const [name, item] of activeProtected) {
          if (x < width * item.x || x >= width * (item.x + item.width)) continue;
          const stat = protectedStats[name]; stat.sum += difference; stat.count++; if (difference > 12) stat.over12++; stat.maskMax = Math.max(stat.maskMax, m[index + 3]);
        }
      }
    }
    return { backgroundMean: backgroundSum / backgroundCount, backgroundOver12: backgroundOver12 / backgroundCount, backgroundSamples: backgroundCount, subjectMean: subjectSum / subjectCount,
      protected: Object.fromEntries(Object.entries(protectedStats).map(([name, stat]) => [name, { mean: stat.sum / stat.count, over12: stat.over12 / stat.count, maskMax: stat.maskMax, samples: stat.count }])) };
  }, { original: originalSource, variant: variantSource, mask: maskSource, region: subject, protected: protectedRegions });
}

test('approved masked colours change only upholstery across the complete photograph', async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync('/tmp/rf-fabric-visuals', { recursive: true });
  for (const viewport of [{ name: 'phone', width: 360, height: 800 }, { name: 'desktop', width: 1280, height: 900 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const product of officialProducts) {
      const rendered = colours(product.id).filter((colour) => availableNamed(colour) && colour.variantKind === 'rendered' && !colour.previewUnavailable);
      expect(rendered.length, `${product.id} has approved rendered variants`).toBeGreaterThan(0);
      await openProduct(page, product.query); await openCustomizer(page);
      const original = await originalPhotoSource(page);
      const mask = `data:image/png;base64,${readFileSync(`assets/images/fabric-masks/${product.maskFile}`).toString('base64')}`;
      const screenshots: Buffer[] = []; const timings: Record<string, number> = {};
      for (const colour of rendered) {
        const id = await chooseColour(page, colour);
        const preview = page.getByTestId(`fabric-preview-${id}`).first();
        const renderedImage = preview.locator('img').last();
        await expect(renderedImage).toBeVisible(); await page.waitForTimeout(220);
        const source = (await renderedImage.getAttribute('src'))!;
        expect(source).toBeTruthy();
        const comparison = await compareWithOriginal(page, original, source, mask, product.subject, product.protected);
        expect(comparison.backgroundMean).toBeLessThan(4); expect(comparison.backgroundOver12).toBeLessThan(0.02); expect(comparison.backgroundSamples).toBeGreaterThan(400_000); expect(comparison.subjectMean).toBeGreaterThan(0.05);
        for (const [name, metric] of Object.entries(comparison.protected)) { expect(metric.samples, name).toBeGreaterThan(0); expect(metric.maskMax, name).toBe(0); expect(metric.mean, name).toBeLessThan(4); expect(metric.over12, name).toBeLessThan(0.02); }
        const screenshot = await preview.screenshot(); screenshots.push(screenshot);
        const path = `/tmp/rf-fabric-visuals/${viewport.name}-${product.slug}-${id}.png`; writeFileSync(path, screenshot); await test.info().attach(`${viewport.name}-${product.slug}-${id}`, { path, contentType: 'image/png' });
        if (viewport.name === 'phone') { timings[id] = await measureFabricCommit(page, id); expect(timings[id]).toBeLessThan(100); await page.waitForTimeout(200); }
      }
      expect(new Set(screenshots.map((image) => image.toString('base64'))).size).toBe(rendered.length);
      console.log(`${viewport.name}/${product.slug} warm-cache commits (ms):`, Object.fromEntries(Object.entries(timings).map(([id, ms]) => [id, Math.round(ms * 10) / 10])));
      await continueCustomizer(page);
    }
  }
});

test('360px/desktop customizer, zoom, stock, immediate switching and separate cart lines', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const all = colours('6219-trento-single-seater-sofa'); const current = all.find((colour) => colour.current)!;
  const choices = all.filter(availableNamed); const first = choices[0]; const second = choices[1]; const unavailable = all.find((colour) => !colour.current && colour.available === false)!;
  expect(choices.length).toBeGreaterThan(1); expect(unavailable).toBeTruthy();
  await openProduct(page, 'Trento Single Seater Sofa'); await openCustomizer(page);
  await expect(page.getByText('PRODUCT PREVIEW', { exact: true })).toBeVisible(); await expect(page.getByText('FABRIC CLOSE-UP', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole('button', { name: /Zoom official close-up/ }).click(); await expect(page.getByText('100%', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Close photo zoom' }).click();
  const firstId = await chooseColour(page, first); const target = await page.getByTestId(`fabric-swatch-${firstId}`).boundingBox(); expect(target?.width).toBeGreaterThanOrEqual(44); expect(target?.height).toBeGreaterThanOrEqual(44);
  await chooseColour(page, second); await page.waitForTimeout(200); await chooseColour(page, first); await page.waitForTimeout(200);
  await showColourType(page, second);
  const elapsed = await measureFabricCommit(page, comboId(second)); expect(elapsed).toBeLessThan(100); await page.waitForTimeout(200);
  await showColourType(page, unavailable); await page.getByTestId(`fabric-swatch-${comboId(unavailable)}`).dispatchEvent('click'); await expect(page.getByTestId(`fabric-swatch-${comboId(unavailable)}`)).toHaveAttribute('aria-disabled', 'true'); await expect(page.getByText('Out of stock', { exact: true }).first()).toBeVisible();
  await showColourType(page, second); await expect(page.getByTestId(`fabric-swatch-${comboId(second)}`)).toHaveAttribute('aria-checked', 'true');
  await continueCustomizer(page); await page.getByRole('button', { name: /Add to bag/ }).click();
  await openCustomizer(page); await chooseColour(page, current); await continueCustomizer(page); await page.getByRole('button', { name: /Add to bag/ }).click();
  await page.getByRole('button', { name: 'Cart, 2 items' }).click();
  await expect(page.getByText(new RegExp(escapeText(second.name))).first()).toBeVisible(); await expect(page.getByText(/Current Fabric/).first()).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rf-cart-v1') || '{}'));
  expect(stored.cart.map((item: any) => item.product.selectedFabric?.id)).toEqual([comboId(second), comboId(current)]);
  await page.reload(load); await page.getByRole('button', { name: 'Cart, 2 items' }).click(); await expect(page.getByText(new RegExp(escapeText(second.name))).first()).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 }); await openProduct(page, 'Trento Single Seater Sofa'); await openCustomizer(page);
  const box = await page.getByTestId('fabric-customizer').boundingBox(); expect(box).toBeTruthy(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
});

test('wishlist persists the current official combination and metadata', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const colour = colours('7072-serafina-corner-sofa').filter(availableNamed)[0];
  await openProduct(page, 'Serafina Corner Sofa'); await openCustomizer(page); await chooseColour(page, colour); await continueCustomizer(page);
  await page.getByRole('button', { name: 'Save product' }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rf-cart-v1') || '{}'));
  expect(stored.savedFabrics['7072-serafina-corner-sofa']).toMatchObject({ id: comboId(colour), name: colour.name, fabricTypeName: colour.fabricName, code: colour.code, priceDelta: expect.any(Number) });
});

test('products without current named options keep their original UI', async ({ page }) => {
  const without = products.filter((product) => !product.hasOptions).slice(0, 2); expect(without.length).toBeGreaterThan(0);
  for (const product of without) { await openProduct(page, product.name); await expect(page.getByTestId('fabric-selector')).toHaveCount(0); }
});

test('flagged colour retains the original photo and shows only its real close-up', async ({ page }) => {
  const entry = products.flatMap((product) => product.fabricTypes.flatMap((fabric: any) => fabric.colours.filter((colour: any) => colour.previewUnavailable && colour.available !== false && colour.closeupPath).map((colour: any) => ({ product, colour: { ...colour, fabricId: fabric.id, fabricName: fabric.name } }))))[0] as { product: any; colour: Colour } | undefined;
  expect(entry).toBeTruthy(); await openProduct(page, entry!.product.name); await openCustomizer(page);
  const current = colours(entry!.product.id).find((colour) => colour.current)!; const currentId = comboId(current);
  const before = await page.getByTestId(`fabric-preview-${currentId}`).first().screenshot();
  const id = await chooseColour(page, entry!.colour); await page.waitForTimeout(220);
  await expect(page.getByText(/Preview unavailable/).first()).toBeVisible();
  const after = await page.getByTestId(`fabric-preview-${id}`).first().screenshot(); expect(before.equals(after)).toBe(true);
  const closeup = page.getByRole('button', { name: new RegExp(`Zoom official close-up of ${escapeText(entry!.colour.name)}`) }).locator('img'); await expect(closeup).toBeVisible(); expect(await closeup.getAttribute('src')).toContain(entry!.colour.closeupPath!.split('/').pop()!);
});
