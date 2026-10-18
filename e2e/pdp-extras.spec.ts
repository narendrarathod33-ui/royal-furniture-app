import { test, expect } from '@playwright/test';

// PDP discovery rails, on the real web DOM: the product page suggests
// same-category pieces ("You may also like"), and the pieces you opened
// before come back as "Recently viewed". Family-aware — the rails reuse the
// same collapsed cards as the shop grids.
//
// Same sandbox reality as the smoke suite: remote harvest/S3 assets are
// aborted, so the specs anchor on text and accessibility labels only. The
// spec sections are harvest-fed and therefore not asserted here.

const load = { timeout: 180_000 };

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
});

/** Opens a product the way a user does: search, then tap the result. */
async function openProduct(page, query: string) {
  await page.goto('/', load);
  await page.getByRole('tab', { name: 'Search' }).click();
  const field = page.getByTestId('product-search-field');
  await expect(field).toBeVisible();
  await field.locator('input').fill(query);
  await expect(async () => {
    await page.getByText(query, { exact: false }).first().click({ timeout: 5_000 });
    await page.getByRole('button', { name: /Tap to change size|Add to bag/ }).first().waitFor({ state: 'visible', timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe('Royal Furniture PDP extras', () => {
  test('the product page suggests related pieces and remembers what you viewed', async ({ page }) => {
    await openProduct(page, 'Nimbus Bed');

    // Related rail is present and scoped under its own heading.
    const alsoBlock = page.getByText('You may also like').locator('..');
    await expect(alsoBlock.getByRole('button', { name: /, AED/ }).first()).toBeVisible();

    // Open one of the suggested pieces.
    const suggested = alsoBlock.getByRole('button', { name: /, AED/ }).first();
    await suggested.click();
    await expect(page.getByText('About this piece').first()).toBeVisible({ timeout: 15_000 });

    // The piece viewed before (Nimbus) is now under "Recently viewed"; the
    // current piece must never appear there (self-exclusion).
    const recentBlock = page.getByText('Recently viewed').locator('..');
    await expect(recentBlock.getByRole('button', { name: /^Nimbus Bed/ })).toBeVisible();

    // And the current piece never recommends itself.
    const currentName = await page.getByRole('heading').first().textContent().catch(() => null);
    if (currentName) {
      const selfLabel = new RegExp(`^${currentName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, AED`);
      expect(await recentBlock.getByRole('button', { name: selfLabel }).count()).toBe(0);
    }
  });

  test('a fresh session has no recently-viewed rail yet', async ({ page }) => {
    await openProduct(page, 'Serafina Corner Sofa');
    await expect(page.getByText('You may also like')).toBeVisible();
    await expect(page.getByText('Recently viewed')).toHaveCount(0);
  });

  test('multi-size pieces offer one-tap upgrades that really switch the size', async ({ page }) => {
    await openProduct(page, 'Nimbus Bed');

    const addBefore = await page.getByRole('button', { name: /Add to bag/ }).getAttribute('aria-label');
    const priceBefore = Number(/AED ([\d,]+)/.exec(addBefore!)![1].replace(/,/g, ''));

    // Upsell chips announce the step-up price and delta.
    const chip = page.getByRole('button', { name: /^Upgrade to .+, AED \d[\d,]*, AED \d[\d,]* more$/ }).first();
    await expect(chip).toBeVisible();
    const chipLabel = (await chip.getAttribute('aria-label'))!;
    const chipPrice = Number(/, AED ([\d,]+),/.exec(chipLabel)![1].replace(/,/g, ''));
    expect(chipPrice, 'upgrade offers a pricier size').toBeGreaterThan(priceBefore);

    // Tapping the chip switches the whole page to that size: add-to-bag now
    // carries the upgrade's price.
    await chip.click();
    // The page remounts for the chosen size; retry until the add button
    // carries the upgrade's price (the old page may still be mounted briefly).
    await expect(async () => {
      const addAfter = await page.getByRole('button', { name: /Add to bag/ }).first().getAttribute('aria-label');
      const priceAfter = Number(/AED ([\d,]+)/.exec(addAfter!)![1].replace(/,/g, ''));
      expect(priceAfter).toBe(chipPrice);
    }).toPass({ timeout: 15_000 });
  });
});
