import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECISION_LIMITS,
  PREDICATE_OPS,
  REVIEW_TRANSITIONS,
  enumeratePaths,
  predicateIssues,
  transitionDecisionReview,
  validateDecisionTree,
  type DecisionIssueCode,
  type DecisionTree,
  type Predicate,
} from '../../src/domain/decision.ts';
import { PROPOSAL_REVIEW_STATUSES } from '../../src/domain/creative.ts';
import { allOf, anyOf, enumerateEvaluations, evaluateDecisionTree, evaluatePredicate, negate, pathId } from '../../src/engine/decision-intelligence/evaluate.ts';
import { canonicalJson } from '../../src/engine/canonical.ts';
import { SYN_PROD, evidence, fact, syntheticTree } from '../fixtures/decision-fixture.ts';

const codes = (t: DecisionTree) => new Set(validateDecisionTree(t).issues.map((i) => i.code));
const expectCode = (t: DecisionTree, code: DecisionIssueCode) => assert.ok(codes(t).has(code), `expected ${code}, got ${[...codes(t)].join(', ') || 'no issues'}`);
const edit = (fn: (t: DecisionTree) => void): DecisionTree => { const t = syntheticTree(); fn(t); return t; };

test('a well-formed decision tree validates and reports its depth', () => {
  const v = validateDecisionTree(syntheticTree());
  assert.deepEqual(v.issues, []);
  assert.equal(v.ok, true);
  assert.equal(v.depth, 4);
  assert.equal(enumeratePaths(syntheticTree()).length, 4);
});

test('structural defects are rejected: duplicate ids, missing or multiple roots, orphans, invalid parents', () => {
  expectCode(edit((t) => { t.nodes.push({ ...t.nodes[4]! }); }), 'DUPLICATE_NODE_ID');
  expectCode(edit((t) => { t.branches.push({ ...t.branches[5]! }); }), 'DUPLICATE_BRANCH_ID');
  expectCode(edit((t) => { t.root_node_id = 'nowhere'; }), 'MISSING_ROOT');
  expectCode(edit((t) => { t.nodes = t.nodes.filter((n) => n.type !== 'ROOT'); t.branches = t.branches.filter((b) => b.from !== 'root'); }), 'MISSING_ROOT');
  expectCode(edit((t) => { t.nodes.push({ id: 'root-2', type: 'ROOT', label: 'Second root', description: '', evidence_ids: [] }); }), 'MULTIPLE_ROOTS');
  expectCode(edit((t) => { t.branches[5]!.to = 'ghost'; }), 'ORPHAN_BRANCH');
  expectCode(edit((t) => { t.branches.push({ ...t.branches[5]!, id: 'from-leaf', from: 'out-a', to: 'out-low' }); }), 'INVALID_PARENT');
  expectCode(edit((t) => { t.branches.push({ ...t.branches[5]!, id: 'to-root', from: 'choose', to: 'root', label: 'Back to root' }); }), 'INVALID_PARENT');
});

test('cycles, shared children and unreachable nodes are rejected in a strict tree', () => {
  // A branch from the decision back to the condition that leads to it closes a cycle.
  const cyclic = edit((t) => { t.branches.push({ ...t.branches[5]!, id: 'loop', from: 'choose', to: 'gate', label: 'Loop back' }); });
  expectCode(cyclic, 'CYCLE');
  expectCode(cyclic, 'MULTIPLE_PARENTS');
  assert.equal(validateDecisionTree(cyclic).depth, null);
  expectCode(edit((t) => { t.branches.push({ ...t.branches[5]!, id: 'self', from: 'choose', to: 'choose', label: 'Self' }); }), 'CYCLE');
  // Two parents without a cycle is still not a strict tree.
  expectCode(edit((t) => { t.branches.push({ ...t.branches[5]!, id: 'share', from: 'choose', to: 'out-low', label: 'Shared leaf' }); }), 'MULTIPLE_PARENTS');
  const island = edit((t) => { t.nodes.push({ id: 'island', type: 'INSUFFICIENT_DATA', label: 'Island', description: '', evidence_ids: [], missing: ['x'] }); t.outcomes = [...t.outcomes, 'island'].sort(); });
  expectCode(island, 'UNREACHABLE_NODE');
});

test('decisions need defined options, conditions need valid branches, and only outcomes may end a path', () => {
  expectCode(edit((t) => { t.branches = t.branches.filter((b) => b.id !== 'opt-b'); t.nodes = t.nodes.filter((n) => n.id !== 'out-b'); t.outcomes = t.outcomes.filter((o) => o !== 'out-b'); }), 'UNDEFINED_DECISION_OPTIONS');
  expectCode(edit((t) => { t.branches.find((b) => b.id === 'opt-b')!.label = 'Option A'; }), 'UNDEFINED_DECISION_OPTIONS');
  expectCode(edit((t) => { t.branches.find((b) => b.id === 'opt-a')!.label = ' '; }), 'UNDEFINED_DECISION_OPTIONS');
  expectCode(edit((t) => { t.branches.find((b) => b.id === 'b-low')!.when = 'TRUE'; }), 'BRANCH_CONDITION_INVALID');
  expectCode(edit((t) => { t.branches.find((b) => b.id === 'b-low')!.when = null; }), 'BRANCH_CONDITION_INVALID');
  expectCode(edit((t) => { t.branches.find((b) => b.id === 'b-root')!.when = 'TRUE'; }), 'BRANCH_CONDITION_INVALID');
  expectCode(edit((t) => { t.branches.find((b) => b.id === 'b-low')!.guard = { op: 'PRESENT', fact: 'score' }; }), 'BRANCH_CONDITION_INVALID');
  // A decision with no continuation is not a valid leaf.
  expectCode(edit((t) => { t.branches = t.branches.filter((b) => b.from !== 'choose'); }), 'INVALID_LEAF');
  expectCode(edit((t) => { delete t.nodes.find((n) => n.id === 'out-a')!.outcome_class; }), 'INVALID_LEAF');
  expectCode(edit((t) => { t.nodes.find((n) => n.id === 'out-a')!.consequences = []; }), 'INVALID_LEAF');
  expectCode(edit((t) => { delete t.nodes.find((n) => n.id === 'out-low')!.recommended_action; }), 'INVALID_LEAF');
  expectCode(edit((t) => { t.nodes.find((n) => n.id === 'no-data')!.missing = []; }), 'INVALID_LEAF');
  expectCode(edit((t) => { t.outcomes = ['out-a']; }), 'OUTCOME_INDEX_MISMATCH');
});

test('unsupported operators and malformed predicates are rejected; nothing is ever executed', () => {
  const bad: Array<[unknown, 'UNSUPPORTED_OPERATOR' | 'MALFORMED_PREDICATE']> = [
    [{ op: 'EVAL', fact: 'score', value: 'process.exit(1)' }, 'UNSUPPORTED_OPERATOR'],
    [{ op: 'REGEX', fact: 'score', value: '.*' }, 'UNSUPPORTED_OPERATOR'],
    [{ op: 'GREATER_THAN', fact: 'score', value: '10' }, 'MALFORMED_PREDICATE'],
    [{ op: 'GREATER_THAN', fact: 'score', value: Number.NaN }, 'MALFORMED_PREDICATE'],
    [{ op: 'WITHIN_RANGE', fact: 'score', min: 5, max: 1 }, 'MALFORMED_PREDICATE'],
    [{ op: 'EQUALS', fact: 'Not A Key', value: 1 }, 'MALFORMED_PREDICATE'],
    [{ op: 'EQUALS', fact: 'score', value: { nested: true } }, 'MALFORMED_PREDICATE'],
    [{ op: 'MEMBER_OF', fact: 'score', values: [] }, 'MALFORMED_PREDICATE'],
    [{ op: 'NOT', of: [{ op: 'PRESENT', fact: 'a' }, { op: 'PRESENT', fact: 'b' }] }, 'MALFORMED_PREDICATE'],
    [{ op: 'CANON_STATUS_IS', fact: 'score', statuses: ['MADE_UP'] }, 'MALFORMED_PREDICATE'],
    [{ op: 'COMPATIBLE_UNIT', a: 'score' }, 'MALFORMED_PREDICATE'],
  ];
  for (const [p, code] of bad) assert.ok(predicateIssues(p as Predicate).some((i) => i.code === code), `${JSON.stringify(p)} should be ${code}`);
  let deep: Predicate = { op: 'PRESENT', fact: 'score' };
  for (let i = 0; i < DECISION_LIMITS.maxPredicateDepth + 1; i++) deep = { op: 'NOT', of: [deep] };
  assert.ok(predicateIssues(deep).some((i) => i.message.includes('nesting')));
  expectCode(edit((t) => { t.nodes.find((n) => n.id === 'gate')!.predicate = { op: 'EVAL' } as unknown as Predicate; }), 'UNSUPPORTED_OPERATOR');
  assert.equal(PREDICATE_OPS.includes('EVAL' as never), false);
  // The evaluator treats an operator outside the closed set as UNKNOWN instead of running anything.
  const trace = evaluatePredicate({ op: 'EVAL', fact: 'score', value: 'globalThis.hacked = true' } as unknown as Predicate, { facts: { score: fact(1) }, evidence: new Map() });
  assert.equal(trace.result, 'UNKNOWN');
  assert.equal((globalThis as Record<string, unknown>).hacked, undefined);
});

test('limits, source identities, evidence and canon status are enforced', () => {
  expectCode(edit((t) => { for (let i = 0; i < DECISION_LIMITS.maxNodes; i++) t.nodes.push({ id: `extra-${i}`, type: 'INSUFFICIENT_DATA', label: 'x', description: '', evidence_ids: [], missing: ['x'] }); }), 'LIMIT_EXCEEDED');
  const wide = edit((t) => {
    for (let i = 0; i < DECISION_LIMITS.maxFanout; i++) {
      t.nodes.push({ id: `wide-${i}`, type: 'INSUFFICIENT_DATA', label: `Wide ${i}`, description: '', evidence_ids: [], missing: ['x'] });
      t.branches.push({ ...t.branches[5]!, id: `opt-wide-${i}`, to: `wide-${i}`, label: `Wide option ${i}` });
      t.outcomes.push(`wide-${i}`);
    }
    t.outcomes.sort();
  });
  expectCode(wide, 'LIMIT_EXCEEDED');
  expectCode(edit((t) => { t.production_source_sha = 'main'; t.source_context.production.commit_sha = 'main'; }), 'MALFORMED_SOURCE_IDENTITY');
  expectCode(edit((t) => { t.source_context.production.repository = 'Someone/else'; }), 'MALFORMED_SOURCE_IDENTITY');
  expectCode(edit((t) => { t.production_source_sha = 'f'.repeat(40); }), 'MALFORMED_SOURCE_IDENTITY');
  expectCode(edit((t) => { t.evidence[0]!.commit_sha = 'd'.repeat(40); }), 'MALFORMED_SOURCE_IDENTITY');
  expectCode(edit((t) => { t.nodes.find((n) => n.id === 'premise')!.evidence_ids = ['EV-SYN-MISSING']; }), 'UNKNOWN_EVIDENCE');
  expectCode(edit((t) => { t.evidence[0]!.blob_sha = null; }), 'MALFORMED_EVIDENCE');
  expectCode(edit((t) => { (t as { canon_status: string }).canon_status = 'CANON_OBSERVED'; }), 'CANON_STATUS_VIOLATION');
  expectCode(edit((t) => { t.creator_review_status = 'RATIFIED_EXTERNALLY'; }), 'CANON_STATUS_VIOLATION');
  expectCode(edit((t) => { t.evidence.push(evidence('EV-SYN-DRAFT', { side: 'remodeling', repository: 'Reltroner/reltroner-studio-remodeling', commit_sha: t.remodeling_source_sha, canon_status: 'CANON_OBSERVED' })); }), 'CANON_STATUS_VIOLATION');
});

test('a source-grounded claim needs verified evidence and a dependency claim needs a real dependency edge', () => {
  const claim = (t: DecisionTree, basis: 'VERIFIED_SOURCE_GROUNDED' | 'DEPENDENCY_SUPPORTED', ids: string[]) => {
    const n = t.nodes.find((x) => x.id === 'out-a')!;
    n.outcome_class = basis;
    n.consequences = [{ text: 'claim', basis, dimension: null, evidence_ids: ids }];
  };
  assert.equal(validateDecisionTree(edit((t) => claim(t, 'VERIFIED_SOURCE_GROUNDED', ['EV-SYN-1']))).ok, true);
  expectCode(edit((t) => claim(t, 'VERIFIED_SOURCE_GROUNDED', [])), 'UNVERIFIED_CLAIM');
  expectCode(edit((t) => { claim(t, 'VERIFIED_SOURCE_GROUNDED', ['EV-SYN-1']); t.evidence[0]!.status = 'NOT_FOUND'; t.evidence[0]!.quote = ''; }), 'UNVERIFIED_CLAIM');
  expectCode(edit((t) => claim(t, 'DEPENDENCY_SUPPORTED', ['EV-SYN-1'])), 'UNVERIFIED_CLAIM');
  const link = { id: 'l1', node_id: 'out-a', target_id: 'document:x', target_label: 'X', edge_id: 'E-1', detail: '' };
  assert.equal(validateDecisionTree(edit((t) => { claim(t, 'DEPENDENCY_SUPPORTED', ['EV-SYN-1']); t.links.push({ ...link, kind: 'VERIFIED_DEPENDENCY', edge_type: 'REFERENCES', edge_status: 'VERIFIED' }); })).ok, true);
  // A mention, a thematic link or a candidate edge can never be promoted to a verified dependency.
  for (const edge_type of ['MENTIONS', 'THEMATICALLY_RELATED', 'CAUSES_CANDIDATE'] as const) {
    expectCode(edit((t) => { t.links.push({ ...link, kind: 'VERIFIED_DEPENDENCY', edge_type, edge_status: 'VERIFIED' }); }), 'INVALID_LINK');
  }
  expectCode(edit((t) => { t.links.push({ ...link, kind: 'VERIFIED_DEPENDENCY', edge_type: 'CAUSES', edge_status: 'CANDIDATE' }); }), 'INVALID_LINK');
  expectCode(edit((t) => { t.links.push({ ...link, kind: 'SPECULATIVE_OUTCOME', edge_type: null, edge_status: null }); }), 'INVALID_LINK');
  expectCode(edit((t) => { t.constraints[0]!.evidence_ids = []; }), 'UNVERIFIED_CLAIM');
});

test('three-valued logic: unknown is never coerced to false, null is not zero, units must match', () => {
  assert.equal(allOf(['TRUE', 'UNKNOWN']), 'UNKNOWN');
  assert.equal(allOf(['FALSE', 'UNKNOWN']), 'FALSE');
  assert.equal(anyOf(['FALSE', 'UNKNOWN']), 'UNKNOWN');
  assert.equal(anyOf(['TRUE', 'UNKNOWN']), 'TRUE');
  assert.equal(negate('UNKNOWN'), 'UNKNOWN');
  const ctx = (facts: Record<string, ReturnType<typeof fact>>) => ({ facts, evidence: new Map([['EV-SYN-1', 'VERIFIED'], ['EV-SYN-GONE', 'NOT_FOUND']] as const) });
  const run = (p: Predicate, facts: Record<string, ReturnType<typeof fact>> = {}) => evaluatePredicate(p, ctx(facts)).result;
  assert.equal(run({ op: 'EQUALS', fact: 'x', value: 0 }, { x: fact(null) }), 'UNKNOWN', 'null is not zero');
  assert.equal(run({ op: 'EQUALS', fact: 'x', value: 0 }, { x: fact(0) }), 'TRUE');
  assert.equal(run({ op: 'EQUALS', fact: 'x', value: 0 }), 'UNKNOWN', 'missing fact');
  assert.equal(run({ op: 'NOT_EQUALS', fact: 'x', value: 1 }, { x: fact(null, { state: 'MISSING' }) }), 'UNKNOWN');
  assert.equal(run({ op: 'LESS_THAN', fact: 'x', value: 5 }, { x: fact(null) }), 'UNKNOWN', 'unassigned is not less than five');
  assert.equal(run({ op: 'GREATER_THAN', fact: 'x', value: 5, unit: 'km' }, { x: fact(9, { unit: 'miles' }) }), 'UNKNOWN', 'unit mismatch');
  assert.equal(run({ op: 'GREATER_THAN', fact: 'x', value: 5, unit: 'km' }, { x: fact(9, { unit: 'km' }) }), 'TRUE');
  assert.equal(run({ op: 'GREATER_THAN', fact: 'x', value: 5 }, { x: fact('9') }), 'UNKNOWN', 'text is not a number');
  assert.equal(run({ op: 'WITHIN_RANGE', fact: 'x', min: 1, max: 9 }, { x: fact(9) }), 'TRUE');
  assert.equal(run({ op: 'WITHIN_RANGE', fact: 'x', min: 1, max: 9 }, { x: fact(9.01) }), 'FALSE');
  assert.equal(run({ op: 'PRESENT', fact: 'x' }, { x: fact(null) }), 'FALSE', 'a declared null is known to be unassigned');
  assert.equal(run({ op: 'PRESENT', fact: 'x' }), 'UNKNOWN', 'an unsupplied fact is unknown, not absent');
  assert.equal(run({ op: 'MISSING', fact: 'x' }, { x: fact(null, { state: 'MISSING' }) }), 'TRUE');
  assert.equal(run({ op: 'MEMBER_OF', fact: 'x', values: ['a', 'b'] }, { x: fact('b') }), 'TRUE');
  assert.equal(run({ op: 'MEMBER_OF', fact: 'x', values: [0, false] }, { x: fact(null) }), 'UNKNOWN');
  assert.equal(run({ op: 'EVIDENCE_VERIFIED', evidence_ids: ['EV-SYN-1'] }), 'TRUE');
  assert.equal(run({ op: 'EVIDENCE_VERIFIED', evidence_ids: ['EV-SYN-1', 'EV-SYN-GONE'] }), 'FALSE');
  assert.equal(run({ op: 'EVIDENCE_VERIFIED', evidence_ids: ['EV-SYN-NEVER'] }), 'UNKNOWN');
  assert.equal(run({ op: 'CANON_STATUS_IS', fact: 'x', statuses: ['CANON_OBSERVED'] }, { x: fact(1, { canon_status: 'PROPOSED' }) }), 'FALSE');
  assert.equal(run({ op: 'CANON_STATUS_IS', fact: 'x', statuses: ['CANON_OBSERVED'] }, { x: fact(1) }), 'UNKNOWN');
  const era = (start_bac: number, end_bac: number) => fact(1, { period: { start_bac, end_bac } });
  assert.equal(run({ op: 'COMPATIBLE_PERIOD', a: 'x', b: 'y' }, { x: era(1048, 1030), y: era(1031, 1031) }), 'TRUE');
  assert.equal(run({ op: 'COMPATIBLE_PERIOD', a: 'x', b: 'y' }, { x: era(1048, 1030), y: era(1010, 995) }), 'FALSE');
  assert.equal(run({ op: 'COMPATIBLE_PERIOD', a: 'x', b: 'y' }, { x: era(1048, 1030), y: fact(1) }), 'UNKNOWN');
  assert.equal(run({ op: 'COMPATIBLE_UNIT', a: 'x', b: 'y' }, { x: fact(1, { unit: 'million km²' }), y: fact(2, { unit: 'thousand km²' }) }), 'FALSE');
  assert.equal(run({ op: 'COMPATIBLE_UNIT', a: 'x', b: 'y' }, { x: fact(1, { unit: 'million km²' }), y: fact(2) }), 'UNKNOWN');
  assert.equal(run({ op: 'ANY', of: [{ op: 'EQUALS', fact: 'x', value: 1 }, { op: 'PRESENT', fact: 'nope' }] }, { x: fact(2) }), 'UNKNOWN');
  assert.equal(run({ op: 'ALL', of: [{ op: 'EQUALS', fact: 'x', value: 2 }, { op: 'NOT', of: [{ op: 'PRESENT', fact: 'nope' }] }] }, { x: fact(2) }), 'UNKNOWN');
});

test('evaluation is deterministic and explains every step with rules version and source SHAs', () => {
  const tree = syntheticTree();
  const waiting = evaluateDecisionTree(tree);
  assert.equal(waiting.status, 'AWAITING_CHOICE');
  assert.equal(waiting.recommendation_kind, 'NONE');
  assert.deepEqual(waiting.visited, ['root', 'premise', 'gate', 'choose']);
  assert.deepEqual(waiting.pending?.options.map((o) => [o.branch_id, o.availability]), [['opt-a', 'AVAILABLE'], ['opt-b', 'BLOCKED']]);
  assert.match(waiting.explanation.join(' '), /does not choose a creative direction/);

  const chosen = evaluateDecisionTree(tree, { choices: { choose: 'opt-a' } });
  assert.equal(chosen.status, 'RESOLVED');
  assert.equal(chosen.outcome_node_id, 'out-a');
  assert.equal(chosen.outcome_class, 'NARRATIVE_HYPOTHESIS');
  assert.equal(chosen.recommendation_kind, 'CREATOR_SELECTED', 'a creator choice is not a system recommendation');
  assert.deepEqual(chosen.branches_taken, ['b-root', 'b-premise', 'b-high', 'opt-a']);
  assert.deepEqual(chosen.evidence_consulted, ['EV-SYN-1']);
  assert.equal(chosen.rules_version, tree.rules_version);
  assert.equal(chosen.production_source_sha, SYN_PROD);
  assert.equal(chosen.conditions[0]!.trace.result, 'TRUE');
  assert.match(chosen.explanation.join(' '), /Condition "Is the score above ten points\?" evaluated TRUE/);
  assert.equal(canonicalJson(chosen), canonicalJson(evaluateDecisionTree(syntheticTree(), { choices: { choose: 'opt-a' } })), 'same input, same result');

  const blocked = evaluateDecisionTree(tree, { choices: { choose: 'opt-b' } });
  assert.equal(blocked.status, 'BLOCKED_BY_CONSTRAINT');
  assert.equal(blocked.outcome_node_id, null);
  assert.ok(blocked.evidence_consulted.includes('EV-SYN-BLOCK'));

  const low = evaluateDecisionTree(tree, { facts: { score: fact(3, { unit: 'points' }) } });
  assert.equal(low.status, 'RESOLVED');
  assert.equal(low.recommended_action, 'DEFER');
  assert.equal(low.recommendation_kind, 'SYSTEM_EVIDENCE_BASED');
  assert.match(low.explanation.join(' '), /no canon is changed/);

  assert.equal(evaluateDecisionTree(tree, { choices: { choose: 'opt-zzz' } }).status, 'NOT_EVALUABLE');
});

test('unknown inputs follow the explicit UNKNOWN branch or stop as NOT_EVALUABLE; they never take the FALSE branch', () => {
  const tree = syntheticTree();
  for (const facts of [{ score: fact(null, { unit: 'points' }) }, { score: fact(12, { unit: 'percent' }) }]) {
    const r = evaluateDecisionTree(tree, { facts });
    assert.equal(r.status, 'INSUFFICIENT_DATA');
    assert.equal(r.outcome_node_id, 'no-data');
    assert.notEqual(r.outcome_node_id, 'out-low');
    assert.equal(r.unknown_conditions.length, 1);
  }
  const noUnknownBranch = edit((t) => { t.branches = t.branches.filter((b) => b.id !== 'b-unknown'); t.nodes = t.nodes.filter((n) => n.id !== 'no-data'); t.outcomes = t.outcomes.filter((o) => o !== 'no-data'); });
  assert.equal(validateDecisionTree(noUnknownBranch).ok, true);
  const stopped = evaluateDecisionTree(noUnknownBranch, { facts: { score: fact(null, { unit: 'points' }) } });
  assert.equal(stopped.status, 'NOT_EVALUABLE');
  assert.equal(stopped.outcome_node_id, null);
  assert.match(stopped.explanation.join(' '), /never treated as false/);
});

test('every terminal evaluation is enumerable with stable path identifiers', () => {
  const tree = syntheticTree();
  const all = enumerateEvaluations(tree);
  assert.deepEqual(all.map((e) => e.result.status).sort(), ['BLOCKED_BY_CONSTRAINT', 'RESOLVED']);
  assert.deepEqual(all.map((e) => e.path_id), enumerateEvaluations(syntheticTree()).map((e) => e.path_id));
  for (const e of all) assert.match(e.path_id, /^DTP-[0-9A-F]{12}$/);
  assert.equal(pathId(tree.tree_id, ['b-root', 'b-premise', 'b-high', 'opt-a']), all.find((e) => e.result.outcome_node_id === 'out-a')!.path_id);
  // When the constraint evidence is no longer found, the blocked option becomes available again.
  const unblocked = edit((t) => { const e = t.evidence.find((x) => x.id === 'EV-SYN-BLOCK')!; e.status = 'NOT_FOUND'; e.quote = ''; t.constraints = []; });
  assert.equal(evaluateDecisionTree(unblocked, { choices: { choose: 'opt-b' } }).status, 'RESOLVED');
});

test('review transitions: approval is not ratification, and ratification needs external evidence', () => {
  for (const s of PROPOSAL_REVIEW_STATUSES) assert.ok(Array.isArray(REVIEW_TRANSITIONS[s]));
  assert.equal(transitionDecisionReview('EXPLORING', 'PROPOSED').status, 'PROPOSED');
  assert.equal(transitionDecisionReview('PROPOSED', 'APPROVED_FOR_AUTHORING').canon_changed, false);
  assert.equal(transitionDecisionReview('EXPLORING', 'REJECTED').status, 'REJECTED');
  assert.equal(transitionDecisionReview('REJECTED', 'EXPLORING').status, 'EXPLORING');
  assert.throws(() => transitionDecisionReview('IDEA', 'APPROVED_FOR_AUTHORING'), /cannot move from IDEA/);
  assert.throws(() => transitionDecisionReview('EXPLORING', 'RATIFIED_EXTERNALLY'), /cannot move/);
  assert.throws(() => transitionDecisionReview('APPROVED_FOR_AUTHORING', 'RATIFIED_EXTERNALLY'), /requires verified publication evidence/);
  assert.throws(() => transitionDecisionReview('APPROVED_FOR_AUTHORING', 'RATIFIED_EXTERNALLY', { repository: 'Reltroner/reltroner-studio-remodeling', commit_sha: SYN_PROD, path: 'x.md', verified: true }), /requires verified/);
  assert.throws(() => transitionDecisionReview('APPROVED_FOR_AUTHORING', 'RATIFIED_EXTERNALLY', { repository: 'Reltroner/reltroner-studio', commit_sha: SYN_PROD, path: 'x.md', verified: false }), /requires verified/);
  const ok = transitionDecisionReview('APPROVED_FOR_AUTHORING', 'RATIFIED_EXTERNALLY', { repository: 'Reltroner/reltroner-studio', commit_sha: SYN_PROD, path: 'content/x.md', verified: true });
  assert.equal(ok.status, 'RATIFIED_EXTERNALLY');
  assert.equal(ok.canon_changed, false, 'this application never changes canon; it only records the external evidence');
  assert.throws(() => transitionDecisionReview('RATIFIED_EXTERNALLY', 'IDEA'), /cannot move/);
});
