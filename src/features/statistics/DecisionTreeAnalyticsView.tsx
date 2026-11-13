import { useMemo, useState } from 'react';
import type { Analytics } from '../../lib/data.ts';

type DecisionTreeAnalytics = Analytics['decision_trees'];
type MlModel = DecisionTreeAnalytics['method_check']['models'][number];

interface Props {
  decisionTrees: DecisionTreeAnalytics;
}

function evaluateExportedModel(
  model: MlModel,
  row: Record<string, number | null>,
): { prediction: string | number | null; trace: string[]; status: 'PREDICTED' | 'MISSING_FEATURE' } {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  let cur = byId.get(0);
  const trace: string[] = [];
  for (let step = 0; step <= model.nodes.length; step++) {
    if (!cur) break;
    if (cur.feature === null || cur.threshold === null || cur.left === null || cur.right === null) {
      return { prediction: cur.value, trace, status: 'PREDICTED' };
    }
    const v = row[cur.feature];
    if (v === null || v === undefined || !Number.isFinite(v)) {
      trace.push(`${cur.feature} is missing/non-finite -> stopped without fallback branch (None)`);
      return { prediction: null, trace, status: 'MISSING_FEATURE' };
    }
    const goRight = v > cur.threshold;
    trace.push(`${cur.feature} = ${v} ${goRight ? '>' : '<='} ${cur.threshold} -> node #${goRight ? cur.right : cur.left}`);
    cur = byId.get(goRight ? cur.right : cur.left);
  }
  return { prediction: null, trace, status: 'MISSING_FEATURE' };
}

export default function DecisionTreeAnalyticsView({ decisionTrees }: Props) {
  const computedCanonical = useMemo(
    () =>
      decisionTrees.tasks
        .filter((t): t is typeof t & { model: MlModel } => t.status === 'COMPUTED' && t.model !== null)
        .map((t) => ({ key: t.task_id, label: `${t.target_label} (${t.cohort})`, model: t.model })),
    [decisionTrees.tasks],
  );

  const availableModels = useMemo(
    () => [
      ...computedCanonical.map((c) => ({ ...c, synthetic: false })),
      ...decisionTrees.method_check.models.map((m, idx) => ({
        key: `synthetic-${m.task}-${idx}`,
        label: `Synthetic Verification · ${m.estimator} (${m.task})`,
        model: m,
        synthetic: true,
      })),
    ],
    [computedCanonical, decisionTrees.method_check.models],
  );

  const [selectedKey, setSelectedKey] = useState<string>(availableModels[0]?.key ?? '');
  const [selectedRowIdx, setSelectedRowIdx] = useState<number>(0);
  const [simulateMissing, setSimulateMissing] = useState<boolean>(false);

  const activeEntry = availableModels.find((m) => m.key === selectedKey) ?? availableModels[0] ?? null;
  if (!activeEntry) {
    return <p className="rs-notice" data-tone="unavailable">No supervised decision tree models available.</p>;
  }

  const m = activeEntry.model;
  const sampleRow = m.verification_rows[selectedRowIdx] ?? m.verification_rows[0];
  const simulatedInput: Record<string, number | null> = useMemo(() => {
    if (!sampleRow) return {};
    const copy: Record<string, number | null> = { ...sampleRow.features };
    const rootFeature = m.nodes[0]?.feature;
    if (simulateMissing && rootFeature) copy[rootFeature] = null;
    return copy;
  }, [sampleRow, simulateMissing, m.nodes]);

  const evalTrace = useMemo(() => evaluateExportedModel(m, simulatedInput), [m, simulatedInput]);

  return (
    <div className="grid min-w-0 gap-6 [overflow-wrap:anywhere]">
      {/* Model Selector Tabs */}
      <div className="flex flex-wrap gap-2">
        {availableModels.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setSelectedKey(item.key);
              setSelectedRowIdx(0);
              setSimulateMissing(false);
            }}
            className={`rs-button !min-h-9 !px-3 !text-xs ${
              activeEntry.key === item.key ? 'rs-button-primary' : 'rs-button-ghost'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Warning Notice for SYNTHETIC_FIXTURE */}
      {activeEntry.synthetic && (
        <div className="rs-notice text-xs" data-tone="info">
          <strong>DATA ORIGIN: {m.data_origin} (Method Verification Only)</strong> — {decisionTrees.method_check.notice}
        </div>
      )}

      {/* Metadata, Evaluation Metrics, Feature Importance & Leakage Checks */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rs-card grid min-w-0 content-start gap-3 p-5 text-xs">
          <p className="rs-eyebrow">Model Provenance & Hyperparameters</p>
          <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
            <dt className="text-ink-3">Estimator</dt><dd className="m-0 font-mono text-ink">{m.estimator} ({m.task})</dd>
            <dt className="text-ink-3">Origin</dt><dd className="m-0 font-mono text-ink">{m.data_origin}</dd>
            <dt className="text-ink-3">Target</dt><dd className="m-0 font-mono text-ink">{m.target}</dd>
            <dt className="text-ink-3">Features</dt><dd className="m-0 font-mono text-ink">{m.features.join(', ')}</dd>
            <dt className="text-ink-3">Samples</dt><dd className="m-0">{m.n_samples} total ({m.n_train} train / {m.n_test} test)</dd>
            <dt className="text-ink-3">Tree bounds</dt><dd className="m-0">max_depth={m.max_depth}, min_samples_leaf={m.min_samples_leaf}, depth={m.depth}, leaves={m.n_leaves}, seed={m.random_state}</dd>
            <dt className="text-ink-3">Evaluation</dt><dd className="m-0">{m.evaluation.method}</dd>
          </dl>

          <p className="rs-eyebrow mt-2">Held-Out Test Metrics</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(m.evaluation.metrics).map(([k, v]) => (
              <span key={k} className="rs-pill font-mono text-[0.7rem]">
                {k}: {v === null ? 'null' : v}
              </span>
            ))}
          </div>

          <p className="rs-eyebrow mt-2">Leakage Checks</p>
          <ul className="list-disc pl-4 text-ink-2">
            <li>Target in features: <strong>{String(m.leakage_checks.target_in_features)}</strong></li>
            <li>Train/test row overlap: <strong>{m.leakage_checks.train_test_overlap}</strong></li>
            <li>Derived features removed: <strong>{m.leakage_checks.derived_features_removed.join(', ') || 'None'}</strong></li>
            <li>Temporal order respected: <strong>{m.leakage_checks.temporal_order_respected === null ? 'N/A (cross-sectional)' : String(m.leakage_checks.temporal_order_respected)}</strong></li>
          </ul>
        </div>

        <div className="rs-card grid content-start gap-3 p-5 text-xs">
          <p className="rs-eyebrow">Feature Importance (Impurity Share — Non-Causal)</p>
          <ul className="grid gap-2">
            {m.feature_importance.map((fi) => (
              <li key={fi.feature} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2">
                <span className="font-mono font-semibold text-ink">{fi.feature}</span>
                <span className="font-mono text-cyan">{(fi.importance * 100).toFixed(2)}%</span>
              </li>
            ))}
          </ul>
          <p className="text-[0.72rem] text-ink-3">{m.importance_caveat}</p>

          <p className="rs-eyebrow mt-2">Limitations</p>
          <ul className="list-disc space-y-1 pl-4 text-ink-2">
            {m.limitations.map((lim) => <li key={lim}>{lim}</li>)}
          </ul>
        </div>
      </div>

      {/* Exported Explainable Decision Rules */}
      <div className="rs-card grid gap-3 p-5 text-xs">
        <p className="rs-eyebrow">Explainable Exported Rules ({m.rules.length} leaves)</p>
        <ol className="list-decimal space-y-1.5 pl-5 font-mono text-[0.75rem] text-ink-2">
          {m.rules.map((rule, i) => <li key={i}>{rule}</li>)}
        </ol>
      </div>

      {/* Interactive Held-Out Row & Missing-Value Evaluation Parity Tester */}
      {m.verification_rows.length > 0 && (
        <div className="rs-card grid gap-4 p-5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="rs-eyebrow">Threshold Evaluation Parity & Missing-Feature Guard</p>
              <p className="mt-1 text-ink-2">Inspect any held-out test row from Python and verify how a missing feature stops without a fallback branch.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                <span>Test row:</span>
                <select
                  className="rs-input !min-h-8 !py-1 !text-xs"
                  value={selectedRowIdx}
                  onChange={(e) => setSelectedRowIdx(Number(e.target.value))}
                >
                  {m.verification_rows.map((_, idx) => (
                    <option key={idx} value={idx}>Held-out row #{idx + 1}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-pressed={simulateMissing}
                onClick={() => setSimulateMissing((s) => !s)}
                className={`rs-button !min-h-8 !px-3 !text-xs ${simulateMissing ? 'rs-button-primary' : 'rs-button-ghost'}`}
              >
                {simulateMissing ? 'Root feature set to NULL (missing)' : 'Simulate missing split feature'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface-2 p-3">
            <p className="font-mono text-[0.72rem] text-ink-2">
              Input features: {JSON.stringify(simulatedInput)}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
              {evalTrace.trace.map((step, i) => <li key={i}>{step}</li>)}
            </ul>
            <p className="mt-2 font-semibold text-ink">
              Client trace output:{' '}
              <span className="font-mono text-cyan">
                {evalTrace.status === 'PREDICTED' ? String(evalTrace.prediction) : 'None (INSUFFICIENT_DATA — no default branch)'}
              </span>
              {!simulateMissing && sampleRow && (
                <span className="ml-2 text-ink-3">(Python sklearn prediction: {String(sampleRow.prediction)})</span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
