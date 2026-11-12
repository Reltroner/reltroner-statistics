import type {
  ChangeType,
  ContentChangeNature,
  FileClassification,
  FindingClassification,
  FindingLevel,
  ReviewStatus,
} from './status.ts';
import type { DeploymentVerification, SourceIdentity } from './source.ts';

export type ValueType = 'null' | 'array' | 'object' | 'string' | 'number' | 'boolean' | 'text';

export interface SideValue {
  present: boolean;
  value?: unknown;
  value_type?: ValueType;
}

export interface SideProvenance {
  repository: string;
  commit_sha: string;
  path: string;
  blob_sha: string | null;
  line?: number | null;
}

export interface NumericDelta {
  absolute: number;
  relative: number | null;
}

export interface Finding {
  id: string;
  level: FindingLevel;
  classification: FindingClassification;
  change_type: ChangeType;
  review_status: ReviewStatus;
  priority: 'P1' | 'P2' | 'P3';
  title: string;
  file_path: string;
  file_kind: 'json' | 'markdown';
  locator: string;
  entity: { kind: 'country' | 'record' | 'document'; name: string } | null;
  field: string | null;
  unit: string | null;
  unit_source: 'FIELD_NAME_CONVENTION' | null;
  production: SideValue;
  remodeling: SideValue;
  numeric_delta: NumericDelta | null;
  production_canon_status: string | null;
  content_nature: ContentChangeNature | null;
  diff: { added_lines: number; removed_lines: number; excerpt: string[]; truncated: boolean } | null;
  recommendation: string;
  rule: string;
  provenance: { production: SideProvenance | null; remodeling: SideProvenance | null };
}

export interface FileRecord {
  path: string;
  kind: 'json' | 'markdown';
  classification: FileClassification;
  production_blob_sha: string | null;
  remodeling_blob_sha: string | null;
  production_bytes: number | null;
  remodeling_bytes: number | null;
  content_nature: ContentChangeNature | null;
  finding_count: number;
  title: string | null;
  analysis: 'COMPLETE' | 'SKIPPED_OVERSIZE' | 'NOT_REQUIRED' | 'INVALID_SOURCE';
}

export interface AuditSummary {
  total_compared_paths: number;
  identical: number;
  changed: number;
  production_only: number;
  draft_only: number;
  changed_by_nature: Record<string, number>;
  findings_total: number;
  json_field_findings: number;
  findings_by_level: Record<string, number>;
  findings_by_classification: Record<string, number>;
  findings_by_review_status: Record<string, number>;
  findings_by_priority: Record<string, number>;
}

export interface Audit {
  schema_version: 'reltroner-statistics-audit.v2';
  rules_version: string;
  scope: { scope_id: string; rules_version: string; include: string[]; exclude: string[]; max_blob_bytes: number };
  sources: { production: SourceIdentity; remodeling: SourceIdentity };
  deployment: DeploymentVerification;
  summary: AuditSummary;
  files: FileRecord[];
  findings: Finding[];
  semantic_digest: string;
  generated_at: string;
}
