import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { fixtureSnapshot } from '../../src/adapters/fixture-snapshot.ts';
import { offlineDeployment } from '../../src/adapters/deployment.ts';
import { assertBacYear, bacToAxis, chronological, formatBac, intervalPeriod, yearsBetween } from '../../src/domain/calendar.ts';
import { traverseImpact } from '../../src/domain/graph.ts';
import { compareSources } from '../../src/engine/comparator.ts';
import { applyEvidenceRule, EVIDENCE_RULES } from '../../src/engine/evidence-registry.ts';
import { buildKnowledgeGraph } from '../../src/engine/graph-builder.ts';
import { extractStatistics, NCCM_DATASET_PATH } from '../../src/engine/observations.ts';
import { runQa } from '../../src/engine/qa.ts';
import { GraphSchema, JSON_SCHEMA_EXPORTS, QaReportSchema, StatisticsDatasetSchema } from '../../src/contracts/schemas.ts';
import { nccmFixture, TIMELINE_FIXTURE } from '../fixtures/nccm-fixture.ts';

const A = 'a'.repeat(40), B = 'b'.repeat(40);

function sources(draftArea = 363) {
  const prod = fixtureSnapshot('production', A, {
    [NCCM_DATASET_PATH]: JSON.stringify(nccmFixture()),
    'data/asthortera/old-model-v3.json': '{"schema_version":"old"}',
    'content/events/history-timeline.md': `---\ntitle: History\n---\n${TIMELINE_FIXTURE}`,
    'content/factions/alpha.md': '---\ntitle: Alpha\n---\nAlpha borders Beluftner. Alphabet is not Alpha.',
    'content/factions/beluftner.md': '---\ntitle: Beluftner\n---\nBeluftner text',
  });
  const draft = fixtureSnapshot('remodeling', B, {
    [NCCM_DATASET_PATH]: JSON.stringify(nccmFixture({ beluftnerArea: draftArea })),
    'data/asthortera/old-model-v3.json': '{"schema_version":"old"}',
    'content/events/history-timeline.md': `---\ntitle: History\n---\n${TIMELINE_FIXTURE}`,
    'content/factions/alpha.md': '---\ntitle: Alpha\n---\nAlpha borders Beluftner. Alphabet is not Alpha.',
    'content/factions/beluftner.md': '---\ntitle: Beluftner\n---\nBeluftner text',
    'content/statistics/new.md': '---\ntitle: New\n---\nGamma proposal',
  });
  return { prod, draft };
}

test('BAC calendar: chronological axis, formatting, validation and intervals', () => {
  assert.equal(formatBac(1010), '1010 BAC');
  assert.equal(formatBac(0), 'Year 0');
  assert.equal(bacToAxis(950), -950);
  assert.equal(bacToAxis(0), 0);
  assert.deepEqual([0, 2882, 1010, 950].sort(chronological), [2882, 1010, 950, 0]);
  assert.equal(yearsBetween(1010, 950), 60);
  assert.throws(() => yearsBetween(950, 1010));
  for (const bad of [-1, 1.5, Number.NaN, '10', 20_000]) assert.throws(() => assertBacYear(bad));
  assert.deepEqual(intervalPeriod(1010, 995).interval, { start_bac: 1010, end_bac: 995 });
  assert.throws(() => intervalPeriod(995, 1010));
});

test('extraction preserves null vs missing, statuses, provenance and never treats the residual as 18 observations', async () => {
  const { prod, draft } = sources();
  const s = await extractStatistics(prod, draft);
  assert.equal(StatisticsDatasetSchema.safeParse(s).success, true);
  const gammaLand = s.observations.find((o) => o.entity_id === 'country:gamma' && o.indicator_id === 'land_area')!;
  assert.deepEqual([gammaLand.value, gammaLand.value_state, gammaLand.status], [null, 'NULL', 'INSUFFICIENT_DATA']);
  const gammaGini = s.observations.find((o) => o.entity_id === 'country:gamma' && o.indicator_id === 'gini')!;
  assert.deepEqual([gammaGini.value, gammaGini.value_state], [null, 'MISSING']);
  const alphaSpec = s.observations.find((o) => o.entity_id === 'country:alpha' && o.indicator_id === 'specialization_factor')!;
  assert.equal(alphaSpec.value_state, 'NULL');
  const gdp = s.observations.find((o) => o.entity_id === 'country:alpha' && o.indicator_id === 'gdp_usd')!;
  assert.equal(gdp.status, 'CANON_DERIVED');
  assert.equal(gdp.source.pointer, 'countries_14[Alpha].gdp_usd_annual_V6');
  assert.equal(gdp.source.commit_sha, A);
  const archived = s.observations.filter((o) => o.status === 'ARCHIVED');
  assert.equal(archived.length, 1);
  assert.equal(archived[0]!.model_version, 'NCCM-V6.4-pre-rebase');
  const residual = s.entities.find((e) => e.kind === 'aggregate_residual')!;
  assert.equal(residual.represents_states, 2);
  assert.equal(s.observations.filter((o) => o.entity_id === residual.id && o.indicator_id === 'population').length, 1);
  assert.ok(s.proposals.length > 0 && s.proposals.every((o) => o.status === 'PROPOSED' && o.source.role === 'REMODELING_MAIN'));
  assert.equal(s.proposals.find((o) => o.entity_id === 'country:beluftner' && o.indicator_id === 'land_area')!.value, 363);
  assert.equal(s.observations.find((o) => o.entity_id === 'country:beluftner' && o.indicator_id === 'land_area')!.value, 88);
  assert.deepEqual(s.timeline.map((t) => t.start_bac), [1256, 1153, 1125, 900]);
});

test('evidence rules parse values from source text; missing text contributes nothing', async () => {
  const { prod, draft } = sources();
  const s = await extractStatistics(prod, draft);
  const growth = s.observations.filter((o) => o.entity_id === 'planet:asthortera' && o.indicator_id === 'real_gdp_growth').map((o) => [o.period.year_bac, o.value, o.status]);
  assert.deepEqual(growth.sort(), [[0, growth.find((g) => g[0] === 0)![1], 'CANON_OBSERVED'], [1010, 0.1, 'CANON_OBSERVED'], [950, 0.15, 'CANON_OBSERVED']].sort());
  const sim = s.observations.filter((o) => o.indicator_id === 'population_growth');
  assert.deepEqual(sim.map((o) => [o.period.interval!.start_bac, o.period.interval!.end_bac, o.value, o.status]).sort(),
    [[1010, 995, 0.014, 'SCENARIO'], [995, 970, 0.024, 'SCENARIO'], [300, 0, 0.00197658, 'SCENARIO']].sort());
  const scenario = s.observations.find((o) => o.indicator_id === 'population' && o.period.year_bac === 1010 && o.entity_id === 'planet:asthortera')!;
  assert.equal(scenario.status, 'SCENARIO');
  assert.ok(scenario.evidence!.quote.includes('78.27'));
  assert.equal(s.evidence_checks.find((e) => e.rule_id === 'EV-RELTRONLAND-RECONSTRUCTION-GROWTH-RANGE')!.status, 'SOURCE_MISSING');
  const rule = EVIDENCE_RULES.find((r) => r.id === 'EV-950-REAL-GROWTH-PEAK')!;
  assert.equal(applyEvidenceRule(rule, 'growth reached 15% somewhere').status, 'NOT_FOUND');
  const changed = applyEvidenceRule(rule, 'The planetary **annual real GDP growth rate reached 12.5%**, compared with **10% in 1010 BAC**');
  assert.equal((changed.outputs[0] as { value: number }).value, 0.125);
});

test('QA identities pass on a consistent dataset and fail deterministically on a contradiction', () => {
  const ok = runQa(nccmFixture(), 'PRODUCTION_MAIN');
  assert.deepEqual(ok.filter((q) => q.result !== 'PASS').map((q) => q.id), []);
  const bad = runQa(nccmFixture({ planetSdi: 0.5, beluftnerArea: 450 }), 'REMODELING_MAIN');
  const fails = bad.filter((q) => q.result === 'FAIL').map((q) => q.id).sort();
  assert.deepEqual(fails, ['QA-LAND-AREA-BOUND', 'QA-PLANET-SDI-WEIGHTED']);
  assert.equal(QaReportSchema.safeParse({ schema_version: 'reltroner-statistics-qa.v1', production: ok, remodeling: bad }).success, true);
  assert.deepEqual(runQa(null, 'PRODUCTION_MAIN'), []);
});

test('graph edges are evidence-backed; MENTIONS never becomes DEPENDS_ON; impact traversal is bounded', async () => {
  const { prod, draft } = sources();
  const audit = await compareSources(prod, draft, { deployment: offlineDeployment('fixture'), generatedAt: '2026-01-01T00:00:00Z' });
  const stats = await extractStatistics(prod, draft);
  const qa = runQa(nccmFixture(), 'PRODUCTION_MAIN');
  const g = await buildKnowledgeGraph({ audit, stats, qa, production: prod, remodeling: draft });
  assert.equal(GraphSchema.safeParse(g).success, true);
  const mentions = g.edges.filter((e) => e.type === 'MENTIONS' && e.source === 'document:content/factions/alpha.md').map((e) => e.target).sort();
  assert.deepEqual(mentions, ['entity:country:alpha', 'entity:country:beluftner']);
  // title + two body mentions; "Alphabet" is not a mention of Alpha
  assert.match(g.edges.find((e) => e.type === 'MENTIONS' && e.target === 'entity:country:alpha')!.evidence, /^3 occurrence/);
  assert.ok(!g.edges.some((e) => e.type === 'DEPENDS_ON' && (e.source.startsWith('document:') || e.target.startsWith('entity:'))));
  assert.ok(g.edges.filter((e) => e.type === 'DEPENDS_ON').every((e) => e.status === 'VERIFIED'));
  assert.ok(g.edges.some((e) => e.type === 'PROPOSES_CHANGE_TO' && e.target === 'entity:country:beluftner' && e.side === 'remodeling'));
  assert.ok(g.edges.some((e) => e.type === 'DERIVED_FROM' && e.target === 'dataset:data/asthortera/old-model-v3.json' && e.status === 'DECLARED'));
  assert.equal(g.nodes.find((n) => n.id === 'document:content/statistics/new.md')!.side, 'remodeling');
  assert.equal(g.nodes.find((n) => n.id === 'document:content/factions/alpha.md')!.label, 'Alpha');
  const pop = traverseImpact(g.edges, 'indicator:population');
  assert.ok(pop.direct.some((h) => h.node === 'indicator:gdp_per_capita' && h.via === 'DEPENDS_ON'));
  assert.ok(!traverseImpact(g.edges, 'entity:country:beluftner').direct.some((h) => h.via === 'MENTIONS'));
  const withMentions = traverseImpact(g.edges, 'entity:country:beluftner', { types: ['MENTIONS'] });
  assert.ok(withMentions.direct.every((h) => h.strength === 'mention'));
  const bounded = traverseImpact(g.edges, `dataset:${NCCM_DATASET_PATH}`, { maxDepth: 1 });
  assert.ok(bounded.transitive.length === 0 && bounded.direct.length > 0);
});

test('impact traversal handles cycles and reports each node once at its shortest depth', () => {
  const e = (id: string, type: 'DEPENDS_ON' | 'DEFINES', source: string, target: string) => ({ id, type, source, target, side: 'production' as const, status: 'VERIFIED' as const, evidence: '' });
  const edges = [e('1', 'DEPENDS_ON', 'b', 'a'), e('2', 'DEPENDS_ON', 'c', 'b'), e('3', 'DEPENDS_ON', 'a', 'c'), e('4', 'DEFINES', 'a', 'd')];
  const r = traverseImpact(edges, 'a');
  assert.deepEqual(r.direct.map((h) => h.node), ['b', 'd']);
  assert.deepEqual(r.transitive.map((h) => [h.node, h.depth, h.path.join('>')]), [['c', 2, 'a>b>c']]);
});

test('committed JSON Schemas match the Zod contracts (no Node/Python contract drift)', () => {
  for (const [name, schema] of Object.entries(JSON_SCHEMA_EXPORTS)) {
    const expected = `${JSON.stringify({ $id: `https://reltroner-statistics.invalid/schemas/${name}`, ...z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any', io: 'output' }) }, null, 2)}\n`;
    const committed = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'analytics', 'schemas', name), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(committed, expected, `${name} is stale; run npm run schemas`);
  }
});
