/** Synthetic NCCM-shaped fixture. Values are invented test data, never canon. */
export function nccmFixture(overrides: { beluftnerArea?: number; planetSdi?: number } = {}) {
  const c14 = [
    { name: 'Alpha', source: 'content/factions/alpha.md', population_billion: 600, land_area_million_km2: 100, sdi: 0.98, sdi_individual_component: 0.97, sdi_institution_component: 0.99,
      ancestry_primary_pct: { a: 60, b: 40 }, fx: { code: 'ALP', usd_per_local_unit: 100 }, gdp_planet_share: 0.5, real_gdp_growth: 0.04, annual_inflation: 0.003,
      unemployment_rate: 0.02, government_debt_to_gdp: 0.8, income_gini: 0.3, urbanization: 0.9, median_age_years: 250, life_expectancy_years: 480, tfr_candidate: 1.2,
      education_access_proxy: 0.99, carbon_tonnes_per_capita: 4, specialization_factor: null, tfr_status: 'C_creator_ratified', tfr_pre_rebase_v64: 1.1, canon_status: 'C' },
    { name: 'Beluftner', source: 'content/factions/beluftner.md', population_billion: 200, land_area_million_km2: overrides.beluftnerArea ?? 88, sdi: 0.9, sdi_individual_component: 0.9, sdi_institution_component: 0.9,
      ancestry_primary_pct: { a: 50, b: 50 }, fx: { code: 'BLF', usd_per_local_unit: 22 }, gdp_planet_share: 0.2, real_gdp_growth: 0.05, annual_inflation: 0.004,
      unemployment_rate: 0.05, government_debt_to_gdp: 0.5, income_gini: 0.35, urbanization: 0.8, median_age_years: 230, life_expectancy_years: 450, tfr_candidate: 1.5,
      education_access_proxy: 0.97, carbon_tonnes_per_capita: 5, specialization_factor: 1.1, canon_status: 'C' },
  ];
  const c5 = [{ name: 'Gamma', source: 'content/factions/gamma.md', population_billion: 100, sdi: 0.95, land_area_million_km2: null, median_age_years: null, tfr: 1.6,
    fx: { code: 'GAM', usd_per_local_unit: 50 }, gdp_planet_share: 0.1, real_gdp_growth: 0.045, canon_status: 'C' }];
  const planetGdp = 1e21;
  const agg = { state_count: 2, population_billion: 100, sdi_population_weighted_required: 0.8, gdp_planet_share: 0.2, real_gdp_growth_gdp_weighted_required: 0.02,
    tfr_population_weighted_proxy_required: 1.9, gdp_usd_annual_V6: 0.2 * planetGdp, gdp_per_capita_usd_V6: (0.2 * planetGdp) / 100e9, canon_status: 'C_as_single_combined_residual_only' };
  for (const c of [...c14, ...c5] as Array<Record<string, unknown>>) {
    c.gdp_usd_annual_V6 = (c.gdp_planet_share as number) * planetGdp;
    c.gdp_per_capita_usd_V6 = (c.gdp_usd_annual_V6 as number) / ((c.population_billion as number) * 1e9);
    c.gni_per_capita_usd_proxy_V6 = c.gdp_per_capita_usd_V6;
  }
  const pop = 600 + 200 + 100 + 100;
  const sdi = (600 * 0.98 + 200 * 0.9 + 100 * 0.95 + 100 * 0.8) / pop;
  const growth = 0.5 * 0.04 + 0.2 * 0.05 + 0.1 * 0.045 + 0.2 * 0.02;
  const tfr = (600 * 1.2 + 200 * 1.5 + 100 * 1.6 + 100 * 1.9) / pop;
  return {
    schema_version: 'NCCM-FIXTURE',
    provenance: { previous_source: 'data/asthortera/old-model-v3.json' },
    planet: {
      population_billion: pop, sovereign_states: 5, land_area_million_km2: 500, sdi: overrides.planetSdi ?? Number(sdi.toFixed(3)),
      year0: { median_age_years: 240, life_expectancy_years: 470, urbanization_rate: 0.88, annual_inflation: 0.0035, tfr: Number(tfr.toFixed(2)), real_gdp_growth: growth,
        gdp_usd_annual_V6: planetGdp, gdp_per_capita_usd_V6: planetGdp / (pop * 1e9), canon_status: 'C' },
      historical_1010_BAC: { median_age_years: 30, urbanization_rate: 0.6, annual_inflation: 0.05, life_expectancy_years: 80 },
    },
    countries_14: c14,
    countries_5: c5,
    aggregate_remaining_18: agg,
    open_issues: [{ severity: 'P1', code: 'FIXTURE_ISSUE', description: 'test issue' }],
    migration_year0: {
      routes: [{ origin: 'Alpha', destination: 'Gamma', population_billion: 2, ancestry_primary_headcount_billion: { a: 1.2, b: 0.8 }, source_sdi_unchanged: 0.98 }],
      total_departures_billion: 2, total_arrivals_billion: 2, total_planet_population_change_billion: 0,
    },
    historical_foundations: {
      ordered_core: [{ name: 'Alpha', bac: 1125, status: 'existing' }, { name: 'Beluftner', bac: 900, status: 'creator_ratified', trigger: 'fixture trigger' }],
      related_events: { first_contact_bac: 1256, long_dispute_bac: [1153, 1138] },
    },
    canon_ratification: { status: 'C', supersedes: 'Older V3 tables', unknowns_remain_unknown: ['fixture unknown'] },
  };
}

export const TIMELINE_FIXTURE = [
  '# Timeline',
  'The creator-defined 1010 BAC anchors are **Asthortera nominal GDP USD 195.67 trillion** and **Reltronland GDP REL 1.52 trillion** with the historical nominal reference **1 REL = USD 4.50**. Thus Reltronland produced **USD 6.84 trillion**, or **3.4956815%** of planetary GDP, with **1.52 billion sentients**. The **10% real planetary GDP growth** of 1010 BAC is a year-specific narrative anchor and not a long-term compound average.',
  '',
  'The planetary **annual real GDP growth rate reached 15%**, compared with **10% in 1010 BAC**.',
  '**SDI was still 0.707 in 1010 BAC**, so universal happiness cannot be inferred.',
  'imply a **conditional 1010 BAC population of approximately 78.27 billion**, or more. A piecewise-consistent population-growth reconstruction is: **1.40% (1010–995 BAC), 2.40% (995–970), and ~0.197658% (300–Year 0)**. All intermediate values are **simulation V1**, not fixed observational records.',
].join('\n');
