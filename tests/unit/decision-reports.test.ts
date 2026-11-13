import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { strFromU8 } from 'fflate';
import { DecisionArtifactSchema, DecisionTreeSchema } from '../../src/contracts/schemas.ts';
import { validateDecisionTree } from '../../src/domain/decision.ts';
import { buildDecisionArtifact } from '../../src/engine/decision-intelligence/index.ts';
import { evaluateDecisionTree } from '../../src/engine/decision-intelligence/evaluate.ts';
import { modelToDecisionTree, type MlModel } from '../../src/engine/decision-intelligence/ml.ts';
import {
  buildDecisionReportFindings,
  decisionPathToReportFinding,
  decisionTreeToReportFinding,
  statisticalDecisionTreesToReportFindings,
} from '../../src/export/decision-reports.ts';
import { executeExport, renderFormat } from '../../src/export/bundle.ts';
import { buildReportDocument, type ReportContext } from '../../src/export/model.ts';
import { EXPORT_FORMATS, makeExportPlan } from '../../src/export/plan.ts';
import { creativeWorld, SHA_A, SHA_B } from '../fixtures/creative-fixture.ts';

function sampleMlModel() {
  return {
    estimator: 'DecisionTreeClassifier' as const,
    task: 'classification' as const,
    target: 'synthetic_class',
    features: ['synthetic_x1', 'synthetic_x2'],
    classes: ['S0', 'S1'],
    data_origin: 'SYNTHETIC_FIXTURE' as const,
    model_version: 'reltroner_analytics 0.2.0 decision_tree',
    n_samples: 240,
    n_train: 180,
    n_test: 60,
    random_state: 42,
    max_depth: 3,
    min_samples_leaf: 5,
    depth: 1,
    n_leaves: 2,
    evaluation: { method: 'stratified hold-out 180/60, seed 42', metrics: { accuracy: 0.9, balanced_accuracy: 0.89 } },
    feature_importance: [
      { feature: 'synthetic_x1', importance: 0.75 },
      { feature: 'synthetic_x2', importance: 0.25 },
    ],
    importance_caveat: 'Impurity reduction share inside this fitted tree; not causation.',
    nodes: [
      { id: 0, feature: 'synthetic_x1', threshold: 0.55, left: 1, right: 2, n_samples: 180, impurity: 0.45, value: 'S0', class_counts: { S0: 110, S1: 70 } },
      { id: 1, feature: null, threshold: null, left: null, right: null, n_samples: 100, impurity: 0.1, value: 'S0', class_counts: { S0: 95, S1: 5 } },
      { id: 2, feature: null, threshold: null, left: null, right: null, n_samples: 80, impurity: 0.2, value: 'S1', class_counts: { S0: 15, S1: 65 } },
    ],
    rules: ['if synthetic_x1 <= 0.55 then synthetic_class = S0 (n=100)', 'if synthetic_x1 > 0.55 then synthetic_class = S1 (n=80)'],
    verification_rows: [{ features: { synthetic_x1: 0.7, synthetic_x2: 0.5 }, prediction: 'S1' }],
    leakage_checks: { target_in_features: false as const, derived_features_removed: [] as string[], train_test_overlap: 0 as const, temporal_order_respected: null },
    limitations: ['Synthetic method check only.'],
    digest: '0'.repeat(64),
  } satisfies MlModel;
}

test('buildDecisionArtifact produces reproducible, contract-valid source-grounded trees and converts ML trees accurately', async () => {
  const { prod, draft, audit, stats, qaProd, qaRemod, graph, creative } = await creativeWorld();
  const baseInput = {
    production: prod,
    remodeling: draft,
    graph,
    deployment_status: 'DEPLOYMENT_UNVERIFIED' as const,
    source_timestamp: '2026-01-01T00:00:00Z',
    stats,
    audit,
    qaProduction: qaProd,
    qaRemodeling: qaRemod,
    creative,
    generated_at: audit.generated_at,
  };

  const a = await buildDecisionArtifact(baseInput);
  const b = await buildDecisionArtifact(baseInput);
  assert.equal(DecisionArtifactSchema.safeParse(a).success, true);
  assert.equal(a.semantic_digest, b.semantic_digest, 'deterministic decision artifact digest');
  assert.equal(a.trees.length, 6);
  assert.equal(a.model_trees.length, 0, 'no model tree emitted when no canonical ML model is fitted');
  for (const t of a.trees) {
    assert.equal(validateDecisionTree(t).ok, true, `${t.tree_id} passes structural & evidence validation`);
    assert.notEqual(t.canon_status, 'CANON_OBSERVED' as string);
    assert.notEqual(t.creator_review_status, 'RATIFIED_EXTERNALLY');
  }
  assert.ok(a.evaluations.length > 0);
  const knownTreeIds = new Set(a.trees.map((t) => t.tree_id));
  assert.ok(a.paths.every((p) => knownTreeIds.has(p.tree_id)));
  assert.ok(a.evaluations.every((e) => knownTreeIds.has(e.tree_id)));

  // Statistical ML model conversion into DecisionTree.
  const mlModel = sampleMlModel();
  const mlTree = modelToDecisionTree(mlModel, {
    production: prod,
    remodeling: draft,
    graph,
    deployment_status: 'DEPLOYMENT_UNVERIFIED',
    source_timestamp: '2026-01-01T00:00:00Z',
  }, 'synthetic-method-check');
  assert.equal(mlTree.tree_type, 'STATISTICAL_MODEL');
  assert.equal(mlTree.canon_status, 'MODEL_ESTIMATE');
  assert.equal(DecisionTreeSchema.safeParse(mlTree).success, true);
  // Missing feature routes explicitly to INSUFFICIENT_DATA, never default branch.
  const missingEval = evaluateDecisionTree(mlTree, { facts: {} });
  assert.equal(missingEval.status, 'INSUFFICIENT_DATA');

  const withModel = await buildDecisionArtifact({ ...baseInput, models: [{ slug: 'synthetic-method-check', model: mlModel }] });
  assert.equal(withModel.model_trees.length, 1);
  assert.equal(DecisionArtifactSchema.safeParse(withModel).success, true);
});

test('decision report exports cover DT/DTP/DTE/DTS across formats, XSD patterns, CSV safety and private isolation', async () => {
  const world = await creativeWorld();
  const decisions = await buildDecisionArtifact({
    production: world.prod,
    remodeling: world.draft,
    graph: world.graph,
    deployment_status: 'DEPLOYMENT_UNVERIFIED',
    source_timestamp: '2026-01-01T00:00:00Z',
    stats: world.stats,
    audit: world.audit,
    qaProduction: world.qaProd,
    qaRemodeling: world.qaRemod,
    creative: world.creative,
    generated_at: world.audit.generated_at,
  });

  const publicFindings = buildDecisionReportFindings({ decisions, analytics: null });
  const statFindings = statisticalDecisionTreesToReportFindings({
    status: 'INSUFFICIENT_LABELED_DATA',
    policy: {
      min_labeled_samples: 30,
      min_samples_per_feature: 10,
      min_class_samples: 10,
      max_depth: 3,
      min_samples_leaf: 5,
      test_fraction: 0.25,
      random_state: 42,
      missing_values: 'excluded',
      rejected_label_sources: ['kmeans cluster', 'dbscan cluster', 'cohort'],
      rule: 'insufficient check rule',
    },
    tasks: [{
      task_id: 'regression-sdi-profiled-14',
      kind: 'regression',
      target: 'sdi',
      target_label: 'Sentient Development Index',
      features: ['gdp_per_capita'],
      cohort: 'PROFILED_14',
      n_rows: 14,
      n_complete: 14,
      status: 'INSUFFICIENT_LABELED_DATA',
      reasons: ['14 complete labeled rows; 30 required.'],
      model: null,
    }],
    historical: { status: 'INSUFFICIENT_LABELED_DATA', max_series_length: 3, min_series_length: 30, reasons: ['short series'] },
    method_check: { data_origin: 'SYNTHETIC_FIXTURE', notice: 'synthetic only', models: [sampleMlModel()] },
  }, decisions.sources.production_commit_sha);

  const combined = [...publicFindings, ...statFindings];
  const xsdText = fs.readFileSync(path.join(process.cwd(), 'analytics', 'schemas', 'report.xsd'), 'utf8');
  const idMatch = xsdText.match(/name="findingId"[\s\S]*?value="([^"]+)"/);
  assert.ok(idMatch);
  const idRegex = new RegExp(`^${idMatch[1]}$`);
  for (const f of combined) {
    assert.match(f.id, idRegex, `${f.id} conforms to report.xsd findingId pattern`);
    if (f.provenance.production) assert.equal(f.provenance.production.commit_sha, decisions.sources.production_commit_sha);
    if (f.provenance.remodeling) assert.equal(f.provenance.remodeling.commit_sha, decisions.sources.remodeling_commit_sha);
  }

  // Private notes must only appear when explicitly passed via private override, never in buildDecisionReportFindings.
  assert.equal(combined.some((f) => JSON.stringify(f).includes('SECRET CREATOR DECISION NOTE')), false);
  const tree = decisions.trees[0]!;
  const privateFinding = decisionTreeToReportFinding(tree, {
    reviewOverride: { status: 'APPROVED_FOR_AUTHORING', notes: '=cmd|SECRET CREATOR DECISION NOTE', visibility: 'PRIVATE_LOCAL_SESSION' },
  });
  assert.match(privateFinding.recommendation, /PRIVATE_LOCAL_SESSION/);

  const context: ReportContext = {
    generated_at: decisions.generated_at,
    rules_version: decisions.rules_version,
    semantic_digest: decisions.semantic_digest,
    production: { repository: 'Reltroner/reltroner-studio', commit_sha: SHA_A, tree_sha: SHA_A },
    remodeling: { repository: 'Reltroner/reltroner-studio-remodeling', commit_sha: SHA_B, tree_sha: SHA_B },
    deployment: { status: 'DEPLOYMENT_UNVERIFIED', deployed_sha: null, summary: 'test' },
  };
  const sample = publicFindings[0]!;
  const pathFinding = decisionPathToReportFinding(decisions.paths[0]!, tree);
  assert.match(pathFinding.id, idRegex);

  const doc = buildReportDocument(context, [sample, pathFinding, statFindings[0]!], 'consolidated');
  for (const fmt of EXPORT_FORMATS.filter((f) => f !== 'pdf')) {
    const bytes = renderFormat(doc, fmt);
    assert.ok(bytes.byteLength > 100);
    if (fmt !== 'xlsx') {
      const txt = strFromU8(bytes);
      assert.ok(txt.includes(sample.id), `${fmt} includes DT id`);
      assert.ok(txt.includes('UNRATIFIED'), `${fmt} carries UNRATIFIED notice`);
    }
  }
  const csvPrivate = strFromU8(renderFormat(buildReportDocument(context, [privateFinding], 'single'), 'csv'));
  assert.ok(!csvPrivate.includes(',=cmd|'), 'formula-like private notes in CSV must be neutralized');

  const plan = makeExportPlan({
    scope: 'selected',
    audit_id: 'DECISION-TEST',
    production_sha: SHA_A,
    remodeling_sha: SHA_B,
    formats: [...EXPORT_FORMATS],
    finding_ids: [sample.id],
    bundle_layout: 'per-finding',
  }, combined.map((f) => f.id));
  const bundle = await executeExport({
    plan,
    findings: combined,
    context,
    loadPdf: async (k) => new TextEncoder().encode(`%PDF-1.7 ${k}`),
    xsd: xsdText,
  });
  assert.equal(bundle.entries?.length, 10, '8 formats + MANIFEST + XSD inside ZIP');
});
