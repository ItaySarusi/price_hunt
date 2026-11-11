import { expect, test } from './fixtures';
import { openSearch, pickLocation, usDate, daysFromNow, setDates } from './helpers';

// Spec 5 (SPEC §11.3 "Strict validation"): exact messages and a disabled Search button while invalid.
test('validation messages and disabled Search button', async ({ page }) => {
  await openSearch(page);
  const search = page.getByTestId('search-btn');
  await expect(search).toBeDisabled(); // empty form

  // Free text that isn't a catalog entry.
  await page.getByTestId('from-input').fill('Atlantis');
  await page.getByTestId('from-input').press('Escape');
  await page.getByTestId('to-input').click();
  await expect(page.getByText('Choose a location from the list')).toBeVisible();

  // Same location on both sides.
  await pickLocation(page, 'from-input', 'Shanghai', 'Shanghai, CN');
  await pickLocation(page, 'to-input', 'CNSHA', 'Shanghai, CN');
  await page.getByTestId('date-start').click();
  await expect(page.getByText('From and To must be different')).toBeVisible();
  await expect(page.getByText('Choose a location from the list')).toHaveCount(0);
  await expect(search).toBeDisabled();

  await pickLocation(page, 'to-input', 'Los Angeles', 'Los Angeles, US');
  await expect(page.getByText('From and To must be different')).toHaveCount(0);

  // Past start date.
  await page.getByTestId('date-start').fill(usDate(daysFromNow(-1)));
  await page.getByTestId('date-end').fill(usDate(daysFromNow(5)));
  await page.getByTestId('date-end').press('Tab');
  await expect(page.getByText("Dates can't be in the past")).toBeVisible();
  await expect(search).toBeDisabled();

  // End before start.
  await setDates(page, 10, 5);
  await expect(page.getByText('End date must be on or after start date')).toBeVisible();
  await expect(search).toBeDisabled();

  // Valid dates → the form becomes valid.
  await setDates(page, 5, 10);
  await expect(page.getByText('End date must be on or after start date')).toHaveCount(0);
  await expect(page.getByText("Dates can't be in the past")).toHaveCount(0);
  await expect(search).toBeEnabled();

  // No supplier selected.
  await page.getByTestId('clear-all').click();
  await expect(page.getByText('Select at least one supplier')).toBeVisible();
  await expect(search).toBeDisabled();

  await page.getByTestId('supplier-chip-A').click();
  await expect(page.getByText('Select at least one supplier')).toHaveCount(0);
  await expect(search).toBeEnabled();
});
