import EChart from '../charts/EChart.tsx';
import { esc, tooltipStyle, type ChartTheme } from '../charts/theme.ts';
import { formatValue } from '../../lib/format.ts';

interface Item { id: string; name: string; share: number; cohort: 'PROFILED_14' | 'DEVELOPMENT_5' | 'RESIDUAL' }
interface Props { items: Item[] }

const LABEL = { PROFILED_14: 'Profiled nation', DEVELOPMENT_5: 'Development nation', RESIDUAL: 'Combined residual of 18 deferred states' } as const;

/**
 * Part-to-whole of planetary GDP. Area encodes share; production nations share one hue (cohort is
 * marked by tile weight), the residual is gray because it is one aggregate, not a nation.
 * Labels appear only on tiles large enough to hold them; every value is in the table view.
 */
export default function GdpTreemap({ items }: Props) {
  const total = items.reduce((a, b) => a + b.share, 0);
  const build = (t: ChartTheme) => ({
    tooltip: {
      ...tooltipStyle(t),
      formatter: (p: { data: Item & { value: number } }) =>
        `<strong>${esc(p.data.name)}</strong><br/>${esc(formatValue(p.data.share, 'ratio_pct'))} of planetary GDP<br/><span style="opacity:.75">${esc(LABEL[p.data.cohort])}</span>`,
    },
    series: [{
      id: 'gdp', type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false },
      left: 0, right: 0, top: 0, bottom: 0, squareRatio: 1.2,
      itemStyle: { borderColor: t.surface, borderWidth: 2, gapWidth: 2, borderRadius: 4 },
      label: {
        show: true, color: '#ffffff', fontSize: 12, fontWeight: 600, overflow: 'none',
        formatter: (p: { data: Item }) => (p.data.share >= 0.035 ? `${p.data.name}\n${formatValue(p.data.share, 'ratio_pct')}` : ''),
      },
      data: items.map((i) => ({
        ...i, value: i.share,
        itemStyle: { color: i.cohort === 'RESIDUAL' ? t.fold : t.series[0], opacity: i.cohort === 'DEVELOPMENT_5' ? 0.72 : 1 },
      })),
    }],
  });
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4 text-xs text-ink-2" aria-label="Legend">
        <li className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: 'var(--series-1)' }} aria-hidden="true" />Profiled nations</li>
        <li className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm opacity-70" style={{ background: 'var(--series-1)' }} aria-hidden="true" />Development nations (lighter)</li>
        <li className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: 'var(--series-fold)' }} aria-hidden="true" />18 deferred states (one combined residual)</li>
      </ul>
      <div className="rs-card overflow-hidden p-2">
        <EChart build={build} height={380} label={`Treemap of planetary GDP shares for ${items.length} production entries summing to ${formatValue(total, 'ratio_pct')}`} />
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink-2">Table view of GDP shares</summary>
        <div className="rs-table-wrap mt-3" tabIndex={0}>
          <table className="rs-table">
            <thead><tr><th>Entry</th><th>Kind</th><th className="num">Share of planetary GDP</th></tr></thead>
            <tbody>{[...items].sort((a, b) => b.share - a.share).map((i) => <tr key={i.id}><td>{i.name}</td><td>{LABEL[i.cohort]}</td><td className="num">{formatValue(i.share, 'ratio_pct')}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
