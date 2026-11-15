import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixtureSnapshot } from '../../src/adapters/fixture-snapshot.ts';
import { answerCalculation, answerQuestion, type AgentIndex, type AgentNarrative, type AgentRelation } from '../../src/domain/assistant.ts';
import { CALC_STATUSES, FORMULAS, LIMITS, RUBRIC, evaluate, empiricalForecast, formulas, rubricEvidence, show, tools, type CalcOutcome, type CalcRequest, type CalcResult, type CriterionId } from '../../src/domain/calculator.ts';
import { CalcRequestSchema, CalcResultSchema } from '../../src/domain/calculator-schemas.ts';
import { buildComposition } from '../../src/engine/composition.ts';
import { CSV_HEADER, exportFilename, resultToCsv, resultToJson } from '../../src/engine/calculator/export.ts';
import { HANDOFF_KEY, HANDOFF_MAX_CHARS, HANDOFF_PATH, HANDOFF_TTL_MS, decodeHandoff, encodeHandoff, sessionStore, takeHandoff, writeHandoff } from '../../src/engine/calculator/handoff.ts';
import { NCCM_DATASET_PATH } from '../../src/engine/observations.ts';

const PROD = 'a'.repeat(40);
const DRAFT = 'b'.repeat(40);
const RELTRONLAND = 'country:reltronland';
const DEPCUTLAND = 'country:depcutland';
const PLANET = 'planet:asthortera';

/**
 * A pinned deterministic fixture. Populations, land areas, shares, GDP figures, the 1010 BAC values
 * and the foundation years of Reltronland, Depcutland and Asthortera are copied from the pinned NCCM
 * V6.5 sources, so every expected number below can be checked by hand. Calespia stands for a
 * development nation without ancestry shares or land area.
 */
function nccm(side: 'production' | 'remodeling') {
  const shares = { depeisit: 50, cistheta: 20, cosmeilian: 15, native: 10, phantomkind: 2.5, other: 2.5 };
  const nations: Array<Record<string, unknown>> = [
    { name: 'Reltronland', population_billion: 855, land_area_million_km2: 104, ancestry_primary_pct: { depeisit: 64, cistheta: 22, cosmeilian: 4, native: 5, phantomkind: 2, other: 3 } },
    { name: 'Depcutland', population_billion: 343, land_area_million_km2: 52, ancestry_primary_pct: { depeisit: 79, cistheta: 10, cosmeilian: 3, native: 4, phantomkind: 2, other: 2 } },
  ];
  if (side === 'remodeling') {
    nations[0]!.spatial_3d_canon = {
      status: 'C_creator_ratified_2026-11-01', reference: 'Year 0', land_footprint_denominator: 'national terrestrial area only', habitat_denominator: 'unique usual residents of country',
      land_surface_pct: { nature_minimal_intervention: 58, urban_active: 15, urban_operational_low_or_biological_zero: 14, urban_dormant: 13 },
      principal_habitat_pct: { surface_land: 70, underground: 22, underwater: 2, floating: 6 },
      polygon: null, constructed_volume_km3: null, habitable_volume_km3: null, marine_vertical_resident_distribution: null,
    };
  }
  const population = 855 + 343 + 91 + 120;
  return {
    schema_version: 'NCCM-FIXTURE',
    planet: {
      population_billion: population, sovereign_states: 5, land_area_million_km2: 4503,
      ancestry_primary_pct_representative_14_country_weighted: shares,
      ancestry_primary_headcount_billion_representative: Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, (population * v) / 100])),
      ancestry_reference_provenance: 'Frozen pre-migration 14-country population-weighted primary ancestry reference, denominator 3288B; preserved by explicit creator instruction.',
    },
    census: { pre_migration_reference: { planetary_proxy_ancestry_denominator_billion: 3288 } },
    countries_14: nations,
    countries_5: [{ name: 'Calespia', population_billion: 91, land_area_million_km2: side === 'production' ? null : 120, ancestry_primary_pct: null }],
    aggregate_remaining_18: { state_count: 2, population_billion: 120 },
  };
}

async function evidence(): Promise<AgentIndex> {
  const composition = await buildComposition(
    fixtureSnapshot('production', PROD, { [NCCM_DATASET_PATH]: JSON.stringify(nccm('production')) }),
    fixtureSnapshot('remodeling', DRAFT, { [NCCM_DATASET_PATH]: JSON.stringify(nccm('remodeling')) }),
  );
  const src = { repository: 'Reltroner/reltroner-studio', commit_sha: PROD, path: NCCM_DATASET_PATH };
  const fact = (entity_id: string, entity: string, indicator: string, label: string, value: number, unit: string, status: 'CANON_OBSERVED' | 'CANON_DERIVED', pointer: string) =>
    ({ entity_id, entity, indicator, label, value, unit, display: String(value), status, source: { ...src, pointer } });
  const nation = (id: string, name: string, population: number, gdp: number, perCapita: number, share: number) => [
    fact(id, name, 'population', 'Population', population, 'billion sentients', 'CANON_OBSERVED', `countries_14[${name}].population_billion`),
    fact(id, name, 'gdp_usd', 'Nominal GDP', gdp, 'USD per year', 'CANON_DERIVED', `countries_14[${name}].gdp_usd_annual_V6`),
    fact(id, name, 'gdp_per_capita', 'GDP per capita', perCapita, 'USD per sentient', 'CANON_DERIVED', `countries_14[${name}].gdp_per_capita_usd_V6`),
    fact(id, name, 'gdp_share', 'Share of planetary GDP', share, 'ratio of planetary GDP', 'CANON_OBSERVED', `countries_14[${name}].gdp_planet_share`),
  ];
  const passage = (file: string, line: number, quote: string) => ({ ...src, path: file, line, quote });
  const entity = (id: string, name: string, kind: string, source: AgentNarrative['source']): AgentNarrative => ({ id, name, kind, summary: `${name}.`, side: 'both', canon_status: 'CANON_OBSERVED', source });
  const relation = (id: string, type: string, source_id: string, target_id: string, source: AgentRelation['source'], verification: AgentRelation['verification'] = 'VERIFIED_SOURCE_GROUNDED'): AgentRelation =>
    ({ id, type, source_id, target_id, verification, causal_class: 'PARTICIPATION', rationale: 'Fixture.', source });
  const dossier = 'content/factions/reltronland-vs-depcutland.md';
  return {
    schema_version: 'reltroner-agent-index.v2', production_sha: PROD, remodeling_sha: DRAFT, composition,
    indicators: ['population', 'gdp_usd', 'gdp_per_capita', 'gdp_share', 'sdi'].map((id) => ({ id, label: id, unit: '' })),
    facts: [
      ...nation(RELTRONLAND, 'Reltronland', 855, 4.7448998686935e22, 55495904897, 0.42),
      ...nation(DEPCUTLAND, 'Depcutland', 343, 1.12786792870254e22, 32882446900.9487, 0.0998344629315648),
      fact(RELTRONLAND, 'Reltronland', 'sdi', 'Sentient Development Index', 0.984, 'scale 0–1', 'CANON_OBSERVED', 'countries_14[Reltronland].sdi'),
      fact('country:calespia', 'Calespia', 'population', 'Population', 91, 'billion sentients', 'CANON_OBSERVED', 'countries_5[Calespia].population_billion'),
      fact(PLANET, 'Asthortera', 'population', 'Population', 4412, 'billion sentients', 'CANON_OBSERVED', 'planet.population_billion'),
      fact(PLANET, 'Asthortera', 'gdp_usd', 'Nominal GDP', 1.12973806397464e23, 'USD per year', 'CANON_DERIVED', 'planet.year0.gdp_usd_annual_V6'),
    ],
    anchors: [
      { entity_id: RELTRONLAND, entity: 'Reltronland', indicator: 'population', label: 'Population', value: 1.52, unit: 'billion sentients', year_bac: 1010, status: 'CANON_OBSERVED', source: { ...src, path: 'content/events/history-timeline.md', pointer: null, line: 956 } },
      { entity_id: PLANET, entity: 'Asthortera', indicator: 'population', label: 'Population', value: 78.27, unit: 'billion sentients', year_bac: 1010, status: 'SCENARIO', source: { ...src, path: 'content/events/history-timeline.md', pointer: null, line: 1061 } },
    ],
    foundations: { [RELTRONLAND]: 1125, [DEPCUTLAND]: 1121 },
    narrative: [
      entity('nar:nation:reltronland', 'Reltronland', 'nation', passage('content/factions/reltronland.md', 24, 'Country: Reltronland')),
      entity('nar:nation:depcutland', 'Depcutland', 'nation', passage('content/factions/depcutland.md', 26, 'Country: Depcutland')),
      entity('nar:faction:henchoway', 'Henchoway', 'faction', passage('content/factions/henchoway.md', 16, 'To dive is to forget.')),
      entity('nar:conflict:reltronland-vs-depcutland', 'Reltronland vs Depcutland', 'conflict', passage(dossier, 15, 'The Twin Pillars of Conscious Civilization')),
    ],
    relations: [
      relation('NREL-1', 'CONFLICTS_WITH', 'nar:nation:reltronland', 'nar:nation:depcutland', passage(dossier, 21, 'War of Conscience (1048–1030 BAC)')),
      relation('NREL-2', 'CONFLICTS_WITH', 'nar:faction:henchoway', 'nar:nation:depcutland', passage(dossier, 461, 'Their disagreements do not prevent them from repeatedly needing to cooperate on global crises, Henchoway-linked threats and Nytherion-related risks.')),
      relation('NREL-3', 'MOTIVATED_BY', 'nar:nation:depcutland', 'nar:motivation:depcutland-wartime-strategic-fear', passage(dossier, 41, 'Loss of industry, independent agency, territory and national continuity')),
      // A remodeling-declared link must never be cited as a verified passage.
      relation('NREL-4', 'THEMATICALLY_RELATED', 'nar:faction:henchoway', 'nar:philosophy:nytherion-abyss', { ...passage('content/factions/henchoway.md', 24, 'Declared only.'), repository: 'Reltroner/reltroner-studio-remodeling', commit_sha: DRAFT }, 'DECLARED_PROVENANCE'),
    ],
    candidate_counts: {},
    routes: [],
  };
}

const ok = (o: CalcOutcome): CalcResult => { assert.ok(o.ok, o.ok ? '' : `${o.code}: ${o.message}`); return (o as { result: CalcResult }).result; };
const fail = (o: CalcOutcome, code: string, status: 'INVALID_INPUT' | 'INSUFFICIENT_DATA' = 'INVALID_INPUT') => {
  assert.equal(o.ok, false, 'the request must be rejected');
  if (!o.ok) { assert.equal(o.code, code); assert.equal(o.status, status); assert.ok(o.message.length > 10); }
};
/** Relative closeness. 1e-12 allows for one or two floating-point rounding steps in pow() and division, nothing more. */
const close = (actual: number, expected: number, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} is not within ${tolerance} of ${expected}`);
const project = (rate: number, years: number, entity = RELTRONLAND, label = 'Baseline assumption'): CalcRequest => ({ operation: 'projectScenario', entity_id: entity, indicator: 'population', annual_rate_pct: rate, horizon_years: years, label });
const weights = (value: number) => Object.fromEntries(RUBRIC.criteria.map((c) => [c.id, value])) as Record<CriterionId, number>;
const scores = (values: number[]) => Object.fromEntries(RUBRIC.criteria.slice(0, values.length).map((c, i) => [c.id, values[i]!])) as Partial<Record<CriterionId, number>>;

test('CALC-01 (1) every allowlisted formula returns a hand-checkable value and is versioned', async () => {
  const ev = await evidence();
  assert.equal(Object.keys(FORMULAS).length, 13);
  for (const f of Object.values(FORMULAS)) assert.match(f.version, /^\d+\.\d+\.\d+$/);
  assert.equal(formulas.shareOf(855, 22), 188.1);
  assert.equal(formulas.gdpPerCapita(2e12, 2), 1000);
  assert.equal(formulas.percentChange(200, 250), 25);
  assert.equal(formulas.percentChange(250, 200), -20);
  assert.equal(formulas.percentagePointDifference(22, 27), 5);
  assert.equal(formulas.compoundGrowth(100, 10, 2), 121.00000000000001);
  close(formulas.compoundGrowth(100, 10, 2), 121);
  close(formulas.annualizedRatePct(100, 121, 2), 10);
  close(formulas.backcast(121, 10, 2), 100);
  assert.equal(formulas.weightedMean([{ weight: 1, value: 2 }, { weight: 3, value: 4 }]), 3.5);
  assert.equal(formulas.closure([70, 22, 2, 6]), 100);
  assert.equal(formulas.difference(230.85, 188.1), 230.85 - 188.1);
  // One formula of each kind through the public entry point, with formula identity on the result.
  const r = ok(evaluate(ev, { operation: 'calculate', formula: 'percent_change', base: 200, next: 250 }));
  assert.deepEqual([r.formula_id, r.formula_version, r.result_value, r.result_unit, r.result_status, r.source_role, r.source], ['percent_change', '1.0.0', 25, '%', 'SCENARIO', 'user', null]);
  assert.match(r.limitations[0]!, /numbers you entered/);
  assert.equal(ok(evaluate(ev, { operation: 'calculate', formula: 'scenario_difference', a: 230.85, b: 188.1 })).result_value, 230.85 - 188.1);
  close(ok(evaluate(ev, { operation: 'calculate', formula: 'annualized_rate', initial: 855, final: 2312.6158241554067, years: 100 })).result_value!, 1, 1e-9);
  close(ok(evaluate(ev, { operation: 'calculate', formula: 'conditional_backcast', anchor: 343, annual_rate_pct: 0.4, years: 300 })).result_value!, 343 / 1.004 ** 300);
  close(ok(evaluate(ev, { operation: 'calculate', formula: 'compound_growth', baseline: 855, annual_rate_pct: 1, years: 100 })).result_value!, 855 * 1.01 ** 100);
});

test('CALC-01 (2, 3, 4) population × ancestry share, population × habitat share and land × footprint share keep their own denominators', async () => {
  const ev = await evidence();
  const ancestry = ok(evaluate(ev, { operation: 'calculate', formula: 'population_x_ancestry_share', entity_id: RELTRONLAND, category: 'depeisit' }));
  assert.deepEqual([ancestry.result_value, ancestry.result_unit, ancestry.result_status, ancestry.source_role], [547.2, 'billion residents', 'CANON_DERIVED', 'production']);
  assert.equal(ancestry.inputs.find((i) => i.key === 'source_share')!.status, 'CANON_OBSERVED');
  const habitat = ok(evaluate(ev, { operation: 'calculate', formula: 'population_x_habitat_share', entity_id: RELTRONLAND, category: 'underground' }));
  assert.deepEqual([habitat.result_value, habitat.result_unit, habitat.result_status, habitat.source_role], [188.1, 'billion residents', 'PROPOSED', 'remodeling']);
  assert.match(habitat.denominator!, /unique usual residents/);
  const land = ok(evaluate(ev, { operation: 'calculate', formula: 'land_area_x_footprint_share', entity_id: RELTRONLAND, category: 'nature_minimal_intervention' }));
  assert.deepEqual([land.result_value, land.result_unit, land.result_status], [60.32, 'million km²', 'PROPOSED']);
  assert.match(land.denominator!, /terrestrial land area/);
  // A resident habitat is never taken as a share of land, and a land class never as a share of residents.
  fail(evaluate(ev, { operation: 'calculate', formula: 'land_area_x_footprint_share', entity_id: RELTRONLAND, category: 'underground' }), 'DENOMINATOR_MISMATCH');
  fail(evaluate(ev, { operation: 'calculate', formula: 'population_x_habitat_share', entity_id: RELTRONLAND, category: 'urban_active' }), 'DENOMINATOR_MISMATCH');
  fail(evaluate(ev, { operation: 'calculate', formula: 'population_x_ancestry_share', entity_id: RELTRONLAND, category: 'floating' }), 'DENOMINATOR_MISMATCH');
  fail(evaluate(ev, { operation: 'calculate', formula: 'population_x_habitat_share', entity_id: RELTRONLAND, category: 'volcanic' }), 'UNKNOWN_CATEGORY');
});

test('CALC-01 (5, 6) GDP per capita converts billions to residents; the planetary share needs the same year, measure and source pin', async () => {
  const ev = await evidence();
  const perCapita = ok(evaluate(ev, { operation: 'calculate', formula: 'gdp_per_capita', entity_id: RELTRONLAND }));
  // 4.7448998686935e22 USD ÷ (855 × 10⁹ residents). 1e-9 is the engine's own tolerance against the source-carried value.
  close(perCapita.result_value!, 4.7448998686935e22 / 855e9, 1e-15);
  close(perCapita.result_value!, 55495904897, 1e-9);
  assert.deepEqual([perCapita.result_unit, perCapita.result_status, perCapita.inputs.map((i) => i.status)], ['USD per sentient', 'CANON_DERIVED', ['CANON_DERIVED', 'CANON_OBSERVED']]);
  assert.match(perCapita.limitations[0]!, /Equals the value the source itself carries/);
  const share = ok(evaluate(ev, { operation: 'calculate', formula: 'share_of_planetary_gdp', entity_id: DEPCUTLAND }));
  close(share.result_value!, 9.98344629315648, 1e-9);
  assert.deepEqual([share.result_unit, share.result_status], ['%', 'CANON_DERIVED']);
  const year0 = { value: 1.12973806397464e23, unit: 'USD per year', indicator: 'gdp_usd', period_bac: 0, commit_sha: PROD };
  assert.equal(formulas.shareOfTotal({ ...year0, value: year0.value / 4 }, year0), 25);
  // The 1010 BAC historical GDP reference is another model and year; a remodeling value is another source pin.
  assert.throws(() => formulas.shareOfTotal({ ...year0, value: 6.84e12, indicator: 'gdp_usd_nominal_historical', period_bac: 1010 }, year0), /INCOMPATIBLE_DENOMINATOR|differ in indicator/);
  assert.throws(() => formulas.shareOfTotal({ ...year0, period_bac: 1010 }, year0), /differ in period_bac/);
  assert.throws(() => formulas.shareOfTotal({ ...year0, commit_sha: DRAFT }, year0), /differ in commit_sha/);
  assert.throws(() => formulas.shareOfTotal({ ...year0, unit: 'REL per year' }, year0), /differ in unit/);
  // A recomputation that disagrees with the value the source carries is not reported as canon.
  const drifted = { ...ev, facts: ev.facts.map((f) => (f.entity_id === RELTRONLAND && f.indicator === 'gdp_per_capita' ? { ...f, value: f.value * 1.01 } : f)) };
  fail(evaluate(drifted, { operation: 'calculate', formula: 'gdp_per_capita', entity_id: RELTRONLAND }), 'SOURCE_DERIVATION_MISMATCH', 'INSUFFICIENT_DATA');
});

test('CALC-01 (7) percent change and percentage-point difference differ in value, sign and unit', async () => {
  const ev = await evidence();
  const pp = ok(evaluate(ev, { operation: 'calculate', formula: 'percentage_point_difference', old_pct: 22, new_pct: 27 }));
  const pct = ok(evaluate(ev, { operation: 'calculate', formula: 'percent_change', base: 22, next: 27 }));
  assert.deepEqual([pp.result_value, pp.result_unit], [5, 'percentage points']);
  close(pct.result_value!, (5 / 22) * 100);
  assert.equal(pct.result_unit, '%');
  assert.equal(ok(evaluate(ev, { operation: 'calculate', formula: 'percentage_point_difference', old_pct: 27, new_pct: 22 })).result_value, -5);
  assert.ok(ok(evaluate(ev, { operation: 'calculate', formula: 'percent_change', base: 27, next: 22 })).result_value! < 0);
});

test('CALC-01 (8) compound growth and the annualized rate are inverses', () => {
  for (const [start, rate, years] of [[855, 1, 100], [343, 0.4, 300], [4412, -0.25, 40], [1, 100, 10]] as const) {
    const end = formulas.compoundGrowth(start, rate, years);
    // The round trip goes through pow() twice, so 1e-9 relative is the honest bound.
    close(formulas.annualizedRatePct(start, end, years), rate, 1e-9);
    close(formulas.backcast(end, rate, years), start, 1e-9);
  }
});

test('CALC-02 Reltronland +1% for 100 years is a conditional SCENARIO from the pinned Year 0 source value', async () => {
  const ev = await evidence();
  const r = ok(evaluate(ev, project(1, 100)));
  close(r.result_value!, 855 * 1.01 ** 100);
  assert.equal(show(r.result_value, r.result_unit), '2,312.62 billion sentients');
  assert.deepEqual([r.result_status, r.result_unit, r.formula_id, r.baseline_period, r.horizon, r.source_role], ['SCENARIO', 'billion sentients', 'compound_growth', 'Year 0', { kind: 'YEARS_AFTER_YEAR_0', years: 100 }, 'production']);
  assert.match(r.result_label, /conditional scenario/);
  assert.deepEqual(r.source, { role: 'production', repository: 'Reltroner/reltroner-studio', commit_sha: PROD, path: NCCM_DATASET_PATH, pointer: 'countries_14[Reltronland].population_billion', url: `https://github.com/Reltroner/reltroner-studio/blob/${PROD}/${NCCM_DATASET_PATH}` });
  const [baseline, rate] = r.inputs;
  assert.deepEqual([baseline!.value, baseline!.unit, baseline!.owner, baseline!.status], [855, 'billion sentients', 'SOURCE_ASSIGNED', 'CANON_OBSERVED']);
  assert.deepEqual([rate!.value, rate!.unit, rate!.owner, rate!.status], [1, '% per year', 'USER_SUPPLIED', 'SCENARIO']);
  assert.ok(r.assumptions.every((a) => a.owner === 'USER_SUPPLIED'));
  assert.ok(r.limitations.some((l) => /not an empirically validated forecast/.test(l)));
  assert.ok(r.limitations.some((l) => /no future calendar convention/.test(l)));
  // Chart and table carry the same samples; the anchor is a separate source series, never a modeled point.
  const modeled = r.chart!.series.find((s) => s.kind === 'MODELED')!;
  const anchor = r.chart!.series.find((s) => s.kind === 'SOURCE_ANCHOR')!;
  const table = r.tables.find((t) => t.id === 'trajectory')!;
  assert.equal(modeled.points.length, 101);
  assert.deepEqual(modeled.points.map((p) => p.value), table.rows.map((row) => row['scenario-1']));
  assert.deepEqual([modeled.points[0]!.value, modeled.points.at(-1)!.value, modeled.status], [855, r.result_value, 'SCENARIO']);
  assert.deepEqual([anchor.status, anchor.points], ['CANON_OBSERVED', [{ x: 0, x_label: 'Year 0', value: 855 }]]);
  assert.ok(modeled.points.every((p) => !/BAC/.test(p.x_label)), 'no future BAC convention is invented');
  // The sampling grid stays bounded for long horizons and always includes both ends.
  const long = ok(evaluate(ev, project(0.1, LIMITS.MAX_PERIODS)));
  const points = long.chart!.series[0]!.points;
  assert.ok(points.length <= LIMITS.MAX_SERIES_POINTS);
  assert.deepEqual([points[0]!.x, points.at(-1)!.x], [0, LIMITS.MAX_PERIODS]);
});

test('CALC-03 (9, 15) a backcast uses BAC arithmetic, shows source values apart from modeled ones and imputes nothing', async () => {
  const ev = await evidence();
  const r = ok(evaluate(ev, { operation: 'reconstructScenario', entity_id: DEPCUTLAND, indicator: 'population', target_bac: 300, annual_rate_pct: 0.4, label: 'Slow growth' }));
  close(r.result_value!, 343 / 1.004 ** 300);
  assert.equal(show(r.result_value, r.result_unit), '103.56 billion sentients');
  assert.deepEqual([r.result_status, r.formula_id, r.horizon], ['SCENARIO', 'conditional_backcast', { kind: 'BAC', target_bac: 300, target_label: '300 BAC', elapsed_years: 300 }]);
  assert.match(r.result_label, /conditional historical backcast/);
  assert.ok(r.limitations.some((l) => /not canon/.test(l)) && r.limitations.some((l) => /nothing is interpolated/.test(l)) && r.limitations.some((l) => /not Earth BCE/.test(l)));
  // Older is on the left: the axis runs from −300 (300 BAC) to 0 (Year 0).
  const modeled = r.chart!.series.find((s) => s.kind === 'MODELED')!;
  assert.deepEqual([modeled.points[0]!.x, modeled.points[0]!.x_label, modeled.points.at(-1)!.x, modeled.points.at(-1)!.x_label], [-300, '300 BAC', 0, 'Year 0']);
  close(modeled.points.at(-1)!.value, 343);
  // Depcutland has one source value (Year 0). Every other row is modeled and says so.
  const rows = r.tables[0]!.rows;
  assert.deepEqual(rows.filter((row) => row.source !== null).map((row) => [row.year, row.source, row.source_status]), [['Year 0', 343, 'CANON_OBSERVED']]);
  assert.ok(rows.filter((row) => row.year !== 'Year 0').every((row) => row.source === null && row.source_status === 'Not observed'));
  assert.equal(r.chart!.series.filter((s) => s.kind === 'SOURCE_ANCHOR').reduce((n, s) => n + s.points.length, 0), 1);

  // Reltronland has a real 1010 BAC source value: it is shown next to the curve and never replaced by it.
  const rel = ok(evaluate(ev, { operation: 'reconstructScenario', entity_id: RELTRONLAND, indicator: 'population', target_bac: 1010, annual_rate_pct: 0.4, label: 'x' }));
  const observed = rel.chart!.series.find((s) => s.id === 'source-1010')!;
  assert.deepEqual([observed.kind, observed.status, observed.points], ['SOURCE_ANCHOR', 'CANON_OBSERVED', [{ x: -1010, x_label: '1010 BAC', value: 1.52 }]]);
  assert.ok(rel.summary.some((s) => s.status === 'CANON_OBSERVED' && /source itself gives 1\.52 billion sentients for 1010 BAC/.test(s.text) && /the source stands/.test(s.text)));
  assert.equal(rel.summary.find((s) => /source itself/.test(s.text))!.source!.url, `https://github.com/Reltroner/reltroner-studio/blob/${PROD}/content/events/history-timeline.md#L956`);
  assert.deepEqual(rel.tables[0]!.rows.filter((row) => row.source !== null).map((row) => row.year), ['1010 BAC', 'Year 0']);
  // The source's own planetary scenario (0.4% CAGR to 1010 BAC ≈ 78.27 B) is reproduced by the same formula and keeps its SCENARIO label.
  const planet = ok(evaluate(ev, { operation: 'reconstructScenario', entity_id: PLANET, indicator: 'population', target_bac: 1010, annual_rate_pct: 0.4, label: 'x' }));
  close(planet.result_value!, 78.27, 1e-3);
  assert.equal(planet.chart!.series.find((s) => s.id === 'source-1010')!.status, 'SCENARIO');

  // Chronology and domain.
  const at = (target: number, entity = DEPCUTLAND) => evaluate(ev, { operation: 'reconstructScenario', entity_id: entity, indicator: 'population', target_bac: target, annual_rate_pct: 0.4, label: 'x' });
  fail(at(0), 'TARGET_NOT_OLDER_THAN_ANCHOR');
  fail(at(-5), 'INVALID_BAC_YEAR');
  fail(at(300.5), 'INVALID_BAC_YEAR');
  fail(at(LIMITS.MAX_PERIODS + 1, PLANET), 'HORIZON_OUT_OF_RANGE');
  assert.equal(ok(at(1121)).horizon!.kind, 'BAC');
  fail(at(1122), 'BEFORE_SOVEREIGN_FOUNDATION', 'INSUFFICIENT_DATA');
  fail(at(1126, RELTRONLAND), 'BEFORE_SOVEREIGN_FOUNDATION', 'INSUFFICIENT_DATA');
});

test('CALC-01 (10) invalid numbers, rates, horizons, units and formulas are rejected, never clamped', async () => {
  const ev = await evidence();
  fail(evaluate(ev, { operation: 'calculate', formula: 'percent_change', base: 0, next: 5 }), 'DIVISION_BY_ZERO');
  assert.throws(() => formulas.gdpPerCapita(1e12, 0), /greater than zero/);
  fail(evaluate(ev, { operation: 'calculate', formula: 'annualized_rate', initial: 0, final: 5, years: 3 }), 'DIVISION_BY_ZERO');
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    fail(evaluate(ev, project(bad, 100)), Number.isNaN(bad) ? 'NOT_A_NUMBER' : 'NOT_FINITE');
    fail(evaluate(ev, { operation: 'calculate', formula: 'compound_growth', baseline: bad, annual_rate_pct: 1, years: 10 }), Number.isNaN(bad) ? 'NOT_A_NUMBER' : 'NOT_FINITE');
  }
  fail(evaluate(ev, { operation: 'calculate', formula: 'compound_growth', baseline: '855' as unknown as number, annual_rate_pct: 1, years: 10 }), 'NOT_A_NUMBER');
  fail(evaluate(ev, { operation: 'calculate', formula: 'compound_growth', baseline: -855, annual_rate_pct: 1, years: 10 }), 'NEGATIVE_VALUE');
  fail(evaluate(ev, { operation: 'calculate', formula: 'conditional_backcast', anchor: -1, annual_rate_pct: 1, years: 10 }), 'NEGATIVE_VALUE');
  assert.throws(() => formulas.shareOf(-855, 22), /must not be negative/);
  for (const rate of [LIMITS.RATE_MIN_PCT - 0.01, LIMITS.RATE_MAX_PCT + 0.01, -100, -150]) fail(evaluate(ev, project(rate, 10)), 'RATE_OUT_OF_RANGE');
  for (const rate of [LIMITS.RATE_MIN_PCT, LIMITS.RATE_MAX_PCT, 0]) ok(evaluate(ev, project(rate, 10)));
  for (const years of [0, -1, 1.5, LIMITS.MAX_PERIODS + 1]) fail(evaluate(ev, project(1, years)), 'HORIZON_OUT_OF_RANGE');
  // 100% a year for 1,200 years overflows a double: reported, not clamped to a large number.
  fail(evaluate(ev, project(100, 1200)), 'NUMERIC_OVERFLOW');
  for (const share of [-1, 100.5]) fail(evaluate(ev, { operation: 'calculate', formula: 'population_x_habitat_share', entity_id: RELTRONLAND, category: 'underground', share_pct: share }), 'SHARE_OUT_OF_RANGE');
  fail(evaluate(ev, { operation: 'calculate', formula: 'arima_forecast' } as unknown as CalcRequest), 'UNSUPPORTED_FORMULA');
  fail(evaluate(ev, { operation: 'calculate', formula: 'weighted_rubric_score' } as unknown as CalcRequest), 'UNSUPPORTED_FORMULA');
  fail(evaluate(ev, { operation: 'runSql', query: 'select 1' } as unknown as CalcRequest), 'UNSUPPORTED_FORMULA');
  fail(evaluate(ev, null as unknown as CalcRequest), 'INVALID_REQUEST');
  fail(evaluate(ev, { ...project(1, 10), indicator: 'sdi' } as unknown as CalcRequest), 'UNSUPPORTED_INDICATOR', 'INSUFFICIENT_DATA');
  fail(evaluate(ev, project(1, 10, RELTRONLAND, '')), 'INVALID_TEXT');
  fail(evaluate(ev, project(1, 10, RELTRONLAND, 'two\nlines')), 'INVALID_TEXT');
  fail(evaluate(ev, project(1, 10, RELTRONLAND, 'x'.repeat(LIMITS.MAX_LABEL + 1))), 'INVALID_TEXT');
});

test('CALC-06 (11, 16) Spatial what-if: 855 B × 27% = 230.85 B, a 105% distribution is rejected, a closed reallocation is accepted', async () => {
  const ev = await evidence();
  const single = ok(evaluate(ev, { operation: 'calculate', formula: 'population_x_habitat_share', entity_id: RELTRONLAND, category: 'underground', share_pct: 27 }));
  assert.deepEqual([single.result_value, single.result_unit, single.result_status, single.source_role], [230.85, 'billion residents', 'SCENARIO', 'remodeling']);
  assert.deepEqual(single.tables[0]!.rows.map((row) => [row.case, row.share, row.value, row.status]), [['Source', 22, 188.1, 'PROPOSED'], ['What-if', 27, 230.85, 'SCENARIO'], ['Difference', 5, 230.85 - 188.1, 'SCENARIO']]);
  // The single-category mode says that nothing else was recalculated and what the shares would sum to.
  assert.match(single.limitations[0]!, /Single-category conditional count: only Underground is recomputed/);
  assert.match(single.limitations[0]!, /would sum to 105\.00%/);
  assert.ok(single.assumptions.some((a) => /held at 855\.00 billion residents/.test(a.text)));

  const reallocate = (shares: Record<string, number>) => evaluate(ev, { operation: 'calculate', formula: 'weighted_composition', entity_id: RELTRONLAND, dimension: 'habitat', shares });
  fail(reallocate({ surface_land: 70, underground: 27, underwater: 2, floating: 6 }), 'COMPOSITION_NOT_CLOSED');
  fail(reallocate({ surface_land: 70, underground: 22, underwater: 2, floating: 5.99 }), 'COMPOSITION_NOT_CLOSED');
  fail(reallocate({ surface_land: 73, underground: 27 }), 'COMPOSITION_INCOMPLETE');
  fail(reallocate({ surface_land: 65, underground: 27, underwater: 2, floating: 6, urban_active: 0 }), 'DENOMINATOR_MISMATCH');
  fail(reallocate({ surface_land: 108, underground: -8, underwater: 0, floating: 0 }), 'SHARE_OUT_OF_RANGE');
  const closed = ok(reallocate({ surface_land: 65, underground: 27, underwater: 2, floating: 6 }));
  assert.deepEqual([closed.result_value, closed.result_status, closed.formula_id], [855, 'SCENARIO', 'weighted_composition']);
  assert.deepEqual(closed.tables[0]!.rows.map((row) => [row.category, row.source_share, row.scenario_share, row.scenario_value]), [['Land surface', 70, 65, 555.75], ['Underground', 22, 27, 230.85], ['Underwater', 2, 2, 17.1], ['Floating', 6, 6, 51.3]]);
  assert.equal(closed.tables[0]!.rows.reduce((s, row) => s + (row.scenario_value as number), 0), 855);
  // Land shares are reallocated over land area, in million km², never over residents.
  const land = ok(evaluate(ev, { operation: 'calculate', formula: 'weighted_composition', entity_id: RELTRONLAND, dimension: 'surface', shares: { nature_minimal_intervention: 50, urban_active: 23, urban_operational_low_or_biological_zero: 14, urban_dormant: 13 } }));
  assert.deepEqual([land.result_value, land.result_unit], [104, 'million km²']);
});

test('CALC-01 (12, 13) a user assumption is never canon and a remodeling value is never relabeled production', async () => {
  const ev = await evidence();
  const requests: CalcRequest[] = [
    project(1, 100),
    { operation: 'reconstructScenario', entity_id: DEPCUTLAND, indicator: 'population', target_bac: 300, annual_rate_pct: 0.4, label: 'x' },
    { operation: 'compareScenarios', entity_id: RELTRONLAND, indicator: 'gdp_usd', horizon_years: 20, scenarios: [{ label: 'a', annual_rate_pct: 1 }, { label: 'b', annual_rate_pct: 2 }] },
    { operation: 'analyzeSensitivity', entity_id: RELTRONLAND, indicator: 'gdp_per_capita', horizon_years: 20, rate_min_pct: 0, rate_max_pct: 2, steps: 3 },
    { operation: 'calculate', formula: 'population_x_ancestry_share', entity_id: RELTRONLAND, category: 'depeisit', share_pct: 60 },
    { operation: 'calculate', formula: 'population_x_habitat_share', entity_id: RELTRONLAND, category: 'floating', share_pct: 6 },
    { operation: 'calculate', formula: 'weighted_composition', entity_id: RELTRONLAND, dimension: 'ancestry', shares: { depeisit: 60, cistheta: 26, cosmeilian: 4, native: 5, phantomkind: 2, other: 3 } },
    { operation: 'evaluateQualitativeScenario', weights: weights(1), scores: { A: scores([4, 4, 4, 4, 4, 4, 4]), B: {}, C: {} } },
  ];
  for (const request of requests) {
    const r = ok(evaluate(ev, request));
    assert.equal(r.result_status, 'SCENARIO', r.title);
    assert.ok(r.summary.filter((s) => s.source === null).every((s) => s.status === 'SCENARIO' || s.status === 'INSUFFICIENT_DATA'), 'a statement without a source is never canon');
    assert.ok(r.inputs.filter((i) => i.owner === 'USER_SUPPLIED').every((i) => i.status === 'SCENARIO' && i.source === null));
  }
  // Remodeling values: PROPOSED with the remodeling repository and pin, on every input, summary line and source.
  const habitat = ok(evaluate(ev, { operation: 'calculate', formula: 'population_x_habitat_share', entity_id: RELTRONLAND, category: 'floating' }));
  assert.equal(habitat.result_status, 'PROPOSED');
  assert.ok(habitat.inputs.every((i) => i.status === 'PROPOSED' && i.source!.role === 'remodeling' && i.source!.commit_sha === DRAFT));
  assert.deepEqual([habitat.source!.repository, habitat.source!.pointer], ['Reltroner/reltroner-studio-remodeling', 'countries_14[0].spatial_3d_canon.principal_habitat_pct']);
  assert.match(habitat.source!.url, new RegExp(`^https://github.com/Reltroner/reltroner-studio-remodeling/blob/${DRAFT}/`));
  assert.ok(habitat.limitations.some((l) => /not published production canon/.test(l)));
  // The engine cannot emit MODEL_ESTIMATE or ARCHIVED at all.
  assert.deepEqual([...CALC_STATUSES], ['CANON_OBSERVED', 'CANON_DERIVED', 'SCENARIO', 'PROPOSED', 'INSUFFICIENT_DATA']);
});

test('CALC-02 (14) the empirical forecast is INSUFFICIENT_DATA_FOR_EMPIRICAL_FORECAST while the scenario still runs', async () => {
  const ev = await evidence();
  assert.deepEqual(empiricalForecast(ev, DEPCUTLAND, 'population'), { status: 'INSUFFICIENT_DATA', reason: 'INSUFFICIENT_DATA_FOR_EMPIRICAL_FORECAST', observed_points: 1, required_points: LIMITS.MIN_EMPIRICAL_POINTS });
  // Reltronland: Year 0 plus the 1010 BAC value. The planet's 1010 BAC value is a source scenario and does not count as observed.
  assert.equal(empiricalForecast(ev, RELTRONLAND, 'population').observed_points, 2);
  assert.equal(empiricalForecast(ev, PLANET, 'population').observed_points, 1);
  assert.equal(empiricalForecast(ev, 'country:atlantis', 'population').observed_points, 0);
  const r = ok(evaluate(ev, project(1, 100)));
  assert.equal(r.empirical_forecast!.reason, 'INSUFFICIENT_DATA_FOR_EMPIRICAL_FORECAST');
  assert.ok(r.summary.some((s) => s.status === 'INSUFFICIENT_DATA' && /INSUFFICIENT_DATA_FOR_EMPIRICAL_FORECAST/.test(s.text)));
  assert.equal(r.result_status, 'SCENARIO');
  // Even with many observed points nothing is labeled MODEL_ESTIMATE: no validated model exists.
  const dense = { ...ev, anchors: Array.from({ length: 12 }, (_, i) => ({ ...ev.anchors![0]!, year_bac: 100 + i })) };
  assert.equal(empiricalForecast(dense, RELTRONLAND, 'population').reason, 'NO_VALIDATED_EMPIRICAL_MODEL');
});

test('CALC-06 (17) three scenarios keep their order and a rate sweep is deterministic with exact boundary samples', async () => {
  const ev = await evidence();
  const request: CalcRequest = { operation: 'compareScenarios', entity_id: RELTRONLAND, indicator: 'population', horizon_years: 50, scenarios: [{ label: 'Aggressive', annual_rate_pct: 2 }, { label: 'Conservative', annual_rate_pct: 0.5 }, { label: 'Baseline assumption', annual_rate_pct: 1 }] };
  const r = ok(evaluate(ev, request));
  const summary = r.tables.find((t) => t.id === 'summary')!.rows;
  assert.deepEqual(summary.map((row) => [row.scenario, row.rate, row.rank]), [['Aggressive', 2, 1], ['Conservative', 0.5, 3], ['Baseline assumption', 1, 2]]);
  for (const row of summary) close(row.final as number, 855 * (1 + (row.rate as number) / 100) ** 50);
  close(r.result_value!, 855 * 1.02 ** 50 - 855 * 1.005 ** 50);
  assert.match(r.result_label, /not a confidence interval/);
  assert.deepEqual(r.chart!.series.map((s) => s.label), ['Aggressive', 'Conservative', 'Baseline assumption', 'Source value · CANON_OBSERVED']);
  for (const [i, s] of r.chart!.series.slice(0, 3).entries()) assert.deepEqual(s.points.map((p) => p.value), r.tables.find((t) => t.id === 'trajectory')!.rows.map((row) => row[`scenario-${i + 1}`]));
  fail(evaluate(ev, { ...request, scenarios: request.scenarios.slice(0, 1) }), 'SCENARIO_COUNT');
  fail(evaluate(ev, { ...request, scenarios: [...request.scenarios, { label: 'Fourth', annual_rate_pct: 3 }] }), 'SCENARIO_COUNT');
  fail(evaluate(ev, { ...request, scenarios: [{ label: 'Same', annual_rate_pct: 1 }, { label: 'Same', annual_rate_pct: 2 }] }), 'DUPLICATE_LABEL');

  const sweep: CalcRequest = { operation: 'analyzeSensitivity', entity_id: RELTRONLAND, indicator: 'population', horizon_years: 50, rate_min_pct: 0, rate_max_pct: 2, steps: 5 };
  const s = ok(evaluate(ev, sweep));
  const rows = s.tables[0]!.rows;
  assert.deepEqual(rows.map((row) => row.rate), [0, 0.5, 1, 1.5, 2]);
  assert.deepEqual([rows[0]!.final, rows[0]!.absolute, rows[0]!.relative], [855, 0, 0]);
  close(rows.at(-1)!.final as number, 855 * 1.02 ** 50);
  assert.deepEqual(s.chart!.series[0]!.points.map((p) => [p.x, p.value]), rows.map((row) => [row.rate, row.final]));
  assert.ok(rows.every((row, i) => i === 0 || (row.final as number) > (rows[i - 1]!.final as number)), 'a higher rate gives a higher value');
  assert.ok(s.limitations[0]!.includes('scenario range, not a confidence interval'));
  // Awkward bounds are still sampled exactly at both ends.
  const odd = ok(evaluate(ev, { ...sweep, rate_min_pct: -0.3, rate_max_pct: 0.7, steps: 101 })).tables[0]!.rows;
  assert.deepEqual([odd.length, odd[0]!.rate, odd.at(-1)!.rate], [101, -0.3, 0.7]);
  // Same input, same output: byte-identical results and exports, and a stable identity.
  assert.equal(resultToJson(ok(evaluate(ev, sweep))), resultToJson(s));
  assert.equal(resultToCsv(ok(evaluate(ev, structuredClone(sweep)))), resultToCsv(s));
  assert.equal(ok(evaluate(ev, { ...sweep })).calculation_id, s.calculation_id);
  assert.notEqual(ok(evaluate(ev, { ...sweep, steps: 6 })).calculation_id, s.calculation_id);
  for (const steps of [1, 102, 2.5]) fail(evaluate(ev, { ...sweep, steps }), 'STEPS_OUT_OF_RANGE');
  fail(evaluate(ev, { ...sweep, rate_min_pct: 2, rate_max_pct: 2 }), 'RANGE_ORDER');
  fail(evaluate(ev, { ...sweep, rate_max_pct: 500 }), 'RATE_OUT_OF_RANGE');
});

test('CALC-04 (18) the rubric scores only complete alternatives, rejects bad scores and weights, and never states a probability', async () => {
  const ev = await evidence();
  const request = (w: Record<CriterionId, number>, s: Partial<Record<'A' | 'B' | 'C', Partial<Record<CriterionId, number>>>>): CalcRequest => ({ operation: 'evaluateQualitativeScenario', weights: w, scores: { A: {}, B: {}, C: {}, ...s } });
  const full = { A: scores([4, 4, 4, 4, 4, 4, 4]), B: scores([5, 3, 2, 4, 4, 3, 2]), C: scores([2, 1, 3]) };
  const r = ok(evaluate(ev, request(weights(1), full)));
  const rows = r.tables.find((t) => t.id === 'alternatives')!.rows;
  assert.deepEqual(rows.map((row) => [row.scored, row.score, row.state]), [[7, 4, 'COMPLETE'], [7, 23 / 7, 'COMPLETE'], [3, null, 'INCOMPLETE']]);
  assert.deepEqual([r.result_status, r.result_value, r.result_unit, r.formula_id, r.source_role], ['SCENARIO', 4, 'weighted ordinal score (1–5)', 'weighted_rubric_score', 'user']);
  assert.match(r.result_label, /Highest weighted score under your weights: A$/);
  assert.ok(r.summary.some((s) => s.status === 'INSUFFICIENT_DATA' && /^C — No cooperation: incomplete, 3 of 7 criteria scored/.test(s.text)));
  // Σ(weight × score) ÷ Σ(weight): doubling the first weight gives B (2×5 + 3+2+4+4+3+2) ÷ 8 = 3.5.
  const heavy = ok(evaluate(ev, request({ ...weights(1), institutional_independence: 2 }, full)));
  assert.equal(heavy.tables.find((t) => t.id === 'alternatives')!.rows[1]!.score, 3.5);
  const matrix = heavy.tables.find((t) => t.id === 'matrix')!.rows[0]!;
  assert.deepEqual([matrix.weight, matrix.score_B, matrix.weighted_B, matrix.score_C, matrix.weighted_C], [2, 5, 10, 2, 4]);
  assert.equal(heavy.tables.find((t) => t.id === 'matrix')!.rows[3]!.score_C, null, 'an unscored cell stays empty');
  // Weight sensitivity: one weight at a time set to 0 and doubled, for each of the seven criteria.
  const sensitivity = r.tables.find((t) => t.id === 'weight-sensitivity')!.rows;
  assert.equal(sensitivity.length, 14);
  assert.deepEqual([sensitivity[0]!.variant, sensitivity[0]!.A, sensitivity[0]!.B, sensitivity[0]!.C, sensitivity[0]!.leader], ['weight set to 0', 4, 18 / 6, null, 'A']);
  assert.equal(sensitivity[1]!.B, 28 / 8);
  // A tie is reported as a tie, not broken silently.
  assert.match(ok(evaluate(ev, request(weights(1), { A: scores([3, 3, 3, 3, 3, 3, 3]), B: scores([3, 3, 3, 3, 3, 3, 3]) }))).result_label, /A = B$/);
  // Determinism and stability.
  assert.deepEqual(evaluate(ev, request(weights(1), full)), evaluate(ev, request(weights(1), structuredClone(full))));

  const none = ok(evaluate(ev, request(weights(1), {})));
  assert.deepEqual([none.result_status, none.result_value, none.status_reason.startsWith('RUBRIC_INCOMPLETE')], ['INSUFFICIENT_DATA', null, true]);
  assert.equal(none.tables.some((t) => t.id === 'weight-sensitivity'), false);
  fail(evaluate(ev, request(weights(0), full)), 'ZERO_TOTAL_WEIGHT');
  fail(evaluate(ev, request({ ...weights(1), domestic_tension: -1 }, full)), 'NEGATIVE_VALUE');
  fail(evaluate(ev, request({ ...weights(1), domestic_tension: Number.NaN }, full)), 'NOT_A_NUMBER');
  fail(evaluate(ev, request({ ...weights(1), domestic_tension: LIMITS.MAX_WEIGHT + 1 }, full)), 'WEIGHT_OUT_OF_RANGE');
  const { domestic_tension: _omitted, ...sixWeights } = weights(1);
  fail(evaluate(ev, request(sixWeights as Record<CriterionId, number>, full)), 'NOT_A_NUMBER');
  for (const bad of [0, 6, 2.5]) fail(evaluate(ev, request(weights(1), { A: { ...full.A, canon_consistency: bad } })), 'INVALID_SCORE');
  assert.throws(() => formulas.weightedMean([{ weight: 0, value: 3 }]), /sum to zero/);

  // No probability, confidence or likelihood is ever produced as a value, unit, column or statement.
  const numeric = JSON.stringify({ unit: r.result_unit, columns: r.tables.flatMap((t) => t.columns), summary: r.summary, label: r.result_label, inputs: r.inputs.map((i) => i.unit) });
  assert.doesNotMatch(numeric, /probab|confiden|likel|odds|%/i);
  assert.ok(r.limitations.some((l) => /not a measured probability, a prediction confidence or proof of a causal outcome/.test(l)));
  assert.ok(r.limitations.some((l) => /No treaty, war, migration or institutional outcome is asserted/.test(l)));
  // Evidence: a verified passage is cited with its pin; a declared-only or missing passage is INSUFFICIENT_DATA, never a citation.
  const links = Object.fromEntries(rubricEvidence(ev).map((e) => [e.criterion, e]));
  assert.deepEqual([links.historical_continuity!.state, links.historical_continuity!.text], ['SOURCE_PASSAGE', '“War of Conscience (1048–1030 BAC)”']);
  assert.equal(links.historical_continuity!.source!.url, `https://github.com/Reltroner/reltroner-studio/blob/${PROD}/content/factions/reltronland-vs-depcutland.md#L21`);
  assert.match(links.diplomatic_coordination!.text, /needing to cooperate on global crises, Henchoway-linked threats and Nytherion-related risks/);
  assert.equal(links.canon_consistency!.state, 'SOURCE_PASSAGE');
  for (const id of ['domestic_tension', 'narrative_consequences', 'evidence_sufficiency']) assert.deepEqual([links[id]!.state, links[id]!.source], ['INSUFFICIENT_DATA', null], id);
  assert.match(links.evidence_sufficiency!.text, /^4 of the 6 other criteria/);
  assert.deepEqual(rubricEvidence({ ...ev, narrative: [], relations: [] }).map((e) => e.state), Array(7).fill('INSUFFICIENT_DATA'));
});

test('CALC-01 (19) every result carries a pinned source or a user-data disclosure and round-trips through its contract', async () => {
  const ev = await evidence();
  const requests: CalcRequest[] = [
    { operation: 'calculate', formula: 'population_x_ancestry_share', entity_id: DEPCUTLAND, category: 'depeisit' },
    { operation: 'calculate', formula: 'gdp_per_capita', entity_id: RELTRONLAND },
    { operation: 'calculate', formula: 'percentage_point_difference', old_pct: 22, new_pct: 27 },
    { operation: 'calculate', formula: 'weighted_composition', entity_id: RELTRONLAND, dimension: 'habitat', shares: { surface_land: 65, underground: 27, underwater: 2, floating: 6 } },
    project(1, 100),
    { operation: 'reconstructScenario', entity_id: RELTRONLAND, indicator: 'population', target_bac: 1010, annual_rate_pct: 0.4, label: 'x' },
    { operation: 'compareScenarios', entity_id: RELTRONLAND, indicator: 'population', horizon_years: 50, scenarios: [{ label: 'a', annual_rate_pct: 0.5 }, { label: 'b', annual_rate_pct: 1 }] },
    { operation: 'analyzeSensitivity', entity_id: RELTRONLAND, indicator: 'population', horizon_years: 50, rate_min_pct: 0, rate_max_pct: 2, steps: 11 },
    { operation: 'evaluateQualitativeScenario', weights: weights(1), scores: { A: scores([4, 4, 4, 4, 4, 4, 4]), B: {}, C: {} }, note: 'A plain note.' },
  ];
  for (const request of requests) {
    assert.ok(CalcRequestSchema.safeParse(request).success, JSON.stringify(request));
    const r = ok(evaluate(ev, request));
    const parsed = CalcResultSchema.safeParse(JSON.parse(resultToJson(r)));
    assert.ok(parsed.success, parsed.success ? '' : `${r.title}: ${JSON.stringify(parsed.error.issues.slice(0, 2))}`);
    assert.deepEqual(parsed.data, r, `${r.title} survives JSON unchanged`);
    assert.deepEqual(r.request, request);
    assert.match(r.calculation_id, /^calc-[0-9a-f]{8}$/);
    if (r.source_role === 'user') assert.equal(r.source, null);
    else {
      assert.match(r.source!.commit_sha, /^[ab]{40}$/);
      assert.ok(r.source!.url.includes(`/blob/${r.source!.commit_sha}/${r.source!.path}`), 'the citation is a pinned blob URL');
      assert.equal(r.source!.role, r.source_role);
    }
    for (const s of [...r.inputs.map((i) => i.source), ...r.summary.map((x) => x.source)]) if (s) assert.match(s.url, /^https:\/\/github\.com\/Reltroner\/reltroner-studio(-remodeling)?\/blob\/[ab]{40}\//);
  }
  // The contract is strict: unknown members and a canon label on a user-only result are refused where it matters.
  const r = ok(evaluate(ev, project(1, 100)));
  assert.equal(CalcResultSchema.safeParse({ ...r, probability: 0.9 }).success, false);
  assert.equal(CalcResultSchema.safeParse({ ...r, result_status: 'MODEL_ESTIMATE' }).success, false);
  assert.equal(CalcRequestSchema.safeParse({ ...project(1, 100), script: 'alert(1)' }).success, false);
  assert.equal(CalcRequestSchema.safeParse({ operation: 'calculate', formula: 'eval', code: '1+1' }).success, false);
  assert.equal(CalcRequestSchema.safeParse({ ...project(1, 100), annual_rate_pct: Number.POSITIVE_INFINITY }).success, false);
});

/** Minimal RFC 4180 reader, enough to prove the export parses back. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; } else cell += ch;
  }
  return rows;
}

test('CALC-07 (20) JSON and CSV carry the same metadata; CSV is quoted and guarded against spreadsheet formulas', async () => {
  const ev = await evidence();
  const hostile = ['=HYPERLINK("http://evil.example","x")', '+SUM(A1:A9)', '@cmd, "quoted"'];
  const r = ok(evaluate(ev, { operation: 'compareScenarios', entity_id: RELTRONLAND, indicator: 'population', horizon_years: 10, scenarios: hostile.map((label, i) => ({ label, annual_rate_pct: i - 1 })) }));
  const csv = resultToCsv(r);
  const table = parseCsv(csv);
  assert.deepEqual(table[0], [...CSV_HEADER]);
  assert.ok(table.every((row) => row.length === CSV_HEADER.length), 'every row has every column');
  const col = (name: (typeof CSV_HEADER)[number]) => CSV_HEADER.indexOf(name);
  const meta = Object.fromEntries(table.filter((row) => row[0] === 'meta').map((row) => [row[col('key')]!, row[col('value')]!]));
  for (const key of ['schema_version', 'calculation_id', 'operation', 'formula_id', 'formula_version', 'formula_expression', 'title', 'baseline_period', 'status_reason'] as const) assert.equal(meta[key], String(r[key]), key);
  assert.deepEqual(JSON.parse(meta.request!), r.request);
  assert.deepEqual(JSON.parse(meta.horizon!), r.horizon);
  const sourceRow = table.find((row) => row[0] === 'meta' && row[col('key')] === 'source')!;
  assert.deepEqual([sourceRow[col('source_role')], sourceRow[col('source_repository')], sourceRow[col('source_commit_sha')], sourceRow[col('source_path')], sourceRow[col('source_pointer')]], ['production', r.source!.repository, PROD, r.source!.path, r.source!.pointer]);
  const section = (name: string) => table.filter((row) => row[0] === name);
  assert.equal(section('input').length, r.inputs.length);
  assert.equal(section('assumption').length, r.assumptions.length);
  assert.equal(section('summary').length, r.summary.length);
  assert.equal(section('limitation').length, r.limitations.length);
  assert.deepEqual(section('limitation').map((row) => row[col('label')]), r.limitations);
  const result = section('result')[0]!;
  assert.deepEqual([Number(result[col('value')]), result[col('unit')], result[col('status')], result[col('source_commit_sha')]], [r.result_value, r.result_unit, r.result_status, PROD]);
  assert.equal(section('empirical_forecast')[0]![col('key')], 'INSUFFICIENT_DATA_FOR_EMPIRICAL_FORECAST');
  for (const t of r.tables) assert.equal(section(`table:${t.id}`).length, t.rows.length * t.columns.length);
  // Full precision: every numeric table cell reads back as the exact double.
  const trajectory = r.tables.find((t) => t.id === 'trajectory')!;
  const cells = section('table:trajectory');
  trajectory.rows.forEach((row, n) => trajectory.columns.forEach((c, k) => assert.equal(Number(cells[n * trajectory.columns.length + k]![col('value')]), row[c.key])));
  const baseline = section('input').find((row) => row[col('key')] === 'baseline')!;
  assert.deepEqual([baseline[col('value')], baseline[col('unit')], baseline[col('status')], baseline[col('owner')], baseline[col('period')]], ['855', 'billion sentients', 'CANON_OBSERVED', 'SOURCE_ASSIGNED', 'Year 0']);

  // Formula injection: a user label that starts with = + - @ is stored as text behind an apostrophe, quotes are doubled.
  const labels = table.filter((row) => row[0] === 'table:summary' && row[col('key')]!.endsWith('.scenario')).map((row) => row[col('value')]);
  assert.deepEqual(labels, hostile.map((l) => `'${l}`));
  assert.ok(csv.includes('"\'=HYPERLINK(""http://evil.example"",""x"")"'));
  assert.doesNotMatch(csv, /(^|,)[=+@]/m, 'no cell starts with a formula trigger');
  assert.doesNotMatch(csv, /(^|,)-[^\d,]/m, 'a leading minus only ever starts a number');
  // Negative numbers stay numbers (the first scenario shrinks at −1% a year).
  const negative = table.find((row) => row[0] === 'table:summary' && row[col('key')] === '1.absolute')!;
  assert.ok(Number(negative[col('value')]) < 0 && !negative[col('value')]!.startsWith("'"));
  const minus = ok(evaluate(ev, project(1, 10, RELTRONLAND, '-2+3')));
  assert.ok(resultToCsv(minus).includes(",'-2+3,"));
  assert.ok(csv.endsWith('\r\n'));
  // JSON keeps numeric semantics: every number is a number and the export is the whole result, nothing else.
  const json = JSON.parse(resultToJson(r)) as CalcResult;
  assert.deepEqual(json, r);
  assert.equal(typeof json.result_value, 'number');
  assert.equal(json.request.operation, 'compareScenarios');
  assert.deepEqual(Object.keys(json).sort(), Object.keys(r).sort());
  assert.equal(exportFilename(r, 'csv'), `reltroner-calculator-compareScenarios-${r.calculation_id}.csv`);
});

test('CALC-05 (21) the Assistant answers Q1–Q6 with the same evaluator: same request, same bytes, same status', async () => {
  const index = await evidence();
  const same = (question: string, request: CalcRequest) => {
    const a = answerQuestion(index, question);
    assert.equal(a.intent, 'CALCULATOR', question);
    assert.deepEqual(a.calculator!.request, request, question);
    const direct = ok(evaluate(index, request));
    assert.equal(resultToJson(a.calculator!.result!), resultToJson(direct), `${question}: byte-identical result`);
    assert.ok(a.statements.some((s) => s.text.startsWith(`Method: ${direct.formula_expression} (formula ${direct.formula_id}, version ${direct.formula_version}).`)), 'the answer states the formula');
    for (const s of direct.summary) assert.ok(a.statements.some((x) => x.text === s.text && x.status === s.status), s.text);
    assert.deepEqual(a.limitations, direct.limitations);
    assert.ok(a.suggested_routes.includes('/calculator'));
    return a;
  };
  // Q1, in English and Indonesian.
  const q1 = { operation: 'projectScenario', entity_id: RELTRONLAND, indicator: 'population', annual_rate_pct: 1, horizon_years: 100, label: 'Assistant scenario' } as const;
  const a1 = same('If Reltronland grows by 1% annually for 100 years, what is the population?', q1);
  same('Jika Reltronland tumbuh 1% per tahun selama 100 tahun, berapa populasinya?', q1);
  assert.equal(a1.status, 'SCENARIO');
  assert.ok(a1.statements.some((s) => s.status === 'SCENARIO' && s.text.includes('2,312.62 billion sentients')));
  assert.deepEqual(a1.citations.map((c) => c.url), [`https://github.com/Reltroner/reltroner-studio/blob/${PROD}/${NCCM_DATASET_PATH}`]);
  assert.equal(a1.statements[0]!.status, 'CANON_OBSERVED');
  assert.equal(a1.statements[0]!.cite, 0);
  assert.equal(tools.projectScenario(index, { entity_id: RELTRONLAND, indicator: 'population', annual_rate_pct: 1, horizon_years: 100, label: 'Assistant scenario' }).ok && a1.calculator!.result!.result_value, 855 * 1.01 ** 100);
  // Q2: three rates become the three named scenarios, lowest first.
  const q2 = { operation: 'compareScenarios', entity_id: RELTRONLAND, indicator: 'population', horizon_years: 50, scenarios: [{ label: 'Conservative', annual_rate_pct: 0.5 }, { label: 'Baseline assumption', annual_rate_pct: 1 }, { label: 'Aggressive', annual_rate_pct: 2 }] } as const;
  same('Compare Reltronland population growth at 0.5%, 1% and 2% over 50 years.', q2 as unknown as CalcRequest);
  same('Bandingkan pertumbuhan populasi Reltronland pada 0,5%, 1% dan 2% selama 50 tahun.', q2 as unknown as CalcRequest);
  // Q3: 300 years before Year 0 is 300 BAC.
  const q3 = { operation: 'reconstructScenario', entity_id: DEPCUTLAND, indicator: 'population', target_bac: 300, annual_rate_pct: 0.4, label: 'Assistant backcast' } as const;
  const a3 = same('What hypothetical population might Depcutland have had 300 years before Year 0 if annual growth was 0.4%?', q3);
  same('Berapa populasi hipotetis Depcutland 300 tahun sebelum Tahun 0 jika pertumbuhan tahunan 0,4%?', q3);
  assert.ok(a3.statements.some((s) => s.status === 'SCENARIO' && /Conditional historical backcast/.test(s.text) && s.text.includes('103.56 billion sentients in 300 BAC')));
  assert.ok(a3.limitations.some((l) => /not canon/.test(l)));
  // Q4: the what-if share, with the remodeling source cited and no closed composition claimed.
  const q4 = { operation: 'calculate', formula: 'population_x_habitat_share', entity_id: RELTRONLAND, category: 'underground', share_pct: 27 } as const;
  const a4 = same('How many Reltronland residents would be underground if the share changed to 27%?', q4);
  same('Berapa penduduk Reltronland yang tinggal di bawah tanah jika porsinya berubah menjadi 27%?', q4);
  assert.ok(a4.statements.some((s) => s.status === 'SCENARIO' && s.text.includes('230.85 billion residents')));
  assert.ok(a4.statements.some((s) => s.status === 'PROPOSED' && s.text.includes('188.10 billion residents')));
  assert.match(a4.citations[0]!.url, new RegExp(`reltroner-studio-remodeling/blob/${DRAFT}/`));
  assert.ok(a4.limitations.some((l) => /would sum to 105\.00%/.test(l)));
  // Q5: the rubric is opened with no scores; passages are cited, nothing is rated.
  const a5 = answerQuestion(index, 'Compare limited versus broader cooperation between Reltronland and Depcutland.');
  assert.deepEqual([a5.intent, a5.calculator!.mode, a5.status], ['CALCULATOR', 'qualitative', 'MIXED']);
  assert.deepEqual(a5.calculator!.request, { operation: 'evaluateQualitativeScenario', weights: weights(1), scores: { A: {}, B: {}, C: {} } });
  assert.equal(a5.calculator!.result!.result_value, null);
  assert.ok(a5.statements.some((s) => s.status === 'SOURCE_MATCH' && s.cite !== null && s.text.includes('War of Conscience')));
  assert.ok(a5.statements.filter((s) => /incomplete, 0 of 7 criteria scored/.test(s.text)).length === 3);
  assert.doesNotMatch(a5.statements.map((s) => s.text).join(' '), /weighted score \d|probab|likel/i);
  // Q6: an explanation, with the one observed historical value cited as the contrast.
  const a6 = answerQuestion(index, 'Why is this backcast not canon?');
  assert.deepEqual([a6.intent, a6.status, a6.calculator!.request], ['CALCULATOR', 'SCENARIO', null]);
  assert.ok(a6.statements.some((s) => s.status === 'CANON_OBSERVED' && s.text.includes('Reltronland · Population was 1.52 billion sentients in 1010 BAC')));
  assert.ok(a6.citations[0]!.url.endsWith('content/events/history-timeline.md#L956'));
  assert.equal(answerQuestion(index, 'Mengapa backcast ini bukan kanon?').heading, a6.heading);
  // A hand-off from /calculator is recomputed by the same function, whatever numbers were shown there.
  const handed = answerCalculation(index, q1);
  assert.equal(resultToJson(handed.calculator!.result!), resultToJson(a1.calculator!.result!));
  assert.equal(answerCalculation(index, { ...q1, annual_rate_pct: 900 }).status, 'INSUFFICIENT_DATA');
});

test('CALC-05 (22) unknown nations, unsupported metrics and missing parameters stay INSUFFICIENT_DATA; existing answers are unchanged', async () => {
  const index = await evidence();
  const quiet = (question: string, heading: RegExp) => {
    const a = answerQuestion(index, question);
    assert.deepEqual([a.intent, a.status, a.citations.length, a.calculator!.request, a.calculator!.result], ['CALCULATOR', 'INSUFFICIENT_DATA', 0, null, null], question);
    assert.match(a.heading, heading, question);
    assert.ok(a.statements.every((s) => s.status === 'INSUFFICIENT_DATA' && !/\d{3,}/.test(s.text)), `${question} reports no figure`);
    return a;
  };
  // Q7: no fallback to another nation, the planet or another indicator.
  assert.match(quiet('If Atlantis grows by 1% annually for 100 years, what is the population?', /not an entity/).statements[0]!.text, /Atlantis is not a nation or entity of the evidence index/);
  quiet('Jika Atlantis tumbuh 1% per tahun selama 100 tahun, berapa populasinya?', /not an entity/);
  quiet('If the SDI of Reltronland grows by 1% annually for 100 years, what is it?', /indicator not supported/);
  quiet('If the happiness index of Reltronland grows by 1% annually for 100 years, what is it?', /inputs needed/);
  // Missing or ambiguous parameters are asked for, never assumed.
  assert.match(quiet('If Reltronland grows by 1% annually, what is the population?', /inputs needed/).statements[0]!.text, /a horizon in years/);
  assert.match(quiet('If the population of Reltronland grows annually for 100 years, what is it?', /inputs needed/).statements[0]!.text, /an annual rate in percent/);
  assert.match(quiet('If the population grows by 1% annually for 100 years, what is it?', /inputs needed/).statements[0]!.text, /one nation \(or Asthortera\)/);
  assert.match(quiet('If Reltronland and Depcutland grow by 1% annually for 100 years, what is the population?', /inputs needed/).statements[0]!.text, /one nation/);
  quiet('How many residents would be underground if the share changed to 27%?', /inputs needed/);
  // Calespia has a population but no habitat record: the engine refuses, and nothing is borrowed from Reltronland.
  const calespia = answerQuestion(index, 'How many Calespia residents would be underground if the share changed to 27%?');
  assert.deepEqual([calespia.status, calespia.calculator!.result], ['INSUFFICIENT_DATA', null]);
  assert.match(calespia.statements[0]!.text, /Calespia: principal home habitats are not assigned/);
  // Out-of-range parameters are reported, not clamped; more than three rates are refused, not truncated.
  assert.match(answerQuestion(index, 'If Reltronland grows by 500% annually for 100 years, what is the population?').statements[0]!.text, /must be between -50% and 100% per year/);
  assert.match(answerQuestion(index, 'Compare Reltronland population growth at 1%, 2%, 3% and 4% over 50 years.').statements[0]!.text, /Compare 2 or 3 named scenarios/);
  // The planet is used only when it is named.
  assert.equal(answerQuestion(index, 'If Asthortera grows by 1% annually for 10 years, what is the population?').calculator!.request!.operation, 'projectScenario');
  // Questions without a scenario keep their existing routes and wording.
  const population = answerQuestion(index, 'Berapa populasi Reltronland?');
  assert.deepEqual([population.intent, population.calculator, population.statements.map((s) => s.text)], ['INDICATOR', undefined, ['Reltronland · Population: 855.']]);
  assert.equal(answerQuestion(index, 'What is the population growth of Reltronland?').intent, 'UNSUPPORTED');
  assert.equal(answerQuestion(index, 'Spatial 3D composition Reltronland.').intent, 'SPATIAL');
  assert.equal(answerQuestion(index, 'Bandingkan ancestry Reltronland dan Depcutland.').intent, 'ANCESTRY');
  assert.equal(answerQuestion(index, 'What does the verified evidence say about Henchoway?').intent, 'NARRATIVE');
  assert.equal(answerQuestion(index, 'Which nation has 22% underground?').intent, 'SPATIAL');
  // An index without the additive members (an older v2 file) still answers scenarios.
  const { anchors: _a, foundations: _f, ...older } = index;
  assert.equal(answerQuestion(older, 'If Reltronland grows by 1% annually for 100 years, what is the population?').status, 'SCENARIO');
  // Engine level: unknown entity and unassigned values.
  fail(evaluate(index, project(1, 100, 'country:atlantis')), 'UNKNOWN_ENTITY', 'INSUFFICIENT_DATA');
  fail(evaluate(index, { operation: 'calculate', formula: 'gdp_per_capita', entity_id: 'country:calespia' }), 'VALUE_NOT_ASSIGNED', 'INSUFFICIENT_DATA');
  fail(evaluate(index, { operation: 'calculate', formula: 'population_x_ancestry_share', entity_id: 'country:calespia', category: 'depeisit' }), 'VALUE_NOT_ASSIGNED', 'INSUFFICIENT_DATA');
  fail(evaluate(index, { operation: 'calculate', formula: 'population_x_ancestry_share', entity_id: PLANET, category: 'depeisit' }), 'VALUE_NOT_ASSIGNED', 'INSUFFICIENT_DATA');
  fail(evaluate(index, { operation: 'calculate', formula: 'land_area_x_footprint_share', entity_id: DEPCUTLAND, category: 'urban_active' }), 'VALUE_NOT_ASSIGNED', 'INSUFFICIENT_DATA');
});

test('CALC-05 (23) the hand-off is validated, session-scoped, single-use and safe without session storage', () => {
  const request = project(1, 100);
  const now = 1_800_000_000_000;
  const raw = encodeHandoff('calculator', request, now)!;
  assert.deepEqual(decodeHandoff(raw, 'calculator', now + 1000), request);
  assert.equal(decodeHandoff(raw, 'assistant', now), null, 'a payload for the other page is not accepted');
  assert.equal(decodeHandoff(raw, 'calculator', now + HANDOFF_TTL_MS + 1), null, 'expired');
  assert.equal(decodeHandoff(raw, 'calculator', now - 1), null, 'a payload from the future is refused');
  for (const bad of [null, '', 'not json', '{}', '[]', 'null', JSON.stringify({ ...JSON.parse(raw), schema_version: 'reltroner-calculator-handoff.v0' }),
    JSON.stringify({ ...JSON.parse(raw), result: { result_value: 999999, result_status: 'CANON_OBSERVED' } }),
    JSON.stringify({ ...JSON.parse(raw), request: { ...request, operation: 'runAnything' } }),
    JSON.stringify({ ...JSON.parse(raw), request: { ...request, entity_id: '<img src=x onerror=alert(1)>' } }),
    JSON.stringify({ ...JSON.parse(raw), request: { ...request, label: 'x'.repeat(LIMITS.MAX_LABEL + 1) } }),
    `${raw}${' '.repeat(HANDOFF_MAX_CHARS)}`]) assert.equal(decodeHandoff(bad, 'calculator', now), null, String(bad).slice(0, 60));
  assert.equal(encodeHandoff('calculator', { ...request, extra: true } as unknown as CalcRequest, now), null, 'only allowlisted members are stored');
  // The payload is the request alone: no result, no other session data.
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['created_at_ms', 'request', 'schema_version', 'target']);

  const data = new Map<string, string>();
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
  data.set('rs-private-draft', 'kept');
  assert.equal(writeHandoff(store, 'assistant', request, now), true);
  assert.equal(takeHandoff(store, 'calculator', now), null, 'the other page does not consume it');
  assert.ok(data.has(HANDOFF_KEY), 'and leaves it for its addressee');
  assert.deepEqual(takeHandoff(store, 'assistant', now), request);
  assert.equal(data.has(HANDOFF_KEY), false, 'removed after consumption');
  assert.equal(takeHandoff(store, 'assistant', now), null);
  data.set(HANDOFF_KEY, '{"schema_version":"x"}');
  assert.equal(takeHandoff(store, 'assistant', now), null);
  assert.equal(data.has(HANDOFF_KEY), false, 'an invalid payload is discarded');
  assert.equal(data.get('rs-private-draft'), 'kept', 'no other session key is touched');
  // Storage that is blocked or throws never crashes a page.
  const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => { throw new Error('SecurityError'); } };
  assert.equal(writeHandoff(broken, 'calculator', request, now), false);
  assert.equal(writeHandoff(null, 'calculator', request, now), false);
  assert.equal(takeHandoff(broken, 'calculator', now), null);
  assert.equal(takeHandoff(null, 'calculator', now), null);
  assert.equal(sessionStore(), null, 'Node has no sessionStorage: the helper reports that instead of throwing');
  // Nothing travels in a URL.
  assert.deepEqual(HANDOFF_PATH, { calculator: '/calculator', assistant: '/assistant' });
  const browserCode = ['src/features/calculator/CalculatorWorkspace.tsx', 'src/features/statistics/AssistantWorkspace.tsx', 'src/engine/calculator/handoff.ts'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(browserCode, /URLSearchParams|location\.search|[?&](rate|request|label|scores|note)=|encodeURIComponent/);
  assert.doesNotMatch(browserCode, /localStorage|document\.cookie|sendBeacon|dangerouslySetInnerHTML|innerHTML/);
});

test('CALC-01 (24) the shared engine has no network, clock, randomness, storage, dynamic code or npm dependency and never mutates its evidence', async () => {
  const root = process.cwd();
  // Everything the Assistant (and the optional Pages Function, which bundles without node_modules) loads at run time.
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const m of source.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^;]*?from\s+'([^']+)';/gms)) {
      if (m[1]) continue;
      assert.ok(m[2]!.startsWith('.'), `${path.relative(root, file)} imports the package ${m[2]}`);
      walk(path.resolve(path.dirname(file), m[2]!));
    }
  };
  walk(path.join(root, 'src/domain/assistant.ts'));
  const files = [...seen].map((f) => path.relative(root, f).replaceAll('\\', '/')).sort();
  assert.deepEqual(files, ['src/domain/assistant.ts', 'src/domain/calculator.ts', 'src/domain/calendar.ts', 'src/domain/composition.ts']);
  for (const file of seen) {
    const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|WebSocket|\beval\s*\(|new Function|\bimport\s*\(|Math\.random|Date\.now|new Date|localStorage|sessionStorage|process\.env|require\s*\(|node:/, path.relative(root, file));
    assert.doesNotMatch(code, /openai|anthropic|api\.[a-z]+\.com|Authorization|api[_-]?key/i, `${path.relative(root, file)} has no provider call`);
  }
  assert.match(fs.readFileSync('functions/api/assistant.ts', 'utf8'), /from '\.\.\/\.\.\/src\/domain\/assistant\.ts';/);
  // Evaluation works with the network removed and leaves a deeply frozen evidence object untouched.
  const index = await evidence();
  const freeze = (value: unknown): void => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } };
  freeze(index);
  const before = JSON.stringify(index);
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network call from the calculator'); };
  try {
    ok(evaluate(index, project(1, 100)));
    ok(evaluate(index, { operation: 'reconstructScenario', entity_id: RELTRONLAND, indicator: 'population', target_bac: 1010, annual_rate_pct: 0.4, label: 'x' }));
    ok(evaluate(index, { operation: 'calculate', formula: 'weighted_composition', entity_id: RELTRONLAND, dimension: 'habitat', shares: { surface_land: 65, underground: 27, underwater: 2, floating: 6 } }));
    ok(evaluate(index, { operation: 'evaluateQualitativeScenario', weights: weights(1), scores: { A: scores([4, 4, 4, 4, 4, 4, 4]), B: {}, C: {} } }));
    for (const q of ['If Reltronland grows by 1% annually for 100 years, what is the population?', 'Why is this backcast not canon?', 'Compare limited versus broader cooperation between Reltronland and Depcutland.']) answerQuestion(index, q);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(JSON.stringify(index), before, 'the evidence is read-only: nothing is written back');
});
