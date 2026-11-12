import { useEffect, useMemo, useState } from 'react';
import type { Finding } from '../../domain/finding.ts';
import type { ReportContext } from '../../export/model.ts';
import { EXPORT_FORMATS, makeExportPlan, type BundleLayout, type ExportFormat, type ExportScope } from '../../export/plan.ts';
import type { BundleEntry } from '../../export/bundle.ts';
import { humanBytes, pdfLoader, saveBytes, SELECTION_KEY } from './download.ts';

const FORMAT_INFO: Record<ExportFormat, { label: string; detail: string }> = {
  json: { label: 'JSON', detail: 'Typed structured data with full provenance.' },
  csv: { label: 'CSV', detail: 'RFC 4180, UTF-8; formula-like text neutralized.' },
  xlsx: { label: 'XLSX', detail: 'Styled workbook: summary, findings, diff excerpts; typed cells.' },
  txt: { label: 'TXT', detail: 'Complete plain-text forensic summary.' },
  md: { label: 'Markdown', detail: 'GitHub-friendly tables and diff blocks.' },
  html: { label: 'HTML', detail: 'Self-contained branded report with embedded CSS.' },
  pdf: { label: 'PDF', detail: 'Printed by headless Chromium from the same HTML.' },
  xml: { label: 'XML', detail: 'Valid against the bundled report.xsd schema.' },
};

interface Loaded { context: ReportContext; findings: Finding[]; pdf: Set<string>; xsd: string | null }
interface Outcome { filename: string; size: number; entries: BundleEntry[] | null; notes: string[] }

export default function ReportCenter() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<ExportScope>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [formats, setFormats] = useState<Set<ExportFormat>>(new Set(['json', 'html']));
  const [layout, setLayout] = useState<BundleLayout>('per-finding');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/data/findings.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error('findings')))),
      fetch('/reports/pdf/index.json').then((r) => (r.ok ? r.json() : { files: {} })).catch(() => ({ files: {} })),
      fetch('/reports/report.xsd').then((r) => (r.ok ? r.text() : null)).catch(() => null),
    ]).then(([f, p, xsd]: [{ context: ReportContext; findings: Finding[] }, { files: Record<string, unknown> }, string | null]) => {
      setData({ context: f.context, findings: f.findings, pdf: new Set(Object.keys(p.files)), xsd });
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      if (id && f.findings.some((x) => x.id === id)) { setScope('single'); setPicked([id]); return; }
      if (params.get('selection') === 'drift') {
        try {
          const ids = (JSON.parse(sessionStorage.getItem(SELECTION_KEY) ?? '[]') as string[]).filter((x) => f.findings.some((y) => y.id === x));
          if (ids.length) { setScope(ids.length === 1 ? 'single' : 'selected'); setPicked(ids); }
        } catch { /* ignore */ }
      }
    }).catch(() => setError('Report data could not be loaded.'));
  }, []);

  const ids = useMemo(() => data?.findings.map((f) => f.id) ?? [], [data]);
  const effective = scope === 'all' ? ids : picked;
  const pdfReady = !!data && (scope === 'all' && layout === 'consolidated' ? data.pdf.has('ALL') : effective.length > 0 && effective.every((id) => data.pdf.has(id)));
  const planResult = useMemo(() => {
    if (!data) return null;
    try {
      return { plan: makeExportPlan({
        scope, audit_id: 'REPORT-CENTER', production_sha: data.context.production.commit_sha, remodeling_sha: data.context.remodeling.commit_sha,
        formats: [...formats], finding_ids: scope === 'all' ? [] : picked, bundle_layout: scope === 'single' ? 'per-finding' : layout,
      }, ids) };
    } catch (e) { return { error: (e as Error).message }; }
  }, [data, scope, picked, formats, layout, ids]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.findings ?? []).filter((f) => !q || `${f.id} ${f.title} ${f.file_path}`.toLowerCase().includes(q));
  }, [data, query]);

  const toggleFormat = (f: ExportFormat) => setFormats((s) => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; });
  const togglePick = (id: string) => setPicked((p) => (scope === 'single' ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const download = async () => {
    if (!data || !planResult || !('plan' in planResult) || !planResult.plan) return;
    setBusy(true); setOutcome(null); setError(null);
    try {
      const { executeExport } = await import('../../export/bundle.ts');
      const res = await executeExport({ plan: planResult.plan, findings: data.findings, context: data.context, loadPdf: pdfLoader, xsd: data.xsd ?? undefined });
      saveBytes(res.bytes, res.filename, res.mime);
      setOutcome({ filename: res.filename, size: res.bytes.byteLength, entries: res.entries, notes: res.notes });
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  if (error && !data) return <p className="rs-notice" data-tone="unavailable">{error}</p>;
  if (!data) return <p className="rs-notice" data-tone="unavailable">Loading report data…</p>;
  const plan = planResult && 'plan' in planResult ? planResult.plan : null;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-8">
        <fieldset>
          <legend className="rs-h3 mb-3">1 · What to export</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {([['single', 'One finding'], ['selected', 'Selected findings'], ['all', `All ${ids.length} findings`]] as const).map(([v, l]) => (
              <label key={v} className={`rs-card flex cursor-pointer items-center gap-2 p-3 text-sm font-semibold ${scope === v ? '!border-[var(--accent)]' : ''}`}>
                <input type="radio" name="scope" checked={scope === v} onChange={() => { setScope(v); if (v === 'single') setPicked((p) => p.slice(0, 1)); }} />{l}
              </label>
            ))}
          </div>
          {scope !== 'all' && (
            <div className="mt-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[14rem] flex-1"><span className="rs-label">Find findings</span><input className="rs-input w-full" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ID, title or path" /></label>
                {scope === 'selected' && <button type="button" className="rs-button rs-button-ghost" onClick={() => setPicked([...new Set([...picked, ...filtered.map((f) => f.id)])])}>Select {filtered.length} shown</button>}
                {picked.length > 0 && <button type="button" className="rs-button rs-button-ghost" onClick={() => setPicked([])}>Clear ({picked.length})</button>}
              </div>
              <ul tabIndex={0} aria-label="Findings to export" className="rs-table-wrap mt-3 max-h-80 divide-y divide-[var(--border)] overflow-auto">
                {filtered.slice(0, 250).map((f) => (
                  <li key={f.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-accent-soft">
                      <input type={scope === 'single' ? 'radio' : 'checkbox'} name="pick" className="mt-1" checked={picked.includes(f.id)} onChange={() => togglePick(f.id)} />
                      <span className="min-w-0"><span className="font-mono text-[0.75rem] text-ink-3">{f.id} · {f.priority} · {f.classification}</span><span className="block truncate text-ink">{f.title}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
              {filtered.length > 250 && <p className="mt-2 text-xs text-ink-3">Showing 250 of {filtered.length}; refine the search to see the rest.</p>}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="rs-h3 mb-1">2 · Formats</legend>
          <p className="mb-3 text-sm text-ink-3">All eight formats are equal choices; none is added for you.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {EXPORT_FORMATS.map((f) => {
              const unavailable = f === 'pdf' && !pdfReady;
              return (
                <label key={f} className={`rs-card flex cursor-pointer items-start gap-3 p-3 ${formats.has(f) ? '!border-[var(--accent)]' : ''} ${unavailable ? 'opacity-70' : ''}`}>
                  <input type="checkbox" className="mt-1" checked={formats.has(f)} onChange={() => toggleFormat(f)} />
                  <span><span className="font-semibold text-ink">{FORMAT_INFO[f].label}</span><span className="block text-xs text-ink-3">{FORMAT_INFO[f].detail}</span>
                    {unavailable && <span className="mt-1 block text-xs text-[var(--status-warning-text)]">Precomputed PDF not available for this selection in this build.</span>}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {scope !== 'single' && (
          <fieldset>
            <legend className="rs-h3 mb-3">3 · Bundle layout</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([['per-finding', 'Per finding', 'One folder per finding with each selected format.'], ['consolidated', 'Consolidated', 'One report per format covering every selected finding.']] as const).map(([v, l, d]) => (
                <label key={v} className={`rs-card flex cursor-pointer items-start gap-3 p-3 ${layout === v ? '!border-[var(--accent)]' : ''}`}>
                  <input type="radio" name="layout" className="mt-1" checked={layout === v} onChange={() => setLayout(v)} />
                  <span><span className="font-semibold text-ink">{l}</span><span className="block text-xs text-ink-3">{d}</span></span>
                </label>
              ))}
            </div>
            {layout === 'consolidated' && scope === 'selected' && formats.has('pdf') && <p className="mt-3 text-xs text-ink-3">A consolidated PDF exists only for the full finding set; for a custom selection the ZIP carries one PDF per finding, and the manifest says so.</p>}
          </fieldset>
        )}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rs-card p-5">
          <p className="rs-eyebrow">Export plan</p>
          {plan ? (
            <dl className="mt-3 grid gap-2 text-sm">
              <div><dt className="text-ink-3">Delivery</dt><dd className="m-0 font-semibold text-ink">{plan.delivery === 'direct' ? 'Direct file' : 'ZIP with manifest and SHA-256 checksums'}</dd></div>
              <div><dt className="text-ink-3">File</dt><dd className="m-0 font-mono text-[0.75rem] [overflow-wrap:anywhere]">{plan.filename}</dd></div>
              <div><dt className="text-ink-3">Findings · formats</dt><dd className="m-0">{plan.finding_ids.length} · {plan.formats.join(', ')}</dd></div>
            </dl>
          ) : <p className="mt-3 text-sm text-ink-3">{planResult && 'error' in planResult ? planResult.error : 'Choose findings and at least one format.'}</p>}
          <button type="button" className="rs-button rs-button-primary mt-5 w-full" disabled={!plan || busy || (formats.has('pdf') && !pdfReady)} onClick={download}>{busy ? 'Building…' : 'Download'}</button>
          {formats.has('pdf') && !pdfReady && <p className="mt-2 text-xs text-ink-3">Deselect PDF or choose findings that have precomputed PDFs.</p>}
          {error && <p role="alert" className="mt-3 text-sm text-[var(--status-critical-text)]">{error}</p>}
          {outcome && (
            <div className="mt-4 border-t border-line pt-3 text-xs text-ink-2" aria-live="polite">
              <p className="font-semibold text-ink">Saved {outcome.filename} ({humanBytes(outcome.size)})</p>
              {outcome.entries && <p className="mt-1">{outcome.entries.length} entries checksummed. Verify with <code>sha256sum -c SHA256SUMS.txt</code>.</p>}
              {outcome.notes.map((n) => <p key={n} className="mt-1">{n}</p>)}
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-ink-3">Bundles are built in your browser from the published evidence; nothing is uploaded. Sources: production {data.context.production.commit_sha.slice(0, 12)}, remodeling {data.context.remodeling.commit_sha.slice(0, 12)}, rules {data.context.rules_version}.</p>
      </aside>
    </div>
  );
}
