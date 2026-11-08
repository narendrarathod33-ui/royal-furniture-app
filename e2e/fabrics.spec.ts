import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const load = { timeout: 180_000 };
type Angle = { angleId: string; originalBaseImage: string; baseImage: string; maskImage: string; maskConfidence: number; borderWhiteRatio: number; singleObjectConfidence: number };
type Colour = { id: string; name: string; code?: string; current?: boolean; available?: boolean | null; priceDelta?: number | null; previewUnavailable?: boolean; variantKind?: string; variantPath?: string; closeupPath?: string; renderRgb?: number[]; fabricId: string; fabricName: string };
const manifest = JSON.parse(readFileSync('app/data/fabricManifest.json', 'utf8'));
const products = Object.values(manifest.products) as any[];
function colours(id: string): Colour[] {
  const product = (manifest.products as any)[id];
  if (!product) return [];
  return product.fabricTypes.flatMap((fabric: any) => fabric.colours.map((colour: any) => ({ ...colour, fabricId: fabric.id, fabricName: fabric.name })));
}
const comboId = (colour: Colour) => `${colour.fabricId}::${colour.id}`;
const availableNamed = (colour: Colour) => !colour.current && colour.available !== false;
const whiteChoices = (product: any) => colours(product.id).filter((colour) => availableNamed(colour) && colour.variantKind === 'white-mask' && !colour.previewUnavailable && colour.closeupPath);
const whiteProducts = products.filter((product) => product.hasOptions && product.previewAngles?.length && whiteChoices(product).length);
const fixture = [...whiteProducts].sort((a, b) => whiteChoices(b).length - whiteChoices(a).length)[0];
const multiAngle = whiteProducts.find((product) => product.previewAngles.length > 1);
const flaggedEntry = products.flatMap((product) => product.fabricTypes.flatMap((fabric: any) => fabric.colours.filter((colour: any) => colour.previewUnavailable && !colour.current && colour.available !== false && colour.closeupPath).map((colour: any) => ({ product, colour: { ...colour, fabricId: fabric.id, fabricName: fabric.name } })))).find((entry) => !entry.product.previewAngles?.length);
const escapeText = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

async function compareWhitePreview(page: Page, originalSource: string, variantSource: string, maskSource: string) {
  return page.evaluate(async ({ original, variant, mask }) => {
    const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Could not decode comparison image')); image.src = src; });
    const [base, changed, alpha] = await Promise.all([loadImage(original), loadImage(variant), loadImage(mask)]);
    const width = changed.naturalWidth; const height = changed.naturalHeight;
    const read = (image: HTMLImageElement) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const context = canvas.getContext('2d')!; context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'; context.drawImage(image, 0, 0, width, height); return context.getImageData(0, 0, width, height).data; };
    const a = read(base); const b = read(changed); const m = read(alpha);
    let backgroundSum = 0; let backgroundCount = 0; let backgroundOver12 = 0; let subjectSum = 0; let subjectCount = 0; let borderNearWhite = 0; let borderCount = 0;
    const border = Math.max(1, Math.round(Math.min(width, height) * 0.02));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const difference = (Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2])) / 3;
        if (m[index + 3] === 0) { backgroundSum += difference; backgroundCount++; if (difference > 12) backgroundOver12++; }
        if (x >= width * 0.1 && x < width * 0.9 && y >= height * 0.1 && y < height * 0.9) { subjectSum += difference; subjectCount++; }
        if (x < border || y < border || x >= width - border || y >= height - border) {
          borderCount++;
          if (Math.min(b[index], b[index + 1], b[index + 2]) >= 245 && Math.max(b[index], b[index + 1], b[index + 2]) - Math.min(b[index], b[index + 1], b[index + 2]) <= 10) borderNearWhite++;
        }
      }
    }
    return { backgroundMean: backgroundSum / backgroundCount, backgroundOver12: backgroundOver12 / backgroundCount, backgroundSamples: backgroundCount, subjectMean: subjectSum / subjectCount, borderNearWhiteRatio: borderNearWhite / borderCount };
  }, { original: originalSource, variant: variantSource, mask: maskSource });
}

test('white-mask colours preserve the base outside upholstery and keep borders white', async ({ page }) => {
  test.setTimeout(300_000);
  expect(whiteProducts.length, 'At least one real product has an accepted white front base').toBeGreaterThan(0);
  for (const viewport of [{ name: 'phone', width: 360, height: 800 }, { name: 'desktop', width: 1280, height: 900 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const product of whiteProducts.slice(0, 2)) {
      const angle = product.previewAngles[0] as Angle;
      const rendered = whiteChoices(product).slice(0, 6);
      await openProduct(page, product.name); await openCustomizer(page);
      await expect(page.getByText('WHITE-BACKGROUND PREVIEW', { exact: true })).toBeVisible();
      const original = `data:image/webp;base64,${readFileSync(angle.baseImage).toString('base64')}`;
      const mask = `data:image/png;base64,${readFileSync(angle.maskImage).toString('base64')}`;
      const timings: Record<string, number> = {};
      for (const colour of rendered) {
        const id = await chooseColour(page, colour);
        const preview = page.getByTestId(`fabric-preview-${id}`).first();
        await expect.poll(async () => preview.locator('img').last().getAttribute('src'), { timeout: 45_000 }).toMatch(/^data:image\/png/);
        const source = (await preview.locator('img').last().getAttribute('src'))!;
        const comparison = await compareWhitePreview(page, original, source, mask);
        expect(comparison.backgroundMean).toBeLessThan(4); expect(comparison.backgroundOver12).toBeLessThan(0.02); expect(comparison.backgroundSamples).toBeGreaterThan(1000); expect(comparison.subjectMean).toBeGreaterThan(0.01); expect(comparison.borderNearWhiteRatio).toBeGreaterThan(0.99);
        if (viewport.name === 'phone') {
          const alternative = rendered.find((item) => comboId(item) !== id && item.fabricId === colour.fabricId) || rendered.find((item) => comboId(item) !== id);
          if (alternative) {
            await chooseColour(page, alternative); await page.waitForTimeout(200); await showColourType(page, colour);
            // Type tabs select their first available colour immediately. If that
            // already selected the target, move to another colour in the same
            // type so the timing still measures a genuine target commit.
            if (await page.getByTestId(`fabric-swatch-${id}`).getAttribute('aria-checked') === 'true') {
              const sameType = colours(product.id).find((item) => item.fabricId === colour.fabricId && availableNamed(item) && item.closeupPath && comboId(item) !== id);
              // A singleton type cannot be deselected within its own tab. Its
              // immediate auto-selection is covered above; do not time a no-op.
              if (!sameType) continue;
              await page.getByTestId(`fabric-swatch-${comboId(sameType)}`).click();
            }
            timings[id] = await measureFabricCommit(page, id); expect(timings[id]).toBeLessThan(100); await page.waitForTimeout(200);
          }
        }
      }
      console.log(`${viewport.name}/${product.id} white-preview commits (ms):`, Object.fromEntries(Object.entries(timings).map(([id, ms]) => [id, Math.round(ms * 10) / 10])));
      await continueCustomizer(page);
    }
  }
});

test('draft cancellation, Continue, lifestyle notes, stock and separate cart lines', async ({ page }) => {
  expect(fixture, 'A real white-base product with at least two choices').toBeTruthy();
  const choices = whiteChoices(fixture); expect(choices.length).toBeGreaterThan(1);
  const all = colours(fixture.id); const current = all.find((colour) => colour.current)!; const first = choices[0]; const second = choices[1];
  await page.setViewportSize({ width: 360, height: 800 });
  await openProduct(page, fixture.name); await openCustomizer(page);
  await expect(page.getByText('WHITE-BACKGROUND PREVIEW', { exact: true })).toBeVisible(); await expect(page.getByText('FABRIC CLOSE-UP', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await chooseColour(page, first); await page.getByRole('button', { name: 'Close fabric customizer' }).click();
  await expect(page.getByText('Lifestyle photos show the original fabric.', { exact: true })).toHaveCount(0);
  await openCustomizer(page); await showColourType(page, current); await expect(page.getByTestId(`fabric-swatch-${comboId(current)}`)).toHaveAttribute('aria-checked', 'true');
  await chooseColour(page, second); await continueCustomizer(page);
  await expect(page.getByText('Lifestyle photos show the original fabric.', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId(`fabric-preview-${comboId(second)}-front`).first()).toBeVisible();
  await page.getByRole('button', { name: /Add to bag/ }).click();
  await openCustomizer(page); await chooseColour(page, current); await continueCustomizer(page); await page.getByRole('button', { name: /Add to bag/ }).click();
  await page.getByRole('button', { name: 'Cart, 2 items' }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rf-cart-v1') || '{}'));
  expect(stored.cart.map((item: any) => item.product.selectedFabric?.id)).toEqual([comboId(second), comboId(current)]);
  await page.reload(load); await page.getByRole('button', { name: 'Cart, 2 items' }).click(); await expect(page.getByText(new RegExp(escapeText(second.name))).first()).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 }); await openProduct(page, fixture.name); await openCustomizer(page);
  const box = await page.getByTestId('fabric-customizer').boundingBox(); expect(box).toBeTruthy(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
});

test('wishlist persists the committed official combination and metadata', async ({ page }) => {
  const colour = whiteChoices(fixture)[0];
  await page.setViewportSize({ width: 390, height: 844 });
  await openProduct(page, fixture.name); await openCustomizer(page); await chooseColour(page, colour); await continueCustomizer(page);
  await page.getByRole('button', { name: 'Save product' }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rf-cart-v1') || '{}'));
  expect(stored.savedFabrics[fixture.id]).toMatchObject({ id: comboId(colour), name: colour.name, fabricTypeName: colour.fabricName, code: colour.code, priceDelta: expect.any(Number) });
});

test('products without current named options keep their original UI', async ({ page }) => {
  const without = products.filter((product) => !product.hasOptions).slice(0, 2); expect(without.length).toBeGreaterThan(0);
  for (const product of without) { await openProduct(page, product.name); await expect(page.getByTestId('fabric-selector')).toHaveCount(0); }
});

test('flagged product shows only close-ups/swatches and never recolours lifestyle', async ({ page }) => {
  expect(flaggedEntry, 'At least one no-white-base product is explicitly flagged').toBeTruthy();
  const { product, colour } = flaggedEntry!;
  await openProduct(page, product.name); await openCustomizer(page);
  const modal = page.getByTestId('fabric-customizer');
  await expect(modal.getByText('FABRIC CLOSE-UP', { exact: true })).toBeVisible();
  await expect(modal.getByText('WHITE-BACKGROUND PREVIEW', { exact: true })).toHaveCount(0);
  await expect(modal.locator('[data-testid^="fabric-preview-"]')).toHaveCount(0);
  await expect(modal.getByText(/No lifestyle photo has been recoloured/)).toBeVisible();
  await showColourType(page, colour);
  await expect(page.getByRole('button', { name: new RegExp(`Zoom official close-up of ${escapeText(colour.name)}`) }).locator('img')).toBeVisible();
  await continueCustomizer(page);
  await expect(page.getByText('Lifestyle photos show the original fabric.', { exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-testid^="fabric-preview-"][data-testid$="-front"]')).toHaveCount(0);
});

test('extra accepted white angles are swipeable and retain lifestyle slides', async ({ page }) => {
  test.skip(!multiAngle, 'No extra white-background angle passed automatic acceptance; front-only products remain covered.');
  const colour = whiteChoices(multiAngle)[0];
  await openProduct(page, multiAngle.name); await openCustomizer(page); await chooseColour(page, colour); await continueCustomizer(page);
  await expect(page.getByTestId(`fabric-preview-${comboId(colour)}-front`).first()).toBeVisible();
  await expect(page.getByTestId(`fabric-preview-${comboId(colour)}-angle-2`).first()).toBeVisible();
  await expect(page.getByText('Lifestyle photos show the original fabric.', { exact: true }).first()).toBeVisible();
});

test('catalogue report and original JPEG integrity cover every product', async () => {
  const report = JSON.parse(readFileSync('docs/fabric-qa/base-image-report.json', 'utf8'));
  const optionProducts = products.filter((product) => product.hasOptions);
  expect(report.counts.optionProducts).toBe(optionProducts.length);
  expect(report.counts.rows).toBe(products.length + manifest.unmatched.length);
  for (const product of optionProducts) {
    const angles = product.previewAngles || [];
    if (!angles.length) {
      expect(product.previewBaseAttention.length, `${product.id} explains its flagged base`).toBeGreaterThan(0);
      for (const colour of colours(product.id)) expect(colour.previewUnavailable, `${product.id} has no live recolour`).toBe(true);
      continue;
    }
    expect(angles[0].angleId).toBe('front');
    for (const angle of angles as Angle[]) {
      expect(angle.borderWhiteRatio).toBeGreaterThan(0.90); expect(angle.singleObjectConfidence).toBeGreaterThanOrEqual(0.80); expect(angle.maskConfidence).toBeGreaterThanOrEqual(0.70);
      expect(existsSync(angle.baseImage)).toBe(true); expect(existsSync(angle.maskImage)).toBe(true);
      const original = product.whiteBaseImages.find((item: any) => item.angleId === angle.angleId);
      expect(createHash('sha256').update(readFileSync(angle.originalBaseImage)).digest('hex')).toBe(original.storedSha256);
    }
  }
});
