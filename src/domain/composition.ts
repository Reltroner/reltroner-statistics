/**
 * Sentient composition domain: primary ancestry and Spatial 3D composition (NCCM V6.5, Year 0).
 * Pure and isomorphic: the pipeline, the pages, the assistant and the tests share it.
 *
 * Two sources, never mixed in one calculation:
 *  - Primary ancestry comes from PRODUCTION main (Reltroner/reltroner-studio), the authoritative
 *    published source. National shares are CANON_OBSERVED; absolute figures are population × share
 *    / 100 of the same record (CANON_DERIVED arithmetic, not an enumerated headcount).
 *  - Spatial 3D composition exists only in REMODELING main (Reltroner/reltroner-studio-remodeling),
 *    where the creator ratified it inside the remodeling workspace. It is not published to Studio
 *    production, so in this observatory it carries PROPOSED status. Areas use the remodeling land
 *    area and residents use the remodeling population of the same record.
 *
 * Primary ancestry is not a biological species taxonomy. Unassigned values stay unassigned (never
 * zero), and the eighteen deferred states remain one combined aggregate.
 */

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
/** Geometric measurements the composition does not assign. Shown as UNASSIGNED, never as zero. */
export const GEOMETRY_FIELDS = [
  { key: 'polygon', label: 'Country polygon' },
  { key: 'constructed_volume_km3', label: 'Constructed and occupied volume (km³)' },
  { key: 'habitable_volume_km3', label: 'Habitable volume (km³)' },
  { key: 'marine_vertical_resident_distribution', label: 'Marine residence by depth' },
  { key: 'habitat_capacity', label: 'Habitat capacity' },
] as const;

export const COMPOSITION_SCHEMA = 'reltroner-composition.v2';
export const SHARE_TOLERANCE = 1e-4;

export type CompositionCohort = 'PROFILED_14' | 'DEVELOPMENT_5';
export type AssignmentStatus = 'ASSIGNED' | 'NOT_ASSIGNED';

export interface CompositionSource {
  side: 'production' | 'remodeling';
  repository: 'Reltroner/reltroner-studio' | 'Reltroner/reltroner-studio-remodeling';
  commit_sha: string;
  blob_sha: string;
  path: string;
}

export interface ShareRow { key: string; label: string; pct: number; absolute_billion: number }
export interface AreaRow { key: string; label: string; pct: number; area_million_km2: number | null }

export interface AncestryCountry {
  id: string;
  name: string;
  cohort: CompositionCohort;
  population_billion: number;
  status: AssignmentStatus;
  rows: ShareRow[];
  pointer: string;
  /** How the same record reads in remodeling. Remodeling values are proposals, never mixed into production rows. */
  remodeling: { status: 'IDENTICAL' | 'DIFFERENT' | 'NOT_ASSIGNED' | 'RECORD_ABSENT'; population_billion: number | null; rows: ShareRow[] };
}

export interface SpatialCountry {
  id: string;
  name: string;
  cohort: CompositionCohort;
  /** Remodeling population of the record; the denominator of every habitat figure. */
  population_billion: number;
  /** Remodeling land area of the record; the denominator of every surface figure. */
  land_area_million_km2: number | null;
  /** Production land area of the same country, shown for comparison only and never used in a spatial calculation. */
  production_land_area_million_km2: number | null;
  production_population_billion: number | null;
  spatial_status_label: string | null;
  land_area_status_label: string | null;
  reference: string | null;
  surface_status: AssignmentStatus;
  surface_denominator: string | null;
  surface: AreaRow[];
  habitat_status: AssignmentStatus;
  habitat_denominator: string | null;
  habitats: ShareRow[];
  geometry: Array<{ key: string; label: string; status: 'UNASSIGNED' | 'PRESENT_NOT_RENDERED' }>;
  pointer: string;
}

export interface Composition {
  schema_version: typeof COMPOSITION_SCHEMA;
  model_version: string;
  sources: { production: CompositionSource; remodeling: CompositionSource | null };
  ancestry: {
    authority: 'PRODUCTION_MAIN';
    pct_status: 'CANON_OBSERVED';
    absolute_status: 'CANON_DERIVED';
    absolute_formula: string;
    planet: {
      population_billion: number;
      sovereign_states: number;
      method: 'CREATOR_RATIFIED_REPRESENTATIVE_14_COUNTRY_BENCHMARK';
      reference_population_billion: number;
      provenance_note: string;
      headcount_source: 'SOURCE_STATED' | 'DERIVED_FROM_SHARES';
      rows: ShareRow[];
      pointer: string;
    };
    countries: AncestryCountry[];
    coverage: { assigned: number; not_assigned: number; residual_states: number; residual_population_billion: number };
  };
  spatial: {
    authority: 'REMODELING_MAIN_CREATOR_RATIFIED_NOT_PRODUCTION';
    status: 'PROPOSED' | 'INSUFFICIENT_DATA';
    production_spatial_records: number;
    countries: SpatialCountry[];
    coverage: { surface_assigned: number; habitat_assigned: number; countries: number };
  };
  unknowns: string[];
}

/** Stable id used by the observations dataset and the knowledge graph. */
export function countryId(name: string): string {
  return `country:${name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function countrySlug(id: string): string {
  return id.split(':')[1] ?? id;
}

/** share × denominator / 100, rounded to 10 significant digits so floating noise never reaches a table. */
export function derive(pct: number, denominator: number): number {
  return Number(((denominator * pct) / 100).toPrecision(10));
}

export function pinnedUrl(source: Pick<CompositionSource, 'repository' | 'commit_sha' | 'path'>): string {
  return `https://github.com/${source.repository}/blob/${source.commit_sha}/${source.path}`;
}

/** Human formatting used by every composition surface (fixed decimals, never locale-dependent grouping drift). */
export function fmt(n: number, places = 2): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: places, minimumFractionDigits: places });
}
