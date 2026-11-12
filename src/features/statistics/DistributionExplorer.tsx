import { useState } from 'react';
import EChart from '../charts/EChart.tsx';
import { axisStyle, esc, tooltipStyle, type ChartTheme } from '../charts/theme.ts';
import { formatValue, tickValue } from '../../lib/format.ts';
import type { CountryRow, IndicatorMeta } from '../../lib/views.ts';

interface Desc {
  status: string; n: number; n_missing: number; mean: number | null; median: number | null; std: number | null; min: number | null; max: number | null;
  q1: number | null; q3: number | null; iqr: number | null; mad: number | null; whisker_low: number | null; whisker_high: number | null;
  outliers: Array<{ entity_id: string; value: number }>; reason: string | null;
}
interface Props {
  rows: CountryRow[];
  indicators: IndicatorMeta[];
  descriptive: Record<string, { PROFILED_14?: Desc; ALL_19?: Desc }>;
  initial?: string;
}

/** Box plot of the computed five-number summary with every nation drawn as a point (deterministic jitter). */
export default function DistributionExplorer({ rows, indicators, descriptive, initial }: Props) {
  const [id, setId] = useState(initial ?? 'sdi');
  const [cohort, setCohort] = useState<'PROFILED_14' | 'ALL_19'>('ALL_19');
  const meta = indicators.find((i) => i.id === id)!;
  const d = descriptive[id]?.[cohort];
  const pool = rows.filter((r) => cohort === 'ALL_19' || r.cohort === 'PROFILED_14');
  const pts = pool.filter((r) => r.values[id] != null);
  const outlierIds = new Set(d?.outliers.map((o) => o.entity_id) ?? []);

  const build = (t: ChartTheme) => {
    const ax = axisStyle(t);
    const ready = d && d.status === 'COMPUTED';
    return {
      grid: { left: 24, right: 24, top: 18, bottom: 48, containLabel: true },
      tooltip: { ...tooltipStyle(t), trigger: 'item' },
      xAxis: { type: 'value', scale: true, name: `${meta.label} (${meta.unit})`, nameLocation: 'middle', nameGap: 32, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => tickValue(v, meta.format), hideOverlap: true } },
      yAxis: { type: 'category', data: [''], axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      series: [
        ...(ready ? [{
          id: 'box', type: 'boxplot', name: 'Five-number summary', boxWidth: [22, 22],
          itemStyle: { color: 'transparent', borderColor: t.series[0], borderWidth: 2 },
          data: [[d!.whisker_low, d!.q1, d!.median, d!.q3, d!.whisker_high]],
          tooltip: { formatter: () => `Median <strong>${esc(formatValue(d!.median, meta.format))}</strong><br/>IQR ${esc(formatValue(d!.q1, meta.format))} – ${esc(formatValue(d!.q3, meta.format))}<br/>Whiskers (1.5 × IQR) ${esc(formatValue(d!.whisker_low, meta.format))} – ${esc(formatValue(d!.whisker_high, meta.format))}` },
        }] : []),
        {
          id: 'points', type: 'scatter', name: 'Nations', symbolSize: 10,
          itemStyle: { color: t.series[0], borderColor: t.surface, borderWidth: 2, opacity: 0.9 },
          data: pts.map((r, i) => ({
            name: r.name, value: [r.values[id], 0],
            symbolOffset: [0, ((i * 37) % 17) - 8],
            symbolSize: outlierIds.has(r.id) ? 14 : 10,
            label: outlierIds.has(r.id) || r.values[id] === d?.max || r.values[id] === d?.min ? { show: true, formatter: r.name, position: 'top', color: t.ink2, fontSize: 11 } : undefined,
          })),
          labelLayout: { hideOverlap: true },
          tooltip: { formatter: (p: { name: string; value: [number] }) => `<strong>${esc(p.name)}</strong><br/>${esc(formatValue(p.value[0], meta.format))}${outlierIds.has(pts.find((r) => r.name === p.name)?.id ?? '') ? '<br/>Beyond 1.5 × IQR (statistical outlier, not a canon error)' : ''}` },
        },
      ],
    };
  };

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label>
          <span className="rs-label">Indicator</span>
          <select className="rs-select w-full" value={id} onChange={(e) => setId(e.target.value)}>
            {indicators.map((i) => <option key={i.id} value={i.id}>{i.group} · {i.label}</option>)}
          </select>
        </label>
        <label>
          <span className="rs-label">Cohort</span>
          <select className="rs-select w-full" value={cohort} onChange={(e) => setCohort(e.target.value as 'PROFILED_14' | 'ALL_19')}>
            <option value="ALL_19">All 19 modeled nations</option>
            <option value="PROFILED_14">Profiled 14</option>
          </select>
        </label>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="rs-card p-3 sm:p-4">
          <EChart build={build} height={250} merge label={`Distribution of ${meta.label} across ${pts.length} nations`} deps={[id, cohort]} />
          <p className="px-1 pt-1 text-xs text-ink-3">Box: quartiles and 1.5 × IQR whiskers. Points: each nation; larger labeled points lie beyond the whiskers (statistical outliers, not canon errors).</p>
        </div>
        <dl className="rs-card grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
          {d && d.status === 'COMPUTED' ? (
            [['Assigned', `${d.n} of ${d.n + d.n_missing}`], ['Median', formatValue(d.median, meta.format)], ['Mean', formatValue(d.mean, meta.format)], ['Std. dev.', formatValue(d.std, meta.format)],
              ['Q1', formatValue(d.q1, meta.format)], ['Q3', formatValue(d.q3, meta.format)], ['MAD', formatValue(d.mad, meta.format)], ['Range', `${formatValue(d.min, meta.format)} – ${formatValue(d.max, meta.format)}`]]
              .map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-ink-3">{k}</dt><dd className="m-0 font-semibold text-ink [overflow-wrap:anywhere]">{v}</dd></div>)
          ) : (
            <div className="col-span-2 text-ink-2"><span className="rs-badge" data-tone="unknown">INSUFFICIENT_DATA</span><p className="mt-2">{d?.reason ?? 'No descriptive statistics for this cohort.'}</p></div>
          )}
        </dl>
      </div>
    </div>
  );
}
