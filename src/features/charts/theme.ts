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

export type RgbTuple = readonly [number, number, number];

/** Parses #rgb, #rrggbb, or rgb()/rgba() strings into 0–255 sRGB channels. */
export function parseCssRgb(color: string): RgbTuple {
  const s = color.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
    if (full.length === 6) {
      return [
        parseInt(full.slice(0, 2), 16),
        parseInt(full.slice(2, 4), 16),
        parseInt(full.slice(4, 6), 16),
      ];
    }
  }
  const m = s.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)/i);
  if (m) return [Math.round(Number(m[1])), Math.round(Number(m[2])), Math.round(Number(m[3]))];
  throw new Error(`Unsupported CSS color for luminance calculation: ${color}`);
}

export function rgbToHex([r, g, b]: RgbTuple): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

export function mixHex(a: string, b: string, weightA: number): string {
  const ca = parseCssRgb(a);
  const cb = parseCssRgb(b);
  const t = Math.max(0, Math.min(1, weightA));
  return rgbToHex([
    ca[0] * t + cb[0] * (1 - t),
    ca[1] * t + cb[1] * (1 - t),
    ca[2] * t + cb[2] * (1 - t),
  ]);
}

/** WCAG 2.1 relative luminance in [0, 1]. */
export function relativeLuminance(color: string): number {
  const [r, g, b] = parseCssRgb(color).map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2.1 contrast ratio between two opaque colors in [1, 21]. */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Deterministic highest-contrast ink (#000000 or #ffffff) against any opaque sRGB fill.
 * Because CR(#fff, bg) * CR(#000, bg) = 21, max(CR) >= sqrt(21) ≈ 4.58:1 for every sRGB color.
 */
export function pickTextColor(bg: string): '#000000' | '#ffffff' {
  const l = relativeLuminance(bg);
  const crWhite = 1.05 / (l + 0.05);
  const crBlack = (l + 0.05) / 0.05;
  return crWhite >= crBlack ? '#ffffff' : '#000000';
}

/** Piecewise-linear sRGB interpolation along evenly spaced color stops for value in [min, max]. */
export function interpolateRampHex(stops: readonly string[], value: number, min = -1, max = 1): string {
  if (stops.length === 0) return '#888888';
  if (stops.length === 1 || max === min) return rgbToHex(parseCssRgb(stops[0]!));
  const clamped = Math.max(min, Math.min(max, value));
  const scaled = ((clamped - min) / (max - min)) * (stops.length - 1);
  const lo = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const frac = scaled - lo;
  return mixHex(stops[lo + 1]!, stops[lo]!, frac);
}

/** Formats a correlation coefficient to two decimals, preserving minus signs and avoiding "-0.00". */
export function formatCorrelationCell(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const fixed = v.toFixed(2);
  return fixed === '-0.00' ? '0.00' : fixed;
}
