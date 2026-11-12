import { useMemo, useState } from 'react';
import EChart from '../charts/EChart.tsx';
import { axisStyle, esc, SYMBOLS, tooltipStyle, type ChartTheme } from '../charts/theme.ts';
import { formatValue, tickValue } from '../../lib/format.ts';
import type { CountryRow, IndicatorMeta } from '../../lib/views.ts';

interface ClusterRun { k: number; labels: Record<string, number> }
interface Props {
  rows: CountryRow[];
  indicators: IndicatorMeta[];
  clusterRuns: ClusterRun[];
  recommendedK: number | null;
  initial?: { x?: string; y?: string; size?: string };
}

type ColorMode = 'cohort' | `k${number}`;
const COHORT_LABEL = { PROFILED_14: 'Profiled nations', DEVELOPMENT_5: 'Development nations' } as const;

export default function ScatterExplorer({ rows, indicators, clusterRuns, recommendedK, initial }: Props) {
  const byId = useMemo(() => new Map(indicators.map((i) => [i.id, i])), [indicators]);
  const [x, setX] = useState(initial?.x ?? 'gdp_per_capita');
  const [y, setY] = useState(initial?.y ?? 'sdi');
  const [size, setSize] = useState(initial?.size ?? 'population');
  const [cohort, setCohort] = useState<'ALL' | 'PROFILED_14'>('ALL');
  const [color, setColor] = useState<ColorMode>('cohort');
  const xm = byId.get(x)!, ym = byId.get(y)!, sm = size ? byId.get(size) : undefined;
  const [logX, setLogX] = useState(!!xm.log_scale);
  const [logY, setLogY] = useState(!!ym.log_scale);

  const visible = rows.filter((r) => cohort === 'ALL' || r.cohort === 'PROFILED_14');
  const plotted = visible.filter((r) => r.values[x] != null && r.values[y] != null);
  const missing = visible.filter((r) => r.values[x] == null || r.values[y] == null);
  const canLogX = plotted.every((r) => (r.values[x] as number) > 0);
  const canLogY = plotted.every((r) => (r.values[y] as number) > 0);
  const run = color.startsWith('k') ? clusterRuns.find((c) => `k${c.k}` === color) : undefined;

  const groups = useMemo(() => {
    if (run) {
      const ks = [...new Set(plotted.map((r) => run.labels[r.id]).filter((v) => v !== undefined))].sort();
      const g = ks.map((k) => ({ id: `c${k}`, name: `Cluster ${k! + 1}`, slot: k!, rows: plotted.filter((r) => run.labels[r.id] === k) }));
      const unclustered = plotted.filter((r) => run.labels[r.id] === undefined);
      if (unclustered.length) g.push({ id: 'none', name: 'Not clustered (development nation)', slot: 99, rows: unclustered });
      return g;
    }
    return (['PROFILED_14', 'DEVELOPMENT_5'] as const)
      .map((c, i) => ({ id: c, name: COHORT_LABEL[c], slot: i, rows: plotted.filter((r) => r.cohort === c) }))
      .filter((g) => g.rows.length);
  }, [plotted, run]);

  const sizeRange = useMemo(() => {
    const vals = plotted.map((r) => (sm ? r.values[sm.id] : null)).filter((v): v is number => v != null && v > 0);
    return vals.length ? ([Math.sqrt(Math.min(...vals)), Math.sqrt(Math.max(...vals))] as [number, number]) : null;
  }, [plotted, sm]);
  const symbolSize = (v: number | null | undefined) => {
    if (!sizeRange || v == null || v <= 0) return 11;
    const [lo, hi] = sizeRange;
    return hi === lo ? 16 : 9 + ((Math.sqrt(v) - lo) / (hi - lo)) * 27;
  };

  const build = (t: ChartTheme) => {
    // Cohorts are both production canon: one hue, told apart by marker shape. Clusters use the cluster palette.
    const colorFor = (slot: number) => (run ? (slot < 3 ? t.clusters[slot] : t.fold) : t.series[0]);
    const ax = axisStyle(t);
    return {
      grid: { left: 64, right: 28, top: 24, bottom: 56, containLabel: true },
      tooltip: {
        ...tooltipStyle(t), trigger: 'item',
        formatter: (p: { data: { name: string; value: [number, number]; size: number | null; group: string } }) =>
          `<strong>${esc(p.data.name)}</strong><br/>${esc(xm.label)}: <strong>${esc(formatValue(p.data.value[0], xm.format))}</strong><br/>${esc(ym.label)}: <strong>${esc(formatValue(p.data.value[1], ym.format))}</strong>` +
          (sm ? `<br/>${esc(sm.label)}: ${esc(formatValue(p.data.size, sm.format))}` : '') + `<br/><span style="opacity:.75">${esc(p.data.group)} · production canon</span>`,
      },
      xAxis: { type: logX && canLogX ? 'log' : 'value', name: `${xm.label} (${xm.unit})`, nameLocation: 'middle', nameGap: 34, scale: true, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => tickValue(v, xm.format), hideOverlap: true } },
      yAxis: { type: logY && canLogY ? 'log' : 'value', name: `${ym.label} (${ym.unit})`, nameLocation: 'middle', nameGap: 52, scale: true, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => tickValue(v, ym.format) } },
      legend: { top: 0, right: 0, textStyle: { color: t.ink2 }, itemWidth: 12, itemHeight: 12, show: groups.length > 1 },
      series: groups.map((g) => ({
        id: g.id, name: g.name, type: 'scatter', symbol: g.slot < SYMBOLS.length ? SYMBOLS[g.slot] : 'circle',
        itemStyle: !run && g.slot === 1 ? { color: t.surface, borderColor: t.series[0], borderWidth: 2 } : { color: colorFor(g.slot), borderColor: t.surface, borderWidth: 2 },
        emphasis: { focus: 'self', itemStyle: { borderColor: t.ink, borderWidth: 2 } },
        label: { show: true, position: 'right', distance: 6, color: t.ink2, fontSize: 11, formatter: (p: { data: { name: string } }) => p.data.name },
        labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
        data: g.rows.map((r) => ({ name: r.name, value: [r.values[x], r.values[y]], size: sm ? r.values[sm.id] : null, group: g.name, symbolSize: symbolSize(sm ? r.values[sm.id] : null) })),
      })),
    };
  };

  const select = (label: string, value: string, set: (v: string) => void, allowNone = false) => (
    <label className="min-w-0">
      <span className="rs-label">{label}</span>
      <select className="rs-select w-full" value={value} onChange={(e) => set(e.target.value)}>
        {allowNone && <option value="">None</option>}
        {indicators.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
      </select>
    </label>
  );

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))]">
        {select('X axis', x, (v) => { setX(v); setLogX(!!byId.get(v)?.log_scale); })}
        {select('Y axis', y, (v) => { setY(v); setLogY(!!byId.get(v)?.log_scale); })}
        {select('Bubble size', size, setSize, true)}
        <label>
          <span className="rs-label">Nations</span>
          <select className="rs-select w-full" value={cohort} onChange={(e) => setCohort(e.target.value as 'ALL' | 'PROFILED_14')}>
            <option value="ALL">All 19 modeled nations</option>
            <option value="PROFILED_14">Profiled 14 only</option>
          </select>
        </label>
        <label>
          <span className="rs-label">Color by</span>
          <select className="rs-select w-full" value={color} onChange={(e) => setColor(e.target.value as ColorMode)}>
            <option value="cohort">Cohort</option>
            {clusterRuns.map((c) => <option key={c.k} value={`k${c.k}`}>K-Means k={c.k}{c.k === recommendedK ? ' (highest silhouette)' : ''}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink-2">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={logX && canLogX} disabled={!canLogX} onChange={(e) => setLogX(e.target.checked)} /> Log X</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={logY && canLogY} disabled={!canLogY} onChange={(e) => setLogY(e.target.checked)} /> Log Y</label>
        <span className="text-ink-3">{plotted.length} plotted · the 18-state residual is one aggregate and is never plotted as a nation</span>
      </div>
      <div className="rs-card mt-4 p-3 sm:p-4">
        <EChart build={build} height={460} merge label={`Scatter plot of ${ym.label} against ${xm.label} for ${plotted.length} nations`} deps={[x, y, size, cohort, color, logX, logY]} />
      </div>
      {missing.length > 0 && (
        <p className="mt-3 text-sm text-ink-3">
          Not plotted (value not assigned in production): {missing.map((r) => `${r.name} (${r.values[x] == null ? xm.short : ym.short})`).join(', ')}.
        </p>
      )}
      {run && <p className="mt-2 text-sm text-ink-3">Clusters are a MODEL_ESTIMATE from standardized profiled-nation features; development nations lack several features and are not clustered.</p>}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink-2">Table view of plotted values</summary>
        <div className="rs-table-wrap mt-3" tabIndex={0}>
          <table className="rs-table">
            <thead><tr><th>Nation</th><th>Cohort</th><th className="num">{xm.short}</th><th className="num">{ym.short}</th>{sm && <th className="num">{sm.short}</th>}</tr></thead>
            <tbody>
              {plotted.map((r) => (
                <tr key={r.id}><td>{r.name}</td><td>{COHORT_LABEL[r.cohort]}</td><td className="num">{formatValue(r.values[x], xm.format)}</td><td className="num">{formatValue(r.values[y], ym.format)}</td>{sm && <td className="num">{formatValue(r.values[sm.id], sm.format)}</td>}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
