/** Reads the validated chart tokens from CSS so every chart follows the active theme. */
export interface ChartTheme {
  mode: 'dark' | 'light';
  surface: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  series: [string, string, string];
  fold: string;
  /** Model clusters (validated all-pairs): never the remodeling orange or scenario aqua. */
  clusters: [string, string, string];
  diverging: string[];
  font: string;
  mono: string;
  reduced: boolean;
}

const v = (s: CSSStyleDeclaration, name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;

export function readTheme(): ChartTheme {
  const s = getComputedStyle(document.documentElement);
  return {
    mode: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
    surface: v(s, '--chart-surface', '#0b1a33'),
    ink: v(s, '--chart-ink', '#eef5ff'),
    ink2: v(s, '--chart-ink-2', '#c2d2ea'),
    muted: v(s, '--chart-muted', '#93a9c9'),
    grid: v(s, '--chart-grid', '#1b2d4d'),
    axis: v(s, '--chart-axis', '#34496c'),
    series: [v(s, '--series-1', '#3987e5'), v(s, '--series-2', '#d95926'), v(s, '--series-3', '#199e70')],
    fold: v(s, '--series-fold', '#898781'),
    clusters: [v(s, '--cluster-1', '#3987e5'), v(s, '--cluster-2', '#c98500'), v(s, '--cluster-3', '#d55181')],
    diverging: ['--div-neg-3', '--div-neg-2', '--div-neg-1', '--div-mid', '--div-pos-1', '--div-pos-2', '--div-pos-3'].map((n) => v(s, n, '#888888')),
    font: v(s, '--font-sans', 'system-ui, sans-serif'),
    mono: v(s, '--font-mono', 'monospace'),
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

/** Shared axis styling: hairline solid grid, recessive axes, text in ink tokens (never series colors). */
export function axisStyle(t: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: t.axis, width: 1 } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontFamily: t.font, fontSize: 11 },
    splitLine: { lineStyle: { color: t.grid, width: 1, type: 'solid' as const } },
    nameTextStyle: { color: t.ink2, fontFamily: t.font, fontSize: 12 },
  };
}

export function tooltipStyle(t: ChartTheme) {
  return {
    backgroundColor: t.surface,
    borderColor: t.axis,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: t.ink, fontFamily: t.font, fontSize: 12 },
    extraCssText: 'box-shadow: 0 12px 32px -18px rgba(0,0,0,.6); border-radius: 10px;',
  };
}

export function esc(text: unknown): string {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Marker shapes give a secondary channel beyond hue (CVD, print). */
export const SYMBOLS = ['circle', 'rect', 'triangle', 'diamond'] as const;
