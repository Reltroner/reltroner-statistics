/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R3: bounded, observable and cancellable exports. Synthetic PDFs and
 * stub fetchers only; no network. Output bytes must not depend on concurrency, progress or the ZIP hook.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, type Zippable } from 'fflate';
import { executeExport, LIMITS, type ExportProgress } from '../../src/export/bundle.ts';
import { makeExportPlan } from '../../src/export/plan.ts';
import { createPdfLoader } from '../../src/features/reports/download.ts';
import { exportFixture } from '../fixtures/export-fixture.ts';
import type { Finding } from '../../src/domain/finding.ts';

const plan = (over: Record<string, unknown>, ids: string[]) =>
  makeExportPlan({ scope: 'selected', audit_id: 'AUDIT-TEST', production_sha: 'a'.repeat(40), remodeling_sha: 'b'.repeat(40), formats: ['json'], ...over } as never, ids);
const pdfBytes = (k: string) => new TextEncoder().encode(`%PDF-1.7 synthetic ${k}`);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function manyFindings(n: number): Promise<{ context: Awaited<ReturnType<typeof exportFixture>>['context']; findings: Finding[] }> {
  const { context, findings } = await exportFixture();
  const base = findings[0]!;
  return { context, findings: Array.from({ length: n }, (_, i) => ({ ...base, id: `CRD-SYN-${String(i).padStart(4, '0')}` })) };
}

test('bounded parallel PDF retrieval: never more than the limit in flight, bytes identical to serial', async () => {
  const { context, findings } = await manyFindings(40);
  const ids = findings.map((f) => f.id);
  const p = plan({ finding_ids: ids, formats: ['html', 'pdf', 'json'], bundle_layout: 'per-finding' }, ids);
  let inFlight = 0, peak = 0, calls = 0;
  const loadPdf = async (k: string) => { calls++; inFlight++; peak = Math.max(peak, inFlight); await delay(3 + (k.charCodeAt(k.length - 1) % 4)); inFlight--; return pdfBytes(k); };
  const serial = await executeExport({ plan: p, findings, context, loadPdf: async (k) => pdfBytes(k) });
  const parallel = await executeExport({ plan: p, findings, context, loadPdf, pdfConcurrency: 6 });
  assert.equal(calls, 40);
  assert.ok(peak > 1 && peak <= 6, `peak ${peak}`);
  assert.deepEqual(parallel.bytes, serial.bytes, 'same ZIP bytes whatever the arrival order');
  assert.deepEqual(parallel.entries, serial.entries);
});

test('progress: stages in order, counts never exceed totals and each stage completes', async () => {
  const { context, findings } = await manyFindings(12);
  const ids = findings.map((f) => f.id);
  const events: ExportProgress[] = [];
  await executeExport({ plan: plan({ finding_ids: ids, formats: ['md', 'pdf'], bundle_layout: 'per-finding' }, ids), findings, context, loadPdf: async (k) => pdfBytes(k), pdfConcurrency: 4, onProgress: (e) => events.push(e) });
  const order = [...new Set(events.map((e) => e.stage))];
  assert.deepEqual(order, ['render', 'pdf', 'checksum', 'compress']);
  for (const e of events) assert.ok(e.done >= 0 && e.done <= e.total, JSON.stringify(e));
  for (const stage of order) { const last = events.filter((e) => e.stage === stage).at(-1)!; assert.equal(last.done, last.total, stage); }
  assert.equal(events.filter((e) => e.stage === 'pdf').at(-1)!.total, 12);
  const pdfEvents = events.filter((e) => e.stage === 'pdf');
  assert.ok(pdfEvents.every((e, i) => i === 0 || e.bytes >= pdfEvents[i - 1]!.bytes), 'PDF bytes only grow');
});

test('cancellation stops retrieval: AbortError, loaders see the abort, no request starts afterwards', async () => {
  const { context, findings } = await manyFindings(30);
  const ids = findings.map((f) => f.id);
  const controller = new AbortController();
  let started = 0, startedAfterAbort = 0;
  const seen: AbortSignal[] = [];
  const loadPdf = async (k: string, signal?: AbortSignal) => {
    started++;
    if (controller.signal.aborted) startedAfterAbort++;
    if (signal) seen.push(signal);
    if (started === 5) controller.abort();
    await delay(5);
    return pdfBytes(k);
  };
  await assert.rejects(executeExport({ plan: plan({ finding_ids: ids, formats: ['pdf'], bundle_layout: 'per-finding' }, ids), findings, context, loadPdf, pdfConcurrency: 3, signal: controller.signal }), (e: Error) => e.name === 'AbortError' && /cancelled/.test(e.message));
  assert.equal(startedAfterAbort, 0);
  assert.ok(started < 30);
  assert.ok(seen.length > 0 && seen.every((s) => s.aborted), 'in-flight loads were told to stop');
});

test('a missing PDF fails the export with its key and stops the remaining retrievals', async () => {
  const { context, findings } = await manyFindings(30);
  const ids = findings.map((f) => f.id);
  let calls = 0;
  const loadPdf = async (k: string) => { calls++; await delay(2); return k.endsWith('0007') ? null : pdfBytes(k); };
  await assert.rejects(executeExport({ plan: plan({ finding_ids: ids, formats: ['pdf'], bundle_layout: 'per-finding' }, ids), findings, context, loadPdf, pdfConcurrency: 4 }), /Precomputed PDF not available for CRD-SYN-0007/);
  assert.ok(calls < 30, `stopped after ${calls} calls`);
});

test('the 600-PDF cap is enforced before any request is made', async () => {
  const { context, findings } = await manyFindings(LIMITS.maxPdfFiles + 1);
  const ids = findings.map((f) => f.id);
  let calls = 0;
  await assert.rejects(executeExport({ plan: plan({ finding_ids: ids, formats: ['pdf'], bundle_layout: 'per-finding' }, ids), findings, context, loadPdf: async (k) => { calls++; return pdfBytes(k); }, pdfConcurrency: 6 }), new RegExp(`Bundle exceeds ${LIMITS.maxPdfFiles} PDF files`));
  assert.equal(calls, 0);
});

test('the 200 MiB limit fails as soon as it is certain, before the remaining PDFs are fetched', async () => {
  const { context, findings } = await manyFindings(8);
  const ids = findings.map((f) => f.id);
  const big = new Uint8Array(41 * 1024 * 1024);
  big.set(new TextEncoder().encode('%PDF-1.7'));
  let calls = 0;
  await assert.rejects(executeExport({ plan: plan({ finding_ids: ids, formats: ['pdf'], bundle_layout: 'per-finding' }, ids), findings, context, loadPdf: async () => { calls++; return big; } }), new RegExp(`Bundle would exceed ${LIMITS.maxBundleBytes} bytes`));
  assert.equal(calls, 5, '5 × 41 MiB is the first total above 200 MiB');
});

test('a ZIP hook receives exactly what zipSync would compress, so worker output equals main-thread output', async () => {
  const { context, findings } = await manyFindings(6);
  const ids = findings.map((f) => f.id);
  const p = plan({ finding_ids: ids, formats: ['csv', 'xlsx', 'pdf', 'xml'], bundle_layout: 'per-finding' }, ids);
  const direct = await executeExport({ plan: p, findings, context, loadPdf: async (k) => pdfBytes(k), xsd: '<xs:schema/>' });
  let received: Zippable | null = null;
  const hooked = await executeExport({ plan: p, findings, context, loadPdf: async (k) => pdfBytes(k), xsd: '<xs:schema/>', zip: async (files) => { received = files; return zipSync(files); } });
  assert.ok(received);
  assert.deepEqual(hooked.bytes, direct.bytes);
  assert.deepEqual(hooked.entries, direct.entries);
});

test('direct PDF delivery reports one retrieval and honours cancellation', async () => {
  const { context, findings } = await manyFindings(1);
  const ids = findings.map((f) => f.id);
  const events: ExportProgress[] = [];
  const res = await executeExport({ plan: plan({ scope: 'single', finding_ids: ids, formats: ['pdf'] }, ids), findings, context, loadPdf: async (k) => pdfBytes(k), onProgress: (e) => events.push(e) });
  assert.equal(res.entries, null);
  assert.deepEqual(events.map((e) => [e.stage, e.done, e.total]), [['pdf', 0, 1], ['pdf', 1, 1]]);
  const c = new AbortController(); c.abort();
  await assert.rejects(executeExport({ plan: plan({ scope: 'single', finding_ids: ids, formats: ['pdf'] }, ids), findings, context, loadPdf: async (k) => pdfBytes(k), signal: c.signal }), (e: Error) => e.name === 'AbortError');
});

// Browser PDF loader (stub fetcher).
const pdfResponse = (body: BodyInit | null, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { 'Content-Type': 'application/pdf' }, ...init });
const counting = (responses: Array<() => Response | Promise<Response>>) => {
  let i = 0;
  const urls: string[] = [];
  const fetcher = (async (url: string) => { urls.push(url); return responses[Math.min(i++, responses.length - 1)]!(); }) as unknown as typeof fetch;
  return { fetcher, urls };
};

test('PDF loader: same-origin path, 404 is "missing", invalid keys never fetch', async () => {
  const ok = counting([() => pdfResponse(pdfBytes('X'))]);
  assert.deepEqual(await createPdfLoader({ fetcher: ok.fetcher })('CRD-ABC123'), pdfBytes('X'));
  assert.deepEqual(ok.urls, ['/reports/pdf/CRD-ABC123.pdf']);
  const all = counting([() => pdfResponse(pdfBytes('ALL'))]);
  await createPdfLoader({ fetcher: all.fetcher })('ALL');
  assert.deepEqual(all.urls, ['/reports/pdf/all-findings.pdf']);
  const missing = counting([() => new Response('<html>404</html>', { status: 404, headers: { 'Content-Type': 'text/html' } })]);
  assert.equal(await createPdfLoader({ fetcher: missing.fetcher })('CRD-ABC123'), null);
  assert.equal(missing.urls.length, 1);
  const bad = counting([() => pdfResponse(pdfBytes('X'))]);
  assert.equal(await createPdfLoader({ fetcher: bad.fetcher })('../etc/passwd'), null);
  assert.equal(bad.urls.length, 0);
});

test('PDF loader: an HTML page or non-PDF bytes are refused without retry', async () => {
  const html = counting([() => new Response('<!doctype html><title>Just a moment</title>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })]);
  await assert.rejects(createPdfLoader({ fetcher: html.fetcher, backoffMs: 1 })('CRD-ABC123'), /a web page instead of the precomputed PDF for CRD-ABC123/);
  assert.equal(html.urls.length, 1);
  const junk = counting([() => pdfResponse('not a pdf at all')]);
  await assert.rejects(createPdfLoader({ fetcher: junk.fetcher, backoffMs: 1 })('CRD-ABC123'), /is not a PDF/);
  assert.equal(junk.urls.length, 1);
});

test('PDF loader: one bounded retry for transient failures, then a truthful error', async () => {
  const recover = counting([() => new Response('busy', { status: 503 }), () => pdfResponse(pdfBytes('R'))]);
  assert.deepEqual(await createPdfLoader({ fetcher: recover.fetcher, backoffMs: 1 })('CRD-ABC123'), pdfBytes('R'));
  assert.equal(recover.urls.length, 2);
  const down = counting([() => new Response('busy', { status: 503 })]);
  await assert.rejects(createPdfLoader({ fetcher: down.fetcher, backoffMs: 1 })('CRD-ABC123'), /HTTP 503/);
  assert.equal(down.urls.length, 2);
  const forbidden = counting([() => new Response('no', { status: 403 })]);
  await assert.rejects(createPdfLoader({ fetcher: forbidden.fetcher, backoffMs: 1 })('CRD-ABC123'), /HTTP 403/);
  assert.equal(forbidden.urls.length, 1, 'client errors are not retried');
  const offline = counting([() => { throw new TypeError('Failed to fetch'); }]);
  await assert.rejects(createPdfLoader({ fetcher: offline.fetcher, backoffMs: 1 })('CRD-ABC123'), /network error interrupted the PDF for CRD-ABC123/);
  assert.equal(offline.urls.length, 2);
});

test('PDF loader: a stalled body is abandoned after the stall timeout, and cancellation is immediate', async () => {
  const silent = () => pdfResponse(new ReadableStream({ start() { /* never enqueues */ } }));
  const stalled = counting([silent]);
  await assert.rejects(createPdfLoader({ fetcher: stalled.fetcher, stallTimeoutMs: 30, backoffMs: 1 })('CRD-ABC123'), /No data arrived/);
  assert.equal(stalled.urls.length, 2);
  const controller = new AbortController();
  const hanging = (async (_: string, init?: RequestInit) => new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;
  const pending = createPdfLoader({ fetcher: hanging, backoffMs: 1 })('CRD-ABC123', controller.signal);
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, (e: Error) => e.name === 'AbortError');
});
