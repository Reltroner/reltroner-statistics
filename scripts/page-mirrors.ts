#!/usr/bin/env node
/**
 * RS-AI-PAGE-004 build step: page registry and semantic mirrors from the static output.
 *
 * Runs after `astro build` (and PDF printing) and before postbuild, which then verifies every
 * mirror link. Reads only dist/ and the pinned artifacts the pages were built from; writes only
 * dist/ai/pages/. No network, no clock, no external model.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildPageMirrors } from '../src/engine/page-mirror/index.ts';
import { NCCM_DATASET_PATH } from '../src/engine/observations.ts';
import { getAudit, getGraph, getManifest, getStats, observationsFor } from '../src/lib/data.ts';
import { ROUTES, sectionFor } from '../src/lib/site.ts';
import { PAGE_REGISTRY_PATH } from '../src/domain/page-url.ts';
import { ROOT } from './lib/context.ts';

const dist = path.join(ROOT, 'dist');
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const rel = (f: string) => path.relative(dist, f).split(path.sep).join('/');
const out = path.join(dist, 'ai', 'pages');
fs.rmSync(out, { recursive: true, force: true });

const started = Date.now();
const htmlFiles = walk(dist).filter((f) => f.endsWith('.html')).map((f) => ({ relative: rel(f), html: fs.readFileSync(f, 'utf8') }));
let statisticsCommit: string | null = null;
try { statisticsCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { statisticsCommit = null; }
const manifest = getManifest();
const snapshot = {
  statistics_commit: statisticsCommit,
  production_source_sha: manifest.sources.production.commit_sha,
  remodeling_source_sha: manifest.sources.remodeling.commit_sha,
  semantic_digest: manifest.semantic_digest,
  rules_version: manifest.rules_version,
  studio_deployment_status: manifest.deployment.status,
  analysis_generated_at: manifest.generated_at,
};
const stats = getStats();
const reportDir = path.join(dist, 'reports', 'all');
const pdfIndex = path.join(dist, 'reports', 'pdf', 'index.json');

const result = buildPageMirrors({
  files: htmlFiles,
  snapshot,
  routes: ROUTES,
  sectionFor,
  access: {
    graph: getGraph,
    findings: () => getAudit().findings as unknown as Array<Record<string, unknown>>,
    reportFiles: () => (fs.existsSync(reportDir) ? fs.readdirSync(reportDir).sort().map((f) => ({ href: `/reports/all/${f}`, bytes: fs.statSync(path.join(reportDir, f)).size })) : []),
    pdfCount: () => (fs.existsSync(pdfIndex) ? Object.keys((JSON.parse(fs.readFileSync(pdfIndex, 'utf8')) as { files: Record<string, unknown> }).files).length : 0),
    indicatorRows: (id) => {
      const current = observationsFor(id);
      if (!current.length) return null;
      const proposals = stats.proposals.filter((o) => o.indicator_id === id && o.period.year_bac === 0 && !o.period.interval);
      return [...current.map((o) => ({ ...o, side: 'production' })), ...proposals.map((o) => ({ ...o, side: 'remodeling' }))].map((o) => ({
        entity_id: o.entity_id, entity: o.entity_name, entity_kind: o.entity_kind, value: o.value, unit: o.unit, status: o.side === 'remodeling' ? 'PROPOSED' : o.status, side: o.side, source_path: o.source.path, source_pointer: o.source.pointer,
      }));
    },
    datasetPath: NCCM_DATASET_PATH,
  },
});
if (result.errors.length) {
  process.stderr.write(`${result.errors.slice(0, 40).join('\n')}\n${result.errors.length} page mirror problem(s)\n`);
  process.exit(1);
}
let bytes = 0;
const write = (urlPath: string, text: string) => {
  const file = path.join(dist, ...urlPath.split('/').filter(Boolean));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  bytes += Buffer.byteLength(text);
};
for (const m of result.mirrors) {
  write(m.json_path, `${JSON.stringify(m.context)}\n`);
  write(m.markdown_path, m.markdown);
}
write(PAGE_REGISTRY_PATH, `${JSON.stringify(result.registry)}\n`);
for (const c of result.chunks) write(c.path, `${JSON.stringify(c.chunk)}\n`);
const largest = [...result.mirrors].sort((a, b) => JSON.stringify(b.context).length - JSON.stringify(a.context).length)[0];
process.stdout.write(`${JSON.stringify({
  status: 'PAGE_MIRRORS_WRITTEN',
  all_html: result.registry.census.all_html,
  eligible: result.registry.census.eligible,
  excluded: result.registry.census.excluded,
  dynamic: result.registry.census.dynamic,
  by_route_pattern: result.registry.census.by_route_pattern,
  by_coverage: result.registry.census.by_coverage,
  files: result.mirrors.length * 2 + 1 + result.chunks.length,
  registry_chunks: result.chunks.map((c) => ({ path: c.path, entries: c.chunk.pages.length, bytes: Buffer.byteLength(JSON.stringify(c.chunk)) })),
  megabytes: Number((bytes / 1024 / 1024).toFixed(2)),
  registry_bytes: Buffer.byteLength(JSON.stringify(result.registry)),
  largest_mirror: largest ? { page: largest.page_id, bytes: JSON.stringify(largest.context).length } : null,
  seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
})}\n`);
