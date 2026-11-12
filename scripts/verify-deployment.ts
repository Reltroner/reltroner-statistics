#!/usr/bin/env node
/**
 * Verify that a published Reltroner Statistics site serves exactly the local build: the live
 * build-info.json must match dist/build-info.json (Statistics commit, semantic digest, source SHAs).
 * Uploading an artifact or running a deploy command is not evidence; only this check is.
 *
 *   node scripts/verify-deployment.ts https://<deployment-host>
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/context.ts';

const base = process.argv[2];
if (!base || !/^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/?$/.test(base)) {
  process.stderr.write('Usage: verify-deployment.ts https://<host>\n');
  process.exit(2);
}
const local = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-info.json'), 'utf8')) as Record<string, unknown>;
let live: Record<string, unknown> | null = null;
for (let attempt = 0; attempt < 6 && !live; attempt++) {
  try {
    const res = await fetch(new URL('/build-info.json', base), { headers: { 'Cache-Control': 'no-cache' } });
    if (res.ok) live = (await res.json()) as Record<string, unknown>;
  } catch { /* propagation delay */ }
  if (!live) await new Promise((r) => setTimeout(r, 10_000));
}
const keys = ['statistics_commit', 'semantic_digest', 'rules_version', 'sources'] as const;
const mismatches = live ? keys.filter((k) => JSON.stringify(live![k]) !== JSON.stringify(local[k])) : ['unreachable'];
const result = { status: mismatches.length ? 'STATISTICS_DEPLOYMENT_UNVERIFIED' : 'STATISTICS_DEPLOYMENT_VERIFIED', url: base, mismatches, live_commit: live?.statistics_commit ?? null };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(mismatches.length ? 1 : 0);
