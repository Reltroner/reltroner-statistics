/**
 * Executes an export plan: direct file for one finding in one format, otherwise a deterministic
 * ZIP (sorted safe paths, fixed timestamps) with MANIFEST.json and SHA256SUMS.txt. Isomorphic:
 * the browser Report Center and the build use the same code. PDFs are never rendered here; they
 * are precomputed from the same HTML by headless Chromium and supplied through `loadPdf`.
 */
import { strToU8, zipSync, type Zippable } from 'fflate';
import type { Finding } from '../domain/finding.ts';
import { exportAbortError } from './abort.ts';
import { buildReportDocument, safeFileStem, type ReportContext, type ReportDocument } from './model.ts';
import type { ExportFormat, ExportPlan } from './plan.ts';
import { renderHtml } from './render-html.ts';
import { renderCsv, renderJson, renderMarkdown, renderTxt, renderXml } from './render-text.ts';
import { renderXlsx } from './xlsx.ts';

export const MIME: Readonly<Record<ExportFormat | 'zip', string>> = {
  json: 'application/json', csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain',
  md: 'text/markdown', html: 'text/html', pdf: 'application/pdf', xml: 'application/xml', zip: 'application/zip',
};

export const LIMITS = Object.freeze({ maxFindings: 2000, maxPdfFiles: 600, maxBundleBytes: 200 * 1024 * 1024 });
export const ZIP_MTIME_LOCAL = () => new Date(1980, 0, 1, 12, 0, 0);
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/** Returns the precomputed PDF for a key, or null when it does not exist. May honour `signal`. */
export type PdfLoader = (key: string, signal?: AbortSignal) => Promise<Uint8Array | null>;

/** RS-NEWSLETTER-BRANDING-EXPORT-008 R3: observable stages of a ZIP export (direct files report `pdf` only). */
export type ExportStage = 'render' | 'pdf' | 'checksum' | 'compress';
export interface ExportProgress { stage: ExportStage; done: number; total: number; bytes: number }

export interface ExportInput {
  plan: ExportPlan;
  findings: readonly Finding[];
  context: ReportContext;
  loadPdf?: PdfLoader;
  xsd?: string;
  /** Optional stage progress, called synchronously; callers decide how often to render it. */
  onProgress?: (progress: ExportProgress) => void;
  /** Optional cancellation: the export rejects with an Error named `AbortError` and stops fetching. */
  signal?: AbortSignal;
  /** Precomputed PDFs retrieved in parallel (default 1). Entries keep their planned paths and order. */
  pdfConcurrency?: number;
  /** Optional ZIP builder (the browser runs the same `zipSync` in a worker); must return zipSync's bytes. */
  zip?: (files: Zippable) => Promise<Uint8Array>;
}

export interface BundleEntry { path: string; bytes: number; sha256: string; format: ExportFormat | 'manifest' | 'schema'; finding_id: string | null }
export interface ExportResult { filename: string; mime: string; bytes: Uint8Array; entries: BundleEntry[] | null; notes: string[] }

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function renderFormat(doc: ReportDocument, format: Exclude<ExportFormat, 'pdf'>): Uint8Array {
  switch (format) {
    case 'json': return strToU8(renderJson(doc));
    case 'csv': return strToU8(renderCsv(doc));
    case 'txt': return strToU8(renderTxt(doc));
    case 'md': return strToU8(renderMarkdown(doc));
    case 'html': return strToU8(renderHtml(doc));
    case 'xml': return strToU8(renderXml(doc));
    case 'xlsx': return renderXlsx(doc);
  }
}

export function assertSafePath(p: string): void {
  if (!SAFE_PATH.test(p) || p.split('/').some((s) => s === '..' || s === '.')) throw new Error(`Unsafe bundle path: ${p}`);
}

export { exportAbortError };

/** Let the event loop run (input, rendering, progress) between slices of synchronous work. */
const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

type Planned = { path: string; format: BundleEntry['format']; finding_id: string | null } & ({ render: () => Uint8Array } | { pdfKey: string } | { fixed: Uint8Array });

export async function executeExport(input: ExportInput): Promise<ExportResult> {
  const { plan, context, signal } = input;
  const checkAbort = () => { if (signal?.aborted) throw exportAbortError(); };
  const report = input.onProgress ?? (() => {});
  const byId = new Map(input.findings.map((f) => [f.id, f]));
  const selected = plan.finding_ids.map((id) => {
    const f = byId.get(id);
    if (!f) throw new Error(`Finding ${id} is not available`);
    return f;
  });
  if (selected.length > LIMITS.maxFindings) throw new Error(`Selection exceeds the ${LIMITS.maxFindings}-finding browser limit`);
  const notes: string[] = [];
  const pdf = async (key: string, s?: AbortSignal) => {
    if (!input.loadPdf) throw new Error('PDF requested but no precomputed PDF source is available');
    const bytes = await input.loadPdf(key, s);
    if (!bytes) throw new Error(`Precomputed PDF not available for ${key}`);
    return bytes;
  };
  checkAbort();

  if (plan.delivery === 'direct') {
    const f = selected[0]!;
    const format = plan.formats[0]!;
    if (format === 'pdf') report({ stage: 'pdf', done: 0, total: 1, bytes: 0 });
    const bytes = format === 'pdf' ? await pdf(safeFileStem(f.id), signal) : renderFormat(buildReportDocument(context, [f], 'single'), format);
    checkAbort();
    if (format === 'pdf') report({ stage: 'pdf', done: 1, total: 1, bytes: bytes.byteLength });
    return { filename: `${safeFileStem(f.id)}.${format}`, mime: MIME[format], bytes, entries: null, notes };
  }

  // 1. Plan every entry (paths, duplicates, PDF count) before any work or network request.
  const stem = plan.filename.replace(/\.zip$/, '');
  const planned: Planned[] = [];
  const paths = new Set<string>();
  const add = (path: string, format: BundleEntry['format'], finding_id: string | null, source: { render: () => Uint8Array } | { pdfKey: string } | { fixed: Uint8Array }) => {
    const full = `${stem}/${path}`;
    assertSafePath(full);
    if (paths.has(full)) throw new Error(`Duplicate bundle path ${full}`);
    paths.add(full);
    planned.push({ path: full, format, finding_id, ...source });
  };
  const consolidatedPdfKey = plan.scope === 'all' ? 'ALL' : null;
  if (plan.bundle_layout === 'consolidated') {
    const doc = buildReportDocument(context, selected, 'consolidated');
    for (const format of plan.formats) {
      if (format === 'pdf') {
        if (consolidatedPdfKey) add('report.pdf', 'pdf', null, { pdfKey: consolidatedPdfKey });
        else {
          notes.push('A consolidated PDF is precomputed only for the full finding set; this bundle carries one PDF per selected finding instead (each printed from its HTML report).');
          for (const f of selected) add(`pdf/${f.id}.pdf`, 'pdf', f.id, { pdfKey: f.id });
        }
      } else {
        add(`report.${format}`, format, null, { render: () => renderFormat(doc, format) });
      }
    }
  } else {
    for (const f of selected) {
      const doc = buildReportDocument(context, [f], 'single');
      for (const format of plan.formats) {
        if (format === 'pdf') add(`${f.id}/${f.id}.pdf`, 'pdf', f.id, { pdfKey: f.id });
        else add(`${f.id}/${f.id}.${format}`, format, f.id, { render: () => renderFormat(doc, format) });
      }
    }
  }
  const pdfPlanned = planned.filter((p): p is Planned & { pdfKey: string } => 'pdfKey' in p);
  if (pdfPlanned.length > LIMITS.maxPdfFiles) throw new Error(`Bundle exceeds ${LIMITS.maxPdfFiles} PDF files`);
  if (plan.formats.includes('xml') && input.xsd) add('schemas/report.xsd', 'schema', null, { fixed: strToU8(input.xsd) });

  // 2. Render the text and workbook formats, yielding so the page stays responsive.
  const files = new Map<string, { bytes: Uint8Array; format: BundleEntry['format']; finding_id: string | null }>();
  const byPath = new Map<string, Uint8Array>();
  const toRender = planned.filter((p) => 'render' in p || 'fixed' in p);
  let size = 0;
  let sliceStart = Date.now();
  for (let i = 0; i < toRender.length; i++) {
    const p = toRender[i]!;
    const bytes = 'render' in p ? p.render() : (p as { fixed: Uint8Array }).fixed;
    byPath.set(p.path, bytes);
    size += bytes.byteLength;
    if (Date.now() - sliceStart > 24 || i === toRender.length - 1) {
      report({ stage: 'render', done: i + 1, total: toRender.length, bytes: size });
      await yieldToEventLoop();
      checkAbort();
      sliceStart = Date.now();
    }
  }
  if (size > LIMITS.maxBundleBytes) throw new Error(`Bundle would exceed ${LIMITS.maxBundleBytes} bytes`);

  // 3. Retrieve precomputed PDFs with bounded parallelism; stop everything on the first failure, on
  //    cancellation, or as soon as the size limit is certain to be exceeded.
  if (pdfPlanned.length) {
    const inner = new AbortController();
    const onAbort = () => inner.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    let next = 0, done = 0, pdfBytes = 0;
    report({ stage: 'pdf', done: 0, total: pdfPlanned.length, bytes: 0 });
    const worker = async () => {
      while (next < pdfPlanned.length) {
        if (inner.signal.aborted) return;
        const p = pdfPlanned[next++]!;
        const bytes = await pdf(p.pdfKey, inner.signal);
        if (signal?.aborted) throw exportAbortError();
        byPath.set(p.path, bytes);
        pdfBytes += bytes.byteLength;
        done++;
        if (size + pdfBytes > LIMITS.maxBundleBytes) throw new Error(`Bundle would exceed ${LIMITS.maxBundleBytes} bytes`);
        report({ stage: 'pdf', done, total: pdfPlanned.length, bytes: pdfBytes });
      }
    };
    const workers = Array.from({ length: Math.max(1, Math.min(input.pdfConcurrency ?? 1, pdfPlanned.length)) }, () => worker());
    try {
      await Promise.all(workers);
    } catch (error) {
      inner.abort();
      await Promise.allSettled(workers);
      throw signal?.aborted ? exportAbortError() : error;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
    checkAbort();
    size += pdfBytes;
  }
  for (const p of planned) files.set(p.path, { bytes: byPath.get(p.path)!, format: p.format, finding_id: p.finding_id });

  // 4. Checksums, manifest and SHA256SUMS exactly as before.
  const entries: BundleEntry[] = [];
  const sorted = [...files.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  for (let i = 0; i < sorted.length; i++) {
    const [path, f] = sorted[i]!;
    entries.push({ path, bytes: f.bytes.byteLength, sha256: await sha256Hex(f.bytes), format: f.format, finding_id: f.finding_id });
    if (i % 64 === 63 || i === sorted.length - 1) { report({ stage: 'checksum', done: i + 1, total: sorted.length, bytes: size }); checkAbort(); }
  }
  const manifest = {
    schema_version: 'reltroner-statistics-bundle.v1',
    filename: plan.filename,
    generated_from: { rules_version: context.rules_version, semantic_digest: context.semantic_digest, analysis_generated_at: context.generated_at },
    sources: { production: context.production, remodeling: context.remodeling, deployment: { status: context.deployment.status, deployed_sha: context.deployment.deployed_sha } },
    selection: { scope: plan.scope, layout: plan.bundle_layout, formats: plan.formats, finding_ids: plan.finding_ids },
    safeguards: {
      csv: 'Text cells starting with = + - @ TAB or CR are prefixed with an apostrophe; numbers stay numeric.',
      xlsx: 'No formula elements are written; formula-like text is stored as literal text with quotePrefix.',
      pdf: 'Printed by headless Chromium from the HTML report of the same finding(s); no separate PDF template exists.',
      paths: 'All entry paths are relative, sorted and restricted to [A-Za-z0-9._-]; timestamps are fixed.',
    },
    limits: LIMITS,
    notes,
    entries,
  };
  const manifestBytes = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
  const manifestPath = `${stem}/MANIFEST.json`;
  // Hash and size the manifest before compression: a worker may take ownership of the entry buffers.
  const manifestSha = await sha256Hex(manifestBytes);
  const manifestSize = manifestBytes.byteLength;
  const sums = [...entries.map((e) => [e.path, e.sha256] as const), [manifestPath, manifestSha] as const]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([p, h]) => `${h}  ${p}`).join('\n') + '\n';
  const all: Record<string, Uint8Array> = {};
  for (const [p, f] of files) all[p] = f.bytes;
  all[manifestPath] = manifestBytes;
  all[`${stem}/SHA256SUMS.txt`] = strToU8(sums);
  const total = Object.values(all).reduce((a, b) => a + b.byteLength, 0);
  if (total > LIMITS.maxBundleBytes) throw new Error(`Bundle would exceed ${LIMITS.maxBundleBytes} bytes`);
  const mtime = ZIP_MTIME_LOCAL();
  const zippable: Zippable = {};
  for (const k of Object.keys(all).sort()) zippable[k] = [all[k]!, { level: k.endsWith('.pdf') || k.endsWith('.xlsx') ? 0 : 6, mtime }];
  checkAbort();
  report({ stage: 'compress', done: 0, total: 1, bytes: total });
  if (!input.zip) await yieldToEventLoop();
  const bytes = input.zip ? await input.zip(zippable) : zipSync(zippable);
  checkAbort();
  report({ stage: 'compress', done: 1, total: 1, bytes: bytes.byteLength });
  return {
    filename: plan.filename,
    mime: MIME.zip,
    bytes,
    entries: [...entries, { path: manifestPath, bytes: manifestSize, sha256: manifestSha, format: 'manifest', finding_id: null }],
    notes,
  };
}
