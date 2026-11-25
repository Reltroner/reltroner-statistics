/**
 * Editorial illustration integration: immutable 40-char commit-pinned jsDelivr assets,
 * minimum CSP img-src allowance, responsive aspect-ratio preservation, graceful image failure
 * handling, and honest pending placeholders for quota-unbuilt slots.
 */
import { expect, test } from '@playwright/test';
import { ILLUSTRATION_RESOURCE_COMMIT, IMAGE_SLOTS } from '../../src/lib/image-slots.ts';
import { expectNoHorizontalOverflow, setTheme, watchConsole } from './helpers.ts';

const APPROVED_ROUTES: ReadonlyArray<{ route: string; slots: ReadonlyArray<keyof typeof IMAGE_SLOTS> }> = [
  { route: '/', slots: ['STATS_HOME_HERO', 'STATS_DEPENDENCY_GRAPH', 'STATS_CLUSTERING_LAB', 'STATS_REPORT_CENTER'] },
  { route: '/statistics/', slots: ['STATS_WORLD_OVERVIEW'] },
  { route: '/countries/', slots: ['STATS_COUNTRY_COMPARISON'] },
  { route: '/history/', slots: ['STATS_HISTORICAL_DYNAMICS'] },
  { route: '/clustering/', slots: ['STATS_CLUSTERING_LAB'] },
  { route: '/drift/', slots: ['STATS_SOURCE_DRIFT'] },
  { route: '/reports/', slots: ['STATS_REPORT_CENTER'] },
  { route: '/creative/', slots: ['CREATIVE_HOME_HERO'] },
];

test('CSP allows only the exact jsDelivr origin on img-src without wildcards or relaxing script-src/connect-src', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  const csp = res.headers()['content-security-policy'] ?? '';
  const directives = Object.fromEntries(
    csp.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
      const i = p.indexOf(' ');
      return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1).trim()];
    }),
  );
  expect(directives['img-src']).toBe("'self' data: blob: https://cdn.jsdelivr.net");
  expect(directives['img-src']).not.toContain('*');
  expect(directives['connect-src']).toBe("'self' https://www.reltroner.com");
  expect(directives['script-src']).not.toContain('cdn.jsdelivr.net');
});

test('approved editorial slots render pinned 40-char CDN WebP assets across all 8 routes without CSP/console errors', async ({ page }) => {
  test.setTimeout(90_000);
  const watch = watchConsole(page);
  for (const { route, slots } of APPROVED_ROUTES) {
    const res = await page.goto(route);
    expect(res?.status(), route).toBe(200);
    for (const id of slots) {
      const expected = IMAGE_SLOTS[id];
      const box = page.locator(`[data-image-slot="${id}"]`);
      await expect(box, `${route} ${id}`).toBeVisible();
      await expect(box, `${route} ${id} no longer placeholder`).not.toHaveAttribute('data-placeholder', 'true');
      const img = box.locator('img');
      await expect(img).toBeVisible();
      await img.scrollIntoViewIfNeeded();
      await expect.poll(
        () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
        { timeout: 20_000, message: `${route} ${id} image decoded` },
      ).toBe(true);
      const meta = await img.evaluate((el: HTMLImageElement) => ({
        src: el.getAttribute('src'),
        alt: el.getAttribute('alt'),
        width: el.naturalWidth,
        height: el.naturalHeight,
        loading: el.getAttribute('loading'),
        fetchpriority: el.getAttribute('fetchpriority'),
      }));
      expect(meta.src).toBe(expected.src);
      expect(meta.src).toContain(`@${ILLUSTRATION_RESOURCE_COMMIT}/`);
      expect(meta.alt).toBe(expected.alt);
      expect(meta.width).toBe(expected.width);
      expect(meta.height).toBe(expected.height);
      const isHero = id === 'STATS_HOME_HERO' || id === 'CREATIVE_HOME_HERO';
      expect(meta.loading).toBe(isHero ? 'eager' : 'lazy');
      expect(meta.fetchpriority).toBe(isHero ? 'high' : null);
    }
  }
  watch.expectClean();
});

test('@responsive home editorial illustrations stay intact across dark and light themes without overflow', async ({ page }) => {
  for (const theme of ['dark', 'light'] as const) {
    await setTheme(page, theme);
    const watch = watchConsole(page);
    await page.goto('/');
    const heroImg = page.locator('[data-image-slot="STATS_HOME_HERO"] img');
    await expect(heroImg).toBeVisible();
    await expect.poll(() => heroImg.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 1280), { timeout: 20_000 }).toBe(true);
    const rect = await page.locator('[data-image-slot="STATS_HOME_HERO"]').boundingBox();
    expect(rect).toBeTruthy();
    expect(Math.abs(rect!.width / rect!.height - 16 / 9)).toBeLessThan(0.05);
    await expectNoHorizontalOverflow(page);
    watch.expectClean();
  }
});

test('image failure on CDN does not break page content, heading visibility, or slot aspect-ratio geometry', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  const rect = await page.locator('[data-image-slot="STATS_HOME_HERO"]').boundingBox();
  expect(rect).toBeTruthy();
  expect(rect!.height).toBeGreaterThan(100);
  expect(Math.abs(rect!.width / rect!.height - 16 / 9)).toBeLessThan(0.05);
  await expectNoHorizontalOverflow(page);
  expect(pageErrors).toEqual([]);
});

test('quota-pending slots remain honest placeholders without dummy images', async ({ page }) => {
  for (const [route, id] of [
    ['/creative/audit/', 'CREATIVE_CONSISTENCY_AUDIT'],
    ['/creative/decisions/', 'CREATIVE_DECISION_TREE'],
    ['/statistics/decision-trees/', 'STATISTICAL_DECISION_TREE'],
  ] as const) {
    await page.goto(route);
    const slot = page.locator(`[data-image-slot="${id}"]`);
    await expect(slot).toBeVisible();
    await expect(slot).toHaveAttribute('data-placeholder', 'true');
    await expect(slot.locator('img')).toHaveCount(0);
  }
});
