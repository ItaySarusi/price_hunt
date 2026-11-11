import { defineConfig, devices } from '@playwright/test';

/**
 * E2E (SPEC §12): Playwright starts the API (fresh e2e SQLite file, real supplier timings, demo seed on) and the
 * Angular dev server. Search specs share one API and assert real timings, so everything runs serially in one worker.
 */
const API_URL = 'http://localhost:5080';
const CLIENT_URL = 'http://localhost:4200';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: CLIENT_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/07-*.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      testMatch: '**/07-*.spec.ts',
      // Only Chromium is installed: iPhone 13 metrics/touch/UA on the Chromium engine.
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
  webServer: [
    {
      name: 'api',
      // Fresh e2e DB every run (relative to the API content root = this cwd).
      command: 'rm -f pricehunt.e2e.db pricehunt.e2e.db-shm pricehunt.e2e.db-wal && dotnet run',
      cwd: '../server/PriceHunt.Api',
      url: `${API_URL}/api/meta/suppliers`,
      env: { ConnectionStrings__Default: 'Data Source=pricehunt.e2e.db' },
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      name: 'client',
      command: 'npm start',
      cwd: '.',
      url: CLIENT_URL,
      reuseExistingServer: !process.env['CI'],
      timeout: 240_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
