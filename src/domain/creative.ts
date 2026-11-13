/**
 * Creative Intelligence & Narrative Systems domain contracts.
 * Pure domain module: isomorphic across Node build pipeline, browser islands, and JSON Schema.
 *
 * Enforces strict separation between:
 *  - Verified deployed production canon
 *  - Production main candidate
 *  - Remodeling proposals
 *  - Mathematical derivations
 *  - ML model estimates
 *  - Creative brainstorming proposals
 *  - Creator-ratified canon
 */

import type { EpistemicStatus } from './status.ts';
import { DEPENDENCY_STATUSES, NARRATIVE_IMPACT_TYPES, traverseImpact, type EdgeType, type GraphSide, type KnowledgeGraph } from './graph.ts';
import { SHA_RE } from './source.ts';

export const NARRATIVE_ENTITY_KINDS = Object.freeze([
  'world',
  'civilization',
  'nation',
  'government',
  'organization',
  'faction',
  'character',
  'institution',
  'historical_event',
  'conflict',
  'treaty',
  'location',
  'technology',
  'law',
  'principle',
  'philosophy',
  'narrative_arc',
  'theme',
  'motivation',
  'decision',
  'constraint',
  'consequence',
  'viewpoint',
] as const);
export type NarrativeEntityKind = (typeof NARRATIVE_ENTITY_KINDS)[number];

export const EXTRACTION_CONFIDENCES = Object.freeze([
  'EXPLICIT_STRUCTURED',
  'EXPLICIT_PROSE',
  'FRONTMATTER_DECLARED',
  'CANDIDATE_INFERENCE',
] as const);
export type ExtractionConfidence = (typeof EXTRACTION_CONFIDENCES)[number];

export interface NarrativeEntity {
  id: string;
  kind: NarrativeEntityKind;
  name: string;
  summary: string;
  source_side: GraphSide;
  source_path: string;
  commit_sha: string;
  blob_sha: string;
  evidence_locator: string;
  evidence_line: number | null;
  evidence_quote: string;
  historical_bac: { start_bac: number; end_bac: number; label: string } | null;
  editorial_updated_at: string | null;
  canon_status: EpistemicStatus;
  extraction_confidence: ExtractionConfidence;
  original_terminology: string[];
  related_country_id: string | null;
  attributes: Record<string, string | number | boolean | null>;
}

export const NARRATIVE_RELATIONSHIP_TYPES = Object.freeze([
  'MENTIONS',
  'DEFINES',
  'APPEARS_IN',
  'PARTICIPATES_IN',
  'LOCATED_IN',
  'PRECEDES',
  'FOLLOWS',
  'MOTIVATED_BY',
  'CONSTRAINED_BY',
  'CONFLICTS_WITH',
  'DERIVED_FROM',
  'PROPOSES_CHANGE_TO',
  'CAUSES',
  'CAUSES_CANDIDATE',
  'THEMATICALLY_RELATED',
  'SUPERSEDES',
] as const);
export type NarrativeRelationshipType = (typeof NARRATIVE_RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_VERIFICATIONS = Object.freeze([
  'VERIFIED_SOURCE_GROUNDED',
  'DECLARED_PROVENANCE',
  'CANDIDATE_HYPOTHESIS',
] as const);
export type RelationshipVerification = (typeof RELATIONSHIP_VERIFICATIONS)[number];

export const CAUSAL_CLASSES = Object.freeze([
  'VERIFIED_CAUSAL',
  'STRUCTURAL_CONSTRAINT',
  'CHRONOLOGICAL',
  'PARTICIPATION',
  'THEMATIC_ONLY',
  'CO_OCCURRENCE_ONLY',
] as const);
export type CausalClass = (typeof CAUSAL_CLASSES)[number];

export interface NarrativeRelationship {
  id: string;
  type: NarrativeRelationshipType;
  source_id: string;
  target_id: string;
  verification: RelationshipVerification;
  causal_class: CausalClass;
  source_side: GraphSide;
  source_path: string;
  commit_sha: string;
  blob_sha: string;
  evidence_line: number | null;
  evidence_quote: string;
  rationale: string;
}

export const NARRATIVE_AUDIT_CATEGORIES = Object.freeze([
  'CHRONOLOGICAL_CONTRADICTION',
  'IMPOSSIBLE_EVENT_ORDERING',
  'ENTITY_IDENTITY_MISMATCH',
  'CONFLICTING_EXPLICIT_FACTS',
  'RELATIONSHIP_INCONSISTENCY',
  'INSTITUTIONAL_RULE_CONTRADICTION',
  'STATISTICAL_STORY_MISMATCH',
  'TECHNOLOGY_CAPABILITY_CONTRADICTION',
  'GEOGRAPHICAL_INCONSISTENCY',
  'DUPLICATE_OR_CONFLICTING_DEFINITION',
  'DRAFT_PRODUCTION_DIVERGENCE',
  'NARRATIVE_DEPENDENCY_CONFLICT',
] as const);
export type NarrativeAuditCategory = (typeof NARRATIVE_AUDIT_CATEGORIES)[number];

export const NARRATIVE_FINDING_CLASSIFICATIONS = Object.freeze([
  'VERIFIED_CONTRADICTION',
  'POTENTIAL_INCONSISTENCY',
  'INTENTIONAL_AMBIGUITY',
  'UNRELIABLE_NARRATOR_POSSIBILITY',
  'INSUFFICIENT_EVIDENCE',
  'CREATIVE_REVIEW_CANDIDATE',
] as const);
export type NarrativeFindingClassification = (typeof NARRATIVE_FINDING_CLASSIFICATIONS)[number];

export interface NarrativePassageRef {
  side: 'production' | 'remodeling';
  repository: string;
  commit_sha: string;
  path: string;
  blob_sha: string;
  line: number | null;
  locator: string;
  quote: string;
}

export interface NarrativeAuditFinding {
  id: string;
  category: NarrativeAuditCategory;
  classification: NarrativeFindingClassification;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
  title: string;
  affected_entities: string[];
  passages: NarrativePassageRef[];
  conflict_hypothesis: string;
  storytelling_context: string;
  review_guidance: string;
  is_defect: boolean;
  synthetic?: boolean;
}

export const OPPORTUNITY_CATEGORIES = Object.freeze([
  'UNDERDEVELOPED_ENTITY',
  'UNEXPLORED_HISTORICAL_CONSEQUENCE',
  'UNRESOLVED_INSTITUTIONAL_TENSION',
  'CHARACTER_MOTIVATION_CONFLICT',
  'WORLDBUILDING_RELATIONSHIP_POTENTIAL',
  'UNDERREPRESENTED_PERSPECTIVE',
  'MISSING_EVENT_CONSEQUENCE',
  'CIVILIZATION_CONTRAST',
  'UNUSED_WORLDBUILDING_CONSTRAINT',
  'INTERSECTING_NARRATIVE_THREADS',
] as const);
export type OpportunityCategory = (typeof OPPORTUNITY_CATEGORIES)[number];

export interface CreativeAlternative {
  id: string;
  label: string;
  summary: string;
  mechanism: string;
  narrative_tradeoff: string;
}

export interface CreativeOpportunity {
  id: string;
  category: OpportunityCategory;
  title: string;
  inspired_by: string;
  canon_anchors: Array<{
    path: string;
    commit_sha: string;
    blob_sha: string;
    line: number | null;
    quote: string;
    entity_id: string | null;
  }>;
  narrative_question: string;
  established_facts: string[];
  hypothetical_space: string[];
  potential_conflict: string;
  affected_entities: string[];
  possible_alternatives: CreativeAlternative[];
  assumptions: string[];
  consistency_risks: string[];
  development_steps: string[];
  priority_score: {
    structural_reach: number;
    tension_density: number;
    coverage_gap: number;
    composite: number;
    explanation: string;
  };
  creative_status: 'DISCOVERED_CANDIDATE' | 'EXPLORING' | 'PROPOSED';
}

export const REFACTOR_OPERATIONS = Object.freeze([
  'SPLIT_NARRATIVE_ARC',
  'MERGE_OVERLAPPING_STRUCTURES',
  'REORDER_EVENTS',
  'REORGANIZE_SECTIONS',
  'CONSOLIDATE_DUPLICATED_INFO',
  'RESTRUCTURE_ENTITY_RELATIONSHIPS',
  'IMPROVE_CHRONOLOGY',
  'CLARIFY_SOURCE_REFERENCES',
  'SEPARATE_CANON_FROM_SPECULATION',
] as const);
export type RefactorOperation = (typeof REFACTOR_OPERATIONS)[number];

export const PROPOSAL_REVIEW_STATUSES = Object.freeze([
  'IDEA',
  'EXPLORING',
  'PROPOSED',
  'UNDER_REVIEW',
  'NEEDS_REVISION',
  'REJECTED',
  'APPROVED_FOR_AUTHORING',
  'RATIFIED_EXTERNALLY',
] as const);
export type ProposalReviewStatus = (typeof PROPOSAL_REVIEW_STATUSES)[number];

export interface StoryRefactoringPlan {
  id: string;
  operation: RefactorOperation;
  title: string;
  current_structure: {
    summary: string;
    units: Array<{ path: string; section: string; role: string; line_count: number }>;
  };
  proposed_structure: {
    summary: string;
    units: Array<{ target: string; section: string; action: string; rationale: string }>;
  };
  rationale: string;
  affected_documents: Array<{ path: string; side: 'production' | 'remodeling'; commit_sha: string; blob_sha: string }>;
  affected_entities: string[];
  expected_benefits: string[];
  possible_narrative_losses: string[];
  canon_risks: string[];
  dependency_impact: {
    direct_nodes: string[];
    transitive_nodes: string[];
    summary: string;
  };
  decision_status: ProposalReviewStatus;
  canon_status: 'PROPOSED' | 'SCENARIO';
}

export const IMPACT_DIMENSIONS = Object.freeze([
  'HISTORICAL_INTERPRETATION',
  'DIPLOMATIC_STORYLINES',
  'INSTITUTIONAL_BEHAVIOR',
  'CHARACTER_MOTIVATIONS',
  'MILITARY_COOPERATION',
  'CIVILIAN_PERCEPTIONS',
  'EXISTING_NARRATIVE_ARCS',
  'STATISTICAL_IMPLICATIONS',
] as const);
export type ImpactDimension = (typeof IMPACT_DIMENSIONS)[number];

export const IMPACT_VERIFICATION_TIERS = Object.freeze([
  'VERIFIED_DIRECT_DEPENDENCY',
  'VERIFIED_TRANSITIVE_DEPENDENCY',
  'CANDIDATE_NARRATIVE_IMPACT',
  'SPECULATIVE_BRAINSTORMING',
] as const);
export type ImpactVerificationTier = (typeof IMPACT_VERIFICATION_TIERS)[number];

export interface ScenarioImpactEntry {
  dimension: ImpactDimension;
  verification_tier: ImpactVerificationTier;
  summary: string;
  affected_nodes: string[];
  evidence_or_constraint: string;
  quantitative_status: 'MATHEMATICALLY_ESTABLISHED' | 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL';
}

export interface RemodelingScenario {
  id: string;
  title: string;
  question: string;
  focus_entities: string[];
  production_baseline: {
    summary: string;
    anchors: Array<{
      label: string;
      value: string;
      path: string;
      commit_sha: string;
      blob_sha: string;
      line: number | null;
      status: EpistemicStatus;
    }>;
  };
  remodeling_candidate: {
    summary: string;
    changes: Array<{
      label: string;
      production_value: string;
      remodeling_value: string;
      path: string;
      finding_id: string | null;
    }>;
  };
  perspectives: Array<{
    actor_id: string;
    actor_name: string;
    stance: string;
    fear_or_constraint: string;
    source_path: string;
    evidence_line: number | null;
    evidence_quote: string;
    /** Line of the passage quoted in fear_or_constraint, and the pinned identity of the cited blob. */
    constraint_line: number | null;
    commit_sha: string;
    blob_sha: string;
  }>;
  hypothetical_parameters: Array<{
    id: string;
    label: string;
    current_state: string;
    options: Array<{ value: string; label: string; description: string }>;
  }>;
  impact_dimensions: ScenarioImpactEntry[];
  alternatives: Array<{
    id: string;
    title: string;
    premise: string;
    institutional_mechanism: string;
    narrative_payoff: string;
    contradiction_risks: string[];
  }>;
  speculative_assumptions: string[];
  potential_contradictions: string[];
  review_notes: string;
  canon_status: 'SCENARIO' | 'PROPOSED';
}

export const PROPOSAL_TYPES = Object.freeze([
  'NARRATIVE_IDEATION',
  'WORLDBUILDING_EXPLORATION',
  'STORY_REFACTORING',
  'CANON_REMODELING_SCENARIO',
  'CONSISTENCY_RESOLUTION',
] as const);
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export interface CreativeProposal {
  proposal_id: string;
  schema_version: 'reltroner-creative-proposal.v1';
  title: string;
  intent: string;
  proposal_type: ProposalType;
  visibility: 'PUBLIC_OBSERVATORY_FIXTURE' | 'PRIVATE_LOCAL_SESSION';
  originating_entities: string[];
  source_references: Array<{
    repository: string;
    side: 'production' | 'remodeling';
    commit_sha: string;
    path: string;
    blob_sha: string | null;
    line: number | null;
    quote: string;
  }>;
  production_source_sha: string;
  remodeling_source_sha: string;
  historical_context: string;
  existing_constraints: string[];
  narrative_hypothesis: string;
  alternatives: Array<{
    id: string;
    title: string;
    summary: string;
    pros: string[];
    cons: string[];
  }>;
  assumptions: string[];
  potential_impacts: Array<{
    target_id: string;
    tier: 'VERIFIED_DIRECT' | 'VERIFIED_TRANSITIVE' | 'CANDIDATE_IMPACT' | 'SPECULATIVE';
    detail: string;
  }>;
  consistency_risks: string[];
  creator_notes: string;
  review_status: ProposalReviewStatus;
  canon_status: 'PROPOSED' | 'SCENARIO' | 'CANON_OBSERVED';
  ratification_evidence?: {
    repository: string;
    commit_sha: string;
    path: string;
    verified: boolean;
  } | null;
  content_digest: string;
  created_at: string;
  updated_at: string;
}

export interface AiAdapterStatus {
  available: boolean;
  mode: 'DETERMINISTIC_GRAPH_RETRIEVAL_ONLY' | 'PRIVATE_AUTHENTICATED_ADAPTER';
  privacy_boundary: 'STRICT_NO_EXTERNAL_TRANSMISSION';
  reason: string;
}

export interface CreativeArtifact {
  schema_version: 'reltroner-statistics-creative.v1';
  rules_version: string;
  generated_at: string;
  sources: {
    production_commit_sha: string;
    remodeling_commit_sha: string;
  };
  ai_adapter: AiAdapterStatus;
  summary: {
    entities_total: number;
    entities_by_kind: Record<string, number>;
    relationships_total: number;
    relationships_by_type: Record<string, number>;
    relationships_by_verification: Record<string, number>;
    audit_findings_total: number;
    audit_by_classification: Record<string, number>;
    opportunities_total: number;
    refactoring_plans_total: number;
    scenarios_total: number;
    seed_proposals_total: number;
    /** Citations and entity references re-verified against the pinned snapshots before publication. */
    citations_verified: number;
    references_verified: number;
  };
  entities: NarrativeEntity[];
  relationships: NarrativeRelationship[];
  audit_findings: NarrativeAuditFinding[];
  opportunities: CreativeOpportunity[];
  refactoring_plans: StoryRefactoringPlan[];
  scenarios: RemodelingScenario[];
  seed_proposals: CreativeProposal[];
  semantic_digest: string;
}

/**
 * Enforces the creator ratification boundary:
 * Approval for authoring is NOT canon ratification.
 * A proposal can never be transitioned to RATIFIED_EXTERNALLY or CANON_OBSERVED from a UI checkbox
 * without independently verifiable production source commit evidence.
 */
export function transitionProposalStatus(
  proposal: CreativeProposal,
  nextStatus: ProposalReviewStatus,
  options: {
    updatedAt?: string;
    ratificationEvidence?: { repository: string; commit_sha: string; path: string; verified: boolean } | null;
  } = {},
): CreativeProposal {
  if (nextStatus === 'RATIFIED_EXTERNALLY') {
    const ev = options.ratificationEvidence;
    if (!ev || !ev.verified || ev.repository !== 'Reltroner/reltroner-studio' || !SHA_RE.test(ev.commit_sha) || !ev.path.trim()) {
      throw new Error(
        'Cannot mark proposal as RATIFIED_EXTERNALLY without verified creator publication evidence in Reltroner/reltroner-studio (40-char commit SHA and path). Use APPROVED_FOR_AUTHORING for creator review approval.',
      );
    }
    return {
      ...proposal,
      review_status: 'RATIFIED_EXTERNALLY',
      canon_status: 'CANON_OBSERVED',
      ratification_evidence: ev,
      updated_at: options.updatedAt ?? proposal.updated_at,
    };
  }
  return {
    ...proposal,
    review_status: nextStatus,
    // Even when APPROVED_FOR_AUTHORING, canon_status remains PROPOSED or SCENARIO until external ratification!
    canon_status: proposal.canon_status === 'SCENARIO' ? 'SCENARIO' : 'PROPOSED',
    ratification_evidence: null,
    updated_at: options.updatedAt ?? proposal.updated_at,
  };
}

/**
 * Checks whether an edge type is allowed to propagate verified causal or structural dependency.
 * MENTIONS and THEMATICALLY_RELATED never establish plot causality or structural dependency.
 */
export function isVerifiedNarrativeDependency(type: EdgeType | NarrativeRelationshipType, verification?: RelationshipVerification): boolean {
  if (type === 'MENTIONS' || type === 'THEMATICALLY_RELATED' || type === 'CAUSES_CANDIDATE' || type === 'PROPOSES_CHANGE_TO' || type === 'SUPERSEDES') {
    return false;
  }
  if (verification && verification === 'CANDIDATE_HYPOTHESIS') return false;
  return true;
}

export interface SimulatedImpactReport {
  origin_id: string;
  origin_label: string;
  verified_direct: {
    id: string;
    label: string;
    edge_type: string;
    rationale: string;
    tier: 'VERIFIED_DIRECT_DEPENDENCY';
  }[];
  verified_transitive: {
    id: string;
    label: string;
    depth: number;
    via: string[];
    edge_type: string;
    tier: 'VERIFIED_TRANSITIVE_DEPENDENCY';
  }[];
  candidate_narrative: {
    id: string;
    label: string;
    edge_type: string;
    rationale: string;
    tier: 'CANDIDATE_NARRATIVE_IMPACT';
  }[];
  speculative_brainstorming: {
    dimension: ScenarioImpactEntry['dimension'];
    hypothesis: string;
    quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL';
    tier: 'SPECULATIVE_BRAINSTORMING';
  }[];
}

/**
 * Computes a deterministic Narrative Consequence & Impact Simulation for any origin node or entity,
 * strictly separating:
 *  - VERIFIED_DIRECT_DEPENDENCY (depth 1 verified structural/narrative edges)
 *  - VERIFIED_TRANSITIVE_DEPENDENCY (depth 2..maxDepth verified structural/narrative edges)
 *  - CANDIDATE_NARRATIVE_IMPACT (MENTIONS, THEMATICALLY_RELATED, CAUSES_CANDIDATE)
 *  - SPECULATIVE_BRAINSTORMING (exploratory socio-political/cultural hypotheses with INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL)
 */
export function simulateNarrativeImpact(
  graph: KnowledgeGraph,
  entities: NarrativeEntity[],
  relationships: NarrativeRelationship[],
  originId: string,
  maxDepth = 3,
): SimulatedImpactReport {
  const entityMap = new Map(entities.map((e) => [e.id, e]));
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  const labelFor = (id: string) => entityMap.get(id)?.name ?? nodeMap.get(id)?.label ?? id;

  const impact = traverseImpact(graph.edges, originId, {
    types: NARRATIVE_IMPACT_TYPES,
    maxDepth,
    sides: ['production', 'remodeling', 'both'],
    statuses: DEPENDENCY_STATUSES,
  });

  const verified_direct: SimulatedImpactReport['verified_direct'] = [];
  const verified_transitive: SimulatedImpactReport['verified_transitive'] = [];

  for (const hit of impact.direct) {
    verified_direct.push({
      id: hit.node,
      label: labelFor(hit.node),
      edge_type: hit.via,
      rationale: `Verified graph dependency (${hit.via}) at depth 1`,
      tier: 'VERIFIED_DIRECT_DEPENDENCY',
    });
  }

  for (const hit of impact.transitive) {
    verified_transitive.push({
      id: hit.node,
      label: labelFor(hit.node),
      depth: hit.depth,
      via: hit.path,
      edge_type: hit.via,
      tier: 'VERIFIED_TRANSITIVE_DEPENDENCY',
    });
  }

  for (const rel of relationships) {
    if (rel.source_id !== originId && rel.target_id !== originId) continue;
    const otherId = rel.source_id === originId ? rel.target_id : rel.source_id;
    if (isVerifiedNarrativeDependency(rel.type, rel.verification)) {
      if (!verified_direct.some((d) => d.id === otherId && d.edge_type === rel.type)) {
        verified_direct.push({
          id: otherId,
          label: labelFor(otherId),
          edge_type: rel.type,
          rationale: rel.rationale,
          tier: 'VERIFIED_DIRECT_DEPENDENCY',
        });
      }
    }
  }

  const candidate_narrative: SimulatedImpactReport['candidate_narrative'] = [];
  for (const edge of graph.edges) {
    const coOccurrence = edge.type === 'MENTIONS' || edge.type === 'CAUSES_CANDIDATE' || edge.type === 'THEMATICALLY_RELATED';
    if (!coOccurrence && edge.status !== 'CANDIDATE') continue;
    if (edge.source !== originId && edge.target !== originId) continue;
    const otherId = edge.source === originId ? edge.target : edge.source;
    if (candidate_narrative.some((c) => c.id === otherId && c.edge_type === edge.type)) continue;
    candidate_narrative.push({
      id: otherId,
      label: labelFor(otherId),
      edge_type: edge.type,
      rationale: coOccurrence
        ? `Co-occurrence / candidate link (${edge.type}); never treated as causal dependency.`
        : `Candidate ${edge.type} inferred from a name occurrence; a review lead, not a verified dependency.`,
      tier: 'CANDIDATE_NARRATIVE_IMPACT',
    });
  }
  for (const rel of relationships) {
    if (rel.source_id !== originId && rel.target_id !== originId) continue;
    if (!isVerifiedNarrativeDependency(rel.type, rel.verification)) {
      const otherId = rel.source_id === originId ? rel.target_id : rel.source_id;
      if (!candidate_narrative.some((c) => c.id === otherId && c.edge_type === rel.type)) {
        candidate_narrative.push({
          id: otherId,
          label: labelFor(otherId),
          edge_type: rel.type,
          rationale: `${rel.rationale} (Non-causal / candidate link)`,
          tier: 'CANDIDATE_NARRATIVE_IMPACT',
        });
      }
    }
  }

  const originLabel = labelFor(originId);
  const speculative_brainstorming: SimulatedImpactReport['speculative_brainstorming'] = [
    {
      dimension: 'INSTITUTIONAL_BEHAVIOR',
      hypothesis: `Exploratory scenario: If ${originLabel} undergoes structural remodeling, treaties and institutional mandates referencing ${originLabel} should be reviewed for governance alignment.`,
      quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
      tier: 'SPECULATIVE_BRAINSTORMING',
    },
    {
      dimension: 'HISTORICAL_INTERPRETATION',
      hypothesis: `Exploratory scenario: Long-term public memory and narrative framing around ${originLabel} may shift across subsequent BAC eras.`,
      quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
      tier: 'SPECULATIVE_BRAINSTORMING',
    },
    {
      dimension: 'CIVILIAN_PERCEPTIONS',
      hypothesis: `Exploratory scenario: Civilian and institutional trust responses to changes in ${originLabel} are qualitative narrative possibilities without a deterministic numerical formula.`,
      quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
      tier: 'SPECULATIVE_BRAINSTORMING',
    },
  ];

  return {
    origin_id: originId,
    origin_label: originLabel,
    verified_direct,
    verified_transitive,
    candidate_narrative,
    speculative_brainstorming,
  };
}


