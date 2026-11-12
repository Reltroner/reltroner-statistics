/**
 * Export selection contract. All eight formats are equally selectable; none is implied or
 * inserted. Isomorphic: used by the build pipeline and by the browser Report Center.
 */
export const EXPORT_FORMATS = Object.freeze(['json', 'csv', 'xlsx', 'txt', 'md', 'html', 'pdf', 'xml'] as const);
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export type ExportScope = 'single' | 'selected' | 'all';
export type BundleLayout = 'per-finding' | 'consolidated';

const FORMAT_SET: ReadonlySet<string> = new Set(EXPORT_FORMATS);
export const ID_RE = /^[A-Z0-9][A-Z0-9-]{2,127}$/;
const SHA_RE = /^[0-9a-f]{40}$/;

export interface ExportRequest {
  scope: ExportScope;
  audit_id: string;
  production_sha: string;
  remodeling_sha: string;
  formats: readonly string[];
  finding_ids?: readonly string[];
  bundle_layout?: BundleLayout;
}

export interface ExportPlan {
  readonly scope: ExportScope;
  readonly finding_ids: readonly string[];
  readonly formats: readonly ExportFormat[];
  readonly bundle_layout: BundleLayout;
  readonly delivery: 'direct' | 'zip';
  readonly filename: string;
  readonly requires_manifest: boolean;
  readonly requires_checksums: boolean;
}

export function makeExportPlan(request: ExportRequest, availableIds: Iterable<string>): ExportPlan {
  if (!request || typeof request !== 'object') throw new Error('Request object required');
  if (!['single', 'all', 'selected'].includes(request.scope)) throw new Error('Invalid export scope');
  if (!ID_RE.test(request.audit_id ?? '')) throw new Error('Invalid audit ID');
  if (!SHA_RE.test(request.production_sha ?? '') || !SHA_RE.test(request.remodeling_sha ?? '')) {
    throw new Error('Pinned 40-character source SHAs required');
  }
  const formats = request.formats;
  if (!Array.isArray(formats) || !formats.length || formats.some((x) => !FORMAT_SET.has(x)) || new Set(formats).size !== formats.length) {
    throw new Error('Formats must be a nonempty unique supported subset');
  }
  const universe = new Set(availableIds);
  if ([...universe].some((x) => !ID_RE.test(x))) throw new Error('Invalid available finding ID');
  const ids = request.finding_ids ?? [];
  if (!Array.isArray(ids) || ids.some((x) => !ID_RE.test(x)) || new Set(ids).size !== ids.length) throw new Error('Invalid finding selection');
  if (request.scope === 'single' && ids.length !== 1) throw new Error('Single scope requires one ID');
  if (request.scope === 'selected' && ids.length === 0) throw new Error('Selected scope requires IDs');
  if (request.scope === 'all' && ids.length) throw new Error('All scope cannot provide IDs');
  const selected = (request.scope === 'all' ? [...universe] : [...ids]).sort();
  if (!selected.length || selected.some((id) => !universe.has(id))) throw new Error('Unknown or missing selected ID');
  const bundleLayout = request.bundle_layout ?? 'per-finding';
  if (!['per-finding', 'consolidated'].includes(bundleLayout)) throw new Error('Invalid bundle layout');
  const sortedFormats = [...formats].sort() as ExportFormat[];
  const direct = request.scope === 'single' && sortedFormats.length === 1;
  const prefix = `reltroner-statistics_${request.audit_id}_${request.production_sha.slice(0, 12)}_${request.remodeling_sha.slice(0, 12)}`;
  return Object.freeze({
    scope: request.scope,
    finding_ids: Object.freeze(selected),
    formats: Object.freeze(sortedFormats),
    bundle_layout: bundleLayout,
    delivery: direct ? 'direct' : 'zip',
    filename: direct ? `${selected[0]}.${sortedFormats[0]}` : `${prefix}.zip`,
    requires_manifest: !direct,
    requires_checksums: !direct,
  });
}
