/**
 * RS-AI-API-002: fail-closed, published-capability-aware MCP contract verification.
 * The source release can expose the original 13 tools or the 13 + three RS-AI-PAGE-004 tools.
 * Detect the profile from independently served page registry, manifest and OpenAPI,
 * NEVER by trusting the MCP tool count or the MCP server's semver.
 */
import assert from 'node:assert/strict';

export const LEGACY_NAMES = Object.freeze([
  'get_statistics_manifest', 'search_asthortera', 'get_entity_context',
  'query_statistics', 'calculate_scenario', 'compare_scenarios', 'trace_evidence',
  'analyze_source_drift', 'analyze_narrative_impact', 'audit_consistency',
  'discover_opportunities', 'evaluate_decision_tree', 'build_research_context',
]);
export const PAGE_NAMES = Object.freeze([
  'resolve_statistics_page', 'read_statistics_page', 'read_statistics_section',
]);
export const PAGE_REST_PATHS = Object.freeze([
  '/api/v1/pages/resolve', '/api/v1/pages/context', '/api/v1/pages/section',
]);
const sorted = (a) => [...a].sort();
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A profile is declared by coherent *non-MCP* release artifacts. A server that claims
 * 16 tools while lacking the published registry or its OpenAPI routes is rejected.
 */
export function selectPublishedProfile({ registryStatus, registry, manifest, openapi, statisticsSha, requested = 'auto' }) {
  assert.ok(['auto', 'core-v1', 'page-aware-v1'].includes(requested), 'Unknown expected protocol profile');
  assert.ok([200, 404].includes(registryStatus), 'Page registry must be 200 or 404, never an unclassified response');
  assert.equal(manifest.schema_version, 'rs-ai-manifest.v1');
  assert.equal(manifest.mcp?.read_only, true, 'MCP must be declared read-only');
  assert.equal(manifest.api?.read_only, true, 'REST must be declared read-only');
  assert.equal(manifest.mcp?.endpoint, '/mcp');
  assert.equal(manifest.api?.openapi, '/openapi.json');
  assert.ok(object(openapi.paths), 'OpenAPI paths missing');
  assert.ok(Array.isArray(manifest.mcp?.tools), 'Manifest MCP tool inventory missing');

  const pageAware = registryStatus === 200;
  const profile = pageAware ? 'page-aware-v1' : 'core-v1';
  assert.ok(requested === 'auto' || requested === profile,
    'Published profile ' + profile + ' does not match requested ' + requested);
  const expected = pageAware ? [...LEGACY_NAMES, ...PAGE_NAMES] : [...LEGACY_NAMES];
  assert.deepEqual(sorted(manifest.mcp.tools), sorted(expected),
    'Published AI manifest tools do not match the page registry release profile');

  for (const p of PAGE_REST_PATHS) {
    assert.equal(Object.hasOwn(openapi.paths, p), pageAware,
      'OpenAPI page operation does not match page registry: ' + p);
    if (pageAware) {
      assert.ok(object(openapi.paths[p]?.get), 'Page REST operation must be GET: ' + p);
    }
  }

  if (pageAware) {
    assert.equal(registry.schema_version, 'rs-page-registry.v1');
    assert.equal(registry.snapshot?.statistics_commit, statisticsSha,
      'Page registry application SHA differs from published build-info');
    assert.equal(registry.site_origin, 'https://statistics.reltroner.com');
    assert.equal(registry.mirror_root, '/ai/pages');
    assert.ok(Number.isInteger(registry.census?.eligible) && registry.census.eligible > 0);
    assert.equal(registry.census.all_html,
      registry.census.eligible + registry.census.excluded.length,
      'Page census does not balance');
    assert.equal(manifest.discovery?.pages, '/ai/pages/index.json');
    assert.equal(manifest.page_mirrors?.registry, '/ai/pages/index.json');
    assert.deepEqual(sorted(manifest.page_mirrors?.tools ?? []), sorted(PAGE_NAMES),
      'Page manifest must identify the exact three added tools');
  } else {
    assert.equal(registryStatus, 404);
    assert.equal(manifest.discovery?.pages, undefined,
      'Core release unexpectedly advertises a pages registry');
    assert.equal(manifest.page_mirrors, undefined,
      'Core release unexpectedly advertises page mirrors');
  }

  return Object.freeze({ profile, expectedTools: expected, pageAware });
}

/**
 * Compare original rs-ai-api-001 input contracts with a candidate. Only additions
 * and explicitly documented widenings are allowed; new required fields, removed
 * legacy properties, narrower ranges, changed defaults and enum removals fail.
 * Schema-level checks cannot prove all runtime semantics, so the remote script
 * ALSO invokes the original calculator/research/unknown cases.
 */
export function assertLegacyCompatible(baseline, actual, path = 'schema') {
  assert.ok(object(baseline) && object(actual), path + ': JSON Schema object required');

  if (baseline.type !== undefined) assert.deepEqual(actual.type, baseline.type, path + ': type changed');
  if (baseline.const !== undefined) assert.deepEqual(actual.const, baseline.const, path + ': const changed');
  if (baseline.default !== undefined) assert.deepEqual(actual.default, baseline.default, path + ': default changed');
  if (baseline.format !== undefined) assert.equal(actual.format, baseline.format, path + ': format changed');

  if (baseline.enum !== undefined) {
    assert.ok(Array.isArray(actual.enum), path + ': enum disappeared');
    for (const v of baseline.enum) {
      assert.ok(actual.enum.some((x) => JSON.stringify(x) === JSON.stringify(v)),
        path + ': removed legacy enum value ' + JSON.stringify(v));
    }
  }
  if (actual.enum !== undefined && baseline.enum === undefined && baseline.const === undefined) {
    assert.fail(path + ': new enum constraint narrows a legacy input');
  }

  // A new regexp is only accepted for the reviewed trace_evidence child IDs
  // from RS-CREATIVE-QUALITY-003; arbitrary pattern changes are not accepted.
  if (actual.pattern !== baseline.pattern) {
    const allowed = path === 'trace_evidence.ids.items'
      && baseline.pattern === '^[A-Za-z0-9:_.\\\\-/[\\\\]]+$'
      && actual.pattern === '^[A-Za-z0-9:_.\\\\-/[\\\\]#@]+$';
    assert.ok(allowed, path + ': input pattern changed without reviewed compatibility waiver');
  }

  for (const [key, reverse] of [
    ['minLength', true], ['minItems', true], ['minimum', true],
    ['maxLength', false], ['maxItems', false], ['maximum', false],
  ]) {
    if (baseline[key] !== undefined) {
      assert.ok(typeof actual[key] === 'number', path + ': missing bound ' + key);
      assert.ok(reverse ? actual[key] <= baseline[key] : actual[key] >= baseline[key],
        path + ': tightened ' + key + ' from ' + baseline[key] + ' to ' + actual[key]);
    } else if (actual[key] !== undefined) {
      assert.fail(path + ': added restrictive bound ' + key);
    }
  }

  if (baseline.additionalProperties !== undefined) {
    assert.deepEqual(actual.additionalProperties, baseline.additionalProperties,
      path + ': additionalProperties policy changed');
  }

  if (baseline.required !== undefined || actual.required !== undefined) {
    const old = baseline.required ?? [];
    const now = actual.required ?? [];
    assert.ok(Array.isArray(now), path + ': required must be an array');
    for (const item of now) assert.ok(old.includes(item), path + ': new required key ' + item);
  }
  if (baseline.properties !== undefined) {
    assert.ok(object(actual.properties), path + ': legacy properties disappeared');
    for (const [key, child] of Object.entries(baseline.properties)) {
      assert.ok(Object.hasOwn(actual.properties, key), path + ': removed legacy property ' + key);
      assertLegacyCompatible(child, actual.properties[key], path + '.' + key);
    }
  } else if (actual.properties !== undefined && baseline.type !== 'object') {
    assert.fail(path + ': new properties constraint on previously unstructured schema');
  }

  if (baseline.items !== undefined) {
    assert.ok(actual.items !== undefined, path + ': items schema removed');
    assertLegacyCompatible(baseline.items, actual.items, path + '.items');
  }
  for (const join of ['anyOf', 'oneOf', 'allOf']) {
    if (baseline[join] !== undefined) {
      assert.ok(Array.isArray(actual[join]) && actual[join].length >= baseline[join].length,
        path + ': removed legacy ' + join + ' alternative');
      baseline[join].forEach((child, i) => assertLegacyCompatible(child, actual[join][i], path + '.' + join + '[' + i + ']'));
    }
  }

  // Fail closed for newly introduced unreviewed restriction mechanisms.
  const limiting = ['not', 'patternProperties', 'minProperties', 'maxProperties',
    'uniqueItems', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'];
  for (const key of limiting) {
    if (actual[key] !== undefined || baseline[key] !== undefined) {
      assert.deepEqual(actual[key], baseline[key],
        path + ': restriction ' + key + ' changed or was introduced');
    }
  }
}

const PAGE_INPUT = Object.freeze({
  resolve_statistics_page: { required: ['url'], keys: ['url'] },
  read_statistics_page: { required: ['path'], keys: ['path', 'source_policy', 'include_sections'] },
  read_statistics_section: { required: ['path', 'section'], keys: ['path', 'section', 'source_policy', 'cursor'] },
});
export function assertPageToolInput(name, schema) {
  const exp = PAGE_INPUT[name];
  assert.ok(exp, 'Not a PAGE-004 tool: ' + name);
  assert.equal(schema?.type, 'object', name + ': expected input object');
  assert.equal(schema.additionalProperties, false, name + ': must reject unknown fields');
  assert.deepEqual(sorted(Object.keys(schema.properties ?? {})), sorted(exp.keys),
    name + ': exact public arguments changed');
  assert.deepEqual(sorted(schema.required ?? []), sorted(exp.required),
    name + ': required arguments changed');
  const str = (key) => {
    assert.equal(schema.properties[key]?.type, 'string', name + '.' + key + ': string expected');
    assert.ok(schema.properties[key]?.minLength >= 1, name + '.' + key + ': missing minLength');
  };
  if (name === 'resolve_statistics_page') str('url');
  else str('path');
  if (name === 'read_statistics_section') str('section');
  if (schema.properties.source_policy) {
    assert.deepEqual(sorted(schema.properties.source_policy.enum ?? []),
      ['as_published', 'production_only'], name + ': source policy changed');
    assert.equal(schema.properties.source_policy.default, 'as_published');
  }
  if (schema.properties.include_sections) {
    assert.equal(schema.properties.include_sections.type, 'boolean');
    assert.equal(schema.properties.include_sections.default, true);
  }
  if (schema.properties.cursor) {
    assert.equal(schema.properties.cursor.type, 'string');
    assert.equal(schema.properties.cursor.pattern, '^o:\\d{1,5}$');
  }
}

/** No unknown or silently removed tools. Both contract families are checked. */
export function assertToolInventory(tools, published, fixture) {
  assert.equal(fixture.tools.length, 13, 'Pinned RS-AI-API-001 tool baseline is corrupt');
  assert.deepEqual(fixture.tools, [...LEGACY_NAMES], 'Pinned baseline order has drifted');
  assert.deepEqual(sorted(tools.map((t) => t.name)), sorted(published.expectedTools),
    'Live MCP tool inventory differs from published release profile');
  const byName = new Map(tools.map((t) => [t.name, t]));
  assert.equal(byName.size, tools.length, 'Duplicate MCP tool names');

  for (const name of published.expectedTools) {
    const tool = byName.get(name);
    assert.ok(tool, 'Missing tool ' + name);
    assert.equal(tool.annotations?.readOnlyHint, true, name + ': must be read-only');
    assert.equal(tool.annotations?.destructiveHint, false, name + ': destructiveHint must be false');
    assert.equal(tool.inputSchema?.type, 'object', name + ': missing object input schema');
    if (LEGACY_NAMES.includes(name)) {
      assertLegacyCompatible(fixture.input_schemas[name], tool.inputSchema, name);
    } else {
      assertPageToolInput(name, tool.inputSchema);
    }
  }
}
