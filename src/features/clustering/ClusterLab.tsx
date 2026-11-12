import { useState } from 'react';
import EChart from '../charts/EChart.tsx';
import { axisStyle, esc, SYMBOLS, tooltipStyle, type ChartTheme } from '../charts/theme.ts';

interface Run { k: number; inertia: number; silhouette: number | null; sizes: number[]; labels: Array<{ entity_id: string; cluster: number }>; centroids_z: number[][] }
interface Clustering {
  status: string; n: number; reason: string | null;
  features: Array<{ indicator_id: string; transform: string }>;
  scaling: string;
  pca: { explained_variance_ratio: number[]; loadings: number[][]; coordinates: Array<{ entity_id: string; pc1: number; pc2: number }> } | null;
  kmeans: { random_state: number; n_init: number; selection_rule: string; recommended_k: number | null; runs: Run[] } | null;
  dbscan: { eps: number; min_samples: number; eps_rule: string; k_distances: number[]; labels: Array<{ entity_id: string; cluster: number }>; n_clusters: number; n_noise: number } | null;
}
interface Props { clustering: Clustering; names: Record<string, string>; labels: Record<string, string> }

export default function ClusterLab({ clustering: c, names, labels }: Props) {
  const [algo, setAlgo] = useState<'kmeans' | 'dbscan'>('kmeans');
  const [k, setK] = useState(c.kmeans?.recommended_k ?? 2);
  if (c.status !== 'COMPUTED' || !c.pca || !c.kmeans || !c.dbscan) {
    return <p className="rs-notice" data-tone="unavailable"><strong>INSUFFICIENT_DATA.</strong>&nbsp;{c.reason}</p>;
  }
  const run = c.kmeans.runs.find((r) => r.k === k)!;
  const assign = new Map((algo === 'kmeans' ? run.labels : c.dbscan.labels).map((l) => [l.entity_id, l.cluster]));
  const groups = [...new Set(assign.values())].sort((a, b) => (a === -1 ? 1 : b === -1 ? -1 : a - b));
  const evr = c.pca.explained_variance_ratio;
  const groupName = (g: number) => (g === -1 ? 'Noise (no dense neighborhood)' : `Cluster ${g + 1}`);

  const build = (t: ChartTheme) => {
    const ax = axisStyle(t);
    const color = (g: number) => (g === -1 ? t.fold : g < 3 ? t.clusters[g] : t.fold);
    return {
      grid: { left: 52, right: 28, top: 30, bottom: 44, containLabel: true },
      legend: { top: 0, right: 0, textStyle: { color: t.ink2 } },
      tooltip: { ...tooltipStyle(t), trigger: 'item', formatter: (p: { data: { name: string; g: number; value: [number, number] } }) => `<strong>${esc(p.data.name)}</strong><br/>${esc(groupName(p.data.g))}<br/>PC1 ${p.data.value[0].toFixed(2)} · PC2 ${p.data.value[1].toFixed(2)}` },
      xAxis: { type: 'value', name: `PC1 (${(evr[0]! * 100).toFixed(1)}% of variance)`, nameLocation: 'middle', nameGap: 30, ...ax },
      yAxis: { type: 'value', name: `PC2 (${(evr[1]! * 100).toFixed(1)}%)`, nameLocation: 'middle', nameGap: 36, ...ax },
      series: groups.map((g) => ({
        id: `g${g}`, name: groupName(g), type: 'scatter', symbol: g === -1 ? 'emptyCircle' : SYMBOLS[g % SYMBOLS.length], symbolSize: 13,
        itemStyle: g === -1 ? { color: t.fold, borderColor: t.fold, borderWidth: 2 } : { color: color(g), borderColor: t.surface, borderWidth: 2 },
        label: { show: true, position: 'right', color: t.ink2, fontSize: 11, formatter: (p: { data: { name: string } }) => p.data.name },
        labelLayout: { hideOverlap: true },
        data: c.pca!.coordinates.filter((p) => assign.get(p.entity_id) === g).map((p) => ({ name: names[p.entity_id] ?? p.entity_id, g, value: [p.pc1, p.pc2] })),
      })),
    };
  };

  const buildSil = (t: ChartTheme) => ({
    grid: { left: 8, right: 16, top: 30, bottom: 28, containLabel: true },
    tooltip: { ...tooltipStyle(t), trigger: 'item' },
    xAxis: { type: 'category', data: c.kmeans!.runs.map((r) => `k = ${r.k}`), ...axisStyle(t), splitLine: { show: false } },
    yAxis: { type: 'value', min: 0, max: 1, name: 'Mean silhouette', ...axisStyle(t), nameTextStyle: { ...axisStyle(t).nameTextStyle, align: 'left' } },
    series: [{
      id: 'sil', type: 'bar', barMaxWidth: 24, itemStyle: { borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: 'top', color: t.ink, formatter: (p: { value: number }) => p.value.toFixed(3) },
      data: c.kmeans!.runs.map((r) => ({ value: r.silhouette ?? 0, itemStyle: { color: r.k === c.kmeans!.recommended_k ? t.series[0] : t.fold } })),
    }],
  });

  const buildKd = (t: ChartTheme) => ({
    grid: { left: 8, right: 16, top: 30, bottom: 28, containLabel: true },
    tooltip: { ...tooltipStyle(t), trigger: 'axis' },
    xAxis: { type: 'category', data: c.dbscan!.k_distances.map((_, i) => String(i + 1)), name: 'Points sorted by distance', nameLocation: 'middle', nameGap: 24, ...axisStyle(t), splitLine: { show: false } },
    yAxis: { type: 'value', name: `Distance to ${c.dbscan!.min_samples - 1}th neighbor`, ...axisStyle(t), nameTextStyle: { ...axisStyle(t).nameTextStyle, align: 'left' } },
    series: [{
      id: 'kd', type: 'line', symbol: 'circle', symbolSize: 8, lineStyle: { width: 2, color: t.series[0] }, itemStyle: { color: t.series[0], borderColor: t.surface, borderWidth: 2 },
      data: c.dbscan!.k_distances,
      markLine: { symbol: 'none', silent: true, lineStyle: { color: t.ink2, width: 1, type: 'solid' }, label: { color: t.ink2, formatter: `eps = ${c.dbscan!.eps}` }, data: [{ yAxis: c.dbscan!.eps }] },
    }],
  });

  const members = groups.map((g) => ({ g, names: [...assign.entries()].filter(([, v]) => v === g).map(([id]) => names[id] ?? id).sort() }));
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end gap-4">
        <fieldset className="flex gap-1 rounded-xl border border-line bg-inset p-1">
          <legend className="rs-sr">Algorithm</legend>
          {(['kmeans', 'dbscan'] as const).map((a) => (
            <label key={a} className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold ${algo === a ? 'bg-surface-2 text-ink' : 'text-ink-3'}`}>
              <input type="radio" name="algo" className="rs-sr" checked={algo === a} onChange={() => setAlgo(a)} />{a === 'kmeans' ? 'K-Means' : 'DBSCAN'}
            </label>
          ))}
        </fieldset>
        {algo === 'kmeans' && (
          <label>
            <span className="rs-label">Clusters (k)</span>
            <select className="rs-select" value={k} onChange={(e) => setK(Number(e.target.value))}>
              {c.kmeans.runs.map((r) => <option key={r.k} value={r.k}>k = {r.k}{r.k === c.kmeans!.recommended_k ? ' (highest silhouette)' : ''}</option>)}
            </select>
          </label>
        )}
        <p className="text-sm text-ink-3">
          {algo === 'kmeans' ? `Silhouette ${run.silhouette?.toFixed(3)} · inertia ${run.inertia.toFixed(2)} · seed ${c.kmeans.random_state}, ${c.kmeans.n_init} initializations`
            : `eps ${c.dbscan.eps} · min_samples ${c.dbscan.min_samples} · ${c.dbscan.n_clusters} cluster(s), ${c.dbscan.n_noise} noise point(s)`}
        </p>
      </div>
      <div className="rs-card p-3 sm:p-4">
        <EChart build={build} height={440} merge deps={[algo, k]} label={`${algo === 'kmeans' ? `K-Means with k=${k}` : 'DBSCAN'} assignments of ${c.n} profiled nations on the first two principal components`} />
        <p className="px-1 pt-1 text-xs text-ink-3">PCA projection for display only; clustering runs on all {c.features.length} standardized features. Clusters 1–3 take distinct hues and shapes; a fourth folds to gray with its own shape. Cluster numbers are ordered by mean SDI.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="rs-h3">Membership</h3>
          <ul className="mt-3 grid gap-2">
            {members.map((m) => (
              <li key={m.g} className="rs-card p-3 text-sm"><strong className="text-ink">{groupName(m.g)}</strong> <span className="text-ink-3">({m.names.length})</span><br /><span className="text-ink-2">{m.names.join(', ')}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="rs-h3">{algo === 'kmeans' ? 'Mean silhouette by k' : 'k-distance curve and eps'}</h3>
          <div className="rs-card mt-3 p-3">
            {algo === 'kmeans'
              ? <EChart build={buildSil} height={220} label={`Mean silhouette for k = ${c.kmeans.runs.map((r) => r.k).join(', ')}`} />
              : <EChart build={buildKd} height={220} label={`Sorted k-distances with eps ${c.dbscan.eps}`} />}
          </div>
          <p className="mt-2 text-xs text-ink-3">{algo === 'kmeans' ? `${c.kmeans.selection_rule}. Values between 0.25 and 0.5 indicate weak, partly artificial structure: treat clusters as a lens, not a taxonomy.` : c.dbscan.eps_rule}</p>
        </div>
      </div>
      {algo === 'kmeans' && (
        <div>
          <h3 className="rs-h3">Centroid profiles (standardized z-scores)</h3>
          <div className="rs-table-wrap mt-3" tabIndex={0}>
            <table className="rs-table">
              <thead><tr><th>Feature</th>{run.centroids_z.map((_, i) => <th key={i} className="num">Cluster {i + 1}</th>)}</tr></thead>
              <tbody>
                {c.features.map((f, j) => (
                  <tr key={f.indicator_id}><td>{labels[f.indicator_id] ?? f.indicator_id}{f.transform === 'log10' ? ' (log₁₀)' : ''}</td>{run.centroids_z.map((row, i) => <td key={i} className="num">{row[j]! > 0 ? '+' : ''}{row[j]!.toFixed(2)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
