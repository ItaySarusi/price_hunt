import { expect, test } from './fixtures';
import {
  fillSearchForm,
  isAscending,
  openSearch,
  parseProgress,
  selectSuppliers,
  sqlite,
  startRecorder,
  stopRecorder,
} from './helpers';

// Spec 4 (SPEC §12; B13, B19): a new search mid-flight replaces the old one — client and server side.
test('new search mid-flight resets the counter, never shows stale cards and cancels the old search in the DB', async ({
  page,
}) => {
  await openSearch(page);
  // First search: A, B, C + G (G keeps it running until the 6 s timeout).
  await fillSearchForm(page, {
    from: ['Singapore', 'Singapore, SG'],
    to: ['Rotterdam', 'Rotterdam, NL'],
    suppliers: ['A', 'B', 'C', 'G'],
  });
  await startRecorder(page);

  await page.getByTestId('search-btn').click();
  const progress = page.getByTestId('progress-text');
  await expect(progress).toContainText('of 4 suppliers responded');

  // Prepare the second search while the first runs (editing the form doesn't touch the running search):
  // another route and a disjoint supplier set, so any stale card is detectable.
  await page.getByTestId('swap-btn').click();
  await expect(page.getByTestId('from-input')).toHaveValue('Rotterdam, NL');
  await selectSuppliers(page, ['D', 'E', 'F']);
  await expect(progress).toContainText('of 4 suppliers responded');

  // Start it once the first search has results (so the reset is visible) but is still in flight (G never answers).
  await expect.poll(async () => parseProgress((await progress.textContent()) ?? '')?.responded ?? 0).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('final-badge')).toHaveCount(0);
  await page.getByTestId('search-btn').click();

  await expect(page.getByTestId('final-badge')).toContainText('Completed', { timeout: 8_000 });
  const rec = await stopRecorder(page);
  const secondClick = rec.clicks.at(-1)!;
  expect(rec.clicks.length).toBe(2);

  // Frames rendered for the second search (progress total = 3): counter restarted from 0, only D/E/F cards,
  // never more cards than selected suppliers, one per supplier, always ascending.
  const second = rec.frames.filter((f) => f.t >= secondClick && parseProgress(f.progress)?.total === 3);
  expect(second.length).toBeGreaterThan(0);
  expect(parseProgress(second[0].progress)?.responded, 'counter did not reset').toBe(0);
  for (const f of second) {
    const suppliers = f.cards.map((c) => c.s);
    expect(suppliers.every((s) => ['D', 'E', 'F'].includes(s)), `stale card in ${suppliers.join(',')}`).toBe(true);
    expect(f.cards.length).toBeLessThanOrEqual(3);
    expect(new Set(suppliers).size).toBe(suppliers.length);
    expect(isAscending(f.cards.map((c) => c.p))).toBe(true);
  }
  // No frame ever showed more cards than the larger selection, nor a duplicate supplier.
  for (const f of rec.frames) {
    expect(f.cards.length).toBeLessThanOrEqual(4);
    expect(new Set(f.cards.map((c) => c.s)).size).toBe(f.cards.length);
  }
  // And a late answer from the first search (A/B/C answer within 5 s, G never) still can't sneak in.
  await page.waitForTimeout(1_500);
  const finalSuppliers = await page
    .getByTestId('result-card')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['supplier']));
  expect(finalSuppliers.every((s) => ['D', 'E', 'F'].includes(s ?? ''))).toBe(true);

  // B13: the server stopped the earlier search and stored it Cancelled.
  await expect
    .poll(
      () =>
        sqlite(
          "select Status from Searches where FromLocationCode='SGSIN' and ToLocationCode='NLRTM' order by CreatedAt desc limit 1",
        ),
      { timeout: 5_000 },
    )
    .toBe('Cancelled');
  expect(
    sqlite("select Status from Searches where FromLocationCode='NLRTM' and ToLocationCode='SGSIN' order by CreatedAt desc limit 1"),
  ).toBe('Completed');
});
