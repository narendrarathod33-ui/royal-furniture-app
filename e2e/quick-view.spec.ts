import { test, expect } from '@playwright/test';

// Quick View port acceptance, on the real web DOM: the eye on every product
// card opens the bottom sheet, and the sheet's single action matches the
// product's option count — add for single-option items, "view full details"
// when sizes multiply the choice. Also covers the biggest-discount sort entry.
//
// Same sandbox reality as the smoke suite: remote photos are aborted, so the
// specs anchor on text, testIDs and accessibility labels only.

const load = { timeout: 180_000 };

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
});

test.describe('Royal Furniture quick view', () => {
  test('the eye opens the sheet and a single-option product adds to the cart from it', async ({ page }) => {
    await page.goto('/', load);
    await page.getByRole('tab', { name: 'Search' }).click();
    const field = page.getByTestId('product-search-field');
    await expect(field).toBeVisible();
    await field.locator('input').fill('Serafina Corner Sofa');
    await expect(page.getByText('Serafina Corner Sofa', { exact: false }).first()).toBeVisible();

    // Eye on the card (top-left of the photo) opens the sheet.
    await page.getByRole('button', { name: 'Quick view Serafina Corner Sofa' }).first().click();
    const sheetPage = page.getByTestId('quick-view-sheet');
    await expect(sheetPage).toBeVisible();
    await expect(sheetPage.getByText('Serafina Corner Sofa', { exact: false }).first()).toBeVisible();
    await expect(sheetPage.getByText(/AED/).first()).toBeVisible();

    // Single-option product: the sheet offers add-to-cart, not "view details".
    await expect(sheetPage.getByRole('button', { name: /Add to cart, Serafina Corner Sofa, AED/ })).toBeVisible();
    await expect(sheetPage.getByRole('button', { name: /View full details/ })).toHaveCount(0);

    // The sheet writes to the same cart store the PDP uses.
    await sheetPage.getByRole('button', { name: /Add to cart, Serafina Corner Sofa, AED/ }).click();
    await expect(page.getByRole('button', { name: 'Cart, 1 items' })).toBeVisible();
    await expect(sheetPage).toHaveCount(0);

    // Close then reopen stays consistent (store resets cleanly).
    await page.getByRole('button', { name: 'Quick view Serafina Corner Sofa' }).first().click();
    await expect(sheetPage).toBeVisible();
    await sheetPage.getByRole('button', { name: 'Close quick view' }).click();
    await expect(sheetPage).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cart, 1 items' })).toBeVisible();
  });

  test('a multi-size product routes to full details instead of adding blind', async ({ page }) => {
    await page.goto('/', load);
    await page.getByRole('tab', { name: 'Search' }).click();
    const field = page.getByTestId('product-search-field');
    await expect(field).toBeVisible();
    await field.locator('input').fill('Nimbus Bed');
    // The collapsed family card shows the base name and a sizes badge.
    await expect(page.getByText('Nimbus Bed', { exact: false }).first()).toBeVisible();

    await page.getByRole('button', { name: /^Quick view Nimbus Bed/ }).first().click();
    const sheetPage = page.getByTestId('quick-view-sheet');
    await expect(sheetPage).toBeVisible();
    await expect(sheetPage.getByRole('button', { name: /View full details/ })).toBeVisible();
    await expect(sheetPage.getByRole('button', { name: /Add to cart/ })).toHaveCount(0);

    // Routing hands over to the product page (size selector present, sheet gone).
    await sheetPage.getByRole('button', { name: /View full details/ }).click();
    await expect(page.getByRole('button', { name: /Tap to change size/ }).first()).toBeVisible();
    await expect(sheetPage).toHaveCount(0);
  });

  test('the eye never overlaps the discount pill on a card', async ({ page }) => {
    await page.goto('/', load);
    await page.getByRole('tab', { name: 'Search' }).click();
    const field = page.getByTestId('product-search-field');
    await expect(field).toBeVisible();
    await field.locator('input').fill('Serafina');
    const frame = page.getByTestId('product-thumbnail-frame').filter({ has: page.getByText(/% OFF/) }).first();
    await expect(frame).toBeVisible();
    const eye = await frame.getByTestId('quick-view').boundingBox();
    const pill = await frame.getByText(/% OFF/).first().boundingBox();
    expect(eye, 'eye button box').toBeTruthy();
    expect(pill, 'discount pill box').toBeTruthy();
    const overlaps = eye!.x < pill!.x + pill!.width && pill!.x < eye!.x + eye!.width
      && eye!.y < pill!.y + pill!.height && pill!.y < eye!.y + eye!.height;
    expect(overlaps, 'eye and discount pill must not intersect').toBe(false);
  });

  test('browse offers the biggest-discount sort', async ({ page }) => {
    await page.goto('/', load);
    await page.getByRole('tab', { name: 'Browse' }).click();
    await page.getByRole('button', { name: /^Sort products, / }).click();
    await page.getByRole('radio', { name: 'Biggest discount' }).click();
    await expect(page.getByRole('button', { name: 'Sort products, Biggest discount' })).toBeVisible();
  });
});
