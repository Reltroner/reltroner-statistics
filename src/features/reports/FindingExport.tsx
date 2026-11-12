import { useState } from 'react';
import type { Finding } from '../../domain/finding.ts';
import type { ReportContext } from '../../export/model.ts';
import { EXPORT_FORMATS, makeExportPlan, type ExportFormat } from '../../export/plan.ts';
import { pdfLoader, saveBytes } from './download.ts';

interface Props { finding: Finding; context: ReportContext; pdfAvailable: boolean }

const LABEL: Record<ExportFormat, string> = { json: 'JSON', csv: 'CSV', xlsx: 'XLSX', txt: 'TXT', md: 'Markdown', html: 'HTML', pdf: 'PDF', xml: 'XML' };

/** One finding, one format → direct download, generated in the browser from the canonical report model. */
export default function FindingExport({ finding, context, pdfAvailable }: Props) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (format: ExportFormat) => {
    setBusy(format);
    setError(null);
    try {
      const { executeExport } = await import('../../export/bundle.ts');
      const plan = makeExportPlan({ scope: 'single', audit_id: 'FINDING-EXPORT', production_sha: context.production.commit_sha, remodeling_sha: context.remodeling.commit_sha, formats: [format], finding_ids: [finding.id] }, [finding.id]);
      const res = await executeExport({ plan, findings: [finding], context, loadPdf: pdfLoader });
      saveBytes(res.bytes, res.filename, res.mime);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {EXPORT_FORMATS.map((f) => (
          <button key={f} type="button" className="rs-button rs-button-secondary !min-h-9 !px-3 !text-[0.82rem]" disabled={busy !== null || (f === 'pdf' && !pdfAvailable)}
            aria-label={`Download ${finding.id} as ${LABEL[f]}`} onClick={() => run(f)}>
            {busy === f ? 'Preparing…' : LABEL[f]}
          </button>
        ))}
      </div>
      {!pdfAvailable && <p className="mt-2 text-xs text-ink-3">PDF unavailable in this build: PDFs are printed from the HTML report by headless Chromium during the full build.</p>}
      {error && <p role="alert" className="mt-2 text-sm text-[var(--status-critical-text)]">{error}</p>}
      <p className="mt-2 text-xs text-ink-3">More formats or findings at once: <a href={`/reports?id=${finding.id}`}>Report center</a>.</p>
    </div>
  );
}
