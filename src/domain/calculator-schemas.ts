/**
 * Versioned Zod contracts of the Calculator: the request (the six tools), the result object and
 * the session hand-off between /calculator and /assistant. They guard every untrusted boundary
 * (stored hand-off payloads, exports read back). The engine in calculator.ts stays dependency-free
 * and enforces the numeric rules itself, so this file is never needed to evaluate a request.
 */
import { z } from 'zod';
import { CALC_RESULT_SCHEMA, CALC_STATUSES, FORMULAS, LIMITS, RUBRIC, SCENARIO_INDICATORS, type CalcRequest, type CalcResult, type FormulaId } from './calculator.ts';

export const CALC_HANDOFF_SCHEMA = 'reltroner-calculator-handoff.v1';

const entity = z.string().regex(/^[a-z_]+:[a-z0-9-]{1,80}$/);
const key = z.string().regex(/^[a-z0-9_]{1,64}$/);
const label = z.string().min(1).max(LIMITS.MAX_LABEL);
const scenario = { entity_id: entity, indicator: z.enum(SCENARIO_INDICATORS) };
const criteria = <T extends z.ZodType>(value: T) => z.strictObject({
  institutional_independence: value, diplomatic_coordination: value, domestic_tension: value, historical_continuity: value,
  canon_consistency: value, narrative_consequences: value, evidence_sufficiency: value,
});
const scores = criteria(z.number().optional());

/** Shape, types and size only. Numeric ranges are the engine's, so there is one rule set. */
export const CalcRequestSchema = z.union([
  z.strictObject({ operation: z.literal('calculate'), formula: z.enum(['population_x_ancestry_share', 'population_x_habitat_share', 'land_area_x_footprint_share']), entity_id: entity, category: key, share_pct: z.number().optional() }),
  z.strictObject({ operation: z.literal('calculate'), formula: z.enum(['gdp_per_capita', 'share_of_planetary_gdp']), entity_id: entity }),
  z.strictObject({ operation: z.literal('calculate'), formula: z.literal('percent_change'), base: z.number(), next: z.number() }),
  z.strictObject({ operation: z.literal('calculate'), formula: z.literal('percentage_point_difference'), old_pct: z.number(), new_pct: z.number() }),
  z.strictObject({ operation: z.literal('calculate'), formula: z.literal('compound_growth'), baseline: z.number(), annual_rate_pct: z.number(), years: z.number() }),
  z.strictObject({ operation: z.literal('calculate'), formula: z.literal('annualized_rate'), initial: z.number(), final: z.number(), years: z.number() }),
  z.strictObject({ operation: z.literal('calculate'), formula: z.literal('conditional_backcast'), anchor: z.number(), annual_rate_pct: z.number(), years: z.number() }),
  z.strictObject({ operation: z.literal('calculate'), formula: z.literal('weighted_composition'), entity_id: entity, dimension: z.enum(['ancestry', 'habitat', 'surface']), shares: z.record(key, z.number()).refine((r) => Object.keys(r).length <= 8) }),
  z.strictObject({ operation: z.literal('calculate'), formula: z.literal('scenario_difference'), a: z.number(), b: z.number() }),
  z.strictObject({ operation: z.literal('projectScenario'), ...scenario, annual_rate_pct: z.number(), horizon_years: z.number(), label }),
  z.strictObject({ operation: z.literal('reconstructScenario'), ...scenario, target_bac: z.number(), annual_rate_pct: z.number(), label }),
  z.strictObject({ operation: z.literal('compareScenarios'), ...scenario, horizon_years: z.number(), scenarios: z.array(z.strictObject({ label, annual_rate_pct: z.number() })).min(LIMITS.MIN_SCENARIOS).max(LIMITS.MAX_SCENARIOS) }),
  z.strictObject({ operation: z.literal('analyzeSensitivity'), ...scenario, horizon_years: z.number(), rate_min_pct: z.number(), rate_max_pct: z.number(), steps: z.number() }),
  z.strictObject({ operation: z.literal('evaluateQualitativeScenario'), weights: criteria(z.number()), scores: z.strictObject({ A: scores, B: scores, C: scores }), note: z.string().max(LIMITS.MAX_NOTE).optional() }),
]) satisfies z.ZodType<CalcRequest>;

const status = z.enum(CALC_STATUSES);
const owner = z.enum(['SOURCE_ASSIGNED', 'USER_SUPPLIED']);
const source = z.strictObject({
  role: z.enum(['production', 'remodeling']), repository: z.string().regex(/^Reltroner\/[a-z-]+$/), commit_sha: z.string().regex(/^[0-9a-f]{40}$/),
  path: z.string().min(1), pointer: z.string().nullable(), url: z.string().regex(/^https:\/\/github\.com\/Reltroner\/[a-z-]+\/blob\/[0-9a-f]{40}\//),
});
const cell = z.union([z.number(), z.string(), z.null()]);

export const CalcResultSchema = z.strictObject({
  schema_version: z.literal(CALC_RESULT_SCHEMA),
  calculation_id: z.string().regex(/^calc-[0-9a-f]{8}$/),
  operation: z.enum(['calculate', 'projectScenario', 'reconstructScenario', 'compareScenarios', 'analyzeSensitivity', 'evaluateQualitativeScenario']),
  formula_id: z.enum(Object.keys(FORMULAS) as [FormulaId, ...FormulaId[]]),
  formula_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  formula_expression: z.string().min(1),
  title: z.string().min(1),
  request: CalcRequestSchema,
  inputs: z.array(z.strictObject({ key: z.string(), label: z.string(), value: z.union([z.number(), z.string()]), unit: z.string(), owner, status, period: z.string().nullable(), source: source.nullable() })),
  assumptions: z.array(z.strictObject({ text: z.string(), owner })),
  denominator: z.string().nullable(),
  baseline_period: z.string().nullable(),
  horizon: z.union([
    z.strictObject({ kind: z.literal('YEARS_AFTER_YEAR_0'), years: z.number().int().positive() }),
    z.strictObject({ kind: z.literal('BAC'), target_bac: z.number().int().positive(), target_label: z.string(), elapsed_years: z.number().int().positive() }),
  ]).nullable(),
  source_role: z.enum(['production', 'remodeling', 'user']),
  source: source.nullable(),
  result_label: z.string().min(1),
  result_value: z.number().nullable(),
  result_unit: z.string(),
  result_status: status,
  status_reason: z.string().min(1),
  empirical_forecast: z.strictObject({
    status: z.literal('INSUFFICIENT_DATA'), reason: z.enum(['INSUFFICIENT_DATA_FOR_EMPIRICAL_FORECAST', 'NO_VALIDATED_EMPIRICAL_MODEL']),
    observed_points: z.number().int().nonnegative(), required_points: z.number().int().positive(),
  }).nullable(),
  summary: z.array(z.strictObject({ text: z.string(), status, source: source.nullable() })).min(1),
  limitations: z.array(z.string()).min(1),
  tables: z.array(z.strictObject({ id: z.string(), caption: z.string(), columns: z.array(z.strictObject({ key: z.string(), label: z.string(), unit: z.string() })), rows: z.array(z.record(z.string(), cell)) })),
  chart: z.strictObject({
    x_kind: z.enum(['ELAPSED_YEARS', 'BAC_AXIS', 'RATE_PCT']), x_title: z.string(), y_title: z.string(), unit: z.string(),
    series: z.array(z.strictObject({ id: z.string(), label: z.string(), kind: z.enum(['MODELED', 'SOURCE_ANCHOR']), status, points: z.array(z.strictObject({ x: z.number(), x_label: z.string(), value: z.number() })).max(LIMITS.MAX_SERIES_POINTS + 8) })),
  }).nullable(),
  evidence: z.array(z.strictObject({ criterion: z.string(), label: z.string(), state: z.enum(['SOURCE_PASSAGE', 'INSUFFICIENT_DATA']), text: z.string(), source: source.nullable() })),
}) satisfies z.ZodType<CalcResult>;

/** Same-origin, session-scoped and user-initiated. Only a request travels; the receiver recomputes it. */
export const CalcHandoffSchema = z.strictObject({
  schema_version: z.literal(CALC_HANDOFF_SCHEMA),
  target: z.enum(['calculator', 'assistant']),
  created_at_ms: z.number().int().nonnegative(),
  request: CalcRequestSchema,
});
export type CalcHandoff = z.infer<typeof CalcHandoffSchema>;

export const RUBRIC_CRITERION_IDS = RUBRIC.criteria.map((c) => c.id);
