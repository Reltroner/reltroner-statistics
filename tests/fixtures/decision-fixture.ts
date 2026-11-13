/**
 * Synthetic decision tree for structural and evaluation tests. Every label, fact and quote here
 * is invented for testing and says nothing about Asthortera.
 */
import { DECISION_RULES_VERSION, DECISION_TREE_SCHEMA, type DecisionBranch, type DecisionEvidence, type DecisionFact, type DecisionNode, type DecisionTree } from '../../src/domain/decision.ts';

export const SYN_PROD = 'a'.repeat(40);
export const SYN_DRAFT = 'b'.repeat(40);

export function fact(value: DecisionFact['value'], extra: Partial<DecisionFact> = {}): DecisionFact {
  return { state: value === null ? 'NULL' : 'ASSIGNED', value, unit: null, period: null, canon_status: null, source: 'synthetic test fact', evidence_ids: [], ...extra };
}

export function evidence(id: string, extra: Partial<DecisionEvidence> = {}): DecisionEvidence {
  return {
    id, kind: 'SOURCE_PASSAGE', status: 'VERIFIED', side: 'production', repository: 'Reltroner/reltroner-studio', commit_sha: SYN_PROD,
    path: 'content/synthetic/fixture.md', blob_sha: 'c'.repeat(40), line: 3, quote: `Synthetic passage for ${id}.`, canon_status: 'CANON_OBSERVED', note: null, ...extra,
  };
}

const branch = (id: string, from: string, to: string, label: string, extra: Partial<DecisionBranch> = {}): DecisionBranch => ({
  id, from, to, label, when: null, guard: null, rationale: 'synthetic', evidence_ids: [], assumptions: [], uncertainty: 'SPECULATIVE', outcome_class: null, review_requirements: [], ...extra,
});

export function syntheticTree(): DecisionTree {
  const nodes: DecisionNode[] = [
    { id: 'root', type: 'ROOT', label: 'Synthetic question', description: 'Entry point', evidence_ids: [] },
    { id: 'premise', type: 'EVIDENCE', label: 'Synthetic premise', description: 'Evidence consulted first', evidence_ids: ['EV-SYN-1'] },
    { id: 'gate', type: 'CONDITION', label: 'Score threshold', description: 'Deterministic condition', evidence_ids: [], question: 'Is the score above ten points?', predicate: { op: 'GREATER_THAN', fact: 'score', value: 10, unit: 'points' } },
    { id: 'choose', type: 'DECISION', label: 'Direction', description: 'Creator choice', evidence_ids: [], question: 'Which synthetic direction?' },
    { id: 'out-a', type: 'OUTCOME', label: 'Direction A', description: 'Hypothesis outcome', evidence_ids: [], outcome_class: 'NARRATIVE_HYPOTHESIS',
      consequences: [{ text: 'Synthetic consequence A', basis: 'NARRATIVE_HYPOTHESIS', dimension: null, evidence_ids: [] }], consistency_risks: [], open_questions: [], affected_entities: [] },
    { id: 'out-b', type: 'OUTCOME', label: 'Direction B', description: 'Blocked while the constraint is verified', evidence_ids: [], outcome_class: 'PURE_SPECULATION',
      consequences: [{ text: 'Synthetic consequence B', basis: 'PURE_SPECULATION', dimension: null, evidence_ids: [] }], consistency_risks: [{ text: 'Contradicts the synthetic constraint', evidence_ids: ['EV-SYN-BLOCK'] }], open_questions: [], affected_entities: [] },
    { id: 'out-low', type: 'OUTCOME', label: 'Defer', description: 'Rule-based review outcome', evidence_ids: [], outcome_class: 'REVIEW_RECOMMENDATION', recommended_action: 'DEFER',
      consequences: [{ text: 'Score too low to proceed', basis: 'REVIEW_RECOMMENDATION', dimension: null, evidence_ids: [] }], consistency_risks: [], open_questions: [], affected_entities: [] },
    { id: 'no-data', type: 'INSUFFICIENT_DATA', label: 'Score unknown', description: 'The score is not available', evidence_ids: [], missing: ['score in points'] },
  ];
  const branches: DecisionBranch[] = [
    branch('b-root', 'root', 'premise', 'continue'),
    branch('b-premise', 'premise', 'gate', 'continue', { evidence_ids: ['EV-SYN-1'] }),
    branch('b-high', 'gate', 'choose', 'Above ten', { when: 'TRUE', uncertainty: 'DETERMINISTIC' }),
    branch('b-low', 'gate', 'out-low', 'Ten or below', { when: 'FALSE', uncertainty: 'DETERMINISTIC' }),
    branch('b-unknown', 'gate', 'no-data', 'Score unknown', { when: 'UNKNOWN', uncertainty: 'DETERMINISTIC' }),
    branch('opt-a', 'choose', 'out-a', 'Option A', { outcome_class: 'NARRATIVE_HYPOTHESIS' }),
    branch('opt-b', 'choose', 'out-b', 'Option B', { guard: { op: 'NOT', of: [{ op: 'EVIDENCE_VERIFIED', evidence_ids: ['EV-SYN-BLOCK'] }] }, outcome_class: 'PURE_SPECULATION' }),
  ];
  return {
    schema_version: DECISION_TREE_SCHEMA, tree_id: 'DT-0123456789AB', tree_type: 'NARRATIVE_IDEATION', purposes: ['NARRATIVE_IDEATION'], strict: true,
    title: 'Synthetic fixture tree', description: 'Invented for tests only.', question: 'Synthetic question?',
    source_context: {
      production: { repository: 'Reltroner/reltroner-studio', commit_sha: SYN_PROD }, remodeling: { repository: 'Reltroner/reltroner-studio-remodeling', commit_sha: SYN_DRAFT },
      deployment_status: 'DEPLOYMENT_UNVERIFIED', paths: ['content/synthetic/fixture.md'],
    },
    production_source_sha: SYN_PROD, remodeling_source_sha: SYN_DRAFT, rules_version: DECISION_RULES_VERSION, root_node_id: 'root',
    nodes, branches,
    constraints: [{ id: 'syn-constraint', statement: 'Synthetic constraint', binding: 'CANON_CONSTRAINT', evidence_ids: ['EV-SYN-BLOCK'] }],
    assumptions: ['Synthetic assumption'],
    outcomes: ['no-data', 'out-a', 'out-b', 'out-low'],
    evidence: [evidence('EV-SYN-1'), evidence('EV-SYN-BLOCK', { line: 7 })],
    links: [],
    facts: { score: fact(12, { unit: 'points' }) },
    creator_review_status: 'PROPOSED', canon_status: 'SCENARIO', model_metadata: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
}
