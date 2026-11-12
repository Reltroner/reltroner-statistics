/**
 * Unit inference from Studio field-naming conventions. Results are always labeled
 * `FIELD_NAME_CONVENTION` so readers know the unit was inferred, not declared by the source.
 */
const RULES: ReadonlyArray<[RegExp, string]> = [
  [/_million_km2$/, 'million km²'],
  [/(^|_)population_billion$|_headcount_billion$|_billion$/, 'billion'],
  [/_pct$|_percent$/, '%'],
  [/(^|_)usd(_|$)|_usd_annual|gdp_usd/, 'USD'],
  [/(^|_)bac$/, 'BAC year'],
  [/_years$/, 'years'],
  [/(^|_)tfr(_|$)/, 'children per woman'],
  [/carbon_tonnes_per_capita/, 'tonnes per capita'],
  [/(^|_)sdi(_|$)|_index$/, 'index (0–1)'],
  [/growth|inflation|_rate$|share|gini|urbanization|_to_gdp|_access_proxy/, 'ratio'],
];

export function inferUnit(field: string | null): string | null {
  if (!field) return null;
  const leaf = field.replace(/\[[^\]]*\]/g, '').split('.').filter(Boolean).pop() ?? '';
  for (const [re, unit] of RULES) if (re.test(leaf)) return unit;
  return null;
}
