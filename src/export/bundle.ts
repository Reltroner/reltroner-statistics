/**
 * Executes an export plan: direct file for one finding in one format, otherwise a deterministic
 * ZIP (sorted safe paths, fixed timestamps) with MANIFEST.json and SHA256SUMS.txt. Isomorphic:
 * the browser Report Center and the build use the same code. PDFs are never rendered here; they
 * are precomputed from the same HTML by headless Chromium and supplied through `loadPdf`.
 */
import { strToU8, zipSync, type Zippable } from 'fflate';
import type { Finding } from '../domain/finding.ts';
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

export type PdfLoader = (key: string) => Promise<Uint8Array | null>;

export interface ExportInput {
  plan: ExportPlan;
  findings: readonly Finding[];
  context: ReportContext;
  loadPdf?: PdfLoader;
  xsd?: string;
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

export async function executeExport(input: ExportInput): Promise<ExportResult> {
  const { plan, context } = input;
  const byId = new Map(input.findings.map((f) => [f.id, f]));
  const selected = plan.finding_ids.map((id) => {
    const f = byId.get(id);
    if (!f) throw new Error(`Finding ${id} is not available`);
    return f;
  });
  if (selected.length > LIMITS.maxFindings) throw new Error(`Selection exceeds the ${LIMITS.maxFindings}-finding browser limit`);
  const notes: string[] = [];
  const pdf = async (key: string) => {
    if (!input.loadPdf) throw new Error('PDF requested but no precomputed PDF source is available');
    const bytes = await input.loadPdf(key);
    if (!bytes) throw new Error(`Precomputed PDF not available for ${key}`);
    return bytes;
  };

  if (plan.delivery === 'direct') {
    const f = selected[0]!;
    const format = plan.formats[0]!;
    const bytes = format === 'pdf' ? await pdf(safeFileStem(f.id)) : renderFormat(buildReportDocument(context, [f], 'single'), format);
    return { filename: `${safeFileStem(f.id)}.${format}`, mime: MIME[format], bytes, entries: null, notes };
  }

  const stem = plan.filename.replace(/\.zip$/, '');
  const files = new Map<string, { bytes: Uint8Array; format: BundleEntry['format']; finding_id: string | null }>();
  const add = (path: string, bytes: Uint8Array, format: BundleEntry['format'], finding_id: string | null) => {
    const full = `${stem}/${path}`;
    assertSafePath(full);
    if (files.has(full)) throw new Error(`Duplicate bundle path ${full}`);
    files.set(full, { bytes, format, finding_id });
  };
  let pdfCount = 0;
  const consolidatedPdfKey = plan.scope === 'all' ? 'ALL' : null;
  if (plan.bundle_layout === 'consolidated') {
    const doc = buildReportDocument(context, selected, 'consolidated');
    for (const format of plan.formats) {
      if (format === 'pdf') {
        if (consolidatedPdfKey) {
          add('report.pdf', await pdf(consolidatedPdfKey), 'pdf', null);
          pdfCount++;
        } else {
          notes.push('A consolidated PDF is precomputed only for the full finding set; this bundle carries one PDF per selected finding instead (each printed from its HTML report).');
          for (const f of selected) { add(`pdf/${f.id}.pdf`, await pdf(f.id), 'pdf', f.id); pdfCount++; }
        }
      } else {
        add(`report.${format}`, renderFormat(doc, format), format, null);
      }
    }
  } else {
    for (const f of selected) {
      const doc = buildReportDocument(context, [f], 'single');
      for (const format of plan.formats) {
        if (format === 'pdf') { add(`${f.id}/${f.id}.pdf`, await pdf(f.id), 'pdf', f.id); pdfCount++; }
        else add(`${f.id}/${f.id}.${format}`, renderFormat(doc, format), format, f.id);
      }
    }
  }
  if (pdfCount > LIMITS.maxPdfFiles) throw new Error(`Bundle exceeds ${LIMITS.maxPdfFiles} PDF files`);
  if (plan.formats.includes('xml') && input.xsd) add('schemas/report.xsd', strToU8(input.xsd), 'schema', null);

  const entries: BundleEntry[] = [];
  for (const [path, f] of [...files.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    entries.push({ path, bytes: f.bytes.byteLength, sha256: await sha256Hex(f.bytes), format: f.format, finding_id: f.finding_id });
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
  const sums = [...entries.map((e) => [e.path, e.sha256] as const), [manifestPath, await sha256Hex(manifestBytes)] as const]
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
  const bytes = zipSync(zippable);
  return {
    filename: plan.filename,
    mime: MIME.zip,
    bytes,
    entries: [...entries, { path: manifestPath, bytes: manifestBytes.byteLength, sha256: await sha256Hex(manifestBytes), format: 'manifest', finding_id: null }],
    notes,
  };
}
