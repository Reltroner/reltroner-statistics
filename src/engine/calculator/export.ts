/**
 * Calculator exports: JSON and CSV, built only from a validated result object on an explicit user
 * action. Nothing else of the session is read, nothing is uploaded, and both formats are a pure
 * function of the result, so the same result always exports the same bytes.
 */
import { canonicalJson, type CalcCell, type CalcResult, type SourceRef } from '../../domain/calculator.ts';
import { csvCell } from '../../export/render-text.ts';

export const CSV_HEADER = ['section', 'key', 'label', 'value', 'unit', 'status', 'owner', 'period', 'source_role', 'source_repository', 'source_commit_sha', 'source_path', 'source_pointer'] as const;

/** The complete result, unrounded. JSON.parse(resultToJson(r)) is deep-equal to r. */
export function resultToJson(result: CalcResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

/** RFC 4180 cell with the site's formula guard, extended to a leading line feed. Numbers stay numeric. */
function cell(value: unknown): string {
  return csvCell(typeof value === 'string' && /^[\n\u000b\u000c]/.test(value) ? `'${value}` : value);
}

type Row = Partial<Record<(typeof CSV_HEADER)[number], unknown>>;
const sourceColumns = (s: SourceRef | null): Row => (s ? { source_role: s.role, source_repository: s.repository, source_commit_sha: s.commit_sha, source_path: s.path, source_pointer: s.pointer } : {});

/**
 * One long table: metadata, inputs, assumptions, the result, summary, limitations, evidence and
 * every table cell, each with its unit, status, owner and pinned source where it has one.
 */
export function resultToCsv(result: CalcResult): string {
  const rows: Row[] = [];
  const meta = (key: string, value: unknown) => rows.push({ section: 'meta', key, value });
  meta('schema_version', result.schema_version);
  meta('calculation_id', result.calculation_id);
  meta('operation', result.operation);
  meta('formula_id', result.formula_id);
  meta('formula_version', result.formula_version);
  meta('formula_expression', result.formula_expression);
  meta('title', result.title);
  meta('denominator', result.denominator);
  meta('baseline_period', result.baseline_period);
  meta('horizon', result.horizon ? canonicalJson(result.horizon) : null);
  meta('status_reason', result.status_reason);
  meta('request', canonicalJson(result.request));
  rows.push({ section: 'meta', key: 'source', value: result.source?.url ?? null, ...sourceColumns(result.source), source_role: result.source_role });
  for (const i of result.inputs) rows.push({ section: 'input', key: i.key, label: i.label, value: i.value, unit: i.unit, status: i.status, owner: i.owner, period: i.period, ...sourceColumns(i.source) });
  result.assumptions.forEach((a, n) => rows.push({ section: 'assumption', key: String(n + 1), label: a.text, owner: a.owner }));
  rows.push({ section: 'result', key: 'result', label: result.result_label, value: result.result_value, unit: result.result_unit, status: result.result_status, ...sourceColumns(result.source), source_role: result.source_role });
  if (result.empirical_forecast) {
    const e = result.empirical_forecast;
    rows.push({ section: 'empirical_forecast', key: e.reason, label: `observed points ${e.observed_points}; required ${e.required_points}`, value: e.observed_points, status: e.status });
  }
  result.summary.forEach((s, n) => rows.push({ section: 'summary', key: String(n + 1), label: s.text, status: s.status, ...sourceColumns(s.source) }));
  result.limitations.forEach((l, n) => rows.push({ section: 'limitation', key: String(n + 1), label: l }));
  for (const e of result.evidence) rows.push({ section: 'evidence', key: e.criterion, label: e.text, status: e.state, ...sourceColumns(e.source) });
  for (const t of result.tables) {
    t.rows.forEach((r, n) => {
      for (const c of t.columns) rows.push({ section: `table:${t.id}`, key: `${n + 1}.${c.key}`, label: c.label, value: (r[c.key] ?? null) as CalcCell, unit: c.unit });
    });
  }
  return `${[CSV_HEADER.join(','), ...rows.map((r) => CSV_HEADER.map((c) => cell(r[c])).join(','))].join('\r\n')}\r\n`;
}

export function exportFilename(result: CalcResult, extension: 'json' | 'csv'): string {
  return `reltroner-calculator-${result.operation}-${result.calculation_id}.${extension}`;
}
