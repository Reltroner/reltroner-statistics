/**
 * Creative Intelligence orchestrator. Builds the deterministic `CreativeArtifact` from the pinned
 * production and remodeling snapshots, the drift audit, the observations, QA and the graph.
 *
 * The artifact is published only after `verifyCreativeEvidence` finds no violation: every quoted
 * passage must occur at its cited line of its cited blob, every blob SHA must be the snapshot's
 * blob for that path, every referenced entity must exist, and nothing from remodeling may carry
 * a canon status.
 */

import type { Audit } from '../../domain/finding.ts';
import type { KnowledgeGraph } from '../../domain/graph.ts';
import type { StatisticsDataset } from '../../domain/observation.ts';
import type { CreativeArtifact } from '../../domain/creative.ts';
import type { QaCheck } from '../qa.ts';
import type { SourceSnapshot } from '../comparator.ts';
import { canonicalJson } from '../canonical.ts';
import { verifyPassage } from '../evidence.ts';
import { sha256Hex } from '../git-objects.ts';
import { extractNarrativeKnowledge } from './extractor.ts';
import { runNarrativeAudit } from './audit-engine.ts';
import { discoverCreativeOpportunities } from './opportunity-engine.ts';
import { buildRefactoringPlans } from './refactor-engine.ts';
import { buildRemodelingScenarios, buildSeedProposals, simulateNarrativeImpact } from './remodel-engine.ts';
import { getAiAdapterStatus, generateDeterministicIdeation } from './ai-adapter.ts';

/** 2.0.0: citations are resolved from pinned blobs; name co-occurrence yields candidate links only. */
export const CREATIVE_RULES_VERSION = '2.0.0';

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

export interface EvidenceViolation {
  code: 'SOURCE_MISSING' | 'BLOB_MISMATCH' | 'LINE_OUT_OF_RANGE' | 'QUOTE_NOT_AT_LINE' | 'COMMIT_MISMATCH' | 'JSON_LINE_QUOTE' | 'DANGLING_REFERENCE' | 'AUTHORITY_PROMOTION' | 'UNSUPPORTED_VERIFIED_LINK';
  where: string;
  detail: string;
}

export interface EvidenceIntegrity {
  citations_checked: number;
  references_checked: number;
  violations: EvidenceViolation[];
}

type CreativeCore = Pick<CreativeArtifact, 'entities' | 'relationships' | 'audit_findings' | 'opportunities' | 'refactoring_plans' | 'scenarios' | 'seed_proposals'>;

/**
 * Re-check every citation and reference of a creative artifact against the pinned snapshots.
 * Prose citations are verified by text; dataset citations (JSON) are verified by blob identity
 * and must not carry a line, because a JSON pointer is not a quotation of a line.
 */
export async function verifyCreativeEvidence(
  creative: CreativeCore,
  ctx: { production: SourceSnapshot; remodeling: SourceSnapshot; graph: KnowledgeGraph; stats: StatisticsDataset },
): Promise<EvidenceIntegrity> {
  const { production, remodeling, graph, stats } = ctx;
  const violations: EvidenceViolation[] = [];
  let citations = 0;
  let references = 0;
  const known = new Set([...creative.entities.map((e) => e.id), ...graph.nodes.map((n) => n.id), ...stats.entities.map((e) => e.id)]);
  const sideOfCommit = (sha: string) => (sha === production.identity.commit_sha ? 'production' : sha === remodeling.identity.commit_sha ? 'remodeling' : null);

  const citation = async (where: string, ref: { side: 'production' | 'remodeling' | null; commit_sha: string; path: string; blob_sha: string | null; line: number | null; quote: string }) => {
    citations++;
    const side = ref.side ?? sideOfCommit(ref.commit_sha);
    if (!side || ref.commit_sha !== (side === 'production' ? production : remodeling).identity.commit_sha) {
      violations.push({ code: 'COMMIT_MISMATCH', where, detail: `${ref.path}: commit ${ref.commit_sha.slice(0, 12)} is not the pinned ${side ?? 'source'} commit` });
      return;
    }
    if (ref.path.endsWith('.json') && ref.line !== null) {
      violations.push({ code: 'JSON_LINE_QUOTE', where, detail: `${ref.path}: a dataset value is cited by pointer and cannot quote line ${ref.line}` });
      return;
    }
    const check = await verifyPassage(side === 'production' ? production : remodeling, ref);
    if (check !== 'VERIFIED') violations.push({ code: check, where, detail: `${ref.path}${ref.line ? `:${ref.line}` : ''} “${ref.quote.slice(0, 80)}”` });
  };
  const reference = (where: string, ids: readonly string[]) => {
    for (const id of ids) {
      references++;
      if (!known.has(id)) violations.push({ code: 'DANGLING_REFERENCE', where, detail: id });
    }
  };
  const side = (s: 'production' | 'remodeling' | 'both') => (s === 'remodeling' ? 'remodeling' : 'production');

  for (const e of creative.entities) {
    await citation(`entity ${e.id}`, { side: side(e.source_side), commit_sha: e.commit_sha, path: e.source_path, blob_sha: e.blob_sha, line: e.evidence_line, quote: e.evidence_quote });
    if (e.source_side === 'remodeling' && (e.canon_status === 'CANON_OBSERVED' || e.canon_status === 'CANON_DERIVED')) violations.push({ code: 'AUTHORITY_PROMOTION', where: `entity ${e.id}`, detail: 'A remodeling-only entity carries a canon status' });
  }
  const entityIds = new Set(creative.entities.map((e) => e.id));
  for (const r of creative.relationships) {
    await citation(`relationship ${r.id}`, { side: side(r.source_side), commit_sha: r.commit_sha, path: r.source_path, blob_sha: r.blob_sha, line: r.evidence_line, quote: r.evidence_quote });
    references += 2;
    for (const id of [r.source_id, r.target_id]) if (!entityIds.has(id)) violations.push({ code: 'DANGLING_REFERENCE', where: `relationship ${r.id}`, detail: id });
    if (r.source_side === 'remodeling' && r.verification === 'VERIFIED_SOURCE_GROUNDED') violations.push({ code: 'AUTHORITY_PROMOTION', where: `relationship ${r.id}`, detail: 'A remodeling-only relationship is marked source-verified canon' });
    if (r.verification !== 'CANDIDATE_HYPOTHESIS' && (r.type === 'CAUSES_CANDIDATE' || r.causal_class === 'CO_OCCURRENCE_ONLY') && r.type !== 'APPEARS_IN') violations.push({ code: 'UNSUPPORTED_VERIFIED_LINK', where: `relationship ${r.id}`, detail: `${r.type} from a co-occurrence cannot be verified` });
  }
  for (const f of creative.audit_findings) {
    if (f.synthetic) continue;
    for (const [i, p] of f.passages.entries()) await citation(`finding ${f.id} passage ${i}`, { side: p.side, commit_sha: p.commit_sha, path: p.path, blob_sha: p.blob_sha, line: p.line, quote: p.quote });
    reference(`finding ${f.id}`, f.affected_entities);
  }
  for (const o of creative.opportunities) {
    for (const [i, a] of o.canon_anchors.entries()) await citation(`opportunity ${o.id} anchor ${i}`, { side: null, commit_sha: a.commit_sha, path: a.path, blob_sha: a.blob_sha, line: a.line, quote: a.quote });
    reference(`opportunity ${o.id}`, [...o.affected_entities, ...o.canon_anchors.map((a) => a.entity_id).filter((id): id is string => id !== null)]);
  }
  for (const p of creative.refactoring_plans) {
    for (const d of p.affected_documents) await citation(`plan ${p.id} document`, { side: d.side, commit_sha: d.commit_sha, path: d.path, blob_sha: d.blob_sha, line: null, quote: d.path });
    reference(`plan ${p.id}`, [...p.affected_entities, ...p.dependency_impact.direct_nodes, ...p.dependency_impact.transitive_nodes]);
  }
  for (const s of creative.scenarios) {
    for (const [i, a] of s.production_baseline.anchors.entries()) {
      await citation(`scenario ${s.id} anchor ${i}`, { side: 'production', commit_sha: a.commit_sha, path: a.path, blob_sha: a.blob_sha, line: a.line, quote: a.value });
      if (a.status === 'PROPOSED') violations.push({ code: 'AUTHORITY_PROMOTION', where: `scenario ${s.id} anchor ${i}`, detail: 'A production baseline anchor cannot be a proposal' });
    }
    for (const [i, p] of s.perspectives.entries()) {
      await citation(`scenario ${s.id} perspective ${i} stance`, { side: null, commit_sha: p.commit_sha, path: p.source_path, blob_sha: p.blob_sha, line: p.evidence_line, quote: p.evidence_quote });
      await citation(`scenario ${s.id} perspective ${i} constraint`, { side: null, commit_sha: p.commit_sha, path: p.source_path, blob_sha: p.blob_sha, line: p.constraint_line, quote: p.fear_or_constraint });
    }
    reference(`scenario ${s.id}`, [...s.focus_entities, ...s.perspectives.map((p) => p.actor_id), ...s.impact_dimensions.flatMap((d) => d.affected_nodes)]);
  }
  for (const p of creative.seed_proposals) {
    for (const [i, r] of p.source_references.entries()) await citation(`proposal ${p.proposal_id} reference ${i}`, { side: r.side, commit_sha: r.commit_sha, path: r.path, blob_sha: r.blob_sha, line: r.line, quote: r.quote });
    reference(`proposal ${p.proposal_id}`, [...p.originating_entities, ...p.potential_impacts.map((i) => i.target_id)]);
    if (p.canon_status === 'CANON_OBSERVED' && !p.ratification_evidence?.verified) violations.push({ code: 'AUTHORITY_PROMOTION', where: `proposal ${p.proposal_id}`, detail: 'Canon status without verified ratification evidence' });
  }
  return { citations_checked: citations, references_checked: references, violations };
}

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
  const generated_at = input.generatedAt ?? production.identity.committed_at ?? '1970-01-01T00:00:00Z';

  const { entities, relationships } = await extractNarrativeKnowledge({ audit, stats, production, remodeling });
  const audit_findings = await runNarrativeAudit({ production, remodeling, audit, stats, qaProduction, qaRemodeling, entities, relationships });
  const opportunities = await discoverCreativeOpportunities({ production, remodeling, stats, entities, relationships });
  const refactoring_plans = await buildRefactoringPlans({ graph, entities, audit, stats, production, remodeling });
  const scenarios = await buildRemodelingScenarios({ audit, stats, qaProduction, qaRemodeling, graph, entities, relationships, production, remodeling });
  const seed_proposals = buildSeedProposals({ scenarios, opportunities, refactoringPlans: refactoring_plans, auditFindings: audit_findings, production, remodeling });

  const tally = <T,>(items: readonly T[], key: (t: T) => string): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const it of items) out[key(it)] = (out[key(it)] ?? 0) + 1;
    return out;
  };
  const integrity = await verifyCreativeEvidence({ entities, relationships, audit_findings, opportunities, refactoring_plans, scenarios, seed_proposals }, { production, remodeling, graph, stats });
  if (integrity.violations.length) {
    const byCode = Object.entries(tally(integrity.violations, (v) => v.code)).map(([k, n]) => `${k}×${n}`).join(', ');
    throw new Error(`Creative evidence integrity gate failed with ${integrity.violations.length} violation(s) [${byCode}]: ${integrity.violations.slice(0, 8).map((v) => `${v.code} at ${v.where} (${v.detail})`).join('; ')}`);
  }

  const ai_adapter = getAiAdapterStatus();
  const summary: CreativeArtifact['summary'] = {
    entities_total: entities.length,
    entities_by_kind: tally(entities, (e) => e.kind),
    relationships_total: relationships.length,
    relationships_by_type: tally(relationships, (r) => r.type),
    relationships_by_verification: tally(relationships, (r) => r.verification),
    audit_findings_total: audit_findings.length,
    audit_by_classification: tally(audit_findings, (f) => f.classification),
    opportunities_total: opportunities.length,
    refactoring_plans_total: refactoring_plans.length,
    scenarios_total: scenarios.length,
    seed_proposals_total: seed_proposals.length,
    citations_verified: integrity.citations_checked,
    references_verified: integrity.references_checked,
  };
  const core = {
    schema_version: 'reltroner-statistics-creative.v1' as const,
    rules_version: CREATIVE_RULES_VERSION,
    sources: { production_commit_sha: production.identity.commit_sha, remodeling_commit_sha: remodeling.identity.commit_sha },
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
  return { ...core, generated_at, semantic_digest: sha256Hex(canonicalJson(core)) };
}
