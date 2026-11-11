import { expect, test } from './fixtures';
import { cardSuppliers, fillSearchForm, openSearch, parseProgress } from './helpers';

// Spec 3 (SPEC §12; R14): Cancel mid-search → Cancelled, and nothing new arrives afterwards.
test('cancel mid-search shows Cancelled and no new cards appear afterwards', async ({ page }) => {
  await openSearch(page);
  await fillSearchForm(page);

  await page.getByTestId('search-btn').click();
  const progress = page.getByTestId('progress-text');
  await expect(progress).toContainText('of 7 suppliers responded');
  // Mid-search: at least one supplier answered, but the search is still running (G never answers).
  await expect.poll(async () => parseProgress((await progress.textContent()) ?? '')?.responded ?? 0).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('cancel-btn')).toBeVisible();

  await page.getByTestId('cancel-btn').click();
  await expect(page.getByTestId('final-badge')).toContainText('Cancelled');
  await expect(page.getByTestId('cancel-btn')).toHaveCount(0);
  await expect(page.getByTestId('status-chip-G')).toContainText('Cancelled');

  const cardsAtCancel = await cardSuppliers(page);
  const progressAtCancel = await progress.textContent();

  // Suppliers would keep answering for up to 5 s; nothing from them may show up.
  await page.waitForTimeout(2_500);
  expect(await cardSuppliers(page)).toEqual(cardsAtCancel);
  await expect(progress).toHaveText(progressAtCancel ?? '');
  await expect(page.getByTestId('final-badge')).toContainText('Cancelled');
});
