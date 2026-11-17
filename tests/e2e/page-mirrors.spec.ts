import { expect, test } from '@playwright/test';
import { watchConsole } from './helpers.ts';

/**
 * RS-AI-PAGE-004 in the browser: every human page names its machine-readable mirrors in <head>,
 * loading a page never requests them (no new client script, no new request), and the mirrors are
 * reachable static files of the same build.
 */
const PAGES = ['/', '/statistics/spatial/', '/statistics/species/', '/calculator/', '/creative/ideas/', '/impact/'];

for (const path of PAGES) {
  test(`page mirror links on ${path}, with no extra request while the page loads @responsive`, async ({ page }) => {
    const watch = watchConsole(page);
    const requested: string[] = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    await page.goto(path, { waitUntil: 'networkidle' });
    const base = path === '/' ? '/ai/pages/_root' : `/ai/pages${path.replace(/\/$/, '')}`;
    await expect(page.locator(`head link[rel="alternate"][type="application/json"][href="${base}.json"]`)).toHaveCount(1);
    await expect(page.locator(`head link[rel="alternate"][type="text/markdown"][href="${base}.md"]`)).toHaveCount(1);
    expect(requested.filter((p) => p.startsWith('/ai/pages/')), 'a human page never loads its mirror').toEqual([]);
    const mirror = await page.request.get(`${base}.json`);
    expect(mirror.status()).toBe(200);
    const body = (await mirror.json()) as { schema_version: string; page_id: string; snapshot: { statistics_commit: string | null } };
    expect([body.schema_version, body.page_id]).toEqual(['rs-page-context.v1', path]);
    const info = (await (await page.request.get('/build-info.json')).json()) as { statistics_commit: string | null };
    expect(body.snapshot.statistics_commit).toBe(info.statistics_commit);
    watch.expectClean();
  });
}

test('the not-found page names no mirror, and the registry lists every page with its coverage', async ({ page, request }) => {
  await page.goto('/this-page-does-not-exist/');
  await expect(page.locator('head link[rel="alternate"]')).toHaveCount(0);
  const registry = (await (await request.get('/ai/pages/index.json')).json()) as { schema_version: string; census: { eligible: number; excluded: Array<{ path: string }> }; pages: Array<{ page_id: string; coverage: string }>; chunks: Array<{ count: number }> };
  expect(registry.schema_version).toBe('rs-page-registry.v1');
  expect(registry.pages.length + registry.chunks.reduce((n, c) => n + c.count, 0)).toBe(registry.census.eligible);
  expect(registry.census.excluded.map((e) => e.path)).toContain('/404.html');
  expect(registry.pages.find((p) => p.page_id === '/statistics/spatial/')?.coverage).toBe('FULL');
});
