/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R3: the Report Center's large ZIP export is bounded, observable,
 * cancellable and byte-for-byte the same as the isomorphic Node export. Faults are injected with Playwright
 * routing on the local server only.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { executeExport } from '../../src/export/bundle.ts';
import { makeExportPlan } from '../../src/export/plan.ts';
import { watchConsole } from './helpers.ts';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const dist = path.join(process.cwd(), 'dist');

async function prepare(page: Page, formats: string[]) {
  await page.goto('/reports');
  const center = page.locator('astro-island').filter({ hasText: 'What to export' });
  await expect(center.getByText('What to export')).toBeVisible();
  await center.getByText(/^All \d+ findings$/).click();
  for (const f of formats) await center.getByText(f, { exact: true }).click();
  await expect(center.getByRole('button', { name: 'Download' })).toBeEnabled();
  return center;
}

function trackPdfs(page: Page) {
  const state = { started: 0, active: 0, peak: 0 };
  page.on('request', (r) => { if (r.url().includes('/reports/pdf/') && r.url().endsWith('.pdf')) { state.started++; state.active++; state.peak = Math.max(state.peak, state.active); } });
  const done = (r: { url: () => string }) => { if (r.url().includes('/reports/pdf/') && r.url().endsWith('.pdf')) state.active--; };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return state;
}

test('full-scope HTML + PDF per-finding ZIP: staged progress, responsive page, bounded requests, Node-identical bytes', async ({ page }) => {
  test.setTimeout(150_000);
  const watch = watchConsole(page);
  const pdfs = trackPdfs(page);
  // A little latency per PDF makes every stage observable without depending on the machine's speed.
  await page.route('**/reports/pdf/*.pdf', async (route) => { await new Promise((r) => setTimeout(r, 15)); await route.continue(); });
  const center = await prepare(page, ['HTML', 'PDF']);
  await page.evaluate(() => {
    const w = window as unknown as { __gap: number };
    w.__gap = 0; let last = performance.now();
    setInterval(() => { const now = performance.now(); w.__gap = Math.max(w.__gap, now - last - 50); last = now; }, 50);
  });
  const downloadEvent = page.waitForEvent('download', { timeout: 120_000 });
  await center.getByRole('button', { name: 'Download' }).click();
  await expect(center.getByRole('button', { name: 'Building…' })).toBeDisabled();
  await expect(center.getByRole('button', { name: 'Cancel export' })).toBeVisible();
  await expect(center.locator('[data-export-progress-text]')).toHaveText(/Fetching precomputed PDFs: \d+ of 515 · [\d.]+ (KB|MB)/);
  const progress = center.getByRole('progressbar', { name: 'Export progress' });
  await expect(progress).toHaveAttribute('max', '515');
  const t0 = Date.now();
  await page.evaluate(() => 1);
  expect(Date.now() - t0, 'the page answers while the export runs').toBeLessThan(1000);
  const download = await downloadEvent;
  await expect(center.getByText(/^Download started: reltroner-statistics_REPORT-CENTER_[0-9a-f]{12}_[0-9a-f]{12}\.zip/)).toBeVisible();
  await expect(center.getByText(/1031 entries checksummed/)).toBeVisible();
  await expect(center.getByRole('button', { name: 'Download' })).toBeEnabled();
  await expect(center.getByRole('button', { name: 'Cancel export' })).toHaveCount(0);
  expect(pdfs.started).toBe(515);
  expect(pdfs.peak, 'at most six PDF requests at once').toBeLessThanOrEqual(6);
  expect(pdfs.peak).toBeGreaterThan(1);
  expect(await page.evaluate(() => (window as unknown as { __gap: number }).__gap), 'no long main-thread freeze').toBeLessThan(400);

  const bytes = new Uint8Array(fs.readFileSync(await download.path()));
  const files = unzipSync(bytes);
  const names = Object.keys(files);
  const sums = strFromU8(files[names.find((n) => n.endsWith('/SHA256SUMS.txt'))!]!).trim().split('\n');
  expect(sums.length).toBe(1031);
  for (const line of sums) { const [h, p] = line.split('  '); expect(sha(files[p!]!), p).toBe(h); }
  const pdfNames = names.filter((n) => n.endsWith('.pdf'));
  expect(pdfNames.length).toBe(515);
  for (const n of pdfNames) expect(strFromU8(files[n]!.subarray(0, 5)), n).toBe('%PDF-');
  const manifest = JSON.parse(strFromU8(files[names.find((n) => n.endsWith('/MANIFEST.json'))!]!));
  expect([manifest.selection.scope, manifest.selection.layout, manifest.selection.formats]).toEqual(['all', 'per-finding', ['html', 'pdf']]);
  const html = names.find((n) => n.endsWith('.html'))!;
  expect(strFromU8(files[html]!)).not.toMatch(/<script\b|https?:\/\/[^"']*\.(png|jpe?g|webp|svg)/i);

  // Same selection through the isomorphic Node export: identical bytes (worker compression changed nothing).
  const data = JSON.parse(fs.readFileSync(path.join(dist, 'data', 'findings.json'), 'utf8'));
  const all = [...data.findings, ...(data.creative_findings ?? []), ...(data.decision_findings ?? [])];
  const plan = makeExportPlan({ scope: 'all', audit_id: 'REPORT-CENTER', production_sha: data.context.production.commit_sha, remodeling_sha: data.context.remodeling.commit_sha, formats: ['html', 'pdf'], bundle_layout: 'per-finding' }, data.findings.map((f: { id: string }) => f.id));
  const node = await executeExport({ plan, findings: all, context: data.context, loadPdf: async (k) => new Uint8Array(fs.readFileSync(path.join(dist, 'reports', 'pdf', `${k === 'ALL' ? 'all-findings' : k}.pdf`))), xsd: fs.readFileSync(path.join(dist, 'reports', 'report.xsd'), 'utf8') });
  expect(sha(bytes)).toBe(sha(node.bytes));
  watch.expectClean();
});

test('Cancel stops fetching, downloads nothing and returns the panel to an interactive state', async ({ page }) => {
  test.setTimeout(90_000);
  const pdfs = trackPdfs(page);
  await page.route('**/reports/pdf/*.pdf', async (route) => { await new Promise((r) => setTimeout(r, 120)); await route.continue().catch(() => undefined); });
  const center = await prepare(page, ['PDF']);
  let downloads = 0;
  page.on('download', () => downloads++);
  await center.getByRole('button', { name: 'Download' }).focus();
  await page.keyboard.press('Enter');
  await expect(center.locator('[data-export-progress-text]')).toHaveText(/Fetching precomputed PDFs: [1-9]\d* of 515/);
  await expect(center.getByRole('button', { name: 'Cancel export' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(center.getByRole('alert')).toHaveText('Export cancelled. Nothing was downloaded.');
  await expect(center.getByRole('button', { name: 'Download' })).toBeEnabled();
  await expect(center.getByRole('button', { name: 'Download' })).toBeFocused();
  const atCancel = pdfs.started;
  await page.waitForTimeout(1500);
  expect(pdfs.started, 'no new PDF request after cancelling').toBeLessThanOrEqual(atCancel);
  expect(pdfs.started).toBeLessThan(515);
  expect(downloads).toBe(0);
});

test('a missing PDF fails with its key and no partial download', async ({ page }) => {
  const ids = JSON.parse(fs.readFileSync(path.join(dist, 'data', 'findings.json'), 'utf8')).findings.map((f: { id: string }) => f.id) as string[];
  const victim = ids[200]!;
  await page.route(`**/reports/pdf/${victim}.pdf`, (route) => route.fulfill({ status: 404, contentType: 'text/html', body: '<html>Not found</html>' }));
  const center = await prepare(page, ['PDF']);
  let downloads = 0;
  page.on('download', () => downloads++);
  await center.getByRole('button', { name: 'Download' }).click();
  await expect(center.getByRole('alert')).toHaveText(`Precomputed PDF not available for ${victim}. Nothing was downloaded.`, { timeout: 30_000 });
  await expect(center.getByRole('button', { name: 'Download' })).toBeEnabled();
  expect(downloads).toBe(0);
});

test('a web page served in place of a PDF is refused, not zipped', async ({ page }) => {
  const ids = JSON.parse(fs.readFileSync(path.join(dist, 'data', 'findings.json'), 'utf8')).findings.map((f: { id: string }) => f.id) as string[];
  await page.route(`**/reports/pdf/${ids[10]}.pdf`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Sign in</title>' }));
  const center = await prepare(page, ['PDF']);
  await center.getByRole('button', { name: 'Download' }).click();
  await expect(center.getByRole('alert')).toHaveText(`The server returned a web page instead of the precomputed PDF for ${ids[10]}. Nothing was downloaded.`, { timeout: 30_000 });
});

test('a transient 503 gets exactly one more attempt and the export completes', async ({ page }) => {
  test.setTimeout(90_000);
  const ids = JSON.parse(fs.readFileSync(path.join(dist, 'data', 'findings.json'), 'utf8')).findings.map((f: { id: string }) => f.id) as string[];
  let attempts = 0;
  await page.route(`**/reports/pdf/${ids[3]}.pdf`, async (route) => { attempts++; if (attempts === 1) await route.fulfill({ status: 503, body: 'busy' }); else await route.continue(); });
  const center = await prepare(page, ['PDF']);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), center.getByRole('button', { name: 'Download' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  expect(attempts).toBe(2);
});
