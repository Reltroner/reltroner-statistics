import { useMemo, useState } from 'react';
import EChart from '../charts/EChart.tsx';
import { axisStyle, esc, tooltipStyle, type ChartTheme } from '../charts/theme.ts';
import { formatValue, tickValue } from '../../lib/format.ts';

interface Point {
  id: string; entity: string; entity_id: string; indicator: string; label: string; unit: string; format: string; value: number; year: number;
  interval: { start_bac: number; end_bac: number } | null; status: string; quote: string | null; note: string | null; path: string; line: number | null;
  pointer: string | null; commit: string;
}
interface TimelineItem { id: string; label: string; start: number; end: number; kind: 'FOUNDATION' | 'EVENT'; note: string | null }
interface Coverage { entity_id: string; indicator_id: string; n: number; years_bac: number[]; max_consecutive_annual: number; volatility: { status: string; reason: string }; change_point: { status: string; reason: string } }
interface Props { points: Point[]; timeline: TimelineItem[]; coverage: Coverage[]; repoUrl: string }

const yearLabel = (bac: number) => (bac === 0 ? 'Year 0' : `${bac} BAC`);
const axisLabel = (v: number) => (v === 0 ? 'Year 0' : v < 0 ? `${-v}` : '');

export default function HistoryExplorer({ points, timeline, coverage, repoUrl }: Props) {
  const series = useMemo(() => {
    const m = new Map<string, Point[]>();
    for (const p of points) {
      const k = `${p.entity_id}|${p.indicator}`;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].map(([key, pts]) => ({ key, entity: pts[0]!.entity, label: pts[0]!.label, unit: pts[0]!.unit, format: pts[0]!.format, pts }))
      .sort((a, b) => (a.entity === b.entity ? a.label.localeCompare(b.label, 'en') : a.entity === 'Asthortera' ? -1 : 1));
  }, [points]);
  const [key, setKey] = useState(series.find((s) => s.key === 'planet:asthortera|real_gdp_growth')?.key ?? series[0]?.key ?? '');
  const s = series.find((x) => x.key === key)!;
  const canon = s.pts.filter((p) => !p.interval && p.status.startsWith('CANON'));
  const scenarioPts = s.pts.filter((p) => !p.interval && p.status === 'SCENARIO');
  const intervals = s.pts.filter((p) => p.interval);
  const oldest = Math.max(...s.pts.map((p) => p.interval?.start_bac ?? p.year));

  const build = (t: ChartTheme) => {
    const ax = axisStyle(t);
    return {
      grid: { left: 16, right: 28, top: 30, bottom: 48, containLabel: true },
      tooltip: {
        ...tooltipStyle(t), trigger: 'item',
        formatter: (p: { data: { p: Point } }) => {
          const x = p.data.p;
          return `<strong>${esc(formatValue(x.value, x.format))}</strong> · ${esc(x.interval ? `${yearLabel(x.interval.start_bac)} – ${yearLabel(x.interval.end_bac)}` : yearLabel(x.year))}<br/>${esc(x.status)}${x.note ? `<br/><span style="opacity:.8">${esc(x.note)}</span>` : ''}`;
        },
      },
      legend: { top: 0, right: 0, textStyle: { color: t.ink2 }, show: (canon.length ? 1 : 0) + (scenarioPts.length || intervals.length ? 1 : 0) > 1 },
      xAxis: { type: 'value', min: -Math.ceil((oldest + 40) / 50) * 50, max: 30, name: 'Years before Year 0 (BAC)', nameLocation: 'middle', nameGap: 32, ...ax, axisLabel: { ...ax.axisLabel, formatter: axisLabel, hideOverlap: true } },
      yAxis: { type: 'value', scale: true, name: s.unit, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => tickValue(v, s.format) } },
      series: [
        {
          id: 'canon', name: 'Canon observation', type: 'scatter', symbol: 'circle', symbolSize: 12,
          itemStyle: { color: t.series[0], borderColor: t.surface, borderWidth: 2 },
          label: { show: true, position: 'top', color: t.ink, fontSize: 11, formatter: (p: { data: { p: Point } }) => `${formatValue(p.data.p.value, p.data.p.format)} · ${yearLabel(p.data.p.year)}` },
          labelLayout: { hideOverlap: true },
          data: canon.map((p) => ({ value: [p.year === 0 ? 0 : -p.year, p.value], p })),
        },
        {
          id: 'scenario', name: 'Scenario (not observed)', type: 'scatter', symbol: 'triangle', symbolSize: 12,
          itemStyle: { color: t.series[2], borderColor: t.surface, borderWidth: 2 },
          label: { show: true, position: 'bottom', color: t.ink2, fontSize: 11, formatter: (p: { data: { p: Point } }) => `${formatValue(p.data.p.value, p.data.p.format)} scenario` },
          data: scenarioPts.map((p) => ({ value: [-p.year, p.value], p })),
        },
        {
          id: 'intervals', name: intervals.length ? 'Scenario interval average' : 'Scenario (not observed)', type: 'custom',
          renderItem: (_params: unknown, api: { value: (i: number) => number; coord: (v: [number, number]) => [number, number] }) => {
            const a = api.coord([api.value(0), api.value(2)]), b = api.coord([api.value(1), api.value(2)]);
            return { type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: t.series[2], lineWidth: 3, lineCap: 'round' } };
          },
          label: { show: true, position: 'top', color: t.ink2, fontSize: 10, formatter: (p: { data: { p: Point } }) => formatValue(p.data.p.value, p.data.p.format) },
          encode: { x: [0, 1], y: 2 },
          data: intervals.map((p) => ({ value: [-p.interval!.start_bac, p.interval!.end_bac === 0 ? 0 : -p.interval!.end_bac, p.value], p })),
        },
      ],
    };
  };

  const cov = coverage.find((c) => `${c.entity_id}|${c.indicator_id}` === key);
  const events = [...timeline].sort((a, b) => b.start - a.start);
  const buildTimeline = (t: ChartTheme) => {
    const ax = axisStyle(t);
    const cats = events.map((e) => e.label);
    const min = -Math.ceil((Math.max(...events.map((e) => e.start)) + 60) / 250) * 250;
    return {
      grid: { left: 8, right: 24, top: 8, bottom: 40, containLabel: true },
      tooltip: { ...tooltipStyle(t), trigger: 'item', formatter: (p: { data: { e: TimelineItem } }) => `<strong>${esc(p.data.e.label)}</strong><br/>${p.data.e.start === p.data.e.end ? esc(yearLabel(p.data.e.start)) : `${esc(yearLabel(p.data.e.start))} – ${esc(yearLabel(p.data.e.end))}`}${p.data.e.note ? `<br/><span style="opacity:.8">${esc(p.data.e.note)}</span>` : ''}` },
      xAxis: { type: 'value', min, max: 0, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => (v === 0 ? 'Year 0' : `${-v} BAC`), hideOverlap: true } },
      yAxis: { type: 'category', data: cats, inverse: true, axisLabel: { color: t.ink2, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
      series: [
        { id: 'found', name: 'Sovereign foundation', type: 'scatter', symbol: 'circle', symbolSize: 11, itemStyle: { color: t.series[0], borderColor: t.surface, borderWidth: 2 },
          data: events.filter((e) => e.kind === 'FOUNDATION').map((e) => ({ value: [-e.start, e.label], e })) },
        { id: 'event', name: 'Recorded event', type: 'scatter', symbol: 'diamond', symbolSize: 12, itemStyle: { color: t.series[0], borderColor: t.surface, borderWidth: 2 },
          data: events.filter((e) => e.kind === 'EVENT').map((e) => ({ value: [-(e.start + e.end) / 2, e.label], e })) },
      ],
    };
  };

  return (
    <div className="grid gap-10">
      <section aria-labelledby="anchors-h">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="anchors-h" className="rs-h2">Anchors on the BAC axis</h2>
          <label className="w-full min-w-0 sm:w-auto sm:min-w-[16rem]">
            <span className="rs-label">Series</span>
            <select className="rs-select w-full" value={key} onChange={(e) => setKey(e.target.value)}>
              {series.map((x) => <option key={x.key} value={x.key}>{x.entity} · {x.label} ({x.pts.length})</option>)}
            </select>
          </label>
        </div>
        <div className="rs-card mt-4 p-3 sm:p-4">
          <EChart build={build} height={360} merge deps={[key]} label={`${s.label} for ${s.entity}: ${s.pts.length} discrete observations between ${yearLabel(oldest)} and Year 0, not interpolated`} />
          <p className="px-1 pt-1 text-xs text-ink-3">Each mark is a separate source statement. Nothing connects them: the years between anchors have no observations, and no curve is fitted.</p>
        </div>
        {cov && (
          <p className="rs-notice mt-3" data-tone="unavailable">
            <span><strong>Volatility: {cov.volatility.status}.</strong> {cov.volatility.reason} <strong>Change points: {cov.change_point.status}.</strong></span>
          </p>
        )}
        <div className="rs-table-wrap mt-4" tabIndex={0}>
          <table className="rs-table">
            <thead><tr><th>Period</th><th className="num">Value</th><th>Status</th><th>Evidence</th></tr></thead>
            <tbody>
              {[...s.pts].sort((a, b) => (b.interval?.start_bac ?? b.year) - (a.interval?.start_bac ?? a.year)).map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{p.interval ? `${yearLabel(p.interval.start_bac)} – ${yearLabel(p.interval.end_bac)}` : yearLabel(p.year)}</td>
                  <td className="num">{formatValue(p.value, p.format)}</td>
                  <td><span className="rs-badge" data-tone={p.status.startsWith('CANON') ? 'canon' : p.status === 'SCENARIO' ? 'scenario' : 'unknown'}>{p.status}</span></td>
                  <td className="text-xs">
                    {p.quote ? <q className="text-ink-2">{p.quote.length > 220 ? `${p.quote.slice(0, 219)}…` : p.quote}</q> : <code>{p.pointer}</code>}
                    <a className="ml-2 whitespace-nowrap" href={`${repoUrl}/blob/${p.commit}/${p.path}${p.line ? `#L${p.line}` : ''}`}>{p.path.split('/').pop()}{p.line ? `:${p.line}` : ''}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="timeline-h">
        <h2 id="timeline-h" className="rs-h2">Foundations and recorded events</h2>
        <p className="rs-soft mt-2 max-w-3xl text-sm">Sovereign foundation dates from the production dataset (institutional beginnings, not first settlement). Ranged events are placed at their midpoint; the tooltip and table give the full span.</p>
        <div className="rs-card mt-4 p-3 sm:p-4">
          <EChart build={buildTimeline} height={Math.max(320, events.length * 26 + 60)} label={`Timeline of ${events.length} foundations and events from ${yearLabel(Math.max(...events.map((e) => e.start)))} to Year 0`} />
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink-2">Table view of the timeline</summary>
          <div className="rs-table-wrap mt-3" tabIndex={0}>
            <table className="rs-table">
              <thead><tr><th>Event</th><th>Kind</th><th>When</th><th>Note</th></tr></thead>
              <tbody>{events.map((e) => <tr key={e.id}><td>{e.label}</td><td>{e.kind === 'FOUNDATION' ? 'Foundation' : 'Event'}</td><td className="whitespace-nowrap">{e.start === e.end ? yearLabel(e.start) : `${yearLabel(e.start)} – ${yearLabel(e.end)}`}</td><td className="text-xs">{e.note ?? '—'}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}
