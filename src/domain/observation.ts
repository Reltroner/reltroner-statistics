import type { Period } from './calendar.ts';
import type { EpistemicStatus } from './status.ts';
import type { SourceRole } from './source.ts';

export type EntityKind = 'country' | 'planet' | 'aggregate_residual';
export type Cohort = 'PROFILED_14' | 'DEVELOPMENT_5' | 'PLANET' | 'DEFERRED_18_AGGREGATE';

export interface ObservationSource {
  role: SourceRole;
  repository: string;
  commit_sha: string;
  path: string;
  blob_sha: string;
  /** Engine pointer into the JSON document, or null for text evidence. */
  pointer: string | null;
  line: number | null;
}

export interface Observation {
  id: string;
  entity_id: string;
  entity_name: string;
  entity_kind: EntityKind;
  cohort: Cohort;
  indicator_id: string;
  value: number | null;
  /** ASSIGNED, explicit null, or member missing from the source record. Null is never zero. */
  value_state: 'ASSIGNED' | 'NULL' | 'MISSING';
  unit: string;
  period: Period;
  status: EpistemicStatus;
  source: ObservationSource;
  model_version: string | null;
  source_status_label: string | null;
  evidence: { rule_id: string; quote: string; note: string | null } | null;
}

export interface Entity {
  id: string;
  name: string;
  kind: EntityKind;
  cohort: Cohort;
  source_document: string | null;
  specialization: string | null;
  fx_code: string | null;
  foundation_bac: number | null;
  /** Number of sovereign states represented (18 for the residual aggregate, 1 otherwise). */
  represents_states: number;
  canon_status: string | null;
}

export interface MigrationFlow {
  origin: string;
  destination: string;
  population_billion: number;
  source_sdi_unchanged: number | null;
}

export interface TimelineEvent {
  id: string;
  label: string;
  start_bac: number;
  end_bac: number;
  kind: 'FOUNDATION' | 'EVENT';
  entity_id: string | null;
  status: EpistemicStatus;
  source: ObservationSource;
  note: string | null;
}

export interface RangeAnnotation {
  id: string;
  entity_id: string;
  indicator_id: string;
  low: number;
  high: number;
  unit: string;
  timing: string;
  status: EpistemicStatus;
  quote: string;
  source: ObservationSource;
}

export interface SourceIssue {
  code: string;
  severity: string;
  description: string;
  source: ObservationSource;
}

export interface StatisticsDataset {
  schema_version: 'reltroner-statistics-observations.v1';
  model_version: string | null;
  dataset_path: string;
  production: { commit_sha: string; blob_sha: string } | null;
  remodeling: { commit_sha: string; blob_sha: string } | null;
  entities: Entity[];
  observations: Observation[];
  proposals: Observation[];
  timeline: TimelineEvent[];
  ranges: RangeAnnotation[];
  migration: { flows: MigrationFlow[]; total_billion: number | null; status: EpistemicStatus; source: ObservationSource | null };
  source_issues: SourceIssue[];
  evidence_checks: Array<{ rule_id: string; path: string; status: 'VERIFIED' | 'NOT_FOUND' | 'SOURCE_MISSING'; line: number | null }>;
  unknowns: string[];
}
