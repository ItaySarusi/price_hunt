import { expect, test } from './fixtures';
import { fillSearchForm, openSearch } from './helpers';

// Spec 7 (SPEC §12, §11.5): phone layout — the search form is usable and History shows row cards, not a table.
test('mobile: search form is usable', async ({ page }) => {
  await openSearch(page);
  await fillSearchForm(page, { suppliers: ['A', 'B', 'C', 'D', 'E'] });

  await page.getByTestId('search-btn').click();
  await expect(page.getByTestId('progress-text')).toContainText('of 5 suppliers responded');
  await expect(page.getByTestId('final-badge')).toContainText('Completed', { timeout: 8_000 });
  await expect(page.getByTestId('result-card')).toHaveCount(5);
  // Cards may be below the fold on a phone; they must be reachable by scrolling.
  await page.getByTestId('result-card').first().scrollIntoViewIfNeeded();
  await expect(page.getByTestId('result-card').first()).toBeInViewport();

  // No horizontal overflow on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('mobile: History shows row cards instead of the table', async ({ page }) => {
  await page.goto('/history');
  await expect(page.getByTestId('history-filters')).toBeVisible();
  await expect(page.getByTestId('history-card').first()).toBeVisible();
  expect(await page.getByTestId('history-card').count()).toBeGreaterThan(0);
  await expect(page.getByTestId('history-table')).toHaveCount(0);
  await expect(page.getByTestId('paginator')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
