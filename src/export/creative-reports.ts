/**
 * Creative Intelligence & Statistical Report Adapters for the Unified Report Center.
 *
 * Converts Creative Intelligence records (narrative consistency findings, story refactoring plans,
 * canon remodeling scenarios, narrative impact simulations, creative opportunities, creative proposals,
 * and statistical summaries) into normalized `Finding` records so all 8 export formats
 * (JSON, CSV, XLSX, TXT, Markdown, HTML, PDF, XML) render from a single canonical model.
 *
 * Enforces explicit `UNRATIFIED` labeling on all proposals, scenarios, and refactoring plans.
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
import type { Finding } from '../domain/finding.ts';
import type { KnowledgeGraph } from '../domain/graph.ts';
import type { StatisticsDataset } from '../domain/observation.ts';

function hex12(input: string): string {
  // Deterministic 12-char uppercase hex hash (FNV-1a 64-bit + mixing, isomorphic in browser & Node)
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const a = (h1 >>> 0).toString(16).padStart(8, '0');
  const b = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${a}${b}`.slice(0, 12).toUpperCase();
}

export function narrativeAuditFindingToReportFinding(
  f: NarrativeAuditFinding,
  prodSha: string,
  remodSha: string,
): Finding {
  const primaryPassage = f.passages[0];
  const secondaryPassage = f.passages[1] ?? f.passages[0];
  const path = primaryPassage?.path ?? 'content/factions/reltronland-vs-depcutland.md';
  return {
    id: f.id,
    level: 'SECTION',
    classification: 'SEMANTIC_REVIEW_CANDIDATE',
    change_type: 'SECTION_CHANGED',
    review_status: f.is_defect ? 'DETERMINISTIC_CONTRADICTION' : 'REVIEW_CANDIDATE',
    priority: f.severity === 'HIGH' ? 'P1' : f.severity === 'MEDIUM' ? 'P2' : 'P3',
    title: `[Narrative Audit · ${f.classification}] ${f.title}`,
    file_path: path,
    file_kind: path.endsWith('.json') ? 'json' : 'markdown',
    locator: primaryPassage?.locator ?? f.category,
    entity: { kind: 'document', name: f.affected_entities[0] ?? 'narrative' },
    field: f.category,
    unit: null,
    unit_source: null,
    production: {
      present: true,
      value: primaryPassage?.quote ?? f.conflict_hypothesis,
      value_type: 'string',
    },
    remodeling: {
      present: true,
      value: `${f.classification}: ${f.conflict_hypothesis} | Context: ${f.storytelling_context}`,
      value_type: 'string',
    },
    numeric_delta: null,
    production_canon_status: f.is_defect ? 'CONTRADICTION_DETECTED' : `UNRATIFIED_${f.classification}`,
    content_nature: 'CONTENT',
    diff: {
      added_lines: 1,
      removed_lines: 0,
      excerpt: [
        `Classification: ${f.classification} (is_defect=${String(f.is_defect)})`,
        `Hypothesis: ${f.conflict_hypothesis}`,
        `Storytelling context: ${f.storytelling_context}`,
      ],
      truncated: false,
    },
    recommendation: `[UNRATIFIED AUDIT EVALUATION — ${f.classification}] ${f.review_guidance}`,
    rule: `NARRATIVE-AUDIT-${f.category}`,
    provenance: {
      production: {
        repository: 'Reltroner/reltroner-studio',
        commit_sha: primaryPassage?.commit_sha ?? prodSha,
        path,
        blob_sha: primaryPassage?.blob_sha ?? null,
        line: primaryPassage?.line ?? null,
      },
      remodeling: {
        repository: 'Reltroner/reltroner-studio-remodeling',
        commit_sha: secondaryPassage?.commit_sha ?? remodSha,
        path: secondaryPassage?.path ?? path,
        blob_sha: secondaryPassage?.blob_sha ?? null,
        line: secondaryPassage?.line ?? null,
      },
    },
  };
}

export function refactoringPlanToReportFinding(
  plan: StoryRefactoringPlan,
  prodSha: string,
  remodSha: string,
): Finding {
  const firstDoc = plan.affected_documents[0];
  const path = firstDoc?.path ?? 'content/series/the-abyss-of-comfort.md';
  return {
    id: plan.id,
    level: 'FILE',
    classification: 'SEMANTIC_REVIEW_CANDIDATE',
    change_type: 'CONTENT_CHANGED',
    review_status: 'PROPOSAL',
    priority: 'P2',
    title: `[Story Refactoring Plan · UNRATIFIED ${plan.canon_status}] ${plan.title}`,
    file_path: path,
    file_kind: 'markdown',
    locator: plan.operation,
    entity: { kind: 'document', name: plan.affected_entities[0] ?? path },
    field: plan.operation,
    unit: null,
    unit_source: null,
    production: {
      present: true,
      value: plan.current_structure.summary,
      value_type: 'string',
    },
    remodeling: {
      present: true,
      value: `[UNRATIFIED ${plan.canon_status}] ${plan.proposed_structure.summary}`,
      value_type: 'string',
    },
    numeric_delta: null,
    production_canon_status: `UNRATIFIED_${plan.canon_status}`,
    content_nature: 'CONTENT',
    diff: {
      added_lines: plan.proposed_structure.units.length,
      removed_lines: plan.current_structure.units.length,
      excerpt: [
        `Operation: ${plan.operation} | Status: ${plan.decision_status} (UNRATIFIED — ${plan.canon_status})`,
        `Benefits: ${plan.expected_benefits.join('; ')}`,
        `Canon Risks: ${plan.canon_risks.join('; ')}`,
        `Dependency Impact: ${plan.dependency_impact.summary}`,
      ],
      truncated: false,
    },
    recommendation: `[UNRATIFIED STORY REFACTORING PROPOSAL — NOT PRODUCTION CANON] ${plan.rationale}`,
    rule: `REFACTOR-${plan.operation}`,
    provenance: {
      production: {
        repository: 'Reltroner/reltroner-studio',
        commit_sha: firstDoc?.commit_sha ?? prodSha,
        path,
        blob_sha: firstDoc?.blob_sha ?? null,
        line: 1,
      },
      remodeling: {
        repository: 'Reltroner/reltroner-studio-remodeling',
        commit_sha: remodSha,
        path,
        blob_sha: firstDoc?.blob_sha ?? null,
        line: 1,
      },
    },
  };
}

export function scenarioToReportFinding(
  scn: RemodelingScenario,
  prodSha: string,
  remodSha: string,
): Finding {
  const firstAnchor = scn.production_baseline.anchors[0];
  const path = firstAnchor?.path ?? 'content/factions/reltronland-vs-depcutland.md';
  return {
    id: scn.id,
    level: 'SECTION',
    classification: 'SEMANTIC_REVIEW_CANDIDATE',
    change_type: 'CONTENT_CHANGED',
    review_status: 'PROPOSAL',
    priority: 'P1',
    title: `[Scenario Comparison · UNRATIFIED ${scn.canon_status}] ${scn.title}`,
    file_path: path,
    file_kind: path.endsWith('.json') ? 'json' : 'markdown',
    locator: 'scenario-comparison',
    entity: { kind: 'document', name: scn.focus_entities[0] ?? 'scenario' },
    field: 'scenario_exploration',
    unit: null,
    unit_source: null,
    production: {
      present: true,
      value: scn.production_baseline.summary,
      value_type: 'string',
    },
    remodeling: {
      present: true,
      value: `[UNRATIFIED ${scn.canon_status}] ${scn.remodeling_candidate.summary} | Alternatives: ${scn.alternatives.map((a) => a.title).join(' / ')}`,
      value_type: 'string',
    },
    numeric_delta: null,
    production_canon_status: `UNRATIFIED_${scn.canon_status}`,
    content_nature: 'CONTENT',
    diff: {
      added_lines: scn.alternatives.length,
      removed_lines: 0,
      excerpt: [
        `Question: ${scn.question}`,
        `Guardrails: ${scn.potential_contradictions.join(' | ')}`,
        `Assumptions: ${scn.speculative_assumptions.join(' | ')}`,
      ],
      truncated: false,
    },
    recommendation: `[UNRATIFIED SCENARIO EXPLORATION — ${scn.canon_status}] ${scn.review_notes}`,
    rule: 'CREATIVE-SCENARIO-COMPARISON',
    provenance: {
      production: {
        repository: 'Reltroner/reltroner-studio',
        commit_sha: firstAnchor?.commit_sha ?? prodSha,
        path,
        blob_sha: firstAnchor?.blob_sha ?? null,
        line: firstAnchor?.line ?? 1,
      },
      remodeling: {
        repository: 'Reltroner/reltroner-studio-remodeling',
        commit_sha: remodSha,
        path,
        blob_sha: firstAnchor?.blob_sha ?? null,
        line: 1,
      },
    },
  };
}

export function opportunityToReportFinding(
  opp: CreativeOpportunity,
  prodSha: string,
  remodSha: string,
): Finding {
  const firstAnchor = opp.canon_anchors[0];
  const path = firstAnchor?.path ?? 'content/factions/reltronland-vs-depcutland.md';
  return {
    id: opp.id,
    level: 'SECTION',
    classification: 'SEMANTIC_REVIEW_CANDIDATE',
    change_type: 'CONTENT_CHANGED',
    review_status: 'PROPOSAL',
    priority: opp.priority_score.composite >= 0.88 ? 'P1' : 'P2',
    title: `[Creative Opportunity · UNRATIFIED ${opp.creative_status}] ${opp.title}`,
    file_path: path,
    file_kind: path.endsWith('.json') ? 'json' : 'markdown',
    locator: opp.category,
    entity: { kind: 'document', name: opp.affected_entities[0] ?? 'opportunity' },
    field: opp.category,
    unit: 'priority_score',
    unit_source: null,
    production: {
      present: true,
      value: opp.established_facts.join(' '),
      value_type: 'string',
    },
    remodeling: {
      present: true,
      value: `[UNRATIFIED ${opp.creative_status} · Score ${opp.priority_score.composite.toFixed(2)}] ${opp.narrative_question}`,
      value_type: 'string',
    },
    numeric_delta: null,
    production_canon_status: `UNRATIFIED_${opp.creative_status}`,
    content_nature: 'CONTENT',
    diff: {
      added_lines: opp.possible_alternatives.length,
      removed_lines: 0,
      excerpt: [
        `Inspired by: ${opp.inspired_by}`,
        `Potential conflict: ${opp.potential_conflict}`,
        `Consistency risks: ${opp.consistency_risks.join('; ')}`,
      ],
      truncated: false,
    },
    recommendation: `[UNRATIFIED CREATIVE OPPORTUNITY — ${opp.creative_status}] Steps: ${opp.development_steps.join(' -> ')}`,
    rule: `OPPORTUNITY-${opp.category}`,
    provenance: {
      production: {
        repository: 'Reltroner/reltroner-studio',
        commit_sha: firstAnchor?.commit_sha ?? prodSha,
        path,
        blob_sha: firstAnchor?.blob_sha ?? null,
        line: firstAnchor?.line ?? 1,
      },
      remodeling: {
        repository: 'Reltroner/reltroner-studio-remodeling',
        commit_sha: remodSha,
        path,
        blob_sha: firstAnchor?.blob_sha ?? null,
        line: 1,
      },
    },
  };
}

export function proposalToFinding(proposal: CreativeProposal): Finding {
  const firstRef = proposal.source_references[0];
  const path = firstRef?.path ?? 'content/factions/reltronland-vs-depcutland.md';
  return {
    id: proposal.proposal_id,
    level: 'SECTION',
    classification: 'SEMANTIC_REVIEW_CANDIDATE',
    change_type: 'CONTENT_CHANGED',
    review_status: 'PROPOSAL',
    priority: 'P1',
    title: `[Creative Proposal · UNRATIFIED ${proposal.canon_status} / ${proposal.review_status}] ${proposal.title}`,
    file_path: path,
    file_kind: path.endsWith('.json') ? 'json' : 'markdown',
    locator: proposal.proposal_type,
    entity: { kind: 'document', name: proposal.originating_entities[0] ?? 'proposal' },
    field: proposal.proposal_type,
    unit: null,
    unit_source: null,
    production: {
      present: true,
      value: proposal.historical_context,
      value_type: 'string',
    },
    remodeling: {
      present: true,
      value: `[UNRATIFIED ${proposal.canon_status} · ${proposal.review_status}] ${proposal.narrative_hypothesis}`,
      value_type: 'string',
    },
    numeric_delta: null,
    production_canon_status: `UNRATIFIED_${proposal.canon_status}_${proposal.review_status}`,
    content_nature: 'CONTENT',
    diff: {
      added_lines: proposal.alternatives.length,
      removed_lines: 0,
      excerpt: [
        `Intent: ${proposal.intent}`,
        `Constraints: ${proposal.existing_constraints.join(' | ')}`,
        `Assumptions: ${proposal.assumptions.join(' | ')}`,
        `Digest: ${proposal.content_digest}`,
      ],
      truncated: false,
    },
    recommendation: `[UNRATIFIED CREATIVE PROPOSAL — VISIBILITY: ${proposal.visibility}] ${proposal.creator_notes}`,
    rule: `PROPOSAL-${proposal.proposal_type}`,
    provenance: {
      production: {
        repository: 'Reltroner/reltroner-studio',
        commit_sha: proposal.production_source_sha,
        path,
        blob_sha: firstRef?.blob_sha ?? null,
        line: firstRef?.line ?? 1,
      },
      remodeling: {
        repository: 'Reltroner/reltroner-studio-remodeling',
        commit_sha: proposal.remodeling_source_sha,
        path,
        blob_sha: firstRef?.blob_sha ?? null,
        line: 1,
      },
    },
  };
}

export function buildCreativeReportFindings(input: {
  creative: CreativeArtifact;
  stats?: StatisticsDataset;
  graph?: KnowledgeGraph;
}): Finding[] {
  const { creative, stats, graph } = input;
  const prodSha = creative.sources.production_commit_sha;
  const remodSha = creative.sources.remodeling_commit_sha;
  const out: Finding[] = [];

  // 1. Statistical Summary Report (STA-...)
  const staId = `STA-${hex12(`statistical-summary|${prodSha}`)}`;
  out.push({
    id: staId,
    level: 'FILE',
    classification: 'SEMANTIC_REVIEW_CANDIDATE',
    change_type: 'VALUE_CHANGED',
    review_status: 'PROPOSAL',
    priority: 'P1',
    title: '[Statistical Summary] Planet Asthortera NCCM V6.5 Production Baseline vs. Remodeling Proposals',
    file_path: 'data/asthortera/nccm-v6-active-cross-domain.json',
    file_kind: 'json',
    locator: 'planet',
    entity: { kind: 'record', name: 'Planet Asthortera' },
    field: 'planetary_summary',
    unit: 'composite',
    unit_source: null,
    production: {
      present: true,
      value: `14 profiled countries, 5 development cohort, 18 residual states; ${stats?.observations.length ?? 467} production observations; Beluftner land_area=88k sq km`,
      value_type: 'string',
    },
    remodeling: {
      present: true,
      value: `${stats?.proposals.length ?? 376} remodeling proposals (UNRATIFIED); Beluftner land_area=363k sq km (+275k sq km); Kalgered 37-country expansion candidate`,
      value_type: 'string',
    },
    numeric_delta: { absolute: 275, relative: 3.125 },
    production_canon_status: 'CANON_OBSERVED',
    content_nature: 'CONTENT',
    diff: null,
    recommendation: 'Production NCCM V6.5 remains authoritative; remodeling statistical candidates are UNRATIFIED proposals.',
    rule: 'STATISTICAL-OBSERVATORY-SUMMARY',
    provenance: {
      production: {
        repository: 'Reltroner/reltroner-studio',
        commit_sha: prodSha,
        path: 'data/asthortera/nccm-v6-active-cross-domain.json',
        blob_sha: stats?.production?.blob_sha ?? null,
        line: 1,
      },
      remodeling: {
        repository: 'Reltroner/reltroner-studio-remodeling',
        commit_sha: remodSha,
        path: 'data/asthortera/nccm-v6-active-cross-domain.json',
        blob_sha: stats?.remodeling?.blob_sha ?? null,
        line: 1,
      },
    },
  });

  // 2. Narrative Consistency Audit Reports (NAF-...)
  for (const f of creative.audit_findings) {
    out.push(narrativeAuditFindingToReportFinding(f, prodSha, remodSha));
  }

  // 3. Story Restructuring Plans (REF-...)
  for (const plan of creative.refactoring_plans) {
    out.push(refactoringPlanToReportFinding(plan, prodSha, remodSha));
  }

  // 4. Scenario Comparison Reports (SCN-...)
  for (const scn of creative.scenarios) {
    out.push(scenarioToReportFinding(scn, prodSha, remodSha));
  }

  // 5. Narrative Impact Reports (IMP-...)
  if (graph) {
    for (const targetId of ['nar:nation:reltronland', 'nar:nation:depcutland', 'nar:faction:henchoway']) {
      if (!creative.entities.some((e) => e.id === targetId)) continue;
      const sim = simulateNarrativeImpact(graph, creative.entities, creative.relationships, targetId);
      const impId = `IMP-${hex12(`impact|${targetId}`)}`;
      out.push({
        id: impId,
        level: 'SECTION',
        classification: 'SEMANTIC_REVIEW_CANDIDATE',
        change_type: 'CONTENT_CHANGED',
        review_status: 'PROPOSAL',
        priority: 'P2',
        title: `[Narrative Impact Report · UNRATIFIED SIMULATION] Downstream Dependency & Consequence Analysis for ${sim.origin_label}`,
        file_path: 'content/factions/reltronland-vs-depcutland.md',
        file_kind: 'markdown',
        locator: targetId,
        entity: { kind: 'document', name: sim.origin_label },
        field: 'narrative_impact_simulation',
        unit: null,
        unit_source: null,
        production: {
          present: true,
          value: `Verified direct dependencies: ${sim.verified_direct.length} (${sim.verified_direct.slice(0, 5).map((d) => d.label).join(', ')}); Verified transitive dependencies: ${sim.verified_transitive.length}`,
          value_type: 'string',
        },
        remodeling: {
          present: true,
          value: `[UNRATIFIED IMPACT SIMULATION] Candidate narrative links: ${sim.candidate_narrative.length}; Speculative brainstorming dimensions: ${sim.speculative_brainstorming.length} (INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL)`,
          value_type: 'string',
        },
        numeric_delta: null,
        production_canon_status: 'UNRATIFIED_SCENARIO',
        content_nature: 'CONTENT',
        diff: {
          added_lines: sim.verified_direct.length + sim.candidate_narrative.length,
          removed_lines: 0,
          excerpt: [
            `Verified Direct (${sim.verified_direct.length}): ${sim.verified_direct.slice(0, 4).map((d) => `${d.label} [${d.edge_type}]`).join('; ')}`,
            `Candidate Narrative (${sim.candidate_narrative.length}): ${sim.candidate_narrative.slice(0, 4).map((c) => `${c.label} [${c.edge_type}]`).join('; ')}`,
            `Speculative: ${sim.speculative_brainstorming[0]?.hypothesis ?? 'None'} (INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL)`,
          ],
          truncated: false,
        },
        recommendation: '[UNRATIFIED IMPACT SIMULATION] Separates verified graph dependencies from candidate co-occurrence/thematic links and non-quantitative speculative hypotheses.',
        rule: 'NARRATIVE-IMPACT-TRAVERSAL',
        provenance: {
          production: {
            repository: 'Reltroner/reltroner-studio',
            commit_sha: prodSha,
            path: 'content/factions/reltronland-vs-depcutland.md',
            blob_sha: null,
            line: 1,
          },
          remodeling: {
            repository: 'Reltroner/reltroner-studio-remodeling',
            commit_sha: remodSha,
            path: 'content/factions/reltronland-vs-depcutland.md',
            blob_sha: null,
            line: 1,
          },
        },
      });
    }
  }

  // 6. Creative Opportunity Summaries (OPP-...)
  for (const opp of creative.opportunities) {
    out.push(opportunityToReportFinding(opp, prodSha, remodSha));
  }

  // 7. Creative Seed Proposals (PRP-...)
  for (const prp of creative.seed_proposals) {
    if (prp.visibility === 'PUBLIC_OBSERVATORY_FIXTURE') {
      out.push(proposalToFinding(prp));
    }
  }

  return out;
}
