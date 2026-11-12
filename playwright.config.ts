import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests run against the built static site served with its production _headers (CSP).
 * Locally the installed Edge is used (no browser download); CI installs Playwright Chromium.
 */
const channel = process.env.PW_CHANNEL ?? (process.env.CI ? undefined : process.platform === 'win32' ? 'msedge' : undefined);
const PORT = Number(process.env.E2E_PORT || 4174);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...(channel ? { channel } : {}),
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve.ts',
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'laptop-1024', use: { viewport: { width: 1024, height: 768 } }, grep: /@responsive/ },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 }, hasTouch: true }, grep: /@responsive/ },
    { name: 'mobile-375', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', viewport: { width: 375, height: 812 } }, grep: /@responsive|@mobile/ },
  ],
});
