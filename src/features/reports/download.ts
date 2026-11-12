import type { PdfLoader } from '../../export/bundle.ts';

/** sessionStorage key carrying a drift-explorer selection to the Report Center. */
export const SELECTION_KEY = 'rs-export-selection';

/** Precomputed PDFs (printed from the same HTML at build time). 'ALL' is the consolidated full report. */
export const pdfLoader: PdfLoader = async (key) => {
  const name = key === 'ALL' ? 'all-findings' : key;
  if (!/^[A-Za-z0-9-]{3,128}$/.test(name)) return null;
  const res = await fetch(`/reports/pdf/${name}.pdf`);
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
};

export function saveBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function humanBytes(n: number): string {
  return n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(2)} MB`;
}
