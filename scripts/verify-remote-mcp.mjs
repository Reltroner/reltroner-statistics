#!/usr/bin/env node
/**
 * RS-AI-API-002 provider-neutral live REST+MCP acceptance.
 * Does not claim to test ChatGPT/Claude/Gemini logged-in client sessions.
 * Run after npm ci: node scripts/verify-remote-mcp.mjs --expected-sha <40-hex> [--profile auto|core-v1|page-aware-v1]
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { assertToolInventory, selectPublishedProfile } from './lib/mcp-contract-profile.mjs';

const LEGACY_INPUT_FIXTURE = JSON.parse(readFileSync(new URL('../tests/fixtures/rs-ai-api-001-tool-inputs.json', import.meta.url), 'utf8'));
const report = { id: 'RS-AI-API-002', scope: 'PROTOCOL_ONLY_NOT_PROVIDER_CLIENT_ACCEPTANCE', status: 'FAIL_OR_BLOCKED', profile: null, checks: [] };
const ok = (name, value = null) => report.checks.push({ name, status: 'PASS', value });
const args = process.argv.slice(2);
let base = 'https://statistics.reltroner.com';
let expectedSha = null;
let requestedProfile = 'auto';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--base' && args[i+1]) base = args[++i];
  else if (args[i] === '--expected-sha' && args[i+1]) expectedSha = args[++i];
  else if (args[i] === '--profile' && args[i+1]) requestedProfile = args[++i];
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
  for (const p of ['/llms.txt', '/ai/context.json']) {
    assert.equal((await http(p)).status, 200, p);
  }
  const aiManifest = await http('/ai/manifest.json');
  const openapi = await http('/openapi.json');
  assert.equal(aiManifest.status, 200);
  assert.equal(openapi.status, 200);
  ok('DISCOVERY_4_ENDPOINTS');

  // Independent release artifacts select the exact expected MCP contract:
  // core 13 tools, or core 13 + PAGE-004's three read-only tools.
  const pageRegistry = await http('/ai/pages/index.json');
  const profile = selectPublishedProfile({
    registryStatus: pageRegistry.status,
    registry: pageRegistry.body,
    manifest: aiManifest.body,
    openapi: openapi.body,
    statisticsSha: build.body.statistics_commit,
    requested: requestedProfile,
  });
  report.profile = profile.profile;
  ok('PUBLISHED_CAPABILITY_PROFILE', {
    profile: profile.profile,
    expected_tools: profile.expectedTools.length,
    pages_registry: pageRegistry.status,
  });
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
  assertToolInventory(tools, profile, LEGACY_INPUT_FIXTURE);
  ok('MCP_TOOL_COMPATIBILITY_AND_STRICT_DISCOVERY', {
    legacy_tools: 13,
    new_page_tools: profile.pageAware ? 3 : 0,
    schema_contract: 'original_13_backwards_compatible_plus_strict_page_schema',
    read_only: true,
  });
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
  if (profile.pageAware) {
    const path = '/statistics/spatial/';
    const url = base + path;
    const get = async (endpoint, input, toolName) => {
      const rest = await http(endpoint);
      assert.equal(rest.status, 200, endpoint + ' did not return 200');
      const mcp = envelope(await client.callTool({ name: toolName, arguments: input }), toolName);
      assert.deepEqual(mcp.data, rest.body.data, toolName + ': REST and MCP data mismatch');
      assert.equal(mcp.snapshot.statistics_commit, build.body.statistics_commit);
      return mcp;
    };

    const resolved = await get('/api/v1/pages/resolve?url=' + encodeURIComponent(url),
      { url }, 'resolve_statistics_page');
    assert.equal(resolved.result_status, 'OK');
    assert.equal(resolved.data.resolution?.page_id, path, 'Spatial URL resolved to a different page');
    assert.equal(resolved.data.page?.source_role, 'remodeling', 'Spatial must remain remodeling');
    assert.equal(resolved.data.page?.coverage, 'FULL', 'Spatial semantic coverage unexpectedly changed');
    ok('PAGE_URL_EXACT_RESOLUTION', path);

    const context = await get('/api/v1/pages/context?path=' + encodeURIComponent(path),
      { path }, 'read_statistics_page');
    assert.equal(context.result_status, 'OK');
    assert.equal(context.data.page?.page_id, path);
    assert.equal(context.data.snapshot?.statistics_commit, build.body.statistics_commit);
    for (const dataId of ['data-spatial-home-habitat', 'data-spatial-surface-footprint']) {
      const table = context.data.data?.find((x) => x.data_id === dataId);
      assert.ok(table, 'Missing spatial table ' + dataId);
      assert.equal(table.source_role, 'remodeling');
      assert.equal(table.status, 'PROPOSED');
    }
    ok('PAGE_CONTEXT_PROVENANCE_AND_TWO_DENOMINATORS');

    for (const section of ['data-spatial-home-habitat', 'data-spatial-surface-footprint']) {
      const r = await get('/api/v1/pages/section?path=' + encodeURIComponent(path)
        + '&section=' + encodeURIComponent(section),
        { path, section }, 'read_statistics_section');
      assert.equal(r.result_status, 'OK');
      assert.equal(r.data.data_id, section);
      assert.equal(r.data.status, 'PROPOSED');
      assert.ok(Array.isArray(r.data.rows) && r.data.rows.length > 0);
      assert.equal(r.data.source_role, 'remodeling');
      assert.ok(typeof r.data.denominator === 'string' && r.data.denominator.length > 10);
    }
    ok('PAGE_SECTIONS_REAL_DATA_AND_REST_MCP_PARITY');

    const restricted = envelope(await client.callTool({
      name: 'read_statistics_section',
      arguments: { path, section: 'data-spatial-home-habitat', source_policy: 'production_only' },
    }), 'read_statistics_section');
    assert.equal(restricted.data.withheld_by_source_policy, true);
    assert.deepEqual(restricted.data.rows, []);
    ok('PAGE_PROPOSED_WITHHELD_WHEN_PRODUCTION_ONLY');

    const missing = envelope(await client.callTool({
      name: 'resolve_statistics_page',
      arguments: { url: base + '/statistics/spatial-3d/' },
    }), 'resolve_statistics_page');
    assert.equal(missing.result_status, 'NOT_FOUND');
    assert.equal(missing.data.code, 'PAGE_NOT_FOUND');
    const foreign = await http('/api/v1/pages/resolve?url=' + encodeURIComponent('https://external.example/private'));
    assert.equal(foreign.status, 422);
    assert.equal(foreign.body.result_status, 'INVALID_INPUT');
    ok('PAGE_UNKNOWN_AND_FOREIGN_URL_REJECTED');
  }
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
