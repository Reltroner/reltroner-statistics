/**
 * Canonical report document. Every one of the eight formats renders this one model, so content,
 * provenance and typed values cannot diverge between formats. Isomorphic (build and browser).
 */
import type { Finding, SideValue } from '../domain/finding.ts';

export const REPORT_SCHEMA_VERSION = 'reltroner-statistics-report.v1';

export interface ReportContext {
  generated_at: string;
  rules_version: string;
  semantic_digest: string;
  production: { repository: string; commit_sha: string; tree_sha: string };
  remodeling: { repository: string; commit_sha: string; tree_sha: string };
  deployment: { status: string; deployed_sha: string | null; summary: string };
}

export interface ReportDocument {
  schema_version: typeof REPORT_SCHEMA_VERSION;
  title: string;
  layout: 'single' | 'consolidated';
  context: ReportContext;
  summary: { findings: number; by_classification: Record<string, number>; by_priority: Record<string, number>; by_review_status: Record<string, number> };
  authority_notice: string;
  findings: Finding[];
}

export const AUTHORITY_NOTICE =
  'Production data (Reltroner/reltroner-studio) is authoritative. Remodeling content (Reltroner/reltroner-studio-remodeling) is a proposal and is never a production fact. ' +
  'Production main is a source candidate, not proof of what is deployed. Findings are review candidates unless a deterministic rule proves a contradiction.';

function tally(findings: Finding[], key: (f: Finding) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of findings) out[key(f)] = (out[key(f)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function buildReportDocument(context: ReportContext, findings: readonly Finding[], layout: 'single' | 'consolidated'): ReportDocument {
  const sorted = [...findings].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (layout === 'single' && sorted.length !== 1) throw new Error('A single-finding report requires exactly one finding');
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    title: layout === 'single' ? `Forensic finding ${sorted[0]!.id}` : `Source drift report — ${sorted.length} findings`,
    layout,
    context,
    summary: {
      findings: sorted.length,
      by_classification: tally(sorted, (f) => f.classification),
      by_priority: tally(sorted, (f) => f.priority),
      by_review_status: tally(sorted, (f) => f.review_status),
    },
    authority_notice: AUTHORITY_NOTICE,
    findings: sorted,
  };
}

/** Human-readable value: absent ≠ null ≠ zero. */
export function displayValue(v: SideValue): string {
  if (!v.present) return '(absent)';
  if (v.value === null) return 'null (explicitly unassigned)';
  if (typeof v.value === 'string') return v.value;
  return JSON.stringify(v.value);
}

export function typeLabel(v: SideValue): string {
  return v.present ? (v.value_type ?? typeof v.value) : 'absent';
}

export function pinnedUrl(repository: string, commit: string, path: string, line?: number | null): string {
  return `https://github.com/${repository}/blob/${commit}/${path.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}` : ''}`;
}

export function safeFileStem(id: string): string {
  if (!/^[A-Z0-9][A-Z0-9-]{2,127}$/.test(id)) throw new Error('Unsafe report identifier');
  return id;
}
