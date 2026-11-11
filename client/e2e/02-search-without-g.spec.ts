import { expect, test } from './fixtures';
import { badgeFrame, fillSearchForm, openSearch, startRecorder, stopRecorder } from './helpers';

// Spec 2 (SPEC §12; B18): without the never-responding supplier G, the search completes before the 6 s timeout.
test('search without G ends Completed in under 6 s', async ({ page }) => {
  await openSearch(page);
  await fillSearchForm(page, { suppliers: ['A', 'B', 'C', 'D', 'E', 'F'] });
  await startRecorder(page);

  await page.getByTestId('search-btn').click();
  await expect(page.getByTestId('progress-text')).toContainText('of 6 suppliers responded');
  await expect(page.getByTestId('status-chip-G')).toHaveCount(0);

  await expect(page.getByTestId('final-badge')).toContainText('Completed', { timeout: 8_000 });
  await expect(page.getByTestId('progress-text')).toContainText('6 of 6 suppliers responded');

  const rec = await stopRecorder(page);
  const clickAt = rec.clicks.at(-1)!;
  const end = badgeFrame(rec, 'Completed', clickAt);
  expect(end, 'no frame with the Completed badge').toBeDefined();
  expect(end!.t - clickAt).toBeLessThan(6_000);
  expect(rec.frames.some((f) => f.badge?.includes('Timed out'))).toBe(false);
});
