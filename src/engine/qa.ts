/**
 * Deterministic QA invariants for the NCCM dataset. Every rule is an identity that follows from
 * conventions the source itself states (shares, population-weighted SDI/TFR, GDP-weighted growth,
 * census totals, zero-bridge GNI). A FAIL is a DETERMINISTIC_CONTRADICTION inside one source; a
 * pass makes the corresponding dependency edge VERIFIED in the knowledge graph.
 */
import type { SourceRole } from '../domain/source.ts';

export type QaResult = 'PASS' | 'FAIL' | 'NOT_EVALUABLE';

export interface QaCheck {
  id: string;
  title: string;
  formula: string;
  scope: SourceRole;
  result: QaResult;
  observed: number | null;
  expected: number | null;
  tolerance: number;
  detail: string;
  failures: Array<{ subject: string; observed: number; expected: number }>;
  pointers: string[];
  /** Indicator dependency this rule validates: [derived, ...inputs]. */
  validates: { target: string; inputs: string[] } | null;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

interface Row { name: string; rec: Json; collection: string }

function rows(doc: Json): Row[] {
  const out: Row[] = [];
  for (const collection of ['countries_14', 'countries_5']) {
    const list = doc[collection];
    if (Array.isArray(list)) for (const rec of list) if (isObj(rec) && typeof rec.name === 'string') out.push({ name: rec.name, rec, collection });
  }
  return out;
}

function rel(observed: number, expected: number): number {
  return Math.abs(observed - expected) / Math.max(Math.abs(expected), 1e-300);
}

export function runQa(doc: unknown, scope: SourceRole): QaCheck[] {
  if (!isObj(doc)) return [];
  const checks: QaCheck[] = [];
  const planet = isObj(doc.planet) ? doc.planet : {};
  const year0 = isObj(planet.year0) ? planet.year0 : {};
  const agg = isObj(doc.aggregate_remaining_18) ? doc.aggregate_remaining_18 : {};
  const all = rows(doc);
  const c14 = all.filter((r) => r.collection === 'countries_14');
  const add = (c: Omit<QaCheck, 'scope'>) => checks.push({ ...c, scope });
  const sumOrNull = (vals: Array<number | null>) => (vals.some((v) => v === null) ? null : (vals as number[]).reduce((a, b) => a + b, 0));

  // 1. Census population total.
  {
    const parts = [...all.map((r) => n(r.rec.population_billion)), n(agg.population_billion)];
    const observed = sumOrNull(parts), expected = n(planet.population_billion);
    const ok = observed !== null && expected !== null;
    add({
      id: 'QA-POPULATION-TOTAL', title: 'National populations and residual sum to the planetary population',
      formula: 'Σ population(countries_14, countries_5) + population(aggregate_remaining_18) = planet.population_billion',
      result: !ok ? 'NOT_EVALUABLE' : rel(observed, expected) <= 1e-9 ? 'PASS' : 'FAIL', observed, expected, tolerance: 1e-9,
      detail: ok ? `${observed} vs ${expected} billion` : 'A population member is missing or null.', failures: [],
      pointers: ['planet.population_billion', 'aggregate_remaining_18.population_billion'], validates: { target: 'planet.population', inputs: ['population'] },
    });
  }
  // 2. GDP shares sum to one.
  {
    const observed = sumOrNull([...all.map((r) => n(r.rec.gdp_planet_share)), n(agg.gdp_planet_share)]);
    add({
      id: 'QA-GDP-SHARES-SUM', title: 'GDP shares of all nations and the residual sum to 1',
      formula: 'Σ gdp_planet_share = 1', result: observed === null ? 'NOT_EVALUABLE' : Math.abs(observed - 1) <= 1e-9 ? 'PASS' : 'FAIL',
      observed, expected: 1, tolerance: 1e-9, detail: observed === null ? 'A share is missing.' : `Σ = ${observed}`, failures: [],
      pointers: ['countries_14[*].gdp_planet_share', 'countries_5[*].gdp_planet_share', 'aggregate_remaining_18.gdp_planet_share'], validates: null,
    });
  }
  // 3. Sovereign state count.
  {
    const count = all.length + (n(agg.state_count) ?? 0);
    const expected = n(planet.sovereign_states);
    add({
      id: 'QA-SOVEREIGN-STATES', title: 'Profiled, development and deferred states account for every sovereign state',
      formula: '|countries_14| + |countries_5| + aggregate_remaining_18.state_count = planet.sovereign_states',
      result: expected === null ? 'NOT_EVALUABLE' : count === expected ? 'PASS' : 'FAIL', observed: count, expected, tolerance: 0,
      detail: `${all.length} individually modeled + ${n(agg.state_count) ?? 0} in residual`, failures: [], pointers: ['planet.sovereign_states', 'aggregate_remaining_18.state_count'], validates: null,
    });
  }
  // 4. National GDP identity.
  const planetGdp = n(year0.gdp_usd_annual_V6);
  {
    const failures: QaCheck['failures'] = [];
    let evaluated = 0;
    for (const r of all) {
      const share = n(r.rec.gdp_planet_share), gdp = n(r.rec.gdp_usd_annual_V6);
      if (share === null || gdp === null || planetGdp === null) continue;
      evaluated++;
      const expected = share * planetGdp;
      if (rel(gdp, expected) > 1e-9) failures.push({ subject: r.name, observed: gdp, expected });
    }
    add({
      id: 'QA-GDP-IDENTITY', title: 'National GDP equals share × planetary GDP', formula: 'gdp_usd_annual_V6 = gdp_planet_share × planet.year0.gdp_usd_annual_V6',
      result: evaluated === 0 ? 'NOT_EVALUABLE' : failures.length ? 'FAIL' : 'PASS', observed: evaluated, expected: all.length, tolerance: 1e-9,
      detail: `${evaluated} nations evaluated, ${failures.length} outside tolerance`, failures, pointers: ['countries_*[*].gdp_usd_annual_V6'], validates: { target: 'gdp_usd', inputs: ['gdp_share', 'planet.gdp_usd'] },
    });
  }
  // 5. GDP per capita identity.
  {
    const failures: QaCheck['failures'] = [];
    let evaluated = 0;
    for (const r of all) {
      const gdp = n(r.rec.gdp_usd_annual_V6), pop = n(r.rec.population_billion), pc = n(r.rec.gdp_per_capita_usd_V6);
      if (gdp === null || pop === null || pc === null || pop === 0) continue;
      evaluated++;
      const expected = gdp / (pop * 1e9);
      if (rel(pc, expected) > 1e-9) failures.push({ subject: r.name, observed: pc, expected });
    }
    add({
      id: 'QA-GDP-PER-CAPITA', title: 'GDP per capita equals GDP divided by population', formula: 'gdp_per_capita_usd_V6 = gdp_usd_annual_V6 ÷ (population_billion × 10⁹)',
      result: evaluated === 0 ? 'NOT_EVALUABLE' : failures.length ? 'FAIL' : 'PASS', observed: evaluated, expected: all.length, tolerance: 1e-9,
      detail: `${evaluated} nations evaluated, ${failures.length} outside tolerance`, failures, pointers: ['countries_*[*].gdp_per_capita_usd_V6'], validates: { target: 'gdp_per_capita', inputs: ['gdp_usd', 'population'] },
    });
  }
  // 6. Zero-bridge GNI proxy.
  {
    const failures: QaCheck['failures'] = [];
    let evaluated = 0;
    for (const r of all) {
      const gni = n(r.rec.gni_per_capita_usd_proxy_V6), pc = n(r.rec.gdp_per_capita_usd_V6);
      if (gni === null || pc === null) continue;
      evaluated++;
      if (rel(gni, pc) > 1e-12) failures.push({ subject: r.name, observed: gni, expected: pc });
    }
    add({
      id: 'QA-GNI-ZERO-BRIDGE', title: 'GNI per capita proxy equals GDP per capita (stated zero bridge)', formula: 'gni_per_capita_usd_proxy_V6 = gdp_per_capita_usd_V6',
      result: evaluated === 0 ? 'NOT_EVALUABLE' : failures.length ? 'FAIL' : 'PASS', observed: evaluated, expected: all.length, tolerance: 1e-12,
      detail: `${evaluated} nations evaluated`, failures, pointers: ['countries_*[*].gni_per_capita_usd_proxy_V6'], validates: null,
    });
  }
  // 7. Ancestry composition.
  {
    const failures: QaCheck['failures'] = [];
    let evaluated = 0;
    for (const r of c14) {
      const a = r.rec.ancestry_primary_pct;
      if (!isObj(a)) continue;
      const vals = Object.values(a).map(n);
      if (vals.some((v) => v === null)) continue;
      evaluated++;
      const s = (vals as number[]).reduce((x, y) => x + y, 0);
      if (Math.abs(s - 100) > 0.01) failures.push({ subject: r.name, observed: s, expected: 100 });
    }
    add({
      id: 'QA-ANCESTRY-COMPOSITION', title: 'Primary ancestry shares of each profiled nation sum to 100%', formula: 'Σ ancestry_primary_pct = 100 (±0.01)',
      result: evaluated === 0 ? 'NOT_EVALUABLE' : failures.length ? 'FAIL' : 'PASS', observed: evaluated, expected: c14.length, tolerance: 0.01,
      detail: `${evaluated} profiled nations evaluated`, failures, pointers: ['countries_14[*].ancestry_primary_pct'], validates: null,
    });
  }
  // 8. Land area bound.
  {
    const vals = c14.map((r) => n(r.rec.land_area_million_km2));
    const assigned = vals.filter((v): v is number => v !== null);
    const total = assigned.reduce((a, b) => a + b, 0);
    const bound = n(planet.land_area_million_km2);
    add({
      id: 'QA-LAND-AREA-BOUND', title: 'Assigned national land areas do not exceed planetary land area', formula: 'Σ land_area_million_km2 (assigned) ≤ planet.land_area_million_km2',
      result: bound === null || !assigned.length ? 'NOT_EVALUABLE' : total <= bound ? 'PASS' : 'FAIL', observed: total, expected: bound, tolerance: 0,
      detail: `${assigned.length} of ${c14.length} profiled nations assign land area; ${all.length - c14.length} development nations and the residual do not.`, failures: [],
      pointers: ['countries_14[*].land_area_million_km2', 'planet.land_area_million_km2'], validates: null,
    });
  }
  // 9. Population-weighted planetary SDI (planet value is stated to three decimals).
  {
    const parts = all.map((r) => [n(r.rec.population_billion), n(r.rec.sdi)] as const);
    const residual = [n(agg.population_billion), n(agg.sdi_population_weighted_required)] as const;
    const okParts = [...parts, residual].every(([p, s]) => p !== null && s !== null);
    const pop = okParts ? [...parts, residual].reduce((a, [p]) => a + (p as number), 0) : 0;
    const observed = okParts ? [...parts, residual].reduce((a, [p, s]) => a + (p as number) * (s as number), 0) / pop : null;
    const expected = n(planet.sdi);
    add({
      id: 'QA-PLANET-SDI-WEIGHTED', title: 'Planetary SDI equals the population-weighted national SDI', formula: 'planet.sdi = Σ(population × sdi) ÷ Σ population (incl. residual), stated to 3 decimals',
      result: observed === null || expected === null ? 'NOT_EVALUABLE' : Math.abs(observed - expected) <= 0.0005 ? 'PASS' : 'FAIL', observed, expected, tolerance: 0.0005,
      detail: observed === null ? 'Missing population or SDI.' : `weighted ${observed.toFixed(6)} vs stated ${expected}`, failures: [],
      pointers: ['planet.sdi', 'aggregate_remaining_18.sdi_population_weighted_required'], validates: { target: 'planet.sdi', inputs: ['sdi', 'population'] },
    });
  }
  // 10. GDP-weighted planetary real growth.
  {
    const parts = all.map((r) => [n(r.rec.gdp_planet_share), n(r.rec.real_gdp_growth)] as const);
    const residual = [n(agg.gdp_planet_share), n(agg.real_gdp_growth_gdp_weighted_required)] as const;
    const ok = [...parts, residual].every(([s, g]) => s !== null && g !== null);
    const observed = ok ? [...parts, residual].reduce((a, [s, g]) => a + (s as number) * (g as number), 0) : null;
    const expected = n(year0.real_gdp_growth);
    add({
      id: 'QA-PLANET-GROWTH-WEIGHTED', title: 'Planetary real growth equals the GDP-share-weighted national growth', formula: 'planet.year0.real_gdp_growth = Σ(gdp_planet_share × real_gdp_growth) (incl. residual)',
      result: observed === null || expected === null ? 'NOT_EVALUABLE' : Math.abs(observed - expected) <= 1e-6 ? 'PASS' : 'FAIL', observed, expected, tolerance: 1e-6,
      detail: observed === null ? 'Missing share or growth.' : `weighted ${observed.toFixed(8)} vs stated ${expected}`, failures: [],
      pointers: ['planet.year0.real_gdp_growth'], validates: { target: 'planet.real_gdp_growth', inputs: ['real_gdp_growth', 'gdp_share'] },
    });
  }
  // 11. Population-weighted planetary TFR.
  {
    const tfrOf = (r: Row) => n(r.rec.tfr_candidate) ?? n(r.rec.tfr);
    const parts = all.map((r) => [n(r.rec.population_billion), tfrOf(r)] as const);
    const residual = [n(agg.population_billion), n(agg.tfr_population_weighted_proxy_required)] as const;
    const ok = [...parts, residual].every(([p, t]) => p !== null && t !== null);
    const pop = ok ? [...parts, residual].reduce((a, [p]) => a + (p as number), 0) : 0;
    const observed = ok ? [...parts, residual].reduce((a, [p, t]) => a + (p as number) * (t as number), 0) / pop : null;
    const expected = n(year0.tfr);
    add({
      id: 'QA-PLANET-TFR-WEIGHTED', title: 'Planetary TFR equals the population-weighted national TFR proxy', formula: 'planet.year0.tfr = Σ(population × tfr) ÷ Σ population (incl. residual)',
      result: observed === null || expected === null ? 'NOT_EVALUABLE' : Math.abs(observed - expected) <= 0.005 ? 'PASS' : 'FAIL', observed, expected, tolerance: 0.005,
      detail: observed === null ? 'Missing population or TFR.' : `weighted ${observed.toFixed(6)} vs stated ${expected}`, failures: [],
      pointers: ['planet.year0.tfr'], validates: { target: 'planet.tfr', inputs: ['tfr', 'population'] },
    });
  }
  // 12. Migration balance.
  {
    const mig = isObj(doc.migration_year0) ? doc.migration_year0 : null;
    const routes = Array.isArray(mig?.routes) ? (mig.routes as Json[]) : [];
    const total = routes.reduce((a, r) => a + (n(r.population_billion) ?? 0), 0);
    const dep = n(mig?.total_departures_billion), arr = n(mig?.total_arrivals_billion), change = n(mig?.total_planet_population_change_billion);
    const failures: QaCheck['failures'] = [];
    for (const r of routes) {
      const h = r.ancestry_primary_headcount_billion;
      if (!isObj(h)) continue;
      const s = Object.values(h).reduce<number>((a, v) => a + (n(v) ?? 0), 0);
      if (n(r.population_billion) !== null && Math.abs(s - (r.population_billion as number)) > 1e-6) failures.push({ subject: `${r.origin}→${r.destination}`, observed: s, expected: r.population_billion as number });
    }
    const ok = dep !== null && arr !== null && change !== null;
    add({
      id: 'QA-MIGRATION-BALANCE', title: 'Internal migration conserves population and route composition', formula: 'Σ routes = departures = arrivals; planetary change = 0; Σ ancestry headcount = route size',
      result: !ok || !routes.length ? 'NOT_EVALUABLE' : Math.abs(total - dep) < 1e-9 && Math.abs(dep - arr) < 1e-9 && change === 0 && !failures.length ? 'PASS' : 'FAIL',
      observed: total, expected: dep, tolerance: 1e-9, detail: `${routes.length} routes, ${total} billion moved, planetary change ${change}`, failures,
      pointers: ['migration_year0.routes', 'migration_year0.total_departures_billion'], validates: null,
    });
  }
  // 13. Ratio ranges.
  {
    const fields = ['sdi', 'sdi_individual_component', 'sdi_institution_component', 'gdp_planet_share', 'income_gini', 'urbanization', 'unemployment_rate', 'education_access_proxy'];
    const failures: QaCheck['failures'] = [];
    let evaluated = 0;
    for (const r of all) for (const f of fields) {
      const v = n(r.rec[f]);
      if (v === null) continue;
      evaluated++;
      if (v < 0 || v > 1) failures.push({ subject: `${r.name}.${f}`, observed: v, expected: v < 0 ? 0 : 1 });
    }
    add({
      id: 'QA-RATIO-RANGES', title: 'Bounded ratios lie within [0, 1]', formula: `${fields.join(', ')} ∈ [0, 1]`,
      result: evaluated === 0 ? 'NOT_EVALUABLE' : failures.length ? 'FAIL' : 'PASS', observed: evaluated, expected: null, tolerance: 0,
      detail: `${evaluated} assigned values checked`, failures, pointers: fields.map((f) => `countries_*[*].${f}`), validates: null,
    });
  }
  return checks;
}
