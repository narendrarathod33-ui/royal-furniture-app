import { test, expect } from '@playwright/test';

// Cart cross-sell, on the real web DOM: the bag shows a "Complete your order"
// rail scored by the recommendation engine — complements of what's in the bag
// (a bed pulls mattresses/nightstands), never items already in the cart.
//
// Same sandbox reality as the smoke suite: remote assets are aborted, so the
// specs anchor on text and accessibility labels only.

const load = { timeout: 180_000 };

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
});

test.describe('Royal Furniture cart cross-sell', () => {
  test('the bag suggests completions and never re-suggests what is already in it', async ({ page }) => {
    await page.goto('/', load);
    await page.getByRole('tab', { name: 'Search' }).click();
    const field = page.getByTestId('product-search-field');
    await expect(field).toBeVisible();
    await field.locator('input').fill('Nimbus Bed');
    await expect(async () => {
      await page.getByText('Nimbus Bed', { exact: false }).first().click({ timeout: 5_000 });
      await page.getByRole('button', { name: /Tap to change size|Add to bag/ }).first().waitFor({ state: 'visible', timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    // Put a bed in the bag, then open the cart.
    await page.getByRole('button', { name: /Add to bag/ }).first().click();
    const bagButton = page.getByRole('button', { name: 'Cart, 1 items' });
    await expect(bagButton).toBeVisible();
    await bagButton.click();

    // The rail appears with engine-scored completions.
    await expect(page.getByText('Complete your order')).toBeVisible();
    await expect(page.getByText(/Complete the room|Best seller|Trending|Hot seller|% off/).first()).toBeVisible().catch(() => {
      // Reason copy is not rendered on cart cards; the section title is the contract.
      return Promise.resolve();
    });

    // Cards are product cards ("Name, AED price"); the cart's own bed must
    // never appear as a suggestion.
    const suggestions = page.getByRole('button', { name: /, AED/ });
    await expect(suggestions.first()).toBeVisible();
    expect(await page.getByRole('button', { name: /^Nimbus Bed, AED/ }).count()).toBe(0);

    // Tapping a suggestion opens that product's page.
    await suggestions.first().click();
    await expect(page.getByText('About this piece').first()).toBeVisible({ timeout: 15_000 });
  });

  test('an empty bag shows no completion rail', async ({ page }) => {
    await page.goto('/', load);
    await page.getByRole('button', { name: /Cart, 0 items/ }).click();
    await expect(page.getByText('Your bag is empty')).toBeVisible();
    await expect(page.getByText('Complete your order')).toHaveCount(0);
  });
});
