#!/usr/bin/env node
/**
 * RS-AI-API-001 Cloudflare Pages runtime verification:
 *  1. Compiles `functions/` with `wrangler pages functions build` to prove Worker bundle validity.
 *  2. Boots `wrangler pages dev dist` (actual Cloudflare workerd runtime) on loopback.
 *  3. Verifies static routes, `_headers` CSP/nosniff, existing `/api/assistant` fail-closed behavior,
 *     new `/api/v1/*` REST routes, and `/mcp` stateless Streamable HTTP with `@modelcontextprotocol/client`.
 */
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { MCP_TOOLS, OPERATIONS } from '../src/api/contract.ts';
import { ROOT } from './lib/context.ts';

const dist = path.join(ROOT, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html')) || !fs.existsSync(path.join(dist, 'build-info.json'))) {
  throw new Error('Run npm run build (or node scripts/build.ts --skip-pdf) before scripts/verify-pages-runtime.ts');
}

const isWin = process.platform === 'win32';
const outDir = '.cache/wrangler-functions-check';
fs.mkdirSync(path.join(ROOT, outDir), { recursive: true });
const compile = spawnSync(
  isWin ? 'cmd.exe' : 'npx',
  isWin
    ? ['/d', '/s', '/c', `npx --yes wrangler@4.161.0 pages functions build --outdir ${outDir}`]
    : ['--yes', 'wrangler@4.161.0', 'pages', 'functions', 'build', '--outdir', outDir],
  { cwd: ROOT, encoding: 'utf8' },
);
if (compile.status !== 0) {
  throw new Error(`wrangler pages functions build failed (exit ${compile.status}):\n${compile.stdout}\n${compile.stderr}`);
}

const PORT = Number(process.env.WRANGLER_TEST_PORT || 8789);
const BASE = `http://127.0.0.1:${PORT}`;
const proc = spawn(
  isWin ? 'cmd.exe' : 'npx',
  isWin
    ? ['/d', '/s', '/c', `npx --yes wrangler@4.161.0 pages dev dist --ip 127.0.0.1 --port ${PORT}`]
    : ['--yes', 'wrangler@4.161.0', 'pages', 'dev', 'dist', '--ip', '127.0.0.1', '--port', String(PORT)],
  { cwd: ROOT, detached: !isWin, stdio: ['ignore', 'pipe', 'pipe'] },
);

let logs = '';
proc.stdout.on('data', (d) => { logs += d.toString(); });
proc.stderr.on('data', (d) => { logs += d.toString(); });

async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${BASE}/build-info.json`);
      if (r.ok) return;
    } catch { /* wait for workerd */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler pages dev did not become ready within 40s:\n${logs}`);
}

try {
  await waitReady();
  const buildInfo = JSON.parse(fs.readFileSync(path.join(dist, 'build-info.json'), 'utf8')) as {
    statistics_commit: string | null;
    semantic_digest: string;
    sources: { production: string; remodeling: string };
  };

  // 1. Static assets, discovery files and security headers.
  const staticPaths = ['/', '/calculator/', '/assistant/', '/llms.txt', '/ai/manifest.json', '/ai/context.json', '/openapi.json', '/build-info.json', '/data/assistant-index.json'];
  for (const p of staticPaths) {
    const r = await fetch(`${BASE}${p}`);
    assert.equal(r.status, 200, `GET ${p} -> ${r.status}`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', `nosniff on ${p}`);
  }
  const home = await fetch(`${BASE}/`);
  assert.match(home.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.equal(home.headers.get('x-frame-options'), 'DENY');

  // 2. Existing /api/assistant function remains intact and fail-closed.
  const asstGet = await fetch(`${BASE}/api/assistant`);
  assert.equal(asstGet.status, 200);
  assert.equal(((await asstGet.json()) as { status?: string }).status, 'OPTIONAL_AI_DISABLED_UNTIL_OWNER_CONFIGURED');
  const asstPost = await fetch(`${BASE}/api/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'What is the population of Reltronland?' }),
  });
  assert.equal(asstPost.status, 503);
  assert.equal(((await asstPost.json()) as { error?: string }).error, 'AI_NOT_ACTIVATED');

  // 3. New /api/v1/* Pages Function routes in workerd.
  const manifestRes = await fetch(`${BASE}/api/v1/manifest`);
  assert.equal(manifestRes.status, 200);
  assert.equal(manifestRes.headers.get('access-control-allow-origin'), '*');
  const manifest = (await manifestRes.json()) as {
    schema_version: string;
    result_status: string;
    snapshot: { statistics_commit: string | null; production_source_sha: string; remodeling_source_sha: string; semantic_digest: string };
  };
  assert.equal(manifest.schema_version, 'rs-intelligence.v1');
  assert.equal(manifest.result_status, 'OK');
  assert.deepEqual(
    [manifest.snapshot.statistics_commit, manifest.snapshot.production_source_sha, manifest.snapshot.remodeling_source_sha, manifest.snapshot.semantic_digest],
    [buildInfo.statistics_commit, buildInfo.sources.production, buildInfo.sources.remodeling, buildInfo.semantic_digest],
  );

  for (const p of [
    '/api/v1/search?q=Reltronland',
    '/api/v1/entities?limit=5',
    '/api/v1/entities/country:reltronland',
    '/api/v1/statistics?entity=Reltronland&indicator=population',
    '/api/v1/evidence?ids=fact:country:reltronland:population',
    '/api/v1/drift?limit=3',
    '/api/v1/graph?node=nar:faction:henchoway&depth=2',
    '/api/v1/creative?limit=3',
    '/api/v1/creative/opportunities?limit=3',
    '/api/v1/decisions',
    '/api/v1/reports',
  ]) {
    const r = await fetch(`${BASE}${p}`);
    assert.equal(r.status, 200, `GET ${p} -> ${r.status}`);
    const body = (await r.json()) as { schema_version?: string; result_status?: string };
    assert.equal(body.schema_version, 'rs-intelligence.v1', p);
    assert.equal(body.result_status, 'OK', p);
  }

  const calcReq = {
    operation: 'projectScenario',
    entity_id: 'country:reltronland',
    indicator: 'population',
    annual_rate_pct: 1,
    horizon_years: 100,
    label: 'Baseline assumption',
  };
  const calcRes = await fetch(`${BASE}/api/v1/calculator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request: calcReq }),
  });
  assert.equal(calcRes.status, 200);
  const calcBody = (await calcRes.json()) as { data: { result_value: number; result_status: string } };
  assert.equal(calcBody.data.result_value, 855 * 1.01 ** 100);
  assert.equal(calcBody.data.result_status, 'SCENARIO');

  const packRes = await fetch(`${BASE}/api/v1/research/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'Reltronland Depcutland cooperation' }),
  });
  assert.equal(packRes.status, 200);
  const packBody = (await packRes.json()) as { result_status: string; evidence: Array<{ id: string }>; data: { coverage: { exhaustive: boolean; sections: Record<string, { matched: number; returned: number; omitted: number }>; evidence: { returned: number; omitted: number; omitted_ids: string[] } }; exploration_candidates: { status: string; candidates: Array<{ status: string; anchors: Array<{ evidence_id: string }>; mechanism_steps: Array<{ role: string; evidence_status: string }> }> } } };
  assert.equal(packBody.result_status, 'OK');
  assert.ok(packBody.evidence.length > 0);
  // RS-CREATIVE-QUALITY-003: the pack states its own scope, and exploration candidates never verify their own pairing.
  assert.equal(packBody.data.coverage.exhaustive, false);
  assert.equal(packBody.data.coverage.evidence.returned, packBody.evidence.length);
  assert.ok(Object.values(packBody.data.coverage.sections).every((s) => s.omitted === Math.max(0, s.matched - s.returned)));
  assert.equal(packBody.data.exploration_candidates.status, 'HYPOTHETICAL_UNRATIFIED');
  for (const candidate of packBody.data.exploration_candidates.candidates) {
    assert.equal(candidate.status, 'HYPOTHETICAL_UNRATIFIED');
    assert.ok(candidate.mechanism_steps.filter((s) => s.role !== 'PRECONDITION').every((s) => s.evidence_status === 'ASSUMED' || s.evidence_status === 'UNKNOWN'));
  }
  // Evidence drill-down: every id the pack returns, omits or anchors resolves again, sub-ids included; forged ids do not.
  const ids = [...new Set([...packBody.evidence.map((e) => e.id), ...packBody.data.coverage.evidence.omitted_ids, ...packBody.data.exploration_candidates.candidates.flatMap((c) => c.anchors.map((a) => a.evidence_id))])];
  let traced = 0;
  for (let i = 0; i < ids.length; i += 20) {
    const res = await fetch(`${BASE}/api/v1/evidence?ids=${ids.slice(i, i + 20).map(encodeURIComponent).join(',')}`);
    assert.equal(res.status, 200, `trace ${ids.slice(i, i + 20).join(' ')} -> ${res.status}`);
    const body = (await res.json()) as { data: { found: number; requested: number } };
    assert.equal(body.data.found, body.data.requested);
    traced += body.data.found;
  }
  assert.equal(traced, ids.length);
  const forged = await fetch(`${BASE}/api/v1/evidence?ids=${encodeURIComponent('NAF-000000000000#1')}`);
  assert.equal(forged.status, 404);
  assert.equal((await fetch(`${BASE}/api/v1/evidence?ids=${encodeURIComponent('NAF-✓#1')}`)).status, 422);
  const explorations = await fetch(`${BASE}/api/v1/creative/opportunities?view=explorations&limit=2`);
  assert.equal(explorations.status, 200);

  // 4. Stateless MCP gateway (/mcp) in workerd with real MCP SDK client.
  const mcpGet = await fetch(`${BASE}/mcp`, { headers: { Accept: 'text/event-stream' } });
  assert.equal(mcpGet.status, 405, `GET /mcp -> ${mcpGet.status}`);
  const mcpBadOrigin = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(mcpBadOrigin.status, 403);

  const client = new Client({ name: 'rs-wrangler-runtime-verifier', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`));
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), MCP_TOOLS.map((t) => t.name));

  const mcpManifest = (await client.callTool({ name: 'get_statistics_manifest', arguments: {} })).structuredContent as { snapshot: { semantic_digest: string } };
  assert.equal(mcpManifest.snapshot.semantic_digest, buildInfo.semantic_digest);

  const mcpCalc = (await client.callTool({ name: 'calculate_scenario', arguments: { request: calcReq } })).structuredContent as { data: { result_value: number } };
  assert.equal(mcpCalc.data.result_value, calcBody.data.result_value);

  const mcpPack = (await client.callTool({ name: 'build_research_context', arguments: { query: 'Reltronland Depcutland cooperation' } })).structuredContent as { result_status: string };
  assert.equal(mcpPack.result_status, 'OK');
  assert.equal(JSON.stringify(mcpPack), JSON.stringify(packBody), 'REST and MCP return the same pack for the same input and snapshot');
  assert.equal(tools.length, 13, 'the tool list is unchanged');
  const mcpTrace = (await client.callTool({ name: 'trace_evidence', arguments: { ids: ids.slice(0, 20) } })).structuredContent as { data: { found: number; requested: number } };
  assert.equal(mcpTrace.data.found, mcpTrace.data.requested);
  await client.close();

  process.stdout.write(`${JSON.stringify({
    status: 'WRANGLER_PAGES_RUNTIME_VERIFIED',
    wrangler: '4.161.0',
    rest_operations_checked: OPERATIONS.length,
    mcp_tools_verified: tools.length,
    production_source_sha: buildInfo.sources.production,
    remodeling_source_sha: buildInfo.sources.remodeling,
    semantic_digest: buildInfo.semantic_digest,
  })}\n`);
} finally {
  proc.stdout?.destroy();
  proc.stderr?.destroy();
  if (isWin && proc.pid) {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  } else if (proc.pid) {
    try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* group already gone */ }
    try { proc.kill('SIGKILL'); } catch { /* process already gone */ }
  }
  proc.unref();
}
process.exit(0);
