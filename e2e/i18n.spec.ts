import { test, expect } from '@playwright/test';

// English/Arabic layer, on the real web DOM: the account screen toggles the
// language, the choice persists across reloads, the document flips to RTL,
// and the product-card overlays stay non-overlapping in the mirrored layout.
// The catalog (product names) stays English by design — the workbook pipeline
// publishes English data; UI chrome is what translates.

const load = { timeout: 180_000 };

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
});

async function openAccount(page) {
  await page.goto('/', load);
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page.getByText('Language')).toBeVisible();
}

test.describe('Royal Furniture languages', () => {
  test('switching to Arabic is instant, flips to RTL and persists', async ({ page }) => {
    await openAccount(page);
    await page.getByRole('button', { name: 'العربية' }).click();

    // No reload: the very same page flips to Arabic in place.
    await expect(page.getByRole('tab', { name: 'الرئيسية' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('tab', { name: 'تصفح' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // Reload keeps the choice (persisted rf-lang-v1).
    await page.reload(load);
    await expect(page.getByRole('tab', { name: 'الرئيسية' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // Cart opens with Arabic chrome.
    await page.getByRole('button', { name: /السلة/ }).first().click();
    await expect(page.getByText('سلتك', { exact: true })).toBeVisible();
  });

  test('home deal tiles and room chips render in Arabic after switching', async ({ page }) => {
    await openAccount(page);
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.getByRole('tab', { name: 'الرئيسية' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: 'الرئيسية' }).click();
    // "Amazing deals" tiles…
    await expect(page.getByText('كراسي استرخاء', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('أرائك زاوية', { exact: true })).toBeVisible();
    // …and the "Shop by room" chips.
    await expect(page.getByText('أثاث', { exact: true })).toBeVisible();
    await expect(page.getByText('مراتب كولتك', { exact: true })).toBeVisible();
  });

  test('product names render in Arabic on cards (generated dictionary)', async ({ page }) => {
    await openAccount(page);
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.getByRole('tab', { name: 'بحث' })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('tab', { name: 'بحث' }).click();
    const field = page.getByTestId('product-search-field');
    await expect(field).toBeVisible();
    await field.locator('input').fill('Serafina');
    // Search still matches the English catalog name; the card displays the
    // Arabic translation from the generated dictionary.
    await expect(page.getByText('أريكة زاوية Serafina').first()).toBeVisible();
  });

  test('card overlays stay non-overlapping in the mirrored Arabic layout', async ({ page }) => {
    await openAccount(page);
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.getByRole('tab', { name: 'بحث' })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('tab', { name: 'بحث' }).click();
    const field = page.getByTestId('product-search-field');
    await expect(field).toBeVisible();
    await field.locator('input').fill('Serafina');
    const frame = page.getByTestId('product-thumbnail-frame').filter({ has: page.getByText(/% OFF/) }).first();
    await expect(frame).toBeVisible();
    const eye = await frame.getByTestId('quick-view').boundingBox();
    const pill = await frame.getByText(/% OFF/).first().boundingBox();
    expect(eye, 'eye button box (ar)').toBeTruthy();
    expect(pill, 'discount pill box (ar)').toBeTruthy();
    const overlaps = eye!.x < pill!.x + pill!.width && pill!.x < eye!.x + eye!.width
      && eye!.y < pill!.y + pill!.height && pill!.y < eye!.y + eye!.height;
    expect(overlaps, 'mirrored eye and pill must not intersect').toBe(false);
  });

  test('switching back to English restores the original chrome instantly', async ({ page }) => {
    await openAccount(page);
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.getByRole('tab', { name: 'الرئيسية' })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'الحساب' }).click();
    await expect(page.getByText('اللغة')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });
});
