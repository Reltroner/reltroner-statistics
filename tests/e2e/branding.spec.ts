/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R2: favicon headers, header brandmark across themes and
 * 100–200% text scaling, offline standalone HTML & ZIP-extracted HTML rendering with zero remote
 * image dependencies, and printed PDF image-XObject + HTML-hash parity.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import {
  BRAND_DERIVED_ASSETS,
  REPORT_BRAND_MARK_DATA_URI,
  REPORT_BRAND_MARK_HEIGHT,
  REPORT_BRAND_MARK_WIDTH,
} from '../../src/export/brand-mark.ts';
import { buildReportDocument, type ReportContext } from '../../src/export/model.ts';
import { renderHtml } from '../../src/export/render-html.ts';
import type { Audit } from '../../src/domain/finding.ts';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

test('R2 favicon and header brandmark endpoints return 200 with exact MIME, nosniff and SHA-256; old favicon.svg is 404', async ({ request }) => {
  for (const asset of BRAND_DERIVED_ASSETS) {
    const res = await request.get(asset.url);
    expect(res.status(), asset.url).toBe(200);
    expect(res.headers()['content-type'], asset.url).toContain(asset.mime);
    expect(res.headers()['x-content-type-options'], asset.url).toBe('nosniff');
    const body = new Uint8Array(await res.body());
    expect(body.byteLength, asset.url).toBe(asset.bytes);
    expect(sha(body), asset.url).toBe(asset.sha256);
  }
  const legacy = await request.get('/favicon.svg');
  expect(legacy.status(), 'old orbital favicon.svg is not served').toBe(404);
});

test('@responsive R2 header emblem and favicon links render across themes and 100–200% text scaling without network errors', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') failures.push(`console: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) failures.push(`http ${r.status()}: ${r.url()}`); });

  for (const theme of ['dark', 'light'] as const) {
    await page.goto('/');
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem('rs-theme', t); } catch { /* ignore */ }
    }, theme);

    for (const scale of [100, 150, 200] as const) {
      await page.addStyleTag({ content: `html{font-size:${scale}%!important;}` });
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      const check = await page.evaluate(() => {
        const links = [...document.querySelectorAll<HTMLLinkElement>('head link[rel*="icon"]')].map((l) => ({
          rel: l.getAttribute('rel'),
          href: l.getAttribute('href'),
          type: l.getAttribute('type'),
          sizes: l.getAttribute('sizes'),
        }));
        const brandLink = document.querySelector<HTMLAnchorElement>('header[data-site-header] a[aria-label="Reltroner Statistics home"]');
        const img = brandLink?.querySelector<HTMLImageElement>('img.rs-brandmark') ?? null;
        const legacySvg = brandLink?.querySelector('svg') ?? null;
        const rect = img?.getBoundingClientRect() ?? null;
        return {
          links,
          hasBrandLink: Boolean(brandLink),
          hasLegacySvg: Boolean(legacySvg),
          src: img?.getAttribute('src') ?? null,
          alt: img?.getAttribute('alt') ?? null,
          complete: img?.complete ?? false,
          naturalWidth: img?.naturalWidth ?? 0,
          naturalHeight: img?.naturalHeight ?? 0,
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
          inViewport: rect ? rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 : false,
        };
      });
      const scope = `${theme} ${scale}%`;
      expect(check.hasBrandLink, scope).toBe(true);
      expect(check.hasLegacySvg, `${scope} no old orbital SVG in brand link`).toBe(false);
      expect(check.src, scope).toBe('/statistics-brandmark.webp');
      expect(check.alt, scope).toBe('');
      expect(check.complete, scope).toBe(true);
      expect(check.naturalWidth, scope).toBe(96);
      expect(check.naturalHeight, scope).toBe(96);
      expect(Math.round(check.width), scope).toBe(30);
      expect(Math.round(check.height), scope).toBe(30);
      expect(check.inViewport, scope).toBe(true);
      expect(check.links.some((l) => l.href === '/favicon.svg'), scope).toBe(false);
      expect(check.links.map((l) => l.href)).toEqual([
        '/favicon.ico',
        '/favicon-32x32.png',
        '/favicon-48x48.png',
        '/apple-touch-icon.png',
      ]);
    }
  }
  expect(failures, 'zero failed requests (including favicon) or console errors').toEqual([]);
});

test('R2 standalone HTML, ZIP-extracted HTML, and printed PDFs embed the derived brand mark offline with zero network fetches', async ({ browser, page, request }) => {
  test.setTimeout(90_000);

  // 1. Consolidated standalone HTML opened completely offline.
  const allHtmlRes = await request.get('/reports/all/reltroner-statistics-all-findings.html');
  expect(allHtmlRes.status()).toBe(200);
  const allHtml = await allHtmlRes.text();
  expect(allHtml).toContain(REPORT_BRAND_MARK_DATA_URI);
  expect(allHtml).not.toContain('cx="26.2" cy="11.4"');

  const verifyOfflineHtml = async (html: string, label: string) => {
    const offlineCtx = await browser.newContext({ javaScriptEnabled: false, offline: true, viewport: { width: 960, height: 700 } });
    const requests: string[] = [];
    const offlinePage = await offlineCtx.newPage();
    offlinePage.on('request', (r) => { if (!r.url().startsWith('data:') && r.url() !== 'about:blank') requests.push(r.url()); });
    await offlinePage.setContent(html, { waitUntil: 'load' });
    const info = await offlinePage.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>('.brand img.brand-mark');
      const rect = img?.getBoundingClientRect() ?? null;
      return {
        hasImg: Boolean(img),
        srcStartsWithDataPng: img?.getAttribute('src')?.startsWith('data:image/png;base64,') ?? false,
        complete: img?.complete ?? false,
        naturalWidth: img?.naturalWidth ?? 0,
        naturalHeight: img?.naturalHeight ?? 0,
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        hasBrandSvg: Boolean(document.querySelector('.brand svg')),
        scriptCount: document.querySelectorAll('script').length,
      };
    });
    expect(requests, `${label}: zero remote or relative network fetches`).toEqual([]);
    expect(info.hasImg, label).toBe(true);
    expect(info.srcStartsWithDataPng, label).toBe(true);
    expect(info.complete, label).toBe(true);
    expect(info.naturalWidth, label).toBe(REPORT_BRAND_MARK_WIDTH);
    expect(info.naturalHeight, label).toBe(REPORT_BRAND_MARK_HEIGHT);
    expect(Math.round(info.width), label).toBe(26);
    expect(Math.round(info.height), label).toBe(26);
    expect(info.hasBrandSvg, label).toBe(false);
    expect(info.scriptCount, label).toBe(0);
    await offlineCtx.close();
  };

  await verifyOfflineHtml(allHtml, 'consolidated standalone HTML');

  // 2. Representative per-finding HTML + PDF ZIP downloaded via Report Center: verify offline HTML + PDF checksums.
  await page.goto('/reports');
  const center = page.locator('astro-island').filter({ hasText: 'What to export' });
  await expect(center.getByText('What to export')).toBeVisible();
  await center.getByText('Selected findings', { exact: true }).click();
  await center.getByText('HTML', { exact: true }).click();
  await center.getByText('PDF', { exact: true }).click();
  const checkboxes = center.locator('input[type="checkbox"][name="pick"]');
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  const downloadEvent = page.waitForEvent('download', { timeout: 60_000 });
  await center.getByRole('button', { name: 'Download' }).click();
  const download = await downloadEvent;
  const zipPath = await download.path();
  expect(zipPath).toBeTruthy();
  const zipFiles = unzipSync(fs.readFileSync(zipPath!));
  const names = Object.keys(zipFiles);
  const sumsEntry = names.find((n) => n.endsWith('/SHA256SUMS.txt'))!;
  for (const line of strFromU8(zipFiles[sumsEntry]!).trim().split('\n')) {
    const [hash, entryPath] = line.split('  ');
    expect(sha(zipFiles[entryPath!]!), entryPath).toBe(hash);
  }
  const singleHtmlName = names.find((n) => n.endsWith('.html'))!;
  const singlePdfName = names.find((n) => n.endsWith('.pdf'))!;
  expect(singleHtmlName).toBeTruthy();
  expect(singlePdfName).toBeTruthy();
  await verifyOfflineHtml(strFromU8(zipFiles[singleHtmlName]!), 'ZIP-extracted single-finding HTML');
  expect(Buffer.from(zipFiles[singlePdfName]!.subarray(0, 5)).toString('latin1')).toBe('%PDF-');

  // 3. Printed PDF parity: both single-finding PDF and consolidated all-findings.pdf match updated renderHtml()
  //    html_sha256 in dist/reports/pdf/index.json and paint a raster image XObject on page 1.
  const pdfDir = path.join(process.cwd(), 'dist', 'reports', 'pdf');
  const pdfIndex = JSON.parse(fs.readFileSync(path.join(pdfDir, 'index.json'), 'utf8')) as {
    files: Record<string, { path: string; bytes: number; sha256: string; html_sha256: string }>;
  };
  const audit = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'artifacts', 'audit.json'), 'utf8')) as Audit;
  const context: ReportContext = {
    generated_at: audit.generated_at,
    rules_version: audit.rules_version,
    semantic_digest: audit.semantic_digest,
    production: { repository: audit.sources.production.repository, commit_sha: audit.sources.production.commit_sha, tree_sha: audit.sources.production.tree_sha },
    remodeling: { repository: audit.sources.remodeling.repository, commit_sha: audit.sources.remodeling.commit_sha, tree_sha: audit.sources.remodeling.tree_sha },
    deployment: { status: audit.deployment.status, deployed_sha: audit.deployment.deployed_sha, summary: audit.deployment.summary },
  };
  const firstDrift = audit.findings[0]!;
  const expectedSingleHtml = renderHtml(buildReportDocument(context, [firstDrift], 'single'));
  const expectedAllHtml = renderHtml(buildReportDocument(context, audit.findings, 'consolidated'));
  expect(pdfIndex.files[firstDrift.id]!.html_sha256).toBe(sha(new TextEncoder().encode(expectedSingleHtml)));
  expect(pdfIndex.files.ALL!.html_sha256).toBe(sha(new TextEncoder().encode(expectedAllHtml)));

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  for (const key of [firstDrift.id, 'ALL']) {
    const entry = pdfIndex.files[key]!;
    const pdfBytes = fs.readFileSync(path.join(process.cwd(), 'dist', entry.path));
    expect(sha(pdfBytes), key).toBe(entry.sha256);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true }).promise;
    const p1 = await doc.getPage(1);
    const ops = await p1.getOperatorList();
    const imageOps = ops.fnArray.filter((fn) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject);
    expect(imageOps.length, `${key} PDF page 1 paints the embedded brand mark image`).toBeGreaterThanOrEqual(1);
  }
});
