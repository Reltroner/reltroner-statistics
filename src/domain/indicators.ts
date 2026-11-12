/**
 * Indicator registry for the NCCM V6.5 national dataset. Fields map to production JSON members;
 * `derivation` states whether the source assigns the value or computes it from other values.
 * Statistics never adds indicators the source does not carry.
 */

export type Derivation = 'ASSIGNED' | 'DERIVED';
export type IndicatorFormat = 'number' | 'ratio_pct' | 'index' | 'usd' | 'years' | 'billion' | 'area';

export interface IndicatorDef {
  id: string;
  label: string;
  short: string;
  unit: string;
  format: IndicatorFormat;
  derivation: Derivation;
  group: 'Demography' | 'Development' | 'Economy' | 'Society' | 'Environment' | 'Geography';
  description: string;
  /** Source members by cohort; the first present member is used. */
  fields: { PROFILED_14: readonly string[]; DEVELOPMENT_5: readonly string[] };
  /** Formula as stated by source conventions (for DERIVED indicators). */
  formula?: string;
  /** Raw status member that qualifies this indicator's canon label, if the source provides one. */
  status_field?: string;
  /** Whether the log scale is the meaningful default for charts. */
  log_scale?: boolean;
}

export const INDICATORS: readonly IndicatorDef[] = Object.freeze([
  { id: 'population', label: 'Population', short: 'Population', unit: 'billion sentients', format: 'billion', derivation: 'ASSIGNED', group: 'Demography',
    description: 'Resident sentient population in Year 0 after the ratified internal migration.', fields: { PROFILED_14: ['population_billion'], DEVELOPMENT_5: ['population_billion'] }, log_scale: true },
  { id: 'land_area', label: 'Land area', short: 'Land area', unit: 'million km²', format: 'area', derivation: 'ASSIGNED', group: 'Geography',
    description: 'National land area. Not assigned for the five development countries.', fields: { PROFILED_14: ['land_area_million_km2'], DEVELOPMENT_5: ['land_area_million_km2'] } },
  { id: 'sdi', label: 'Sentient Development Index', short: 'SDI', unit: 'index (0–1)', format: 'index', derivation: 'ASSIGNED', group: 'Development',
    description: 'Composite development index combining individual and institutional components.', fields: { PROFILED_14: ['sdi'], DEVELOPMENT_5: ['sdi'] } },
  { id: 'sdi_individual', label: 'SDI individual component', short: 'SDI individual', unit: 'index (0–1)', format: 'index', derivation: 'ASSIGNED', group: 'Development',
    description: 'Individual-wellbeing component of the SDI.', fields: { PROFILED_14: ['sdi_individual_component'], DEVELOPMENT_5: ['sdi_individual_component'] } },
  { id: 'sdi_institution', label: 'SDI institution component', short: 'SDI institution', unit: 'index (0–1)', format: 'index', derivation: 'ASSIGNED', group: 'Development',
    description: 'Institutional-quality component of the SDI.', fields: { PROFILED_14: ['sdi_institution_component'], DEVELOPMENT_5: ['sdi_institution_component'] } },
  { id: 'gdp_share', label: 'Share of planetary GDP', short: 'GDP share', unit: 'ratio of planetary GDP', format: 'ratio_pct', derivation: 'ASSIGNED', group: 'Economy',
    description: 'National share of planetary nominal GDP (NCCM V6 base year).', fields: { PROFILED_14: ['gdp_planet_share'], DEVELOPMENT_5: ['gdp_planet_share'] } },
  { id: 'gdp_usd', label: 'Nominal GDP', short: 'GDP', unit: 'USD per year', format: 'usd', derivation: 'DERIVED', group: 'Economy',
    description: 'National nominal GDP in USD under the V6 integrated income-output uplift.', formula: 'gdp_planet_share × planetary GDP (USD)',
    fields: { PROFILED_14: ['gdp_usd_annual_V6'], DEVELOPMENT_5: ['gdp_usd_annual_V6'] }, log_scale: true },
  { id: 'gdp_per_capita', label: 'GDP per capita', short: 'GDP per capita', unit: 'USD per sentient', format: 'usd', derivation: 'DERIVED', group: 'Economy',
    description: 'Nominal GDP divided by resident population.', formula: 'nominal GDP ÷ (population × 10⁹)',
    fields: { PROFILED_14: ['gdp_per_capita_usd_V6'], DEVELOPMENT_5: ['gdp_per_capita_usd_V6'] }, log_scale: true },
  { id: 'real_gdp_growth', label: 'Real GDP growth', short: 'Real growth', unit: 'ratio per year', format: 'ratio_pct', derivation: 'ASSIGNED', group: 'Economy',
    description: 'Year 0 real GDP growth under the ratified NCCM V6.5 growth convention.', fields: { PROFILED_14: ['real_gdp_growth'], DEVELOPMENT_5: ['real_gdp_growth'] }, status_field: 'real_gdp_growth_status' },
  { id: 'inflation', label: 'Annual inflation', short: 'Inflation', unit: 'ratio per year', format: 'ratio_pct', derivation: 'ASSIGNED', group: 'Economy',
    description: 'Annual consumer price inflation.', fields: { PROFILED_14: ['annual_inflation'], DEVELOPMENT_5: ['annual_inflation'] } },
  { id: 'unemployment', label: 'Unemployment rate', short: 'Unemployment', unit: 'ratio of labor force', format: 'ratio_pct', derivation: 'ASSIGNED', group: 'Economy',
    description: 'Share of the labor force without employment.', fields: { PROFILED_14: ['unemployment_rate'], DEVELOPMENT_5: ['unemployment_rate'] } },
  { id: 'debt_to_gdp', label: 'Government debt', short: 'Debt/GDP', unit: 'ratio of GDP', format: 'ratio_pct', derivation: 'ASSIGNED', group: 'Economy',
    description: 'Gross government public debt relative to GDP.', fields: { PROFILED_14: ['government_debt_to_gdp'], DEVELOPMENT_5: ['government_debt_to_gdp'] } },
  { id: 'gini', label: 'Income Gini', short: 'Gini', unit: 'coefficient (0–1)', format: 'index', derivation: 'ASSIGNED', group: 'Society',
    description: 'Income inequality coefficient.', fields: { PROFILED_14: ['income_gini'], DEVELOPMENT_5: ['income_gini'] } },
  { id: 'urbanization', label: 'Urbanization', short: 'Urbanization', unit: 'ratio of population', format: 'ratio_pct', derivation: 'ASSIGNED', group: 'Society',
    description: 'Share of the population living in urban areas.', fields: { PROFILED_14: ['urbanization'], DEVELOPMENT_5: ['urbanization'] } },
  { id: 'median_age', label: 'Median age', short: 'Median age', unit: 'years', format: 'years', derivation: 'ASSIGNED', group: 'Demography',
    description: 'Median age of the resident population (Asthortera lifespans exceed Earth norms).', fields: { PROFILED_14: ['median_age_years'], DEVELOPMENT_5: ['median_age_years'] } },
  { id: 'life_expectancy', label: 'Life expectancy', short: 'Life expectancy', unit: 'years', format: 'years', derivation: 'ASSIGNED', group: 'Demography',
    description: 'Life expectancy at birth.', fields: { PROFILED_14: ['life_expectancy_years'], DEVELOPMENT_5: ['life_expectancy_years'] } },
  { id: 'tfr', label: 'Total fertility rate', short: 'TFR', unit: 'children per woman', format: 'number', derivation: 'ASSIGNED', group: 'Demography',
    description: 'Total fertility rate under the ratified population-weighted proxy convention.', fields: { PROFILED_14: ['tfr_candidate'], DEVELOPMENT_5: ['tfr', 'tfr_candidate'] }, status_field: 'tfr_status' },
  { id: 'education_access', label: 'Education access proxy', short: 'Education access', unit: 'ratio', format: 'ratio_pct', derivation: 'ASSIGNED', group: 'Society',
    description: 'Proxy for population access to education.', fields: { PROFILED_14: ['education_access_proxy'], DEVELOPMENT_5: ['education_access_proxy'] } },
  { id: 'carbon_per_capita', label: 'Carbon per capita', short: 'Carbon', unit: 'tonnes per sentient', format: 'number', derivation: 'ASSIGNED', group: 'Environment',
    description: 'Carbon emissions per resident.', fields: { PROFILED_14: ['carbon_tonnes_per_capita'], DEVELOPMENT_5: ['carbon_tonnes_per_capita'] } },
  { id: 'specialization_factor', label: 'Specialization factor', short: 'Specialization', unit: 'multiplier', format: 'number', derivation: 'ASSIGNED', group: 'Economy',
    description: 'Sectoral specialization multiplier used by the national model; unassigned for some countries.', fields: { PROFILED_14: ['specialization_factor'], DEVELOPMENT_5: ['specialization_factor'] } },
  { id: 'fx_usd_per_local', label: 'Exchange rate', short: 'FX', unit: 'USD per local unit', format: 'number', derivation: 'ASSIGNED', group: 'Economy',
    description: 'Reference exchange rate of the national currency.', fields: { PROFILED_14: ['fx.usd_per_local_unit'], DEVELOPMENT_5: ['fx.usd_per_local_unit'] } },
]);

export const INDICATOR_BY_ID: ReadonlyMap<string, IndicatorDef> = new Map(INDICATORS.map((i) => [i.id, i]));

/** Indicators carried only at planet level (no cross-country distribution). */
export const PLANET_INDICATORS = Object.freeze([
  { id: 'population', field: 'population_billion', base: 'planet' },
  { id: 'sovereign_states', field: 'sovereign_states', base: 'planet' },
  { id: 'land_area', field: 'land_area_million_km2', base: 'planet' },
  { id: 'sdi', field: 'sdi', base: 'planet' },
  { id: 'median_age', field: 'median_age_years', base: 'year0' },
  { id: 'life_expectancy', field: 'life_expectancy_years', base: 'year0' },
  { id: 'urbanization', field: 'urbanization_rate', base: 'year0' },
  { id: 'inflation', field: 'annual_inflation', base: 'year0' },
  { id: 'tfr', field: 'tfr', base: 'year0' },
  { id: 'real_gdp_growth', field: 'real_gdp_growth', base: 'year0' },
  { id: 'gdp_usd', field: 'gdp_usd_annual_V6', base: 'year0', derived: true },
  { id: 'gdp_per_capita', field: 'gdp_per_capita_usd_V6', base: 'year0', derived: true },
] as const);

export const EXTRA_LABELS: Readonly<Record<string, { label: string; unit: string; format: IndicatorFormat }>> = Object.freeze({
  sovereign_states: { label: 'Sovereign states', unit: 'states', format: 'number' },
  foundation_year: { label: 'Sovereign foundation', unit: 'BAC year', format: 'number' },
  population_growth: { label: 'Population growth', unit: 'ratio per year', format: 'ratio_pct' },
  gdp_usd_nominal_historical: { label: 'Nominal GDP (historical reference)', unit: 'USD per year', format: 'usd' },
  gdp_share_historical: { label: 'Share of planetary GDP (historical)', unit: 'ratio', format: 'ratio_pct' },
});

export function indicatorLabel(id: string): string {
  return INDICATOR_BY_ID.get(id)?.label ?? EXTRA_LABELS[id]?.label ?? id;
}

export function indicatorUnit(id: string): string {
  return INDICATOR_BY_ID.get(id)?.unit ?? EXTRA_LABELS[id]?.unit ?? '';
}

export function indicatorFormat(id: string): IndicatorFormat {
  return INDICATOR_BY_ID.get(id)?.format ?? EXTRA_LABELS[id]?.format ?? 'number';
}
