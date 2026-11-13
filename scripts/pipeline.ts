#!/usr/bin/env node
/**
 * Read-only analysis pipeline. Sources are read exclusively through the GitHub API at immutable
 * commit SHAs. Output is staged, validated against the versioned contracts and only then swapped
 * into artifacts/, keeping the previous successful output in artifacts.previous/ (last known good).
 *
 *   node scripts/pipeline.ts                                   # resolve main of both repos, then pin
 *   node scripts/pipeline.ts --production-sha <sha> --remodeling-sha <sha>
 *   node scripts/pipeline.ts --skip-python                     # analytics marked unavailable
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import { verifyDeployment } from '../src/adapters/deployment.ts';
import { loadGitHubSnapshot } from '../src/adapters/snapshot.ts';
import { AnalyticsSchema, ArtifactManifestSchema, AuditSchema, CreativeArtifactSchema, DecisionArtifactSchema, GraphSchema, QaReportSchema, StatisticsDatasetSchema } from '../src/contracts/schemas.ts';
import { compareSources } from '../src/engine/comparator.ts';
import { buildCreativeIntelligenceArtifact } from '../src/engine/creative-intelligence/index.ts';
import { buildDecisionArtifact } from '../src/engine/decision-intelligence/index.ts';
import type { MlModel } from '../src/engine/decision-intelligence/ml.ts';
import { sha256Hex } from '../src/engine/git-objects.ts';
import { buildKnowledgeGraph } from '../src/engine/graph-builder.ts';
import { extractStatistics, NCCM_DATASET_PATH } from '../src/engine/observations.ts';
import { runQa } from '../src/engine/qa.ts';
import { ROOT, createCache, createClient, parseArgs, writeJsonAtomic } from './lib/context.ts';

const args = parseArgs(process.argv.slice(2), ['--production-sha', '--remodeling-sha', '--production-ref', '--remodeling-ref'], ['--skip-python']);
const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : undefined);
const log = (m: string) => process.stderr.write(`[pipeline] ${m}\n`);
const steps: Array<{ id: string; status: 'COMPLETED' | 'SKIPPED'; detail: string }> = [];

const client = createClient();
const cache = createCache();
const started = new Date();
log(`GitHub API ${client.authenticated ? 'authenticated' : 'UNAUTHENTICATED (60 requests/hour; set GITHUB_TOKEN)'}`);

const [production, remodeling] = await Promise.all([
  loadGitHubSnapshot(client, cache, { side: 'production', sha: str('--production-sha'), ref: str('--production-ref') }),
  loadGitHubSnapshot(client, cache, { side: 'remodeling', sha: str('--remodeling-sha'), ref: str('--remodeling-ref') }),
]);
steps.push({ id: 'ingest', status: 'COMPLETED', detail: `production ${production.identity.commit_sha.slice(0, 12)}, remodeling ${remodeling.identity.commit_sha.slice(0, 12)}; root trees recomputed and verified` });
log(steps.at(-1)!.detail);

const deployment = await verifyDeployment(client, {
  productionMainSha: production.identity.commit_sha,
  buildInfoUrl: process.env.STUDIO_BUILD_INFO_URL || undefined,
});
steps.push({ id: 'deployment', status: 'COMPLETED', detail: deployment.status });

const audit = await compareSources(production, remodeling, { deployment, generatedAt: started.toISOString() });
steps.push({ id: 'compare', status: 'COMPLETED', detail: `${audit.summary.total_compared_paths} paths, ${audit.summary.findings_total} findings, digest ${audit.semantic_digest.slice(0, 16)}` });
log(steps.at(-1)!.detail);

const stats = await extractStatistics(production, remodeling);
steps.push({ id: 'observations', status: 'COMPLETED', detail: `${stats.observations.length} production observations, ${stats.proposals.length} remodeling proposals, ${stats.evidence_checks.filter((e) => e.status === 'VERIFIED').length}/${stats.evidence_checks.length} evidence rules verified` });
log(steps.at(-1)!.detail);

const readDoc = async (s: typeof production) => {
  const e = s.entries.get(NCCM_DATASET_PATH);
  return e ? JSON.parse(new TextDecoder().decode(await s.readBlob(e.sha))) : null;
};
const qa = {
  schema_version: 'reltroner-statistics-qa.v1' as const,
  production: runQa(await readDoc(production), 'PRODUCTION_MAIN'),
  remodeling: runQa(await readDoc(remodeling), 'REMODELING_MAIN'),
};
steps.push({ id: 'qa', status: 'COMPLETED', detail: `production ${qa.production.filter((q) => q.result === 'PASS').length}/${qa.production.length} pass; remodeling ${qa.remodeling.filter((q) => q.result === 'PASS').length}/${qa.remodeling.length} pass` });

const graph = await buildKnowledgeGraph({ audit, stats, qa: qa.production, production, remodeling });
steps.push({ id: 'graph', status: 'COMPLETED', detail: `${graph.nodes.length} nodes, ${graph.edges.length} edges` });
log(steps.at(-1)!.detail);

const creative = await buildCreativeIntelligenceArtifact({
  production,
  remodeling,
  audit,
  stats,
  qaProduction: qa.production,
  qaRemodeling: qa.remodeling,
  graph,
  generatedAt: audit.generated_at,
});
steps.push({
  id: 'creative',
  status: 'COMPLETED',
  detail: `${creative.summary.entities_total} narrative entities, ${creative.summary.relationships_total} relationships, ${creative.summary.audit_findings_total} audit findings, ${creative.summary.opportunities_total} opportunities, ${creative.summary.refactoring_plans_total} refactoring plans, ${creative.summary.scenarios_total} scenarios, ${creative.summary.seed_proposals_total} proposals`,
});
log(steps.at(-1)!.detail);

const staging = path.join(ROOT, 'artifacts.staging');
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
const write = (name: string, value: unknown) => writeJsonAtomic(path.join(staging, name), value);
write('audit.json', audit);
write('observations.json', stats);
write('qa.json', qa);
write('graph.json', graph);
write('creative.json', creative);

if (args['--skip-python']) {
  steps.push({ id: 'analytics', status: 'SKIPPED', detail: 'Python analytics skipped by flag; analytical pages show the unavailable state.' });
} else {
  const res = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'run-python.mjs'), '-m', 'reltroner_analytics',
    '--input', path.join(staging, 'observations.json'), '--output', path.join(staging, 'analytics.json'),
    '--charts-dir', path.join(staging, 'charts'), '--schemas', path.join(ROOT, 'analytics', 'schemas'),
  ], { cwd: ROOT, encoding: 'utf8' });
  if (res.status !== 0) {
    process.stderr.write(res.stdout ?? '');
    process.stderr.write(res.stderr ?? '');
    throw new Error('Python analytics failed; artifacts were not published (last known good preserved).');
  }
  steps.push({ id: 'analytics', status: 'COMPLETED', detail: (res.stdout ?? '').trim().split('\n').pop() ?? 'ok' });
  log(steps.at(-1)!.detail);
}

const analyticsPath = path.join(staging, 'analytics.json');
const analytics = fs.existsSync(analyticsPath)
  ? AnalyticsSchema.parse(JSON.parse(fs.readFileSync(analyticsPath, 'utf8')))
  : null;
const mlModels: Array<{ slug: string; model: MlModel }> = analytics
  ? analytics.decision_trees.tasks
      .filter((t): t is typeof t & { model: NonNullable<typeof t.model> } => t.status === 'COMPUTED' && t.model !== null)
      .map((t) => ({ slug: t.task_id, model: t.model as unknown as MlModel }))
  : [];

const decisions = await buildDecisionArtifact({
  production,
  remodeling,
  graph,
  deployment_status: deployment.status,
  source_timestamp: production.identity.committed_at ?? audit.generated_at,
  stats,
  audit,
  qaProduction: qa.production,
  qaRemodeling: qa.remodeling,
  creative,
  generated_at: audit.generated_at,
  models: mlModels,
});
write('decisions.json', decisions);
steps.push({
  id: 'decisions',
  status: 'COMPLETED',
  detail: `${decisions.summary.trees_total} trees, ${decisions.summary.paths_total} paths, ${decisions.summary.evaluations_total} evaluations, ${decisions.summary.model_trees_total} fitted model trees, digest ${decisions.semantic_digest.slice(0, 16)}`,
});
log(steps.at(-1)!.detail);

// Contract gates: every artifact must validate before anything is published.
const gates: Array<[string, z.ZodType]> = [
  ['audit.json', AuditSchema], ['observations.json', StatisticsDatasetSchema], ['qa.json', QaReportSchema], ['graph.json', GraphSchema], ['creative.json', CreativeArtifactSchema], ['decisions.json', DecisionArtifactSchema],
  ...(fs.existsSync(analyticsPath) ? [['analytics.json', AnalyticsSchema] as [string, z.ZodType]] : []),
];
for (const [name, schema] of gates) {
  const parsed = schema.safeParse(JSON.parse(fs.readFileSync(path.join(staging, name), 'utf8')));
  if (!parsed.success) throw new Error(`Contract violation in ${name}: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('/')}: ${i.message}`).join('; ')}`);
}
steps.push({ id: 'contracts', status: 'COMPLETED', detail: `${gates.length} artifacts validated` });


const listFiles = (dir: string, prefix = ''): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? listFiles(path.join(dir, d.name), `${prefix}${d.name}/`) : [`${prefix}${d.name}`]);
const files = listFiles(staging).filter((f) => f !== 'manifest.json').sort().map((name) => {
  const bytes = fs.readFileSync(path.join(staging, name));
  return { path: name, bytes: bytes.byteLength, sha256: sha256Hex(bytes) };
});
const manifest = {
  schema_version: 'reltroner-statistics-artifacts.v1' as const,
  mode: 'SOURCE_PINNED' as const,
  generated_at: audit.generated_at,
  rules_version: audit.rules_version,
  semantic_digest: audit.semantic_digest,
  sources: audit.sources,
  deployment: { status: deployment.status, deployed_sha: deployment.deployed_sha },
  github: { authenticated: client.authenticated, requests: client.requests, cache_hits: cache.hits, cache_misses: cache.misses },
  steps,
  files,
};
ArtifactManifestSchema.parse(manifest);
write('manifest.json', manifest);

const live = path.join(ROOT, 'artifacts');
const previous = path.join(ROOT, 'artifacts.previous');
if (fs.existsSync(live)) {
  fs.rmSync(previous, { recursive: true, force: true });
  fs.renameSync(live, previous);
}
fs.renameSync(staging, live);
process.stdout.write(`${JSON.stringify({
  status: 'ARTIFACTS_GENERATED_NOT_DEPLOYED',
  production: production.identity.commit_sha,
  remodeling: remodeling.identity.commit_sha,
  deployment: deployment.status,
  semantic_digest: audit.semantic_digest,
  steps: steps.map((s) => `${s.id}: ${s.status}`),
}, null, 2)}\n`);
