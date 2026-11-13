/**
 * Supervised decision-tree models fitted by the Python analytics package, expressed in the
 * decision-tree contract so the same validator, evaluator and views apply to them.
 *
 * A split `feature <= threshold` becomes the condition `feature > threshold`: FALSE goes to the
 * left child, TRUE to the right, and a missing feature value ends in an insufficient-data leaf
 * (a missing value is never sent down a branch). Leaves are MODEL_ESTIMATE, never canon.
 */
import type { DecisionFact, DecisionNode, DecisionTree, ModelMetadata } from '../../domain/decision.ts';
import { TreeKit, type KitContext } from './kit.ts';

export interface MlNode {
  id: number;
  feature: string | null;
  threshold: number | null;
  left: number | null;
  right: number | null;
  n_samples: number;
  impurity: number | null;
  value: number | string | null;
  class_counts: Record<string, number> | null;
}

export interface MlModel {
  estimator: 'DecisionTreeClassifier' | 'DecisionTreeRegressor';
  task: 'classification' | 'regression';
  target: string;
  features: string[];
  classes: string[] | null;
  data_origin: 'CANONICAL_OBSERVATIONS' | 'SYNTHETIC_FIXTURE';
  model_version: string;
  n_samples: number;
  n_train: number;
  n_test: number;
  random_state: number;
  max_depth: number;
  min_samples_leaf: number;
  depth: number;
  n_leaves: number;
  evaluation: { method: string; metrics: Record<string, number | null> };
  feature_importance: Array<{ feature: string; importance: number }>;
  importance_caveat: string;
  nodes: MlNode[];
  rules: string[];
  verification_rows: Array<{ features: Record<string, number>; prediction: number | string }>;
  leakage_checks: { target_in_features: boolean; derived_features_removed: string[]; train_test_overlap: number; temporal_order_respected: boolean | null };
  limitations: string[];
  digest: string;
}

/** Fact key for a model feature. */
export function featureFact(feature: string): string {
  return `feature.${feature.toLowerCase().replace(/[^a-z0-9_]+/g, '_')}`.slice(0, 64);
}

export function factsForRow(features: Record<string, number | null | undefined>): Record<string, DecisionFact> {
  return Object.fromEntries(Object.entries(features).map(([f, v]) => [featureFact(f), {
    state: v === null || v === undefined ? 'NULL' : 'ASSIGNED', value: v ?? null, unit: null, period: null, canon_status: 'MODEL_ESTIMATE', source: 'Model input row', evidence_ids: [],
  } satisfies DecisionFact]));
}

export function modelToDecisionTree(model: MlModel, ctx: KitContext, slug: string): DecisionTree {
  const k = new TreeKit(ctx);
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const root = model.nodes[0];
  if (!root) throw new Error('Model has no nodes');
  const id = (n: MlNode) => `m${n.id}`;
  const show = (v: number | string | null) => (typeof v === 'number' ? String(Number(v.toPrecision(6))) : String(v));
  k.constraint('m-estimate', 'A model output is an exploratory estimate. It is never canon and never a causal claim.', [], 'METHOD_RULE');
  k.constraint('m-missing', 'A missing feature value ends the evaluation. It is never imputed or treated as zero.', [], 'METHOD_RULE');
  k.assumptions.push(...model.limitations);
  k.node({ id: 'root', type: 'ROOT', label: `${model.estimator}: ${model.target}`, description: `Fitted on ${model.n_train} training rows (${model.data_origin === 'SYNTHETIC_FIXTURE' ? 'synthetic fixture data' : 'canonical observations'}).`, evidence_ids: [] });
  k.branch('b-root', 'root', id(root), 'Continue');
  for (const n of model.nodes) {
    if (n.feature !== null && n.threshold !== null && n.left !== null && n.right !== null) {
      const left = byId.get(n.left);
      const right = byId.get(n.right);
      if (!left || !right) throw new Error(`Model node ${n.id} references a missing child`);
      const fact = featureFact(n.feature);
      k.node({ id: id(n), type: 'CONDITION', label: `${n.feature} > ${show(n.threshold)}`, description: `${n.n_samples} training rows reach this split.`, evidence_ids: [], question: `Is ${n.feature} greater than ${show(n.threshold)}?`,
        predicate: { op: 'GREATER_THAN', fact, value: n.threshold }, model: { n_samples: n.n_samples, impurity: n.impurity, value: n.value, class_counts: n.class_counts } });
      k.node({ id: `${id(n)}-missing`, type: 'INSUFFICIENT_DATA', label: `${n.feature} missing`, description: `No prediction without a value for ${n.feature}.`, evidence_ids: [], missing: [n.feature] });
      k.branch(`${id(n)}-le`, id(n), id(left), `≤ ${show(n.threshold)}`, { when: 'FALSE', uncertainty: 'DETERMINISTIC' });
      k.branch(`${id(n)}-gt`, id(n), id(right), `> ${show(n.threshold)}`, { when: 'TRUE', uncertainty: 'DETERMINISTIC' });
      k.branch(`${id(n)}-na`, id(n), `${id(n)}-missing`, 'Value missing', { when: 'UNKNOWN', uncertainty: 'DETERMINISTIC' });
    } else {
      const leaf: DecisionNode = {
        id: id(n), type: 'OUTCOME', label: `${model.target}: ${show(n.value)}`, description: `${n.n_samples} training rows end in this leaf.`, evidence_ids: [], outcome_class: 'MODEL_ESTIMATE',
        consequences: [{ text: `Predicted ${model.target}: ${show(n.value)} (${n.n_samples} training rows in this leaf${n.class_counts ? `; class counts ${Object.entries(n.class_counts).map(([c, v]) => `${c}=${v}`).join(', ')}` : ''}). A model estimate, not canon.`, basis: 'MODEL_ESTIMATE', dimension: 'STATISTICS', evidence_ids: [] }],
        consistency_risks: [], open_questions: [], affected_entities: [], model: { n_samples: n.n_samples, impurity: n.impurity, value: n.value, class_counts: n.class_counts },
      };
      k.node(leaf);
    }
  }
  const metadata: ModelMetadata = {
    model_version: model.model_version, estimator: model.estimator, task: model.task, target: model.target, features: model.features, data_origin: model.data_origin, n_samples: model.n_samples,
    random_state: model.random_state, max_depth: model.max_depth, min_samples_leaf: model.min_samples_leaf,
    evaluation: { method: model.evaluation.method, n_train: model.n_train, n_test: model.n_test, metrics: model.evaluation.metrics },
    feature_importance: model.feature_importance, limitations: [...model.limitations, model.importance_caveat],
  };
  return k.finish({
    slug, type: 'STATISTICAL_MODEL', root: 'root', canon_status: 'MODEL_ESTIMATE', model_metadata: metadata,
    title: `${model.estimator} for ${model.target}${model.data_origin === 'SYNTHETIC_FIXTURE' ? ' (synthetic method check)' : ''}`,
    description: model.data_origin === 'SYNTHETIC_FIXTURE'
      ? 'Fitted on generated numbers to verify the method. It describes no nation, indicator or event of Asthortera.'
      : 'A supervised decision tree fitted on canonical observations that passed the sufficiency gate. Exploratory; never canon.',
    question: `Which ${model.task === 'classification' ? 'class' : 'value'} of ${model.target} does the model estimate for a row?`, paths: [],
  });
}
