/**
 * RS-AI-PAGE-004 checks for scripts/verify-pages-runtime.ts.
 *
 * verifyPageBuild: on the built dist/ — registry parity, alternate links on every page, mirror
 * numbers equal to the published data files, one snapshot everywhere, and a byte-identical
 * regeneration of every mirror.
 * verifyPageRuntime: in workerd — static mirror delivery and headers, the three page operations over
 * REST, the same operations over MCP with byte-identical results, and refusals.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Client } from '@modelcontextprotocol/client';
import { FORMULAS } from '../../src/domain/calculator.ts';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const readJson = (dist: string, p: string) => JSON.parse(fs.readFileSync(path.join(dist, ...p.split('/').filter(Boolean)), 'utf8')) as Any;
const hashTree = (dir: string) => { const h = createHash('sha256'); for (const f of walk(dir).sort()) h.update(path.relative(dir, f)).update(fs.readFileSync(f)); return h.digest('hex'); };

export function verifyPageBuild(dist: string, root: string) {
  const registry = readJson(dist, '/ai/pages/index.json');
  const entries: Any[] = [...registry.pages, ...registry.chunks.flatMap((c: Any) => readJson(dist, c.href).pages)];
  const htmlFiles = walk(dist).filter((f) => f.endsWith('.html'));
  const buildInfo = readJson(dist, '/build-info.json');
  // 1. Parity and identity.
  assert.equal(registry.census.all_html, htmlFiles.length);
  assert.equal(entries.length + registry.census.excluded.length, htmlFiles.length, 'every built page is mirrored or excluded with a reason');
  assert.deepEqual([registry.snapshot.statistics_commit, registry.snapshot.semantic_digest, registry.snapshot.production_source_sha, registry.snapshot.remodeling_source_sha], [buildInfo.statistics_commit, buildInfo.semantic_digest, buildInfo.sources.production, buildInfo.sources.remodeling]);
  const mirrors = new Map<string, Any>();
  for (const e of entries) {
    const m = readJson(dist, e.json);
    assert.equal(m.page_id, e.page_id);
    assert.deepEqual(m.snapshot, registry.snapshot, `${e.page_id} carries the build snapshot`);
    assert.ok(fs.existsSync(path.join(dist, ...e.markdown.split('/').filter(Boolean))), e.markdown);
    assert.doesNotMatch(JSON.stringify(m), /localStorage\.getItem\('rs-theme'\)|<script/, `${e.page_id} carries no script`);
    mirrors.set(e.page_id, m);
    // 2. Every human page points at its own mirrors; the export file is not a site page and has no layout.
    if (e.content_kind !== 'report_export') {
      const html = fs.readFileSync(path.join(dist, ...(e.page_id === '/' ? ['index.html'] : [...e.page_id.split('/').filter(Boolean), 'index.html'])), 'utf8');
      assert.ok(html.includes(`<link rel="alternate" type="application/json" href="${e.json}"`) && html.includes(`<link rel="alternate" type="text/markdown" href="${e.markdown}"`), `${e.page_id} links its mirrors`);
    }
  }
  assert.ok(!fs.readFileSync(path.join(dist, '404.html'), 'utf8').includes('rel="alternate"'), 'the not-found page links no mirror');
  // 3. Numbers in mirrors equal the published data files.
  const composition = readJson(dist, '/data/composition.json');
  const spatial = mirrors.get('/statistics/spatial/')!;
  assert.equal(spatial.source_role, 'remodeling');
  const habitat = spatial.data.find((d: Any) => d.data_id === 'data-spatial-home-habitat');
  const surface = spatial.data.find((d: Any) => d.data_id === 'data-spatial-surface-footprint');
  let compared = 0;
  for (const c of composition.spatial.countries) {
    for (const r of c.habitats) { const row = habitat.rows.find((x: Any) => x.country_id === c.id && x.habitat === r.key); assert.deepEqual([row.share_pct, row.residents_billion, row.population_billion], [r.pct, r.absolute_billion, c.population_billion], `${c.id} ${r.key}`); compared++; }
    for (const r of c.surface) { const row = surface.rows.find((x: Any) => x.country_id === c.id && x.class === r.key); assert.deepEqual([row.share_pct, row.area_million_km2], [r.pct, r.area_million_km2], `${c.id} ${r.key}`); compared++; }
  }
  assert.ok([habitat.status, surface.status].every((s: string) => s === composition.spatial.status) && habitat.denominator !== surface.denominator);
  const species = mirrors.get('/statistics/species/')!.data.find((d: Any) => d.data_id === 'data-ancestry-national');
  for (const c of composition.ancestry.countries.filter((x: Any) => x.status === 'ASSIGNED')) for (const r of c.rows) { assert.equal(species.rows.find((x: Any) => x.country_id === c.id && x.category === r.key).share_pct, r.pct); compared++; }
  const published = readJson(dist, '/data/findings.json').findings as Any[];
  const driftIndex = mirrors.get('/drift/')!.data.find((d: Any) => d.data_id === 'data-findings');
  assert.deepEqual(new Set(driftIndex.rows.map((r: Any) => r.id)).size, Math.min(published.length, driftIndex.rows.length));
  assert.equal(driftIndex.rows_total, published.length);
  const driftPages = entries.filter((e) => e.route_pattern === '/drift/[id]/');
  assert.equal(driftPages.length, published.length, 'one mirrored page per published finding');
  for (const e of [driftPages[0], driftPages[Math.floor(driftPages.length / 2)], driftPages.at(-1)].filter((x): x is Any => x !== undefined)) {
    const rows = mirrors.get(e.page_id)!.data.find((d: Any) => d.data_id === 'data-finding').rows as Any[];
    const f = published.find((x) => `/drift/${x.id}/` === e.page_id)!;
    for (const k of ['id', 'classification', 'review_status', 'priority', 'file_path']) assert.equal(rows.find((r) => r.field === k)?.value, f[k], `${e.page_id} ${k}`);
    compared += 5;
  }
  const index = readJson(dist, '/data/assistant-index.json');
  for (const e of entries.filter((x) => x.route_pattern === '/statistics/indicators/[id]/')) {
    const id = e.page_id.split('/').filter(Boolean).pop();
    const rows = (mirrors.get(e.page_id)!.data.find((d: Any) => d.data_id === 'data-indicator-values')?.rows ?? []) as Any[];
    for (const f of index.facts.filter((x: Any) => x.indicator === id)) { const row = rows.find((r) => r.entity_id === f.entity_id && r.side === 'production'); if (row) { assert.equal(row.value, f.value, `${e.page_id} ${f.entity_id}`); compared++; } }
  }
  const graph = readJson(dist, '/data/graph.json');
  const g = mirrors.get('/graph/')!.data;
  assert.equal(g.find((d: Any) => d.data_id === 'data-graph-node-types').rows.reduce((n: number, r: Any) => n + r.count, 0), graph.nodes.length);
  assert.equal(g.find((d: Any) => d.data_id === 'data-graph-edge-types').rows.reduce((n: number, r: Any) => n + r.count, 0), graph.edges.length);
  assert.deepEqual(mirrors.get('/calculator/')!.data.find((d: Any) => d.data_id === 'data-calculator-formulas').rows.map((r: Any) => r.id), Object.keys(FORMULAS));
  // 4. Regenerating every mirror from the same build gives the same bytes.
  const before = hashTree(path.join(dist, 'ai', 'pages'));
  const again = spawnSync(process.execPath, [path.join('scripts', 'page-mirrors.ts')], { cwd: root, encoding: 'utf8' });
  assert.equal(again.status, 0, again.stderr);
  const after = hashTree(path.join(dist, 'ai', 'pages'));
  assert.equal(after, before, 'page mirrors are byte-identical when regenerated from the same build');
  return { pages: entries.length, excluded: registry.census.excluded.length, values_compared: compared, mirror_tree_sha256: after, coverage: registry.census.by_coverage };
}

export async function verifyPageRuntime(base: string, client: Client, dist: string) {
  const get = async (p: string) => { const r = await fetch(`${base}${p}`); return { r, body: (await r.json()) as Any }; };
  const q = encodeURIComponent;
  // Static mirrors are ordinary assets with their own headers.
  const reg = await fetch(`${base}/ai/pages/index.json`);
  assert.equal(reg.status, 200);
  assert.match(reg.headers.get('content-type') ?? '', /json/);
  assert.equal(reg.headers.get('access-control-allow-origin'), '*');
  assert.match(reg.headers.get('cache-control') ?? '', /max-age=300/);
  assert.equal(reg.headers.get('x-content-type-options'), 'nosniff');
  const spatialJson = await fetch(`${base}/ai/pages/statistics/spatial.json`);
  assert.equal(((await spatialJson.json()) as Any).schema_version, 'rs-page-context.v1');
  const md = await fetch(`${base}/ai/pages/statistics/spatial.md`);
  assert.equal(md.status, 200);
  const markdownType = md.headers.get('content-type');
  assert.match(await md.text(), /^# Spatial 3D composition/);
  assert.equal((await fetch(`${base}/ai/pages/_root.json`)).status, 200);
  // REST.
  const exact = await get(`/api/v1/pages/resolve?url=${q('https://statistics.reltroner.com/statistics/spatial/')}`);
  assert.deepEqual([exact.r.status, exact.body.data.page.page_id, exact.body.data.page.source_role], [200, '/statistics/spatial/', 'remodeling']);
  const slash = await get(`/api/v1/pages/resolve?url=${q('https://statistics.reltroner.com/statistics/spatial')}`);
  assert.deepEqual(slash.body.data.resolution.normalizations, ['TRAILING_SLASH_ADDED']);
  for (const [url, status, code] of [['https://evil.example/statistics/spatial/', 422, 'FOREIGN_ORIGIN'], ['/statistics/../build-info.json', 422, 'PATH_NOT_CANONICAL'], ['/statistics/spatial-3d/', 404, 'PAGE_NOT_FOUND']] as const) {
    const r = await get(`/api/v1/pages/resolve?url=${q(url)}`);
    assert.deepEqual([r.r.status, r.body.data.code], [status, code], url);
  }
  const findings = (JSON.parse(fs.readFileSync(path.join(dist, 'data', 'findings.json'), 'utf8')) as Any).findings as Any[];
  const dyn = await get(`/api/v1/pages/resolve?url=${q(`https://statistics.reltroner.com/drift/${findings.at(-1)!.id}/`)}`);
  assert.deepEqual([dyn.r.status, dyn.body.data.page.route_pattern], [200, '/drift/[id]/']);
  const ctx = await get(`/api/v1/pages/context?path=${q('/statistics/spatial/')}`);
  assert.deepEqual(ctx.body.data.data.map((d: Any) => d.data_id), ['data-spatial-surface-footprint', 'data-spatial-home-habitat', 'data-spatial-geometry']);
  const sec = await get(`/api/v1/pages/section?path=${q('/statistics/spatial/')}&section=data-spatial-home-habitat`);
  const composition = JSON.parse(fs.readFileSync(path.join(dist, 'data', 'composition.json'), 'utf8')) as Any;
  const nation = composition.spatial.countries.find((c: Any) => c.habitats.length);
  assert.equal(sec.body.data.rows.find((r: Any) => r.country_id === nation.id && r.habitat === nation.habitats[0].key).share_pct, nation.habitats[0].pct);
  // MCP: the same operations, the same bytes.
  const { tools } = await client.listTools();
  const snapshot = JSON.parse(fs.readFileSync(path.join('tests', 'fixtures', 'rs-ai-api-001-tool-inputs.json'), 'utf8')) as { tools: string[] };
  assert.deepEqual(tools.slice(0, 13).map((t) => t.name), snapshot.tools, 'the thirteen original tools are unchanged');
  assert.deepEqual(tools.slice(13).map((t) => [t.name, t.annotations?.readOnlyHint]), [['resolve_statistics_page', true], ['read_statistics_page', true], ['read_statistics_section', true]]);
  for (const [name, args, rest] of [
    ['resolve_statistics_page', { url: 'https://statistics.reltroner.com/statistics/spatial/' }, exact.body],
    ['read_statistics_page', { path: '/statistics/spatial/' }, ctx.body],
    ['read_statistics_section', { path: '/statistics/spatial/', section: 'data-spatial-home-habitat' }, sec.body],
  ] as const) {
    const viaMcp = await client.callTool({ name, arguments: args });
    assert.equal(JSON.stringify(viaMcp.structuredContent), JSON.stringify(rest), `${name}: MCP equals REST`);
  }
  return { page_tools_verified: 3, markdown_content_type: markdownType };
}
