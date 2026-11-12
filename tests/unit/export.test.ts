import test from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { buildReportDocument } from '../../src/export/model.ts';
import { assertSafePath, executeExport, renderFormat } from '../../src/export/bundle.ts';
import { csvCell, renderCsv, renderXml } from '../../src/export/render-text.ts';
import { renderHtml } from '../../src/export/render-html.ts';
import { makeExportPlan, EXPORT_FORMATS } from '../../src/export/plan.ts';
import { exportFixture } from '../fixtures/export-fixture.ts';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const plan = (over: Record<string, unknown>, ids: string[]) =>
  makeExportPlan({ scope: 'single', audit_id: 'AUDIT-TEST', production_sha: 'a'.repeat(40), remodeling_sha: 'b'.repeat(40), formats: ['json'], ...over } as never, ids);

test('all eight formats render the same finding with typed values and provenance', async () => {
  const { context, findings } = await exportFixture();
  const f = findings.find((x) => x.locator === 'countries_14[Beluftner].land_area_million_km2')!;
  const doc = buildReportDocument(context, [f], 'single');
  for (const format of EXPORT_FORMATS.filter((x) => x !== 'pdf')) {
    const bytes = renderFormat(doc, format);
    assert.ok(bytes.byteLength > 200, format);
    const text = format === 'xlsx' ? Object.values(unzipSync(bytes)).map((b) => strFromU8(b)).join('\n') : strFromU8(bytes);
    assert.ok(text.includes(f.id), `${format} carries the finding id`);
    assert.ok(text.includes('a'.repeat(40)) && text.includes('b'.repeat(40)), `${format} carries both commit SHAs`);
    assert.ok(text.includes('363') && text.includes('88'), `${format} carries both values`);
  }
  const json = JSON.parse(strFromU8(renderFormat(doc, 'json')));
  assert.equal(json.findings[0].production.value, 88);
  assert.equal(typeof json.findings[0].remodeling.value, 'number');
  assert.equal(json.context.deployment.status, 'DEPLOYMENT_UNVERIFIED');
});

test('CSV neutralizes formula injection but keeps numbers numeric', async () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+SUM(A1)'), "'+SUM(A1)");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell('-5'), "'-5");
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell(null), '');
  const { context, findings } = await exportFixture();
  const csv = renderCsv(buildReportDocument(context, findings, 'consolidated'));
  assert.ok(csv.startsWith('﻿id,level,'));
  assert.ok(!/(^|,)=HYPERLINK/m.test(csv));
  assert.ok(csv.includes('\r\n'));
});

test('XLSX writes typed cells, never formulas, and quotePrefix on formula-like text', async () => {
  const { context, findings } = await exportFixture();
  const zip = unzipSync(renderFormat(buildReportDocument(context, findings, 'consolidated'), 'xlsx'));
  assert.deepEqual(Object.keys(zip).sort(), ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']);
  const sheets = ['sheet1', 'sheet2', 'sheet3'].map((s) => strFromU8(zip[`xl/worksheets/${s}.xml`]!));
  assert.ok(sheets.every((s) => !/<f[ >]/.test(s)), 'no formula elements');
  const findingsSheet = sheets[1]!;
  assert.match(findingsSheet, /<c r="[A-Z]+\d+"><v>363<\/v><\/c>/);
  assert.match(findingsSheet, /t="inlineStr" s="2"><is><t xml:space="preserve">=HYPERLINK/);
  assert.match(findingsSheet, /t="b"><v>1<\/v>/);
  assert.ok(!findingsSheet.includes('\u0007'), 'control characters are replaced');
  assert.match(strFromU8(zip['xl/workbook.xml']!), /_xlnm\._FilterDatabase/);
  assert.match(strFromU8(zip['xl/styles.xml']!), /quotePrefix="1"/);
});

test('HTML escapes untrusted text and is self-contained', async () => {
  const { context, findings } = await exportFixture();
  const html = renderHtml(buildReportDocument(context, findings, 'consolidated'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('Evil&lt;Co&gt;'));
  assert.ok(!/<link\b|<script\b|src="http/i.test(html), 'no external resources or scripts');
  assert.match(html, /Production main \(authoritative\)/);
  assert.match(html, /Remodeling main \(proposal\)/);
});

test('XML escapes markup and replaces characters XML 1.0 forbids', async () => {
  const { context, findings } = await exportFixture();
  const xml = renderXml(buildReportDocument(context, findings, 'consolidated'));
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(!xml.includes('\u0007'));
  assert.ok(xml.includes('Evil&lt;Co&gt;'));
  assert.ok(!/<script/.test(xml));
  assert.equal((xml.match(/<finding /g) ?? []).length, findings.length);
});

test('direct delivery for one finding and one format; PDF comes only from the precomputed loader', async () => {
  const { context, findings } = await exportFixture();
  const ids = findings.map((f) => f.id);
  const one = findings[0]!.id;
  const csv = await executeExport({ plan: plan({ formats: ['csv'], finding_ids: [one] }, ids), findings, context });
  assert.equal(csv.filename, `${one}.csv`);
  assert.equal(csv.entries, null);
  const fakePdf = new TextEncoder().encode('%PDF-1.7 fake');
  const pdf = await executeExport({ plan: plan({ formats: ['pdf'], finding_ids: [one] }, ids), findings, context, loadPdf: async () => fakePdf });
  assert.deepEqual(pdf.bytes, fakePdf);
  await assert.rejects(executeExport({ plan: plan({ formats: ['pdf'], finding_ids: [one] }, ids), findings, context }), /no precomputed PDF/);
});

test('ZIP bundles are deterministic, ordered, checksummed and path-safe', async () => {
  const { context, findings } = await exportFixture();
  const ids = findings.map((f) => f.id);
  const p = plan({ scope: 'all', finding_ids: [], formats: ['xml', 'json', 'pdf', 'xlsx'], bundle_layout: 'per-finding' }, ids);
  const loadPdf = async (k: string) => new TextEncoder().encode(`%PDF ${k}`);
  const a = await executeExport({ plan: p, findings, context, loadPdf, xsd: '<xs:schema/>' });
  const b = await executeExport({ plan: p, findings, context, loadPdf, xsd: '<xs:schema/>' });
  assert.deepEqual(a.bytes, b.bytes, 'byte-identical across runs');
  const files = unzipSync(a.bytes);
  const names = Object.keys(files);
  assert.deepEqual(names, [...names].sort());
  const stem = p.filename.replace(/\.zip$/, '');
  assert.ok(names.includes(`${stem}/MANIFEST.json`) && names.includes(`${stem}/SHA256SUMS.txt`) && names.includes(`${stem}/schemas/report.xsd`));
  for (const line of strFromU8(files[`${stem}/SHA256SUMS.txt`]!).trim().split('\n')) {
    const [hash, path] = line.split('  ');
    assert.equal(sha(files[path!]!), hash, path);
  }
  const manifest = JSON.parse(strFromU8(files[`${stem}/MANIFEST.json`]!));
  assert.deepEqual(manifest.selection.formats, ['json', 'pdf', 'xlsx', 'xml']);
  assert.equal(manifest.sources.production.commit_sha, 'a'.repeat(40));
  assert.equal(manifest.entries.filter((e: { format: string }) => e.format === 'pdf').length, findings.length);
  assert.ok(names.every((n) => !n.includes('..') && !n.startsWith('/')));
  for (const bad of ['../x', '/abs', 'a/../b', 'a\\b', '.hidden', 'a//b']) assert.throws(() => assertSafePath(bad), bad);
});

test('consolidated layout: one file per format; custom PDF selection is disclosed, not faked', async () => {
  const { context, findings } = await exportFixture();
  const ids = findings.map((f) => f.id);
  const picked = ids.slice(0, 2);
  const res = await executeExport({
    plan: plan({ scope: 'selected', finding_ids: picked, formats: ['md', 'pdf', 'csv'], bundle_layout: 'consolidated' }, ids),
    findings, context, loadPdf: async (k) => new TextEncoder().encode(`%PDF ${k}`),
  });
  const names = Object.keys(unzipSync(res.bytes)).map((n) => n.split('/').slice(1).join('/'));
  assert.ok(names.includes('report.md') && names.includes('report.csv'));
  assert.deepEqual(names.filter((n) => n.startsWith('pdf/')).sort(), picked.map((id) => `pdf/${id}.pdf`).sort());
  assert.match(res.notes[0]!, /consolidated PDF is precomputed only for the full finding set/);
  const all = await executeExport({
    plan: plan({ scope: 'all', finding_ids: [], formats: ['pdf'], bundle_layout: 'consolidated' }, ids),
    findings, context, loadPdf: async (k) => new TextEncoder().encode(`%PDF ${k}`),
  });
  assert.ok(Object.keys(unzipSync(all.bytes)).some((n) => n.endsWith('/report.pdf')));
});
