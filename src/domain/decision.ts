/**
 * Decision Intelligence domain contract. Pure and isomorphic (build pipeline, browser, tests).
 *
 * Three concepts are kept apart on purpose:
 *  - the knowledge graph records how sources, entities and indicators relate;
 *  - a decision tree (this module) records choices, conditions, constraints, alternative paths,
 *    expected outcomes and the evidence for each of them;
 *  - a machine-learning decision tree is a supervised model. It can be expressed in this same
 *    contract (tree_type STATISTICAL_MODEL) but only exists when a labeled dataset passes the
 *    sufficiency gate of the Python analytics package.
 *
 * A decision tree never changes canon: its status is SCENARIO, PROPOSED, MODEL_ESTIMATE or
 * REVIEW_AID, and no rule in this module can produce a canon status.
 */
import { PROPOSAL_REVIEW_STATUSES, type ProposalReviewStatus } from './creative.ts';
import type { EdgeStatus, EdgeType } from './graph.ts';
import { SHA_RE } from './source.ts';
import { EPISTEMIC_STATUSES, type EpistemicStatus } from './status.ts';

export const DECISION_TREE_SCHEMA = 'reltroner-decision-tree.v1';
export const DECISION_RULES_VERSION = 'DI-1.0.0';

/** Hard bounds. Every traversal in this module is iterative and stops at these limits. */
export const DECISION_LIMITS = Object.freeze({
  maxNodes: 96,
  maxDepth: 12,
  maxFanout: 8,
  maxPredicateDepth: 4,
  maxSetValues: 64,
  maxEvidenceRefs: 16,
  maxPaths: 256,
});

export const TREE_TYPES = Object.freeze([
  'NARRATIVE_IDEATION',
  'CHARACTER_DECISION',
  'HISTORICAL_SCENARIO',
  'INSTITUTIONAL_CONFLICT',
  'STORY_REFACTORING',
  'WORLDBUILDING_REMODELING',
  'CONSISTENCY_REVIEW',
  'DEVELOPMENT_PRIORITIZATION',
  'STATISTICAL_MODEL',
] as const);
export type TreeType = (typeof TREE_TYPES)[number];

export const DECISION_NODE_TYPES = Object.freeze(['ROOT', 'DECISION', 'CONDITION', 'EVIDENCE', 'OUTCOME', 'REVIEW_GATE', 'INSUFFICIENT_DATA'] as const);
export type DecisionNodeType = (typeof DECISION_NODE_TYPES)[number];

export const TRUTH_VALUES = Object.freeze(['TRUE', 'FALSE', 'UNKNOWN'] as const);
export type TruthValue = (typeof TRUTH_VALUES)[number];

/** The complete, closed operator set. Predicates are data; nothing in a tree is ever executed as code. */
export const PREDICATE_OPS = Object.freeze([
  'EQUALS',
  'NOT_EQUALS',
  'GREATER_THAN',
  'LESS_THAN',
  'WITHIN_RANGE',
  'PRESENT',
  'MISSING',
  'MEMBER_OF',
  'EVIDENCE_VERIFIED',
  'CANON_STATUS_IS',
  'COMPATIBLE_PERIOD',
  'COMPATIBLE_UNIT',
  'ALL',
  'ANY',
  'NOT',
] as const);
export type PredicateOp = (typeof PREDICATE_OPS)[number];

export const OUTCOME_CLASSES = Object.freeze([
  'VERIFIED_SOURCE_GROUNDED',
  'DEPENDENCY_SUPPORTED',
  'NARRATIVE_HYPOTHESIS',
  'PURE_SPECULATION',
  'REVIEW_RECOMMENDATION',
  'MODEL_ESTIMATE',
] as const);
export type OutcomeClass = (typeof OUTCOME_CLASSES)[number];

export const OUTCOME_CLASS_DESCRIPTIONS: Readonly<Record<OutcomeClass, string>> = Object.freeze({
  VERIFIED_SOURCE_GROUNDED: 'The consequence is stated by canonical production evidence (a passage or a dataset value). Every cited item was re-verified against the pinned blob. Planning material and remodeling proposals never qualify.',
  DEPENDENCY_SUPPORTED: 'Not stated as a consequence, but supported by at least one declared or verified dependency in the knowledge graph.',
  NARRATIVE_HYPOTHESIS: 'A plausible story direction that builds on established canon. It is not established by any source.',
  PURE_SPECULATION: 'No source support. Exploratory only; a counterfactual or an invention that needs an author decision.',
  REVIEW_RECOMMENDATION: 'A recommended review action derived from deterministic conditions. It never changes canon by itself.',
  MODEL_ESTIMATE: 'Output of a statistical model. Exploratory, never canon, and never a causal claim.',
});

export const REVIEW_ACTIONS = Object.freeze(['ESCALATE_TO_CREATOR', 'INVESTIGATE', 'DEFER', 'PRESERVE', 'NO_ACTION'] as const);
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const LINK_KINDS = Object.freeze(['VERIFIED_DEPENDENCY', 'CANDIDATE_IMPACT', 'SPECULATIVE_OUTCOME', 'EVIDENCE_REFERENCE'] as const);
export type LinkKind = (typeof LINK_KINDS)[number];

/** Graph edge types that can never support a verified dependency, whatever their status. */
export const NON_DEPENDENCY_EDGE_TYPES: readonly EdgeType[] = Object.freeze(['MENTIONS', 'THEMATICALLY_RELATED', 'CAUSES_CANDIDATE', 'PROPOSES_CHANGE_TO', 'SUPERSEDES']);

export const EVIDENCE_KINDS = Object.freeze(['SOURCE_PASSAGE', 'DATASET_VALUE', 'QA_IDENTITY', 'AUDIT_FINDING', 'GRAPH_MEASURE', 'MODEL_OUTPUT'] as const);
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const EVIDENCE_STATUSES = Object.freeze(['VERIFIED', 'NOT_FOUND', 'SOURCE_MISSING'] as const);
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const UNCERTAINTY_LEVELS = Object.freeze(['DETERMINISTIC', 'SOURCE_STATED', 'INFERRED', 'SPECULATIVE'] as const);
export type Uncertainty = (typeof UNCERTAINTY_LEVELS)[number];

export const CONSEQUENCE_DIMENSIONS = Object.freeze([
  'SOVEREIGNTY',
  'INSTITUTIONAL_TRUST',
  'HISTORICAL_MEMORY',
  'EXTERNAL_PERCEPTION',
  'CIVILIAN_LIFE',
  'NARRATIVE_STRUCTURE',
  'STATISTICS',
  'LONG_TERM',
] as const);
export type ConsequenceDimension = (typeof CONSEQUENCE_DIMENSIONS)[number];

export const DECISION_CANON_STATUSES = Object.freeze(['SCENARIO', 'PROPOSED', 'MODEL_ESTIMATE', 'REVIEW_AID'] as const);
export type DecisionCanonStatus = (typeof DECISION_CANON_STATUSES)[number];

export const ALLOWED_REPOSITORIES: readonly string[] = Object.freeze(['Reltroner/reltroner-studio', 'Reltroner/reltroner-studio-remodeling']);

export type Scalar = string | number | boolean | null;

export interface Predicate {
  op: PredicateOp;
  /** Fact key: EQUALS, NOT_EQUALS, GREATER_THAN, LESS_THAN, WITHIN_RANGE, PRESENT, MISSING, MEMBER_OF, CANON_STATUS_IS. */
  fact?: string;
  value?: Scalar;
  min?: number;
  max?: number;
  /** Unit the fact must carry for a numeric comparison; a different unit makes the result UNKNOWN. */
  unit?: string;
  values?: Scalar[];
  statuses?: EpistemicStatus[];
  evidence_ids?: string[];
  /** Fact keys compared by COMPATIBLE_PERIOD and COMPATIBLE_UNIT. */
  a?: string;
  b?: string;
  of?: Predicate[];
}

export interface DecisionFact {
  /** ASSIGNED: has a value. NULL: explicitly unassigned in the source. MISSING: the source has no such member. */
  state: 'ASSIGNED' | 'NULL' | 'MISSING';
  value: Scalar;
  unit: string | null;
  period: { start_bac: number; end_bac: number } | null;
  canon_status: EpistemicStatus | null;
  source: string;
  evidence_ids: string[];
}

export interface DecisionEvidence {
  id: string;
  kind: EvidenceKind;
  status: EvidenceStatus;
  side: 'production' | 'remodeling';
  repository: string;
  commit_sha: string;
  path: string;
  blob_sha: string | null;
  line: number | null;
  /** Verbatim text of the cited passage, or the stated value for non-prose evidence. Empty when not found. */
  quote: string;
  canon_status: EpistemicStatus;
  note: string | null;
}

export interface DecisionConsequence {
  text: string;
  basis: OutcomeClass;
  dimension: ConsequenceDimension | null;
  evidence_ids: string[];
}

export interface DecisionNode {
  id: string;
  type: DecisionNodeType;
  label: string;
  description: string;
  evidence_ids: string[];
  question?: string;
  predicate?: Predicate;
  outcome_class?: OutcomeClass;
  consequences?: DecisionConsequence[];
  consistency_risks?: Array<{ text: string; evidence_ids: string[] }>;
  open_questions?: string[];
  affected_entities?: string[];
  recommended_action?: ReviewAction;
  missing?: string[];
  /** Statistical models only: what the fitted tree holds at this node. */
  model?: { n_samples: number; impurity: number | null; value: number | string | null; class_counts: Record<string, number> | null };
}

export interface DecisionBranch {
  id: string;
  from: string;
  to: string;
  label: string;
  /** For branches leaving a CONDITION: the predicate result that selects this branch. */
  when: TruthValue | null;
  /** For branches leaving a DECISION or REVIEW_GATE: a canon constraint. FALSE blocks the option. */
  guard: Predicate | null;
  rationale: string;
  evidence_ids: string[];
  assumptions: string[];
  uncertainty: Uncertainty;
  outcome_class: OutcomeClass | null;
  review_requirements: string[];
}

export interface DecisionConstraint {
  id: string;
  statement: string;
  binding: 'CANON_CONSTRAINT' | 'REVIEW_RULE' | 'METHOD_RULE';
  evidence_ids: string[];
}

export interface DecisionLink {
  id: string;
  node_id: string;
  kind: LinkKind;
  target_id: string;
  target_label: string;
  edge_id: string | null;
  edge_type: EdgeType | null;
  edge_status: EdgeStatus | null;
  detail: string;
}

export interface ModelMetadata {
  model_version: string;
  estimator: 'DecisionTreeClassifier' | 'DecisionTreeRegressor';
  task: 'classification' | 'regression';
  target: string;
  features: string[];
  data_origin: 'CANONICAL_OBSERVATIONS' | 'SYNTHETIC_FIXTURE';
  n_samples: number;
  random_state: number;
  max_depth: number;
  min_samples_leaf: number;
  evaluation: { method: string; n_train: number; n_test: number; metrics: Record<string, number | null> };
  feature_importance: Array<{ feature: string; importance: number }>;
  limitations: string[];
}

export interface DecisionTree {
  schema_version: typeof DECISION_TREE_SCHEMA;
  tree_id: string;
  tree_type: TreeType;
  purposes: TreeType[];
  /** Declared strict: every node except the root has exactly one parent. */
  strict: true;
  title: string;
  description: string;
  question: string;
  source_context: {
    production: { repository: string; commit_sha: string };
    remodeling: { repository: string; commit_sha: string };
    deployment_status: 'DEPLOYMENT_VERIFIED' | 'DEPLOYMENT_UNVERIFIED';
    paths: string[];
  };
  production_source_sha: string;
  remodeling_source_sha: string;
  rules_version: string;
  root_node_id: string;
  nodes: DecisionNode[];
  branches: DecisionBranch[];
  constraints: DecisionConstraint[];
  assumptions: string[];
  /** Ids of the leaf nodes (OUTCOME and INSUFFICIENT_DATA), sorted. */
  outcomes: string[];
  evidence: DecisionEvidence[];
  links: DecisionLink[];
  /** Deterministic inputs for CONDITION nodes, each with provenance. Case-specific facts override these. */
  facts: Record<string, DecisionFact>;
  creator_review_status: ProposalReviewStatus;
  canon_status: DecisionCanonStatus;
  model_metadata: ModelMetadata | null;
  created_at: string;
  updated_at: string;
}

export type DecisionIssueCode =
  | 'SCHEMA_VERSION'
  | 'LIMIT_EXCEEDED'
  | 'INVALID_ID'
  | 'DUPLICATE_NODE_ID'
  | 'DUPLICATE_BRANCH_ID'
  | 'MISSING_ROOT'
  | 'MULTIPLE_ROOTS'
  | 'ORPHAN_BRANCH'
  | 'INVALID_PARENT'
  | 'MULTIPLE_PARENTS'
  | 'CYCLE'
  | 'UNREACHABLE_NODE'
  | 'UNDEFINED_DECISION_OPTIONS'
  | 'BRANCH_CONDITION_INVALID'
  | 'INVALID_LEAF'
  | 'UNSUPPORTED_OPERATOR'
  | 'MALFORMED_PREDICATE'
  | 'MALFORMED_SOURCE_IDENTITY'
  | 'UNKNOWN_EVIDENCE'
  | 'MALFORMED_EVIDENCE'
  | 'UNVERIFIED_CLAIM'
  | 'INVALID_LINK'
  | 'CANON_STATUS_VIOLATION'
  | 'OUTCOME_INDEX_MISMATCH';

export interface DecisionIssue {
  code: DecisionIssueCode;
  message: string;
  node_id: string | null;
  branch_id: string | null;
}

export interface DecisionValidation {
  ok: boolean;
  issues: DecisionIssue[];
  /** Longest root-to-leaf distance in branches; null when the structure is not a tree. */
  depth: number | null;
}

const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const FACT_RE = /^[a-z][a-z0-9_.]{0,63}$/;
const EVIDENCE_ID_RE = /^EV-[A-Z0-9][A-Z0-9-]{1,60}$/;
const TREE_ID_RE = /^DT-[0-9A-F]{12}$/;
const OPS: ReadonlySet<string> = new Set(PREDICATE_OPS);
const LEAF_TYPES: ReadonlySet<DecisionNodeType> = new Set(['OUTCOME', 'INSUFFICIENT_DATA']);
const CHOICE_TYPES: ReadonlySet<DecisionNodeType> = new Set(['DECISION', 'REVIEW_GATE']);
const FACT_OPS: ReadonlySet<PredicateOp> = new Set(['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'WITHIN_RANGE', 'PRESENT', 'MISSING', 'MEMBER_OF', 'CANON_STATUS_IS']);
const isScalar = (v: unknown): v is Scalar => v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Problems in one predicate. Iterative, bounded by the nesting limit. */
export function predicateIssues(root: Predicate | undefined | null): Array<{ code: 'UNSUPPORTED_OPERATOR' | 'MALFORMED_PREDICATE'; message: string }> {
  const out: Array<{ code: 'UNSUPPORTED_OPERATOR' | 'MALFORMED_PREDICATE'; message: string }> = [];
  const bad = (message: string) => out.push({ code: 'MALFORMED_PREDICATE', message });
  if (!root || typeof root !== 'object') return [{ code: 'MALFORMED_PREDICATE', message: 'Predicate is required' }];
  const stack: Array<{ p: Predicate; depth: number }> = [{ p: root, depth: 1 }];
  let visited = 0;
  while (stack.length) {
    const { p, depth } = stack.pop()!;
    if (++visited > 64) { bad('Predicate has more than 64 terms'); break; }
    if (!p || typeof p !== 'object' || !OPS.has(p.op)) {
      out.push({ code: 'UNSUPPORTED_OPERATOR', message: `Unsupported condition operator: ${String((p as Predicate | undefined)?.op)}` });
      continue;
    }
    if (depth > DECISION_LIMITS.maxPredicateDepth) { bad(`Predicate nesting exceeds ${DECISION_LIMITS.maxPredicateDepth}`); continue; }
    if (FACT_OPS.has(p.op) && !(typeof p.fact === 'string' && FACT_RE.test(p.fact))) bad(`${p.op} requires a valid fact key`);
    switch (p.op) {
      case 'EQUALS':
      case 'NOT_EQUALS':
        if (!('value' in p) || !isScalar(p.value)) bad(`${p.op} requires a scalar value`);
        break;
      case 'GREATER_THAN':
      case 'LESS_THAN':
        if (!finite(p.value)) bad(`${p.op} requires a finite number`);
        break;
      case 'WITHIN_RANGE':
        if (!finite(p.min) || !finite(p.max) || p.min > p.max) bad('WITHIN_RANGE requires finite min <= max');
        break;
      case 'MEMBER_OF':
        if (!Array.isArray(p.values) || !p.values.length || p.values.length > DECISION_LIMITS.maxSetValues || !p.values.every(isScalar)) bad('MEMBER_OF requires 1 to 64 scalar values');
        break;
      case 'CANON_STATUS_IS':
        if (!Array.isArray(p.statuses) || !p.statuses.length || !p.statuses.every((s) => (EPISTEMIC_STATUSES as readonly string[]).includes(s))) bad('CANON_STATUS_IS requires known statuses');
        break;
      case 'EVIDENCE_VERIFIED':
        if (!Array.isArray(p.evidence_ids) || !p.evidence_ids.length || p.evidence_ids.length > DECISION_LIMITS.maxEvidenceRefs || !p.evidence_ids.every((e) => EVIDENCE_ID_RE.test(e))) bad('EVIDENCE_VERIFIED requires evidence ids');
        break;
      case 'COMPATIBLE_PERIOD':
      case 'COMPATIBLE_UNIT':
        if (!(typeof p.a === 'string' && FACT_RE.test(p.a) && typeof p.b === 'string' && FACT_RE.test(p.b))) bad(`${p.op} requires fact keys a and b`);
        break;
      case 'ALL':
      case 'ANY':
      case 'NOT': {
        const terms = Array.isArray(p.of) ? p.of : [];
        if (p.op === 'NOT' ? terms.length !== 1 : terms.length < 1 || terms.length > DECISION_LIMITS.maxFanout) bad(`${p.op} requires ${p.op === 'NOT' ? 'exactly one term' : '1 to 8 terms'}`);
        for (const t of terms) stack.push({ p: t, depth: depth + 1 });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Evidence ids a predicate consults, in first-use order. */
export function predicateEvidence(root: Predicate | null | undefined): string[] {
  const out: string[] = [];
  const stack: Predicate[] = root ? [root] : [];
  let guard = 0;
  while (stack.length && guard++ < 64) {
    const p = stack.pop()!;
    for (const id of p.evidence_ids ?? []) if (!out.includes(id)) out.push(id);
    for (const t of [...(p.of ?? [])].reverse()) stack.push(t);
  }
  return out;
}

/**
 * Structural and evidentiary validation. A tree that fails is never published or evaluated.
 * Rejects: duplicate ids, missing or multiple roots, cycles, orphan branches, invalid parents,
 * multiple parents, unreachable nodes, decisions without defined options, invalid leaves,
 * unsupported operators, limit violations, malformed source identities, unknown or unverified
 * evidence behind a verified claim, and dependency links that rest on a mention.
 */
export function validateDecisionTree(tree: DecisionTree): DecisionValidation {
  const issues: DecisionIssue[] = [];
  const add = (code: DecisionIssueCode, message: string, node_id: string | null = null, branch_id: string | null = null) => issues.push({ code, message, node_id, branch_id });
  const done = (depth: number | null): DecisionValidation => {
    const order = (a: DecisionIssue, b: DecisionIssue) => (a.code !== b.code ? (a.code < b.code ? -1 : 1) : (a.node_id ?? '') !== (b.node_id ?? '') ? ((a.node_id ?? '') < (b.node_id ?? '') ? -1 : 1) : (a.branch_id ?? '') < (b.branch_id ?? '') ? -1 : (a.branch_id ?? '') > (b.branch_id ?? '') ? 1 : a.message < b.message ? -1 : a.message > b.message ? 1 : 0);
    return { ok: issues.length === 0, issues: issues.sort(order), depth: issues.some((i) => ['CYCLE', 'ORPHAN_BRANCH', 'MISSING_ROOT', 'MULTIPLE_ROOTS', 'DUPLICATE_NODE_ID', 'LIMIT_EXCEEDED'].includes(i.code)) ? null : depth };
  };

  if (tree.schema_version !== DECISION_TREE_SCHEMA) add('SCHEMA_VERSION', `Expected ${DECISION_TREE_SCHEMA}`);
  if (!Array.isArray(tree.nodes) || !Array.isArray(tree.branches)) { add('MISSING_ROOT', 'Tree has no node or branch list'); return done(null); }
  if (tree.nodes.length > DECISION_LIMITS.maxNodes || tree.branches.length > DECISION_LIMITS.maxNodes) {
    add('LIMIT_EXCEEDED', `Tree exceeds ${DECISION_LIMITS.maxNodes} nodes or branches`);
    return done(null);
  }

  // Identity and provenance.
  if (!TREE_ID_RE.test(tree.tree_id ?? '')) add('INVALID_ID', 'tree_id must look like DT-XXXXXXXXXXXX');
  if (tree.strict !== true) add('MULTIPLE_PARENTS', 'Only strict trees are supported');
  const identity = (label: string, repo: unknown, sha: unknown) => {
    if (typeof repo !== 'string' || !ALLOWED_REPOSITORIES.includes(repo)) add('MALFORMED_SOURCE_IDENTITY', `${label}: repository is not a known source`);
    if (typeof sha !== 'string' || !SHA_RE.test(sha)) add('MALFORMED_SOURCE_IDENTITY', `${label}: commit SHA must be 40 lowercase hex characters`);
  };
  identity('production', tree.source_context?.production?.repository, tree.source_context?.production?.commit_sha);
  identity('remodeling', tree.source_context?.remodeling?.repository, tree.source_context?.remodeling?.commit_sha);
  if (tree.source_context?.production?.repository !== ALLOWED_REPOSITORIES[0] || tree.source_context?.remodeling?.repository !== ALLOWED_REPOSITORIES[1]) add('MALFORMED_SOURCE_IDENTITY', 'Production and remodeling repositories are swapped or unknown');
  if (tree.production_source_sha !== tree.source_context?.production?.commit_sha || tree.remodeling_source_sha !== tree.source_context?.remodeling?.commit_sha) add('MALFORMED_SOURCE_IDENTITY', 'Top-level source SHAs disagree with source_context');
  if (!['DEPLOYMENT_VERIFIED', 'DEPLOYMENT_UNVERIFIED'].includes(tree.source_context?.deployment_status)) add('MALFORMED_SOURCE_IDENTITY', 'Unknown deployment status');
  if (typeof tree.rules_version !== 'string' || !tree.rules_version) add('MALFORMED_SOURCE_IDENTITY', 'rules_version is required');
  if (!(DECISION_CANON_STATUSES as readonly string[]).includes(tree.canon_status)) add('CANON_STATUS_VIOLATION', `A decision tree cannot carry canon status ${String(tree.canon_status)}`);
  if (!(PROPOSAL_REVIEW_STATUSES as readonly string[]).includes(tree.creator_review_status) || tree.creator_review_status === 'RATIFIED_EXTERNALLY') add('CANON_STATUS_VIOLATION', 'A generated decision tree cannot be RATIFIED_EXTERNALLY');
  if (!(TREE_TYPES as readonly string[]).includes(tree.tree_type)) add('SCHEMA_VERSION', `Unknown tree type ${String(tree.tree_type)}`);
  if ((tree.tree_type === 'STATISTICAL_MODEL') !== (tree.model_metadata !== null)) add('SCHEMA_VERSION', 'model_metadata is required exactly for STATISTICAL_MODEL trees');
  if (tree.tree_type === 'STATISTICAL_MODEL' && tree.canon_status !== 'MODEL_ESTIMATE') add('CANON_STATUS_VIOLATION', 'A statistical model tree must be MODEL_ESTIMATE');

  // Evidence index.
  const evidence = new Map<string, DecisionEvidence>();
  for (const e of tree.evidence ?? []) {
    if (!EVIDENCE_ID_RE.test(e.id)) add('INVALID_ID', `Invalid evidence id ${String(e.id)}`);
    if (evidence.has(e.id)) add('MALFORMED_EVIDENCE', `Duplicate evidence id ${e.id}`);
    evidence.set(e.id, e);
    if (!ALLOWED_REPOSITORIES.includes(e.repository) || !SHA_RE.test(e.commit_sha)) add('MALFORMED_SOURCE_IDENTITY', `Evidence ${e.id} has a malformed source identity`);
    if (e.commit_sha !== (e.side === 'production' ? tree.production_source_sha : tree.remodeling_source_sha)) add('MALFORMED_SOURCE_IDENTITY', `Evidence ${e.id} is not pinned to the tree's ${e.side} commit`);
    if (e.repository !== (e.side === 'production' ? ALLOWED_REPOSITORIES[0] : ALLOWED_REPOSITORIES[1])) add('MALFORMED_SOURCE_IDENTITY', `Evidence ${e.id} names the wrong repository for its side`);
    if (e.status === 'VERIFIED') {
      if (!e.quote) add('MALFORMED_EVIDENCE', `Verified evidence ${e.id} has no quote`);
      if (e.kind === 'SOURCE_PASSAGE' && (!e.blob_sha || !SHA_RE.test(e.blob_sha) || !Number.isInteger(e.line) || (e.line ?? 0) < 1)) add('MALFORMED_EVIDENCE', `Verified passage ${e.id} needs a blob SHA and line`);
    }
    if (e.side === 'remodeling' && (e.canon_status === 'CANON_OBSERVED' || e.canon_status === 'CANON_DERIVED')) add('CANON_STATUS_VIOLATION', `Remodeling evidence ${e.id} cannot be canon`);
  }
  const refs = (ids: readonly string[] | undefined, node: string | null, branch: string | null) => {
    if ((ids?.length ?? 0) > DECISION_LIMITS.maxEvidenceRefs) add('LIMIT_EXCEEDED', 'Too many evidence references on one item', node, branch);
    for (const id of ids ?? []) if (!evidence.has(id)) add('UNKNOWN_EVIDENCE', `Evidence ${id} is not defined in this tree`, node, branch);
  };
  /** Verified in the pinned production source and canonical there: the only basis for a source-grounded claim. */
  const allCanon = (ids: readonly string[]) => ids.length > 0 && ids.every((id) => {
    const e = evidence.get(id);
    return e?.status === 'VERIFIED' && e.side === 'production' && (e.canon_status === 'CANON_OBSERVED' || e.canon_status === 'CANON_DERIVED');
  });

  // Nodes.
  const nodes = new Map<string, DecisionNode>();
  for (const n of tree.nodes) {
    if (!ID_RE.test(n.id ?? '')) add('INVALID_ID', `Invalid node id ${String(n.id)}`, n.id ?? null);
    if (nodes.has(n.id)) add('DUPLICATE_NODE_ID', `Node id ${n.id} is used more than once`, n.id);
    else nodes.set(n.id, n);
    if (!(DECISION_NODE_TYPES as readonly string[]).includes(n.type)) add('INVALID_LEAF', `Unknown node type ${String(n.type)}`, n.id);
    refs(n.evidence_ids, n.id, null);
  }
  const roots = tree.nodes.filter((n) => n.type === 'ROOT');
  if (roots.length > 1) add('MULTIPLE_ROOTS', `${roots.length} ROOT nodes`);
  const root = nodes.get(tree.root_node_id);
  if (!root || root.type !== 'ROOT' || roots.length === 0) { add('MISSING_ROOT', 'root_node_id must name the single ROOT node'); }

  // Branches.
  const out = new Map<string, DecisionBranch[]>();
  const parents = new Map<string, number>();
  const branchIds = new Set<string>();
  for (const b of tree.branches) {
    if (!ID_RE.test(b.id ?? '')) add('INVALID_ID', `Invalid branch id ${String(b.id)}`, null, b.id ?? null);
    if (branchIds.has(b.id)) add('DUPLICATE_BRANCH_ID', `Branch id ${b.id} is used more than once`, null, b.id);
    branchIds.add(b.id);
    const from = nodes.get(b.from);
    const to = nodes.get(b.to);
    if (!from || !to) { add('ORPHAN_BRANCH', `Branch ${b.id} references a node that does not exist`, null, b.id); continue; }
    if (LEAF_TYPES.has(from.type)) add('INVALID_PARENT', `Branch ${b.id} leaves a leaf node`, from.id, b.id);
    if (to.type === 'ROOT') add('INVALID_PARENT', `Branch ${b.id} enters the root`, to.id, b.id);
    if (b.from === b.to) add('CYCLE', `Branch ${b.id} is a self-loop`, b.from, b.id);
    out.set(b.from, [...(out.get(b.from) ?? []), b]);
    parents.set(b.to, (parents.get(b.to) ?? 0) + 1);
    refs(b.evidence_ids, null, b.id);
    if (!(UNCERTAINTY_LEVELS as readonly string[]).includes(b.uncertainty)) add('BRANCH_CONDITION_INVALID', `Branch ${b.id} has an unknown uncertainty level`, null, b.id);
    if (b.guard) {
      for (const p of predicateIssues(b.guard)) add(p.code, `Guard of ${b.id}: ${p.message}`, null, b.id);
      refs(predicateEvidence(b.guard), null, b.id);
      if (!CHOICE_TYPES.has(from.type)) add('BRANCH_CONDITION_INVALID', `Only options of a DECISION or REVIEW_GATE can carry a guard`, from.id, b.id);
    }
  }
  for (const [id, count] of parents) if (count > 1) add('MULTIPLE_PARENTS', `Node ${id} has ${count} parents in a strict tree`, id);

  // Per-type rules.
  for (const n of nodes.values()) {
    const branches = out.get(n.id) ?? [];
    if (branches.length > DECISION_LIMITS.maxFanout) add('LIMIT_EXCEEDED', `Node ${n.id} has more than ${DECISION_LIMITS.maxFanout} branches`, n.id);
    if (branches.length === 0 && !LEAF_TYPES.has(n.type)) add('INVALID_LEAF', `${n.type} node ${n.id} ends a path; only OUTCOME or INSUFFICIENT_DATA may be leaves`, n.id);
    switch (n.type) {
      case 'ROOT':
      case 'EVIDENCE':
        if (branches.length > 1) add('UNDEFINED_DECISION_OPTIONS', `${n.type} node ${n.id} must have exactly one continuation`, n.id);
        for (const b of branches) if (b.when !== null || b.guard !== null) add('BRANCH_CONDITION_INVALID', `Continuation of ${n.id} cannot be conditional`, n.id, b.id);
        break;
      case 'DECISION':
      case 'REVIEW_GATE': {
        if (branches.length < 2) add('UNDEFINED_DECISION_OPTIONS', `${n.type} node ${n.id} needs at least two defined options`, n.id);
        if (!n.question) add('UNDEFINED_DECISION_OPTIONS', `${n.type} node ${n.id} has no question`, n.id);
        const labels = new Set<string>();
        for (const b of branches) {
          if (!b.label?.trim()) add('UNDEFINED_DECISION_OPTIONS', `Option ${b.id} has no label`, n.id, b.id);
          if (labels.has(b.label)) add('UNDEFINED_DECISION_OPTIONS', `Option label "${b.label}" is repeated`, n.id, b.id);
          labels.add(b.label);
          if (b.when !== null) add('BRANCH_CONDITION_INVALID', `Option ${b.id} cannot carry a condition result`, n.id, b.id);
        }
        break;
      }
      case 'CONDITION': {
        for (const p of predicateIssues(n.predicate)) add(p.code, `Condition ${n.id}: ${p.message}`, n.id);
        refs(predicateEvidence(n.predicate), n.id, null);
        if (!n.question) add('BRANCH_CONDITION_INVALID', `Condition ${n.id} has no question`, n.id);
        const seen = new Set<string>();
        for (const b of branches) {
          if (b.when === null || !(TRUTH_VALUES as readonly string[]).includes(b.when)) add('BRANCH_CONDITION_INVALID', `Branch ${b.id} must state which condition result selects it`, n.id, b.id);
          else if (seen.has(b.when)) add('BRANCH_CONDITION_INVALID', `Two branches of ${n.id} handle ${b.when}`, n.id, b.id);
          seen.add(String(b.when));
        }
        if (branches.length && (!seen.has('TRUE') || !seen.has('FALSE'))) add('BRANCH_CONDITION_INVALID', `Condition ${n.id} must define both a TRUE and a FALSE branch`, n.id);
        break;
      }
      case 'OUTCOME': {
        if (!n.outcome_class || !(OUTCOME_CLASSES as readonly string[]).includes(n.outcome_class)) { add('INVALID_LEAF', `Outcome ${n.id} has no valid classification`, n.id); break; }
        const cons = n.consequences ?? [];
        if (!cons.length) add('INVALID_LEAF', `Outcome ${n.id} states no consequence`, n.id);
        else if (cons[0]!.basis !== n.outcome_class) add('INVALID_LEAF', `Outcome ${n.id} classification must match its primary consequence`, n.id);
        if (n.outcome_class === 'REVIEW_RECOMMENDATION' && !(REVIEW_ACTIONS as readonly string[]).includes(n.recommended_action ?? '')) add('INVALID_LEAF', `Review outcome ${n.id} has no recommended action`, n.id);
        if ((n.outcome_class === 'MODEL_ESTIMATE') !== (tree.tree_type === 'STATISTICAL_MODEL')) add('INVALID_LEAF', `MODEL_ESTIMATE outcomes belong to statistical model trees only`, n.id);
        for (const c of cons) {
          refs(c.evidence_ids, n.id, null);
          if (!(OUTCOME_CLASSES as readonly string[]).includes(c.basis)) add('INVALID_LEAF', `Consequence of ${n.id} has an unknown basis`, n.id);
          if (c.basis === 'VERIFIED_SOURCE_GROUNDED' && !allCanon(c.evidence_ids)) add('UNVERIFIED_CLAIM', `Outcome ${n.id} claims a source-grounded consequence without verified canonical production evidence`, n.id);
          if (c.basis === 'DEPENDENCY_SUPPORTED' && !(tree.links ?? []).some((l) => l.node_id === n.id && l.kind === 'VERIFIED_DEPENDENCY')) add('UNVERIFIED_CLAIM', `Outcome ${n.id} claims dependency support without a verified dependency link`, n.id);
        }
        for (const r of n.consistency_risks ?? []) refs(r.evidence_ids, n.id, null);
        break;
      }
      case 'INSUFFICIENT_DATA':
        if (!(n.missing ?? []).length) add('INVALID_LEAF', `Insufficient-data node ${n.id} must say what is missing`, n.id);
        break;
      default:
        break;
    }
  }

  // Reachability, cycles and depth: iterative depth-first walk, bounded by the node limit.
  let depth: number | null = null;
  if (root && !issues.some((i) => i.code === 'DUPLICATE_NODE_ID' || i.code === 'ORPHAN_BRANCH')) {
    const state = new Map<string, 1 | 2>();
    const stack: Array<{ id: string; next: number; depth: number }> = [{ id: root.id, next: 0, depth: 0 }];
    state.set(root.id, 1);
    let maxDepth = 0;
    let steps = 0;
    let cyclic = false;
    while (stack.length && steps++ < DECISION_LIMITS.maxNodes * DECISION_LIMITS.maxNodes) {
      const top = stack[stack.length - 1]!;
      const branches = out.get(top.id) ?? [];
      if (top.next >= branches.length) { state.set(top.id, 2); stack.pop(); continue; }
      const b = branches[top.next++]!;
      const seen = state.get(b.to);
      if (seen === 1) { cyclic = true; add('CYCLE', `Branch ${b.id} closes a cycle through ${b.to}`, b.to, b.id); continue; }
      if (seen === 2) continue;
      state.set(b.to, 1);
      maxDepth = Math.max(maxDepth, top.depth + 1);
      stack.push({ id: b.to, next: 0, depth: top.depth + 1 });
    }
    for (const n of nodes.values()) if (!state.has(n.id)) add('UNREACHABLE_NODE', `Node ${n.id} cannot be reached from the root`, n.id);
    if (maxDepth > DECISION_LIMITS.maxDepth) add('LIMIT_EXCEEDED', `Tree depth ${maxDepth} exceeds ${DECISION_LIMITS.maxDepth}`);
    depth = cyclic ? null : maxDepth;
  }

  // Constraints, facts, links and the outcome index.
  for (const c of tree.constraints ?? []) {
    refs(c.evidence_ids, null, null);
    if (c.binding === 'CANON_CONSTRAINT' && !allCanon(c.evidence_ids)) add('UNVERIFIED_CLAIM', `Canon constraint ${c.id} is not backed by verified canonical production evidence`);
  }
  for (const [key, f] of Object.entries(tree.facts ?? {})) {
    if (!FACT_RE.test(key)) add('INVALID_ID', `Invalid fact key ${key}`);
    refs(f.evidence_ids, null, null);
    if ((f.state === 'ASSIGNED') === (f.value === null)) add('MALFORMED_PREDICATE', `Fact ${key}: a value is present exactly when the state is ASSIGNED`);
    if (f.period && f.period.start_bac < f.period.end_bac) add('MALFORMED_PREDICATE', `Fact ${key}: BAC periods count down, so start_bac must be >= end_bac`);
  }
  for (const l of tree.links ?? []) {
    if (!nodes.has(l.node_id)) add('INVALID_LINK', `Link ${l.id} belongs to an unknown node`);
    if (!(LINK_KINDS as readonly string[]).includes(l.kind)) { add('INVALID_LINK', `Link ${l.id} has an unknown kind`, l.node_id); continue; }
    if (l.kind === 'VERIFIED_DEPENDENCY') {
      if (!l.edge_id || !l.edge_type || !l.edge_status) add('INVALID_LINK', `Verified dependency ${l.id} must cite a graph edge`, l.node_id);
      else if (NON_DEPENDENCY_EDGE_TYPES.includes(l.edge_type)) add('INVALID_LINK', `${l.edge_type} can never be a verified dependency (link ${l.id})`, l.node_id);
      else if (l.edge_status === 'CANDIDATE') add('INVALID_LINK', `A candidate edge cannot be a verified dependency (link ${l.id})`, l.node_id);
    }
    if (l.kind === 'CANDIDATE_IMPACT' && !l.edge_id) add('INVALID_LINK', `Candidate impact ${l.id} must cite the graph edge it rests on`, l.node_id);
    if (l.kind === 'SPECULATIVE_OUTCOME' && l.edge_id) add('INVALID_LINK', `Speculative link ${l.id} must not cite a graph edge`, l.node_id);
  }
  const leaves = [...nodes.values()].filter((n) => LEAF_TYPES.has(n.type)).map((n) => n.id).sort();
  if (JSON.stringify(leaves) !== JSON.stringify([...(tree.outcomes ?? [])])) add('OUTCOME_INDEX_MISMATCH', 'outcomes must list every leaf node id in sorted order');
  return done(depth);
}

export function assertValidDecisionTree(tree: DecisionTree): void {
  const v = validateDecisionTree(tree);
  if (!v.ok) throw new Error(`Invalid decision tree ${tree.tree_id}: ${v.issues.slice(0, 5).map((i) => `${i.code} ${i.message}`).join('; ')}`);
}

/** Branches leaving each node, in declared order. */
export function branchIndex(tree: DecisionTree): Map<string, DecisionBranch[]> {
  const out = new Map<string, DecisionBranch[]>();
  for (const b of tree.branches) out.set(b.from, [...(out.get(b.from) ?? []), b]);
  return out;
}

export interface DecisionPath {
  /** Branch ids from the root to the leaf. */
  branches: string[];
  nodes: string[];
  leaf: string;
}

/** Every root-to-leaf path of a validated tree. Iterative; stops at the path limit. */
export function enumeratePaths(tree: DecisionTree): DecisionPath[] {
  const out = branchIndex(tree);
  const paths: DecisionPath[] = [];
  const stack: Array<{ node: string; branches: string[]; nodes: string[] }> = [{ node: tree.root_node_id, branches: [], nodes: [tree.root_node_id] }];
  let steps = 0;
  while (stack.length && paths.length < DECISION_LIMITS.maxPaths && steps++ < DECISION_LIMITS.maxNodes * DECISION_LIMITS.maxPaths) {
    const cur = stack.pop()!;
    const next = out.get(cur.node) ?? [];
    if (!next.length) { paths.push({ branches: cur.branches, nodes: cur.nodes, leaf: cur.node }); continue; }
    if (cur.nodes.length > DECISION_LIMITS.maxDepth + 1) continue;
    for (const b of [...next].reverse()) {
      if (cur.nodes.includes(b.to)) continue;
      stack.push({ node: b.to, branches: [...cur.branches, b.id], nodes: [...cur.nodes, b.to] });
    }
  }
  return paths;
}

/**
 * Review lifecycle of a decision or candidate direction. Approval for authoring is not
 * ratification: RATIFIED_EXTERNALLY needs verified publication evidence in the production
 * repository and can never be reached from a control in this application.
 */
export const REVIEW_TRANSITIONS: Readonly<Record<ProposalReviewStatus, readonly ProposalReviewStatus[]>> = Object.freeze({
  IDEA: ['EXPLORING', 'REJECTED'],
  EXPLORING: ['IDEA', 'PROPOSED', 'APPROVED_FOR_AUTHORING', 'REJECTED'],
  PROPOSED: ['EXPLORING', 'UNDER_REVIEW', 'APPROVED_FOR_AUTHORING', 'REJECTED'],
  UNDER_REVIEW: ['NEEDS_REVISION', 'APPROVED_FOR_AUTHORING', 'REJECTED'],
  NEEDS_REVISION: ['EXPLORING', 'PROPOSED', 'APPROVED_FOR_AUTHORING', 'REJECTED'],
  REJECTED: ['IDEA', 'EXPLORING'],
  APPROVED_FOR_AUTHORING: ['UNDER_REVIEW', 'NEEDS_REVISION', 'REJECTED', 'RATIFIED_EXTERNALLY'],
  RATIFIED_EXTERNALLY: [],
});

export interface RatificationEvidence { repository: string; commit_sha: string; path: string; verified: boolean }

export function transitionDecisionReview(
  current: ProposalReviewStatus,
  next: ProposalReviewStatus,
  evidence: RatificationEvidence | null = null,
): { status: ProposalReviewStatus; canon_changed: false; ratification_evidence: RatificationEvidence | null } {
  if (!(PROPOSAL_REVIEW_STATUSES as readonly string[]).includes(next)) throw new Error(`Unknown review status ${String(next)}`);
  if (current === next) return { status: current, canon_changed: false, ratification_evidence: null };
  if (!REVIEW_TRANSITIONS[current].includes(next)) throw new Error(`Review status cannot move from ${current} to ${next}`);
  if (next === 'RATIFIED_EXTERNALLY') {
    if (!evidence || !evidence.verified || evidence.repository !== ALLOWED_REPOSITORIES[0] || !SHA_RE.test(evidence.commit_sha) || !evidence.path.trim()) {
      throw new Error('RATIFIED_EXTERNALLY requires verified publication evidence in Reltroner/reltroner-studio (commit SHA and path). Approval for authoring is not ratification.');
    }
    return { status: next, canon_changed: false, ratification_evidence: evidence };
  }
  return { status: next, canon_changed: false, ratification_evidence: null };
}
