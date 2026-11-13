/**
 * Deterministic decision evaluation with three-valued logic. Pure and isomorphic: the pipeline,
 * the browser workspace and the tests run exactly this code.
 *
 * Rules that never bend:
 *  - UNKNOWN is a result, not a failure, and it is never coerced to FALSE. A condition without a
 *    branch for UNKNOWN stops the evaluation as NOT_EVALUABLE with the reason.
 *  - An unassigned value (NULL or MISSING) is not equal to anything, and null is not zero.
 *  - A numeric comparison across different units is UNKNOWN.
 *  - The evaluator never chooses a creative option. DECISION and REVIEW_GATE nodes wait for the
 *    creator; a path that contains a creator choice is not a system recommendation.
 *  - Predicates are data interpreted by the closed operator set. Nothing is executed as code.
 */
import {
  DECISION_LIMITS,
  branchIndex,
  predicateEvidence,
  type DecisionBranch,
  type DecisionFact,
  type DecisionNode,
  type DecisionNodeType,
  type DecisionTree,
  type EvidenceStatus,
  type OutcomeClass,
  type Predicate,
  type ReviewAction,
  type Scalar,
  type TruthValue,
} from '../../domain/decision.ts';

export interface ConditionTrace {
  op: Predicate['op'];
  /** The condition in words. */
  statement: string;
  /** What was observed for the operands. */
  observed: string;
  result: TruthValue;
  reason: string;
  terms: ConditionTrace[];
}

export interface EvaluationContext {
  facts: Readonly<Record<string, DecisionFact>>;
  evidence: ReadonlyMap<string, EvidenceStatus>;
}

const show = (v: Scalar | undefined): string => (v === undefined ? '(not supplied)' : v === null ? 'null' : typeof v === 'string' ? `"${v}"` : String(v));
const showFact = (f: DecisionFact | undefined): string =>
  !f ? 'not supplied' : f.state !== 'ASSIGNED' ? `${f.state} (unassigned)` : `${show(f.value)}${f.unit ? ` ${f.unit}` : ''}`;
const leaf = (p: Predicate, statement: string, observed: string, result: TruthValue, reason: string): ConditionTrace => ({ op: p.op, statement, observed, result, reason, terms: [] });

/** Kleene three-valued connectives. */
export function allOf(values: readonly TruthValue[]): TruthValue {
  return values.includes('FALSE') ? 'FALSE' : values.includes('UNKNOWN') ? 'UNKNOWN' : 'TRUE';
}
export function anyOf(values: readonly TruthValue[]): TruthValue {
  return values.includes('TRUE') ? 'TRUE' : values.includes('UNKNOWN') ? 'UNKNOWN' : 'FALSE';
}
export function negate(value: TruthValue): TruthValue {
  return value === 'TRUE' ? 'FALSE' : value === 'FALSE' ? 'TRUE' : 'UNKNOWN';
}

export function evaluatePredicate(p: Predicate, ctx: EvaluationContext, depth = 1): ConditionTrace {
  if (depth > DECISION_LIMITS.maxPredicateDepth) return leaf(p, 'nested condition', 'not evaluated', 'UNKNOWN', 'Condition nesting exceeds the supported depth.');
  const f = p.fact !== undefined ? ctx.facts[p.fact] : undefined;
  const name = p.fact ?? '';
  const assigned = (): ConditionTrace | null => {
    if (!f) return leaf(p, name, 'not supplied', 'UNKNOWN', `Fact "${name}" was not supplied.`);
    if (f.state !== 'ASSIGNED') return leaf(p, name, showFact(f), 'UNKNOWN', `Fact "${name}" is ${f.state}: an unassigned value cannot be compared, and null is not zero.`);
    return null;
  };
  const numeric = (): ConditionTrace | null => {
    const missing = assigned();
    if (missing) return missing;
    if (typeof f!.value !== 'number') return leaf(p, name, showFact(f), 'UNKNOWN', `Fact "${name}" is not numeric.`);
    if (p.unit && f!.unit !== p.unit) return leaf(p, name, showFact(f), 'UNKNOWN', `Unit mismatch: fact is in ${f!.unit ?? 'no unit'}, the condition expects ${p.unit}.`);
    return null;
  };
  const unit = p.unit ? ` ${p.unit}` : '';
  switch (p.op) {
    case 'EQUALS':
    case 'NOT_EQUALS': {
      const statement = `${name} ${p.op === 'EQUALS' ? '=' : '≠'} ${show(p.value)}${unit}`;
      const missing = assigned();
      if (missing) return { ...missing, statement };
      if (p.unit && f!.unit !== p.unit) return leaf(p, statement, showFact(f), 'UNKNOWN', `Unit mismatch: fact is in ${f!.unit ?? 'no unit'}, the condition expects ${p.unit}.`);
      const equal = f!.value === p.value;
      const result: TruthValue = (p.op === 'EQUALS') === equal ? 'TRUE' : 'FALSE';
      return leaf(p, statement, showFact(f), result, `${name} is ${showFact(f)}.`);
    }
    case 'GREATER_THAN':
    case 'LESS_THAN': {
      const statement = `${name} ${p.op === 'GREATER_THAN' ? '>' : '<'} ${show(p.value)}${unit}`;
      const problem = numeric();
      if (problem) return { ...problem, statement };
      const v = f!.value as number;
      const result: TruthValue = (p.op === 'GREATER_THAN' ? v > (p.value as number) : v < (p.value as number)) ? 'TRUE' : 'FALSE';
      return leaf(p, statement, showFact(f), result, `${name} is ${showFact(f)}.`);
    }
    case 'WITHIN_RANGE': {
      const statement = `${show(p.min)} ≤ ${name} ≤ ${show(p.max)}${unit}`;
      const problem = numeric();
      if (problem) return { ...problem, statement };
      const v = f!.value as number;
      return leaf(p, statement, showFact(f), v >= p.min! && v <= p.max! ? 'TRUE' : 'FALSE', `${name} is ${showFact(f)}.`);
    }
    case 'PRESENT':
    case 'MISSING': {
      const statement = `${name} is ${p.op === 'PRESENT' ? 'assigned' : 'unassigned'}`;
      if (!f) return leaf(p, statement, 'not supplied', 'UNKNOWN', `Fact "${name}" was not supplied, so its presence is unknown.`);
      const present = f.state === 'ASSIGNED';
      return leaf(p, statement, showFact(f), (p.op === 'PRESENT') === present ? 'TRUE' : 'FALSE', `Source state of ${name}: ${f.state}.`);
    }
    case 'MEMBER_OF': {
      const statement = `${name} is one of ${(p.values ?? []).map(show).join(', ')}`;
      const missing = assigned();
      if (missing) return { ...missing, statement };
      return leaf(p, statement, showFact(f), (p.values ?? []).some((v) => v === f!.value) ? 'TRUE' : 'FALSE', `${name} is ${showFact(f)}.`);
    }
    case 'CANON_STATUS_IS': {
      const statement = `canon status of ${name} is ${(p.statuses ?? []).join(' or ')}`;
      if (!f || f.canon_status === null) return leaf(p, statement, f ? 'no status' : 'not supplied', 'UNKNOWN', `No canon status is recorded for "${name}".`);
      return leaf(p, statement, f.canon_status, (p.statuses ?? []).includes(f.canon_status) ? 'TRUE' : 'FALSE', `${name} is ${f.canon_status}.`);
    }
    case 'EVIDENCE_VERIFIED': {
      const ids = p.evidence_ids ?? [];
      const statement = `evidence ${ids.join(', ')} is verified in the pinned source`;
      const states = ids.map((id) => ctx.evidence.get(id));
      const observed = ids.map((id, i) => `${id}: ${states[i] ?? 'undefined'}`).join('; ');
      if (states.some((s) => s === undefined)) return leaf(p, statement, observed, 'UNKNOWN', 'An evidence item is not defined in this tree.');
      const ok = states.every((s) => s === 'VERIFIED');
      return leaf(p, statement, observed, ok ? 'TRUE' : 'FALSE', ok ? 'Every cited passage was found in the pinned blob.' : 'At least one cited passage was not found in the pinned source.');
    }
    case 'COMPATIBLE_PERIOD': {
      const a = ctx.facts[p.a ?? ''];
      const b = ctx.facts[p.b ?? ''];
      const statement = `${p.a} and ${p.b} refer to overlapping historical periods`;
      if (!a?.period || !b?.period) return leaf(p, statement, `${p.a}: ${a?.period ? `${a.period.start_bac}–${a.period.end_bac} BAC` : 'no period'}; ${p.b}: ${b?.period ? `${b.period.start_bac}–${b.period.end_bac} BAC` : 'no period'}`, 'UNKNOWN', 'A period is not recorded for both observations.');
      const overlap = a.period.start_bac >= b.period.end_bac && b.period.start_bac >= a.period.end_bac;
      return leaf(p, statement, `${a.period.start_bac}–${a.period.end_bac} BAC and ${b.period.start_bac}–${b.period.end_bac} BAC`, overlap ? 'TRUE' : 'FALSE', overlap ? 'The periods overlap.' : 'The periods do not overlap.');
    }
    case 'COMPATIBLE_UNIT': {
      const a = ctx.facts[p.a ?? ''];
      const b = ctx.facts[p.b ?? ''];
      const statement = `${p.a} and ${p.b} use the same unit`;
      if (!a?.unit || !b?.unit) return leaf(p, statement, `${p.a}: ${a?.unit ?? 'no unit'}; ${p.b}: ${b?.unit ?? 'no unit'}`, 'UNKNOWN', 'A unit is not recorded for both values.');
      return leaf(p, statement, `${a.unit} and ${b.unit}`, a.unit === b.unit ? 'TRUE' : 'FALSE', a.unit === b.unit ? 'Units match.' : 'Units differ.');
    }
    case 'ALL':
    case 'ANY':
    case 'NOT': {
      const terms = (p.of ?? []).map((t) => evaluatePredicate(t, ctx, depth + 1));
      const values = terms.map((t) => t.result);
      const result = p.op === 'ALL' ? allOf(values) : p.op === 'ANY' ? anyOf(values) : negate(values[0] ?? 'UNKNOWN');
      const joiner = p.op === 'ALL' ? ' and ' : p.op === 'ANY' ? ' or ' : '';
      const statement = p.op === 'NOT' ? `not (${terms[0]?.statement ?? ''})` : terms.map((t) => `(${t.statement})`).join(joiner);
      const decisive = terms.find((t) => (p.op === 'ALL' ? t.result === 'FALSE' : p.op === 'ANY' ? t.result === 'TRUE' : true));
      const unknown = terms.find((t) => t.result === 'UNKNOWN');
      const reason = result === 'UNKNOWN' ? (unknown?.reason ?? 'A term is unknown.') : (decisive ?? terms[0])?.reason ?? '';
      return { op: p.op, statement, observed: terms.map((t) => t.result).join(', '), result, reason, terms };
    }
    default:
      return leaf(p, String((p as Predicate).op), 'not evaluated', 'UNKNOWN', 'Unsupported operator.');
  }
}

export type PathStatus = 'RESOLVED' | 'AWAITING_CHOICE' | 'BLOCKED_BY_CONSTRAINT' | 'NOT_EVALUABLE' | 'INSUFFICIENT_DATA';
export type StepAction = 'CONTINUE' | 'CONDITION' | 'CREATOR_CHOICE' | 'REVIEW_DECISION' | 'LEAF';

export interface OptionState {
  branch_id: string;
  label: string;
  to: string;
  availability: 'AVAILABLE' | 'BLOCKED' | 'CONSTRAINT_UNKNOWN';
  reason: string;
  guard: ConditionTrace | null;
}

export interface PathStep {
  node_id: string;
  node_type: DecisionNodeType;
  node_label: string;
  action: StepAction;
  question: string | null;
  branch_id: string | null;
  branch_label: string | null;
  condition: ConditionTrace | null;
  evidence_ids: string[];
}

export interface DecisionPathResult {
  tree_id: string;
  rules_version: string;
  production_source_sha: string;
  remodeling_source_sha: string;
  status: PathStatus;
  start_node_id: string;
  visited: string[];
  branches_taken: string[];
  steps: PathStep[];
  conditions: Array<{ node_id: string; trace: ConditionTrace }>;
  unknown_conditions: Array<{ node_id: string; reason: string }>;
  evidence_consulted: string[];
  outcome_node_id: string | null;
  outcome_class: OutcomeClass | null;
  recommended_action: ReviewAction | null;
  /** SYSTEM_EVIDENCE_BASED only when every step was decided by a rule; a creator choice is never a system recommendation. */
  recommendation_kind: 'SYSTEM_EVIDENCE_BASED' | 'CREATOR_SELECTED' | 'NONE';
  pending: { node_id: string; question: string; review_gate: boolean; options: OptionState[] } | null;
  explanation: string[];
}

export interface DecisionInput {
  facts?: Readonly<Record<string, DecisionFact>>;
  /** Creator selections: node id of a DECISION or REVIEW_GATE to the id of the chosen branch. */
  choices?: Readonly<Record<string, string>>;
}

function optionStates(branches: readonly DecisionBranch[], ctx: EvaluationContext): OptionState[] {
  return branches.map((b) => {
    if (!b.guard) return { branch_id: b.id, label: b.label, to: b.to, availability: 'AVAILABLE', reason: 'No canon constraint restricts this option.', guard: null };
    const guard = evaluatePredicate(b.guard, ctx);
    return guard.result === 'TRUE'
      ? { branch_id: b.id, label: b.label, to: b.to, availability: 'AVAILABLE', reason: `Constraint satisfied: ${guard.statement}.`, guard }
      : guard.result === 'FALSE'
        ? { branch_id: b.id, label: b.label, to: b.to, availability: 'BLOCKED', reason: `Blocked by a verified canon constraint: ${guard.reason}`, guard }
        : { branch_id: b.id, label: b.label, to: b.to, availability: 'CONSTRAINT_UNKNOWN', reason: `The constraint could not be evaluated: ${guard.reason}`, guard };
  });
}

export function contextFor(tree: DecisionTree, facts?: Readonly<Record<string, DecisionFact>>): EvaluationContext {
  return { facts: { ...tree.facts, ...(facts ?? {}) }, evidence: new Map(tree.evidence.map((e) => [e.id, e.status])) };
}

/** Options of a DECISION or REVIEW_GATE node with their constraint state. */
export function optionsAt(tree: DecisionTree, nodeId: string, facts?: Readonly<Record<string, DecisionFact>>): OptionState[] {
  return optionStates(branchIndex(tree).get(nodeId) ?? [], contextFor(tree, facts));
}

/**
 * Walk the tree from the root. The tree must already have passed validateDecisionTree; the walk is
 * still bounded by the node limit so a malformed structure cannot loop.
 */
export function evaluateDecisionTree(tree: DecisionTree, input: DecisionInput = {}): DecisionPathResult {
  const ctx = contextFor(tree, input.facts);
  const nodes = new Map(tree.nodes.map((n) => [n.id, n]));
  const out = branchIndex(tree);
  const choices = input.choices ?? {};
  const result: DecisionPathResult = {
    tree_id: tree.tree_id, rules_version: tree.rules_version, production_source_sha: tree.production_source_sha, remodeling_source_sha: tree.remodeling_source_sha,
    status: 'NOT_EVALUABLE', start_node_id: tree.root_node_id, visited: [], branches_taken: [], steps: [], conditions: [], unknown_conditions: [], evidence_consulted: [],
    outcome_node_id: null, outcome_class: null, recommended_action: null, recommendation_kind: 'NONE', pending: null, explanation: [],
  };
  const consult = (ids: readonly string[]) => { for (const id of ids) if (!result.evidence_consulted.includes(id)) result.evidence_consulted.push(id); };
  const step = (n: DecisionNode, action: StepAction, branch: DecisionBranch | null, condition: ConditionTrace | null) => {
    const ids = [...n.evidence_ids, ...(branch?.evidence_ids ?? [])];
    consult(ids);
    result.steps.push({ node_id: n.id, node_type: n.type, node_label: n.label, action, question: n.question ?? null, branch_id: branch?.id ?? null, branch_label: branch?.label ?? null, condition, evidence_ids: [...new Set(ids)] });
    if (branch) result.branches_taken.push(branch.id);
  };
  let creatorChoices = 0;
  let current: DecisionNode | undefined = nodes.get(tree.root_node_id);
  if (!current) { result.explanation.push('The tree has no root node.'); return result; }
  result.explanation.push(`Started at "${current.label}".`);

  for (let guard = 0; current && guard <= DECISION_LIMITS.maxNodes; guard++) {
    const node: DecisionNode = current;
    if (result.visited.includes(node.id)) { result.explanation.push(`Stopped: node "${node.label}" was reached twice, so the structure is not a tree.`); break; }
    result.visited.push(node.id);
    const branches = out.get(node.id) ?? [];
    if (node.type === 'OUTCOME' || node.type === 'INSUFFICIENT_DATA') {
      step(node, 'LEAF', null, null);
      result.outcome_node_id = node.id;
      if (node.type === 'OUTCOME') {
        result.status = 'RESOLVED';
        result.outcome_class = node.outcome_class ?? null;
        result.recommended_action = node.recommended_action ?? null;
        result.explanation.push(`Reached outcome "${node.label}" (${node.outcome_class}).`);
        if (node.recommended_action) result.explanation.push(`Recommended review action: ${node.recommended_action}. This is a recommendation for a reviewer; no canon is changed.`);
      } else {
        result.status = 'INSUFFICIENT_DATA';
        result.explanation.push(`Stopped at "${node.label}": ${(node.missing ?? []).join('; ') || 'required information is not available'}.`);
      }
      break;
    }
    if (node.type === 'ROOT' || node.type === 'EVIDENCE') {
      const b = branches[0];
      if (!b) { result.explanation.push(`Stopped: "${node.label}" has no continuation.`); break; }
      step(node, 'CONTINUE', b, null);
      if (node.type === 'EVIDENCE') result.explanation.push(`Consulted evidence at "${node.label}" (${node.evidence_ids.length} item(s)).`);
      current = nodes.get(b.to);
      continue;
    }
    if (node.type === 'CONDITION') {
      const trace = node.predicate ? evaluatePredicate(node.predicate, ctx) : leaf({ op: 'ALL' }, 'missing condition', 'not evaluated', 'UNKNOWN', 'The node has no condition.');
      result.conditions.push({ node_id: node.id, trace });
      consult(predicateEvidence(node.predicate));
      if (trace.result === 'UNKNOWN') result.unknown_conditions.push({ node_id: node.id, reason: trace.reason });
      const b = branches.find((x) => x.when === trace.result);
      if (!b) {
        step(node, 'CONDITION', null, trace);
        result.status = 'NOT_EVALUABLE';
        result.explanation.push(`Stopped: condition "${node.question ?? node.label}" is ${trace.result} (${trace.reason}) and the tree defines no branch for that result. An unknown result is never treated as false.`);
        break;
      }
      step(node, 'CONDITION', b, trace);
      result.explanation.push(`Condition "${node.question ?? node.label}" evaluated ${trace.result}: ${trace.reason} Took branch "${b.label}".`);
      current = nodes.get(b.to);
      continue;
    }
    // DECISION or REVIEW_GATE: only the creator selects.
    const options = optionStates(branches, ctx);
    const chosenId = choices[node.id];
    const review = node.type === 'REVIEW_GATE';
    if (chosenId === undefined) {
      step(node, review ? 'REVIEW_DECISION' : 'CREATOR_CHOICE', null, null);
      result.status = 'AWAITING_CHOICE';
      result.pending = { node_id: node.id, question: node.question ?? node.label, review_gate: review, options };
      result.explanation.push(`Waiting for the creator at "${node.question ?? node.label}" (${options.length} options). The system does not choose ${review ? 'a review decision' : 'a creative direction'}.`);
      break;
    }
    const b = branches.find((x) => x.id === chosenId);
    const state = options.find((o) => o.branch_id === chosenId);
    if (!b || !state) {
      step(node, review ? 'REVIEW_DECISION' : 'CREATOR_CHOICE', null, null);
      result.status = 'NOT_EVALUABLE';
      result.explanation.push(`Stopped: "${chosenId}" is not an option of "${node.question ?? node.label}".`);
      break;
    }
    creatorChoices++;
    if (state.guard) result.conditions.push({ node_id: node.id, trace: state.guard });
    if (b.guard) consult(predicateEvidence(b.guard));
    if (state.availability === 'BLOCKED') {
      step(node, review ? 'REVIEW_DECISION' : 'CREATOR_CHOICE', b, state.guard);
      result.status = 'BLOCKED_BY_CONSTRAINT';
      result.explanation.push(`The creator selected "${b.label}", but the option is blocked. ${state.reason}`);
      break;
    }
    if (state.availability === 'CONSTRAINT_UNKNOWN') result.unknown_conditions.push({ node_id: node.id, reason: state.reason });
    step(node, review ? 'REVIEW_DECISION' : 'CREATOR_CHOICE', b, state.guard);
    result.explanation.push(`The creator selected "${b.label}" at "${node.question ?? node.label}". This is a creator ${review ? 'review decision' : 'choice'}, not a system recommendation.`);
    current = nodes.get(b.to);
  }
  if (result.status === 'NOT_EVALUABLE' && result.explanation.length === 1) result.explanation.push('Stopped: the evaluation did not reach a leaf within the node limit.');
  result.recommendation_kind = creatorChoices > 0 ? 'CREATOR_SELECTED' : result.status === 'RESOLVED' ? 'SYSTEM_EVIDENCE_BASED' : 'NONE';
  return result;
}

/** Isomorphic 48-bit string hash rendered as 12 uppercase hex characters. Identifier only, not a security digest. */
export function stableHex12(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`.slice(0, 12).toUpperCase();
}

/** Stable identifier of a walked path: the tree and the ordered branches taken. */
export function pathId(treeId: string, branchesTaken: readonly string[]): string {
  return `DTP-${stableHex12(`${treeId}|${branchesTaken.join('>')}`)}`;
}

export interface EnumeratedEvaluation {
  path_id: string;
  choices: Record<string, string>;
  result: DecisionPathResult;
}

/**
 * Every terminal evaluation of a tree: conditions follow the facts, creator choices fan out over
 * every option (blocked options yield their BLOCKED_BY_CONSTRAINT result). Bounded by the path limit.
 */
export function enumerateEvaluations(tree: DecisionTree, facts?: Readonly<Record<string, DecisionFact>>): EnumeratedEvaluation[] {
  const done: EnumeratedEvaluation[] = [];
  const queue: Array<Record<string, string>> = [{}];
  let guard = 0;
  while (queue.length && done.length < DECISION_LIMITS.maxPaths && guard++ < DECISION_LIMITS.maxPaths * DECISION_LIMITS.maxFanout) {
    const choices = queue.shift()!;
    const result = evaluateDecisionTree(tree, { facts, choices });
    if (result.status === 'AWAITING_CHOICE' && result.pending) {
      for (const o of result.pending.options) queue.push({ ...choices, [result.pending.node_id]: o.branch_id });
      continue;
    }
    done.push({ path_id: pathId(tree.tree_id, result.branches_taken), choices, result });
  }
  return done.sort((a, b) => (a.path_id < b.path_id ? -1 : a.path_id > b.path_id ? 1 : 0));
}
