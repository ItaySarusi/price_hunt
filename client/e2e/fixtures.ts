import { test as base, expect } from '@playwright/test';

/**
 * Every E2E test fails on any browser console error or uncaught page error (T3.2: "no console errors during E2E").
 * The check runs after the test body, so the failure message lists exactly what was logged.
 */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
      });
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      await use();
      expect(errors, 'browser console errors during the test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
