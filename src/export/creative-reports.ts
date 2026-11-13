/**
 * Report adapters for Creative Intelligence records. Each record becomes a normalized `Finding`
 * so the eight export formats render it from the one canonical report model.
 *
 * Provenance is never filled in: the production column cites the first production-side passage
 * of the record, the remodeling column cites a remodeling-side passage only when the record has
 * one, and a column without a passage is rendered as "not present". Every proposal, scenario and
 * plan carries an explicit UNRATIFIED marker.
 */

import {
  simulateNarrativeImpact,
  type CreativeArtifact,
  type CreativeOpportunity,
  type CreativeProposal,
  type NarrativeAuditFinding,
  type RemodelingScenario,
  type StoryRefactoringPlan,
} from '../domain/creative.ts';
import type { Finding, SideProvenance } from '../domain/finding.ts';
import type { KnowledgeGraph } from '../domain/graph.ts';
import type { StatisticsDataset } from '../domain/observation.ts';
import { stableHex12 } from '../engine/decision-intelligence/evaluate.ts';

const PRODUCTION_REPO = 'Reltroner/reltroner-studio';
const REMODELING_REPO = 'Reltroner/reltroner-studio-remodeling';
const NO_SOURCE = '(no single source document)';

interface Cite { commit_sha: string; path: string; blob_sha: string | null; line: number | null }
const prov = (repository: string, c: Cite | null | undefined): SideProvenance | null => (c ? { repository, commit_sha: c.commit_sha, path: c.path, blob_sha: c.blob_sha, line: c.line } : null);
const text = (value: string) => ({ present: true, value, value_type: 'string' as const });
const kindOf = (path: string): Finding['file_kind'] => (path.endsWith('.json') ? 'json' : 'markdown');

function base(id: string, title: string, production: Cite | null, remodeling: Cite | null): Pick<Finding, 'id' | 'title' | 'file_path' | 'file_kind' | 'unit' | 'unit_source' | 'numeric_delta' | 'content_nature' | 'classification' | 'provenance'> {
  const path = production?.path ?? remodeling?.path ?? NO_SOURCE;
  return {
    id, title, file_path: path, file_kind: kindOf(path), unit: null, unit_source: null, numeric_delta: null, content_nature: 'CONTENT', classification: 'SEMANTIC_REVIEW_CANDIDATE',
    provenance: { production: prov(PRODUCTION_REPO, production), remodeling: prov(REMODELING_REPO, remodeling) },
  };
}

export function narrativeAuditFindingToReportFinding(f: NarrativeAuditFinding): Finding {
  const production = f.passages.find((p) => p.side === 'production') ?? null;
  const remodeling = f.passages.find((p) => p.side === 'remodeling') ?? null;
  const primary = production ?? remodeling;
  return {
    ...base(f.id, `[Narrative Audit · ${f.classification}] ${f.title}`, production, remodeling),
    level: 'SECTION', change_type: 'SECTION_CHANGED', review_status: f.is_defect ? 'DETERMINISTIC_CONTRADICTION' : 'REVIEW_CANDIDATE',
    priority: f.severity === 'HIGH' ? 'P1' : f.severity === 'MEDIUM' ? 'P2' : 'P3',
    locator: primary?.locator ?? f.category, entity: { kind: 'document', name: f.affected_entities[0] ?? 'narrative' }, field: f.category,
    production: production ? text(production.quote) : { present: false },
    remodeling: remodeling ? text(remodeling.quote) : { present: false },
    production_canon_status: f.is_defect ? 'CONTRADICTION_DETECTED' : `UNRATIFIED_${f.classification}`,
    diff: { added_lines: 0, removed_lines: 0, truncated: false, excerpt: [`Classification: ${f.classification} (is_defect=${String(f.is_defect)})`, `Hypothesis: ${f.conflict_hypothesis}`, `Storytelling context: ${f.storytelling_context}`] },
    recommendation: `[UNRATIFIED AUDIT EVALUATION — ${f.classification}] ${f.review_guidance}`, rule: `NARRATIVE-AUDIT-${f.category}`,
  };
}

export function refactoringPlanToReportFinding(plan: StoryRefactoringPlan): Finding {
  const cite = (side: 'production' | 'remodeling'): Cite | null => {
    const d = plan.affected_documents.find((x) => x.side === side);
    return d ? { commit_sha: d.commit_sha, path: d.path, blob_sha: d.blob_sha, line: null } : null;
  };
  return {
    ...base(plan.id, `[Story Refactoring Plan · UNRATIFIED ${plan.canon_status}] ${plan.title}`, cite('production'), cite('remodeling')),
    level: 'FILE', change_type: 'CONTENT_CHANGED', review_status: 'PROPOSAL', priority: 'P2', locator: plan.operation,
    entity: { kind: 'document', name: plan.affected_entities[0] ?? plan.affected_documents[0]?.path ?? 'document' }, field: plan.operation,
    production: text(plan.current_structure.summary), remodeling: text(`[UNRATIFIED ${plan.canon_status}] ${plan.proposed_structure.summary}`),
    production_canon_status: `UNRATIFIED_${plan.canon_status}`,
    diff: { added_lines: plan.proposed_structure.units.length, removed_lines: plan.current_structure.units.length, truncated: false,
      excerpt: [`Operation: ${plan.operation} | Status: ${plan.decision_status} (UNRATIFIED — ${plan.canon_status})`, `Benefits: ${plan.expected_benefits.join('; ')}`, `Canon risks: ${plan.canon_risks.join('; ')}`, `Dependency impact: ${plan.dependency_impact.summary}`] },
    recommendation: `[UNRATIFIED STORY REFACTORING PROPOSAL — NOT PRODUCTION CANON] ${plan.rationale}`, rule: `REFACTOR-${plan.operation}`,
  };
}

export function scenarioToReportFinding(scn: RemodelingScenario): Finding {
  const first = scn.production_baseline.anchors[0] ?? null;
  return {
    ...base(scn.id, `[Scenario Comparison · UNRATIFIED ${scn.canon_status}] ${scn.title}`, first, null),
    level: 'SECTION', change_type: 'CONTENT_CHANGED', review_status: 'PROPOSAL', priority: 'P1', locator: 'scenario-comparison',
    entity: { kind: 'document', name: scn.focus_entities[0] ?? 'scenario' }, field: 'scenario_exploration',
    production: text(scn.production_baseline.summary),
    remodeling: text(`[UNRATIFIED ${scn.canon_status}] ${scn.remodeling_candidate.summary}${scn.alternatives.length ? ` | Alternatives: ${scn.alternatives.map((a) => a.title).join(' / ')}` : ''}`),
    production_canon_status: `UNRATIFIED_${scn.canon_status}`,
    diff: { added_lines: scn.alternatives.length, removed_lines: 0, truncated: false,
      excerpt: [`Question: ${scn.question}`, ...scn.production_baseline.anchors.map((a) => `Anchor: ${a.value} (${a.path}${a.line ? `:${a.line}` : ''})`), `Constraints: ${scn.potential_contradictions.join(' | ')}`, `Assumptions: ${scn.speculative_assumptions.join(' | ')}`] },
    recommendation: `[UNRATIFIED SCENARIO EXPLORATION — ${scn.canon_status}] ${scn.review_notes}`, rule: 'CREATIVE-SCENARIO-COMPARISON',
  };
}

export function opportunityToReportFinding(opp: CreativeOpportunity, productionSha: string): Finding {
  const first = opp.canon_anchors.find((a) => a.commit_sha === productionSha) ?? null;
  const draft = opp.canon_anchors.find((a) => a.commit_sha !== productionSha) ?? null;
  return {
    ...base(opp.id, `[Creative Opportunity · UNRATIFIED ${opp.creative_status}] ${opp.title}`, first, draft),
    level: 'SECTION', change_type: 'CONTENT_CHANGED', review_status: 'PROPOSAL', priority: 'P2', locator: opp.category,
    entity: { kind: 'document', name: opp.affected_entities[0] ?? 'opportunity' }, field: opp.category,
    production: text(opp.established_facts.join(' ')),
    remodeling: text(`[UNRATIFIED ${opp.creative_status} · ordering score ${opp.priority_score.composite.toFixed(2)}] ${opp.narrative_question}`),
    production_canon_status: `UNRATIFIED_${opp.creative_status}`,
    diff: { added_lines: opp.possible_alternatives.length, removed_lines: 0, truncated: false,
      excerpt: [`Inspired by: ${opp.inspired_by}`, `Potential conflict: ${opp.potential_conflict}`, `Consistency risks: ${opp.consistency_risks.join('; ')}`, `Score: ${opp.priority_score.explanation}`] },
    recommendation: `[UNRATIFIED CREATIVE OPPORTUNITY — ${opp.creative_status}] Steps: ${opp.development_steps.join(' -> ')}`, rule: `OPPORTUNITY-${opp.category}`,
  };
}

export function proposalToFinding(proposal: CreativeProposal): Finding {
  const cite = (side: 'production' | 'remodeling') => proposal.source_references.find((r) => r.side === side) ?? null;
  return {
    ...base(proposal.proposal_id, `[Creative Proposal · UNRATIFIED ${proposal.canon_status} / ${proposal.review_status}] ${proposal.title}`, cite('production'), cite('remodeling')),
    level: 'SECTION', change_type: 'CONTENT_CHANGED', review_status: 'PROPOSAL', priority: 'P1', locator: proposal.proposal_type,
    entity: { kind: 'document', name: proposal.originating_entities[0] ?? 'proposal' }, field: proposal.proposal_type,
    production: text(proposal.historical_context),
    remodeling: text(`[UNRATIFIED ${proposal.canon_status} · ${proposal.review_status}] ${proposal.narrative_hypothesis}`),
    production_canon_status: `UNRATIFIED_${proposal.canon_status}_${proposal.review_status}`,
    diff: { added_lines: proposal.alternatives.length, removed_lines: 0, truncated: false,
      excerpt: [`Intent: ${proposal.intent}`, `Constraints: ${proposal.existing_constraints.join(' | ')}`, `Assumptions: ${proposal.assumptions.join(' | ')}`, `Digest: ${proposal.content_digest}`] },
    recommendation: `[UNRATIFIED CREATIVE PROPOSAL — VISIBILITY: ${proposal.visibility}] ${proposal.creator_notes}`, rule: `PROPOSAL-${proposal.proposal_type}`,
  };
}

export function buildCreativeReportFindings(input: { creative: CreativeArtifact; stats?: StatisticsDataset; graph?: KnowledgeGraph }): Finding[] {
  const { creative, stats, graph } = input;
  const prodSha = creative.sources.production_commit_sha;
  const remodSha = creative.sources.remodeling_commit_sha;
  const out: Finding[] = [];

  // Statistical summary: counts read from the observations dataset; nothing is restated from memory.
  if (stats?.production) {
    const count = (cohort: string) => stats.entities.filter((e) => e.cohort === cohort).length;
    const aggregate = stats.entities.find((e) => e.kind === 'aggregate_residual');
    out.push({
      ...base(`STA-${stableHex12(`statistical-summary|${prodSha}`)}`, `[Statistical Summary] ${stats.model_version ?? 'Dataset'}: production observations and remodeling proposals`,
        { commit_sha: prodSha, path: stats.dataset_path, blob_sha: stats.production.blob_sha, line: null },
        stats.remodeling ? { commit_sha: remodSha, path: stats.dataset_path, blob_sha: stats.remodeling.blob_sha, line: null } : null),
      level: 'FILE', change_type: 'VALUE_CHANGED', review_status: 'PROPOSAL', priority: 'P2', locator: 'dataset', entity: { kind: 'record', name: stats.dataset_path }, field: 'dataset_summary',
      production: text(`${count('PROFILED_14')} profiled nations, ${count('DEVELOPMENT_5')} development-cohort nations${aggregate ? `, ${aggregate.represents_states} states in one combined aggregate` : ''}; ${stats.observations.length} production observations.`),
      remodeling: text(`${stats.proposals.length} remodeling proposal values (UNRATIFIED).`),
      production_canon_status: 'CANON_OBSERVED', diff: null,
      recommendation: 'Production values are authoritative. Remodeling values are unratified proposals.', rule: 'STATISTICAL-OBSERVATORY-SUMMARY',
    });
  }
  for (const f of creative.audit_findings) out.push(narrativeAuditFindingToReportFinding(f));
  for (const plan of creative.refactoring_plans) out.push(refactoringPlanToReportFinding(plan));
  for (const scn of creative.scenarios) out.push(scenarioToReportFinding(scn));

  // Narrative impact reports for the entities of the cooperation case study.
  if (graph) {
    for (const targetId of ['nar:nation:reltronland', 'nar:nation:depcutland', 'nar:faction:henchoway']) {
      const entity = creative.entities.find((e) => e.id === targetId);
      if (!entity) continue;
      const sim = simulateNarrativeImpact(graph, creative.entities, creative.relationships, targetId);
      const cite: Cite = { commit_sha: entity.commit_sha, path: entity.source_path, blob_sha: entity.blob_sha, line: entity.evidence_line };
      out.push({
        ...base(`IMP-${stableHex12(`impact|${targetId}`)}`, `[Narrative Impact Report · UNRATIFIED SIMULATION] Dependents of ${sim.origin_label}`, entity.source_side === 'remodeling' ? null : cite, entity.source_side === 'remodeling' ? cite : null),
        level: 'SECTION', change_type: 'CONTENT_CHANGED', review_status: 'PROPOSAL', priority: 'P2', locator: targetId, entity: { kind: 'document', name: sim.origin_label }, field: 'narrative_impact_simulation',
        production: text(`Verified direct dependents: ${sim.verified_direct.length}${sim.verified_direct.length ? ` (${sim.verified_direct.slice(0, 5).map((d) => d.label).join(', ')})` : ''}; verified transitive dependents: ${sim.verified_transitive.length}.`),
        remodeling: text(`[UNRATIFIED IMPACT SIMULATION] Candidate links: ${sim.candidate_narrative.length}; speculative dimensions: ${sim.speculative_brainstorming.length} (no quantitative model).`),
        production_canon_status: 'UNRATIFIED_SCENARIO',
        diff: { added_lines: sim.verified_direct.length + sim.candidate_narrative.length, removed_lines: 0, truncated: false, excerpt: [
          `Verified direct (${sim.verified_direct.length}): ${sim.verified_direct.slice(0, 4).map((d) => `${d.label} [${d.edge_type}]`).join('; ')}`,
          `Candidate (${sim.candidate_narrative.length}): ${sim.candidate_narrative.slice(0, 4).map((c) => `${c.label} [${c.edge_type}]`).join('; ')}`,
          `Speculative: ${sim.speculative_brainstorming[0]?.hypothesis ?? 'None'}`,
        ] },
        recommendation: '[UNRATIFIED IMPACT SIMULATION] Verified dependents follow declared or verified graph edges only. Candidate links are co-occurrences and are never dependencies.', rule: 'NARRATIVE-IMPACT-TRAVERSAL',
      });
    }
  }
  for (const opp of creative.opportunities) out.push(opportunityToReportFinding(opp, prodSha));
  // Private local-session proposals never enter a public report bundle.
  for (const prp of creative.seed_proposals) if (prp.visibility === 'PUBLIC_OBSERVATORY_FIXTURE') out.push(proposalToFinding(prp));
  return out;
}
