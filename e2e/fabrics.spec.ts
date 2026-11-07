import { test, expect, type Page } from '@playwright/test';

const load = { timeout: 180_000 };

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

test('every available swatch is visually distinct and every warm-cache commit is under 100ms', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openProduct(page, 'Trento Single Seater Sofa');
  const fabrics = ['charcoal', 'beige', 'navy', 'olive'];
  const screenshots = [];
  for (const fabric of fabrics) {
    await page.getByTestId(`fabric-swatch-${fabric}`).click();
    await page.waitForTimeout(220);
    screenshots.push(await page.getByTestId(`fabric-preview-${fabric}`).first().screenshot());
  }
  expect(new Set(screenshots.map((image) => image.toString('base64'))).size).toBe(fabrics.length);

  const timings: Record<string, number> = {};
  for (const fabric of fabrics) {
    timings[fabric] = await measureFabricCommit(page, fabric);
    expect(timings[fabric]).toBeLessThan(100);
    await page.waitForTimeout(200);
  }
  console.log('Fabric warm-cache commit times (ms):', Object.fromEntries(Object.entries(timings).map(([id, ms]) => [id, Math.round(ms * 10) / 10])));
});

test('masked swatches recolour in under 100ms after warm-up, respect stock, fit phone/desktop, and persist separate cart lines', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openProduct(page, 'Trento Single Seater Sofa');
  const selector = page.getByTestId('fabric-selector');
  await expect(selector).toBeVisible();
  await expect(page.getByTestId('fabric-swatch-charcoal')).toHaveAttribute('aria-checked', 'true');

  const target = await page.getByTestId('fabric-swatch-navy').boundingBox();
  expect(target?.width).toBeGreaterThanOrEqual(44);
  expect(target?.height).toBeGreaterThanOrEqual(44);
  const before = await page.getByTestId('fabric-preview-charcoal').first().screenshot();
  await page.getByTestId('fabric-swatch-navy').click();
  await expect(page.getByTestId('fabric-preview-navy').first()).toBeVisible();
  await expect(page.getByText('AED 1,511', { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(220);
  const after = await page.getByTestId('fabric-preview-navy').first().screenshot();
  expect(before.equals(after)).toBe(false);

  // Warm both cached results, then measure the actual DOM selection commit.
  await page.getByTestId('fabric-swatch-olive').click();
  await page.waitForTimeout(220);
  await page.getByTestId('fabric-swatch-navy').click();
  await page.waitForTimeout(220);
  const elapsed = await measureFabricCommit(page, 'olive');
  expect(elapsed).toBeLessThan(100);

  await page.getByTestId('fabric-swatch-rust').dispatchEvent('click');
  await expect(page.getByTestId('fabric-swatch-rust')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('fabric-swatch-olive')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Not available', { exact: true })).toBeVisible();

  // Two fabrics of the same product become two persisted lines.
  await page.getByRole('button', { name: /Add to bag/ }).click(); // Olive
  await page.getByTestId('fabric-swatch-charcoal').click();
  await page.getByRole('button', { name: /Add to bag/ }).click(); // Charcoal
  await page.getByRole('button', { name: 'Cart, 2 items' }).click();
  await expect(page.getByText('Fabric: Olive', { exact: true })).toBeVisible();
  await expect(page.getByText('Fabric: Charcoal', { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rf-cart-v1') || '{}'));
  expect(stored.cart.map((item: any) => item.product.selectedFabric?.id)).toEqual(['olive', 'charcoal']);

  await page.reload(load);
  await page.getByRole('button', { name: 'Cart, 2 items' }).click();
  await expect(page.getByText('Fabric: Olive', { exact: true })).toBeVisible();
  await expect(page.getByText('Fabric: Charcoal', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await openProduct(page, 'Trento Single Seater Sofa');
  await expect(selector).toBeVisible();
  const desktopBox = await selector.boundingBox();
  expect(desktopBox).toBeTruthy();
  expect(desktopBox!.x).toBeGreaterThanOrEqual(0);
  expect(desktopBox!.x + desktopBox!.width).toBeLessThanOrEqual(1280);
});

test('wishlist persists the selected fabric snapshot', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openProduct(page, 'Serafina Corner Sofa');
  await page.getByTestId('fabric-swatch-navy').click();
  await page.getByRole('button', { name: 'Save product' }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rf-cart-v1') || '{}'));
  expect(stored.savedFabrics['7072-serafina-corner-sofa']).toMatchObject({ id: 'navy', name: 'Navy', priceDelta: 250 });
});

test('a product without fabrics has no new selector or preview', async ({ page }) => {
  await openProduct(page, 'The Sibby 6-Seater Sofa');
  await expect(page.getByTestId('fabric-selector')).toHaveCount(0);
  await expect(page.getByTestId('fabric-preview-charcoal')).toHaveCount(0);
});
