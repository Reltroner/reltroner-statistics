import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { readTheme, type ChartTheme } from '../charts/theme.ts';
import { formatValue } from '../../lib/format.ts';

interface Item { id: string; name: string; share: number; cohort: 'PROFILED_14' | 'DEVELOPMENT_5' | 'RESIDUAL' }
interface Props { items: Item[] }
interface Box { x: number; y: number; w: number; h: number }
type Mode = 'inside-two' | 'inside-one' | 'rail';
interface Tile extends Item { box: Box; fill: string; ink: string; mode: Mode; marker: number | null; label: string }

const KIND = { PROFILED_14: 'Profiled nation', DEVELOPMENT_5: 'Development nation', RESIDUAL: 'Combined residual of the deferred states' } as const;
const PAD = 6;
const NAME_PX = 12;
const SHARE_PX = 11;
const MARKER_PX = 10;

/** Squarified treemap (Bruls, Huizing & van Wijk): exact areas, rows laid along the shorter side. */
export function squarify(values: number[], box: Box): Box[] {
  const total = values.reduce((a, b) => a + b, 0);
  const areas = values.map((v) => (v / total) * box.w * box.h);
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    return Math.max((side * side * Math.max(...row)) / (s * s), (s * s) / (side * side * Math.min(...row)));
  };
  const out: Box[] = [];
  let rest = { ...box };
  for (let i = 0; i < areas.length;) {
    const side = Math.min(rest.w, rest.h);
    const row = [areas[i]!];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]!], side) <= worst(row, side)) row.push(areas[j++]!);
    const sum = row.reduce((a, b) => a + b, 0);
    if (rest.w >= rest.h) {
      const w = sum / rest.h;
      let y = rest.y;
      for (const a of row) { out.push({ x: rest.x, y, w, h: a / w }); y += a / w; }
      rest = { x: rest.x + w, y: rest.y, w: rest.w - w, h: rest.h };
    } else {
      const h = sum / rest.w;
      let x = rest.x;
      for (const a of row) { out.push({ x, y: rest.y, w: a / h, h }); x += a / h; }
      rest = { x: rest.x, y: rest.y + h, w: rest.w, h: rest.h - h };
    }
    i = j;
  }
  return out;
}

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
};
const hex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: string, b: string, t: number) => hex(rgb(a).map((v, i) => v * t + rgb(b)[i]! * (1 - t)));
const lum = (c: string) => {
  const [r, g, b] = rgb(c).map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
/** Black or white label, whichever contrasts more with the fill (WCAG relative luminance). */
const inkOn = (fill: string) => ((lum(fill) + 0.05) / 0.05 > 1.05 / (lum(fill) + 0.05) ? '#0b0b0b' : '#ffffff');

/**
 * Part-to-whole of planetary GDP. Tile area is exactly the source share. Every entry is named with
 * its share: inside its tile when the text fits, otherwise in the label rail below the chart, which
 * is always visible and points to a numbered marker in the tile when the tile can hold one. The
 * residual of the deferred states stays one gray tile.
 */
export default function GdpTreemap({ items }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [theme, setTheme] = useState<ChartTheme | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const total = items.reduce((a, b) => a + b.share, 0);
  const sorted = useMemo(() => [...items].sort((a, b) => b.share - a.share || (a.id < b.id ? -1 : 1)), [items]);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    setWidth(el.clientWidth);
    setTheme(readTheme());
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const onTheme = () => setTheme(readTheme());
    window.addEventListener('rs:themechange', onTheme);
    return () => window.removeEventListener('rs:themechange', onTheme);
  }, []);

  const height = width && width < 640 ? 420 : 380;
  const tiles: Tile[] = useMemo(() => {
    if (!width || !theme) return [];
    const ctx = document.createElement('canvas').getContext('2d');
    const measure = (text: string, px: number, weight: number) => {
      if (!ctx) return text.length * px * 0.62;
      ctx.font = `${weight} ${px}px ${theme.font}`;
      return ctx.measureText(text).width;
    };
    const boxes = squarify(sorted.map((i) => i.share), { x: 0, y: 0, w: width, h: height });
    let marker = 0;
    return sorted.map((item, i) => {
      const box = boxes[i]!;
      const fill = item.cohort === 'RESIDUAL' ? theme.fold : item.cohort === 'DEVELOPMENT_5' ? mix(theme.series[0], theme.surface, 0.68) : theme.series[0];
      const label = formatValue(item.share, 'ratio_pct');
      const nameW = measure(item.name, NAME_PX, 600);
      const shareW = measure(label, SHARE_PX, 500);
      const room = { w: box.w - 2 * PAD, h: box.h - 2 * PAD };
      let mode: Mode = 'rail';
      if (room.w >= Math.max(nameW, shareW) && room.h >= NAME_PX + SHARE_PX + 8) mode = 'inside-two';
      else if (room.w >= nameW + shareW + 8 && room.h >= NAME_PX + 4) mode = 'inside-one';
      const holdsMarker = mode === 'rail' && box.w >= measure(String(marker + 1), MARKER_PX, 700) + 6 && box.h >= MARKER_PX + 6;
      return { ...item, box, fill, ink: inkOn(fill), mode, marker: mode === 'rail' && holdsMarker ? ++marker : null, label };
    });
  }, [sorted, width, height, theme]);
  const rail = tiles.filter((t) => t.mode === 'rail');

  return (
    <div data-gdp-treemap>
      <ul className="mb-3 flex flex-wrap gap-4 text-xs text-ink-2" aria-label="Legend">
        <li className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: 'var(--series-1)' }} aria-hidden="true" />Profiled nations</li>
        <li className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: 'color-mix(in srgb, var(--series-1) 68%, var(--chart-surface))' }} aria-hidden="true" />Development nations (lighter)</li>
        <li className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: 'var(--series-fold)' }} aria-hidden="true" />Deferred states (one combined residual)</li>
      </ul>
      <div className="rs-card p-2">
        <div ref={host} className="w-full" style={{ height }}>
          {tiles.length > 0 && (
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" className="block"
              aria-label={`Treemap of planetary GDP shares for ${items.length} production entries summing to ${formatValue(total, 'ratio_pct')}. Every entry is also listed by name and share below.`}>
              {tiles.map((t) => {
                const cx = t.box.x + t.box.w / 2;
                const cy = t.box.y + t.box.h / 2;
                const active = focus === t.id;
                return (
                  <g key={t.id} data-tile={t.id} data-name={t.name} data-share={t.label} data-label-mode={t.mode === 'rail' ? 'rail' : 'inside'} data-marker={t.marker ?? undefined}
                    onPointerEnter={() => setFocus(t.id)} onPointerLeave={() => setFocus(null)}>
                    <title>{`${t.name}: ${t.label} of planetary GDP · ${KIND[t.cohort]}`}</title>
                    <rect x={t.box.x} y={t.box.y} width={Math.max(0, t.box.w)} height={Math.max(0, t.box.h)} rx={3} fill={t.fill}
                      stroke={active ? 'var(--text)' : 'var(--chart-surface)'} strokeWidth={active ? 3 : 2} />
                    {t.mode === 'inside-two' && (
                      <text x={t.box.x + PAD} y={t.box.y + PAD} fill={t.ink} dominantBaseline="hanging">
                        <tspan x={t.box.x + PAD} fontSize={NAME_PX} fontWeight={600}>{t.name}</tspan>
                        <tspan x={t.box.x + PAD} dy={NAME_PX + 3} fontSize={SHARE_PX} fontWeight={500}>{t.label}</tspan>
                      </text>
                    )}
                    {t.mode === 'inside-one' && (
                      <text x={t.box.x + PAD} y={t.box.y + PAD} fill={t.ink} dominantBaseline="hanging" fontSize={NAME_PX}>
                        <tspan fontWeight={600}>{t.name}</tspan><tspan dx={6} fontSize={SHARE_PX} fontWeight={500}>{t.label}</tspan>
                      </text>
                    )}
                    {t.marker !== null && (
                      <text x={cx} y={cy} fill={t.ink} fontSize={MARKER_PX} fontWeight={700} textAnchor="middle" dominantBaseline="central">{t.marker}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
      {rail.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-ink-2">Entries whose names do not fit inside their tiles (number = marker in the tile):</p>
          <ol className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Treemap entries labeled outside their tiles">
            {rail.map((t) => (
              <li key={t.id} data-rail-item={t.id} tabIndex={0} onFocus={() => setFocus(t.id)} onBlur={() => setFocus(null)} onPointerEnter={() => setFocus(t.id)} onPointerLeave={() => setFocus(null)}
                className={`flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 ${focus === t.id ? 'bg-accent-soft' : ''}`}>
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-line px-1 font-mono text-[0.7rem] text-ink-2" aria-hidden={t.marker === null}>{t.marker ?? '·'}</span>
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: t.fill }} aria-hidden="true" />
                <span className="min-w-0 break-words text-ink">{t.name}</span>
                <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-ink-2">{t.label}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink-2">Table view of GDP shares</summary>
        <div className="rs-table-wrap mt-3" tabIndex={0}>
          <table className="rs-table">
            <thead><tr><th>Entry</th><th>Kind</th><th className="num">Share of planetary GDP</th></tr></thead>
            <tbody>{sorted.map((i) => <tr key={i.id}><td>{i.name}</td><td>{KIND[i.cohort]}</td><td className="num">{formatValue(i.share, 'ratio_pct')}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
