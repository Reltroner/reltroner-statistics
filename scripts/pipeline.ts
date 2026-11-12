#!/usr/bin/env node
/**
 * Read-only analysis pipeline. Sources are read exclusively through the GitHub API at immutable
 * commit SHAs. Output is staged, validated and only then swapped into artifacts/, keeping the
 * previous successful output in artifacts.previous/ (last known good).
 *
 *   node scripts/pipeline.ts                                   # resolve main of both repos, then pin
 *   node scripts/pipeline.ts --production-sha <sha> --remodeling-sha <sha>
 */
import fs from 'node:fs';
import path from 'node:path';
import { verifyDeployment } from '../src/adapters/deployment.ts';
import { loadGitHubSnapshot } from '../src/adapters/snapshot.ts';
import { compareSources } from '../src/engine/comparator.ts';
import { sha256Hex } from '../src/engine/git-objects.ts';
import { ROOT, createCache, createClient, parseArgs, writeJsonAtomic } from './lib/context.ts';

const args = parseArgs(process.argv.slice(2), ['--production-sha', '--remodeling-sha', '--production-ref', '--remodeling-ref']);
const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : undefined);
const log = (m: string) => process.stderr.write(`[pipeline] ${m}\n`);

const client = createClient();
const cache = createCache();
const started = new Date();
log(`GitHub API ${client.authenticated ? 'authenticated' : 'UNAUTHENTICATED (60 requests/hour; set GITHUB_TOKEN)'}`);

const [production, remodeling] = await Promise.all([
  loadGitHubSnapshot(client, cache, { side: 'production', sha: str('--production-sha'), ref: str('--production-ref') }),
  loadGitHubSnapshot(client, cache, { side: 'remodeling', sha: str('--remodeling-sha'), ref: str('--remodeling-ref') }),
]);
log(`production ${production.identity.commit_sha} tree ${production.identity.tree_sha} (verified)`);
log(`remodeling ${remodeling.identity.commit_sha} tree ${remodeling.identity.tree_sha} (verified)`);

const deployment = await verifyDeployment(client, {
  productionMainSha: production.identity.commit_sha,
  buildInfoUrl: process.env.STUDIO_BUILD_INFO_URL || undefined,
});
log(`deployment ${deployment.status}`);

const audit = await compareSources(production, remodeling, { deployment, generatedAt: started.toISOString() });
log(`audit ${audit.summary.total_compared_paths} paths, ${audit.summary.findings_total} findings, digest ${audit.semantic_digest.slice(0, 16)}`);

const staging = path.join(ROOT, 'artifacts.staging');
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
const outputs: Record<string, unknown> = { 'audit.json': audit };
for (const [name, value] of Object.entries(outputs)) writeJsonAtomic(path.join(staging, name), value);

const files = Object.keys(outputs).sort().map((name) => {
  const bytes = fs.readFileSync(path.join(staging, name));
  return { path: name, bytes: bytes.byteLength, sha256: sha256Hex(bytes) };
});
writeJsonAtomic(path.join(staging, 'manifest.json'), {
  schema_version: 'reltroner-statistics-artifacts.v1',
  mode: 'SOURCE_PINNED',
  generated_at: audit.generated_at,
  rules_version: audit.rules_version,
  semantic_digest: audit.semantic_digest,
  sources: audit.sources,
  deployment: { status: deployment.status, deployed_sha: deployment.deployed_sha },
  github: { authenticated: client.authenticated, requests: client.requests, cache_hits: cache.hits, cache_misses: cache.misses },
  files,
});

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
  summary: audit.summary,
  semantic_digest: audit.semantic_digest,
}, null, 2)}\n`);
