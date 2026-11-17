#!/usr/bin/env node
/**
 * RS-AI-API-002 provider-neutral live REST+MCP acceptance.
 * Does not claim to test ChatGPT/Claude/Gemini logged-in client sessions.
 * Run after npm ci: node scripts/verify-remote-mcp.mjs --expected-sha <40-hex>
 */
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const EXPECTED = [
  'get_statistics_manifest', 'search_asthortera', 'get_entity_context',
  'query_statistics', 'calculate_scenario', 'compare_scenarios', 'trace_evidence',
  'analyze_source_drift', 'analyze_narrative_impact', 'audit_consistency',
  'discover_opportunities', 'evaluate_decision_tree', 'build_research_context',
];
const report = { id: 'RS-AI-API-002', scope: 'PROTOCOL_ONLY_NOT_PROVIDER_CLIENT_ACCEPTANCE', status: 'FAIL_OR_BLOCKED', checks: [] };
const ok = (name, value = null) => report.checks.push({ name, status: 'PASS', value });
const args = process.argv.slice(2);
let base = 'https://statistics.reltroner.com';
let expectedSha = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--base' && args[i+1]) base = args[++i];
  else if (args[i] === '--expected-sha' && args[i+1]) expectedSha = args[++i];
  else throw Error('Unknown/incomplete argument: ' + args[i]);
}
const url = new URL(base);
const loopback = ['localhost', '127.0.0.1'].includes(url.hostname);
if (!(url.protocol === 'https:' || (loopback && url.protocol === 'http:')) || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
  throw Error('Base must be a bare HTTPS origin (HTTP loopback allowed), without credentials');
}
base = url.origin;
report.base = base;
if (expectedSha && !/^[a-f0-9]{40}$/i.test(expectedSha)) throw Error('Expected SHA must be full 40 hex digits');
async function http(path, init = {}) {
  const res = await fetch(base + path, { signal: AbortSignal.timeout(20000), ...init });
  const type = res.headers.get('content-type') ?? '';
  const body = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, body };
}
function envelope(reply, operation) {
  assert.notEqual(reply.isError, true, operation + ' failed');
  const r = reply.structuredContent;
  assert.ok(r, operation + ' missing structuredContent');
  assert.equal(r.schema_version, 'rs-intelligence.v1');
  assert.equal(r.operation, operation);
  assert.ok(Array.isArray(r.evidence));
  assert.ok(Array.isArray(r.limitations));
  return r;
}
let client;
try {
  const build = await http('/build-info.json');
  assert.equal(build.status, 200);
  assert.match(build.body.statistics_commit ?? '', /^[a-f0-9]{40}$/i);
  if (expectedSha) assert.equal(build.body.statistics_commit, expectedSha, 'Published SHA drift');
  ok('LIVE_STATISTICS_BUILD', build.body.statistics_commit);
  const manifest = await http('/api/v1/manifest');
  assert.equal(manifest.status, 200);
  assert.equal(manifest.body.schema_version, 'rs-intelligence.v1');
  assert.equal(manifest.body.snapshot.statistics_commit, build.body.statistics_commit);
  assert.equal(manifest.body.snapshot.production_source_sha, build.body.sources.production);
  assert.equal(manifest.body.snapshot.remodeling_source_sha, build.body.sources.remodeling);
  assert.equal(manifest.body.snapshot.semantic_digest, build.body.semantic_digest);
  ok('REST_VERSIONED_SOURCE_PARITY');
  for (const p of ['/llms.txt', '/ai/manifest.json', '/ai/context.json', '/openapi.json']) {
    assert.equal((await http(p)).status, 200, p);
  }
  ok('DISCOVERY_4_ENDPOINTS');
  assert.equal((await http('/mcp', { method: 'GET', headers: { Accept: 'text/event-stream' } })).status, 405);
  const originProbe = await http('/mcp', {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example', Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
  });
  assert.equal(originProbe.status, 403);
  ok('MCP_ORIGIN_AND_METHOD');
  client = new Client({ name: 'rs-ai-api-002-verifier', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp')));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), [...EXPECTED].sort());
  for (const t of tools) {
    assert.equal(t.annotations?.readOnlyHint, true, t.name + ' must declare read only');
    assert.equal(t.annotations?.destructiveHint, false, t.name + ' must be non-destructive');
  }
  ok('MCP_TOOL_DISCOVERY', tools.length);
  const mcpManifest = envelope(await client.callTool({ name: 'get_statistics_manifest', arguments: {} }), 'get_statistics_manifest');
  assert.equal(mcpManifest.snapshot.statistics_commit, build.body.statistics_commit);
  assert.equal(mcpManifest.snapshot.semantic_digest, build.body.semantic_digest);
  ok('MCP_MANIFEST_PARITY');
  const req = { operation: 'projectScenario', entity_id: 'country:reltronland', indicator: 'population', annual_rate_pct: 1, horizon_years: 100, label: 'RS-AI-API-002 test' };
  const restCalc = await http('/api/v1/calculator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request: req }) });
  assert.equal(restCalc.status, 200);
  const mcpCalc = envelope(await client.callTool({ name: 'calculate_scenario', arguments: { request: req } }), 'calculate_scenario');
  assert.deepEqual(mcpCalc.data, restCalc.body.data);
  assert.equal(mcpCalc.data.result_status, 'SCENARIO');
  ok('REST_MCP_CALC_PARITY');
  const research = envelope(await client.callTool({ name: 'build_research_context', arguments: { query: 'Reltronland Depcutland cooperation', source_policy: 'production_only' } }), 'build_research_context');
  assert.equal(research.result_status, 'OK');
  assert.ok(research.evidence.length > 0);
  ok('RESEARCH_CONTEXT_EVIDENCE', research.evidence.length);
  const unknown = envelope(await client.callTool({ name: 'query_statistics', arguments: { entity: 'Atlantis', indicator: 'population' } }), 'query_statistics');
  assert.ok(['NOT_FOUND','INSUFFICIENT_DATA'].includes(unknown.result_status));
  ok('UNKNOWN_ENTITY_NOT_SUBSTITUTED');
  assert.equal((await http('/api/v1/calculator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request: {} }) })).status, 422);
  ok('INVALID_CALC_REJECTED');
  report.status = 'PASS';
  report.statistics_commit = build.body.statistics_commit;
  report.production_source_sha = build.body.sources.production;
  report.remodeling_source_sha = build.body.sources.remodeling;
  report.semantic_digest = build.body.semantic_digest;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  if (client) { try { await client.close(); } catch { /* preserve prior failure */ } }
  console.log(JSON.stringify(report, null, 2));
}
