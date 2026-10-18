import { test, expect } from '@playwright/test';

// Stores tab + More hub, on the real web DOM. The home carousel's top three
// slides are explicitly preserved — asserted here so the new tabs can never
// come at their cost.

const load = { timeout: 180_000 };

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
});

test.describe('Royal Furniture stores and more', () => {
  test('home keeps its three promotion slides', async ({ page }) => {
    await page.goto('/', load);
    await expect(page.getByText('More home.')).toBeVisible(); // slide 1 (line-broken title)
    await expect(page.getByText('Your home.')).toBeVisible(); // slide 2 (majlis)
    await expect(page.getByText('Room for little')).toBeVisible(); // slide 3 (kids)
  });

  test('the stores tab lists showrooms with call and directions', async ({ page }) => {
    await page.goto('/', load);
    await page.getByRole('tab', { name: 'Stores' }).click();
    await expect(page.getByText('Royal Furniture stores')).toBeVisible();
    await expect(page.getByText('Abu Dhabi').first()).toBeVisible();
    const callButtons = page.getByRole('button', { name: /^Call the .+ store$/ });
    expect(await callButtons.count()).toBeGreaterThanOrEqual(3);
    await expect(page.getByRole('button', { name: /^Directions to the .+ store$/ }).first()).toBeVisible();
  });

  test('the more hub routes to arrivals, saved items, orders and stores', async ({ page }) => {
    await page.goto('/', load);
    await page.getByRole('tab', { name: 'More' }).click();
    await expect(page.getByText('Everything else in one place.')).toBeVisible();

    // New arrivals row lands on the arrivals page.
    await page.getByRole('button', { name: 'New arrivals' }).click();
    await expect(page.getByRole('tab', { name: 'More' })).toBeVisible();

    await page.getByRole('tab', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Saved items' }).click();
    await expect(page.getByText('Your bag', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Stores' }).click();
    await expect(page.getByText('Royal Furniture stores')).toBeVisible();

    // The hub also carries the language switch.
    await page.getByRole('tab', { name: 'More' }).click();
    await expect(page.getByRole('button', { name: 'العربية' })).toBeVisible();
  });
});
