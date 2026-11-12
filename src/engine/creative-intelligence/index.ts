/**
 * Creative Intelligence & Narrative Systems Engine Orchestrator.
 *
 * Builds the deterministic `CreativeArtifact` (`reltroner-statistics-creative.v1`)
 * from the pinned production and remodeling snapshots, audit artifact, observations,
 * QA checks, and knowledge graph.
 */

import type { Audit } from '../../domain/finding.ts';
import type { KnowledgeGraph } from '../../domain/graph.ts';
import type { StatisticsDataset } from '../../domain/observation.ts';
import type { CreativeArtifact } from '../../domain/creative.ts';
import type { QaCheck } from '../qa.ts';
import type { SourceSnapshot } from '../comparator.ts';
import { canonicalJson } from '../canonical.ts';
import { sha256Hex } from '../git-objects.ts';
import { extractNarrativeKnowledge } from './extractor.ts';
import { runNarrativeAudit } from './audit-engine.ts';
import { discoverCreativeOpportunities } from './opportunity-engine.ts';
import { buildRefactoringPlans } from './refactor-engine.ts';
import { buildRemodelingScenarios, buildSeedProposals, simulateNarrativeImpact } from './remodel-engine.ts';
import { getAiAdapterStatus, generateDeterministicIdeation } from './ai-adapter.ts';

export const CREATIVE_RULES_VERSION = '1.0.0';

export {
  extractNarrativeKnowledge,
  runNarrativeAudit,
  discoverCreativeOpportunities,
  buildRefactoringPlans,
  buildRemodelingScenarios,
  buildSeedProposals,
  simulateNarrativeImpact,
  getAiAdapterStatus,
  generateDeterministicIdeation,
};

export async function buildCreativeIntelligenceArtifact(input: {
  production: SourceSnapshot;
  remodeling: SourceSnapshot;
  audit: Audit;
  stats: StatisticsDataset;
  qaProduction: QaCheck[];
  qaRemodeling: QaCheck[];
  graph: KnowledgeGraph;
  generatedAt?: string;
}): Promise<CreativeArtifact> {
  const { production, remodeling, audit, stats, qaProduction, qaRemodeling, graph } = input;
  const generated_at = input.generatedAt ?? production.identity.committed_at ?? '2026-04-19T00:00:00Z';

  // 1. Extract source-grounded narrative entities and typed relationships
  const { entities, relationships } = await extractNarrativeKnowledge({
    audit,
    stats,
    production,
    remodeling,
  });

  // 2. Run narrative consistency audit
  const audit_findings = await runNarrativeAudit({
    production,
    remodeling,
    audit,
    stats,
    qaProduction,
    qaRemodeling,
    entities,
    relationships,
  });

  // 3. Discover creative opportunities and compute priority scores
  const opportunities = discoverCreativeOpportunities({
    production,
    remodeling,
    stats,
    entities,
    relationships,
  });

  // 4. Build non-destructive story refactoring plans
  const refactoring_plans = buildRefactoringPlans({
    graph,
    entities,
    production,
    remodeling,
  });

  // 5. Build remodeling scenarios (including Reltronland/Depcutland Case Study)
  const scenarios = buildRemodelingScenarios({
    audit,
    graph,
    entities,
    relationships,
    production,
    remodeling,
  });

  // 6. Build structured seed proposals
  const seed_proposals = buildSeedProposals({
    scenarios,
    opportunities,
    refactoringPlans: refactoring_plans,
    auditFindings: audit_findings,
    production,
    remodeling,
  });

  // 7. Compute summary counts
  const entities_by_kind: Record<string, number> = {};
  for (const e of entities) {
    entities_by_kind[e.kind] = (entities_by_kind[e.kind] ?? 0) + 1;
  }

  const relationships_by_type: Record<string, number> = {};
  const relationships_by_verification: Record<string, number> = {};
  for (const r of relationships) {
    relationships_by_type[r.type] = (relationships_by_type[r.type] ?? 0) + 1;
    relationships_by_verification[r.verification] = (relationships_by_verification[r.verification] ?? 0) + 1;
  }

  const audit_by_classification: Record<string, number> = {};
  for (const f of audit_findings) {
    audit_by_classification[f.classification] = (audit_by_classification[f.classification] ?? 0) + 1;
  }

  const ai_adapter = getAiAdapterStatus();

  const summary: CreativeArtifact['summary'] = {
    entities_total: entities.length,
    entities_by_kind,
    relationships_total: relationships.length,
    relationships_by_type,
    relationships_by_verification,
    audit_findings_total: audit_findings.length,
    audit_by_classification,
    opportunities_total: opportunities.length,
    refactoring_plans_total: refactoring_plans.length,
    scenarios_total: scenarios.length,
    seed_proposals_total: seed_proposals.length,
  };

  const semanticPayload = {
    schema_version: 'reltroner-statistics-creative.v1',
    rules_version: CREATIVE_RULES_VERSION,
    sources: {
      production_commit_sha: production.identity.commit_sha,
      remodeling_commit_sha: remodeling.identity.commit_sha,
    },
    ai_adapter,
    summary,
    entities,
    relationships,
    audit_findings,
    opportunities,
    refactoring_plans,
    scenarios,
    seed_proposals,
  };

  const semantic_digest = sha256Hex(canonicalJson(semanticPayload));

  return {
    schema_version: 'reltroner-statistics-creative.v1',
    rules_version: CREATIVE_RULES_VERSION,
    generated_at,
    sources: {
      production_commit_sha: production.identity.commit_sha,
      remodeling_commit_sha: remodeling.identity.commit_sha,
    },
    ai_adapter,
    summary,
    entities,
    relationships,
    audit_findings,
    opportunities,
    refactoring_plans,
    scenarios,
    seed_proposals,
    semantic_digest,
  };
}
