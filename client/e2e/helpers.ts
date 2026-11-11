import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { Page, expect } from '@playwright/test';

export const ALL_SUPPLIERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

/** Same path the API resolves `Data Source=pricehunt.e2e.db` to (its content root, see playwright.config.ts). */
export const E2E_DB = resolve(__dirname, '../../server/PriceHunt.Api/pricehunt.e2e.db');

/** Local date `days` from today (dates must never be in the past — computed relative to now). */
export function daysFromNow(days: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
}

/** `M/D/YYYY` — what the en-US native date adapter parses from a typed value. */
export function usDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/** Type into a location autocomplete and pick the matching option from the mat-autocomplete panel. */
export async function pickLocation(page: Page, testId: string, typed: string, optionLabel: string): Promise<void> {
  const input = page.getByTestId(testId);
  await input.click();
  await input.fill(typed);
  await page.getByRole('option', { name: new RegExp(optionLabel) }).first().click();
  await expect(input).toHaveValue(optionLabel);
}

export async function setDates(page: Page, startDays: number, endDays: number): Promise<void> {
  await page.getByTestId('date-start').fill(usDate(daysFromNow(startDays)));
  await page.getByTestId('date-end').fill(usDate(daysFromNow(endDays)));
  await page.getByTestId('date-end').press('Tab');
}

/** Select exactly `codes` in the supplier chip listbox. */
export async function selectSuppliers(page: Page, codes: readonly string[]): Promise<void> {
  await page.getByTestId('clear-all').click();
  for (const c of codes) await page.getByTestId(`supplier-chip-${c}`).click();
  for (const c of ALL_SUPPLIERS) {
    const option = page.getByTestId(`supplier-chip-${c}`).getByRole('option');
    await expect(option).toHaveAttribute('aria-selected', codes.includes(c) ? 'true' : 'false');
  }
}

export interface SearchFormInput {
  from?: [typed: string, label: string];
  to?: [typed: string, label: string];
  suppliers?: readonly string[];
}

export async function openSearch(page: Page): Promise<void> {
  await page.goto('/search');
  await expect(page.getByTestId('from-input')).toBeVisible();
}

export async function fillSearchForm(page: Page, input: SearchFormInput = {}): Promise<void> {
  const [fromTyped, fromLabel] = input.from ?? ['Shanghai', 'Shanghai, CN'];
  const [toTyped, toLabel] = input.to ?? ['Los Angeles', 'Los Angeles, US'];
  await pickLocation(page, 'from-input', fromTyped, fromLabel);
  await pickLocation(page, 'to-input', toTyped, toLabel);
  await setDates(page, 7, 14);
  if (input.suppliers) await selectSuppliers(page, input.suppliers);
  await expect(page.getByTestId('search-btn')).toBeEnabled();
}

/** `{ responded, total }` parsed from "3 of 7 suppliers responded". */
export function parseProgress(text: string): { responded: number; total: number } | null {
  const m = /(\d+)\s+of\s+(\d+)\s+suppliers responded/.exec(text);
  return m ? { responded: Number(m[1]), total: Number(m[2]) } : null;
}

export interface Frame {
  /** performance.now() of the animation frame. */
  t: number;
  progress: string;
  badge: string | null;
  cards: { s: string; p: number }[];
}

export interface Recording {
  frames: Frame[];
  /** performance.now() of every Search-button click (capture phase, before Angular handles it). */
  clicks: number[];
}

/**
 * Records, on EVERY animation frame, the progress text, the final badge and the result cards (supplier + price,
 * in DOM order). Much denser than polling from the test runner, so a single out-of-order frame is caught.
 */
export async function startRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __ph: Recording & { stop: boolean } };
    w.__ph = { frames: [], clicks: [], stop: false };
    document.addEventListener(
      'click',
      (e) => {
        if ((e.target as Element | null)?.closest('[data-testid="search-btn"]')) w.__ph.clicks.push(performance.now());
      },
      true,
    );
    const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const tick = () => {
      if (w.__ph.stop) return;
      const badge = document.querySelector('[data-testid="final-badge"]');
      w.__ph.frames.push({
        t: performance.now(),
        progress: norm(document.querySelector('[data-testid="progress-text"]')?.textContent),
        badge: badge ? norm(badge.textContent) : null,
        cards: [...document.querySelectorAll<HTMLElement>('[data-testid="result-card"]')].map((el) => ({
          s: el.dataset['supplier'] ?? '',
          p: Number(el.dataset['price']),
        })),
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export async function stopRecorder(page: Page): Promise<Recording> {
  return page.evaluate(() => {
    const w = window as unknown as { __ph: Recording & { stop: boolean } };
    w.__ph.stop = true;
    return { frames: w.__ph.frames, clicks: w.__ph.clicks };
  });
}

export function isAscending(prices: readonly number[]): boolean {
  return prices.every((p, i) => i === 0 || prices[i - 1] <= p);
}

/** First frame (after `since`) whose final badge contains `text`. */
export function badgeFrame(rec: Recording, text: string, since = 0): Frame | undefined {
  return rec.frames.find((f) => f.t >= since && f.badge?.includes(text));
}

export async function cardSuppliers(page: Page): Promise<string[]> {
  return page.getByTestId('result-card').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['supplier'] ?? ''));
}

/** Runs a query against the e2e SQLite DB with the sqlite3 CLI (read-only). */
export function sqlite(sql: string): string {
  return execFileSync('sqlite3', ['-readonly', E2E_DB, sql], { encoding: 'utf8' }).trim();
}
