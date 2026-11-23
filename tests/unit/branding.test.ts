/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R2: root logo authority, deterministic derived assets,
 * header/favicon replacements, offline HTML/PDF report brand mark, and nonvisual export preservation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import {
  BRAND_DERIVED_ASSETS,
  BRAND_SOURCE_DIMENSIONS,
  BRAND_SOURCE_PATH,
  BRAND_SOURCE_SHA256,
  REPORT_BRAND_MARK_BYTES,
  REPORT_BRAND_MARK_DATA_URI,
  REPORT_BRAND_MARK_HEIGHT,
  REPORT_BRAND_MARK_MIME,
  REPORT_BRAND_MARK_SHA256,
  REPORT_BRAND_MARK_WIDTH,
} from '../../src/export/brand-mark.ts';
import { buildReportDocument } from '../../src/export/model.ts';
import { renderHtml } from '../../src/export/render-html.ts';
import { renderFormat } from '../../src/export/bundle.ts';
import { EXPORT_FORMATS } from '../../src/export/plan.ts';
import { exportFixture } from '../fixtures/export-fixture.ts';

const ROOT = process.cwd();
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function pngSize(bytes: Uint8Array): [number, number] {
  assert.equal(bytes[0], 0x89);
  assert.equal(bytes[1], 0x50);
  assert.equal(bytes[2], 0x4e);
  assert.equal(bytes[3], 0x47);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16, false), view.getUint32(20, false)];
}

function webpSize(bytes: Uint8Array): [number, number] {
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString('ascii'), 'RIFF');
  assert.equal(Buffer.from(bytes.subarray(8, 12)).toString('ascii'), 'WEBP');
  const chunk = Buffer.from(bytes.subarray(12, 16)).toString('ascii');
  if (chunk === 'VP8 ') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
  }
  if (chunk === 'VP8X') {
    const w = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const h = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    return [w, h];
  }
  if (chunk === 'VP8L') {
    const b0 = bytes[21]!, b1 = bytes[22]!, b2 = bytes[23]!, b3 = bytes[24]!;
    return [1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))];
  }
  throw new Error(`Unsupported WebP chunk: ${chunk}`);
}

function icoSizes(bytes: Uint8Array): Array<[number, number]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint16(0, true), 0, 'ICO reserved header');
  assert.equal(view.getUint16(2, true), 1, 'ICO image type');
  const count = view.getUint16(4, true);
  assert.ok(count >= 3, 'ICO carries 16, 32 and 48 px entries');
  const out: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    const w = bytes[off]! === 0 ? 256 : bytes[off]!;
    const h = bytes[off + 1]! === 0 ? 256 : bytes[off + 1]!;
    out.push([w, h]);
  }
  return out;
}

test('R2 root logo authority exists, is valid 1254x1254 WebP, and matches pinned SHA-256', () => {
  const sourcePath = path.join(ROOT, BRAND_SOURCE_PATH);
  assert.ok(fs.existsSync(sourcePath), `${BRAND_SOURCE_PATH} exists at repo root`);
  const bytes = fs.readFileSync(sourcePath);
  assert.equal(sha256(bytes), BRAND_SOURCE_SHA256);
  const [w, h] = webpSize(bytes);
  assert.deepEqual({ width: w, height: h }, BRAND_SOURCE_DIMENSIONS);
});

test('R2 derived public assets match recorded SHA-256s, magic bytes and dimensions; old favicon.svg is absent', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'public', 'favicon.svg')), false, 'old orbital favicon.svg removed');
  assert.equal(BRAND_DERIVED_ASSETS.length, 5);
  for (const asset of BRAND_DERIVED_ASSETS) {
    assert.notEqual(asset.path, 'public/reltroner-statistics-logo.webp', 'never overwrite owner-staged path');
    const full = path.join(ROOT, asset.path);
    assert.ok(fs.existsSync(full), `${asset.path} exists`);
    const bytes = fs.readFileSync(full);
    assert.equal(bytes.byteLength, asset.bytes, `${asset.path} byte length`);
    assert.equal(sha256(bytes), asset.sha256, `${asset.path} SHA-256`);
    if (asset.mime === 'image/webp') {
      assert.deepEqual([webpSize(bytes)], asset.sizes);
    } else if (asset.mime === 'image/png') {
      assert.deepEqual([pngSize(bytes)], asset.sizes);
    } else if (asset.mime === 'image/x-icon') {
      assert.deepEqual(icoSizes(bytes), asset.sizes);
    }
  }
});

test('R2 report inline data URI is bounded, self-contained PNG derived from root authority', () => {
  const prefix = `data:${REPORT_BRAND_MARK_MIME};base64,`;
  assert.ok(REPORT_BRAND_MARK_DATA_URI.startsWith(prefix));
  const raw = Buffer.from(REPORT_BRAND_MARK_DATA_URI.slice(prefix.length), 'base64');
  assert.equal(raw.byteLength, REPORT_BRAND_MARK_BYTES);
  assert.ok(raw.byteLength <= 8192, 'inline report mark stays compact across 500+ finding ZIPs');
  assert.equal(sha256(raw), REPORT_BRAND_MARK_SHA256);
  assert.deepEqual(pngSize(raw), [REPORT_BRAND_MARK_WIDTH, REPORT_BRAND_MARK_HEIGHT]);
  assert.equal(REPORT_BRAND_MARK_WIDTH, REPORT_BRAND_MARK_HEIGHT, '1:1 square aspect ratio preserved');
});

test('R2 SiteHeader and BaseLayout use only the new derived assets and preserve accessibility labels', () => {
  const layout = fs.readFileSync(path.join(ROOT, 'src', 'layouts', 'BaseLayout.astro'), 'utf8');
  assert.ok(!layout.includes('/favicon.svg'), 'BaseLayout no longer references old favicon.svg');
  assert.ok(layout.includes('href="/favicon.ico"'));
  assert.ok(layout.includes('href="/favicon-32x32.png"'));
  assert.ok(layout.includes('href="/favicon-48x48.png"'));
  assert.ok(layout.includes('href="/apple-touch-icon.png"'));

  const header = fs.readFileSync(path.join(ROOT, 'src', 'components', 'SiteHeader.astro'), 'utf8');
  assert.ok(header.includes('src="/statistics-brandmark.webp"'), 'SiteHeader uses new derived brandmark');
  assert.ok(!header.includes('/reltroner-statistics-logo.webp'), 'SiteHeader never references owner-staged path');
  assert.ok(!header.includes('cx="26.2" cy="11.4"'), 'old orbital header SVG removed');
  assert.ok(header.includes('aria-label="Reltroner Statistics home"'), 'home accessible link label preserved');
  assert.ok(header.includes('width="30" height="30"'), '30x30 header geometry preserved');
});

test('R2 renderHtml embeds the offline data URI mark with zero external image requests and preserves nonvisual formats', async () => {
  const { context, findings } = await exportFixture();
  const doc = buildReportDocument(context, findings, 'consolidated');
  const html = renderHtml(doc);
  assert.ok(html.includes(REPORT_BRAND_MARK_DATA_URI), 'standalone HTML embeds the derived data URI');
  assert.ok(html.includes('<img class="brand-mark"'), 'brand mark renders as an inline image');
  assert.ok(!html.includes('cx="26.2" cy="11.4"'), 'old orbital report SVG removed');
  assert.ok(!/<link\b|<script\b|src="https?:|src="\//i.test(html), 'zero external resources or relative URLs in standalone HTML');

  // Nonvisual/structured formats must stay free of embedded image binaries and keep their contracts intact.
  for (const format of EXPORT_FORMATS.filter((f) => f !== 'html' && f !== 'pdf')) {
    const bytes = renderFormat(doc, format);
    if (format === 'xlsx') {
      const entries = Object.keys(unzipSync(bytes)).sort();
      assert.deepEqual(entries, [
        '[Content_Types].xml', '_rels/.rels', 'docProps/core.xml',
        'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml',
        'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml',
      ]);
    } else {
      const text = strFromU8(bytes);
      assert.ok(!text.includes('data:image/'), `${format} carries no raster image data URI`);
    }
  }
});
