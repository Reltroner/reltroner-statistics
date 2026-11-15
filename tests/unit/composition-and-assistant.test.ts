import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { fixtureSnapshot } from '../../src/adapters/fixture-snapshot.ts';
import { CompositionSchema, JSON_SCHEMA_EXPORTS } from '../../src/contracts/schemas.ts';
import { answerQuestion, type AgentIndex, type AgentNarrative, type AgentRelation } from '../../src/domain/assistant.ts';
import type { Composition } from '../../src/domain/composition.ts';
import { buildComposition } from '../../src/engine/composition.ts';
import { NCCM_DATASET_PATH } from '../../src/engine/observations.ts';

const PROD = 'a'.repeat(40);
const DRAFT = 'b'.repeat(40);

/**
 * Shares and populations of Reltronland, Depcutland and Beluftner are copied from the pinned NCCM
 * V6.5 sources (production for ancestry, remodeling for Spatial 3D) so the regression cases are
 * checked against real canon. Calespia stands for a development nation without ancestry shares;
 * the residual aggregate and the planetary benchmark are synthetic values that satisfy the identities.
 */
function nccm(side: 'production' | 'remodeling', tweak: (doc: Record<string, unknown>) => void = () => {}) {
  const shares = { depeisit: 50, cistheta: 20, cosmeilian: 15, native: 10, phantomkind: 2.5, other: 2.5 };
  const nations = [
    { name: 'Reltronland', population_billion: 855, land_area_million_km2: 104, ancestry_primary_pct: { depeisit: 64, cistheta: 22, cosmeilian: 4, native: 5, phantomkind: 2, other: 3 } },
    { name: 'Depcutland', population_billion: 343, land_area_million_km2: 52, ancestry_primary_pct: { depeisit: 79, cistheta: 10, cosmeilian: 3, native: 4, phantomkind: 2, other: 2 } },
    { name: 'Beluftner', population_billion: 91, land_area_million_km2: side === 'production' ? 88 : 363, ancestry_primary_pct: { depeisit: 0.2, cistheta: 0.5, cosmeilian: 2, native: 90.3, phantomkind: 6, other: 1 } },
  ] as Array<Record<string, unknown>>;
  if (side === 'remodeling') {
    nations[0]!.spatial_3d_canon = {
      status: 'C_creator_ratified_2026-11-01', reference: 'Year 0', land_footprint_denominator: 'national terrestrial area only', habitat_denominator: 'unique usual residents of country',
      land_surface_pct: { nature_minimal_intervention: 58, urban_active: 15, urban_operational_low_or_biological_zero: 14, urban_dormant: 13 },
      principal_habitat_pct: { surface_land: 70, underground: 22, underwater: 2, floating: 6 },
      polygon: null, constructed_volume_km3: null, habitable_volume_km3: null, marine_vertical_resident_distribution: null,
    };
    nations[2]!.spatial_3d_canon = { land_surface_pct: { nature_minimal_intervention: 87, urban_active: 4, urban_operational_low_or_biological_zero: 5, urban_dormant: 4 }, principal_habitat_pct: { surface_land: 82, underground: 12, underwater: 2, floating: 4 } };
    nations[2]!.land_area_status = 'C_creator_ratified_2026-11-01_national_land_footprint_only_not_ocean_or_habitable_volume';
  }
  const development = [{ name: 'Calespia', population_billion: 91, land_area_million_km2: side === 'production' ? null : 120, ancestry_primary_pct: null }];
  const population = 855 + 343 + 91 + 91 + 120;
  const doc: Record<string, unknown> = {
    schema_version: 'NCCM-FIXTURE',
    planet: {
      population_billion: population, sovereign_states: 6, land_area_million_km2: 4503,
      ancestry_primary_pct_representative_14_country_weighted: shares,
      ancestry_primary_headcount_billion_representative: Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, (population * v) / 100])),
      ancestry_reference_provenance: 'Frozen pre-migration 14-country population-weighted primary ancestry reference, denominator 3288B; preserved by explicit creator instruction.',
    },
    census: { pre_migration_reference: { planetary_proxy_ancestry_denominator_billion: 3288 } },
    countries_14: nations,
    countries_5: development,
    aggregate_remaining_18: { state_count: 2, population_billion: 120 },
  };
  tweak(doc);
  return doc;
}

const snapshots = (prodTweak?: (d: Record<string, unknown>) => void, draftTweak?: (d: Record<string, unknown>) => void) => ({
  production: fixtureSnapshot('production', PROD, { [NCCM_DATASET_PATH]: JSON.stringify(nccm('production', prodTweak)) }),
  remodeling: fixtureSnapshot('remodeling', DRAFT, { [NCCM_DATASET_PATH]: JSON.stringify(nccm('remodeling', draftTweak)) }),
});

async function composition(): Promise<Composition> {
  const s = snapshots();
  return buildComposition(s.production, s.remodeling);
}

test('R1 ancestry: shares come from production main and residents are population × share / 100', async () => {
  const c = await composition();
  assert.equal(CompositionSchema.safeParse(c).success, true);
  assert.equal(c.ancestry.authority, 'PRODUCTION_MAIN');
  assert.equal(c.sources.production.repository, 'Reltroner/reltroner-studio');
  assert.equal(c.sources.production.commit_sha, PROD);
  const bel = c.ancestry.countries.find((x) => x.name === 'Beluftner')!;
  assert.equal(bel.population_billion, 91);
  assert.deepEqual(bel.rows.find((r) => r.key === 'phantomkind'), { key: 'phantomkind', label: 'Phantomkind / Spiritual Hybrid', pct: 6, absolute_billion: 5.46 });
  assert.equal(bel.rows.find((r) => r.key === 'native')!.pct, 90.3);
  assert.equal(bel.rows.find((r) => r.key === 'native')!.absolute_billion, 82.173);
  assert.equal(bel.pointer, 'countries_14[2]');
  assert.equal(bel.remodeling.status, 'IDENTICAL');
  // A development nation without shares is NOT_ASSIGNED, never zero.
  const cal = c.ancestry.countries.find((x) => x.name === 'Calespia')!;
  assert.equal(cal.status, 'NOT_ASSIGNED');
  assert.deepEqual(cal.rows, []);
  assert.deepEqual(c.ancestry.coverage, { assigned: 3, not_assigned: 1, residual_states: 2, residual_population_billion: 120 });
  // The planetary benchmark keeps its own denominator and the source-stated headcounts.
  assert.equal(c.ancestry.planet.reference_population_billion, 3288);
  assert.equal(c.ancestry.planet.headcount_source, 'SOURCE_STATED');
  assert.equal(c.ancestry.planet.rows.reduce((s, r) => s + r.pct, 0), 100);
});

test('Spatial 3D: remodeling values with separate land and resident denominators; geometry stays unassigned', async () => {
  const c = await composition();
  assert.equal(c.spatial.authority, 'REMODELING_MAIN_CREATOR_RATIFIED_NOT_PRODUCTION');
  assert.equal(c.spatial.status, 'PROPOSED');
  assert.equal(c.spatial.production_spatial_records, 0);
  assert.equal(c.sources.remodeling?.commit_sha, DRAFT);
  const rel = c.spatial.countries.find((x) => x.name === 'Reltronland')!;
  assert.deepEqual(rel.surface.map((r) => r.pct), [58, 15, 14, 13]);
  assert.deepEqual(rel.surface.map((r) => r.area_million_km2), [60.32, 15.6, 14.56, 13.52], 'areas = 104 million km² × share');
  assert.deepEqual(rel.habitats.map((r) => r.pct), [70, 22, 2, 6]);
  assert.deepEqual(rel.habitats.map((r) => r.absolute_billion), [598.5, 188.1, 17.1, 51.3], 'residents = 855 billion × share');
  assert.equal(rel.habitats.reduce((s, r) => s + r.absolute_billion, 0), 855);
  assert.notEqual(rel.surface.reduce((s, r) => s + (r.area_million_km2 ?? 0), 0), 855, 'surface figures never use residents as denominator');
  assert.deepEqual(rel.geometry.map((g) => g.status), ['UNASSIGNED', 'UNASSIGNED', 'UNASSIGNED', 'UNASSIGNED', 'UNASSIGNED']);
  assert.equal(rel.surface_denominator, 'national terrestrial area only');
  // Beluftner: the spatial calculation uses the remodeling land area of the same record, never the production value.
  const bel = c.spatial.countries.find((x) => x.name === 'Beluftner')!;
  assert.equal(bel.land_area_million_km2, 363);
  assert.equal(bel.production_land_area_million_km2, 88);
  assert.equal(bel.surface[0]!.area_million_km2, 315.81);
  // Depcutland has no spatial record: not assigned, not zero.
  const dep = c.spatial.countries.find((x) => x.name === 'Depcutland')!;
  assert.equal(dep.surface_status, 'NOT_ASSIGNED');
  assert.deepEqual(dep.surface, []);
  assert.equal(c.spatial.coverage.surface_assigned, 2);
});

test('composition contract: malformed vectors, changed references and broken identities stop the build', async () => {
  const fails = async (prodTweak: ((d: Record<string, unknown>) => void) | undefined, draftTweak: ((d: Record<string, unknown>) => void) | undefined, re: RegExp) => {
    const s = snapshots(prodTweak, draftTweak);
    await assert.rejects(buildComposition(s.production, s.remodeling), re);
  };
  const nation = (d: Record<string, unknown>, i: number) => (d.countries_14 as Array<Record<string, unknown>>)[i]!;
  await fails((d) => { (nation(d, 2).ancestry_primary_pct as Record<string, number>).native = 80; }, undefined, /COMPOSITION_CONTRACT_VIOLATION: Beluftner.ancestry_primary_pct sums to/);
  await fails((d) => { (nation(d, 0).ancestry_primary_pct as Record<string, number>).martian = 0; }, undefined, /COMPOSITION_UNKNOWN_CATEGORIES/);
  await fails(undefined, (d) => { ((nation(d, 0).spatial_3d_canon as Record<string, Record<string, number>>).principal_habitat_pct)!.floating = 16; }, /principal_habitat_pct sums to 110/);
  await fails((d) => { (d.planet as Record<string, unknown>).ancestry_reference_provenance = 'Reference changed to 4000B'; }, undefined, /COMPOSITION_REFERENCE_CHANGED/);
  await fails((d) => { ((d.planet as Record<string, Record<string, number>>).ancestry_primary_headcount_billion_representative)!.depeisit = 1; }, undefined, /stated planetary headcount/);
  await fails((d) => { (d.aggregate_remaining_18 as Record<string, number>).population_billion = 121; }, undefined, /national populations plus residual/);
  await fails((d) => { (nation(d, 0) as Record<string, unknown>).population_billion = -1; }, undefined, /COMPOSITION_INVALID_NUMBER/);
  // Without a remodeling source the ancestry still builds and spatial is honestly empty.
  const s = snapshots();
  const onlyProd = await buildComposition(s.production, null);
  assert.equal(onlyProd.spatial.status, 'INSUFFICIENT_DATA');
  assert.deepEqual(onlyProd.spatial.countries, []);
  assert.equal(CompositionSchema.safeParse(onlyProd).success, true);
  // A remodeling ancestry proposal is reported as different and never replaces production values.
  const t = snapshots(undefined, (d) => { Object.assign(nation(d, 2).ancestry_primary_pct as Record<string, number>, { native: 89.3, other: 2 }); });
  const diverged = await buildComposition(t.production, t.remodeling);
  const bel = diverged.ancestry.countries.find((x) => x.name === 'Beluftner')!;
  assert.equal(bel.remodeling.status, 'DIFFERENT');
  assert.equal(bel.rows.find((r) => r.key === 'native')!.pct, 90.3);
  assert.equal(bel.remodeling.rows.find((r) => r.key === 'native')!.pct, 89.3);
  // The contract itself rejects a vector that does not close and an unassigned country with values.
  const bad = structuredClone(diverged);
  bad.ancestry.countries[0]!.rows[0]!.pct += 1;
  assert.equal(CompositionSchema.safeParse(bad).success, false);
  const json = z.toJSONSchema(JSON_SCHEMA_EXPORTS['composition.schema.json'], { target: 'draft-2020-12', unrepresentable: 'any', io: 'output' });
  assert.equal((json as { type?: string }).type, 'object');
});

async function agentIndex(): Promise<AgentIndex> {
  const comp = await composition();
  const src = { repository: 'Reltroner/reltroner-studio', commit_sha: PROD, path: NCCM_DATASET_PATH };
  const fact = (entity_id: string, entity: string, indicator: string, label: string, value: number, unit: string, display: string, pointer: string) =>
    ({ entity_id, entity, indicator, label, value, unit, display, status: 'CANON_OBSERVED' as const, source: { ...src, pointer } });
  const henchoway: AgentNarrative = { id: 'nar:faction:henchoway', name: 'Henchoway', kind: 'faction', summary: 'A transnational abyssal world-order organization.', side: 'both', canon_status: 'CANON_OBSERVED',
    source: { ...src, path: 'content/factions/henchoway.md', line: 16, quote: 'To dive is to forget. To forget is to belong.' } };
  const reltronland: AgentNarrative = { ...henchoway, id: 'nar:nation:reltronland', name: 'Reltronland', kind: 'nation', summary: 'A sovereign nation.', source: { ...henchoway.source, path: 'content/factions/reltronland.md', line: 24, quote: 'Country: Reltronland' } };
  const relation: AgentRelation = { id: 'NREL-000000000001', type: 'CONFLICTS_WITH', source_id: henchoway.id, target_id: reltronland.id, verification: 'VERIFIED_SOURCE_GROUNDED', causal_class: 'PARTICIPATION',
    rationale: 'The faction dossier describes the existential contest with Reltronland.', source: { ...src, path: 'content/factions/henchoway.md', line: 261, quote: 'Reltronland is dangerous to Vitor not merely because it is militarily and technologically powerful.' } };
  return {
    schema_version: 'reltroner-agent-index.v2', production_sha: PROD, remodeling_sha: DRAFT, composition: comp,
    indicators: [{ id: 'population', label: 'Population', unit: 'billion sentients' }, { id: 'sdi', label: 'Sentient Development Index', unit: 'scale 0–1' }, { id: 'sdi_individual', label: 'SDI individual component', unit: 'scale 0–1' }],
    facts: [
      fact('country:reltronland', 'Reltronland', 'population', 'Population', 855, 'billion sentients', '855 billion', 'countries_14[Reltronland].population_billion'),
      fact('country:reltronland', 'Reltronland', 'sdi', 'Sentient Development Index', 0.984, 'scale 0–1', '0.984 scale 0–1', 'countries_14[Reltronland].sdi'),
      fact('country:reltronland', 'Reltronland', 'sdi_individual', 'SDI individual component', 0.978, 'scale 0–1', '0.978 scale 0–1', 'countries_14[Reltronland].sdi_individual_component'),
      fact('planet:asthortera', 'Asthortera', 'population', 'Population', 1500, 'billion sentients', '1,500 billion', 'planet.population_billion'),
    ],
    narrative: [henchoway, reltronland],
    relations: [relation],
    candidate_counts: { [henchoway.id]: 4 },
    routes: [{ title: 'Species & ancestry demographics', href: '/statistics/species', summary: 'Primary ancestry' }],
  };
}

test('R2 assistant: deterministic answers carry their own status and production or remodeling citations', async () => {
  const index = await agentIndex();
  const text = (a: ReturnType<typeof answerQuestion>) => a.statements.map((s) => s.text).join(' | ');

  const phantom = answerQuestion(index, 'Berapa Phantomkind di Beluftner?');
  assert.equal(phantom.intent, 'ANCESTRY');
  assert.ok(phantom.statements.some((s) => s.status === 'CANON_OBSERVED' && s.text.includes('Phantomkind / Spiritual Hybrid 6%')));
  assert.ok(phantom.statements.some((s) => s.status === 'CANON_DERIVED' && s.text.includes('5.46 B')));
  assert.ok(!text(phantom).includes('Native Asthorteran'), 'only the requested category is reported');
  assert.match(phantom.citations[0]!.url, new RegExp(`^https://github.com/Reltroner/reltroner-studio/blob/${PROD}/`));
  assert.match(phantom.citations[0]!.detail, /countries_14\[2\]\.ancestry_primary_pct/);

  const compare = answerQuestion(index, 'Bandingkan ancestry Reltronland dan Depcutland.');
  assert.equal(compare.intent, 'ANCESTRY');
  assert.ok(compare.statements.some((s) => s.text.startsWith('Reltronland (855 B residents): Depeisit 64%')));
  assert.ok(compare.statements.some((s) => s.text.startsWith('Depcutland (343 B residents): Depeisit 79%')));
  assert.ok(compare.statements.some((s) => s.status === 'CANON_DERIVED' && s.text.includes('Depeisit −15 pp')));

  const population = answerQuestion(index, 'Berapa populasi Reltronland?');
  assert.equal(population.intent, 'INDICATOR');
  assert.deepEqual(population.statements.map((s) => [s.status, s.text]), [['CANON_OBSERVED', 'Reltronland · Population: 855 billion.']]);
  assert.match(population.citations[0]!.url, /reltroner-studio\/blob\//);
  assert.doesNotMatch(population.citations[0]!.url, /remodeling/);

  const spatial = answerQuestion(index, 'Spatial 3D composition Reltronland.');
  assert.equal(spatial.intent, 'SPATIAL');
  assert.equal(spatial.status, 'PROPOSED');
  assert.match(text(spatial), /Natural low-intervention 58% \(60\.32 million km²\)/);
  assert.match(text(spatial), /Underground 22% \(188\.1 B\)/);
  assert.match(spatial.citations[0]!.url, new RegExp(`reltroner-studio-remodeling/blob/${DRAFT}/`));
  assert.ok(spatial.limitations.some((l) => l.includes('not published to Studio production')));

  const sdi = answerQuestion(index, 'What is the SDI of Reltronland?');
  assert.deepEqual(sdi.statements.map((s) => s.text), ['Reltronland · Sentient Development Index: 0.984 scale 0–1.'], 'the SDI question does not return its components');

  const henchoway = answerQuestion(index, 'What does the verified evidence say about Henchoway?');
  assert.equal(henchoway.intent, 'NARRATIVE');
  assert.ok(henchoway.statements.some((s) => s.status === 'SOURCE_MATCH' && s.text.includes('conflicts with Reltronland') && s.text.includes('militarily and technologically powerful')));
  assert.ok(henchoway.statements.some((s) => s.status === 'CANDIDATE' && s.text.includes('not verified')));
  assert.ok(henchoway.citations.some((c) => c.url.endsWith('content/factions/henchoway.md#L261')));
  assert.ok(!/\bcauses\b/i.test(text(henchoway)), 'no causal claim is made');
});

test('R2 assistant: missing statistics and unknown entities yield INSUFFICIENT_DATA, never a borrowed number', async () => {
  const index = await agentIndex();
  for (const q of ['What is the volcanic activity index of Reltronland?', 'Berapa tingkat kebahagiaan di Depcutland?', 'What is the population growth of Reltronland?']) {
    const a = answerQuestion(index, q);
    assert.equal(a.status, 'INSUFFICIENT_DATA', q);
    assert.equal(a.citations.length, 0, q);
    assert.ok(!/\d{2,}/.test(a.statements.map((s) => s.text).join(' ')), `${q} reports no number`);
  }
  const atlantis = answerQuestion(index, 'Berapa populasi Atlantis?');
  assert.equal(atlantis.status, 'INSUFFICIENT_DATA');
  assert.match(atlantis.statements[0]!.text, /Atlantis is not a nation or entity of the evidence index/);
  const calespia = answerQuestion(index, 'Berapa Phantomkind di Calespia?');
  assert.equal(calespia.statements[0]!.status, 'INSUFFICIENT_DATA');
  assert.match(calespia.statements[0]!.text, /not assigned in production main \(unknown, not zero\)/);
  const planet = answerQuestion(index, 'What is the population?');
  assert.equal(planet.statements[0]!.text, 'No nation was named, so the planetary value of Asthortera is shown.');
  assert.equal(answerQuestion(index, 'hi').intent, 'EMPTY');
});
