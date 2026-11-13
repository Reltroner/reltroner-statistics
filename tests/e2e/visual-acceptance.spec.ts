/**
 * RC-DEPLOY-01 visual acceptance evidence.
 * Captures representative viewport screenshots for human review without deploying,
 * changing DNS, touching Cloudflare projects or contacting other Reltroner services.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, setTheme, watchConsole } from './helpers.ts';

const routes = [
  { path: '/', slug: 'overview' },
  { path: '/statistics', slug: 'statistics' },
  { path: '/statistics/decision-trees', slug: 'supervised-trees' },
  { path: '/creative/decisions', slug: 'creative-decisions' },
  { path: '/creative/audit', slug: 'narrative-audit' },
  { path: '/reports', slug: 'reports' },
] as const;

for (const route of routes) {
  for (const theme of ['dark', 'light'] as const) {
    test(`RC-DEPLOY-01 visual evidence: ${route.slug} ${theme} @responsive`, async ({ page }, info) => {
      await setTheme(page, theme);
      const console = watchConsole(page);
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('main#main')).toBeVisible();
      await expect(page.locator('h1')).toHaveCount(1);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await expectNoHorizontalOverflow(page);
      console.expectClean();

      const folder = path.resolve('artifacts', 'visual-acceptance');
      fs.mkdirSync(folder, { recursive: true });
      const filename = `${info.project.name}-${route.slug}-${theme}.png`;
      await page.screenshot({ path: path.join(folder, filename), animations: 'disabled', caret: 'hide', fullPage: false });
    });
  }
}
