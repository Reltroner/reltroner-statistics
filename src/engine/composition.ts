/**
 * Builds the composition artifact from the pinned snapshots. Ancestry is read from production
 * main; Spatial 3D composition is read from remodeling main. Every share vector must name exactly
 * the expected categories and close to 100%; a malformed vector stops the build (the previous
 * artifacts stay published) instead of being repaired or rescaled.
 */
import {
  ANCESTRIES,
  COMPOSITION_SCHEMA,
  GEOMETRY_FIELDS,
  HABITATS,
  SHARE_TOLERANCE,
  SURFACES,
  countryId,
  derive,
  type AncestryCountry,
  type Composition,
  type CompositionCohort,
  type CompositionSource,
  type ShareRow,
  type SpatialCountry,
} from '../domain/composition.ts';
import type { SourceSnapshot } from './comparator.ts';
import { NCCM_DATASET_PATH } from './observations.ts';

type Rec = Record<string, unknown>;
const decoder = new TextDecoder();

function record(value: unknown, label: string): Rec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`COMPOSITION_MISSING: ${label}`);
  return value as Rec;
}
function nonNegative(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`COMPOSITION_INVALID_NUMBER: ${label}`);
  return value;
}
function optional(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A share vector with exactly the expected keys, each a finite percentage, closing to 100. */
function shares<const T extends ReadonlyArray<{ key: string; label: string }>>(src: unknown, categories: T, label: string): Array<{ key: string; label: string; pct: number }> {
  const rec = record(src, label);
  const unknown = Object.keys(rec).filter((k) => !categories.some((c) => c.key === k));
  if (unknown.length) throw new Error(`COMPOSITION_UNKNOWN_CATEGORIES: ${label}: ${unknown.join(', ')}`);
  const rows = categories.map((c) => {
    const pct = nonNegative(rec[c.key], `${label}.${c.key}`);
    if (pct > 100) throw new Error(`COMPOSITION_INVALID_NUMBER: ${label}.${c.key} > 100`);
    return { key: c.key, label: c.label, pct };
  });
  const total = rows.reduce((s, r) => s + r.pct, 0);
  if (Math.abs(total - 100) > SHARE_TOLERANCE) throw new Error(`COMPOSITION_CONTRACT_VIOLATION: ${label} sums to ${total}, expected 100`);
  return rows;
}

async function readNccm(snapshot: SourceSnapshot): Promise<{ doc: Rec; source: CompositionSource } | null> {
  const entry = snapshot.entries.get(NCCM_DATASET_PATH);
  if (!entry || entry.type !== 'blob') return null;
  const doc = record(JSON.parse(decoder.decode(await snapshot.readBlob(entry.sha))), `${snapshot.identity.side} NCCM`);
  const side = snapshot.identity.side;
  return {
    doc,
    source: {
      side, repository: side === 'production' ? 'Reltroner/reltroner-studio' : 'Reltroner/reltroner-studio-remodeling',
      commit_sha: snapshot.identity.commit_sha, blob_sha: entry.sha, path: NCCM_DATASET_PATH,
    },
  };
}

interface NationRecord { rec: Rec; name: string; cohort: CompositionCohort; pointer: string }

function nations(doc: Rec, label: string): NationRecord[] {
  const out: NationRecord[] = [];
  for (const [collection, cohort] of [['countries_14', 'PROFILED_14'], ['countries_5', 'DEVELOPMENT_5']] as const) {
    const list = doc[collection];
    if (!Array.isArray(list)) throw new Error(`COMPOSITION_MISSING: ${label}.${collection}`);
    list.forEach((raw, i) => {
      const rec = record(raw, `${label}.${collection}[${i}]`);
      const name = text(rec.name);
      if (!name) throw new Error(`COMPOSITION_MISSING: ${label}.${collection}[${i}].name`);
      out.push({ rec, name, cohort, pointer: `${collection}[${i}]` });
    });
  }
  return out;
}

function ancestryRows(rec: Rec, population: number, label: string): ShareRow[] {
  if (rec.ancestry_primary_pct == null) return [];
  return shares(rec.ancestry_primary_pct, ANCESTRIES, label).map((r) => ({ ...r, absolute_billion: derive(r.pct, population) }));
}

export async function buildComposition(production: SourceSnapshot, remodeling: SourceSnapshot | null): Promise<Composition> {
  const prod = await readNccm(production);
  if (!prod) throw new Error(`COMPOSITION_SOURCE_MISSING: ${NCCM_DATASET_PATH} in production`);
  const draft = remodeling ? await readNccm(remodeling) : null;

  // ---------------------------------------------------------------- Primary ancestry (production)
  const planet = record(prod.doc.planet, 'production planet');
  const population = nonNegative(planet.population_billion, 'planet.population_billion');
  const states = nonNegative(planet.sovereign_states, 'planet.sovereign_states');
  const census = record(prod.doc.census, 'production census');
  const reference = nonNegative(record(census.pre_migration_reference, 'census.pre_migration_reference').planetary_proxy_ancestry_denominator_billion, 'reference denominator');
  const provenance = text(planet.ancestry_reference_provenance) ?? '';
  if (!provenance.includes(`${reference}B`)) throw new Error(`COMPOSITION_REFERENCE_CHANGED: the provenance note does not state the ${reference}B reference denominator`);
  const planetShares = shares(planet.ancestry_primary_pct_representative_14_country_weighted, ANCESTRIES, 'planet.ancestry');
  const statedHeadcount = planet.ancestry_primary_headcount_billion_representative == null ? null : record(planet.ancestry_primary_headcount_billion_representative, 'planet.headcount');
  const planetRows: ShareRow[] = planetShares.map((r) => {
    const derived = derive(r.pct, population);
    if (!statedHeadcount) return { ...r, absolute_billion: derived };
    const stated = nonNegative(statedHeadcount[r.key], `planet.headcount.${r.key}`);
    if (Math.abs(stated - derived) > Math.max(1e-6 * population, 1e-6)) throw new Error(`COMPOSITION_CONTRACT_VIOLATION: stated planetary headcount for ${r.key} (${stated}) differs from share × population (${derived})`);
    return { ...r, absolute_billion: Number(stated.toPrecision(10)) };
  });

  const draftByName = new Map((draft ? nations(draft.doc, 'remodeling') : []).map((n) => [n.name, n]));
  const prodNations = nations(prod.doc, 'production');
  const ancestryCountries: AncestryCountry[] = prodNations.map((n) => {
    const pop = nonNegative(n.rec.population_billion, `${n.name}.population_billion`);
    const rows = ancestryRows(n.rec, pop, `${n.name}.ancestry_primary_pct`);
    const twin = draftByName.get(n.name);
    let remodelingView: AncestryCountry['remodeling'] = { status: 'RECORD_ABSENT', population_billion: null, rows: [] };
    if (twin) {
      const dpop = nonNegative(twin.rec.population_billion, `remodeling ${n.name}.population_billion`);
      const drows = ancestryRows(twin.rec, dpop, `remodeling ${n.name}.ancestry_primary_pct`);
      const same = drows.length === rows.length && dpop === pop && drows.every((r, i) => r.pct === rows[i]!.pct);
      remodelingView = { status: !drows.length ? 'NOT_ASSIGNED' : same ? 'IDENTICAL' : 'DIFFERENT', population_billion: dpop, rows: same ? [] : drows };
    }
    return { id: countryId(n.name), name: n.name, cohort: n.cohort, population_billion: pop, status: rows.length ? 'ASSIGNED' : 'NOT_ASSIGNED', rows, pointer: n.pointer, remodeling: remodelingView };
  });
  const residual = record(prod.doc.aggregate_remaining_18, 'aggregate_remaining_18');
  const residualStates = nonNegative(residual.state_count, 'aggregate_remaining_18.state_count');
  const residualPopulation = nonNegative(residual.population_billion, 'aggregate_remaining_18.population_billion');
  const nationalTotal = ancestryCountries.reduce((s, c) => s + c.population_billion, residualPopulation);
  if (Math.abs(nationalTotal - population) > 1e-6 * population) throw new Error(`COMPOSITION_CONTRACT_VIOLATION: national populations plus residual (${nationalTotal}) differ from the planetary population (${population})`);
  if (ancestryCountries.length + residualStates !== states) throw new Error(`COMPOSITION_CONTRACT_VIOLATION: ${ancestryCountries.length} nations + ${residualStates} residual states ≠ ${states} sovereign states`);

  // ---------------------------------------------------------------- Spatial 3D (remodeling)
  const prodByName = new Map(prodNations.map((n) => [n.name, n]));
  const productionSpatial = prodNations.filter((n) => n.rec.spatial_3d_canon != null).length;
  const spatialCountries: SpatialCountry[] = draft ? nations(draft.doc, 'remodeling').map((n) => {
    const pop = nonNegative(n.rec.population_billion, `remodeling ${n.name}.population_billion`);
    const land = optional(n.rec.land_area_million_km2);
    const spatial = n.rec.spatial_3d_canon == null ? null : record(n.rec.spatial_3d_canon, `remodeling ${n.name}.spatial_3d_canon`);
    const surfaceShares = spatial?.land_surface_pct == null ? [] : shares(spatial.land_surface_pct, SURFACES, `remodeling ${n.name}.land_surface_pct`);
    const habitatShares = spatial?.principal_habitat_pct == null ? [] : shares(spatial.principal_habitat_pct, HABITATS, `remodeling ${n.name}.principal_habitat_pct`);
    const twin = prodByName.get(n.name)?.rec;
    return {
      id: countryId(n.name), name: n.name, cohort: n.cohort, population_billion: pop, land_area_million_km2: land,
      production_land_area_million_km2: twin ? optional(twin.land_area_million_km2) : null,
      production_population_billion: twin ? optional(twin.population_billion) : null,
      spatial_status_label: text(spatial?.status), land_area_status_label: text(n.rec.land_area_status), reference: text(spatial?.reference),
      surface_status: surfaceShares.length ? 'ASSIGNED' : 'NOT_ASSIGNED',
      surface_denominator: text(spatial?.land_footprint_denominator),
      surface: surfaceShares.map((r) => ({ ...r, area_million_km2: land === null ? null : derive(r.pct, land) })),
      habitat_status: habitatShares.length ? 'ASSIGNED' : 'NOT_ASSIGNED',
      habitat_denominator: text(spatial?.habitat_denominator),
      habitats: habitatShares.map((r) => ({ ...r, absolute_billion: derive(r.pct, pop) })),
      geometry: GEOMETRY_FIELDS.map((g) => ({ key: g.key, label: g.label, status: spatial && spatial[g.key] != null ? 'PRESENT_NOT_RENDERED' : 'UNASSIGNED' })),
      pointer: n.pointer,
    } satisfies SpatialCountry;
  }) : [];
  const surfaceAssigned = spatialCountries.filter((c) => c.surface_status === 'ASSIGNED').length;
  const habitatAssigned = spatialCountries.filter((c) => c.habitat_status === 'ASSIGNED').length;

  return {
    schema_version: COMPOSITION_SCHEMA,
    model_version: text(prod.doc.schema_version) ?? 'unlabeled',
    sources: { production: prod.source, remodeling: draft?.source ?? null },
    ancestry: {
      authority: 'PRODUCTION_MAIN',
      pct_status: 'CANON_OBSERVED',
      absolute_status: 'CANON_DERIVED',
      absolute_formula: 'population_billion × pct / 100 of the same production record',
      planet: {
        population_billion: population, sovereign_states: states, method: 'CREATOR_RATIFIED_REPRESENTATIVE_14_COUNTRY_BENCHMARK',
        reference_population_billion: reference, provenance_note: provenance, headcount_source: statedHeadcount ? 'SOURCE_STATED' : 'DERIVED_FROM_SHARES',
        rows: planetRows, pointer: 'planet.ancestry_primary_pct_representative_14_country_weighted',
      },
      countries: ancestryCountries,
      coverage: {
        assigned: ancestryCountries.filter((c) => c.status === 'ASSIGNED').length,
        not_assigned: ancestryCountries.filter((c) => c.status === 'NOT_ASSIGNED').length,
        residual_states: residualStates,
        residual_population_billion: residualPopulation,
      },
    },
    spatial: {
      authority: 'REMODELING_MAIN_CREATOR_RATIFIED_NOT_PRODUCTION',
      status: surfaceAssigned + habitatAssigned > 0 ? 'PROPOSED' : 'INSUFFICIENT_DATA',
      production_spatial_records: productionSpatial,
      countries: spatialCountries,
      coverage: { surface_assigned: surfaceAssigned, habitat_assigned: habitatAssigned, countries: spatialCountries.length },
    },
    unknowns: [
      `The planetary ancestry shares are a creator-ratified representative benchmark of the 14 profiled nations (reference denominator ${reference} billion), not a measured census of all ${states} sovereign states.`,
      'Primary ancestry is not a biological species classification; the source records no independent species taxonomy.',
      `${ancestryCountries.filter((c) => c.status === 'NOT_ASSIGNED').length} nations have no national ancestry shares in production; they are shown as not assigned, never as zero.`,
      `The other ${residualStates} sovereign states are one combined aggregate of ${residualPopulation} billion residents; no per-state composition exists.`,
      `Spatial 3D composition is read from remodeling main, where it is creator-ratified inside the remodeling workspace; production main carries ${productionSpatial} spatial records, so these values are not published Studio canon.`,
      'Surface percentages use national terrestrial land area; habitat percentages use unique usual residents. Neither is urbanization, and they are never combined in one calculation.',
      'Country polygons, constructed and habitable volumes in km³, marine residence by depth and habitat capacity are unassigned, not zero.',
    ],
  };
}
