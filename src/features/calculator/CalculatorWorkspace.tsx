/**
 * /calculator island. It holds form state only: every number comes from evaluate() in
 * src/domain/calculator.ts, the engine the Statistics Assistant also calls, over the same public
 * evidence index. Nothing is stored between visits and nothing leaves the browser.
 */
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import type { AgentIndex } from '../../domain/assistant.ts';
import {
  CALC_MODES, DIMENSIONS, FORMULAS, LIMITS, PLANET_ID, RUBRIC, SCENARIO_INDICATORS, SCENARIO_NAMES, evaluate, modeOf, rubricEvidence, show,
  type AlternativeId, type CalcChart, type CalcMode, type CalcOutcome, type CalcRequest, type CalcResult, type CalcTable, type CriterionId, type Dimension, type FormulaId, type ScenarioIndicator, type ShareFormula, type SourceRef,
} from '../../domain/calculator.ts';
import { exportFilename, resultToCsv, resultToJson } from '../../engine/calculator/export.ts';
import { HANDOFF_PATH, sessionStore, takeHandoff, writeHandoff } from '../../engine/calculator/handoff.ts';
import { statusTone, tickValue } from '../../lib/format.ts';
import EChart from '../charts/EChart.tsx';
import { SYMBOLS, axisStyle, esc, tooltipStyle, type ChartTheme } from '../charts/theme.ts';
import { saveBytes } from '../reports/download.ts';

type CalcFormula = Exclude<FormulaId, 'weighted_rubric_score'>;
const CALC_FORMULAS = (Object.keys(FORMULAS) as FormulaId[]).filter((f): f is CalcFormula => f !== 'weighted_rubric_score');
const SHARE_DIMENSION: Readonly<Record<ShareFormula, Dimension>> = { population_x_ancestry_share: 'ancestry', population_x_habitat_share: 'habitat', land_area_x_footprint_share: 'surface' };
const isShare = (f: CalcFormula): f is ShareFormula => f in SHARE_DIMENSION;
const INDICATOR_LABEL: Readonly<Record<ScenarioIndicator, string>> = { population: 'Population', gdp_usd: 'Nominal GDP', gdp_per_capita: 'GDP per capita' };
const DIMENSION_LABEL: Readonly<Record<Dimension, string>> = { ancestry: 'Primary ancestry (production main)', habitat: 'Principal home habitats (remodeling main)', surface: 'Terrestrial surface footprint (remodeling main)' };
/** Plain arithmetic on numbers the user enters: field keys are the request members. */
const PLAIN_FIELDS: Readonly<Record<string, ReadonlyArray<{ key: string; label: string; hint: string }>>> = {
  percent_change: [{ key: 'base', label: 'Base value', hint: 'Must not be zero.' }, { key: 'next', label: 'New value', hint: '' }],
  percentage_point_difference: [{ key: 'old_pct', label: 'Old percent (%)', hint: '' }, { key: 'new_pct', label: 'New percent (%)', hint: 'The result is in percentage points, not percent.' }],
  compound_growth: [{ key: 'baseline', label: 'Baseline value', hint: '' }, { key: 'annual_rate_pct', label: 'Annual rate (% per year)', hint: `From ${LIMITS.RATE_MIN_PCT}% to ${LIMITS.RATE_MAX_PCT}%.` }, { key: 'years', label: 'Years', hint: `Whole years, 1 to ${LIMITS.MAX_PERIODS}.` }],
  annualized_rate: [{ key: 'initial', label: 'Initial value', hint: 'Greater than zero.' }, { key: 'final', label: 'Final value', hint: 'Greater than zero.' }, { key: 'years', label: 'Years', hint: `Whole years, 1 to ${LIMITS.MAX_PERIODS}.` }],
  conditional_backcast: [{ key: 'anchor', label: 'Anchor value', hint: 'The later, known value.' }, { key: 'annual_rate_pct', label: 'Assumed annual rate (% per year)', hint: `From ${LIMITS.RATE_MIN_PCT}% to ${LIMITS.RATE_MAX_PCT}%.` }, { key: 'years', label: 'Elapsed years', hint: `Whole years, 1 to ${LIMITS.MAX_PERIODS}.` }],
  scenario_difference: [{ key: 'a', label: 'Value a', hint: '' }, { key: 'b', label: 'Value b', hint: 'Both values must be in the same unit.' }],
};

interface Drafts {
  calculate: { formula: CalcFormula; entity: string; category: string; share: string; dimension: Dimension; shares: Record<string, string>; values: Record<string, string> };
  future: { entity: string; indicator: ScenarioIndicator; rate: string; horizon: string; label: string };
  backcast: { entity: string; indicator: ScenarioIndicator; target: string; rate: string; label: string };
  qualitative: { weights: Record<string, string>; scores: Record<string, Record<string, string>>; note: string };
  compare: { kind: 'scenarios' | 'sweep'; entity: string; indicator: ScenarioIndicator; horizon: string; labels: string[]; rates: string[]; min: string; max: string; steps: string };
}
const RELTRONLAND = 'country:reltronland';
/** No assumption is prefilled: rates, targets, scores and what-if shares start empty. Weights start equal and stay editable. */
const initialDrafts = (): Drafts => ({
  calculate: { formula: 'population_x_habitat_share', entity: RELTRONLAND, category: 'underground', share: '', dimension: 'habitat', shares: {}, values: {} },
  future: { entity: RELTRONLAND, indicator: 'population', rate: '', horizon: '100', label: SCENARIO_NAMES[1] },
  backcast: { entity: 'country:depcutland', indicator: 'population', target: '', rate: '', label: 'Backcast hypothesis' },
  qualitative: { weights: Object.fromEntries(RUBRIC.criteria.map((c) => [c.id, '1'])), scores: Object.fromEntries(RUBRIC.alternatives.map((a) => [a.id, {}])), note: '' },
  compare: { kind: 'scenarios', entity: RELTRONLAND, indicator: 'population', horizon: '50', labels: [...SCENARIO_NAMES], rates: ['', '', ''], min: '', max: '', steps: '11' },
});

class FieldError extends Error {
  field: string;
  constructor(field: string, message: string) { super(message); this.field = field; }
}
function parse(text: string, field: string, what: string): number {
  const t = text.trim().replace(',', '.').replace('−', '-').replace(/\s*(%|bac)$/i, '');
  if (!t) throw new FieldError(field, `Enter ${what}.`);
  const v = Number(t);
  if (!Number.isFinite(v)) throw new FieldError(field, `${what[0]!.toUpperCase()}${what.slice(1)} must be a number.`);
  return v;
}

/** Form text to a typed request. Range and domain rules stay in the engine. */
function toRequest(mode: CalcMode, d: Drafts): CalcRequest {
  if (mode === 'calculate') {
    const c = d.calculate;
    if (isShare(c.formula)) return { operation: 'calculate', formula: c.formula, entity_id: c.entity, category: c.category, ...(c.share.trim() ? { share_pct: parse(c.share, 'share', 'a what-if share in percent') } : {}) };
    if (c.formula === 'gdp_per_capita' || c.formula === 'share_of_planetary_gdp') return { operation: 'calculate', formula: c.formula, entity_id: c.entity };
    if (c.formula === 'weighted_composition') {
      const shares = Object.fromEntries(DIMENSIONS[c.dimension].categories.map((k) => [k.key, parse(c.shares[k.key] ?? '', `share-${k.key}`, `a share for ${k.label}`)]));
      return { operation: 'calculate', formula: 'weighted_composition', entity_id: c.entity, dimension: c.dimension, shares };
    }
    const values = Object.fromEntries(PLAIN_FIELDS[c.formula]!.map((f) => [f.key, parse(c.values[f.key] ?? '', `value-${f.key}`, f.label.toLowerCase())]));
    return { operation: 'calculate', formula: c.formula, ...values } as CalcRequest;
  }
  if (mode === 'future') {
    const f = d.future;
    return { operation: 'projectScenario', entity_id: f.entity, indicator: f.indicator, annual_rate_pct: parse(f.rate, 'rate', 'your assumed annual rate in percent'), horizon_years: parse(f.horizon, 'horizon', 'a horizon in years'), label: f.label };
  }
  if (mode === 'backcast') {
    const b = d.backcast;
    return { operation: 'reconstructScenario', entity_id: b.entity, indicator: b.indicator, target_bac: parse(b.target, 'target', 'a target BAC year'), annual_rate_pct: parse(b.rate, 'rate', 'your assumed annual rate in percent'), label: b.label };
  }
  if (mode === 'compare') {
    const c = d.compare;
    const horizon = parse(c.horizon, 'horizon', 'a horizon in years');
    if (c.kind === 'sweep') {
      return { operation: 'analyzeSensitivity', entity_id: c.entity, indicator: c.indicator, horizon_years: horizon, rate_min_pct: parse(c.min, 'min', 'the lowest rate in percent'), rate_max_pct: parse(c.max, 'max', 'the highest rate in percent'), steps: parse(c.steps, 'steps', 'the number of samples') };
    }
    const scenarios = c.rates.map((r, i) => ({ r, i })).filter(({ r }) => r.trim()).map(({ r, i }) => ({ label: c.labels[i] ?? '', annual_rate_pct: parse(r, `rate-${i}`, 'an annual rate in percent') }));
    if (scenarios.length < LIMITS.MIN_SCENARIOS) throw new FieldError('rate-0', `Enter an assumed annual rate for at least ${LIMITS.MIN_SCENARIOS} scenarios.`);
    return { operation: 'compareScenarios', entity_id: c.entity, indicator: c.indicator, horizon_years: horizon, scenarios };
  }
  const q = d.qualitative;
  const weights = Object.fromEntries(RUBRIC.criteria.map((c) => [c.id, parse(q.weights[c.id] ?? '', `weight-${c.id}`, `a weight for ${c.label}`)])) as Record<CriterionId, number>;
  const scores = Object.fromEntries(RUBRIC.alternatives.map((a) => [a.id, Object.fromEntries(RUBRIC.criteria.filter((c) => q.scores[a.id]?.[c.id]).map((c) => [c.id, Number(q.scores[a.id]![c.id])]))])) as Record<AlternativeId, Partial<Record<CriterionId, number>>>;
  return { operation: 'evaluateQualitativeScenario', weights, scores, ...(q.note.trim() ? { note: q.note.trim() } : {}) };
}

/** A validated hand-off request back into form text. */
function fromRequest(r: CalcRequest, d: Drafts): Drafts {
  const text = (v: number) => String(v);
  switch (r.operation) {
    case 'calculate': {
      const c = { ...d.calculate, formula: r.formula as CalcFormula };
      if ('category' in r) return { ...d, calculate: { ...c, entity: r.entity_id, category: r.category, share: r.share_pct === undefined ? '' : text(r.share_pct) } };
      if (r.formula === 'weighted_composition') return { ...d, calculate: { ...c, entity: r.entity_id, dimension: r.dimension, shares: Object.fromEntries(Object.entries(r.shares).map(([k, v]) => [k, text(v)])) } };
      if ('entity_id' in r) return { ...d, calculate: { ...c, entity: r.entity_id } };
      return { ...d, calculate: { ...c, values: Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, text(v as number)])) } };
    }
    case 'projectScenario': return { ...d, future: { entity: r.entity_id, indicator: r.indicator, rate: text(r.annual_rate_pct), horizon: text(r.horizon_years), label: r.label } };
    case 'reconstructScenario': return { ...d, backcast: { entity: r.entity_id, indicator: r.indicator, target: text(r.target_bac), rate: text(r.annual_rate_pct), label: r.label } };
    case 'compareScenarios': return { ...d, compare: { ...d.compare, kind: 'scenarios', entity: r.entity_id, indicator: r.indicator, horizon: text(r.horizon_years), labels: SCENARIO_NAMES.map((n, i) => r.scenarios[i]?.label ?? n), rates: SCENARIO_NAMES.map((_, i) => (r.scenarios[i] ? text(r.scenarios[i]!.annual_rate_pct) : '')) } };
    case 'analyzeSensitivity': return { ...d, compare: { ...d.compare, kind: 'sweep', entity: r.entity_id, indicator: r.indicator, horizon: text(r.horizon_years), min: text(r.rate_min_pct), max: text(r.rate_max_pct), steps: text(r.steps) } };
    case 'evaluateQualitativeScenario':
      return { ...d, qualitative: { weights: Object.fromEntries(Object.entries(r.weights).map(([k, v]) => [k, text(v)])), scores: Object.fromEntries(RUBRIC.alternatives.map((a) => [a.id, Object.fromEntries(Object.entries(r.scores[a.id] ?? {}).map(([k, v]) => [k, text(v as number)]))])), note: r.note ?? '' } };
  }
}

const sourceRows = (index: AgentIndex, dimension: Dimension, entity: string) => {
  if (dimension === 'ancestry') { const c = index.composition.ancestry.countries.find((x) => x.id === entity); return c?.status === 'ASSIGNED' ? c.rows : null; }
  const s = index.composition.spatial.countries.find((x) => x.id === entity);
  if (!s) return null;
  return dimension === 'habitat' ? (s.habitat_status === 'ASSIGNED' ? s.habitats : null) : s.surface_status === 'ASSIGNED' ? s.surface : null;
};
function entitiesFor(index: AgentIndex, source: Dimension | string): Array<{ id: string; name: string }> {
  if (source === 'ancestry') return index.composition.ancestry.countries.map((c) => ({ id: c.id, name: c.status === 'ASSIGNED' ? c.name : `${c.name} — not assigned` }));
  if (source === 'habitat' || source === 'surface') return index.composition.spatial.countries.map((c) => ({ id: c.id, name: sourceRows(index, source, c.id) ? c.name : `${c.name} — not assigned` }));
  const facts = index.facts.filter((f) => f.indicator === source);
  return [...facts.filter((f) => f.entity_id !== PLANET_ID), ...facts.filter((f) => f.entity_id === PLANET_ID)].map((f) => ({ id: f.entity_id, name: f.entity }));
}

// ---------------------------------------------------------------- small presentational pieces
function Field({ id, label, hint, error, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-semibold text-ink">{label}</label>
      {children}
      {hint ? <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-3">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="mt-1.5 text-xs font-semibold text-ink" data-field-error>{error}</p> : null}
    </div>
  );
}
function Status({ status }: { status: string }) {
  return <span className="rs-badge" data-tone={statusTone(status)}>{status}</span>;
}
function SourceLink({ source, children }: { source: SourceRef; children?: ReactNode }) {
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" data-pinned-source>
      {children ?? `${source.role === 'production' ? 'Production main' : 'Remodeling main'} · ${source.commit_sha.slice(0, 12)}`}<span className="rs-sr"> (pinned source, opens in a new tab)</span>
    </a>
  );
}
const cellText = (value: number | string | null | undefined) => (value === null || value === undefined ? '—' : typeof value === 'number' ? show(value) : value);

function ResultTable({ table }: { table: CalcTable }) {
  const body = (
    <div className="rs-table-wrap mt-3" tabIndex={0} role="region" aria-label={table.caption} data-table={table.id}>
      <table className="rs-table">
        <caption className="rs-sr">{table.caption}</caption>
        <thead><tr>{table.columns.map((c) => <th key={c.key} scope="col" className={c.unit ? 'num' : undefined}>{c.label}{c.unit ? ` (${c.unit})` : ''}</th>)}</tr></thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>{table.columns.map((c, j) => (j === 0
              ? <th key={c.key} scope="row">{cellText(r[c.key])}</th>
              : <td key={c.key} className={typeof r[c.key] === 'number' ? 'num' : undefined} data-col={c.key}>{cellText(r[c.key])}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (table.rows.length <= 12) return <div className="mt-5"><h3 className="rs-h3">{table.caption}</h3>{body}</div>;
  return (
    <details className="mt-5 rounded-xl border border-line p-4" data-table-details={table.id}>
      <summary className="cursor-pointer font-semibold text-ink">{table.caption} · show all {table.rows.length} rows</summary>
      {body}
    </details>
  );
}

function ResultChart({ chart, title }: { chart: CalcChart; title: string }) {
  const tick = (v: number) => (chart.x_kind === 'BAC_AXIS' ? (v === 0 ? 'Year 0' : `${-v} BAC`) : chart.x_kind === 'RATE_PCT' ? `${Number(v.toPrecision(6))}%` : `+${v}`);
  const build = (t: ChartTheme) => {
    const ax = axisStyle(t);
    const modeled = chart.series.filter((s) => s.kind === 'MODELED');
    return {
      grid: { left: 8, right: 22, top: 56, bottom: 12, containLabel: true },
      legend: { top: 0, left: 0, type: 'scroll', textStyle: { color: t.ink2, fontSize: 12 }, itemWidth: 22, itemHeight: 10 },
      tooltip: { ...tooltipStyle(t), trigger: 'item', formatter: (p: { seriesName: string; data: { label: string; value: [number, number] } }) => `<strong>${esc(p.seriesName)}</strong><br/>${esc(p.data.label)}: ${esc(show(p.data.value[1], chart.unit))}` },
      xAxis: { type: 'value', min: 'dataMin', max: 'dataMax', ...ax, axisLabel: { ...ax.axisLabel, formatter: tick, hideOverlap: true } },
      yAxis: { type: 'value', scale: true, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => tickValue(v, chart.unit.startsWith('USD') ? 'usd' : 'number') } },
      series: chart.series.map((s) => {
        const i = modeled.indexOf(s);
        const data = s.points.map((p) => ({ value: [p.x, p.value], label: p.x_label }));
        // Modeled curves are lines (hue plus dash pattern); source values are separate diamond markers.
        return s.kind === 'MODELED'
          ? { id: s.id, name: s.label, type: 'line', data, showSymbol: s.points.length <= 16, symbol: SYMBOLS[i % SYMBOLS.length], symbolSize: 7, lineStyle: { width: 2, color: t.series[i % 3], type: (['solid', 'dashed', 'dotted'] as const)[i % 3] }, itemStyle: { color: t.series[i % 3] } }
          : { id: s.id, name: s.label, type: 'scatter', data, symbol: 'diamond', symbolSize: 15, z: 5, itemStyle: { color: t.ink, borderColor: t.surface, borderWidth: 2 } };
      }),
    };
  };
  return (
    <figure className="mt-5 min-w-0" data-result-chart={chart.x_kind}>
      <figcaption className="text-sm text-ink-2"><strong className="text-ink">{title}</strong> · vertical: {chart.y_title} · horizontal: {chart.x_title}. Lines are modeled scenario values; diamonds are source values.</figcaption>
      <div className="mt-3"><EChart build={build} height={320} label={`${title}. ${chart.series.length} series; every plotted value is in the table that follows.`} deps={[chart]} /></div>
    </figure>
  );
}

function ResultView({ result, onExplain, fallback }: { result: CalcResult; onExplain: (e: MouseEvent<HTMLAnchorElement>) => void; fallback: boolean }) {
  const download = (extension: 'json' | 'csv') => saveBytes(new TextEncoder().encode(extension === 'json' ? resultToJson(result) : resultToCsv(result)), exportFilename(result, extension), extension === 'json' ? 'application/json' : 'text/csv');
  return (
    <section aria-labelledby="calc-result-h" className="rs-card p-5 sm:p-7" data-calc-result={result.operation} data-result-status={result.result_status} data-calculation-id={result.calculation_id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="calc-result-h" className="rs-h2 min-w-0">{result.title}</h2>
        <Status status={result.result_status} />
      </div>
      <p className="mt-4 text-sm text-ink-2" data-result-label>{result.result_label}</p>
      <p className="mt-1 break-words text-[clamp(1.6rem,4.5vw,2.4rem)] font-[760] text-ink" data-result-value={result.result_value ?? ''}>{result.result_value === null ? 'Not computed' : show(result.result_value, result.result_unit)}</p>
      <p className="mt-2 text-sm text-ink-2">{result.status_reason}</p>

      <ol className="mt-5 space-y-3" aria-label="Result statements">
        {result.summary.map((s, i) => (
          <li key={i} className="rounded-xl border border-line p-3" data-summary-status={s.status}>
            <div className="flex flex-wrap items-center gap-2"><Status status={s.status} />{s.source && <span className="text-xs"><SourceLink source={s.source} /></span>}</div>
            <p className="mt-2 break-words text-sm leading-7 text-ink-2">{s.text}</p>
          </li>
        ))}
      </ol>

      <h3 className="rs-h3 mt-6">Method</h3>
      <p className="mt-2 break-words text-sm text-ink-2" data-formula={result.formula_id}>
        <span className="font-mono text-[0.82rem] text-ink">{result.formula_expression}</span>
        <span className="block text-xs text-ink-3">Formula {result.formula_id} · version {result.formula_version}{result.denominator ? ` · denominator: ${result.denominator}` : ''}{result.baseline_period ? ` · baseline: ${result.baseline_period}` : ''}
          {result.horizon ? ` · ${result.horizon.kind === 'BAC' ? `target ${result.horizon.target_label}, ${result.horizon.elapsed_years} years before Year 0` : `${result.horizon.years} elapsed years after Year 0`}` : ''}</span>
      </p>
      {result.source
        ? <p className="mt-3 break-words text-sm text-ink-2">Source: <SourceLink source={result.source}>{result.source.repository} at {result.source.commit_sha.slice(0, 12)}</SourceLink> <span className="break-all font-mono text-xs text-ink-3">{result.source.path}{result.source.pointer ? ` · ${result.source.pointer}` : ''}</span></p>
        : <p className="mt-3 text-sm text-ink-2" data-user-data>Source: none. Every input was entered by you.</p>}

      {result.assumptions.length > 0 && (
        <>
          <h3 className="rs-h3 mt-6">Assumptions</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">{result.assumptions.map((a, i) => <li key={i} className="break-words">{a.text} <span className="text-xs text-ink-3">({a.owner === 'USER_SUPPLIED' ? 'yours' : 'source'})</span></li>)}</ul>
        </>
      )}

      <ResultTable table={{
        id: 'inputs', caption: 'Inputs and their provenance',
        columns: [{ key: 'label', label: 'Input', unit: '' }, { key: 'value', label: 'Value', unit: '' }, { key: 'owner', label: 'Supplied by', unit: '' }, { key: 'status', label: 'Status', unit: '' }, { key: 'period', label: 'Period', unit: '' }],
        rows: result.inputs.slice(0, 12).map((i) => ({ label: i.label, value: typeof i.value === 'number' ? show(i.value, i.unit) : `${i.value}${i.unit ? ` ${i.unit}` : ''}`, owner: i.owner === 'SOURCE_ASSIGNED' ? 'Source' : 'You', status: i.status, period: i.period ?? '—' })),
      }} />
      {result.inputs.length > 12 && <p className="mt-2 text-xs text-ink-3">{result.inputs.length - 12} further inputs (your scores) are in the decision matrix and in both exports.</p>}

      {result.chart && <ResultChart chart={result.chart} title={result.title} />}
      {result.tables.map((t) => <ResultTable key={t.id} table={t} />)}

      {result.evidence.length > 0 && (
        <>
          <h3 className="rs-h3 mt-6">Source passages by criterion</h3>
          <ul className="mt-2 space-y-2 text-sm text-ink-2">
            {result.evidence.map((e) => <li key={e.criterion} className="break-words" data-evidence={e.state}><strong className="text-ink">{e.label}:</strong> {e.text} {e.source ? <SourceLink source={e.source} /> : <Status status="INSUFFICIENT_DATA" />}</li>)}
          </ul>
        </>
      )}

      <h3 className="rs-h3 mt-6">Limitations</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2" data-limitations>{result.limitations.map((l, i) => <li key={i} className="break-words">{l}</li>)}</ul>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="rs-button rs-button-secondary" onClick={() => download('json')}>Export JSON</button>
        <button type="button" className="rs-button rs-button-secondary" onClick={() => download('csv')}>Export CSV</button>
        <a className="rs-button rs-button-secondary no-underline" href={HANDOFF_PATH.assistant} onClick={onExplain}>Explain with Assistant</a>
      </div>
      <p className="mt-2 text-xs text-ink-3">Exports hold this result only, with full precision, and are created in your browser. Nothing is uploaded.</p>
      {fallback && <p role="status" className="rs-notice mt-4" data-handoff-fallback>Session storage is unavailable in this browser, so the result cannot be handed to the Assistant. The statements, method and limitations above are the same deterministic explanation the Assistant would show.</p>}
    </section>
  );
}

// ---------------------------------------------------------------- the workspace
type Phase = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; index: AgentIndex };
const noOutcomes = (): Record<CalcMode, CalcOutcome | null> => ({ calculate: null, future: null, backcast: null, qualitative: null, compare: null });

export default function CalculatorWorkspace() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [mode, setMode] = useState<CalcMode>('calculate');
  const [drafts, setDrafts] = useState<Drafts>(initialDrafts);
  const [outcomes, setOutcomes] = useState(noOutcomes);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/data/assistant-index.json', { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const index = (await response.json()) as AgentIndex;
        if (index.schema_version !== 'reltroner-agent-index.v2') throw new Error('unexpected index contract');
        if (cancelled) return;
        const request = takeHandoff(sessionStore(), 'calculator', Date.now());
        const hash = window.location.hash.slice(1);
        const start = request ?? toRequest('calculate', initialDrafts());
        const startMode = request ? modeOf(request) : CALC_MODES.some((m) => m.id === hash) ? (hash as CalcMode) : 'calculate';
        if (request) {
          setDrafts((d) => fromRequest(request, d));
          setNotice('Inputs received from the Assistant and recomputed here by the shared engine.');
        } else if (hash === 'handoff-unavailable') setNotice('The Assistant could not carry the inputs over because session storage is unavailable. Enter them below.');
        setOutcomes({ ...noOutcomes(), [modeOf(start)]: evaluate(index, start) });
        setMode(startMode);
        setPhase({ kind: 'ready', index });
      } catch (e) {
        if (!cancelled) setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'unknown error' });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const index = phase.kind === 'ready' ? phase.index : null;
  const evidence = useMemo(() => (index ? rubricEvidence(index) : []), [index]);

  /** Any edit clears the result of that mode, so a shown result always matches the form above it. */
  function edit<M extends CalcMode>(m: M, patch: Partial<Drafts[M]>) {
    setDrafts((d) => ({ ...d, [m]: { ...d[m], ...patch } }));
    setOutcomes((o) => (o[m] ? { ...o, [m]: null } : o));
    setError(null);
    setFallback(false);
    setNotice('');
  }
  function run() {
    if (!index) return;
    try {
      const request = toRequest(mode, drafts);
      setError(null);
      setFallback(false);
      setOutcomes((o) => ({ ...o, [mode]: evaluate(index, request) }));
    } catch (e) {
      if (!(e instanceof FieldError)) throw e;
      setError({ field: e.field, message: e.message });
      setOutcomes((o) => ({ ...o, [mode]: null }));
      document.getElementById(`calc-${mode}-${e.field}`)?.focus();
    }
  }
  function reset() {
    setDrafts((d) => ({ ...d, [mode]: initialDrafts()[mode] }));
    setOutcomes((o) => ({ ...o, [mode]: mode === 'calculate' && index ? evaluate(index, toRequest('calculate', initialDrafts())) : null }));
    setError(null);
    setFallback(false);
    setNotice('');
  }
  function compareFromFuture() {
    const f = drafts.future;
    setDrafts((d) => ({ ...d, compare: { ...d.compare, kind: 'scenarios', entity: f.entity, indicator: f.indicator, horizon: f.horizon, rates: ['', f.rate, ''] } }));
    setOutcomes((o) => ({ ...o, compare: null }));
    setError(null);
    setMode('compare');
  }
  function explain(e: MouseEvent<HTMLAnchorElement>) {
    const current = outcomes[mode];
    if (!current?.ok || writeHandoff(sessionStore(), 'assistant', current.result.request, Date.now())) return;
    e.preventDefault();
    setFallback(true);
  }
  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const at = CALC_MODES.findIndex((m) => m.id === mode);
    const next = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? CALC_MODES.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const target = CALC_MODES[(next + CALC_MODES.length) % CALC_MODES.length]!;
    setMode(target.id);
    setError(null);
    document.getElementById(`calc-tab-${target.id}`)?.focus();
  }

  if (!index) {
    return phase.kind === 'error'
      ? <p role="alert" className="rs-notice" data-tone="caution" data-calc-state="error">The published evidence index could not be loaded ({phase.message}). No calculation is available without its pinned source values; reload the page to try again.</p>
      : <p role="status" className="rs-notice" data-calc-state="loading">Loading the published evidence index…</p>;
  }

  const id = (field: string) => `calc-${mode}-${field}`;
  const err = (field: string) => (error?.field === field ? error.message : null);
  const input = (field: string, value: string, onChange: (v: string) => void, placeholder = '', numeric = true) => (
    <input id={id(field)} type="text" inputMode={numeric ? 'decimal' : 'text'} autoComplete="off" className="rs-input mt-2 w-full" value={value} placeholder={placeholder}
      aria-invalid={error?.field === field || undefined} aria-describedby={`${id(field)}-hint${error?.field === field ? ` ${id(field)}-error` : ''}`} onChange={(e) => onChange(e.target.value)} />
  );
  const select = (field: string, value: string, options: Array<{ id: string; name: string }>, onChange: (v: string) => void) => (
    <select id={id(field)} className="rs-select mt-2 w-full" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
  );
  const baselineHint = (entity: string, indicator: string) => {
    const f = index.facts.find((x) => x.entity_id === entity && x.indicator === indicator);
    return f ? <>Year 0 source value: <strong className="text-ink-2">{show(f.value, f.unit)}</strong> · {f.status} · production main at {f.source.commit_sha.slice(0, 12)}</> : 'No assigned Year 0 value in production main (unknown, not zero).';
  };
  const scenarioBase = <M extends 'future' | 'backcast' | 'compare'>(m: M) => {
    const d = drafts[m] as Drafts['future'];
    const entities = entitiesFor(index, d.indicator);
    return (
      <>
        <Field id={id('indicator')} label="Indicator" hint="Compound scenarios start from a positive Year 0 magnitude.">
          {select('indicator', d.indicator, SCENARIO_INDICATORS.map((i) => ({ id: i, name: INDICATOR_LABEL[i] })), (v) => edit(m, { indicator: v as ScenarioIndicator, entity: entitiesFor(index, v).some((e) => e.id === d.entity) ? d.entity : entitiesFor(index, v)[0]?.id ?? d.entity } as Partial<Drafts[M]>))}
        </Field>
        <Field id={id('entity')} label="Nation or planet" hint={baselineHint(d.entity, d.indicator)}>
          {select('entity', d.entity, entities, (v) => edit(m, { entity: v } as Partial<Drafts[M]>))}
        </Field>
      </>
    );
  };
  const c = drafts.calculate;
  const calcDimension = isShare(c.formula) ? SHARE_DIMENSION[c.formula] : c.dimension;
  const calcRows = sourceRows(index, calcDimension, c.entity);
  const setFormula = (formula: CalcFormula) => {
    const dimension = isShare(formula) ? SHARE_DIMENSION[formula] : c.dimension;
    const list = entitiesFor(index, isShare(formula) || formula === 'weighted_composition' ? dimension : 'gdp_usd');
    const entity = list.some((e) => e.id === c.entity) ? c.entity : list[0]?.id ?? c.entity;
    edit('calculate', { formula, dimension, entity, category: DIMENSIONS[dimension].categories[0]!.key, share: '', shares: Object.fromEntries((sourceRows(index, dimension, entity) ?? []).map((r) => [r.key, String(r.pct)])) });
  };
  const setComposition = (dimension: Dimension, entity: string) => {
    const list = entitiesFor(index, dimension);
    const picked = list.some((e) => e.id === entity) ? entity : list[0]?.id ?? entity;
    edit('calculate', { dimension, entity: picked, shares: Object.fromEntries((sourceRows(index, dimension, picked) ?? []).map((r) => [r.key, String(r.pct)])) });
  };
  const outcome = outcomes[mode];
  const submitLabel = mode === 'calculate' ? 'Calculate' : 'Run scenario';
  const sourceShare = calcRows?.find((r) => r.key === c.category);

  return (
    <div className="space-y-6" data-calculator>
      <div role="tablist" aria-label="Calculator mode" className="flex flex-wrap gap-1 rounded-xl border border-line bg-inset p-1">
        {CALC_MODES.map((m) => (
          <button key={m.id} type="button" role="tab" id={`calc-tab-${m.id}`} aria-selected={mode === m.id} aria-controls="calc-panel" tabIndex={mode === m.id ? 0 : -1} onKeyDown={onTabKey}
            onClick={() => { setMode(m.id); setError(null); }}
            className={`min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === m.id ? 'bg-surface-2 text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}>
            {m.label}
          </button>
        ))}
      </div>
      {notice && <p role="status" className="rs-notice" data-calc-notice>{notice}</p>}

      <form id="calc-panel" role="tabpanel" aria-labelledby={`calc-tab-${mode}`} className="rs-card space-y-5 p-5 sm:p-7" noValidate onSubmit={(e) => { e.preventDefault(); run(); }} data-calc-mode={mode}>
        <p className="text-sm text-ink-2">{{
          calculate: 'Source-backed arithmetic on Year 0 values. A value you change yourself turns the result into a scenario.',
          future: 'A conditional projection from a Year 0 source value at an annual rate you assume. It is not a forecast.',
          backcast: 'A conditional hypothesis about the past: the Year 0 source value divided back at an annual rate you assume. It is never a historical observation.',
          qualitative: `${RUBRIC.premise} Score three hypotheses on seven criteria. The result is a decision aid, not a probability.`,
          compare: 'Compare two or three named scenarios, or sweep a range of annual rates. Ranges are scenario ranges, not confidence intervals.',
        }[mode]}</p>

        {mode === 'calculate' && (
          <div className="grid gap-5 md:grid-cols-2">
            <Field id={id('formula')} label="Formula" hint={<span className="font-mono">{FORMULAS[c.formula].expression}</span>}>
              {select('formula', c.formula, CALC_FORMULAS.map((f) => ({ id: f, name: FORMULAS[f].label })), (v) => setFormula(v as CalcFormula))}
            </Field>
            {isShare(c.formula) && (
              <>
                <Field id={id('entity')} label="Nation" hint={`Source role: ${calcDimension === 'ancestry' ? 'production main (canon)' : 'remodeling main (proposed, not production canon)'} · Year 0`}>
                  {select('entity', c.entity, entitiesFor(index, calcDimension), (v) => edit('calculate', { entity: v, share: '' }))}
                </Field>
                <Field id={id('category')} label="Category" hint={sourceShare ? `Source share: ${show(sourceShare.pct, '%')}` : 'Not assigned for this nation (unknown, not zero).'}>
                  {select('category', c.category, DIMENSIONS[calcDimension].categories.map((k) => ({ id: k.key, name: k.label })), (v) => edit('calculate', { category: v, share: '' }))}
                </Field>
                <Field id={id('share')} label="What-if share (%), optional" hint="Leave empty to use the source share. A value here makes the result a SCENARIO and recomputes this one category only." error={err('share')}>
                  {input('share', c.share, (v) => edit('calculate', { share: v }), sourceShare ? `source: ${sourceShare.pct}` : '')}
                </Field>
              </>
            )}
            {(c.formula === 'gdp_per_capita' || c.formula === 'share_of_planetary_gdp') && (
              <Field id={id('entity')} label="Nation or planet" hint={baselineHint(c.entity, 'gdp_usd')}>
                {select('entity', c.entity, entitiesFor(index, 'gdp_usd'), (v) => edit('calculate', { entity: v }))}
              </Field>
            )}
            {c.formula === 'weighted_composition' && (
              <>
                <Field id={id('dimension')} label="Composition" hint="Land-area and resident denominators are never mixed.">
                  {select('dimension', c.dimension, (Object.keys(DIMENSIONS) as Dimension[]).map((d) => ({ id: d, name: DIMENSION_LABEL[d] })), (v) => setComposition(v as Dimension, c.entity))}
                </Field>
                <Field id={id('entity')} label="Nation" hint="Every share must be entered; together they must total 100%.">
                  {select('entity', c.entity, entitiesFor(index, c.dimension), (v) => setComposition(c.dimension, v))}
                </Field>
                {DIMENSIONS[c.dimension].categories.map((k) => {
                  const src = calcRows?.find((r) => r.key === k.key);
                  return (
                    <Field key={k.key} id={id(`share-${k.key}`)} label={`${k.label} (%)`} hint={src ? `Source share: ${show(src.pct, '%')}` : 'Source share not assigned.'} error={err(`share-${k.key}`)}>
                      {input(`share-${k.key}`, c.shares[k.key] ?? '', (v) => edit('calculate', { shares: { ...c.shares, [k.key]: v } }))}
                    </Field>
                  );
                })}
              </>
            )}
            {PLAIN_FIELDS[c.formula]?.map((f) => (
              <Field key={f.key} id={id(`value-${f.key}`)} label={f.label} hint={f.hint || 'Your own number; no source value is used.'} error={err(`value-${f.key}`)}>
                {input(`value-${f.key}`, c.values[f.key] ?? '', (v) => edit('calculate', { values: { ...c.values, [f.key]: v } }))}
              </Field>
            ))}
          </div>
        )}

        {mode === 'future' && (
          <div className="grid gap-5 md:grid-cols-2">
            {scenarioBase('future')}
            <Field id={id('rate')} label="Your assumed annual rate (% per year)" hint={`Your assumption, from ${LIMITS.RATE_MIN_PCT}% to ${LIMITS.RATE_MAX_PCT}%. No source growth rate is loaded.`} error={err('rate')}>
              {input('rate', drafts.future.rate, (v) => edit('future', { rate: v }), 'e.g. 1')}
            </Field>
            <Field id={id('horizon')} label="Horizon (years after Year 0)" hint={`Whole years, 1 to ${LIMITS.MAX_PERIODS}. Elapsed years only; no future calendar is implied.`} error={err('horizon')}>
              {input('horizon', drafts.future.horizon, (v) => edit('future', { horizon: v }))}
            </Field>
            <Field id={id('label')} label="Scenario label" hint={`Up to ${LIMITS.MAX_LABEL} characters. A name carries no probability.`}>
              {input('label', drafts.future.label, (v) => edit('future', { label: v }), '', false)}
            </Field>
          </div>
        )}

        {mode === 'backcast' && (
          <div className="grid gap-5 md:grid-cols-2">
            {scenarioBase('backcast')}
            <Field id={id('target')} label="Target year (BAC)" hint={`A whole BAC year older than Year 0, at most ${LIMITS.MAX_PERIODS} BAC. A higher BAC year is older; BAC is not Earth BCE.`} error={err('target')}>
              {input('target', drafts.backcast.target, (v) => edit('backcast', { target: v }), 'e.g. 300')}
            </Field>
            <Field id={id('rate')} label="Your assumed annual rate (% per year)" hint="Your assumption about growth between the target year and Year 0. No source rate is loaded." error={err('rate')}>
              {input('rate', drafts.backcast.rate, (v) => edit('backcast', { rate: v }), 'e.g. 0.4')}
            </Field>
            <Field id={id('label')} label="Scenario label" hint={`Up to ${LIMITS.MAX_LABEL} characters.`}>
              {input('label', drafts.backcast.label, (v) => edit('backcast', { label: v }), '', false)}
            </Field>
          </div>
        )}

        {mode === 'compare' && (
          <div className="grid gap-5 md:grid-cols-2">
            <fieldset className="min-w-0 md:col-span-2">
              <legend className="mb-2 text-sm font-semibold text-ink">Comparison</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {([['scenarios', 'Named scenarios (two or three)'], ['sweep', 'Rate sweep (sensitivity)']] as const).map(([k, label]) => (
                  <label key={k} className="inline-flex items-center gap-2 text-sm text-ink-2"><input type="radio" name="calc-compare-kind" checked={drafts.compare.kind === k} onChange={() => edit('compare', { kind: k })} />{label}</label>
                ))}
              </div>
            </fieldset>
            {scenarioBase('compare')}
            <Field id={id('horizon')} label="Horizon (years after Year 0)" hint={`Whole years, 1 to ${LIMITS.MAX_PERIODS}.`} error={err('horizon')}>
              {input('horizon', drafts.compare.horizon, (v) => edit('compare', { horizon: v }))}
            </Field>
            {drafts.compare.kind === 'scenarios' ? SCENARIO_NAMES.map((name, i) => (
              <div key={name} className="grid min-w-0 gap-3 rounded-xl border border-line p-4 sm:grid-cols-2 md:col-span-2">
                <Field id={id(`label-${i}`)} label={`Scenario ${i + 1} label`}>
                  {input(`label-${i}`, drafts.compare.labels[i] ?? '', (v) => edit('compare', { labels: drafts.compare.labels.map((l, j) => (j === i ? v : l)) }), '', false)}
                </Field>
                <Field id={id(`rate-${i}`)} label={`Scenario ${i + 1} annual rate (% per year)`} hint={i === 2 ? 'Optional: leave empty to compare two scenarios.' : 'Your assumption.'} error={err(`rate-${i}`)}>
                  {input(`rate-${i}`, drafts.compare.rates[i] ?? '', (v) => edit('compare', { rates: drafts.compare.rates.map((r, j) => (j === i ? v : r)) }), ['e.g. 0.5', 'e.g. 1', 'e.g. 2'][i])}
                </Field>
              </div>
            )) : (
              <>
                <Field id={id('min')} label="Lowest annual rate (% per year)" hint="Your assumption. Sampled exactly." error={err('min')}>{input('min', drafts.compare.min, (v) => edit('compare', { min: v }), 'e.g. 0')}</Field>
                <Field id={id('max')} label="Highest annual rate (% per year)" hint="Your assumption. Sampled exactly." error={err('max')}>{input('max', drafts.compare.max, (v) => edit('compare', { max: v }), 'e.g. 2')}</Field>
                <Field id={id('steps')} label="Samples" hint={`Evenly spaced rates, ${LIMITS.SWEEP_MIN_STEPS} to ${LIMITS.SWEEP_MAX_STEPS}.`} error={err('steps')}>{input('steps', drafts.compare.steps, (v) => edit('compare', { steps: v }))}</Field>
              </>
            )}
          </div>
        )}

        {mode === 'qualitative' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-inset p-4 text-sm text-ink-2">
              <p className="font-semibold text-ink">Three hypotheses, not outcomes</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">{RUBRIC.alternatives.map((a) => <li key={a.id}><strong className="text-ink">{a.id}</strong> — {a.label}</li>)}</ul>
              <p className="mt-3"><strong className="text-ink">Scores:</strong> {RUBRIC.legend.map((l, i) => `${i + 1} ${l}`).join(' · ')}. Scores start empty; an alternative is scored only when all seven criteria are filled in.</p>
            </div>
            {RUBRIC.criteria.map((k) => {
              const e = evidence.find((x) => x.criterion === k.id);
              return (
                <fieldset key={k.id} className="min-w-0 rounded-xl border border-line p-4" data-criterion={k.id}>
                  <legend className="px-1 text-sm font-semibold text-ink">{k.label}</legend>
                  <p className="text-sm text-ink-2">{k.definition}</p>
                  {e && <p className="mt-2 break-words text-xs text-ink-3" data-evidence={e.state}>{e.state === 'SOURCE_PASSAGE' ? 'Source passage: ' : 'INSUFFICIENT_DATA: '}{e.text} {e.source && <SourceLink source={e.source} />}</p>}
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field id={id(`weight-${k.id}`)} label={<>Weight<span className="rs-sr"> of {k.label}</span></>} error={err(`weight-${k.id}`)}>
                      {input(`weight-${k.id}`, drafts.qualitative.weights[k.id] ?? '', (v) => edit('qualitative', { weights: { ...drafts.qualitative.weights, [k.id]: v } }))}
                    </Field>
                    {RUBRIC.alternatives.map((a) => (
                      <Field key={a.id} id={id(`score-${a.id}-${k.id}`)} label={<>{a.id} score<span className="rs-sr"> for {a.label}, {k.label}</span></>}>
                        <select id={id(`score-${a.id}-${k.id}`)} className="rs-select mt-2 w-full" value={drafts.qualitative.scores[a.id]?.[k.id] ?? ''}
                          onChange={(ev) => edit('qualitative', { scores: { ...drafts.qualitative.scores, [a.id]: { ...drafts.qualitative.scores[a.id], [k.id]: ev.target.value } } })}>
                          <option value="">Not scored</option>
                          {RUBRIC.legend.map((l, i) => <option key={l} value={i + 1}>{i + 1} — {l}</option>)}
                        </select>
                      </Field>
                    ))}
                  </div>
                </fieldset>
              );
            })}
            <Field id={id('note')} label="Note, optional" hint={`Plain text, up to ${LIMITS.MAX_NOTE} characters. It stays in your browser and in your exports.`}>
              <textarea id={id('note')} className="rs-input mt-2 block min-h-20 w-full" rows={2} maxLength={LIMITS.MAX_NOTE} value={drafts.qualitative.note} onChange={(ev) => edit('qualitative', { note: ev.target.value.replace(/[\r\n\t]+/g, ' ') })} />
            </Field>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="rs-button rs-button-primary !min-h-11">{submitLabel}</button>
          {mode === 'future' && <button type="button" className="rs-button rs-button-secondary !min-h-11" onClick={compareFromFuture}>Compare</button>}
          <button type="button" className="rs-button rs-button-ghost !min-h-11" onClick={reset}>Reset</button>
        </div>
        <p role="status" aria-live="polite" className="min-h-5 text-sm text-ink-2" data-calc-status>
          {error ? error.message : outcome ? (outcome.ok ? 'Result computed in your browser by the shared engine. No external service was called.' : 'The request was not evaluated. See the reason below.') : `Enter the inputs and press ${submitLabel}.`}
        </p>
      </form>

      {outcome?.ok && <ResultView result={outcome.result} onExplain={explain} fallback={fallback} />}
      {outcome && !outcome.ok && (
        <section aria-labelledby="calc-result-h" className="rs-card p-5 sm:p-7" data-calc-failure={outcome.code} data-result-status={outcome.status}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="calc-result-h" className="rs-h2 min-w-0">{outcome.status === 'INSUFFICIENT_DATA' ? 'No result: insufficient data' : 'No result: input not valid'}</h2>
            <Status status={outcome.status === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'INVALID_INPUT'} />
          </div>
          <p className="mt-4 break-words text-sm leading-7 text-ink-2">{outcome.message}</p>
          <p className="mt-2 text-xs text-ink-3">Reason code {outcome.code}. Nothing is estimated, clamped or filled in.</p>
        </section>
      )}
    </div>
  );
}
