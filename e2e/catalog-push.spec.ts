import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// P4 money path — the real catalog push loop, end to end:
//   workbook -> POST /upload (x-bridge-token) -> receiver -> catalog_xlsx.py
//   -> app/data/catalogData.ts rewritten -> Metro rebuild -> app shows it.
// The Apps Script normally plays the sender; here the test does. It bumps
// every "Nimbus Bed" family row by AED 1,000 (family prices are per-variant,
// so the whole family moves together) and expects the PDP add-to-bag price
// to follow exactly.
//
// Runs only where the receiver is alive (this sandbox). The generated data
// files are restored via git in a finally block, so a failure never leaves
// the tree dirty. The bridge token is read from its private file and is
// never logged.

const RECEIVER = 'http://localhost:8081';
const TOKEN_FILE = '/home/user/.catalog-bridge/receiver-token';
const WORKBOOK = '/tmp/rf-e2e-catalog-push.xlsx';
const FAMILY = 'Nimbus Bed';
const BUMP = 1000;
const load = { timeout: 180_000 };

test.beforeAll(async () => {
  const ready = await fetch(`${RECEIVER}/`)
    .then((res) => res.ok)
    .catch(() => false);
  test.skip(!ready, 'drive receiver not running — catalog push runs only where the bridge lives');
});

/** Reads the price announced by the PDP add-to-bag control. */
async function defaultAddPrice(page: import('@playwright/test').Page): Promise<number> {
  const label = await page
    .getByRole('button', { name: /^Add to bag, .*AED [\d,]+$/ })
    .getAttribute('aria-label');
  expect(label, 'add-to-bag label').toBeTruthy();
  const match = /AED ([\d,]+)$/.exec(label as string);
  expect(match, `AED price inside "${label}"`).toBeTruthy();
  return Number(match![1].replace(/,/g, ''));
}

async function openNimbus(page: import('@playwright/test').Page) {
  await page.goto('/', load);
  await page.getByRole('tab', { name: 'Search' }).click();
  const field = page.getByTestId('product-search-field');
  await expect(field).toBeVisible();
  await field.locator('input').fill(FAMILY);
  await page.getByText(FAMILY, { exact: false }).first().click();
  await page.getByRole('button', { name: /Tap to change size/ }).waitFor({ state: 'visible', timeout: 20_000 });
}

test('a pushed workbook updates the catalog the app shows', async ({ page }) => {
  test.setTimeout(300_000);
  const repo = process.cwd();

  // 0. Baseline: the price the app announces today.
  await openNimbus(page);
  const before = await defaultAddPrice(page);

  // 1. Export the current catalog as the Apps Script would send it.
  execFileSync('python3', ['data/tools/catalog_xlsx.py', 'export', WORKBOOK], { cwd: repo });

  // 2. Bump every family row's price_aed, like a merchandising edit. The
  //    workbook's first sheet is a README, so scan all sheets for the header.
  const edit = `
import sys
from openpyxl import load_workbook

wb = load_workbook(sys.argv[1])
ws = name_col = price_col = header = None
for candidate in wb.worksheets:
    values = [cell.value if isinstance(cell.value, str) else None for cell in candidate[1]]
    if 'name' in values and 'price_aed' in values:
        ws, name_col, price_col = candidate, values.index('name') + 1, values.index('price_aed') + 1
        break
assert ws, 'no sheet with a name/price_aed header row found'
bumped = 0
for row in ws.iter_rows(min_row=2):
    name = row[name_col - 1].value
    if isinstance(name, str) and name.startswith(${JSON.stringify(FAMILY)}):
        cell = row[price_col - 1]
        cell.value = (cell.value or 0) + ${BUMP}
        bumped += 1
assert bumped >= 2, f'expected the whole ${FAMILY} family to move, bumped {bumped}'
wb.save(sys.argv[1])
print(f'bumped {bumped} rows')
`.trim();
  console.log(execFileSync('python3', ['-c', edit, WORKBOOK], { cwd: repo }).toString().trim());

  // 3. Push it through the receiver (same endpoint the Apps Script uses).
  const token = readFileSync(TOKEN_FILE, 'utf8').trim();
  const response = await fetch(`${RECEIVER}/upload`, {
    method: 'POST',
    headers: { 'x-bridge-token': token, 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    body: readFileSync(WORKBOOK),
  });
  expect(response.ok, `receiver accepted the push (HTTP ${response.status})`).toBe(true);

  try {
    // 4. Fresh load: Metro rebuilds from the rewritten catalogData.ts.
    await openNimbus(page);
    const after = await defaultAddPrice(page);
    expect(after).toBe(before + BUMP);
  } finally {
    // 5. Put the committed catalog back, whatever happened.
    execFileSync('git', ['checkout', '--', 'app/data'], { cwd: repo });
    const dirty = execFileSync('git', ['status', '--porcelain', 'app/data'], { cwd: repo }).toString().trim();
    expect(dirty, 'app/data restored').toBe('');
  }
});
