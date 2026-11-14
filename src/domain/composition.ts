/**
 * Evidence-anchored NCCM V6.5 demographics and spatial composition.
 * Primary ancestry is not a biological species taxonomy. Percent denominators:
 * ancestry = unique residents; surface = terrestrial land; habitat = unique residents.
 * Never infer geometric volume, invented country values, or current-year census from
 * the historical 14-country planetary representativity benchmark.
 */
import { z } from 'zod';
import type { SourceSnapshot } from '../engine/comparator.ts';
import { NCCM_DATASET_PATH } from '../engine/observations.ts';

export const ANCESTRIES = [
  { key: 'depeisit', label: 'Depeisit' },
  { key: 'cistheta', label: 'Cistheta' },
  { key: 'cosmeilian', label: 'Cosmeilian' },
  { key: 'native', label: 'Native Asthorteran' },
  { key: 'phantomkind', label: 'Phantomkind / Spiritual Hybrid' },
  { key: 'other', label: 'Other' },
] as const;
export const SURFACES = [
  { key: 'nature_minimal_intervention', label: 'Natural low-intervention' },
  { key: 'urban_active', label: 'Active built urban' },
  { key: 'urban_operational_low_or_biological_zero', label: 'Operational low / biological-zero built urban' },
  { key: 'urban_dormant', label: 'Dormant built urban' },
] as const;
export const HABITATS = [
  { key: 'surface_land', label: 'Land surface' },
  { key: 'underground', label: 'Underground' },
  { key: 'underwater', label: 'Underwater' },
  { key: 'floating', label: 'Floating' },
] as const;

const finite = z.number().finite();
const share = finite.min(0).max(100);
const shareRow = z.object({ key: z.string(), label: z.string(), pct: share, absolute_billion: finite.nonnegative().nullable() });
const surfaceRow = z.object({ key: z.string(), label: z.string(), pct: share, area_million_km2: finite.nonnegative().nullable() });
export const CompositionSchema = z.object({
  schema_version: z.literal('reltroner-composition.v1'),
  model_version: z.string().min(1),
  source: z.object({ repository: z.literal('Reltroner/reltroner-studio'), commit_sha: z.string().regex(/^[a-f0-9]{40}$/), blob_sha: z.string().regex(/^[a-f0-9]{40}$/), path: z.literal(NCCM_DATASET_PATH) }),
  planet: z.object({
    name: z.literal('Asthortera'), population_billion: finite.positive(), sovereign_states: z.number().int().positive(),
    land_area_million_km2: finite.positive(),
    ancestry_method: z.literal('CREATOR_RATIFIED_REPRESENTATIVE_14_COUNTRY_BENCHMARK'),
    ancestry_reference_population_billion: finite.positive(),
    ancestry: z.array(shareRow).length(6),
  }),
  coverage: z.object({ complete_ancestry: z.number().int(), national_ancestry_unassigned: z.number().int(), residual_states: z.number().int(), residual_population_billion: finite.nonnegative() }),
  countries: z.array(z.object({
    id: z.string(), name: z.string(), cohort: z.enum(['PROFILED_14', 'DEVELOPMENT_5']),
    population_billion: finite.nonnegative(), land_area_million_km2: finite.nonnegative().nullable(),
    ancestry_status: z.enum(['ASSIGNED', 'NOT_ASSIGNED']),
    ancestry: z.array(shareRow),
    surface_status: z.enum(['ASSIGNED', 'NOT_ASSIGNED']),
    surface: z.array(surfaceRow),
    habitat_status: z.enum(['ASSIGNED', 'NOT_ASSIGNED']),
    habitats: z.array(shareRow),
    geometry_status: z.literal('UNASSIGNED'),
    spatial_note: z.string(),
    source_pointer: z.string(),
  })),
  unknowns: z.array(z.string()),
}).strict();
export type Composition = z.infer<typeof CompositionSchema>;

function assertTotal(value: number, expected: number, label: string, tolerance = 0.0001): void {
  if (Math.abs(value - expected) > tolerance) throw new Error('COMPOSITION_CONTRACT_VIOLATION: ' + label + ' sum=' + value + ' expected=' + expected);
}
function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('COMPOSITION_MISSING: ' + label);
  return value as Record<string, unknown>;
}
function numeric(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error('COMPOSITION_INVALID_NUMBER: ' + label);
  return v;
}
function optionalNumeric(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}
function vector<const T extends ReadonlyArray<{ key: string; label: string }>>(
  src: unknown, labels: T, denominator: number, name: string,
): Array<{ key: string; label: string; pct: number; absolute_billion: number }> {
  const record = asRecord(src, name);
  const result = labels.map((c) => ({
    key: c.key, label: c.label, pct: numeric(record[c.key], name + '.' + c.key),
    absolute_billion: denominator * numeric(record[c.key], name + '.' + c.key) / 100,
  }));
  if (Object.keys(record).length !== labels.length) throw new Error('COMPOSITION_UNKNOWN_CATEGORIES: ' + name);
  assertTotal(result.reduce((sum, r) => sum + r.pct, 0), 100, name);
  return result;
}

/** One pinned GitHub blob is the entire authoritative source for both domains. */
export async function buildComposition(snapshot: SourceSnapshot): Promise<Composition> {
  const entry = snapshot.entries.get(NCCM_DATASET_PATH);
  if (!entry || entry.type !== 'blob') throw new Error('COMPOSITION_SOURCE_MISSING: ' + NCCM_DATASET_PATH);
  const doc = asRecord(JSON.parse(new TextDecoder().decode(await snapshot.readBlob(entry.sha))), 'NCCM');
  const planet = asRecord(doc.planet, 'planet');
  const census = asRecord(doc.census, 'census');
  const remaining = asRecord(doc.aggregate_remaining_18, 'aggregate_remaining_18');
  const population = numeric(planet.population_billion, 'planet.population_billion');
  const reference = asRecord(census.pre_migration_reference, 'census.pre_migration_reference');
  const referencePopulation = numeric(reference.planetary_proxy_ancestry_denominator_billion, 'reference denominator');
  const method = String(planet.ancestry_reference_provenance ?? '');
  if (!method.includes('3288B') || referencePopulation !== 3288) throw new Error('COMPOSITION_REFERENCE_CHANGED: review representativity rule');
  const planetAncestry = vector(planet.ancestry_primary_pct_representative_14_country_weighted, ANCESTRIES, population, 'planet.ancestry');
  const countries: Composition['countries'] = [];
  for (const [collection, cohort] of [['countries_14', 'PROFILED_14'], ['countries_5', 'DEVELOPMENT_5']] as const) {
    const entries = doc[collection];
    if (!Array.isArray(entries) || entries.length !== (cohort === 'PROFILED_14' ? 14 : 5)) throw new Error('COMPOSITION_COUNTRY_COUNT_CHANGED: ' + collection);
    for (const [i, raw] of entries.entries()) {
      const rec = asRecord(raw, collection + '[' + i + ']');
      const name = String(rec.name);
      const pop = numeric(rec.population_billion, name + ' population');
      const land = optionalNumeric(rec.land_area_million_km2);
      const ancestry = rec.ancestry_primary_pct == null ? [] : vector(rec.ancestry_primary_pct, ANCESTRIES, pop, name + '.ancestry');
      if (cohort === 'PROFILED_14' && ancestry.length !== 6) throw new Error('COMPOSITION_PROFILED_ANCESTRY_MISSING: ' + name);
      if (cohort === 'DEVELOPMENT_5' && ancestry.length !== 0) throw new Error('COMPOSITION_NEW_FIVE_ANCESTRY_UNEXPECTED: review new source policy');
      const spatial = rec.spatial_3d_canon == null ? null : asRecord(rec.spatial_3d_canon, name + '.spatial_3d_canon');
      const surface = spatial?.land_surface_pct == null ? [] : vector(spatial.land_surface_pct, SURFACES, land ?? 0, name + '.land_surface_pct').map((v) => ({
        key: v.key, label: v.label, pct: v.pct, area_million_km2: land === null ? null : land * v.pct / 100,
      }));
      const habitats = spatial?.principal_habitat_pct == null ? [] : vector(spatial.principal_habitat_pct, HABITATS, pop, name + '.principal_habitat_pct');
      countries.push({
        id: 'country:' + name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        name, cohort, population_billion: pop, land_area_million_km2: land,
        ancestry_status: ancestry.length ? 'ASSIGNED' : 'NOT_ASSIGNED', ancestry,
        surface_status: surface.length ? 'ASSIGNED' : 'NOT_ASSIGNED', surface,
        habitat_status: habitats.length ? 'ASSIGNED' : 'NOT_ASSIGNED', habitats,
        geometry_status: 'UNASSIGNED',
        spatial_note: 'Country polygons and occupied / constructed / habitable km³, marine residence by depth and habitat capacity are unassigned, not zero.',
        source_pointer: collection + '[' + i + ']',
      });
    }
  }
  const states = numeric(planet.sovereign_states, 'planet.sovereign_states');
  const residualStates = numeric(remaining.state_count, 'aggregate_remaining_18.state_count');
  const residualPopulation = numeric(remaining.population_billion, 'aggregate_remaining_18.population_billion');
  assertTotal(countries.reduce((s, c) => s + c.population_billion, residualPopulation), population, 'planet population', 1e-6);
  assertTotal(countries.length + residualStates, states, 'country count', 0);
  return CompositionSchema.parse({
    schema_version: 'reltroner-composition.v1',
    model_version: String(doc.schema_version),
    source: { repository: 'Reltroner/reltroner-studio', commit_sha: snapshot.identity.commit_sha, blob_sha: entry.sha, path: NCCM_DATASET_PATH },
    planet: {
      name: 'Asthortera', population_billion: population, sovereign_states: states,
      land_area_million_km2: numeric(planet.land_area_million_km2, 'planet.land_area_million_km2'),
      ancestry_method: 'CREATOR_RATIFIED_REPRESENTATIVE_14_COUNTRY_BENCHMARK',
      ancestry_reference_population_billion: referencePopulation,
      ancestry: planetAncestry,
    },
    coverage: {
      complete_ancestry: countries.filter((c) => c.ancestry_status === 'ASSIGNED').length,
      national_ancestry_unassigned: countries.filter((c) => c.ancestry_status !== 'ASSIGNED').length,
      residual_states: residualStates, residual_population_billion: residualPopulation,
    },
    countries,
    unknowns: [
      'The planetary ancestry model is a creator-ratified 14-country representative benchmark, not a measured 37-country census.',
      'Primary ancestry is not an independently documented biological species classification.',
      'The five additional nations have unassigned national ancestry compositions; the other 18 states are a combined residual.',
      'Surface percent uses terrestrial land area, not built volume; principal habitat percent uses unique residents, not land area or urbanization.',
      'Country polygon geometry, constructed/occupied/habitable km³ and marine residence by depth remain unassigned, not zero.',
    ],
  });
}
