import { expect, test } from './fixtures';
import { badgeFrame, fillSearchForm, isAscending, openSearch, parseProgress, startRecorder, stopRecorder } from './helpers';

// Spec 1 (SPEC §12; B15, B16, B18): default search with all 7 suppliers.
test('default search streams sorted results, G shows No response, ends Timed out at ~6 s', async ({ page }) => {
  await openSearch(page);
  await fillSearchForm(page); // all suppliers selected by default
  await startRecorder(page);

  await page.getByTestId('search-btn').click();
  await expect(page.getByTestId('progress-text')).toContainText('of 7 suppliers responded');
  await expect(page.getByTestId('countdown')).toBeVisible();

  // While running: read prices straight from the DOM several times — always ascending.
  const sampled: number[][] = [];
  while (!(await page.getByTestId('final-badge').isVisible())) {
    const prices = await page
      .getByTestId('result-card')
      .evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset['price'])));
    sampled.push(prices);
    expect(isAscending(prices), `cards not sorted ascending: ${prices.join(', ')}`).toBe(true);
    await page.waitForTimeout(150);
  }
  expect(sampled.length).toBeGreaterThanOrEqual(5);

  await expect(page.getByTestId('final-badge')).toContainText('Timed out');
  await expect(page.getByTestId('status-chip-G')).toContainText('No response');
  await expect(page.getByTestId('countdown')).toHaveCount(0);

  const rec = await stopRecorder(page);
  const clickAt = rec.clicks.at(-1)!;

  // Every animation frame: cards ascending, never more than 7, one per supplier.
  for (const f of rec.frames) {
    const prices = f.cards.map((c) => c.p);
    expect(isAscending(prices), `frame at ${Math.round(f.t)} ms not ascending: ${prices.join(', ')}`).toBe(true);
    expect(f.cards.length).toBeLessThanOrEqual(7);
    expect(new Set(f.cards.map((c) => c.s)).size).toBe(f.cards.length);
  }

  // The counter only ever goes up during the search and did increase (progressive results).
  const counts = rec.frames
    .filter((f) => f.t >= clickAt)
    .map((f) => parseProgress(f.progress))
    .filter((p): p is { responded: number; total: number } => p?.total === 7)
    .map((p) => p.responded);
  expect(counts.length).toBeGreaterThan(0);
  expect(counts.every((c, i) => i === 0 || counts[i - 1] <= c), `counter went down: ${counts.join(',')}`).toBe(true);
  expect(counts[0]).toBe(0);
  expect(new Set(counts).size, 'counter should take several values').toBeGreaterThanOrEqual(3);
  // G never responds, so at most 6 of 7 before the timeout.
  expect(Math.max(...counts)).toBeLessThanOrEqual(6);

  // Final badge "Timed out" around the 6 s server timeout.
  const end = badgeFrame(rec, 'Timed out', clickAt);
  expect(end, 'no frame with the Timed out badge').toBeDefined();
  const elapsed = end!.t - clickAt;
  expect(elapsed).toBeGreaterThan(5_500);
  expect(elapsed).toBeLessThan(9_000);
});
