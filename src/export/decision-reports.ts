/**
 * Report adapters for Decision Intelligence artifacts and guarded statistical decision trees.
 * Converts each public decision artifact (DT-*, DTP-*, DTE-*, DTS-*) into a canonical Finding so
 * all eight export formats (JSON, CSV, XLSX, TXT, MD, HTML, PDF, XML) render from one model.
 *
 * Provenance is strictly grounded in cited evidence or left null; unratified trees, paths, notes
 * and synthetic method checks are explicitly labeled UNRATIFIED or SYNTHETIC_FIXTURE.
 */

import type { Analytics } from '../lib/data.ts';
import type { DecisionTree } from '../domain/decision.ts';
import type { ProposalReviewStatus } from '../domain/creative.ts';
import type { CaseEvaluation, DecisionArtifact, PathSummary } from '../engine/decision-intelligence/index.ts';
import { stableHex12, type DecisionPathResult } from '../engine/decision-intelligence/evaluate.ts';
import type { Finding, SideProvenance } from '../domain/finding.ts';

const PRODUCTION_REPO = 'Reltroner/reltroner-studio';
const REMODELING_REPO = 'Reltroner/reltroner-studio-remodeling';
const NO_SOURCE = '(decision tree model)';

interface Cite {
  commit_sha: string;
  path: string;
  blob_sha: string | null;
  line: number | null;
}

const prov = (repository: string, c: Cite | null | undefined): SideProvenance | null =>
  c ? { repository, commit_sha: c.commit_sha, path: c.path, blob_sha: c.blob_sha, line: c.line } : null;

const text = (value: string) => ({ present: true, value, value_type: 'string' as const });
const kindOf = (p: string): Finding['file_kind'] => (p.endsWith('.json') ? 'json' : 'markdown');

function base(
  id: string,
  title: string,
  production: Cite | null,
  remodeling: Cite | null,
  fallbackPath?: string,
): Pick<
  Finding,
  'id' | 'title' | 'file_path' | 'file_kind' | 'unit' | 'unit_source' | 'numeric_delta' | 'content_nature' | 'classification' | 'provenance'
> {
  const path = production?.path ?? remodeling?.path ?? fallbackPath ?? NO_SOURCE;
  return {
    id,
    title,
    file_path: path,
    file_kind: kindOf(path),
    unit: null,
    unit_source: null,
    numeric_delta: null,
    content_nature: 'CONTENT',
    classification: 'SEMANTIC_REVIEW_CANDIDATE',
    provenance: {
      production: prov(PRODUCTION_REPO, production),
      remodeling: prov(REMODELING_REPO, remodeling),
    },
  };
}

export function decisionTreeToReportFinding(
  tree: DecisionTree,
  options?: {
    pathResult?: DecisionPathResult;
    reviewOverride?: { status: ProposalReviewStatus; notes: string; visibility: 'PRIVATE_LOCAL_SESSION' };
    pathSummaries?: PathSummary[];
  },
): Finding {
  const verifiedProd = tree.evidence.filter((e) => e.side === 'production' && e.status === 'VERIFIED');
  const draftCite = tree.evidence.find((e) => e.side === 'remodeling' && e.status === 'VERIFIED') ?? tree.evidence.find((e) => e.side === 'remodeling') ?? null;
  const prodCite = verifiedProd[0] ?? null;
  const effectiveReview = options?.reviewOverride?.status ?? tree.creator_review_status;
  const privateBanner = options?.reviewOverride?.visibility === 'PRIVATE_LOCAL_SESSION'
    ? '[PRIVATE_LOCAL_SESSION REVIEW NOTES INCLUDED — LOCAL USER EXPORT ONLY] '
    : '';

  const prodSummary = verifiedProd.length
    ? `${verifiedProd.length} verified production evidence item(s); constraints: ${tree.constraints.filter((c) => c.binding === 'CANON_CONSTRAINT').map((c) => c.statement).join(' | ') || 'None'}`
    : `No direct verified production citation attached; tree rules version ${tree.rules_version}.`;

  const pathDetail = options?.pathResult
    ? `Active evaluation (${options.pathResult.status}): ${options.pathResult.steps.map((s) => s.branch_label ?? s.node_label).join(' -> ')}${options.pathResult.recommended_action ? ` [${options.pathResult.recommended_action}]` : ''}`
    : `${tree.nodes.length} nodes, ${tree.branches.length} branches, ${tree.outcomes.length} outcomes.`;

  const outcomeLines = tree.nodes
    .filter((n) => n.type === 'OUTCOME' || n.type === 'INSUFFICIENT_DATA')
    .map((n) => `Outcome ${n.id} (${n.outcome_class ?? n.type}): ${n.label}${n.recommended_action ? ` [Action: ${n.recommended_action}]` : ''}`);

  const altLines = (options?.pathSummaries ?? []).slice(0, 8).map(
    (p) => `Path ${p.path_id}: ${p.choice_labels.join(' -> ') || '(start)'} => ${p.status}${p.outcome_label ? ` (${p.outcome_label})` : ''}`,
  );

  const excerpt = [
    `Question: ${tree.question}`,
    ...tree.constraints.map((c) => `[${c.binding}] ${c.statement}`),
    ...(options?.pathResult ? [`Trace: ${options.pathResult.explanation.join(' | ')}`] : []),
    ...outcomeLines,
    ...altLines,
    ...(options?.reviewOverride?.notes.trim() ? [`Creator private note (PRIVATE_LOCAL_SESSION): ${options.reviewOverride.notes.trim()}`] : []),
  ];

  return {
    ...base(
      tree.tree_id,
      `[Decision Tree · UNRATIFIED ${tree.canon_status}] ${tree.title}`,
      prodCite,
      draftCite,
      tree.source_context.paths[0],
    ),
    level: 'SECTION',
    change_type: 'CONTENT_CHANGED',
    review_status: tree.canon_status === 'REVIEW_AID' ? 'REVIEW_CANDIDATE' : 'PROPOSAL',
    priority: tree.tree_type === 'WORLDBUILDING_REMODELING' || tree.tree_type === 'HISTORICAL_SCENARIO' ? 'P1' : 'P2',
    locator: tree.root_node_id,
    entity: { kind: 'document', name: tree.tree_type },
    field: tree.tree_type,
    production: text(prodSummary),
    remodeling: text(`${privateBanner}[UNRATIFIED ${tree.canon_status} · Review: ${effectiveReview}] ${pathDetail}`),
    production_canon_status:
      tree.canon_status === 'MODEL_ESTIMATE' ? 'MODEL_ESTIMATE' : `UNRATIFIED_${tree.canon_status}_${effectiveReview}`,
    diff: {
      added_lines: tree.branches.length,
      removed_lines: 0,
      truncated: false,
      excerpt,
    },
    recommendation: `${privateBanner}[UNRATIFIED DECISION SUPPORT — ${tree.canon_status}] ${tree.description}`,
    rule: `DECISION-TREE-${tree.tree_type}`,
  };
}

export function decisionPathToReportFinding(
  path: PathSummary,
  tree: DecisionTree,
  pathResult?: DecisionPathResult,
): Finding {
  const verifiedProd = tree.evidence.find((e) => e.side === 'production' && e.status === 'VERIFIED') ?? null;
  const draftCite = tree.evidence.find((e) => e.side === 'remodeling') ?? null;
  const outcomeNode = path.outcome_node_id ? tree.nodes.find((n) => n.id === path.outcome_node_id) : null;

  return {
    ...base(
      path.path_id,
      `[Decision Path · UNRATIFIED ${tree.canon_status}] ${tree.title}: ${path.outcome_label ?? path.status}`,
      verifiedProd,
      draftCite,
      tree.source_context.paths[0],
    ),
    level: 'SECTION',
    change_type: 'CONTENT_CHANGED',
    review_status: 'PROPOSAL',
    priority: 'P2',
    locator: path.outcome_node_id ?? tree.root_node_id,
    entity: { kind: 'document', name: tree.tree_id },
    field: 'decision_path',
    production: text(`Tree ${tree.tree_id} (${tree.tree_type}); rules ${tree.rules_version}.`),
    remodeling: text(
      `[UNRATIFIED ${tree.canon_status}] Choices: ${path.choice_labels.join(' -> ') || 'None'} => ${path.status} (${path.outcome_class ?? 'UNRESOLVED'})`,
    ),
    production_canon_status: `UNRATIFIED_${tree.canon_status}`,
    diff: {
      added_lines: path.choice_labels.length,
      removed_lines: 0,
      truncated: false,
      excerpt: [
        `Question: ${tree.question}`,
        `Outcome: ${outcomeNode?.description ?? path.outcome_label ?? path.status}`,
        ...(pathResult ? [`Trace: ${pathResult.explanation.join(' | ')}`] : []),
      ],
    },
    recommendation: `[UNRATIFIED PATH EXPLORATION] ${outcomeNode?.description ?? 'Path explored from source-grounded tree.'}`,
    rule: `DECISION-PATH-${tree.tree_type}`,
  };
}

export function decisionEvaluationToReportFinding(ev: CaseEvaluation, tree: DecisionTree): Finding {
  const consulted = new Set(ev.result.evidence_consulted);
  const relevantEvidence = tree.evidence.filter((e) => consulted.has(e.id));
  const prodCite = relevantEvidence.find((e) => e.side === 'production' && e.status === 'VERIFIED') ?? null;
  const draftCite = relevantEvidence.find((e) => e.side === 'remodeling') ?? null;

  return {
    ...base(
      ev.evaluation_id,
      `[Decision Evaluation · ${ev.result.recommended_action ?? ev.result.status}] ${ev.subject.id}: ${ev.subject.title}`,
      prodCite,
      draftCite,
      tree.source_context.paths[0],
    ),
    level: 'SECTION',
    change_type: 'CONTENT_CHANGED',
    review_status: ev.result.recommended_action === 'ESCALATE_TO_CREATOR' ? 'REVIEW_CANDIDATE' : 'PROPOSAL',
    priority: ev.result.recommended_action === 'ESCALATE_TO_CREATOR' ? 'P1' : 'P2',
    locator: `${tree.tree_id}:${ev.subject.id}`,
    entity: { kind: 'document', name: ev.subject.id },
    field: ev.subject.kind,
    production: text(
      `Tree ${tree.tree_id} evaluated ${ev.subject.kind} ${ev.subject.id}; ${ev.result.conditions.length} condition(s) checked, ${ev.result.unknown_conditions.length} unknown.`,
    ),
    remodeling: text(
      `[UNRATIFIED ${tree.canon_status}] Status: ${ev.result.status} | Class: ${ev.result.outcome_class ?? 'NONE'} | Action: ${ev.result.recommended_action ?? 'NONE'}`,
    ),
    production_canon_status: `UNRATIFIED_${tree.canon_status}`,
    diff: {
      added_lines: ev.result.steps.length,
      removed_lines: 0,
      truncated: false,
      excerpt: [
        ...ev.result.conditions.map((c) => `${c.node_id}: ${c.trace.statement} -> ${c.trace.result} (${c.trace.reason})`),
        ...ev.result.unknown_conditions.map((u) => `UNKNOWN ${u.node_id}: ${u.reason}`),
        `Explanation: ${ev.result.explanation.join(' ')}`,
      ],
    },
    recommendation: `[UNRATIFIED EVALUATION — ${ev.result.recommendation_kind}] ${ev.result.explanation.slice(-1)[0] ?? ev.result.status}`,
    rule: `DECISION-EVAL-${ev.subject.kind}`,
  };
}

export function statisticalDecisionTreesToReportFindings(
  dt: Analytics['decision_trees'],
  productionSha: string,
): Finding[] {
  const canonicalId = `DTS-${stableHex12(`dt-canonical|${productionSha}`)}`;
  const syntheticId = `DTS-${stableHex12(`dt-synthetic|${productionSha}`)}`;

  const canonicalLines = dt.tasks.map(
    (t) => `${t.task_id} (${t.kind}, ${t.cohort}, n=${t.n_complete}/${t.n_rows}) => ${t.status}: ${t.reasons.join(' ')}`,
  );
  const mcModels = dt.method_check.models;
  const syntheticLines = mcModels.flatMap((m) => [
    `${m.estimator} (${m.task}, target=${m.target}, n=${m.n_samples}, train/test=${m.n_train}/${m.n_test}): metrics=${JSON.stringify(m.evaluation.metrics)}`,
    `Leakage checks: target_in_features=${m.leakage_checks.target_in_features}, train_test_overlap=${m.leakage_checks.train_test_overlap}`,
    ...m.rules.slice(0, 6).map((r) => `Rule: ${r}`),
  ]);

  return [
    {
      ...base(
        canonicalId,
        `[Statistical Decision Trees · ${dt.status}] Canonical Sufficiency Gates & Task Verdicts`,
        null,
        null,
        'analytics/python/reltroner_analytics/decision_tree.py',
      ),
      level: 'FILE',
      change_type: 'CONTENT_CHANGED',
      review_status: 'INFORMATIONAL',
      priority: 'P2',
      locator: 'decision_trees.tasks',
      entity: { kind: 'record', name: 'ast-supervised-gates' },
      field: 'sufficiency_gates',
      production: text(
        `Overall status: ${dt.status}. Historical series: ${dt.historical.status} (max length ${dt.historical.max_series_length}/${dt.historical.min_series_length}). Policy: ${dt.policy.rule}`,
      ),
      remodeling: text('[MODEL_ESTIMATE · ZERO FABRICATED CANON PREDICTIONS] All canonical supervised tasks refused to fit or rejected proxy targets.'),
      production_canon_status: 'MODEL_ESTIMATE',
      diff: {
        added_lines: canonicalLines.length,
        removed_lines: 0,
        truncated: false,
        excerpt: [...canonicalLines, `Historical: ${dt.historical.reasons.join(' ')}`],
      },
      recommendation:
        '[TRUTHFUL INSUFFICIENCY GATE] Do not fit supervised trees on canonical observations until sample-size, per-feature, class-balance and single-unit requirements are met.',
      rule: 'STATISTICAL-DECISION-TREE-GATE',
    },
    {
      ...base(
        syntheticId,
        '[Statistical Decision Trees · SYNTHETIC_FIXTURE] Method Verification Only (Classifier & Regressor)',
        null,
        null,
        'analytics/python/reltroner_analytics/decision_tree.py',
      ),
      level: 'FILE',
      change_type: 'CONTENT_CHANGED',
      review_status: 'INFORMATIONAL',
      priority: 'P3',
      locator: 'decision_trees.method_check',
      entity: { kind: 'record', name: 'synthetic-method-check' },
      field: 'method_check',
      production: text(`Data origin: ${dt.method_check.data_origin}. ${dt.method_check.notice}`),
      remodeling: text(
        `[MODEL_ESTIMATE · SYNTHETIC_FIXTURE] ${mcModels.map((m) => `${m.estimator}(depth=${m.depth}, leaves=${m.n_leaves})`).join(' | ')}`,
      ),
      production_canon_status: 'MODEL_ESTIMATE',
      diff: {
        added_lines: syntheticLines.length,
        removed_lines: 0,
        truncated: false,
        excerpt: syntheticLines,
      },
      recommendation:
        '[SYNTHETIC METHOD CHECK ONLY — NEVER ASTHORTERA CANON] Used purely to verify scikit-learn tree export, hold-out metrics and threshold prediction parity.',
      rule: 'STATISTICAL-DECISION-TREE-METHOD-CHECK',
    },
  ];
}

export function buildDecisionReportFindings(input: {
  decisions: DecisionArtifact;
  analytics?: Analytics | null;
}): Finding[] {
  const { decisions, analytics } = input;
  const byTreeId = new Map(decisions.trees.map((t) => [t.tree_id, t]));
  const pathsByTree = new Map<string, PathSummary[]>();
  for (const p of decisions.paths) {
    const arr = pathsByTree.get(p.tree_id) ?? [];
    arr.push(p);
    pathsByTree.set(p.tree_id, arr);
  }

  const out: Finding[] = [];
  for (const tree of [...decisions.trees, ...decisions.model_trees]) {
    out.push(decisionTreeToReportFinding(tree, { pathSummaries: pathsByTree.get(tree.tree_id) ?? [] }));
  }
  for (const ev of decisions.evaluations) {
    const tree = byTreeId.get(ev.tree_id);
    if (tree) out.push(decisionEvaluationToReportFinding(ev, tree));
  }
  if (analytics?.decision_trees) {
    out.push(...statisticalDecisionTreesToReportFindings(analytics.decision_trees, decisions.sources.production_commit_sha));
  }
  return out;
}
