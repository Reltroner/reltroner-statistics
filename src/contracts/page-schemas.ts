/**
 * RS-AI-PAGE-004 contracts: the semantic mirror of one public page (rs-page-context.v1) and the
 * page registry (rs-page-registry.v1). The build validates every mirror against these before it
 * writes it; JSON Schemas are generated from them into analytics/schemas/.
 */
import { z } from 'zod';
import { PAGE_CONTEXT_SCHEMA, PAGE_REGISTRY_CHUNK_SCHEMA, PAGE_REGISTRY_SCHEMA, URL_REFUSALS, VIEW_KINDS } from '../domain/page-url.ts';
export { PAGE_REGISTRY_CHUNK_SCHEMA };

export const SOURCE_ROLES = ['production', 'remodeling', 'mixed', 'statistics_generated'] as const;
export const COVERAGE_STATUSES = ['FULL', 'PARTIAL', 'NOT_REPRESENTABLE'] as const;
export const DATA_ROLES = ['production', 'remodeling', 'analysis'] as const;

const sha = z.string().regex(/^[0-9a-f]{40}$/).nullable();
const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const PageBlockSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('text'), text: z.string() }),
  z.strictObject({ type: z.literal('list'), ordered: z.boolean(), items: z.array(z.string()) }),
  z.strictObject({ type: z.literal('table'), caption: z.string().nullable(), columns: z.array(z.string()), rows: z.array(z.array(z.string())), rows_total: z.number().int().nonnegative(), truncated: z.boolean() }),
  z.strictObject({ type: z.literal('figure'), alt: z.string(), src: z.string().nullable() }),
  z.strictObject({ type: z.literal('component'), component: z.string(), hydration: z.string(), server_rendered: z.boolean(), data_ids: z.array(z.string()) }),
]);

export const PageSectionSchema = z.strictObject({
  section_id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  /** The element id a "#fragment" scrolls to, when the page has one. */
  anchor: z.string().nullable(),
  heading: z.string(),
  level: z.number().int().min(1).max(4),
  blocks: z.array(PageBlockSchema),
  blocks_total: z.number().int().nonnegative(),
  links: z.array(z.strictObject({ text: z.string(), href: z.string() })),
  truncated: z.boolean(),
});

export const DataSourceSchema = z.strictObject({
  role: z.enum(DATA_ROLES),
  repository: z.string().nullable(),
  commit_sha: sha,
  path: z.string().nullable(),
  pointer: z.string().nullable(),
  line: z.number().int().nullable(),
  url: z.string().nullable(),
});

export const PageDataSchema = z.strictObject({
  data_id: z.string().regex(/^data-[a-z0-9-]+$/),
  title: z.string(),
  /** The visualization this data feeds, or null for data the page renders on the server. */
  component: z.string().nullable(),
  /** Epistemic status of the values, as the artifact states it. */
  status: z.string(),
  source_role: z.enum(SOURCE_ROLES),
  description: z.string(),
  denominator: z.string().nullable(),
  columns: z.array(z.strictObject({ key: z.string(), label: z.string(), unit: z.string().nullable() })),
  rows: z.array(z.record(z.string(), cell)),
  rows_total: z.number().int().nonnegative(),
  truncated: z.boolean(),
  null_policy: z.string(),
  transforms: z.string().nullable(),
  default_view: z.string().nullable(),
  sources: z.array(DataSourceSchema),
  notes: z.array(z.string()),
});

export const SnapshotSchema = z.strictObject({
  statistics_commit: sha,
  production_source_sha: sha,
  remodeling_source_sha: sha,
  semantic_digest: z.string().nullable(),
  rules_version: z.string().nullable(),
  studio_deployment_status: z.string(),
  analysis_generated_at: z.string().nullable(),
});

const ViewParamSchema = z.strictObject({ name: z.string(), location: z.enum(['query', 'fragment']), kind: z.enum(VIEW_KINDS), effect: z.string() });
const IgnoredParamSchema = z.strictObject({ name: z.string(), location: z.enum(['query', 'fragment']), reason: z.string(), browser_only: z.boolean() });

export const PageContextSchema = z.strictObject({
  schema_version: z.literal(PAGE_CONTEXT_SCHEMA),
  page_id: z.string(),
  canonical_url: z.string(),
  canonical_path: z.string(),
  title: z.string(),
  html_title: z.string(),
  description: z.string(),
  lang: z.string().nullable(),
  site_section: z.string(),
  family: z.string(),
  content_kind: z.enum(['document', 'interactive', 'dynamic_record', 'report_export']),
  static_or_dynamic: z.enum(['static', 'dynamic']),
  route_pattern: z.string(),
  source_role: z.enum(SOURCE_ROLES),
  /** Commits the page itself names in its "Sources behind this view" list. */
  declared_sources: z.array(z.strictObject({ role: z.enum(['production', 'remodeling']), repository: z.string(), commit_sha: sha })),
  snapshot: SnapshotSchema,
  links: z.strictObject({ html: z.string(), json: z.string(), markdown: z.string(), registry: z.string() }),
  coverage: z.strictObject({ status: z.enum(COVERAGE_STATUSES), captured: z.array(z.string()), not_captured: z.array(z.string()) }),
  interactive: z.strictObject({
    components: z.array(z.strictObject({
      component: z.string(),
      hydration: z.string(),
      server_rendered: z.boolean(),
      data_ids: z.array(z.string()),
      default_view: z.string().nullable(),
      default_view_reproduced: z.boolean(),
      not_reproduced: z.array(z.string()),
    })),
    url_view_state: z.strictObject({ component: z.string(), supported: z.array(ViewParamSchema), unsupported: z.array(IgnoredParamSchema), browser_only: z.array(z.string()) }).nullable(),
  }),
  sections: z.array(PageSectionSchema),
  data: z.array(PageDataSchema),
  datasets: z.array(z.strictObject({ text: z.string(), href: z.string(), kind: z.string() })),
  known_unknowns: z.array(z.string()),
  limitations: z.array(z.string()),
  truncated: z.boolean(),
});

export const PageRegistryEntrySchema = z.strictObject({
  page_id: z.string(),
  title: z.string(),
  site_section: z.string(),
  family: z.string(),
  content_kind: PageContextSchema.shape.content_kind,
  static_or_dynamic: PageContextSchema.shape.static_or_dynamic,
  route_pattern: z.string(),
  source_role: z.enum(SOURCE_ROLES),
  coverage: z.enum(COVERAGE_STATUSES),
  json: z.string(),
  markdown: z.string(),
  sections: z.number().int().nonnegative(),
  data: z.number().int().nonnegative(),
  view_state: z.boolean(),
});

export const PageRegistrySchema = z.strictObject({
  schema_version: z.literal(PAGE_REGISTRY_SCHEMA),
  site_origin: z.string(),
  mirror_root: z.string(),
  snapshot: SnapshotSchema,
  census: z.strictObject({
    all_html: z.number().int(),
    eligible: z.number().int(),
    excluded: z.array(z.strictObject({ path: z.string(), reason: z.string() })),
    dynamic: z.number().int(),
    by_route_pattern: z.record(z.string(), z.number().int()),
    by_coverage: z.record(z.string(), z.number().int()),
  }),
  url_refusals: z.array(z.enum(URL_REFUSALS)),
  /** Static pages (and any page outside a chunked route), inline. */
  pages: z.array(PageRegistryEntrySchema),
  /** Pages of dynamic routes, in chunks sorted by page id, so no registry file grows past the response bound. */
  chunks: z.array(z.strictObject({ route_pattern: z.string(), first: z.string(), last: z.string(), count: z.number().int().positive(), href: z.string() })),
});

export const PageRegistryChunkSchema = z.strictObject({
  schema_version: z.literal(PAGE_REGISTRY_CHUNK_SCHEMA),
  route_pattern: z.string(),
  semantic_digest: z.string().nullable(),
  statistics_commit: sha,
  pages: z.array(PageRegistryEntrySchema),
});

export type PageBlock = z.infer<typeof PageBlockSchema>;
export type PageSection = z.infer<typeof PageSectionSchema>;
export type PageData = z.infer<typeof PageDataSchema>;
export type DataSource = z.infer<typeof DataSourceSchema>;
export type PageSnapshot = z.infer<typeof SnapshotSchema>;
export type PageContext = z.infer<typeof PageContextSchema>;
export type PageRegistry = z.infer<typeof PageRegistrySchema>;
export type PageRegistryEntry = z.infer<typeof PageRegistryEntrySchema>;
export type PageRegistryChunk = z.infer<typeof PageRegistryChunkSchema>;
export type SourceRole = (typeof SOURCE_ROLES)[number];
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];
