#!/usr/bin/env node
/**
 * P0R cross-platform determinism gate. Compares the pinned source pair through the GitHub API and
 * asserts the committed baseline (counts + semantic digest). Run on Windows and on Ubuntu CI:
 * both must print the same digest. `--write` regenerates the baseline deliberately.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { offlineDeployment } from '../src/adapters/deployment.ts';
import { loadGitHubSnapshot } from '../src/adapters/snapshot.ts';
import { compareSources } from '../src/engine/comparator.ts';
import { ROOT, createCache, createClient, parseArgs } from './lib/context.ts';

const BASELINE = path.join(ROOT, 'tests', 'baselines', 'p0r-baseline.json');
const args = parseArgs(process.argv.slice(2), [], ['--write']);

interface Baseline {
  production_sha: string;
  remodeling_sha: string;
  rules_version: string;
  expected: Record<string, number>;
  json_field_findings: number;
  semantic_digest: string;
  recorded_on: string;
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) as Baseline;
const client = createClient();
const cache = createCache();
const [prod, draft] = await Promise.all([
  loadGitHubSnapshot(client, cache, { side: 'production', sha: baseline.production_sha }),
  loadGitHubSnapshot(client, cache, { side: 'remodeling', sha: baseline.remodeling_sha }),
]);
const audit = await compareSources(prod, draft, { deployment: offlineDeployment('Baseline verification does not assess deployment.'), generatedAt: '1970-01-01T00:00:00.000Z' });
const s = audit.summary;
const actual = {
  total_compared_paths: s.total_compared_paths,
  identical: s.identical,
  changed: s.changed,
  production_only: s.production_only,
  draft_only: s.draft_only,
};
const report = {
  platform: `${os.platform()} ${os.release()} node ${process.version}`,
  rules_version: audit.rules_version,
  production: `${prod.identity.commit_sha} (tree ${prod.identity.tree_sha})`,
  remodeling: `${draft.identity.commit_sha} (tree ${draft.identity.tree_sha})`,
  counts: actual,
  json_field_findings: s.json_field_findings,
  changed_by_nature: s.changed_by_nature,
  findings_total: s.findings_total,
  semantic_digest: audit.semantic_digest,
  api_requests: client.requests,
  cache: { hits: cache.hits, misses: cache.misses },
};

if (args['--write']) {
  const next: Baseline = {
    ...baseline,
    rules_version: audit.rules_version,
    json_field_findings: s.json_field_findings,
    semantic_digest: audit.semantic_digest,
    recorded_on: report.platform,
  };
  fs.writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: 'BASELINE_WRITTEN', ...report }, null, 2)}\n`);
  process.exit(0);
}

const failures: string[] = [];
for (const [k, v] of Object.entries(baseline.expected)) {
  if ((actual as Record<string, number>)[k] !== v) failures.push(`${k}: expected ${v}, got ${(actual as Record<string, number>)[k]}`);
}
if (audit.rules_version !== baseline.rules_version) failures.push(`rules_version: expected ${baseline.rules_version}, got ${audit.rules_version}`);
if (s.json_field_findings !== baseline.json_field_findings) failures.push(`json_field_findings: expected ${baseline.json_field_findings}, got ${s.json_field_findings}`);
if (audit.semantic_digest !== baseline.semantic_digest) failures.push(`semantic_digest: expected ${baseline.semantic_digest}, got ${audit.semantic_digest}`);
process.stdout.write(`${JSON.stringify({ status: failures.length ? 'BASELINE_MISMATCH' : 'BASELINE_VERIFIED', failures, ...report }, null, 2)}\n`);
process.exit(failures.length ? 1 : 0);
