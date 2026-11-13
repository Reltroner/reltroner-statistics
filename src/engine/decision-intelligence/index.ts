/**
 * Decision Intelligence orchestrator: builds the decision trees, evaluates the review trees for
 * every consistency finding and creative opportunity, enumerates the terminal paths of the
 * creative trees and returns one deterministic artifact. Every tree has passed
 * validateDecisionTree before it is returned.
 */
import type { CreativeArtifact, CreativeOpportunity, NarrativeAuditFinding } from '../../domain/creative.ts';
import { DECISION_RULES_VERSION, type DecisionFact, type DecisionTree, type OutcomeClass, type Scalar } from '../../domain/decision.ts';
import { canonicalJson, codeUnitCompare } from '../canonical.ts';
import type { SourceSnapshot } from '../comparator.ts';
import { verifyPassage } from '../evidence.ts';
import { sha256Hex } from '../git-objects.ts';
import { enumerateEvaluations, evaluateDecisionTree, stableHex12, type DecisionPathResult, type PathStatus } from './evaluate.ts';
import { modelToDecisionTree, type MlModel } from './ml.ts';
import { cooperationTree, outbreakTree, readinessTree, refactoringTree, remodelingTree, triageTree, type TreeInputs } from './trees.ts';

export const DECISION_ARTIFACT_SCHEMA = 'reltroner-statistics-decisions.v1';

export interface CaseEvaluation {
  evaluation_id: string;
  tree_id: string;
  subject: { kind: 'NARRATIVE_AUDIT_FINDING' | 'CREATIVE_OPPORTUNITY'; id: string; title: string };
  facts: Record<string, DecisionFact>;
  result: DecisionPathResult;
}

export interface PathSummary {
  path_id: string;
  tree_id: string;
  choices: Record<string, string>;
  /** Labels of the creator choices on the path, in order. */
  choice_labels: string[];
  status: PathStatus;
  outcome_node_id: string | null;
  outcome_label: string | null;
  outcome_class: OutcomeClass | null;
}

export interface DecisionArtifact {
  schema_version: typeof DECISION_ARTIFACT_SCHEMA;
  rules_version: string;
  generated_at: string;
  sources: { production_commit_sha: string; remodeling_commit_sha: string; deployment_status: 'DEPLOYMENT_VERIFIED' | 'DEPLOYMENT_UNVERIFIED' };
  summary: {
    trees_total: number;
    trees_by_type: Record<string, number>;
    nodes_total: number;
    evidence_total: number;
    evidence_by_status: Record<string, number>;
    links_by_kind: Record<string, number>;
    outcomes_by_class: Record<string, number>;
    paths_total: number;
    evaluations_total: number;
    evaluations_by_action: Record<string, number>;
    model_trees_total: number;
  };
  trees: DecisionTree[];
  paths: PathSummary[];
  evaluations: CaseEvaluation[];
  /** Statistical model trees. Only present for models that were actually fitted (see analytics.decision_trees). */
  model_trees: DecisionTree[];
  semantic_digest: string;
}

const fact = (value: Scalar, source: string, extra: Partial<DecisionFact> = {}): DecisionFact => ({ state: value === null ? 'NULL' : 'ASSIGNED', value, unit: null, period: null, canon_status: null, source, evidence_ids: [], ...extra });
const DETERMINISTIC_CATEGORIES = new Set(['CHRONOLOGICAL_CONTRADICTION', 'IMPOSSIBLE_EVENT_ORDERING', 'STATISTICAL_STORY_MISMATCH', 'GEOGRAPHICAL_INCONSISTENCY']);

/** Deterministic facts for the triage tree, derived from one finding and its cited passages. */
export async function triageFacts(f: NarrativeAuditFinding, ctx: { production: SourceSnapshot; remodeling: SourceSnapshot; creative: Pick<CreativeArtifact, 'entities'> }): Promise<Record<string, DecisionFact>> {
  const out: Record<string, DecisionFact> = {};
  const where = `finding ${f.id}`;
  if (f.passages.length) {
    const checks = await Promise.all(f.passages.map((p) => verifyPassage(p.side === 'production' ? ctx.production : ctx.remodeling, p.path.endsWith('.json') ? { ...p, line: null } : p)));
    const verified = checks.filter((c) => c === 'VERIFIED').length;
    out.source_identity_verified = fact(verified === f.passages.length, `${verified} of ${f.passages.length} cited passages match their pinned blob (${where}).`);
    out.verified_passages = fact(verified, `Passages of ${where} re-verified against the pinned snapshots.`, { unit: 'passages' });
    out.finding_side = fact(f.passages[0]!.side, `Side of the first cited passage of ${where}.`);
    const sides = new Set(f.passages.map((p) => p.side));
    out.comparison_kind = fact(f.passages.length === 1 ? 'SINGLE_PASSAGE' : sides.size > 1 ? 'CROSS_SOURCE' : 'CROSS_PASSAGE', `${f.passages.length} cited passage(s) on ${sides.size} side(s).`);
    if (f.passages.length > 1) {
      const period = (path: string) => (path.endsWith('.json') ? { start_bac: 0, end_bac: 0 } : ctx.creative.entities.find((e) => e.source_path === path)?.historical_bac ?? null);
      for (const [key, p] of [['period_a', f.passages[0]!], ['period_b', f.passages[1]!]] as const) {
        const span = period(p.path);
        out[key] = fact(p.path, span ? `Period recorded for ${p.path}.` : `No period is recorded for ${p.path}.`, { period: span ? { start_bac: span.start_bac, end_bac: span.end_bac } : null });
      }
    }
  }
  out.classification = fact(f.classification, `Classification of ${where}.`);
  out.is_defect = fact(f.is_defect, `Defect flag of ${where}.`);
  out.deterministic_rule = fact(f.classification === 'VERIFIED_CONTRADICTION' && DETERMINISTIC_CATEGORIES.has(f.category), `Category ${f.category}: ${DETERMINISTIC_CATEGORIES.has(f.category) ? 'produced by calendar or arithmetic rules' : 'not produced by a deterministic rule'}.`);
  return out;
}

/** Deterministic facts for the readiness tree, derived from one opportunity. */
export async function readinessFacts(o: CreativeOpportunity, ctx: { production: SourceSnapshot; remodeling: SourceSnapshot; creative: Pick<CreativeArtifact, 'entities' | 'audit_findings'> }): Promise<Record<string, DecisionFact>> {
  const where = `opportunity ${o.id}`;
  const draftSha = ctx.remodeling.identity.commit_sha;
  const checks = await Promise.all(o.canon_anchors.map((a) => verifyPassage(a.commit_sha === draftSha ? ctx.remodeling : ctx.production, a.path.endsWith('.json') ? { ...a, line: null } : a)));
  const affected = new Set(o.affected_entities);
  const defects = ctx.creative.audit_findings.filter((f) => f.is_defect && f.affected_entities.some((id) => affected.has(id)));
  const remodelingEntities = ctx.creative.entities.filter((e) => affected.has(e.id) && e.source_side === 'remodeling');
  return {
    verified_anchors: fact(checks.filter((c) => c === 'VERIFIED').length, `Anchors of ${where} re-verified against the pinned snapshots.`, { unit: 'passages' }),
    open_defects: fact(defects.length, defects.length ? `Defect findings on its entities: ${defects.map((d) => d.id).join(', ')}.` : `No defect finding touches the entities of ${where}.`, { unit: 'findings' }),
    depends_on_remodeling: fact(o.canon_anchors.some((a) => a.commit_sha === draftSha) || remodelingEntities.length > 0, `${remodelingEntities.length} affected entities and ${o.canon_anchors.filter((a) => a.commit_sha === draftSha).length} anchors come from the remodeling repository.`),
    coverage_gap: fact(o.priority_score.coverage_gap, `Coverage gap of ${where} (share of thinly connected entities).`),
  };
}

export async function buildDecisionArtifact(input: TreeInputs & { generated_at: string; models?: Array<{ slug: string; model: MlModel }> }): Promise<DecisionArtifact> {
  const built = [await cooperationTree(input), await outbreakTree(input), refactoringTree(input), remodelingTree(input), triageTree(input), readinessTree(input)];
  const trees = built.filter((t): t is DecisionTree => t !== null).sort((a, b) => codeUnitCompare(a.tree_id, b.tree_id));
  const triage = trees.find((t) => t.tree_type === 'CONSISTENCY_REVIEW')!;
  const readiness = trees.find((t) => t.tree_type === 'DEVELOPMENT_PRIORITIZATION')!;

  const evaluations: CaseEvaluation[] = [];
  for (const f of input.creative.audit_findings) {
    const facts = await triageFacts(f, input);
    evaluations.push({ evaluation_id: `DTE-${stableHex12(`${triage.tree_id}|${f.id}`)}`, tree_id: triage.tree_id, subject: { kind: 'NARRATIVE_AUDIT_FINDING', id: f.id, title: f.title }, facts, result: evaluateDecisionTree(triage, { facts }) });
  }
  for (const o of input.creative.opportunities) {
    const facts = await readinessFacts(o, input);
    evaluations.push({ evaluation_id: `DTE-${stableHex12(`${readiness.tree_id}|${o.id}`)}`, tree_id: readiness.tree_id, subject: { kind: 'CREATIVE_OPPORTUNITY', id: o.id, title: o.title }, facts, result: evaluateDecisionTree(readiness, { facts }) });
  }
  evaluations.sort((a, b) => codeUnitCompare(a.evaluation_id, b.evaluation_id));

  const paths: PathSummary[] = [];
  for (const tree of trees) {
    if (tree.tree_type === 'CONSISTENCY_REVIEW' || tree.tree_type === 'DEVELOPMENT_PRIORITIZATION') continue;
    const nodes = new Map(tree.nodes.map((n) => [n.id, n]));
    for (const e of enumerateEvaluations(tree)) {
      paths.push({
        path_id: e.path_id, tree_id: tree.tree_id, choices: e.choices,
        choice_labels: e.result.steps.filter((s) => (s.action === 'CREATOR_CHOICE' || s.action === 'REVIEW_DECISION') && s.branch_label).map((s) => s.branch_label!),
        status: e.result.status, outcome_node_id: e.result.outcome_node_id, outcome_label: e.result.outcome_node_id ? nodes.get(e.result.outcome_node_id)?.label ?? null : null, outcome_class: e.result.outcome_class,
      });
    }
  }
  paths.sort((a, b) => codeUnitCompare(a.path_id, b.path_id));
  const model_trees = (input.models ?? []).map(({ slug, model }) => modelToDecisionTree(model, input, slug)).sort((a, b) => codeUnitCompare(a.tree_id, b.tree_id));

  const tally = <T,>(items: readonly T[], key: (t: T) => string | null | undefined): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const it of items) { const k = key(it); if (k) out[k] = (out[k] ?? 0) + 1; }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => codeUnitCompare(a, b)));
  };
  const core = {
    schema_version: DECISION_ARTIFACT_SCHEMA as typeof DECISION_ARTIFACT_SCHEMA,
    rules_version: DECISION_RULES_VERSION,
    sources: { production_commit_sha: input.production.identity.commit_sha, remodeling_commit_sha: input.remodeling.identity.commit_sha, deployment_status: input.deployment_status },
    summary: {
      trees_total: trees.length,
      trees_by_type: tally(trees, (t) => t.tree_type),
      nodes_total: trees.reduce((n, t) => n + t.nodes.length, 0),
      evidence_total: trees.reduce((n, t) => n + t.evidence.length, 0),
      evidence_by_status: tally(trees.flatMap((t) => t.evidence), (e) => e.status),
      links_by_kind: tally(trees.flatMap((t) => t.links), (l) => l.kind),
      outcomes_by_class: tally(trees.flatMap((t) => t.nodes), (n) => (n.type === 'OUTCOME' ? n.outcome_class : n.type === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : null)),
      paths_total: paths.length,
      evaluations_total: evaluations.length,
      evaluations_by_action: tally(evaluations, (e) => e.result.recommended_action ?? e.result.status),
      model_trees_total: model_trees.length,
    },
    trees,
    paths,
    evaluations,
    model_trees,
  };
  return { ...core, generated_at: input.generated_at, semantic_digest: sha256Hex(canonicalJson(core)) };
}
