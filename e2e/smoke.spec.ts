import { test, expect } from '@playwright/test';

// P0 behavioral smoke, written against the app's real testIDs/accessibility
// labels (the same surface the node:test suites assert on). One test per money
// path; each test is independent and starts from the home screen.
//
// The sandbox only reaches localhost, so every remote asset (S3 product
// photos) is aborted: the app's own onError fallbacks render instead, and the
// specs anchor on text and local assets rather than remote imagery.

const load = { timeout: 180_000 };

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
});

/** Clicks that race list re-renders: retry until the navigation lands. */
async function clickUntil(locator, landsOn, timeout = 30_000) {
  await expect(async () => {
    await locator.click({ timeout: 5_000 });
    await landsOn.waitFor({ state: 'visible', timeout: 5_000 });
  }).toPass({ timeout });
}

async function openProduct(page, query) {
  await page.goto('/', load);
  await page.getByRole('tab', { name: 'Search' }).click();
  const field = page.getByTestId('product-search-field');
  await expect(field).toBeVisible();
  await field.locator('input').fill(query);
  // The product page is up when its size selector button is present.
  await clickUntil(page.getByText(query, { exact: false }).first(), page.getByRole('button', { name: /Tap to change size/ }));
}

test.describe('Royal Furniture smoke', () => {
  test('home renders rooms, deals tiles and the floating tab nav', async ({ page }) => {
    await page.goto('/', load);
    await expect(page.getByText('Shop by room').first()).toBeVisible();
    for (const name of ['Home', 'Browse', 'Search', 'Deals', 'New in']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /Cart, \d+ items/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
  });

  test('search finds products by name and shows a result count', async ({ page }) => {
    await page.goto('/', load);
    await page.getByRole('tab', { name: 'Search' }).click();
    const field = page.getByTestId('product-search-field');
    await expect(field).toBeVisible();
    await field.locator('input').fill('sofa');
    await expect(page.getByText(/\d+ results/).first()).toBeVisible();
    // Cards show the product name; photos may be the sandbox fallback.
    await expect(page.getByText(/Sofa/i).first()).toBeVisible();
  });

  test('a multi-size product opens with its size options and prices', async ({ page }) => {
    await openProduct(page, 'Nimbus Bed');
    await page.getByRole('button', { name: /Tap to change size/ }).click();
    const sizes = page.getByRole('radio');
    await expect(sizes.first()).toBeVisible();
    const count = await sizes.count();
    expect(count).toBeGreaterThanOrEqual(6); // Nimbus ships 190x90 … 200x180
    await sizes.last().click();
    // The add-to-bag control always announces the selected size and its price.
    await expect(page.getByRole('button', { name: /Add to bag, 200x180 · King, / })).toBeVisible();
  });

  test('adding to the bag updates the header badge and the cart line', async ({ page }) => {
    await openProduct(page, 'Nimbus Bed');
    await page.getByRole('button', { name: /Add to bag/ }).click();
    await expect(page.getByRole('button', { name: 'Cart, 1 items' })).toBeVisible();
    await page.getByRole('button', { name: 'Cart, 1 items' }).click();
    await expect(page.getByText('Local demo checkout', { exact: true })).toBeVisible();
    await expect(page.getByText(/Nimbus Bed/).first()).toBeVisible();
  });

  test('demo checkout completes and saves the order locally', async ({ page }) => {
    await openProduct(page, 'Nimbus Bed');
    await page.getByRole('button', { name: /Add to bag/ }).click();
    await page.getByRole('button', { name: 'Cart, 1 items' }).click();
    await page.getByText('Local demo checkout', { exact: true }).click();
    await page.getByPlaceholder('Full name').fill('Smoke Tester');
    await page.getByPlaceholder('05X XXX XXXX').fill('0501234567');
    const address = page.getByPlaceholder('Building, street, area, emirate');
    if (await address.isVisible().catch(() => false)) await address.fill('Test Tower, Abu Dhabi');
    await page.getByText(/Place order request/).click();
    await expect(page.getByText('Demo order saved locally')).toBeVisible();
    // The order id itself surfaces in the account's order history.
    await page.getByText('Continue shopping').click();
    await page.getByRole('button', { name: 'Account' }).click();
    await expect(page.getByText(/RF-\d{8}/)).toBeVisible();
  });

  test('account screen exposes profile fields and support', async ({ page }) => {
    await page.goto('/', load);
    await page.getByRole('button', { name: 'Account' }).click();
    await expect(page.getByText('Manage your profile, orders, and Royal Furniture support.')).toBeVisible();
    await expect(page.getByText('Email address')).toBeVisible();
    await expect(page.getByText('Mobile number')).toBeVisible();
  });

  test('deals tab opens the deals page with products', async ({ page }) => {
    await page.goto('/', load);
    await page.getByRole('tab', { name: 'Deals' }).click();
    await expect(page.getByText('All deals').first()).toBeVisible();
    await expect(page.getByText(/AED/).first()).toBeVisible();
  });
});
