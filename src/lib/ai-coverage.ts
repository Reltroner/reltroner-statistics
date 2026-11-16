/** Build-time coverage summary for the AI discovery documents. Server-only: reads validated artifacts. */
import type { Coverage } from '../api/discovery.ts';
import { SCENARIO_INDICATORS } from '../domain/calculator.ts';
import { currentObservations, getAudit, getComposition, getContext, getCreative, getDecisions, getGraph, getStats } from './data.ts';

export function coverage(): Coverage {
  const composition = getComposition();
  const creative = getCreative();
  const graph = getGraph();
  const decisions = getDecisions();
  const stats = getStats();
  const values = currentObservations().filter((o) => (o.status === 'CANON_OBSERVED' || o.status === 'CANON_DERIVED') && o.value !== null);
  const candidates = creative.relationships.filter((r) => r.verification === 'CANDIDATE_HYPOTHESIS').length;
  return {
    model_version: composition.model_version,
    production_source_sha: getContext().production.commit_sha,
    remodeling_source_sha: composition.sources.remodeling?.commit_sha ?? null,
    statistics: {
      entities: new Set(values.map((o) => o.entity_id)).size, indicators: new Set(values.map((o) => o.indicator_id)).size, year0_values: values.length,
      earlier_source_values: stats.observations.filter((o) => o.period.year_bac > 0 && !o.period.interval && o.value !== null && (SCENARIO_INDICATORS as readonly string[]).includes(o.indicator_id)).length,
      ancestry_nations_assigned: composition.ancestry.coverage.assigned, spatial_nations: composition.spatial.countries.length,
    },
    narrative: {
      entities: creative.entities.length, relationships_verified_or_declared: creative.relationships.length - candidates, candidate_links_counted_only: candidates,
      audit_findings: creative.audit_findings.length, opportunities: creative.opportunities.length, refactoring_plans: creative.refactoring_plans.length, scenarios: creative.scenarios.length,
    },
    graph: { nodes: graph.nodes.length, edges: graph.edges.length, edges_by_status: graph.summary.edges_by_status },
    drift: { findings: getAudit().findings.length },
    decisions: { trees: decisions.trees.length, paths: decisions.paths.length, evaluations: decisions.evaluations.length },
  };
}
