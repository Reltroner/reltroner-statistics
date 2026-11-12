import { useMemo, useState } from 'react';
import EChart from '../charts/EChart.tsx';
import { esc, tooltipStyle, type ChartTheme } from '../charts/theme.ts';

interface Props {
  status: string;
  features: string[];
  labels: string[];
  pearson: Array<Array<number | null>>;
  spearman: Array<Array<number | null>>;
  pairwise_n: number[][];
  n: number;
  reason: string | null;
}

/** Diverging blue–gray–red heatmap; only |r| ≥ 0.70 is labeled in-cell, the rest via tooltip and table. */
export default function CorrelationHeatmap(props: Props) {
  const [method, setMethod] = useState<'spearman' | 'pearson'>('spearman');
  const m = props[method];
  const strongest = useMemo(() => {
    const out: Array<{ a: string; b: string; r: number; n: number }> = [];
    for (let i = 0; i < props.features.length; i++) for (let j = i + 1; j < props.features.length; j++) {
      const r = m[i]?.[j];
      if (r != null) out.push({ a: props.labels[i]!, b: props.labels[j]!, r, n: props.pairwise_n[i]![j]! });
    }
    return out.sort((x, y) => Math.abs(y.r) - Math.abs(x.r)).slice(0, 12);
  }, [m, props.features, props.labels, props.pairwise_n]);

  if (props.status !== 'COMPUTED') {
    return <p className="rs-notice" data-tone="unavailable"><strong>INSUFFICIENT_DATA</strong>&nbsp;{props.reason}</p>;
  }
  const k = props.features.length;
  const build = (t: ChartTheme) => ({
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...tooltipStyle(t),
      formatter: (p: { data: [number, number, number | null] }) => {
        const [j, i, v] = (p as unknown as { value: [number, number, number | null] }).value;
        return `${esc(props.labels[i])} × ${esc(props.labels[j])}<br/><strong>${v == null ? 'not computed' : v.toFixed(3)}</strong> ${method === 'spearman' ? 'Spearman ρ' : 'Pearson r'}<br/><span style="opacity:.75">n = ${props.pairwise_n[i]![j]}</span>`;
      },
    },
    xAxis: { type: 'category', data: props.labels, axisLabel: { rotate: 55, color: t.muted, fontSize: 10, interval: 0 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
    yAxis: { type: 'category', data: props.labels, inverse: true, axisLabel: { color: t.muted, fontSize: 10, interval: 0 }, axisLine: { show: false }, axisTick: { show: false } },
    visualMap: { min: -1, max: 1, calculable: false, orient: 'horizontal', left: 'center', bottom: -4, show: false, inRange: { color: t.diverging } },
    series: [{
      id: 'corr', type: 'heatmap', itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 2 },
      label: { show: true, fontSize: 9, formatter: (p: { value: [number, number, number | null] }) => (p.value[2] != null && p.value[0] !== p.value[1] && Math.abs(p.value[2]) >= 0.7 ? p.value[2].toFixed(2) : '') },
      emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } },
      data: Array.from({ length: k * k }, (_, idx) => {
        const i = Math.floor(idx / k), j = idx % k;
        const v = m[i]?.[j] ?? null;
        // Strong fills are dark in both themes: white ink there, theme ink on the pale middle.
        return { value: [j, i, v], label: { color: v !== null && Math.abs(v) >= 0.8 ? '#ffffff' : t.mode === 'dark' ? '#ffffff' : '#0b0b0b' } };
      }),
    }],
  });
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <fieldset className="flex gap-1 rounded-xl border border-line bg-inset p-1">
          <legend className="rs-sr">Correlation method</legend>
          {(['spearman', 'pearson'] as const).map((x) => (
            <label key={x} className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold ${method === x ? 'bg-surface-2 text-ink' : 'text-ink-3'}`}>
              <input type="radio" name="corr-method" className="rs-sr" checked={method === x} onChange={() => setMethod(x)} />
              {x === 'spearman' ? 'Spearman (rank)' : 'Pearson (linear, log for skewed)'}
            </label>
          ))}
        </fieldset>
        <div className="flex items-center gap-2 text-xs text-ink-3" aria-hidden="true">
          <span>−1</span>
          <span className="h-2.5 w-40 rounded-full" style={{ background: 'linear-gradient(90deg, var(--div-neg-3), var(--div-neg-1), var(--div-mid), var(--div-pos-1), var(--div-pos-3))' }} />
          <span>+1</span>
        </div>
      </div>
      <div className="rs-card mt-3 p-2 sm:p-3">
        <EChart build={build} height={560} label={`${method} correlation matrix of ${k} indicators across ${props.n} profiled nations`} deps={[method]} />
      </div>
      <p className="mt-2 text-xs text-ink-3">n = {props.n} profiled nations. Correlation describes co-variation in assigned canon values; it is not evidence of causation and is a MODEL_ESTIMATE.</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink-2">Strongest pairs (table view)</summary>
        <div className="rs-table-wrap mt-3" tabIndex={0}>
          <table className="rs-table">
            <thead><tr><th>Indicator A</th><th>Indicator B</th><th className="num">{method === 'spearman' ? 'ρ' : 'r'}</th><th className="num">n</th></tr></thead>
            <tbody>{strongest.map((s) => <tr key={`${s.a}-${s.b}`}><td>{s.a}</td><td>{s.b}</td><td className="num">{s.r.toFixed(3)}</td><td className="num">{s.n}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
