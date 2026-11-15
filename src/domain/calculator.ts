/**
 * Calculator & Scenario Intelligence: the one deterministic engine behind /calculator and the
 * Statistics Assistant tools. Pure and dependency-free (no npm import, network, DOM, storage, clock
 * or randomness), so the browser, the tests and the optional Pages Function run the same code.
 *
 * Status rules. A source-assigned production value is CANON_OBSERVED; exact arithmetic on production
 * values is CANON_DERIVED; remodeling values stay PROPOSED; any user-supplied assumption makes the
 * result a SCENARIO; an empirical forecast the data cannot support is INSUFFICIENT_DATA.
 * MODEL_ESTIMATE is never emitted: nothing here fits a statistical model. No output becomes canon,
 * a missing value is unknown (never zero) and out-of-range parameters are rejected, never clamped.
 * Full precision is kept; rounding happens only in show() and in the interfaces.
 */
import { MAX_SUPPORTED_BAC, formatBac, yearsBetween } from './calendar.ts';
import { ANCESTRIES, HABITATS, SHARE_TOLERANCE, SURFACES, derive, type Composition } from './composition.ts';
import type { EpistemicStatus } from './status.ts';

export const CALC_RESULT_SCHEMA = 'reltroner-calculator-result.v1';
/** Statuses this engine can emit. MODEL_ESTIMATE and ARCHIVED are excluded by type: no model is fitted, nothing is superseded. */
export const CALC_STATUSES = Object.freeze(['CANON_OBSERVED', 'CANON_DERIVED', 'SCENARIO', 'PROPOSED', 'INSUFFICIENT_DATA'] as const satisfies readonly EpistemicStatus[]);
export type CalcStatus = (typeof CALC_STATUSES)[number];
export const PLANET_ID = 'planet:asthortera';

export const LIMITS = Object.freeze({
  /** Annual rate bounds in percent per year. */
  RATE_MIN_PCT: -50,
  RATE_MAX_PCT: 100,
  /** Longest horizon or backcast in years: reaches the 1010 BAC window and the 1125 BAC foundation. */
  MAX_PERIODS: 1200,
  SWEEP_MIN_STEPS: 2,
  SWEEP_MAX_STEPS: 101,
  MIN_SCENARIOS: 2,
  MAX_SCENARIOS: 3,
  /** Trajectories are sampled on an even integer-year grid of at most this many points. */
  MAX_SERIES_POINTS: 101,
  MAX_LABEL: 60,
  MAX_NOTE: 500,
  MAX_WEIGHT: 100,
  MAX_MAGNITUDE: 1e300,
  /** Observed points an empirical forecast would need at the very least. The source holds one or two. */
  MIN_EMPIRICAL_POINTS: 8,
  /** Relative tolerance when a recomputed value is checked against the value the source carries. */
  SOURCE_MATCH_TOLERANCE: 1e-9,
});

/** Versioned allowlist. Nothing outside it can be evaluated; there is no expression interpreter. */
export const FORMULAS = Object.freeze({
  population_x_ancestry_share: { version: '1.0.0', label: 'Residents by primary ancestry', expression: 'residents = population × ancestry share ÷ 100' },
  population_x_habitat_share: { version: '1.0.0', label: 'Residents by principal home habitat', expression: 'residents = population × habitat share ÷ 100' },
  land_area_x_footprint_share: { version: '1.0.0', label: 'Land area by surface class', expression: 'area = national land area × footprint share ÷ 100' },
  gdp_per_capita: { version: '1.0.0', label: 'GDP per capita', expression: 'GDP per capita = nominal GDP ÷ (population in billions × 10⁹)' },
  share_of_planetary_gdp: { version: '1.0.0', label: 'Share of planetary GDP', expression: 'share = national GDP ÷ planetary GDP × 100' },
  percent_change: { version: '1.0.0', label: 'Percent change', expression: 'change = (new − base) ÷ base × 100' },
  percentage_point_difference: { version: '1.0.0', label: 'Percentage-point difference', expression: 'difference = new percent − old percent' },
  compound_growth: { version: '1.0.0', label: 'Compound growth', expression: 'future = baseline × (1 + rate)^years' },
  annualized_rate: { version: '1.0.0', label: 'Annualized rate', expression: 'rate = (final ÷ initial)^(1 ÷ years) − 1' },
  conditional_backcast: { version: '1.0.0', label: 'Conditional backcast', expression: 'past = anchor ÷ (1 + rate)^elapsed years' },
  weighted_composition: { version: '1.0.0', label: 'Reallocated composition', expression: 'component = denominator × share ÷ 100, with all shares summing to 100' },
  scenario_difference: { version: '1.0.0', label: 'Difference between two values', expression: 'difference = a − b; relative = (a − b) ÷ b × 100' },
  weighted_rubric_score: { version: '1.0.0', label: 'Weighted rubric score', expression: 'score = Σ(weight × score) ÷ Σ(weight)' },
});
export type FormulaId = keyof typeof FORMULAS;

/** Indicators a compound scenario may start from: positive magnitudes with one Year 0 source value. */
export const SCENARIO_INDICATORS = Object.freeze(['population', 'gdp_usd', 'gdp_per_capita'] as const);
export type ScenarioIndicator = (typeof SCENARIO_INDICATORS)[number];
export const SCENARIO_NAMES = Object.freeze(['Conservative', 'Baseline assumption', 'Aggressive'] as const);

export const DIMENSIONS = Object.freeze({
  ancestry: { formula: 'population_x_ancestry_share', categories: ANCESTRIES, noun: 'primary ancestry share' },
  habitat: { formula: 'population_x_habitat_share', categories: HABITATS, noun: 'principal home habitat share' },
  surface: { formula: 'land_area_x_footprint_share', categories: SURFACES, noun: 'terrestrial surface footprint share' },
} as const);
export type Dimension = keyof typeof DIMENSIONS;
export type ShareFormula = (typeof DIMENSIONS)[Dimension]['formula'];

/** The five modes of the /calculator page. */
export const CALC_MODES = Object.freeze([
  { id: 'calculate', label: 'Calculate', summary: 'Source-backed arithmetic' },
  { id: 'future', label: 'Future Scenario', summary: 'Conditional projection' },
  { id: 'backcast', label: 'Historical Backcast', summary: 'Conditional past hypothesis' },
  { id: 'qualitative', label: 'Qualitative Scenario', summary: 'Weighted rubric' },
  { id: 'compare', label: 'Compare & Sensitivity', summary: 'Scenarios and rate sweep' },
] as const);
export type CalcMode = (typeof CALC_MODES)[number]['id'];

export function modeOf(request: CalcRequest): CalcMode {
  switch (request.operation) {
    case 'calculate': return 'calculate';
    case 'projectScenario': return 'future';
    case 'reconstructScenario': return 'backcast';
    case 'evaluateQualitativeScenario': return 'qualitative';
    default: return 'compare';
  }
}

/** One bounded qualitative comparison. Scores and weights are always the user's; none are prefilled. */
export const RUBRIC = Object.freeze({
  id: 'reltronland-depcutland-cooperation',
  premise: 'Reltronland and Depcutland have a history of tension and may weigh cooperation against the shared threats the source names: Henchoway and Nytherion.',
  alternatives: [
    { id: 'A', label: 'Limited diplomatic cooperation' },
    { id: 'B', label: 'Broader institutional cooperation' },
    { id: 'C', label: 'No cooperation' },
  ],
  criteria: [
    { id: 'institutional_independence', label: 'Institutional independence', definition: 'How well the alternative keeps each nation’s institutions independent of the other.' },
    { id: 'diplomatic_coordination', label: 'Diplomatic coordination', definition: 'How well the alternative lets the two nations coordinate against the shared threats.' },
    { id: 'domestic_tension', label: 'Domestic tension', definition: 'How well the alternative keeps tension inside each nation manageable.' },
    { id: 'historical_continuity', label: 'Historical continuity', definition: 'How well the alternative fits the recorded history between the two nations.' },
    { id: 'canon_consistency', label: 'Canon consistency', definition: 'How well the alternative fits what production canon already states.' },
    { id: 'narrative_consequences', label: 'Narrative consequences', definition: 'How well the consequences the alternative opens serve the story, in your judgment.' },
    { id: 'evidence_sufficiency', label: 'Evidence sufficiency', definition: 'How much pinned source evidence there is to judge the alternative at all.' },
  ],
  legend: ['very weak alignment', 'weak alignment', 'mixed', 'strong alignment', 'very strong alignment'],
} as const);
export type AlternativeId = (typeof RUBRIC.alternatives)[number]['id'];
export type CriterionId = (typeof RUBRIC.criteria)[number]['id'];

/** Where a criterion's source passage is looked up. A selector that finds nothing yields INSUFFICIENT_DATA, never a citation. */
const RUBRIC_EVIDENCE: Readonly<Record<CriterionId, { type: string; source_id: string; target_id: string } | { entity: string } | null>> = {
  institutional_independence: { type: 'MOTIVATED_BY', source_id: 'nar:nation:depcutland', target_id: 'nar:motivation:depcutland-wartime-strategic-fear' },
  diplomatic_coordination: { type: 'CONFLICTS_WITH', source_id: 'nar:faction:henchoway', target_id: 'nar:nation:depcutland' },
  domestic_tension: null,
  historical_continuity: { type: 'CONFLICTS_WITH', source_id: 'nar:nation:reltronland', target_id: 'nar:nation:depcutland' },
  canon_consistency: { entity: 'nar:conflict:reltronland-vs-depcutland' },
  narrative_consequences: { type: 'THEMATICALLY_RELATED', source_id: 'nar:faction:henchoway', target_id: 'nar:philosophy:nytherion-abyss' },
  evidence_sufficiency: null,
};

// ---------------------------------------------------------------- evidence (a structural subset of the public index)
export type CalcSourceRole = 'production' | 'remodeling';
export interface SourceRef { role: CalcSourceRole; repository: string; commit_sha: string; path: string; pointer: string | null; url: string }
interface RawSource { repository: string; commit_sha: string; path: string; pointer?: string | null; line?: number | null }
export interface SourceFact {
  entity_id: string; entity: string; indicator: string; label: string; value: number; unit: string;
  status: 'CANON_OBSERVED' | 'CANON_DERIVED';
  source: RawSource;
}
/** A source value at a year other than Year 0. Its own status is kept: a source-labeled scenario stays a scenario. */
export interface SourceAnchor extends Omit<SourceFact, 'status'> { year_bac: number; status: 'CANON_OBSERVED' | 'CANON_DERIVED' | 'SCENARIO' }
export interface CalcEvidence {
  composition: Composition;
  facts: readonly SourceFact[];
  anchors?: readonly SourceAnchor[];
  /** Sovereign foundation year (BAC) by entity id. A national value before it is outside the supported domain. */
  foundations?: Readonly<Record<string, number>>;
  narrative?: ReadonlyArray<{ id: string; name: string; source: RawSource & { quote: string } }>;
  relations?: ReadonlyArray<{ type: string; source_id: string; target_id: string; verification: string; source: RawSource & { quote: string } }>;
}

// ---------------------------------------------------------------- request contract (the six tools)
interface ScenarioBase { entity_id: string; indicator: ScenarioIndicator }
export type CalculateRequest =
  | { operation: 'calculate'; formula: ShareFormula; entity_id: string; category: string; /** What-if share. Absent: the source share. */ share_pct?: number }
  | { operation: 'calculate'; formula: 'gdp_per_capita' | 'share_of_planetary_gdp'; entity_id: string }
  | { operation: 'calculate'; formula: 'percent_change'; base: number; next: number }
  | { operation: 'calculate'; formula: 'percentage_point_difference'; old_pct: number; new_pct: number }
  | { operation: 'calculate'; formula: 'compound_growth'; baseline: number; annual_rate_pct: number; years: number }
  | { operation: 'calculate'; formula: 'annualized_rate'; initial: number; final: number; years: number }
  | { operation: 'calculate'; formula: 'conditional_backcast'; anchor: number; annual_rate_pct: number; years: number }
  | { operation: 'calculate'; formula: 'weighted_composition'; entity_id: string; dimension: Dimension; shares: Record<string, number> }
  | { operation: 'calculate'; formula: 'scenario_difference'; a: number; b: number };
export type ProjectRequest = ScenarioBase & { operation: 'projectScenario'; annual_rate_pct: number; horizon_years: number; label: string };
export type ReconstructRequest = ScenarioBase & { operation: 'reconstructScenario'; target_bac: number; annual_rate_pct: number; label: string };
export type CompareRequest = ScenarioBase & { operation: 'compareScenarios'; horizon_years: number; scenarios: Array<{ label: string; annual_rate_pct: number }> };
export type SensitivityRequest = ScenarioBase & { operation: 'analyzeSensitivity'; horizon_years: number; rate_min_pct: number; rate_max_pct: number; steps: number };
export type QualitativeRequest = {
  operation: 'evaluateQualitativeScenario';
  weights: Record<CriterionId, number>;
  /** Ordinal 1–5 per alternative and criterion. A missing score stays missing. */
  scores: Record<AlternativeId, Partial<Record<CriterionId, number>>>;
  note?: string;
};
export type CalcRequest = CalculateRequest | ProjectRequest | ReconstructRequest | CompareRequest | SensitivityRequest | QualitativeRequest;
export type CalcOperation = CalcRequest['operation'];

// ---------------------------------------------------------------- result contract
export interface CalcInput {
  key: string; label: string; value: number | string; unit: string;
  owner: 'SOURCE_ASSIGNED' | 'USER_SUPPLIED';
  status: CalcStatus;
  period: string | null;
  source: SourceRef | null;
}
export type CalcCell = number | string | null;
export interface CalcTable { id: string; caption: string; columns: Array<{ key: string; label: string; unit: string }>; rows: Array<Record<string, CalcCell>> }
export interface CalcSeries { id: string; label: string; kind: 'MODELED' | 'SOURCE_ANCHOR'; status: CalcStatus; points: Array<{ x: number; x_label: string; value: number }> }
export interface CalcChart { x_kind: 'ELAPSED_YEARS' | 'BAC_AXIS' | 'RATE_PCT'; x_title: string; y_title: string; unit: string; series: CalcSeries[] }
export interface CalcEvidenceLink { criterion: string; label: string; state: 'SOURCE_PASSAGE' | 'INSUFFICIENT_DATA'; text: string; source: SourceRef | null }
export interface CalcResult {
  schema_version: typeof CALC_RESULT_SCHEMA;
  calculation_id: string;
  operation: CalcOperation;
  formula_id: FormulaId;
  formula_version: string;
  formula_expression: string;
  title: string;
  request: CalcRequest;
  inputs: CalcInput[];
  assumptions: Array<{ text: string; owner: 'SOURCE_ASSIGNED' | 'USER_SUPPLIED' }>;
  denominator: string | null;
  baseline_period: string | null;
  horizon: { kind: 'YEARS_AFTER_YEAR_0'; years: number } | { kind: 'BAC'; target_bac: number; target_label: string; elapsed_years: number } | null;
  source_role: CalcSourceRole | 'user';
  source: SourceRef | null;
  result_label: string;
  result_value: number | null;
  result_unit: string;
  result_status: CalcStatus;
  status_reason: string;
  empirical_forecast: { status: 'INSUFFICIENT_DATA'; reason: 'INSUFFICIENT_DATA_FOR_EMPIRICAL_FORECAST' | 'NO_VALIDATED_EMPIRICAL_MODEL'; observed_points: number; required_points: number } | null;
  /** The same sentences are shown by the Calculator and spoken by the Assistant. */
  summary: Array<{ text: string; status: CalcStatus; source: SourceRef | null }>;
  limitations: string[];
  tables: CalcTable[];
  chart: CalcChart | null;
  evidence: CalcEvidenceLink[];
}
export interface CalcFailure { ok: false; code: string; status: 'INVALID_INPUT' | 'INSUFFICIENT_DATA'; message: string; field: string | null }
export type CalcOutcome = { ok: true; result: CalcResult } | CalcFailure;

export class CalcError extends Error {
  code: string;
  status: CalcFailure['status'];
  field: string | null;
  constructor(code: string, message: string, field: string | null = null, status: CalcFailure['status'] = 'INVALID_INPUT') {
    super(message);
    this.name = 'CalcError';
    this.code = code;
    this.status = status;
    this.field = field;
  }
}
const missing = (code: string, message: string, field: string | null = null) => new CalcError(code, message, field, 'INSUFFICIENT_DATA');

// ---------------------------------------------------------------- validated arithmetic (one implementation per formula)
function num(v: unknown, field: string): number {
  if (typeof v !== 'number' || Number.isNaN(v)) throw new CalcError('NOT_A_NUMBER', `${field} must be a number.`, field);
  if (!Number.isFinite(v)) throw new CalcError('NOT_FINITE', `${field} must be finite.`, field);
  return v === 0 ? 0 : v;
}
function out(v: number): number {
  if (!Number.isFinite(v) || Math.abs(v) > LIMITS.MAX_MAGNITUDE) throw new CalcError('NUMERIC_OVERFLOW', 'The result is outside the representable range. Nothing is clamped.', 'result');
  return v === 0 ? 0 : v;
}
function nonNegative(v: unknown, field: string): number {
  if (num(v, field) < 0) throw new CalcError('NEGATIVE_VALUE', `${field} must not be negative.`, field);
  return v as number;
}
function positive(v: unknown, field: string): number {
  if (num(v, field) <= 0) throw new CalcError(v === 0 ? 'DIVISION_BY_ZERO' : 'NOT_POSITIVE', `${field} must be greater than zero.`, field);
  return v as number;
}
function sharePct(v: unknown, field: string): number {
  const p = num(v, field);
  if (p < 0 || p > 100) throw new CalcError('SHARE_OUT_OF_RANGE', `${field} must be between 0 and 100 percent.`, field);
  return p;
}
function growthFactor(ratePct: unknown, field = 'annual_rate_pct'): number {
  const r = num(ratePct, field);
  if (r < LIMITS.RATE_MIN_PCT || r > LIMITS.RATE_MAX_PCT) throw new CalcError('RATE_OUT_OF_RANGE', `${field} must be between ${LIMITS.RATE_MIN_PCT}% and ${LIMITS.RATE_MAX_PCT}% per year.`, field);
  return 1 + r / 100;
}
function wholeYears(v: unknown, field: string, min: number): number {
  const y = num(v, field);
  if (!Number.isInteger(y) || y < min || y > LIMITS.MAX_PERIODS) throw new CalcError('HORIZON_OUT_OF_RANGE', `${field} must be a whole number of years from ${min} to ${LIMITS.MAX_PERIODS}.`, field);
  return y;
}

/** A value with what it measures, so a share is only ever taken of a compatible total. */
export interface Quantity { value: number; unit: string; indicator: string; period_bac: number; commit_sha: string }

export const formulas = Object.freeze({
  /** denominator × share ÷ 100 with the composition's own rounding (10 significant digits). */
  shareOf: (denominator: number, pct: number): number => out(derive(sharePct(pct, 'share_pct'), nonNegative(denominator, 'denominator'))),
  gdpPerCapita: (gdpUsd: number, populationBillion: number): number => out(nonNegative(gdpUsd, 'gdp_usd') / (positive(populationBillion, 'population_billion') * 1e9)),
  shareOfTotal(component: Quantity, total: Quantity): number {
    for (const key of ['unit', 'indicator', 'period_bac', 'commit_sha'] as const) {
      if (component[key] !== total[key]) throw new CalcError('INCOMPATIBLE_DENOMINATOR', `The component and the total differ in ${key} (${component[key]} versus ${total[key]}); a share needs the same measure, year and source pin.`, key);
    }
    return out((nonNegative(component.value, 'component') / positive(total.value, 'total')) * 100);
  },
  percentChange(base: number, next: number): number {
    if (num(base, 'base') === 0) throw new CalcError('DIVISION_BY_ZERO', 'base must not be zero: a percent change from zero is undefined.', 'base');
    return out(((num(next, 'next') - base) / base) * 100);
  },
  percentagePointDifference: (oldPct: number, newPct: number): number => out(num(newPct, 'new_pct') - num(oldPct, 'old_pct')),
  compoundGrowth: (baseline: number, ratePct: number, years: number): number => out(nonNegative(baseline, 'baseline') * growthFactor(ratePct) ** wholeYears(years, 'years', 0)),
  /** Percent per year. Defined for positive initial and final values over at least one year. */
  annualizedRatePct: (initial: number, final: number, years: number): number => out(((positive(final, 'final') / positive(initial, 'initial')) ** (1 / wholeYears(years, 'years', 1)) - 1) * 100),
  backcast: (anchor: number, ratePct: number, elapsedYears: number): number => out(nonNegative(anchor, 'anchor') / growthFactor(ratePct) ** wholeYears(elapsedYears, 'elapsed_years', 0)),
  weightedMean(items: ReadonlyArray<{ weight: number; value: number }>): number {
    let total = 0;
    let sum = 0;
    for (const { weight, value } of items) {
      if (nonNegative(weight, 'weight') > LIMITS.MAX_WEIGHT) throw new CalcError('WEIGHT_OUT_OF_RANGE', `weight must not exceed ${LIMITS.MAX_WEIGHT}.`, 'weight');
      total += weight;
      sum += weight * num(value, 'value');
    }
    if (total <= 0) throw new CalcError('ZERO_TOTAL_WEIGHT', 'The weights sum to zero, so no weighted score exists.', 'weights');
    return out(sum / total);
  },
  /** Mutually exclusive shares must close to 100% within the composition tolerance. */
  closure(shares: readonly number[]): number {
    const total = shares.reduce((s, p) => s + sharePct(p, 'share_pct'), 0);
    if (Math.abs(total - 100) > SHARE_TOLERANCE) throw new CalcError('COMPOSITION_NOT_CLOSED', `The shares sum to ${Number(total.toPrecision(10))}%, not 100%. A complete distribution must total 100%.`, 'shares');
    return total;
  },
  difference: (a: number, b: number): number => out(num(a, 'a') - num(b, 'b')),
});

// ---------------------------------------------------------------- presentation helpers shared by both interfaces
const SUPERSCRIPT: Readonly<Record<string, string>> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** Display rounding only. Engine values keep full precision. */
export function show(value: number | null, unit = ''): string {
  if (value === null) return 'Not assigned';
  const abs = Math.abs(value);
  let body: string;
  if (abs >= 1e15) {
    const exp = Math.floor(Math.log10(abs));
    body = `${(value / 10 ** exp).toFixed(3)} × 10${String(exp).split('').map((c) => SUPERSCRIPT[c] ?? c).join('')}`;
  } else if (abs !== 0 && abs < 0.01) body = String(Number(value.toPrecision(3)));
  else body = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: abs < 1 ? 4 : 2 });
  if (value < 0) body = `−${body.slice(1)}`;
  return unit === '%' ? `${body}%` : unit ? `${body} ${unit}` : body;
}
const signed = (v: number, unit: string) => `${v > 0 ? '+' : ''}${show(v, unit)}`;
const ratePhrase = (pct: number) => `${signed(pct, '%')} per year`;

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}
/** JSON with sorted keys: equal requests always serialize, hash and export identically. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// ---------------------------------------------------------------- validated baseline selectors
const REPO_ROLE = (repository: string): CalcSourceRole => (repository.endsWith('-remodeling') ? 'remodeling' : 'production');
function ref(source: RawSource, pointer: string | null = source.pointer ?? null): SourceRef {
  return { role: REPO_ROLE(source.repository), repository: source.repository, commit_sha: source.commit_sha, path: source.path, pointer, url: `https://github.com/${source.repository}/blob/${source.commit_sha}/${source.path}${source.line ? `#L${source.line}` : ''}` };
}

export function entityName(ev: CalcEvidence, id: string): string | null {
  return ev.facts.find((f) => f.entity_id === id)?.entity ?? ev.composition.ancestry.countries.find((c) => c.id === id)?.name ?? ev.composition.spatial.countries.find((c) => c.id === id)?.name ?? null;
}
function knownEntity(ev: CalcEvidence, id: string): string {
  const name = typeof id === 'string' ? entityName(ev, id) : null;
  if (!name) throw missing('UNKNOWN_ENTITY', `${String(id)} is not a nation or entity of the evidence index. No other entity is substituted.`, 'entity_id');
  return name;
}
function fact(ev: CalcEvidence, entityId: string, indicator: string): SourceFact {
  const name = knownEntity(ev, entityId);
  const f = ev.facts.find((x) => x.entity_id === entityId && x.indicator === indicator);
  if (!f) throw missing('VALUE_NOT_ASSIGNED', `${name} · ${indicator}: no assigned Year 0 value in production main. It is unknown, not zero, and nothing is estimated in its place.`, 'indicator');
  return f;
}
const factInput = (key: string, f: SourceFact): CalcInput => ({ key, label: `${f.entity} · ${f.label}`, value: f.value, unit: f.unit, owner: 'SOURCE_ASSIGNED', status: f.status, period: 'Year 0', source: ref(f.source) });
const userInput = (key: string, label: string, value: number | string, unit: string): CalcInput => ({ key, label, value, unit, owner: 'USER_SUPPLIED', status: 'SCENARIO', period: null, source: null });

interface DimensionBaseline {
  name: string; role: CalcSourceRole; derivedStatus: 'CANON_DERIVED' | 'PROPOSED'; shareStatus: 'CANON_OBSERVED' | 'PROPOSED';
  denominator: number; denominatorLabel: string; denominatorUnit: string; resultUnit: string; denominatorText: string;
  rows: Array<{ key: string; label: string; pct: number }>;
  source: SourceRef; denominatorSource: SourceRef;
}
function dimensionBaseline(ev: CalcEvidence, entityId: string, dimension: Dimension): DimensionBaseline {
  const name = knownEntity(ev, entityId);
  const comp = ev.composition;
  if (dimension === 'ancestry') {
    const c = comp.ancestry.countries.find((x) => x.id === entityId);
    if (!c) throw missing('VALUE_NOT_ASSIGNED', `${name}: no national primary ancestry record. The planetary shares are a representative benchmark of 14 nations, not a census, and are not used as a denominator.`, 'entity_id');
    if (c.status !== 'ASSIGNED') throw missing('VALUE_NOT_ASSIGNED', `${c.name}: national primary ancestry shares are not assigned in production main (unknown, not zero).`, 'entity_id');
    const src = comp.sources.production;
    return {
      name: c.name, role: 'production', derivedStatus: 'CANON_DERIVED', shareStatus: 'CANON_OBSERVED', denominator: c.population_billion, denominatorLabel: 'Population', denominatorUnit: 'billion residents', resultUnit: 'billion residents',
      denominatorText: 'residents of the nation (production main, Year 0)', rows: c.rows, source: ref(src, `${c.pointer}.ancestry_primary_pct`), denominatorSource: ref(src, `${c.pointer}.population_billion`),
    };
  }
  const src = comp.sources.remodeling;
  const s = comp.spatial.countries.find((x) => x.id === entityId);
  if (!src || !s) throw missing('VALUE_NOT_ASSIGNED', `${name}: no Spatial 3D record in the pinned remodeling source.`, 'entity_id');
  if (dimension === 'habitat') {
    if (s.habitat_status !== 'ASSIGNED') throw missing('VALUE_NOT_ASSIGNED', `${s.name}: principal home habitats are not assigned (unknown, not zero).`, 'entity_id');
    return {
      name: s.name, role: 'remodeling', derivedStatus: 'PROPOSED', shareStatus: 'PROPOSED', denominator: s.population_billion, denominatorLabel: 'Unique usual residents', denominatorUnit: 'billion residents', resultUnit: 'billion residents',
      denominatorText: 'unique usual residents of the nation (remodeling main, Year 0)', rows: s.habitats, source: ref(src, `${s.pointer}.spatial_3d_canon.principal_habitat_pct`), denominatorSource: ref(src, `${s.pointer}.population_billion`),
    };
  }
  if (s.surface_status !== 'ASSIGNED' || s.land_area_million_km2 === null) throw missing('VALUE_NOT_ASSIGNED', `${s.name}: the terrestrial surface footprint or the national land area is not assigned (unknown, not zero).`, 'entity_id');
  return {
    name: s.name, role: 'remodeling', derivedStatus: 'PROPOSED', shareStatus: 'PROPOSED', denominator: s.land_area_million_km2, denominatorLabel: 'National terrestrial land area', denominatorUnit: 'million km²', resultUnit: 'million km²',
    denominatorText: 'national terrestrial land area (remodeling main, Year 0)', rows: s.surface, source: ref(src, `${s.pointer}.spatial_3d_canon.land_surface_pct`), denominatorSource: ref(src, `${s.pointer}.land_area_million_km2`),
  };
}
function categoryRow(b: DimensionBaseline, dimension: Dimension, category: string) {
  const row = b.rows.find((r) => r.key === category);
  if (row) return row;
  const other = (Object.keys(DIMENSIONS) as Dimension[]).find((d) => d !== dimension && DIMENSIONS[d].categories.some((c) => c.key === category));
  if (other) throw new CalcError('DENOMINATOR_MISMATCH', `${category} is a ${DIMENSIONS[other].noun}, not a ${DIMENSIONS[dimension].noun}. Land-area and resident denominators are never mixed.`, 'category');
  throw new CalcError('UNKNOWN_CATEGORY', `${String(category)} is not a category of this composition.`, 'category');
}

/** Observed source points for an indicator. An empirical forecast needs far more than the source holds. */
export function empiricalForecast(ev: CalcEvidence, entityId: string, indicator: string): NonNullable<CalcResult['empirical_forecast']> {
  const year0 = ev.facts.some((f) => f.entity_id === entityId && f.indicator === indicator) ? 1 : 0;
  const observed = year0 + (ev.anchors ?? []).filter((a) => a.entity_id === entityId && a.indicator === indicator && a.status !== 'SCENARIO').length;
  return { status: 'INSUFFICIENT_DATA', reason: observed < LIMITS.MIN_EMPIRICAL_POINTS ? 'INSUFFICIENT_DATA_FOR_EMPIRICAL_FORECAST' : 'NO_VALIDATED_EMPIRICAL_MODEL', observed_points: observed, required_points: LIMITS.MIN_EMPIRICAL_POINTS };
}
const forecastLine = (e: NonNullable<CalcResult['empirical_forecast']>) =>
  `Empirical forecast: ${e.reason}. The source holds ${e.observed_points} observed point${e.observed_points === 1 ? '' : 's'} for this indicator; at least ${e.required_points} would be needed, and no model is fitted.`;

function scenarioIndicator(indicator: unknown): ScenarioIndicator {
  if (!SCENARIO_INDICATORS.includes(indicator as ScenarioIndicator)) throw missing('UNSUPPORTED_INDICATOR', `${String(indicator)} is not supported for compound scenarios. Supported: ${SCENARIO_INDICATORS.join(', ')}.`, 'indicator');
  return indicator as ScenarioIndicator;
}
function text(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) throw new CalcError('INVALID_TEXT', `${field} must be 1 to ${max} characters of plain text on one line.`, field);
  return v.trim();
}
/** Even integer-year grid from 0 to total, always including both ends. */
function grid(total: number, extra: readonly number[] = []): number[] {
  const step = Math.max(1, Math.ceil(total / (LIMITS.MAX_SERIES_POINTS - 1)));
  const points = new Set<number>([total, ...extra.filter((e) => e >= 0 && e <= total)]);
  for (let t = 0; t < total; t += step) points.add(t);
  return [...points].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- operations
type Draft = Omit<CalcResult, 'schema_version' | 'calculation_id' | 'operation' | 'formula_id' | 'formula_version' | 'formula_expression' | 'request' | 'empirical_forecast' | 'tables' | 'chart' | 'evidence' | 'assumptions' | 'denominator' | 'baseline_period' | 'horizon'>
  & Partial<Pick<CalcResult, 'empirical_forecast' | 'tables' | 'chart' | 'evidence' | 'assumptions' | 'denominator' | 'baseline_period' | 'horizon'>>;
function finish(request: CalcRequest, formula: FormulaId, d: Draft): CalcResult {
  return {
    schema_version: CALC_RESULT_SCHEMA, calculation_id: `calc-${fnv1a(canonicalJson(request))}`, operation: request.operation,
    formula_id: formula, formula_version: FORMULAS[formula].version, formula_expression: FORMULAS[formula].expression,
    request, assumptions: [], denominator: null, baseline_period: null, horizon: null, empirical_forecast: null, tables: [], chart: null, evidence: [], ...d,
  };
}
const line = (text: string, status: CalcStatus, source: SourceRef | null = null) => ({ text, status, source });
const NOT_CANON = 'Not canon: nothing here is written to, or ratified in, any source.';
const USER_ONLY = 'Computed only from numbers you entered. No source value is used, so nothing here is a source statistic.';

function shareCalc(ev: CalcEvidence, req: Extract<CalculateRequest, { formula: ShareFormula }>): CalcResult {
  const dimension = (Object.keys(DIMENSIONS) as Dimension[]).find((d) => DIMENSIONS[d].formula === req.formula)!;
  const b = dimensionBaseline(ev, req.entity_id, dimension);
  const row = categoryRow(b, dimension, req.category);
  const sourceValue = formulas.shareOf(b.denominator, row.pct);
  const inputs: CalcInput[] = [
    { key: 'denominator', label: `${b.name} · ${b.denominatorLabel}`, value: b.denominator, unit: b.denominatorUnit, owner: 'SOURCE_ASSIGNED', status: b.shareStatus, period: 'Year 0', source: b.denominatorSource },
    { key: 'source_share', label: `${b.name} · ${row.label} share`, value: row.pct, unit: '%', owner: 'SOURCE_ASSIGNED', status: b.shareStatus, period: 'Year 0', source: b.source },
  ];
  const common = { title: `${b.name} · ${row.label}`, denominator: b.denominatorText, baseline_period: 'Year 0', source_role: b.role, source: b.source, result_unit: b.resultUnit };
  const roleNote = b.role === 'remodeling' ? ['Spatial 3D values come from remodeling main: ratified in the remodeling workspace, not published production canon.'] : ['Primary ancestry is not a biological species classification.'];
  if (req.share_pct === undefined) {
    return finish(req, req.formula, {
      ...common, inputs, result_label: `${b.name} · ${row.label} (${show(row.pct, '%')} of ${b.denominatorLabel.toLowerCase()})`, result_value: sourceValue, result_status: b.derivedStatus,
      status_reason: b.role === 'production' ? 'Exact arithmetic on two production values of the same record.' : 'Arithmetic on remodeling values, which are proposals.',
      summary: [line(`${b.name}: ${show(row.pct, '%')} ${row.label} of ${show(b.denominator, b.denominatorUnit)} is ${show(sourceValue, b.resultUnit)}.`, b.derivedStatus, b.source)],
      limitations: roleNote,
    });
  }
  const value = formulas.shareOf(b.denominator, req.share_pct);
  const wouldSum = b.rows.reduce((s, r) => s + r.pct, 0) - row.pct + req.share_pct;
  return finish(req, req.formula, {
    ...common, inputs: [...inputs, userInput('share_pct', `What-if ${row.label} share`, req.share_pct, '%')],
    assumptions: [
      { text: `${row.label} share changed from ${show(row.pct, '%')} (source) to ${show(req.share_pct, '%')}.`, owner: 'USER_SUPPLIED' },
      { text: `${b.denominatorLabel} held at ${show(b.denominator, b.denominatorUnit)}.`, owner: 'USER_SUPPLIED' },
    ],
    result_label: `${b.name} · ${row.label} at a what-if share of ${show(req.share_pct, '%')}`, result_value: value, result_status: 'SCENARIO', status_reason: 'A user-supplied share replaces the source share.',
    summary: [
      line(`Source: ${show(row.pct, '%')} ${row.label} of ${show(b.denominator, b.denominatorUnit)} is ${show(sourceValue, b.resultUnit)}.`, b.derivedStatus, b.source),
      line(`What-if: at ${show(req.share_pct, '%')}, with ${b.denominatorLabel.toLowerCase()} unchanged, ${row.label} would be ${show(value, b.resultUnit)} (${signed(formulas.difference(value, sourceValue), b.resultUnit)}; ${signed(req.share_pct - row.pct, 'percentage points')}).`, 'SCENARIO'),
    ],
    limitations: [
      `Single-category conditional count: only ${row.label} is recomputed. The other shares are not recalculated; left as they are, the shares would sum to ${show(wouldSum, '%')}, so this is not a complete distribution. Use the reallocated composition to enter every share.`,
      ...roleNote, NOT_CANON,
    ],
    tables: [{
      id: 'what-if', caption: `${b.name} · ${row.label}: source versus what-if`,
      columns: [{ key: 'case', label: 'Case', unit: '' }, { key: 'share', label: 'Share', unit: '%' }, { key: 'value', label: row.label, unit: b.resultUnit }, { key: 'status', label: 'Status', unit: '' }],
      rows: [
        { case: 'Source', share: row.pct, value: sourceValue, status: b.derivedStatus },
        { case: 'What-if', share: req.share_pct, value, status: 'SCENARIO' },
        { case: 'Difference', share: req.share_pct - row.pct, value: formulas.difference(value, sourceValue), status: 'SCENARIO' },
      ],
    }],
  });
}

function reallocation(ev: CalcEvidence, req: Extract<CalculateRequest, { formula: 'weighted_composition' }>): CalcResult {
  if (!(req.dimension in DIMENSIONS)) throw new CalcError('UNKNOWN_DIMENSION', 'dimension must be ancestry, habitat or surface.', 'dimension');
  const b = dimensionBaseline(ev, req.entity_id, req.dimension);
  const shares = req.shares ?? {};
  for (const key of Object.keys(shares)) categoryRow(b, req.dimension, key);
  const absent = b.rows.filter((r) => typeof shares[r.key] !== 'number');
  if (absent.length) throw new CalcError('COMPOSITION_INCOMPLETE', `Enter a share for every category. Missing: ${absent.map((r) => r.label).join(', ')}.`, 'shares');
  formulas.closure(b.rows.map((r) => shares[r.key]!));
  const rows = b.rows.map((r) => {
    const before = formulas.shareOf(b.denominator, r.pct);
    const after = formulas.shareOf(b.denominator, shares[r.key]!);
    return { category: r.label, source_share: r.pct, scenario_share: shares[r.key]!, share_change: shares[r.key]! - r.pct, source_value: before, scenario_value: after, value_change: formulas.difference(after, before) };
  });
  return finish(req, 'weighted_composition', {
    title: `${b.name} · reallocated ${DIMENSIONS[req.dimension].noun}s`, denominator: b.denominatorText, baseline_period: 'Year 0', source_role: b.role, source: b.source,
    inputs: [
      { key: 'denominator', label: `${b.name} · ${b.denominatorLabel}`, value: b.denominator, unit: b.denominatorUnit, owner: 'SOURCE_ASSIGNED', status: b.shareStatus, period: 'Year 0', source: b.denominatorSource },
      ...b.rows.map((r) => userInput(`share.${r.key}`, `Scenario ${r.label} share`, shares[r.key]!, '%')),
    ],
    assumptions: [
      { text: `Every share entered by you: ${b.rows.map((r) => `${r.label} ${show(shares[r.key]!, '%')}`).join('; ')} (total 100%).`, owner: 'USER_SUPPLIED' },
      { text: `${b.denominatorLabel} held at ${show(b.denominator, b.denominatorUnit)}.`, owner: 'USER_SUPPLIED' },
    ],
    result_label: `${b.denominatorLabel} distributed (unchanged total)`, result_value: b.denominator, result_unit: b.resultUnit, result_status: 'SCENARIO', status_reason: 'Every share is user-supplied.',
    summary: rows.map((r) => line(`${r.category}: ${show(r.source_share, '%')} → ${show(r.scenario_share, '%')}, ${show(r.source_value, b.resultUnit)} → ${show(r.scenario_value, b.resultUnit)} (${signed(r.value_change, b.resultUnit)}).`, 'SCENARIO')),
    limitations: ['Explicit reallocation: all shares are yours and total 100%; the source shares are shown only for comparison.', ...(b.role === 'remodeling' ? ['The source composition comes from remodeling main and is a proposal, not published production canon.'] : []), NOT_CANON],
    tables: [{
      id: 'reallocation', caption: `${b.name}: source composition versus reallocated composition`,
      columns: [{ key: 'category', label: 'Category', unit: '' }, { key: 'source_share', label: 'Source share', unit: '%' }, { key: 'scenario_share', label: 'Scenario share', unit: '%' }, { key: 'share_change', label: 'Change', unit: 'percentage points' },
        { key: 'source_value', label: 'Source', unit: b.resultUnit }, { key: 'scenario_value', label: 'Scenario', unit: b.resultUnit }, { key: 'value_change', label: 'Change', unit: b.resultUnit }],
      rows,
    }],
  });
}

function sourceDerived(ev: CalcEvidence, req: Extract<CalculateRequest, { formula: 'gdp_per_capita' | 'share_of_planetary_gdp' }>): CalcResult {
  const gdp = fact(ev, req.entity_id, 'gdp_usd');
  const perCapita = req.formula === 'gdp_per_capita';
  const other = perCapita ? fact(ev, req.entity_id, 'population') : fact(ev, PLANET_ID, 'gdp_usd');
  const quantity = (f: SourceFact): Quantity => ({ value: f.value, unit: f.unit, indicator: f.indicator, period_bac: 0, commit_sha: f.source.commit_sha });
  const value = perCapita ? formulas.gdpPerCapita(gdp.value, other.value) : formulas.shareOfTotal(quantity(gdp), quantity(other));
  // The source already carries both figures. A recomputation that disagrees with it is not reported as canon.
  const carried = ev.facts.find((f) => f.entity_id === req.entity_id && f.indicator === (perCapita ? 'gdp_per_capita' : 'gdp_share'));
  const carriedValue = carried ? (perCapita ? carried.value : carried.value * 100) : null;
  if (carriedValue !== null && Math.abs(value - carriedValue) > LIMITS.SOURCE_MATCH_TOLERANCE * Math.max(Math.abs(carriedValue), 1)) {
    throw missing('SOURCE_DERIVATION_MISMATCH', `The recomputed value (${show(value)}) differs from the value the source carries (${show(carriedValue)}). The source value stands; no alternative figure is reported.`, 'formula');
  }
  const unit = perCapita ? 'USD per sentient' : '%';
  return finish(req, req.formula, {
    title: `${gdp.entity} · ${FORMULAS[req.formula].label}`, inputs: [factInput('gdp_usd', gdp), factInput(perCapita ? 'population' : 'planetary_gdp_usd', other)],
    denominator: perCapita ? 'residents (population in billions × 10⁹)' : 'planetary nominal GDP of the same year, model and source pin', baseline_period: 'Year 0', source_role: 'production', source: ref(gdp.source),
    result_label: `${gdp.entity} · ${FORMULAS[req.formula].label}`, result_value: value, result_unit: unit, result_status: 'CANON_DERIVED', status_reason: 'Exact arithmetic on production values of the same year and source pin.',
    summary: [line(`${gdp.entity}: ${show(gdp.value, 'USD per year')} ÷ ${perCapita ? `(${show(other.value, 'billion')} × 10⁹ residents)` : `${show(other.value, 'USD per year')} planetary GDP`} is ${show(value, unit)}.`, 'CANON_DERIVED', ref(gdp.source))],
    limitations: [carried ? `Equals the value the source itself carries (${carried.label}: ${show(carriedValue, unit)}) within a relative tolerance of ${LIMITS.SOURCE_MATCH_TOLERANCE}.` : 'The source carries no precomputed value to check this against.', 'Year 0 only. Historical GDP references use a different model and are never mixed in.'],
  });
}

function plain(req: Exclude<CalculateRequest, { entity_id: string }>): CalcResult {
  const base = { source_role: 'user' as const, source: null, result_status: 'SCENARIO' as const, status_reason: 'Every input is user-supplied.', limitations: [USER_ONLY] };
  const one = (title: string, inputs: CalcInput[], label: string, value: number, unit: string, sentence: string, extra: Partial<Draft> = {}) =>
    finish(req, req.formula, { ...base, title, inputs, result_label: label, result_value: value, result_unit: unit, summary: [line(sentence, 'SCENARIO')], ...extra });
  switch (req.formula) {
    case 'percent_change': {
      const v = formulas.percentChange(req.base, req.next);
      return one('Percent change', [userInput('base', 'Base value', req.base, ''), userInput('next', 'New value', req.next, '')], 'Percent change', v, '%', `From ${show(req.base)} to ${show(req.next)} is a change of ${signed(v, '%')}.`);
    }
    case 'percentage_point_difference': {
      const v = formulas.percentagePointDifference(req.old_pct, req.new_pct);
      return one('Percentage-point difference', [userInput('old_pct', 'Old percent', req.old_pct, '%'), userInput('new_pct', 'New percent', req.new_pct, '%')], 'Percentage-point difference', v, 'percentage points',
        `${show(req.new_pct, '%')} minus ${show(req.old_pct, '%')} is ${signed(v, 'percentage points')}. This is a difference of shares, not a percent change.`);
    }
    case 'compound_growth': {
      const years = wholeYears(req.years, 'years', 1);
      const v = formulas.compoundGrowth(req.baseline, req.annual_rate_pct, years);
      return one('Compound growth', [userInput('baseline', 'Baseline', req.baseline, ''), userInput('annual_rate_pct', 'Annual rate', req.annual_rate_pct, '% per year'), userInput('years', 'Years', years, 'years')], `Value after ${years} years`, v, '',
        `${show(req.baseline)} at ${ratePhrase(req.annual_rate_pct)} for ${years} years is ${show(v)}.`, { horizon: { kind: 'YEARS_AFTER_YEAR_0', years } });
    }
    case 'annualized_rate': {
      const v = formulas.annualizedRatePct(req.initial, req.final, req.years);
      return one('Annualized rate', [userInput('initial', 'Initial value', req.initial, ''), userInput('final', 'Final value', req.final, ''), userInput('years', 'Years', req.years, 'years')], 'Annualized rate', v, '% per year',
        `From ${show(req.initial)} to ${show(req.final)} over ${req.years} years is ${signed(v, '%')} per year, compounded.`);
    }
    case 'conditional_backcast': {
      const years = wholeYears(req.years, 'years', 1);
      const v = formulas.backcast(req.anchor, req.annual_rate_pct, years);
      return one('Conditional backcast', [userInput('anchor', 'Anchor value', req.anchor, ''), userInput('annual_rate_pct', 'Assumed annual rate', req.annual_rate_pct, '% per year'), userInput('years', 'Elapsed years', years, 'years')], `Hypothetical value ${years} years earlier`, v, '',
        `${show(req.anchor)} reached after ${years} years at ${ratePhrase(req.annual_rate_pct)} implies ${show(v)} at the start. This is conditional on the assumed rate.`);
    }
    case 'scenario_difference': {
      const v = formulas.difference(req.a, req.b);
      const relative = req.b === 0 ? null : formulas.percentChange(req.b, req.a);
      return one('Difference between two values', [userInput('a', 'Value a', req.a, ''), userInput('b', 'Value b', req.b, '')], 'a − b', v, '',
        `${show(req.a)} minus ${show(req.b)} is ${signed(v, '')}${relative === null ? '; the relative difference is undefined because b is zero' : ` (${signed(relative, '%')} relative to b)`}.`);
    }
  }
}

interface Baseline { f: SourceFact; indicator: ScenarioIndicator; forecast: NonNullable<CalcResult['empirical_forecast']> }
function scenarioBaseline(ev: CalcEvidence, req: ScenarioBase): Baseline {
  const indicator = scenarioIndicator(req.indicator);
  const f = fact(ev, req.entity_id, indicator);
  nonNegative(f.value, 'baseline');
  return { f, indicator, forecast: empiricalForecast(ev, req.entity_id, indicator) };
}
const FUTURE_LIMITS = (b: Baseline) => [
  `Assumption-driven projection, not an empirically validated forecast: the source holds ${b.forecast.observed_points} observed point${b.forecast.observed_points === 1 ? '' : 's'} for this indicator.`,
  'The annual rate is your assumption. It is not a source growth rate, and no source rate is substituted for it.',
  'Future periods are elapsed years after Year 0; no future calendar convention is implied.',
  NOT_CANON,
];
const anchorSeries = (b: Baseline, x: number, xLabel: string): CalcSeries => ({ id: 'source-anchor', label: `Source value · ${b.f.status}`, kind: 'SOURCE_ANCHOR', status: b.f.status, points: [{ x, x_label: xLabel, value: b.f.value }] });
const futureLabel = (t: number) => (t === 0 ? 'Year 0' : `Year 0 + ${t}`);

function trajectories(req: ProjectRequest | CompareRequest, b: Baseline, years: number, scenarios: Array<{ label: string; annual_rate_pct: number }>): Pick<CalcResult, 'tables' | 'chart'> & { finals: number[] } {
  const samples = grid(years);
  const series = scenarios.map((s, i) => ({ id: `scenario-${i + 1}`, label: s.label, kind: 'MODELED' as const, status: 'SCENARIO' as const, points: samples.map((t) => ({ x: t, x_label: futureLabel(t), value: formulas.compoundGrowth(b.f.value, s.annual_rate_pct, t) })) }));
  const finals = series.map((s) => s.points.at(-1)!.value);
  const order = [...finals].sort((x, y) => y - x);
  return {
    finals,
    chart: { x_kind: 'ELAPSED_YEARS', x_title: 'Elapsed years after Year 0', y_title: `${b.f.label} (${b.f.unit})`, unit: b.f.unit, series: [...series, anchorSeries(b, 0, 'Year 0')] },
    tables: [
      {
        id: 'summary', caption: `${b.f.entity} · ${b.f.label}: scenario${scenarios.length > 1 ? 's' : ''} after ${years} years against the Year 0 source value`,
        columns: [{ key: 'scenario', label: 'Scenario', unit: '' }, { key: 'rate', label: 'Assumed rate', unit: '% per year' }, { key: 'final', label: `After ${years} years`, unit: b.f.unit }, { key: 'absolute', label: 'Change', unit: b.f.unit }, { key: 'relative', label: 'Change', unit: '%' },
          ...(req.operation === 'compareScenarios' ? [{ key: 'rank', label: 'Rank by value', unit: '' }] : [])],
        rows: scenarios.map((s, i) => ({ scenario: s.label, rate: s.annual_rate_pct, final: finals[i]!, absolute: formulas.difference(finals[i]!, b.f.value), relative: b.f.value === 0 ? null : formulas.percentChange(b.f.value, finals[i]!), ...(req.operation === 'compareScenarios' ? { rank: order.indexOf(finals[i]!) + 1 } : {}) })),
      },
      {
        id: 'trajectory', caption: `Conditional trajectory, ${samples.length} sampled years (the chart plots the same values)`,
        columns: [{ key: 'elapsed', label: 'Elapsed years', unit: 'years' }, ...scenarios.map((s, i) => ({ key: `scenario-${i + 1}`, label: s.label, unit: b.f.unit }))],
        rows: samples.map((t, row) => ({ elapsed: t, ...Object.fromEntries(series.map((s) => [s.id, s.points[row]!.value])) })),
      },
    ],
  };
}

function project(ev: CalcEvidence, req: ProjectRequest): CalcResult {
  const b = scenarioBaseline(ev, req);
  const years = wholeYears(req.horizon_years, 'horizon_years', 1);
  const label = text(req.label, 'label', LIMITS.MAX_LABEL);
  growthFactor(req.annual_rate_pct);
  const t = trajectories(req, b, years, [{ label, annual_rate_pct: req.annual_rate_pct }]);
  const value = t.finals[0]!;
  return finish(req, 'compound_growth', {
    title: `${b.f.entity} · ${b.f.label}: conditional future scenario`,
    inputs: [factInput('baseline', b.f), userInput('annual_rate_pct', 'Assumed annual rate', req.annual_rate_pct, '% per year'), userInput('horizon_years', 'Horizon', years, 'years after Year 0'), userInput('label', 'Scenario label', label, '')],
    assumptions: [{ text: `${b.f.label} changes by ${ratePhrase(req.annual_rate_pct)}, compounded, for ${years} years (“${label}”).`, owner: 'USER_SUPPLIED' }],
    baseline_period: 'Year 0', horizon: { kind: 'YEARS_AFTER_YEAR_0', years }, source_role: 'production', source: ref(b.f.source),
    result_label: `${b.f.entity} · ${b.f.label} ${years} years after Year 0 (conditional scenario “${label}”)`, result_value: value, result_unit: b.f.unit, result_status: 'SCENARIO', status_reason: 'The annual rate and the horizon are user-supplied assumptions.',
    empirical_forecast: b.forecast,
    summary: [
      line(`Source baseline: ${b.f.entity} · ${b.f.label} is ${show(b.f.value, b.f.unit)} in Year 0.`, b.f.status, ref(b.f.source)),
      { text: `Conditional scenario “${label}”: at ${ratePhrase(req.annual_rate_pct)} for ${years} years, ${b.f.label.toLowerCase()} would be ${show(value, b.f.unit)} (${signed(formulas.difference(value, b.f.value), b.f.unit)}${b.f.value === 0 ? '' : `; ${signed(formulas.percentChange(b.f.value, value), '%')}`}).`, status: 'SCENARIO', source: null },
      line(forecastLine(b.forecast), 'INSUFFICIENT_DATA'),
    ],
    limitations: FUTURE_LIMITS(b), tables: t.tables, chart: t.chart,
  });
}

function compare(ev: CalcEvidence, req: CompareRequest): CalcResult {
  const b = scenarioBaseline(ev, req);
  const years = wholeYears(req.horizon_years, 'horizon_years', 1);
  if (!Array.isArray(req.scenarios) || req.scenarios.length < LIMITS.MIN_SCENARIOS || req.scenarios.length > LIMITS.MAX_SCENARIOS) throw new CalcError('SCENARIO_COUNT', `Compare ${LIMITS.MIN_SCENARIOS} or ${LIMITS.MAX_SCENARIOS} named scenarios.`, 'scenarios');
  const scenarios = req.scenarios.map((s, i) => { growthFactor(s.annual_rate_pct, `scenarios[${i}].annual_rate_pct`); return { label: text(s.label, `scenarios[${i}].label`, LIMITS.MAX_LABEL), annual_rate_pct: s.annual_rate_pct }; });
  if (new Set(scenarios.map((s) => s.label)).size !== scenarios.length) throw new CalcError('DUPLICATE_LABEL', 'Each scenario needs its own label.', 'scenarios');
  const t = trajectories(req, b, years, scenarios);
  const spread = formulas.difference(Math.max(...t.finals), Math.min(...t.finals));
  return finish(req, 'compound_growth', {
    title: `${b.f.entity} · ${b.f.label}: ${scenarios.length} conditional scenarios`,
    inputs: [factInput('baseline', b.f), userInput('horizon_years', 'Horizon', years, 'years after Year 0'), ...scenarios.map((s, i) => userInput(`scenarios[${i}]`, `Assumed annual rate · ${s.label}`, s.annual_rate_pct, '% per year'))],
    assumptions: scenarios.map((s) => ({ text: `“${s.label}”: ${ratePhrase(s.annual_rate_pct)}, compounded, for ${years} years.`, owner: 'USER_SUPPLIED' as const })),
    baseline_period: 'Year 0', horizon: { kind: 'YEARS_AFTER_YEAR_0', years }, source_role: 'production', source: ref(b.f.source),
    result_label: `Scenario range after ${years} years (highest minus lowest; not a confidence interval)`, result_value: spread, result_unit: b.f.unit, result_status: 'SCENARIO', status_reason: 'Every rate is a user-supplied assumption.',
    empirical_forecast: b.forecast,
    summary: [
      line(`Source baseline: ${b.f.entity} · ${b.f.label} is ${show(b.f.value, b.f.unit)} in Year 0.`, b.f.status, ref(b.f.source)),
      ...scenarios.map((s, i) => ({ text: `“${s.label}” at ${ratePhrase(s.annual_rate_pct)}: ${show(t.finals[i]!, b.f.unit)} after ${years} years (${signed(formulas.difference(t.finals[i]!, b.f.value), b.f.unit)}).`, status: 'SCENARIO' as const, source: null })),
      line(forecastLine(b.forecast), 'INSUFFICIENT_DATA'),
    ],
    limitations: ['The scenario names carry no probability, and the range between them is a scenario range, not a confidence interval.', ...FUTURE_LIMITS(b)], tables: t.tables, chart: t.chart,
  });
}

function sensitivity(ev: CalcEvidence, req: SensitivityRequest): CalcResult {
  const b = scenarioBaseline(ev, req);
  const years = wholeYears(req.horizon_years, 'horizon_years', 1);
  growthFactor(req.rate_min_pct, 'rate_min_pct');
  growthFactor(req.rate_max_pct, 'rate_max_pct');
  if (req.rate_max_pct <= req.rate_min_pct) throw new CalcError('RANGE_ORDER', 'rate_max_pct must be greater than rate_min_pct.', 'rate_max_pct');
  const steps = num(req.steps, 'steps');
  if (!Number.isInteger(steps) || steps < LIMITS.SWEEP_MIN_STEPS || steps > LIMITS.SWEEP_MAX_STEPS) throw new CalcError('STEPS_OUT_OF_RANGE', `steps must be a whole number from ${LIMITS.SWEEP_MIN_STEPS} to ${LIMITS.SWEEP_MAX_STEPS}.`, 'steps');
  // Both ends are sampled exactly; interior rates are rounded to 10 significant digits so the table shows what was computed.
  const rates = Array.from({ length: steps }, (_, i) => (i === 0 ? req.rate_min_pct : i === steps - 1 ? req.rate_max_pct : Number((req.rate_min_pct + ((req.rate_max_pct - req.rate_min_pct) * i) / (steps - 1)).toPrecision(10))));
  const rows = rates.map((rate) => {
    const final = formulas.compoundGrowth(b.f.value, rate, years);
    return { rate, final, absolute: formulas.difference(final, b.f.value), relative: b.f.value === 0 ? null : formulas.percentChange(b.f.value, final) };
  });
  const low = rows[0]!;
  const high = rows.at(-1)!;
  return finish(req, 'compound_growth', {
    title: `${b.f.entity} · ${b.f.label}: sensitivity to the assumed annual rate`,
    inputs: [factInput('baseline', b.f), userInput('horizon_years', 'Horizon', years, 'years after Year 0'), userInput('rate_min_pct', 'Lowest assumed rate', req.rate_min_pct, '% per year'), userInput('rate_max_pct', 'Highest assumed rate', req.rate_max_pct, '% per year'), userInput('steps', 'Samples', steps, 'rates')],
    assumptions: [{ text: `${steps} evenly spaced annual rates from ${ratePhrase(req.rate_min_pct)} to ${ratePhrase(req.rate_max_pct)}, each compounded for ${years} years.`, owner: 'USER_SUPPLIED' }],
    baseline_period: 'Year 0', horizon: { kind: 'YEARS_AFTER_YEAR_0', years }, source_role: 'production', source: ref(b.f.source),
    result_label: `Scenario range after ${years} years across the sweep (not a confidence interval)`, result_value: formulas.difference(high.final, low.final), result_unit: b.f.unit, result_status: 'SCENARIO', status_reason: 'The rate range is a user-supplied assumption.',
    empirical_forecast: b.forecast,
    summary: [
      line(`Source baseline: ${b.f.entity} · ${b.f.label} is ${show(b.f.value, b.f.unit)} in Year 0.`, b.f.status, ref(b.f.source)),
      { text: `Across ${steps} rates from ${ratePhrase(req.rate_min_pct)} to ${ratePhrase(req.rate_max_pct)}, the value after ${years} years runs from ${show(low.final, b.f.unit)} to ${show(high.final, b.f.unit)}.`, status: 'SCENARIO', source: null },
      line(forecastLine(b.forecast), 'INSUFFICIENT_DATA'),
    ],
    limitations: ['The range you entered is a scenario range, not a confidence interval: no probability is attached to any rate.', ...FUTURE_LIMITS(b)],
    tables: [{
      id: 'sweep', caption: `${b.f.entity} · ${b.f.label} after ${years} years by assumed annual rate (the chart plots the same values)`,
      columns: [{ key: 'rate', label: 'Assumed rate', unit: '% per year' }, { key: 'final', label: `After ${years} years`, unit: b.f.unit }, { key: 'absolute', label: 'Change', unit: b.f.unit }, { key: 'relative', label: 'Change', unit: '%' }],
      rows,
    }],
    chart: { x_kind: 'RATE_PCT', x_title: 'Assumed annual rate (% per year)', y_title: `${b.f.label} after ${years} years (${b.f.unit})`, unit: b.f.unit, series: [{ id: 'sweep', label: `After ${years} years`, kind: 'MODELED', status: 'SCENARIO', points: rows.map((r) => ({ x: r.rate, x_label: `${show(r.rate, '%')} per year`, value: r.final })) }] },
  });
}

function reconstruct(ev: CalcEvidence, req: ReconstructRequest): CalcResult {
  const b = scenarioBaseline(ev, req);
  const label = text(req.label, 'label', LIMITS.MAX_LABEL);
  const target = num(req.target_bac, 'target_bac');
  if (!Number.isInteger(target) || target < 0 || target > MAX_SUPPORTED_BAC) throw new CalcError('INVALID_BAC_YEAR', `target_bac must be a whole BAC year from 1 to ${MAX_SUPPORTED_BAC}.`, 'target_bac');
  if (target === 0) throw new CalcError('TARGET_NOT_OLDER_THAN_ANCHOR', 'The target must be older than the Year 0 source anchor. BAC years count backwards: a higher BAC year is older.', 'target_bac');
  const elapsed = wholeYears(yearsBetween(target, 0), 'elapsed_years', 1);
  const foundation = ev.foundations?.[req.entity_id];
  if (foundation !== undefined && target > foundation) {
    throw missing('BEFORE_SOVEREIGN_FOUNDATION', `${b.f.entity} was founded as a sovereign state in ${formatBac(foundation)}. A national ${b.f.label.toLowerCase()} in ${formatBac(target)} is outside the supported domain, so no figure is produced.`, 'target_bac');
  }
  growthFactor(req.annual_rate_pct);
  const value = formulas.backcast(b.f.value, req.annual_rate_pct, elapsed);
  const anchors = (ev.anchors ?? []).filter((a) => a.entity_id === req.entity_id && a.indicator === b.indicator && a.year_bac > 0 && a.year_bac <= target).sort((x, y) => y.year_bac - x.year_bac);
  // Sample positions are years before Year 0; the axis runs chronologically (older on the left).
  const samples = grid(elapsed, anchors.map((a) => a.year_bac)).sort((x, y) => y - x);
  const axisX = (bac: number) => (bac === 0 ? 0 : -bac);
  const modeled = samples.map((bac) => ({ x: axisX(bac), x_label: formatBac(bac), value: formulas.backcast(b.f.value, req.annual_rate_pct, bac) }));
  const sourceAt = new Map<number, { value: number; status: string }>([[0, { value: b.f.value, status: b.f.status }], ...anchors.map((a) => [a.year_bac, { value: a.value, status: a.status }] as [number, { value: number; status: string }])]);
  return finish(req, 'conditional_backcast', {
    title: `${b.f.entity} · ${b.f.label}: conditional historical backcast`,
    inputs: [
      factInput('anchor', b.f),
      ...anchors.map((a): CalcInput => ({ key: `anchor_${a.year_bac}`, label: `${a.entity} · ${a.label} (source value, shown for comparison only)`, value: a.value, unit: a.unit, owner: 'SOURCE_ASSIGNED', status: a.status, period: formatBac(a.year_bac), source: ref(a.source) })),
      userInput('target_bac', 'Target year', formatBac(target), ''), userInput('annual_rate_pct', 'Assumed annual rate', req.annual_rate_pct, '% per year'), userInput('label', 'Scenario label', label, ''),
    ],
    assumptions: [{ text: `${b.f.label} is assumed to have changed by ${ratePhrase(req.annual_rate_pct)}, compounded, over the ${elapsed} years from ${formatBac(target)} to Year 0 (“${label}”).`, owner: 'USER_SUPPLIED' }],
    baseline_period: 'Year 0', horizon: { kind: 'BAC', target_bac: target, target_label: formatBac(target), elapsed_years: elapsed }, source_role: 'production', source: ref(b.f.source),
    result_label: `${b.f.entity} · hypothetical ${b.f.label.toLowerCase()} in ${formatBac(target)} (conditional historical backcast “${label}”)`, result_value: value, result_unit: b.f.unit, result_status: 'SCENARIO', status_reason: 'The annual rate is a user-supplied assumption about the past; no source observes this value.',
    empirical_forecast: b.forecast,
    summary: [
      line(`Source anchor: ${b.f.entity} · ${b.f.label} is ${show(b.f.value, b.f.unit)} in Year 0.`, b.f.status, ref(b.f.source)),
      { text: `Conditional historical backcast “${label}”: if ${b.f.label.toLowerCase()} had changed by ${ratePhrase(req.annual_rate_pct)} over the ${elapsed} years before Year 0, it would have been ${show(value, b.f.unit)} in ${formatBac(target)}.`, status: 'SCENARIO', source: null },
      ...anchors.map((a) => ({ text: `The source itself gives ${show(a.value, a.unit)} for ${formatBac(a.year_bac)} (${a.status}); this curve gives ${show(formulas.backcast(b.f.value, req.annual_rate_pct, a.year_bac), b.f.unit)} there. Where they differ, the source stands.`, status: a.status, source: ref(a.source) })),
    ],
    limitations: [
      'A conditional historical backcast is not canon: no source observes this value, and it must not be read as a historical population or statistic.',
      `The source holds no annual series. Only the listed source values are source statements; every other year on the curve is modeled, and nothing is interpolated between source values.`,
      'BAC years count backwards from Year 0 (a higher BAC year is older). BAC is not Earth BCE.',
      NOT_CANON,
    ],
    tables: [{
      id: 'backcast', caption: `${b.f.entity} · ${b.f.label}: modeled values and source values, ${samples.length} sampled years (the chart plots the same values)`,
      columns: [{ key: 'year', label: 'Year', unit: '' }, { key: 'elapsed', label: 'Years before Year 0', unit: 'years' }, { key: 'modeled', label: 'Modeled (scenario)', unit: b.f.unit }, { key: 'source', label: 'Source value', unit: b.f.unit }, { key: 'source_status', label: 'Source status', unit: '' }],
      rows: samples.map((bac, i) => ({ year: formatBac(bac), elapsed: bac, modeled: modeled[i]!.value, source: sourceAt.get(bac)?.value ?? null, source_status: sourceAt.get(bac)?.status ?? 'Not observed' })),
    }],
    chart: {
      x_kind: 'BAC_AXIS', x_title: 'Year (BAC, older on the left)', y_title: `${b.f.label} (${b.f.unit})`, unit: b.f.unit,
      series: [
        { id: 'modeled', label: `Modeled · ${label}`, kind: 'MODELED', status: 'SCENARIO', points: modeled },
        anchorSeries(b, 0, 'Year 0'),
        ...anchors.map((a): CalcSeries => ({ id: `source-${a.year_bac}`, label: `Source value · ${a.status} · ${formatBac(a.year_bac)}`, kind: 'SOURCE_ANCHOR', status: a.status, points: [{ x: axisX(a.year_bac), x_label: formatBac(a.year_bac), value: a.value }] })),
      ],
    },
  });
}

/** Source passages for the rubric criteria, looked up in the pinned index. Nothing is cited that the index does not hold. */
export function rubricEvidence(ev: CalcEvidence): CalcEvidenceLink[] {
  const links = RUBRIC.criteria.filter((c) => c.id !== 'evidence_sufficiency').map((c): CalcEvidenceLink => {
    const selector = RUBRIC_EVIDENCE[c.id];
    const hit = !selector ? null : 'entity' in selector
      ? ev.narrative?.find((n) => n.id === selector.entity)?.source
      : ev.relations?.find((r) => r.type === selector.type && r.source_id === selector.source_id && r.target_id === selector.target_id && r.verification === 'VERIFIED_SOURCE_GROUNDED')?.source;
    return hit
      ? { criterion: c.id, label: c.label, state: 'SOURCE_PASSAGE', text: `“${hit.quote}”`, source: ref(hit) }
      : { criterion: c.id, label: c.label, state: 'INSUFFICIENT_DATA', text: 'The pinned evidence index holds no verified source passage for this criterion. Any score here rests on your judgment alone.', source: null };
  });
  const found = links.filter((l) => l.state === 'SOURCE_PASSAGE').length;
  return [...links, {
    criterion: 'evidence_sufficiency', label: 'Evidence sufficiency', state: 'INSUFFICIENT_DATA', source: null,
    text: `${found} of the ${links.length} other criteria have a verified source passage in the pinned evidence index. The passages describe the premise; none of them rates any alternative, so the evidence does not decide between them.`,
  }];
}

function qualitative(ev: CalcEvidence, req: QualitativeRequest): CalcResult {
  const weights = RUBRIC.criteria.map((c) => {
    const w = nonNegative(req.weights?.[c.id], `weights.${c.id}`);
    if (w > LIMITS.MAX_WEIGHT) throw new CalcError('WEIGHT_OUT_OF_RANGE', `weights.${c.id} must not exceed ${LIMITS.MAX_WEIGHT}.`, `weights.${c.id}`);
    return w;
  });
  if (weights.reduce((s, w) => s + w, 0) <= 0) throw new CalcError('ZERO_TOTAL_WEIGHT', 'The weights sum to zero, so no weighted score exists. Give at least one criterion a positive weight.', 'weights');
  const note = req.note === undefined || req.note === '' ? null : text(req.note, 'note', LIMITS.MAX_NOTE);
  const scored = RUBRIC.alternatives.map((alt) => {
    const scores = RUBRIC.criteria.map((c) => {
      const s = req.scores?.[alt.id]?.[c.id];
      if (s === undefined || s === null) return null;
      if (typeof s !== 'number' || !Number.isInteger(s) || s < 1 || s > 5) throw new CalcError('INVALID_SCORE', `scores.${alt.id}.${c.id} must be a whole number from 1 to 5.`, `scores.${alt.id}.${c.id}`);
      return s;
    });
    return { ...alt, scores, count: scores.filter((s) => s !== null).length, complete: scores.every((s) => s !== null) };
  });
  const scoreWith = (w: readonly number[]) => scored.map((a) => (a.complete && w.some((x) => x > 0) ? formulas.weightedMean(a.scores.map((s, i) => ({ weight: w[i]!, value: s! }))) : null));
  const leaders = (values: ReadonlyArray<number | null>) => {
    const best = Math.max(...values.filter((v): v is number => v !== null));
    return scored.filter((_, i) => values[i] !== null && Math.abs(values[i]! - best) < 1e-12).map((a) => a.id).join(' = ');
  };
  const base = scoreWith(weights);
  const complete = scored.filter((a) => a.complete);
  const baseLeader = complete.length ? leaders(base) : null;
  const variants = complete.length ? RUBRIC.criteria.flatMap((c, i) => ([['weight set to 0', 0], ['weight doubled', 2]] as const).map(([variant, factor]) => {
    const values = scoreWith(weights.map((w, j) => (j === i ? Math.min(w * factor, LIMITS.MAX_WEIGHT) : w)));
    const leader = values.some((v) => v !== null) ? leaders(values) : null;
    return { criterion: c.label, variant, ...Object.fromEntries(scored.map((a, k) => [a.id, values[k] ?? null])), leader: leader ?? 'No score (all weights zero)', effect: leader === baseLeader ? 'unchanged' : 'changes' };
  })) : [];
  const changed = variants.filter((v) => v.effect === 'changes').length;
  const unit = 'weighted ordinal score (1–5)';
  return finish(req, 'weighted_rubric_score', {
    title: 'Reltronland–Depcutland cooperation: weighted rubric of three hypotheses',
    inputs: [
      ...RUBRIC.criteria.map((c, i) => userInput(`weights.${c.id}`, `Weight · ${c.label}`, weights[i]!, 'weight')),
      ...scored.flatMap((a) => RUBRIC.criteria.map((c, i) => userInput(`scores.${a.id}.${c.id}`, `Score · ${a.id} · ${c.label}`, a.scores[i] ?? 'Not scored', a.scores[i] === null ? '' : 'of 5'))),
    ],
    assumptions: [
      { text: 'Every score (1–5) and every weight is yours. The source assigns none, and none is prefilled or inferred.', owner: 'USER_SUPPLIED' },
      ...(note ? [{ text: `Your note: ${note}`, owner: 'USER_SUPPLIED' as const }] : []),
    ],
    source_role: 'user', source: null,
    result_label: complete.length ? `Highest weighted score under your weights: ${baseLeader}` : 'No alternative is fully scored', result_value: complete.length ? Math.max(...base.filter((v): v is number => v !== null)) : null, result_unit: unit,
    result_status: complete.length ? 'SCENARIO' : 'INSUFFICIENT_DATA', status_reason: complete.length ? 'A weighted aggregate of user-supplied ordinal judgments.' : 'RUBRIC_INCOMPLETE: no alternative has all seven criteria scored.',
    summary: [
      ...scored.map((a, i) => (a.complete
        ? { text: `${a.id} — ${a.label}: weighted score ${show(base[i]!)} of 5 (${a.count} of ${RUBRIC.criteria.length} criteria scored).`, status: 'SCENARIO' as const, source: null }
        : { text: `${a.id} — ${a.label}: incomplete, ${a.count} of ${RUBRIC.criteria.length} criteria scored. No score is computed and nothing is filled in.`, status: 'INSUFFICIENT_DATA' as const, source: null })),
      ...(complete.length ? [{ text: `Highest weighted score under your weights: ${baseLeader}. Removing or doubling one weight at a time changes the leading alternative in ${changed} of ${variants.length} variants.`, status: 'SCENARIO' as const, source: null }] : []),
    ],
    limitations: [
      'A decision aid only. An ordinal weighted aggregate is not a measured probability, a prediction confidence or proof of a causal outcome.',
      'The three alternatives are hypotheses. No treaty, war, migration or institutional outcome is asserted, and source passages are kept apart from your judgments.',
      NOT_CANON,
    ],
    tables: [
      {
        id: 'matrix', caption: 'Decision matrix: your weights and scores (weighted = weight × score)',
        columns: [{ key: 'criterion', label: 'Criterion', unit: '' }, { key: 'weight', label: 'Weight', unit: '' }, ...scored.flatMap((a) => [{ key: `score_${a.id}`, label: `${a.id} score`, unit: 'of 5' }, { key: `weighted_${a.id}`, label: `${a.id} weighted`, unit: '' }])],
        rows: RUBRIC.criteria.map((c, i) => ({ criterion: c.label, weight: weights[i]!, ...Object.fromEntries(scored.flatMap((a) => [[`score_${a.id}`, a.scores[i] ?? null], [`weighted_${a.id}`, a.scores[i] === null ? null : weights[i]! * a.scores[i]!]])) })),
      },
      {
        id: 'alternatives', caption: 'Weighted score by alternative',
        columns: [{ key: 'alternative', label: 'Alternative', unit: '' }, { key: 'scored', label: 'Criteria scored', unit: `of ${RUBRIC.criteria.length}` }, { key: 'score', label: 'Weighted score', unit: 'of 5' }, { key: 'state', label: 'State', unit: '' }],
        rows: scored.map((a, i) => ({ alternative: `${a.id} — ${a.label}`, scored: a.count, score: base[i] ?? null, state: a.complete ? 'COMPLETE' : 'INCOMPLETE' })),
      },
      ...(variants.length ? [{
        id: 'weight-sensitivity', caption: 'Sensitivity to your weights: one weight changed at a time',
        columns: [{ key: 'criterion', label: 'Criterion', unit: '' }, { key: 'variant', label: 'Variant', unit: '' }, ...scored.map((a) => ({ key: a.id, label: `${a.id} score`, unit: 'of 5' })), { key: 'leader', label: 'Highest score', unit: '' }, { key: 'effect', label: 'Leading alternative', unit: '' }],
        rows: variants,
      }] : []),
    ],
    evidence: rubricEvidence(ev),
  });
}

function run(ev: CalcEvidence, req: CalcRequest): CalcResult {
  switch (req.operation) {
    case 'calculate':
      if (!(req.formula in FORMULAS) || req.formula === ('weighted_rubric_score' as FormulaId)) break;
      if (req.formula === 'weighted_composition') return reallocation(ev, req);
      if ('category' in req) return shareCalc(ev, req);
      if ('entity_id' in req) return sourceDerived(ev, req);
      return plain(req);
    case 'projectScenario': return project(ev, req);
    case 'reconstructScenario': return reconstruct(ev, req);
    case 'compareScenarios': return compare(ev, req);
    case 'analyzeSensitivity': return sensitivity(ev, req);
    case 'evaluateQualitativeScenario': return qualitative(ev, req);
  }
  throw new CalcError('UNSUPPORTED_FORMULA', 'This operation or formula is not on the allowlist. Nothing was evaluated.', 'formula');
}

/** The single entry point of both interfaces. Never throws for a rejected request: it reports why. */
export function evaluate(evidence: CalcEvidence, request: CalcRequest): CalcOutcome {
  try {
    if (!request || typeof request !== 'object') throw new CalcError('INVALID_REQUEST', 'The request is not an object.');
    return { ok: true, result: run(evidence, request) };
  } catch (error) {
    if (error instanceof CalcError) return { ok: false, code: error.code, status: error.status, message: error.message, field: error.field };
    if (error instanceof Error && /must be an integer between|must not be older/.test(error.message)) return { ok: false, code: 'INVALID_BAC_YEAR', status: 'INVALID_INPUT', message: error.message, field: 'target_bac' };
    throw error;
  }
}

/** The six typed tools. Each is the same evaluator behind a narrower signature; none is a network service. */
type Body<T extends CalcRequest> = Omit<T, 'operation'>;
export const tools = Object.freeze({
  calculate: (ev: CalcEvidence, input: CalculateRequest extends infer R ? (R extends CalculateRequest ? Omit<R, 'operation'> : never) : never) => evaluate(ev, { operation: 'calculate', ...input } as CalculateRequest),
  projectScenario: (ev: CalcEvidence, input: Body<ProjectRequest>) => evaluate(ev, { operation: 'projectScenario', ...input }),
  reconstructScenario: (ev: CalcEvidence, input: Body<ReconstructRequest>) => evaluate(ev, { operation: 'reconstructScenario', ...input }),
  compareScenarios: (ev: CalcEvidence, input: Body<CompareRequest>) => evaluate(ev, { operation: 'compareScenarios', ...input }),
  evaluateQualitativeScenario: (ev: CalcEvidence, input: Body<QualitativeRequest>) => evaluate(ev, { operation: 'evaluateQualitativeScenario', ...input }),
  analyzeSensitivity: (ev: CalcEvidence, input: Body<SensitivityRequest>) => evaluate(ev, { operation: 'analyzeSensitivity', ...input }),
});
