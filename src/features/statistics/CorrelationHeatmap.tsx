import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { formatCorrelationCell, interpolateRampHex, pickTextColor, readTheme, type ChartTheme } from '../charts/theme.ts';

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

const DEFAULT_DARK_DIVERGING = ['#184f95', '#3987e5', '#6da7ec', '#383835', '#e88a89', '#e66767', '#a8302f'] as const;

/**
 * Diverging blue–gray–red correlation heatmap rendering every cell (all k × k entries, including
 * the 1.00 diagonal) with deterministic WCAG relative-luminance text contrast in dark and light
 * modes and a horizontally scrollable container with sticky row labels on narrow viewports.
 */
export default function CorrelationHeatmap(props: Props) {
  const [method, setMethod] = useState<'spearman' | 'pearson'>('spearman');
  const [theme, setTheme] = useState<ChartTheme | null>(null);
  const [active, setActive] = useState<{ i: number; j: number } | null>(null);

  useLayoutEffect(() => {
    setTheme(readTheme());
  }, []);

  useEffect(() => {
    const onTheme = () => setTheme(readTheme());
    window.addEventListener('rs:themechange', onTheme);
    return () => window.removeEventListener('rs:themechange', onTheme);
  }, []);

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
  const ramp = theme?.diverging ?? DEFAULT_DARK_DIVERGING;
  const surfaceBg = theme?.surface ?? '#0b1a33';
  const symbol = method === 'spearman' ? 'Spearman ρ' : 'Pearson r';
  const activeVal = active ? m[active.i]?.[active.j] ?? null : null;
  const activeN = active ? props.pairwise_n[active.i]?.[active.j] ?? props.n : null;

  return (
    <div data-correlation-heatmap={method}>
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
        <div
          className="overflow-x-auto"
          data-correlation-scroll
          tabIndex={0}
          role="region"
          aria-label={`${method} correlation matrix of ${k} indicators across ${props.n} profiled nations`}
        >
          <table className="w-full border-separate border-spacing-[2px] text-[11px] leading-tight">
            <caption className="rs-sr">
              {symbol} correlation matrix of {k} indicators across {props.n} profiled nations
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-20 min-w-[8.5rem] max-w-[8.5rem] border-b border-r border-line px-2 py-2 text-left align-bottom text-[10px] font-semibold uppercase tracking-wider text-ink-3 sm:min-w-[11rem] sm:max-w-[12.5rem]"
                  style={{ backgroundColor: 'var(--chart-surface)' }}
                >
                  Indicator
                </th>
                {props.labels.map((label, j) => (
                  <th
                    key={props.features[j]}
                    scope="col"
                    className="min-w-[3.1rem] border-b border-line px-1 py-2 text-center align-bottom font-medium text-ink-2"
                    title={label}
                  >
                    <span
                      className="mx-auto inline-block max-h-[8.5rem] whitespace-nowrap text-[10px] leading-tight"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    >
                      {label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.labels.map((rowLabel, i) => (
                <tr key={props.features[i]}>
                  <th
                    scope="row"
                    data-corr-row-label={props.features[i]}
                    className="sticky left-0 z-10 min-w-[8.5rem] max-w-[8.5rem] border-r border-line px-2 py-1.5 text-left text-[11px] font-medium text-ink-2 sm:min-w-[11rem] sm:max-w-[12.5rem]"
                    style={{ backgroundColor: 'var(--chart-surface)' }}
                  >
                    <span className="block truncate" title={rowLabel}>{rowLabel}</span>
                  </th>
                  {props.labels.map((colLabel, j) => {
                    const v = m[i]?.[j] ?? null;
                    const bg = v == null ? surfaceBg : interpolateRampHex(ramp, v, -1, 1);
                    const fg = pickTextColor(bg);
                    const text = formatCorrelationCell(v);
                    const isFocused = active?.i === i && active?.j === j;
                    const pairN = props.pairwise_n[i]?.[j] ?? props.n;
                    return (
                      <td
                        key={`${props.features[i]}-${props.features[j]}`}
                        data-corr-cell={`${i}-${j}`}
                        data-corr-value={v == null ? '' : String(v)}
                        tabIndex={0}
                        onPointerEnter={() => setActive({ i, j })}
                        onFocus={() => setActive({ i, j })}
                        onClick={() => setActive({ i, j })}
                        title={`${rowLabel} × ${colLabel}: ${v == null ? 'not computed' : v.toFixed(3)} (${symbol}, n = ${pairN})`}
                        className="h-8 min-w-[3.1rem] whitespace-nowrap rounded-[3px] px-1 text-center font-mono text-[11px] font-semibold tabular-nums transition-shadow"
                        style={{
                          backgroundColor: bg,
                          color: fg,
                          boxShadow: isFocused ? 'inset 0 0 0 2px var(--focus)' : undefined,
                        }}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 px-1 text-xs text-ink-2" aria-live="polite" data-corr-readout>
          {active ? (
            <>
              <strong className="text-ink">{props.labels[active.i]}</strong> ×{' '}
              <strong className="text-ink">{props.labels[active.j]}</strong>:{' '}
              <span className="font-mono font-semibold text-ink">{activeVal == null ? 'not computed' : activeVal.toFixed(3)}</span>{' '}
              ({symbol}, n = {activeN})
            </>
          ) : (
            <>All {k * k} cells shown ({k} × {k}, including 1.00 diagonal). Hover or focus any cell for 3-decimal precision and pairwise n.</>
          )}
        </p>
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
