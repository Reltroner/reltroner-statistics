import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { hydrated, watchConsole } from './helpers.ts';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

test('scatter explorer updates when an axis changes', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/statistics/scatter');
  const frame = page.locator('.rs-chart-frame').first();
  await hydrated(frame);
  await expect(frame).toHaveAttribute('aria-label', /Sentient Development Index against GDP per capita/);
  await page.getByLabel('Y axis').selectOption('life_expectancy');
  await expect(frame).toHaveAttribute('aria-label', /Life expectancy against GDP per capita/);
  await page.getByLabel('Color by').selectOption({ index: 1 });
  await expect(page.getByText(/Clusters are a MODEL_ESTIMATE/)).toBeVisible();
  watch.expectClean();
});

test('history shows discrete anchors and states insufficiency', async ({ page }) => {
  await page.goto('/history');
  await expect(page.locator('.rs-chart-frame').first()).toHaveAttribute('aria-label', /not interpolated/);
  await expect(page.getByText(/Volatility: INSUFFICIENT_DATA/)).toBeVisible();
  await expect(page.getByRole('cell', { name: '950 BAC' }).first()).toBeVisible();
});

test('clustering lab switches algorithms and k', async ({ page }) => {
  await page.goto('/clustering');
  const algo = page.locator('fieldset').filter({ hasText: 'K-Means' });
  await hydrated(algo);
  await algo.getByText('DBSCAN', { exact: true }).click();
  await expect(page.getByText(/noise point/).first()).toBeVisible();
  await algo.getByText('K-Means', { exact: true }).click();
  await page.getByLabel('Clusters (k)').selectOption('2');
  await expect(page.getByText(/Silhouette 0\.\d+/)).toBeVisible();
});

test('knowledge graph renders nodes, inspector and accessible list view', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/graph');
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 20_000 });
  await page.locator('.react-flow__node').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Analyze impact' })).toBeVisible();
  await page.getByRole('button', { name: 'List (accessible)' }).click();
  await expect(page.getByRole('table').first()).toBeVisible();
  watch.expectClean();
});

test('impact explorer traverses dependencies from a preset', async ({ page }) => {
  await page.goto('/impact?node=indicator:population');
  await expect(page.getByRole('heading', { name: 'Population', level: 2 })).toBeVisible();
  await expect(page.getByText(/via DEPENDS_ON/).first()).toBeVisible();
});

test('drift explorer filters by URL and links to findings', async ({ page }) => {
  await page.goto('/drift?classification=VALUE_DRIFT#explorer');
  const rows = page.locator('#explorer tbody tr:not([aria-hidden])');
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText(/VALUE DRIFT/);
});

test('single finding downloads directly in JSON and PDF', async ({ page }) => {
  const id = await page.request.get('/data/findings.json').then(async (r) => (await r.json()).findings.find((f: { level: string }) => f.level === 'FIELD').id as string);
  await page.goto(`/drift/${id}`);
  await hydrated(page.getByRole('button', { name: `Download ${id} as JSON` }));
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: `Download ${id} as JSON` }).click()]);
  expect(json.suggestedFilename()).toBe(`${id}.json`);
  const parsed = JSON.parse(fs.readFileSync(await json.path(), 'utf8'));
  expect(parsed.findings[0].id).toBe(id);
  const pdf = await page.request.get(`/reports/pdf/${id}.pdf`);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('report center builds a checksummed ZIP for all findings', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/reports');
  const center = page.locator('astro-island').filter({ hasText: 'What to export' });
  await expect(center.getByText('What to export')).toBeVisible();
  await center.getByText(/^All \d+ findings$/).click();
  for (const f of ['CSV', 'XML']) await center.getByText(f, { exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), center.getByRole('button', { name: 'Download' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^reltroner-statistics_REPORT-CENTER_[0-9a-f]{12}_[0-9a-f]{12}\.zip$/);
  const files = unzipSync(new Uint8Array(fs.readFileSync(await download.path())));
  const names = Object.keys(files);
  const sums = names.find((n) => n.endsWith('/SHA256SUMS.txt'))!;
  for (const line of strFromU8(files[sums]!).trim().split('\n')) {
    const [hash, p] = line.split('  ');
    expect(sha(files[p!]!), p).toBe(hash);
  }
  const manifest = JSON.parse(strFromU8(files[names.find((n) => n.endsWith('/MANIFEST.json'))!]!));
  expect(manifest.selection.formats).toEqual(['csv', 'xml']);
  expect(names.some((n) => n.endsWith('/schemas/report.xsd'))).toBe(true);
  await expect(center.getByText(/entries checksummed/)).toBeVisible();
});

test('PDF text matches the HTML it was printed from', async () => {
  const dist = path.join(process.cwd(), 'dist', 'reports', 'pdf');
  const index = JSON.parse(fs.readFileSync(path.join(dist, 'index.json'), 'utf8')) as { files: Record<string, { path: string }> };
  const id = Object.keys(index.files).find((k) => k !== 'ALL')!;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(dist, `${id}.pdf`))), useSystemFonts: true }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map((t) => ('str' in t ? t.str : '')).join(' ');
  expect(text).toContain(id);
  expect(text).toContain('Production main (authoritative)');
  expect(text).toContain('Remodeling main (proposal)');
  const audit = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'artifacts', 'audit.json'), 'utf8'));
  expect(text).toContain(audit.sources.production.commit_sha);
  expect(text.replace(/\s+/g, ' ')).toContain('Source authority.');
});

test('creative intelligence: worldbuilding explorer, ideation case study, ratification guardrail and private workspace isolation', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/creative');
  await expect(page.locator('[data-image-slot="CREATIVE_HOME_HERO"]')).toBeVisible();
  await expect(page.getByText(/Reltronland & Depcutland/).first()).toBeVisible();

  // Worldbuilding Explorer
  await page.goto('/creative/explore?entity=nar:nation:reltronland');
  await expect(page.getByRole('heading', { name: 'Reltronland', exact: true })).toBeVisible();
  await expect(page.getByText(/Typed Narrative Relationships/)).toBeVisible();

  // Ideation Studio: Reltronland/Depcutland Case Study + Ratification Guardrail + Private Draft Isolation
  await page.goto('/creative/ideas');
  await expect(page.getByRole('heading', { name: /Reltronland & Depcutland: cooperating against a shared threat without an alliance/ })).toBeVisible();
  await hydrated(page.getByRole('button', { name: 'RATIFIED_EXTERNALLY' }));
  await page.getByRole('button', { name: 'RATIFIED_EXTERNALLY' }).click();
  await expect(page.getByRole('status')).toContainText(/Cannot mark proposal as RATIFIED_EXTERNALLY without verified creator publication evidence/);

  await page.getByRole('button', { name: 'APPROVED_FOR_AUTHORING' }).click();
  await expect(page.getByRole('status')).toContainText(/Canon status remains/);

  // Create a private local session draft and verify it never leaks into public endpoints
  await page.getByLabel('Draft title').fill('Private Unreleased Season 32 Arc');
  await page.getByLabel('Narrative hypothesis').fill('Confidential creator hypothesis kept in local session memory.');
  await page.getByRole('button', { name: /Save Private Session Proposal/ }).click();
  await expect(page.getByText('Private Workspace Isolation Active:')).toBeVisible();

  const publicCreativeText = await (await page.request.get('/data/creative.json')).text();
  expect(publicCreativeText).not.toContain('Private Unreleased Season 32 Arc');
  const searchIndexText = await (await page.request.get('/data/search-index.json')).text();
  expect(searchIndexText).not.toContain('Private Unreleased Season 32 Arc');

  // Consistency Audit, Refactoring & Remodeling Lab
  await page.goto('/creative/audit');
  await expect(page.getByText(/UNRELIABLE_NARRATOR_POSSIBILITY/).first()).toBeVisible();
  await page.goto('/creative/refactor');
  await expect(page.getByText(/Non-destructive guarantee:/)).toBeVisible();
  await page.goto('/creative/remodel');
  await expect(page.getByText(/INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL/).first()).toBeVisible();

  watch.expectClean();
});
