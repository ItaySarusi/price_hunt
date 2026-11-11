import { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { pickLocation } from './helpers';

type Dir = 'asc' | 'desc';
type Column = 'date' | 'route' | 'supplier' | 'price' | 'responseTime' | 'status';

const rows = (page: Page) => page.getByTestId('history-row');
const cells = (page: Page, col: Column) => page.locator(`[data-testid="history-row"] td.mat-column-${col}`);
const header = (page: Page, col: Column) => page.locator(`th.mat-column-${col}`);

/** "Nov 20 – Nov 30, 2026" | "Dec 28, 2026 – Jan 3, 2027" | "Nov 20, 2026" → start date (ms). */
function startOf(range: string): number {
  const [start, end = start] = range.split('–').map((s) => s.trim());
  const year = /\d{4}$/.exec(end)![0];
  return Date.parse(/\d{4}$/.test(start) ? start : `${start}, ${year}`);
}
/** "$1,234.56" → 1234.56; "—" (no price) → null. */
const price = (s: string) => (s.includes('$') ? Number(s.replace(/[$,\s]/g, '')) : null);
/** "1.83 s" → 1.83; "> 6 s" (no response) → 6. */
const seconds = (s: string) => Number(s.replace(/[>\ss]/g, ''));
/** Display label → stored status (the server sorts the stored enum name). */
const statusKey = (s: string) => ({ OK: 'Success', Failed: 'Failed', 'No response': 'NoResponse' })[s.trim()] ?? s;
const ordinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** True when `values` are ordered in `dir` according to the server's sort key for `col`. */
function isSorted(col: Column, dir: Dir, values: string[]): boolean {
  const sign = dir === 'asc' ? 1 : -1;
  const ok = (cmp: (a: string, b: string) => number) =>
    values.every((v, i) => i === 0 || sign * cmp(values[i - 1], v) <= 0);
  switch (col) {
    case 'date':
      return ok((a, b) => startOf(a) - startOf(b));
    case 'route':
      return ok((a, b) => ordinal(a.split('→')[0].trim(), b.split('→')[0].trim()));
    case 'supplier':
      return ok((a, b) => ordinal(a.trim(), b.trim()));
    case 'responseTime':
      return ok((a, b) => seconds(a) - seconds(b));
    case 'status':
      return ok((a, b) => ordinal(statusKey(a), statusKey(b)));
    case 'price': {
      // Nulls ("—") last in both directions.
      const nums = values.map(price);
      const firstNull = nums.indexOf(null);
      const priced = (firstNull < 0 ? nums : nums.slice(0, firstNull)) as number[];
      if (firstNull >= 0 && nums.slice(firstNull).some((n) => n !== null)) return false;
      return priced.every((v, i) => i === 0 || sign * (priced[i - 1] - v) <= 0);
    }
  }
}

async function columnValues(page: Page, col: Column): Promise<string[]> {
  return (await cells(page, col).allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim());
}

/** Click a header, wait for the server response for that sort, then for the rendered rows to match it. */
async function clickSort(page: Page, col: Column, dir: Dir, previous: string[]): Promise<string[]> {
  const response = page.waitForResponse(
    (r) => r.url().includes('/api/history') && r.url().includes(`sortBy=${col}`) && r.url().includes(`sortDir=${dir}`),
  );
  await header(page, col).click();
  expect((await response).ok()).toBe(true);
  await expect(header(page, col)).toHaveAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
  let values: string[] = [];
  await expect
    .poll(async () => {
      values = await columnValues(page, col);
      return values.length > 1 && isSorted(col, dir, values) && values.join('|') !== previous.join('|');
    }, { message: `rows not sorted by ${col} ${dir}` })
    .toBe(true);
  // Sort state lives in the URL; each param is omitted when it equals its default (sort=date, dir=asc).
  if (col === 'date') await expect(page).not.toHaveURL(/[?&]sort=/);
  else await expect(page).toHaveURL(new RegExp(`[?&]sort=${col}(&|$)`));
  if (dir === 'asc') await expect(page).not.toHaveURL(/[?&]dir=/);
  else await expect(page).toHaveURL(/[?&]dir=desc(&|$)/);
  return values;
}

test.describe('History', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/history');
    await expect(page.getByTestId('history-filters')).toBeVisible();
    await expect(page.getByTestId('history-table')).toBeVisible();
    await expect(rows(page).first()).toBeVisible();
  });

  test('defaults load rows (date ascending, 25 per page)', async ({ page }) => {
    await expect(page).toHaveURL(/\/history$/);
    await expect(rows(page)).toHaveCount(25);
    await expect(header(page, 'date')).toHaveAttribute('aria-sort', 'ascending');
    expect(isSorted('date', 'asc', await columnValues(page, 'date'))).toBe(true);
    await expect(page.getByTestId('paginator')).toContainText(/1 – 25 of \d+/);
    await expect(page.getByTestId('history-card')).toHaveCount(0);
  });

  test('every column header sorts ascending and descending (server-side)', async ({ page }) => {
    // Date is the default (asc) → first click flips it to desc; every other column starts asc.
    let prev = await columnValues(page, 'date');
    prev = await clickSort(page, 'date', 'desc', prev);
    prev = await clickSort(page, 'date', 'asc', prev);

    for (const col of ['route', 'supplier', 'price', 'responseTime', 'status'] as const) {
      const asc = await clickSort(page, col, 'asc', await columnValues(page, col));
      const desc = await clickSort(page, col, 'desc', asc);
      expect(desc[0], `${col}: first row should change between asc and desc`).not.toBe(asc[0]);
    }

    // Price, explicitly: ascending then descending numeric order on the page.
    const ascPrices = (await clickSort(page, 'price', 'asc', [])).map(price).filter((p) => p !== null) as number[];
    expect(ascPrices.length).toBeGreaterThan(1);
    expect(ascPrices).toEqual([...ascPrices].sort((a, b) => a - b));
    const descPrices = (await clickSort(page, 'price', 'desc', [])).map(price).filter((p) => p !== null) as number[];
    expect(descPrices).toEqual([...descPrices].sort((a, b) => b - a));
  });

  test('next page and page size change', async ({ page }) => {
    const paginator = page.getByTestId('paginator');
    const firstIds = await rows(page).allTextContents();
    expect(firstIds.length).toBe(25);

    await paginator.getByRole('button', { name: 'Next page' }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(paginator).toContainText(/26 – 50 of \d+/);
    await expect.poll(async () => (await rows(page).allTextContents()).join('|')).not.toBe(firstIds.join('|'));

    // Page size 10 → 10 rows; Material keeps the first visible item (row 26) on screen → page 3 (21 – 30).
    // Material puts a touch-target layer over the page-size select; clicking it is what a user's click hits.
    await paginator.locator('.mat-mdc-paginator-touch-target').click();
    await page.getByRole('option', { name: '10', exact: true }).click();
    await expect(page).toHaveURL(/[?&]size=10/);
    await expect(page).toHaveURL(/[?&]page=3/);
    await expect(rows(page)).toHaveCount(10);
    await expect(paginator).toContainText(/21 – 30 of \d+/);
  });

  test('filters + Apply update the URL, Back restores, failures toggle hides failed rows', async ({ page }) => {
    // Seed data always contains failures somewhere in the default window.
    const statuses = page.locator('[data-testid="history-row"] td.mat-column-status');

    await pickLocation(page, 'history-from', 'Shanghai', 'Shanghai, CN');
    await page.getByTestId('apply-btn').click();
    await expect(page).toHaveURL(/[?&]from=CNSHA/);
    await expect.poll(async () => {
      const routes = await columnValues(page, 'route');
      return routes.length > 0 && routes.every((r) => r.startsWith('Shanghai, CN'));
    }).toBe(true);

    // Browser Back → previous URL (defaults) and the filter field is empty again.
    await page.goBack();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByTestId('history-from')).toHaveValue('');
    await expect(rows(page)).toHaveCount(25);
    await expect.poll(async () => (await columnValues(page, 'route')).some((r) => !r.startsWith('Shanghai, CN'))).toBe(true);

    // Forward works too.
    await page.goForward();
    await expect(page).toHaveURL(/[?&]from=CNSHA/);
    await expect(page.getByTestId('history-from')).toHaveValue('Shanghai, CN');
    await page.goBack();
    await expect(page).toHaveURL(/\/history$/);

    // Failures on (default): failed / no-response tags are present (sorting by status puts them first).
    await header(page, 'status').click();
    await expect(page).toHaveURL(/sort=status/);
    await expect.poll(async () => (await statuses.allTextContents()).map((s) => s.trim())).toContain('Failed');

    // Failures off + Apply → only OK rows.
    await page.getByTestId('failures-toggle').getByRole('switch').click();
    await page.getByTestId('apply-btn').click();
    await expect(page).toHaveURL(/[?&]failures=0/);
    await expect
      .poll(async () => {
        const s = (await statuses.allTextContents()).map((t) => t.trim());
        return s.length > 0 && s.every((t) => t === 'OK');
      })
      .toBe(true);
    await expect(page.getByTestId('history-table').getByText('Failed', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('history-table').getByText('No response', { exact: true })).toHaveCount(0);
  });
});
