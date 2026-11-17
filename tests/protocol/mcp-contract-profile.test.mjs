import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  LEGACY_NAMES, PAGE_NAMES, assertLegacyCompatible, assertPageToolInput,
  assertToolInventory, selectPublishedProfile,
} from '../../scripts/lib/mcp-contract-profile.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/rs-ai-api-001-tool-inputs.json', import.meta.url), 'utf8'));
const sha = 'fc37812b6cad68cfb707fdcdd07d7a0e417825df';
const legacy = fixture.tools.map((name) => ({
  name, inputSchema: structuredClone(fixture.input_schemas[name]),
  annotations: { readOnlyHint: true, destructiveHint: false },
}));
const pageSchema = {
  resolve_statistics_page: { type: 'object', additionalProperties: false,
    properties: { url: { type: 'string', minLength: 1, maxLength: 2048 } }, required: ['url'] },
  read_statistics_page: { type: 'object', additionalProperties: false,
    properties: { path: { type: 'string', minLength: 1, maxLength: 2048 },
      source_policy: { type: 'string', enum: ['as_published', 'production_only'], default: 'as_published' },
      include_sections: { type: 'boolean', default: true } }, required: ['path'] },
  read_statistics_section: { type: 'object', additionalProperties: false,
    properties: { path: { type: 'string', minLength: 1, maxLength: 2048 },
      section: { type: 'string', minLength: 1, maxLength: 120 },
      source_policy: { type: 'string', enum: ['as_published', 'production_only'], default: 'as_published' },
      cursor: { type: 'string', pattern: '^o:\\d{1,5}$' } },
    required: ['path', 'section'] },
};
const pages = PAGE_NAMES.map((name) => ({
  name, inputSchema: structuredClone(pageSchema[name]),
  annotations: { readOnlyHint: true, destructiveHint: false },
}));
const manifest = (pageAware) => ({
  schema_version: 'rs-ai-manifest.v1',
  mcp: { endpoint: '/mcp', read_only: true, tools: pageAware ? [...LEGACY_NAMES, ...PAGE_NAMES] : [...LEGACY_NAMES] },
  api: { read_only: true, openapi: '/openapi.json' },
  discovery: { ...(pageAware ? { pages: '/ai/pages/index.json' } : {}) },
  ...(pageAware ? { page_mirrors: { registry: '/ai/pages/index.json', tools: PAGE_NAMES } } : {}),
});
const registry = {
  schema_version: 'rs-page-registry.v1', site_origin: 'https://statistics.reltroner.com',
  mirror_root: '/ai/pages', snapshot: { statistics_commit: sha },
  census: { all_html: 608, eligible: 607, excluded: [{ path: '/404.html', reason: 'ERROR_PAGE' }] },
};
const openapi = (pageAware) => ({
  paths: pageAware ? {
    '/api/v1/pages/resolve': { get: {} },
    '/api/v1/pages/context': { get: {} },
    '/api/v1/pages/section': { get: {} },
  } : {},
});
const choose = (pageAware, more = {}) => selectPublishedProfile({
  registryStatus: pageAware ? 200 : 404, registry: pageAware ? registry : null,
  manifest: manifest(pageAware), openapi: openapi(pageAware), statisticsSha: sha, ...more,
});

test('13 original tools remain strictly checked on core-only deployment', () => {
  const profile = choose(false);
  assert.equal(profile.profile, 'core-v1');
  assert.equal(profile.expectedTools.length, 13);
  assert.doesNotThrow(() => assertToolInventory(legacy, profile, fixture));
});
test('13 compatible legacy + exact three read-only page tools are accepted on page deployment', () => {
  const profile = choose(true);
  assert.equal(profile.profile, 'page-aware-v1');
  assert.equal(profile.expectedTools.length, 16);
  assert.doesNotThrow(() => assertToolInventory([...legacy, ...pages], profile, fixture));
});
test('cannot select profile from a spoofed tool count or inconsistent independent documents', () => {
  assert.throws(() => assertToolInventory([...legacy, ...pages], choose(false), fixture));
  assert.throws(() => assertToolInventory(legacy, choose(true), fixture));
  assert.throws(() => choose(false, { requested: 'page-aware-v1' }));
  assert.throws(() => choose(true, { requested: 'core-v1' }));
  assert.throws(() => choose(true, { registryStatus: 503 }));
  const m = manifest(true);
  delete m.page_mirrors;
  assert.throws(() => choose(true, { manifest: m }));
  const o = openapi(true);
  delete o.paths['/api/v1/pages/section'];
  assert.throws(() => choose(true, { openapi: o }));
});
test('unknown, missing and write-capable tools are rejected', () => {
  const p = choose(true);
  assert.throws(() => assertToolInventory([...legacy, ...pages, { ...pages[0], name: 'write_canon' }], p, fixture));
  assert.throws(() => assertToolInventory([...legacy, ...pages.slice(1)], p, fixture));
  const changed = structuredClone([...legacy, ...pages]);
  changed[0].annotations.readOnlyHint = false;
  assert.throws(() => assertToolInventory(changed, p, fixture));
  changed[0].annotations.readOnlyHint = true;
  changed[0].annotations.destructiveHint = true;
  assert.throws(() => assertToolInventory(changed, p, fixture));
});
test('legacy schema removals, extra required keys, narrowed ranges and stripped enum values fail', () => {
  const old = fixture.input_schemas.search_asthortera;
  const removed = structuredClone(old);
  delete removed.properties.q;
  assert.throws(() => assertLegacyCompatible(old, removed, 'search_asthortera'));
  const required = structuredClone(old);
  required.required.push('limit');
  assert.throws(() => assertLegacyCompatible(old, required, 'search_asthortera'));
  const narrow = structuredClone(old);
  narrow.properties.q.maxLength = 10;
  assert.throws(() => assertLegacyCompatible(old, narrow, 'search_asthortera'));
  const q = fixture.input_schemas.query_statistics;
  const en = structuredClone(q);
  en.properties.period.enum.pop();
  assert.throws(() => assertLegacyCompatible(q, en, 'query_statistics'));
});
test('documented additive legacy fields and enum expansions remain compatible', () => {
  const orig = fixture.input_schemas.discover_opportunities;
  const extended = structuredClone(orig);
  extended.properties.view.enum.push('explorations');
  extended.properties.include_proposed = { type: 'boolean', default: false };
  assert.doesNotThrow(() => assertLegacyCompatible(orig, extended, 'discover_opportunities'));
});
test('reviewed RS-CREATIVE-QUALITY-003 trace_evidence child-ID widening is allowed, arbitrary regex is refused', () => {
  const old = fixture.input_schemas.trace_evidence;
  const extended = structuredClone(old);
  extended.properties.ids.items.pattern = old.properties.ids.items.pattern.replace(']+
  for (const p of pages) assert.doesNotThrow(() => assertPageToolInput(p.name, p.inputSchema));
  const missing = structuredClone(pageSchema.read_statistics_section);
  missing.required.pop();
  assert.throws(() => assertPageToolInput('read_statistics_section', missing));
  const relaxed = structuredClone(pageSchema.resolve_statistics_page);
  relaxed.additionalProperties = true;
  assert.throws(() => assertPageToolInput('resolve_statistics_page', relaxed));
  const expanded = structuredClone(pageSchema.read_statistics_page);
  expanded.properties.source_policy.enum.push('unverified');
  assert.throws(() => assertPageToolInput('read_statistics_page', expanded));
});
, '#@]+
  for (const p of pages) assert.doesNotThrow(() => assertPageToolInput(p.name, p.inputSchema));
  const missing = structuredClone(pageSchema.read_statistics_section);
  missing.required.pop();
  assert.throws(() => assertPageToolInput('read_statistics_section', missing));
  const relaxed = structuredClone(pageSchema.resolve_statistics_page);
  relaxed.additionalProperties = true;
  assert.throws(() => assertPageToolInput('resolve_statistics_page', relaxed));
  const expanded = structuredClone(pageSchema.read_statistics_page);
  expanded.properties.source_policy.enum.push('unverified');
  assert.throws(() => assertPageToolInput('read_statistics_page', expanded));
});
);
  assert.doesNotThrow(() => assertLegacyCompatible(old, extended, 'trace_evidence'));
  extended.properties.ids.items.pattern = '^.*
  for (const p of pages) assert.doesNotThrow(() => assertPageToolInput(p.name, p.inputSchema));
  const missing = structuredClone(pageSchema.read_statistics_section);
  missing.required.pop();
  assert.throws(() => assertPageToolInput('read_statistics_section', missing));
  const relaxed = structuredClone(pageSchema.resolve_statistics_page);
  relaxed.additionalProperties = true;
  assert.throws(() => assertPageToolInput('resolve_statistics_page', relaxed));
  const expanded = structuredClone(pageSchema.read_statistics_page);
  expanded.properties.source_policy.enum.push('unverified');
  assert.throws(() => assertPageToolInput('read_statistics_page', expanded));
});
;
  assert.throws(() => assertLegacyCompatible(old, extended, 'trace_evidence'));
});
test('page tools enforce exact argument names, required keys, source policy and strict input', () => {
  for (const p of pages) assert.doesNotThrow(() => assertPageToolInput(p.name, p.inputSchema));
  const missing = structuredClone(pageSchema.read_statistics_section);
  missing.required.pop();
  assert.throws(() => assertPageToolInput('read_statistics_section', missing));
  const relaxed = structuredClone(pageSchema.resolve_statistics_page);
  relaxed.additionalProperties = true;
  assert.throws(() => assertPageToolInput('resolve_statistics_page', relaxed));
  const expanded = structuredClone(pageSchema.read_statistics_page);
  expanded.properties.source_policy.enum.push('unverified');
  assert.throws(() => assertPageToolInput('read_statistics_page', expanded));
});
