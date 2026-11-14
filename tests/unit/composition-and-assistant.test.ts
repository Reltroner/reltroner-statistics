import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerQuestion, type AgentIndex } from '../../src/domain/assistant.ts';
import { buildComposition, CompositionSchema } from '../../src/domain/composition.ts';
import { NCCM_DATASET_PATH } from '../../src/engine/observations.ts';
import type { SourceSnapshot } from '../../src/engine/comparator.ts';

const proportions = { depeisit: 64, cistheta: 22, cosmeilian: 4, native: 5, phantomkind: 2, other: 3 };
const surface = { nature_minimal_intervention: 58, urban_active: 15, urban_operational_low_or_biological_zero: 14, urban_dormant: 13 };
const habitat = { surface_land: 70, underground: 22, underwater: 2, floating: 6 };
function fixture() {
  return {
    schema_version: 'NCCM-V6.5-synthetic-test',
    census: { pre_migration_reference: { planetary_proxy_ancestry_denominator_billion: 3288 } },
    planet: {
      population_billion: 4412, sovereign_states: 37, land_area_million_km2: 4503,
      ancestry_reference_provenance: 'Creator ratified representative model based on 3288B reference',
      ancestry_primary_pct_representative_14_country_weighted: { depeisit: 50, cistheta: 20, cosmeilian: 15, native: 10, phantomkind: 2, other: 3 },
    },
    countries_14: Array.from({ length: 14 }, (_, i) => ({
      name: i === 0 ? 'Reltronland' : 'Nation ' + i,
      population_billion: i === 0 ? 855 : 100,
      land_area_million_km2: i === 0 ? 104 : 90,
      ancestry_primary_pct: { ...proportions },
      spatial_3d_canon: { land_surface_pct: { ...surface }, principal_habitat_pct: { ...habitat } },
    })),
    countries_5: Array.from({ length: 5 }, (_, i) => ({
      name: 'Development ' + i,
      population_billion: 50,
      land_area_million_km2: 100,
      spatial_3d_canon: { land_surface_pct: { ...surface }, principal_habitat_pct: { ...habitat } },
    })),
    aggregate_remaining_18: { state_count: 18, population_billion: 2007 },
  };
}
function mockSnapshot(doc: unknown): SourceSnapshot {
  const blobSha = 'a'.repeat(40);
  return {
    identity: { side: 'production', role: 'PRODUCTION_MAIN', repository: 'Reltroner/reltroner-studio', requested_ref: 'main', commit_sha: 'b'.repeat(40), tree_sha: 'c'.repeat(40), committed_at: null, headline: 'test fixture' },
    entries: new Map([[NCCM_DATASET_PATH, { sha: blobSha, size: 10, mode: '100644', type: 'blob' }]]),
    readBlob: async () => new TextEncoder().encode(JSON.stringify(doc)),
  } as SourceSnapshot;
}

test('NCCM reference is not rewritten as a measured all-country census', async () => {
  const d = await buildComposition(mockSnapshot(fixture()));
  CompositionSchema.parse(d);
  assert.equal(d.planet.ancestry_method, 'CREATOR_RATIFIED_REPRESENTATIVE_14_COUNTRY_BENCHMARK');
  assert.equal(d.planet.ancestry_reference_population_billion, 3288);
  assert.equal(d.planet.population_billion, 4412);
  assert.deepEqual(d.coverage, { complete_ancestry: 14, national_ancestry_unassigned: 5, residual_states: 18, residual_population_billion: 2007 });
  assert.equal(d.countries.length, 19);
  assert.equal(d.countries.filter((c) => c.ancestry_status === 'ASSIGNED').length, 14);
});

test('Reltronland screenshot: land footprint and usual home have independent denominators', async () => {
  const d = await buildComposition(mockSnapshot(fixture()));
  const r = d.countries[0]!;
  assert.equal(r.name, 'Reltronland');
  assert.deepEqual(r.surface.map((v) => v.pct), [58, 15, 14, 13]);
  assert.deepEqual(r.habitats.map((v) => v.pct), [70, 22, 2, 6]);
  assert.equal(r.surface[0]!.area_million_km2, 60.32);
  assert.equal(r.habitats[0]!.absolute_billion, 598.5);
  assert.equal(r.habitats[1]!.absolute_billion, 188.1);
  assert.equal(r.habitats[2]!.absolute_billion, 17.1);
  assert.equal(r.habitats[3]!.absolute_billion, 51.3);
  assert.equal(r.geometry_status, 'UNASSIGNED');
  assert.match(r.spatial_note, /km³/);
});

test('Fail closed on non-100% ancestry totals and inconsistent population denominators', async () => {
  const bad = fixture();
  bad.countries_14[0]!.ancestry_primary_pct.native = 6;
  await assert.rejects(buildComposition(mockSnapshot(bad)), /COMPOSITION_CONTRACT_VIOLATION/);
  const bad2 = fixture();
  bad2.aggregate_remaining_18.population_billion += 1;
  await assert.rejects(buildComposition(mockSnapshot(bad2)), /COMPOSITION_CONTRACT_VIOLATION/);
});

test('Deterministic assistant cites pinned source and never equates share with absolute count', async () => {
  const composition = await buildComposition(mockSnapshot(fixture()));
  const index: AgentIndex = {
    schema_version: 'reltroner-agent-index.v1', production_sha: composition.source.commit_sha, composition,
    narrative: [], routes: [],
    facts: [{ entity: 'Reltronland', indicator: 'sdi', label: 'Sentient Development Index', value: 0.984, unit: 'index', status: 'CANON_OBSERVED', source: { repository: composition.source.repository, commit_sha: composition.source.commit_sha, path: composition.source.path, pointer: 'countries_14[0].sdi' } }],
  };
  const a = answerQuestion(index, 'Berapa Phantomkind di Reltronland?');
  assert.equal(a.status, 'DERIVED_FROM_CANON');
  assert.match(a.paragraphs.join(' '), /2% = 17.1 billion/);
  assert.equal(a.citations[0]?.url.includes(composition.source.commit_sha), true);
  const b = answerQuestion(index, 'Spatial 3D composition Reltronland');
  assert.match(b.paragraphs.join(' '), /Land surface 70% \(598.5 billion\)/);
  assert.match(b.limitations.join(' '), /km³/);
  const c = answerQuestion(index, 'What is the SDI of Reltronland?');
  assert.match(c.paragraphs.join(' '), /0.984/);
  const d = answerQuestion(index, 'Unverified undiscovered extraterrestrial rumor');
  assert.equal(d.status, 'INSUFFICIENT_DATA');
});
