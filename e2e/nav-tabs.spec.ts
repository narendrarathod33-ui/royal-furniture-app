import { test, expect } from '@playwright/test';

// New-in tab + More hub, on the real web DOM. The home carousel's top three
// slides are explicitly preserved — asserted here so the tab swap can never
// come at their cost.

const load = { timeout: 180_000 };

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
});

test.describe('Royal Furniture new-in tab and more hub', () => {
  test('home keeps its three promotion slides', async ({ page }) => {
    await page.goto('/', load);
    await expect(page.getByText('More home.')).toBeVisible(); // slide 1 (line-broken title)
    await expect(page.getByText('Your home.')).toBeVisible(); // slide 2 (majlis)
    await expect(page.getByText('Room for little')).toBeVisible(); // slide 3 (kids)
  });

  test('the New in tab opens the new arrivals page', async ({ page }) => {
    await page.goto('/', load);
    await page.getByRole('tab', { name: 'New in' }).click();
    await expect(page.getByText('New arrivals', { exact: true })).toBeVisible();
    await expect(page.getByText(/\d+ new pieces/)).toBeVisible();
    // The stores tab is gone from the navigation.
    expect(await page.getByRole('tab', { name: 'Stores' }).count()).toBe(0);
  });

  test('the more hub routes to saved items and orders, with no arrivals or stores rows', async ({ page }) => {
    await page.goto('/', load);
    await page.getByRole('tab', { name: 'More' }).click();
    await expect(page.getByText('Everything else in one place.')).toBeVisible();
    expect(await page.getByRole('button', { name: 'New arrivals' }).count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Stores' }).count()).toBe(0);

    await page.getByRole('button', { name: 'Saved items' }).click();
    await expect(page.getByText('Your bag', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'More' }).click();
    await page.getByRole('button', { name: 'My orders' }).click();
    await expect(page.getByText('Order history', { exact: true })).toBeVisible();

    // The hub also carries the language switch.
    await page.getByRole('tab', { name: 'More' }).click();
    await expect(page.getByRole('button', { name: 'العربية' })).toBeVisible();
  });
});
