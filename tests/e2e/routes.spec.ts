import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { ROUTES } from '../../src/lib/site.ts';
import { expectNoHorizontalOverflow, setTheme, watchConsole } from './helpers.ts';

for (const theme of ['dark', 'light'] as const) {
  for (const route of ROUTES) {
    test(`${route.path} renders cleanly in ${theme} theme @responsive`, async ({ page }) => {
      await setTheme(page, theme);
      const consoleWatch = watchConsole(page);
      const res = await page.goto(route.path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page).toHaveTitle(/Reltroner Statistics/);
      await expect(page.locator('main#main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalOverflow(page);
      consoleWatch.expectClean();
    });
  }
}

test('security headers and CSP are served', async ({ request }) => {
  const res = await request.get('/');
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toMatch(/script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')+/);
  expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['x-frame-options']).toBe('DENY');
});

test('unknown paths return the branded 404 page', async ({ page }) => {
  const res = await page.goto('/no-such-observation');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('not part of the observatory');
});

test('a finding page and an indicator page render with provenance', async ({ page }) => {
  await page.goto('/drift');
  const firstId = await page.evaluate(async () => (await (await fetch('/data/findings.json')).json()).findings[0].id as string);
  await page.goto(`/drift/${firstId}`);
  await expect(page.getByText('Production main · authoritative')).toBeVisible();
  await expect(page.getByText('Remodeling main · proposal')).toBeVisible();
  await page.goto('/statistics/indicators/sdi');
  await expect(page.locator('h1')).toHaveText('Sentient Development Index');
  await expect(page.getByRole('heading', { name: 'Provenance' })).toBeVisible();
});

test('production values never claim deployment verification without evidence', async ({ page }) => {
  await page.goto('/');
  const build = await page.evaluate(async () => (await fetch('/build-info.json')).json());
  await expect(page.getByText(/DEPLOYMENT_(UN)?VERIFIED/).first()).toBeVisible();
  if (build.studio_deployment === 'DEPLOYMENT_UNVERIFIED') await expect(page.getByText('DEPLOYMENT_UNVERIFIED').first()).toBeVisible();
});

test('AI discovery documents (/llms.txt, /ai/manifest.json, /ai/context.json, /openapi.json) are served with valid contracts', async ({ request }) => {
  const llms = await request.get('/llms.txt');
  expect(llms.status()).toBe(200);
  expect(llms.headers()['content-type']).toContain('text/plain');
  expect(await llms.text()).toContain('# Reltroner Statistics — Asthortera Intelligence');

  const manifestRes = await request.get('/ai/manifest.json');
  expect(manifestRes.status()).toBe(200);
  const manifest = await manifestRes.json();
  expect(manifest.schema_version).toBe('rs-ai-manifest.v1');
  expect(manifest.mcp.endpoint).toBe('/mcp');
  // The thirteen RS-AI-API-001 tools, unchanged, followed by the three RS-AI-PAGE-004 page tools.
  const original = (JSON.parse(fs.readFileSync('tests/fixtures/rs-ai-api-001-tool-inputs.json', 'utf8')) as { tools: string[] }).tools;
  expect(manifest.mcp.tools).toEqual([...original, 'resolve_statistics_page', 'read_statistics_page', 'read_statistics_section']);

  const contextRes = await request.get('/ai/context.json');
  expect(contextRes.status()).toBe(200);
  const context = await contextRes.json();
  expect(context.schema_version).toBe('rs-ai-context.v1');

  const openApiRes = await request.get('/openapi.json');
  expect(openApiRes.status()).toBe(200);
  const openApi = await openApiRes.json();
  expect(openApi.openapi).toBe('3.1.0');
  expect(Object.keys(openApi.paths)).toContain('/api/v1/manifest');
  expect(Object.keys(openApi.paths)).toContain('/api/v1/calculator');
  expect(Object.keys(openApi.paths)).toContain('/api/v1/research/context');
  for (const p of ['/api/v1/pages/resolve', '/api/v1/pages/context', '/api/v1/pages/section']) expect(Object.keys(openApi.paths)).toContain(p);
});
