import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectContainedText, expectNoHorizontalOverflow, watchConsole } from './helpers.ts';

/**
 * R6 layout sweep: every main route at eight widths in both themes, against the built site with its
 * production headers. Each load must have no document overflow, no text escaping its card, no
 * console error and visible keyboard focus on the first control.
 */
const WIDTHS = [320, 375, 390, 768, 1024, 1280, 1440, 1920] as const;
const ROUTES = [
  '/', '/statistics', '/statistics/scatter', '/statistics/species', '/statistics/spatial', '/statistics/decision-trees', '/assistant', '/countries',
  '/history', '/clustering', '/anomalies', '/qa', '/drift', '/graph', '/creative', '/creative/decisions', '/reports', '/methodology',
];

for (const route of ROUTES) {
  test(`R6 layout ${route}: 8 widths × 2 themes without overflow or console errors`, async ({ page }) => {
    test.setTimeout(240_000);
    const watch = watchConsole(page);
    for (const theme of ['dark', 'light'] as const) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((t) => { try { localStorage.setItem('rs-theme', t); } catch { /* ignore */ } }, theme);
        await page.goto(route);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
        await test.step(`${theme} ${width}px`, async () => {
          await expectNoHorizontalOverflow(page);
          await expectContainedText(page);
          // The sticky header never covers the page heading after load.
          const header = await page.locator('header[data-site-header]').boundingBox();
          const h1 = await page.locator('h1').first().boundingBox();
          if (header && h1) expect(h1.y, 'h1 below the sticky header').toBeGreaterThanOrEqual(header.y + header.height - 1);
        });
      }
    }
    watch.expectClean();
  });
}

test('R6 keyboard: skip link, visible focus ring and touch-sized header controls at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/statistics/species');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  const outline = await skip.evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`; });
  expect(outline).not.toMatch(/^none 0px none$/);
  for (const sel of ['[data-menu-toggle]', '[data-theme-toggle]', 'button[data-palette-open]:visible']) {
    const box = await page.locator(sel).first().boundingBox();
    expect(box, sel).toBeTruthy();
    expect(Math.min(box!.width, box!.height), `${sel} touch target`).toBeGreaterThanOrEqual(36);
  }
});

for (const path of ['/statistics/species', '/statistics/spatial', '/assistant', '/statistics/scatter']) {
  for (const theme of ['dark', 'light'] as const) {
    test(`accessibility (new surfaces): no serious or critical axe violations on ${path} (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => { try { localStorage.setItem('rs-theme', t); } catch { /* ignore */ } }, theme);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.rs-chart-frame').analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
}
