/**
 * Build-time artifact access for Astro pages. Server-only: reads artifacts/ produced by the
 * pipeline, validates each file against its versioned contract and fails the build on violation.
 * Nothing here ships to the browser except what pages explicitly pass to islands.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import type { CreativeArtifact } from '../domain/creative.ts';
import type { Audit, Finding } from '../domain/finding.ts';
import type { KnowledgeGraph } from '../domain/graph.ts';
import type { Observation, StatisticsDataset } from '../domain/observation.ts';
import { AnalyticsSchema, ArtifactManifestSchema, AuditSchema, CreativeArtifactSchema, GraphSchema, QaReportSchema, StatisticsDatasetSchema } from '../contracts/schemas.ts';
import type { QaCheck } from '../engine/qa.ts';

export type Analytics = z.infer<typeof AnalyticsSchema>;
export type Manifest = z.infer<typeof ArtifactManifestSchema>;
export interface QaReport { schema_version: string; production: QaCheck[]; remodeling: QaCheck[] }

const DIR = path.resolve(process.env.RELTRONER_ARTIFACTS_DIR || path.join(process.cwd(), 'artifacts'));
const cache = new Map<string, unknown>();

function load<T>(name: string, schema: z.ZodType, optional = false): T | null {
  if (cache.has(name)) return cache.get(name) as T | null;
  const file = path.join(DIR, name);
  if (!fs.existsSync(file)) {
    if (optional) { cache.set(name, null); return null; }
    throw new Error(`Missing artifact ${name}. Run "npm run pipeline" (GitHub API, read-only) before building.`);
  }
  const parsed = schema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!parsed.success) {
    throw new Error(`Artifact ${name} violates its contract: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('/')}: ${i.message}`).join('; ')}`);
  }
  cache.set(name, parsed.data);
  return parsed.data as T;
}

export const getManifest = () => load<Manifest>('manifest.json', ArtifactManifestSchema)!;
export const getAudit = () => load<Audit>('audit.json', AuditSchema)!;
export const getStats = () => load<StatisticsDataset>('observations.json', StatisticsDatasetSchema)!;
export const getQa = () => load<QaReport>('qa.json', QaReportSchema)!;
export const getGraph = () => load<KnowledgeGraph>('graph.json', GraphSchema)!;
export const getCreative = () => load<CreativeArtifact>('creative.json', CreativeArtifactSchema)!;
export const getAnalytics = () => load<Analytics>('analytics.json', AnalyticsSchema, true);

export function getChartSvg(id: string): string | null {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  const file = path.join(DIR, 'charts', `${id}.svg`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

export function getContext() {
  const audit = getAudit();
  const manifest = getManifest();
  return {
    production: audit.sources.production,
    remodeling: audit.sources.remodeling,
    deployment: audit.deployment,
    rules_version: audit.rules_version,
    semantic_digest: audit.semantic_digest,
    generated_at: audit.generated_at,
    manifest,
  };
}
export type SiteContext = ReturnType<typeof getContext>;

export function findingById(id: string): Finding | undefined {
  return getAudit().findings.find((f) => f.id === id);
}

/** Current production canon values at Year 0 (no archived, proposed or evidence-only rows). */
export function currentObservations(): Observation[] {
  return getStats().observations.filter((o) => o.period.year_bac === 0 && !o.period.interval && !o.evidence && o.status !== 'ARCHIVED');
}

export function observationsFor(indicatorId: string): Observation[] {
  return currentObservations().filter((o) => o.indicator_id === indicatorId);
}

export function proposalFor(entityId: string, indicatorId: string): Observation | undefined {
  return getStats().proposals.find((o) => o.entity_id === entityId && o.indicator_id === indicatorId && o.period.year_bac === 0 && !o.period.interval);
}

export function entityName(id: string): string {
  return getStats().entities.find((e) => e.id === id)?.name ?? id;
}
