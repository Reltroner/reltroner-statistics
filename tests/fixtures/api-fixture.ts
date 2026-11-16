/**
 * A complete set of "published artifacts" for the intelligence API tests, built through the real
 * engines from the existing fixture world (synthetic sources, never canon) plus a small pinned
 * evidence index. No network: the asset binding below answers from memory.
 */
import { fixtureSnapshot } from '../../src/adapters/fixture-snapshot.ts';
import { aiManifest, type Coverage } from '../../src/api/discovery.ts';
import type { ApiEnv } from '../../src/api/http.ts';
import { ARTIFACTS, type ArtifactName } from '../../src/api/service.ts';
import type { AgentFact, AgentIndex } from '../../src/domain/assistant.ts';
import { buildComposition } from '../../src/engine/composition.ts';
import { buildDecisionArtifact } from '../../src/engine/decision-intelligence/index.ts';
import { NCCM_DATASET_PATH } from '../../src/engine/observations.ts';
import { creativeWorld } from './creative-fixture.ts';

export const PROD = 'a'.repeat(40);
export const DRAFT = 'b'.repeat(40);
export const STATISTICS_SHA = 'c'.repeat(40);
export const RELTRONLAND = 'country:reltronland';
export const DEPCUTLAND = 'country:depcutland';
export const PLANET = 'planet:asthortera';
export const ORIGIN = 'https://statistics.reltroner.com';

/** Reltronland and Depcutland values are copied from the pinned NCCM V6.5 sources, as in the calculator tests. */
function nccm(side: 'production' | 'remodeling') {
  const shares = { depeisit: 50, cistheta: 20, cosmeilian: 15, native: 10, phantomkind: 2.5, other: 2.5 };
  const nations: Array<Record<string, unknown>> = [
    { name: 'Reltronland', population_billion: 855, land_area_million_km2: 104, ancestry_primary_pct: { depeisit: 64, cistheta: 22, cosmeilian: 4, native: 5, phantomkind: 2, other: 3 } },
    { name: 'Depcutland', population_billion: 343, land_area_million_km2: 52, ancestry_primary_pct: { depeisit: 79, cistheta: 10, cosmeilian: 3, native: 4, phantomkind: 2, other: 2 } },
  ];
  if (side === 'remodeling') {
    nations[0]!.spatial_3d_canon = {
      status: 'C_creator_ratified_2026-11-01', reference: 'Year 0', land_footprint_denominator: 'national terrestrial area only', habitat_denominator: 'unique usual residents of country',
      land_surface_pct: { nature_minimal_intervention: 58, urban_active: 15, urban_operational_low_or_biological_zero: 14, urban_dormant: 13 },
      principal_habitat_pct: { surface_land: 70, underground: 22, underwater: 2, floating: 6 },
      polygon: null, constructed_volume_km3: null, habitable_volume_km3: null, marine_vertical_resident_distribution: null,
    };
  }
  const population = 855 + 343 + 91 + 120;
  return {
    schema_version: 'NCCM-FIXTURE',
    planet: {
      population_billion: population, sovereign_states: 5, land_area_million_km2: 4503,
      ancestry_primary_pct_representative_14_country_weighted: shares,
      ancestry_primary_headcount_billion_representative: Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, (population * v) / 100])),
      ancestry_reference_provenance: 'Frozen pre-migration 14-country population-weighted primary ancestry reference, denominator 3288B; preserved by explicit creator instruction.',
    },
    census: { pre_migration_reference: { planetary_proxy_ancestry_denominator_billion: 3288 } },
    countries_14: nations,
    countries_5: [{ name: 'Calespia', population_billion: 91, land_area_million_km2: side === 'production' ? null : 120, ancestry_primary_pct: null }],
    aggregate_remaining_18: { state_count: 2, population_billion: 120 },
  };
}

export type Artifacts = Record<ArtifactName, unknown>;

export async function apiArtifacts(): Promise<Artifacts & { index: AgentIndex }> {
  const world = await creativeWorld();
  const { creative, graph, audit } = world;
  const decisions = await buildDecisionArtifact({
    production: world.prod, remodeling: world.draft, graph, deployment_status: 'DEPLOYMENT_UNVERIFIED', source_timestamp: '2026-01-01T00:00:00Z',
    stats: world.stats, audit, qaProduction: world.qaProd, qaRemodeling: world.qaRemod, creative, generated_at: audit.generated_at,
  });
  const composition = await buildComposition(
    fixtureSnapshot('production', PROD, { [NCCM_DATASET_PATH]: JSON.stringify(nccm('production')) }),
    fixtureSnapshot('remodeling', DRAFT, { [NCCM_DATASET_PATH]: JSON.stringify(nccm('remodeling')) }),
  );
  const src = { repository: 'Reltroner/reltroner-studio', commit_sha: PROD, path: NCCM_DATASET_PATH };
  const fact = (entity_id: string, entity: string, indicator: string, label: string, value: number, unit: string, status: AgentFact['status'], pointer: string): AgentFact =>
    ({ entity_id, entity, indicator, label, value, unit, display: String(value), status, source: { ...src, pointer } });
  const nation = (id: string, name: string, population: number, gdp: number, perCapita: number, share: number) => [
    fact(id, name, 'population', 'Population', population, 'billion sentients', 'CANON_OBSERVED', `countries_14[${name}].population_billion`),
    fact(id, name, 'gdp_usd', 'Nominal GDP', gdp, 'USD per year', 'CANON_DERIVED', `countries_14[${name}].gdp_usd_annual_V6`),
    fact(id, name, 'gdp_per_capita', 'GDP per capita', perCapita, 'USD per sentient', 'CANON_DERIVED', `countries_14[${name}].gdp_per_capita_usd_V6`),
    fact(id, name, 'gdp_share', 'Share of planetary GDP', share, 'ratio of planetary GDP', 'CANON_OBSERVED', `countries_14[${name}].gdp_planet_share`),
  ];
  const facts = [
    ...nation(RELTRONLAND, 'Reltronland', 855, 4.7448998686935e22, 55495904897, 0.42),
    ...nation(DEPCUTLAND, 'Depcutland', 343, 1.12786792870254e22, 32882446900.9487, 0.0998344629315648),
    fact(RELTRONLAND, 'Reltronland', 'sdi', 'Sentient Development Index', 0.984, 'scale 0–1', 'CANON_OBSERVED', 'countries_14[Reltronland].sdi'),
    fact('country:calespia', 'Calespia', 'population', 'Population', 91, 'billion sentients', 'CANON_OBSERVED', 'countries_5[Calespia].population_billion'),
    fact(PLANET, 'Asthortera', 'population', 'Population', 4412, 'billion sentients', 'CANON_OBSERVED', 'planet.population_billion'),
    fact(PLANET, 'Asthortera', 'gdp_usd', 'Nominal GDP', 1.12973806397464e23, 'USD per year', 'CANON_DERIVED', 'planet.year0.gdp_usd_annual_V6'),
  ];
  const repoOf = (commit: string) => (commit === world.prod.identity.commit_sha ? 'Reltroner/reltroner-studio' : 'Reltroner/reltroner-studio-remodeling');
  // Same mapping as src/pages/data/assistant-index.json.ts: candidates are counted, never listed as facts.
  const candidate_counts: Record<string, number> = {};
  for (const r of creative.relationships) if (r.verification === 'CANDIDATE_HYPOTHESIS') for (const id of [r.source_id, r.target_id]) candidate_counts[id] = (candidate_counts[id] ?? 0) + 1;
  const index: AgentIndex = {
    schema_version: 'reltroner-agent-index.v2', production_sha: PROD, remodeling_sha: DRAFT, composition,
    indicators: [...new Set(facts.map((f) => f.indicator))].sort().map((id) => ({ id, label: facts.find((f) => f.indicator === id)!.label, unit: facts.find((f) => f.indicator === id)!.unit })),
    facts,
    narrative: creative.entities.map((e) => ({ id: e.id, name: e.name, kind: e.kind, summary: e.summary.slice(0, 600), side: e.source_side, canon_status: e.canon_status, source: { repository: repoOf(e.commit_sha), commit_sha: e.commit_sha, path: e.source_path, line: e.evidence_line, quote: e.evidence_quote } })),
    relations: creative.relationships.filter((r) => r.verification !== 'CANDIDATE_HYPOTHESIS').map((r) => ({
      id: r.id, type: r.type, source_id: r.source_id, target_id: r.target_id, verification: r.verification as 'VERIFIED_SOURCE_GROUNDED' | 'DECLARED_PROVENANCE', causal_class: r.causal_class, rationale: r.rationale,
      source: { repository: repoOf(r.commit_sha), commit_sha: r.commit_sha, path: r.source_path, line: r.evidence_line, quote: r.evidence_quote },
    })),
    candidate_counts,
    routes: [{ title: 'Calculator & Scenario Intelligence', href: '/calculator', summary: 'Deterministic source-backed calculations and conditional scenarios.' }],
    anchors: [
      { entity_id: RELTRONLAND, entity: 'Reltronland', indicator: 'population', label: 'Population', value: 1.52, unit: 'billion sentients', year_bac: 1010, status: 'CANON_OBSERVED', source: { ...src, path: 'content/events/history-timeline.md', pointer: null, line: 956 } },
      { entity_id: PLANET, entity: 'Asthortera', indicator: 'population', label: 'Population', value: 78.27, unit: 'billion sentients', year_bac: 1010, status: 'SCENARIO', source: { ...src, path: 'content/events/history-timeline.md', pointer: null, line: 1061 } },
    ],
    foundations: { [RELTRONLAND]: 1125, [DEPCUTLAND]: 1121 },
  };
  const coverage: Coverage = {
    model_version: composition.model_version, production_source_sha: PROD, remodeling_source_sha: DRAFT,
    statistics: { entities: 4, indicators: index.indicators.length, year0_values: facts.length, earlier_source_values: 2, ancestry_nations_assigned: 2, spatial_nations: composition.spatial.countries.length },
    narrative: { entities: creative.entities.length, relationships_verified_or_declared: index.relations.length, candidate_links_counted_only: creative.relationships.length - index.relations.length, audit_findings: creative.audit_findings.length, opportunities: creative.opportunities.length, refactoring_plans: creative.refactoring_plans.length, scenarios: creative.scenarios.length },
    graph: { nodes: graph.nodes.length, edges: graph.edges.length, edges_by_status: graph.summary.edges_by_status },
    drift: { findings: audit.findings.length },
    decisions: { trees: decisions.trees.length, paths: decisions.paths.length, evaluations: decisions.evaluations.length },
  };
  return {
    index,
    'build-info': { schema_version: 'reltroner-statistics-build.v1', statistics_commit: STATISTICS_SHA, statistics_tree_clean: true, semantic_digest: 'd'.repeat(64), rules_version: 'P0R-2.0.0', sources: { production: PROD, remodeling: DRAFT }, studio_deployment: 'DEPLOYMENT_UNVERIFIED', analysis_generated_at: '2026-01-01T00:00:00Z' },
    coverage: aiManifest(coverage),
    'assistant-index': index,
    creative,
    decisions,
    findings: { schema_version: 'reltroner-statistics-findings.v1', findings: audit.findings },
    graph,
  };
}

/** An in-memory stand-in for the Pages asset binding. It records every path it is asked for. */
export function fakeEnv(artifacts: Artifacts, extra: Partial<ApiEnv> = {}): ApiEnv & { requested: string[] } {
  const requested: string[] = [];
  const byPath = new Map<string, unknown>(Object.entries(ARTIFACTS).map(([name, a]) => [a.path, artifacts[name as ArtifactName]]));
  return {
    requested,
    ASSETS: {
      fetch: async (request: Request) => {
        const path = new URL(request.url).pathname;
        requested.push(path);
        const body = byPath.get(path);
        return body === undefined ? new Response('not found', { status: 404 }) : new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      },
    },
    ...extra,
  };
}
